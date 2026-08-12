import { useState } from "react";
import {
  View,
  Text,
  Image,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  ScrollView,
  Platform,
} from "react-native";

const BRAND = "#16567b";

const keyboardAvoidingViewStyle = {
// Inline styles moved to the top
// ─────────────────────────────────────────────────────────────

const keyboardAvoidingViewStyle = {
  flex: 1,
  backgroundColor: "#FFFFFF",
};

const scrollContentStyle = {
  flexGrow: 1,
  paddingHorizontal: 28,
  paddingTop: 50,
  paddingBottom: 40,
};

const logoContainerStyle = {
  alignItems: "center",
  marginBottom: 25,
};

const logoImageStyle = {
  width: 170,
  height: 170,
};

const titleContainerStyle = {
  alignItems: "center",
  marginBottom: 35,
};

const titleStyle = {
  fontSize: 30,
  fontWeight: "700",
  color: "#000",
};

const subtitleStyle = {
  marginTop: 10,
  textAlign: "center",
  fontSize: 15,
  color: "#777",
  lineHeight: 22,
};

const sectionContainerStyle = {
  marginBottom: 20,
};

const sectionLabelStyle = {
  color: "#888",
  marginBottom: 8,
  fontSize: 15,
  fontWeight: "500",
};

const inputWrapperStyle = {
  flexDirection: "row",
  alignItems: "center",
  backgroundColor: "#ECECEC",
  borderRadius: 8,
  paddingHorizontal: 15,
};

const inputStyle = {
  flex: 1,
  paddingVertical: 14,
  fontSize: 16,
};

const toggleTextStyle = {
  color: BRAND,
  fontWeight: "600",
};

const errorTextStyle = {
  color: "#E53935",
  textAlign: "center",
  marginBottom: 20,
};

const saveButtonStyle = {
  backgroundColor: BRAND,
  borderRadius: 8,
  paddingVertical: 16,
  alignItems: "center",
  marginTop: 10,
};

const saveButtonTextStyle = {
  color: "#FFF",
  fontSize: 18,
  fontWeight: "700",
};

// ─────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────

export function CreateNewPasswordScreen({ navigation }) {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const [error, setError] = useState("");

  const handleSavePassword = () => {
    if (!password || !confirmPassword) {
      setError("Please complete all fields.");
      return;
    }

    if (password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setError("");

    // Frontend only
    navigation.navigate("PasswordSuccess");
  };

  return (
    <KeyboardAvoidingView
      style={keyboardAvoidingViewStyle}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={scrollContentStyle}
      >
        {/* Logo */}
        <View style={logoContainerStyle}>
          <Image
            source={require("../assets/ERef-Logo.png")}
            resizeMode="contain"
            style={logoImageStyle}
          />
        </View>

        {/* Title */}
        <View style={titleContainerStyle}>
          <Text style={titleStyle}>
            Create New Password
          </Text>

          <Text style={subtitleStyle}>
            Create a strong password for
            {"\n"}
            your E-REF account.
          </Text>
        </View>

        {/* New Password */}
        <View style={sectionContainerStyle}>
          <Text style={sectionLabelStyle}>
            New Password
          </Text>

          <View style={inputWrapperStyle}>
            <TextInput
              value={password}
              onChangeText={(text) => {
                setPassword(text);
                setError("");
              }}
              secureTextEntry={!showPassword}
              placeholder="Enter new password"
              placeholderTextColor="#999"
              style={inputStyle}
            />

            <TouchableOpacity
              onPress={() => setShowPassword(!showPassword)}
            >
              <Text style={toggleTextStyle}>
                {showPassword ? "Hide" : "Show"}
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Confirm Password */}
        <View style={sectionContainerStyle}>
          <Text style={sectionLabelStyle}>
            Confirm Password
          </Text>

          <View style={inputWrapperStyle}>
            <TextInput
              value={confirmPassword}
              onChangeText={(text) => {
                setConfirmPassword(text);
                setError("");
              }}
              secureTextEntry={!showConfirmPassword}
              placeholder="Confirm your password"
              placeholderTextColor="#999"
              style={inputStyle}
            />

            <TouchableOpacity
              onPress={() =>
                setShowConfirmPassword(!showConfirmPassword)
              }
            >
              <Text style={toggleTextStyle}>
                {showConfirmPassword ? "Hide" : "Show"}
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Error */}
        {error ? (
          <Text style={errorTextStyle}>
            {error}
          </Text>
        ) : null}

        {/* Save Button */}
        <TouchableOpacity
          onPress={handleSavePassword}
          style={saveButtonStyle}
        >
          <Text style={saveButtonTextStyle}>
            Save Password
          </Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}