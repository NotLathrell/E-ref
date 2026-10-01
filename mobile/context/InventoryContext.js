import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';
import {
  loadInventoryCache,
  saveInventoryCache,
  loadQueue,
  loadLegacyInventory,
  clearLegacyInventory,
  loadUser,
  saveUser,
  clearUser,
  loadAlertsRead,
  saveAlertsRead,
  loadSettings,
  saveSettings,
  loadTaste,
  saveTaste,
  DEFAULT_SETTINGS
} from '../services/storage';
import { DEFAULT_TASTE } from '../services/contentBased';
import { loadSavedFoods, refreshFoods } from '../services/foods';
import { loadSavedRecipes, refreshRecipes } from '../services/recipes';
import { enrichAll, enrichItem } from '../services/enrich';
import { getFoodById } from '../data/foodCatalog';
import { prioritizeByGreedy, getSoonToSpoil } from '../services/prioritize';
import { loadApiOverride } from '../services/apiConfig';
import { loadToken, saveToken, clearToken } from '../services/session';
import { setUnauthorizedHandler } from '../services/api';
import * as authApi from '../services/auth';
import {
  queuePut,
  queueDelete,
  updateQueue,
  flushQueue,
  pullInventory,
  applyPending
} from '../services/inventorySync';
import { configureNotifications, planNotifications, syncNotifications } from '../services/notifications';

const InventoryContext = createContext(null);

export function InventoryProvider({ children }) {
  const [rawItems, setRawItems] = useState([]);
  const [user, setUser] = useState(null);
  const [alertsRead, setAlertsRead] = useState({});
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);
  const [syncStatus, setSyncStatus] = useState('idle'); // idle | syncing | offline | error
  const [pendingChanges, setPendingChanges] = useState(0);
  const [taste, setTaste] = useState(DEFAULT_TASTE);
  // Bumped when the server's food database, categories or recipe dataset change, so
  // shelf-life, risk and recommendations are recomputed.
  const [foodsVersion, setFoodsVersion] = useState(0);
  const foodsVersionRef = useRef(null);
  const recipesVersionRef = useRef(null);

  // Always the latest values, for callbacks that outlive a render.
  const rawRef = useRef([]);
  const userRef = useRef(null);
  // Items edited on this device whose change is not yet in the queue. A sync that
  // finishes in that window must not overwrite them with the server's older copy.
  const dirtyRef = useRef(new Set());
  const lockRef = useRef(Promise.resolve());

  const setItems = useCallback((next) => {
    rawRef.current = next;
    setRawItems(next);
  }, []);

  const withLock = useCallback((work) => {
    const run = lockRef.current.catch(() => {}).then(work);
    lockRef.current = run;
    return run;
  }, []);

  // --------------------------------------------------------------- sync
  const syncNow = useCallback(async () => {
    const current = userRef.current;
    if (!current) return;

    setSyncStatus('syncing');
    const sent = await flushQueue(current.id);
    if (sent.unauthorized) return;
    if (sent.offline) {
      setSyncStatus('offline');
      setPendingChanges(sent.remaining);
      return;
    }

    let server;
    try {
      server = await pullInventory();
    } catch (error) {
      // A rejected session signs the user out; that is not a sync error to report.
      if (userRef.current?.id === current.id) setSyncStatus(error.network ? 'offline' : 'error');
      return;
    }

    await withLock(async () => {
      if (userRef.current?.id !== current.id) return;
      const queue = await loadQueue(current.id);
      let merged = applyPending(server, queue);

      const local = new Map(rawRef.current.map((item) => [item.id, item]));
      for (const id of dirtyRef.current) {
        merged = merged.filter((item) => item.id !== id);
        if (local.has(id)) merged.push(local.get(id));
      }

      setItems(merged);
      await saveInventoryCache(current.id, merged);
      setPendingChanges(queue.length);
      setSyncStatus('idle');
    });
  }, [setItems, withLock]);

  // ------------------------------------------------------- food database
  // The server's food database (an administrator's corrections and additions, and the
  // categories) is laid over the bundled catalog, and its recipe dataset replaces the
  // bundled recipes. Failing to reach the server just keeps the last copy of each.
  const refreshFoodDatabase = useCallback(async () => {
    const [foods, recipes] = await Promise.all([
      refreshFoods(foodsVersionRef.current).catch(() => null),
      refreshRecipes(recipesVersionRef.current).catch(() => null)
    ]);
    if (foods) foodsVersionRef.current = foods.version;
    if (recipes) recipesVersionRef.current = recipes.version;
    const changed = Boolean(foods?.changed || recipes?.changed);
    if (changed) setFoodsVersion((n) => n + 1);
    return changed;
  }, []);

  // ------------------------------------------------------------ session
  const signOut = useCallback(async () => {
    userRef.current = null;
    setUser(null);
    setItems([]);
    setSyncStatus('idle');
    setPendingChanges(0);
    setTaste(DEFAULT_TASTE);
    await clearToken();
    await clearUser();
    try {
      await syncNotifications([], { enabled: false });
    } catch {
      // Notifications are best-effort; signing out must not fail because of them.
    }
  }, [setItems]);

  const establishSession = useCallback(
    async ({ token, user: profile }) => {
      await saveToken(token);
      await saveUser(profile);
      userRef.current = profile;
      setUser(profile);

      let items = await loadInventoryCache(profile.id);

      // Bring in anything saved on this device before accounts existed.
      const legacy = await loadLegacyInventory();
      if (legacy.length) {
        const stamp = new Date().toISOString();
        const known = new Set(items.map((item) => item.id));
        const carried = legacy.filter((item) => !known.has(item.id)).map((item) => ({ ...item, updatedAt: item.updatedAt || stamp }));
        items = [...carried, ...items];
        await updateQueue(profile.id, (queue) => carried.reduce(queuePut, queue));
        await saveInventoryCache(profile.id, items);
        await clearLegacyInventory();
      }

      setItems(items);
      setTaste(await loadTaste(profile.id));
      syncNow();
      refreshFoodDatabase();
    },
    [setItems, syncNow, refreshFoodDatabase]
  );

  const signIn = useCallback(
    async ({ email, password }) => {
      const session = await authApi.login({ email, password });
      await establishSession(session);
      return session.user;
    },
    [establishSession]
  );

  const signUp = useCallback(
    async ({ name, email, password }) => {
      const session = await authApi.register({ name, email, password });
      await establishSession(session);
      return session.user;
    },
    [establishSession]
  );

  useEffect(() => {
    setUnauthorizedHandler(() => {
      signOut();
    });
    return () => setUnauthorizedHandler(null);
  }, [signOut]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      await loadApiOverride();
      const [savedVersion, savedRecipesVersion] = await Promise.all([loadSavedFoods(), loadSavedRecipes()]);
      if (savedVersion !== null) foodsVersionRef.current = savedVersion;
      if (savedRecipesVersion !== null) recipesVersionRef.current = savedRecipesVersion;
      if (savedVersion !== null || savedRecipesVersion !== null) setFoodsVersion((n) => n + 1);
      const [token, cachedUser, readMap, prefs] = await Promise.all([
        loadToken(),
        loadUser(),
        loadAlertsRead(),
        loadSettings()
      ]);
      if (!mounted) return;
      setAlertsRead(readMap);
      setSettings(prefs);

      if (token && cachedUser) {
        // Open straight into the app with what this device last saw, then refresh.
        userRef.current = cachedUser;
        setUser(cachedUser);
        setItems(await loadInventoryCache(cachedUser.id));
        setPendingChanges((await loadQueue(cachedUser.id)).length);
        setTaste(await loadTaste(cachedUser.id));
        if (!mounted) return;
        setLoading(false);
        refreshFoodDatabase();

        try {
          const { user: fresh } = await authApi.fetchMe();
          if (userRef.current?.id === fresh.id) {
            setUser(fresh);
            await saveUser(fresh);
          }
          syncNow();
        } catch (error) {
          if (error.network) setSyncStatus('offline');
        }
        return;
      }

      if (token) await clearToken();
      setLoading(false);
    })();
    return () => {
      mounted = false;
    };
  }, [setItems, syncNow, refreshFoodDatabase]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') syncNow();
    });
    return () => subscription?.remove?.();
  }, [syncNow]);

  // Recompute TTI/risk periodically while app is open
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 60_000);
    return () => clearInterval(id);
  }, []);

  const items = useMemo(
    () => enrichAll(rawItems.filter((i) => !i.discarded && !i.consumed)),
    [rawItems, tick, foodsVersion]
  );

  // Food that was used up or thrown away leaves the shelf but stays in the history.
  const archive = useMemo(
    () =>
      rawItems
        .filter((i) => i.discarded || i.consumed)
        .map((i) => ({
          ...i,
          outcome: i.consumed ? 'used' : 'discarded',
          title: i.title || getFoodById(i.foodId).name
        }))
        .sort((a, b) => String(b.resolvedAt || b.updatedAt).localeCompare(String(a.resolvedAt || a.updatedAt))),
    [rawItems, foodsVersion]
  );

  // Every recorded event, for every item, newest first.
  const historyEntries = useMemo(
    () =>
      rawItems
        .flatMap((item) =>
          (Array.isArray(item.history) ? item.history : []).map((entry, index) => ({
            id: `${item.id}-${index}`,
            itemId: item.id,
            foodId: item.foodId,
            title: item.title || getFoodById(item.foodId).name,
            at: entry.at,
            event: entry.event,
            status: item.consumed ? 'used' : item.discarded ? 'discarded' : 'active'
          }))
        )
        .sort((a, b) => String(b.at).localeCompare(String(a.at))),
    [rawItems, foodsVersion]
  );

  const prioritized = useMemo(() => prioritizeByGreedy(items), [items]);
  const soonToSpoil = useMemo(() => getSoonToSpoil(items, 3), [items]);

  const alerts = useMemo(() => {
    if (!settings.alertsEnabled) return [];
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
  }, [items, alertsRead, settings.alertsEnabled]);

  // ------------------------------------------------------- notifications
  useEffect(() => {
    configureNotifications().catch(() => {});
  }, []);

  // A fingerprint of what should be notified and when. The plan only changes when an
  // item does, not every minute as risk is recomputed, so the device is re-scheduled
  // only when there is something new to schedule.
  const planKey = useMemo(
    () =>
      JSON.stringify(
        planNotifications(items, { leadHours: settings.notifyLeadHours }).map((entry) => [
          entry.key,
          entry.at ? Math.round(entry.at.getTime() / 60000) : null
        ])
      ),
    [items, settings.notifyLeadHours]
  );

  useEffect(() => {
    if (loading || !user) return;
    syncNotifications(items, { enabled: settings.alertsEnabled, leadHours: settings.notifyLeadHours }).catch(() => {});
    // `items` is captured by `planKey`; re-running on every recompute would reschedule needlessly.
  }, [planKey, settings.alertsEnabled, user?.id, loading]);

  // ------------------------------------------------------------ inventory
  const commit = useCallback(
    async (next, changedIds, change) => {
      setItems(next);
      const current = userRef.current;
      if (!current) return;

      changedIds.forEach((id) => dirtyRef.current.add(id));
      await withLock(async () => {
        const queue = await updateQueue(current.id, change);
        await saveInventoryCache(current.id, rawRef.current);
        setPendingChanges(queue.length);
        changedIds.forEach((id) => dirtyRef.current.delete(id));
      });
      syncNow();
    },
    [setItems, withLock, syncNow]
  );

  const addItem = useCallback(
    async (draft) => {
      const now = new Date().toISOString();
      // `historyNote` (what the models said) becomes a line in the item's history.
      const { historyNote, ...fields } = draft;
      const record = {
        ...fields,
        id: `item-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        scannedAt: now,
        createdAt: now,
        updatedAt: now,
        history: [
          { at: now, event: 'Scanned (Shelf)' },
          ...(historyNote ? [{ at: now, event: historyNote }] : [])
        ]
      };
      await commit([record, ...rawRef.current], [record.id], (queue) => queuePut(queue, record));
      return enrichItem(record);
    },
    [commit]
  );

  const updateItem = useCallback(
    async (id, patch) => {
      const now = new Date().toISOString();
      let updated = null;
      const next = rawRef.current.map((item) => {
        if (item.id !== id) return item;
        const history = Array.isArray(item.history) ? [...item.history] : [];
        if (patch.frozen === true && !item.frozen) {
          history.push({ at: now, event: 'Frozen — countdown paused' });
        }
        if (patch.storageId && patch.storageId !== item.storageId) {
          history.push({ at: now, event: `Moved storage` });
        }
        if (patch.expiryDate !== undefined && patch.expiryDate !== item.expiryDate) {
          history.push({ at: now, event: patch.expiryDate ? 'Expiry date changed' : 'Expiry date removed' });
        }
        if (patch.consumed === true && !item.consumed) {
          history.push({ at: now, event: patch.note ? `Used up — ${patch.note}` : 'Used up' });
        }
        if (patch.discarded === true && !item.discarded) {
          history.push({ at: now, event: 'Discarded' });
        }
        if ((patch.consumed === false && item.consumed) || (patch.discarded === false && item.discarded)) {
          history.push({ at: now, event: 'Put back on the shelf' });
        }
        // `note` only annotates the history entry; it is not a field of the item.
        const { note, ...fields } = patch;
        updated = { ...item, ...fields, history, updatedAt: now };
        return updated;
      });
      if (!updated) return;
      await commit(next, [id], (queue) => queuePut(queue, updated));
    },
    [commit]
  );

  const freezeItem = useCallback(
    async (id) => {
      await updateItem(id, { frozen: true, storageId: 'freezer' });
    },
    [updateItem]
  );

  const discardItem = useCallback(
    async (id) => {
      await updateItem(id, { discarded: true, resolvedAt: new Date().toISOString() });
    },
    [updateItem]
  );

  /** The food was eaten or cooked: it leaves the shelf but stays in the history. */
  const consumeItem = useCallback(
    async (id, note) => {
      await updateItem(id, { consumed: true, resolvedAt: new Date().toISOString(), note });
    },
    [updateItem]
  );

  /** Undo a discard or "used up". */
  const restoreItem = useCallback(
    async (id) => {
      await updateItem(id, { consumed: false, discarded: false, resolvedAt: null });
    },
    [updateItem]
  );

  const removeItem = useCallback(
    async (id) => {
      await commit(
        rawRef.current.filter((item) => item.id !== id),
        [id],
        (queue) => queueDelete(queue, id)
      );
    },
    [commit]
  );

  // -------------------------------------------------------------- taste
  const updateTaste = useCallback(
    async (patch) => {
      const current = userRef.current;
      const next = { ...taste, ...patch };
      setTaste(next);
      if (current) await saveTaste(current.id, next);
    },
    [taste]
  );

  /** Remember that the user opened, saved, cooked or dismissed a recipe. */
  const logRecipe = useCallback(
    async (recipeId, action) => {
      const current = userRef.current;
      // The latest entry per recipe and action is enough; an unbounded log would grow forever.
      const kept = taste.log.filter((entry) => !(entry.recipeId === recipeId && entry.action === action));
      const next = { ...taste, log: [...kept, { recipeId, action, at: new Date().toISOString() }].slice(-200) };
      setTaste(next);
      if (current) await saveTaste(current.id, next);
    },
    [taste]
  );

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

  const updateSettings = useCallback(
    async (patch) => {
      const next = { ...settings, ...patch };
      setSettings(next);
      await saveSettings(next);
    },
    [settings]
  );

  const value = {
    loading,
    user,
    settings,
    updateSettings,
    items,
    prioritized,
    soonToSpoil,
    alerts,
    unreadAlertCount: alerts.filter((a) => !a.read).length,
    syncStatus,
    pendingChanges,
    refresh: syncNow,
    addItem,
    updateItem,
    freezeItem,
    discardItem,
    consumeItem,
    restoreItem,
    removeItem,
    archive,
    historyEntries,
    taste,
    updateTaste,
    logRecipe,
    refreshFoodDatabase,
    foodsVersion,
    signIn,
    signUp,
    signOut,
    markAlertRead,
    markAllAlertsRead,
    // IMPORTANT: convenient export for backups or debugging
    exportInventory: () => JSON.stringify({ user, items: rawRef.current }, null, 2),
    getItemById: (id) => items.find((i) => i.id === id) || null
  };

  return <InventoryContext.Provider value={value}>{children}</InventoryContext.Provider>;
}

export function useInventory() {
  const ctx = useContext(InventoryContext);
  if (!ctx) throw new Error('useInventory must be used within InventoryProvider');
  return ctx;
}
