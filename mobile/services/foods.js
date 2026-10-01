/**
 * The server's food database and the administrator calls that edit it.
 *
 * The app keeps working offline with its bundled catalog and the last copy of the
 * server's entries it saved; a refresh only replaces that copy.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { request } from './api';
import { setRemoteCategories, setRemoteFoods } from '../data/foodCatalog';

const KEY = '@eref/foodDatabase';

/** Apply the copy saved on this device, so a corrected food is right before the network answers. */
export async function loadSavedFoods() {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    const saved = raw ? JSON.parse(raw) : null;
    if (saved && Array.isArray(saved.foods)) {
      // Categories first: setRemoteFoods notifies listeners, which should see both.
      if (saved.categories) setRemoteCategories(saved.categories);
      setRemoteFoods(saved.foods);
      return saved.version ?? 0;
    }
  } catch {
    // An unreadable copy is the same as none.
  }
  return null;
}

/**
 * Fetch the server's entries and apply them when they changed.
 * @returns {Promise<{changed: boolean, version: number}>}
 */
export async function refreshFoods(knownVersion = null) {
  const payload = await request('/foods', { auth: false, timeoutMs: 8000 });
  if (payload.version === knownVersion) return { changed: false, version: payload.version };

  if (payload.categories) setRemoteCategories(payload.categories);
  setRemoteFoods(payload.foods);
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify(payload));
  } catch {
    // Saving is a convenience; the entries are already in use.
  }
  return { changed: true, version: payload.version };
}

// ---------------------------------------------------------------- admin calls
export function saveFood(food) {
  const { id, ...body } = food;
  return request(`/admin/foods/${encodeURIComponent(id)}`, { method: 'PUT', body });
}

export function removeFood(id) {
  return request(`/admin/foods/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

export function fetchAdminUsers() {
  return request('/admin/users');
}

export function fetchAdminStats() {
  return request('/admin/stats');
}

export function setUserRole(userId, role) {
  return request(`/admin/users/${userId}/role`, { method: 'POST', body: { role } });
}
