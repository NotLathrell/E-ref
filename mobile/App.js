import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { StatusBar } from "expo-status-bar";
import { AuthScreen } from "./screens/AuthScreen.js";
import { InventoryProvider } from "./context/InventoryContext";
import { ForgotPasswordScreen } from "./screens/ForgotPasswordScreen.js";
import { VerifyCodeScreen } from "./screens/VerifyCodeScreen.js";
import { CreateNewPasswordScreen } from "./screens/CreateNewPasswordScreen.js";
import { PasswordSuccessScreen } from "./screens/PasswordSuccessScreen.js";
import { MetricsScreen } from "./screens/MetricsScreen.js";
import AppNavigator from "./navigation/AppNavigator";

const Stack = createNativeStackNavigator();

export default function App() {
  return (
    <InventoryProvider>
      <NavigationContainer>
        <StatusBar style="dark" />
        <Stack.Navigator screenOptions={{ headerShown: false }}>
          <Stack.Screen name="Auth" component={AuthScreen} />
          <Stack.Screen name="ForgotPassword" component={ForgotPasswordScreen} />
          <Stack.Screen name="VerifyCode" component={VerifyCodeScreen} />
          <Stack.Screen name="CreateNewPassword" component={CreateNewPasswordScreen} />
          <Stack.Screen name="PasswordSuccess" component={PasswordSuccessScreen} />
          <Stack.Screen name="Main" component={AppNavigator} />
          <Stack.Screen name="Metrics" component={MetricsScreen} />
        </Stack.Navigator>
      </NavigationContainer>
    </InventoryProvider>
  );
}
