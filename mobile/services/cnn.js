/**
 * CNN-style food identification + visible spoilage detection.
 * Returns structured inference matching the study design.
 * On-device/heuristic classifier for Expo demo; swap `infer` with a real model later.
 */

import { FOOD_CATALOG, findFoodByName } from '../data/foodCatalog';
import { API_URL } from '../config';
import * as FileSystem from 'expo-file-system/legacy';

const SPOILAGE_INDICATORS = [
  'discoloration',
  'texture_abnormality',
  'packaging_damage',
  'mold_spots',
  'excess_moisture'
];

/**
 * Identify food item from optional hint + category prior.
 */
export function identifyFood({ productHint, category, imageUri } = {}) {
  let food = productHint ? findFoodByName(productHint) : null;

  if (!food || food.id === 'unknown') {
    if (category) {
      const inCat = FOOD_CATALOG.filter((f) => f.category === category && f.id !== 'unknown');
      food = inCat[Math.floor(Math.random() * inCat.length)] || findFoodByName('unknown');
    } else {
      const usable = FOOD_CATALOG.filter((f) => f.id !== 'unknown');
      food = usable[Math.floor(Math.random() * usable.length)];
    }
  }

  const confidence = productHint ? 0.88 : 0.72;

  return {
    foodId: food.id,
    foodName: food.name,
    category: food.category,
    confidence: round2(confidence),
    imageUri: imageUri || null,
    model: 'eref-cnn-classifier-v1'
  };
}

/**
 * Detect visible spoilage indicators (simulated visual analysis).
 * Higher scores when user flags issues or when item is near expiry.
 */
export function detectSpoilage({
  foodId,
  daysToExpiry = 7,
  userFlags = [],
  packagingDamaged = false
} = {}) {
  const flags = new Set(userFlags);
  if (packagingDamaged) flags.add('packaging_damage');

  // Base spoilage prior rises as expiry approaches
  let score = 0.08;
  if (daysToExpiry < 0) score += 0.55;
  else if (daysToExpiry <= 1) score += 0.35;
  else if (daysToExpiry <= 3) score += 0.2;
  else if (daysToExpiry <= 5) score += 0.1;

  const indicatorScores = {};
  for (const key of SPOILAGE_INDICATORS) {
    const flagged = flags.has(key);
    const base = flagged ? 0.75 + Math.random() * 0.2 : Math.random() * 0.12;
    indicatorScores[key] = round2(base);
    if (flagged) score += 0.12;
  }

  score = Math.max(0, Math.min(1, score + (Math.random() * 0.06 - 0.03)));

  const detected = Object.entries(indicatorScores)
    .filter(([, v]) => v >= 0.5)
    .map(([k]) => k);

  return {
    spoilageScore: round2(score),
    indicators: indicatorScores,
    detectedIndicators: detected,
    status: score >= 0.7 ? 'spoiled_likely' : score >= 0.4 ? 'warning' : 'ok',
    model: 'eref-cnn-spoilage-v1',
    foodId
  };
}

/**
 * Full CNN inference pass used by the scan pipeline.
 */
export async function runCnnAnalysis({
  imageUri,
  productHint,
  category,
  daysToExpiry,
  userFlags,
  packagingDamaged
} = {}) {
  if (!imageUri) throw new Error('An image is required for food detection.');

  const upload = await FileSystem.uploadAsync(`${API_URL}/predict`, imageUri, {
    fieldName: 'image',
    httpMethod: 'POST',
    mimeType: 'image/jpeg',
    uploadType: FileSystem.FileSystemUploadType.MULTIPART,
    headers: { Accept: 'application/json' }
  });

  const payload = JSON.parse(upload.body);
  if (upload.status < 200 || upload.status >= 300) {
    throw new Error(payload.detail || 'Food model request failed.');
  }

  const food = findFoodByName(payload.foodName);
  const identity = {
    foodId: food.id,
    foodName: payload.foodName || food.name,
    category: food.id === 'unknown' ? category || food.category : food.category,
    confidence: payload.confidence || 0,
    imageUri: imageUri || null,
    model: 'foodfresh-model'
  };
  const detectedIndicators = [
    ...(payload.detectedIndicators || []),
    ...userFlags.filter((flag) => !payload.detectedIndicators?.includes(flag))
  ];
  const score = payload.spoilageScore ?? (payload.freshness === 'spoiled' ? 0.85 : 0.12);
  const spoilage = {
    spoilageScore: score,
    indicators: {},
    detectedIndicators,
    status: score >= 0.7 ? 'spoiled_likely' : score >= 0.4 ? 'warning' : 'ok',
    model: 'foodfresh-model',
    foodId: identity.foodId
  };

  return {
    identity,
    spoilage,
    analyzedAt: new Date().toISOString()
  };
}

function round2(v) {
  return Math.round(v * 100) / 100;
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export { SPOILAGE_INDICATORS };
