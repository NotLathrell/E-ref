/**
 * Recipe Dataset: the recipes the app's content-based recommender ranks.
 *
 * Each recipe is described by the foods it needs (required ingredients), foods that
 * improve it (optional) and how it is cooked (tags). The recommender builds TF-IDF
 * vectors from exactly these fields, so they are what this page edits.
 */

import { api } from '../api.js';
import { confirmDialog, debounce, emptyState, html, icon, mount, openModal, plural, toast } from '../ui.js';

const slug = (text) =>
  String(text)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);

function recipeCard(recipe, foodName) {
  return html`<article class="card recipe">
    <div class="recipe-head">
      <div class="grow">
        <h3>${recipe.name}</h3>
        <span class="mono muted">${recipe.id}</span>
      </div>
      <span class="minutes">${icon('clock')} ${recipe.minutes} min</span>
    </div>
    ${recipe.summary ? html`<p class="summary">${recipe.summary}</p>` : ''}
    <div class="recipe-meta">
      ${recipe.ingredients.map((id) => html`<span class="ing" title="Required">${foodName(id)}</span>`)}
      ${(recipe.optional || []).map((id) => html`<span class="ing optional" title="Optional">+ ${foodName(id)}</span>`)}
    </div>
    <div class="recipe-foot">
      <div class="recipe-meta">${(recipe.tags || []).map((t) => html`<span class="tag">#${t}</span>`)}</div>
      <div style="white-space:nowrap">
        <button class="icon-btn" type="button" data-edit="${recipe.id}" title="Edit" aria-label="Edit ${recipe.name}">${icon('edit')}</button>
        <button class="icon-btn danger" type="button" data-delete="${recipe.id}" title="Remove" aria-label="Remove ${recipe.name}">${icon('trash')}</button>
      </div>
    </div>
  </article>`;
}

function recipeForm(recipe, foods, allTags) {
  const byCategory = new Map();
  for (const food of foods) {
    if (!byCategory.has(food.category)) byCategory.set(food.category, []);
    byCategory.get(food.category).push(food);
  }
  const stateOf = (id) => (recipe?.ingredients.includes(id) ? 'required' : recipe?.optional?.includes(id) ? 'optional' : 'none');
  const labelFor = { none: '', required: 'required', optional: 'optional' };

  return html`<div class="form-row">
      <div class="field">
        <label for="name">Recipe name</label>
        <input class="input" id="name" name="name" maxlength="80" required value="${recipe?.name || ''}" placeholder="e.g. Ginataang Kalabasa" />
      </div>
      <div class="field">
        <label for="minutes">Time (minutes)</label>
        <input class="input" id="minutes" name="minutes" type="number" min="1" max="1440" required value="${recipe?.minutes || 20}" />
      </div>
    </div>
    <div class="field">
      <label for="id">ID</label>
      <input class="input mono" id="id" name="id" maxlength="60" pattern="[a-z0-9][a-z0-9-]+" value="${recipe?.id || ''}" ${recipe ? html`readonly` : ''} placeholder="made from the name" />
      <span class="field-hint">${recipe ? 'The ID stays the same so users’ cooking history keeps pointing at this recipe.' : 'Lowercase letters, digits and hyphens. Filled in from the name.'}</span>
    </div>
    <div class="field">
      <label for="summary">Summary</label>
      <textarea class="textarea" id="summary" name="summary" maxlength="300" placeholder="One or two lines on how it is made.">${recipe?.summary || ''}</textarea>
    </div>
    <div class="field">
      <span class="field-label">Ingredients</span>
      <div class="picker-legend">
        <span><i style="background:var(--success)"></i>Required: the recipe is built around it</span>
        <span><i style="border:1px dashed var(--warning);background:var(--tint-warning)"></i>Optional: improves it</span>
        <span>Click a food to cycle. Pantry staples (rice, oil, garlic) are assumed.</span>
      </div>
      <div class="picker" id="picker">
        ${[...byCategory.entries()].map(
          ([category, list]) => html`<div class="picker-group">
            <h4>${category}</h4>
            <div class="chips">
              ${list.map((food) => {
                const s = stateOf(food.id);
                return html`<button type="button" class="chip" data-food="${food.id}" data-state="${s}" aria-label="${food.name}${labelFor[s] ? `, ${labelFor[s]}` : ''}">${food.name}</button>`;
              })}
            </div>
          </div>`
        )}
      </div>
      <span class="field-hint" id="picker-summary"></span>
    </div>
    <div class="field">
      <label for="tag-entry">Tags</label>
      <div class="tag-input" id="tag-input">
        <input id="tag-entry" placeholder="Type a tag and press Enter (e.g. fry, soup, filipino)" autocomplete="off" />
      </div>
      <div class="suggestions" id="tag-suggestions" data-all="${allTags.join(',')}"></div>
      <span class="field-hint">How the dish is cooked or eaten. The recommender matches these against how each food is usually used.</span>
    </div>`;
}

function wireRecipeForm(form, recipe) {
  const picker = form.querySelector('#picker');
  const summary = form.querySelector('#picker-summary');
  const updateSummary = () => {
    const required = picker.querySelectorAll('[data-state=required]').length;
    const optional = picker.querySelectorAll('[data-state=optional]').length;
    summary.textContent = `${plural(required, 'required food')}, ${optional} optional. At least one required food is needed.`;
  };
  picker.addEventListener('click', (event) => {
    const chip = event.target.closest('[data-food]');
    if (!chip) return;
    const next = { none: 'required', required: 'optional', optional: 'none' }[chip.dataset.state];
    chip.dataset.state = next;
    chip.setAttribute('aria-label', `${chip.textContent}${next === 'none' ? '' : `, ${next}`}`);
    updateSummary();
  });
  updateSummary();

  // Tags as removable pills.
  const box = form.querySelector('#tag-input');
  const entry = form.querySelector('#tag-entry');
  const suggestions = form.querySelector('#tag-suggestions');
  const all = suggestions.dataset.all ? suggestions.dataset.all.split(',') : [];
  const tags = [...(recipe?.tags || [])];

  const drawTags = () => {
    box.querySelectorAll('.tag-pill').forEach((pill) => pill.remove());
    for (const tag of tags) {
      const pill = document.createElement('span');
      pill.className = 'tag-pill';
      mount(pill, html`${tag}<button type="button" aria-label="Remove ${tag}">${icon('x')}</button>`);
      pill.querySelector('button').addEventListener('click', () => {
        tags.splice(tags.indexOf(tag), 1);
        drawTags();
      });
      box.insertBefore(pill, entry);
    }
    const left = all.filter((t) => !tags.includes(t)).slice(0, 14);
    mount(suggestions, left.map((t) => html`<button type="button" data-tag="${t}">+ ${t}</button>`));
  };
  const add = (value) => {
    const tag = value.trim().toLowerCase().replace(/\s+/g, '-');
    if (tag && !tags.includes(tag) && tags.length < 8) tags.push(tag);
    entry.value = '';
    drawTags();
  };
  entry.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ',') {
      event.preventDefault();
      add(entry.value);
    } else if (event.key === 'Backspace' && !entry.value && tags.length) {
      tags.pop();
      drawTags();
    }
  });
  entry.addEventListener('blur', () => entry.value && add(entry.value));
  suggestions.addEventListener('click', (event) => {
    const button = event.target.closest('[data-tag]');
    if (button) add(button.dataset.tag);
  });
  drawTags();

  // A new recipe's id follows its name until someone edits the id by hand.
  if (!recipe) {
    const name = form.querySelector('#name');
    const id = form.querySelector('#id');
    let touched = false;
    id.addEventListener('input', () => (touched = true));
    name.addEventListener('input', () => {
      if (!touched) id.value = slug(name.value);
    });
  }

  return {
    values() {
      const data = new FormData(form);
      return {
        id: String(data.get('id') || '').trim() || undefined,
        name: String(data.get('name')).trim(),
        minutes: Number(data.get('minutes')),
        summary: String(data.get('summary')).trim(),
        ingredients: [...picker.querySelectorAll('[data-state=required]')].map((c) => c.dataset.food),
        optional: [...picker.querySelectorAll('[data-state=optional]')].map((c) => c.dataset.food),
        tags: entry.value.trim() ? [...tags, entry.value.trim().toLowerCase()] : [...tags],
      };
    },
  };
}

export default {
  title: 'Recipe Dataset',
  subtitle: 'The recipes content-based recommendation ranks for each user. Every phone downloads the dataset when it changes.',

  async render(container, ctx) {
    const state = { recipes: [], foods: [], query: '', tag: null };
    mount(container, html`<div class="grid recipe-grid">${[1, 2, 3, 4, 5, 6].map(() => html`<div class="skeleton" style="min-height:200px"></div>`)}</div>`);
    mount(ctx.actions, html`<button class="btn btn-primary" type="button" id="add-recipe">${icon('plus')} Add recipe</button>`);
    ctx.actions.querySelector('#add-recipe').addEventListener('click', () => edit(null));

    const load = async () => {
      const [recipes, foods] = await Promise.all([api.recipes(), api.foods()]);
      state.recipes = recipes.recipes;
      state.foods = foods.foods;
      draw();
    };

    const foodName = (id) => state.foods.find((f) => f.id === id)?.name || id;
    const allTags = () => {
      const counts = new Map();
      for (const r of state.recipes) for (const t of r.tags || []) counts.set(t, (counts.get(t) || 0) + 1);
      return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
    };

    function visible() {
      const q = state.query.toLowerCase();
      return state.recipes.filter((r) => {
        if (state.tag && !(r.tags || []).includes(state.tag)) return false;
        if (!q) return true;
        const text = [r.name, r.id, r.summary, ...(r.tags || []), ...r.ingredients.map(foodName), ...(r.optional || []).map(foodName)];
        return text.join(' ').toLowerCase().includes(q);
      });
    }

    function draw() {
      const rows = visible();
      const tags = allTags();
      mount(
        container,
        html`<div class="toolbar">
            <div class="input-group">
              ${icon('search')}
              <input class="input" type="search" id="recipe-search" placeholder="Search by name, ingredient or tag" value="${state.query}" aria-label="Search recipes" />
            </div>
            <span class="badge">${plural(state.recipes.length, 'recipe')}</span>
          </div>
          <div class="chips" role="group" aria-label="Filter by tag" style="margin-bottom:16px">
            <button type="button" class="chip" data-tag="" aria-pressed="${!state.tag}">All</button>
            ${tags.map(([t, n]) => html`<button type="button" class="chip" data-tag="${t}" aria-pressed="${state.tag === t}">#${t} <span class="count">${n}</span></button>`)}
          </div>
          ${rows.length
            ? html`<div class="grid recipe-grid">${rows.map((r) => recipeCard(r, foodName))}</div>`
            : emptyState('book', 'No recipes match', state.query || state.tag ? 'Try another search or tag.' : 'Add the first recipe.')}`
      );
      const search = container.querySelector('#recipe-search');
      search.addEventListener(
        'input',
        debounce(() => {
          state.query = search.value.trim();
          draw();
          const again = container.querySelector('#recipe-search');
          again.focus();
          again.setSelectionRange(again.value.length, again.value.length);
        }, 180)
      );
      container.querySelectorAll('[data-tag]').forEach((chip) =>
        chip.addEventListener('click', () => {
          state.tag = chip.dataset.tag || null;
          draw();
        })
      );
      container.querySelectorAll('[data-edit]').forEach((b) => b.addEventListener('click', () => edit(state.recipes.find((r) => r.id === b.dataset.edit))));
      container.querySelectorAll('[data-delete]').forEach((b) => b.addEventListener('click', () => remove(state.recipes.find((r) => r.id === b.dataset.delete))));
    }

    async function edit(recipe) {
      let form;
      const saved = await openModal({
        title: recipe ? `Edit ${recipe.name}` : 'Add a recipe',
        subtitle: recipe ? null : 'It is offered to users whose shelf, taste and history match its ingredients and tags.',
        submitLabel: recipe ? 'Save recipe' : 'Add recipe',
        wide: true,
        body: recipeForm(recipe, state.foods, allTags().map(([t]) => t)),
        onOpen: (element) => {
          form = wireRecipeForm(element, recipe);
        },
        onSubmit: async () => {
          const body = form.values();
          if (!body.ingredients.length) throw new Error('Pick at least one required ingredient.');
          if (!Number.isFinite(body.minutes) || body.minutes < 1) throw new Error('Enter how many minutes it takes.');
          const result = recipe ? await api.updateRecipe(recipe.id, body) : await api.createRecipe(body);
          return result.recipe;
        },
      });
      if (saved) {
        toast(recipe ? `${saved.name} was saved.` : `${saved.name} was added.`);
        await load();
      }
    }

    async function remove(recipe) {
      const ok = await confirmDialog({
        title: `Remove ${recipe.name}?`,
        message: 'Phones stop recommending it once they refresh the dataset. Users who saved it keep it in their history.',
        confirmLabel: 'Remove recipe',
        onConfirm: () => api.deleteRecipe(recipe.id),
      });
      if (ok) {
        toast(`${recipe.name} was removed.`);
        await load();
      }
    }

    await load();
  },
};
