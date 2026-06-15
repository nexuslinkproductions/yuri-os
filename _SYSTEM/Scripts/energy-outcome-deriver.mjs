// @capability: energy-outcome-deriver
// @serves: energy-gate outcome derivation | shadow ledger for gate prediction calibration | LEARN rung shadow store
// @does: maps energy-gate firings → prediction-ledger records in a SHADOW file. Derives outcomes by fixed-precedence
//   rule engine (R1 reverted > R2 retried-and-succeeded > R3 promoted > R4 undeterminable). Never writes the live ledger.
// @use: runDeriver({ signals }) to populate shadow; calibrate() for Brier report. DISARMED — no scheduling, no live writes.
// @exports: readFirings, firingToPrediction, deriveOutcome, runDeriver, calibrate
//
// ASSUMPTION: confidence = sigmoid(|deltaU|) = 1/(1+exp(-|deltaU|)). |deltaU|=0→0.5 (uncertain), |deltaU|≥5→≈0.99.
//   Rationale: |deltaU| measures how much the gate moved — larger shift = more confident the gate acted decisively.
//   U_after was considered but conflates "calm post-state" with "confident prediction", which is a different claim.
//   Exact calibration is learned from Brier scores; sigmoid is a prior, not a final answer.
// ASSUMPTION: signals is caller-injected: { isReverted(runId), isRetriedAndSucceeded(runId), isPromoted(runId) }.
//   The deriver does NOT import git/claim-transition/pulse — caller owns those lookups.
// ASSUMPTION: predictionId = sha256(`${subject}:${ts}`)[0:16], matching prediction-ledger's default id scheme.
// ASSUMPTION: shadow file default = _SYSTEM/state/energy-outcome-shadow.jsonl. NEVER write _SYSTEM/state/prediction-ledger.jsonl.

import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { recordPrediction, recordOutcome, calibrationReport } from './prediction-ledger.mjs';

const DEFAULT_TRACE_DIR = '_SYSTEM/state/energy-trace';
const DEFAULT_SHADOW_FILE = '_SYSTEM/state/energy-outcome-shadow.jsonl';

function sha16(s) { return createHash('sha256').update(s).digest('hex').slice(0, 16); }

// ── 1. readFirings ────────────────────────────────────────────────────────────
export function readFirings(opts = {}) {
  const dir = opts.traceDir ?? DEFAULT_TRACE_DIR;
  let files;
  try { files = readdirSync(dir).filter(f => f.endsWith('.jsonl')).sort(); } catch { return []; }
  const records = [];
  let corrupt = 0;
  for (const fname of files) {
    let raw;
    try { raw = readFileSync(join(dir, fname), 'utf8'); } catch { continue; }
    for (const line of raw.split('\n')) {
      const t = line.trim();
      if (!t) continue;
      try { records.push(JSON.parse(t)); } catch { corrupt++; }
    }
  }
  if (corrupt) process.stderr.write(`[energy-outcome-deriver] ${corrupt} corrupt line(s) skipped\n`);
  return records;
}

// ── 2. firingToPrediction ─────────────────────────────────────────────────────
export function firingToPrediction(firing) {
  const absDelta = Math.abs(Number(firing.deltaU) || 0);
  // sigmoid(|deltaU|): 0→0.5, 1→0.73, 5→0.99. Clamped to [0.05, 0.99].
  const confidence = Math.max(0.05, Math.min(0.99, 1 / (1 + Math.exp(-absDelta))));
  const effect = firing.decision === 'accept' ? 'survives' : 'rejected-correctly';
  return {
    subject: String((firing.corrId || firing.runId) ?? ''),
    predictedEffects: [{ target: 'proposal-survives', effect, confidence }],
    source: 'energy-gate',
    change: { decision: firing.decision ?? null, regime: firing.regime ?? null, event: firing.event ?? null },
    ts: firing.timestamp ?? null,
  };
}

// ── 3. deriveOutcome ──────────────────────────────────────────────────────────
// Fixed-precedence rule engine. Evaluates ALL rules, picks highest-precedence match.
// Order-independence proof: result = argmin{ rule.precedence | rule.test(f,s)=true }.
// Since RULES is a total order (R1>R2>R3>R4) and test results are deterministic
// for a given (firing, signals), the result is a pure function of (firing, signals).
// Evaluation order cannot change which rule has the lowest precedence number among matches.
const RULES = [
  { id: 'R1', effect: 'reverted',             test: (f, s) => !!s.isReverted?.(f.corrId || f.runId, f) },
  { id: 'R2', effect: 'retried-and-succeeded', test: (f, s) => !!s.isRetriedAndSucceeded?.(f.corrId || f.runId) },
  { id: 'R3', effect: 'survived',              test: (f, s) => !!s.isPromoted?.(f.corrId || f.runId) },
];

export function deriveOutcome(firing, signals = {}) {
  const joinKey = firing.corrId || firing.runId;
  const predictionId = sha16(`${joinKey}:${firing.timestamp}`);
  for (const rule of RULES) {
    if (rule.test(firing, signals)) {
      return { predictionId, observedEffects: [{ target: 'proposal-survives', effect: rule.effect }], status: 'derived', rule: rule.id };
    }
  }
  return { predictionId, observedEffects: [], status: 'undeterminable', rule: 'R4' };
}

// ── 4. runDeriver ─────────────────────────────────────────────────────────────
export function runDeriver(opts = {}) {
  const shadowFile = opts.file ?? DEFAULT_SHADOW_FILE;
  const signals = opts.signals ?? {};
  const firings = opts.firings ?? readFirings(opts);
  mkdirSync(dirname(shadowFile), { recursive: true });

  let predicted = 0, outcomesDerived = 0, undeterminable = 0;
  const byRule = {};

  for (const f of firings) {
    const pred = firingToPrediction(f);
    const { row } = recordPrediction(pred, { file: shadowFile });
    predicted++;

    const outcome = deriveOutcome(f, signals);
    byRule[outcome.rule] = (byRule[outcome.rule] ?? 0) + 1;

    if (outcome.status === 'undeterminable') { undeterminable++; continue; }
    recordOutcome({ predictionId: row.id, observedEffects: outcome.observedEffects, ts: f.timestamp }, { file: shadowFile });
    outcomesDerived++;
  }

  return { firings: firings.length, predicted, outcomesDerived, undeterminable, byRule };
}

// ── 5. calibrate ──────────────────────────────────────────────────────────────
export function calibrate(opts = {}) {
  return calibrationReport({ file: opts.file ?? DEFAULT_SHADOW_FILE });
}