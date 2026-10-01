import { useMemo, useState } from "react";
import { Alert } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { useInventory } from "../context/InventoryContext";
import { AnimatedScreen } from "../components/animations/AnimatedScreen";
import { Ionicons, ScrollView, Text, TouchableOpacity, View } from "../components/themed";
import { Card, Chip, EmptyState, PillButton, ScreenHeader, SectionTitle } from "../components/screen";
import { getFoodById } from "../data/foodCatalog";
import { RECIPES } from "../data/recipes";
import { recommendForKitchen } from "../services/contentBased";
import { LIGHT_COLORS as C } from "../src/theme/ThemeContext";

const GOOD = "#3F6B43";

/** Every food that appears in a recipe: the foods it makes sense to like or avoid. */
function recipeFoods() {
  return [...new Set(RECIPES.flatMap((recipe) => recipe.ingredients))]
    .filter((id) => id !== "leftovers")
    .map((id) => ({ id, name: getFoodById(id).name }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

const DIETS = [
  { value: "none", label: "Everything" },
  { value: "vegetarian", label: "Vegetarian" },
];

function toggle(list, id) {
  return list.includes(id) ? list.filter((entry) => entry !== id) : [...list, id];
}

function RecipeCard({ entry, open, onOpen, onCooked, onSave, onDismiss, saved }) {
  const { recipe } = entry;
  const usable = entry.uses && entry.uses.length > 0;

  return (
    <Card>
      <TouchableOpacity activeOpacity={0.85} onPress={onOpen} accessibilityRole="button">
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <Text style={{ fontSize: 17, fontWeight: "800", color: C.text, flex: 1, marginRight: 8 }}>{recipe.name}</Text>
          <Text style={{ fontSize: 12, fontWeight: "700", color: C.muted }}>{recipe.minutes} min</Text>
        </View>

        {entry.score !== undefined && usable ? (
          <Text style={{ fontSize: 12, fontWeight: "800", color: C.primary, marginTop: 4 }}>
            Match {Math.round(Math.min(1, entry.score) * 100)}%
          </Text>
        ) : null}

        <View style={{ marginTop: 8 }}>
          {(entry.reasons || []).map((reason) => (
            <Text key={reason} style={{ fontSize: 13, color: C.muted, lineHeight: 19 }}>
              • {reason}
            </Text>
          ))}
        </View>
      </TouchableOpacity>

      {open ? (
        <View style={{ marginTop: 12 }}>
          <Text style={{ fontSize: 13, color: C.text, lineHeight: 19 }}>{recipe.summary}</Text>
          <Text style={{ fontSize: 12, fontWeight: "800", color: C.muted, marginTop: 10, marginBottom: 4 }}>
            INGREDIENTS
          </Text>
          {recipe.ingredients.map((id) => {
            const have = (entry.uses || []).some((item) => item.foodId === id);
            return (
              <Text key={id} style={{ fontSize: 13, color: have ? GOOD : C.muted, lineHeight: 20 }}>
                {have ? "✓" : "•"} {getFoodById(id).name}
                {have ? " (on your shelf)" : ""}
              </Text>
            );
          })}

          <View style={{ flexDirection: "row", marginTop: 14 }}>
            {usable ? (
              <PillButton label="I cooked this" icon="checkmark" onPress={onCooked} style={{ marginRight: 8 }} />
            ) : null}
            <PillButton
              label={saved ? "Saved" : "Save"}
              icon={saved ? "bookmark" : "bookmark-outline"}
              kind="ghost"
              disabled={saved}
              onPress={onSave}
              style={{ marginRight: 8 }}
            />
            <PillButton label="Not for me" kind="ghost" onPress={onDismiss} />
          </View>
        </View>
      ) : null}
    </Card>
  );
}

export function RecipesScreen() {
  const navigation = useNavigation();
  const { items = [], taste, updateTaste, logRecipe, consumeItem, foodsVersion } = useInventory();
  // The recipe dataset can change on the server; foodsVersion is bumped when it does.
  const RECIPE_FOODS = useMemo(recipeFoods, [foodsVersion]);
  const [openId, setOpenId] = useState(null);

  const result = useMemo(() => recommendForKitchen(items, { taste, limit: 6 }), [items, taste]);
  const saved = useMemo(
    () => new Set(taste.log.filter((entry) => entry.action === "saved").map((entry) => entry.recipeId)),
    [taste]
  );

  const open = (id) => {
    setOpenId((current) => (current === id ? null : id));
    // Opening a recipe is a (weak) signal that the user is interested in it.
    if (openId !== id) logRecipe(id, "viewed");
  };

  const cook = (entry) => {
    // One item per ingredient, the one closest to spoiling, is what the dish would use.
    const used = [];
    for (const id of entry.recipe.ingredients) {
      const item = (entry.uses || []).find((candidate) => candidate.foodId === id);
      if (item) used.push(item);
    }
    const names = used.map((item) => item.title).join(", ");

    Alert.alert(`Cook ${entry.recipe.name}?`, `Mark ${names} as used up on your shelf?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Just log it",
        onPress: () => logRecipe(entry.recipe.id, "cooked"),
      },
      {
        text: "Yes, used up",
        onPress: async () => {
          await logRecipe(entry.recipe.id, "cooked");
          for (const item of used) await consumeItem(item.id, `cooked ${entry.recipe.name}`);
        },
      },
    ]);
  };

  return (
    <AnimatedScreen direction="right">
      <ScrollView
        style={{ flex: 1, backgroundColor: C.background }}
        contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 52, paddingBottom: 60 }}
      >
        <ScreenHeader
          title="Recipes"
          subtitle="Ranked by how well each one matches what is on your shelf, how much at-risk food it uses up, and what you like to cook."
          onBack={() => navigation.goBack()}
        />

        <SectionTitle>Recommended for your shelf</SectionTitle>

        {result.status === "ok" ? (
          result.recipes.map((entry) => (
            <RecipeCard
              key={entry.recipe.id}
              entry={entry}
              open={openId === entry.recipe.id}
              saved={saved.has(entry.recipe.id)}
              onOpen={() => open(entry.recipe.id)}
              onCooked={() => cook(entry)}
              onSave={() => logRecipe(entry.recipe.id, "saved")}
              onDismiss={() => logRecipe(entry.recipe.id, "dismissed")}
            />
          ))
        ) : (
          <Card>
            <EmptyState
              icon={result.status === "empty-inventory" ? "cube-outline" : "search-outline"}
              title={result.status === "empty-inventory" ? "Nothing on your shelf" : "No matching recipe"}
              message={result.message}
            />
            {result.status === "empty-inventory" ? (
              <PillButton label="Scan food" icon="camera-outline" onPress={() => navigation.navigate("Camera")} />
            ) : null}
          </Card>
        )}

        {result.ideas.length ? (
          <>
            <SectionTitle>Ideas from your taste</SectionTitle>
            {result.ideas.map((entry) => (
              <RecipeCard
                key={entry.recipe.id}
                entry={entry}
                open={openId === entry.recipe.id}
                saved={saved.has(entry.recipe.id)}
                onOpen={() => open(entry.recipe.id)}
                onSave={() => logRecipe(entry.recipe.id, "saved")}
                onDismiss={() => logRecipe(entry.recipe.id, "dismissed")}
              />
            ))}
          </>
        ) : null}

        <SectionTitle>Your taste</SectionTitle>
        <Card>
          <Text style={{ fontSize: 13, color: C.muted, lineHeight: 19, marginBottom: 12 }}>
            Recipes with a food you avoid, or that break your diet, are never suggested. Foods you like, and recipes
            you cook or save, pull similar recipes up the list.
          </Text>

          <Text style={{ fontSize: 13, fontWeight: "800", color: C.text, marginBottom: 8 }}>Diet</Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
            {DIETS.map((diet) => (
              <Chip
                key={diet.value}
                label={diet.label}
                selected={taste.diet === diet.value}
                onPress={() => updateTaste({ diet: diet.value })}
              />
            ))}
          </View>

          <Text style={{ fontSize: 13, fontWeight: "800", color: C.text, marginTop: 8, marginBottom: 8 }}>
            Foods I like
          </Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
            {RECIPE_FOODS.map((food) => (
              <Chip
                key={food.id}
                label={food.name}
                selected={taste.liked.includes(food.id)}
                onPress={() =>
                  updateTaste({ liked: toggle(taste.liked, food.id), avoided: taste.avoided.filter((id) => id !== food.id) })
                }
              />
            ))}
          </View>

          <Text style={{ fontSize: 13, fontWeight: "800", color: C.text, marginTop: 8, marginBottom: 8 }}>
            Foods to avoid
          </Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
            {RECIPE_FOODS.map((food) => (
              <Chip
                key={food.id}
                label={food.name}
                tone="danger"
                selected={taste.avoided.includes(food.id)}
                onPress={() =>
                  updateTaste({ avoided: toggle(taste.avoided, food.id), liked: taste.liked.filter((id) => id !== food.id) })
                }
              />
            ))}
          </View>

          {taste.log.length ? (
            <PillButton
              label="Forget my cooking history"
              kind="ghost"
              icon="refresh-outline"
              onPress={() => updateTaste({ log: [] })}
              style={{ marginTop: 8 }}
            />
          ) : null}
        </Card>
      </ScrollView>
    </AnimatedScreen>
  );
}
