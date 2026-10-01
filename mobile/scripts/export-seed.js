/**
 * Writes the app's bundled food catalog and recipes to backend/seed/, so the server
 * starts from the same data the app ships with.
 *
 *   node scripts/export-seed.js          write the seed files
 *   node scripts/export-seed.js --check  fail if the seed files are out of date
 *
 * The server seeds its recipe dataset from recipes.json the first time it starts, and
 * uses food_catalog.json to know which food ids and categories the app already has.
 */

const fs = require('fs');
const path = require('path');
const { load, MOBILE_ROOT } = require('./harness');

const SEED_DIR = path.resolve(MOBILE_ROOT, '..', 'backend', 'seed');

const { FOOD_CATALOG } = load('data/foodCatalog.js');
const { BUNDLED_RECIPES: RECIPES } = load('data/recipes.js');

const files = {
  'food_catalog.json': FOOD_CATALOG.filter((food) => food.id !== 'unknown').map(({ id, name, category }) => ({
    id,
    name,
    category,
  })),
  'recipes.json': RECIPES.map((recipe) => ({
    id: recipe.id,
    name: recipe.name,
    ingredients: recipe.ingredients,
    optional: recipe.optional || [],
    tags: recipe.tags || [],
    minutes: recipe.minutes,
    summary: recipe.summary || '',
  })),
};

const check = process.argv.includes('--check');
let stale = 0;
fs.mkdirSync(SEED_DIR, { recursive: true });
for (const [name, data] of Object.entries(files)) {
  const target = path.join(SEED_DIR, name);
  const text = `${JSON.stringify(data, null, 2)}\n`;
  const current = fs.existsSync(target) ? fs.readFileSync(target, 'utf8') : null;
  if (current === text) {
    console.log(`  up to date  ${name}`);
  } else if (check) {
    stale += 1;
    console.log(`  STALE       ${name}  (run: node scripts/export-seed.js)`);
  } else {
    fs.writeFileSync(target, text);
    console.log(`  wrote       ${name}  (${data.length} entries)`);
  }
}
process.exit(stale ? 1 : 0);
