/**
 * The server's recipe dataset, managed by a Super Admin on the web console.
 *
 * Like the food database, the app keeps working offline: it starts from the bundled
 * recipes, then the last copy it saved, and a refresh only replaces that copy.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { request } from './api';
import { setRemoteRecipes } from '../data/recipes';

const KEY = '@eref/recipeDataset';

/** Apply the copy saved on this device. Returns its version, or null when there is none. */
export async function loadSavedRecipes() {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    const saved = raw ? JSON.parse(raw) : null;
    if (saved && Array.isArray(saved.recipes)) {
      setRemoteRecipes(saved.recipes);
      return saved.version ?? 0;
    }
  } catch {
    // An unreadable copy is the same as none.
  }
  return null;
}

/**
 * Fetch the server's recipes and apply them when they changed.
 * @returns {Promise<{changed: boolean, version: number}>}
 */
export async function refreshRecipes(knownVersion = null) {
  const payload = await request('/recipes', { auth: false, timeoutMs: 8000 });
  if (payload.version === knownVersion) return { changed: false, version: payload.version };

  setRemoteRecipes(payload.recipes);
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify(payload));
  } catch {
    // Saving is a convenience; the recipes are already in use.
  }
  return { changed: true, version: payload.version };
}
