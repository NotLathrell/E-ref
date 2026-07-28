/**
 * End-to-end scan pipeline: image → OCR → CNN → TTI/risk enrichment payload.
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

  const food =
    (foodNameOverride && findFoodByName(foodNameOverride)) ||
    getFoodById(cnn.identity.foodId);

  return {
    ocr,
    cnn,
    draftItem: {
      foodId: food.id,
      title: food.name,
      category: food.category,
      storageId: storageId || food.bestStorageId,
      imageUri: imageUri || null,
      expiryDate: ocr.expiryDate,
      manufacturingDate: ocr.manufacturingDate,
      cnnSpoilageScore: cnn.spoilage.spoilageScore,
      cnnIdentityConfidence: cnn.identity.confidence,
      cnnIndicators: cnn.spoilage.detectedIndicators,
      frozen: false,
      discarded: false
    }
  };
}
