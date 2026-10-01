import AsyncStorage from '@react-native-async-storage/async-storage';

const KEYS = {
  user: '@eref/user',
  alertsRead: '@eref/alertsRead',
  settings: '@eref/settings',
  legacyInventory: '@eref/inventory',
  notified: '@eref/notified',
  notifAsked: '@eref/notifAsked'
};

const inventoryKey = (userId) => `@eref/inventory/${userId}`;
const queueKey = (userId) => `@eref/queue/${userId}`;
const tasteKey = (userId) => `@eref/taste/${userId}`;

export const DEFAULT_SETTINGS = {
  alertsEnabled: true,
  notifyLeadHours: 24,
  themeMode: 'system'
};

async function readJson(key, fallback) {
  try {
    const raw = await AsyncStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

/** The last inventory this device saw for the user, shown at once while the server syncs. */
export function loadInventoryCache(userId) {
  return readJson(inventoryKey(userId), []);
}

export async function saveInventoryCache(userId, items) {
  await AsyncStorage.setItem(inventoryKey(userId), JSON.stringify(items));
}

/** Changes made while offline that still have to reach the server. */
export function loadQueue(userId) {
  return readJson(queueKey(userId), []);
}

export async function saveQueue(userId, queue) {
  await AsyncStorage.setItem(queueKey(userId), JSON.stringify(queue));
}

/** Items saved on-device before accounts existed, so signing in does not lose them. */
export async function loadLegacyInventory() {
  const items = await readJson(KEYS.legacyInventory, []);
  // The earlier build seeded every install with sample food; those are not the user's.
  return Array.isArray(items) ? items.filter((item) => !String(item.id).startsWith('seed-')) : [];
}

export async function clearLegacyInventory() {
  await AsyncStorage.removeItem(KEYS.legacyInventory);
}

export function loadUser() {
  return readJson(KEYS.user, null);
}

export async function saveUser(user) {
  await AsyncStorage.setItem(KEYS.user, JSON.stringify(user));
}

export async function clearUser() {
  await AsyncStorage.removeItem(KEYS.user);
}

export function loadAlertsRead() {
  return readJson(KEYS.alertsRead, {});
}

export async function saveAlertsRead(map) {
  await AsyncStorage.setItem(KEYS.alertsRead, JSON.stringify(map));
}

export async function loadSettings() {
  const saved = await readJson(KEYS.settings, {});
  return { ...DEFAULT_SETTINGS, ...saved };
}

export async function saveSettings(settings) {
  await AsyncStorage.setItem(KEYS.settings, JSON.stringify(settings));
}

/** Which alerts were already shown today, so a re-plan never repeats a notification. */
export function loadNotified() {
  return readJson(KEYS.notified, {});
}

export async function saveNotified(map) {
  await AsyncStorage.setItem(KEYS.notified, JSON.stringify(map));
}

export async function hasAskedForNotifications() {
  return (await AsyncStorage.getItem(KEYS.notifAsked)) === '1';
}

export async function markAskedForNotifications() {
  await AsyncStorage.setItem(KEYS.notifAsked, '1');
}

/**
 * What the user likes to cook: liked and avoided foods, diet, and the recipes they have
 * opened, saved, cooked or dismissed. Kept on this device, per account.
 */
export async function loadTaste(userId) {
  const saved = await readJson(tasteKey(userId), {});
  return {
    liked: Array.isArray(saved.liked) ? saved.liked : [],
    avoided: Array.isArray(saved.avoided) ? saved.avoided : [],
    diet: saved.diet === 'vegetarian' ? 'vegetarian' : 'none',
    log: Array.isArray(saved.log) ? saved.log : []
  };
}

export async function saveTaste(userId, taste) {
  await AsyncStorage.setItem(tasteKey(userId), JSON.stringify(taste));
}
