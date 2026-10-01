import { Text, View } from "../components/themed";
import { useInventory } from "../context/InventoryContext";
import { AuthLayout, PrimaryButton } from "../components/auth";
import { LIGHT_COLORS as C } from "../src/theme/ThemeContext";

export function PasswordSuccessScreen({ navigation }) {
  const { user } = useInventory();

  return (
    <AuthLayout tagline={null}>
      <View style={{ alignItems: "center", marginTop: 8, marginBottom: 32 }}>
        <View
          style={{
            width: 84,
            height: 84,
            borderRadius: 42,
            backgroundColor: C.success,
            alignItems: "center",
            justifyContent: "center",
            marginBottom: 22,
          }}
        >
          <Text style={{ color: C.onPrimary, fontSize: 40, fontWeight: "800" }}>✓</Text>
        </View>

        <Text style={{ fontSize: 28, fontWeight: "800", color: C.text, marginBottom: 8 }}>
          Password Updated
        </Text>

        <Text style={{ fontSize: 15, lineHeight: 22, color: C.muted, textAlign: "center" }}>
          Your password has been successfully updated.
          {user ? "" : " You can now sign in using your new password."}
        </Text>
      </View>

      <PrimaryButton
        label={user ? "Done" : "Back to Sign In"}
        onPress={() =>
          navigation.reset({
            index: 0,
            routes: [{ name: user ? "Main" : "Auth" }],
          })
        }
      />
    </AuthLayout>
  );
}
