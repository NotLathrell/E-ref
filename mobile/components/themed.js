/**
 * Theme-aware versions of the React Native components the screens use.
 *
 * Screens import View, Text, TextInput and the rest from here instead of from
 * "react-native". In light mode each one renders the plain component untouched. In
 * dark mode it converts the colours in its style to their dark counterparts (see
 * src/theme/darkMode.js), so a screen written once looks right in both themes.
 *
 * Text and TextInput also get a default text colour in dark mode: React Native's own
 * default is black, which would vanish on a dark background.
 *
 * Pass themed={false} to leave one element's own colours alone, for content drawn over
 * a photo or on a fixed light badge.
 */

import { forwardRef, useContext } from 'react';
import * as RN from 'react-native';
import { Ionicons as BaseIonicons, MaterialCommunityIcons as BaseMaterialCommunityIcons } from '@expo/vector-icons';
import { InTextContext, useTheme } from '../src/theme/ThemeContext';
import { darkColor, darkStyle } from '../src/theme/darkMode';

const flatten = RN.StyleSheet.flatten;

function dark(style) {
  return darkStyle(style, flatten);
}

function darkPressableStyle(style) {
  return typeof style === 'function' ? (state) => dark(style(state)) : dark(style);
}

/** Props to pass to an element so its own colours are left alone, and tests can see it. */
function fixedProps(themed, rest) {
  return themed === false ? { ...rest, themeFixed: true } : rest;
}

export function View({ themed = true, style, ...rest }) {
  const { isDark } = useTheme();
  const on = isDark && themed;
  return <RN.View style={on ? dark(style) : style} {...fixedProps(themed, rest)} />;
}

export function Image({ themed = true, style, ...rest }) {
  const { isDark } = useTheme();
  return <RN.Image style={isDark && themed ? dark(style) : style} {...fixedProps(themed, rest)} />;
}

export function Text({ themed = true, style, ...rest }) {
  const { isDark, colors } = useTheme();
  const nested = useContext(InTextContext);

  if (!isDark || !themed) return <RN.Text style={style} {...fixedProps(themed, rest)} />;

  let mapped = dark(style) || {};
  // A Text inside another Text inherits its colour; only a top-level one needs a default.
  if (!nested && flatten(mapped)?.color == null) mapped = { ...flatten(mapped), color: colors.text };

  const element = <RN.Text style={mapped} {...rest} />;
  return nested ? element : <InTextContext.Provider value={true}>{element}</InTextContext.Provider>;
}

export function TextInput({ themed = true, style, placeholderTextColor, selectionColor, ...rest }) {
  const { isDark, colors } = useTheme();
  if (!isDark || !themed) {
    return (
      <RN.TextInput
        style={style}
        placeholderTextColor={placeholderTextColor}
        selectionColor={selectionColor}
        {...fixedProps(themed, rest)}
      />
    );
  }

  let mapped = dark(style) || {};
  if (flatten(mapped)?.color == null) mapped = { ...flatten(mapped), color: colors.text };

  return (
    <RN.TextInput
      style={mapped}
      placeholderTextColor={placeholderTextColor ? darkColor(placeholderTextColor) : colors.muted}
      selectionColor={selectionColor ? darkColor(selectionColor) : colors.primary}
      keyboardAppearance="dark"
      {...rest}
    />
  );
}

export function TouchableOpacity({ themed = true, style, ...rest }) {
  const { isDark } = useTheme();
  return <RN.TouchableOpacity style={isDark && themed ? dark(style) : style} {...fixedProps(themed, rest)} />;
}

export function Pressable({ themed = true, style, ...rest }) {
  const { isDark } = useTheme();
  return <RN.Pressable style={isDark && themed ? darkPressableStyle(style) : style} {...fixedProps(themed, rest)} />;
}

export function KeyboardAvoidingView({ themed = true, style, contentContainerStyle, ...rest }) {
  const { isDark } = useTheme();
  const on = isDark && themed;
  return (
    <RN.KeyboardAvoidingView
      style={on ? dark(style) : style}
      contentContainerStyle={on ? dark(contentContainerStyle) : contentContainerStyle}
      {...fixedProps(themed, rest)}
    />
  );
}

export const ScrollView = forwardRef(function ScrollView({ themed = true, style, contentContainerStyle, ...rest }, ref) {
  const { isDark } = useTheme();
  const on = isDark && themed;
  return (
    <RN.ScrollView
      ref={ref}
      style={on ? dark(style) : style}
      contentContainerStyle={on ? dark(contentContainerStyle) : contentContainerStyle}
      indicatorStyle={on ? 'white' : undefined}
      {...fixedProps(themed, rest)}
    />
  );
});

export function FlatList({ themed = true, style, contentContainerStyle, columnWrapperStyle, ...rest }) {
  const { isDark } = useTheme();
  const on = isDark && themed;
  return (
    <RN.FlatList
      style={on ? dark(style) : style}
      contentContainerStyle={on ? dark(contentContainerStyle) : contentContainerStyle}
      indicatorStyle={on ? 'white' : undefined}
      {...(columnWrapperStyle ? { columnWrapperStyle: on ? dark(columnWrapperStyle) : columnWrapperStyle } : null)}
      {...fixedProps(themed, rest)}
    />
  );
}

export function ActivityIndicator({ color, ...rest }) {
  const { isDark, colors } = useTheme();
  return <RN.ActivityIndicator color={isDark ? (color ? darkColor(color) : colors.muted) : color} {...rest} />;
}

export function Switch({ trackColor, thumbColor, ios_backgroundColor, ...rest }) {
  const { isDark } = useTheme();
  if (!isDark) {
    return <RN.Switch trackColor={trackColor} thumbColor={thumbColor} ios_backgroundColor={ios_backgroundColor} {...rest} />;
  }
  const track = trackColor && {
    false: trackColor.false && darkColor(trackColor.false, 'backgroundColor'),
    true: trackColor.true && darkColor(trackColor.true, 'backgroundColor')
  };
  return (
    <RN.Switch
      trackColor={track}
      thumbColor={thumbColor && darkColor(thumbColor)}
      ios_backgroundColor={ios_backgroundColor && darkColor(ios_backgroundColor, 'backgroundColor')}
      {...rest}
    />
  );
}

export function RefreshControl({ colors, tintColor, progressBackgroundColor, ...rest }) {
  const { isDark } = useTheme();
  if (!isDark) {
    return <RN.RefreshControl colors={colors} tintColor={tintColor} progressBackgroundColor={progressBackgroundColor} {...rest} />;
  }
  return (
    <RN.RefreshControl
      colors={colors && colors.map((c) => darkColor(c))}
      tintColor={tintColor && darkColor(tintColor)}
      progressBackgroundColor={progressBackgroundColor && darkColor(progressBackgroundColor, 'backgroundColor')}
      {...rest}
    />
  );
}

export function Ionicons({ color, themed = true, ...rest }) {
  const { isDark } = useTheme();
  return <BaseIonicons color={isDark && themed ? darkColor(color) : color} {...fixedProps(themed, rest)} />;
}

export function MaterialCommunityIcons({ color, themed = true, ...rest }) {
  const { isDark } = useTheme();
  return <BaseMaterialCommunityIcons color={isDark && themed ? darkColor(color) : color} {...fixedProps(themed, rest)} />;
}
