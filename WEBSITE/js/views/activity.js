/** Activity Logs: every sign-in, account change, inventory change and dataset edit, system-wide. */

import { api } from '../api.js';
import { debounce, downloadFile, emptyState, formatDateTime, html, icon, mount, plural, roleBadge, timeAgo, toast } from '../ui.js';

const GROUPS = [
  { id: '', label: 'All activity' },
  { id: 'auth', label: 'Sign-in & passwords' },
  { id: 'user', label: 'Account management' },
  { id: 'inventory', label: 'Inventory' },
  { id: 'food', label: 'Food database' },
  { id: 'category', label: 'Categories' },
  { id: 'recipe', label: 'Recipes' },
];

const ACTIONS = {
  'auth.register': { label: 'Signed up', icon: 'user', tone: 'primary' },
  'auth.login': { label: 'Signed in', icon: 'login', tone: 'primary' },
  'auth.login_failed': { label: 'Failed sign-in', icon: 'alert', tone: 'danger' },
  'auth.login_blocked': { label: 'Sign-in blocked (disabled account)', icon: 'ban', tone: 'danger' },
  'auth.reset_requested': { label: 'Requested a reset code', icon: 'key', tone: 'warning' },
  'auth.password_reset': { label: 'Reset their password', icon: 'key', tone: 'warning' },
  'auth.password_changed': { label: 'Changed their password', icon: 'key', tone: 'primary' },
  'user.created': { label: 'Created an account', icon: 'plus', tone: 'accent' },
  'user.updated': { label: 'Edited an account', icon: 'edit', tone: 'accent' },
  'user.role_changed': { label: 'Changed a tier', icon: 'shield', tone: 'accent' },
  'user.disabled': { label: 'Disabled an account', icon: 'ban', tone: 'danger' },
  'user.enabled': { label: 'Enabled an account', icon: 'checkCircle', tone: 'success' },
  'user.password_set': { label: 'Set a new password', icon: 'key', tone: 'warning' },
  'user.deleted': { label: 'Deleted an account', icon: 'trash', tone: 'danger' },
  'inventory.item_saved': { label: 'Saved an inventory item', icon: 'box', tone: 'success' },
  'inventory.item_deleted': { label: 'Deleted an inventory item', icon: 'trash', tone: 'warning' },
  'inventory.synced': { label: 'Synced inventory', icon: 'refresh', tone: 'success' },
  'food.added': { label: 'Added a food', icon: 'leaf', tone: 'success' },
  'food.updated': { label: 'Corrected a food', icon: 'leaf', tone: 'accent' },
  'food.removed': { label: 'Removed a food entry', icon: 'leaf', tone: 'danger' },
  'category.added': { label: 'Added a category', icon: 'tag', tone: 'accent' },
  'category.updated': { label: 'Edited a category', icon: 'tag', tone: 'accent' },
  'category.removed': { label: 'Removed a category', icon: 'tag', tone: 'danger' },
  'recipe.added': { label: 'Added a recipe', icon: 'book', tone: 'accent' },
  'recipe.updated': { label: 'Edited a recipe', icon: 'book', tone: 'accent' },
  'recipe.removed': { label: 'Removed a recipe', icon: 'book', tone: 'danger' },
};

export function describeAction(action) {
  return ACTIONS[action] || { label: action, icon: 'activity', tone: 'primary' };
}

const ROLE_WORDS = { super_admin: 'Super Admin', admin: 'Admin', employee: 'Employee' };

function show(value, key) {
  if (value === null || value === undefined || value === '') return '—';
  // The disabled flag is stored as 0 / 1.
  if (typeof value === 'boolean' || key === 'disabled') return value ? 'yes' : 'no';
  if (Array.isArray(value)) return value.join(', ') || '—';
  return ROLE_WORDS[value] || String(value);
}

/** Detail as readable lines: a change shows "field old → new", anything else "field value". */
function detailLines(detail) {
  if (!detail) return [];
  return Object.entries(detail).map(([key, value]) => {
    const change = value && typeof value === 'object' && !Array.isArray(value) && ('from' in value || 'to' in value);
    return { key, text: change ? `${show(value.from, key)} → ${show(value.to, key)}` : show(value, key) };
  });
}

function detailText(entry) {
  const detail = entry.detail || {};
  if ('from' in detail && 'to' in detail && Object.keys(detail).length === 2) return `${show(detail.from)} → ${show(detail.to)}`;
  return detailLines(detail).map((l) => `${l.key}: ${l.text}`).join('; ');
}

function toCsv(entries) {
  const cell = (value) => {
    const text = String(value ?? '');
    return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  const header = ['Time', 'Action', 'Description', 'Actor name', 'Actor email', 'Actor tier', 'Target', 'Details', 'IP address'];
  const rows = entries.map((e) => [
    new Date(e.at * 1000).toISOString(),
    e.action,
    describeAction(e.action).label,
    e.actor_name,
    e.actor_email,
    ROLE_WORDS[e.actor_role] || e.actor_role || '',
    e.target,
    detailText(e),
    e.ip,
  ]);
  return [header, ...rows].map((r) => r.map(cell).join(',')).join('\r\n');
}

/** A yyyy-mm-dd input value as Unix seconds at local midnight. */
function dayStart(value, addDays = 0) {
  if (!value) return undefined;
  const [y, m, d] = value.split('-').map(Number);
  return new Date(y, m - 1, d + addDays).getTime() / 1000;
}

const PAGE_SIZE = 50;

export default {
  title: 'Activity Logs',
  subtitle: 'A system-wide record of sign-ins, account changes, inventory changes and edits to the food database, categories and recipes.',

  async render(container, ctx) {
    const state = { group: '', action: '', actor: '', q: '', from: '', to: '', page: 0, total: 0, entries: [], actions: [] };

    mount(
      ctx.actions,
      html`<button class="btn" type="button" id="refresh">${icon('refresh')} Refresh</button>
        <button class="btn btn-primary" type="button" id="export">${icon('download')} Export CSV</button>`
    );

    mount(
      container,
      html`<div class="card" style="margin-bottom:16px">
          <div class="filters">
            <div class="field">
              <label for="f-group">Type</label>
              <select class="select" id="f-group">${GROUPS.map((g) => html`<option value="${g.id}">${g.label}</option>`)}</select>
            </div>
            <div class="field">
              <label for="f-action">Action</label>
              <select class="select" id="f-action"><option value="">Any action</option></select>
            </div>
            <div class="field">
              <label for="f-actor">Person</label>
              <input class="input" id="f-actor" type="search" placeholder="Name or email" />
            </div>
            <div class="field">
              <label for="f-q">Contains</label>
              <input class="input" id="f-q" type="search" placeholder="Target or detail" />
            </div>
            <div class="field">
              <label for="f-from">From</label>
              <input class="input" id="f-from" type="date" />
            </div>
            <div class="field">
              <label for="f-to">To</label>
              <input class="input" id="f-to" type="date" />
            </div>
          </div>
          <div class="chips" role="group" aria-label="Quick ranges">
            <button type="button" class="chip" data-range="0">Today</button>
            <button type="button" class="chip" data-range="6">Last 7 days</button>
            <button type="button" class="chip" data-range="29">Last 30 days</button>
            <button type="button" class="chip" data-range="">Any time</button>
            <button type="button" class="chip" id="clear">${icon('x')} Clear filters</button>
          </div>
        </div>
        <div class="table-card" id="results"><div class="skeleton" style="min-height:300px;border-radius:0"></div></div>`
    );

    const $ = (selector) => container.querySelector(selector);
    const results = $('#results');

    const params = (extra = {}) => ({
      action: state.action || state.group || undefined,
      actor: state.actor || undefined,
      q: state.q || undefined,
      since: dayStart(state.from),
      until: dayStart(state.to, 1),
      ...extra,
    });

    function fillActions() {
      const select = $('#f-action');
      const options = state.actions.filter((a) => !state.group || a.startsWith(`${state.group}.`));
      if (state.action && !options.includes(state.action)) state.action = '';
      mount(
        select,
        html`<option value="">Any action</option>${options.map(
          (a) => html`<option value="${a}" ${a === state.action ? html`selected` : ''}>${describeAction(a).label}</option>`
        )}`
      );
    }

    async function load() {
      results.setAttribute('aria-busy', 'true');
      try {
        const data = await api.activity(params({ limit: PAGE_SIZE, offset: state.page * PAGE_SIZE }));
        state.entries = data.entries;
        state.total = data.total;
        state.actions = data.actions;
        fillActions();
        draw();
      } catch (error) {
        if (error.status === 401) return;
        mount(results, html`<div class="alert" role="alert" style="margin:16px">${icon('alert')}<span>${error.message}</span></div>`);
      } finally {
        results.removeAttribute('aria-busy');
      }
    }

    function draw() {
      if (!state.entries.length) {
        mount(results, emptyState('activity', 'No activity found', 'Nothing matches these filters yet.'));
        return;
      }
      const first = state.page * PAGE_SIZE + 1;
      const last = first + state.entries.length - 1;
      const pages = Math.ceil(state.total / PAGE_SIZE);
      mount(
        results,
        html`<div class="table-wrap"><table class="table">
            <thead><tr>
              <th scope="col">When</th><th scope="col">Who</th><th scope="col">What</th>
              <th scope="col">Target</th><th scope="col">Details</th><th scope="col">IP address</th>
            </tr></thead>
            <tbody>
              ${state.entries.map((e) => {
                const action = describeAction(e.action);
                const lines = detailLines(e.detail);
                return html`<tr>
                  <td style="white-space:nowrap">
                    <div style="font-weight:700">${timeAgo(e.at)}</div>
                    <div class="sub muted" style="font-size:12px">${formatDateTime(e.at)}</div>
                  </td>
                  <td>
                    ${e.actor_name || e.actor_email
                      ? html`<div style="font-weight:700">${e.actor_name || e.actor_email}</div>
                          ${e.actor_name ? html`<div class="muted" style="font-size:12px">${e.actor_email}</div>` : ''}
                          ${e.actor_role ? html`<div style="margin-top:4px">${roleBadge(e.actor_role)}</div>` : html`<div class="muted" style="font-size:12px">No account</div>`}`
                      : html`<span class="muted">System</span>`}
                  </td>
                  <td>
                    <div style="display:flex;align-items:center;gap:10px">
                      <span class="action-dot tone-${action.tone}">${icon(action.icon)}</span>
                      <div><div style="font-weight:700">${action.label}</div><div class="mono muted">${e.action}</div></div>
                    </div>
                  </td>
                  <td class="mono">${e.target || '—'}</td>
                  <td>${lines.length
                    ? html`<div class="detail-list">${lines.map((l) => html`<span><b>${l.key}</b> ${l.text}</span>`)}</div>`
                    : html`<span class="muted">—</span>`}</td>
                  <td class="mono muted">${e.ip || '—'}</td>
                </tr>`;
              })}
            </tbody>
          </table></div>
          <div class="table-foot">
            <span>${first.toLocaleString()}–${last.toLocaleString()} of ${plural(state.total, 'event')}</span>
            <div class="pager">
              <button class="btn btn-sm" type="button" id="prev" ${state.page === 0 ? html`disabled` : ''}>${icon('chevronLeft')} Newer</button>
              <span>Page ${state.page + 1} of ${pages}</span>
              <button class="btn btn-sm" type="button" id="next" ${state.page + 1 >= pages ? html`disabled` : ''}>Older ${icon('chevronRight')}</button>
            </div>
          </div>`
      );
      results.querySelector('#prev').addEventListener('click', () => {
        state.page -= 1;
        load();
      });
      results.querySelector('#next').addEventListener('click', () => {
        state.page += 1;
        load();
      });
    }

    const refilter = () => {
      state.page = 0;
      load();
    };
    const syncInputs = () => {
      $('#f-group').value = state.group;
      $('#f-actor').value = state.actor;
      $('#f-q').value = state.q;
      $('#f-from').value = state.from;
      $('#f-to').value = state.to;
      fillActions();
    };

    $('#f-group').addEventListener('change', (e) => {
      state.group = e.target.value;
      fillActions();
      refilter();
    });
    $('#f-action').addEventListener('change', (e) => {
      state.action = e.target.value;
      refilter();
    });
    const typed = debounce(() => {
      state.actor = $('#f-actor').value.trim();
      state.q = $('#f-q').value.trim();
      refilter();
    }, 300);
    $('#f-actor').addEventListener('input', typed);
    $('#f-q').addEventListener('input', typed);
    $('#f-from').addEventListener('change', (e) => {
      state.from = e.target.value;
      refilter();
    });
    $('#f-to').addEventListener('change', (e) => {
      state.to = e.target.value;
      refilter();
    });
    const iso = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    container.querySelectorAll('[data-range]').forEach((chip) =>
      chip.addEventListener('click', () => {
        const days = chip.dataset.range;
        const today = new Date();
        state.from = days === '' ? '' : iso(new Date(today.getFullYear(), today.getMonth(), today.getDate() - Number(days)));
        state.to = days === '' ? '' : iso(today);
        syncInputs();
        refilter();
      })
    );
    $('#clear').addEventListener('click', () => {
      Object.assign(state, { group: '', action: '', actor: '', q: '', from: '', to: '' });
      syncInputs();
      refilter();
    });

    ctx.actions.querySelector('#refresh').addEventListener('click', load);
    ctx.actions.querySelector('#export').addEventListener('click', async (event) => {
      const button = event.currentTarget;
      button.disabled = true;
      try {
        const data = await api.activity(params({ limit: 5000, offset: 0 }));
        if (!data.entries.length) {
          toast('Nothing to export for these filters.', { error: true });
          return;
        }
        const stamp = new Date().toISOString().slice(0, 10);
        downloadFile(`eref-activity-${stamp}.csv`, toCsv(data.entries));
        toast(
          data.total > data.entries.length
            ? `Exported the newest ${data.entries.length.toLocaleString()} of ${data.total.toLocaleString()} events. Narrow the filters for the rest.`
            : `Exported ${plural(data.entries.length, 'event')}.`
        );
      } catch (error) {
        toast(error.message, { error: true });
      } finally {
        button.disabled = false;
      }
    });

    await load();
  },
};
