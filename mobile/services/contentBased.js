/**
 * Content-based recipe recommendation.
 *
 * Every recipe and every inventory item is described by the same content features:
 *   f:<food>      the food itself (a recipe's ingredients, an item's own food)
 *   c:<category>  its category (Produce, Dairy, Meat, Pantry)
 *   t:<tag>       how it is cooked or eaten (bake, fry, raw, blend, stew, ...)
 * Features are weighted by TF-IDF over the recipe collection, so an unusual ingredient
 * such as okra says more about a recipe than a common one such as tomato.
 *
 * The user profile is a vector in the same feature space, built from three sources, each
 * scaled to unit length so no one of them dominates:
 *
 *   inventory     the sum of the inventory's item vectors, each weighted by how urgently it
 *                 needs using (its weighted risk score)
 *   preferences   the foods the user said they like            (weight TASTE_WEIGHTS.liked)
 *   history       recipes the user cooked, saved or opened, newer and stronger actions
 *                 counting more, and none at all if there is no history
 *                                                              (weight TASTE_WEIGHTS.history)
 *
 * Recipes are ranked by
 *
 *   score = 0.5 * cosine(profile, recipe)     what the kitchen and the user's taste suggest
 *         + 0.3 * coverage                    how much of the at-risk food it rescues
 *         + 0.2 * availability                how much of it can be cooked right now
 *
 * so the top result is something you can mostly make, that uses the food closest to
 * spoiling, and that resembles what you like to cook. Recipes the user dismissed, that
 * contain a food they avoid, or that break their diet are never offered. Only recipes
 * that use at least one item from the inventory are recommended; when there are none,
 * `recommendForKitchen` says why and offers ideas from the user's taste alone.
 */

import { getFoodById } from '../data/foodCatalog';
import { RECIPES, recipesRevision } from '../data/recipes';

const FEATURE_WEIGHT = { ingredient: 1.0, optional: 0.4, category: 0.5, tag: 0.35 };
export const SCORE_WEIGHTS = { similarity: 0.5, coverage: 0.3, availability: 0.2 };

/** How much the user's stated likes and cooking history pull on the profile. */
export const TASTE_WEIGHTS = { liked: 0.5, history: 0.5 };
/** How strongly each way of interacting with a recipe says "more like this". */
export const ACTION_WEIGHT = { cooked: 1, saved: 0.8, viewed: 0.3 };
const HISTORY_HALF_LIFE_DAYS = 21;
const DAY_MS = 24 * 60 * 60 * 1000;

/** An item at or above this risk, or with this few days left, counts as "at risk". */
export const AT_RISK_SCORE = 0.35;
export const AT_RISK_DAYS = 3;

export const DEFAULT_TASTE = { liked: [], avoided: [], diet: 'none', log: [] };

const USAGE_TAGS = [
  [/roast|bake|baking/i, 'bake'],
  [/stir-fry|sauté|saute|grill|fry|omelette|toast/i, 'fry'],
  [/salad|eat fresh|raw|slice|dip/i, 'raw'],
  [/smoothie|shake|juice|blend/i, 'blend'],
  [/soup|stew|curry|pinakbet|sauce/i, 'stew'],
  [/pickle|atchara/i, 'pickle']
];

const nameOf = (foodId) => getFoodById(foodId).name;

function usageTags(food) {
  const tags = new Set();
  for (const idea of food.usageIdeas || []) {
    for (const [pattern, tag] of USAGE_TAGS) if (pattern.test(idea)) tags.add(tag);
  }
  return tags;
}

function add(vector, key, weight) {
  vector.set(key, (vector.get(key) || 0) + weight);
}

/** Raw (pre-IDF) feature vector for a recipe. */
function recipeFeatures(recipe) {
  const vector = new Map();
  const core = recipe.ingredients;
  for (const id of core) {
    add(vector, `f:${id}`, FEATURE_WEIGHT.ingredient);
    add(vector, `c:${getFoodById(id).category}`, FEATURE_WEIGHT.category / core.length);
  }
  for (const id of recipe.optional || []) add(vector, `f:${id}`, FEATURE_WEIGHT.optional);
  for (const tag of recipe.tags || []) add(vector, `t:${tag}`, FEATURE_WEIGHT.tag);
  return vector;
}

/** Raw feature vector for one inventory item. */
function itemFeatures(item) {
  const food = getFoodById(item.foodId);
  const vector = new Map();
  add(vector, `f:${food.id}`, FEATURE_WEIGHT.ingredient);
  add(vector, `c:${food.category}`, FEATURE_WEIGHT.category);
  for (const tag of usageTags(food)) add(vector, `t:${tag}`, FEATURE_WEIGHT.tag);
  return vector;
}

function buildIndex(recipes) {
  const documentFrequency = new Map();
  const raw = recipes.map((recipe) => {
    const vector = recipeFeatures(recipe);
    for (const key of vector.keys()) documentFrequency.set(key, (documentFrequency.get(key) || 0) + 1);
    return vector;
  });

  const total = recipes.length;
  const idf = (key) => Math.log((total + 1) / ((documentFrequency.get(key) || 0) + 1)) + 1;
  const weighted = (vector) => new Map([...vector].map(([key, tf]) => [key, tf * idf(key)]));

  return { idf, weighted, vectors: raw.map(weighted) };
}

// The index over RECIPES, rebuilt when the server's recipe dataset replaces them.
let defaultIndex = null;
let defaultIndexRevision = -1;

function indexFor(recipes) {
  if (recipes !== RECIPES) return buildIndex(recipes);
  if (!defaultIndex || defaultIndexRevision !== recipesRevision()) {
    defaultIndex = buildIndex(RECIPES);
    defaultIndexRevision = recipesRevision();
  }
  return defaultIndex;
}

function cosine(a, b) {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (const [, value] of a) normA += value * value;
  for (const [key, value] of b) {
    normB += value * value;
    if (a.has(key)) dot += a.get(key) * value;
  }
  return normA && normB ? dot / Math.sqrt(normA * normB) : 0;
}

/** A vector scaled to length 1 (an empty vector stays empty). */
function unit(vector) {
  let norm = 0;
  for (const [, value] of vector) norm += value * value;
  if (!norm) return new Map();
  const length = Math.sqrt(norm);
  return new Map([...vector].map(([key, value]) => [key, value / length]));
}

function addScaled(target, vector, scale) {
  for (const [key, value] of vector) add(target, key, value * scale);
}

/** How urgently an item needs using, 0–1. Frozen and discarded items do not count. */
export function urgencyWeight(item) {
  if (item.frozen || item.discarded || item.consumed || item.foodId === 'unknown') return 0;
  return Math.max(0.05, Number(item.riskScore) || 0);
}

export function isAtRisk(item) {
  if (item.frozen || item.discarded || item.consumed || item.foodId === 'unknown') return false;
  const days = item.estimatedDaysLeft;
  return (Number(item.riskScore) || 0) >= AT_RISK_SCORE || (days != null && days <= AT_RISK_DAYS);
}

const isLive = (item) => !item.discarded && !item.consumed && item.foodId !== 'unknown';

/** The inventory items a recipe would use up, highest risk first. */
export function itemsUsedBy(recipe, items) {
  return items
    .filter((item) => !item.discarded && !item.consumed && recipe.ingredients.includes(item.foodId))
    .sort((a, b) => (b.riskScore || 0) - (a.riskScore || 0));
}

// -------------------------------------------------------------------- taste
function normalizeTaste(taste) {
  const t = taste || {};
  return {
    liked: Array.isArray(t.liked) ? t.liked : [],
    avoided: Array.isArray(t.avoided) ? t.avoided : [],
    diet: t.diet === 'vegetarian' ? 'vegetarian' : 'none',
    log: Array.isArray(t.log) ? t.log : []
  };
}

/** True when the user has told the app, or shown by cooking, anything about their taste. */
export function hasTaste(taste) {
  const t = normalizeTaste(taste);
  return t.liked.length > 0 || t.log.length > 0;
}

/** Recipe ids the user turned down. */
function dismissedIds(taste) {
  const state = new Map();
  for (const entry of taste.log) state.set(entry.recipeId, entry.action);
  return new Set([...state].filter(([, action]) => action === 'dismissed').map(([id]) => id));
}

/** Why a recipe is not offered to this user, or null if it is allowed. */
export function excludedBecause(recipe, taste, dismissed = dismissedIds(normalizeTaste(taste))) {
  const t = normalizeTaste(taste);
  if (dismissed.has(recipe.id)) return 'dismissed';
  const blocked = recipe.ingredients.find((id) => t.avoided.includes(id));
  if (blocked) return `avoids ${nameOf(blocked)}`;
  if (t.diet === 'vegetarian') {
    const meat = recipe.ingredients.find((id) => getFoodById(id).category === 'Meat');
    if (meat) return `vegetarian (${nameOf(meat)})`;
  }
  return null;
}

/** The recipes this user may be offered. */
export function eligibleRecipes(taste, recipes = RECIPES) {
  const t = normalizeTaste(taste);
  const dismissed = dismissedIds(t);
  return recipes.filter((recipe) => !excludedBecause(recipe, t, dismissed));
}

/** The latest action per recipe, with a recency-decayed strength. */
function historyStrengths(taste, now) {
  const latest = new Map();
  for (const entry of taste.log) {
    const weight = ACTION_WEIGHT[entry.action];
    if (!weight) continue;
    const previous = latest.get(entry.recipeId);
    const at = new Date(entry.at).getTime() || 0;
    // Keep the strongest action seen for a recipe, at its own time.
    if (!previous || weight > previous.weight || (weight === previous.weight && at > previous.at)) {
      latest.set(entry.recipeId, { weight, at, action: entry.action });
    }
  }
  const strengths = new Map();
  for (const [recipeId, { weight, at, action }] of latest) {
    const ageDays = Math.max(0, (now - at) / DAY_MS);
    strengths.set(recipeId, { strength: weight * 0.5 ** (ageDays / HISTORY_HALF_LIFE_DAYS), action });
  }
  return strengths;
}

function tasteVectors(taste, index, recipes, now) {
  const liked = new Map();
  for (const foodId of taste.liked) addScaled(liked, index.weighted(itemFeatures({ foodId })), 1);

  const history = new Map();
  const strengths = historyStrengths(taste, now);
  recipes.forEach((recipe, position) => {
    const entry = strengths.get(recipe.id);
    if (entry) addScaled(history, index.vectors[position], entry.strength);
  });
  // A unit-length history vector would say "cooked" and "just opened" equally loudly, so it
  // is scaled by how much (recent, strong) history there is: one recipe cooked today counts
  // in full, one merely opened counts for 30%, and one cooked long ago fades away.
  let total = 0;
  for (const { strength } of strengths.values()) total += strength;
  const scaled = new Map([...unit(history)].map(([key, value]) => [key, value * Math.min(1, total)]));
  return { liked: unit(liked), history: scaled, strengths };
}

// ----------------------------------------------------------------- ranking
function reasonsFor(entry, taste, tasteVecs, index, recipes) {
  const reasons = [];
  const first = entry.rescues[0] || entry.uses[0];
  if (first) {
    const days = first.estimatedDaysLeft;
    const timing = days != null && days <= AT_RISK_DAYS ? ` (${days < 1 ? 'less than a day' : `${Math.ceil(days)} day${Math.ceil(days) === 1 ? '' : 's'}`} left)` : '';
    reasons.push(`Uses your ${nameOf(first.foodId)}${timing}`);
  }
  const liked = entry.recipe.ingredients.find((id) => taste.liked.includes(id));
  if (liked) reasons.push(`You like ${nameOf(liked)}`);

  // The recipe from the user's history this one most resembles.
  const self = recipes.findIndex((r) => r.id === entry.recipe.id);
  let closest = null;
  recipes.forEach((other, position) => {
    if (position === self || !tasteVecs.strengths.get(other.id)) return;
    const similarity = cosine(index.vectors[position], index.vectors[self]);
    if (similarity >= 0.35 && (!closest || similarity > closest.similarity)) closest = { recipe: other, similarity };
  });
  if (closest) {
    const cooked = tasteVecs.strengths.get(closest.recipe.id).action === 'cooked';
    reasons.push(`Similar to ${closest.recipe.name}, which you ${cooked ? 'cooked' : 'looked at'}`);
  }

  reasons.push(entry.missing.length ? `You would need ${entry.missing.join(', ')}` : 'You have everything for it');
  return reasons;
}

/**
 * Rank recipes for what is in the kitchen.
 *
 * @param {Array<object>} items enriched inventory items
 * @param {{limit?: number, recipes?: Array<object>, taste?: object, now?: number}} options
 */
export function recommendRecipes(items = [], { limit = 5, recipes = RECIPES, taste = null, now = Date.now() } = {}) {
  const t = normalizeTaste(taste);
  const index = indexFor(recipes);
  const live = items.filter(isLive);
  if (!live.length) return [];

  const inventory = new Map();
  for (const item of live) {
    const weight = urgencyWeight(item);
    if (!weight) continue;
    addScaled(inventory, index.weighted(itemFeatures(item)), weight);
  }

  const tasteVecs = tasteVectors(t, index, recipes, now);
  const profile = new Map();
  addScaled(profile, unit(inventory), 1);
  addScaled(profile, tasteVecs.liked, TASTE_WEIGHTS.liked);
  addScaled(profile, tasteVecs.history, TASTE_WEIGHTS.history);

  const atRisk = live.filter(isAtRisk);
  const atRiskWeight = atRisk.reduce((sum, item) => sum + urgencyWeight(item), 0);
  const stocked = new Set(live.map((item) => item.foodId));
  const dismissed = dismissedIds(t);

  const ranked = [];
  recipes.forEach((recipe, position) => {
    if (excludedBecause(recipe, t, dismissed)) return;
    const used = itemsUsedBy(recipe, live);
    if (!used.length) return;

    const similarity = cosine(profile, index.vectors[position]);
    const rescued = atRisk.filter((item) => recipe.ingredients.includes(item.foodId));
    const coverage = atRiskWeight
      ? rescued.reduce((sum, item) => sum + urgencyWeight(item), 0) / atRiskWeight
      : 0;
    const have = recipe.ingredients.filter((id) => stocked.has(id));
    const availability = have.length / recipe.ingredients.length;

    ranked.push({
      recipe,
      score:
        SCORE_WEIGHTS.similarity * similarity +
        SCORE_WEIGHTS.coverage * coverage +
        SCORE_WEIGHTS.availability * availability,
      similarity,
      coverage,
      availability,
      uses: used,
      rescues: rescued,
      missing: recipe.ingredients.filter((id) => !stocked.has(id)).map(nameOf)
    });
  });

  return ranked
    .sort((a, b) => b.score - a.score || a.recipe.minutes - b.recipe.minutes || a.recipe.id.localeCompare(b.recipe.id))
    .slice(0, limit)
    .map((entry) => ({ ...entry, reasons: reasonsFor(entry, t, tasteVecs, index, recipes) }));
}

/** Recipes that would use one particular item. */
export function recipesForItem(item, { limit = 3, taste = null } = {}) {
  return recommendRecipes([item], { limit, taste });
}

/**
 * Ideas from the user's taste alone, for when nothing in the kitchen matches a recipe.
 * Empty when there is no taste to go on.
 */
export function tasteIdeas(taste, { limit = 3, recipes = RECIPES, now = Date.now() } = {}) {
  const t = normalizeTaste(taste);
  if (!hasTaste(t)) return [];
  const index = indexFor(recipes);
  const vecs = tasteVectors(t, index, recipes, now);
  const profile = new Map();
  addScaled(profile, vecs.liked, TASTE_WEIGHTS.liked);
  addScaled(profile, vecs.history, TASTE_WEIGHTS.history);
  const dismissed = dismissedIds(t);

  return recipes
    .map((recipe, position) => ({ recipe, score: cosine(profile, index.vectors[position]) }))
    .filter(({ recipe, score }) => score > 0 && !excludedBecause(recipe, t, dismissed) && !vecs.strengths.get(recipe.id)?.strength)
    .sort((a, b) => b.score - a.score || a.recipe.id.localeCompare(b.recipe.id))
    .slice(0, limit)
    .map(({ recipe, score }) => ({ recipe, score, missing: recipe.ingredients.map(nameOf), reasons: ['Based on what you like to cook'] }));
}

/**
 * What the recipes screen shows: the ranked recommendations, or the reason there are
 * none along with anything else that could still help.
 *
 * @returns {{status: 'ok'|'empty-inventory'|'no-match', message: string|null, recipes: Array<object>, ideas: Array<object>, filteredOut: number}}
 */
export function recommendForKitchen(items = [], { limit = 5, taste = null, recipes = RECIPES, now = Date.now() } = {}) {
  const t = normalizeTaste(taste);
  const live = items.filter(isLive);
  const ideas = tasteIdeas(t, { limit: 3, recipes, now });

  if (!live.length) {
    return {
      status: 'empty-inventory',
      message: 'Your shelf is empty. Scan some food and recipes that use it will show up here.',
      recipes: [],
      ideas,
      filteredOut: 0
    };
  }

  const found = recommendRecipes(items, { limit, taste: t, recipes, now });
  if (found.length) return { status: 'ok', message: null, recipes: found, ideas: [], filteredOut: 0 };

  // Nothing matched. Say whether the user's own filters are the reason.
  const blocked = recipes.filter((recipe) => itemsUsedBy(recipe, live).length && excludedBecause(recipe, t)).length;
  const message = blocked
    ? `${blocked} recipe${blocked === 1 ? '' : 's'} use what you have, but your food preferences rule ${blocked === 1 ? 'it' : 'them'} out.`
    : `No recipe in the book uses ${live.length === 1 ? nameOf(live[0].foodId) : 'the food on your shelf'} yet.`;
  return { status: 'no-match', message, recipes: [], ideas, filteredOut: blocked };
}
