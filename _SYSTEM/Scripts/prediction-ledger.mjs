import { pathToFileURL } from 'node:url';
// roadmap organ 5 — self-prediction precursor
// Dock: propagation-scan.mjs (--dry-run predictedEffects source: subject=node-id, targets=propagation targets),
//       probability-calibration-log (existing calibration culture),
//       homeostat (future sensor: rolling meanBrier as self-model-accuracy reading).
// Wiring producers is the main lane's refinement step, not this module.

import { createHash } from 'node:crypto';
import { appendFileSync, readFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const DEFAULT_FILE = '_SYSTEM/state/prediction-ledger.jsonl';

function sha256(s) {
  return createHash('sha256').update(s).digest('hex').slice(0, 16);
}

function ensureDir(p) {
  try { mkdirSync(dirname(p), { recursive: true }); } catch { /* fail-open */ }
}

function appendJSONL(row, file) {
  ensureDir(file);
  try {
    appendFileSync(file, JSON.stringify(row) + '\n', 'utf8');
  } catch (e) {
    console.error(`[prediction-ledger] write failed: ${e.message}`);
  }
}

// ── API ───────────────────────────────────────────────────────────────────────

// @capability: prediction-ledger
// @serves: self-prediction ledger | record a prediction and score it later | calibration report meanBrier | did my prediction come true | prediction vs outcome | learn-loop outcome store
// @does: append-only JSONL ledger of predictions↔outcomes — recordPrediction/recordOutcome, scorePrediction (Brier), calibrationReport (meanBrier + per-confidence buckets). The LEARN rung's store
// @use: when a mechanism makes a checkable forecast (propagation effects, izanagi rulings) record it, resolve the outcome later, read calibration to see if forecasts are honest. CLI: node prediction-ledger.mjs report
// @exports: recordPrediction, recordOutcome, scorePrediction, readLedger, calibrationReport
export function recordPrediction(input, opts) {
  const file = opts?.file ?? DEFAULT_FILE;
  const id = input.id ?? sha256(`${input.subject}:${input.ts}`);
  const row = {
    type: 'prediction',
    id,
    subject: input.subject,
    change: input.change,
    predictedEffects: input.predictedEffects ?? [],
    features: input.features ?? null,
    source: input.source,
    ts: input.ts,
  };
  appendJSONL(row, file);
  return { ok: true, row };
}

export function recordOutcome(input, opts) {
  const file = opts?.file ?? DEFAULT_FILE;
  const row = {
    type: 'outcome',
    predictionId: input.predictionId,
    observedEffects: input.observedEffects ?? [],
    ts: input.ts,
  };
  appendJSONL(row, file);
  return { ok: true, row };
}

/**
 * Score a prediction against its outcome.
 * Per predicted target: hit if observed effect matches, false-alarm otherwise.
 * Per observed-but-unpredicted target: miss with Brier penalty 1.0.
 * Mean Brier over the union of all scored targets.
 */
export function scorePrediction(prediction, outcome, opts = {}) {
  const pred = prediction.predictedEffects ?? [];
  const obs = outcome.observedEffects ?? [];
  const predMap = new Map(pred.map(p => [p.target, p]));
  const obsMap = new Map(obs.map(o => [o.target, o]));
  // Match signature is (target, predictedEffect, observedEffect). Default ignores
  // the target and uses strict equality. Callers that need target-aware semantics
  // (e.g. the canonical proposal-survives verb/past-tense normalization in
  // yuri-energy-rewardbench.mjs) can pass a 3-arg match. The 2-arg shape is
  // preserved as a backward-compatible subset: (p.effect, o.effect) still works.
  const matchFn = opts.match ?? ((_target, a, b) => a === b);

  let hits = 0, misses = 0, falseAlarms = 0;
  let brierSum = 0, count = 0;
  const detail = [];

  // Score each predicted effect against observations
  for (const p of pred) {
    const o = obsMap.get(p.target);
    const matched = !!(o && matchFn(p.target, p.effect, o.effect));
    if (matched) hits++; else falseAlarms++;
    const b = (p.confidence - (matched ? 1 : 0)) ** 2;
    brierSum += b;
    count++;
    detail.push({
      target: p.target,
      predicted: p.effect,
      observed: o?.effect ?? null,
      hit: matched,
      miss: false,
      brier: b,
    });
  }

  // Observed targets with no prediction = misses
  for (const o of obs) {
    if (!predMap.has(o.target)) {
      misses++;
      brierSum += 1;
      count++;
      detail.push({
        target: o.target,
        predicted: null,
        observed: o.effect,
        hit: false,
        miss: true,
        brier: 1,
      });
    }
  }

  return {
    brier: count > 0 ? brierSum / count : 0,
    hits,
    misses,
    falseAlarms,
    detail,
  };
}

/**
 * Read the JSONL ledger. Corrupt lines are skipped with a counted stderr warning.
 * Never throws.
 */
export function readLedger(opts) {
  const file = opts?.file ?? DEFAULT_FILE;
  let raw;
  try {
    raw = readFileSync(file, 'utf8');
  } catch {
    return [];
  }
  const rows = [];
  let corrupt = 0;
  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      rows.push(JSON.parse(trimmed));
    } catch {
      corrupt++;
    }
  }
  if (corrupt) {
    process.stderr.write(`[prediction-ledger] ${corrupt} corrupt line(s) skipped\n`);
  }
  return rows;
}

// ── Calibration ──────────────────────────────────────────────────────────────

const BUCKETS = [
  { label: '0-0.2',   lo: 0,    hi: 0.2 },
  { label: '0.2-0.4', lo: 0.2,  hi: 0.4 },
  { label: '0.4-0.6', lo: 0.4,  hi: 0.6 },
  { label: '0.6-0.8', lo: 0.6,  hi: 0.8 },
  { label: '0.8-1',   lo: 0.8,  hi: 1.0001 },  // inclusive upper bound for confidence=1.0
];

/**
 * Reads the JSONL ledger, pairs predictions ↔ outcomes by predictionId,
 * returns overall and per-confidence-bucket calibration stats.
 * Unresolved predictions (no matching outcome) are listed but excluded from scoring.
 */
export function calibrationReport(opts) {
  const rows = readLedger(opts);
  const preds = new Map();
  const outcomes = new Map();

  for (const r of rows) {
    if (r.type === 'prediction') preds.set(r.id, r);
    if (r.type === 'outcome') outcomes.set(r.predictionId, r);
  }

  // carry lo/hi into the accumulator — the range test below reads b.lo/b.hi, and
  // dropping them here left every comparison undefined → all buckets stayed empty.
  const bk = BUCKETS.map(b => ({ bucket: b.label, lo: b.lo, hi: b.hi, n: 0, brierSum: 0, hits: 0 }));
  const unresolved = [];
  let gBrier = 0;
  let gCount = 0;

  for (const [id, pred] of preds) {
    const out = outcomes.get(id);
    if (!out) {
      unresolved.push(id);
      continue;
    }

    const sc = scorePrediction(pred, out, { match: opts.match });

    for (const d of sc.detail) {
      gBrier += d.brier;
      gCount++;

      // Misses (unpredicted observed targets) have no confidence → skip bucketing
      if (d.predicted === null) continue;

      // Find the original confidence for this target
      const pe = pred.predictedEffects.find(p => p.target === d.target);
      if (!pe) continue;

      for (const b of bk) {
        if (pe.confidence >= b.lo && pe.confidence < b.hi) {
          b.n++;
          b.brierSum += d.brier;
          if (d.hit) b.hits++;
          break;
        }
      }
    }
  }

  return {
    n: preds.size - unresolved.length,
    meanBrier: gCount > 0 ? gBrier / gCount : 0,
    byConfidenceBucket: bk.map(b => ({
      bucket: b.bucket,
      n: b.n,
      meanBrier: b.n > 0 ? b.brierSum / b.n : 0,
      hitRate: b.n > 0 ? b.hits / b.n : 0,
    })),
    unresolved,
  };
}

// ── CLI ─────────────────────────────────────────────────────────────────────
// `node prediction-ledger.mjs report` — manual/advisory calibration readout (deflated Brier + per-bucket).
// F4b (FABLE audit 2026-07-06): previously documented as "invoked by the homeostat self-model-drift reflex
// (yuri-homeostat.mjs:136)" — that consumer file DOES NOT EXIST anywhere in the repo. The calibration
// signal currently has NO live automated consumer; run this manually or wire a real caller. Advisory: never throw, fail-open.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const cmd = process.argv[2];
  if (cmd === 'report') {
    try {
      const r = calibrationReport();
      console.log(`prediction-ledger calibration: n=${r.n} meanBrier=${r.meanBrier.toFixed(4)} unresolved=${r.unresolved.length}`);
      for (const b of r.byConfidenceBucket) {
        if (b.n > 0) console.log(`  ${b.bucket.padEnd(10)} n=${String(b.n).padStart(4)} brier=${b.meanBrier.toFixed(4)} hitRate=${(b.hitRate * 100).toFixed(1)}%`);
      }
      if (r.n === 0) console.log('  (no resolved predictions yet — record outcomes to populate calibration)');
    } catch (e) {
      console.error(`[prediction-ledger] report failed: ${e.message}`);
    }
  } else {
    console.log('prediction-ledger — self-prediction ledger.\n  node prediction-ledger.mjs report   # calibration report (meanBrier + per-confidence buckets)');
  }
}
