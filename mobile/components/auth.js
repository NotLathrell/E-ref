/**
 * The building blocks of the sign-in, sign-up and password-reset screens, so all five
 * share the look of the rest of the app: the same cream page, card-coloured inputs,
 * brown buttons and rounded corners as the dashboard.
 */

import { useState } from "react";
import { Platform } from "react-native";
import {
  Image,
  KeyboardAvoidingView,
  ScrollView,
  Text,
  TextInput,
  View,
} from "./themed";
import { AnimatedScreen } from "./animations/AnimatedScreen";
import { AnimatedTouchableOpacity } from "./animations/AnimatedTouchableOpacity";
import { LIGHT_COLORS as C } from "../src/theme/ThemeContext";

/** Tall enough to sit under the notch and clear the keyboard on every phone. */
const PAGE_PADDING = { paddingHorizontal: 24, paddingTop: 64, paddingBottom: 40 };

export function AuthLayout({ children, tagline = "Scan, predict, and reduce food waste." }) {
  return (
    <AnimatedScreen>
      <KeyboardAvoidingView
        style={{ flex: 1, backgroundColor: C.background }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ flexGrow: 1, ...PAGE_PADDING }}
        >
          {/* The logo has dark lettering, so it sits on a fixed light badge in dark mode. */}
          <View style={{ alignItems: "center", marginBottom: 26 }}>
            <View
              themed={false}
              style={{
                backgroundColor: C.background,
                borderRadius: 32,
                padding: 14,
                alignItems: "center",
              }}
            >
              <Image
                source={require("../assets/ERef-Logo.png")}
                resizeMode="contain"
                style={{ width: 140, height: 140 }}
              />
            </View>
            {tagline ? (
              <Text style={{ marginTop: 10, fontSize: 14, color: C.muted, textAlign: "center" }}>
                {tagline}
              </Text>
            ) : null}
          </View>

          {children}
        </ScrollView>
      </KeyboardAvoidingView>
    </AnimatedScreen>
  );
}

export function AuthHeading({ title, subtitle }) {
  return (
    <View style={{ marginBottom: 26 }}>
      <Text style={{ fontSize: 30, fontWeight: "800", color: C.text }}>{title}</Text>
      {subtitle ? (
        <Text style={{ marginTop: 6, fontSize: 15, lineHeight: 21, color: C.muted }}>
          {subtitle}
        </Text>
      ) : null}
    </View>
  );
}

/** A labelled, card-coloured input. `secure` adds a Show/Hide toggle. */
export function AuthField({ label, secure = false, style, ...inputProps }) {
  const [focused, setFocused] = useState(false);
  const [revealed, setRevealed] = useState(false);

  return (
    <View style={{ marginBottom: 16 }}>
      <Text style={{ marginBottom: 8, fontSize: 14, fontWeight: "700", color: C.text }}>
        {label}
      </Text>

      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          backgroundColor: C.card,
          borderWidth: 1.5,
          borderColor: focused ? C.primary : C.border,
          borderRadius: 14,
          paddingHorizontal: 16,
        }}
      >
        <TextInput
          {...inputProps}
          secureTextEntry={secure && !revealed}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          placeholderTextColor={C.muted}
          style={[{ flex: 1, paddingVertical: 14, fontSize: 16, color: C.text }, style]}
        />

        {secure ? (
          <AnimatedTouchableOpacity onPress={() => setRevealed((value) => !value)}>
            <Text style={{ fontSize: 14, fontWeight: "700", color: C.primary }}>
              {revealed ? "Hide" : "Show"}
            </Text>
          </AnimatedTouchableOpacity>
        ) : null}
      </View>
    </View>
  );
}

export function PrimaryButton({ label, busyLabel, busy = false, onPress }) {
  return (
    <AnimatedTouchableOpacity
      activeOpacity={0.85}
      onPress={onPress}
      disabled={busy}
      style={{
        backgroundColor: C.primary,
        opacity: busy ? 0.65 : 1,
        borderRadius: 16,
        paddingVertical: 16,
        alignItems: "center",
        justifyContent: "center",
        marginTop: 10,
        marginBottom: 18,
      }}
    >
      <Text style={{ fontSize: 17, fontWeight: "800", color: C.onPrimary }}>
        {busy && busyLabel ? busyLabel : label}
      </Text>
    </AnimatedTouchableOpacity>
  );
}

export function ErrorText({ children, tone = "danger" }) {
  return children ? (
    <Text
      style={{
        color: tone === "danger" ? C.danger : C.muted,
        fontSize: 14,
        fontWeight: "600",
        textAlign: "center",
        marginBottom: 12,
      }}
    >
      {children}
    </Text>
  ) : null;
}

export function InfoText({ children }) {
  return children ? (
    <Text
      style={{
        color: C.success,
        fontSize: 14,
        fontWeight: "600",
        textAlign: "center",
        marginBottom: 12,
      }}
    >
      {children}
    </Text>
  ) : null;
}

/** "Muted sentence + bold link" line used for switching screens. */
export function LinkRow({ prompt, action, onPress, align = "center" }) {
  return (
    <AnimatedTouchableOpacity onPress={onPress} style={{ alignSelf: align, marginBottom: 14 }}>
      <Text style={{ fontSize: 14, color: C.muted }}>
        {prompt}
        <Text style={{ color: C.primary, fontWeight: "800" }}> {action}</Text>
      </Text>
    </AnimatedTouchableOpacity>
  );
}

/** Two-option switch, styled like the category pills elsewhere in the app. */
export function SegmentedControl({ options, value, onChange }) {
  return (
    <View
      style={{
        flexDirection: "row",
        backgroundColor: C.card,
        borderRadius: 16,
        padding: 4,
        marginBottom: 26,
        borderWidth: 1,
        borderColor: C.border,
      }}
    >
      {options.map(([id, label]) => {
        const active = id === value;
        return (
          <AnimatedTouchableOpacity
            key={id}
            activeOpacity={0.85}
            onPress={() => onChange(id)}
            style={{
              flex: 1,
              paddingVertical: 11,
              borderRadius: 12,
              alignItems: "center",
              backgroundColor: active ? C.primary : "transparent",
            }}
          >
            <Text style={{ fontSize: 15, fontWeight: "800", color: active ? C.onPrimary : C.muted }}>
              {label}
            </Text>
          </AnimatedTouchableOpacity>
        );
      })}
    </View>
  );
}
