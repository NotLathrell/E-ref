import { useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  TextInput,
  ScrollView,
  Switch,
  Alert,
  Modal,
  Pressable,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation, CommonActions } from "@react-navigation/native";
import { getLocalIpAddress } from "../utils/network";
import { API_HOST, API_URL } from "../config";
import { useInventory } from "../context/InventoryContext";

const BRAND = "#16567b";

// ─────────────────────────────────────────────────────────────
// Inline styles moved to the top
// ─────────────────────────────────────────────────────────────

const profileTitleStyle = {
  fontSize: 22,
  fontWeight: "800",
  color: "#111111",
  marginBottom: 16,
};

const profileCardStyle = {
  borderWidth: 1,
  borderColor: "#d9d9d9",
  borderRadius: 12,
  backgroundColor: "#ffffff",
  minHeight: 120,
  alignItems: "center",
  justifyContent: "center",
  paddingVertical: 10,
  marginBottom: 8,
};

const profileIconStyle = {
  width: 76,
  height: 76,
  borderRadius: 38,
  backgroundColor: "#bdbdbd",
  alignItems: "center",
  justifyContent: "center",
  marginBottom: 3,
};

const profileNameStyle = {
  fontSize: 17,
  fontWeight: "800",
  color: "#111111",
};

const profileEmailStyle = {
  fontSize: 12,
  color: "#8a8a8a",
  marginTop: 1,
};

const settingRowStyle = {
  height: 53,
  borderWidth: 1,
  borderColor: "#d9d9d9",
  borderRadius: 11,
  backgroundColor: "#ffffff",
  paddingHorizontal: 12,
  marginBottom: 8,
  flexDirection: "row",
  alignItems: "center",
  justifyContent: "space-between",
};

const settingLabelContainerStyle = {
  flex: 1,
  paddingRight: 10,
};

const settingTitleStyle = {
  fontSize: 15,
  fontWeight: "800",
  color: "#111111",
};

const settingDescStyle = {
  fontSize: 10,
  color: "#666666",
  marginTop: 2,
};

const settingButtonStyle = {
  height: 53,
  borderWidth: 1,
  borderColor: "#d9d9d9",
  borderRadius: 11,
  backgroundColor: "#ffffff",
  paddingHorizontal: 12,
  justifyContent: "center",
  marginBottom: 8,
};

const logoutButtonStyle = {
  height: 48,
  borderRadius: 10,
  backgroundColor: BRAND,
  alignItems: "center",
  justifyContent: "center",
  marginTop: 8,
  marginBottom: 10,
};

const logoutButtonTextStyle = {
  color: "#FFFFFF",
  fontSize: 15,
  fontWeight: "800",
};

const modalBackdropStyle = {
  flex: 1,
  backgroundColor: "rgba(0, 0, 0, 0.35)",
  justifyContent: "center",
  alignItems: "center",
  paddingHorizontal: 28,
};

const modalOverlayPressableStyle = {
  position: "absolute",
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
};

const modalContentStyle = {
  width: "100%",
  maxHeight: "75%",
  minHeight: 460,
  backgroundColor: "#ffffff",
  borderRadius: 20,
  borderWidth: 2,
  borderColor: BRAND,
  paddingTop: 24,
  paddingBottom: 22,
  paddingHorizontal: 20,
  alignItems: "center",
  justifyContent: "space-between",
};

const modalTitleStyle = {
  fontSize: 18,
  fontWeight: "800",
  color: BRAND,
  textAlign: "center",
  marginBottom: 16,
};

const modalScrollViewStyle = {
  width: "100%",
  flex: 1,
  marginBottom: 16,
};

const modalSectionTitleStyle = {
  fontSize: 13,
  fontWeight: "700",
  color: "#1e293b",
  marginBottom: 6,
};

const modalTextStyle = {
  fontSize: 12,
  color: "#475569",
  lineHeight: 18,
  marginBottom: 14,
};

const modalCloseButtonStyle = {
  borderWidth: 1.5,
  borderColor: BRAND,
  borderRadius: 14,
  paddingVertical: 10,
  paddingHorizontal: 40,
  backgroundColor: "#ffffff",
  alignItems: "center",
  justifyContent: "center",
};

const modalCloseTextStyle = {
  fontSize: 15,
  fontWeight: "800",
  color: "#000000",
};

const logoutModalContainerStyle = {
  width: "100%",
  backgroundColor: "#ffffff",
  borderRadius: 20,
  borderWidth: 2,
  borderColor: BRAND,
  paddingVertical: 22,
  paddingHorizontal: 20,
};

const logoutModalTitleStyle = {
  fontSize: 22,
  fontWeight: "800",
  color: BRAND,
  marginBottom: 10,
};

const logoutModalMessageStyle = {
  fontSize: 16,
  color: "#1e293b",
  marginBottom: 24,
};

const logoutModalButtonsRowStyle = {
  flexDirection: "row",
  alignItems: "center",
  justifyContent: "space-between",
};

const logoutConfirmButtonStyle = {
  flex: 1,
  height: 48,
  borderRadius: 16,
  backgroundColor: "#e01111",
  borderWidth: 1.5,
  borderColor: BRAND,
  alignItems: "center",
  justifyContent: "center",
  marginRight: 10,
};

const logoutConfirmTextStyle = {
  fontSize: 18,
  fontWeight: "800",
  color: "#ffffff",
};

const logoutCancelButtonStyle = {
  flex: 1,
  height: 48,
  borderRadius: 16,
  backgroundColor: "#ffffff",
  borderWidth: 1.5,
  borderColor: BRAND,
  alignItems: "center",
  justifyContent: "center",
};

const logoutCancelTextStyle = {
  fontSize: 18,
  fontWeight: "800",
  color: "#000000",
};

// ─────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────

export function ProfileScreen() {
  const navigation = useNavigation();
  const { user, signOut } = useInventory();
  const [deviceIp, setDeviceIp] = useState("Detecting...");
  const [override, setOverride] = useState("");
  const [pushEnabled, setPushEnabled] = useState(true);
  const [darkMode, setDarkMode] = useState(false);
  const [privacyVisible, setPrivacyVisible] = useState(false);
  const [aboutVisible, setAboutVisible] = useState(false);
  const [logoutVisible, setLogoutVisible] = useState(false);

  useEffect(() => {
    getLocalIpAddress().then((ip) => {
      if (ip) {
        setDeviceIp(ip);
      } else {
        setDeviceIp("Unavailable");
      }
    });
  }, []);

  const apiUrl = useMemo(() => {
    if (override.trim().length > 0) {
      return `http://${override.trim()}`;
    }
    return API_URL;
  }, [override]);

  const handleConfirmLogout = async () => {
    setLogoutVisible(false);
    await signOut();
    const parent =
      navigation.getParent()?.getParent() ||
      navigation.getParent() ||
      navigation;
    parent.dispatch(
      CommonActions.reset({
        index: 0,
        routes: [{ name: "Auth" }],
      }),
    );
  };

  return (
    <ScrollView
      className="flex-1 bg-white"
      contentContainerStyle={{
        paddingHorizontal: 20,
        paddingTop: 52,
        paddingBottom: 120,
      }}
    >
      {/* Profile Header */}
      <Text style={profileTitleStyle}>Profile</Text>

      <View style={profileCardStyle}>
        {/* Profile Icon */}
        <View style={profileIconStyle}>
          <Ionicons name="person" size={48} color="#ffffff" />
        </View>

        {/* Name */}
        <Text style={profileNameStyle}>
          {user?.name || "Lathrell Pogi"}
        </Text>

        {/* Email */}
        <Text style={profileEmailStyle}>
          {user?.email || "lathrellpogi@gmail.com"}
        </Text>
      </View>

      {/* Push Notifications */}
      <View style={settingRowStyle}>
        <View style={settingLabelContainerStyle}>
          <Text style={settingTitleStyle}>Push Notifications</Text>
          <Text style={settingDescStyle}>
            Allow notification for requests and more from the app system
          </Text>
        </View>

        <Switch
          value={pushEnabled}
          onValueChange={setPushEnabled}
          trackColor={{
            false: "#d9d9d9",
            true: BRAND,
          }}
          thumbColor="#ffffff"
          ios_backgroundColor="#d9d9d9"
        />
      </View>

      {/* Dark Mode */}
      <View style={settingRowStyle}>
        <View style={settingLabelContainerStyle}>
          <Text style={settingTitleStyle}>Dark Mode</Text>
          <Text style={settingDescStyle}>
            Allow theme preference dark mode
          </Text>
        </View>

        <Switch
          value={darkMode}
          onValueChange={setDarkMode}
          trackColor={{
            false: "#d9d9d9",
            true: BRAND,
          }}
          thumbColor="#ffffff"
          ios_backgroundColor="#d9d9d9"
        />
      </View>

      {/* Change Password */}
      <TouchableOpacity
        activeOpacity={0.7}
        onPress={() => navigation.navigate("CreateNewPassword")}
        style={settingButtonStyle}
      >
        <Text style={settingTitleStyle}>Change Password</Text>
      </TouchableOpacity>

      {/* Privacy & Terms */}
      <TouchableOpacity
        activeOpacity={0.7}
        onPress={() => setPrivacyVisible(true)}
        style={settingButtonStyle}
      >
        <Text style={settingTitleStyle}>Privacy & Terms</Text>
      </TouchableOpacity>

      {/* About */}
      <TouchableOpacity
        activeOpacity={0.7}
        onPress={() => setAboutVisible(true)}
        style={settingButtonStyle}
      >
        <Text style={settingTitleStyle}>About</Text>
      </TouchableOpacity>

      {/* Log Out Main Button */}
      <TouchableOpacity
        activeOpacity={0.8}
        onPress={() => setLogoutVisible(true)}
        style={logoutButtonStyle}
      >
        <Text style={logoutButtonTextStyle}>Log Out</Text>
      </TouchableOpacity>

      {/* IP & Debug Box */}
      <View className="rounded-2xl border border-slate-200 bg-white p-5 mt-2">
        <Text className="text-slate-900 font-bold mb-2">Current Wi-Fi IP</Text>
        <Text className="text-slate-500 mb-4">{deviceIp}</Text>
        <Text className="text-slate-900 font-bold mb-2">API Host Override</Text>
        <TextInput
          value={override}
          onChangeText={setOverride}
          placeholder="e.g. 192.168.254.109:3000"
          className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-900 mb-3"
          placeholderTextColor="#94a3b8"
          autoCapitalize="none"
          keyboardType="default"
        />
        <TouchableOpacity
          className="rounded-2xl py-3 items-center mb-3"
          style={{ backgroundColor: BRAND }}
          onPress={() => {
            if (
              deviceIp &&
              deviceIp !== "Detecting..." &&
              deviceIp !== "Unavailable"
            ) {
              setOverride(`${deviceIp}:3000`);
            }
          }}
        >
          <Text className="text-white font-semibold">Use device IP</Text>
        </TouchableOpacity>
        <Text className="text-slate-900 font-bold mb-2">Configured Host</Text>
        <Text className="text-slate-500 mb-2">{API_HOST}</Text>
        <Text className="text-slate-400 text-sm">API URL: {apiUrl}</Text>
        <Text className="text-slate-400 text-xs mt-3">
          Core OCR/CNN/TTI/risk features currently run on-device. Host is
          reserved for future model API.
        </Text>
      </View>

      {/* Privacy & Terms Modal */}
      <Modal
        visible={privacyVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setPrivacyVisible(false)}
      >
        <View style={modalBackdropStyle}>
          <Pressable
            style={modalOverlayPressableStyle}
            onPress={() => setPrivacyVisible(false)}
          />

          <View style={modalContentStyle}>
            <Text style={modalTitleStyle}>Privacy & Terms</Text>

            <ScrollView
              showsVerticalScrollIndicator={false}
              style={modalScrollViewStyle}
            >
              <Text style={modalSectionTitleStyle}>1. Privacy Policy</Text>
              <Text style={modalTextStyle}>
                E-REF respects your privacy. All OCR, shelf-life predictions,
                and food scanning computations run locally on your device where
                possible. We do not store or sell your personal information or
                scanned inventory data.
              </Text>

              <Text style={modalSectionTitleStyle}>2. Terms of Service</Text>
              <Text style={{ ...modalTextStyle, marginBottom: 0 }}>
                By using E-REF, you acknowledge that food freshness estimates,
                time-temperature indicator calculations, and expiry predictions
                are advisory. Always visually inspect food for safety before
                consumption.
              </Text>
            </ScrollView>

            <TouchableOpacity
              activeOpacity={0.8}
              onPress={() => setPrivacyVisible(false)}
              style={modalCloseButtonStyle}
            >
              <Text style={modalCloseTextStyle}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* About Modal */}
      <Modal
        visible={aboutVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setAboutVisible(false)}
      >
        <View style={modalBackdropStyle}>
          <Pressable
            style={modalOverlayPressableStyle}
            onPress={() => setAboutVisible(false)}
          />

          <View style={modalContentStyle}>
            <Text style={modalTitleStyle}>About E-REF</Text>

            <ScrollView
              showsVerticalScrollIndicator={false}
              style={modalScrollViewStyle}
            >
              <Text style={modalSectionTitleStyle}>1. Overview</Text>
              <Text style={modalTextStyle}>
                E-REF is an intelligent food inventory and freshness management
                system. It helps reduce food waste by analyzing shelf life and
                giving storage recommendations based on visual and environmental
                metrics.
              </Text>

              <Text style={modalSectionTitleStyle}>2. Technology Stack</Text>
              <Text style={modalTextStyle}>
                • Optical Character Recognition (OCR) for date extraction{"\n"}•
                Convolutional Neural Networks (CNN) for visual defect detection
                {"\n"}• Time-Temperature Indicator (TTI) algorithms for kinetic
                degradation estimation
              </Text>

              <Text style={modalSectionTitleStyle}>3. App Version</Text>
              <Text style={{ ...modalTextStyle, marginBottom: 0 }}>
                Version 1.2.0 (Build 2026){"\n"}© 2026 E-REF Technologies. All
                rights reserved.
              </Text>
            </ScrollView>

            <TouchableOpacity
              activeOpacity={0.8}
              onPress={() => setAboutVisible(false)}
              style={modalCloseButtonStyle}
            >
              <Text style={modalCloseTextStyle}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Log Out Confirmation Modal */}
      <Modal
        visible={logoutVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setLogoutVisible(false)}
      >
        <View
          style={{
            flex: 1,
            backgroundColor: "rgba(0, 0, 0, 0.35)",
            justifyContent: "center",
            alignItems: "center",
            paddingHorizontal: 24,
          }}
        >
          {/* Backdrop Tap to close */}
          <Pressable
            style={modalOverlayPressableStyle}
            onPress={() => setLogoutVisible(false)}
          />

          {/* Modal Container */}
          <View style={logoutModalContainerStyle}>
            {/* Title */}
            <Text style={logoutModalTitleStyle}>Log out</Text>

            {/* Message */}
            <Text style={logoutModalMessageStyle}>
              Are you sure you want to log out?
            </Text>

            {/* Buttons Row */}
            <View style={logoutModalButtonsRowStyle}>
              {/* Confirm Button */}
              <TouchableOpacity
                activeOpacity={0.8}
                onPress={handleConfirmLogout}
                style={logoutConfirmButtonStyle}
              >
                <Text style={logoutConfirmTextStyle}>Confirm</Text>
              </TouchableOpacity>

              {/* Cancel Button */}
              <TouchableOpacity
                activeOpacity={0.8}
                onPress={() => setLogoutVisible(false)}
                style={logoutCancelButtonStyle}
              >
                <Text style={logoutCancelTextStyle}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}