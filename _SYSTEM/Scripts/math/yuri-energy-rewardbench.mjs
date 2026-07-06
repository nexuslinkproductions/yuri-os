import { pathToFileURL } from 'node:url';
// @capability: yuri-energy-rewardbench
// @serves: score the energy gate AS a reward model over the shadow outcome ledger |
//   pairwise accuracy (does higher |deltaU| confidence track survived-vs-reverted outcomes?) |
//   best-of-N selection accuracy | Brier score | ECE (expected calibration error) |
//   the keystone question: "is the gate actually right?"
// @does: reads the shadow ledger (_SYSTEM/state/energy-outcome-shadow.jsonl) —
//   prediction-ledger format records produced by energy-outcome-deriver.mjs.
//   Pairs predictions↔outcomes by predictionId, computes reward-model metrics.
//   Pure read-only; never writes. DISARMED.
// @use: node _SYSTEM/Scripts/math/yuri-energy-rewardbench.mjs report
// @exports: pairwiseAccuracy, bestOfN, ece, rewardbenchReport, resolveRows, SURVIVE_OUTCOMES, REVERT_OUTCOMES, proposalSurvivesMatch
//
// METRICS:
//   pairwiseAccuracy — for every pair of resolved predictions with different confidence
//     AND different outcomes, does the higher-confidence prediction point to the correct
//     outcome? Standard RLHF reward-model metric. >0.5 = gate confidence carries signal.
//   bestOfN — group predictions (by date), take top-N by confidence, check if #1 is correct.
//     Measures "does the gate pick winners?" Default N=4.
//   ece — expected calibration error: weighted mean of |bucket_mean_confidence - bucket_hit_rate|.
//     Standard calibration metric. <0.1 = well-calibrated, <0.2 = acceptable.
//   meanBrier — from prediction-ledger.calibrationReport. <0.25 beats constant-0.5 predictor.
//
// INTERPRETATION (the keystone answer):
//   pairwise > 0.5 + ECE < 0.2 + Brier < 0.25 → GATE_HAS_SIGNAL (the gate is actually right)
//   pairwise ≈ 0.5 → GATE_NEAR_CHANCE (confidence doesn't track outcomes)
//   pairwise < 0.45 → GATE_INVERTED (higher confidence predicts WRONG outcomes — serious bug)
//   n < 50 → INSUFFICIENT_DATA

import { readLedger, scorePrediction, calibrationReport } from '../prediction-ledger.mjs';

const DEFAULT_SHADOW_FILE = '_SYSTEM/state/energy-outcome-shadow.jsonl';

// ── Canonical target normalization ──────────────────────────────────────────
// The gate predicts proposal-survives using verb-form effects ('survives' /
// 'rejected-correctly'); the outcome ledger records the past-tense realization
// ('survived' / 'reverted', with a few extra aliases for retry/accept paths).
// Strict string equality (the prediction-ledger default matchFn) treats
// 'survives' !== 'survived' as a miss, which inflates Brier and corrupts
// calibration. These sets ARE the canonical semantic mapping for the gate's
// primary target — every metric in this module (pairwise, best-of-N, ECE, Brier)
// MUST use it. resolveRows applies it directly; calibrationReport gets it
// through proposalSurvivesMatch below.
export const SURVIVE_OUTCOMES = Object.freeze(new Set(['survived', 'survives', 'retried-and-succeeded', 'accepted']));
export const REVERT_OUTCOMES = Object.freeze(new Set(['reverted', 'rejected', 'failed', 'rejected-correctly']));

// Target-aware match function for prediction-ledger.scorePrediction. Applied to
// the canonical 'proposal-survives' target; all other targets fall through to
// strict equality (preserving the existing behavior for non-canonical targets
// like perf, latency, cpu, mem, x, y, ...). Sign: (target, predicted, observed).
export function proposalSurvivesMatch(target, predicted, observed) {
  if (target !== 'proposal-survives') return predicted === observed;
  if (SURVIVE_OUTCOMES.has(predicted)) return SURVIVE_OUTCOMES.has(observed);
  if (REVERT_OUTCOMES.has(predicted)) return REVERT_OUTCOMES.has(observed);
  // Predicted value is outside the canonical vocabulary on this target: treat
  // as a strict comparison so a future alias still gets matched on equality.
  return predicted === observed;
}

// ── Confidence buckets (match prediction-ledger for consistency) ─────────────
const BUCKETS = [
  { label: '0-0.2',   lo: 0,    hi: 0.2 },
  { label: '0.2-0.4', lo: 0.2,  hi: 0.4 },
  { label: '0.4-0.6', lo: 0.4,  hi: 0.6 },
  { label: '0.6-0.8', lo: 0.6,  hi: 0.8 },
  { label: '0.8-1',   lo: 0.8,  hi: 1.0001 },
];

// ── resolveRows: pair predictions↔outcomes, extract (confidence, hit) ────────
// Returns an array of { id, confidence, hit, ts, subject, predictedEffect, observedEffect }
// for every prediction that has a matching outcome record.
// Filters to the primary target "proposal-survives" — the gate's one prediction axis.
export function resolveRows(rows) {
  const preds = new Map();
  const outcomes = new Map();

  for (const r of rows) {
    if (r.type === 'prediction') preds.set(r.id, r);
    if (r.type === 'outcome') outcomes.set(r.predictionId, r);
  }

  const resolved = [];
  for (const [id, pred] of preds) {
    const out = outcomes.get(id);
    if (!out) continue;

    // DEGENERATE-ROW GUARD: if either side is empty on the proposal-survives
    // axis, there is no claim/observation to score — skip the row. The
    // scorePrediction path otherwise promotes a one-sided emptiness into a
    // "miss" detail (e.g. observed-with-no-prediction = miss, OR
    // predicted-with-no-observation = false-alarm with observed=null), which
    // would inflate the resolved count and corrupt pairwise / bestOfN / ECE.
    // The metric at the degenerate point is "no row", not "row with hit=false".
    const peArr = Array.isArray(pred?.predictedEffects) ? pred.predictedEffects : [];
    const oeArr = Array.isArray(out?.observedEffects) ? out.observedEffects : [];
    const hasPrediction = peArr.some((p) => p && p.target === 'proposal-survives');
    const hasObservation = oeArr.some((o) => o && o.target === 'proposal-survives');
    if (!hasPrediction || !hasObservation) continue;

    const sc = scorePrediction(pred, out, { match: proposalSurvivesMatch });
    const primary = sc.detail.find(d => d.target === 'proposal-survives');
    if (!primary) continue;

    const pe = pred.predictedEffects?.find(p => p.target === 'proposal-survives');
    const confidence = pe?.confidence ?? 0.5;

    // hit logic is the consumer-facing view of proposalSurvivesMatch on the
    // canonical target; it MUST stay in lockstep with the match function
    // passed to scorePrediction above, otherwise pairwise/Ece numbers and the
    // Brier-calibrated verdict would silently disagree.
    const hit = primary.predicted === 'survives' ? SURVIVE_OUTCOMES.has(primary.observed) : primary.predicted === 'rejected-correctly' ? REVERT_OUTCOMES.has(primary.observed) : primary.hit;

    resolved.push({
      id,
      confidence,
      hit,
      ts: pred.ts,
      subject: pred.subject ?? '',
      predictedEffect: primary.predicted,
      observedEffect: primary.observed,
    });
  }

  return resolved;
}

// ── pairwiseAccuracy ─────────────────────────────────────────────────────────
// Standard RLHF reward-model metric: for every pair of resolved predictions with
// different confidence AND different outcomes, does the higher-confidence one
// point to the correct outcome?
//
// Returns { pairwiseAccuracy, correct, total, tiesSameOutcome, tiesSameConfidence }
export function pairwiseAccuracy(rows, opts = {}) {
  const resolved = resolveRows(rows);

  let correct = 0;
  let total = 0;
  let tiesSameOutcome = 0;
  let tiesSameConfidence = 0;

  for (let i = 0; i < resolved.length; i++) {
    for (let j = i + 1; j < resolved.length; j++) {
      const a = resolved[i];
      const b = resolved[j];

      if (a.confidence === b.confidence) {
        tiesSameConfidence++;
        continue;
      }
      if (a.hit === b.hit) {
        tiesSameOutcome++;
        continue;
      }

      total++;
      const higher = a.confidence > b.confidence ? a : b;
      if (higher.hit) correct++;
    }
  }

  return {
    pairwiseAccuracy: total > 0 ? correct / total : null,
    correct,
    total,
    tiesSameOutcome,
    tiesSameConfidence,
    n: resolved.length,
  };
}

// ── bestOfN ──────────────────────────────────────────────────────────────────
// Groups resolved predictions by a grouping key (default: date from ts),
// takes the top-N by confidence within each group, and checks whether the #1
// (highest-confidence) prediction is correct.
//
// Returns { bestOfN, correct, total, n, groupCount }
export function bestOfN(rows, opts = {}) {
  const n = opts.n ?? 4;
  const groupKey = opts.groupKey ?? null; // fn(row) => string, default: date
  const resolved = resolveRows(rows);

  const groups = new Map();
  for (const r of resolved) {
    const key = groupKey
      ? groupKey(r)
      : (r.ts ? String(r.ts).slice(0, 10) : 'unknown');
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(r);
  }

  let correct = 0;
  let total = 0;
  for (const [, group] of groups) {
    if (group.length < n) continue;
    const sorted = [...group].sort((a, b) => b.confidence - a.confidence);
    if (sorted[0].hit) correct++;
    total++;
  }

  return {
    bestOfN: total > 0 ? correct / total : null,
    correct,
    total,
    n,
    groupCount: groups.size,
  };
}

// ── ece (Expected Calibration Error) ─────────────────────────────────────────
// Standard metric: bucket predictions by confidence, compute
// |mean_confidence - hit_rate| per bucket, weighted by bucket size.
//
// Returns { ece, n, buckets: [{ bucket, n, meanConfidence, hitRate, absError, weight }] }
export function ece(rows, opts = {}) {
  const resolved = resolveRows(rows);
  const buckets = BUCKETS.map(b => ({
    bucket: b.label,
    lo: b.lo,
    hi: b.hi,
    confidences: [],
    hits: 0,
    n: 0,
  }));

  for (const r of resolved) {
    for (const b of buckets) {
      if (r.confidence >= b.lo && r.confidence < b.hi) {
        b.confidences.push(r.confidence);
        b.n++;
        if (r.hit) b.hits++;
        break;
      }
    }
  }

  const total = resolved.length;
  let eceSum = 0;
  const bucketReports = buckets.map(b => {
    if (b.n === 0) return { bucket: b.bucket, n: 0, meanConfidence: null, hitRate: null, absError: null, weight: 0 };
    const meanConf = b.confidences.reduce((a, c) => a + c, 0) / b.n;
    const hitRate = b.hits / b.n;
    const absError = Math.abs(meanConf - hitRate);
    const weight = total > 0 ? b.n / total : 0;
    eceSum += weight * absError;
    return { bucket: b.bucket, n: b.n, meanConfidence: meanConf, hitRate, absError, weight };
  });

  return {
    ece: total > 0 ? eceSum : null,
    n: total,
    buckets: bucketReports,
  };
}

// ── rewardbenchReport ────────────────────────────────────────────────────────
// Full report: pairwise + best-of-N + Brier + ECE + verdict.
// This is THE answer to "is the gate actually right?"
export function rewardbenchReport(rows, opts = {}) {
  const resolved = resolveRows(rows);
  // Pass proposalSurvivesMatch to calibrationReport so the Brier component
  // agrees with the pairwise / bestOfN / ece metrics (which all derive from
  // resolveRows, which already uses the same normalization). Without this,
  // the strict `===` default in scorePrediction treats 'survives' !== 'survived'
  // as a miss, inflates meanBrier, and a clean strong signal is mis-tagged
  // GATE_HAS_SIGNAL_WITH_CAVEATS on a Brier-of-noise threshold.
  const cal = calibrationReport({ file: opts.file ?? DEFAULT_SHADOW_FILE, match: proposalSurvivesMatch });
  const pw = pairwiseAccuracy(rows, opts);
  const bon = bestOfN(rows, opts);
  const eceResult = ece(rows, opts);

  // ── Verdict ──────────────────────────────────────────────────────────
  let verdict;
  if (resolved.length < 50) {
    verdict = 'INSUFFICIENT_DATA';
  } else if (pw.pairwiseAccuracy !== null && pw.pairwiseAccuracy < 0.45) {
    verdict = 'GATE_INVERTED';
  } else if (pw.pairwiseAccuracy !== null && pw.pairwiseAccuracy <= 0.52) {
    verdict = 'GATE_NEAR_CHANCE';
  } else if (
    pw.pairwiseAccuracy !== null && pw.pairwiseAccuracy > 0.52 &&
    eceResult.ece !== null && eceResult.ece < 0.2 &&
    cal.meanBrier < 0.25
  ) {
    verdict = 'GATE_HAS_SIGNAL';
  } else if (pw.pairwiseAccuracy !== null && pw.pairwiseAccuracy > 0.52) {
    verdict = 'GATE_HAS_SIGNAL_WITH_CAVEATS'; // signal but calibration off
  } else {
    verdict = 'INCONCLUSIVE';
  }

  return {
    n: resolved.length,
    verdict,
    pairwiseAccuracy: pw.pairwiseAccuracy,
    pairwiseCorrect: pw.correct,
    pairwiseTotal: pw.total,
    pairwiseTiesSameOutcome: pw.tiesSameOutcome,
    pairwiseTiesSameConfidence: pw.tiesSameConfidence,
    bestOfN: bon.bestOfN,
    bestOfNCorrect: bon.correct,
    bestOfNTotal: bon.total,
    bestOfN_n: bon.n,
    bestOfNGroupCount: bon.groupCount,
    meanBrier: cal.meanBrier,
    ece: eceResult.ece,
    eceBuckets: eceResult.buckets,
    byConfidenceBucket: cal.byConfidenceBucket,
    unresolved: cal.unresolved?.length ?? 0,
  };
}

// ── CLI ──────────────────────────────────────────────────────────────────────
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const cmd = process.argv[2];
  const file = process.argv[3] ?? DEFAULT_SHADOW_FILE;

  if (cmd === 'report') {
    const rows = readLedger({ file });
    const report = rewardbenchReport(rows, { file });
    console.log(JSON.stringify(report, null, 2));
  } else if (cmd === 'pairwise') {
    const rows = readLedger({ file });
    console.log(JSON.stringify(pairwiseAccuracy(rows), null, 2));
  } else if (cmd === 'bestofn') {
    const rows = readLedger({ file });
    console.log(JSON.stringify(bestOfN(rows, { n: parseInt(process.argv[4]) || 4 }), null, 2));
  } else if (cmd === 'ece') {
    const rows = readLedger({ file });
    console.log(JSON.stringify(ece(rows), null, 2));
  } else {
    console.log([
      'yuri-energy-rewardbench — score the energy gate as a reward model.',
      '',
      '  node yuri-energy-rewardbench.mjs report [file]     full reward-bench report',
      '  node yuri-energy-rewardbench.mjs pairwise [file]   pairwise accuracy only',
      '  node yuri-energy-rewardbench.mjs bestofn [file] [n]  best-of-N accuracy',
      '  node yuri-energy-rewardbench.mjs ece [file]        expected calibration error',
      '',
      'Default file: _SYSTEM/state/energy-outcome-shadow.jsonl',
    ].join('\n'));
  }
}
