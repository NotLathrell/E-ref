/**
 * Enrich a raw inventory record with TTI, risk, shelf-life, and recommendations.
 */

import { getFoodById, getStorageById } from '../data/foodCatalog';
import { computeTTI, estimateShelfLife } from './tti';
import { computeWeightedRisk } from './riskScore';
import { generateRecommendations } from './recommend';

export function enrichItem(raw, now = new Date()) {
  const food = getFoodById(raw.foodId);
  const storage = getStorageById(raw.storageId);
  const best = getStorageById(food.bestStorageId);
  const storageMismatch = storage.id !== best.id && !(raw.frozen && storage.id === 'freezer');

  const tti = computeTTI({
    nominalShelfDays: food.nominalShelfDays,
    refTempC: food.refTempC,
    storageTempC: storage.tempC,
    q10: food.q10,
    storedSince: raw.scannedAt || raw.createdAt,
    now,
    frozen: Boolean(raw.frozen)
  });

  const shelf = estimateShelfLife({
    expiryDate: raw.expiryDate,
    ttiRemainingDays: tti.remainingLifeDays,
    now
  });

  const risk = computeWeightedRisk({
    daysToExpiry: shelf.daysToPrintedExpiry,
    ttiFreshnessRatio: tti.freshnessRatio,
    cnnSpoilageScore: raw.cnnSpoilageScore ?? 0.1,
    storageMismatch,
    frozen: Boolean(raw.frozen)
  });

  const item = {
    ...raw,
    title: raw.title || food.name,
    category: raw.category || food.category,
    subtitle: storage.label,
    storageLabel: storage.label,
    storageTempC: storage.tempC,
    storageMismatch,
    tti,
    estimatedDaysLeft: shelf.estimatedDaysLeft,
    daysToPrintedExpiry: shelf.daysToPrintedExpiry,
    freezeByDate: raw.frozen ? null : shelf.freezeByDate,
    riskScore: risk.riskScore,
    freshnessPercent: risk.freshnessPercent,
    urgency: risk.urgency,
    riskComponents: risk.components,
    daysLabel: formatDaysLabel(shelf.estimatedDaysLeft),
    freshnessLabel: `Freshness ${risk.freshnessPercent}%`,
    // The CNN's own fresh/rotten call, kept separate from the computed score.
    modelFreshness: raw.modelFreshness || null,
    modelFreshnessLabel: raw.modelFreshness
      ? raw.modelFreshness === 'spoiled'
        ? 'Rotten'
        : 'Fresh'
      : null,
    modelFreshnessConfidence: raw.modelFreshnessConfidence ?? null,
    scannedLabel: formatScannedLabel(raw.scannedAt || raw.createdAt, now)
  };

  item.recommendations = generateRecommendations(item);
  return item;
}

export function enrichAll(items = [], now = new Date()) {
  return items.map((item) => enrichItem(item, now));
}

function formatDaysLabel(days) {
  if (days == null) return 'Unknown';
  if (days < 0) return 'Expired';
  if (days < 1) return 'Less than 1 day left';
  if (days < 1.5) return '1 day left';
  return `${Math.ceil(days)} days left`;
}

function formatScannedLabel(iso, now) {
  if (!iso) return 'Just scanned';
  const days = Math.floor((now.getTime() - new Date(iso).getTime()) / (1000 * 60 * 60 * 24));
  if (days <= 0) return 'Scanned today';
  if (days === 1) return 'Scanned 1 day ago';
  return `Scanned ${days} days ago`;
}
