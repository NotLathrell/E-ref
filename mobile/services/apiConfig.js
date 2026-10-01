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

  const hasScheme = /^https?:\/\//i.test(trimmed);
  const host = trimmed.replace(/^https?:\/\//i, '').replace(/\/.*$/, '');
  const isLocalHost = /^(localhost|\d{1,3}(\.\d{1,3}){3})(:\d+)?$/i.test(host);

  // A bare IP address or localhost is a LAN server over plain HTTP; a bare domain name
  // (for example a Cloudflare tunnel address) is public and served over HTTPS.
  const withScheme = hasScheme ? trimmed : `${isLocalHost ? 'http' : 'https'}://${trimmed}`;
  const withoutTrailingSlash = withScheme.replace(/\/+$/, '');

  // Only a plain-HTTP address falls back to the backend's documented port.
  const isHttps = /^https:\/\//i.test(withoutTrailingSlash);
  const hasPort = /:\d+$/.test(withoutTrailingSlash.replace(/^https?:\/\//i, ''));
  return hasPort || isHttps ? withoutTrailingSlash : `${withoutTrailingSlash}:8000`;
}
