import { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, Modal } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { useInventory } from "../context/InventoryContext";
import { AnimatedScreen } from "../components/animations/AnimatedScreen";
import { ActivityIndicator, ScrollView, Switch, Text, TextInput, TouchableOpacity, View } from "../components/themed";
import { Card, Chip, EmptyState, PillButton, ScreenHeader, SectionTitle } from "../components/screen";
import { ErrorText } from "../components/auth";
import { CATEGORIES, STORAGE_LOCATIONS, getFoods, getRemoteFoods, isBundledFood } from "../data/foodCatalog";
import { fetchAdminStats, fetchAdminUsers, removeFood, saveFood, setUserRole } from "../services/foods";
import { LIGHT_COLORS as C } from "../src/theme/ThemeContext";

const ROLE_LABELS = { super_admin: "SUPER ADMIN", admin: "ADMIN", employee: "EMPLOYEE" };

const BLANK = {
  id: "",
  name: "",
  category: "Produce",
  bestStorageId: "fridge_top",
  nominalShelfDays: "7",
  refTempC: "4",
  q10: "2.2",
  freezeable: true,
  keywords: "",
  usageIdeas: "",
  storageTips: "",
};

const list = (text) =>
  String(text || "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);

const slug = (name) =>
  String(name || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40);

function toForm(food) {
  return {
    id: food.id,
    name: food.name,
    category: food.category,
    bestStorageId: food.bestStorageId,
    nominalShelfDays: String(food.nominalShelfDays),
    refTempC: String(food.refTempC),
    q10: String(food.q10 ?? 2.2),
    freezeable: Boolean(food.freezeable),
    keywords: (food.keywords || []).join(", "),
    usageIdeas: (food.usageIdeas || []).join(", "),
    storageTips: (food.storageTips || []).join(", "),
  };
}

/** The API record for a form, or an error message the user can act on. */
export function foodFromForm(form, { isNew }) {
  const name = form.name.trim();
  if (!name) return { error: "Enter a name for the food." };

  const id = isNew ? slug(form.id || name) : form.id;
  if (id.length < 2) return { error: "The name needs at least two letters or digits." };

  const shelf = Number(form.nominalShelfDays);
  if (!Number.isFinite(shelf) || shelf <= 0) return { error: "Shelf life must be a number of days above 0." };
  const temp = Number(form.refTempC);
  if (!Number.isFinite(temp) || temp < -30 || temp > 40) return { error: "Temperature must be between -30 and 40 °C." };
  const q10 = Number(form.q10);
  if (!Number.isFinite(q10) || q10 < 1 || q10 > 5) return { error: "Q10 must be between 1 and 5." };

  return {
    food: {
      id,
      name,
      category: form.category,
      bestStorageId: form.bestStorageId,
      nominalShelfDays: shelf,
      refTempC: temp,
      q10,
      freezeable: Boolean(form.freezeable),
      keywords: list(form.keywords || name.toLowerCase()),
      usageIdeas: list(form.usageIdeas),
      storageTips: list(form.storageTips),
    },
  };
}

function Field({ label, value, onChangeText, keyboardType, placeholder, editable = true }) {
  return (
    <View style={{ marginBottom: 12 }}>
      <Text style={{ fontSize: 12, fontWeight: "800", color: C.muted, marginBottom: 6 }}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        keyboardType={keyboardType}
        placeholder={placeholder}
        placeholderTextColor={C.muted}
        editable={editable}
        autoCapitalize="none"
        style={{
          backgroundColor: C.card,
          borderWidth: 1,
          borderColor: C.border,
          borderRadius: 12,
          paddingHorizontal: 14,
          paddingVertical: 11,
          fontSize: 15,
          color: C.text,
          opacity: editable ? 1 : 0.6,
        }}
      />
    </View>
  );
}

function FoodEditor({ visible, initial, isNew, hasServerEntry, onClose, onSaved }) {
  const [form, setForm] = useState(BLANK);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (visible) {
      setForm(initial ? toForm(initial) : BLANK);
      setError(null);
    }
  }, [visible, initial]);

  const set = (key) => (value) => setForm((current) => ({ ...current, [key]: value }));

  const submit = async () => {
    const checked = foodFromForm(form, { isNew });
    if (checked.error) return setError(checked.error);
    setBusy(true);
    setError(null);
    try {
      await saveFood(checked.food);
      await onSaved();
      onClose();
    } catch (failure) {
      setError(failure.message || "Could not save the food.");
    } finally {
      setBusy(false);
    }
  };

  const revert = async () => {
    setBusy(true);
    try {
      await removeFood(form.id);
      await onSaved();
      onClose();
    } catch (failure) {
      setError(failure.message || "Could not remove the entry.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <ScrollView
        style={{ flex: 1, backgroundColor: C.background }}
        contentContainerStyle={{ padding: 20, paddingTop: 52, paddingBottom: 60 }}
        keyboardShouldPersistTaps="handled"
      >
        <ScreenHeader
          title={isNew ? "Add food" : "Edit food"}
          subtitle={
            isNew
              ? "New foods are added to every phone's catalog the next time it refreshes."
              : "Changes replace the built-in values on every phone the next time it refreshes."
          }
          onBack={onClose}
        />

        <Field label="Name" value={form.name} onChangeText={set("name")} placeholder="e.g. Beetroot" />
        {isNew ? (
          <Field label="ID (letters, digits, underscore)" value={form.id} onChangeText={set("id")} placeholder={slug(form.name) || "beetroot"} />
        ) : null}

        <Text style={{ fontSize: 12, fontWeight: "800", color: C.muted, marginBottom: 6 }}>Category</Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap", marginBottom: 6 }}>
          {CATEGORIES.filter((category) => category !== "All").map((category) => (
            <Chip key={category} label={category} selected={form.category === category} onPress={() => set("category")(category)} />
          ))}
        </View>

        <Text style={{ fontSize: 12, fontWeight: "800", color: C.muted, marginBottom: 6 }}>Best storage</Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap", marginBottom: 6 }}>
          {STORAGE_LOCATIONS.map((place) => (
            <Chip
              key={place.id}
              label={place.label.split(" (")[0]}
              selected={form.bestStorageId === place.id}
              onPress={() => set("bestStorageId")(place.id)}
            />
          ))}
        </View>

        <Field label="Shelf life at the reference temperature (days)" value={form.nominalShelfDays} onChangeText={set("nominalShelfDays")} keyboardType="decimal-pad" />
        <Field label="Reference temperature (°C)" value={form.refTempC} onChangeText={set("refTempC")} keyboardType="numbers-and-punctuation" />
        <Field label="Q10 (how much faster it spoils per +10 °C)" value={form.q10} onChangeText={set("q10")} keyboardType="decimal-pad" />

        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
          <Text style={{ fontSize: 14, fontWeight: "700", color: C.text }}>Can be frozen</Text>
          <Switch value={form.freezeable} onValueChange={set("freezeable")} trackColor={{ false: C.border, true: C.primary }} thumbColor={C.white} />
        </View>

        <Field label="Keywords, comma separated (used to match label text)" value={form.keywords} onChangeText={set("keywords")} />
        <Field label="Usage ideas, comma separated" value={form.usageIdeas} onChangeText={set("usageIdeas")} />
        <Field label="Storage tips, comma separated" value={form.storageTips} onChangeText={set("storageTips")} />

        <ErrorText>{error}</ErrorText>

        <View style={{ flexDirection: "row", marginTop: 6 }}>
          <PillButton label={busy ? "Saving…" : "Save"} icon="checkmark" onPress={submit} disabled={busy} style={{ marginRight: 8 }} />
          {hasServerEntry ? (
            <PillButton
              label={isBundledFood(form.id) ? "Restore built-in" : "Delete"}
              kind="danger"
              onPress={revert}
              disabled={busy}
            />
          ) : null}
        </View>
      </ScrollView>
    </Modal>
  );
}

export function AdminScreen() {
  const navigation = useNavigation();
  const { user, refreshFoodDatabase, foodsVersion } = useInventory();
  const isAdmin = user?.role === "admin" || user?.role === "super_admin";

  const [stats, setStats] = useState(null);
  const [users, setUsers] = useState([]);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null); // { food, isNew } while the editor is open

  const load = useCallback(async () => {
    setError(null);
    try {
      const [summary, accounts] = await Promise.all([fetchAdminStats(), fetchAdminUsers()]);
      setStats(summary);
      setUsers(accounts.users);
    } catch (failure) {
      setError(failure.message || "Could not load the admin data.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isAdmin) load();
    else setLoading(false);
  }, [isAdmin, load]);

  // Re-read the catalog whenever the server's copy changes.
  const foods = useMemo(() => getFoods().filter((food) => food.id !== "unknown"), [foodsVersion]);
  const remoteIds = useMemo(() => new Set(getRemoteFoods().map((food) => food.id)), [foodsVersion]);

  const afterSave = async () => {
    await refreshFoodDatabase();
    await load();
  };

  const changeRole = (target) => {
    const next = target.role === "admin" ? "employee" : "admin";
    Alert.alert(
      next === "admin" ? "Make administrator?" : "Remove administrator?",
      `${target.name} (${target.email}) will ${next === "admin" ? "be able to edit the food database and see every account" : "lose administrator access"}.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Confirm",
          onPress: async () => {
            try {
              await setUserRole(target.id, next);
              await load();
            } catch (failure) {
              setError(failure.message || "Could not change the role.");
            }
          },
        },
      ]
    );
  };

  return (
    <AnimatedScreen direction="right">
      <ScrollView
        style={{ flex: 1, backgroundColor: C.background }}
        contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 52, paddingBottom: 60 }}
      >
        <ScreenHeader
          title="Admin"
          subtitle="Manage the food database the app uses for shelf life and storage, and see who is using it."
          onBack={() => navigation.goBack()}
        />

        {!isAdmin ? (
          <EmptyState icon="lock-closed-outline" title="Administrators only" message="Ask an administrator to give your account access." />
        ) : (
          <>
            <ErrorText>{error}</ErrorText>
            {loading ? <ActivityIndicator color={C.primary} style={{ marginVertical: 20 }} /> : null}

            {stats ? (
              <Card style={{ flexDirection: "row", justifyContent: "space-between" }}>
                {[
                  ["Users", stats.users],
                  ["Items", stats.items],
                  ["Foods edited", stats.customFoods],
                ].map(([label, value]) => (
                  <View key={label} style={{ alignItems: "center", flex: 1 }}>
                    <Text style={{ fontSize: 22, fontWeight: "800", color: C.text }}>{value}</Text>
                    <Text style={{ fontSize: 11, color: C.muted, fontWeight: "600", marginTop: 2 }}>{label}</Text>
                  </View>
                ))}
              </Card>
            ) : null}

            <SectionTitle
              right={<PillButton label="Add food" icon="add" onPress={() => setEditing({ food: null, isNew: true })} />}
            >
              Food database
            </SectionTitle>

            {foods.map((food) => (
              <TouchableOpacity
                key={food.id}
                activeOpacity={0.85}
                onPress={() => setEditing({ food, isNew: false })}
                accessibilityRole="button"
              >
                <Card style={{ flexDirection: "row", alignItems: "center", padding: 12, marginBottom: 8 }}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 15, fontWeight: "800", color: C.text }}>{food.name}</Text>
                    <Text style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>
                      {food.category} · {food.nominalShelfDays} days · {food.freezeable ? "freezable" : "not freezable"}
                    </Text>
                  </View>
                  <Text style={{ fontSize: 11, fontWeight: "800", color: remoteIds.has(food.id) ? C.accent : C.muted }}>
                    {remoteIds.has(food.id) ? (isBundledFood(food.id) ? "EDITED" : "ADDED") : "BUILT-IN"}
                  </Text>
                </Card>
              </TouchableOpacity>
            ))}

            <SectionTitle>Accounts</SectionTitle>
            {users.map((account) => (
              <Card key={account.id} style={{ flexDirection: "row", alignItems: "center", padding: 12, marginBottom: 8 }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 14, fontWeight: "800", color: C.text }}>{account.name}</Text>
                  <Text style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>
                    {account.email} · {account.items} item{account.items === 1 ? "" : "s"}
                  </Text>
                </View>
                {account.id === user.id || account.role === "super_admin" ? (
                  // A Super Admin's tier is managed on the web console, not here.
                  <Text style={{ fontSize: 11, fontWeight: "800", color: C.muted }}>
                    {account.id === user.id ? "YOU · " : ""}
                    {ROLE_LABELS[account.role] || "ADMIN"}
                  </Text>
                ) : (
                  <PillButton
                    label={account.role === "admin" ? "Remove admin" : "Make admin"}
                    kind="ghost"
                    onPress={() => changeRole(account)}
                  />
                )}
              </Card>
            ))}
          </>
        )}
      </ScrollView>

      <FoodEditor
        visible={Boolean(editing)}
        initial={editing?.food || null}
        isNew={Boolean(editing?.isNew)}
        hasServerEntry={Boolean(editing?.food && remoteIds.has(editing.food.id))}
        onClose={() => setEditing(null)}
        onSaved={afterSave}
      />
    </AnimatedScreen>
  );
}
