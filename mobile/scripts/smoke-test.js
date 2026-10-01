/**
 * Smoke test for the E-REF app.
 *
 *   node scripts/smoke-test.js
 *
 * Checks, in order:
 *   1. every screen renders without throwing
 *   2. the on-device logic (TTI, risk, greedy prioritisation, OCR parsing) is correct
 *   3. the content-based recommender, greedy meal plan, notifications and sync queue
 *   4. the scan pipeline round-trips against the running inference API
 *   5. accounts, label OCR and offline sync against the live server
 *   6. the result, metrics and shelf-detail views render real data
 *
 * Steps 4 to 6 need the API. Start it first:
 *   uvicorn backend.server:app --host 0.0.0.0 --port 8000
 * They are skipped (not failed) when it is unreachable. The password-reset check
 * also needs the server started with EREF_DEV_RETURN_CODE=1 (it is skipped otherwise).
 */

const fs = require('fs');
const path = require('path');
const { load, render, setContext, notificationLog, resetDeviceState, MOBILE_ROOT } = require('./harness');

const API_URL = process.env.EREF_API_URL || 'http://127.0.0.1:8000';
process.env.EXPO_PUBLIC_API_URL = API_URL;

const DATASET = path.resolve(MOBILE_ROOT, '..', 'Datasets', 'dataset', '.training', 'food_multiclass', 'val');

let failures = 0;
let skipped = 0;

function check(label, ok, detail) {
  if (!ok) failures += 1;
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? `  [${detail}]` : ''}`);
}

function section(title) {
  console.log(`\n${title}`);
}

function sampleImage(folder, index = 5) {
  const dir = path.join(DATASET, folder);
  if (!fs.existsSync(dir)) return null;
  const files = fs.readdirSync(dir);
  return files.length ? path.join(dir, files[index % files.length]) : null;
}

const DAY = 86400000;

function kitchenItem(id, foodId, storageId, storedDaysAgo, expiresInDays, spoilage, extra = {}) {
  const t = Date.now();
  return {
    id, foodId, title: id, storageId, category: 'Produce',
    expiryDate: expiresInDays == null ? null : new Date(t + expiresInDays * DAY).toISOString(),
    scannedAt: new Date(t - storedDaysAgo * DAY).toISOString(),
    createdAt: new Date(t - storedDaysAgo * DAY).toISOString(),
    cnnSpoilageScore: spoilage, frozen: false, discarded: false, ...extra,
  };
}

function labelParsingTests() {
  section('Label date parsing');
  const { parseLabelText, formatLabelDate } = load('services/ocr.js');
  const cases = [
    ['MFG: 03/09/2026 EXP: 15/09/2026', '15 Sep 2026', '3 Sep 2026'],
    ['BEST BEFORE 15 SEP 2026', '15 Sep 2026', null],
    ['EXP 15SEP26', '15 Sep 2026', null],
    ['USE BY: SEP 2026', '30 Sep 2026', null],
    ['EXP: 15/O9/2O26', '15 Sep 2026', null],
    ['03/09/2026 15/09/2026', '15 Sep 2026', '3 Sep 2026'],
    ['LOT 12345 EXP 09/2026', '30 Sep 2026', null],
    ['PKD ON: 01 SEP 2026\nBB: 20 SEP 2026', '20 Sep 2026', '1 Sep 2026'],
    ['EXP: SEP 15, 2026 MFG: AUG 20, 2026', '15 Sep 2026', '20 Aug 2026'],
    ['PLU 4011 P12.50 0.99/kg', null, null],
    ['', null, null],
  ];
  for (const [text, expiry, made] of cases) {
    const parsed = parseLabelText(text);
    check(`reads ${JSON.stringify(text).slice(0, 44)}`,
      formatLabelDate(parsed.expiryDate) === expiry && formatLabelDate(parsed.manufacturingDate) === made,
      `expires ${formatLabelDate(parsed.expiryDate)}, made ${formatLabelDate(parsed.manufacturingDate)}`);
  }
  check('warns when the manufacture date is after the expiry date',
    parseLabelText('MFD 15/09/2026 EXP 03/09/2026').warnings.length === 1);
  check('a printed date runs to the end of its day',
    new Date(parseLabelText('EXP 15/09/2026').expiryDate).getHours() === 23);
}

function recommenderTests() {
  section('Content-based recommendations and greedy meal plan');
  const enrich = load('services/enrich.js');
  const { recommendRecipes } = load('services/contentBased.js');
  const { planMeals } = load('services/mealPlan.js');
  const { RECIPES } = load('data/recipes.js');
  const { FOOD_CATALOG } = load('data/foodCatalog.js');

  const known = new Set(FOOD_CATALOG.map((f) => f.id));
  check('every recipe ingredient is a real catalog food',
    RECIPES.every((r) => [...r.ingredients, ...(r.optional || [])].every((id) => known.has(id))));
  const uncooked = FOOD_CATALOG.filter((f) => f.id !== 'unknown' && !RECIPES.some((r) => r.ingredients.includes(f.id)));
  check('every supported food appears in at least one recipe', uncooked.length === 0, uncooked.map((f) => f.id).join(', '));

  const kitchen = enrich.enrichAll([
    kitchenItem('eggplant', 'eggplant', 'counter', 4, 1, 0.5),
    kitchenItem('tomato', 'tomato', 'counter', 4, 2, 0.3),
    kitchenItem('bitter', 'bitter_gourd', 'fridge_top', 1, 5, 0.1),
    kitchenItem('okra', 'okra', 'fridge_top', 1, 6, 0.1),
    kitchenItem('eggs', 'eggs', 'fridge_top', 3, 20, 0.02),
  ]);
  const top = recommendRecipes(kitchen, { limit: 5 });
  check('every recommendation uses something in the kitchen', top.length > 0 && top.every((r) => r.uses.length > 0));
  check('the best recipe rescues the item closest to spoiling',
    top[0].rescues.some((item) => item.id === 'eggplant'), `${top[0].recipe.name}`);
  check('recipes are ranked by descending score', top.every((r, i) => i === 0 || top[i - 1].score >= r.score));
  check('similarity, coverage and availability are each within 0-1',
    top.every((r) => [r.similarity, r.coverage, r.availability].every((v) => v >= 0 && v <= 1.0000001)));
  check('a recipe lists the ingredients still to buy',
    recommendRecipes(kitchen, { limit: 30 }).some((r) => r.missing.length > 0));
  check('an empty kitchen gets no recommendations', recommendRecipes([]).length === 0);
  check('discarded food is never recommended',
    recommendRecipes(enrich.enrichAll([kitchenItem('x', 'eggplant', 'counter', 1, 1, 0.5, { discarded: true })])).length === 0);

  const atRisk = enrich.enrichAll([
    kitchenItem('eggplant', 'eggplant', 'counter', 4, 1, 0.5),
    kitchenItem('tomato', 'tomato', 'counter', 4, 2, 0.3),
    kitchenItem('banana', 'banana', 'counter', 4, 1, 0.6),
    kitchenItem('milk', 'milk', 'fridge_bottom', 2, 3, 0.1),
    kitchenItem('eggs', 'eggs', 'fridge_top', 1, 20, 0.02),
  ]);
  const plan = planMeals(atRisk, { maxMeals: 3 });
  const covered = plan.meals.flatMap((meal) => meal.covers.map((item) => item.id));
  check('the meal plan rescues all of the at-risk food', plan.uncovered.length === 0,
    plan.meals.map((m) => m.recipe.name).join(' + '));
  check('no item is planned into two different meals', new Set(covered).size === covered.length);
  check('the first meal needs nothing more to be bought', plan.meals[0].missing.length === 0);
  check('frozen food is left out of the plan',
    planMeals(enrich.enrichAll([kitchenItem('f', 'eggplant', 'freezer', 1, 1, 0.5, { frozen: true })])).meals.length === 0);

  // Greedy set cover: the recipe that covers the most risk goes first, so two foods
  // that one recipe uses together need one meal, not two.
  const twoFoods = enrich.enrichAll([
    kitchenItem('tomato', 'tomato', 'counter', 4, 1, 0.6),
    kitchenItem('okra', 'okra', 'counter', 4, 1, 0.6),
  ]);
  const custom = [
    { id: 'tomato-only', name: 'T', ingredients: ['tomato'], tags: [], minutes: 5, summary: '' },
    { id: 'okra-only', name: 'O', ingredients: ['okra'], tags: [], minutes: 5, summary: '' },
    { id: 'both', name: 'B', ingredients: ['tomato', 'okra'], tags: [], minutes: 30, summary: '' },
  ];
  const greedy = planMeals(twoFoods, { recipes: custom });
  check('greedy picks the recipe that covers the most risk first',
    greedy.meals.length === 1 && greedy.meals[0].recipe.id === 'both',
    greedy.meals.map((m) => m.recipe.id).join(','));
}

async function notificationTests() {
  section('Notifications');
  const { planNotifications, syncNotifications } = load('services/notifications.js');
  const enrich = load('services/enrich.js');

  const local = (day, hour, minute = 0) => new Date(2026, 8, day, hour, minute, 0);
  const base = { title: 'Milk', urgency: 'low', daysLabel: '2 days left', recommendations: { primaryAction: { label: 'Consume Soon' } } };
  const at = local(24, 12);
  const daysUntil = (date) => (date.getTime() - at.getTime()) / DAY;
  const plan = (item, options = {}) => planNotifications([{ ...base, id: 'a', ...item }], { now: at, leadHours: 24, ...options });

  const quiet = plan({ estimatedDaysLeft: daysUntil(local(26, 3)) });
  const warning = quiet.find((entry) => entry.kind === 'soon');
  check('a warning that would land overnight waits until 7:30 that morning',
    warning && warning.at.getTime() === local(25, 7, 30).getTime(), warning && warning.at.toString());
  check('an alert that would only arrive after expiry is dropped', !quiet.some((entry) => entry.kind === 'expires'));

  const normal = plan({ estimatedDaysLeft: 3 });
  const soon = normal.find((entry) => entry.kind === 'soon');
  const expires = normal.find((entry) => entry.kind === 'expires');
  check('an item with 3 days left is warned about a day before it ends',
    soon && soon.at.getTime() === local(26, 12).getTime(), soon && soon.at.toString());
  check('a second alert fires at the moment it expires',
    expires && expires.at.getTime() === local(27, 12).getTime());
  check('an expired item is shown immediately', plan({ estimatedDaysLeft: -1 }).some((e) => e.kind === 'expired' && e.at === null));
  const critical = plan({ estimatedDaysLeft: 0.5, urgency: 'critical' });
  check('a critical item is shown immediately, once',
    critical.filter((e) => e.at === null).length === 1 && critical.some((e) => e.kind === 'critical'));
  check('an item already inside the warning window is shown immediately',
    plan({ estimatedDaysLeft: 0.5, urgency: 'high' }).some((e) => e.kind === 'soon' && e.at === null));
  check('the warning lead time can be changed',
    plan({ estimatedDaysLeft: 3 }, { leadHours: 48 }).find((e) => e.kind === 'soon').at.getTime() === local(25, 12).getTime());
  check('frozen, discarded and undated items are never alerted',
    [{ frozen: true }, { discarded: true }, { estimatedDaysLeft: null }].every((extra) => plan({ estimatedDaysLeft: 1, ...extra }).length === 0));

  const many = planNotifications(
    Array.from({ length: 100 }, (_, n) => ({ ...base, id: `m${n}`, estimatedDaysLeft: 2 + n / 100 })), { now: at });
  check('no more than 60 alerts are scheduled (the iOS limit is 64)',
    many.filter((e) => e.at).length === 60, `${many.filter((e) => e.at).length}`);

  resetDeviceState();
  const items = enrich.enrichAll([
    kitchenItem('old', 'tomato', 'counter', 10, -2, 0.6),
    kitchenItem('fresh', 'apple', 'fridge_top', 1, 20, 0.02),
  ]);
  const first = await syncNotifications(items, { enabled: true, leadHours: 24 });
  check('an expired item is shown on the device straight away',
    first.shown === 1 && /has expired/.test(notificationLog.shown[0].content.title));
  check('the user is asked for permission once there is something to alert about', notificationLog.permission === 'granted');
  check('upcoming alerts are scheduled on the device',
    first.scheduled > 0 && notificationLog.scheduled.length === first.scheduled);
  check('scheduled alerts carry the item they are about',
    notificationLog.scheduled.every((n) => n.content.data.itemId && n.trigger.type === 'date'));
  const second = await syncNotifications(items, { enabled: true, leadHours: 24 });
  check('the same alert is not shown twice in one day', second.shown === 0 && notificationLog.shown.length === 1);
  const off = await syncNotifications(items, { enabled: false });
  check('turning alerts off clears everything scheduled', off.scheduled === 0 && notificationLog.scheduled.length === 0);

  resetDeviceState();
  await syncNotifications([], { enabled: true });
  check('no permission prompt while there is nothing to alert about', notificationLog.permission === 'undetermined');
}

function syncQueueTests() {
  section('Offline sync queue');
  const sync = load('services/inventorySync.js');
  let queue = sync.queuePut([], { id: 'a', v: 1 });
  queue = sync.queuePut(queue, { id: 'a', v: 2 });
  check('a second edit of an item replaces the first in the queue', queue.length === 1 && queue[0].item.v === 2);
  queue = sync.queuePut(queue, { id: 'b', v: 1 });
  queue = sync.queueDelete(queue, 'a');
  check('deleting an item cancels its queued edits',
    queue.length === 2 && queue.some((op) => op.type === 'delete' && op.id === 'a') && !queue.some((op) => op.type === 'put' && op.item.id === 'a'));
  check('every queued change has its own id', new Set(queue.map((op) => op.opId)).size === queue.length);
  const merged = sync.applyPending([{ id: 'a', updatedAt: '1' }, { id: 'c', updatedAt: '2' }], queue);
  check('unsent changes are applied over the server copy',
    merged.map((item) => item.id).sort().join() === 'b,c', merged.map((item) => item.id).join());
}

async function apiReachable() {
  try {
    const response = await fetch(`${API_URL}/health`, { signal: AbortSignal.timeout(5000) });
    return response.ok;
  } catch {
    return false;
  }
}

async function main() {
  console.log(`E-REF smoke test  (API: ${API_URL})`);

  // ---------------------------------------------------------------- logic
  section('On-device logic');
  const tti = load('services/tti.js');
  const risk = load('services/riskScore.js');
  const prioritize = load('services/prioritize.js');
  const ocr = load('services/ocr.js');
  const enrich = load('services/enrich.js');

  const now = new Date('2026-09-22T12:00:00Z');
  const elapsed = tti.computeTTI({
    nominalShelfDays: 7, refTempC: 4, storageTempC: 4, q10: 2.5,
    storedSince: '2026-09-19T12:00:00Z', now,
  });
  const shelf = tti.estimateShelfLife({
    expiryDate: '2026-09-19T12:00:00Z', ttiRemainingDays: elapsed.remainingLifeDays, now,
  });
  check('a past printed expiry reports negative days left', shelf.estimatedDaysLeft < 0,
    `${shelf.estimatedDaysLeft} days`);

  const cold = tti.computeTTI({ nominalShelfDays: 7, refTempC: 4, storageTempC: 2, q10: 2.5, storedSince: '2026-09-20T12:00:00Z', now });
  const warm = tti.computeTTI({ nominalShelfDays: 7, refTempC: 4, storageTempC: 25, q10: 2.5, storedSince: '2026-09-20T12:00:00Z', now });
  check('warm storage consumes shelf life faster than cold',
    warm.remainingLifeDays < cold.remainingLifeDays, `${warm.remainingLifeDays} < ${cold.remainingLifeDays}`);

  const frozen = tti.computeTTI({ nominalShelfDays: 7, refTempC: 4, storageTempC: -18, q10: 2.5, storedSince: '2026-09-15T12:00:00Z', now, frozen: true });
  check('freezing nearly pauses the countdown', frozen.frozen && frozen.remainingLifeDays > 6,
    `${frozen.remainingLifeDays} days left`);

  const spoiled = risk.computeWeightedRisk({ daysToExpiry: 10, ttiFreshnessRatio: 0.9, cnnSpoilageScore: 1, storageMismatch: false });
  check('a confidently rotten item is critical despite a future expiry',
    spoiled.urgency === 'critical', `risk ${spoiled.riskScore}`);

  const healthy = risk.computeWeightedRisk({ daysToExpiry: 20, ttiFreshnessRatio: 1, cnnSpoilageScore: 0.02, storageMismatch: false });
  check('a fresh, well-stored item is low risk', healthy.urgency === 'low', `risk ${healthy.riskScore}`);

  const uncertain = risk.computeWeightedRisk({ daysToExpiry: 10, ttiFreshnessRatio: 0.9, cnnSpoilageScore: 0.6, storageMismatch: false });
  check('an uncertain spoilage score does not force critical', uncertain.urgency !== 'critical', uncertain.urgency);

  const ranked = prioritize.prioritizeByGreedy([
    { id: 'low', riskScore: 0.2, title: 'Low' },
    { id: 'high', riskScore: 0.9, title: 'High' },
    { id: 'mid', riskScore: 0.55, title: 'Mid' },
  ]);
  check('greedy prioritisation orders by descending risk',
    ranked.map((i) => i.id).join('>') === 'high>mid>low', ranked.map((i) => i.id).join('>'));

  const parsed = ocr.parseLabelText('PRODUCT: MILK\nMFG: 09/15/2026\nEXP: 09/30/2026');
  const expiry = new Date(parsed.expiryDate);
  check('OCR extracts expiry, manufacture date and product hint',
    expiry.getDate() === 30 && expiry.getMonth() === 8 && parsed.productHint === 'milk');
  check('OCR rejects an impossible date', ocr.parseLabelText('EXP: 31/02/2026').expiryDate === null);

  labelParsingTests();
  recommenderTests();
  await notificationTests();
  syncQueueTests();

  // ------------------------------------------------------------- screens
  section('Screen rendering');
  const seed = [{
    id: 'seed-1', foodId: 'tomato', title: 'Tomato', category: 'Produce', storageId: 'fridge_top',
    imageUri: null,
    expiryDate: new Date(Date.now() + 2 * 86400000).toISOString(),
    scannedAt: new Date(Date.now() - 86400000).toISOString(),
    createdAt: new Date(Date.now() - 86400000).toISOString(),
    cnnSpoilageScore: 0.95, cnnIdentityConfidence: 0.99,
    modelFreshness: 'spoiled', modelFreshnessConfidence: 0.99, modelLabel: 'rotten_tomato',
    frozen: false, discarded: false,
    history: [{ at: new Date().toISOString(), event: 'Scanned (Shelf)' }],
  }];
  const items = enrich.enrichAll(seed);

  const baseContext = {
    loading: false,
    user: { name: 'Tester', email: 'tester@example.com' },
    items,
    settings: { alertsEnabled: true },
    updateSettings: async () => {},
    prioritized: prioritize.prioritizeByGreedy(items),
    soonToSpoil: prioritize.getSoonToSpoil(items, 3),
    alerts: [{
      id: 'alert-seed-1', itemId: 'seed-1', title: 'Tomato', message: 'Tomato is critical.',
      urgency: 'critical', riskScore: 1, read: false, createdAt: new Date().toISOString(),
    }],
    unreadAlertCount: 1,
    addItem: async () => {}, updateItem: async () => {}, freezeItem: async () => {},
    discardItem: async () => {}, removeItem: async () => {},
    signIn: async () => {}, signOut: async () => {},
    markAlertRead: () => {}, markAllAlertsRead: () => {},
    exportInventory: () => '',
    getItemById: (id) => items.find((item) => item.id === id) || null,
    signUp: async () => {}, syncStatus: 'idle', pendingChanges: 0, refresh: async () => {},
  };
  setContext(baseContext);

  const screens = [
    'HomeScreen', 'ShelfScreen', 'CameraScreen', 'AlertsScreen', 'ProfileScreen',
    'MetricsScreen', 'AuthScreen', 'ForgotPasswordScreen', 'VerifyCodeScreen',
    'CreateNewPasswordScreen', 'PasswordSuccessScreen',
  ];

  for (const name of screens) {
    try {
      const Component = load(path.join('screens', `${name}.js`))[name];
      if (typeof Component !== 'function') throw new Error(`export ${name} is ${typeof Component}`);
      const { nodeCount } = render(Component);
      check(name, nodeCount > 0, `${nodeCount} nodes`);
    } catch (error) {
      check(name, false, error.message);
    }
  }

  const HomeScreen = load('screens/HomeScreen.js').HomeScreen;
  const home = render(HomeScreen);
  check('Home offers a "Let\'s Cook this!" meal plan for food at risk', home.text.includes("Let's Cook this!") && home.text.includes('Main Ingredient:'));
  setContext({ ...baseContext, items: [], soonToSpoil: [] });
  check('Home explains the meal plan when the kitchen is empty', render(HomeScreen).text.includes('Scan some food'));
  setContext({ ...baseContext, syncStatus: 'offline', pendingChanges: 2 });
  check('Home warns when changes are waiting to sync', /2\s+change\s*s\s+will sync/.test(render(HomeScreen).text));
  setContext(baseContext);

  // A new account starts with nothing on the shelf, so every screen must cope with that.
  setContext({ ...baseContext, items: [], prioritized: [], soonToSpoil: [], alerts: [], unreadAlertCount: 0 });
  for (const name of ['ShelfScreen', 'AlertsScreen', 'HomeScreen', 'CameraScreen', 'ProfileScreen']) {
    try {
      const empty = render(load(path.join('screens', `${name}.js`))[name]);
      check(`${name} renders with an empty shelf`, empty.nodeCount > 0, `${empty.nodeCount} nodes`);
    } catch (error) {
      check(`${name} renders with an empty shelf`, false, error.message);
    }
  }
  setContext(baseContext);

  const profile = render(load('screens/ProfileScreen.js').ProfileScreen).text;
  check('Profile shows the signed-in account, not a placeholder',
    profile.includes('tester@example.com') && !profile.includes('lathrell@gmail.com'));
  check('Profile lets the user choose when to be warned', profile.includes('Warn me before expiry'));
  check('Profile can send a test alert', profile.includes('Send a test alert'));

  check('the verify screen no longer shows a hard-coded email',
    !render(load('screens/VerifyCodeScreen.js').VerifyCodeScreen).text.includes('thisisyourmail123'));
  const NewPassword = load('screens/CreateNewPasswordScreen.js').CreateNewPasswordScreen;
  check('changing a password (signed in) asks for the current one',
    render(NewPassword, {}, { navigation: {}, route: { params: {} } }).text.includes('Current Password'));
  check('resetting with an emailed code does not',
    !render(NewPassword, {}, { navigation: {}, route: { params: { resetToken: 'x' } } }).text.includes('Current Password'));

  const Camera = load('screens/CameraScreen.js').CameraScreen;
  const reviewing = render(Camera, { 0: 'review', 1: 'photo.jpg' });
  check('the review step can scan a package label', reviewing.text.includes('Scan label') && reviewing.text.includes('Package Label'));
  const scanned = load('services/ocr.js').parseLabelText('EXP: 15/09/2026');
  check('a scanned label shows the dates it found',
    render(Camera, { 0: 'review', 1: 'photo.jpg', 4: 'EXP: 15/09/2026', 11: scanned }).text.includes('Expires 15 Sep 2026'));

  setContext({ ...baseContext, loading: true, user: null });
  check('the app shows a loading state while it restores the session', render(load('App.js').default).nodeCount > 0);
  setContext({ ...baseContext, user: null });
  check('the app shows the sign-in flow when signed out', render(load('App.js').default).nodeCount > 0);
  setContext(baseContext);

  try {
    const App = load('App.js').default;
    const { nodeCount } = render(App);
    check('App (navigation)', nodeCount > 0, `${nodeCount} nodes`);
  } catch (error) {
    check('App (navigation)', false, error.message);
  }

  try {
    const AppNavigator = load('navigation/AppNavigator.js').default;
    const { nodeCount } = render(AppNavigator);
    check('AppNavigator (tab bar with alert badge)', nodeCount > 0, `${nodeCount} nodes`);
  } catch (error) {
    check('AppNavigator (tab bar with alert badge)', false, error.message);
  }

  // ------------------------------------------------------- API-backed flow
  if (!(await apiReachable())) {
    section('Inference API');
    console.log(`  SKIP  API not reachable at ${API_URL} — start it with:`);
    console.log('        uvicorn backend.server:app --host 0.0.0.0 --port 8000');
    skipped += 1;
    return;
  }

  section('Scan pipeline (live inference)');
  const scan = load('services/scanPipeline.js');
  const metricsService = load('services/metrics.js');
  const cnn = load('services/cnn.js');

  section('Freshness tiers');
  check('70% and above is Fresh', cnn.freshnessTierFromPercent(70) === 'fresh' && cnn.freshnessTierFromPercent(100) === 'fresh');
  check('30% up to 69% is Sub Fresh', cnn.freshnessTierFromPercent(30) === 'subfresh' && cnn.freshnessTierFromPercent(69) === 'subfresh');
  check('below 30% is Rotten', cnn.freshnessTierFromPercent(29) === 'rotten' && cnn.freshnessTierFromPercent(0) === 'rotten');

  // Tomato and orange are the regression cases: the COCO detector labels a
  // tomato as an apple/orange/donut, and when its crop fed the CNN, tomatoes were
  // misidentified as oranges. Several samples each, so one lucky image can't pass.
  const cases = [
    ['fresh_apples', 'Apple', 'fresh'],
    ['rotten_banana', 'Banana', 'spoiled'],
    ['rotten_tomato', 'Tomato', 'spoiled'],
    ['fresh_tomato', 'Tomato', 'fresh'],
    ['fresh_oranges', 'Orange', 'fresh'],
    ['rotten_oranges', 'Orange', 'spoiled'],
  ];

  let lastAnalysis = null;
  let lastPreview = null;
  let lastImage = null;

  for (const [folder, expectedFood, expectedFreshness] of cases) {
    const image = sampleImage(folder);
    if (!image) {
      check(`${folder} sample available`, false, 'dataset folder missing');
      continue;
    }
    const result = await scan.analyzeScan({ imageUri: image, category: 'Produce', storageId: 'fridge_top' });
    const preview = enrich.enrichItem({
      ...result.draftItem,
      scannedAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
    });
    lastAnalysis = result;
    lastPreview = preview;
    lastImage = image;

    check(`${folder}: identified as ${expectedFood}`,
      result.cnn.identity.foodName === expectedFood,
      `${result.cnn.identity.foodName} @ ${(result.cnn.identity.confidence * 100).toFixed(1)}%`);
    check(`${folder}: freshness is ${expectedFreshness}`,
      result.cnn.freshness.verdict === expectedFreshness,
      `${result.cnn.freshness.label} @ ${(result.cnn.freshness.confidence * 100).toFixed(1)}%`);
    check(`${folder}: the freshness tier matches the freshness percent`,
      result.cnn.freshness.tier === cnn.freshnessTierFromPercent(result.cnn.freshness.percent),
      `${result.cnn.freshness.tierLabel} @ ${result.cnn.freshness.percent.toFixed(1)}%`);
    check(`${folder}: all three pipeline stages ran`,
      result.cnn.stages.length === 3, result.cnn.stages.map((s) => s.name).join(' > '));
    check(`${folder}: the result says how far to trust it`,
      ['high', 'medium', 'low'].includes(result.cnn.review.level) && Array.isArray(result.cnn.review.reasons),
      `${result.cnn.review.level}${result.cnn.review.reasons.length ? ` (${result.cnn.review.reasons[0]})` : ''}`);
    check(`${folder}: the frame's foods come back as objects with boxes and reviews`,
      result.cnn.objects.length >= 1 && result.cnn.objects.every((o) => o.review && o.foodId) && Array.isArray(result.cnn.imageSize),
      `${result.cnn.objects.length} object(s), ${result.cnn.objects.map((o) => o.foodName || 'unknown').join(', ')}`);
    check(`${folder}: the draft item carries what the models said into its history`,
      /Identified as/.test(result.draftItem.historyNote));
  }

  section('Multiple angles of one item');
  {
    const front = sampleImage('fresh_tomato');
    const back = sampleImage('rotten_tomato');
    if (front && back) {
      const single = await scan.analyzeScan({ imageUri: front, category: 'Produce', storageId: 'fridge_top' });
      const combined = await scan.analyzeScan({
        imageUri: front, extraImageUris: [back], category: 'Produce', storageId: 'fridge_top',
      });
      check('a second, rotten-looking angle drags the freshness down',
        combined.cnn.freshness.percent < single.cnn.freshness.percent,
        `front alone ${single.cnn.freshness.percent.toFixed(1)}% -> with a rotten back ${combined.cnn.freshness.percent.toFixed(1)}%`);
      check('the worse angle is what the final tier is based on',
        combined.cnn.freshness.percent === Math.min(...combined.cnn.angles.map((a) => a.freshnessPercent)));
      check('both angles are reported, in the order given',
        combined.cnn.anglesChecked === 2 && combined.cnn.angles.length === 2 &&
        combined.cnn.angles[0].imageUri === front && combined.cnn.angles[1].imageUri === back);
      check('the item is still identified as the same food',
        combined.draftItem.foodId === single.draftItem.foodId);
      check('one photo (no extra angles) is unaffected by the new code path',
        single.cnn.anglesChecked === 1 && single.cnn.angles.length === 1);
    } else {
      check('fresh_tomato and rotten_tomato samples available', false, 'dataset folder missing');
    }
  }

  section('Tomato vs orange');
  for (const [folder, expectedFood] of [
    ['fresh_tomato', 'Tomato'], ['rotten_tomato', 'Tomato'],
    ['fresh_oranges', 'Orange'], ['rotten_oranges', 'Orange'],
  ]) {
    let correct = 0;
    const samples = 12;
    for (let i = 0; i < samples; i += 1) {
      const image = sampleImage(folder, i * 7);
      if (!image) break;
      const result = await scan.analyzeScan({ imageUri: image, category: 'Produce', storageId: 'fridge_top' });
      if (result.cnn.identity.foodName === expectedFood) correct += 1;
    }
    check(`${folder}: identified as ${expectedFood} in ${samples}/${samples} samples`,
      correct === samples, `${correct}/${samples}`);
  }

  section('Result view');
  const CameraScreen = load('screens/CameraScreen.js').CameraScreen;
  // useState order: step, imageUri, category, storageId, labelText,
  // foodNameOverride, flags, busy, analysis, preview
  const resultView = render(CameraScreen, { 0: 'result', 1: lastImage, 8: lastAnalysis, 9: lastPreview });

  // Required by the simplified result screen: food name, fresh/rotten, dates (if any),
  // visible indicators, remaining shelf life, and recommendations — nothing else.
  check('shows the food name', resultView.text.includes(lastPreview.title));
  check('shows the freshness verdict', /Fresh|Rotten/.test(resultView.text));
  const hasDates = Boolean(lastAnalysis.ocr?.expiryDate || lastAnalysis.ocr?.manufacturingDate);
  check('shows expiry/manufactured dates when available', !hasDates || resultView.text.includes('Dates'));
  for (const needle of ['Discoloration', 'Texture issues', 'Packaging damage', 'Mold spots', 'Excess moisture']) {
    check(`lists the "${needle}" indicator`, resultView.text.includes(needle));
  }
  check('shows remaining food life in days', resultView.text.includes('Remaining Food Life') && resultView.text.includes(lastPreview.daysLabel));
  check('shows the "Recommendations" section', resultView.text.includes('Recommendations'));
  check('shows how to store the food (Storage & Preservation)', resultView.text.includes('Storage & Preservation'));
  check('names the recommended storage location', Boolean(lastPreview.recommendations.bestPractice?.storageLabel) &&
    resultView.text.includes(lastPreview.recommendations.bestPractice.storageLabel));
  check('states whether the item can be frozen', resultView.text.includes('Can be frozen') || resultView.text.includes('Do not freeze'));

  // Explicitly removed per request: algorithm/model names and raw technical framing.
  for (const needle of ['YOLOv8', 'CNN', 'OCR', 'TTI', 'Pipeline', 'yolov8n', 'mobilenetv2', 'eref-detector-v1', 'located by']) {
    check(`no longer shows "${needle}"`, !resultView.text.includes(needle));
  }

  section('Metrics view');
  try {
    const report = await metricsService.fetchMetrics();
    const health = await metricsService.fetchHealth();
    const MetricsScreen = load('screens/MetricsScreen.js').MetricsScreen;
    // useState order: report, health, error, loading, refreshing
    const view = render(MetricsScreen, { 0: report, 1: health, 3: false });

    for (const label of ['Accuracy', 'Precision', 'Recall', 'F1 Score']) {
      check(`shows the ${label} tile`, view.text.includes(label));
    }
    const unmeasured = report.dataset.foodsWithoutIndependentImages || [];
    check('report excludes training duplicates', report.dataset.trainDuplicatesExcluded === true,
      `${report.dataset.excludedTrainDuplicates} excluded`);
    check('screen warns about foods with no independent test images',
      unmeasured.length === 0 || view.text.includes('Some foods are not measured'),
      unmeasured.join(', ') || 'none unmeasured');
    check('reports all three evaluated tasks', report.tasks.length === 3,
      report.tasks.map((t) => t.key).join(', '));
    for (const task of report.tasks) {
      check(`${task.key}: scores are in range`,
        [task.accuracy, task.precision, task.recall, task.f1].every((v) => v > 0 && v <= 1),
        `acc ${(task.accuracy * 100).toFixed(2)}% · P ${(task.precision * 100).toFixed(2)}% · ` +
        `R ${(task.recall * 100).toFixed(2)}% · F1 ${(task.f1 * 100).toFixed(2)}%`);
    }

    const errorView = render(MetricsScreen, { 0: null, 2: 'offline', 3: false });
    check('renders a retry path when metrics are unavailable',
      errorView.text.includes('Metrics unavailable') && errorView.text.includes('Try Again'));
  } catch (error) {
    check('metrics report loads', false, error.message);
  }

  section('Shelf detail');
  const ShelfScreen = load('screens/ShelfScreen.js').ShelfScreen;
  // useState order: activeTab, selectedId, searchOpen, query
  const detail = render(ShelfScreen, { 0: 'All', 1: 'seed-1', 2: false, 3: '' });
  check('detail modal shows tracking history', detail.text.includes('Tracking History'));
  check('detail modal offers storage relocation', detail.text.includes('Storage Location'));
  check('detail modal offers freezing', detail.text.includes('FREEZE NOW'));

  const noMatch = render(ShelfScreen, { 0: 'All', 1: null, 2: true, 3: 'zzzz-no-match' });
  check('search shows an empty state when nothing matches', noMatch.text.includes('Nothing matches'));
  const match = render(ShelfScreen, { 0: 'All', 1: null, 2: true, 3: 'tomato' });
  check('search matches an item by name', match.text.includes('Tomato'));

  await liveServerTests();
}

async function liveServerTests() {
  section('Accounts, OCR and sync (live server)');
  const authApi = load('services/auth.js');
  const session = load('services/session.js');
  const api = load('services/api.js');
  const sync = load('services/inventorySync.js');
  const ocr = load('services/ocr.js');
  const scan = load('services/scanPipeline.js');
  const apiConfig = load('services/apiConfig.js');

  resetDeviceState();
  const email = `smoke-${Date.now()}@example.com`;
  const password = 'smoke test password';

  const registered = await authApi.register({ name: 'Smoke Tester', email, password });
  await session.saveToken(registered.token);
  check('sign-up creates an account and returns a session', Boolean(registered.token) && registered.user.email === email);
  check('the session token is kept in secure storage', session.getToken() === registered.token);
  check('the saved session is recognised by the server', (await authApi.fetchMe()).user.email === email);

  let refused = null;
  try {
    await authApi.login({ email, password: 'not the password' });
  } catch (error) {
    refused = error;
  }
  check('a wrong password is refused in plain language',
    refused instanceof api.ApiError && refused.status === 401 && refused.message === 'Incorrect email or password.');

  let signedOut = 0;
  api.setUnauthorizedHandler(() => { signedOut += 1; });
  await session.saveToken('not-a-real-token');
  await authApi.fetchMe().catch(() => {});
  check('a rejected session tells the app to sign the user out', signedOut === 1);
  await session.saveToken(registered.token);
  api.setUnauthorizedHandler(null);

  const forgot = await authApi.forgotPassword(email);
  if (forgot.devCode) {
    const { resetToken } = await authApi.verifyResetCode(email, forgot.devCode);
    await authApi.resetPassword(resetToken, 'a fresh new password');
    const relogin = await authApi.login({ email, password: 'a fresh new password' });
    check('the emailed-code reset flow sets a new working password', Boolean(relogin.token));
  } else {
    skipped += 1;
    console.log('  SKIP  password reset (start the server with EREF_DEV_RETURN_CODE=1 to test it)');
  }

  const userId = registered.user.id;
  const stamp = () => new Date().toISOString();
  const tomato = { id: 'smoke-1', foodId: 'tomato', title: 'Tomato', updatedAt: stamp() };

  await sync.updateQueue(userId, (queue) => sync.queuePut(queue, tomato));
  const sent = await sync.flushQueue(userId);
  check('a queued item reaches the server', sent.remaining === 0 && (await sync.pullInventory()).some((i) => i.id === 'smoke-1'));

  await apiConfig.setApiOverride('http://127.0.0.1:9');
  await sync.updateQueue(userId, (queue) => sync.queuePut(queue, { ...tomato, title: 'Edited offline', updatedAt: stamp() }));
  const offline = await sync.flushQueue(userId);
  check('with no connection the change stays queued', offline.offline === true && offline.remaining === 1);
  await apiConfig.setApiOverride('');
  const addressOf = async (typed) => apiConfig.setApiOverride(typed);
  check('a bare LAN address gets http and the default port', (await addressOf('192.168.1.5')) === 'http://192.168.1.5:8000');
  check('an https tunnel address keeps https and gets no port', (await addressOf('https://a-b.trycloudflare.com/')) === 'https://a-b.trycloudflare.com');
  check('a bare domain is treated as https', (await addressOf('a-b.trycloudflare.com')) === 'https://a-b.trycloudflare.com');
  await apiConfig.setApiOverride('');
  const back = await sync.flushQueue(userId);
  check('it is sent once the connection returns', back.remaining === 0 &&
    (await sync.pullInventory()).find((i) => i.id === 'smoke-1').title === 'Edited offline');

  const other = await authApi.register({ name: 'Someone Else', email: `other-${Date.now()}@example.com`, password });
  await session.saveToken(other.token);
  check("one user cannot see another user's items", (await sync.pullInventory()).length === 0);
  await session.saveToken(registered.token);

  await sync.updateQueue(userId, (queue) => sync.queueDelete(queue, 'smoke-1'));
  await sync.flushQueue(userId);
  check('a deleted item is removed from the server', !(await sync.pullInventory()).some((i) => i.id === 'smoke-1'));

  const label = await ocr.scanLabelImage(path.join(__dirname, 'fixtures', 'label.png'));
  check('a photographed label is read back into its dates',
    ocr.formatLabelDate(label.expiryDate) === '15 Sep 2026' && ocr.formatLabelDate(label.manufacturingDate) === '3 Sep 2026',
    `${ocr.formatLabelDate(label.expiryDate)} / ${ocr.formatLabelDate(label.manufacturingDate)}`);
  check('the product name on the label is picked up', label.productHint === 'milk');

  const apple = sampleImage('fresh_apples');
  if (apple) {
    const noText = await ocr.scanLabelImage(apple);
    check('a photo with no label invents no dates', noText.expiryDate === null && noText.manufacturingDate === null);
    const analysis = await scan.analyzeScan({ imageUri: apple, category: 'Produce', storageId: 'fridge_top' });
    check('a scan without label text reports no dates instead of guessing',
      analysis.ocr.expiryDate === null && analysis.ocr.source === 'none');
  }
}

main()
  .then(() => {
    console.log(failures
      ? `\n${failures} check(s) failed`
      : `\nAll checks passed${skipped ? ` (${skipped} section skipped)` : ''}`);
    process.exit(failures ? 1 : 0);
  })
  .catch((error) => {
    console.error('\nSmoke test crashed:', error);
    process.exit(1);
  });
