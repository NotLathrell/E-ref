/**
 * JSON client for the E-REF server, in the same spirit as the app's services/api.js:
 * adds the session token, applies a timeout, and turns every failure into an ApiError
 * whose message is safe to show.
 */

const TOKEN_KEY = 'eref.admin.token';
const USER_KEY = 'eref.admin.user';
const API_KEY = 'eref.admin.api';

export class ApiError extends Error {
  constructor(message, { status = 0, network = false } = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.network = network;
  }
}

function safeGet(storage, key) {
  try {
    return storage.getItem(key);
  } catch {
    return null;
  }
}

function safeSet(storage, key, value) {
  try {
    if (value == null) storage.removeItem(key);
    else storage.setItem(key, value);
  } catch {
    // Private windows can refuse storage; the session then lasts as long as the tab.
  }
}

// ------------------------------------------------------------ server address
/** When the API serves this page (at /web), talk to that same server. */
function defaultApiUrl() {
  const { protocol, origin, pathname } = window.location;
  if (protocol.startsWith('http') && pathname.startsWith('/web')) return origin;
  return 'http://localhost:8000';
}

/** Accepts `192.168.1.5`, `192.168.1.5:8000` or a full URL, like the app's server setting. */
export function normalizeApiUrl(raw) {
  let text = String(raw || '').trim().replace(/\/+$/, '');
  if (!text) return '';
  if (!/^https?:\/\//i.test(text)) text = `http://${text}`;
  const url = new URL(text);
  // Plain http without a port means the E-REF default; https (a tunnel) keeps its own.
  const explicitPort = /^https?:\/\/[^/]+:\d+/i.test(text);
  if (url.protocol === 'http:' && !explicitPort) url.port = '8000';
  return url.origin;
}

export function getApiUrl() {
  return safeGet(localStorage, API_KEY) || defaultApiUrl();
}

export function setApiUrl(value) {
  const normalized = value ? normalizeApiUrl(value) : '';
  safeSet(localStorage, API_KEY, normalized && normalized !== defaultApiUrl() ? normalized : null);
  return getApiUrl();
}

// -------------------------------------------------------------------- session
let memoryToken = null;
let onUnauthorized = null;

export function setUnauthorizedHandler(handler) {
  onUnauthorized = handler;
}

export function getSession() {
  const token = memoryToken || safeGet(sessionStorage, TOKEN_KEY) || safeGet(localStorage, TOKEN_KEY);
  const raw = safeGet(sessionStorage, USER_KEY) || safeGet(localStorage, USER_KEY);
  let user = null;
  try {
    user = raw ? JSON.parse(raw) : null;
  } catch {
    user = null;
  }
  return token ? { token, user } : null;
}

/** Keep the session for this tab only, or on this computer when `remember` is set. */
export function saveSession({ token, user }, remember) {
  memoryToken = token;
  clearSession(false);
  const storage = remember ? localStorage : sessionStorage;
  safeSet(storage, TOKEN_KEY, token);
  safeSet(storage, USER_KEY, JSON.stringify(user));
}

export function updateSessionUser(user) {
  for (const storage of [sessionStorage, localStorage]) {
    if (safeGet(storage, TOKEN_KEY)) safeSet(storage, USER_KEY, JSON.stringify(user));
  }
}

export function clearSession(forgetMemory = true) {
  if (forgetMemory) memoryToken = null;
  for (const storage of [sessionStorage, localStorage]) {
    safeSet(storage, TOKEN_KEY, null);
    safeSet(storage, USER_KEY, null);
  }
}

// -------------------------------------------------------------------- request
function messageFrom(payload, status) {
  const detail = payload && payload.detail;
  if (typeof detail === 'string') return detail;
  if (Array.isArray(detail) && detail.length) {
    // FastAPI validation errors: name the field and say what is wrong with it.
    const first = detail[0];
    const field = Array.isArray(first.loc) ? first.loc.filter((p) => p !== 'body').join('.') : '';
    const message = String(first.msg || '').replace(/^Value error, /, '');
    return field ? `${field}: ${message}` : message || 'Please check the form and try again.';
  }
  if (status === 429) return 'Too many attempts. Please wait a moment and try again.';
  if (status >= 500) return 'The server had a problem. Please try again.';
  return 'Something went wrong. Please try again.';
}

export async function request(path, { method = 'GET', body, auth = true, params, timeoutMs = 15000 } = {}) {
  const headers = { Accept: 'application/json' };
  const session = auth ? getSession() : null;
  if (session) headers.Authorization = `Bearer ${session.token}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';

  let url = `${getApiUrl()}${path}`;
  if (params) {
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== null && value !== '') query.set(key, value);
    }
    const text = query.toString();
    if (text) url += `?${text}`;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let response;
  try {
    response = await fetch(url, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
    });
  } catch {
    throw new ApiError(`Cannot reach the E-REF server at ${getApiUrl()}. Is it running?`, { network: true });
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
    const error = new ApiError(messageFrom(payload, response.status), { status: response.status });
    if (response.status === 401 && session && onUnauthorized) onUnauthorized(error);
    throw error;
  }
  return payload;
}

// ------------------------------------------------------------------ endpoints
export const api = {
  login: (email, password) => request('/auth/login', { method: 'POST', body: { email, password }, auth: false }),
  me: () => request('/auth/me'),
  changePassword: (currentPassword, newPassword) =>
    request('/auth/change-password', { method: 'POST', body: { currentPassword, newPassword } }),

  overview: () => request('/super/overview'),

  users: () => request('/super/users'),
  createUser: (body) => request('/super/users', { method: 'POST', body }),
  updateUser: (id, body) => request(`/super/users/${id}`, { method: 'PATCH', body }),
  setPassword: (id, password) => request(`/super/users/${id}/password`, { method: 'POST', body: { password } }),
  deleteUser: (id) => request(`/super/users/${id}`, { method: 'DELETE' }),

  categories: () => request('/super/categories'),
  createCategory: (body) => request('/super/categories', { method: 'POST', body }),
  updateCategory: (name, body) => request(`/super/categories/${encodeURIComponent(name)}`, { method: 'PUT', body }),
  deleteCategory: (name) => request(`/super/categories/${encodeURIComponent(name)}`, { method: 'DELETE' }),

  foods: () => request('/super/foods'),
  recipes: () => request('/super/recipes'),
  createRecipe: (body) => request('/super/recipes', { method: 'POST', body }),
  updateRecipe: (id, body) => request(`/super/recipes/${encodeURIComponent(id)}`, { method: 'PUT', body }),
  deleteRecipe: (id) => request(`/super/recipes/${encodeURIComponent(id)}`, { method: 'DELETE' }),

  activity: (params) => request('/super/activity', { params }),
};
