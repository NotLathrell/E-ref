/**
 * Theme test: dark mode and the shared design.
 *
 *   node scripts/theme-test.js
 *
 * 1. The colour maths (parsing, contrast, the light-to-dark conversion).
 * 2. The themed components (default text colour, nesting, opt-out).
 * 3. An audit of every screen rendered in light and in dark:
 *      - no light surface survives in dark mode;
 *      - dark mode never makes any text or icon harder to read than it already
 *        was in light mode, and text below 3:1 contrast is reported either way.
 * 4. The appearance setting: choices, persistence and the Profile control.
 *
 * Needs no server.
 */

const path = require('path');

// Set before any app module loads: config.js reads it once, at import.
const API_URL = process.env.EREF_API_URL || 'http://127.0.0.1:8000';
process.env.EXPO_PUBLIC_API_URL = API_URL;

const { load, render, renderTree, setContext, setThemeMode } = require('./harness');

let failures = 0;

function check(label, ok, detail) {
  if (!ok) failures += 1;
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? `  [${detail}]` : ''}`);
}

const section = (title) => console.log(`\n${title}`);

const d = load('src/theme/darkMode.js');
const themeModule = load('src/theme/ThemeContext.js');
const { LIGHT_COLORS, DARK_COLORS } = themeModule;

const DAY = 86400000;

// ---------------------------------------------------------------- colour maths
function colourMaths() {
  section('Colour maths');
  check('black on white is 21:1', Math.abs(d.contrast('#000000', '#ffffff') - 21) < 0.01);
  check('short and long hex parse the same', d.toHex(d.parseColor('#fa0')) === d.toHex(d.parseColor('#ffaa00')));
  check('CSS names parse', d.toHex(d.parseColor('white')) === '#ffffff' && d.toHex(d.parseColor('black')) === '#000000');

  check('the light page becomes a dark page', d.lightness(d.darkColor('#FFF9F0', 'backgroundColor')) < 12);
  check('cards are lighter than the page in dark mode, so they still read as raised',
    d.lightness(DARK_COLORS.card) > d.lightness(DARK_COLORS.background));
  check('text is light in dark mode and readable on the page', d.contrast(DARK_COLORS.text, DARK_COLORS.background) >= 7,
    `${d.contrast(DARK_COLORS.text, DARK_COLORS.background).toFixed(1)}:1`);
  check('muted text is readable on both the page and a card',
    d.contrast(DARK_COLORS.muted, DARK_COLORS.background) >= 4.5 && d.contrast(DARK_COLORS.muted, DARK_COLORS.card) >= 4.5);
  check('the brand colour is readable as text on the page', d.contrast(DARK_COLORS.primary, DARK_COLORS.background) >= 4.5);
  check('button text is readable on the brand colour',
    d.contrast(d.darkColor('#FFFFFF', 'color'), DARK_COLORS.primary) >= 4.5,
    `${d.contrast(d.darkColor('#FFFFFF', 'color'), DARK_COLORS.primary).toFixed(1)}:1`);
  check('white is a raised surface as a background and dark text as a foreground',
    d.darkColor('#FFFFFF', 'backgroundColor') !== d.darkColor('#FFFFFF', 'color'));

  check('shadows are never converted', d.darkColor('#000000', 'shadowColor') === '#000000');
  check('translucent, transparent and unknown colours are left alone',
    ['rgba(0,0,0,0.5)', 'transparent', 'not-a-colour', '#11223380'].every((c) => d.darkColor(c, 'backgroundColor') === c));
  check('non-string values are returned unchanged', d.darkColor(undefined) === undefined && d.darkColor(5) === 5);

  const style = { flex: 1, padding: 8, backgroundColor: '#FFF9F0', color: '#2F241F', borderRadius: 12 };
  const mapped = d.darkStyle(style);
  check('a style keeps its layout and only its colours change',
    mapped.flex === 1 && mapped.padding === 8 && mapped.borderRadius === 12 &&
    mapped.backgroundColor !== style.backgroundColor && mapped.color !== style.color);
  check('a style with no colours is returned as it was', d.darkStyle({ flex: 1 }).flex === 1);
  const webFlatten = (style) => (style == null ? {} : style); // React Native Web: undefined becomes {}
  check('no style stays no style, even where flatten() would return {}',
    d.darkStyle(undefined, webFlatten) === undefined && d.darkStyle(null, webFlatten) === null);

  // Every colour the app uses converts to a valid colour, and light/dark stay opposite.
  const colours = require('fs').readdirSync(path.join(__dirname, '..', 'screens'))
    .flatMap((f) => require('fs').readFileSync(path.join(__dirname, '..', 'screens', f), 'utf8').match(/#[0-9A-Fa-f]{6}\b|#[0-9A-Fa-f]{3}\b/g) || []);
  const unique = [...new Set(colours.map((c) => c.toLowerCase()))];
  const bad = unique.filter((c) => !/^#[0-9a-f]{6}$/.test(d.darkColor(c, 'backgroundColor')));
  check(`all ${unique.length} colours used in the screens convert to valid colours`, bad.length === 0, bad.join(','));

  // Saturated accents (amber, green) are deliberately kept bright; everything else swaps.
  const flips = unique.filter((c) => {
    const before = d.lightness(c);
    const after = d.lightness(d.darkColor(c, 'color'));
    const accent = d.chroma(c) >= 25;
    return (before > 70 && !accent && after > 45) || (before > 82 && after > 45) || (before < 30 && after < 55);
  });
  check('very light neutrals turn dark and very dark colours turn light', flips.length === 0, flips.join(','));

  const accents = ['#d89b3d', '#6f9b72', '#d6a85f', '#c95c54', '#b86b4b'];
  check('saturated accents stay vivid as text, and as fills with readable dark content on them',
    accents.every((c) => d.lightness(d.darkColor(c, 'color')) >= 50 && d.lightness(d.darkColor(c, 'backgroundColor')) >= 45 &&
      d.contrast(d.darkColor('#FFFFFF', 'color'), d.darkColor(c, 'backgroundColor')) >= 3.4),
    accents.map((c) => `${c}: fill ${d.contrast(d.darkColor('#FFFFFF', 'color'), d.darkColor(c, 'backgroundColor')).toFixed(1)}:1`).join(' '));
  check('the same colour always converts the same way', d.darkColor('#E3F1E4', 'backgroundColor') === d.darkColor('#E3F1E4', 'backgroundColor'));
}

// ----------------------------------------------------------------- resolution
function resolution() {
  section('Choosing the theme');
  const { resolveMode, makeTheme } = themeModule;
  check("'system' follows the phone", resolveMode('system', 'dark') === 'dark' && resolveMode('system', 'light') === 'light');
  check('an unknown phone setting means light', resolveMode('system', null) === 'light');
  check('an explicit choice ignores the phone', resolveMode('light', 'dark') === 'light' && resolveMode('dark', 'light') === 'dark');
  check('a missing or invalid preference follows the phone', resolveMode(undefined, 'dark') === 'dark' && resolveMode('purple', 'light') === 'light');
  check('the dark theme carries the dark palette', makeTheme('dark').colors === DARK_COLORS && makeTheme('dark').isDark === true);
  check('the light theme is the design palette', makeTheme('light').colors === LIGHT_COLORS && makeTheme('light').isDark === false);
}

// ------------------------------------------------------------ themed components
function components() {
  section('Themed components');
  const React = require('react');
  const themed = load('components/themed.js');
  const h = React.createElement;

  const textIn = (mode, element) => {
    setThemeMode(mode);
    return renderTree(() => element);
  };
  const find = (node, type) => {
    if (!node) return null;
    if (node.type === type) return node;
    for (const kid of node.kids || []) {
      const hit = find(kid, type);
      if (hit) return hit;
    }
    return null;
  };
  const styleOf = (node) => require('./harness').load('src/theme/darkMode.js') && Object.assign({}, ...[].concat(node.props.style).flat(3).filter(Boolean));

  const plainDark = find(textIn('dark', h(themed.Text, null, 'hello')), 'Text');
  check('text with no colour gets the dark theme text colour (RN would draw it black)',
    styleOf(plainDark).color === DARK_COLORS.text);

  const plainLight = find(textIn('light', h(themed.Text, null, 'hello')), 'Text');
  check('in light mode text is left exactly as written', plainLight.props.style === undefined);

  const nested = textIn('dark', h(themed.Text, { style: { color: '#7A6A60' } }, 'outer ', h(themed.Text, null, 'inner')));
  const outer = find(nested, 'Text');
  const inner = find({ kids: outer.kids }, 'Text');
  check('text inside text inherits its parent colour instead of resetting it',
    inner && (inner.props.style === undefined || styleOf(inner).color === undefined));

  const fixed = find(textIn('dark', h(themed.View, { themed: false, style: { backgroundColor: '#FFF7ED' } })), 'View');
  check('themed={false} leaves an element\'s own colours alone',
    fixed.props.style.backgroundColor === '#FFF7ED' && fixed.props.themeFixed === true);

  const view = find(textIn('dark', h(themed.View, { style: [{ padding: 4 }, { backgroundColor: '#FFEDD5' }] })), 'View');
  check('style arrays are flattened and converted', view.props.style.backgroundColor === DARK_COLORS.card && view.props.style.padding === 4);

  const input = find(textIn('dark', h(themed.TextInput, { placeholder: 'x', placeholderTextColor: '#8A6D56' })), 'TextInput');
  check('inputs get a readable text colour, placeholder and a dark keyboard',
    styleOf(input).color === DARK_COLORS.text && input.props.placeholderTextColor === DARK_COLORS.muted && input.props.keyboardAppearance === 'dark');

  const icon = find(textIn('dark', h(themed.Ionicons, { name: 'home', color: '#C2410C' })), 'Ionicons');
  check('icons take the dark colour', icon.props.color === DARK_COLORS.primary);
  const lightIcon = find(textIn('light', h(themed.Ionicons, { name: 'home', color: '#C2410C' })), 'Ionicons');
  check('and stay as written in light mode', lightIcon.props.color === '#C2410C');

  const list = find(textIn('dark', h(themed.FlatList, { data: [], renderItem: () => null })), 'FlatList');
  check('a single-column list gets no columnWrapperStyle (React Native rejects one)',
    list && !('columnWrapperStyle' in list.props));

  const sw = find(textIn('dark', h(themed.Switch, { trackColor: { false: '#FED7AA', true: '#6F9B72' } })), 'Switch');
  check('switch track colours are converted', sw.props.trackColor.false === DARK_COLORS.border);
  setThemeMode('light');
}

// ---------------------------------------------------------------- screen audit
function flat(style) {
  if (Array.isArray(style)) return Object.assign({}, ...style.map(flat));
  return style || {};
}

function textOf(node) {
  if (node.text !== undefined) return node.text;
  return (node.kids || []).map(textOf).join(' ');
}

function audit(tree, mode) {
  const colors = mode === 'dark' ? DARK_COLORS : LIGHT_COLORS;
  const found = { texts: [], icons: [], lightSurfaces: [] };

  const walk = (node, background, fixed, inText) => {
    if (!node || node.text !== undefined) return;
    const props = node.props || {};
    const style = flat(props.style);
    const isFixed = fixed || props.themeFixed === true;

    let bg = background;
    const parsed = typeof style.backgroundColor === 'string' ? d.parseColor(style.backgroundColor) : null;
    if (parsed && parsed.a === 1) {
      bg = style.backgroundColor;
      // The brand colour (buttons, active pills) and the muted colour (thin score bars)
      // are deliberately light fills in dark mode; every other surface must be dark.
      const allowed = [DARK_COLORS.primary, DARK_COLORS.muted];
      if (mode === 'dark' && !isFixed && d.lightness(bg) > 60 && !allowed.includes(bg.toLowerCase())) {
        found.lightSurfaces.push(bg);
      }
    }

    if (node.type === 'Text' && !isFixed && !inText) {
      const label = textOf(node).replace(/\s+/g, ' ').trim();
      if (label) {
        const color = style.color || '#000000';
        found.texts.push({ label: label.slice(0, 40), color, bg, ratio: d.contrast(color, bg) });
      }
    }
    if (node.type === 'Ionicons' && !isFixed && props.color && d.parseColor(props.color)) {
      found.icons.push({ label: `icon ${props.name}`, color: props.color, bg, ratio: d.contrast(props.color, bg) });
    }
    for (const kid of node.kids || []) walk(kid, bg, isFixed, inText || node.type === 'Text');
  };

  walk(tree, colors.background, false, false);
  return found;
}


const lightDesignLow = [];

/** Render one screen in both themes and check the dark version against the light one. */
function auditScreen(label, Component, overrides, props) {
  setThemeMode('light');
  const light = audit(renderTree(Component, overrides, props), 'light');
  setThemeMode('dark');
  const dark = audit(renderTree(Component, overrides, props), 'dark');
  setThemeMode('light');

  const lowIn = (found) => [...found.texts, ...found.icons].filter((e) => e.ratio < 3);
  const lightLow = new Set(lowIn(light).map((e) => e.label));
  const newLow = lowIn(dark).filter((e) => !lightLow.has(e.label));
  const inherited = lowIn(dark).length - newLow.length;

  check(`${label}: no light surface in dark mode`, dark.lightSurfaces.length === 0, dark.lightSurfaces.join(','));
  check(`${label}: dark mode adds no unreadable text or icons`, newLow.length === 0,
    newLow.map((e) => `"${e.label}" ${e.ratio.toFixed(1)}:1 ${e.color} on ${e.bg}`).join('; ') ||
    `${dark.texts.length} texts, ${dark.icons.length} icons${inherited ? `, ${inherited} already low in light` : ''}`);
  if (lowIn(light).length) lightDesignLow.push([label, lowIn(light)]);
}

function reportLowContrast() {
  if (!lightDesignLow.length) return;
  console.log('\n  Already below 3:1 in the light design (not caused by dark mode):');
  for (const [label, list] of lightDesignLow) {
    for (const e of list.slice(0, 3)) console.log(`    - ${label}: "${e.label}" ${e.ratio.toFixed(1)}:1`);
  }
  lightDesignLow.length = 0;
}

function screens() {
  section('Every screen, light and dark');
  const enrich = load('services/enrich.js');
  const prioritize = load('services/prioritize.js');
  const scan = require('./fixtures/scan');
  const metricsFixtures = require('./fixtures/metrics');

  const item = (id, foodId, storage, expires, spoilage, extra = {}) => ({
    id, foodId, title: foodId, storageId: storage, category: 'Produce', imageUri: null,
    expiryDate: new Date(Date.now() + expires * DAY).toISOString(),
    scannedAt: new Date(Date.now() - DAY).toISOString(), createdAt: new Date(Date.now() - DAY).toISOString(),
    cnnSpoilageScore: spoilage, cnnIdentityConfidence: 0.9, modelFreshness: spoilage > 0.5 ? 'spoiled' : 'fresh',
    modelFreshnessConfidence: 0.9, frozen: false, discarded: false,
    history: [{ at: new Date().toISOString(), event: 'Scanned (Shelf)' }], ...extra,
  });
  const items = enrich.enrichAll([
    item('a', 'tomato', 'fridge_top', 1, 0.95), item('b', 'milk', 'fridge_bottom', 4, 0.1),
    item('c', 'eggplant', 'counter', 2, 0.4), item('d', 'meat', 'fridge_bottom', 1, 0.8),
  ]);

  const calls = [];
  const context = {
    loading: false, user: { name: 'Tester', email: 'tester@example.com' }, items,
    settings: { alertsEnabled: true, notifyLeadHours: 24, themeMode: 'system' },
    updateSettings: async (patch) => { calls.push(['updateSettings', patch]); },
    prioritized: prioritize.prioritizeByGreedy(items), soonToSpoil: prioritize.getSoonToSpoil(items, 3),
    alerts: items.map((i) => ({
      id: `alert-${i.id}`, itemId: i.id, title: i.title, message: `${i.title} is at risk.`,
      urgency: i.urgency, riskScore: i.riskScore, read: false, createdAt: new Date().toISOString(),
    })),
    unreadAlertCount: 4, addItem: async () => {}, updateItem: async () => {}, freezeItem: async () => {},
    discardItem: async () => {}, removeItem: async () => {}, signIn: async () => {}, signUp: async () => {},
    signOut: async () => {}, markAlertRead: () => {}, markAllAlertsRead: () => {}, refresh: async () => {},
    syncStatus: 'idle', pendingChanges: 0, exportInventory: () => '', getItemById: (id) => items.find((i) => i.id === id) || null,
    consumeItem: async () => {}, restoreItem: async () => {}, updateTaste: async () => {}, logRecipe: async () => {},
    refreshFoodDatabase: async () => {}, foodsVersion: 0,
    taste: { liked: ['mango'], avoided: ['okra'], diet: 'none', log: [{ recipeId: 'omelette', action: 'cooked', at: new Date().toISOString() }] },
    archive: [
      { id: 'x1', foodId: 'milk', title: 'Milk', outcome: 'used', resolvedAt: new Date().toISOString() },
      { id: 'x2', foodId: 'tomato', title: 'Tomato', outcome: 'discarded', resolvedAt: new Date().toISOString() },
    ],
    historyEntries: [
      { id: 'h1', itemId: 'a', foodId: 'tomato', title: 'Tomato', at: new Date().toISOString(), event: 'Scanned (Shelf)', status: 'active' },
      { id: 'h2', itemId: 'x1', foodId: 'milk', title: 'Milk', at: new Date().toISOString(), event: 'Used up', status: 'used' },
      { id: 'h3', itemId: 'x2', foodId: 'tomato', title: 'Tomato', at: new Date().toISOString(), event: 'Discarded', status: 'discarded' },
    ],
  };
  context.user.role = 'admin';
  context.user.id = 1;
  setContext(context);

  // A representative state for each screen (root useState index -> value).
  const cases = [
    ['HomeScreen', {}, {}], ['ShelfScreen', { 0: 'All', 1: null, 2: false, 3: '' }, {}],
    ['ShelfScreen', { 0: 'All', 1: 'a', 2: false, 3: '' }, {}, 'ShelfScreen (item detail)'],
    ['CameraScreen', {}, {}, 'CameraScreen (capture)'],
    ['CameraScreen', { 0: 'review', 1: 'photo.jpg' }, {}, 'CameraScreen (review)'],
    ['AlertsScreen', {}, {}], ['ProfileScreen', {}, {}],
    ['MetricsScreen', { 0: null, 2: 'offline', 3: false }, {}, 'MetricsScreen (unavailable)'],
    ['AuthScreen', {}, {}, 'AuthScreen (sign in)'], ['AuthScreen', { 0: 'signup' }, {}, 'AuthScreen (sign up)'],
    ['ForgotPasswordScreen', {}, {}], ['VerifyCodeScreen', {}, {}],
    ['CreateNewPasswordScreen', {}, { navigation: {}, route: { params: {} } }, 'CreateNewPasswordScreen (change)'],
    ['CreateNewPasswordScreen', {}, { navigation: {}, route: { params: { resetToken: 'x' } } }, 'CreateNewPasswordScreen (reset)'],
    ['PasswordSuccessScreen', {}, { navigation: {} }],
    ['HistoryScreen', { 0: 'activity' }, {}, 'HistoryScreen (activity)'], ['HistoryScreen', { 0: 'archive' }, {}, 'HistoryScreen (used & discarded)'],
    ['RecipesScreen', {}, {}], ['RecipesScreen', { 0: 'omelette' }, {}, 'RecipesScreen (recipe open)'],
    ['AdminScreen', {}, {}],
    ['MetricsScreen', { 0: metricsFixtures.report, 3: false, 5: metricsFixtures.detector, 6: metricsFixtures.calibration }, {}, 'MetricsScreen (detector and confidence)'],
    ['CameraScreen', scan.scanState({ level: 'high' }), {}, 'CameraScreen (confident result)'],
    ['CameraScreen', scan.scanState({ level: 'medium' }), {}, 'CameraScreen (result to check)'],
    ['CameraScreen', scan.scanState({ level: 'low' }), {}, 'CameraScreen (uncertain result)'],
    ['CameraScreen', { ...scan.scanState({ level: 'low' }), 12: 'mango' }, {}, 'CameraScreen (corrected result)'],
    ['CameraScreen', scan.scanState({ objects: [scan.detected(0, 'tomato', 'high'), scan.detected(1, 'mango', 'medium', { spoiled: true }), scan.detected(2, 'banana', 'low')] }), {}, 'CameraScreen (several foods)'],
  ];

  for (const [name, overrides, props, label = name] of cases) {
    auditScreen(label, load(path.join('screens', `${name}.js`))[name], overrides, props);
  }
  reportLowContrast();
  setThemeMode('light');
  return { context, calls };
}


// ------------------------------------------------- screens that need live data
async function liveScreens() {
  section('Data-heavy screens (live server)');
  try {
    if (!(await fetch(`${API_URL}/health`, { signal: AbortSignal.timeout(4000) })).ok) throw new Error('not ok');
  } catch {
    console.log('  SKIP  API not reachable, so the scan result and metrics screens were not audited');
    return;
  }

  const fs = require('fs');
  const scan = load('services/scanPipeline.js');
  const enrich = load('services/enrich.js');
  const metrics = load('services/metrics.js');
  const root = path.resolve(__dirname, '..', '..', 'Datasets', 'dataset', '.training', 'food_multiclass', 'val');

  for (const folder of ['rotten_tomato', 'fresh_apples']) {
    const dir = path.join(root, folder);
    if (!fs.existsSync(dir)) continue;
    const image = path.join(dir, fs.readdirSync(dir)[5]);
    const result = await scan.analyzeScan({ imageUri: image, category: 'Produce', storageId: 'fridge_top' });
    const now = new Date().toISOString();
    const preview = enrich.enrichItem({ ...result.draftItem, scannedAt: now, createdAt: now });
    auditScreen(`CameraScreen (${folder} result)`, load('screens/CameraScreen.js').CameraScreen,
      { 0: 'result', 1: image, 8: result, 9: preview }, {});
  }

  const report = await metrics.fetchMetrics();
  const health = await metrics.fetchHealth();
  auditScreen('MetricsScreen (report)', load('screens/MetricsScreen.js').MetricsScreen, { 0: report, 1: health, 3: false }, {});
  reportLowContrast();
}

// ------------------------------------------------------------------- settings
async function appearanceSetting({ context, calls }) {
  section('Appearance setting');
  const storage = load('services/storage.js');
  check("new installs follow the phone's setting", storage.DEFAULT_SETTINGS.themeMode === 'system');
  check('the setting is saved with the other preferences', (await storage.loadSettings()).themeMode === 'system');
  await storage.saveSettings({ ...storage.DEFAULT_SETTINGS, themeMode: 'dark' });
  check('and read back on the next launch', (await storage.loadSettings()).themeMode === 'dark');

  setContext(context);
  const Profile = load('screens/ProfileScreen.js').ProfileScreen;
  const text = render(Profile).text;
  check('Profile offers System, Light and Dark', ['System', 'Light', 'Dark'].every((label) => text.includes(label)));

  const tree = renderTree(Profile);
  const findPress = (node, label) => {
    if (!node) return null;
    if (node.props && node.props.onPress && node.kids && JSON.stringify(node.kids).includes(`"text":"${label}"`) && !JSON.stringify(node.kids).includes('Appearance')) {
      if ((node.kids.length === 1) && textOf(node) === label) return node;
    }
    for (const kid of node.kids || []) {
      const hit = findPress(kid, label);
      if (hit) return hit;
    }
    return null;
  };
  const dark = findPress(tree, 'Dark');
  check('the Dark choice is a control that can be pressed', Boolean(dark));
  if (dark) {
    dark.props.onPress();
    check('choosing Dark saves themeMode: "dark"', calls.some(([name, patch]) => name === 'updateSettings' && patch.themeMode === 'dark'));
  }
}

async function main() {
  console.log('E-REF theme test');
  colourMaths();
  resolution();
  components();
  const state = screens();
  await liveScreens();
  await appearanceSetting(state);
}

main()
  .then(() => {
    console.log(failures ? `\n${failures} check(s) failed` : '\nAll checks passed');
    process.exit(failures ? 1 : 0);
  })
  .catch((error) => {
    console.error('\nTheme test crashed:', error);
    process.exit(1);
  });
