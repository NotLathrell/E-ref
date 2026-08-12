import React from "react";
import {
  View,
  Text,
  Image,
  TouchableOpacity,
  KeyboardAvoidingView,
  ScrollView,
  Platform,
} from "react-native";

const BRAND = "#16567b";
const SUCCESS = "#44AE5F";

const keyboardAvoidingViewStyle = {
  flex: 1,
  backgroundColor: "#FFFFFF",
};

const scrollContentStyle = {
  flexGrow: 1,
  justifyContent: "center",
  paddingHorizontal: 28,
  paddingBottom: 40,
};

const logoContainerStyle = {
  alignItems: "center",
  marginBottom: 20,
};

const logoImageStyle = {
  width: 170,
  height: 170,
};

const successIconContainerStyle = {
  alignItems: "center",
  marginBottom: 20,
};

const successIconCircleStyle = {
  width: 90,
  height: 90,
  borderRadius: 45,
  backgroundColor: SUCCESS,
  justifyContent: "center",
  alignItems: "center",
};

const successIconTextStyle = {
  color: "#FFFFFF",
  fontSize: 42,
  fontWeight: "bold",
};

const successMessageContainerStyle = {
  alignItems: "center",
  marginBottom: 40,
};

const successTitleStyle = {
  fontSize: 30,
  fontWeight: "700",
  color: "#000",
};

const successSubtitleStyle = {
  marginTop: 12,
  textAlign: "center",
  color: "#777",
  fontSize: 16,
  lineHeight: 24,
};

const backToSignInButtonStyle = {
  backgroundColor: BRAND,
  borderRadius: 8,
  paddingVertical: 16,
  alignItems: "center",
  justifyContent: "center",
  marginTop: 10,
};

const backToSignInTextStyle = {
  color: "#FFFFFF",
  fontSize: 18,
  fontWeight: "700",
};

export function PasswordSuccessScreen({ navigation }) {
  return (
    <KeyboardAvoidingView
      style={keyboardAvoidingViewStyle}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        contentContainerStyle={scrollContentStyle}
      >
        <View style={logoContainerStyle}>
          <Image
            source={require("../assets/ERef-Logo.png")}
            resizeMode="contain"
            style={logoImageStyle}
          />
        </View>

        <View style={successIconContainerStyle}>
          <View style={successIconCircleStyle}>
            <Text style={successIconTextStyle}>
              ✓
            </Text>
          </View>
        </View>

        <View style={successMessageContainerStyle}>
          <Text style={successTitleStyle}>
            Password Updated!
          </Text>

          <Text style={successSubtitleStyle}>
            Your password has been successfully updated.
            {"\n"}
            You can now sign in using your new password.
          </Text>
        </View>

        <TouchableOpacity
          activeOpacity={0.85}
          onPress={() =>
            navigation.reset({
              index: 0,
              routes: [{ name: "Auth" }],
            })
          }
          style={backToSignInButtonStyle}
        >
          <Text style={backToSignInTextStyle}>
            Back to Sign In
          </Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
