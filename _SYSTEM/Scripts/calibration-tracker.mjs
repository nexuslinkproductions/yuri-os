#!/usr/bin/env node
/**
 * calibration-tracker.mjs — Track advisor finding accuracy, update PDC priors
 *
 * Reads council-synthesis.jsonl findings + outcome markers.
 * Computes per-advisor precision/recall and writes updated priors.
 * Low-precision advisors are flagged for deprioritization in next pulse cycle.
 *
 * Output: nisaba/calibration/priors.json
 * CLI: node Scripts/calibration-tracker.mjs [--json]
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname   = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT   = path.resolve(__dirname, '..');
const NISABA_DIR  = path.join(REPO_ROOT, '.claude', 'yuri-sentinel');
const SYNTH_LOG   = path.join(NISABA_DIR, 'logs', 'council-synthesis.jsonl');
const PULSE_LOG   = path.join(REPO_ROOT, '.claude', 'state', 'pulse-bus.json');
const CALIB_DIR   = path.join(NISABA_DIR, 'calibration');
const PRIORS_PATH = path.join(CALIB_DIR, 'priors.json');
const CALIB_LOG_MD = path.join(REPO_ROOT, '_SYSTEM', 'SELF-IMPROVEMENT', '02_EXTRACT', 'probability-calibration-log.md');

const args = process.argv.slice(2);
const JSON_MODE = args.includes('--json');
const WINDOW_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

const ADVISOR_SOURCES = ['DEEPSEEK', 'NVIDIA', 'OPENCLAW', 'CASSANDRA', 'SWARM', 'HERMES_FC', 'CODEX_ADVISORY'];
const F1_DROP_THRESHOLD = 0.15; // flag if F1 drops >15% since last calibration

// ── Load prior state ──────────────────────────────────────────────────────────

function loadExistingPriors() {
  if (!existsSync(PRIORS_PATH)) return null;
  try { return JSON.parse(readFileSync(PRIORS_PATH, 'utf8')); } catch { return null; }
}

// ── Load pulse-bus findings ───────────────────────────────────────────────────

function loadRecentFindings() {
  if (!existsSync(PULSE_LOG)) return [];
  try {
    const bus = JSON.parse(readFileSync(PULSE_LOG, 'utf8'));
    const cutoff = Date.now() - WINDOW_MS;
    return (bus.findings || []).filter(f => new Date(f.ts).getTime() > cutoff);
  } catch { return []; }
}

// ── Compute advisor stats ─────────────────────────────────────────────────────

function computeAdvisorStats(findings, priorState) {
  const advisors = {};

  for (const source of ADVISOR_SOURCES) {
    const sourcefindings = findings.filter(f => f.source === source);
    const total = sourcefindings.length;
    const warnPlus = sourcefindings.filter(f => ['WARN', 'HIGH', 'CRITICAL'].includes(f.severity));

    // outcome_marker: 'correct' | 'wrong' | null (null = unverified)
    const verified = sourcefindings.filter(f => f.outcome_marker && f.outcome_marker !== 'unverified');
    const truePositives = verified.filter(f => f.outcome_marker === 'correct' && ['WARN', 'HIGH', 'CRITICAL'].includes(f.severity)).length;
    const falsePositives = verified.filter(f => f.outcome_marker === 'wrong' && ['WARN', 'HIGH', 'CRITICAL'].includes(f.severity)).length;
    const falseNegatives = verified.filter(f => f.outcome_marker === 'wrong' && f.severity === 'INFO').length;

    const precision = (truePositives + falsePositives) > 0
      ? truePositives / (truePositives + falsePositives) : null;
    const recall = (truePositives + falseNegatives) > 0
      ? truePositives / (truePositives + falseNegatives) : null;
    const f1 = (precision !== null && recall !== null && (precision + recall) > 0)
      ? 2 * (precision * recall) / (precision + recall) : null;

    // Prior F1 from last run
    const priorF1 = priorState?.advisors?.[source]?.f1 ?? null;
    const f1Delta = (f1 !== null && priorF1 !== null) ? f1 - priorF1 : null;

    advisors[source] = {
      precision: precision !== null ? parseFloat(precision.toFixed(3)) : null,
      recall: recall !== null ? parseFloat(recall.toFixed(3)) : null,
      f1: f1 !== null ? parseFloat(f1.toFixed(3)) : null,
      f1_delta: f1Delta !== null ? parseFloat(f1Delta.toFixed(3)) : null,
      n_total: total,
      n_warn_plus: warnPlus.length,
      n_evaluated: verified.length,
      deprioritize: f1 !== null && f1 < 0.4, // low precision → suggest deprioritization
      last_updated: new Date().toISOString(),
    };
  }
  return advisors;
}

// ── Main ─────────────────────────────────────────────────────────────────────

const findings   = loadRecentFindings();
const priorState = loadExistingPriors();
const advisors   = computeAdvisorStats(findings, priorState);

const deprioritized = Object.entries(advisors)
  .filter(([, v]) => v.deprioritize)
  .map(([k]) => k);

const f1Dropped = Object.entries(advisors)
  .filter(([, v]) => v.f1_delta !== null && v.f1_delta < -F1_DROP_THRESHOLD)
  .map(([k]) => k);

const priors = {
  updated_ts: new Date().toISOString(),
  window_days: 7,
  advisors,
  deprioritized,
  f1_dropped_advisors: f1Dropped,
  recalibration_threshold_exceeded: f1Dropped.length > 0 || deprioritized.length > 0,
  total_findings_evaluated: findings.length,
};

mkdirSync(CALIB_DIR, { recursive: true });
writeFileSync(PRIORS_PATH, JSON.stringify(priors, null, 2));

// Append a one-line calibration log entry (human-readable, feeds PDC section in brain)
const logLine = `${priors.updated_ts.slice(0,10)} | evaluated=${findings.length} | deprioritized=[${deprioritized.join(',')||'none'}] | f1_dropped=[${f1Dropped.join(',')||'none'}]\n`;
try {
  const { appendFileSync: afs } = await import('node:fs');
  afs(CALIB_LOG_MD, logLine);
} catch (_) {}

if (JSON_MODE) {
  console.log(JSON.stringify(priors, null, 2));
} else {
  console.log(`⬡ Calibration Tracker — ${priors.updated_ts}`);
  console.log(`  Findings (7d): ${findings.length} | Deprioritized: [${deprioritized.join(',') || 'none'}] | F1 dropped: [${f1Dropped.join(',') || 'none'}]`);
  for (const [src, data] of Object.entries(advisors).filter(([, v]) => v.n_total > 0)) {
    const f1str = data.f1 !== null ? `f1=${data.f1}` : 'f1=unverified';
    console.log(`  ${src.padEnd(16)}: n=${data.n_total} ${f1str}${data.deprioritize ? ' ⚠ deprioritize' : ''}`);
  }
}
