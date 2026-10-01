/**
 * Small building blocks shared by the secondary screens (History, Recipes, Admin):
 * a header with a back button, a titled card, selectable chips and a pill button.
 * Colours come from the light palette; the themed wrappers convert them in dark mode.
 */

import { Ionicons, Text, TouchableOpacity, View } from './themed';
import { LIGHT_COLORS as C } from '../src/theme/ThemeContext';

export function ScreenHeader({ title, subtitle, onBack, right }) {
  return (
    <View style={{ marginBottom: 14 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        {onBack ? (
          <TouchableOpacity onPress={onBack} hitSlop={12} style={{ marginRight: 10 }} accessibilityLabel="Go back">
            <Ionicons name="chevron-back" size={26} color={C.primary} />
          </TouchableOpacity>
        ) : null}
        <Text style={{ fontSize: 26, fontWeight: '800', color: C.text, flex: 1 }}>{title}</Text>
        {right}
      </View>
      {subtitle ? (
        <Text style={{ fontSize: 13, color: C.muted, lineHeight: 19, marginTop: 6 }}>{subtitle}</Text>
      ) : null}
    </View>
  );
}

export function SectionTitle({ children, right }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 8, marginBottom: 10 }}>
      <Text style={{ fontSize: 13, fontWeight: '800', color: C.muted, textTransform: 'uppercase', letterSpacing: 0.8 }}>
        {children}
      </Text>
      {right}
    </View>
  );
}

export function Card({ children, style }) {
  return (
    <View style={[{ backgroundColor: C.card, borderRadius: 18, padding: 16, marginBottom: 12 }, style]}>{children}</View>
  );
}

export function Chip({ label, selected, onPress, tone }) {
  const active = tone === 'danger' ? C.danger : C.primary;
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.8}
      accessibilityRole="button"
      accessibilityState={{ selected: Boolean(selected) }}
      style={{
        paddingVertical: 8,
        paddingHorizontal: 14,
        borderRadius: 20,
        marginRight: 8,
        marginBottom: 8,
        backgroundColor: selected ? active : C.background,
        borderWidth: 1,
        borderColor: selected ? active : C.border,
      }}
    >
      <Text style={{ fontSize: 13, fontWeight: '700', color: selected ? C.onPrimary : C.text }}>{label}</Text>
    </TouchableOpacity>
  );
}

export function PillButton({ label, onPress, icon, kind = 'primary', disabled, style }) {
  const filled = kind === 'primary';
  const danger = kind === 'danger';
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.85}
      accessibilityRole="button"
      style={[
        {
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          paddingVertical: 11,
          paddingHorizontal: 16,
          borderRadius: 14,
          backgroundColor: filled ? C.primary : C.background,
          borderWidth: filled ? 0 : 1,
          borderColor: danger ? C.danger : C.border,
          opacity: disabled ? 0.5 : 1,
        },
        style,
      ]}
    >
      {icon ? <Ionicons name={icon} size={16} color={filled ? C.onPrimary : danger ? C.danger : C.primary} /> : null}
      <Text
        style={{
          marginLeft: icon ? 6 : 0,
          fontSize: 13,
          fontWeight: '800',
          color: filled ? C.onPrimary : danger ? C.danger : C.primary,
        }}
      >
        {label}
      </Text>
    </TouchableOpacity>
  );
}

export function EmptyState({ icon = 'leaf-outline', title, message }) {
  return (
    <View style={{ alignItems: 'center', paddingVertical: 36, paddingHorizontal: 20 }}>
      <Ionicons name={icon} size={38} color={C.muted} />
      <Text style={{ fontSize: 16, fontWeight: '800', color: C.text, marginTop: 10 }}>{title}</Text>
      {message ? (
        <Text style={{ fontSize: 13, color: C.muted, marginTop: 6, textAlign: 'center', lineHeight: 19 }}>{message}</Text>
      ) : null}
    </View>
  );
}
