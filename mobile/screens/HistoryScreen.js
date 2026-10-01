import { useMemo, useState } from "react";
import { useNavigation } from "@react-navigation/native";
import { useInventory } from "../context/InventoryContext";
import { AnimatedScreen } from "../components/animations/AnimatedScreen";
import { Ionicons, ScrollView, Text, View } from "../components/themed";
import { Card, Chip, EmptyState, PillButton, ScreenHeader, SectionTitle } from "../components/screen";
import { SegmentedControl } from "../components/auth";
import { LIGHT_COLORS as C } from "../src/theme/ThemeContext";

// A green that stays readable (about 5:1) on the cream cards; the palette's own green is for fills.
const GOOD = "#3F6B43";

const TABS = [
  ["activity", "Activity"],
  ["archive", "Used & discarded"],
];

const FILTERS = [
  { value: "all", label: "All" },
  { value: "used", label: "Used" },
  { value: "discarded", label: "Discarded" },
];

/** An icon and colour for a history line, from what the line says. */
export function iconForEvent(event = "") {
  const text = event.toLowerCase();
  if (text.startsWith("used")) return { name: "checkmark-circle-outline", color: GOOD };
  if (text.startsWith("discard")) return { name: "trash-outline", color: C.danger };
  if (text.startsWith("frozen")) return { name: "snow-outline", color: C.primary };
  if (text.startsWith("moved")) return { name: "swap-horizontal-outline", color: C.primary };
  if (text.startsWith("put back")) return { name: "arrow-undo-outline", color: C.accent };
  if (text.startsWith("scanned")) return { name: "camera-outline", color: C.primary };
  return { name: "information-circle-outline", color: C.muted };
}

export function formatWhen(iso) {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return "";
  const days = Math.floor((Date.now() - at.getTime()) / (24 * 60 * 60 * 1000));
  const time = at.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  if (days <= 0) return `Today, ${time}`;
  if (days === 1) return `Yesterday, ${time}`;
  return `${at.toLocaleDateString([], { month: "short", day: "numeric" })}, ${time}`;
}

export function HistoryScreen() {
  const navigation = useNavigation();
  const { historyEntries = [], archive = [], restoreItem } = useInventory();
  const [tab, setTab] = useState("activity");
  const [filter, setFilter] = useState("all");

  const used = archive.filter((item) => item.outcome === "used").length;
  const discarded = archive.filter((item) => item.outcome === "discarded").length;
  const savedPct = used + discarded ? Math.round((used / (used + discarded)) * 100) : null;

  const shown = useMemo(
    () => (filter === "all" ? archive : archive.filter((item) => item.outcome === filter)),
    [archive, filter]
  );

  return (
    <AnimatedScreen direction="right">
      <ScrollView
        style={{ flex: 1, backgroundColor: C.background }}
        contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 52, paddingBottom: 60 }}
      >
        <ScreenHeader
          title="History"
          subtitle="Everything that has happened to the food you track: when it was scanned, moved, frozen, used up or thrown away."
          onBack={() => navigation.goBack()}
        />

        <SegmentedControl options={TABS} value={tab} onChange={setTab} />

        {tab === "activity" ? (
          historyEntries.length === 0 ? (
            <EmptyState
              icon="time-outline"
              title="No history yet"
              message="Scan some food and each step will be recorded here."
            />
          ) : (
            <View style={{ marginTop: 12 }}>
              {historyEntries.map((entry) => {
                const icon = iconForEvent(entry.event);
                return (
                  <Card key={entry.id} style={{ flexDirection: "row", alignItems: "center", padding: 12, marginBottom: 8 }}>
                    <Ionicons name={icon.name} size={22} color={icon.color} />
                    <View style={{ flex: 1, marginLeft: 12 }}>
                      <Text style={{ fontSize: 14, fontWeight: "800", color: C.text }}>{entry.title}</Text>
                      <Text style={{ fontSize: 13, color: C.muted, marginTop: 2 }}>{entry.event}</Text>
                    </View>
                    <Text style={{ fontSize: 11, color: C.muted, marginLeft: 8 }}>{formatWhen(entry.at)}</Text>
                  </Card>
                );
              })}
            </View>
          )
        ) : (
          <View style={{ marginTop: 12 }}>
            <Card>
              <Text style={{ fontSize: 15, fontWeight: "800", color: C.text }}>
                {used} used · {discarded} discarded
              </Text>
              <Text style={{ fontSize: 13, color: C.muted, marginTop: 4 }}>
                {savedPct === null
                  ? "Mark food as used or discarded and your record builds up here."
                  : `${savedPct}% of the food you finished with was used rather than thrown away.`}
              </Text>
            </Card>

            <SectionTitle>Show</SectionTitle>
            <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
              {FILTERS.map((option) => (
                <Chip
                  key={option.value}
                  label={option.label}
                  selected={filter === option.value}
                  onPress={() => setFilter(option.value)}
                />
              ))}
            </View>

            {shown.length === 0 ? (
              <EmptyState
                icon="archive-outline"
                title="Nothing here"
                message="Food you mark as used or discard on the Shelf screen is listed here."
              />
            ) : (
              shown.map((item) => (
                <Card key={item.id} style={{ flexDirection: "row", alignItems: "center", padding: 12, marginBottom: 8 }}>
                  <Ionicons
                    name={item.outcome === "used" ? "checkmark-circle-outline" : "trash-outline"}
                    size={22}
                    color={item.outcome === "used" ? GOOD : C.danger}
                  />
                  <View style={{ flex: 1, marginLeft: 12 }}>
                    <Text style={{ fontSize: 14, fontWeight: "800", color: C.text }}>{item.title}</Text>
                    <Text style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>
                      {item.outcome === "used" ? "Used" : "Discarded"} · {formatWhen(item.resolvedAt || item.updatedAt)}
                    </Text>
                  </View>
                  <PillButton label="Put back" kind="ghost" onPress={() => restoreItem(item.id)} />
                </Card>
              ))
            )}
          </View>
        )}
      </ScrollView>
    </AnimatedScreen>
  );
}
