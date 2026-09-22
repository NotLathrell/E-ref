import { useState } from "react";
import {
  View,
  Text,
  Image,
  TextInput,
  KeyboardAvoidingView,
  ScrollView,
  Platform,
  Modal,
} from "react-native";
import { useNavigation } from "@react-navigation/native";

import { AnimatedScreen } from "../components/animations/AnimatedScreen";
import { AnimatedTouchableOpacity } from "../components/animations/AnimatedTouchableOpacity";

const BRAND = "#16567b";

const keyboardAvoidingViewStyle = {
  flex: 1,
  backgroundColor: "#FFFFFF",
};

const scrollContentStyle = {
  flexGrow: 1,
  paddingHorizontal: 22,
  paddingTop: 45,
  paddingBottom: 40,
};

const logoContainerStyle = {
  alignItems: "center",
  marginBottom: 24,
};

const logoImageStyle = {
  width: 180,
  height: 180,
};

const logoTaglineStyle = {
  marginTop: -5,
  fontSize: 14,
  color: "#222222",
};

const titleContainerStyle = {
  alignItems: "center",
  marginBottom: 24,
};

const titleStyle = {
  fontSize: 18,
  fontWeight: "700",
  color: "#111111",
};

const subtitleStyle = {
  marginTop: 8,
  fontSize: 13,
  color: "#C4C4C4",
};

const emailContainerStyle = {
  marginBottom: 15,
};

const emailLabelStyle = {
  color: "#B5B5B5",
  fontSize: 13,
  marginBottom: 5,
};

const emailInputStyle = {
  height: 39,
  backgroundColor: "#D9D9D9",
  borderRadius: 6,
  paddingHorizontal: 12,
  fontSize: 14,
  color: "#222222",
};

const errorTextStyle = {
  color: "#E53935",
  fontSize: 12,
  marginBottom: 10,
};

const enterButtonStyle = {
  height: 43,
  backgroundColor: BRAND,
  borderRadius: 6,
  alignItems: "center",
  justifyContent: "center",
};

const enterButtonTextStyle = {
  color: "#FFFFFF",
  fontSize: 16,
  fontWeight: "700",
};

const modalBackdropStyle = {
  flex: 1,
  backgroundColor: "rgba(255,255,255,0.75)",
  justifyContent: "center",
  alignItems: "center",
};

const modalContainerStyle = {
  width: "65%",
  backgroundColor: "#FFFFFF",
  borderWidth: 2,
  borderColor: BRAND,
  borderRadius: 12,
  paddingHorizontal: 20,
  paddingVertical: 16,
  alignItems: "center",
};

const modalTitleStyle = {
  fontSize: 17,
  fontWeight: "700",
  color: BRAND,
  marginBottom: 24,
};

const modalMessageStyle = {
  fontSize: 13,
  color: "#222222",
  textAlign: "center",
  marginBottom: 22,
};

const modalCloseButtonStyle = {
  width: 100,
  height: 40,
  borderWidth: 1,
  borderColor: BRAND,
  borderRadius: 10,
  alignItems: "center",
  justifyContent: "center",
};

const modalCloseTextStyle = {
  color: "#111111",
  fontSize: 15,
  fontWeight: "700",
};

export function ForgotPasswordScreen() {
  const navigation = useNavigation();

  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [showNotice, setShowNotice] = useState(false);

  const handleEnter = () => {
    if (!email.trim()) {
      setError("Please enter your email.");
      return;
    }

    if (!email.includes("@")) {
      setError("Please enter a valid email.");
      return;
    }

    setError("");
    setShowNotice(true);
  };

  return (
    <AnimatedScreen>
      <KeyboardAvoidingView
        style={keyboardAvoidingViewStyle}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={scrollContentStyle}
        >
          <View style={logoContainerStyle}>
            <Image
              source={require("../assets/ERef-Logo.png")}
              resizeMode="contain"
              style={logoImageStyle}
            />

            <Text style={logoTaglineStyle}>
              Scan, predict, and reduce food waste.
            </Text>
          </View>

          <View style={titleContainerStyle}>
            <Text style={titleStyle}>Forgot your password?</Text>

            <Text style={subtitleStyle}>Enter the details below</Text>
          </View>

          <View style={emailContainerStyle}>
            <Text style={emailLabelStyle}>Verify Your Email:</Text>

            <TextInput
              value={email}
              onChangeText={(text) => {
                setEmail(text);
                setError("");
              }}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              placeholder=""
              style={emailInputStyle}
            />
          </View>

          {error ? <Text style={errorTextStyle}>{error}</Text> : null}

          <AnimatedTouchableOpacity
            onPress={handleEnter}
            activeOpacity={0.8}
            style={enterButtonStyle}
          >
            <Text style={enterButtonTextStyle}>Enter</Text>
          </AnimatedTouchableOpacity>
        </ScrollView>
        <Modal
          visible={showNotice}
          transparent
          animationType="fade"
          onRequestClose={() => setShowNotice(false)}
        >
          <View style={modalBackdropStyle}>
            <View style={modalContainerStyle}>
              <Text style={modalTitleStyle}>Notice</Text>

              <Text style={modalMessageStyle}>
                Kindly check your email for the code
              </Text>

              <AnimatedTouchableOpacity
                onPress={() => {
                  setShowNotice(false);
                  navigation.navigate("VerifyCode");
                }}
                activeOpacity={0.8}
                style={modalCloseButtonStyle}
              >
                <Text style={modalCloseTextStyle}>Close</Text>
              </AnimatedTouchableOpacity>
            </View>
          </View>
        </Modal>
      </KeyboardAvoidingView>
    </AnimatedScreen>
  );
}
