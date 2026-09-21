/**
 * End-to-end scan pipeline: image → OCR → YOLOv8 + CNN → TTI/risk enrichment payload.
 */

import { extractPackagingInfo } from './ocr';
import { runCnnAnalysis } from './cnn';
import { getFoodById, findFoodByName } from '../data/foodCatalog';

export async function analyzeScan({
  imageUri,
  labelText,
  category,
  storageId = 'fridge_top',
  userFlags = [],
  packagingDamaged = false,
  foodNameOverride
} = {}) {
  if (!imageUri) throw new Error('Capture or choose a food photo first.');

  const ocr = await extractPackagingInfo({
    imageUri,
    labelText,
    foodName: foodNameOverride,
    category
  });

  const hint = foodNameOverride || ocr.productHint;
  const daysToExpiry = ocr.expiryDate
    ? (new Date(ocr.expiryDate).getTime() - Date.now()) / 86400000
    : 7;

  const cnn = await runCnnAnalysis({
    imageUri,
    productHint: hint,
    category: category || undefined,
    daysToExpiry,
    userFlags,
    packagingDamaged
  });

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
      modelLabel: cnn.identity.modelLabel,
      detectedBy: cnn.detection.used ? cnn.detection.model : null,
      frozen: false,
      discarded: false
    }
  };
}
