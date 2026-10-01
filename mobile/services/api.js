/**
 * JSON client for the E-REF server: adds the session token, applies a timeout and
 * turns every failure into an ApiError with a message that is safe to show a user.
 */

import { getApiUrl } from './apiConfig';
import { getToken } from './session';

export class ApiError extends Error {
  constructor(message, { status = 0, network = false } = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.network = network;
  }
}

let onUnauthorized = null;

/** Called when the server rejects the saved session, so the app can sign the user out. */
export function setUnauthorizedHandler(handler) {
  onUnauthorized = handler;
}

function messageFrom(payload, status) {
  const detail = payload && payload.detail;
  if (typeof detail === 'string') return detail;
  if (Array.isArray(detail)) return 'Please check your details and try again.';
  if (status === 429) return 'Too many attempts. Please wait a moment and try again.';
  if (status >= 500) return 'The server had a problem. Please try again.';
  return 'Something went wrong. Please try again.';
}

export async function request(path, { method = 'GET', body, auth = true, timeoutMs = 15000 } = {}) {
  const headers = { Accept: 'application/json' };
  const token = auth ? getToken() : null;
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let response;
  try {
    response = await fetch(`${getApiUrl()}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal
    });
  } catch {
    throw new ApiError(`Cannot reach the E-REF server at ${getApiUrl()}. Check your connection.`, {
      network: true
    });
  } finally {
    clearTimeout(timer);
  }

  let payload = null;
  try {
    payload = await response.json();
  } catch {
    // An empty or non-JSON body is handled by the status check below.
  }

  if (!response.ok) {
    if (response.status === 401 && token && onUnauthorized) onUnauthorized();
    throw new ApiError(messageFrom(payload, response.status), { status: response.status });
  }
  return payload;
}
