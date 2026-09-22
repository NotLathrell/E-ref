/**
 * Model evaluation metrics from the inference API.
 *
 * The report is produced by `python backend/benchmark.py`, which runs the
 * trained models over several held-out image sets and computes accuracy,
 * precision, recall and F1 per task.
 */

import { getApiUrl } from './apiConfig';

const REQUEST_TIMEOUT_MS = 15000;

/**
 * Fetch the full evaluation report.
 * @param {object} [options]
 * @param {boolean} [options.includeConfusion] - also return confusion matrices
 */
export async function fetchMetrics({ includeConfusion = false } = {}) {
  const query = includeConfusion ? '?include_confusion=true' : '';
  const report = await getJson(`${getApiUrl()}/metrics${query}`);

  return {
    generatedAt: report.generatedAt || null,
    dataset: report.dataset || {},
    tasks: normalizeTasks(report.tasks),
    // Independent checks beside the headline split, each on images no model trained on.
    benchmarks: (report.benchmarks || []).map((benchmark) => ({
      id: benchmark.id,
      title: benchmark.title || benchmark.id,
      description: benchmark.description || '',
      images: benchmark.dataset?.images ?? 0,
      tasks: normalizeTasks(benchmark.tasks),
      baseline: benchmark.baseline ? normalizeTasks(benchmark.baseline.tasks) : null
    }))
  };
}

function normalizeTasks(tasks) {
  return Object.entries(tasks || {}).map(([key, task]) => normalizeTask(key, task));
}

/** Fetch one task's report, including its confusion matrix. */
export async function fetchTaskMetrics(taskKey) {
  const task = await getJson(`${getApiUrl()}/metrics/${taskKey}`);
  return normalizeTask(taskKey, task);
}

/** Check whether the backend is up and which models loaded. */
export async function fetchHealth() {
  return getJson(`${getApiUrl()}/health`);
}

function normalizeTask(key, task) {
  const macro = task.macro || {};
  const weighted = task.weighted || {};

  return {
    key,
    title: task.title || key,
    description: task.description || '',
    model: task.model || 'unknown',
    samples: task.samples ?? 0,
    correct: task.correct ?? 0,
    accuracy: task.accuracy ?? 0,
    precision: macro.precision ?? 0,
    recall: macro.recall ?? 0,
    f1: macro.f1 ?? 0,
    weighted: {
      precision: weighted.precision ?? 0,
      recall: weighted.recall ?? 0,
      f1: weighted.f1 ?? 0
    },
    binary: task.binary || null,
    perClass: task.perClass || [],
    classNames: task.classNames || [],
    confusionMatrix: task.confusionMatrix || null
  };
}

async function getJson(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  let response;
  try {
    response = await fetch(url, {
      headers: { Accept: 'application/json' },
      signal: controller.signal
    });
  } catch (error) {
    if (error.name === 'AbortError') {
      throw new Error(`The server at ${getApiUrl()} did not respond. Is it running?`);
    }
    throw new Error(`Cannot reach ${getApiUrl()}. Check that the backend is running on your LAN.`);
  } finally {
    clearTimeout(timer);
  }

  const body = await response.text();
  let payload;
  try {
    payload = JSON.parse(body);
  } catch {
    throw new Error(`Unexpected response from the server (HTTP ${response.status}).`);
  }

  if (!response.ok) {
    throw new Error(payload.detail || `Request failed (HTTP ${response.status}).`);
  }
  return payload;
}

/** Format a 0–1 score as a percentage string. */
export function formatPercent(value, digits = 2) {
  if (value == null || Number.isNaN(value)) return '—';
  return `${(value * 100).toFixed(digits)}%`;
}
