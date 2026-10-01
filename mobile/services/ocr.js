/**
 * Packaging label OCR.
 *
 * `scanLabelImage` sends a photo of the label to the server, which reads the printed
 * text. `parseLabelText` then pulls the expiry and manufacturing dates out of that
 * text (or out of text the user typed), so scanned and typed labels share one parser.
 *
 * Nothing here invents a date: if the label has none, the fields stay null and the
 * shelf-life estimate falls back to storage conditions alone.
 */

import { uploadImage } from './upload';

const MONTH_NAMES =
  'JAN(?:UARY)?|FEB(?:RUARY)?|MAR(?:CH)?|APR(?:IL)?|MAY|JUNE?|JULY?|AUG(?:UST)?|SEP(?:T(?:EMBER)?)?|OCT(?:OBER)?|NOV(?:EMBER)?|DEC(?:EMBER)?';
const MONTH_NUMBER = { JAN: 1, FEB: 2, MAR: 3, APR: 4, MAY: 5, JUN: 6, JUL: 7, AUG: 8, SEP: 9, OCT: 10, NOV: 11, DEC: 12 };

// OCR reads "0" as "O" and "1" as "I"/"l" often enough that dates need repairing.
const DIGITISH = '[0-9OoIl|]';

const DATE_PATTERNS = [
  // 15 SEP 2026 · 15-SEP-26 · 15SEP2026
  {
    re: new RegExp(`\\b(\\d{1,2})\\s*[-/. ]?\\s*(${MONTH_NAMES})\\.?\\s*[-/.,' ]?\\s*(\\d{4}|\\d{2})\\b`, 'gi'),
    read: (m) => ({ day: +m[1], month: monthNumber(m[2]), year: fullYear(m[3]) })
  },
  // SEP 15, 2026 · SEP 2026 (no day: the last day of the month)
  {
    re: new RegExp(`\\b(${MONTH_NAMES})\\.?\\s*(\\d{1,2})?\\s*[,/-]?\\s*(\\d{4})\\b`, 'gi'),
    read: (m) => ({ day: m[2] ? +m[2] : null, month: monthNumber(m[1]), year: +m[3] })
  },
  // 15/09/2026 · 2026-09-15 · 09.15.26
  {
    re: new RegExp(`\\b(${DIGITISH}{1,4})[/\\-.](${DIGITISH}{1,2})[/\\-.](${DIGITISH}{2,4})\\b`, 'g'),
    read: (m) => readNumeric(fixDigits(m[1]), fixDigits(m[2]), fixDigits(m[3]))
  },
  // 09/2026 (month and year only: the last day of the month)
  {
    re: /\b(\d{1,2})[/\-.](\d{4})\b/g,
    read: (m) => ({ day: null, month: +m[1], year: +m[2] })
  }
];

const EXPIRY_WORDS =
  /(?:EXP(?:IRY|IRES|IRATION)?(?:\s*DATE)?|BEST\s*BEFORE(?:\s*END)?|BB[ED]?|USE\s*BY|CONSUME\s*BY|SELL\s*BY)\b\.?/gi;
const MANUFACTURED_WORDS =
  /(?:MFG|MFD|MANUF(?:ACTURED|ACTURE)?(?:\s*DATE)?|PROD(?:UCTION)?(?:\s*DATE)?|PKD|PACKED(?:\s*ON)?|PACK(?:ING)?\s*DATE|DOM)\b\.?/gi;

/** How far before a date its "EXP" / "MFG" keyword may sit and still label it. */
const KEYWORD_REACH = 26;

const PRODUCT_HINTS = [
  'yogurt', 'milk', 'cheese', 'beef', 'pork', 'chicken', 'meat', 'salmon', 'tuna', 'fish',
  'tomato', 'lettuce', 'banana', 'bread', 'eggs', 'egg', 'apple', 'orange', 'mango',
  'papaya', 'eggplant', 'talong', 'ampalaya', 'bitter gourd', 'okra', 'potato',
  'cucumber', 'capsicum'
];

function monthNumber(name) {
  return MONTH_NUMBER[String(name).slice(0, 3).toUpperCase()] || null;
}

function fullYear(text) {
  const n = parseInt(text, 10);
  return String(text).length === 2 ? 2000 + n : n;
}

function fixDigits(token) {
  return String(token).replace(/[Oo]/g, '0').replace(/[Il|]/g, '1');
}

/**
 * Numeric dates are ambiguous (04/05/2026). A part above 12 settles it; when both
 * parts could be a month, day-first is assumed, which is how most Philippine and
 * international labels are printed. The result screen shows the date in words so a
 * wrong guess is easy to spot.
 */
function readNumeric(a, b, c) {
  const nums = [a, b, c].map((t) => parseInt(t, 10));
  if (nums.some(Number.isNaN)) return null;

  if (String(a).length === 4 || nums[0] > 31) return { year: nums[0], month: nums[1], day: nums[2] };

  const year = fullYear(c);
  if (nums[0] > 12) return { day: nums[0], month: nums[1], year };
  if (nums[1] > 12) return { month: nums[0], day: nums[1], year };
  return { day: nums[0], month: nums[1], year };
}

/** ISO string for the end of the given day, or null if it is not a real date. */
function toIso({ year, month, day } = {}) {
  if (!year || !month || month < 1 || month > 12 || year < 2000 || year > 2100) return null;
  const lastDay = new Date(year, month, 0).getDate();
  const useDay = day == null ? lastDay : day;
  if (useDay < 1 || useDay > lastDay) return null;
  // A printed date covers the whole day, so anchor it to the end of that day —
  // otherwise an item reads as expired from midnight of its own last day.
  return new Date(year, month - 1, useDay, 23, 59, 59).toISOString();
}

function findDates(text) {
  const claimed = [];
  const found = [];

  for (const { re, read } of DATE_PATTERNS) {
    re.lastIndex = 0;
    let match;
    while ((match = re.exec(text)) !== null) {
      const start = match.index;
      const end = start + match[0].length;
      if (claimed.some(([s, e]) => start < e && end > s)) continue;
      // A span is claimed even when it is not a valid date, so a later, looser
      // pattern cannot re-read part of it (31/02/2026 must not become 02/2026).
      claimed.push([start, end]);
      const iso = toIso(read(match) || {});
      if (iso) found.push({ start, end, iso, raw: match[0] });
    }
  }
  return found.sort((x, y) => x.start - y.start);
}

function findKeywords(text) {
  const words = [];
  for (const [kind, re] of [['expiry', EXPIRY_WORDS], ['manufactured', MANUFACTURED_WORDS]]) {
    re.lastIndex = 0;
    let match;
    while ((match = re.exec(text)) !== null) words.push({ kind, end: match.index + match[0].length, used: false });
  }
  return words.sort((x, y) => x.end - y.end);
}

/** Parse label text (scanned or typed) into structured packaging fields. */
export function parseLabelText(rawText = '', { ocrConfidence } = {}) {
  const text = String(rawText || '').trim();
  const dates = findDates(text);
  const keywords = findKeywords(text);

  for (const date of dates) {
    const word = [...keywords]
      .reverse()
      .find((k) => !k.used && k.end <= date.start && date.start - k.end <= KEYWORD_REACH);
    if (word) {
      word.used = true;
      date.kind = word.kind;
    }
  }

  let expiry = dates.find((d) => d.kind === 'expiry') || null;
  let made = dates.find((d) => d.kind === 'manufactured') || null;
  const loose = dates.filter((d) => !d.kind);

  if (!expiry && !made && loose.length >= 2) {
    const byDate = [...loose].sort((x, y) => new Date(x.iso) - new Date(y.iso));
    made = byDate[0];
    expiry = byDate[byDate.length - 1];
  } else {
    if (!expiry && loose.length) expiry = loose.shift();
    if (!made && expiry && loose.length && new Date(loose[0].iso) < new Date(expiry.iso)) made = loose.shift();
  }

  const warnings = [];
  if (expiry && made && new Date(made.iso) > new Date(expiry.iso)) {
    warnings.push('The manufacture date is after the expiry date. Check the label.');
  }

  const productHint = detectProductHint(text);
  const base = expiry ? (expiry.kind === 'expiry' ? 0.9 : 0.65) : text ? 0.3 : 0.1;
  const confidence = ocrConfidence == null ? base : Math.round(base * ocrConfidence * 100) / 100;

  return {
    rawText: text,
    expiryDate: expiry ? expiry.iso : null,
    manufacturingDate: made ? made.iso : null,
    productHint,
    confidence,
    warnings,
    dates: dates.map((d) => ({ raw: d.raw, iso: d.iso, kind: d.kind || null })),
    fieldsFound: {
      expiry: Boolean(expiry),
      manufacturing: Boolean(made),
      product: Boolean(productHint)
    }
  };
}

/** Photograph a label, have the server read it, and parse the dates out of the result. */
export async function scanLabelImage(imageUri) {
  if (!imageUri) throw new Error('Choose a photo of the label first.');

  const payload = await uploadImage('/ocr', imageUri, {
    unreachable: 'Cannot reach the E-REF server to read the label. You can type the dates instead.'
  });
  const lines = payload.lines || [];
  const meanConfidence = lines.length
    ? lines.reduce((sum, line) => sum + (line.confidence || 0), 0) / lines.length
    : null;

  return {
    ...parseLabelText(payload.text || '', { ocrConfidence: meanConfidence }),
    imageUri,
    source: 'ocr',
    ocrMs: payload.ms ?? null
  };
}

/**
 * Packaging info for a scan: the text the user supplied (typed, or filled in by a label
 * scan). With no text there is nothing to read, so no dates are reported.
 */
export async function extractPackagingInfo({ imageUri, labelText } = {}) {
  const text = labelText && labelText.trim() ? labelText : '';
  return {
    ...parseLabelText(text),
    imageUri: imageUri || null,
    source: text ? 'text' : 'none'
  };
}

function detectProductHint(text) {
  const lower = text.toLowerCase();
  return PRODUCT_HINTS.find((k) => lower.includes(k)) || null;
}

/** "15 Sep 2026" — unambiguous, so a misread day/month order is visible at a glance. */
export function formatLabelDate(iso) {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${date.getDate()} ${months[date.getMonth()]} ${date.getFullYear()}`;
}
