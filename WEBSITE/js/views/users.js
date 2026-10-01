/** User Accounts: every account in every tier; create, edit, change tier, disable, reset password, delete. */

import { api } from '../api.js';
import {
  confirmDialog,
  debounce,
  emptyState,
  formatDate,
  generatePassword,
  html,
  icon,
  initials,
  mount,
  openModal,
  plural,
  roleBadge,
  timeAgo,
  toast,
} from '../ui.js';

const TIERS = [
  { id: 'super_admin', label: 'Super Admin', help: 'Uses this web console: accounts, categories, recipes, logs.' },
  { id: 'admin', label: 'Admin', help: 'Edits the food database from the app’s Admin screen.' },
  { id: 'employee', label: 'Employee', help: 'Uses the app: scanning, shelf, alerts and recipes.' },
];

const FILTERS = [
  { id: 'all', label: 'All', test: () => true },
  { id: 'super_admin', label: 'Super Admins', test: (u) => u.role === 'super_admin' },
  { id: 'admin', label: 'Admins', test: (u) => u.role === 'admin' },
  { id: 'employee', label: 'Employees', test: (u) => u.role === 'employee' },
  { id: 'disabled', label: 'Disabled', test: (u) => u.disabled },
];

function tierOptions(selected, { disabled = false } = {}) {
  return html`<div class="tier-options" role="radiogroup" aria-label="Tier">
    ${TIERS.map(
      (tier) => html`<label class="tier-option">
        <input type="radio" name="role" value="${tier.id}" ${selected === tier.id ? html`checked` : ''} ${disabled ? html`disabled` : ''} />
        <strong>${tier.label}</strong>
        <span>${tier.help}</span>
      </label>`
    )}
  </div>`;
}

function passwordField({ label = 'Temporary password', name = 'password' } = {}) {
  return html`<div class="field">
    <label for="${name}">${label}</label>
    <div class="input-group">
      <input class="input mono" id="${name}" name="${name}" type="text" autocomplete="new-password" minlength="8" required
        style="padding-left:14px;padding-right:88px;font-size:14px" value="${generatePassword()}" />
      <div class="input-action" style="display:flex;gap:2px">
        <button type="button" class="icon-btn" data-generate title="Generate another" aria-label="Generate another password">${icon('refresh')}</button>
        <button type="button" class="icon-btn" data-copy title="Copy" aria-label="Copy password">${icon('copy')}</button>
      </div>
    </div>
    <span class="field-hint">At least 8 characters. Share it privately; they can change it in the app under Profile → Change password.</span>
  </div>`;
}

function wirePasswordField(form) {
  const input = form.querySelector('input[name=password]');
  form.querySelector('[data-generate]').addEventListener('click', () => {
    input.value = generatePassword();
    input.focus();
  });
  form.querySelector('[data-copy]').addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(input.value);
      toast('Password copied.');
    } catch {
      input.select();
    }
  });
}

export default {
  title: 'User Accounts',
  subtitle: 'Every account across all tiers. Create accounts, change tiers, reset passwords, and disable or delete access.',

  async render(container, ctx) {
    const state = { users: [], filter: 'all', query: '' };
    mount(container, html`<div class="skeleton" style="min-height:320px"></div>`);
    mount(ctx.actions, html`<button class="btn btn-primary" type="button" id="add-user">${icon('plus')} Add account</button>`);
    ctx.actions.querySelector('#add-user').addEventListener('click', () => createUser());

    const load = async () => {
      state.users = (await api.users()).users;
      draw();
    };

    const visible = () => {
      const filter = FILTERS.find((f) => f.id === state.filter);
      const q = state.query.toLowerCase();
      return state.users.filter((u) => filter.test(u) && (!q || `${u.name} ${u.email}`.toLowerCase().includes(q)));
    };

    function draw() {
      const rows = visible();
      mount(
        container,
        html`<div class="toolbar">
            <div class="input-group">
              ${icon('search')}
              <input class="input" type="search" id="user-search" placeholder="Search by name or email" value="${state.query}" aria-label="Search accounts" />
            </div>
            <div class="chips" role="group" aria-label="Filter by tier">
              ${FILTERS.map(
                (f) => html`<button type="button" class="chip" data-filter="${f.id}" aria-pressed="${state.filter === f.id}">
                  ${f.label} <span class="count">${state.users.filter(f.test).length}</span>
                </button>`
              )}
            </div>
          </div>
          <div class="table-card">
            ${rows.length
              ? html`<div class="table-wrap"><table class="table">
                  <thead><tr>
                    <th scope="col">Account</th><th scope="col">Tier</th><th scope="col">Status</th>
                    <th scope="col" class="num">Items</th><th scope="col">Joined</th><th scope="col">Last sign-in</th>
                    <th scope="col" class="actions"><span class="visually-hidden">Actions</span></th>
                  </tr></thead>
                  <tbody>${rows.map((u) => row(u, ctx.user))}</tbody>
                </table></div>
                <div class="table-foot"><span>Showing ${plural(rows.length, 'account')} of ${state.users.length}</span></div>`
              : emptyState('users', 'No accounts match', state.query ? 'Try a different name or email.' : 'Nobody is in this group yet.')}
          </div>`
      );

      const search = container.querySelector('#user-search');
      search.addEventListener(
        'input',
        debounce(() => {
          state.query = search.value.trim();
          draw();
          const again = container.querySelector('#user-search');
          again.focus();
          again.setSelectionRange(again.value.length, again.value.length);
        }, 180)
      );
      container.querySelectorAll('[data-filter]').forEach((chip) =>
        chip.addEventListener('click', () => {
          state.filter = chip.dataset.filter;
          draw();
        })
      );
      container.querySelectorAll('[data-act]').forEach((button) =>
        button.addEventListener('click', () => {
          const user = state.users.find((u) => String(u.id) === button.dataset.id);
          ({ edit: editUser, password: resetPassword, toggle: toggleDisabled, delete: deleteUser })[button.dataset.act](user);
        })
      );
    }

    function row(u, me) {
      const self = u.id === me.id;
      const viaEnv = u.role !== u.storedRole && u.role === 'admin';
      return html`<tr class="${u.disabled ? 'is-disabled' : ''}">
        <td>
          <div class="person">
            <span class="avatar">${initials(u.name)}</span>
            <div>
              <strong>${u.name} ${self ? html`<span class="badge badge-muted">You</span>` : ''}</strong>
              <div class="sub">${u.email}</div>
            </div>
          </div>
        </td>
        <td>${roleBadge(u.role)}${viaEnv ? html`<div class="sub muted" title="Listed in EREF_ADMIN_EMAILS on the server">via server setting</div>` : ''}</td>
        <td>${u.disabled ? html`<span class="badge badge-danger"><span class="dot"></span>Disabled</span>` : html`<span class="badge badge-success"><span class="dot"></span>Active</span>`}</td>
        <td class="num">${u.items.toLocaleString()}</td>
        <td title="${new Date(u.createdAt * 1000).toLocaleString()}">${formatDate(u.createdAt)}</td>
        <td title="${u.lastLoginAt ? new Date(u.lastLoginAt * 1000).toLocaleString() : ''}">${timeAgo(u.lastLoginAt)}</td>
        <td class="actions">
          <button class="icon-btn" type="button" data-act="edit" data-id="${u.id}" title="Edit" aria-label="Edit ${u.name}">${icon('edit')}</button>
          <button class="icon-btn" type="button" data-act="password" data-id="${u.id}" title="${self ? 'Use “Password” in the sidebar' : 'Set a new password'}" aria-label="Set a new password for ${u.name}" ${self ? html`disabled` : ''}>${icon('key')}</button>
          <button class="icon-btn ${u.disabled ? '' : 'danger'}" type="button" data-act="toggle" data-id="${u.id}" title="${self ? 'You cannot disable yourself' : u.disabled ? 'Enable' : 'Disable'}" aria-label="${u.disabled ? 'Enable' : 'Disable'} ${u.name}" ${self ? html`disabled` : ''}>${icon(u.disabled ? 'checkCircle' : 'ban')}</button>
          <button class="icon-btn danger" type="button" data-act="delete" data-id="${u.id}" title="${self ? 'You cannot delete yourself' : 'Delete'}" aria-label="Delete ${u.name}" ${self ? html`disabled` : ''}>${icon('trash')}</button>
        </td>
      </tr>`;
    }

    async function createUser() {
      const created = await openModal({
        title: 'Add an account',
        subtitle: 'They can sign in to the app (or this console, for a Super Admin) straight away.',
        submitLabel: 'Create account',
        wide: true,
        body: html`<div class="form-row">
            <div class="field"><label for="name">Full name</label><input class="input" id="name" name="name" maxlength="60" required autocomplete="off" /></div>
            <div class="field"><label for="email">Email</label><input class="input" id="email" name="email" type="email" maxlength="254" required autocomplete="off" /></div>
          </div>
          <div class="field"><span class="field-label">Tier</span>${tierOptions('employee')}</div>
          ${passwordField()}`,
        onOpen: wirePasswordField,
        onSubmit: async (form) => {
          const data = new FormData(form);
          const { user } = await api.createUser({
            name: String(data.get('name')).trim(),
            email: String(data.get('email')).trim(),
            password: String(data.get('password')),
            role: data.get('role'),
          });
          return user;
        },
      });
      if (created) {
        toast(`${created.name}'s account was created.`);
        await load();
      }
    }

    async function editUser(user) {
      const self = user.id === ctx.user.id;
      const updated = await openModal({
        title: `Edit ${user.name}`,
        subtitle: self ? 'You can change your own name and email; another Super Admin must change your tier.' : `Account #${user.id} · joined ${formatDate(user.createdAt)}`,
        wide: true,
        body: html`<div class="form-row">
            <div class="field"><label for="name">Full name</label><input class="input" id="name" name="name" maxlength="60" required value="${user.name}" /></div>
            <div class="field"><label for="email">Email</label><input class="input" id="email" name="email" type="email" maxlength="254" required value="${user.email}" /></div>
          </div>
          <div class="field"><span class="field-label">Tier</span>${tierOptions(user.storedRole, { disabled: self })}</div>`,
        onSubmit: async (form) => {
          const data = new FormData(form);
          const body = { name: String(data.get('name')).trim(), email: String(data.get('email')).trim() };
          if (!self) body.role = data.get('role');
          return (await api.updateUser(user.id, body)).user;
        },
      });
      if (updated) {
        toast('Changes saved.');
        await load();
      }
    }

    async function resetPassword(user) {
      const done = await openModal({
        title: `New password for ${user.name}`,
        subtitle: 'Their current password stops working immediately.',
        submitLabel: 'Set password',
        body: passwordField({ label: 'New password' }),
        onOpen: wirePasswordField,
        onSubmit: async (form) => {
          await api.setPassword(user.id, String(new FormData(form).get('password')));
        },
      });
      if (done) toast(`${user.name}'s password was changed.`);
    }

    async function toggleDisabled(user) {
      const enabling = user.disabled;
      const ok = await confirmDialog({
        title: enabling ? `Enable ${user.name}?` : `Disable ${user.name}?`,
        message: enabling
          ? 'They will be able to sign in again. Their inventory was kept.'
          : 'They are signed out everywhere and cannot sign in until you enable the account again. Nothing is deleted.',
        confirmLabel: enabling ? 'Enable account' : 'Disable account',
        danger: !enabling,
        onConfirm: () => api.updateUser(user.id, { disabled: !enabling }),
      });
      if (ok) {
        toast(enabling ? `${user.name} can sign in again.` : `${user.name} was disabled.`);
        await load();
      }
    }

    async function deleteUser(user) {
      const ok = await confirmDialog({
        title: `Delete ${user.name}?`,
        message: `${user.email} and ${plural(user.items, 'inventory item')} will be removed permanently. The activity log keeps a record that it happened. To keep their data, disable the account instead.`,
        confirmLabel: 'Delete permanently',
        onConfirm: () => api.deleteUser(user.id),
      });
      if (ok) {
        toast(`${user.name}'s account was deleted.`);
        await load();
      }
    }

    await load();
  },
};
