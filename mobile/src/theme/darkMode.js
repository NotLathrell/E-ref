/**
 * Dark-mode colours.
 *
 * The app's light design uses about a hundred colours. Rather than keep a second
 * hand-made copy of each, dark colours are derived from the light ones:
 *
 *   1. The few core colours of the design (background, card, text, brand...) have
 *      explicit dark values, so the main surfaces are designed rather than computed.
 *   2. Every other colour is converted by inverting its perceptual lightness (CIE L*)
 *      while keeping its hue: a pale green chip becomes a deep green one, a dark green
 *      label becomes a light green one. Because light and dark swap together, a
 *      light-on-dark or dark-on-light pairing stays readable after the switch.
 *
 * Shadows and translucent colours (backdrops, overlays) are left alone.
 */

// ------------------------------------------------------------------ colour maths
const D65 = { x: 0.95047, y: 1.0, z: 1.08883 };

const toLinear = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const fromLinear = (c) => (c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055);

export function parseColor(value) {
  if (typeof value !== 'string') return null;
  const text = value.trim().toLowerCase();
  if (text === 'white') return { r: 255, g: 255, b: 255, a: 1 };
  if (text === 'black') return { r: 0, g: 0, b: 0, a: 1 };

  const match = /^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/.exec(text);
  if (!match) return null;

  let hex = match[1];
  if (hex.length <= 4) hex = [...hex].map((c) => c + c).join('');
  const number = (from) => parseInt(hex.slice(from, from + 2), 16);
  return { r: number(0), g: number(2), b: number(4), a: hex.length === 8 ? number(6) / 255 : 1 };
}

export function toHex({ r, g, b }) {
  const part = (n) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0');
  return `#${part(r)}${part(g)}${part(b)}`;
}

function rgbToLab({ r, g, b }) {
  const [lr, lg, lb] = [r, g, b].map((c) => toLinear(c / 255));
  const x = (0.4124564 * lr + 0.3575761 * lg + 0.1804375 * lb) / D65.x;
  const y = (0.2126729 * lr + 0.7151522 * lg + 0.072175 * lb) / D65.y;
  const z = (0.0193339 * lr + 0.119192 * lg + 0.9503041 * lb) / D65.z;
  const f = (t) => (t > 216 / 24389 ? Math.cbrt(t) : (24389 / 27 * t + 16) / 116);
  const [fx, fy, fz] = [f(x), f(y), f(z)];
  return { L: 116 * fy - 16, a: 500 * (fx - fy), b: 200 * (fy - fz) };
}

function labToRgb({ L, a, b }) {
  const fy = (L + 16) / 116;
  const [fx, fz] = [fy + a / 500, fy - b / 200];
  const inv = (t) => (t ** 3 > 216 / 24389 ? t ** 3 : (116 * t - 16) / (24389 / 27));
  const x = inv(fx) * D65.x;
  const y = (L > 8 ? fy ** 3 : L / (24389 / 27)) * D65.y;
  const z = inv(fz) * D65.z;
  const lr = 3.2404542 * x - 1.5371385 * y - 0.4985314 * z;
  const lg = -0.969266 * x + 1.8760108 * y + 0.041556 * z;
  const lb = 0.0556434 * x - 0.2040259 * y + 1.0572252 * z;
  return { r: fromLinear(lr) * 255, g: fromLinear(lg) * 255, b: fromLinear(lb) * 255 };
}

/** WCAG relative luminance, 0 (black) to 1 (white). */
export function luminance(color) {
  const { r, g, b } = typeof color === 'string' ? parseColor(color) : color;
  const [lr, lg, lb] = [r, g, b].map((c) => toLinear(c / 255));
  return 0.2126 * lr + 0.7152 * lg + 0.0722 * lb;
}

/** WCAG contrast ratio between two colours, 1 to 21. */
export function contrast(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

export function lightness(color) {
  return rgbToLab(typeof color === 'string' ? parseColor(color) : color).L;
}

/**
 * Swap light and dark while keeping hue, compressed so dark surfaces never reach pure black.
 *
 * Two exceptions keep the app's saturated accent colours (amber, green, red, tan) vivid,
 * because a plain inversion would darken them into mud on a dark background:
 *
 *  - `foreground` colours (text, icons) that are mid-tone are kept at least MIN_FOREGROUND_L
 *    bright, so an amber "2 days left" or a green "Fresh" label stays readable.
 *  - saturated mid-tone fills are kept at least MIN_ACCENT_FILL_L bright, so a warning
 *    badge stays a warning colour and the dark icon on it stays legible.
 *
 * Neutral light foregrounds (beige text on a brown fill) are not accents: they sit on
 * fills that turn light, so they invert to dark as normal.
 */
export const MIN_FOREGROUND_L = 58;
export const MIN_ACCENT_FILL_L = 52;
const ACCENT_CHROMA = 25;

export function invertLightness(hex, { foreground = false } = {}) {
  const parsed = parseColor(hex);
  const { L, a, b } = rgbToLab(parsed);
  const softened = 0.9;
  const saturated = Math.hypot(a, b) >= ACCENT_CHROMA;

  let inverted = 9 + 0.84 * (100 - L);
  if (foreground && L >= 40 && L <= (saturated ? 80 : 68)) inverted = Math.max(inverted, MIN_FOREGROUND_L);
  if (!foreground && saturated && L >= 40 && L <= 80) inverted = Math.max(inverted, MIN_ACCENT_FILL_L);
  return toHex(labToRgb({ L: inverted, a: a * softened, b: b * softened }));
}

/** How saturated a colour is (CIE chroma); neutrals are near 0, vivid accents above 40. */
export function chroma(color) {
  const { a, b } = rgbToLab(typeof color === 'string' ? parseColor(color) : color);
  return Math.hypot(a, b);
}

// ------------------------------------------------------------ designed core colours
/**
 * Explicit dark values for the colours the design is built from. Anything not listed
 * here is derived with invertLightness.
 */
export const DARK_CORE = {
  '#fff9f0': '#16110e', // page background
  '#f8f0e3': '#211a16', // card
  '#e6d8c8': '#3a2e26', // borders and dividers
  '#2f241f': '#f2e8dc', // text
  '#7a6a60': '#b3a394', // muted text
  '#5c4033': '#d9ae85', // brand: fills, headings and icons
};

/** White is a surface in some places and text on a coloured fill in others. */
export const DARK_WHITE = { surface: '#241c17', content: '#160f0b' };

const SURFACE_KEYS = new Set([
  'backgroundColor', 'borderColor', 'borderTopColor', 'borderBottomColor', 'borderLeftColor',
  'borderRightColor', 'borderStartColor', 'borderEndColor', 'borderBlockColor', 'outlineColor',
  'overlayColor', 'progressBackgroundColor', 'ios_backgroundColor'
]);

// Shadows stay black in dark mode: a light shadow would read as a glow.
const NEVER_MAPPED = new Set(['shadowColor', 'textShadowColor']);

const cache = new Map();

/**
 * The dark counterpart of a light colour.
 * @param {string} value a hex colour or CSS name; anything else is returned unchanged
 * @param {string} [key]  the style property it is used for, which decides what white means
 */
export function darkColor(value, key = 'color') {
  if (typeof value !== 'string' || NEVER_MAPPED.has(key)) return value;

  const cacheKey = `${SURFACE_KEYS.has(key) ? 's' : 'c'}${value}`;
  const known = cache.get(cacheKey);
  if (known) return known;

  const parsed = parseColor(value);
  let result = value;
  if (parsed && parsed.a === 1) {
    const hex = toHex(parsed);
    if (hex === '#ffffff') result = SURFACE_KEYS.has(key) ? DARK_WHITE.surface : DARK_WHITE.content;
    else result = DARK_CORE[hex] || invertLightness(hex, { foreground: !SURFACE_KEYS.has(key) });
  }
  cache.set(cacheKey, result);
  return result;
}

export const COLOR_STYLE_KEYS = [
  'backgroundColor', 'color', 'tintColor', 'textDecorationColor', 'overlayColor', 'outlineColor',
  'borderColor', 'borderTopColor', 'borderBottomColor', 'borderLeftColor', 'borderRightColor',
  'borderStartColor', 'borderEndColor', 'borderBlockColor'
];

/** A style object with its colours converted to dark. Style arrays are flattened first. */
export function darkStyle(style, flatten) {
  // No style stays no style. React Native Web's flatten() turns undefined into {}, and
  // some props (a FlatList's columnWrapperStyle) must be absent, not empty.
  if (style == null) return style;
  const flat = flatten ? flatten(style) : style;
  if (!flat || typeof flat !== 'object') return flat;

  let changed = null;
  for (const key of COLOR_STYLE_KEYS) {
    const value = flat[key];
    if (typeof value !== 'string') continue;
    const mapped = darkColor(value, key);
    if (mapped !== value) {
      changed = changed || { ...flat };
      changed[key] = mapped;
    }
  }
  return changed || flat;
}
