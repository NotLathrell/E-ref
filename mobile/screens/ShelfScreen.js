import { useMemo, useState } from "react";
import {
  View,
  Text,
  Image,
  TouchableOpacity,
  ScrollView,
  Modal,
  Pressable,
  Alert,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { CATEGORIES } from "../data/foodCatalog";
import { useInventory } from "../context/InventoryContext";

const BRAND = "#16567b";

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

// New: extracted card component with updated design
function ShelfItemCard({ item, onPress }) {
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
              backgroundColor: "#f1f5f9",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Ionicons name="image-outline" size={32} color="#94a3b8" />
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
                    color: "#0f172a",
                  }}
                >
                  {item.title}
                </Text>

                <Text
                  numberOfLines={1}
                  style={{
                    fontSize: 13,
                    color: "#64748b",
                    marginTop: 2,
                  }}
                >
                  {item.subtitle}
                </Text>
              </View>

              {/* Freshness badge */}
              <View
                style={{
                  backgroundColor: "#ffe0e0",
                  borderRadius: 999,
                  paddingHorizontal: 10,
                  paddingVertical: 4,
                }}
              >
                <Text
                  style={{
                    fontSize: 11,
                    fontWeight: "700",
                    color: "#dc2626",
                  }}
                >
                  Freshness {item.freshnessPercent ?? item.freshnessLabel}
                </Text>
              </View>
            </View>

            {/* Days left */}
            <Text
              style={{
                fontSize: 13,
                fontWeight: "600",
                color: "#ef4444",
                marginTop: 8,
              }}
            >
              {item.daysLabel}
            </Text>
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
              Scanned {item.scannedLabel}
            </Text>
          </View>
        </View>
      </View>
    </TouchableOpacity>
  );
}

export function ShelfScreen() {
  const { items, freezeItem, discardItem } = useInventory(); // ensure items is pulled from context
  const [activeTab, setActiveTab] = useState("All");
  const [selected, setSelected] = useState(null);

  const filteredItems = useMemo(
    () =>
      items.filter(
        (item) => activeTab === "All" || item.category === activeTab,
      ),
    [items, activeTab],
  );

  const onFreeze = async () => {
    if (!selected) return;
    await freezeItem(selected.id);
    Alert.alert("Frozen", `${selected.title} countdown paused (TTI reduced).`);
    setSelected(null);
  };

  const onDiscard = async () => {
    if (!selected) return;
    Alert.alert("Discard item?", `Remove ${selected.title} from inventory?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Discard",
        style: "destructive",
        onPress: async () => {
          await discardItem(selected.id);
          setSelected(null);
        },
      },
    ]);
  };

  const openItem = (item) => {
    setSelected(item);
  };

  return (
    <View
      style={{
        paddingHorizontal: 24,
        paddingTop: 40,
        paddingBottom: 18,
        flex: 1,
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

        <TouchableOpacity activeOpacity={0.7} hitSlop={10}>
          <Ionicons name="search-outline" size={27} color="#111111" />
        </TouchableOpacity>
      </View>

      {/* Category Tabs */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{
          alignItems: "center",
          paddingRight: 10,
        }}
        style={{ marginBottom: 16 }}
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
                  borderColor: active ? BRAND : "#cbd5e1",
                  backgroundColor: active ? BRAND : "#ffffff",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Text
                  style={{
                    fontSize: 14,
                    fontWeight: "600",
                    color: active ? "#ffffff" : "#111111",
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
      <ScrollView
        contentContainerStyle={{ paddingBottom: 120 }}
        showsVerticalScrollIndicator={false}
      >
        {filteredItems.map((item) => (
          <ShelfItemCard key={item.id} item={item} onPress={() => openItem(item)} />
        ))}

        {filteredItems.length === 0 ? (
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
              No items in this category. Scan packaging to add food.
            </Text>
          </View>
        ) : null}
      </ScrollView>

      {/* Food Detail Modal (unchanged logic, minor spacing tweaks optional) */}
      <Modal
        visible={!!selected}
        transparent
        animationType="fade"
        onRequestClose={() => setSelected(null)}
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
            onPress={() => setSelected(null)}
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
                    onPress={() => setSelected(null)}
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
                        color="#94A3B8"
                      />
                    </View>
                  )}

                  {/* Image refresh icon */}
                  <View
                    style={{
                      position: "absolute",
                      left: "50%",
                      top: "50%",
                      transform: [{ translateX: -16 }, { translateY: -16 }],
                      width: 32,
                      height: 32,
                      borderRadius: 6,
                      backgroundColor: "rgba(255,255,255,0.75)",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <Ionicons
                      name="refresh-outline"
                      size={20}
                      color="#666666"
                    />
                  </View>
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

                {/* Freshness Badge */}
                <View
                  style={{
                    alignSelf: "flex-start",
                    backgroundColor: "#FFB3B3",
                    borderRadius: 6,
                    paddingHorizontal: 9,
                    paddingVertical: 4,
                    marginTop: 10,
                    marginBottom: 12,
                  }}
                >
                  <Text
                    style={{
                      color: "#B91C1C",
                      fontSize: 11,
                      fontWeight: "700",
                    }}
                  >
                    {selected.freshnessLabel}
                  </Text>
                </View>

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
                    backgroundColor: "#D9D9D9",
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

                  <View
                    style={{
                      flexDirection: "row",
                      justifyContent: "space-between",
                    }}
                  >
                    <Text
                      style={{
                        fontSize: 11,
                        color: "#222222",
                      }}
                    >
                      Scanned (Shelf): {selected.scannedLabel}
                    </Text>

                    <Text style={{ fontSize: 15, color: "#111111" }}>→</Text>

                    <Text
                      style={{
                        fontSize: 11,
                        color: "#222222",
                      }}
                    >
                      Expected Expiry: {selected.daysLabel}
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