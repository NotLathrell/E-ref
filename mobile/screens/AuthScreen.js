import { useEffect, useState } from "react";
import { useNavigation } from "@react-navigation/native";
import { useInventory } from "../context/InventoryContext";
import { getApiUrl, onApiUrlChange, setApiOverride } from "../services/apiConfig";
import {
  AuthField,
  AuthHeading,
  AuthLayout,
  ErrorText,
  LinkRow,
  PrimaryButton,
  SegmentedControl,
} from "../components/auth";

const EMAIL_PATTERN = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export function AuthScreen() {
  const [mode, setMode] = useState("signin");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const navigation = useNavigation();
  const { signIn, signUp } = useInventory();

  const [showServer, setShowServer] = useState(false);
  const [serverInput, setServerInput] = useState(getApiUrl());
  const [serverNote, setServerNote] = useState("");

  useEffect(() => onApiUrlChange(setServerInput), []);

  const isSignIn = mode === "signin";

  const saveServer = async () => {
    const saved = await setApiOverride(serverInput);
    setServerInput(saved);
    setServerNote(`Using ${saved}`);
  };

  const edit = (setter) => (text) => {
    setter(text);
    setError("");
  };

  const handleSubmit = async () => {
    if (!isSignIn && name.trim().length === 0) {
      setError("Please enter your name");
      return;
    }
    if (!EMAIL_PATTERN.test(email.trim())) {
      setError("Please enter a valid email");
      return;
    }
    if (!isSignIn && password.length < 8) {
      setError("Password must be at least 8 characters");
      return;
    }
    if (password.length === 0) {
      setError("Please enter your password");
      return;
    }
    if (!isSignIn && password !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    setError("");

    try {
      setIsLoading(true);
      // Signing in changes the session, and the navigator switches to the app on its own.
      if (isSignIn) {
        await signIn({ email: email.trim(), password });
      } else {
        await signUp({ name: name.trim(), email: email.trim(), password });
      }
    } catch (err) {
      setError(err?.message || "Authentication failed. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <AuthLayout>
      <AuthHeading
        title={isSignIn ? "Welcome back" : "Create your account"}
        subtitle={
          isSignIn
            ? "Sign in to see what needs using up."
            : "Start tracking your food and cutting waste."
        }
      />

      <SegmentedControl
        options={[
          ["signin", "Sign In"],
          ["signup", "Sign Up"],
        ]}
        value={mode}
        onChange={(next) => {
          setMode(next);
          setError("");
        }}
      />

      {isSignIn ? null : (
        <AuthField
          label="Name"
          value={name}
          onChangeText={edit(setName)}
          placeholder="Your name"
          autoCapitalize="words"
        />
      )}

      <AuthField
        label="Email"
        value={email}
        onChangeText={edit(setEmail)}
        placeholder="you@example.com"
        keyboardType="email-address"
        autoCapitalize="none"
        autoCorrect={false}
      />

      <AuthField
        label="Password"
        secure
        value={password}
        onChangeText={edit(setPassword)}
        placeholder={isSignIn ? "Your password" : "At least 8 characters"}
        autoCapitalize="none"
        autoCorrect={false}
      />

      {isSignIn ? null : (
        <AuthField
          label="Confirm Password"
          secure
          value={confirmPassword}
          onChangeText={edit(setConfirmPassword)}
          placeholder="Repeat your password"
          autoCapitalize="none"
          autoCorrect={false}
        />
      )}

      <ErrorText>{error}</ErrorText>

      <PrimaryButton
        label={isSignIn ? "Sign In" : "Create Account"}
        busyLabel="Please wait..."
        busy={isLoading}
        onPress={handleSubmit}
      />

      {isSignIn ? (
        <LinkRow
          prompt="Forgot your password?"
          action="Reset it"
          onPress={() => navigation.navigate("ForgotPassword")}
        />
      ) : null}

      <LinkRow
        prompt="Can't connect?"
        action={showServer ? "Hide server address" : "Set server address"}
        onPress={() => setShowServer((open) => !open)}
      />

      {showServer ? (
        <>
          <AuthField
            label="Server address"
            value={serverInput}
            onChangeText={(text) => {
              setServerInput(text);
              setServerNote("");
            }}
            placeholder="https://your-server.trycloudflare.com"
            keyboardType="url"
            autoCapitalize="none"
            autoCorrect={false}
          />
          <PrimaryButton label="Save server address" onPress={saveServer} />
          <ErrorText tone="muted">{serverNote}</ErrorText>
        </>
      ) : null}
    </AuthLayout>
  );
}
