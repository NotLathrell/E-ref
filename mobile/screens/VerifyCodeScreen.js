import { useState } from "react";
import { useNavigation, useRoute } from "@react-navigation/native";
import { forgotPassword, verifyResetCode } from "../services/auth";
import {
  AuthField,
  AuthHeading,
  AuthLayout,
  ErrorText,
  InfoText,
  LinkRow,
  PrimaryButton,
} from "../components/auth";

export function VerifyCodeScreen() {
  const navigation = useNavigation();
  const route = useRoute();

  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [busy, setBusy] = useState(false);

  const email = route?.params?.email || "";

  const handleVerify = async () => {
    if (!code.trim()) {
      setError("Please enter the verification code.");
      return;
    }

    if (code.length !== 6) {
      setError("Please enter the 6-digit verification code.");
      return;
    }

    setError("");
    setBusy(true);
    try {
      const { resetToken } = await verifyResetCode(email, code.trim());
      navigation.navigate("CreateNewPassword", { resetToken });
    } catch (err) {
      setError(err?.message || "Could not verify the code. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  const handleResend = async () => {
    setError("");
    setInfo("");
    try {
      await forgotPassword(email);
      setInfo("A new code has been sent.");
    } catch (err) {
      setError(err?.message || "Could not send a new code. Please try again.");
    }
  };

  return (
    <AuthLayout>
      <AuthHeading
        title="Enter your code"
        subtitle="We sent a 6-digit code to the email below. It expires in 15 minutes."
      />

      <AuthField label="Email" value={email} editable={false} />

      <LinkRow
        prompt="Not your email?"
        action="Change it"
        align="flex-start"
        onPress={() => navigation.goBack()}
      />

      <AuthField
        label="Verification Code"
        value={code}
        onChangeText={(text) => {
          setCode(text);
          setError("");
          setInfo("");
        }}
        placeholder="6-digit code"
        keyboardType="number-pad"
        maxLength={6}
      />

      <ErrorText>{error}</ErrorText>
      <InfoText>{info}</InfoText>

      <PrimaryButton label="Verify Code" busyLabel="Checking..." busy={busy} onPress={handleVerify} />

      <LinkRow prompt="Did not get the code?" action="Send it again" onPress={handleResend} />
    </AuthLayout>
  );
}
