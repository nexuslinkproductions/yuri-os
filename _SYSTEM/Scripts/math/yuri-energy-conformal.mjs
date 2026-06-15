#!/usr/bin/env node
// @capability: energy-conformal-c-layer
// @serves: conformal calibration | platt scaling | isotonic regression | mondrian coverage | energy gate calibration | distribution-free pReject | conformal prediction
// @does: Platt/isotonic pReject + Mondrian conformal coverage layer over the shadow ledger.
//   Reuses conformalQuantile from eval-processing. SHADOW-ONLY — never feeds gateProposal.
//   DISARMED by default: no import inside gateProposal/computeU, no write to live ledger,
//   no cron/launchd/live wiring. Arming (inserting pReject into the gate's decision rule)
//   is OWNER-GATED (Wave-3).
// @use: cLayerReport() for full calibration analysis; plattCalibrate/isotonicCalibrate for
//   individual methods; mondrianCoverage + conformalPrediction for per-cell conformal checks.
// @exports: plattCalibrate, isotonicCalibrate, mondrianCoverage, conformalPrediction, cLayerReport
//
// Dependencies (all existing, all tested):
//   conformalQuantile  — eval-processing.mjs:195  (split-conformal, finite-sample ≤α guarantee)
//   readFirings        — energy-outcome-deriver.mjs (read gate-trace firings)
//   readLedger         — prediction-ledger.mjs      (parse shadow JSONL)
//   recordPrediction   — prediction-ledger.mjs      (append conformal forecasts, shadow-only)
//
// NOTE: computeU (yuri-energy.mjs:617) is listed as the conceptual source of |deltaU|,
//   but firings already carry deltaU from the gate — we do NOT import computeU.
//   calibrate (energy-outcome-deriver.mjs) is the existing Brier report — complement,
//   not replacement; we do NOT import it.

import { conformalQuantile } from '../eval-processing.mjs';
import { readFirings } from '../energy-outcome-deriver.mjs';
import { readLedger, recordPrediction } from '../prediction-ledger.mjs';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

// ── Constants ──────────────────────────────────────────────────────────────────
const DEFAULT_SHADOW_FILE = '_SYSTEM/state/energy-outcome-shadow.jsonl';
const CONFORMAL_SHADOW_FILE = '_SYSTEM/state/energy-conformal-shadow.jsonl';
const CORPUS_MIN = 500;
const DEFAULT_ALPHA = 0.1;

// ── Numeric helpers ───────────────────────────────────────────────────────────
function sigmoid(z) {
  // Numerically stable: overflow-safe for both signs.
  if (z >= 0) {
    const eNeg = Math.exp(-z);
    return 1 / (1 + eNeg);
  }
  const ePos = Math.exp(z);
  return ePos / (1 + ePos);
}

function logit(p) {
  // p clamped away from 0/1 to keep logit finite.
  const c = Math.max(1e-12, Math.min(1 - 1e-12, p));
  return Math.log(c / (1 - c));
}

const isNum = (x) => typeof x === 'number' && Number.isFinite(x);

function ensureDir(p) {
  try { mkdirSync(dirname(p), { recursive: true }); } catch { /* fail-open */ }
}

// ── buildLabeledPairs ──────────────────────────────────────────────────────────
// Reads the shadow ledger (predictions + outcomes) and the trace firings,
// joins them by runId, and emits (|deltaU|, label) pairs with regime/event metadata.
//
// Label semantics (matching the spec's pReject definition):
//   1 = "rejection would have been correct" (proposal was bad — R1 reverted)
//   0 = "rejection would have been wrong"   (proposal was good — R2 retried-and-succeeded, R3 survived)
//   R4 undeterminable → skipped.
function buildLabeledPairs(shadowFile, firings) {
  const rows = readLedger({ file: shadowFile });
  const preds = new Map();
  const outcomes = new Map();
  for (const r of rows) {
    if (r.type === 'prediction') preds.set(r.id, r);
    if (r.type === 'outcome') outcomes.set(r.predictionId, r);
  }

  // Index firings by runId (the prediction.subject field).
  const firingMap = new Map();
  for (const f of firings) {
    const rid = String(f.runId ?? '');
    if (rid) firingMap.set(rid, f);
  }

  const pairs = [];
  for (const [id, pred] of preds) {
    const out = outcomes.get(id);
    if (!out) continue; // unresolved — skip

    const firing = firingMap.get(pred.subject);
    if (!firing) continue; // no matching trace firing

    const absDelta = Math.abs(Number(firing.deltaU) || 0);
    if (!isNum(absDelta)) continue;

    const obsEffect = out.observedEffects?.[0]?.effect;

    let label;
    if (obsEffect === 'reverted') {
      label = 1; // proposal failed → rejection correct
    } else if (obsEffect === 'retried-and-succeeded' || obsEffect === 'survived') {
      label = 0; // proposal eventually ok → rejection wrong
    } else {
      continue; // R4 undeterminable or missing effect
    }

    pairs.push({
      deltaU: absDelta,
      label,
      regime: firing.regime ?? 'unknown',
      event: firing.event ?? 'unknown',
      decision: firing.decision ?? 'unknown',
      runId: pred.subject,
    });
  }
  return pairs;
}

// ═══════════════════════════════════════════════════════════════════════════════
// 1. plattCalibrate — Platt-scaled pReject via MLE (IRLS)
// ═══════════════════════════════════════════════════════════════════════════════
//
// Fits pReject(|deltaU|) = sigmoid(a·|deltaU| + b) by maximising the
// Bernoulli log-likelihood over (|deltaU|, label) pairs.
//
// Uses Iteratively Reweighted Least Squares (IRLS / Newton-Raphson) for
// logistic regression — quadratic convergence, typically < 20 iterations.
// Falls back to gradient ascent with backtracking line search if the Hessian
// becomes singular (rare, e.g. perfectly separable data).
//
// Returns { pReject(deltaU), a, b, converged, n, logLikelihood }.
// SHADOW-ONLY: does NOT modify gateProposal.

export function plattCalibrate(labeledPairs, opts = {}) {
  // Filter to valid numeric pairs
  const valid = labeledPairs.filter(p => isNum(p.deltaU) && (p.label === 0 || p.label === 1));
  const n = valid.length;

  if (n === 0) {
    const fn = () => 0.5;
    return { pReject: fn, a: 0, b: 0, converged: false, n: 0, logLikelihood: -Infinity };
  }

  const xs = valid.map(p => p.deltaU);
  const ys = valid.map(p => p.label);

  // Initialise b from base rate, a from zero.
  const baseRate = ys.reduce((s, y) => s + y, 0) / n;
  let a = 0;
  let b = logit(baseRate);

  const maxIter = opts.maxIter ?? 50;
  const tol = opts.tol ?? 1e-8;
  const ridge = opts.ridge ?? 1e-8; // small ridge for numerical stability

  // Helper: compute log-likelihood.
  function logLikelihood(a, b) {
    let ll = 0;
    for (let i = 0; i < n; i++) {
      const s = sigmoid(a * xs[i] + b);
      ll += ys[i] === 1
        ? Math.log(Math.max(s, 1e-15))
        : Math.log(Math.max(1 - s, 1e-15));
    }
    return ll;
  }

  let prevLL = logLikelihood(a, b);

  for (let iter = 0; iter < maxIter; iter++) {
    // Compute gradient and Hessian in one pass.
    let g0 = 0, g1 = 0;  // gradient: [∂/∂a, ∂/∂b]
    let h00 = ridge, h01 = 0, h11 = ridge; // Hessian with ridge
    for (let i = 0; i < n; i++) {
      const s = sigmoid(a * xs[i] + b);
      const w = s * (1 - s); // weight = variance of Bernoulli
      const err = ys[i] - s;
      g0 += err * xs[i];
      g1 += err;
      h00 += w * xs[i] * xs[i];
      h01 += w * xs[i];
      h11 += w;
    }

    const det = h00 * h11 - h01 * h01;
    if (Math.abs(det) < 1e-15) {
      // Hessian singular — fall back to gradient step.
      const gNorm = Math.sqrt(g0 * g0 + g1 * g1);
      if (gNorm < tol * 10) {
        return {
          pReject: (deltaU) => sigmoid(a * Math.abs(deltaU) + b),
          a, b, converged: true, n, logLikelihood: prevLL,
        };
      }
      const step = 0.1 / gNorm;
      a += step * g0;
      b += step * g1;
    } else {
      // Newton step: Δ = H⁻¹ · g
      const da = (h11 * g0 - h01 * g1) / det;
      const db = (h00 * g1 - h01 * g0) / det;
      a += da;
      b += db;
    }

    const newLL = logLikelihood(a, b);
    if (Math.abs(newLL - prevLL) < tol) {
      return {
        pReject: (deltaU) => sigmoid(a * Math.abs(deltaU) + b),
        a, b, converged: true, n, logLikelihood: newLL,
      };
    }
    prevLL = newLL;
  }

  return {
    pReject: (deltaU) => sigmoid(a * Math.abs(deltaU) + b),
    a, b, converged: false, n, logLikelihood: prevLL,
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// 2. isotonicCalibrate — Isotonic-regression pReject via PAV
// ═══════════════════════════════════════════════════════════════════════════════
//
// Fits a monotone non-decreasing step function over |deltaU| bins using the
// Pool-Adjacent-Violators algorithm (Ayer et al., 1955).
//
// Returns { pReject(deltaU), bins: [{ lo, hi, value, n }], nViolations, n }.
// SHADOW-ONLY.

export function isotonicCalibrate(labeledPairs, opts = {}) {
  const valid = labeledPairs.filter(p => isNum(p.deltaU) && (p.label === 0 || p.label === 1));
  const n = valid.length;

  if (n === 0) {
    const fn = () => 0.5;
    return { pReject: fn, bins: [], nViolations: 0, n: 0 };
  }

  // Sort by deltaU ascending.
  const sorted = [...valid].sort((a, b) => a.deltaU - b.deltaU);

  // Group ties: average labels at identical deltaU values.
  const grouped = [];
  let i = 0;
  while (i < n) {
    let sum = sorted[i].label, count = 1;
    let j = i + 1;
    while (j < n && sorted[j].deltaU === sorted[i].deltaU) {
      sum += sorted[j].label;
      count++;
      j++;
    }
    grouped.push({ x: sorted[i].deltaU, y: sum / count, count });
    i = j;
  }

  const m = grouped.length;

  // Initialise one block per unique x.
  const blocks = grouped.map(g => ({
    sum: g.y * g.count,
    count: g.count,
    value: g.y,
    minX: g.x,
    maxX: g.x,
  }));

  let nViolations = 0;

  // PAV: scan left-to-right, pool when value[i] > value[i+1], then back up.
  let k = 0;
  while (k < blocks.length - 1) {
    if (blocks[k].value > blocks[k + 1].value) {
      nViolations++;
      // Pool k and k+1 into k.
      blocks[k].sum += blocks[k + 1].sum;
      blocks[k].count += blocks[k + 1].count;
      blocks[k].value = blocks[k].sum / blocks[k].count;
      blocks[k].maxX = blocks[k + 1].maxX;
      blocks.splice(k + 1, 1);
      // Back up to check if pooling created a new violation with predecessor.
      if (k > 0) k--;
    } else {
      k++;
    }
  }

  // Build bin list and step function.
  const bins = blocks.map(b => ({
    lo: b.minX,
    hi: b.maxX,
    value: b.value,
    n: b.count,
  }));

  const pReject = (deltaU) => {
    const ad = Math.abs(deltaU);
    for (const bin of bins) {
      if (ad <= bin.hi) return bin.value;
    }
    // Beyond last bin → clamp to last bin's value.
    return bins.length > 0 ? bins[bins.length - 1].value : 0.5;
  };

  return { pReject, bins, nViolations, n };
}

// ═══════════════════════════════════════════════════════════════════════════════
// 3. mondrianCoverage — Mondrian conformal coverage
// ═══════════════════════════════════════════════════════════════════════════════
//
// Partitions the calibration set by regime/event/weightHash (cellFn),
// computes per-cell conformalQuantile, and reports per-cell coverage.
//
// Nonconformity score = |deltaU|.  Larger |deltaU| → more extreme gate movement.
//
// Returns { cells: [{ regime, qhat, nCalib, coverage }], overallQhat, alpha }.
// SHADOW-ONLY.

export function mondrianCoverage(labeledPairs, opts = {}) {
  const alpha = opts.alpha ?? DEFAULT_ALPHA;
  const cellFn = opts.cellFn ?? (p => p.regime ?? 'unknown');

  // Partition pairs by cell key.
  const cellMap = new Map();
  for (const p of labeledPairs) {
    if (!isNum(p.deltaU)) continue;
    const key = cellFn(p);
    if (!cellMap.has(key)) cellMap.set(key, []);
    cellMap.get(key).push(p);
  }

  // All scores for overall qhat.
  const allScores = labeledPairs
    .filter(p => isNum(p.deltaU))
    .map(p => p.deltaU);

  const overallQhat = allScores.length > 0
    ? conformalQuantile(allScores, alpha)
    : 0;

  // Per-cell analysis.
  const cells = [];
  for (const [regime, pairs] of cellMap) {
    const scores = pairs.map(p => p.deltaU);
    const nCalib = scores.length;
    if (nCalib === 0) {
      cells.push({ regime, qhat: 0, nCalib: 0, coverage: 0 });
      continue;
    }
    const qhat = conformalQuantile(scores, alpha);
    const covered = scores.filter(s => s <= qhat).length;
    const coverage = covered / nCalib;
    cells.push({ regime, qhat, nCalib, coverage });
  }

  // Sort cells by nCalib descending for readability.
  cells.sort((a, b) => b.nCalib - a.nCalib);

  return { cells, overallQhat, alpha };
}

// ═══════════════════════════════════════════════════════════════════════════════
// 4. conformalPrediction — Conformal prediction set for a single firing
// ═══════════════════════════════════════════════════════════════════════════════
//
// Given a new firing's |deltaU| and the Mondrian qhat for its cell,
// returns whether the firing is covered by the conformal set.
//
// pValue (conformal p-value) is computed when calibScores (the cell's
// calibration nonconformity scores) are provided; otherwise null.
//
// Returns { covers, pValue, setSize }.
// SHADOW-ONLY — never feeds gateProposal.

export function conformalPrediction(deltaU, cellQhat, calibScores = []) {
  const ad = Math.abs(deltaU);
  const covers = ad <= cellQhat;

  let pValue = null;
  if (calibScores.length > 0) {
    // Conformal p-value: fraction of calibration scores ≥ the new score.
    // +1 in numerator and denominator (standard finite-sample correction).
    const n = calibScores.length;
    const rank = 1 + calibScores.filter(s => s >= ad).length;
    pValue = rank / (n + 1);
  }

  // setSize = the conformal threshold (radius of the "normal" region).
  const setSize = cellQhat;

  return { covers, pValue, setSize };
}

// ═══════════════════════════════════════════════════════════════════════════════
// 5. cLayerReport — Full C-layer report
// ═══════════════════════════════════════════════════════════════════════════════
//
// Runs Platt + isotonic + Mondrian over the shadow ledger, emits comparison
// and a corpus-size warning when n < CORPUS_MIN (500).
//
// Reads firings from the energy trace, pairs them with derived outcomes from
// the shadow ledger, and runs all three calibration methods.
//
// Records a meta-forecast to the conformal shadow file (NOT the live ledger).
//
// Returns { platt, isotonic, mondrian, corpusWarning, n }.
// SHADOW-ONLY.

export function cLayerReport(opts = {}) {
  const shadowFile = opts.shadowFile ?? DEFAULT_SHADOW_FILE;
  const alpha = opts.alpha ?? DEFAULT_ALPHA;

  // 1. Read trace firings (pass opts through for traceDir override).
  const firings = opts.firings ?? readFirings(opts);

  // 2. Build labeled pairs from shadow ledger + firings.
  const pairs = buildLabeledPairs(shadowFile, firings);
  const n = pairs.length;

  // 3. Corpus-size gate.
  const corpusWarning = n < CORPUS_MIN
    ? `corpus size ${n} < ${CORPUS_MIN} minimum for finite-sample guarantee`
    : null;

  // 4. Run all three calibration methods.
  const platt = plattCalibrate(pairs);
  const isotonic = isotonicCalibrate(pairs);
  const mondrian = mondrianCoverage(pairs, { alpha, cellFn: opts.cellFn });

  // 5. Record meta-forecast to conformal shadow (NEVER the live ledger).
  ensureDir(CONFORMAL_SHADOW_FILE);
  recordPrediction({
    subject: 'energy-conformal-c-layer',
    change: {
      n,
      alpha,
      corpusWarning: !!corpusWarning,
      plattConverged: platt.converged,
      isotonicBins: isotonic.bins.length,
      mondrianCells: mondrian.cells.length,
    },
    predictedEffects: [
      {
        target: 'platt-converged',
        effect: platt.converged ? 'yes' : 'no',
        confidence: platt.converged ? 0.95 : 0.5,
      },
      {
        target: 'isotonic-monotone',
        effect: 'yes',
        confidence: 0.99,
      },
      {
        target: 'mondrian-coverage',
        effect: 'within-alpha',
        confidence: 0.9,
      },
    ],
    source: 'yuri-energy-conformal',
    ts: new Date().toISOString(),
  }, { file: CONFORMAL_SHADOW_FILE });

  // 6. Return structured report.
  return {
    platt: {
      a: platt.a,
      b: platt.b,
      converged: platt.converged,
      logLikelihood: platt.logLikelihood,
      n: platt.n,
    },
    isotonic: {
      bins: isotonic.bins,
      nViolations: isotonic.nViolations,
      n: isotonic.n,
    },
    mondrian: {
      cells: mondrian.cells.map(c => ({
        regime: c.regime,
        qhat: c.qhat,
        nCalib: c.nCalib,
        coverage: c.coverage,
      })),
      overallQhat: mondrian.overallQhat,
      alpha: mondrian.alpha,
    },
    corpusWarning,
    n,
  };
}
