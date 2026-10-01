/** Overview: accounts by tier, datasets, activity over the last 14 days and the latest events. */

import { api } from '../api.js';
import { html, icon, mount, plural, timeAgo } from '../ui.js';
import { describeAction } from './activity.js';

const TIER_COLORS = { super_admin: 'var(--primary)', admin: 'var(--accent)', employee: 'var(--success)' };
const TIER_NAMES = { super_admin: ['Super Admin', 'Super Admins'], admin: ['Admin', 'Admins'], employee: ['Employee', 'Employees'] };

function stat({ label, value, sub, iconName, href }) {
  return html`<a class="stat" href="${href}">
    <div class="stat-top"><span class="stat-label">${label}</span><span class="stat-icon">${icon(iconName)}</span></div>
    <div class="stat-value">${value.toLocaleString()}</div>
    <div class="stat-sub">${sub}</div>
  </a>`;
}

function activityChart(days, width = 640) {
  const height = 180;
  const top = 12;
  const bottom = 24;
  const max = Math.max(4, ...days.map((d) => d.count));
  const step = width / days.length;
  const barWidth = Math.min(28, step * 0.62);
  const scale = (value) => ((height - top - bottom) * value) / max;
  const label = (day) => new Date(`${day}T12:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  const weekday = (day) => new Date(`${day}T12:00:00`).toLocaleDateString(undefined, { weekday: 'short' });
  const gridValues = [0, Math.round(max / 2), max];

  return html`<div class="chart">
    <svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Activity per day for the last ${days.length} days">
      ${gridValues.map((value) => {
        const y = height - bottom - scale(value);
        return html`<line class="gridline" x1="0" x2="${width}" y1="${y}" y2="${y}" />`;
      })}
      ${days.map((d, i) => {
        const h = Math.max(d.count ? 3 : 1, scale(d.count));
        const x = i * step + (step - barWidth) / 2;
        const y = height - bottom - h;
        const today = i === days.length - 1;
        return html`<rect class="bar-hit" x="${i * step}" y="0" width="${step}" height="${height - bottom}" fill="transparent"
            data-tip="${label(d.day)}: ${plural(d.count, 'event')}" data-x="${(i + 0.5) / days.length}" data-y="${y / height}" />
          <rect class="bar${today ? ' today' : ''}" x="${x}" y="${y}" width="${barWidth}" height="${h}" rx="5" />
          ${i % 2 === days.length % 2 || today
            ? html`<text class="axis" x="${i * step + step / 2}" y="${height - 6}" text-anchor="middle">${today ? 'Today' : weekday(d.day)}</text>`
            : ''}`;
      })}
    </svg>
    <div class="chart-tip" id="chart-tip"></div>
  </div>`;
}

function wireChart(container) {
  const chart = container.querySelector('.chart');
  if (!chart) return;
  const tip = chart.querySelector('#chart-tip');
  chart.querySelectorAll('.bar-hit').forEach((hit) => {
    hit.addEventListener('mouseenter', () => {
      tip.textContent = hit.dataset.tip;
      tip.style.left = `${Number(hit.dataset.x) * 100}%`;
      tip.style.top = `${Number(hit.dataset.y) * 100}%`;
      tip.classList.add('show');
    });
    hit.addEventListener('mouseleave', () => tip.classList.remove('show'));
  });
}

export default {
  title: 'Overview',
  subtitle: 'Everything happening across E-REF: accounts in each tier, the datasets the app uses, and recent activity.',

  async render(container, ctx) {
    mount(container, html`<div class="grid stats">${[1, 2, 3, 4].map(() => html`<div class="skeleton"></div>`)}</div><div class="skeleton" style="min-height:260px"></div>`);
    mount(ctx.actions, html`<button class="btn" type="button" id="refresh">${icon('refresh')} Refresh</button>`);
    ctx.actions.querySelector('#refresh').addEventListener('click', () => this.render(container, ctx));

    const data = await api.overview();
    const { users } = data;
    const weekTotal = data.activityByDay.slice(-7).reduce((sum, d) => sum + d.count, 0);
    // The chart card spans the page on narrow screens and ~60% of it on wide ones.
    const pageWidth = container.clientWidth || 640;
    const chartWidth = Math.round(Math.max(280, pageWidth > 1100 ? pageWidth * 0.6 - 36 : pageWidth - 36));

    mount(
      container,
      html`<div class="grid stats">
          ${stat({ label: 'Accounts', value: users.total, sub: `${users.activeThisWeek} signed in this week${users.disabled ? ` · ${users.disabled} disabled` : ''}`, iconName: 'users', href: '#/users' })}
          ${stat({ label: 'Food categories', value: data.categories, sub: `${plural(data.customFoods, 'food')} added or corrected by admins`, iconName: 'tag', href: '#/categories' })}
          ${stat({ label: 'Recipes', value: data.recipes, sub: 'Used by content-based recommendation', iconName: 'book', href: '#/recipes' })}
          ${stat({ label: 'Inventory items', value: data.items, sub: 'Saved across all accounts', iconName: 'box', href: '#/users' })}
        </div>

        <div class="grid overview-grid">
          <section class="card">
            <div class="card-head">
              <h2 class="section-title">Activity, last 14 days</h2>
              <span class="badge">${plural(weekTotal, 'event')} this week</span>
            </div>
            ${activityChart(data.activityByDay, chartWidth)}
          </section>

          <section class="card">
            <div class="card-head">
              <h2 class="section-title">Accounts by tier</h2>
              <a class="btn btn-sm" href="#/users">Manage</a>
            </div>
            <div class="tier-bar" aria-hidden="true">
              ${Object.entries(users.byRole)
                .filter(([, n]) => n)
                .map(([role, n]) => html`<span style="flex:${n};background:${TIER_COLORS[role]}"></span>`)}
            </div>
            <div class="legend">
              ${Object.entries(users.byRole).map(
                ([role, n]) => html`<span><i style="background:${TIER_COLORS[role]}"></i><b>${n}</b> ${TIER_NAMES[role][n === 1 ? 0 : 1]}</span>`
              )}
            </div>
            <h2 class="section-title" style="margin:22px 0 6px">Most-stocked foods</h2>
            ${data.topFoods.length
              ? html`<div class="list">
                  ${data.topFoods.map(
                    (food, i) => html`<div class="list-row">
                      <span class="rank">${i + 1}</span>
                      <div class="grow">
                        <div class="title">${food.name}</div>
                        <div class="meter"><span style="width:${(food.count / data.topFoods[0].count) * 100}%"></span></div>
                      </div>
                      <span class="muted">${plural(food.count, 'item')}</span>
                    </div>`
                  )}
                </div>`
              : html`<p class="muted">No one has saved food yet.</p>`}
          </section>
        </div>

        <section class="card" style="margin-top:16px">
          <div class="card-head">
            <h2 class="section-title">Latest activity</h2>
            <a class="btn btn-sm" href="#/activity">View all</a>
          </div>
          ${data.recentActivity.length
            ? html`<div class="list">
                ${data.recentActivity.map((entry) => {
                  const action = describeAction(entry.action);
                  return html`<div class="list-row">
                    <span class="action-dot tone-${action.tone}">${icon(action.icon)}</span>
                    <div class="grow">
                      <div class="title">${entry.actor_name || entry.actor_email || 'Someone'} · ${action.label.toLowerCase()}</div>
                      <div class="sub">${entry.target || ''}</div>
                    </div>
                    <span class="muted" title="${new Date(entry.at * 1000).toLocaleString()}">${timeAgo(entry.at)}</span>
                  </div>`;
                })}
              </div>`
            : html`<p class="muted">Nothing has happened yet.</p>`}
        </section>`
    );
    wireChart(container);
  },
};
