import { View, Text, Image, ScrollView, TouchableOpacity } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import { useInventory } from "../context/InventoryContext";

const BRAND = "#16567b";

const scrollContentStyle = {
  paddingHorizontal: 20,
  paddingTop: 40,
  paddingBottom: 120,
};

const sectionPillDotStyle = {
  height: 10,
  width: 10,
  borderRadius: 9999,
  marginRight: 8,
  backgroundColor: BRAND,
};

const sectionPillTextStyle = {
  color: "#0f172a", // slate-900
  fontWeight: "bold",
  fontSize: 16,
  textTransform: "uppercase",
  letterSpacing: 0.05 * 16, // tracking-wide
};

const greetingContainerStyle = {
  marginBottom: 18,
};

const greetingTextStyle = {
  fontSize: 30,
  fontWeight: "800",
  color: "#000000",
  lineHeight: 40,
};

const heroBannerStyle = {
  height: 120,
  borderRadius: 18,
  overflow: "hidden",
  marginBottom: 14,
  backgroundColor: BRAND,
};

const heroImageStyle = {
  width: "100%",
  height: "100%",
  position: "absolute",
  opacity: 0.35,
};

const heroOverlayStyle = {
  flex: 1,
  backgroundColor: "rgba(0,0,0,0.15)",
  justifyContent: "center",
  padding: 22,
};

const heroQuoteStyle = {
  color: "#FFFFFF",
  fontSize: 18,
  fontWeight: "800",
  textAlign: "center",
  lineHeight: 24,
};

const overviewCardStyle = {
  backgroundColor: "#F1F5F9",
  borderRadius: 22,
  padding: 18,
  marginBottom: 28,
};

const overviewTopRowStyle = {
  flexDirection: "row",
  alignItems: "center",
  justifyContent: "space-between",
  marginBottom: 16,
};

const overviewTitleContainerStyle = {
  flex: 1,
  paddingRight: 12,
};

const overviewTitleStyle = {
  color: "#111827",
  fontSize: 20,
  fontWeight: "800",
};

const overviewSubtitleStyle = {
  color: "#64748B",
  fontSize: 14,
  marginTop: 5,
};

const overviewImageContainerStyle = {
  width: 58,
  height: 58,
  borderRadius: 29,
  backgroundColor: "#FFFFFF",
  overflow: "hidden",
  alignItems: "center",
  justifyContent: "center",
};

const overviewImageStyle = {
  width: "100%",
  height: "100%",
};

const riskBarContainerStyle = {
  height: 9,
  borderRadius: 10,
  backgroundColor: "#CBD5E1",
  overflow: "hidden",
};

const riskBarFillStyle = (riskPct) => ({
  height: "100%",
  width: `${Math.min(100, riskPct)}%`,
  borderRadius: 10,
  backgroundColor: riskPct >= 55 ? "#EF4444" : BRAND,
});

const riskInfoRowStyle = {
  flexDirection: "row",
  justifyContent: "space-between",
  alignItems: "center",
  marginTop: 8,
};

const riskLabelStyle = {
  color: "#64748B",
  fontSize: 12,
};

const riskValueStyle = {
  color: "#111827",
  fontSize: 13,
  fontWeight: "800",
};

const riskFooterStyle = {
  color: "#94A3B8",
  fontSize: 12,
  marginTop: 6,
};

const categoriesGridStyle = {
  flexDirection: "row",
  flexWrap: "wrap",
  marginHorizontal: -5,
  marginBottom: 20,
};

const categoryItemStyle = {
  width: "50%",
  paddingHorizontal: 5,
  marginBottom: 10,
};

const categoryCardStyle = {
  backgroundColor: "#F1F5F9",
  borderRadius: 22,
  padding: 18,
  minHeight: 125,
  justifyContent: "space-between",
};

const categoryIconContainerStyle = {
  width: 42,
  height: 42,
  borderRadius: 21,
  backgroundColor: "#FFFFFF",
  alignItems: "center",
  justifyContent: "center",
};

const categoryInfoStyle = {
  marginTop: 14,
};

const categoryLabelStyle = {
  color: "#111827",
  fontSize: 16,
  fontWeight: "800",
};

const categoryCountStyle = {
  color: "#94A3B8",
  fontSize: 13,
  marginTop: 3,
};

function SectionPill({ label }) {
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        marginBottom: 12,
      }}
    >
      <View
        style={{
          width: 10,
          height: 10,
          borderRadius: 5,
          backgroundColor: BRAND,
          marginRight: 8,
        }}
      />

      <Text
        style={{
          color: "#0f172a",
          fontWeight: "700",
          fontSize: 16,
          textTransform: "uppercase",
          letterSpacing: 0.8,
        }}
      >
        {label}
      </Text>
    </View>
  );
}

export function HomeScreen() {
  const navigation = useNavigation();
  const { soonToSpoil, items, user } = useInventory();

  const displayName = user?.name || "Food Saver";

  const topRisk = soonToSpoil[0] || null;
  const riskPct = topRisk ? Math.round(topRisk.riskScore * 100) : 0;

  const categoryCounts = ["Produce", "Dairy", "Meat", "Pantry"].map((cat) => ({
    label: cat,
    count: items.filter((i) => i.category === cat).length,
  }));

  return (
    <ScrollView
      className="flex-1 bg-white"
      contentContainerStyle={scrollContentStyle}
    >
      {/* Greeting */}
      <View style={greetingContainerStyle}>
        <Text style={greetingTextStyle}>Hello, {displayName}</Text>
      </View>

      {/* Hero Banner */}
      <View style={heroBannerStyle}>
        <Image
          source={require("../assets/home-banner (2).png")}
          style={heroImageStyle}
          resizeMode="cover"
        />

        <View style={heroOverlayStyle}>
          <Text style={heroQuoteStyle}>
            "Freeze excess food to{"\n"}
            extend its shelf life for{"\n"}
            future use."
          </Text>
        </View>
      </View>

      {/* Overview */}
      <SectionPill label="Overview" />

      <TouchableOpacity
        activeOpacity={0.9}
        onPress={() =>
          topRisk ? navigation.navigate("Shelf") : navigation.navigate("Scan")
        }
        style={overviewCardStyle}
      >
        {/* Top Row */}
        <View style={overviewTopRowStyle}>
          <View style={overviewTitleContainerStyle}>
            <Text style={overviewTitleStyle}>Soon to Spoil</Text>

            <Text style={overviewSubtitleStyle}>
              {topRisk
                ? `${topRisk.title} · ${topRisk.daysLabel}`
                : "No items are close to spoiling."}
            </Text>
          </View>

          {/* Food Image / Icon */}
          <View style={overviewImageContainerStyle}>
            {topRisk?.imageUri ? (
              <Image
                source={{ uri: topRisk.imageUri }}
                style={overviewImageStyle}
                resizeMode="cover"
              />
            ) : (
              <Ionicons name="nutrition-outline" size={28} color={BRAND} />
            )}
          </View>
        </View>

        {/* Risk Bar */}
        <View style={riskBarContainerStyle}>
          <View style={riskBarFillStyle(riskPct)} />
        </View>

        {/* Risk Information */}
        <View style={riskInfoRowStyle}>
          <Text style={riskLabelStyle}>Weighted risk</Text>

          <Text style={riskValueStyle}>{riskPct}%</Text>
        </View>

        {/* Bottom Status */}
        <Text style={riskFooterStyle}>
          {soonToSpoil.length} item(s) within 72 hours
        </Text>
      </TouchableOpacity>

      {/* Categories */}
      <SectionPill label="Categories" />

      <View style={categoriesGridStyle}>
        {categoryCounts.map((item) => {
          const categoryIcon = {
            Produce: "leaf-outline",
            Dairy: "water-outline",
            Meat: "restaurant-outline",
            Pantry: "cube-outline",
          };

          return (
            <TouchableOpacity
              key={item.label}
              activeOpacity={0.85}
              onPress={() => navigation.navigate("Shelf")}
              style={categoryItemStyle}
            >
              <View style={categoryCardStyle}>
                {/* Icon */}
                <View style={categoryIconContainerStyle}>
                  <Ionicons
                    name={categoryIcon[item.label]}
                    size={22}
                    color={BRAND}
                  />
                </View>

                {/* Category Info */}
                <View style={categoryInfoStyle}>
                  <Text style={categoryLabelStyle}>{item.label}</Text>

                  <Text style={categoryCountStyle}>
                    {item.count} {item.count === 1 ? "item" : "items"}
                  </Text>
                </View>
              </View>
            </TouchableOpacity>
          );
        })}
      </View>
    </ScrollView>
  );
}
