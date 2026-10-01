import { useEffect, useRef, useState } from "react";
import { Dimensions } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { useInventory } from "../context/InventoryContext";
import { planMeals } from "../services/mealPlan";
import { eligibleRecipes } from "../services/contentBased";
import { RECIPES } from "../data/recipes";
import { explainPriority } from "../services/prioritize";
import { AnimatedScreen } from "../components/animations/AnimatedScreen";
import { Image, Ionicons, MaterialCommunityIcons, ScrollView, Text, TouchableOpacity, View } from "../components/themed";

const COLORS = {
  background: "#FFF7ED",
  card: "#FFEDD5",
  primary: "#C2410C",
  accent: "#9A3412",
  gold: "#FBBF24",
  text: "#431407",
  muted: "#8A6D56",
  border: "#FED7AA",
  white: "#FFFFFF",
  success: "#6F9B72",
  warning: "#D89B3D",
  danger: "#C95C54",
};

const BRAND = COLORS.primary;

// At least 5, so the carousel at the top of the dashboard always has somewhere to go.
const DASHBOARD_TIPS = [
  "Freeze excess food to extend its shelf life for future use.",
  "Store fruits and vegetables separately — some release gases that speed up spoilage in others.",
  "Keep your fridge below 4°C (40°F) to slow bacterial growth.",
  "First in, first out: move older items to the front so they get used before they spoil.",
  "Wrap leafy greens in a dry paper towel before refrigerating to keep them crisp longer.",
  "Don't wash berries until you're ready to eat them — moisture speeds up mold growth.",
  "Store onions and potatoes apart; kept together, they spoil each other faster.",
];

const TIP_WIDTH = Dimensions.get("window").width - 40;

const scrollContentStyle = {
  paddingHorizontal: 20,
  paddingTop: 40,
  paddingBottom: 120,
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
  marginBottom: 24,
  backgroundColor: COLORS.primary,
};

const heroImageStyle = {
  width: "100%",
  height: "100%",
  position: "absolute",
  opacity: 0.35,
};

const heroTipPageStyle = {
  width: TIP_WIDTH,
  height: 120,
  backgroundColor: "rgba(0,0,0,0.15)",
  justifyContent: "center",
  padding: 22,
};

const heroDotsRowStyle = {
  position: "absolute",
  bottom: 10,
  left: 0,
  right: 0,
  flexDirection: "row",
  justifyContent: "center",
};

const heroDotStyle = (active) => ({
  width: 6,
  height: 6,
  borderRadius: 3,
  marginHorizontal: 3,
  backgroundColor: active ? COLORS.white : "rgba(255,255,255,0.4)",
});

const heroQuoteStyle = {
  color: COLORS.white,
  fontSize: 18,
  fontWeight: "800",
  textAlign: "center",
  lineHeight: 24,
};

const mealCardStyle = {
  backgroundColor: COLORS.card,
  borderRadius: 18,
  padding: 16,
  marginBottom: 12,
};

const mealHeaderRowStyle = {
  flexDirection: "row",
  justifyContent: "space-between",
  alignItems: "center",
  marginBottom: 6,
};

const mealNameStyle = {
  color: COLORS.text,
  fontSize: 16,
  fontWeight: "800",
  flex: 1,
  marginRight: 8,
};

const mealMinutesStyle = {
  color: COLORS.muted,
  fontSize: 12,
  fontWeight: "700",
};

const mealUsesStyle = {
  color: COLORS.primary,
  fontSize: 13,
  fontWeight: "700",
  marginBottom: 4,
};

const mealSummaryStyle = {
  color: COLORS.muted,
  fontSize: 13,
  lineHeight: 18,
};

const syncBannerStyle = {
  backgroundColor: "#FBEFD5",
  borderRadius: 12,
  paddingVertical: 8,
  paddingHorizontal: 12,
  marginBottom: 14,
};

const syncBannerTextStyle = {
  color: COLORS.primary,
  fontSize: 12,
  fontWeight: "600",
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

const freshnessBarFillStyle = (freshnessPct) => {
  const safeFreshness = Math.max(0, Math.min(100, Number(freshnessPct) || 0));

  return {
    height: "100%",
    width: `${safeFreshness}%`,
    borderRadius: 10,
    backgroundColor:
      safeFreshness < 30 ? COLORS.danger : safeFreshness < 70 ? COLORS.warning : COLORS.success,
  };
};

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
  color: COLORS.muted,
  fontSize: 12,
  marginTop: 6,
};

const categoriesGridStyle = {
  flexDirection: "row",
  flexWrap: "wrap",
  justifyContent: "space-between",
  marginBottom: 20,
};

const categoryItemStyle = {
  width: "48%",
  marginBottom: 12,
};

const categoryCardStyle = {
  backgroundColor: COLORS.card,
  borderRadius: 22,
  padding: 18,
  minHeight: 135,
  justifyContent: "space-between",
};

const categoryIconContainerStyle = {
  width: 46,
  height: 46,
  borderRadius: 23,
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

const statRowStyle = {
  flexDirection: "row",
  justifyContent: "space-between",
  marginBottom: 24,
};

const statTileStyle = {
  width: "31.5%",
  backgroundColor: COLORS.card,
  borderRadius: 16,
  paddingVertical: 14,
  paddingHorizontal: 10,
  alignItems: "center",
};

const statValueStyle = {
  color: COLORS.text,
  fontSize: 24,
  fontWeight: "800",
};

const statLabelStyle = {
  color: COLORS.muted,
  fontSize: 11,
  fontWeight: "600",
  marginTop: 2,
  textAlign: "center",
};

const priorityRowStyle = {
  flexDirection: "row",
  alignItems: "center",
  backgroundColor: COLORS.card,
  borderRadius: 16,
  padding: 12,
  marginBottom: 8,
};

const priorityRankStyle = {
  width: 30,
  height: 30,
  borderRadius: 15,
  backgroundColor: COLORS.primary,
  alignItems: "center",
  justifyContent: "center",
  marginRight: 12,
};

const priorityRankTextStyle = {
  color: COLORS.white,
  fontSize: 13,
  fontWeight: "800",
};

const priorityTitleStyle = {
  color: COLORS.text,
  fontSize: 15,
  fontWeight: "800",
};

const priorityReasonStyle = {
  color: COLORS.muted,
  fontSize: 12,
  marginTop: 2,
};

const priorityScoreStyle = {
  color: COLORS.text,
  fontSize: 14,
  fontWeight: "800",
  marginLeft: 8,
};

const linkRowStyle = {
  flexDirection: "row",
  justifyContent: "space-between",
  marginBottom: 24,
};

const linkButtonStyle = {
  width: "48.5%",
  flexDirection: "row",
  alignItems: "center",
  justifyContent: "center",
  backgroundColor: COLORS.card,
  borderRadius: 14,
  paddingVertical: 13,
};

const linkTextStyle = {
  color: COLORS.primary,
  fontSize: 14,
  fontWeight: "800",
  marginLeft: 8,
};

const emptyCardStyle = {
  backgroundColor: COLORS.card,
  borderRadius: 16,
  padding: 16,
  marginBottom: 24,
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

// Produce uses Ionicons; the rest use MaterialCommunityIcons, which has closer matches
// (a cow's head, a cut of meat, a kitchen cabinet) than Ionicons' more generic set.
const CATEGORY_ICONS = {
  Produce: { set: "ionicons", name: "leaf-outline" },
  Dairy: { set: "mci", name: "cow" },
  Meat: { set: "mci", name: "food-drumstick-outline" },
  Pantry: { set: "mci", name: "cupboard-outline" },
};

export function HomeScreen() {
  const navigation = useNavigation();
  const [tipIndex, setTipIndex] = useState(0);
  const tipScrollRef = useRef(null);

  // Advances on its own every 10s; a manual swipe (onMomentumScrollEnd below) just
  // moves tipIndex, so the next tick carries on from wherever the user left it.
  useEffect(() => {
    const id = setInterval(() => {
      setTipIndex((prev) => {
        const next = (prev + 1) % DASHBOARD_TIPS.length;
        tipScrollRef.current?.scrollTo({ x: next * TIP_WIDTH, animated: true });
        return next;
      });
    }, 10000);
    return () => clearInterval(id);
  }, []);

  const {
    soonToSpoil = [],
    prioritized = [],
    items = [],
    user,
    syncStatus,
    pendingChanges = 0,
    taste,
  } = useInventory();

  const displayName = user?.name || "Food Saver";

  const topRisk = soonToSpoil[0] || null;

  // Greedy weighted set cover over the recipe book: the fewest meals that use up
  // the most at-risk food.
  const plan = planMeals(items, { maxMeals: 3, recipes: eligibleRecipes(taste) });

  const freshnessPct = topRisk ? Number(topRisk.freshnessPercent) || 0 : 0;

  const needAttention = items.filter(
    (item) => item.urgency === "critical" || item.urgency === "high"
  ).length;
  const topPriorities = prioritized.slice(0, 5);

  const categoryCounts = [
    "Produce",
    "Dairy",
    "Meat",
    "Pantry",
  ].map((category) => ({
    label: category,
    count: items.filter((item) => item.category === category).length,
  }));

  return (
    <AnimatedScreen direction="left">
      <ScrollView
        style={{
          flex: 1,
          backgroundColor: COLORS.background,
        }}
        contentContainerStyle={scrollContentStyle}
        showsVerticalScrollIndicator={false}
      >
        {/* Greeting */}
        <View style={greetingContainerStyle}>
          <Text style={greetingTextStyle}>
            Hello, {displayName}
          </Text>
        </View>

        {syncStatus === "offline" && pendingChanges > 0 ? (
          <View style={syncBannerStyle}>
            <Text style={syncBannerTextStyle}>
              You're offline. {pendingChanges} change
              {pendingChanges === 1 ? "" : "s"} will sync when you reconnect.
            </Text>
          </View>
        ) : null}

        {/* Hero Banner: a carousel of food-storage and shelf-life tips */}
        <View style={heroBannerStyle}>
          <Image
            source={require("../assets/home-banner (2).png")}
            style={heroImageStyle}
            resizeMode="cover"
          />

          <ScrollView
            ref={tipScrollRef}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            onMomentumScrollEnd={(event) => {
              const index = Math.round(event.nativeEvent.contentOffset.x / TIP_WIDTH);
              setTipIndex(Math.max(0, Math.min(DASHBOARD_TIPS.length - 1, index)));
            }}
          >
            {DASHBOARD_TIPS.map((tip, index) => (
              <View key={index} style={heroTipPageStyle}>
                <Text themed={false} style={heroQuoteStyle}>
                  {tip}
                </Text>
              </View>
            ))}
          </ScrollView>

          <View style={heroDotsRowStyle}>
            {DASHBOARD_TIPS.map((_, index) => (
              <View key={index} themed={false} style={heroDotStyle(index === tipIndex)} />
            ))}
          </View>
        </View>

        {/* Overview */}
        <SectionPill label="Overview" />

        <TouchableOpacity
          activeOpacity={0.85}
          onPress={() =>
            topRisk
              // `at` makes every tap a fresh navigation, even to the same item twice in a
              // row, since the Shelf tab stays mounted and route.params alone wouldn't change.
              ? navigation.navigate("Shelf", { itemId: topRisk.id, at: Date.now() })
              : navigation.navigate("Camera")
          }
          style={[overviewCardStyle, { borderWidth: 1, borderColor: COLORS.border }]}
        >
          <View style={overviewTopRowStyle}>
            <View style={overviewTitleContainerStyle}>
              <Text style={overviewTitleStyle}>
                Soon to Spoil
              </Text>

              <Text style={overviewSubtitleStyle}>
                {topRisk
                  ? `${topRisk.title} · ${topRisk.daysLabel}`
                  : "No items are close to spoiling."}
              </Text>
            </View>

            <View style={overviewImageContainerStyle}>
              {topRisk?.imageUri ? (
                <Image
                  source={{ uri: topRisk.imageUri }}
                  style={overviewImageStyle}
                  resizeMode="cover"
                />
              ) : (
                <Ionicons
                  name="nutrition-outline"
                  size={28}
                  color={BRAND}
                />
              )}
            </View>
          </View>

          <View style={riskBarContainerStyle}>
            <View style={freshnessBarFillStyle(freshnessPct)} />
          </View>

          <View style={riskInfoRowStyle}>
            <Text style={riskLabelStyle}>
              Freshness
            </Text>

            <Text style={riskValueStyle}>
              {freshnessPct}%
            </Text>
          </View>

          <View
            style={{
              flexDirection: "row",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <Text style={riskFooterStyle}>
              {soonToSpoil.length} item
              {soonToSpoil.length === 1 ? "" : "s"} within 72 hours
            </Text>

            <View style={{ flexDirection: "row", alignItems: "center" }}>
              <Text
                style={{
                  color: BRAND,
                  fontSize: 11,
                  fontWeight: "700",
                  marginRight: 2,
                }}
              >
                Click to view details
              </Text>
              <Ionicons name="chevron-forward" size={14} color={BRAND} />
            </View>
          </View>
        </TouchableOpacity>

        {/* Dashboard totals, straight from the current inventory */}
        <View style={statRowStyle}>
          <View style={statTileStyle}>
            <Text style={statValueStyle}>{items.length}</Text>
            <Text style={statLabelStyle}>On the shelf</Text>
          </View>
          <View style={statTileStyle}>
            <Text style={statValueStyle}>{needAttention}</Text>
            <Text style={statLabelStyle}>Need/s attention</Text>
          </View>
          <View style={statTileStyle}>
            <Text style={statValueStyle}>{RECIPES.length}</Text>
            <Text style={statLabelStyle}>Recipes available</Text>
          </View>
        </View>

        {/* Greedy priority list: the item to use first, then the next, and so on */}
        <SectionPill label="Let's Use this!" />

        {topPriorities.length === 0 ? (
          <View style={emptyCardStyle}>
            <Text style={mealSummaryStyle}>
              Nothing to prioritise yet. Scan some food and the item most in need
              of using will be listed first.
            </Text>
          </View>
        ) : (
          <View style={{ marginBottom: 16 }}>
            {topPriorities.map((item) => (
              <TouchableOpacity
                key={item.id}
                activeOpacity={0.8}
                onPress={() => navigation.navigate("Shelf")}
                style={priorityRowStyle}
              >
                <View style={priorityRankStyle}>
                  <Text style={priorityRankTextStyle}>{item.priorityRank}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={priorityTitleStyle}>{item.title}</Text>
                  <Text style={priorityReasonStyle}>
                    {explainPriority(item).join(" · ")}
                  </Text>
                </View>
                <Text style={priorityScoreStyle}>
                  {Math.round((Number(item.riskScore) || 0) * 100)}%
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* Meal ideas that use up the food closest to spoiling */}
        <SectionPill label="Let's Cook this!" />

        {plan.meals.length === 0 ? (
          <View style={mealCardStyle}>
            <Text style={mealSummaryStyle}>
              {items.length
                ? "Nothing needs using up right now."
                : "Scan some food and you'll get meal ideas that use it before it spoils."}
            </Text>
          </View>
        ) : (
          plan.meals.map((meal) => (
            <TouchableOpacity
              key={meal.recipe.id}
              activeOpacity={0.85}
              onPress={() => navigation.navigate("Recipes")}
              style={mealCardStyle}
            >
              <View style={mealHeaderRowStyle}>
                <Text style={mealNameStyle}>{meal.recipe.name}</Text>
                <Text style={mealMinutesStyle}>{meal.recipe.minutes} min</Text>
              </View>

              <Text style={mealUsesStyle}>
                Main Ingredient: {meal.covers.map((item) => item.title).join(", ")}
              </Text>

              <Text style={mealSummaryStyle}>{meal.recipe.summary}</Text>
            </TouchableOpacity>
          ))
        )}

        <View style={linkRowStyle}>
          <TouchableOpacity
            activeOpacity={0.8}
            onPress={() => navigation.navigate("Recipes")}
            style={linkButtonStyle}
          >
            <Ionicons name="restaurant-outline" size={18} color={BRAND} />
            <Text style={linkTextStyle}>Recipes</Text>
          </TouchableOpacity>
          <TouchableOpacity
            activeOpacity={0.8}
            onPress={() => navigation.navigate("History")}
            style={linkButtonStyle}
          >
            <Ionicons name="time-outline" size={18} color={BRAND} />
            <Text style={linkTextStyle}>History</Text>
          </TouchableOpacity>
        </View>

        {/* Categories */}
        <SectionPill label="Categories" />

        <View style={categoriesGridStyle}>
          {categoryCounts.map((item) => (
            <TouchableOpacity
              key={item.label}
              activeOpacity={0.75}
              onPress={() =>
                navigation.navigate("Shelf", { category: item.label, at: Date.now() })
              }
              style={categoryItemStyle}
            >
              <View style={categoryCardStyle}>
                <View style={categoryIconContainerStyle}>
                  {CATEGORY_ICONS[item.label]?.set === "mci" ? (
                    <MaterialCommunityIcons
                      name={CATEGORY_ICONS[item.label].name}
                      size={23}
                      color={COLORS.white}
                    />
                  ) : (
                    <Ionicons
                      name={CATEGORY_ICONS[item.label]?.name || "nutrition-outline"}
                      size={25}
                      color={COLORS.white}
                    />
                  )}
                </View>

                <View style={categoryInfoStyle}>
                  <Text style={categoryLabelStyle}>
                    {item.label}
                  </Text>

                  <Text style={categoryCountStyle}>
                    {item.count}{" "}
                    {item.count === 1 ? "item" : "items"}
                  </Text>
                </View>
              </View>
            </TouchableOpacity>
          ))}
        </View>
      </ScrollView>
    </AnimatedScreen>
  );
}
