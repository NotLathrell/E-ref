/**
 * "Use it up" meal plan: a greedy weighted set cover.
 *
 * The universe is the food that is close to spoiling, each item weighted by its
 * risk. Each round the greedy rule picks the recipe with the best ratio of newly
 * rescued risk to effort (ingredients you would still have to buy), then removes what
 * it rescued and repeats. Greedy is the classic approximation for set cover and is
 * fast enough to run on every render.
 */

import { RECIPES } from '../data/recipes';
import { getFoodById } from '../data/foodCatalog';
import { isAtRisk, itemsUsedBy, urgencyWeight } from './contentBased';

/** Each missing ingredient makes a recipe this much less attractive per unit of risk rescued. */
const MISSING_PENALTY = 0.25;

/**
 * @param {Array<object>} items enriched inventory items
 * @param {{maxMeals?: number, recipes?: Array<object>}} options
 * @returns {{meals: Array<object>, uncovered: Array<object>, riskTotal: number, riskRescued: number}}
 */
export function planMeals(items = [], { maxMeals = 3, recipes = RECIPES } = {}) {
  const live = items.filter((item) => !item.discarded && item.foodId !== 'unknown');
  const targets = live.filter(isAtRisk);
  const stocked = new Set(live.map((item) => item.foodId));

  const remaining = new Map(targets.map((item) => [item.id, item]));
  const riskTotal = targets.reduce((sum, item) => sum + urgencyWeight(item), 0);
  const chosen = [];
  const meals = [];

  while (remaining.size && meals.length < maxMeals) {
    let best = null;

    for (const recipe of recipes) {
      if (chosen.includes(recipe.id)) continue;

      const covers = itemsUsedBy(recipe, [...remaining.values()]);
      if (!covers.length) continue;

      const gain = covers.reduce((sum, item) => sum + urgencyWeight(item), 0);
      const missing = recipe.ingredients.filter((id) => !stocked.has(id));
      const value = gain / (1 + MISSING_PENALTY * missing.length);
      const availability = (recipe.ingredients.length - missing.length) / recipe.ingredients.length;

      const better =
        !best ||
        value > best.value + 1e-9 ||
        (Math.abs(value - best.value) <= 1e-9 &&
          (availability > best.availability || (availability === best.availability && recipe.minutes < best.recipe.minutes)));

      if (better) best = { recipe, covers, gain, missing, value, availability };
    }

    if (!best) break;

    chosen.push(best.recipe.id);
    best.covers.forEach((item) => remaining.delete(item.id));
    meals.push({
      recipe: best.recipe,
      covers: best.covers,
      missing: best.missing.map((id) => getFoodById(id).name),
      riskRescued: best.gain
    });
  }

  const uncovered = [...remaining.values()];
  const riskUncovered = uncovered.reduce((sum, item) => sum + urgencyWeight(item), 0);
  return { meals, uncovered, riskTotal, riskRescued: riskTotal - riskUncovered };
}
