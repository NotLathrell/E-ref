/**
 * Taste preferences (diet, liked and avoided foods), shown in Profile.
 *
 * Collapsed to a summary of just what is selected until the user taps Edit, so the
 * profile card stays short for someone with no preferences set and only grows to show
 * the full picker while they are actively changing something.
 */

import { useMemo, useState } from 'react';
import { Text, TouchableOpacity, View } from './themed';
import { Chip, PillButton } from './screen';
import { getFoodById } from '../data/foodCatalog';
import { RECIPES } from '../data/recipes';
import { DEFAULT_TASTE } from '../services/contentBased';
import { LIGHT_COLORS as C } from '../src/theme/ThemeContext';

const DIETS = [
  { value: 'none', label: 'Everything' },
  { value: 'vegetarian', label: 'Vegetarian' }
];

/** Every food that appears in a recipe: the foods it makes sense to like or avoid. */
function recipeFoods() {
  return [...new Set(RECIPES.flatMap((recipe) => recipe.ingredients))]
    .filter((id) => id !== 'leftovers')
    .map((id) => ({ id, name: getFoodById(id).name }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

function toggle(list, id) {
  return list.includes(id) ? list.filter((entry) => entry !== id) : [...list, id];
}

const labelStyle = { fontSize: 12, fontWeight: '800', color: C.text, marginBottom: 6 };
const rowStyle = { flexDirection: 'row', flexWrap: 'wrap' };

export function TasteBox({ taste = DEFAULT_TASTE, updateTaste, foodsVersion }) {
  const [editing, setEditing] = useState(false);
  const RECIPE_FOODS = useMemo(recipeFoods, [foodsVersion]);

  const dietLabel = DIETS.find((d) => d.value === taste.diet)?.label;
  const likedFoods = taste.liked.map((id) => getFoodById(id).name);
  const avoidedFoods = taste.avoided.map((id) => getFoodById(id).name);
  const hasPreferences = taste.diet !== 'none' || taste.liked.length > 0 || taste.avoided.length > 0;

  return (
    <View style={{ width: '100%', marginTop: 16 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <Text style={{ fontSize: 13, fontWeight: '800', color: C.text }}>Your Taste</Text>
        <TouchableOpacity
          activeOpacity={0.7}
          onPress={() => setEditing((open) => !open)}
          accessibilityLabel={editing ? 'Done editing your taste' : 'Edit your taste preferences'}
        >
          <Text style={{ fontSize: 12, fontWeight: '800', color: C.primary }}>{editing ? 'Done' : 'Edit'}</Text>
        </TouchableOpacity>
      </View>

      {editing ? (
        <>
          <Text style={{ fontSize: 12, color: C.muted, lineHeight: 17, marginBottom: 10 }}>
            Recipes with a food you avoid, or that break your diet, are never suggested.
          </Text>

          <Text style={labelStyle}>Diet</Text>
          <View style={rowStyle}>
            {DIETS.map((diet) => (
              <Chip
                key={diet.value}
                label={diet.label}
                selected={taste.diet === diet.value}
                onPress={() => updateTaste({ diet: diet.value })}
              />
            ))}
          </View>

          <Text style={[labelStyle, { marginTop: 10 }]}>Foods I like</Text>
          <View style={rowStyle}>
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

          <Text style={[labelStyle, { marginTop: 10 }]}>Foods to avoid</Text>
          <View style={rowStyle}>
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
              style={{ marginTop: 10 }}
            />
          ) : null}
        </>
      ) : hasPreferences ? (
        <View style={rowStyle}>
          {taste.diet !== 'none' ? <Chip label={dietLabel} selected /> : null}
          {likedFoods.map((name) => (
            <Chip key={`liked-${name}`} label={name} selected />
          ))}
          {avoidedFoods.map((name) => (
            <Chip key={`avoided-${name}`} label={name} tone="danger" selected />
          ))}
        </View>
      ) : (
        <Text style={{ fontSize: 12, color: C.muted }}>
          No preferences set. Tap Edit to pick a diet, and foods you like or avoid.
        </Text>
      )}
    </View>
  );
}
