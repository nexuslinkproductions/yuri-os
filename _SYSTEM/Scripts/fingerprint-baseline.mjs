#!/usr/bin/env node
/**
 * fingerprint-baseline.mjs — Compute behavioral fingerprint drift
 *
 * Reads the current fingerprint at .claude/yuri-sentinel/self-model/fingerprint.json
 * (written by self-model.mjs), appends it to a rolling history at
 * .claude/yuri-sentinel/self-model/history.jsonl, then computes per-dimension
 * baseline-vs-current delta.
 *
 * Baseline window: first 5 entries in history (or first session if fewer)
 * Current window:  last 3 entries in history
 *
 * Per dimension (drives.curiosity, drives.improvement, drives.accuracy):
 *   - baseline = mean of baseline_window
 *   - current  = mean of current_window
 *   - delta_abs = current - baseline
 *   - delta_pct = (delta_abs / baseline) * 100  (or null if baseline=0)
 *   - trend    = "improving" if delta_abs > 0.05, "regressing" if < -0.05, else "stable"
 *
 * Output: .claude/state/fingerprint-delta.json
 *   {
 *     as_of: <ISO>,
 *     sessions_total: <n>,
 *     baseline_window: "sessions 1-5",
 *     current_window: "sessions N-2..N",
 *     dimensions: [
 *       { name, baseline, current, delta_abs, delta_pct, trend },
 *       ...
 *     ],
 *     calibration_trend: <string>,
 *     confidence_bias: <string>,
 *     overall_drift_magnitude: <0..1>,  // RMS of absolute deltas across dimensions
 *     interpretation: <string>
 *   }
 *
 * Idempotent. Safe to run repeatedly. The history is capped at 200 entries.
 *
 * CLI:
 *   node _SYSTEM/Scripts/fingerprint-baseline.mjs
 *   node _SYSTEM/Scripts/fingerprint-baseline.mjs --print
 *   node _SYSTEM/Scripts/fingerprint-baseline.mjs --status   (read-only — no append)
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');
const FINGERPRINT_PATH = path.join(REPO_ROOT, '.claude', 'yuri-sentinel', 'self-model', 'fingerprint.json');
const HISTORY_PATH     = path.join(REPO_ROOT, '.claude', 'yuri-sentinel', 'self-model', 'history.jsonl');
const STATE_DIR        = path.join(REPO_ROOT, '.claude', 'state');
const OUTPUT_PATH      = path.join(STATE_DIR, 'fingerprint-delta.json');
const HISTORY_CAP      = 200;
const BASELINE_WINDOW  = 5;
const CURRENT_WINDOW   = 3;

function readFingerprint() {
  if (!fs.existsSync(FINGERPRINT_PATH)) return null;
  try { return JSON.parse(fs.readFileSync(FINGERPRINT_PATH, 'utf8')); }
  catch { return null; }
}

function readHistory() {
  if (!fs.existsSync(HISTORY_PATH)) return [];
  const lines = fs.readFileSync(HISTORY_PATH, 'utf8').split('\n').filter(Boolean);
  const records = [];
  for (const line of lines) {
    try { records.push(JSON.parse(line)); } catch { /* skip */ }
  }
  return records;
}

function appendHistory(fingerprint) {
  fs.mkdirSync(path.dirname(HISTORY_PATH), { recursive: true });
  const entry = {
    ts: fingerprint.ts || new Date().toISOString(),
    session_count: fingerprint.session_count ?? null,
    drives: fingerprint.drives || {},
    calibration_trend: fingerprint.calibration_trend ?? null,
    confidence_bias: fingerprint.confidence_bias ?? null,
  };
  // Dedupe: if last entry has the same ts, don't append again
  const history = readHistory();
  const last = history[history.length - 1];
  if (last && last.ts === entry.ts) return history;
  history.push(entry);
  // Cap at HISTORY_CAP entries (keep most recent)
  const capped = history.slice(-HISTORY_CAP);
  fs.writeFileSync(HISTORY_PATH, capped.map(e => JSON.stringify(e)).join('\n') + '\n');
  return capped;
}

function mean(values) {
  const filtered = values.filter(v => typeof v === 'number' && !Number.isNaN(v));
  if (!filtered.length) return null;
  return filtered.reduce((a, b) => a + b, 0) / filtered.length;
}

function computeDimensionDelta(name, baselineEntries, currentEntries) {
  const baselineVals = baselineEntries.map(e => e.drives?.[name]).filter(v => v != null);
  const currentVals  = currentEntries.map(e => e.drives?.[name]).filter(v => v != null);
  const baseline = mean(baselineVals);
  const current  = mean(currentVals);
  if (baseline === null || current === null) {
    return { name, baseline, current, delta_abs: null, delta_pct: null, trend: 'unknown' };
  }
  const delta_abs = +(current - baseline).toFixed(4);
  const delta_pct = baseline === 0 ? null : +((delta_abs / baseline) * 100).toFixed(2);
  const trend = delta_abs > 0.05 ? 'improving' : delta_abs < -0.05 ? 'regressing' : 'stable';
  return { name, baseline: +baseline.toFixed(4), current: +current.toFixed(4), delta_abs, delta_pct, trend };
}

function interpret(dimensions, overallMag) {
  const improving = dimensions.filter(d => d.trend === 'improving').map(d => d.name);
  const regressing = dimensions.filter(d => d.trend === 'regressing').map(d => d.name);
  if (overallMag < 0.05) return 'baseline-stable: drift below noise floor';
  if (regressing.length === 0 && improving.length > 0) return `improving: ${improving.join(', ')} trending up`;
  if (improving.length === 0 && regressing.length > 0) return `regressing: ${regressing.join(', ')} trending down`;
  return `mixed: improving=${improving.join('|') || 'none'}, regressing=${regressing.join('|') || 'none'}`;
}

export function computeDelta({ noAppend = false } = {}) {
  const current = readFingerprint();
  if (!current) {
    return {
      as_of: new Date().toISOString(),
      sessions_total: 0,
      error: 'no fingerprint.json found',
      dimensions: [],
      overall_drift_magnitude: 0,
      interpretation: 'no data',
    };
  }

  let history = noAppend ? readHistory() : appendHistory(current);

  // If history is empty (first run, no append), seed with current
  if (history.length === 0) history = [current];

  const baselineEntries = history.slice(0, Math.min(BASELINE_WINDOW, history.length));
  const currentEntries  = history.slice(-CURRENT_WINDOW);

  const drivenames = new Set();
  for (const e of history) {
    for (const k of Object.keys(e.drives || {})) drivenames.add(k);
  }

  const dimensions = [...drivenames].map(name => computeDimensionDelta(name, baselineEntries, currentEntries));

  // Overall drift = RMS of |delta_abs| across dimensions with valid deltas
  const validDeltas = dimensions.map(d => d.delta_abs).filter(v => typeof v === 'number');
  const overall_drift_magnitude = validDeltas.length
    ? +Math.sqrt(validDeltas.reduce((s, x) => s + x * x, 0) / validDeltas.length).toFixed(4)
    : 0;

  return {
    as_of: new Date().toISOString(),
    sessions_total: current.session_count ?? history.length,
    history_entries: history.length,
    // SLIDING baseline: history is capped keep-most-recent, so these are the
    // oldest RETAINED entries, not the true first sessions; for history shorter
    // than baseline+current windows the two OVERLAP, biasing drift → 0.
    baseline_window: `oldest ${baselineEntries.length} of retained history (sliding after ${HISTORY_CAP}-entry cap)`,
    baseline_is_sliding: history.length >= HISTORY_CAP,
    windows_overlap: history.length < BASELINE_WINDOW + CURRENT_WINDOW,
    current_window: `last ${currentEntries.length}`,
    dimensions,
    calibration_trend: current.calibration_trend ?? null,
    confidence_bias: current.confidence_bias ?? null,
    overall_drift_magnitude,
    interpretation: interpret(dimensions, overall_drift_magnitude),
  };
}

function main() {
  fs.mkdirSync(STATE_DIR, { recursive: true });
  const args = process.argv.slice(2);
  const result = computeDelta({ noAppend: args.includes('--status') });
  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(result, null, 2));
  if (args.includes('--print') || args.includes('--status')) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log(`fingerprint-baseline: wrote ${OUTPUT_PATH} (history_entries=${result.history_entries ?? 0}, drift_mag=${result.overall_drift_magnitude})`);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
