import { ScrollView, View, Text } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import { useInventory } from "../context/InventoryContext";
import { COLORS } from "../src/theme/colors";

import { AnimatedScreen } from "../components/animations/AnimatedScreen";
import { AnimatedTouchableOpacity } from "../components/animations/AnimatedTouchableOpacity";

const scrollContentStyle = {
  paddingHorizontal: 20,
  paddingTop: 40,
  paddingBottom: 120,
};

const headerContainerStyle = {
  marginBottom: 18,
};

const headerTitleStyle = {
  fontSize: 28,
  fontWeight: "800",
  color: COLORS.text,
};

const alertCardStyle = (read) => ({
  minHeight: 72,
  backgroundColor: COLORS.card,
  borderRadius: 16,
  paddingHorizontal: 14,
  paddingVertical: 12,
  marginBottom: 10,
  justifyContent: "center",

  borderWidth: 1,
  borderColor: COLORS.cardBorder,

  opacity: read ? 0.55 : 1,
});

const alertContentStyle = {
  flexDirection: "row",
  alignItems: "center",
};

const alertIconStyle = (urgency) => ({
  width: 40,
  height: 40,
  borderRadius: 20,

  alignItems: "center",
  justifyContent: "center",

  marginRight: 12,

  backgroundColor:
    urgency === "critical"
      ? COLORS.danger
      : urgency === "high"
        ? COLORS.warning
        : urgency === "moderate"
          ? COLORS.warning
          : COLORS.success,
});

const alertTextContainerStyle = {
  flex: 1,
};

const alertTitleStyle = {
  color: COLORS.text,
  fontSize: 16,
  fontWeight: "800",
};

const alertMessageStyle = {
  color: COLORS.muted,
  fontSize: 12,
  marginTop: 3,
  lineHeight: 17,
};

const unreadDotStyle = {
  width: 8,
  height: 8,
  borderRadius: 4,
  backgroundColor: COLORS.danger,
  marginLeft: 8,
};
export function AlertsScreen() {
  const navigation = useNavigation();
  const { alerts, markAlertRead, markAllAlertsRead, getItemById } = useInventory();
  const unreadCount = alerts.filter((alert) => !alert.read).length;

  return (
    <AnimatedScreen direction="right">
      <ScrollView
        style={{ flex: 1, backgroundColor: COLORS.background }}
        contentContainerStyle={scrollContentStyle}
      >
        <View
          style={{
            ...headerContainerStyle,
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <View style={{ flex: 1 }}>
            <Text style={headerTitleStyle}>Alerts</Text>
            {alerts.length > 0 ? (
              <Text style={{ fontSize: 12, color: COLORS.muted, marginTop: 3 }}>
                {unreadCount} unread of {alerts.length}
              </Text>
            ) : null}
          </View>

          {unreadCount > 0 ? (
            <AnimatedTouchableOpacity
              activeOpacity={0.75}
              onPress={markAllAlertsRead}
              style={{
                borderWidth: 1,
                borderColor: COLORS.cardBorder,
                backgroundColor: COLORS.card,
                borderRadius: 999,
                paddingHorizontal: 12,
                paddingVertical: 7,
              }}
            >
              <Text style={{ fontSize: 12, fontWeight: "700", color: COLORS.primary }}>
                Mark all read
              </Text>
            </AnimatedTouchableOpacity>
          ) : null}
        </View>

        {alerts.length === 0 ? (
          <View
            style={{
              alignItems: "center",
              marginTop: 80,
              paddingHorizontal: 24,
            }}
          >
            <Ionicons
              name="checkmark-circle-outline"
              size={56}
              color={COLORS.success}
            />
            <Text
              style={{
                color: COLORS.text,
                fontSize: 16,
                fontWeight: "600",
                marginTop: 12,
                textAlign: "center",
              }}
            >
              No active alerts
            </Text>
            <Text
              style={{
                color: COLORS.muted,
                fontSize: 14,
                marginTop: 4,
                textAlign: "center",
              }}
            >
              You will be notified when items become high risk or near expiry.
            </Text>
          </View>
        ) : (
          alerts.map((alert) => (
            <AnimatedTouchableOpacity
              key={alert.id}
              activeOpacity={0.85}
              onPress={() => {
                markAlertRead(alert.itemId);

                const item = getItemById(alert.itemId);

                if (item) {
                  navigation.navigate("Shelf");
                }
              }}
              style={alertCardStyle(alert.read)}
            >
              <View style={alertContentStyle}>
                <View style={alertIconStyle(alert.urgency)}>
                  <Ionicons
                    name="warning-outline"
                    size={20}
                    color={COLORS.white}
                  />
                </View>

                <View style={alertTextContainerStyle}>
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                    }}
                  >
                    <Text
                      style={[alertTitleStyle, { flex: 1 }]}
                      numberOfLines={1}
                    >
                      {alert.title}
                    </Text>

                    {!alert.read && <View style={unreadDotStyle} />}
                  </View>

                  <Text style={alertMessageStyle} numberOfLines={2}>
                    {alert.message}
                  </Text>
                </View>
              </View>
            </AnimatedTouchableOpacity>
          ))
        )}
      </ScrollView>
    </AnimatedScreen>
  );
}
