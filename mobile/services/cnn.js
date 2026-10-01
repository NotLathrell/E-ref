/**
 * Food identification and freshness analysis.
 *
 * Calls the E-REF inference API, which runs a three-stage pipeline:
 *   1. YOLOv8 detection locates the food and cross-checks the classifier
 *   2. A CNN classifier identifies the food type
 *   3. A CNN classifier decides fresh vs rotten
 *
 * There is deliberately no offline fallback: a guess made without the models
 * would be presented to the user as a measurement.
 */

import { findFoodByName } from '../data/foodCatalog';
import { uploadImage } from './upload';

const SPOILAGE_INDICATORS = [
  'discoloration',
  'texture_abnormality',
  'packaging_damage',
  'mold_spots',
  'excess_moisture'
];

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
    // How far to trust this result: { level: 'high'|'medium'|'low', needsConfirmation, reasons }.
    review: normalizeReview(payload.review, identity),
    // Every food the detector found in the frame, each classified on its own crop.
    objects: normalizeObjects(payload.objects),
    imageSize: Array.isArray(payload.imageSize) ? payload.imageSize : null,
    stages: payload.stages || [],
    inferenceMs: payload.inferenceMs ?? null,
    analyzedAt: new Date().toISOString()
  };
}

/** The server's review block, or one worked out here for a server that predates it. */
export function normalizeReview(review, identity) {
  if (review && typeof review.level === 'string') {
    return {
      level: review.level,
      needsConfirmation: Boolean(review.needsConfirmation),
      reasons: Array.isArray(review.reasons) ? review.reasons : []
    };
  }
  const confidence = identity?.confidence ?? 0;
  const known = identity?.inCatalog;
  const level = !known ? 'low' : confidence >= 0.9 ? 'high' : confidence >= 0.6 ? 'medium' : 'low';
  return {
    level,
    needsConfirmation: level !== 'high',
    reasons: level === 'high' ? [] : [known ? `only ${Math.round(confidence * 100)}% confident of the food` : 'not one of the supported foods']
  };
}

/** Detected foods with the catalog food each one maps to. */
export function normalizeObjects(objects) {
  if (!Array.isArray(objects)) return [];
  return objects.map((object, index) => {
    const food = findFoodByName(object.foodName || '');
    const percent = object.freshnessPercent ?? Math.round((1 - (object.spoilageScore ?? 0)) * 100);
    const tier = object.freshnessTier ?? freshnessTierFromPercent(percent);
    return {
      id: object.id ?? index,
      source: object.source || 'detector',
      box: Array.isArray(object.box) ? object.box : null,
      detectorLabel: object.detectorLabel || null,
      detectorConfidence: object.detectorConfidence ?? null,
      foodId: food.id,
      foodName: object.foodName ? titleCase(object.foodName) : null,
      confidence: object.confidence ?? 0,
      topK: object.topK || [],
      isSpoiled: object.freshness === 'spoiled',
      freshnessConfidence: object.freshnessConfidence ?? 0,
      freshnessPercent: percent,
      freshnessTier: tier,
      freshnessTierLabel: object.freshnessTierLabel ?? TIER_LABELS[tier],
      spoilageScore: object.spoilageScore ?? 0,
      agreement: object.agreement || null,
      review: normalizeReview(object.review, { confidence: object.confidence, inCatalog: food.id !== 'unknown' })
    };
  });
}

/** Extra angle photos allowed per scan, on top of the first one. */
export const MAX_EXTRA_ANGLES = 3;

/**
 * Fold several `runCnnAnalysis` readings of the same food item — different angles,
 * e.g. front and back — into one result.
 *
 * A single bad angle can hide spoilage the others would have caught (a bruise on the
 * far side, mould on the underside), so the *least* fresh angle decides the verdict
 * rather than an average: food safety calls for the worst case, not the typical one.
 * The food's identity comes from whichever angle the model was most sure about, since
 * a blurry or foreshortened angle is more likely to be the wrong photo than the food
 * being two different things.
 */
export function combineAngles(results) {
  if (!Array.isArray(results) || results.length === 0) return null;
  if (results.length === 1) {
    return { ...results[0], angles: [angleSummary(results[0], 0)], anglesChecked: 1 };
  }

  const worst = results.reduce((a, b) => (b.freshness.percent < a.freshness.percent ? b : a));
  const surest = results.reduce((a, b) => (b.identity.confidence > a.identity.confidence ? b : a));
  const disagreesOnFood = results.some(
    (r) => r.identity.foodName && surest.identity.foodName && r.identity.foodName !== surest.identity.foodName
  );
  const spoilageScore = Math.max(...results.map((r) => r.spoilage.spoilageScore));

  const reasons = [...surest.review.reasons];
  if (worst !== surest && worst.freshness.percent < 70) {
    reasons.push(`one angle looked less fresh (${Math.round(worst.freshness.percent)}%) than the rest`);
  }
  if (disagreesOnFood) {
    reasons.push('the angles do not agree on what food this is');
  }
  const needsConfirmation = surest.review.needsConfirmation || reasons.length > surest.review.reasons.length;
  const level = disagreesOnFood && surest.review.level === 'high' ? 'medium' : surest.review.level;

  return {
    ...results[0],
    identity: surest.identity,
    freshness: worst.freshness,
    spoilage: { ...results[0].spoilage, spoilageScore, modelSpoilageScore: round2(spoilageScore) },
    review: { level, needsConfirmation, reasons },
    angles: results.map((r, index) => angleSummary(r, index)),
    anglesChecked: results.length
  };
}

function angleSummary(result, index) {
  return {
    index,
    imageUri: result.identity.imageUri,
    foodName: result.identity.foodName,
    confidence: result.identity.confidence,
    freshnessPercent: result.freshness.percent,
    freshnessTier: result.freshness.tier,
    freshnessTierLabel: result.freshness.tierLabel
  };
}

function uploadForPrediction(imageUri) {
  return uploadImage('/predict', imageUri, {
    unreachable:
      'Cannot reach the model server. Start it with "uvicorn backend.server:app --host 0.0.0.0 --port 8000".'
  });
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
  const probFresh = detail.probFresh ?? 1 - (payload.spoilageScore ?? 0);
  const percent = payload.freshnessPercent ?? detail.freshnessPercent ?? Math.round(probFresh * 100);
  const tier = payload.freshnessTier ?? detail.tier ?? freshnessTierFromPercent(percent);
  const tierLabel = payload.freshnessTierLabel ?? detail.tierLabel ?? TIER_LABELS[tier];

  return {
    verdict: isSpoiled ? 'spoiled' : 'fresh',
    label: isSpoiled ? 'Rotten' : 'Fresh',
    isSpoiled,
    confidence: payload.freshnessConfidence ?? detail.confidence ?? 0,
    probRotten: detail.probRotten ?? payload.spoilageScore ?? 0,
    probFresh,
    // The more specific 0-100% reading: Fresh (70-100%), Sub Fresh (30-69%), Rotten (0-29%).
    percent,
    tier,
    tierLabel,
    model: detail.model || 'cnn-freshness',
    sources: detail.sources || null,
    agreement: detail.agreement ?? null
  };
}

/** Fresh (70-100%), Sub Fresh (30-69%), Rotten (0-29%) — matches the backend's tiers. */
export function freshnessTierFromPercent(percent) {
  if (percent >= 70) return 'fresh';
  if (percent >= 30) return 'subfresh';
  return 'rotten';
}

export const TIER_LABELS = { fresh: 'Fresh', subfresh: 'Sub Fresh', rotten: 'Rotten' };

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
