/**
 * Runtime API base URL.
 *
 * `config.js` supplies the address the Expo dev server detected on the LAN.
 * That is right most of the time, but a phone on a different subnet — or a
 * server on a non-default port — needs an override, so the Profile screen can
 * set one and it is persisted here.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_URL as DEFAULT_API_URL } from '../config';

const KEY = '@eref/apiOverride';

let current = DEFAULT_API_URL;
const listeners = new Set();

/** The base URL every request should use right now. */
export function getApiUrl() {
  return current;
}

export function getDefaultApiUrl() {
  return DEFAULT_API_URL;
}

export function hasOverride() {
  return current !== DEFAULT_API_URL;
}

/** Restore a saved override. Call once at app start. */
export async function loadApiOverride() {
  try {
    const saved = await AsyncStorage.getItem(KEY);
    if (saved) {
      current = saved;
      notify();
    }
  } catch {
    // A missing or unreadable store just means "no override".
  }
  return current;
}

/**
 * Set the override. Accepts `192.168.1.5`, `192.168.1.5:8000`, or a full URL.
 * Passing an empty value clears the override.
 */
export async function setApiOverride(value) {
  const normalized = normalizeUrl(value);
  current = normalized || DEFAULT_API_URL;

  try {
    if (normalized) {
      await AsyncStorage.setItem(KEY, normalized);
    } else {
      await AsyncStorage.removeItem(KEY);
    }
  } catch {
    // Keep the in-memory value even if persistence fails.
  }

  notify();
  return current;
}

/** Subscribe to URL changes; returns an unsubscribe function. */
export function onApiUrlChange(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function notify() {
  listeners.forEach((listener) => listener(current));
}

function normalizeUrl(value) {
  const trimmed = String(value || '').trim();
  if (!trimmed) return null;

  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `http://${trimmed}`;
  const withoutTrailingSlash = withScheme.replace(/\/+$/, '');

  // Default to the port the backend documents when none was given.
  const hasPort = /:\d+$/.test(withoutTrailingSlash.replace(/^https?:\/\//i, ''));
  return hasPort ? withoutTrailingSlash : `${withoutTrailingSlash}:8000`;
}
