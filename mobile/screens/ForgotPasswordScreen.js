import { useState } from "react";
import { Modal } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { Text, View } from "../components/themed";
import { AnimatedTouchableOpacity } from "../components/animations/AnimatedTouchableOpacity";
import { forgotPassword } from "../services/auth";
import {
  AuthField,
  AuthHeading,
  AuthLayout,
  ErrorText,
  LinkRow,
  PrimaryButton,
} from "../components/auth";
import { LIGHT_COLORS as C } from "../src/theme/ThemeContext";

export function ForgotPasswordScreen() {
  const navigation = useNavigation();

  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [showNotice, setShowNotice] = useState(false);
  const [busy, setBusy] = useState(false);

  const handleEnter = async () => {
    if (!email.trim()) {
      setError("Please enter your email.");
      return;
    }

    if (!email.includes("@")) {
      setError("Please enter a valid email.");
      return;
    }

    setError("");
    setBusy(true);
    try {
      await forgotPassword(email.trim());
      setShowNotice(true);
    } catch (err) {
      setError(err?.message || "Could not send the code. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthLayout>
      <AuthHeading
        title="Forgot your password?"
        subtitle="Enter your email and we'll send you a 6-digit code to reset it."
      />

      <AuthField
        label="Email"
        value={email}
        onChangeText={(text) => {
          setEmail(text);
          setError("");
        }}
        placeholder="you@example.com"
        keyboardType="email-address"
        autoCapitalize="none"
        autoCorrect={false}
      />

      <ErrorText>{error}</ErrorText>

      <PrimaryButton label="Send Code" busyLabel="Sending..." busy={busy} onPress={handleEnter} />

      <LinkRow prompt="Remembered it?" action="Back to sign in" onPress={() => navigation.goBack()} />

      <Modal
        visible={showNotice}
        transparent
        animationType="fade"
        onRequestClose={() => setShowNotice(false)}
      >
        <View
          style={{
            flex: 1,
            backgroundColor: "rgba(0,0,0,0.55)",
            justifyContent: "center",
            paddingHorizontal: 28,
          }}
        >
          <View
            style={{
              backgroundColor: C.background,
              borderRadius: 24,
              borderWidth: 1,
              borderColor: C.border,
              padding: 24,
            }}
          >
            <Text style={{ fontSize: 20, fontWeight: "800", color: C.text, marginBottom: 8 }}>
              Check your email
            </Text>

            <Text style={{ fontSize: 15, lineHeight: 21, color: C.muted, marginBottom: 20 }}>
              If that email is registered, a verification code has been sent. Check your inbox.
            </Text>

            <AnimatedTouchableOpacity
              activeOpacity={0.85}
              onPress={() => {
                setShowNotice(false);
                navigation.navigate("VerifyCode", { email: email.trim() });
              }}
              style={{
                backgroundColor: C.primary,
                borderRadius: 14,
                paddingVertical: 14,
                alignItems: "center",
              }}
            >
              <Text style={{ fontSize: 16, fontWeight: "800", color: C.onPrimary }}>Enter Code</Text>
            </AnimatedTouchableOpacity>
          </View>
        </View>
      </Modal>
    </AuthLayout>
  );
}
