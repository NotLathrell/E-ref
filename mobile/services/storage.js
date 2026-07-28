import AsyncStorage from '@react-native-async-storage/async-storage';
import { getFoodById } from '../data/foodCatalog';

const KEYS = {
  inventory: '@eref/inventory',
  user: '@eref/user',
  alertsRead: '@eref/alertsRead'
};

export async function loadInventory() {
  const raw = await AsyncStorage.getItem(KEYS.inventory);
  if (!raw) {
    const seed = buildSeedInventory();
    await AsyncStorage.setItem(KEYS.inventory, JSON.stringify(seed));
    return seed;
  }
  return JSON.parse(raw);
}

export async function saveInventory(items) {
  await AsyncStorage.setItem(KEYS.inventory, JSON.stringify(items));
}

export async function loadUser() {
  const raw = await AsyncStorage.getItem(KEYS.user);
  return raw ? JSON.parse(raw) : null;
}

export async function saveUser(user) {
  await AsyncStorage.setItem(KEYS.user, JSON.stringify(user));
}

export async function clearUser() {
  await AsyncStorage.removeItem(KEYS.user);
}

export async function loadAlertsRead() {
  const raw = await AsyncStorage.getItem(KEYS.alertsRead);
  return raw ? JSON.parse(raw) : {};
}

export async function saveAlertsRead(map) {
  await AsyncStorage.setItem(KEYS.alertsRead, JSON.stringify(map));
}

function buildSeedInventory() {
  const now = Date.now();
  const yogurt = getFoodById('yogurt');
  const meat = getFoodById('meat');

  return [
    {
      id: 'seed-yogurt',
      foodId: yogurt.id,
      title: yogurt.name,
      category: yogurt.category,
      storageId: 'fridge_top',
      imageUri: 'https://images.unsplash.com/photo-1488477181946-6428a0291777?auto=format&fit=crop&w=800&q=80',
      expiryDate: new Date(now + 2 * 86400000).toISOString(),
      manufacturingDate: new Date(now - 5 * 86400000).toISOString(),
      scannedAt: new Date(now - 3 * 86400000).toISOString(),
      createdAt: new Date(now - 3 * 86400000).toISOString(),
      cnnSpoilageScore: 0.22,
      cnnIdentityConfidence: 0.9,
      frozen: false,
      discarded: false,
      history: [
        { at: new Date(now - 3 * 86400000).toISOString(), event: 'Scanned (Shelf)' }
      ]
    },
    {
      id: 'seed-meat',
      foodId: meat.id,
      title: meat.name,
      category: meat.category,
      storageId: 'fridge_bottom',
      imageUri: 'https://images.unsplash.com/photo-1604503468506-a8da13d82791?auto=format&fit=crop&w=800&q=80',
      expiryDate: new Date(now + 1 * 86400000).toISOString(),
      manufacturingDate: new Date(now - 1 * 86400000).toISOString(),
      scannedAt: new Date(now - 2 * 86400000).toISOString(),
      createdAt: new Date(now - 2 * 86400000).toISOString(),
      cnnSpoilageScore: 0.35,
      cnnIdentityConfidence: 0.86,
      frozen: false,
      discarded: false,
      history: [
        { at: new Date(now - 2 * 86400000).toISOString(), event: 'Scanned (Shelf)' }
      ]
    }
  ];
}
