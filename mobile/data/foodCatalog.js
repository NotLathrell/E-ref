/** Food knowledge base for CNN labels, TTI params, and content-based recommendations. */

export const STORAGE_LOCATIONS = [
  { id: 'fridge_top', label: 'Drawer - Top Shelf', tempC: 4 },
  { id: 'fridge_bottom', label: 'Coldest Part (Bottom Shelf)', tempC: 2 },
  { id: 'freezer', label: 'Freezer', tempC: -18 },
  { id: 'pantry', label: 'Pantry', tempC: 22 },
  { id: 'counter', label: 'Counter / Room Temp', tempC: 25 }
];

export const FOOD_CATALOG = [
  {
    id: 'yogurt',
    name: 'Yogurt',
    category: 'Dairy',
    keywords: ['yogurt', 'yoghurt', 'dairy'],
    refTempC: 4,
    nominalShelfDays: 14,
    q10: 2.5,
    freezeable: true,
    bestStorageId: 'fridge_bottom',
    usageIdeas: ['Smoothies', 'Parfait with fruit', 'Baking substitute'],
    storageTips: ['Keep sealed', 'Store in coldest fridge zone', 'Do not refreeze after thawing']
  },
  {
    id: 'milk',
    name: 'Milk',
    category: 'Dairy',
    keywords: ['milk', 'fresh milk'],
    refTempC: 4,
    nominalShelfDays: 7,
    q10: 2.8,
    freezeable: true,
    bestStorageId: 'fridge_bottom',
    usageIdeas: ['Cook with sauces', 'Bake', 'Freeze for later cooking'],
    storageTips: ['Keep refrigerated below 4°C', 'Close tightly after opening']
  },
  {
    id: 'cheese',
    name: 'Cheese',
    category: 'Dairy',
    keywords: ['cheese', 'cheddar', 'mozzarella'],
    refTempC: 4,
    nominalShelfDays: 21,
    q10: 2.2,
    freezeable: true,
    bestStorageId: 'fridge_top',
    usageIdeas: ['Grate for pasta', 'Melt in sandwiches', 'Freeze shredded portions'],
    storageTips: ['Wrap tightly', 'Avoid moisture buildup']
  },
  {
    id: 'meat',
    name: 'Meat',
    category: 'Meat',
    keywords: ['meat', 'beef', 'pork', 'chicken', 'poultry'],
    refTempC: 2,
    nominalShelfDays: 3,
    q10: 3.0,
    freezeable: true,
    bestStorageId: 'fridge_bottom',
    usageIdeas: ['Cook thoroughly today', 'Marinate and freeze', 'Make stew or soup'],
    storageTips: ['Store on bottom shelf to avoid drip', 'Freeze if not cooking within 2 days']
  },
  {
    id: 'fish',
    name: 'Fish',
    category: 'Meat',
    keywords: ['fish', 'seafood', 'salmon', 'tuna'],
    refTempC: 0,
    nominalShelfDays: 2,
    q10: 3.2,
    freezeable: true,
    bestStorageId: 'fridge_bottom',
    usageIdeas: ['Grill today', 'Cook and freeze portions', 'Make fish soup'],
    storageTips: ['Use ice packs when possible', 'Freeze promptly if not cooking same day']
  },
  {
    id: 'tomato',
    name: 'Tomato',
    category: 'Produce',
    keywords: ['tomato', 'tomatoes'],
    refTempC: 12,
    nominalShelfDays: 7,
    q10: 2.0,
    freezeable: true,
    bestStorageId: 'counter',
    usageIdeas: ['Salad', 'Sauce', 'Roast and freeze'],
    storageTips: ['Keep ripe tomatoes at cool room temp', 'Refrigerate only when very ripe']
  },
  {
    id: 'lettuce',
    name: 'Lettuce',
    category: 'Produce',
    keywords: ['lettuce', 'salad', 'greens'],
    refTempC: 4,
    nominalShelfDays: 5,
    q10: 2.4,
    freezeable: false,
    bestStorageId: 'fridge_top',
    usageIdeas: ['Salad bowls', 'Wraps', 'Smoothie greens (if still crisp)'],
    storageTips: ['Store dry in breathable bag', 'Remove wilted leaves early']
  },
  {
    id: 'banana',
    name: 'Banana',
    category: 'Produce',
    keywords: ['banana', 'bananas'],
    refTempC: 15,
    nominalShelfDays: 5,
    q10: 2.1,
    freezeable: true,
    bestStorageId: 'counter',
    usageIdeas: ['Banana bread', 'Smoothies', 'Freeze ripe bananas'],
    storageTips: ['Separate from other produce', 'Freeze when spotted']
  },
  {
    id: 'bread',
    name: 'Bread',
    category: 'Pantry',
    keywords: ['bread', 'loaf', 'bakery'],
    refTempC: 20,
    nominalShelfDays: 5,
    q10: 1.8,
    freezeable: true,
    bestStorageId: 'pantry',
    usageIdeas: ['Toast', 'Croutons', 'Freeze sliced portions'],
    storageTips: ['Keep sealed', 'Freeze extras within 2 days']
  },
  {
    id: 'eggs',
    name: 'Eggs',
    category: 'Dairy',
    keywords: ['egg', 'eggs'],
    refTempC: 4,
    nominalShelfDays: 28,
    q10: 2.0,
    freezeable: false,
    bestStorageId: 'fridge_top',
    usageIdeas: ['Omelette', 'Baking', 'Hard-boil for meal prep'],
    storageTips: ['Keep in carton', 'Do not wash before storing']
  },
  {
    id: 'leftovers',
    name: 'Cooked Leftovers',
    category: 'Pantry',
    keywords: ['leftover', 'cooked', 'meal'],
    refTempC: 4,
    nominalShelfDays: 3,
    q10: 2.6,
    freezeable: true,
    bestStorageId: 'fridge_top',
    usageIdeas: ['Reheat thoroughly', 'Repurpose into new meal', 'Freeze single portions'],
    storageTips: ['Cool quickly before refrigerating', 'Reheat to steaming hot']
  },
  {   
    id: 'unknown',
    name: 'Food Item',
    category: 'Pantry',
    keywords: [],
    refTempC: 4,
    nominalShelfDays: 7,
    q10: 2.2,
    freezeable: true,
    bestStorageId: 'fridge_top',
    usageIdeas: ['Inspect before use', 'Cook thoroughly if unsure'],
    storageTips: ['Follow package guidance', 'When in doubt, discard']
  }
];

export const CATEGORIES = ['All', 'Meat', 'Dairy', 'Pantry', 'Produce'];

export function getFoodById(id) {
  return FOOD_CATALOG.find((f) => f.id === id) || FOOD_CATALOG.find((f) => f.id === 'unknown');
}

export function getStorageById(id) {
  return STORAGE_LOCATIONS.find((s) => s.id === id) || STORAGE_LOCATIONS[0];
}

export function findFoodByName(name = '') {
  const q = name.toLowerCase().trim();
  if (!q) return getFoodById('unknown');
  const hit = FOOD_CATALOG.find(
    (f) => f.name.toLowerCase() === q || f.keywords.some((k) => q.includes(k))
  );
  return hit || getFoodById('unknown');
}
