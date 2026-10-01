/** Food Categories: the groups the app files food under (Shelf tabs, manual entry, the food database). */

import { api } from '../api.js';
import { confirmDialog, emptyState, html, icon, mount, openModal, plural, toast } from '../ui.js';

// The app's own tones first, so new categories sit comfortably next to the built-in ones.
const PALETTE = ['#6F9B72', '#D6A85F', '#C95C54', '#B86B4B', '#5C4033', '#D89B3D', '#7A8B99', '#8C6BA8', '#4E8F8B', '#A0522D'];

function colorPicker(selected) {
  const custom = !PALETTE.includes(selected.toUpperCase());
  return html`<div class="field">
    <span class="field-label">Colour</span>
    <div class="swatches" role="radiogroup" aria-label="Colour">
      ${PALETTE.map(
        (color) => html`<button type="button" style="background:${color}" data-color="${color}" aria-pressed="${color === selected.toUpperCase()}" aria-label="${color}" title="${color}"></button>`
      )}
      <input type="color" name="custom" value="${selected}" aria-label="Custom colour" title="Custom colour" ${custom ? html`data-active` : ''} />
      <input type="hidden" name="color" value="${selected.toUpperCase()}" />
    </div>
    <span class="field-hint">Shown on this console; the app keeps its own look for each category.</span>
  </div>`;
}

function wireColorPicker(form) {
  const hidden = form.querySelector('input[name=color]');
  const custom = form.querySelector('input[name=custom]');
  const buttons = form.querySelectorAll('[data-color]');
  const choose = (color) => {
    hidden.value = color.toUpperCase();
    buttons.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.color === hidden.value)));
  };
  buttons.forEach((button) => button.addEventListener('click', () => choose(button.dataset.color)));
  custom.addEventListener('input', () => choose(custom.value));
}

function categoryForm(category) {
  const builtin = category?.builtin;
  return html`<div class="field">
      <label for="name">Name</label>
      <input class="input" id="name" name="name" maxlength="40" required value="${category?.name || ''}" ${builtin ? html`readonly aria-describedby="name-hint"` : ''} placeholder="e.g. Grains" />
      ${builtin
        ? html`<span class="field-hint" id="name-hint">Built-in categories keep their names: the app’s bundled foods are filed under them.</span>`
        : html`<span class="field-hint">Letters, digits, spaces, &amp;, ' or -. Renaming moves every food in it along.</span>`}
    </div>
    <div class="field">
      <label for="description">Description</label>
      <textarea class="textarea" id="description" name="description" maxlength="200" placeholder="What belongs here?">${category?.description || ''}</textarea>
    </div>
    ${colorPicker(category?.color || PALETTE[0])}`;
}

export default {
  title: 'Food Categories',
  subtitle: 'The groups food is filed under in the app — the Shelf tabs, manual entry and the food database. Changes reach every phone on its next refresh.',

  async render(container, ctx) {
    mount(container, html`<div class="grid category-grid">${[1, 2, 3, 4].map(() => html`<div class="skeleton" style="min-height:180px"></div>`)}</div>`);
    mount(ctx.actions, html`<button class="btn btn-primary" type="button" id="add-category">${icon('plus')} Add category</button>`);
    ctx.actions.querySelector('#add-category').addEventListener('click', () => edit(null));

    let categories = [];

    const load = async () => {
      categories = (await api.categories()).categories;
      draw();
    };

    function draw() {
      const totalFoods = categories.reduce((sum, c) => sum + c.foods.length, 0);
      mount(
        container,
        html`<div class="toolbar">
            <span class="badge">${plural(categories.length, 'category', 'categories')}</span>
            <span class="badge badge-muted">${plural(totalFoods, 'food')} filed</span>
            <span class="spacer"></span>
            <span class="muted" style="font-size:12px;display:inline-flex;gap:6px;align-items:center">
              <span class="food-chip">Bundled</span><span class="food-chip added">Added by an admin</span>
            </span>
          </div>
          ${categories.length
            ? html`<div class="grid category-grid">
                ${categories.map(
                  (c) => html`<article class="card category" style="--swatch:${c.color}">
                    <div class="category-head">
                      <span class="swatch">${icon('tag')}</span>
                      <div class="grow">
                        <h3>${c.name}</h3>
                        <span class="muted" style="font-size:12px">${plural(c.foods.length, 'food')}</span>
                      </div>
                      ${c.builtin ? html`<span class="badge badge-muted" title="Used by the app's bundled foods">${icon('shield', 'icon')} Built-in</span>` : ''}
                    </div>
                    <p class="muted">${c.description || 'No description yet.'}</p>
                    <div class="food-chips">
                      ${c.foods.length
                        ? c.foods.map((f) => html`<span class="food-chip ${f.source !== 'bundled' ? 'added' : ''}" title="${f.id} · ${f.source}">${f.name}</span>`)
                        : html`<span class="muted" style="font-size:12px">No foods yet. Admins can file foods here from the app’s Admin screen.</span>`}
                    </div>
                    <div class="recipe-foot">
                      <span class="muted" style="font-size:12px">${c.builtin ? 'Cannot be removed' : c.foods.length ? 'Move its foods out to remove it' : 'Unused'}</span>
                      <div>
                        <button class="icon-btn" type="button" data-edit="${c.name}" title="Edit" aria-label="Edit ${c.name}">${icon('edit')}</button>
                        <button class="icon-btn danger" type="button" data-delete="${c.name}" title="${c.builtin ? 'Built-in categories cannot be removed' : 'Remove'}" aria-label="Remove ${c.name}" ${c.builtin || c.foods.length ? html`disabled` : ''}>${icon('trash')}</button>
                      </div>
                    </div>
                  </article>`
                )}
              </div>`
            : emptyState('tag', 'No categories', 'Add one to get started.')}`
      );
      container.querySelectorAll('[data-edit]').forEach((b) => b.addEventListener('click', () => edit(categories.find((c) => c.name === b.dataset.edit))));
      container.querySelectorAll('[data-delete]').forEach((b) => b.addEventListener('click', () => remove(categories.find((c) => c.name === b.dataset.delete))));
    }

    async function edit(category) {
      const saved = await openModal({
        title: category ? `Edit ${category.name}` : 'Add a category',
        subtitle: category ? null : 'It appears as a tab on every phone’s Shelf and as a choice when adding food.',
        submitLabel: category ? 'Save changes' : 'Add category',
        body: categoryForm(category),
        onOpen: wireColorPicker,
        onSubmit: async (form) => {
          const data = new FormData(form);
          const body = {
            name: String(data.get('name')).trim(),
            description: String(data.get('description')).trim(),
            color: String(data.get('color')),
          };
          const result = category ? await api.updateCategory(category.name, body) : await api.createCategory(body);
          return result.category;
        },
      });
      if (saved) {
        toast(category ? `${saved.name} was updated.` : `${saved.name} was added.`);
        await load();
      }
    }

    async function remove(category) {
      const ok = await confirmDialog({
        title: `Remove ${category.name}?`,
        message: 'Phones stop showing this tab on their next refresh. No food is filed under it.',
        confirmLabel: 'Remove category',
        onConfirm: () => api.deleteCategory(category.name),
      });
      if (ok) {
        toast(`${category.name} was removed.`);
        await load();
      }
    }

    await load();
  },
};
