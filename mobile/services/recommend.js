/**
 * Hybrid recommendation engine:
 * - Rule-based: predefined actions from risk / spoilage / freezeability
 * - Content-based: usage & storage tips from food catalog attributes
 */

import { getFoodById, getStorageById } from '../data/foodCatalog';

const ACTIONS = {
  discard: { id: 'discard', label: 'Discard', description: 'Unsafe or spoiled — dispose safely.' },
  inspect: { id: 'inspect', label: 'Inspect', description: 'Check smell, color, and texture before use.' },
  consume: { id: 'consume', label: 'Consume Soon', description: 'Use or cook this item as soon as possible.' },
  cook: { id: 'cook', label: 'Cook', description: 'Cook thoroughly to extend usable life.' },
  refrigerate: { id: 'refrigerate', label: 'Refrigerate', description: 'Move to proper cold storage now.' },
  freeze: { id: 'freeze', label: 'Freeze', description: 'Freeze to pause spoilage countdown.' },
  store: { id: 'store', label: 'Store Properly', description: 'Adjust storage location for best shelf life.' }
};

/**
 * @param {object} item - enriched inventory item
 */
export function generateRecommendations(item) {
  const food = getFoodById(item.foodId);
  const bestStorage = getStorageById(food.bestStorageId);
  const ruleBased = buildRuleBasedActions(item, food);
  const contentBased = buildContentBased(item, food, bestStorage);

  return {
    primaryAction: ruleBased[0] || ACTIONS.inspect,
    ruleBased,
    contentBased,
    bestPractice: {
      title: 'Best Practice',
      storage: `Best storage: ${bestStorage.label}`,
      storageId: bestStorage.id,
      storageLabel: bestStorage.label,
      storageTempC: bestStorage.tempC,
      freezeable: food.freezeable,
      freezeBy: item.freezeByDate
        ? `Freeze by: ${formatDate(item.freezeByDate)}`
        : food.freezeable
          ? 'Freeze soon if not using within 2 days'
          : 'Not recommended for freezing',
      summary: `${bestStorage.label}. ${food.storageTips[0] || ''}`
    }
  };
}

function buildRuleBasedActions(item, food) {
  const actions = [];
  const risk = item.riskScore ?? 0;
  const cnn = item.cnnSpoilageScore ?? 0;
  const days = item.estimatedDaysLeft ?? 99;

  if (cnn >= 0.75 || risk >= 0.85 || days < 0) {
    actions.push(ACTIONS.discard);
    actions.push(ACTIONS.inspect);
    return uniqueActions(actions);
  }

  if (cnn >= 0.45 || risk >= 0.7) {
    actions.push(ACTIONS.inspect);
    actions.push(ACTIONS.cook);
  }

  if (days <= 2 || risk >= 0.55) {
    actions.push(ACTIONS.consume);
    if (food.freezeable && !item.frozen) actions.push(ACTIONS.freeze);
    actions.push(ACTIONS.cook);
  } else if (days <= 5 || risk >= 0.35) {
    if (food.freezeable && !item.frozen) actions.push(ACTIONS.freeze);
    actions.push(ACTIONS.consume);
    actions.push(ACTIONS.store);
  } else {
    actions.push(ACTIONS.store);
    if (item.storageMismatch) actions.push(ACTIONS.refrigerate);
  }

  if (item.storageMismatch && !actions.find((a) => a.id === 'refrigerate')) {
    actions.unshift(ACTIONS.refrigerate);
  }

  if (item.frozen) {
    return uniqueActions([
      { id: 'keep_frozen', label: 'Keep Frozen', description: 'Countdown paused while frozen.' },
      ACTIONS.cook
    ]);
  }

  return uniqueActions(actions).slice(0, 4);
}

function buildContentBased(item, food, bestStorage) {
  return {
    foodName: food.name,
    category: food.category,
    usageSuggestions: food.usageIdeas.slice(0, 3),
    storageSuggestions: [
      `Preferred location: ${bestStorage.label} (~${bestStorage.tempC}°C)`,
      ...food.storageTips
    ],
    preservationSuggestions: food.freezeable
      ? [
          'Portion before freezing for easier thawing',
          'Label with freeze date',
          item.frozen ? 'Thaw in fridge, not on counter' : 'Freeze before quality drops further'
        ]
      : ['Do not freeze — quality will degrade', 'Use refrigeration and early consumption instead']
  };
}

function uniqueActions(list) {
  const seen = new Set();
  return list.filter((a) => {
    if (seen.has(a.id)) return false;
    seen.add(a.id);
    return true;
  });
}

function formatDate(iso) {
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      month: 'long',
      day: 'numeric',
      year: 'numeric'
    });
  } catch {
    return iso;
  }
}

export { ACTIONS };
