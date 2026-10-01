/**
 * Recipe knowledge base for the content-based recommender.
 *
 * `ingredients` are the food ids (see foodCatalog.js) the dish is built around; every
 * one is needed. `optional` ids improve it but are not required. Pantry staples such as
 * rice, garlic, oil and soy sauce are assumed on hand and left out. `tags` describe how
 * the dish is cooked and are matched against how each food is usually used.
 */

const BUNDLED_RECIPES = [
  { id: 'tortang-talong', name: 'Tortang Talong', ingredients: ['eggplant', 'eggs'], optional: ['meat'], tags: ['filipino', 'fry', 'breakfast'], minutes: 20, summary: 'Grill and peel the eggplant, dip in beaten egg and pan-fry.' },
  { id: 'pinakbet', name: 'Pinakbet', ingredients: ['eggplant', 'bitter_gourd', 'okra', 'tomato'], optional: ['meat'], tags: ['filipino', 'stew', 'one-pot'], minutes: 30, summary: 'Simmer mixed vegetables with shrimp paste until tender.' },
  { id: 'ginisang-ampalaya', name: 'Ginisang Ampalaya', ingredients: ['bitter_gourd', 'eggs', 'tomato'], tags: ['filipino', 'fry'], minutes: 15, summary: 'Sauté bitter gourd with tomato and stir in beaten egg.' },
  { id: 'sinigang-baboy', name: 'Sinigang na Baboy', ingredients: ['meat', 'tomato', 'okra', 'eggplant'], tags: ['filipino', 'soup', 'one-pot'], minutes: 50, summary: 'Sour tamarind soup with pork and vegetables.' },
  { id: 'sinigang-isda', name: 'Sinigang na Isda', ingredients: ['fish', 'tomato', 'okra'], tags: ['filipino', 'soup', 'one-pot'], minutes: 30, summary: 'Light sour soup with fish, tomato and okra.' },
  { id: 'adobo', name: 'Adobo', ingredients: ['meat', 'potato'], tags: ['filipino', 'stew', 'one-pot'], minutes: 45, summary: 'Braise in soy sauce and vinegar; potato soaks up the sauce.' },
  { id: 'tinolang-papaya', name: 'Tinola with Green Papaya', ingredients: ['meat', 'papaya'], tags: ['filipino', 'soup', 'one-pot'], minutes: 40, summary: 'Ginger broth with chicken and green papaya wedges.' },
  { id: 'ensaladang-talong', name: 'Ensaladang Talong', ingredients: ['eggplant', 'tomato'], tags: ['filipino', 'grill', 'salad'], minutes: 15, summary: 'Grilled eggplant with fresh tomato and a vinegar dressing.' },
  { id: 'ensaladang-mangga', name: 'Mango and Tomato Salad', ingredients: ['mango', 'tomato'], tags: ['filipino', 'raw', 'salad'], minutes: 10, summary: 'Sliced mango and tomato with a salty-sweet dressing.' },
  { id: 'mango-shake', name: 'Mango Shake', ingredients: ['mango', 'milk'], tags: ['blend', 'dessert'], minutes: 5, summary: 'Blend ripe mango with cold milk and ice.' },
  { id: 'mango-parfait', name: 'Mango Yogurt Parfait', ingredients: ['mango', 'yogurt'], optional: ['banana'], tags: ['raw', 'dessert', 'breakfast'], minutes: 5, summary: 'Layer yogurt with diced mango and banana.' },
  { id: 'fruit-salad', name: 'Fresh Fruit Salad', ingredients: ['apple', 'orange'], optional: ['mango', 'banana', 'papaya'], tags: ['raw', 'dessert', 'salad'], minutes: 10, summary: 'Cube the fruit and toss with a squeeze of orange juice.' },
  { id: 'baked-apples', name: 'Baked Apples', ingredients: ['apple'], tags: ['bake', 'dessert'], minutes: 30, summary: 'Core, fill with cinnamon and sugar, and bake until soft.' },
  { id: 'orange-juice', name: 'Fresh Orange Juice', ingredients: ['orange'], tags: ['blend', 'raw'], minutes: 5, summary: 'Squeeze and serve cold.' },
  { id: 'banana-bread', name: 'Banana Bread', ingredients: ['banana', 'eggs', 'milk'], tags: ['bake', 'dessert'], minutes: 60, summary: 'The best use for very ripe bananas.' },
  { id: 'banana-pancakes', name: 'Banana Pancakes', ingredients: ['banana', 'eggs', 'milk'], tags: ['fry', 'breakfast'], minutes: 15, summary: 'Mash the banana into the batter and griddle.' },
  { id: 'papaya-smoothie', name: 'Papaya Smoothie', ingredients: ['papaya', 'yogurt'], optional: ['banana'], tags: ['blend', 'breakfast'], minutes: 5, summary: 'Blend ripe papaya with yogurt.' },
  { id: 'atchara', name: 'Atchara (Pickled Green Papaya)', ingredients: ['papaya', 'capsicum'], tags: ['filipino', 'pickle'], minutes: 30, summary: 'Shred and pickle in sweet vinegar; keeps for weeks.' },
  { id: 'cucumber-tomato-salad', name: 'Cucumber Tomato Salad', ingredients: ['cucumber', 'tomato'], tags: ['raw', 'salad'], minutes: 10, summary: 'Slice, salt lightly and dress with vinegar.' },
  { id: 'garden-salad', name: 'Garden Salad', ingredients: ['lettuce', 'tomato', 'cucumber'], optional: ['capsicum'], tags: ['raw', 'salad'], minutes: 10, summary: 'Crisp greens with whatever raw vegetables you have.' },
  { id: 'tzatziki', name: 'Yogurt Cucumber Dip', ingredients: ['yogurt', 'cucumber'], tags: ['raw', 'snack'], minutes: 10, summary: 'Grate cucumber into yogurt with garlic and salt.' },
  { id: 'egg-sandwich', name: 'Egg and Tomato Sandwich', ingredients: ['eggs', 'bread'], optional: ['lettuce', 'tomato', 'cheese'], tags: ['fry', 'breakfast'], minutes: 10, summary: 'Fried or boiled egg with whatever fresh vegetables you have.' },
  { id: 'grilled-cheese', name: 'Grilled Cheese', ingredients: ['cheese', 'bread'], tags: ['fry', 'snack'], minutes: 8, summary: 'Toast until golden and melted.' },
  { id: 'omelette', name: 'Vegetable Omelette', ingredients: ['eggs', 'tomato'], optional: ['cheese', 'capsicum'], tags: ['fry', 'breakfast'], minutes: 10, summary: 'Fold sautéed vegetables into a soft omelette.' },
  { id: 'menudo', name: 'Menudo', ingredients: ['meat', 'potato', 'capsicum', 'tomato'], tags: ['filipino', 'stew', 'one-pot'], minutes: 50, summary: 'Diced meat and vegetables stewed in tomato sauce.' },
  { id: 'pritong-isda', name: 'Fried Fish with Tomato Salsa', ingredients: ['fish', 'tomato'], tags: ['filipino', 'fry'], minutes: 20, summary: 'Crisp-fried fish topped with fresh tomato.' },
  { id: 'escabeche', name: 'Sweet and Sour Fish', ingredients: ['fish', 'capsicum', 'tomato'], tags: ['filipino', 'fry'], minutes: 25, summary: 'Fried fish in a sweet-sour sauce with bell pepper.' },
  { id: 'stuffed-peppers', name: 'Stuffed Peppers', ingredients: ['capsicum', 'meat'], optional: ['cheese'], tags: ['bake'], minutes: 40, summary: 'Fill halved peppers with seasoned meat and bake.' },
  { id: 'ginisang-okra', name: 'Sautéed Okra and Tomato', ingredients: ['okra', 'tomato'], optional: ['eggs'], tags: ['filipino', 'fry'], minutes: 15, summary: 'Quick sauté; cook okra briefly to avoid sliminess.' },
  { id: 'tomato-potato-soup', name: 'Tomato Potato Soup', ingredients: ['tomato', 'potato'], optional: ['milk'], tags: ['soup', 'one-pot'], minutes: 30, summary: 'Simmer, blend and finish with a splash of milk.' },
  { id: 'roasted-potatoes', name: 'Roasted Potatoes and Peppers', ingredients: ['potato', 'capsicum'], tags: ['bake'], minutes: 40, summary: 'Roast together until the edges crisp.' },
  { id: 'baked-potato', name: 'Cheesy Baked Potato', ingredients: ['potato', 'cheese'], tags: ['bake'], minutes: 45, summary: 'Bake whole, split and top with melted cheese.' },
  { id: 'baked-eggplant', name: 'Baked Eggplant with Tomato and Cheese', ingredients: ['eggplant', 'tomato', 'cheese'], tags: ['bake'], minutes: 35, summary: 'Layer sliced eggplant with tomato and cheese.' },
  { id: 'leche-flan', name: 'Leche Flan', ingredients: ['eggs', 'milk'], tags: ['filipino', 'bake', 'dessert'], minutes: 60, summary: 'Steamed custard with caramel; uses eggs and milk before they turn.' },
  { id: 'bread-pudding', name: 'Bread Pudding', ingredients: ['bread', 'milk', 'eggs'], tags: ['bake', 'dessert'], minutes: 45, summary: 'Turns stale bread into a custardy dessert.' },
  { id: 'leftover-fried-rice', name: 'Fried Rice from Leftovers', ingredients: ['leftovers'], optional: ['eggs'], tags: ['fry', 'one-pot'], minutes: 10, summary: 'Reheat thoroughly in a hot pan with garlic and egg.' }
];

/**
 * The recipes the recommender ranks. They start as the bundled set above; once the
 * server's dataset (managed by a Super Admin on the web console) has been fetched, it
 * replaces them in place, so every module that imported RECIPES sees the new set.
 */
export const RECIPES = [...BUNDLED_RECIPES];

let revision = 0;

/** Changes whenever RECIPES does, so derived data (the recommender's index) can be rebuilt. */
export function recipesRevision() {
  return revision;
}

function isRecipe(recipe) {
  return (
    recipe &&
    typeof recipe.id === 'string' &&
    typeof recipe.name === 'string' &&
    Array.isArray(recipe.ingredients) &&
    recipe.ingredients.length > 0 &&
    recipe.ingredients.every((id) => typeof id === 'string')
  );
}

/** Replace the recipes with the server's dataset. Anything that is not a usable recipe is ignored. */
export function setRemoteRecipes(recipes) {
  if (!Array.isArray(recipes)) return;
  const usable = recipes.filter(isRecipe).map((recipe) => ({
    ...recipe,
    optional: Array.isArray(recipe.optional) ? recipe.optional : [],
    tags: Array.isArray(recipe.tags) ? recipe.tags : [],
  }));
  RECIPES.splice(0, RECIPES.length, ...usable);
  revision += 1;
}

/** Go back to the recipes that ship with the app. */
export function resetRecipes() {
  RECIPES.splice(0, RECIPES.length, ...BUNDLED_RECIPES);
  revision += 1;
}

export { BUNDLED_RECIPES };
