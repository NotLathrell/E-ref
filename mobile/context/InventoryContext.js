import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import {
  loadInventory,
  saveInventory,
  loadUser,
  saveUser,
  clearUser,
  loadAlertsRead,
  saveAlertsRead
} from '../services/storage';
import { enrichAll, enrichItem } from '../services/enrich';
import { prioritizeByGreedy, getSoonToSpoil } from '../services/prioritize';

const InventoryContext = createContext(null);

export function InventoryProvider({ children }) {
  const [rawItems, setRawItems] = useState([]);
  const [user, setUser] = useState(null);
  const [alertsRead, setAlertsRead] = useState({});
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let mounted = true;
    (async () => {
      const [inv, usr, readMap] = await Promise.all([loadInventory(), loadUser(), loadAlertsRead()]);
      if (!mounted) return;
      setRawItems(inv);
      setUser(usr);
      setAlertsRead(readMap);
      setLoading(false);
    })();
    return () => {
      mounted = false;
    };
  }, []);

  // Recompute TTI/risk periodically while app is open
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 60_000);
    return () => clearInterval(id);
  }, []);

  const items = useMemo(() => enrichAll(rawItems.filter((i) => !i.discarded)), [rawItems, tick]);

  const prioritized = useMemo(() => prioritizeByGreedy(items), [items]);
  const soonToSpoil = useMemo(() => getSoonToSpoil(items, 3), [items]);

  const alerts = useMemo(() => {
    return prioritizeByGreedy(items)
      .filter((item) => item.urgency === 'critical' || item.urgency === 'high' || item.estimatedDaysLeft <= 2)
      .map((item) => ({
        id: `alert-${item.id}`,
        itemId: item.id,
        title: item.title,
        message:
          item.estimatedDaysLeft < 0
            ? `${item.title} has expired. Inspect or discard.`
            : item.urgency === 'critical'
              ? `${item.title} is critical — ${item.daysLabel}. ${item.recommendations.primaryAction.label} recommended.`
              : `${item.title} is high risk — ${item.daysLabel}.`,
        urgency: item.urgency,
        riskScore: item.riskScore,
        read: Boolean(alertsRead[item.id]),
        createdAt: item.scannedAt || item.createdAt
      }));
  }, [items, alertsRead]);

  const persist = useCallback(async (next) => {
    setRawItems(next);
    await saveInventory(next);
  }, []);

  const addItem = useCallback(
    async (draft) => {
      const now = new Date().toISOString();
      const record = {
        ...draft,
        id: `item-${Date.now()}`,
        scannedAt: now,
        createdAt: now,
        history: [{ at: now, event: 'Scanned (Shelf)' }]
      };
      const next = [record, ...rawItems];
      await persist(next);
      return enrichItem(record);
    },
    [rawItems, persist]
  );

  const updateItem = useCallback(
    async (id, patch) => {
      const next = rawItems.map((item) => {
        if (item.id !== id) return item;
        const history = Array.isArray(item.history) ? [...item.history] : [];
        if (patch.frozen === true && !item.frozen) {
          history.push({ at: new Date().toISOString(), event: 'Frozen — countdown paused' });
        }
        if (patch.storageId && patch.storageId !== item.storageId) {
          history.push({ at: new Date().toISOString(), event: `Moved storage` });
        }
        return { ...item, ...patch, history };
      });
      await persist(next);
    },
    [rawItems, persist]
  );

  const freezeItem = useCallback(
    async (id) => {
      await updateItem(id, { frozen: true, storageId: 'freezer' });
    },
    [updateItem]
  );

  const discardItem = useCallback(
    async (id) => {
      await updateItem(id, { discarded: true });
    },
    [updateItem]
  );

  const removeItem = useCallback(
    async (id) => {
      const next = rawItems.filter((item) => item.id !== id);
      await persist(next);
    },
    [rawItems, persist]
  );

  const signIn = useCallback(async ({ name, email }) => {
    const profile = {
      name: name || email.split('@')[0] || 'User',
      email
    };
    setUser(profile);
    await saveUser(profile);
  }, []);

  const signOut = useCallback(async () => {
    setUser(null);
    await clearUser();
  }, []);

  const markAlertRead = useCallback(
    async (itemId) => {
      const next = { ...alertsRead, [itemId]: true };
      setAlertsRead(next);
      await saveAlertsRead(next);
    },
    [alertsRead]
  );

  const markAllAlertsRead = useCallback(async () => {
    const next = { ...alertsRead };
    alerts.forEach((a) => {
      next[a.itemId] = true;
    });
    setAlertsRead(next);
    await saveAlertsRead(next);
  }, [alerts, alertsRead]);

  const value = {
    loading,
    user,
    items,
    prioritized,
    soonToSpoil,
    alerts,
    unreadAlertCount: alerts.filter((a) => !a.read).length,
    addItem,
    updateItem,
    freezeItem,
    discardItem,
    removeItem,
    signIn,
    signOut,
    markAlertRead,
    markAllAlertsRead,
    getItemById: (id) => items.find((i) => i.id === id) || null
  };

  return <InventoryContext.Provider value={value}>{children}</InventoryContext.Provider>;
}

export function useInventory() {
  const ctx = useContext(InventoryContext);
  if (!ctx) throw new Error('useInventory must be used within InventoryProvider');
  return ctx;
}
