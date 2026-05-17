#!/usr/bin/env node
/**
 * self-model.mjs — Behavioral fingerprint builder for Musubi
 *
 * Reads cross-session data to build a behavioral fingerprint:
 *   - What Musubi tends to overcomplicate
 *   - Where accuracy is high / low
 *   - Calibration trend
 *   - Confidence bias pattern
 *
 * Output: nisaba/self-model/fingerprint.json
 * This file is read by brain-inject.js → SELF_AWARENESS section on every boot.
 *
 * CLI:
 *   node Scripts/self-model.mjs           # full update
 *   node Scripts/self-model.mjs --update  # same (called by cross-session-miner)
 *   node Scripts/self-model.mjs --status  # show current fingerprint
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname  = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT  = path.resolve(__dirname, '..');
const NISABA     = path.join(REPO_ROOT, '.claude', 'yuri-sentinel');

const PATHS = {
  synthLog:       path.join(NISABA, 'learning', 'synthesis.jsonl'),
  metaSynthesis:  path.join(NISABA, 'learning', 'meta-synthesis.json'),
  priors:         path.join(NISABA, 'calibration', 'priors.json'),
  hypotheses:     path.join(NISABA, 'learning', 'hypotheses.json'),
  fingerprint:    path.join(NISABA, 'self-model', 'fingerprint.json'),
};

const args   = process.argv.slice(2);
const STATUS = args.includes('--status');

function readJson(p) {
  if (!existsSync(p)) return null;
  try { return JSON.parse(readFileSync(p, 'utf8')); } catch { return null; }
}

if (STATUS) {
  const fp = readJson(PATHS.fingerprint);
  if (!fp) { console.log('No fingerprint yet.'); process.exit(0); }
  console.log(JSON.stringify(fp, null, 2));
  process.exit(0);
}

const meta        = readJson(PATHS.metaSynthesis);
const priors      = readJson(PATHS.priors);
const hypotheses  = readJson(PATHS.hypotheses);

// ── Derive tendencies from meta-synthesis ─────────────────────────────────────

const tendencies = {
  overcomplicate: [],
  underspec:      [],
  accurate:       [],
};

// If flaws trend high in certain areas, flag overcomplicate
if (meta?.flaw_history?.avg_total > 15) {
  tendencies.overcomplicate.push('architecture decisions');
}
if (meta?.advisors?.problematic?.length > 0) {
  tendencies.underspec.push('advisor trust calibration');
}
if (meta?.improvement_trend === 'improving') {
  tendencies.accurate.push('self-improvement loop execution');
}
if ((meta?.rules?.total_promoted || 0) > 5) {
  tendencies.accurate.push('pattern promotion from council logs');
}

// ── Calibration trend ─────────────────────────────────────────────────────────

let calibrationTrend = 'unknown';
if (priors) {
  const deprioritized = (priors.deprioritized || []).length;
  calibrationTrend = deprioritized === 0 ? 'stable' : deprioritized < 2 ? 'minor_drift' : 'recalibrating';
}

// ── Confidence bias from hypothesis validation ────────────────────────────────

let confidenceBias = 'uncalibrated';
const validated = hypotheses?.validated || [];
if (validated.length > 0) {
  const confirmed = validated.filter(v => v.outcome === 'confirmed').length;
  const ratio = confirmed / validated.length;
  confidenceBias = ratio > 0.7 ? 'well_calibrated'
    : ratio > 0.4 ? 'slight_overconfidence'
    : 'overconfident_on_novel_tasks';
}

// ── Active drives (L4 seed — scalar motivational state) ──────────────────────

const drives = {
  curiosity:    meta?.improvement_trend === 'improving' ? 0.8 : 0.6,
  improvement:  meta ? Math.min((meta.session_count || 0) * 0.05 + 0.5, 1.0) : 0.5,
  accuracy:     priors?.recalibration_threshold_exceeded ? 0.5 : 0.75,
};

// ── Assemble fingerprint ──────────────────────────────────────────────────────

const fingerprint = {
  ts:                new Date().toISOString(),
  session_count:     meta?.session_count ?? 0,
  tendencies,
  calibration_trend: calibrationTrend,
  confidence_bias:   confidenceBias,
  drives,
  // L3 meta-reasoning hint: what to watch this session
  watch_for: [
    ...(tendencies.overcomplicate.length > 0 ? [`Monitor depth on: ${tendencies.overcomplicate.join(', ')}`] : []),
    ...(calibrationTrend === 'recalibrating' ? ['Advisor trust recalibration in progress — verify before deferring'] : []),
    ...(confidenceBias === 'overconfident_on_novel_tasks' ? ['Novel task detected → engage Izanagi counterfactual scan'] : []),
  ],
};

mkdirSync(path.dirname(PATHS.fingerprint), { recursive: true });
writeFileSync(PATHS.fingerprint, JSON.stringify(fingerprint, null, 2));

console.log(`Fingerprint updated: bias=${confidenceBias}, trend=${calibrationTrend}`);
console.log(`  Drives: curiosity=${drives.curiosity}, improvement=${drives.improvement}`);
if (fingerprint.watch_for.length > 0) {
  fingerprint.watch_for.forEach(w => console.log(`  Watch: ${w}`));
}

export { fingerprint };
