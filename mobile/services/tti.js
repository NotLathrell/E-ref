/**
 * Time-Temperature Integration (TTI)
 * Estimates remaining shelf life from storage temperature vs reference temp.
 *
 * deterioration factor ≈ Q10 ^ ((T - Tref) / 10)
 * remainingLifeDays = nominalShelfDays * exp(-accumulatedDeterioration)
 */

function daysBetween(from, to) {
  const ms = to.getTime() - from.getTime();
  return Math.max(0, ms / (1000 * 60 * 60 * 24));
}

/**
 * @param {object} params
 * @param {number} params.nominalShelfDays - expected shelf life at ref temp
 * @param {number} params.refTempC
 * @param {number} params.storageTempC
 * @param {number} params.q10
 * @param {Date|string} params.storedSince
 * @param {Date|string} [params.now]
 * @param {boolean} [params.frozen] - freezing pauses TTI countdown
 */
export function computeTTI({
  nominalShelfDays,
  refTempC,
  storageTempC,
  q10 = 2.2,
  storedSince,
  now = new Date(),
  frozen = false
}) {
  const start = new Date(storedSince);
  const end = new Date(now);
  const elapsedDays = daysBetween(start, end);

  if (frozen) {
    const remainingAtFreeze = Math.max(0, nominalShelfDays - elapsedDays * 0.05);
    return {
      elapsedDays: round2(elapsedDays),
      deteriorationRate: 0.05,
      accumulatedDeterioration: round2(elapsedDays * 0.05),
      remainingLifeDays: round2(remainingAtFreeze),
      freshnessRatio: clamp01(remainingAtFreeze / Math.max(nominalShelfDays, 0.01)),
      frozen: true
    };
  }

  const deltaT = storageTempC - refTempC;
  const deteriorationRate = Math.pow(q10, deltaT / 10);
  const accumulatedDeterioration = elapsedDays * deteriorationRate;
  const remainingLifeDays = Math.max(0, nominalShelfDays - accumulatedDeterioration);
  const freshnessRatio = clamp01(remainingLifeDays / Math.max(nominalShelfDays, 0.01));

  return {
    elapsedDays: round2(elapsedDays),
    deteriorationRate: round2(deteriorationRate),
    accumulatedDeterioration: round2(accumulatedDeterioration),
    remainingLifeDays: round2(remainingLifeDays),
    freshnessRatio: round2(freshnessRatio),
    frozen: false
  };
}

/**
 * Estimate days until spoilage combining printed expiry and TTI remaining life.
 */
export function estimateShelfLife({ expiryDate, ttiRemainingDays, now = new Date() }) {
  const expiry = expiryDate ? new Date(expiryDate) : null;
  const daysToExpiry = expiry ? daysBetween(now, expiry) * (expiry >= now ? 1 : -1) : null;

  let estimatedDaysLeft;
  if (daysToExpiry == null) {
    estimatedDaysLeft = ttiRemainingDays;
  } else if (daysToExpiry < 0) {
    estimatedDaysLeft = Math.min(0, ttiRemainingDays);
  } else {
    estimatedDaysLeft = Math.min(daysToExpiry, ttiRemainingDays);
  }

  return {
    daysToPrintedExpiry: daysToExpiry == null ? null : round2(daysToExpiry),
    estimatedDaysLeft: round2(estimatedDaysLeft),
    freezeByDate: addDays(now, Math.max(0, Math.min(estimatedDaysLeft - 1, 3)))
  };
}

function addDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + Math.ceil(days));
  return d.toISOString();
}

function clamp01(v) {
  return Math.max(0, Math.min(1, v));
}

function round2(v) {
  return Math.round(v * 100) / 100;
}
