/**
 * Integration test for the real InventoryProvider.
 *
 *   node scripts/context-test.js
 *
 * The smoke test stubs the inventory context, so it never runs the code that
 * restores a session, syncs with the server or schedules notifications. This test
 * mounts the actual provider with react-test-renderer (which does run effects) and
 * drives it against the live API: sign-up, adding and editing items, restarting the
 * app, working offline, an expired session, and carrying over pre-account items.
 *
 * Needs the API (uvicorn backend.server:app --host 0.0.0.0 --port 8000). Skipped
 * when it is unreachable.
 */

const React = require('react');
const TestRenderer = require('react-test-renderer');
const { load, notificationLog, resetDeviceState, asyncStore } = require('./harness');

const API_URL = process.env.EREF_API_URL || 'http://127.0.0.1:8000';
process.env.EXPO_PUBLIC_API_URL = API_URL;
global.IS_REACT_ACT_ENVIRONMENT = true;

// Background sync updates land between act() calls, and the renderer announces its own
// deprecation. Both are expected here; any other error is still printed.
const realConsoleError = console.error;
console.error = (...args) => {
  if (/not wrapped in act|react-test-renderer is deprecated/.test(String(args[0]))) return;
  realConsoleError(...args);
};

const { act } = TestRenderer;
const DAY = 86400000;
let failures = 0;

function check(label, ok, detail) {
  if (!ok) failures += 1;
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? `  [${detail}]` : ''}`);
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitFor(condition, label, timeoutMs = 10000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    let done = false;
    try {
      done = Boolean(await condition());
    } catch {
      done = false;
    }
    if (done) return true;
    await act(async () => {
      await sleep(40);
    });
  }
  console.log(`        (timed out waiting for: ${label})`);
  return false;
}

const { InventoryProvider, useInventory } = load('context/InventoryContext.js');
const session = load('services/session.js');
const apiConfig = load('services/apiConfig.js');
const sync = load('services/inventorySync.js');

async function mount() {
  const probe = { value: null };
  function Probe() {
    probe.value = useInventory();
    return null;
  }
  let renderer;
  await act(async () => {
    renderer = TestRenderer.create(
      React.createElement(InventoryProvider, null, React.createElement(Probe))
    );
  });
  probe.unmount = () => act(async () => renderer.unmount());
  return probe;
}

const call = (probe, name, ...args) =>
  act(async () => {
    await probe.value[name](...args);
  });

/** What the server holds for whoever the stored session token belongs to. */
const serverItems = () => sync.pullInventory();

const tomato = (extra = {}) => ({
  foodId: 'tomato', title: 'Tomato', category: 'Produce', storageId: 'counter',
  expiryDate: new Date(Date.now() + 3 * DAY).toISOString(),
  cnnSpoilageScore: 0.2, frozen: false, discarded: false, ...extra,
});

async function main() {
  console.log(`E-REF context test  (API: ${API_URL})`);
  try {
    if (!(await fetch(`${API_URL}/health`, { signal: AbortSignal.timeout(5000) })).ok) throw new Error('not ok');
  } catch {
    console.log('\n  SKIP  API not reachable — start it with: uvicorn backend.server:app --host 0.0.0.0 --port 8000');
    return;
  }

  const stamp = Date.now();
  const email = `ctx-${stamp}@example.com`;
  const password = 'context test password';

  console.log('\nSession');
  resetDeviceState();
  let app = await mount();
  await waitFor(() => !app.value.loading, 'provider to finish loading');
  check('starts signed out with an empty shelf', app.value.user === null && app.value.items.length === 0);

  await act(async () => {
    await app.value.signUp({ name: 'Context Tester', email, password });
  });
  check('signing up signs the user in', app.value.user && app.value.user.email === email);
  check('the token is kept for the next launch', Boolean(session.getToken()));

  console.log('\nInventory');
  await call(app, 'addItem', tomato());
  check('an added item shows on the shelf immediately', app.value.items.length === 1);
  const itemId = app.value.items[0].id;
  check('it reaches the server without the user doing anything',
    await waitFor(async () => (await serverItems()).some((i) => i.id === itemId), 'item on server'));

  await call(app, 'freezeItem', itemId);
  check('an edit reaches the server',
    await waitFor(async () => (await serverItems()).find((i) => i.id === itemId)?.frozen === true, 'frozen on server'));
  const history = (await serverItems()).find((i) => i.id === itemId).history.map((h) => h.event).join('|');
  check('the item history is kept', /Frozen/.test(history), history);

  await act(async () => {
    await Promise.all([app.value.addItem(tomato({ title: 'Tomato 2' })), app.value.addItem(tomato({ title: 'Tomato 3' }))]);
  });
  check('two items added at the same moment both survive', app.value.items.length === 3);
  check('and both reach the server',
    await waitFor(async () => (await serverItems()).length === 3, 'three items on server'));

  console.log('\nRestarting the app');
  await app.unmount();
  app = await mount();
  await waitFor(() => !app.value.loading, 'restart to finish loading');
  check('the session is restored without signing in again', app.value.user && app.value.user.email === email);
  check('the shelf is there straight away from the device cache', app.value.items.length === 3);

  console.log('\nWorking offline');
  await apiConfig.setApiOverride('http://127.0.0.1:9');
  await call(app, 'addItem', tomato({ title: 'Added offline' }));
  check('an item can still be added with no connection', app.value.items.length === 4);
  check('the change is counted as waiting to sync',
    await waitFor(() => app.value.pendingChanges === 1 && app.value.syncStatus === 'offline', 'offline state'),
    `pending ${app.value.pendingChanges}, ${app.value.syncStatus}`);
  await apiConfig.setApiOverride('');
  await call(app, 'refresh');
  check('it syncs when the connection returns',
    await waitFor(async () => app.value.pendingChanges === 0 && (await serverItems()).length === 4, 'sync after reconnect'));

  await call(app, 'removeItem', app.value.items.find((i) => i.title === 'Added offline').id);
  check('a removed item is removed from the server',
    await waitFor(async () => (await serverItems()).length === 3, 'removal on server'));

  console.log('\nNotifications');
  await call(app, 'addItem', tomato({ title: 'Past its date', expiryDate: new Date(Date.now() - 2 * DAY).toISOString(), cnnSpoilageScore: 0.7 }));
  check('an expired item raises a notification on the device',
    await waitFor(() => notificationLog.shown.some((n) => /has expired/.test(n.content.title)), 'expiry notification'));
  check('alerts for coming expiries are scheduled', notificationLog.scheduled.length > 0);

  console.log('\nUsed-up food and history');
  const byTitle = (title) => app.value.items.find((i) => i.title === title);
  const usedTarget = byTitle('Tomato 2');
  await call(app, 'consumeItem', usedTarget.id, 'cooked Pinakbet');
  check('used-up food leaves the shelf', !byTitle('Tomato 2'));
  check('it is kept in the archive as used', app.value.archive.some((a) => a.id === usedTarget.id && a.outcome === 'used'));
  check('the history records it, with what it was used for',
    app.value.historyEntries.some((h) => h.itemId === usedTarget.id && /Used up — cooked Pinakbet/.test(h.event)));
  check('the used-up item reaches the server',
    await waitFor(async () => (await serverItems()).find((i) => i.id === usedTarget.id)?.consumed === true, 'consumed on server'));

  await call(app, 'restoreItem', usedTarget.id);
  check('putting it back returns it to the shelf', Boolean(byTitle('Tomato 2')) && !app.value.archive.some((a) => a.id === usedTarget.id));
  check('the history records that too', app.value.historyEntries.some((h) => h.itemId === usedTarget.id && /Put back on the shelf/.test(h.event)));

  const thrown = byTitle('Tomato 3');
  await call(app, 'discardItem', thrown.id);
  check('discarded food is archived as discarded', app.value.archive.some((a) => a.id === thrown.id && a.outcome === 'discarded'));
  check('and the history says so', app.value.historyEntries.some((h) => h.itemId === thrown.id && h.event === 'Discarded'));
  const sinceArchived = app.value.archive.find((a) => a.id === thrown.id);
  check('the archive knows when it was resolved', Boolean(sinceArchived.resolvedAt));

  const newDate = new Date(Date.now() + 9 * DAY).toISOString();
  await call(app, 'updateItem', usedTarget.id, { expiryDate: newDate });
  check('changing an expiry date is recorded in the history',
    app.value.historyEntries.some((h) => h.itemId === usedTarget.id && h.event === 'Expiry date changed'));
  check('and the item takes the new date', byTitle('Tomato 2').expiryDate === newDate);
  await call(app, 'updateItem', usedTarget.id, { expiryDate: null });
  check('removing a date is recorded too', app.value.historyEntries.some((h) => h.itemId === usedTarget.id && h.event === 'Expiry date removed'));

  await call(app, 'addItem', tomato({ title: 'From a photo', historyNote: 'CNN read it as Tomato (97% confident, high confidence)' }));
  const noted = byTitle('From a photo');
  check('what the models said is written into a new item\'s history',
    app.value.historyEntries.some((h) => h.itemId === noted.id && /CNN read it as Tomato/.test(h.event)));
  check('the note is not stored as a field of the item', !('historyNote' in noted));
  await call(app, 'removeItem', noted.id);

  await app.unmount();
  app = await mount();
  await waitFor(() => !app.value.loading, 'restart to finish loading');
  await waitFor(() => app.value.archive.length >= 1, 'archive after restart');
  check('the archive survives a restart', app.value.archive.some((a) => a.id === thrown.id));
  await call(app, 'restoreItem', thrown.id);
  check('everything is back on the shelf for the rest of the test', app.value.items.length === 4 && app.value.archive.length === 0, `${app.value.items.length} items, ${app.value.archive.length} archived`);
  await waitFor(async () => (await serverItems()).every((i) => !i.discarded && !i.consumed), 'restored items on the server');

  console.log('\nTaste profile');
  await call(app, 'updateTaste', { liked: ['mango'], diet: 'vegetarian' });
  await call(app, 'logRecipe', 'omelette', 'cooked');
  await call(app, 'logRecipe', 'omelette', 'cooked');
  check('liked foods and diet are kept', app.value.taste.liked.includes('mango') && app.value.taste.diet === 'vegetarian');
  check('a cooked recipe is logged once, not once per tap', app.value.taste.log.filter((e) => e.recipeId === 'omelette' && e.action === 'cooked').length === 1);
  check('the taste profile is stored on the device for this account', Object.keys(asyncStore).some((k) => k.startsWith('@eref/taste/')));
  await app.unmount();
  app = await mount();
  await waitFor(() => !app.value.loading && app.value.taste.liked.length > 0, 'taste after restart');
  check('the taste profile survives a restart', app.value.taste.liked.includes('mango') && app.value.taste.log.length === 1);

  console.log('\nFood database (administrator)');
  const foodsApi = load('services/foods.js');
  const catalog = load('data/foodCatalog.js');
  check('the account that set the install up is an administrator, or skip', typeof app.value.user.role === 'string');
  if (!['admin', 'super_admin'].includes(app.value.user.role)) {
    console.log('  SKIP  this account is not an administrator, so the food database was not exercised');
  } else {
    const original = catalog.getFoodById('tomato').nominalShelfDays;
    await foodsApi.saveFood({
      id: 'tomato', name: 'Tomato', category: 'Produce', keywords: ['tomato'], refTempC: 4, nominalShelfDays: original * 3,
      q10: 2.5, freezeable: true, bestStorageId: 'counter', usageIdeas: [], storageTips: [],
    });
    const before = app.value.foodsVersion;
    await act(async () => { await app.value.refreshFoodDatabase(); });
    check('the phone picks up an administrator\'s change',
      catalog.getFoodById('tomato').nominalShelfDays === original * 3 && app.value.foodsVersion > before);
    check('a copy is kept on the device', '@eref/foodDatabase' in asyncStore);
    check('an unchanged database is not downloaded again', (await foodsApi.refreshFoods(JSON.parse(asyncStore['@eref/foodDatabase']).version)).changed === false);

    catalog.setRemoteFoods([]);
    await apiConfig.setApiOverride('http://127.0.0.1:9');
    await app.unmount();
    app = await mount();
    await waitFor(() => !app.value.loading, 'offline restart');
    check('the change is still applied when the app starts offline', catalog.getFoodById('tomato').nominalShelfDays === original * 3);
    await apiConfig.setApiOverride('');

    await foodsApi.removeFood('tomato');
    await act(async () => { await app.value.refreshFoodDatabase(); });
    check('removing the entry restores the built-in food', catalog.getFoodById('tomato').nominalShelfDays === original);
  }

  console.log('\nExpired session');
  await session.saveToken('a-token-the-server-rejects');
  await call(app, 'refresh');
  check('the app signs the user out',
    await waitFor(() => app.value.user === null, 'sign-out after rejected session'));
  check('the shelf is cleared', app.value.items.length === 0);
  check('the taste profile is cleared with the session', app.value.taste.liked.length === 0 && app.value.taste.log.length === 0);
  check('the saved token is discarded', session.getToken() === null);
  check('scheduled alerts are cancelled', notificationLog.scheduled.length === 0);

  console.log('\nSigning in on a different phone');
  resetDeviceState();
  await app.unmount();
  app = await mount();
  await waitFor(() => !app.value.loading, 'fresh install to load');
  await act(async () => {
    await app.value.signIn({ email, password });
  });
  check("the user's items come back from the server",
    await waitFor(() => app.value.items.length === 4, 'items downloaded'), `${app.value.items.length} items`);

  console.log('\nItems saved before accounts existed');
  resetDeviceState();
  await app.unmount();
  asyncStore['@eref/inventory'] = JSON.stringify([
    { id: 'seed-yogurt', foodId: 'yogurt', title: 'Yogurt', storageId: 'fridge_top' },
    { id: 'item-legacy-1', foodId: 'apple', title: 'Apple', storageId: 'fridge_top', scannedAt: new Date().toISOString() },
  ]);
  app = await mount();
  await waitFor(() => !app.value.loading, 'legacy install to load');
  await act(async () => {
    await app.value.signUp({ name: 'Legacy User', email: `legacy-${stamp}@example.com`, password });
  });
  check('a real item from before accounts is carried over',
    await waitFor(async () => (await serverItems()).some((i) => i.id === 'item-legacy-1'), 'legacy item uploaded'));
  check('the old sample food is not', !(await serverItems()).some((i) => i.id === 'seed-yogurt'));
  check('the old on-device store is cleared', !('@eref/inventory' in asyncStore));

  await app.unmount();
}

main()
  .then(() => {
    console.log(failures ? `\n${failures} check(s) failed` : '\nAll checks passed');
    process.exit(failures ? 1 : 0);
  })
  .catch((error) => {
    console.error('\nContext test crashed:', error);
    process.exit(1);
  });
