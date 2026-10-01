/** Scan-result fixtures shared by the tests: what the Camera screen holds after an analysis. */

const { load } = require('../harness');

const TOP_K = [
  { label: 'fresh_tomato', foodName: 'tomato', confidence: 0.55 },
  { label: 'rotten_tomato', foodName: 'tomato', confidence: 0.2 },
  { label: 'fresh_mango', foodName: 'mango', confidence: 0.15 },
];

/** A detected food. `level` is the review level: high, medium or low. */
function detected(id, label, level, { spoiled = false } = {}) {
  const catalog = load('data/foodCatalog.js');
  return {
    id, source: 'detector', box: [10 + id * 120, 30, 110 + id * 120, 210], detectorLabel: label, detectorConfidence: 0.9,
    foodId: catalog.findFoodByName(label).id, foodName: label[0].toUpperCase() + label.slice(1), confidence: 0.9, topK: [],
    isSpoiled: spoiled, freshnessConfidence: 0.95, freshnessPercent: spoiled ? 10 : 95,
    freshnessTier: spoiled ? 'rotten' : 'fresh', freshnessTierLabel: spoiled ? 'Rotten' : 'Fresh',
    spoilageScore: spoiled ? 0.9 : 0.05, agreement: 'agrees',
    review: { level, needsConfirmation: level !== 'high', reasons: level === 'high' ? [] : ['not sure'] },
  };
}

/**
 * The state values that put CameraScreen on its result step.
 * @param {{level?: string, objects?: Array<object>}} options
 */
function scanState({ level = 'high', objects = [] } = {}) {
  const { enrichItem } = load('services/enrich.js');
  const draft = {
    foodId: 'tomato', title: 'Tomato', category: 'Produce', storageId: 'fridge_top', imageUri: 'photo.jpg',
    cnnSpoilageScore: 0.02, modelFreshness: 'fresh', historyNote: 'x',
  };
  const cnn = {
    identity: { foodId: 'tomato', foodName: 'Tomato', confidence: 0.95, topK: TOP_K, model: 'yolov8n-cls', inCatalog: true },
    detection: { used: true, model: 'eref-detector-v1', boxes: [] },
    freshness: {
      verdict: 'fresh', label: 'Fresh', isSpoiled: false, confidence: 0.99, agreement: true,
      percent: 99, tier: 'fresh', tierLabel: 'Fresh',
    },
    spoilage: { spoilageScore: 0.02, detectedIndicators: [], indicators: {}, status: 'ok' },
    review: { level, needsConfirmation: level !== 'high', reasons: level === 'high' ? [] : ['only 55% confident of the food'] },
    objects, imageSize: [800, 600],
  };
  const now = new Date().toISOString();
  return { 0: 'result', 1: 'photo.jpg', 8: { ocr: {}, cnn, draftItem: draft }, 9: enrichItem({ ...draft, scannedAt: now, createdAt: now }) };
}

module.exports = { detected, scanState, TOP_K };
