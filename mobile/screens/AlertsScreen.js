import { View, Text, ScrollView, TouchableOpacity } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import { useInventory } from "../context/InventoryContext";

const BRAND = "#8B6F47";

const COLORS = {
  background: "#FFFDF7",
  card: "#F7F1E3",
  cardBorder: "#E8DDC8",
  text: "#3E3428",
  secondaryText: "#8A7A66",

  critical: "#C95C54",
  high: "#D8894A",
  moderate: "#C9A44C",
  low: "#6F9B72",

  white: "#FFFFFF",
};

const scrollContentStyle = {
  paddingHorizontal: 20,
  paddingTop: 52,
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
      ? COLORS.critical
      : urgency === "high"
        ? COLORS.high
        : urgency === "moderate"
          ? COLORS.moderate
          : COLORS.low,
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
  color: COLORS.secondaryText,
  fontSize: 12,
  marginTop: 3,
  lineHeight: 17,
};

const unreadDotStyle = {
  width: 8,
  height: 8,
  borderRadius: 4,
  backgroundColor: COLORS.critical,
  marginLeft: 8,
};
export function AlertsScreen() {
  const navigation = useNavigation();
  const { alerts, markAlertRead, markAllAlertsRead, getItemById } = useInventory();
  const unreadCount = alerts.filter((alert) => !alert.read).length;

  return (
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
            <Text style={{ fontSize: 12, color: COLORS.secondaryText, marginTop: 3 }}>
              {unreadCount} unread of {alerts.length}
            </Text>
          ) : null}
        </View>

        {unreadCount > 0 ? (
          <TouchableOpacity
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
            <Text style={{ fontSize: 12, fontWeight: "700", color: BRAND }}>
              Mark all read
            </Text>
          </TouchableOpacity>
        ) : null}
      </View>

      {alerts.length === 0 ? (
        <View style={{ alignItems: "center", marginTop: 80, paddingHorizontal: 24 }}>
          <Ionicons name="checkmark-circle-outline" size={56} color={COLORS.low} />
          <Text
            style={{
              color: COLORS.text,
              fontWeight: "700",
              marginTop: 12,
              textAlign: "center",
              fontSize: 15,
            }}
          >
            No active alerts
          </Text>
          <Text
            style={{
              color: COLORS.secondaryText,
              textAlign: "center",
              marginTop: 4,
              fontSize: 13,
              lineHeight: 19,
            }}
          >
            You will be notified when items become high risk or near expiry.
          </Text>
        </View>
      ) : (
        alerts.map((alert) => (
          <TouchableOpacity
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
                  <Text style={alertTitleStyle} numberOfLines={1}>
                    {alert.title}
                  </Text>

                  {!alert.read && <View style={unreadDotStyle} />}
                </View>

                <Text style={alertMessageStyle} numberOfLines={2}>
                  {alert.message}
                </Text>
              </View>
            </View>
          </TouchableOpacity>
        ))
      )}
    </ScrollView>
  );
}
