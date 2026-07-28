/**
 * Greedy prioritization: always pick the highest-risk remaining item next.
 * Produces an urgency-ranked list for consume/use-first decisions.
 */

/**
 * @param {Array<object>} items - inventory items with riskScore
 * @param {number} [limit]
 */
export function prioritizeByGreedy(items = [], limit = Infinity) {
  const pool = items
    .filter((item) => !item.discarded)
    .map((item) => ({ ...item }));

  const ranked = [];

  while (pool.length > 0 && ranked.length < limit) {
    let bestIdx = 0;
    for (let i = 1; i < pool.length; i += 1) {
      if (compareUrgency(pool[i], pool[bestIdx]) < 0) {
        bestIdx = i;
      }
    }
    const [next] = pool.splice(bestIdx, 1);
    ranked.push({
      ...next,
      priorityRank: ranked.length + 1
    });
  }

  return ranked;
}

/** Lower sort key = higher urgency */
function compareUrgency(a, b) {
  const riskDiff = (b.riskScore ?? 0) - (a.riskScore ?? 0);
  if (Math.abs(riskDiff) > 0.001) return riskDiff < 0 ? -1 : 1;

  const daysA = a.estimatedDaysLeft ?? 999;
  const daysB = b.estimatedDaysLeft ?? 999;
  if (daysA !== daysB) return daysA - daysB;

  return String(a.title || '').localeCompare(String(b.title || ''));
}

/**
 * Items needing attention in the next N hours (default 72).
 */
export function getSoonToSpoil(items = [], withinDays = 3) {
  return prioritizeByGreedy(items).filter((item) => {
    if (item.frozen) return false;
    const days = item.estimatedDaysLeft;
    return days != null && days <= withinDays;
  });
}
