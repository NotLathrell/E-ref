/**
 * The signed-in session token.
 *
 * Kept in the platform keychain (expo-secure-store) where one exists. On the web,
 * or if the keychain is unavailable, it falls back to AsyncStorage rather than
 * failing to sign in.
 */

import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = 'eref_session_token';

let memoryToken = null;

/** The token for the current session; synchronous so request code can use it directly. */
export function getToken() {
  return memoryToken;
}

export async function loadToken() {
  try {
    memoryToken = (await SecureStore.getItemAsync(KEY)) || null;
  } catch {
    memoryToken = null;
  }
  if (!memoryToken) {
    try {
      memoryToken = (await AsyncStorage.getItem(`@eref/${KEY}`)) || null;
    } catch {
      memoryToken = null;
    }
  }
  return memoryToken;
}

export async function saveToken(token) {
  memoryToken = token;
  try {
    await SecureStore.setItemAsync(KEY, token);
    await AsyncStorage.removeItem(`@eref/${KEY}`);
  } catch {
    await AsyncStorage.setItem(`@eref/${KEY}`, token);
  }
}

export async function clearToken() {
  memoryToken = null;
  try {
    await SecureStore.deleteItemAsync(KEY);
  } catch {
    // Nothing stored in the keychain to remove.
  }
  try {
    await AsyncStorage.removeItem(`@eref/${KEY}`);
  } catch {
    // Nothing stored to remove.
  }
}
