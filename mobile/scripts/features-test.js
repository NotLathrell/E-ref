/**
 * Feature test for the algorithms and screens that the project checklist asks about.
 *
 *   node scripts/features-test.js
 *
 * No server is needed: everything here runs on the device side.
 *
 *   D  greedy prioritisation        criteria, ties, empty shelf, greedy choice at each step
 *   E  content-based recommender    taste profile, history, preferences, no-match cases
 *   A  food database                the server's entries laid over the bundled catalog
 *   B/C  scan results               low-confidence review, corrections, several foods in one photo
 *   G  screens                      Home priority list, Recipes, History, Admin, scan result
 */

const path = require('path');
const { load, render, setContext, setModalMode, setRouteParams } = require('./harness');

// Only what is actually on screen counts: a closed sheet's buttons must not satisfy a check.
setModalMode('open');

let failures = 0;
function check(label, ok, detail) {
  if (!ok) failures += 1;
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? `  [${detail}]` : ''}`);
}
function section(title) {
  console.log(`\n${title}`);
}

const DAY = 86400000;
const { prioritizeByGreedy, getSoonToSpoil, explainPriority } = load('services/prioritize.js');
const content = load('services/contentBased.js');
const catalog = load('data/foodCatalog.js');
const { enrichAll, enrichItem } = load('services/enrich.js');
const { RECIPES } = load('data/recipes.js');

function raw(id, foodId, { storage = 'fridge_top', storedDaysAgo = 1, expiresIn = 10, spoilage = 0.05, ...extra } = {}) {
  const t = Date.now();
  return {
    id, foodId, title: id, storageId: storage, category: catalog.getFoodById(foodId).category,
    expiryDate: expiresIn == null ? null : new Date(t + expiresIn * DAY).toISOString(),
    scannedAt: new Date(t - storedDaysAgo * DAY).toISOString(),
    createdAt: new Date(t - storedDaysAgo * DAY).toISOString(),
    cnnSpoilageScore: spoilage, frozen: false, discarded: false, ...extra,
  };
}
const shelf = (...items) => enrichAll(items);

// ---------------------------------------------------------------------------------
section('D. Greedy prioritisation');
{
  check('an empty shelf gives an empty list', prioritizeByGreedy([]).length === 0);
  check('no argument at all is handled', prioritizeByGreedy().length === 0);
  check('nothing is soon to spoil on an empty shelf', getSoonToSpoil([]).length === 0);

  const items = shelf(
    raw('fresh-milk', 'milk', { expiresIn: 20 }),
    raw('rotting-tomato', 'tomato', { storage: 'counter', storedDaysAgo: 4, expiresIn: 1, spoilage: 0.85 }),
    raw('ok-cheese', 'cheese', { expiresIn: 12 }),
  );
  const ranked = prioritizeByGreedy(items);
  check('the riskiest item comes first', ranked[0].id === 'rotting-tomato', ranked.map((i) => i.id).join(' > '));
  check('ranks run 1..n', ranked.map((i) => i.priorityRank).join(',') === '1,2,3');
  check('risk never increases down the list', ranked.every((item, i) => i === 0 || ranked[i - 1].riskScore >= item.riskScore));
  check('the input list is not changed', items.every((item) => item.priorityRank === undefined));
  check('a limit stops the selection early', prioritizeByGreedy(items, 2).length === 2);

  // Ties: equal risk goes to the item with fewer days left, then by name.
  const twin = (id, days) => ({ id, title: id, riskScore: 0.5, estimatedDaysLeft: days });
  const tied = prioritizeByGreedy([twin('b', 5), twin('a', 5), twin('c', 2)]);
  check('a tie on risk goes to the item with fewer days left', tied[0].id === 'c');
  check('a full tie is broken by name, so the order is stable', tied.map((i) => i.id).join('') === 'cab');
  const again = prioritizeByGreedy([twin('a', 5), twin('c', 2), twin('b', 5)]);
  check('the same shelf in a different order ranks identically', again.map((i) => i.id).join('') === 'cab');

  check('discarded items are not eligible', prioritizeByGreedy([{ ...twin('x', 1), discarded: true }, twin('y', 3)]).map((i) => i.id).join('') === 'y');
  check('used-up items are not eligible', prioritizeByGreedy([{ ...twin('x', 1), consumed: true }, twin('y', 3)]).map((i) => i.id).join('') === 'y');
  check('a shelf with only used-up food is empty', prioritizeByGreedy([{ ...twin('x', 1), consumed: true }]).length === 0);

  // The greedy property: each step took the best of what was left at that step.
  let greedy = true;
  for (let trial = 0; trial < 40 && greedy; trial += 1) {
    const random = Array.from({ length: 8 }, (_, i) => twin(`i${i}`, Math.round(Math.random() * 9)));
    random.forEach((item) => { item.riskScore = Math.round(Math.random() * 100) / 100; });
    const order = prioritizeByGreedy(random);
    greedy = order.every((pick, step) => {
      const left = order.slice(step);
      return left.every((other) => other.riskScore <= pick.riskScore + 0.001);
    });
  }
  check('at every step the pick is the riskiest item still left', greedy);

  const why = explainPriority(ranked[0]);
  check('each ranking is explained (days left, spoilage)', why.some((r) => /day/i.test(r)) && why.some((r) => /spoiled/i.test(r)), why.join(' | '));
  check('a badly stored item says so', explainPriority({ storageMismatch: true, estimatedDaysLeft: 5 }).some((r) => /storage/i.test(r)));
  check('a frozen item says its countdown is paused', explainPriority({ frozen: true, estimatedDaysLeft: 9 }).some((r) => /paused/i.test(r)));
}

// ---------------------------------------------------------------------------------
section('E. Content-based recommendations');
{
  const kitchen = shelf(
    raw('tomato', 'tomato', { storage: 'counter', storedDaysAgo: 3, expiresIn: 1, spoilage: 0.5 }),
    raw('eggplant', 'eggplant', { storage: 'counter', storedDaysAgo: 3, expiresIn: 2, spoilage: 0.3 }),
    raw('mango', 'mango', { storage: 'counter', storedDaysAgo: 2, expiresIn: 4 }),
    raw('milk', 'milk', { expiresIn: 6 }),
    raw('eggs', 'eggs', { expiresIn: 9 }),
  );

  const plain = content.recommendForKitchen(kitchen);
  check('a kitchen with matching recipes gets recommendations', plain.status === 'ok' && plain.recipes.length > 0);
  check('every recommendation uses something on the shelf', plain.recipes.every((r) => r.uses.length > 0));
  check('every recommendation says why', plain.recipes.every((r) => r.reasons.length >= 2), plain.recipes[0].reasons.join(' | '));
  check('scores are highest first', plain.recipes.every((r, i) => i === 0 || plain.recipes[i - 1].score >= r.score));
  check('the same shelf always gives the same ranking',
    JSON.stringify(content.recommendForKitchen(kitchen).recipes.map((r) => r.recipe.id)) === JSON.stringify(plain.recipes.map((r) => r.recipe.id)));

  const empty = content.recommendForKitchen([]);
  check('an empty shelf is reported, not silently empty', empty.status === 'empty-inventory' && /empty/i.test(empty.message));
  check('used-up food does not count as being on the shelf', content.recommendForKitchen(shelf(raw('gone', 'tomato', { consumed: true }))).status === 'empty-inventory');

  // A food no recipe uses: the no-match case.
  const inRecipes = new Set(RECIPES.flatMap((r) => r.ingredients));
  const orphan = catalog.getFoods().find((f) => f.id !== 'unknown' && !inRecipes.has(f.id));
  if (orphan) {
    const none = content.recommendForKitchen(shelf(raw('o', orphan.id)));
    check(`a food with no recipe (${orphan.name}) is a no-match with a reason`, none.status === 'no-match' && none.message.includes(orphan.name), none.message);
  } else {
    check('every catalog food appears in at least one recipe', true);
  }

  // Preferences.
  const noEggs = content.recommendForKitchen(kitchen, { taste: { avoided: ['eggs'] }, limit: 40 });
  check('a food the user avoids is never in a recommended recipe',
    noEggs.recipes.length > 0 && noEggs.recipes.every((r) => !r.recipe.ingredients.includes('eggs')));
  const veg = content.recommendForKitchen(kitchen, { taste: { diet: 'vegetarian' }, limit: 40 });
  check('a vegetarian never gets a recipe with meat or fish',
    veg.recipes.length > 0 && veg.recipes.every((r) => r.recipe.ingredients.every((id) => catalog.getFoodById(id).category !== 'Meat')));
  const dismissedTop = plain.recipes[0].recipe.id;
  const afterDismiss = content.recommendForKitchen(kitchen, { taste: { log: [{ recipeId: dismissedTop, action: 'dismissed', at: new Date().toISOString() }] }, limit: 40 });
  check('a dismissed recipe is not offered again', afterDismiss.recipes.every((r) => r.recipe.id !== dismissedTop));
  check('a recipe is excluded with a reason the app can state',
    content.excludedBecause(RECIPES.find((r) => r.ingredients.includes('eggs')), { avoided: ['eggs'] }) === 'avoids Eggs'
      || /avoids/.test(String(content.excludedBecause(RECIPES.find((r) => r.ingredients.includes('eggs')), { avoided: ['eggs'] }))));

  // Every filter rules out every match: say so.
  const eggplantOnly = shelf(raw('e', 'eggplant'));
  const blocked = content.recommendForKitchen(eggplantOnly, { taste: { avoided: ['eggplant'] } });
  check('when preferences rule out every match the message says so',
    blocked.status === 'no-match' && blocked.filteredOut > 0 && /preferences/i.test(blocked.message), blocked.message);

  // Liked foods and cooking history pull the profile.
  const base = content.recommendRecipes(kitchen, { limit: 40 });
  const liked = content.recommendRecipes(kitchen, { limit: 40, taste: { liked: ['mango'] } });
  const simOf = (list, id) => list.find((r) => r.recipe.id === id).similarity;
  check('liking a food raises the similarity of recipes that use it', simOf(liked, 'mango-shake') > simOf(base, 'mango-shake'));
  check('liking a food does not raise recipes that lack it', simOf(liked, 'omelette') <= simOf(base, 'omelette') + 1e-9);

  const now = Date.now();
  const cooked = (daysAgo) => ({ recipeId: 'mango-shake', action: 'cooked', at: new Date(now - daysAgo * DAY).toISOString() });
  const fresh = content.recommendRecipes(kitchen, { limit: 40, taste: { log: [cooked(0)] }, now });
  const stale = content.recommendRecipes(kitchen, { limit: 40, taste: { log: [cooked(60)] }, now });
  check('cooking a recipe pulls similar recipes up', simOf(fresh, 'mango-parfait') > simOf(base, 'mango-parfait'));
  check('an old cooking record counts for less than a recent one', simOf(stale, 'mango-parfait') < simOf(fresh, 'mango-parfait'));
  const viewed = content.recommendRecipes(kitchen, { limit: 40, taste: { log: [{ ...cooked(0), action: 'viewed' }] }, now });
  check('cooking says more than just opening a recipe', simOf(fresh, 'mango-parfait') > simOf(viewed, 'mango-parfait'));
  check('a similar recipe explains the link to what was cooked',
    fresh.find((r) => r.recipe.id === 'mango-parfait').reasons.some((line) => /Similar to Mango Shake/.test(line)),
    fresh.find((r) => r.recipe.id === 'mango-parfait').reasons.join(' | '));
  check('a liked food is named in the reasons', liked.find((r) => r.recipe.id === 'mango-shake').reasons.some((line) => /You like Mango/.test(line)));

  const ideas = content.recommendForKitchen(shelf(raw('o2', 'yogurt', { consumed: true })), { taste: { liked: ['mango'] } });
  check('with nothing to cook, ideas come from the user\'s taste', ideas.ideas.length > 0 && ideas.ideas.every((i) => i.recipe.ingredients.length > 0));
  check('with no taste and nothing to cook there are no ideas', content.recommendForKitchen([]).ideas.length === 0);
  check('a garbage taste value does not crash the recommender', content.recommendForKitchen(kitchen, { taste: { liked: 'x', log: 5, diet: 9 } }).status === 'ok');

  // The meal plan respects the same preferences.
  const { planMeals } = load('services/mealPlan.js');
  const plan = planMeals(kitchen, { recipes: content.eligibleRecipes({ avoided: ['eggs'] }) });
  check('the greedy meal plan honours the user\'s preferences',
    plan.meals.length > 0 && plan.meals.every((m) => !m.recipe.ingredients.includes('eggs')));
}

// ---------------------------------------------------------------------------------
section('A. Food database (administrator changes)');
{
  const before = catalog.getFoodById('tomato');
  const baseline = enrichItem(raw('t', 'tomato', { storage: 'counter', expiresIn: null }));

  catalog.setRemoteFoods([{ ...before, nominalShelfDays: before.nominalShelfDays * 4 }]);
  const edited = enrichItem(raw('t', 'tomato', { storage: 'counter', expiresIn: null }));
  check('an administrator can change a food\'s shelf life', catalog.getFoodById('tomato').nominalShelfDays === before.nominalShelfDays * 4);
  check('the change reaches the shelf-life estimate', edited.estimatedDaysLeft > baseline.estimatedDaysLeft, `${baseline.estimatedDaysLeft} -> ${edited.estimatedDaysLeft}`);
  check('the rest of the food keeps its built-in values', catalog.getFoodById('tomato').bestStorageId === before.bestStorageId);

  const beetroot = { id: 'beetroot', name: 'Beetroot', category: 'Produce', keywords: ['beetroot', 'beet'], refTempC: 4, nominalShelfDays: 10, q10: 2.4, freezeable: false, bestStorageId: 'fridge_top', usageIdeas: ['Roast'], storageTips: ['Trim the leaves'] };
  catalog.setRemoteFoods([beetroot]);
  check('an administrator can add a food', catalog.getFoodById('beetroot').name === 'Beetroot');
  check('an added food is found by its keywords', catalog.findFoodByName('roasted beet').id === 'beetroot');
  check('an added food can be tracked like any other', enrichItem(raw('b', 'beetroot')).estimatedDaysLeft > 0);
  check('the unknown-food fallback is still last', catalog.getFoods().at(-1).id === 'unknown');

  catalog.setRemoteFoods([{ id: 'unknown', name: 'Hacked' }, { name: 'no id' }, null, 'junk']);
  check('the fallback food cannot be replaced', catalog.getFoodById('nope').name === 'Food Item');
  check('malformed entries are ignored', catalog.getRemoteFoods().length === 0);

  let notified = 0;
  const off = catalog.onFoodsChange(() => { notified += 1; });
  catalog.setRemoteFoods([]);
  off();
  catalog.setRemoteFoods([]);
  check('screens are told when the database changes, until they unsubscribe', notified === 1);
  check('clearing the server entries restores the built-in food', catalog.getFoodById('tomato').nominalShelfDays === before.nominalShelfDays);
  check('the bundled foods are recognised as bundled', catalog.isBundledFood('tomato') && !catalog.isBundledFood('beetroot'));

  const { foodFromForm } = load('screens/AdminScreen.js');
  const form = { id: '', name: 'Spring Onion', category: 'Produce', bestStorageId: 'fridge_top', nominalShelfDays: '8', refTempC: '4', q10: '2.2', freezeable: true, keywords: 'spring onion, scallion', usageIdeas: 'Garnish', storageTips: '' };
  const ok = foodFromForm(form, { isNew: true });
  check('the admin form builds a food record', ok.food && ok.food.id === 'spring_onion' && ok.food.keywords.length === 2 && ok.food.nominalShelfDays === 8, JSON.stringify(ok.error || ''));
  check('the form rejects an empty name', Boolean(foodFromForm({ ...form, name: ' ' }, { isNew: true }).error));
  check('the form rejects a zero or negative shelf life', Boolean(foodFromForm({ ...form, nominalShelfDays: '0' }, { isNew: true }).error) && Boolean(foodFromForm({ ...form, nominalShelfDays: '-2' }, { isNew: true }).error));
  check('the form rejects text where a number belongs', Boolean(foodFromForm({ ...form, nominalShelfDays: 'soon' }, { isNew: true }).error));
  check('the form rejects an impossible temperature', Boolean(foodFromForm({ ...form, refTempC: '400' }, { isNew: true }).error));
  check('an existing food keeps its id when edited', foodFromForm({ ...form, id: 'tomato' }, { isNew: false }).food.id === 'tomato');
}

// ---------------------------------------------------------------------------------
section('A. Categories and recipes from the Super Admin console');
{
  catalog.setRemoteCategories([{ name: 'Produce' }, { name: 'Grains' }, 'Snacks', { name: 'All' }, null, { name: '' }]);
  check('a category added on the server becomes a Shelf tab', catalog.CATEGORIES.includes('Grains') && catalog.CATEGORIES.includes('Snacks'));
  check('the bundled categories always stay, with one "All" first',
    catalog.CATEGORIES[0] === 'All' && catalog.CATEGORIES.filter((c) => c === 'All').length === 1 &&
    ['Meat', 'Dairy', 'Pantry', 'Produce'].every((c) => catalog.CATEGORIES.includes(c)));
  catalog.setRemoteCategories([]);
  check('a category removed on the server disappears', !catalog.CATEGORIES.includes('Grains') && catalog.CATEGORIES.length === 5);

  const recipeData = load('data/recipes.js');
  const bundled = RECIPES.length;
  const taho = { id: 'banana-taho', name: 'Banana Taho', ingredients: ['banana', 'milk'], tags: ['filipino', 'dessert'], minutes: 15, summary: 'Warm milk pudding.' };
  const kitchen = shelf(raw('banana', 'banana', { storage: 'counter', storedDaysAgo: 4, expiresIn: 1, spoilage: 0.4 }), raw('milk', 'milk', { expiresIn: 3 }));
  const before = content.recommendForKitchen(kitchen).recipes.map((r) => r.recipe.id);

  recipeData.setRemoteRecipes([taho, { id: 'no-ingredients', name: 'Bad', ingredients: [] }, { name: 'no id' }, null]);
  check('the server dataset replaces the bundled recipes, skipping malformed ones', RECIPES.length === 1 && RECIPES[0].id === 'banana-taho' && Array.isArray(RECIPES[0].optional));
  const after = content.recommendForKitchen(kitchen);
  check('the recommender ranks the new dataset straight away', after.recipes.length === 1 && after.recipes[0].recipe.id === 'banana-taho', after.recipes.map((r) => r.recipe.id).join(','));
  const plan = load('services/mealPlan.js').planMeals(kitchen);
  check('the meal plan uses it too', plan.meals.length === 1 && plan.meals[0].recipe.id === 'banana-taho');

  recipeData.resetRecipes();
  check('the bundled recipes come back', RECIPES.length === bundled);
  check('and so do the bundled recommendations', JSON.stringify(content.recommendForKitchen(kitchen).recipes.map((r) => r.recipe.id)) === JSON.stringify(before));
}

section('B/C. Scan results: low confidence and several foods in one photo');
{
  const { normalizeReview, normalizeObjects } = load('services/cnn.js');
  const pipeline = load('services/scanPipeline.js');
  const { fitContain } = load('components/detection.js');

  check('a server review is passed through', normalizeReview({ level: 'medium', needsConfirmation: true, reasons: ['x'] }, {}).level === 'medium');
  check('without a server review, 95% on a known food is high', normalizeReview(null, { confidence: 0.95, inCatalog: true }).level === 'high');
  check('without a server review, 75% is medium and needs confirming', (() => { const r = normalizeReview(null, { confidence: 0.75, inCatalog: true }); return r.level === 'medium' && r.needsConfirmation; })());
  check('without a server review, 40% is low', normalizeReview(null, { confidence: 0.4, inCatalog: true }).level === 'low');
  check('an unrecognised food is always low', normalizeReview(null, { confidence: 0.99, inCatalog: false }).level === 'low');

  const topK = [
    { label: 'fresh_tomato', foodName: 'tomato', confidence: 0.55 },
    { label: 'rotten_tomato', foodName: 'tomato', confidence: 0.2 },
    { label: 'fresh_mango', foodName: 'mango', confidence: 0.15 },
    { label: 'other', foodName: null, confidence: 0.1 },
  ];
  const choices = pipeline.foodChoicesFromTopK(topK);
  check('runner-up guesses become food choices, without repeats', choices.map((c) => c.foodId).join(',') === 'tomato,mango', choices.map((c) => c.foodId).join(','));
  check('the "other" class is never offered as a food', choices.every((c) => c.foodId !== 'unknown'));

  const draft = { foodId: 'tomato', title: 'Tomato', category: 'Produce', historyNote: 'CNN read it as Tomato (55% confident, low confidence)' };
  const fixed = pipeline.applyFoodChoice(draft, 'mango', { from: 'Tomato' });
  check('a correction changes the food, title and category', fixed.foodId === 'mango' && fixed.title === 'Mango' && fixed.category === 'Produce');
  check('a correction is written into the item\'s history', /corrected Tomato to Mango/.test(fixed.historyNote));
  check('confirming a guess is recorded too', /You confirmed Tomato/.test(pipeline.applyFoodChoice(draft, 'tomato', { from: 'Tomato' }).historyNote));
  check('a corrected item is no longer flagged as unsure', fixed.identityReview === 'confirmed');

  const objects = normalizeObjects([
    { id: 0, source: 'detector', box: [10, 20, 210, 220], detectorLabel: 'tomato', detectorConfidence: 0.9, foodName: 'tomato', confidence: 0.97, topK: [], freshness: 'fresh', freshnessConfidence: 0.99, spoilageScore: 0.01, agreement: 'agrees', review: { level: 'high', needsConfirmation: false, reasons: [] } },
    { id: 1, source: 'detector', box: [300, 40, 480, 260], detectorLabel: 'bitter gourd', detectorConfidence: 0.7, foodName: 'bitter gourd', confidence: 0.62, topK: [], freshness: 'spoiled', freshnessConfidence: 0.91, spoilageScore: 0.9, agreement: 'agrees', review: { level: 'medium', needsConfirmation: true, reasons: ['only 62% confident of the food'] } },
    { id: 2, source: 'detector', box: [50, 300, 200, 420], detectorLabel: 'okra', detectorConfidence: 0.4, foodName: null, confidence: 0.3, topK: [], freshness: 'fresh', freshnessConfidence: 0.7, spoilageScore: 0.3, agreement: 'differs', review: { level: 'low', needsConfirmation: true, reasons: ['not one of the supported foods'] } },
  ]);
  check('detected foods map to catalog foods', objects[0].foodId === 'tomato' && objects[1].foodId === 'bitter_gourd');
  check('a detected food the CNN cannot name has no catalog food', objects[2].foodId === 'unknown' && objects[2].foodName === null);
  check('a rotten detection is marked spoiled', objects[1].isSpoiled === true && objects[0].isSpoiled === false);
  check('garbage from the server gives an empty list', normalizeObjects(undefined).length === 0 && normalizeObjects('x').length === 0);

  const item = pipeline.draftFromObject(objects[1], { imageUri: 'photo.jpg' });
  check('a detected food becomes a shelf item in its own best storage', item.foodId === 'bitter_gourd' && item.storageId === catalog.getFoodById('bitter_gourd').bestStorageId);
  check('the item carries the CNN freshness reading', item.modelFreshness === 'spoiled' && item.cnnSpoilageScore === 0.9);
  check('the item\'s history says it came from a multi-food photo', /several foods/.test(item.historyNote));
  check('a corrected detection records the correction', /corrected Unknown food|corrected an unknown food to Okra/i.test(pipeline.draftFromObject(objects[2], { imageUri: 'p', foodId: 'okra' }).historyNote));
  check('the saved item has no printed date, so its life comes from the models', item.expiryDate === null);

  // Where boxes are drawn: an 800x600 photo shown "contain" in a 400x260 frame.
  const fit = fitContain([800, 600], { width: 400, height: 260 });
  check('boxes are scaled to the displayed photo', Math.abs(fit.scale - 260 / 600) < 1e-9);
  check('the photo is centred in its frame', Math.abs(fit.left - (400 - 800 * fit.scale) / 2) < 1e-9 && fit.top === 0);
  check('no image size means no boxes', fitContain(null, { width: 400, height: 260 }).scale === 0);

  // ---- rendering the result screen in each state
  const Camera = load('screens/CameraScreen.js').CameraScreen;
  const base = {
    loading: false, user: { id: 1, name: 'T', email: 't@example.com', role: 'employee' }, items: [], settings: {}, taste: content.DEFAULT_TASTE,
    addItem: async () => {}, updateItem: async () => {}, prioritized: [], soonToSpoil: [], alerts: [], syncStatus: 'idle',
  };
  setContext(base);

  const cnnFor = (review, extra = {}) => ({
    identity: { foodId: 'tomato', foodName: 'Tomato', confidence: 0.95, topK, model: 'yolov8n-cls', inCatalog: true },
    detection: { used: true, model: 'eref-detector-v1', boxes: [] },
    freshness: { verdict: 'fresh', label: 'Fresh', isSpoiled: false, confidence: 0.99, agreement: true, percent: 99, tier: 'fresh', tierLabel: 'Fresh' },
    spoilage: { spoilageScore: 0.02, detectedIndicators: [], indicators: {}, status: 'ok' },
    review, objects: [], imageSize: [800, 600], ...extra,
  });
  const draftFor = { foodId: 'tomato', title: 'Tomato', category: 'Produce', storageId: 'fridge_top', imageUri: 'photo.jpg', cnnSpoilageScore: 0.02, modelFreshness: 'fresh', historyNote: 'x' };
  const previewOf = (d) => enrichItem({ ...d, imageUri: 'photo.jpg', scannedAt: new Date().toISOString(), createdAt: new Date().toISOString() });
  const result = (cnn, overrides = {}) =>
    render(Camera, { 0: 'result', 1: 'photo.jpg', 8: { ocr: {}, cnn, draftItem: draftFor }, 9: previewOf(draftFor), ...overrides });

  const high = result(cnnFor({ level: 'high', needsConfirmation: false, reasons: [] }));
  check('the result shows how sure it is of the food, with no algorithm name attached',
    /95\s*% sure of the food/.test(high.text) && !/eref-detector-v1|YOLOv8|located by/.test(high.text),
    high.text.match(/\d+\s*% sure[^A-Z]*/)?.[0]);
  check('a confident result shows no warning', !/Not sure|Please check/.test(high.text) && /Add to Shelf/.test(high.text));

  const medium = result(cnnFor({ level: 'medium', needsConfirmation: true, reasons: ['only 75% confident of the food'] }));
  check('a moderately confident result asks the user to check it', /Please check this result/.test(medium.text) && /only 75% confident/.test(medium.text));
  check('it can still be saved without a correction', /Add to Shelf/.test(medium.text) && !/Confirm the food to add it/.test(medium.text));
  check('it offers the runner-up foods', /Tomato\s+55\s*%/.test(medium.text) && /Mango\s+15\s*%/.test(medium.text) && /Something else/.test(medium.text));
  check('it offers a one-tap confirmation', /Yes, it is\s+Tomato/.test(medium.text));

  const low = result(cnnFor({ level: 'low', needsConfirmation: true, reasons: ['the food identity is uncertain (40% confident)'] }));
  check('an uncertain result says the models are not sure', /Not sure what this is/.test(low.text) && /uncertain \(40% confident\)/.test(low.text));
  check('an uncertain result cannot be saved until the user decides', /Confirm the food to add it/.test(low.text));
  check('an uncertain result does not offer a one-tap "yes"', !/Yes, it is/.test(low.text));

  const picked = result(cnnFor({ level: 'low', needsConfirmation: true, reasons: ['x'] }), { 12: 'mango' });
  check('once the user picks a food the warning turns into a confirmation', /You confirmed this is\s+Mango/.test(picked.text) && /Add to Shelf/.test(picked.text));
  check('the screen shows the corrected food', /Mango/.test(picked.text));
  const confirmedOnly = result(cnnFor({ level: 'low', needsConfirmation: true, reasons: ['x'] }), { 13: true });
  check('confirming the guess also unlocks saving', /You confirmed this is\s+Tomato/.test(confirmedOnly.text) && /Add to Shelf/.test(confirmedOnly.text));

  const box = (id, label, level, spoiled = false) => ({
    id, source: 'detector', box: [10 + id * 100, 20, 90 + id * 100, 200], detectorLabel: label, detectorConfidence: 0.9,
    foodId: catalog.findFoodByName(label).id, foodName: label === 'okra' ? null : label[0].toUpperCase() + label.slice(1), confidence: 0.9, topK: [],
    isSpoiled: spoiled, freshnessConfidence: 0.95, freshnessPercent: spoiled ? 10 : 95,
    freshnessTier: spoiled ? 'rotten' : 'fresh', freshnessTierLabel: spoiled ? 'Rotten' : 'Fresh',
    spoilageScore: spoiled ? 0.9 : 0.05, agreement: 'agrees',
    review: { level, needsConfirmation: level !== 'high', reasons: level === 'high' ? [] : ['not sure'] },
  });
  const several = [box(0, 'tomato', 'high'), box(1, 'mango', 'high', true), box(2, 'banana', 'medium')];
  const multi = result(cnnFor({ level: 'high', needsConfirmation: false, reasons: [] }, { objects: several }));
  check('a photo of several foods lists each one', /3\s+foods found/.test(multi.text) && /Tomato/.test(multi.text) && /Mango/.test(multi.text) && /Banana/.test(multi.text));
  check('each food shows its own fresh or rotten reading', /Rotten/.test(multi.text) && /Fresh/.test(multi.text));
  check('the user can add all of them at once', /Add 3 to Shelf/.test(multi.text));
  check('each detected food can be changed', (multi.text.match(/Change/g) || []).length === 3);
  const oneOff = result(cnnFor({ level: 'high', needsConfirmation: false, reasons: [] }, { objects: several }), { 16: { 1: true } });
  check('unticking a food leaves it out of the count', /Add 2 to Shelf/.test(oneOff.text));
  const none = result(cnnFor({ level: 'high', needsConfirmation: false, reasons: [] }, { objects: several }), { 16: { 0: true, 1: true, 2: true } });
  check('with everything unticked nothing can be added', /Tick a food to add/.test(none.text));
  const withUnknown = result(cnnFor({ level: 'high', needsConfirmation: false, reasons: [] }, { objects: [box(0, 'tomato', 'high'), box(1, 'okra', 'low')].map((o, i) => (i ? { ...o, foodId: 'unknown', foodName: null } : o)) }));
  check('an unrecognised food in the photo must be named or unticked', /Unknown food/.test(withUnknown.text) && /Confirm the food to add it/.test(withUnknown.text));
  const named = result(cnnFor({ level: 'high', needsConfirmation: false, reasons: [] }, { objects: [box(0, 'tomato', 'high'), { ...box(1, 'okra', 'low'), foodId: 'unknown', foodName: null }] }), { 15: { 1: 'okra' } });
  check('naming it makes the photo ready to add', /Add 2 to Shelf/.test(named.text));
  const single = result(cnnFor({ level: 'high', needsConfirmation: false, reasons: [] }, { objects: [box(0, 'tomato', 'high')] }));
  check('one detected food keeps the detailed single-item result', /Remaining Food Life/.test(single.text) && !/foods found/.test(single.text));
}

// ---------------------------------------------------------------------------------
section('G. Screens');
{
  const kitchen = shelf(
    raw('tomato', 'tomato', { storage: 'counter', storedDaysAgo: 3, expiresIn: 1, spoilage: 0.6, title: 'Tomato' }),
    raw('eggplant', 'eggplant', { storage: 'counter', storedDaysAgo: 3, expiresIn: 2, title: 'Eggplant' }),
    raw('milk', 'milk', { expiresIn: 9, title: 'Milk' }),
  );
  const at = (daysAgo) => new Date(Date.now() - daysAgo * DAY).toISOString();
  const base = {
    loading: false, user: { id: 1, name: 'Tester', email: 't@example.com', role: 'admin' },
    items: kitchen, settings: { alertsEnabled: true }, taste: content.DEFAULT_TASTE, updateTaste: async () => {}, logRecipe: async () => {},
    prioritized: prioritizeByGreedy(kitchen), soonToSpoil: getSoonToSpoil(kitchen, 3), alerts: [], syncStatus: 'idle', pendingChanges: 0,
    consumeItem: async () => {}, restoreItem: async () => {}, refreshFoodDatabase: async () => {}, foodsVersion: 0,
    archive: [
      { id: 'a1', foodId: 'milk', title: 'Milk', outcome: 'used', resolvedAt: at(1) },
      { id: 'a2', foodId: 'tomato', title: 'Tomato', outcome: 'discarded', resolvedAt: at(2) },
      { id: 'a3', foodId: 'mango', title: 'Mango', outcome: 'used', resolvedAt: at(3) },
    ],
    historyEntries: [
      { id: 'a1-0', itemId: 'a1', foodId: 'milk', title: 'Milk', at: at(3), event: 'Scanned (Shelf)', status: 'used' },
      { id: 'a1-1', itemId: 'a1', foodId: 'milk', title: 'Milk', at: at(1), event: 'Used up — cooked Leche Flan', status: 'used' },
      { id: 'a2-1', itemId: 'a2', foodId: 'tomato', title: 'Tomato', at: at(2), event: 'Discarded', status: 'discarded' },
    ],
  };
  setContext(base);

  const home = render(load('screens/HomeScreen.js').HomeScreen).text;
  check('Home ranks what to use first', /Let's Use this!/.test(home) && /Tomato/.test(home));
  check('Home gives a reason for each ranked item', /Not in its best storage|day/.test(home));
  check('Home shows dashboard totals from the inventory', /On the shelf/.test(home) && /Need\/s attention/.test(home) && /Recipes available/.test(home));
  check('Home links to Recipes and History', /Recipes/.test(home) && /History/.test(home));
  setContext({ ...base, items: [], prioritized: [], soonToSpoil: [] });
  check('Home explains an empty priority list', /Nothing to prioritise yet/.test(render(load('screens/HomeScreen.js').HomeScreen).text));
  setContext(base);

  const recipes = render(load('screens/RecipesScreen.js').RecipesScreen).text;
  check('Recipes recommends for the shelf, with reasons', /Recommended for your shelf/.test(recipes) && /Uses your/.test(recipes));
  check('Recipes shows the match score', /Match\s+\d+\s*%/.test(recipes));
  check('Recipes lets the user set their taste', /Your taste/.test(recipes) && /Vegetarian/.test(recipes) && /Foods I like/.test(recipes) && /Foods to avoid/.test(recipes));
  setContext({ ...base, items: [] });
  const emptyRecipes = render(load('screens/RecipesScreen.js').RecipesScreen).text;
  check('Recipes explains an empty shelf and offers to scan', /Nothing on your shelf/.test(emptyRecipes) && /Scan food/.test(emptyRecipes));
  setContext({ ...base, items: shelf(raw('e', 'eggplant')), taste: { ...content.DEFAULT_TASTE, avoided: ['eggplant'] } });
  check('Recipes explains a no-match caused by preferences', /No matching recipe/.test(render(load('screens/RecipesScreen.js').RecipesScreen).text));
  setContext({ ...base, taste: { ...content.DEFAULT_TASTE, log: [{ recipeId: 'omelette', action: 'cooked', at: at(1) }] } });
  check('Recipes offers to forget the cooking history', /Forget my cooking history/.test(render(load('screens/RecipesScreen.js').RecipesScreen).text));
  setContext(base);

  const history = render(load('screens/HistoryScreen.js').HistoryScreen).text;
  check('History lists every recorded event', /Scanned \(Shelf\)/.test(history) && /Used up/.test(history) && /Discarded/.test(history));
  const archived = render(load('screens/HistoryScreen.js').HistoryScreen, { 0: 'archive' }).text;
  check('History summarises what was used and what was thrown away', /2\s+used\s+·\s+1\s+discarded/.test(archived) && /67\s*%/.test(archived));
  check('History lets the user put food back', /Put back/.test(archived));
  setContext({ ...base, historyEntries: [], archive: [] });
  check('History explains when there is none yet', /No history yet/.test(render(load('screens/HistoryScreen.js').HistoryScreen).text));
  setContext(base);

  const admin = render(load('screens/AdminScreen.js').AdminScreen).text;
  check('Admin shows the food database with the built-in foods', /Food database/.test(admin) && /Tomato/.test(admin) && /BUILT-IN/.test(admin));
  check('Admin can add a food', /Add food/.test(admin));
  setContext({ ...base, user: { ...base.user, role: 'employee' } });
  const denied = render(load('screens/AdminScreen.js').AdminScreen).text;
  check('Admin turns away regular users', /Administrators only/.test(denied) && !/Food database/.test(denied));
  setContext(base);

  const profile = render(load('screens/ProfileScreen.js').ProfileScreen).text;
  check('Profile links to Recipes, History and (for admins) Admin', /Recipes & Taste/.test(profile) && /History/.test(profile) && /Manage the food database/.test(profile));
  setContext({ ...base, user: { ...base.user, role: 'employee' } });
  check('Profile hides Admin from regular users', !/Manage the food database/.test(render(load('screens/ProfileScreen.js').ProfileScreen).text));
  setContext(base);

  const metricsFixtures = require('./fixtures/metrics');
  const metricsText = render(load('screens/MetricsScreen.js').MetricsScreen, { 0: metricsFixtures.report, 3: false, 5: metricsFixtures.detector, 6: metricsFixtures.calibration }).text;
  check('Model Performance shows the YOLOv8 detector measurements', /YOLOv8 food detector/.test(metricsText) && /Right count/.test(metricsText) && /False boxes on non-food objects/.test(metricsText));
  check('Model Performance shows the confidence thresholds and what they cost', /Confidence thresholds/.test(metricsText) && /Unseen foods wrongly named/.test(metricsText) && /90\s*%/.test(metricsText));
  const withoutExtras = render(load('screens/MetricsScreen.js').MetricsScreen, { 0: metricsFixtures.report, 3: false }).text;
  check('an older server without those reports still shows the rest', !/YOLOv8 food detector/.test(withoutExtras));

  const shelfScreen = render(load('screens/ShelfScreen.js').ShelfScreen, { 1: 'tomato' }).text;
  check('an open shelf item offers "Mark as used"', /MARK AS USED/.test(shelfScreen), shelfScreen.length + ' chars');
}

// ---------------------------------------------------------------------------------
section('Registering and editing food by hand');
{
  const { parseTypedDate, draftFromManual } = load('services/manual.js');
  const dayOf = (iso) => (iso ? iso.slice(0, 10) : null);

  check('a day/month/year date is understood', dayOf(parseTypedDate('15/09/2026')) === '2026-09-15');
  check('a year-first date is understood', dayOf(parseTypedDate('2026-09-15')) === '2026-09-15');
  check('a date with a month name is understood', dayOf(parseTypedDate('15 Sep 2026')) === '2026-09-15');
  check('an empty date means "no date"', parseTypedDate('  ') === null);
  check('text that is not a date is not a date', parseTypedDate('soon') === null && parseTypedDate('32/13/2026') === null);

  check('a food must be chosen', /Choose what the food is/.test(draftFromManual({ storageId: 'counter' }).error));
  check('the unknown-food placeholder is not a choice', Boolean(draftFromManual({ foodId: 'unknown' }).error));
  const manual = draftFromManual({ foodId: 'milk', expiryText: '15/09/2026' });
  check('a hand-added food takes the food\'s own best storage by default', manual.draft.storageId === catalog.getFoodById('milk').bestStorageId);
  check('the chosen storage wins', draftFromManual({ foodId: 'milk', storageId: 'freezer' }).draft.storageId === 'freezer');
  check('the typed date is kept', dayOf(manual.draft.expiryDate) === '2026-09-15');
  check('a misspelt date is refused, not guessed', /not understood/.test(draftFromManual({ foodId: 'milk', expiryText: 'tomorrow-ish' }).error));
  check('a hand-added food claims no model reading', manual.draft.modelFreshness === null && manual.draft.cnnSpoilageScore === null && manual.draft.imageUri === null);
  check('its history says it was added by hand', /by hand/.test(manual.draft.historyNote));
  const stamp = () => new Date().toISOString();
  const tracked = enrichItem({ ...manual.draft, id: 'm1', scannedAt: stamp(), createdAt: stamp() });
  check('a hand-added food is tracked like any other', Number.isFinite(tracked.riskScore) && tracked.estimatedDaysLeft !== undefined, `${tracked.daysLabel}`);
  const undated = enrichItem({ ...draftFromManual({ foodId: 'milk' }).draft, id: 'm2', scannedAt: stamp(), createdAt: stamp() });
  check('without a date the estimate still works from type and storage', undated.estimatedDaysLeft > 0);

  const CameraScreen = load('screens/CameraScreen.js').CameraScreen;
  const plainUser = { id: 1, name: 'T', email: 't@example.com' };
  setContext({ loading: false, user: plainUser, items: [], settings: {}, taste: content.DEFAULT_TASTE, addItem: async () => {}, prioritized: [], soonToSpoil: [], alerts: [], syncStatus: 'idle' });
  const capture = render(CameraScreen).text;
  check('the capture step offers to add food by hand', /Add food by hand/.test(capture) && !/Where you keep it/.test(capture));
  const form = render(CameraScreen, { 17: true }).text;
  check('the add-by-hand form asks for food, storage and date', /Where you keep it/.test(form) && /Expiry date \(optional\)/.test(form) && /Choose a food/.test(form));

  const kitchen = shelf(raw('tomato', 'tomato', { title: 'Tomato' }));
  setContext({ loading: false, user: plainUser, items: kitchen, settings: {}, taste: content.DEFAULT_TASTE, freezeItem: async () => {}, discardItem: async () => {}, consumeItem: async () => {}, updateItem: async () => {}, prioritized: [], soonToSpoil: [], alerts: [], syncStatus: 'idle' });
  const detail = render(load('screens/ShelfScreen.js').ShelfScreen, { 1: 'tomato' }).text;
  check('an open shelf item lets the user correct its expiry date', /Edit date/.test(detail) && !/Correct the date for/.test(detail));
  const editing = render(load('screens/ShelfScreen.js').ShelfScreen, { 1: 'tomato', 4: true }).text;
  check('the date editor names the item and offers "No date"', /Correct the date for\s+Tomato/.test(editing) && /No date/.test(editing));

  // A Home category tile lands here already filtered to that category (route param -> activeTab).
  const mixed = shelf(raw('tomato', 'tomato', { title: 'Tomato' }), raw('milk', 'milk', { title: 'Milk' }));
  setContext({ loading: false, user: plainUser, items: mixed, settings: {}, taste: content.DEFAULT_TASTE, freezeItem: async () => {}, discardItem: async () => {}, consumeItem: async () => {}, updateItem: async () => {}, prioritized: [], soonToSpoil: [], alerts: [], syncStatus: 'idle' });
  setRouteParams({ category: 'Dairy' });
  const filtered = render(load('screens/ShelfScreen.js').ShelfScreen).text;
  check('landing from a category tile shows only that category', /Milk/.test(filtered) && !/Tomato/.test(filtered), filtered.match(/Tomato|Milk/g)?.join(','));
  setRouteParams({});
  const unfiltered = render(load('screens/ShelfScreen.js').ShelfScreen).text;
  check('without a category param, everything shows', /Milk/.test(unfiltered) && /Tomato/.test(unfiltered));
}

console.log(failures ? `\n${failures} check(s) failed` : '\nAll checks passed');
process.exit(failures ? 1 : 0);
