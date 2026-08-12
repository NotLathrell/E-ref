import { useState } from "react";
import {
  View,
  Text,
  Image,
  TextInput,
  TouchableOpacity,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from "react-native";
import { useNavigation } from "@react-navigation/native";
import { useInventory } from "../context/InventoryContext";

const BRAND = "#16567b";

const keyboardAvoidingViewStyle = {
  flex: 1,
  backgroundColor: "#FFFFFF",
};

const scrollContentStyle = {
  flexGrow: 1,
  paddingHorizontal: 28,
  paddingTop: 56,
  paddingBottom: 40,
};

const brandLogoContainerStyle = {
  alignItems: "center",
  marginBottom: 20,
};

const brandLogoImageStyle = {
  width: 220,
  height: 220,
};

const brandLogoTaglineStyle = {
  marginTop: 1,
  fontSize: 16,
  color: "#666666",
};

const welcomeContainerStyle = {
  alignItems: "center",
  marginBottom: 40,
};

const welcomeTitleStyle = {
  fontSize: 34,
  fontWeight: "700",
  color: "#000000",
  textAlign: "center",
};

const welcomeSubtitleStyle = {
  marginTop: 8,
  fontSize: 16,
  color: "#C7C2C2",
  textAlign: "center",
};

const inputContainerStyle = {
  marginBottom: 16,
};

const inputLabelStyle = {
  color: "#888",
  marginBottom: 8,
  fontSize: 15,
  fontWeight: "500",
};

const inputStyle = {
  backgroundColor: "#ECECEC",
  borderRadius: 8,
  paddingHorizontal: 15,
  paddingVertical: 14,
  fontSize: 16,
  color: "#000",
};

const passwordWrapperStyle = {
  flexDirection: "row",
  alignItems: "center",
  backgroundColor: "#ECECEC",
  borderRadius: 8,
  paddingHorizontal: 15,
};

const passwordInputStyle = {
  flex: 1,
  paddingVertical: 14,
  fontSize: 16,
  color: "#000",
};

const toggleTextStyle = {
  color: BRAND,
  fontWeight: "600",
};

const errorTextStyle = {
  color: "#E53935",
  fontSize: 14,
  textAlign: "center",
  marginTop: 10,
  marginBottom: 15,
};

const switchLinkContainerStyle = {
  alignSelf: "flex-end",
  marginBottom: 20,
};

const switchLinkTextStyle = {
  color: "#666",
  fontSize: 14,
};

const switchLinkHighlightStyle = {
  color: BRAND,
  fontWeight: "700",
};

const submitButtonStyle = (isLoading) => ({
  backgroundColor: isLoading ? "#7a9bb0" : BRAND,
  borderRadius: 8,
  paddingVertical: 16,
  alignItems: "center",
  justifyContent: "center",
  marginTop: 30,
  marginBottom: 20,
  shadowColor: "#000",
  shadowOpacity: 0.12,
  shadowRadius: 5,
  shadowOffset: {
    width: 0,
    height: 3,
  },
  elevation: 4,
});

const submitButtonTextStyle = {
  color: "#FFFFFF",
  fontSize: 18,
  fontWeight: "700",
};

function BrandLogo() {
  return (
    <View style={brandLogoContainerStyle}>
      <Image
        source={require("../assets/ERef-Logo.png")}
        resizeMode="contain"
        style={brandLogoImageStyle}
      />

      <Text style={brandLogoTaglineStyle}>
        Scan, predict, and reduce food waste.
      </Text>
    </View>
  );
}

export function AuthScreen() {
  const [mode, setMode] = useState("signin");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [error, setError] = useState("");
  const navigation = useNavigation();
  const { signIn } = useInventory();
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async () => {
    if (mode === "signup" && name.trim().length === 0) {
      setError("Please enter your name");
      return;
    }
    if (!email.includes("@")) {
      setError("Please enter a valid email");
      return;
    }
    if (password.length < 4) {
      setError("Password must be at least 4 characters");
      return;
    }
    if (mode === "signup" && password !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    setError("");

    try {
      setIsLoading(true);
      console.log("Signing in with:", email, password);

      await signIn({
        name: name.trim() || email.split("@")[0],
        email: email.trim(),
      });

      navigation.replace("Main");
    } catch (err) {
      setError("Authentication failed. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  const isSignIn = mode === "signin";

  return (
    <KeyboardAvoidingView
      style={keyboardAvoidingViewStyle}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        className="flex-1 bg-white"
        contentContainerStyle={scrollContentStyle}
        keyboardShouldPersistTaps="handled"
      >
        <BrandLogo />
        <View style={welcomeContainerStyle}>
          <Text style={welcomeTitleStyle}>
            Hi, Welcome back!
          </Text>

          <Text style={welcomeSubtitleStyle}>
            Hope you're doing fine.
          </Text>
        </View>
        {mode === "signup" && (
          <View className="mb-4">
            <Text className="text-slate-400 mb-2">Name:</Text>
            <TextInput
              value={name}
              onChangeText={(text) => {
                setName(text);
                setError("");
              }}
              placeholder="Enter your name"
              placeholderTextColor="#999"
              autoCapitalize="words"
              style={inputStyle}
            />
          </View>
        )}

        <View style={inputContainerStyle}>
          <Text style={inputLabelStyle}>
            Email
          </Text>

          <TextInput
            value={email}
            onChangeText={(text) => {
              setEmail(text);
              setError("");
            }}
            placeholder="Enter your email"
            placeholderTextColor="#999"
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            style={inputStyle}
          />
        </View>
        <View style={inputContainerStyle}>
          <Text style={inputLabelStyle}>
            Password
          </Text>

          <View style={passwordWrapperStyle}>
            <TextInput
              value={password}
              onChangeText={(text) => {
                setPassword(text);
                setError("");
              }}
              secureTextEntry={!showPassword}
              placeholder="Enter your password"
              placeholderTextColor="#999"
              style={passwordInputStyle}
            />

            <TouchableOpacity onPress={() => setShowPassword(!showPassword)}>
              <Text style={toggleTextStyle}>
                {showPassword ? "Hide" : "Show"}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
        {mode === "signup" && (
          <View style={inputContainerStyle}>
            <Text style={inputLabelStyle}>
              Confirm Password
            </Text>

            <View style={passwordWrapperStyle}>
              <TextInput
                value={confirmPassword}
                onChangeText={(text) => {
                  setConfirmPassword(text);
                  setError("");
                }}
                secureTextEntry={!showConfirmPassword}
                placeholder="Confirm your password"
                placeholderTextColor="#999"
                style={passwordInputStyle}
              />

              <TouchableOpacity
                onPress={() => setShowConfirmPassword(!showConfirmPassword)}
              >
                <Text style={toggleTextStyle}>
                  {showConfirmPassword ? "Hide" : "Show"}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
        {error ? (
          <Text style={errorTextStyle}>
            {error}
          </Text>
        ) : null}

        {isSignIn ? (
          <TouchableOpacity
            onPress={() => {
              setMode("signup");
              setError("");
            }}
            style={switchLinkContainerStyle}
          >
            <Text style={switchLinkTextStyle}>
              Don't have an account yet?
              <Text style={switchLinkHighlightStyle}>
                {" "}
                Sign Up
              </Text>
            </Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            onPress={() => {
              setMode("signin");
              setError("");
            }}
            style={switchLinkContainerStyle}
          >
            <Text style={switchLinkTextStyle}>
              Already have an account?
              <Text style={switchLinkHighlightStyle}>
                {" "}
                Sign In Instead
              </Text>
            </Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity
          onPress={handleSubmit}
          disabled={isLoading}
          style={submitButtonStyle(isLoading)}
        >
          <Text style={submitButtonTextStyle}>
            {isLoading ? "Please wait..." : isSignIn ? "Sign In" : "Sign Up"}
          </Text>
        </TouchableOpacity>

        {isSignIn && (
          <TouchableOpacity
            onPress={() => navigation.navigate("ForgotPassword")}
          >
            <Text style={switchLinkTextStyle}>
              Forgot your password?
              <Text style={switchLinkHighlightStyle}>
                {" "}
                Reset Password
              </Text>
            </Text>
          </TouchableOpacity>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
