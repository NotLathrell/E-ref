/**
 * Small UI toolkit for the console: an escaping HTML template tag, icons, toasts,
 * modal forms, confirmation dialogs and formatters.
 */

// ---------------------------------------------------------------- templating
const RAW = Symbol('raw');

/** Mark trusted markup so `html` does not escape it. */
export function raw(markup) {
  return { [RAW]: String(markup) };
}

export function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function render(value) {
  if (value == null || value === false) return '';
  if (Array.isArray(value)) return value.map(render).join('');
  if (typeof value === 'object' && RAW in value) return value[RAW];
  return escapeHtml(value);
}

/** Template tag: interpolated values are escaped unless wrapped in raw() or produced by html. */
export function html(strings, ...values) {
  let out = strings[0];
  values.forEach((value, i) => {
    out += render(value) + strings[i + 1];
  });
  return raw(out);
}

export function toString(markup) {
  return render(markup);
}

export function mount(element, markup) {
  element.innerHTML = render(markup);
  return element;
}

// --------------------------------------------------------------------- icons
// Stroke icons drawn on a 24px grid, in the rounded style of the app's Ionicons.
const ICONS = {
  dashboard:
    '<rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/>',
  users:
    '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
  user: '<path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
  tag: '<path d="M12.59 2.59A2 2 0 0 0 11.17 2H4a2 2 0 0 0-2 2v7.17a2 2 0 0 0 .59 1.42l8.7 8.7a2.43 2.43 0 0 0 3.42 0l6.58-6.58a2.43 2.43 0 0 0 0-3.42z"/><circle cx="7.5" cy="7.5" r="1.2"/>',
  book: '<path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>',
  activity: '<path d="M22 12h-4l-3 9L9 3l-3 9H2"/>',
  logout:
    '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>',
  plus: '<path d="M5 12h14"/><path d="M12 5v14"/>',
  edit: '<path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/>',
  trash:
    '<path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/>',
  moon: '<path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/>',
  monitor: '<rect width="20" height="14" x="2" y="3" rx="2"/><path d="M8 21h8M12 17v4"/>',
  key: '<circle cx="7.5" cy="15.5" r="5.5"/><path d="m21 2-9.6 9.6"/><path d="m15.5 7.5 3 3L22 7l-3-3"/>',
  ban: '<circle cx="12" cy="12" r="10"/><path d="m4.9 4.9 14.2 14.2"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  copy: '<rect width="14" height="14" x="8" y="8" rx="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>',
  checkCircle: '<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><path d="m9 11 3 3L22 4"/>',
  x: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
  download:
    '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>',
  refresh: '<path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/>',
  menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
  clock: '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>',
  shield:
    '<path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/>',
  link: '<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>',
  leaf: '<path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10Z"/><path d="M2 21c0-3 1.85-5.36 5.08-6C9.5 14.52 12 13 13 12"/>',
  eye: '<path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/>',
  eyeOff:
    '<path d="M9.88 9.88a3 3 0 1 0 4.24 4.24"/><path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68"/><path d="M6.61 6.61A13.53 13.53 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61"/><path d="m2 2 20 20"/>',
  chevronLeft: '<path d="m15 18-6-6 6-6"/>',
  chevronRight: '<path d="m9 18 6-6-6-6"/>',
  alert:
    '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/><path d="M12 9v4"/><path d="M12 17h.01"/>',
  box: '<path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/><path d="m3.3 7 8.7 5 8.7-5"/><path d="M12 22V12"/>',
  login:
    '<path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><polyline points="10 17 15 12 10 7"/><line x1="15" y1="12" x2="3" y2="12"/>',
  sparkles:
    '<path d="m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3Z"/>',
};

export function icon(name, className = 'icon') {
  return raw(`<svg class="${className}" viewBox="0 0 24 24" aria-hidden="true">${ICONS[name] || ''}</svg>`);
}

// -------------------------------------------------------------------- toasts
export function toast(message, { error = false, timeout = 3200 } = {}) {
  const host = document.getElementById('toasts');
  const node = document.createElement('div');
  node.className = `toast${error ? ' error' : ''}`;
  mount(node, html`${icon(error ? 'alert' : 'checkCircle')}<span>${message}</span>`);
  host.appendChild(node);
  setTimeout(() => node.remove(), timeout);
}

// -------------------------------------------------------------------- modals
/**
 * Open a modal form. `onSubmit(form, dialog)` may return a promise; the dialog closes
 * when it resolves and shows the error message when it rejects.
 * @returns {Promise<any>} what onSubmit returned, or null if the dialog was dismissed
 */
export function openModal({ title, subtitle, body, submitLabel = 'Save', danger = false, wide = false, onOpen, onSubmit }) {
  return new Promise((resolve) => {
    const dialog = document.createElement('dialog');
    dialog.className = `modal${wide ? ' wide' : ''}`;
    dialog.setAttribute('aria-labelledby', 'modal-title');
    mount(
      dialog,
      html`<form method="dialog" novalidate>
        <div class="modal-head">
          <div>
            <h2 id="modal-title">${title}</h2>
            ${subtitle ? html`<p>${subtitle}</p>` : ''}
          </div>
          <button type="button" class="icon-btn" data-close aria-label="Close">${icon('x')}</button>
        </div>
        <div class="modal-body">
          ${body}
          <div class="alert form-error" role="alert">${icon('alert')}<span></span></div>
        </div>
        <div class="modal-foot">
          <button type="button" class="btn" data-close>Cancel</button>
          <button type="submit" class="btn ${danger ? 'btn-danger-solid' : 'btn-primary'}" data-submit>${submitLabel}</button>
        </div>
      </form>`
    );
    document.body.appendChild(dialog);
    const form = dialog.querySelector('form');
    const errorBox = dialog.querySelector('.form-error');
    const submit = dialog.querySelector('[data-submit]');
    let result = null;

    const close = () => dialog.close();
    dialog.querySelectorAll('[data-close]').forEach((button) => button.addEventListener('click', close));
    dialog.addEventListener('close', () => {
      dialog.remove();
      resolve(result);
    });
    dialog.addEventListener('click', (event) => {
      if (event.target === dialog) close();
    });

    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      errorBox.classList.remove('show');
      submit.disabled = true;
      const label = submit.innerHTML;
      submit.innerHTML = '<span class="spinner" aria-hidden="true"></span> Working…';
      try {
        result = (await onSubmit?.(form, dialog)) ?? true;
        close();
      } catch (error) {
        errorBox.querySelector('span').textContent = error.message || 'Something went wrong.';
        errorBox.classList.add('show');
        submit.disabled = false;
        submit.innerHTML = label;
      }
    });

    dialog.showModal();
    onOpen?.(form, dialog);
    const first = form.querySelector('.modal-body input:not([type=hidden]):not([disabled]), .modal-body textarea, .modal-body select');
    (first || submit).focus();
  });
}

/** Ask a yes/no question. Resolves true when confirmed. */
export async function confirmDialog({ title, message, confirmLabel = 'Confirm', danger = true, onConfirm }) {
  const result = await openModal({
    title,
    body: html`<p class="muted">${message}</p>`,
    submitLabel: confirmLabel,
    danger,
    onSubmit: async () => {
      if (onConfirm) await onConfirm();
      return true;
    },
  });
  return Boolean(result);
}

// ---------------------------------------------------------------- formatting
const ROLE_LABELS = { super_admin: 'Super Admin', admin: 'Admin', employee: 'Employee' };

export function roleLabel(role) {
  return ROLE_LABELS[role] || role;
}

export function roleBadge(role) {
  return html`<span class="badge badge-${role}">${roleLabel(role)}</span>`;
}

export function initials(name) {
  const parts = String(name || '?').trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] || '?') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
}

export function plural(count, word, many = `${word}s`) {
  return `${count.toLocaleString()} ${count === 1 ? word : many}`;
}

const dateFormat = new Intl.DateTimeFormat(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
const dateTimeFormat = new Intl.DateTimeFormat(undefined, {
  year: 'numeric',
  month: 'short',
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
});
const relative = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });

/** Server times are Unix seconds. */
export function formatDate(seconds) {
  return seconds ? dateFormat.format(new Date(seconds * 1000)) : '—';
}

export function formatDateTime(seconds) {
  return seconds ? dateTimeFormat.format(new Date(seconds * 1000)) : '—';
}

export function timeAgo(seconds) {
  if (!seconds) return 'Never';
  const diff = seconds - Date.now() / 1000;
  const steps = [
    [60, 'second'],
    [3600, 'minute'],
    [86400, 'hour'],
    [604800, 'day'],
    [2629800, 'week'],
    [31557600, 'month'],
    [Infinity, 'year'],
  ];
  const sizes = { second: 1, minute: 60, hour: 3600, day: 86400, week: 604800, month: 2629800, year: 31557600 };
  for (const [limit, unit] of steps) {
    if (Math.abs(diff) < limit) {
      if (unit === 'second') return 'Just now';
      return relative.format(Math.round(diff / sizes[unit]), unit);
    }
  }
  return formatDate(seconds);
}

export function debounce(fn, ms = 250) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
}

/** A strong, readable temporary password. */
export function generatePassword() {
  const words = ['amber', 'basil', 'cocoa', 'mango', 'olive', 'papaya', 'pepper', 'tomato', 'ginger', 'lemon', 'melon', 'cumin'];
  const pick = (n) => {
    const values = new Uint32Array(1);
    crypto.getRandomValues(values);
    return values[0] % n;
  };
  return `${words[pick(words.length)]}-${words[pick(words.length)]}-${1000 + pick(9000)}`;
}

export function downloadFile(name, text, type = 'text/csv') {
  const blob = new Blob([text], { type: `${type};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function emptyState(iconName, title, message) {
  return html`<div class="empty">${icon(iconName)}<strong>${title}</strong>${message ? html`<span>${message}</span>` : ''}</div>`;
}
