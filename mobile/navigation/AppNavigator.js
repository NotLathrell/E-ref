import { View, Text } from "react-native";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { Ionicons } from "@expo/vector-icons";

import { HomeScreen } from "../screens/HomeScreen";
import { ShelfScreen } from "../screens/ShelfScreen";
import { CameraScreen } from "../screens/CameraScreen";
import { AlertsScreen } from "../screens/AlertsScreen";
import { ProfileScreen } from "../screens/ProfileScreen";
import { useInventory } from "../context/InventoryContext";

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

  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,

        tabBarActiveTintColor: "#5C4033",
        tabBarInactiveTintColor: "#7A6A60",

        tabBarStyle: {
          height: 68,
          paddingBottom: 8,
          paddingTop: 8,
          backgroundColor: "#FFF9F0",
          borderTopColor: "#E6D8C8",
        },

        tabBarIcon: ({ color, size }) => (
          <View>
            <Ionicons
              name={TAB_ICONS[route.name]}
              size={size}
              color={color}
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
