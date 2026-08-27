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
  const { alerts, markAlertRead, getItemById } = useInventory();

  return (
    <ScrollView
      className="flex-1 bg-white"
      contentContainerStyle={scrollContentStyle}
    >
      <View style={headerContainerStyle}>
        <Text style={headerTitleStyle}>Alerts</Text>
      </View>

      {alerts.length === 0 ? (
        <View className="items-center mt-20 px-6">
          <Ionicons name="checkmark-circle-outline" size={56} color="#86efac" />
          <Text className="text-slate-700 font-semibold mt-3 text-center">
            No active alerts
          </Text>
          <Text className="text-slate-400 text-center mt-1">
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
