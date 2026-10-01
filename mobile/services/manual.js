/**
 * Adding food by hand, and editing an item's date, for when there is no photo or the
 * label was misread. The date parser is the same one that reads labels, so it accepts
 * the same formats (15/09/2026, 2026-09-15, 15 Sep 2026, Sep 15 2026 ...).
 */

import { getFoodById } from '../data/foodCatalog';
import { parseLabelText } from './ocr';

/** An ISO date for whatever the user typed, or null if it is empty or not a date. */
export function parseTypedDate(text) {
  const value = String(text || '').trim();
  if (!value) return null;
  return parseLabelText(`EXP ${value}`).expiryDate;
}

/**
 * A shelf item for a food the user added by hand.
 * @returns {{draft: object}|{error: string}}
 */
export function draftFromManual({ foodId, storageId, expiryText } = {}) {
  if (!foodId || foodId === 'unknown') return { error: 'Choose what the food is.' };

  const food = getFoodById(foodId);
  let expiryDate = null;
  if (String(expiryText || '').trim()) {
    expiryDate = parseTypedDate(expiryText);
    if (!expiryDate) return { error: 'That date was not understood. Try 15/09/2026 or 15 Sep 2026.' };
  }

  return {
    draft: {
      foodId: food.id,
      title: food.name,
      category: food.category,
      storageId: storageId || food.bestStorageId,
      imageUri: null,
      expiryDate,
      manufacturingDate: null,
      // No photo, so no model reading: the shelf-life estimate rests on the date and storage alone.
      cnnSpoilageScore: null,
      modelFreshness: null,
      modelFreshnessConfidence: null,
      modelFreshnessPercent: null,
      modelFreshnessTier: null,
      historyNote: 'Added by hand (no photo)',
      frozen: false,
      discarded: false
    }
  };
}
