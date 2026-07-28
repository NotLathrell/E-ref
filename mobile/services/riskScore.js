/**
 * Weighted Risk Scoring for spoilage probability (0–1).
 *
 * risk = wE*expiryUrgency + wT*ttiRisk + wC*cnnSpoilage + wS*storageMismatch
 */

export const RISK_WEIGHTS = {
  expiry: 0.3,
  tti: 0.3,
  cnn: 0.25,
  storage: 0.15
};

/**
 * @param {object} input
 * @param {number|null} input.daysToExpiry
 * @param {number} input.ttiFreshnessRatio - 1 = fresh, 0 = depleted
 * @param {number} input.cnnSpoilageScore - 0–1 (higher = more spoilage)
 * @param {boolean} input.storageMismatch
 * @param {boolean} [input.frozen]
 */
export function computeWeightedRisk({
  daysToExpiry,
  ttiFreshnessRatio,
  cnnSpoilageScore,
  storageMismatch,
  frozen = false
}) {
  const expiryUrgency = scoreExpiryUrgency(daysToExpiry);
  const ttiRisk = 1 - clamp01(ttiFreshnessRatio);
  const cnnRisk = clamp01(cnnSpoilageScore);
  const storageRisk = storageMismatch ? 1 : 0;

  let risk =
    RISK_WEIGHTS.expiry * expiryUrgency +
    RISK_WEIGHTS.tti * ttiRisk +
    RISK_WEIGHTS.cnn * cnnRisk +
    RISK_WEIGHTS.storage * storageRisk;

  if (frozen) {
    risk *= 0.45;
  }

  risk = clamp01(risk);
  const freshnessPercent = Math.round((1 - risk) * 100);

  return {
    riskScore: round3(risk),
    freshnessPercent,
    urgency: urgencyLabel(risk),
    components: {
      expiryUrgency: round3(expiryUrgency),
      ttiRisk: round3(ttiRisk),
      cnnRisk: round3(cnnRisk),
      storageRisk: round3(storageRisk)
    },
    weights: RISK_WEIGHTS
  };
}

function scoreExpiryUrgency(daysToExpiry) {
  if (daysToExpiry == null) return 0.45;
  if (daysToExpiry < 0) return 1;
  if (daysToExpiry <= 1) return 0.95;
  if (daysToExpiry <= 2) return 0.85;
  if (daysToExpiry <= 3) return 0.7;
  if (daysToExpiry <= 7) return 0.4;
  if (daysToExpiry <= 14) return 0.2;
  return 0.05;
}

export function urgencyLabel(risk) {
  if (risk >= 0.75) return 'critical';
  if (risk >= 0.55) return 'high';
  if (risk >= 0.35) return 'moderate';
  return 'low';
}

function clamp01(v) {
  return Math.max(0, Math.min(1, v));
}

function round3(v) {
  return Math.round(v * 1000) / 1000;
}
