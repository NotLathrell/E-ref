import { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  TextInput,
  ScrollView,
  Switch,
  Modal,
  Pressable,
  StyleSheet,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation, CommonActions } from "@react-navigation/native";
import { getLocalIpAddress } from "../utils/network";
import {
  getApiUrl,
  setApiOverride,
  onApiUrlChange,
} from "../services/apiConfig";
import { fetchHealth } from "../services/metrics";
import { useInventory } from "../context/InventoryContext";
import { AnimatedScreen } from "../components/animations/AnimatedScreen";

const LIGHT_THEME = {
  background: "#F8F3E8",
  card: "#FFFDF7",
  border: "#E3D8C8",
  text: "#2F2924",
  muted: "#806F60",
  primary: "#6B4F3A",
  iconBackground: "#F1E8D8",
  profileIconBackground: "#E8D8BD",
  inputBackground: "#F8F5EF",
  success: "#6F8B5E",
  danger: "#B94A48",
  dangerBackground: "#FCE7E3",
  modalBackground: "#FFFFFF",
  placeholder: "#94A3B8",
};

const createStyles = (theme) => ({
  profileTitle: {
    fontSize: 28,
    fontWeight: "800",
    color: theme.text,
    marginBottom: 18,
  },

  profileCard: {
    borderRadius: 24,
    backgroundColor: theme.card,
    borderWidth: 1,
    borderColor: theme.border,
    paddingVertical: 24,
    paddingHorizontal: 20,
    marginBottom: 18,
    alignItems: "center",
  },

  profileIcon: {
    width: 82,
    height: 82,
    borderRadius: 41,
    backgroundColor: theme.profileIconBackground,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 10,
  },

  profileName: {
    fontSize: 20,
    fontWeight: "800",
    color: theme.text,
  },

  profileEmail: {
    fontSize: 13,
    color: theme.muted,
    marginTop: 4,
  },

  settingSectionTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: theme.muted,
    marginBottom: 10,
    marginTop: 4,
    textTransform: "uppercase",
    letterSpacing: 1,
  },

  settingRow: {
    minHeight: 64,
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: 18,
    backgroundColor: theme.card,
    paddingHorizontal: 16,
    paddingVertical: 10,
    marginBottom: 9,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },

  settingIconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: theme.iconBackground,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },

  settingLabelContainer: {
    flex: 1,
    paddingRight: 10,
  },

  settingTitle: {
    fontSize: 15,
    fontWeight: "625",
    color: theme.text,
  },

  settingDesc: {
    fontSize: 11,
    color: theme.muted,
    marginTop: 3,
    lineHeight: 15,
  },

  settingButton: {
    minHeight: 58,
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: 18,
    backgroundColor: theme.card,
    paddingHorizontal: 16,
    marginBottom: 9,
    flexDirection: "row",
    alignItems: "center",
  },

  settingButtonTextContainer: {
    flex: 1,
    marginLeft: 1,
  },

  logoutButton: {
    minHeight: 58,
    borderWidth: 1,
    borderColor: theme.danger,
    borderRadius: 18,
    paddingHorizontal: 16,
    marginBottom: 9,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: theme.card,
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
    backgroundColor: theme.dangerBackground,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },

  logoutText: {
    fontSize: 15,
    fontWeight: "700",
    color: theme.danger,
  },

  debugBox: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: theme.border,
    backgroundColor: theme.card,
    padding: 20,
    marginTop: 8,
  },

  input: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: theme.border,
    backgroundColor: theme.inputBackground,
    paddingHorizontal: 16,
    paddingVertical: 13,
    color: theme.text,
    marginBottom: 12,
  },

  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.55)",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 28,
  },

  modalContent: {
    width: "100%",
    maxHeight: "75%",
    minHeight: 460,
    backgroundColor: theme.modalBackground,
    borderRadius: 20,
    borderWidth: 2,
    borderColor: theme.primary,
    paddingTop: 24,
    paddingBottom: 22,
    paddingHorizontal: 20,
    alignItems: "center",
    justifyContent: "space-between",
  },

  modalTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: theme.primary,
    textAlign: "center",
    marginBottom: 16,
  },

  modalSectionTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: theme.text,
    marginBottom: 6,
  },

  modalText: {
    fontSize: 12,
    color: theme.muted,
    lineHeight: 18,
    marginBottom: 14,
  },

  modalCloseButton: {
    borderWidth: 1.5,
    borderColor: theme.primary,
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 40,
    backgroundColor: theme.card,
    alignItems: "center",
    justifyContent: "center",
  },

  modalCloseText: {
    fontSize: 15,
    fontWeight: "700",
    color: theme.text,
  },

  modalOverlayPressable: {
    ...StyleSheet.absoluteFillObject,
  },

  modalScrollView: {
    width: "100%",
  },

  logoutModalContainer: {
    width: "100%",
    maxWidth: 360,
    backgroundColor: theme.modalBackground,
    borderRadius: 20,
    padding: 24,
    alignItems: "center",
  },

  logoutModalTitle: {
    fontSize: 20,
    fontWeight: "800",
    marginBottom: 8,
  },

  logoutModalMessage: {
    fontSize: 14,
    marginBottom: 24,
  },

  logoutModalButtonsRow: {
    width: "100%",
    flexDirection: "row",
    gap: 10,
  },

  logoutConfirmButton: {
    flex: 1,
    borderRadius: 14,
    paddingVertical: 12,
    alignItems: "center",
    backgroundColor: theme.danger,
  },

  logoutConfirmText: {
    color: "#FFFFFF",
    fontWeight: "700",
  },

  logoutCancelButton: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 14,
    paddingVertical: 12,
    alignItems: "center",
  },

  logoutCancelText: {
    fontWeight: "700",
  },
});

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

  const theme = LIGHT_THEME;
  const baseStyles = createStyles(theme);
  const styles = {
    ...baseStyles,
    profileCardStyle: baseStyles.profileCard,
    profileIconStyle: baseStyles.profileIcon,
    profileNameStyle: baseStyles.profileName,
    profileEmailStyle: baseStyles.profileEmail,
    settingRowStyle: baseStyles.settingRow,
    settingIconContainerStyle: baseStyles.settingIconContainer,
    settingLabelContainerStyle: baseStyles.settingLabelContainer,
    settingTitleStyle: baseStyles.settingTitle,
    settingDescStyle: baseStyles.settingDesc,
    settingButtonStyle: baseStyles.settingButton,
    settingButtonTextContainerStyle: baseStyles.settingButtonTextContainer,
    modalBackdropStyle: baseStyles.modalBackdrop,
    modalOverlayPressableStyle: baseStyles.modalOverlayPressable,
    modalContentStyle: baseStyles.modalContent,
    modalTitleStyle: baseStyles.modalTitle,
    modalSectionTitleStyle: baseStyles.modalSectionTitle,
    modalTextStyle: baseStyles.modalText,
    modalCloseButtonStyle: baseStyles.modalCloseButton,
    modalCloseTextStyle: baseStyles.modalCloseText,
    modalScrollViewStyle: baseStyles.modalScrollView,
    logoutModalContainerStyle: baseStyles.logoutModalContainer,
    logoutModalTitleStyle: baseStyles.logoutModalTitle,
    logoutModalMessageStyle: baseStyles.logoutModalMessage,
    logoutModalButtonsRowStyle: baseStyles.logoutModalButtonsRow,
    logoutConfirmButtonStyle: baseStyles.logoutConfirmButton,
    logoutConfirmTextStyle: baseStyles.logoutConfirmText,
    logoutCancelButtonStyle: baseStyles.logoutCancelButton,
    logoutCancelTextStyle: baseStyles.logoutCancelText,
    logoutIconStyle: baseStyles.logoutIconContainer,
  };
  const settingRowStyle = styles.settingRow;
  const settingIconContainerStyle = styles.settingIconContainer;
  const settingLabelContainerStyle = styles.settingLabelContainer;
  const settingTitleStyle = styles.settingTitle;
  const settingDescStyle = styles.settingDesc;
  const settingButtonStyle = styles.settingButton;
  const settingButtonTextContainerStyle = styles.settingButtonTextContainer;
  const logoutModalContainerStyle = styles.logoutModalContainer;
  const logoutModalButtonsRowStyle = styles.logoutModalButtonsRow;
  const BRAND = theme.primary;
  const MUTED = theme.muted;

  useEffect(() => {
    getLocalIpAddress().then((ip) => {
      if (ip) {
        setDeviceIp(ip);
      } else {
        setDeviceIp("Unavailable");
      }
    });
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
    <AnimatedScreen direction="right">
      <ScrollView
        style={{
          flex: 1,
          backgroundColor: theme.background,
        }}
        contentContainerStyle={{
          paddingHorizontal: 20,
          paddingTop: 52,
          paddingBottom: 120,
        }}
      >
        {/* Profile Header */}
        <Text style={styles.profileTitle}>Profile</Text>

        <View style={styles.profileCardStyle}>
          {/* Profile Icon */}
          <View style={styles.profileIconStyle}>
            <Ionicons name="person" size={48} color={theme.text} />
          </View>

          {/* Name */}
          <Text style={styles.profileNameStyle}>
            {user?.name || "Lathrell"}
          </Text>

          {/* Email */}
          <Text style={styles.profileEmailStyle}>
            {user?.email || "lathrell@gmail.com"}
          </Text>
        </View>

        {/* Spoilage Alerts */}
        <View style={styles.settingRowStyle}>
          <View style={styles.settingIconContainerStyle}>
            <Ionicons
              name="notifications-outline"
              size={20}
              color={theme.primary}
            />
          </View>

          <View style={styles.settingLabelContainerStyle}>
            <Text style={styles.settingTitleStyle}>Spoilage Alerts</Text>

            <Text style={styles.settingDescStyle}>
              Show alerts and the tab badge for high-risk and near-expiry items.
            </Text>
          </View>

          <Switch
            value={settings.alertsEnabled}
            onValueChange={(value) => updateSettings({ alertsEnabled: value })}
            trackColor={{
              false: theme.border,
              true: theme.success,
            }}
            thumbColor={theme.text}
            ios_backgroundColor={theme.border}
          />
        </View>

        {/* Dark Mode */}
        <View style={settingRowStyle}>
          <View style={settingIconContainerStyle}>
            <Ionicons name="moon-outline" size={20} color={BRAND} />
          </View>

          <View style={settingLabelContainerStyle}>
            <Text style={settingTitleStyle}>Dark Mode</Text>

            <Text style={settingDescStyle}>
              Change the appearance of the application.
            </Text>
          </View>

          <Switch
            value={false}
            disabled
            trackColor={{
              false: theme.border,
              true: theme.success,
            }}
            thumbColor={theme.text}
            ios_backgroundColor={theme.border}
          />
        </View>

        {/* Change Password */}
        <TouchableOpacity
          activeOpacity={1}
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

          <Ionicons name="chevron-forward" size={20} color={theme.muted} />
        </TouchableOpacity>

        {/* Privacy & Terms */}
        <TouchableOpacity
          activeOpacity={1}
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
          activeOpacity={1}
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
          activeOpacity={1}
          onPress={() => setAboutVisible(true)}
          style={settingButtonStyle}
        >
          <View style={settingIconContainerStyle}>
            <Ionicons
              name="information-circle-outline"
              size={20}
              color={BRAND}
            />
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
          activeOpacity={1}
        >
          <View style={styles.logoutLeft}>
            <View style={styles.logoutIconContainer}>
              <Ionicons name="log-out-outline" size={20} color={theme.danger} />
            </View>

            <Text style={styles.logoutText}>Log Out</Text>
          </View>

          <Ionicons name="chevron-forward" size={20} color={MUTED} />
        </TouchableOpacity>

        {/* Model server connection */}
        <View style={styles.debugBox}>
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
                    ? theme.success
                    : serverStatus === "checking"
                      ? "#C9A44C"
                      : theme.danger,
              }}
            />
            <Text style={[styles.settingTitle, { flex: 1 }]}>
              {serverStatus === "online"
                ? "Model server connected"
                : serverStatus === "checking"
                  ? "Checking model server…"
                  : "Model server not reachable"}
            </Text>

            <TouchableOpacity onPress={checkServer} hitSlop={10} activeOpacity={0.7}>
              <Ionicons name="refresh-outline" size={18} color={BRAND} />
            </TouchableOpacity>
          </View>

          <Text style={[styles.settingDesc, { marginBottom: 2 }]}>Active API URL</Text>
          <Text style={[styles.settingTitle, { fontSize: 13, marginBottom: 10 }]}>
            {apiUrl}
          </Text>

          {serverStatus === "online" && serverModels ? (
            <View style={{ marginBottom: 12 }}>
              {[
                ["detector", "YOLOv8 detection"],
                ["identity", "CNN identification"],
                ["freshness", "CNN freshness"],
              ].map(([key, label]) => (
                <View
                  key={key}
                  style={{ flexDirection: "row", alignItems: "center", paddingVertical: 3 }}
                >
                  <Ionicons
                    name={serverModels[key]?.loaded ? "checkmark-circle" : "close-circle"}
                    size={14}
                    color={serverModels[key]?.loaded ? theme.success : theme.danger}
                  />
                  <Text style={[styles.settingDesc, { marginLeft: 6 }]}>{label}</Text>
                </View>
              ))}
            </View>
          ) : null}

          {serverError ? (
            <Text
              style={[
                styles.settingDesc,
                { color: theme.danger, marginBottom: 10, lineHeight: 16 },
              ]}
            >
              {serverError}
            </Text>
          ) : null}

          <Text style={[styles.settingDesc, { marginBottom: 6 }]}>
            API host override (leave blank to auto-detect)
          </Text>
          <TextInput
            value={override}
            onChangeText={setOverride}
            placeholder={`e.g. ${
              deviceIp === "Detecting..." || deviceIp === "Unavailable"
                ? "192.168.1.5"
                : deviceIp
            }:8000`}
            placeholderTextColor={theme.placeholder}
            style={styles.input}
            autoCapitalize="none"
            autoCorrect={false}
          />

          <View style={{ flexDirection: "row" }}>
            <TouchableOpacity
              activeOpacity={0.8}
              onPress={applyOverride}
              style={{
                flex: 1,
                backgroundColor: theme.primary,
                borderRadius: 16,
                paddingVertical: 13,
                alignItems: "center",
                marginRight: 8,
              }}
            >
              <Text style={{ color: theme.background, fontWeight: "800", fontSize: 14 }}>
                Apply & Test
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              activeOpacity={0.8}
              onPress={resetOverride}
              style={{
                flex: 1,
                borderWidth: 1,
                borderColor: theme.border,
                borderRadius: 16,
                paddingVertical: 13,
                alignItems: "center",
              }}
            >
              <Text style={{ color: theme.text, fontWeight: "800", fontSize: 14 }}>
                Reset
              </Text>
            </TouchableOpacity>
          </View>

          <Text style={[styles.settingDesc, { fontSize: 11, marginTop: 10, lineHeight: 16 }]}>
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
          <View style={styles.modalBackdropStyle}>
            <Pressable
              style={styles.modalOverlayPressableStyle}
              onPress={() => setPrivacyVisible(false)}
            />

            <View style={styles.modalContentStyle}>
              <Text style={styles.modalTitleStyle}>Privacy & Terms</Text>

              <ScrollView
                showsVerticalScrollIndicator={false}
                style={styles.modalScrollViewStyle}
              >
                <Text style={styles.modalSectionTitleStyle}>
                  1. Privacy Policy
                </Text>
                <Text style={styles.modalTextStyle}>
                  E-REF respects your privacy. All OCR, shelf-life predictions,
                  and food scanning computations run locally on your device
                  where possible. We do not store or sell your personal
                  information or scanned inventory data.
                </Text>

                <Text style={styles.modalSectionTitleStyle}>
                  2. Terms of Service
                </Text>
                <Text style={{ ...styles.modalTextStyle, marginBottom: 0 }}>
                  By using E-REF, you acknowledge that food freshness estimates,
                  time-temperature indicator calculations, and expiry
                  predictions are advisory. Always visually inspect food for
                  safety before consumption.
                </Text>
              </ScrollView>

              <TouchableOpacity
                activeOpacity={0.8}
                onPress={() => setPrivacyVisible(false)}
                style={styles.modalCloseButtonStyle}
              >
                <Text style={styles.modalCloseTextStyle}>Close</Text>
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
          <View style={styles.modalBackdropStyle}>
            <Pressable
              style={styles.modalOverlayPressableStyle}
              onPress={() => setAboutVisible(false)}
            />

            <View style={styles.modalContentStyle}>
              <Text style={styles.modalTitleStyle}>About E-REF</Text>

              <ScrollView
                showsVerticalScrollIndicator={false}
                style={styles.modalScrollViewStyle}
              >
                <Text style={styles.modalSectionTitleStyle}>1. Overview</Text>
                <Text style={styles.modalTextStyle}>
                  E-REF is an intelligent food inventory and freshness
                  management system. It helps reduce food waste by analyzing
                  shelf life and giving storage recommendations based on visual
                  and environmental metrics.
                </Text>

                <Text style={styles.modalSectionTitleStyle}>
                  2. Technology Stack
                </Text>
                <Text style={styles.modalTextStyle}>
                  • Optical Character Recognition (OCR) for date extraction
                  {"\n"}• Convolutional Neural Networks (CNN) for visual defect
                  detection
                  {"\n"}• Time-Temperature Indicator (TTI) algorithms for
                  kinetic degradation estimation
                </Text>

                <Text style={styles.modalSectionTitleStyle}>
                  3. App Version
                </Text>
                <Text style={{ ...styles.modalTextStyle, marginBottom: 0 }}>
                  Version 1.2.0 (Build 2026){"\n"}© 2026 E-REF. All rights
                  reserved.
                </Text>
              </ScrollView>

              <TouchableOpacity
                activeOpacity={0.8}
                onPress={() => setAboutVisible(false)}
                style={styles.modalCloseButtonStyle}
              >
                <Text style={styles.modalCloseTextStyle}>Close</Text>
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
          <View style={styles.modalBackdropStyle}>
            <Pressable
              style={styles.modalOverlayPressableStyle}
              onPress={() => setLogoutVisible(false)}
            />

            {/* Actual modal box */}
            <View style={[logoutModalContainerStyle, { color: theme.text }]}>
              <View style={{ alignItems: "center" }}>
                <View
                  style={{
                    ...styles.logoutIconStyle,
                    marginRight: 0,
                    marginBottom: 14,
                  }}
                >
                  <Ionicons name="log-out-outline" size={28} color="#B94A48" />
                </View>

                <Text
                  style={[styles.logoutModalTitleStyle, { color: theme.text }]}
                >
                  Log Out
                </Text>

                <Text
                  style={[
                    styles.logoutModalMessageStyle,
                    {
                      color: theme.muted,
                      textAlign: "center",
                    },
                  ]}
                >
                  Are you sure you want to log out?
                </Text>
              </View>

              <View style={logoutModalButtonsRowStyle}>
                <TouchableOpacity
                  activeOpacity={0.8}
                  onPress={handleConfirmLogout}
                  style={styles.logoutConfirmButtonStyle}
                >
                  <Text style={styles.logoutConfirmTextStyle}>Confirm</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  activeOpacity={0.8}
                  onPress={() => setLogoutVisible(false)}
                  style={[
                    styles.logoutCancelButtonStyle,
                    {
                      backgroundColor: theme.background,
                      borderColor: theme.border,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.logoutCancelTextStyle,
                      { color: theme.text },
                    ]}
                  >
                    Cancel
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      </ScrollView>
    </AnimatedScreen>
  );
}
