/**
 * End-to-end scan pipeline: label text → dates, image → YOLOv8 + CNN → TTI/risk enrichment payload.
 */

import { extractPackagingInfo } from './ocr';
import { runCnnAnalysis, combineAngles } from './cnn';
import { getFoodById, findFoodByName } from '../data/foodCatalog';

/**
 * @param {string[]} [extraImageUris] - other angles of the same item (e.g. the back or
 *   underside). A rotten spot missed by the first photo still marks the whole item
 *   unsafe: the least fresh angle sets the verdict. Only the first photo's label text
 *   is read for dates; the rest are freshness-only.
 */
export async function analyzeScan({
  imageUri,
  extraImageUris = [],
  labelText,
  category,
  storageId = 'fridge_top',
  userFlags = [],
  packagingDamaged = false,
  foodNameOverride
} = {}) {
  if (!imageUri) throw new Error('Capture or choose a food photo first.');

  const ocr = await extractPackagingInfo({ imageUri, labelText });

  const hint = foodNameOverride || ocr.productHint;
  const daysToExpiry = ocr.expiryDate
    ? (new Date(ocr.expiryDate).getTime() - Date.now()) / 86400000
    : 7;

  const angleUris = [imageUri, ...extraImageUris.filter(Boolean)];
  const angleResults = await Promise.all(
    angleUris.map((uri) =>
      runCnnAnalysis({
        imageUri: uri,
        productHint: hint,
        category: category || undefined,
        daysToExpiry,
        userFlags,
        packagingDamaged
      })
    )
  );
  const cnn = combineAngles(angleResults);

  // A manual name wins over the model only when it maps to a known food.
  const override = foodNameOverride ? findFoodByName(foodNameOverride) : null;
  const food = override && override.id !== 'unknown' ? override : getFoodById(cnn.identity.foodId);

  return {
    ocr,
    cnn,
    draftItem: {
      foodId: food.id,
      title: food.id === 'unknown' ? cnn.identity.foodName || food.name : food.name,
      category: food.category,
      storageId: storageId || food.bestStorageId,
      imageUri: imageUri || null,
      expiryDate: ocr.expiryDate,
      manufacturingDate: ocr.manufacturingDate,
      cnnSpoilageScore: cnn.spoilage.spoilageScore,
      cnnIdentityConfidence: cnn.identity.confidence,
      cnnIndicators: cnn.spoilage.detectedIndicators,
      // Freshness verdict from the CNN, carried into risk scoring and the shelf.
      modelFreshness: cnn.freshness.verdict,
      modelFreshnessConfidence: cnn.freshness.confidence,
      // The more specific Fresh / Sub Fresh / Rotten reading (0-100%).
      modelFreshnessPercent: cnn.freshness.percent,
      modelFreshnessTier: cnn.freshness.tier,
      modelLabel: cnn.identity.modelLabel,
      detectedBy: cnn.detection.used ? cnn.detection.model : null,
      identityReview: cnn.review.level,
      // Set when the user picks the food themselves; see applyFoodChoice.
      historyNote: describeIdentification(cnn),
      frozen: false,
      discarded: false
    }
  };
}

function describeIdentification(cnn) {
  const name = cnn.identity.foodName || 'an unrecognised food';
  const pct = Math.round((cnn.identity.confidence || 0) * 100);
  const angles =
    cnn.anglesChecked > 1
      ? ` Checked ${cnn.anglesChecked} angles; used the least fresh reading (${Math.round(cnn.freshness.percent)}%).`
      : '';
  return `Identified as ${name} (${pct}% confident, ${cnn.review.level} confidence).${angles}`;
}

/**
 * The foods worth offering when the model is unsure: its runner-up guesses, best first,
 * mapped to catalog foods. Anything the catalog does not know is left out.
 */
export function foodChoicesFromTopK(topK = []) {
  const seen = new Set();
  const choices = [];
  for (const entry of topK) {
    const food = findFoodByName(entry.foodName || '');
    if (food.id === 'unknown' || seen.has(food.id)) continue;
    seen.add(food.id);
    choices.push({ foodId: food.id, name: food.name, confidence: entry.confidence ?? 0 });
  }
  return choices;
}

/** A draft shelf item corrected to a food the user chose, with the correction on record. */
export function applyFoodChoice(draft, foodId, { from } = {}) {
  const food = getFoodById(foodId);
  const note = from && from !== food.name
    ? `You corrected ${from} to ${food.name}`
    : `You confirmed ${food.name}`;
  return {
    ...draft,
    foodId: food.id,
    title: food.name,
    category: food.category,
    identityReview: 'confirmed',
    historyNote: `${draft.historyNote ? `${draft.historyNote}. ` : ''}${note}`
  };
}

/**
 * A draft shelf item for one food found by the detector. The photo has no label of its
 * own, so the item takes the food's own best storage and has no printed date.
 */
export function draftFromObject(object, { imageUri, foodId } = {}) {
  const food = getFoodById(foodId || object.foodId);
  const pct = Math.round((object.confidence || 0) * 100);
  return {
    foodId: food.id,
    title: food.name,
    category: food.category,
    storageId: food.bestStorageId,
    imageUri: imageUri || null,
    expiryDate: null,
    manufacturingDate: null,
    cnnSpoilageScore: object.spoilageScore,
    cnnIdentityConfidence: object.confidence,
    cnnIndicators: [],
    modelFreshness: object.isSpoiled ? 'spoiled' : 'fresh',
    modelFreshnessConfidence: object.freshnessConfidence,
    modelFreshnessPercent: object.freshnessPercent,
    modelFreshnessTier: object.freshnessTier,
    modelLabel: object.foodName,
    detectedBy: 'eref-detector-v1',
    identityReview: foodId && foodId !== object.foodId ? 'confirmed' : object.review.level,
    historyNote:
      foodId && foodId !== object.foodId
        ? `Detected in a photo of several foods; you corrected ${object.foodName || 'an unknown food'} to ${food.name}`
        : `Detected in a photo of several foods; identified as ${object.foodName || 'an unrecognised food'} (${pct}% confident)`,
    frozen: false,
    discarded: false
  };
}
