import { View, Text, Image, ScrollView, TouchableOpacity } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import { useInventory } from "../context/InventoryContext";

const BRAND = "#5C4033";

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
  color: COLORS.text, // slate-900
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
  color: COLORS.text,
  lineHeight: 40,
};

const heroBannerStyle = {
  height: 120,
  borderRadius: 18,
  overflow: "hidden",
  marginBottom: 14,
  backgroundColor: COLORS.primary,
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
  backgroundColor: COLORS.card,
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
  color: COLORS.text,
  fontSize: 20,
  fontWeight: "800",
};

const overviewSubtitleStyle = {
  color: COLORS.muted,
  fontSize: 14,
  marginTop: 5,
};

const overviewImageContainerStyle = {
  width: 58,
  height: 58,
  borderRadius: 29,
  backgroundColor: COLORS.white,
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
  backgroundColor: COLORS.border,
  overflow: "hidden",
};

const riskBarFillStyle = (riskPct) => ({
  height: "100%",
  width: `${Math.min(100, riskPct)}%`,
  borderRadius: 10,
  backgroundColor: riskPct >= 55 ? COLORS.danger : BRAND,
});

const riskInfoRowStyle = {
  flexDirection: "row",
  justifyContent: "space-between",
  alignItems: "center",
  marginTop: 8,
};

const riskLabelStyle = {
  color: COLORS.muted,
  fontSize: 12,
};

const riskValueStyle = {
  color: COLORS.text,
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
  backgroundColor: COLORS.card,
  borderRadius: 22,
  padding: 18,
  minHeight: 125,
  justifyContent: "space-between",
};

const categoryIconContainerStyle = {
  width: 42,
  height: 42,
  borderRadius: 21,
  backgroundColor: COLORS.primary,
  alignItems: "center",
  justifyContent: "center",
};

const categoryInfoStyle = {
  marginTop: 14,
};

const categoryLabelStyle = {
  color: COLORS.text,
  fontSize: 16,
  fontWeight: "800",
};

const categoryCountStyle = {
  color: COLORS.muted,
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
          color: COLORS.text,
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
      className="flex-1"
      style={{ backgroundColor: "#FFF9F0" }}
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
