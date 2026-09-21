/**
 * Food identification and freshness analysis.
 *
 * Calls the E-REF inference API, which runs a three-stage pipeline:
 *   1. YOLOv8 detection locates the food and crops the frame
 *   2. A CNN classifier identifies the food type
 *   3. A CNN classifier decides fresh vs rotten
 *
 * `identifyFood` and `detectSpoilage` remain available as offline heuristics
 * for demos or when the server is unreachable.
 */

import { FOOD_CATALOG, findFoodByName } from '../data/foodCatalog';
import { getApiUrl } from './apiConfig';
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
 * Offline fallback — the server pipeline is preferred.
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
    model: 'eref-heuristic-fallback'
  };
}

/**
 * Detect visible spoilage indicators without a server.
 * Higher scores when the user flags issues or the item is near expiry.
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
    model: 'eref-heuristic-fallback',
    foodId
  };
}

/**
 * Full inference pass used by the scan pipeline.
 * Uploads the image to the API and normalizes the response for the UI.
 */
export async function runCnnAnalysis({
  imageUri,
  productHint,
  category,
  daysToExpiry,
  userFlags = [],
  packagingDamaged = false
} = {}) {
  if (!imageUri) throw new Error('An image is required for food detection.');

  const payload = await uploadForPrediction(imageUri);

  // Prefer the model's own name; fall back to an OCR hint, then the catalog.
  const resolvedName = payload.foodIdentityAvailable ? payload.foodName : productHint || payload.foodName;
  const food = findFoodByName(resolvedName || '');

  const identity = {
    foodId: food.id,
    foodName: titleCase(resolvedName) || food.name,
    category: food.id === 'unknown' ? category || food.category : food.category,
    confidence: payload.confidence ?? 0,
    imageUri,
    model: payload.identity?.model || 'yolov8n-cls',
    modelLabel: payload.modelLabel || null,
    topK: payload.identity?.topK || [],
    inCatalog: food.id !== 'unknown'
  };

  const detection = normalizeDetection(payload.detection, payload.boxes);
  const freshness = normalizeFreshness(payload);

  // The model's indicators plus anything the user flagged by hand.
  const modelIndicators = payload.detectedIndicators || [];
  const flags = packagingDamaged
    ? [...new Set([...userFlags, 'packaging_damage'])]
    : userFlags;
  const detectedIndicators = [
    ...modelIndicators,
    ...flags.filter((flag) => !modelIndicators.includes(flag))
  ];

  // User-flagged damage raises the score the model reported on its own.
  const baseScore = payload.spoilageScore ?? (freshness.isSpoiled ? 0.85 : 0.12);
  const flagBoost = Math.min(0.3, flags.length * 0.1);
  const spoilageScore = round2(Math.min(1, baseScore + flagBoost));

  const spoilage = {
    spoilageScore,
    modelSpoilageScore: round2(baseScore),
    indicators: payload.indicatorScores || {},
    detectedIndicators,
    userFlags: flags,
    status: spoilageScore >= 0.7 ? 'spoiled_likely' : spoilageScore >= 0.4 ? 'warning' : 'ok',
    model: freshness.model,
    foodId: identity.foodId
  };

  return {
    identity,
    detection,
    freshness,
    spoilage,
    stages: payload.stages || [],
    inferenceMs: payload.inferenceMs ?? null,
    analyzedAt: new Date().toISOString()
  };
}

async function uploadForPrediction(imageUri) {
  let upload;
  try {
    upload = await FileSystem.uploadAsync(`${getApiUrl()}/predict`, imageUri, {
      fieldName: 'image',
      httpMethod: 'POST',
      mimeType: 'image/jpeg',
      uploadType: FileSystem.FileSystemUploadType.MULTIPART,
      headers: { Accept: 'application/json' }
    });
  } catch {
    throw new Error(
      `Cannot reach the model server at ${getApiUrl()}. Start it with "uvicorn backend.server:app --host 0.0.0.0 --port 8000".`
    );
  }

  let payload;
  try {
    payload = JSON.parse(upload.body);
  } catch {
    throw new Error(`Unexpected response from the model server (HTTP ${upload.status}).`);
  }

  if (upload.status < 200 || upload.status >= 300) {
    throw new Error(payload.detail || 'Food model request failed.');
  }
  return payload;
}

function normalizeDetection(detection, boxes = []) {
  if (!detection) {
    return { used: false, model: 'yolov8', label: null, confidence: 0, boxes: boxes || [], reason: null };
  }
  return {
    used: Boolean(detection.used),
    model: detection.model || 'yolov8',
    label: detection.label || null,
    confidence: detection.confidence ?? 0,
    box: detection.box || null,
    // 'agrees' | 'differs' | 'outside_vocabulary' | null — see backend _cross_check
    agreement: detection.agreement || null,
    count: detection.count ?? (boxes ? boxes.length : 0),
    reason: detection.reason || null,
    boxes: boxes || []
  };
}

function normalizeFreshness(payload) {
  const detail = payload.freshnessDetail || {};
  const isSpoiled = (payload.freshness || detail.freshness) === 'spoiled';

  return {
    verdict: isSpoiled ? 'spoiled' : 'fresh',
    label: isSpoiled ? 'Rotten' : 'Fresh',
    isSpoiled,
    confidence: payload.freshnessConfidence ?? detail.confidence ?? 0,
    probRotten: detail.probRotten ?? payload.spoilageScore ?? 0,
    probFresh: detail.probFresh ?? 1 - (payload.spoilageScore ?? 0),
    model: detail.model || 'cnn-freshness',
    sources: detail.sources || null,
    agreement: detail.agreement ?? null
  };
}

function titleCase(value) {
  if (!value) return null;
  return String(value)
    .split(' ')
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

function round2(v) {
  return Math.round(v * 100) / 100;
}

export { SPOILAGE_INDICATORS };
