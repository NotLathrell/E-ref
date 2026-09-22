/**
 * Test harness: loads app modules outside Metro with native modules mocked.
 *
 * Expo's bundler is not available in a plain Node process, so this compiles each
 * file with babel-preset-expo, substitutes the React Native and Expo packages
 * with small stubs, and renders components by driving the hook dispatcher
 * directly. That is enough to catch import errors, undefined references and
 * render-time crashes without a device or emulator.
 */

const babel = require('@babel/core');
const fs = require('fs');
const path = require('path');
const React = require('react');

const MOBILE_ROOT = path.resolve(__dirname, '..');
const cache = {};
const asyncStore = {};

/** Every navigation, alert and context call made while pressing controls. */
const callLog = [];

function named(name) {
  const C = (props) => React.createElement(name, props, props && props.children);
  C.displayName = name;
  return C;
}

function makeReactNative() {
  const names = [
    'View', 'Text', 'Image', 'ScrollView', 'TouchableOpacity', 'TextInput',
    'ActivityIndicator', 'Modal', 'Pressable', 'Switch', 'KeyboardAvoidingView',
    'SafeAreaView', 'RefreshControl', 'StatusBar',
  ];
  const rn = {
    Alert: { alert: (title) => callLog.push(['Alert', String(title)]) },
    Platform: { OS: 'android', select: (o) => (o.android !== undefined ? o.android : o.default) },
    Dimensions: { get: () => ({ width: 400, height: 800 }) },
    StyleSheet: { create: (s) => s, flatten: (s) => s },
  };
  for (const name of names) rn[name] = named(name);

  // Animated API used by components/animations/AnimatedScreen.
  const noopAnimation = () => ({ start() {}, stop() {} });
  rn.Animated = {
    Value: class { constructor(value) { this.value = value; } setValue(v) { this.value = v; } stopAnimation() {} },
    View: named('Animated.View'),
    timing: noopAnimation,
    parallel: noopAnimation,
    createAnimatedComponent: (component) => component,
  };
  rn.Easing = { out: (fn) => fn, cubic: () => 0 };

  rn.FlatList = (props) => {
    const data = props.data || [];
    const children = data.length === 0
      ? (typeof props.ListEmptyComponent === 'function'
          ? React.createElement(props.ListEmptyComponent)
          : props.ListEmptyComponent)
      : data.map((item, index) => React.createElement(
          React.Fragment,
          { key: props.keyExtractor ? props.keyExtractor(item, index) : index },
          props.renderItem({ item, index })));
    return React.createElement('FlatList', null, children);
  };
  return rn;
}

/** Upload shim that posts a real multipart request, so the API is exercised. */
async function uploadAsync(url, uri) {
  const boundary = 'boundary' + Date.now();
  const file = fs.readFileSync(uri);
  const head = Buffer.from(
    `--${boundary}\r\nContent-Disposition: form-data; name="image"; filename="upload.png"\r\n` +
    'Content-Type: image/png\r\n\r\n');
  const tail = Buffer.from(`\r\n--${boundary}--\r\n`);
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': `multipart/form-data; boundary=${boundary}` },
    body: Buffer.concat([head, file, tail]),
  });
  return { status: response.status, body: await response.text() };
}

const mocks = {
  react: React,
  'react-native': makeReactNative(),
  '@expo/vector-icons': { Ionicons: named('Ionicons') },
  'expo-status-bar': { StatusBar: named('StatusBar') },
  'expo-image-picker': {
    requestCameraPermissionsAsync: async () => ({ granted: true }),
    requestMediaLibraryPermissionsAsync: async () => ({ granted: true }),
    launchCameraAsync: async () => ({ canceled: true }),
    launchImageLibraryAsync: async () => ({ canceled: true }),
  },
  'expo-file-system/legacy': { FileSystemUploadType: { MULTIPART: 1 }, uploadAsync },
  'expo-network': {
    getNetworkStateAsync: async () => ({ isConnected: true, type: 'WIFI' }),
    getIpAddressAsync: async () => '192.168.1.5',
    NetworkStateType: { WIFI: 'WIFI' },
  },
  '@react-native-async-storage/async-storage': {
    default: {
      getItem: async (key) => (key in asyncStore ? asyncStore[key] : null),
      setItem: async (key, value) => { asyncStore[key] = value; },
      removeItem: async (key) => { delete asyncStore[key]; },
    },
  },
  'react-native-reanimated': (() => {
    const chain = { springify() { return chain; }, damping() { return chain; }, stiffness() { return chain; } };
    return {
      __esModule: true,
      default: { View: named('Reanimated.View'), createAnimatedComponent: (component) => component },
      FadeInUp: chain,
      useSharedValue: (value) => ({ value }),
      useAnimatedStyle: (factory) => factory(),
      withSpring: (value) => value,
    };
  })(),
  '@react-navigation/native': {
    useIsFocused: () => true,
    useNavigation: () => ({
      navigate: (...args) => callLog.push(['navigate', ...args]),
      goBack: () => callLog.push(['goBack']),
      getParent: () => null,
      dispatch: (action) => callLog.push(['dispatch', JSON.stringify(action)]),
    }),
    useRoute: () => ({ params: {} }),
    CommonActions: { reset: (x) => x },
    NavigationContainer: named('NavigationContainer'),
  },
  '@react-navigation/native-stack': {
    createNativeStackNavigator: () => ({ Navigator: named('Nav'), Screen: named('Screen') }),
  },
  '@react-navigation/bottom-tabs': {
    createBottomTabNavigator: () => ({ Navigator: named('Tabs'), Screen: named('Screen') }),
  },
};

function resolveFile(base) {
  for (const candidate of [base, base + '.js', path.join(base, 'index.js')]) {
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) return candidate;
  }
  return base;
}

/** Load an app module, compiling it and resolving its imports through the mocks. */
function load(relativePath) {
  const abs = path.resolve(MOBILE_ROOT, relativePath);
  if (cache[abs]) return cache[abs].exports;

  const { code } = babel.transformSync(fs.readFileSync(abs, 'utf8'), {
    filename: abs,
    presets: [[require.resolve('babel-preset-expo'), {}]],
    babelrc: false,
    configFile: false,
  });

  const module = { exports: {} };
  cache[abs] = module;

  const req = (spec) => {
    if (mocks[spec]) return mocks[spec];
    // Metro turns asset imports into handles; a stub is enough here.
    if (/\.(png|jpe?g|gif|webp|svg|ttf|otf)$/i.test(spec)) return { uri: spec, __asset: true };
    if (spec.startsWith('.')) return load(resolveFile(path.resolve(path.dirname(abs), spec)));
    return require(spec);
  };

  new Function('require', 'module', 'exports', '__filename', '__dirname', code)(
    req, module, module.exports, abs, path.dirname(abs));
  return module.exports;
}

let contextValue = null;
let stateOverrides = {};
let collectedText = [];
let nodeCount = 0;

/** Supply the value every `useContext` call sees (i.e. the inventory context). */
function setContext(value) {
  contextValue = value;
}

function withHooks(fn, isRoot) {
  const states = [];
  let index = 0;

  const dispatcher = {
    useState: (initial) => {
      const slot = index++;
      if (!(slot in states)) {
        states[slot] = isRoot && slot in stateOverrides
          ? stateOverrides[slot]
          : (typeof initial === 'function' ? initial() : initial);
      }
      return [states[slot], () => {}];
    },
    useReducer: (reducer, initial) => [initial, () => {}],
    useEffect: () => {},
    useLayoutEffect: () => {},
    useInsertionEffect: () => {},
    useMemo: (factory) => factory(),
    useCallback: (fn2) => fn2,
    useRef: (value) => ({ current: value }),
    useContext: () => contextValue,
    useDebugValue: () => {},
    useId: () => 'test-id',
    useSyncExternalStore: (subscribe, getSnapshot) => getSnapshot(),
    useTransition: () => [false, (fn2) => fn2()],
    useDeferredValue: (value) => value,
    useImperativeHandle: () => {},
    useEffectEvent: (fn2) => fn2,
  };

  const internals = React.__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE
    || React.__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED;
  const previous = internals.H;
  internals.H = dispatcher;
  try {
    return fn();
  } finally {
    internals.H = previous;
  }
}

function walk(element, depth, isRoot) {
  if (depth > 90 || element == null || element === false) return;
  if (typeof element === 'string' || typeof element === 'number') {
    collectedText.push(String(element));
    return;
  }
  if (Array.isArray(element)) {
    element.forEach((child) => walk(child, depth + 1, false));
    return;
  }
  if (typeof element !== 'object') return;

  nodeCount += 1;
  const { type, props = {} } = element;

  if (typeof type === 'function') {
    walk(withHooks(() => type(props), isRoot), depth + 1, false);
    return;
  }
  if (props.children != null) {
    [].concat(props.children).forEach((child) => walk(child, depth + 1, false));
  }
}

function buildNode(element, depth, isRoot) {
  if (depth > 90 || element == null || element === false || element === true) return null;
  if (typeof element === 'string' || typeof element === 'number') return { text: String(element) };
  if (Array.isArray(element)) {
    return { kids: element.map((e) => buildNode(e, depth + 1, false)).filter(Boolean) };
  }
  if (typeof element !== 'object') return null;
  const { type, props = {} } = element;
  if (typeof type === 'function') return buildNode(withHooks(() => type(props), isRoot), depth + 1, false);
  const kids = props.children != null
    ? [].concat(props.children).map((c) => buildNode(c, depth + 1, false)).filter(Boolean)
    : [];
  return typeof type === 'string' ? { type, props, kids } : { kids };
}

/** Render to a plain node tree so tests can inspect and press controls. */
function renderTree(Component, overrides = {}) {
  stateOverrides = overrides;
  const tree = buildNode(React.createElement(Component, {}), 0, true);
  stateOverrides = {};
  return tree;
}

/**
 * Render a component and return the node count plus all rendered text.
 * `overrides` maps a root `useState` call index to the value it should return,
 * which is how a screen is driven into a specific state (e.g. the result view).
 */
function render(Component, overrides = {}) {
  stateOverrides = overrides;
  collectedText = [];
  nodeCount = 0;
  walk(React.createElement(Component, {}), 0, true);
  stateOverrides = {};
  return { nodeCount, text: collectedText.join(' ') };
}

module.exports = { load, render, renderTree, setContext, callLog, MOBILE_ROOT };
