import { createContext, useContext, useMemo } from 'react';
import { useColorScheme } from 'react-native';
import { darkColor } from './darkMode';

/** The design's colours in light mode. Dark values are derived from these (see darkMode.js). */
export const LIGHT_COLORS = {
  background: '#FFF7ED',
  card: '#FFEDD5',
  border: '#FED7AA',
  text: '#431407',
  muted: '#8A6D56',
  primary: '#C2410C',
  onPrimary: '#FFFFFF',
  accent: '#9A3412',
  gold: '#FBBF24',
  success: '#6F9B72',
  warning: '#D89B3D',
  danger: '#C95C54',
  white: '#FFFFFF'
};

const SURFACES = new Set(['background', 'card', 'border', 'white']);

function deriveDark(light) {
  const dark = {};
  for (const [name, value] of Object.entries(light)) {
    dark[name] = darkColor(value, SURFACES.has(name) ? 'backgroundColor' : 'color');
  }
  return dark;
}

export const DARK_COLORS = deriveDark(LIGHT_COLORS);

export const THEME_PREFERENCES = ['system', 'light', 'dark'];

/** 'system' follows the phone; anything else is an explicit choice. */
export function resolveMode(preference, systemScheme) {
  if (preference === 'light' || preference === 'dark') return preference;
  return systemScheme === 'dark' ? 'dark' : 'light';
}

export function makeTheme(mode, preference = 'system') {
  const isDark = mode === 'dark';
  return { mode, isDark, preference, colors: isDark ? DARK_COLORS : LIGHT_COLORS };
}

export const ThemeContext = createContext(makeTheme('light'));
ThemeContext.displayName = 'ThemeContext';

/** True while rendering inside a Text, so a nested Text inherits its parent's colour. */
export const InTextContext = createContext(false);
InTextContext.displayName = 'InTextContext';

export function ThemeProvider({ preference = 'system', children }) {
  const system = useColorScheme();
  const mode = resolveMode(preference, system);
  const value = useMemo(() => makeTheme(mode, preference), [mode, preference]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  return useContext(ThemeContext);
}
