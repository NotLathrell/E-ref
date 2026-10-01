import { useEffect, useMemo } from "react";
import { NavigationContainer, createNavigationContainerRef } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { StatusBar } from "expo-status-bar";
import * as Notifications from "expo-notifications";
import { AuthScreen } from "./screens/AuthScreen.js";
import { InventoryProvider, useInventory } from "./context/InventoryContext";
import { ForgotPasswordScreen } from "./screens/ForgotPasswordScreen.js";
import { VerifyCodeScreen } from "./screens/VerifyCodeScreen.js";
import { CreateNewPasswordScreen } from "./screens/CreateNewPasswordScreen.js";
import { PasswordSuccessScreen } from "./screens/PasswordSuccessScreen.js";
import { MetricsScreen } from "./screens/MetricsScreen.js";
import { HistoryScreen } from "./screens/HistoryScreen.js";
import { RecipesScreen } from "./screens/RecipesScreen.js";
import { AdminScreen } from "./screens/AdminScreen.js";
import AppNavigator from "./navigation/AppNavigator";
import { ActivityIndicator, View } from "./components/themed";
import { LIGHT_COLORS, ThemeProvider, useTheme } from "./src/theme/ThemeContext";

const Stack = createNativeStackNavigator();
const navigationRef = createNavigationContainerRef();

function RootNavigator() {
  const { user, loading } = useInventory();

  // Tapping a spoilage notification opens the Alerts tab.
  useEffect(() => {
    const subscription = Notifications.addNotificationResponseReceivedListener(() => {
      const signedIn = navigationRef.getRootState()?.routeNames?.includes("Main");
      if (navigationRef.isReady() && signedIn) {
        navigationRef.navigate("Main", { screen: "Alerts" });
      }
    });
    return () => subscription.remove();
  }, []);

  if (loading) {
    return (
      <View
        style={{
          flex: 1,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: LIGHT_COLORS.background,
        }}
      >
        <ActivityIndicator size="large" color={LIGHT_COLORS.primary} />
      </View>
    );
  }

  // Which screens exist depends on the session, so signing out (or an expired
  // session) returns to the login screen without any manual navigation.
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      {user ? (
        <>
          <Stack.Screen name="Main" component={AppNavigator} />
          <Stack.Screen name="Metrics" component={MetricsScreen} />
          <Stack.Screen name="History" component={HistoryScreen} />
          <Stack.Screen name="Recipes" component={RecipesScreen} />
          <Stack.Screen name="Admin" component={AdminScreen} />
        </>
      ) : (
        <Stack.Screen name="Auth" component={AuthScreen} />
      )}
      <Stack.Screen name="ForgotPassword" component={ForgotPasswordScreen} />
      <Stack.Screen name="VerifyCode" component={VerifyCodeScreen} />
      <Stack.Screen name="CreateNewPassword" component={CreateNewPasswordScreen} />
      <Stack.Screen name="PasswordSuccess" component={PasswordSuccessScreen} />
    </Stack.Navigator>
  );
}

/** The navigation container and status bar follow the theme, so nothing flashes white. */
function ThemedShell() {
  const { colors, isDark } = useTheme();

  const navigationTheme = useMemo(
    () => ({
      dark: isDark,
      colors: {
        primary: colors.primary,
        background: colors.background,
        card: colors.card,
        text: colors.text,
        border: colors.border,
        notification: colors.danger,
      },
    }),
    [colors, isDark]
  );

  return (
    <NavigationContainer ref={navigationRef} theme={navigationTheme}>
      <StatusBar style={isDark ? "light" : "dark"} />
      <RootNavigator />
    </NavigationContainer>
  );
}

function ThemedApp() {
  const { settings } = useInventory();
  return (
    <ThemeProvider preference={settings?.themeMode}>
      <ThemedShell />
    </ThemeProvider>
  );
}

export default function App() {
  return (
    <InventoryProvider>
      <ThemedApp />
    </InventoryProvider>
  );
}
