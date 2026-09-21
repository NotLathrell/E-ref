/**
 * OCR pipeline for packaging labels.
 * Extracts expiration / manufacturing dates and product name hints from label text.
 * In production this would call a cloud/on-device OCR engine; here we provide
 * parsing utilities used after capture (and demo label text when none is supplied).
 */

const DATE_PATTERNS = [
  /\b(?:EXP|EXPIRY|EXPIRES|BEST\s*BEFORE|USE\s*BY|BBE)[:\s-]*([0-9]{1,2}[\/\-.][0-9]{1,2}[\/\-.][0-9]{2,4})\b/i,
  /\b(?:MFG|MFD|PACKED|PACK\s*DATE|MANUFACTURED)[:\s-]*([0-9]{1,2}[\/\-.][0-9]{1,2}[\/\-.][0-9]{2,4})\b/i,
  /\b([0-9]{4}[\/\-.][0-9]{1,2}[\/\-.][0-9]{1,2})\b/,
  /\b([0-9]{1,2}[\/\-.][0-9]{1,2}[\/\-.][0-9]{2,4})\b/
];

const PRODUCT_HINTS = [
  'yogurt',
  'milk',
  'cheese',
  'meat',
  'beef',
  'chicken',
  'pork',
  'fish',
  'salmon',
  'tomato',
  'lettuce',
  'banana',
  'bread',
  'egg',
  'eggs'
];

/**
 * Parse raw OCR text into structured packaging fields.
 */
export function parseLabelText(rawText = '') {
  const text = String(rawText || '').trim();
  const expiryMatch = text.match(DATE_PATTERNS[0]) || text.match(DATE_PATTERNS[2]) || text.match(DATE_PATTERNS[3]);
  const mfgMatch = text.match(DATE_PATTERNS[1]);

  const expiryDate = expiryMatch ? normalizeDate(expiryMatch[1]) : null;
  const manufacturingDate = mfgMatch ? normalizeDate(mfgMatch[1]) : null;
  const productHint = detectProductHint(text);

  return {
    rawText: text,
    expiryDate,
    manufacturingDate,
    productHint,
    confidence: text.length > 12 ? 0.82 : text.length > 0 ? 0.55 : 0.2,
    fieldsFound: {
      expiry: Boolean(expiryDate),
      manufacturing: Boolean(manufacturingDate),
      product: Boolean(productHint)
    }
  };
}

/**
 * Simulate OCR extraction after an image capture for demo / offline use.
 * Uses food catalog context when available so scans feel realistic.
 */
export function simulateOcrFromCapture({ foodName, category, capturedAt = new Date() } = {}) {
  const base = new Date(capturedAt);
  const daysAhead = category === 'Meat' ? 3 : category === 'Produce' ? 6 : category === 'Dairy' ? 10 : 14;
  const expiry = addDays(base, daysAhead + Math.floor(Math.random() * 4));
  const mfg = addDays(base, -Math.floor(Math.random() * 5) - 1);

  const label = [
    `PRODUCT: ${(foodName || 'FOOD ITEM').toUpperCase()}`,
    `MFG: ${formatSlash(mfg)}`,
    `EXP: ${formatSlash(expiry)}`,
    'KEEP REFRIGERATED'
  ].join('\n');

  return parseLabelText(label);
}

/**
 * Run OCR step: prefer real text if provided, otherwise simulate from context.
 */
export async function extractPackagingInfo({ imageUri, labelText, foodName, category } = {}) {
  await delay(600);

  if (labelText && labelText.trim()) {
    return {
      ...parseLabelText(labelText),
      imageUri: imageUri || null,
      source: 'text'
    };
  }

  const simulated = simulateOcrFromCapture({ foodName, category });
  return {
    ...simulated,
    imageUri: imageUri || null,
    source: 'simulated_ocr'
  };
}

function detectProductHint(text) {
  const lower = text.toLowerCase();
  return PRODUCT_HINTS.find((k) => lower.includes(k)) || null;
}

function normalizeDate(token) {
  if (!token) return null;
  const clean = token.replace(/\./g, '/').replace(/-/g, '/');
  const parts = clean.split('/').map((p) => parseInt(p, 10));
  if (parts.some((n) => Number.isNaN(n))) return null;

  let year;
  let month;
  let day;

  if (parts[0] > 31) {
    [year, month, day] = parts;
  } else if (parts[2] > 31 || String(parts[2]).length === 4) {
    [month, day, year] = parts;
    if (year < 100) year += 2000;
  } else {
    [day, month, year] = parts;
    if (year < 100) year += 2000;
  }

  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  // A printed date covers the whole day, so anchor it to the end of that day —
  // otherwise an item reads as expired from midnight of its own last day.
  const d = new Date(year, month - 1, day, 23, 59, 59);
  if (Number.isNaN(d.getTime())) return null;
  if (d.getMonth() !== month - 1 || d.getDate() !== day) return null; // rejects 31 Feb
  return d.toISOString();
}

function formatSlash(date) {
  const d = new Date(date);
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const yyyy = d.getFullYear();
  return `${mm}/${dd}/${yyyy}`;
}

function addDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
