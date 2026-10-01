/**
 * E-REF Super Admin console: sign-in, the navigation shell, routing and appearance.
 *
 * Every page lives in js/views/ and exports { title, subtitle, render(container, ctx) }.
 * The server enforces the Super Admin tier on every /super call; the checks here only
 * decide what to show.
 */

import { ApiError, api, clearSession, getApiUrl, getSession, saveSession, setApiUrl, setUnauthorizedHandler, updateSessionUser } from './api.js';
import { html, icon, initials, mount, openModal, roleLabel, toast } from './ui.js';
import overview from './views/overview.js';
import users from './views/users.js';
import categories from './views/categories.js';
import recipes from './views/recipes.js';
import activity from './views/activity.js';

const ROUTES = { overview, users, categories, recipes, activity };
const NAV = [
  { route: 'overview', label: 'Overview', icon: 'dashboard' },
  { route: 'users', label: 'User Accounts', icon: 'users' },
  { route: 'categories', label: 'Food Categories', icon: 'tag' },
  { route: 'recipes', label: 'Recipe Dataset', icon: 'book' },
  { route: 'activity', label: 'Activity Logs', icon: 'activity' },
];

const root = document.getElementById('app');
const state = { user: null, cleanup: null };

// ---------------------------------------------------------------- appearance
const THEMES = [
  { id: 'system', label: 'Auto', icon: 'monitor' },
  { id: 'light', label: 'Light', icon: 'sun' },
  { id: 'dark', label: 'Dark', icon: 'moon' },
];

function currentTheme() {
  return document.documentElement.dataset.theme || 'system';
}

function setTheme(theme) {
  document.documentElement.dataset.theme = theme;
  try {
    localStorage.setItem('eref.theme', theme);
  } catch {
    // Remembering the choice is a convenience.
  }
}

function themeControl() {
  return html`<div class="segmented" role="group" aria-label="Appearance">
    ${THEMES.map(
      (t) => html`<button type="button" data-theme-choice="${t.id}" aria-pressed="${currentTheme() === t.id}" title="${t.label} appearance">
        ${icon(t.icon)}<span>${t.label}</span>
      </button>`
    )}
  </div>`;
}

function wireTheme(scope) {
  scope.querySelectorAll('[data-theme-choice]').forEach((button) =>
    button.addEventListener('click', () => {
      setTheme(button.dataset.themeChoice);
      scope.querySelectorAll('[data-theme-choice]').forEach((b) => b.setAttribute('aria-pressed', String(b === button)));
    })
  );
}

// -------------------------------------------------------------------- sign in
function showLogin(message) {
  state.cleanup?.();
  state.cleanup = null;
  document.title = 'Sign in · E-REF Super Admin';
  mount(
    root,
    html`<main class="login">
      <section class="login-card" aria-labelledby="login-title">
        <img class="login-logo" src="img/logo.png" alt="E-REF logo" width="116" height="116" />
        <h1 id="login-title">Super Admin Console</h1>
        <p class="lede">Manage accounts, food categories, recipes and activity for every E-REF user.</p>
        <form id="login-form" novalidate>
          ${message ? html`<div class="alert ${message.info ? 'info' : ''}" role="alert">${icon(message.info ? 'shield' : 'alert')}<span>${message.text}</span></div>` : ''}
          <div class="field">
            <label for="email">Email</label>
            <input class="input" id="email" name="email" type="email" autocomplete="username" required placeholder="you@example.com" />
          </div>
          <div class="field">
            <label for="password">Password</label>
            <div class="input-group">
              <input class="input" id="password" name="password" type="password" autocomplete="current-password" required style="padding-left:14px;padding-right:44px" />
              <button type="button" class="icon-btn input-action" id="toggle-password" aria-label="Show password">${icon('eye')}</button>
            </div>
          </div>
          <div class="row">
            <label class="checkbox"><input type="checkbox" name="remember" checked /> Keep me signed in on this computer</label>
          </div>
          <button class="btn btn-primary" type="submit" id="login-submit">${icon('login')} Sign in</button>
          <details>
            <summary>Server: <span id="server-label">${getApiUrl()}</span></summary>
            <div class="field">
              <label for="server">E-REF server address</label>
              <input class="input" id="server" name="server" value="${getApiUrl()}" placeholder="192.168.1.5:8000" />
              <span class="field-hint">The same server the app connects to. An IP address alone uses port 8000.</span>
            </div>
          </details>
        </form>
        <div class="login-foot">${themeControl()}</div>
      </section>
    </main>`
  );
  wireTheme(root);

  const form = root.querySelector('#login-form');
  const password = form.querySelector('#password');
  form.querySelector('#toggle-password').addEventListener('click', (event) => {
    const showing = password.type === 'text';
    password.type = showing ? 'password' : 'text';
    mount(event.currentTarget, icon(showing ? 'eye' : 'eyeOff'));
    event.currentTarget.setAttribute('aria-label', showing ? 'Show password' : 'Hide password');
  });
  form.querySelector('#server').addEventListener('change', (event) => {
    try {
      root.querySelector('#server-label').textContent = setApiUrl(event.target.value);
    } catch {
      toast('That server address is not valid.', { error: true });
    }
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const data = new FormData(form);
    const email = String(data.get('email') || '').trim();
    const pass = String(data.get('password') || '');
    if (!email || !pass) {
      showLogin({ text: 'Enter your email and password.' });
      return;
    }
    const submit = form.querySelector('#login-submit');
    submit.disabled = true;
    mount(submit, html`<span class="spinner" aria-hidden="true"></span> Signing in…`);
    try {
      const session = await api.login(email, pass);
      if (session.user.role !== 'super_admin') {
        showLogin({
          text: `This console is for Super Admins. ${session.user.name} is signed up as ${
            session.user.role === 'admin' ? 'an Admin' : 'an Employee'
          }; use the E-REF app instead.`,
          info: true,
        });
        return;
      }
      saveSession(session, data.get('remember') === 'on');
      state.user = session.user;
      showShell();
    } catch (error) {
      showLogin({ text: error.message });
      root.querySelector('#email').value = email;
    }
  });
  (root.querySelector('#email').value ? password : root.querySelector('#email')).focus();
}

function signOut(message) {
  clearSession();
  state.user = null;
  if (location.hash) history.replaceState(null, '', location.pathname);
  showLogin(message);
}

// ---------------------------------------------------------------------- shell
function routeName() {
  const name = location.hash.replace(/^#\/?/, '').split('?')[0];
  return ROUTES[name] ? name : 'overview';
}

function showShell() {
  const user = state.user;
  mount(
    root,
    html`<div class="shell" id="shell">
      <aside class="sidebar" id="sidebar" aria-label="Main navigation">
        <div class="brand">
          <img src="img/logo.png" alt="" width="44" height="44" />
          <div><strong>E-REF</strong><span>Super Admin Console</span></div>
        </div>
        <div class="nav-label">Manage</div>
        <nav class="nav">
          ${NAV.map((item) => html`<a href="#/${item.route}" data-route="${item.route}">${icon(item.icon)}<span>${item.label}</span></a>`)}
        </nav>
        <div class="sidebar-foot">
          <div class="me">
            <span class="avatar">${initials(user.name)}</span>
            <div>
              <strong>${user.name}</strong>
              <span>${user.email}</span>
            </div>
          </div>
          ${themeControl()}
          <div style="display:flex;gap:8px">
            <button class="btn btn-sm" type="button" id="change-password" style="flex:1">${icon('key')} Password</button>
            <button class="btn btn-sm" type="button" id="sign-out" style="flex:1">${icon('logout')} Sign out</button>
          </div>
        </div>
      </aside>
      <div class="scrim" id="scrim"></div>
      <div class="content">
        <header class="topbar">
          <button class="icon-btn" type="button" id="open-nav" aria-label="Open menu" aria-controls="sidebar" aria-expanded="false">${icon('menu')}</button>
          <img src="img/logo.png" alt="" />
          <strong>E-REF</strong>
          <span class="badge badge-super_admin" style="margin-left:auto">${roleLabel(user.role)}</span>
        </header>
        <main class="main" id="main" tabindex="-1"></main>
      </div>
    </div>`
  );

  const shell = root.querySelector('#shell');
  const toggleNav = (open) => {
    shell.classList.toggle('nav-open', open);
    root.querySelector('#open-nav').setAttribute('aria-expanded', String(open));
  };
  root.querySelector('#open-nav').addEventListener('click', () => toggleNav(true));
  root.querySelector('#scrim').addEventListener('click', () => toggleNav(false));
  root.querySelectorAll('.nav a').forEach((link) => link.addEventListener('click', () => toggleNav(false)));
  root.querySelector('#sign-out').addEventListener('click', () => signOut({ text: 'You have signed out.', info: true }));
  root.querySelector('#change-password').addEventListener('click', changeOwnPassword);
  wireTheme(root.querySelector('.sidebar-foot'));

  renderRoute();
}

async function renderRoute() {
  const main = document.getElementById('main');
  if (!main || !state.user) return;
  const name = routeName();
  const view = ROUTES[name];

  state.cleanup?.();
  state.cleanup = null;
  root.querySelectorAll('.nav a').forEach((link) => {
    if (link.dataset.route === name) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  });
  document.title = `${view.title} · E-REF Super Admin`;

  mount(
    main,
    html`<div class="page-head">
        <div>
          <h1>${view.title}</h1>
          <p>${view.subtitle}</p>
        </div>
        <div class="page-actions" id="page-actions"></div>
      </div>
      <div id="view"></div>`
  );
  main.scrollTop = 0;
  window.scrollTo(0, 0);

  const container = main.querySelector('#view');
  const ctx = {
    user: state.user,
    actions: main.querySelector('#page-actions'),
    navigate: (route) => {
      location.hash = `#/${route}`;
    },
  };
  try {
    state.cleanup = (await view.render(container, ctx)) || null;
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) return;
    mount(
      container,
      html`<div class="card"><div class="alert" role="alert">${icon('alert')}<span>${error.message || 'This page could not be loaded.'}</span></div>
        <div style="margin-top:12px"><button class="btn" type="button" id="retry">${icon('refresh')} Try again</button></div></div>`
    );
    container.querySelector('#retry').addEventListener('click', renderRoute);
  }
}

function changeOwnPassword() {
  openModal({
    title: 'Change your password',
    subtitle: 'You stay signed in here. Use at least 8 characters.',
    submitLabel: 'Change password',
    body: html`<div class="field">
        <label for="current">Current password</label>
        <input class="input" id="current" name="current" type="password" autocomplete="current-password" required />
      </div>
      <div class="field">
        <label for="next">New password</label>
        <input class="input" id="next" name="next" type="password" autocomplete="new-password" minlength="8" required />
      </div>
      <div class="field">
        <label for="confirm">Confirm new password</label>
        <input class="input" id="confirm" name="confirm" type="password" autocomplete="new-password" required />
      </div>`,
    onSubmit: async (form) => {
      const data = new FormData(form);
      const next = String(data.get('next'));
      if (next.length < 8) throw new Error('Password must be at least 8 characters.');
      if (next !== data.get('confirm')) throw new Error('The new passwords do not match.');
      await api.changePassword(String(data.get('current')), next);
      toast('Your password was changed.');
    },
  });
}

// ----------------------------------------------------------------------- boot
setUnauthorizedHandler((error) => signOut({ text: error.message || 'Your session has ended. Please sign in again.' }));
window.addEventListener('hashchange', renderRoute);

async function boot() {
  const session = getSession();
  if (!session) {
    showLogin();
    return;
  }
  // Show the console straight away from the saved profile, then confirm it with the server.
  state.user = session.user;
  if (state.user?.role === 'super_admin') showShell();
  try {
    const { user } = await api.me();
    if (user.role !== 'super_admin') {
      signOut({ text: 'Your account no longer has Super Admin access.' });
      return;
    }
    const changed = JSON.stringify(user) !== JSON.stringify(state.user);
    state.user = user;
    updateSessionUser(user);
    if (changed) showShell();
  } catch (error) {
    if (error.status === 401) return; // Already signed out by the handler.
    if (root.querySelector('#shell')) toast(error.message, { error: true });
    else showLogin({ text: error.message });
  }
}

boot();
