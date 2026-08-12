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
import { useNavigation } from "@react-navigation/native";

const BRAND = "#16567b";

const keyboardAvoidingViewStyle = {
  flex: 1,
  backgroundColor: "#FFFFFF",
};

const scrollContentStyle = {
  flexGrow: 1,
  paddingHorizontal: 29,
  paddingTop: 45,
  paddingBottom: 40,
};

const logoContainerStyle = {
  alignItems: "center",
  marginBottom: 42,
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
  marginBottom: 115,
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
  marginBottom: 5,
};

const emailLabelStyle = {
  color: "#B5B5B5",
  fontSize: 13,
  marginBottom: 5,
};

const emailDisplayInputStyle = {
  height: 39,
  backgroundColor: "#D9D9D9",
  borderRadius: 6,
  paddingHorizontal: 10,
  fontSize: 13,
  color: "#666666",
};

const changeEmailRowStyle = {
  flexDirection: "row",
  justifyContent: "space-between",
  alignItems: "center",
  marginBottom: 17,
};

const changeEmailTextStyle = {
  color: "#C4C4C4",
  fontSize: 13,
};

const changeEmailLinkStyle = {
  color: BRAND,
  fontSize: 13,
  fontWeight: "700",
};

const codeContainerStyle = {
  marginBottom: 5,
};

const codeLabelStyle = {
  color: "#B5B5B5",
  fontSize: 13,
  marginBottom: 5,
};

const codeInputStyle = {
  height: 39,
  backgroundColor: "#D9D9D9",
  borderRadius: 6,
  paddingHorizontal: 10,
  fontSize: 16,
  color: "#222222",
  letterSpacing: 4,
};

const refreshRowStyle = {
  flexDirection: "row",
  justifyContent: "space-between",
  alignItems: "center",
  marginBottom: 27,
};

const refreshTextStyle = {
  color: "#C4C4C4",
  fontSize: 13,
};

const refreshLinkStyle = {
  color: BRAND,
  fontSize: 13,
  fontWeight: "700",
};

const errorTextStyle = {
  color: "#E53935",
  fontSize: 12,
  marginBottom: 10,
};

const changePasswordButtonStyle = {
  height: 44,
  backgroundColor: BRAND,
  borderRadius: 6,
  alignItems: "center",
  justifyContent: "center",
};

const changePasswordButtonTextStyle = {
  color: "#FFFFFF",
  fontSize: 16,
  fontWeight: "700",
};

export function VerifyCodeScreen() {
  const navigation = useNavigation();

  const [code, setCode] = useState("");
  const [error, setError] = useState("");

  const email = "thisisyourmail123@gmail.com";

  const handleChangePassword = () => {
    if (!code.trim()) {
      setError("Please enter the verification code.");
      return;
    }

    if (code.length !== 6) {
      setError("Please enter the 6-digit verification code.");
      return;
    }

    setError("");

    navigation.navigate("CreateNewPassword");
  };

  const handleRefreshCode = () => {
    setError("");
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
          <Text style={titleStyle}>
            Forgot your password?
          </Text>

          <Text style={subtitleStyle}>
            Enter the details below
          </Text>
        </View>

        <View style={emailContainerStyle}>
          <Text style={emailLabelStyle}>
            Verify Your Email:
          </Text>

          <TextInput
            value={email}
            editable={false}
            style={emailDisplayInputStyle}
          />
        </View>

        <View style={changeEmailRowStyle}>
          <Text style={changeEmailTextStyle}>
            Not your email?
          </Text>

          <TouchableOpacity
            onPress={() => navigation.goBack()}
          >
            <Text style={changeEmailLinkStyle}>
              Change Email
            </Text>
          </TouchableOpacity>
        </View>

        <View style={codeContainerStyle}>
          <Text style={codeLabelStyle}>
            Enter Code:
          </Text>

          <TextInput
            value={code}
            onChangeText={(text) => {
              setCode(text);
              setError("");
            }}
            keyboardType="number-pad"
            maxLength={6}
            placeholder=""
            style={codeInputStyle}
          />
        </View>

        <View style={refreshRowStyle}>
          <Text style={refreshTextStyle}>
            Did not receive the code yet?
          </Text>

          <TouchableOpacity onPress={handleRefreshCode}>
            <Text style={refreshLinkStyle}>
              Refresh Code
            </Text>
          </TouchableOpacity>
        </View>

        {error ? (
          <Text style={errorTextStyle}>
            {error}
          </Text>
        ) : null}

        <TouchableOpacity
          onPress={handleChangePassword}
          activeOpacity={0.8}
          style={changePasswordButtonStyle}
        >
          <Text style={changePasswordButtonTextStyle}>
            Change Password
          </Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}