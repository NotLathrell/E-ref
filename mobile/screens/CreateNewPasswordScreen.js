import { useState } from "react";
import { changePassword, resetPassword } from "../services/auth";
import {
  AuthField,
  AuthHeading,
  AuthLayout,
  ErrorText,
  PrimaryButton,
} from "../components/auth";

export function CreateNewPasswordScreen({ navigation, route }) {
  // Arriving from the emailed-code flow carries a reset token; arriving from the
  // Profile screen means the user is signed in and must give their current password.
  const resetToken = route?.params?.resetToken;
  const [currentPassword, setCurrentPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");

  const edit = (setter) => (text) => {
    setter(text);
    setError("");
  };

  const handleSavePassword = async () => {
    if (!password || !confirmPassword || (!resetToken && !currentPassword)) {
      setError("Please complete all fields.");
      return;
    }

    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setError("");
    setBusy(true);
    try {
      if (resetToken) {
        await resetPassword(resetToken, password);
      } else {
        await changePassword(currentPassword, password);
      }
      navigation.navigate("PasswordSuccess");
    } catch (err) {
      setError(err?.message || "Could not update your password. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthLayout tagline={null}>
      <AuthHeading
        title="Create New Password"
        subtitle="Choose a strong password for your E-REF account."
      />

      {resetToken ? null : (
        <AuthField
          label="Current Password"
          secure
          value={currentPassword}
          onChangeText={edit(setCurrentPassword)}
          placeholder="Your current password"
          autoCapitalize="none"
          autoCorrect={false}
        />
      )}

      <AuthField
        label="New Password"
        secure
        value={password}
        onChangeText={edit(setPassword)}
        placeholder="At least 8 characters"
        autoCapitalize="none"
        autoCorrect={false}
      />

      <AuthField
        label="Confirm Password"
        secure
        value={confirmPassword}
        onChangeText={edit(setConfirmPassword)}
        placeholder="Repeat your new password"
        autoCapitalize="none"
        autoCorrect={false}
      />

      <ErrorText>{error}</ErrorText>

      <PrimaryButton label="Save Password" busyLabel="Saving..." busy={busy} onPress={handleSavePassword} />
    </AuthLayout>
  );
}
