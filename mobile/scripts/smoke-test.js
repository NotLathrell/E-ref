/**
 * Smoke test for the E-REF app.
 *
 *   node scripts/smoke-test.js
 *
 * Checks, in order:
 *   1. every screen renders without throwing
 *   2. the on-device logic (TTI, risk, greedy prioritisation, OCR) is correct
 *   3. the scan pipeline round-trips against the running inference API
 *   4. the result, metrics and shelf-detail views render real data
 *
 * Steps 3 and 4 need the API. Start it first:
 *   uvicorn backend.server:app --host 0.0.0.0 --port 8000
 * They are skipped (not failed) when it is unreachable.
 */

const fs = require('fs');
const path = require('path');
const { load, render, setContext, MOBILE_ROOT } = require('./harness');

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

  setContext({
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
  });

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

  try {
    const App = load('App.js').default;
    const { nodeCount } = render(App);
    check('App (navigation)', nodeCount > 0, `${nodeCount} nodes`);
  } catch (error) {
    check('App (navigation)', false, error.message);
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
    check(`${folder}: all three pipeline stages ran`,
      result.cnn.stages.length === 3, result.cnn.stages.map((s) => s.name).join(' > '));
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
  for (const needle of ['YOLOv8 Detection', 'CNN Identification', 'OCR Extraction', 'TTI & Risk', 'Recommendations', 'Pipeline']) {
    check(`shows the "${needle}" section`, resultView.text.includes(needle));
  }
  check('shows the freshness verdict', /Fresh|Rotten/.test(resultView.text));
  check('explains how the detector and CNN relate', resultView.text.includes('CNN cross-check') || !lastAnalysis.cnn.detection.used);

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
