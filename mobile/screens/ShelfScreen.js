import { useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  Image,
  TextInput,
  TouchableOpacity,
  ScrollView,
  FlatList,
  Modal,
  Pressable,
  Alert,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRoute } from "@react-navigation/native";
import { CATEGORIES, STORAGE_LOCATIONS } from "../data/foodCatalog";
import { useInventory } from "../context/InventoryContext";

const COLORS = {
  background: "#FFF9F0",
  card: "#F8F0E3",
  primary: "#5C4033",
  accent: "#B86B4B",
  gold: "#D6A85F",
  text: "#2F241F",
  muted: "#7A6A60",
  border: "#E6D8C8",
  white: "#FFFFFF",

  success: "#6F9B72",
  warning: "#D89B3D",
  danger: "#C95C54",
};

const BRAND = COLORS.primary;

function formatDate(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

/** Freshness badge colours track the score instead of always reading as bad. */
function freshnessPalette(percent) {
  if (percent >= 70) return { bg: "#E3F1E4", fg: "#2F6B34" };
  if (percent >= 45) return { bg: "#FBEFD8", fg: "#8A5D14" };
  return { bg: "#FBE3E1", fg: "#A63B33" };
}

function daysPalette(days) {
  if (days == null) return COLORS.muted;
  if (days < 0) return COLORS.danger;
  if (days <= 2) return COLORS.danger;
  if (days <= 5) return COLORS.warning;
  return COLORS.success;
}

// New: extracted card component with updated design
function ShelfItemCard({ item, onPress }) {
  const percent = item.freshnessPercent ?? 0;
  const palette = freshnessPalette(percent);

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.88}
      style={{
        backgroundColor: "#ffffff",
        borderWidth: 1,
        borderColor: "#e5e7eb",
        borderRadius: 20,
        marginBottom: 16,
        overflow: "hidden",
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.08,
        shadowRadius: 8,
        elevation: 2,
      }}
    >
      <View
        style={{
          flexDirection: "row",
          padding: 16,
        }}
      >
        {/* Food Image */}
        {item.imageUri ? (
          <Image
            source={{ uri: item.imageUri }}
            style={{
              width: 95,
              height: 95,
              borderRadius: 16,
            }}
            resizeMode="cover"
          />
        ) : (
          <View
            style={{
              width: 95,
              height: 95,
              borderRadius: 16,
              backgroundColor: COLORS.card,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Ionicons name="image-outline" size={32} color={COLORS.muted} />
          </View>
        )}

        {/* Information */}
        <View
          style={{
            flex: 1,
            marginLeft: 14,
            justifyContent: "space-between",
          }}
        >
          {/* Top: title + location + freshness badge + days left */}
          <View>
            <View
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                alignItems: "flex-start",
              }}
            >
              <View
                style={{
                  flex: 1,
                  paddingRight: 8,
                }}
              >
                <Text
                  numberOfLines={1}
                  style={{
                    fontSize: 18,
                    fontWeight: "800",
                    color: COLORS.text,
                  }}
                >
                  {item.title}
                </Text>

                <Text
                  numberOfLines={1}
                  style={{
                    fontSize: 13,
                    color: COLORS.muted,
                    marginTop: 2,
                  }}
                >
                  {item.subtitle}
                </Text>
              </View>

              {/* Freshness badge */}
              <View
                style={{
                  backgroundColor: palette.bg,
                  borderRadius: 999,
                  paddingHorizontal: 10,
                  paddingVertical: 4,
                }}
              >
                <Text
                  style={{
                    fontSize: 11,
                    fontWeight: "700",
                    color: palette.fg,
                  }}
                >
                  Freshness {percent}%
                </Text>
              </View>
            </View>

            {/* Days left + the CNN's own verdict when the item was scanned */}
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                marginTop: 8,
                flexWrap: "wrap",
              }}
            >
              <Text
                style={{
                  fontSize: 13,
                  fontWeight: "600",
                  color: daysPalette(item.estimatedDaysLeft),
                }}
              >
                {item.daysLabel}
              </Text>

              {item.frozen ? (
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    marginLeft: 8,
                  }}
                >
                  <Ionicons name="snow" size={12} color="#2478E8" />
                  <Text
                    style={{
                      fontSize: 11,
                      fontWeight: "700",
                      color: "#2478E8",
                      marginLeft: 2,
                    }}
                  >
                    Frozen
                  </Text>
                </View>
              ) : null}

              {item.modelFreshnessLabel ? (
                <Text
                  style={{
                    fontSize: 11,
                    fontWeight: "700",
                    marginLeft: 8,
                    color:
                      item.modelFreshness === "spoiled"
                        ? COLORS.danger
                        : COLORS.success,
                  }}
                >
                  CNN: {item.modelFreshnessLabel}
                </Text>
              ) : null}
            </View>
          </View>

          {/* Bottom: Edit + scanned */}
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              marginTop: 10,
            }}
          >
            <TouchableOpacity
              activeOpacity={0.7}
              onPress={onPress}
              hitSlop={8}
              style={{
                flexDirection: "row",
                alignItems: "center",
              }}
            >
              <Text
                style={{
                  fontSize: 14,
                  fontWeight: "700",
                  color: "#0f172a",
                  marginRight: 6,
                }}
              >
                Edit
              </Text>
              <Ionicons name="open-outline" size={18} color="#0f172a" />
            </TouchableOpacity>

            <Text
              style={{
                fontSize: 12,
                color: "#94a3b8",
              }}
            >
              {item.scannedLabel}
            </Text>
          </View>
        </View>
      </View>
    </TouchableOpacity>
  );
}

export function ShelfScreen() {
  const route = useRoute();
  const { items, freezeItem, discardItem, updateItem } = useInventory();
  const [activeTab, setActiveTab] = useState("All");
  const [selectedId, setSelectedId] = useState(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");

  const listRef = useRef(null);

  // Home taps a category tile and lands here with that filter already applied.
  useEffect(() => {
    const incoming = route.params?.category;
    if (incoming && CATEGORIES.includes(incoming)) setActiveTab(incoming);
  }, [route.params?.category]);

  const filteredItems = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return items.filter((item) => {
      if (activeTab !== "All" && item.category !== activeTab) return false;
      if (!needle) return true;
      return [item.title, item.category, item.storageLabel, item.modelLabel]
        .filter(Boolean)
        .some((field) => String(field).toLowerCase().includes(needle));
    });
  }, [items, activeTab, query]);

  // Read the live item each render so freeze/discard updates show immediately.
  const selected = useMemo(
    () => (selectedId ? items.find((item) => item.id === selectedId) || null : null),
    [items, selectedId],
  );

  const onFreeze = async () => {
    if (!selected) return;
    await freezeItem(selected.id);
    Alert.alert("Frozen", `${selected.title} countdown paused (TTI reduced).`);
  };

  const onMoveStorage = async (storageId) => {
    if (!selected || selected.storageId === storageId) return;
    // Leaving the freezer resumes the countdown.
    await updateItem(selected.id, {
      storageId,
      frozen: storageId === "freezer" ? selected.frozen : false,
    });
  };

  const onDiscard = () => {
    if (!selected) return;
    Alert.alert("Discard item?", `Remove ${selected.title} from inventory?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Discard",
        style: "destructive",
        onPress: async () => {
          await discardItem(selected.id);
          setSelectedId(null);
        },
      },
    ]);
  };

  const openItem = (item) => {
    setSelectedId(item.id);
  };

  return (
    <View
      style={{
        paddingHorizontal: 24,
        paddingTop: 40,
        paddingBottom: 18,
        flex: 1,
        backgroundColor: COLORS.background,
      }}
    >
      {/* Header */}
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 22,
        }}
      >
        <Text
          style={{
            fontSize: 26,
            fontWeight: "800",
            color: "#111111",
          }}
        >
          Shelf
        </Text>

        <TouchableOpacity
          activeOpacity={0.7}
          hitSlop={10}
          onPress={() => {
            setSearchOpen((open) => {
              if (open) setQuery("");
              return !open;
            });
          }}
        >
          <Ionicons
            name={searchOpen ? "close-outline" : "search-outline"}
            size={27}
            color={COLORS.primary}
          />
        </TouchableOpacity>
      </View>

      {/* Search */}
      {searchOpen ? (
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            borderWidth: 1,
            borderColor: COLORS.border,
            backgroundColor: COLORS.card,
            borderRadius: 14,
            paddingHorizontal: 12,
            height: 44,
            marginBottom: 14,
          }}
        >
          <Ionicons name="search" size={18} color={COLORS.muted} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            autoFocus
            placeholder="Search by name, storage, or category"
            placeholderTextColor={COLORS.muted}
            style={{
              flex: 1,
              marginLeft: 8,
              fontSize: 14,
              color: COLORS.text,
            }}
          />
          {query.length > 0 ? (
            <TouchableOpacity onPress={() => setQuery("")} hitSlop={10}>
              <Ionicons name="close-circle" size={18} color={COLORS.muted} />
            </TouchableOpacity>
          ) : null}
        </View>
      ) : null}

      {/* Category Tabs */}
<ScrollView
  horizontal
  showsHorizontalScrollIndicator={false}
  directionalLockEnabled
  contentContainerStyle={{
    alignItems: "center",
    paddingRight: 10,
  }}
  style={{
    height: 36,
    flexGrow: 0,
    flexShrink: 0,
    marginBottom: 16,
  }}
>
  <View
    style={{
      flexDirection: "row",
      alignItems: "center",
    }}
  >
    {CATEGORIES.map((category) => {
      const active = activeTab === category;

      return (
        <TouchableOpacity
          key={category}
          onPress={() => setActiveTab(category)}
          activeOpacity={0.8}
          style={{
            marginRight: 10,
            height: 36,
            minWidth: category === "All" ? 66 : 72,
            paddingHorizontal: 16,
            borderRadius: 999,
            borderWidth: 1,
            borderColor: active ? COLORS.primary : COLORS.border,
            backgroundColor: active ? COLORS.primary : COLORS.card,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Text
            style={{
              fontSize: 14,
              fontWeight: "600",
              color: active ? COLORS.white : COLORS.text,
            }}
          >
            {category}
          </Text>
        </TouchableOpacity>
      );
    })}
  </View>
</ScrollView>

      {/* Food Item Cards */}
      <FlatList
  ref={listRef}
  data={filteredItems}
  keyExtractor={(item) => item.id}
  showsVerticalScrollIndicator={false}
  contentContainerStyle={{
    paddingBottom: 120,
    paddingTop: 4,
  }}
  renderItem={({ item }) => (
    <ShelfItemCard item={item} onPress={() => openItem(item)} />
  )}
  ListEmptyComponent={
    <View
      style={{
        alignItems: "center",
        marginTop: 32,
        paddingHorizontal: 24,
      }}
    >
      <Ionicons name="file-tray-outline" size={52} color="#cbd5e1" />

      <Text
        style={{
          fontSize: 16,
          color: "#64748b",
          marginTop: 12,
          textAlign: "center",
        }}
      >
        {query.trim()
          ? `Nothing matches "${query.trim()}".`
          : "No items in this category. Scan food to add it."}
      </Text>
    </View>
  }
/>

      {/* Food Detail Modal (unchanged logic, minor spacing tweaks optional) */}
      <Modal
        visible={!!selected}
        transparent
        animationType="fade"
        onRequestClose={() => setSelectedId(null)}
      >
        <View
          style={{
            flex: 1,
            backgroundColor: "rgba(0,0,0,0.48)",
            justifyContent: "flex-end",
          }}
        >
          {/* Tap outside to close */}
          <Pressable
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
            }}
            onPress={() => setSelectedId(null)}
          />

          {/* Bottom Sheet */}
          <View
            style={{
              backgroundColor: "#FFFFFF",
              borderTopLeftRadius: 24,
              borderTopRightRadius: 24,
              paddingHorizontal: 28,
              paddingTop: 18,
              paddingBottom: 30,
              maxHeight: "82%",
            }}
          >
            {selected && (
              <ScrollView
                showsVerticalScrollIndicator={false}
                contentContainerStyle={{ paddingBottom: 10 }}
              >
                {/* Close Button */}
                <View style={{ alignItems: "flex-end", marginBottom: 10 }}>
                  <TouchableOpacity
                    onPress={() => setSelectedId(null)}
                    activeOpacity={0.8}
                    style={{
                      width: 32,
                      height: 32,
                      borderRadius: 16,
                      backgroundColor: BRAND,
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <Ionicons name="close" size={21} color="#FFFFFF" />
                  </TouchableOpacity>
                </View>

                {/* Large Food Image */}
                <View
                  style={{
                    height: 152,
                    borderRadius: 18,
                    overflow: "hidden",
                    backgroundColor: "#E5E7EB",
                    marginBottom: 12,
                  }}
                >
                  {selected.imageUri ? (
                    <Image
                      source={{ uri: selected.imageUri }}
                      style={{ width: "100%", height: "100%" }}
                      resizeMode="cover"
                    />
                  ) : (
                    <View
                      style={{
                        flex: 1,
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      <Ionicons
                        name="image-outline"
                        size={42}
                        color={COLORS.muted}
                      />
                    </View>
                  )}

                </View>

                {/* Food Name + Delete */}
                <View
                  style={{
                    flexDirection: "row",
                    justifyContent: "space-between",
                    alignItems: "flex-start",
                  }}
                >
                  <View style={{ flex: 1, paddingRight: 15 }}>
                    <Text
                      style={{
                        fontSize: 22,
                        fontWeight: "800",
                        color: "#111111",
                      }}
                    >
                      {selected.title}
                    </Text>

                    <Text
                      style={{
                        fontSize: 13,
                        color: "#777777",
                        marginTop: 2,
                      }}
                    >
                      {selected.subtitle}
                    </Text>
                  </View>

                  <TouchableOpacity
                    onPress={onDiscard}
                    activeOpacity={0.7}
                    hitSlop={10}
                  >
                    <Ionicons name="trash-outline" size={25} color="#111111" />
                  </TouchableOpacity>
                </View>

                {/* Freshness + CNN verdict */}
                <View
                  style={{
                    flexDirection: "row",
                    flexWrap: "wrap",
                    marginTop: 10,
                    marginBottom: 12,
                  }}
                >
                  <View
                    style={{
                      backgroundColor: freshnessPalette(selected.freshnessPercent).bg,
                      borderRadius: 6,
                      paddingHorizontal: 9,
                      paddingVertical: 4,
                      marginRight: 8,
                    }}
                  >
                    <Text
                      style={{
                        color: freshnessPalette(selected.freshnessPercent).fg,
                        fontSize: 11,
                        fontWeight: "700",
                      }}
                    >
                      {selected.freshnessLabel}
                    </Text>
                  </View>

                  {selected.modelFreshnessLabel ? (
                    <View
                      style={{
                        backgroundColor:
                          selected.modelFreshness === "spoiled"
                            ? "#FBE3E1"
                            : "#E3F1E4",
                        borderRadius: 6,
                        paddingHorizontal: 9,
                        paddingVertical: 4,
                        marginRight: 8,
                      }}
                    >
                      <Text
                        style={{
                          color:
                            selected.modelFreshness === "spoiled"
                              ? "#A63B33"
                              : "#2F6B34",
                          fontSize: 11,
                          fontWeight: "700",
                        }}
                      >
                        CNN: {selected.modelFreshnessLabel}
                        {selected.modelFreshnessConfidence
                          ? ` ${(selected.modelFreshnessConfidence * 100).toFixed(0)}%`
                          : ""}
                      </Text>
                    </View>
                  ) : null}

                  <View
                    style={{
                      backgroundColor: "#EFE7DA",
                      borderRadius: 6,
                      paddingHorizontal: 9,
                      paddingVertical: 4,
                    }}
                  >
                    <Text
                      style={{
                        color: COLORS.primary,
                        fontSize: 11,
                        fontWeight: "700",
                      }}
                    >
                      {selected.urgency} risk
                    </Text>
                  </View>
                </View>

                {/* Move storage — changing location re-runs the TTI estimate */}
                <Text
                  style={{
                    fontSize: 13,
                    fontWeight: "800",
                    color: "#111111",
                    marginBottom: 7,
                  }}
                >
                  Storage Location
                </Text>

                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  style={{ marginBottom: 12 }}
                >
                  {STORAGE_LOCATIONS.map((location) => {
                    const active = selected.storageId === location.id;
                    return (
                      <TouchableOpacity
                        key={location.id}
                        activeOpacity={0.8}
                        onPress={() => onMoveStorage(location.id)}
                        style={{
                          marginRight: 8,
                          height: 34,
                          paddingHorizontal: 12,
                          borderRadius: 999,
                          borderWidth: 1,
                          borderColor: active ? COLORS.primary : COLORS.border,
                          backgroundColor: active ? COLORS.primary : COLORS.card,
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                      >
                        <Text
                          style={{
                            fontSize: 12,
                            fontWeight: "600",
                            color: active ? COLORS.white : COLORS.text,
                          }}
                        >
                          {location.label}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>

                {selected.storageMismatch ? (
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      backgroundColor: "#FBEFD8",
                      borderRadius: 8,
                      padding: 9,
                      marginBottom: 12,
                    }}
                  >
                    <Ionicons name="warning-outline" size={14} color="#8A5D14" />
                    <Text
                      style={{
                        fontSize: 11,
                        color: "#8A5D14",
                        marginLeft: 6,
                        flex: 1,
                        lineHeight: 15,
                      }}
                    >
                      Stored outside its best location — this raises the spoilage
                      risk score.
                    </Text>
                  </View>
                ) : null}

                {/* Freeze Now */}
                {!selected.frozen && (
                  <TouchableOpacity
                    onPress={onFreeze}
                    activeOpacity={0.85}
                    style={{
                      height: 48,
                      borderRadius: 8,
                      backgroundColor: "#2478E8",
                      alignItems: "center",
                      justifyContent: "center",
                      marginBottom: 12,
                    }}
                  >
                    <View
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                      }}
                    >
                      <Ionicons name="snow" size={21} color="#FFFFFF" />
                      <View style={{ marginLeft: 8 }}>
                        <Text
                          style={{
                            color: "#FFFFFF",
                            fontSize: 15,
                            fontWeight: "800",
                          }}
                        >
                          FREEZE NOW
                        </Text>
                        <Text
                          style={{
                            color: "#DCEBFF",
                            fontSize: 9,
                            marginTop: -1,
                          }}
                        >
                          Pause countdown (Freeze)
                        </Text>
                      </View>
                    </View>
                  </TouchableOpacity>
                )}

                {/* Best Practice */}
                <View
                  style={{
                    borderWidth: 1,
                    borderColor: "#D5DCE3",
                    borderRadius: 8,
                    paddingHorizontal: 12,
                    paddingVertical: 10,
                    marginBottom: 12,
                  }}
                >
                  <Text
                    style={{
                      fontSize: 13,
                      fontWeight: "800",
                      color: "#111111",
                      marginBottom: 6,
                    }}
                  >
                    Best Practice
                  </Text>

                  <Text
                    style={{
                      fontSize: 12,
                      color: "#333333",
                      lineHeight: 18,
                    }}
                  >
                    Best storage: {selected.storageLabel}
                  </Text>

                  {!selected.frozen && selected.freezeByDate ? (
                    <Text
                      style={{
                        fontSize: 12,
                        color: "#333333",
                        marginTop: 3,
                      }}
                    >
                      Freeze by: {formatDate(selected.freezeByDate)}
                    </Text>
                  ) : null}
                </View>

                {/* Expected Expiry */}
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    marginBottom: 12,
                  }}
                >
                  <Text
                    style={{
                      fontSize: 13,
                      fontWeight: "800",
                      color: "#111111",
                    }}
                  >
                    Expected Expiry:{" "}
                  </Text>

                  <Text
                    style={{
                      fontSize: 13,
                      fontWeight: "800",
                      color: "#111111",
                    }}
                  >
                    {selected.daysLabel}
                  </Text>

                  <Ionicons
                    name="alert-circle"
                    size={14}
                    color="#E53935"
                    style={{ marginLeft: 5 }}
                  />
                </View>

                {/* Tracking History */}
                <View
                  style={{
                    backgroundColor: COLORS.card,
                    borderWidth: 1,
                    borderColor: COLORS.border,
                    borderRadius: 8,
                    paddingHorizontal: 12,
                    paddingVertical: 10,
                  }}
                >
                  <Text
                    style={{
                      fontSize: 13,
                      fontWeight: "800",
                      color: "#111111",
                      marginBottom: 10,
                    }}
                  >
                    Tracking History
                  </Text>

                  {(selected.history || []).map((entry, index) => (
                    <View
                      key={`${entry.at}-${index}`}
                      style={{
                        flexDirection: "row",
                        alignItems: "flex-start",
                        marginBottom: 8,
                      }}
                    >
                      <View
                        style={{
                          width: 7,
                          height: 7,
                          borderRadius: 4,
                          backgroundColor: COLORS.primary,
                          marginTop: 5,
                          marginRight: 8,
                        }}
                      />
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 12, color: "#222222", fontWeight: "600" }}>
                          {entry.event}
                        </Text>
                        <Text style={{ fontSize: 10, color: COLORS.muted, marginTop: 1 }}>
                          {formatDate(entry.at)}
                        </Text>
                      </View>
                    </View>
                  ))}

                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "flex-start",
                      borderTopWidth: 1,
                      borderTopColor: COLORS.border,
                      paddingTop: 8,
                    }}
                  >
                    <View
                      style={{
                        width: 7,
                        height: 7,
                        borderRadius: 4,
                        backgroundColor: daysPalette(selected.estimatedDaysLeft),
                        marginTop: 5,
                        marginRight: 8,
                      }}
                    />
                    <Text style={{ fontSize: 12, color: "#222222", flex: 1 }}>
                      Expected expiry: {selected.daysLabel}
                    </Text>
                  </View>
                </View>
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}
