import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";

import { HomeScreen } from "../screens/HomeScreen";
import { ShelfScreen } from "../screens/ShelfScreen";
import { CameraScreen } from "../screens/CameraScreen";
import { AlertsScreen } from "../screens/AlertsScreen";
import { ProfileScreen } from "../screens/ProfileScreen";
import { useInventory } from "../context/InventoryContext";
import { Ionicons, Text, View } from "../components/themed";
import { useTheme } from "../src/theme/ThemeContext";

const Tab = createBottomTabNavigator();

const TAB_ICONS = {
  Home: "home-outline",
  Shelf: "cube-outline",
  Camera: "camera-outline",
  Alerts: "notifications-outline",
  Profile: "person-outline",
};

export default function AppNavigator() {
  const { unreadAlertCount } = useInventory();
  // The tab bar is drawn by the navigator, not by our components, so it takes the
  // already-resolved colours for the current theme.
  const { colors } = useTheme();

  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,

        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.muted,

        tabBarStyle: {
          height: 68,
          paddingBottom: 8,
          paddingTop: 8,
          backgroundColor: colors.background,
          borderTopColor: colors.border,
        },

        tabBarIcon: ({ color, size }) => (
          <View>
            <Ionicons
              name={TAB_ICONS[route.name]}
              size={size}
              color={color}
              themed={false}
            />

            {/* Unread alert count on the Alerts tab */}
            {route.name === "Alerts" && unreadAlertCount > 0 ? (
              <View
                style={{
                  position: "absolute",
                  top: -4,
                  right: -10,
                  backgroundColor: "#B64D47",
                  borderRadius: 8,
                  minWidth: 16,
                  height: 16,
                  paddingHorizontal: 3,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Text style={{ color: "#fff", fontSize: 9, fontWeight: "700" }}>
                  {unreadAlertCount > 9 ? "9+" : unreadAlertCount}
                </Text>
              </View>
            ) : null}
          </View>
        ),
      })}
    >
      <Tab.Screen name="Home" component={HomeScreen} />
      <Tab.Screen name="Shelf" component={ShelfScreen} />
      <Tab.Screen name="Camera" component={CameraScreen} />
      <Tab.Screen name="Alerts" component={AlertsScreen} />
      <Tab.Screen name="Profile" component={ProfileScreen} />
    </Tab.Navigator>
  );
}
