import { useCallback, useEffect, useState } from "react";
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
import {
  getApiUrl,
  getDefaultApiUrl,
  setApiOverride,
  onApiUrlChange,
} from "../services/apiConfig";
import { fetchHealth } from "../services/metrics";
import { useInventory } from "../context/InventoryContext";

const BRAND = "#6B4F3A";
const CREAM_BG = "#F8F3E8";
const CARD = "#FFFDF7";
const BORDER = "#E3D8C8";
const TEXT = "#2F2924";
const MUTED = "#806F60";
const GREEN = "#6F8B5E";

const profileTitleStyle = {
  fontSize: 28,
  fontWeight: "800",
  color: TEXT,
  marginBottom: 18,
};

const profileCardStyle = {
  borderRadius: 24,
  backgroundColor: CARD,
  borderWidth: 1,
  borderColor: BORDER,
  paddingVertical: 24,
  paddingHorizontal: 20,
  marginBottom: 18,
  alignItems: "center",
};

const profileIconStyle = {
  width: 82,
  height: 82,
  borderRadius: 41,
  backgroundColor: "#E8D8BD",
  alignItems: "center",
  justifyContent: "center",
  marginBottom: 10,
};

const profileNameStyle = {
  fontSize: 20,
  fontWeight: "800",
  color: TEXT,
};

const profileEmailStyle = {
  fontSize: 13,
  color: MUTED,
  marginTop: 4,
};

const settingsSectionTitleStyle = {
  fontSize: 15,
  fontWeight: "800",
  color: MUTED,
  marginBottom: 10,
  marginTop: 4,
  textTransform: "uppercase",
  letterSpacing: 1,
};

const settingRowStyle = {
  minHeight: 64,
  borderWidth: 1,
  borderColor: BORDER,
  borderRadius: 18,
  backgroundColor: CARD,
  paddingHorizontal: 16,
  paddingVertical: 10,
  marginBottom: 9,
  flexDirection: "row",
  alignItems: "center",
  justifyContent: "space-between",
};

const settingIconContainerStyle = {
  width: 40,
  height: 40,
  borderRadius: 20,
  backgroundColor: "#F1E8D8",
  alignItems: "center",
  justifyContent: "center",
  marginRight: 12,
};

const settingLabelContainerStyle = {
  flex: 1,
  paddingRight: 10,
};

const settingTitleStyle = {
  fontSize: 15,
  fontWeight: "800",
  color: TEXT,
};

const settingDescStyle = {
  fontSize: 11,
  color: MUTED,
  marginTop: 3,
  lineHeight: 15,
};

const settingButtonStyle = {
  minHeight: 58,
  borderWidth: 1,
  borderColor: BORDER,
  borderRadius: 18,
  backgroundColor: CARD,
  paddingHorizontal: 16,
  marginBottom: 9,
  flexDirection: "row",
  alignItems: "center",
};

const settingButtonTextContainerStyle = {
  flex: 1,
  marginLeft: 12,
};

const accountSectionTitleStyle = {
  fontSize: 15,
  fontWeight: "800",
  color: MUTED,
  marginTop: 18,
  marginBottom: 10,
  textTransform: "uppercase",
  letterSpacing: 1,
};

const styles = {
  logoutButton: {
    minHeight: 58,
    borderWidth: 1,
    borderColor: "#D8B7A8",
    borderRadius: 18,
    paddingHorizontal: 16,
    marginBottom: 9,

    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",

    backgroundColor: "#FFFDFC",
  },

  logoutLeft: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },

  logoutIconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,

    backgroundColor: "#FCE7E3",

    alignItems: "center",
    justifyContent: "center",

    marginRight: 12,
  },

  logoutText: {
    fontSize: 15,
    fontWeight: "800",
    color: "#B94A48",

    includeFontPadding: false,
  },
};

const logoutIconStyle = {
  width: 40,
  height: 40,
  borderRadius: 20,
  backgroundColor: "#FCE7E3",
  alignItems: "center",
  justifyContent: "center",
  marginRight: 12,
};

const logoutModalIconStyle = {
  width: 56,
  height: 56,
  borderRadius: 28,
  backgroundColor: "#F1E8D8",
  alignItems: "center",
  justifyContent: "center",
  alignSelf: "center",
  marginBottom: 14,
};

const logoutTextStyle = {
  fontSize: 15,
  fontWeight: "800",
  color: "#B94A48",
};

const logoutDescriptionStyle = {
  fontSize: 11,
  color: "#A66B66",
  marginTop: 3,
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
  backgroundColor: CARD,
  borderRadius: 20,
  borderWidth: 1,
  borderColor: BORDER,
  paddingVertical: 24,
  paddingHorizontal: 20,
};

const logoutModalTitleStyle = {
  fontSize: 22,
  fontWeight: "800",
  color: TEXT,
  marginBottom: 10,
};

const logoutModalMessageStyle = {
  fontSize: 15,
  color: MUTED,
  marginBottom: 24,
};

const logoutConfirmButtonStyle = {
  flex: 1,
  height: 48,
  borderRadius: 16,
  backgroundColor: "#D98B82",
  alignItems: "center",
  justifyContent: "center",
  marginRight: 10,
};

const logoutConfirmTextStyle = {
  fontSize: 16,
  fontWeight: "800",
  color: "#FFFFFF",
};

const logoutCancelButtonStyle = {
  flex: 1,
  height: 48,
  borderRadius: 16,
  backgroundColor: CREAM_BG,
  borderWidth: 1,
  borderColor: BORDER,
  alignItems: "center",
  justifyContent: "center",
};

const logoutCancelTextStyle = {
  fontSize: 16,
  fontWeight: "800",
  color: TEXT,
};

const logoutModalButtonsRowStyle = {
  flexDirection: "row",
  alignItems: "center",
  justifyContent: "space-between",
};

export function ProfileScreen() {
  const navigation = useNavigation();
  const { user, signOut, settings, updateSettings } = useInventory();
  const [deviceIp, setDeviceIp] = useState("Detecting...");
  const [override, setOverride] = useState("");
  const [apiUrl, setApiUrl] = useState(getApiUrl());
  const [serverStatus, setServerStatus] = useState("checking");
  const [serverModels, setServerModels] = useState(null);
  const [serverError, setServerError] = useState(null);
  const [privacyVisible, setPrivacyVisible] = useState(false);
  const [aboutVisible, setAboutVisible] = useState(false);
  const [logoutVisible, setLogoutVisible] = useState(false);

  useEffect(() => {
    getLocalIpAddress().then((ip) => setDeviceIp(ip || "Unavailable"));
  }, []);

  // Keep the displayed URL in step with whatever apiConfig currently holds.
  useEffect(() => onApiUrlChange(setApiUrl), []);

  const checkServer = useCallback(async () => {
    setServerStatus("checking");
    setServerError(null);
    try {
      const health = await fetchHealth();
      setServerModels(health.models || null);
      setServerStatus(health.ready ? "online" : "offline");
      if (!health.ready) {
        setServerError("The server is up but the identification model failed to load.");
      }
    } catch (error) {
      setServerModels(null);
      setServerStatus("offline");
      setServerError(error.message);
    }
  }, []);

  useEffect(() => {
    checkServer();
  }, [checkServer, apiUrl]);

  const applyOverride = useCallback(async () => {
    await setApiOverride(override);
    setOverride("");
  }, [override]);

  const resetOverride = useCallback(async () => {
    await setApiOverride("");
    setOverride("");
  }, []);

  const handleLogout = () => {
    setLogoutVisible(true);
  };

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
      className="flex-1"
      style={{ backgroundColor: CREAM_BG }}
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
        <Text style={profileNameStyle}>{user?.name || "Lathrell Pogi"}</Text>

        {/* Email */}
        <Text style={profileEmailStyle}>
          {user?.email || "lathrellpogi@gmail.com"}
        </Text>
      </View>

      {/* Spoilage Alerts */}
      <View style={settingRowStyle}>
        <View style={settingIconContainerStyle}>
          <Ionicons name="notifications-outline" size={21} color={BRAND} />
        </View>

        <View style={settingLabelContainerStyle}>
          <Text style={settingTitleStyle}>Spoilage Alerts</Text>

          <Text style={settingDescStyle}>
            Show alerts and the tab badge for high-risk and near-expiry items.
          </Text>
        </View>

        <Switch
          value={settings.alertsEnabled}
          onValueChange={(value) => updateSettings({ alertsEnabled: value })}
          trackColor={{
            false: "#D6CEC1",
            true: GREEN,
          }}
          thumbColor="#FFFFFF"
          ios_backgroundColor="#D6CEC1"
        />
      </View>

      {/* Change Password */}
      <TouchableOpacity
        activeOpacity={0.75}
        onPress={() => navigation.navigate("CreateNewPassword")}
        style={settingButtonStyle}
      >
        <View style={settingIconContainerStyle}>
          <Ionicons name="lock-closed-outline" size={20} color={BRAND} />
        </View>

        <View style={settingButtonTextContainerStyle}>
          <Text style={settingTitleStyle}>Change Password</Text>

          <Text style={settingDescStyle}>Update your account password.</Text>
        </View>

        <Ionicons name="chevron-forward" size={20} color={MUTED} />
      </TouchableOpacity>

      {/* Privacy & Terms */}
      <TouchableOpacity
        activeOpacity={0.75}
        onPress={() => setPrivacyVisible(true)}
        style={settingButtonStyle}
      >
        <View style={settingIconContainerStyle}>
          <Ionicons name="shield-checkmark-outline" size={20} color={BRAND} />
        </View>

        <View style={settingButtonTextContainerStyle}>
          <Text style={settingTitleStyle}>Privacy & Terms</Text>

          <Text style={settingDescStyle}>
            Review privacy information and terms of use.
          </Text>
        </View>

        <Ionicons name="chevron-forward" size={20} color={MUTED} />
      </TouchableOpacity>

      {/* Model Performance */}
      <TouchableOpacity
        activeOpacity={0.75}
        onPress={() => navigation.navigate("Metrics")}
        style={settingButtonStyle}
      >
        <View style={settingIconContainerStyle}>
          <Ionicons name="stats-chart-outline" size={20} color={BRAND} />
        </View>

        <View style={settingButtonTextContainerStyle}>
          <Text style={settingTitleStyle}>Model Performance</Text>

          <Text style={settingDescStyle}>
            Accuracy, precision, recall and F1 for the detection and
            classification models.
          </Text>
        </View>

        <Ionicons name="chevron-forward" size={20} color={MUTED} />
      </TouchableOpacity>

      {/* About */}
      <TouchableOpacity
        activeOpacity={0.75}
        onPress={() => setAboutVisible(true)}
        style={settingButtonStyle}
      >
        <View style={settingIconContainerStyle}>
          <Ionicons name="information-circle-outline" size={20} color={BRAND} />
        </View>

        <View style={settingButtonTextContainerStyle}>
          <Text style={settingTitleStyle}>About E-REF</Text>

          <Text style={settingDescStyle}>
            Learn more about the system and its technology.
          </Text>
        </View>

        <Ionicons name="chevron-forward" size={20} color={MUTED} />
      </TouchableOpacity>

      {/* Log Out Main Button */}
      <TouchableOpacity
        style={styles.logoutButton}
        onPress={handleLogout}
        activeOpacity={0.75}
      >
        <View style={styles.logoutLeft}>
          <View style={styles.logoutIconContainer}>
            <Ionicons name="log-out-outline" size={20} color="#B94A48" />
          </View>

          <Text style={styles.logoutText}>Log Out</Text>
        </View>

        <Ionicons name="chevron-forward" size={20} color={MUTED} />
      </TouchableOpacity>

      {/* Model server connection */}
      <Text style={accountSectionTitleStyle}>Model Server</Text>

      <View
        style={{
          borderRadius: 18,
          borderWidth: 1,
          borderColor: BORDER,
          backgroundColor: CARD,
          padding: 16,
        }}
      >
        {/* Live status */}
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            marginBottom: 12,
          }}
        >
          <View
            style={{
              width: 9,
              height: 9,
              borderRadius: 5,
              marginRight: 8,
              backgroundColor:
                serverStatus === "online"
                  ? GREEN
                  : serverStatus === "checking"
                    ? "#C9A44C"
                    : "#B94A48",
            }}
          />
          <Text style={{ fontSize: 14, fontWeight: "800", color: TEXT, flex: 1 }}>
            {serverStatus === "online"
              ? "Connected"
              : serverStatus === "checking"
                ? "Checking…"
                : "Not reachable"}
          </Text>

          <TouchableOpacity onPress={checkServer} hitSlop={10} activeOpacity={0.7}>
            <Ionicons name="refresh-outline" size={18} color={BRAND} />
          </TouchableOpacity>
        </View>

        <Text style={{ fontSize: 11, color: MUTED, marginBottom: 2 }}>
          Active API URL
        </Text>
        <Text style={{ fontSize: 13, color: TEXT, fontWeight: "600", marginBottom: 10 }}>
          {apiUrl}
        </Text>

        {/* Which models loaded */}
        {serverStatus === "online" && serverModels ? (
          <View style={{ marginBottom: 12 }}>
            {[
              ["detector", "YOLOv8 detection"],
              ["identity", "CNN identification"],
              ["freshness", "CNN freshness"],
            ].map(([key, label]) => (
              <View
                key={key}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  paddingVertical: 3,
                }}
              >
                <Ionicons
                  name={serverModels[key]?.loaded ? "checkmark-circle" : "close-circle"}
                  size={14}
                  color={serverModels[key]?.loaded ? GREEN : "#B94A48"}
                />
                <Text style={{ fontSize: 12, color: MUTED, marginLeft: 6 }}>
                  {label}
                </Text>
              </View>
            ))}
          </View>
        ) : null}

        {serverError ? (
          <Text
            style={{
              fontSize: 11,
              color: "#B94A48",
              marginBottom: 10,
              lineHeight: 16,
            }}
          >
            {serverError}
          </Text>
        ) : null}

        <Text style={{ fontSize: 11, color: MUTED, marginBottom: 6 }}>
          API host override (leave blank to auto-detect)
        </Text>
        <TextInput
          value={override}
          onChangeText={setOverride}
          placeholder={`e.g. ${deviceIp === "Detecting..." || deviceIp === "Unavailable" ? "192.168.1.5" : deviceIp}:8000`}
          placeholderTextColor={MUTED}
          autoCapitalize="none"
          autoCorrect={false}
          style={{
            borderWidth: 1,
            borderColor: BORDER,
            backgroundColor: CREAM_BG,
            borderRadius: 12,
            paddingHorizontal: 12,
            height: 44,
            fontSize: 14,
            color: TEXT,
            marginBottom: 10,
          }}
        />

        <View style={{ flexDirection: "row" }}>
          <TouchableOpacity
            activeOpacity={0.8}
            onPress={applyOverride}
            style={{
              flex: 1,
              backgroundColor: BRAND,
              borderRadius: 12,
              paddingVertical: 11,
              alignItems: "center",
              marginRight: 8,
            }}
          >
            <Text style={{ color: "#FFFFFF", fontWeight: "800", fontSize: 13 }}>
              Apply & Test
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            activeOpacity={0.8}
            onPress={resetOverride}
            style={{
              flex: 1,
              borderWidth: 1,
              borderColor: BORDER,
              borderRadius: 12,
              paddingVertical: 11,
              alignItems: "center",
            }}
          >
            <Text style={{ color: TEXT, fontWeight: "800", fontSize: 13 }}>
              Reset
            </Text>
          </TouchableOpacity>
        </View>

        <Text style={{ fontSize: 11, color: MUTED, marginTop: 10, lineHeight: 16 }}>
          This phone's Wi-Fi IP is {deviceIp}. The detection and classification
          models run on the backend; OCR, TTI, risk scoring and recommendations
          run on this device.
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
                Version 1.2.0 (Build 2026){"\n"}© 2026 E-REF. All rights
                reserved.
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
        <View style={modalBackdropStyle}>
          <Pressable
            style={modalOverlayPressableStyle}
            onPress={() => setLogoutVisible(false)}
          />

          {/* Actual modal box */}
          <View style={logoutModalContainerStyle}>
            <View style={{ alignItems: "center" }}>
              <View
                style={{
                  ...logoutIconStyle,
                  marginRight: 0,
                  marginBottom: 14,
                }}
              >
                <Ionicons name="log-out-outline" size={28} color="#B94A48" />
              </View>

              <Text style={logoutModalTitleStyle}>Log Out</Text>

              <Text
                style={{
                  ...logoutModalMessageStyle,
                  textAlign: "center",
                }}
              >
                Are you sure you want to log out?
              </Text>
            </View>

            <View style={logoutModalButtonsRowStyle}>
              <TouchableOpacity
                activeOpacity={0.8}
                onPress={handleConfirmLogout}
                style={logoutConfirmButtonStyle}
              >
                <Text style={logoutConfirmTextStyle}>Confirm</Text>
              </TouchableOpacity>

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
