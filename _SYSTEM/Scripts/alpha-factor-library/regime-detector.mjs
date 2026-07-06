#!/usr/bin/env node
// @capability: regime-shift-detector
// @serves: regime shift | change point | correlation drift | commutativity drift | nonstationarity | recompute circuit
// @does: AFL FM-5 fix — a 3-layer composite regime-shift detector that flags when the market's statistical structure has shifted (CUSUM change-point on a caller-supplied regime signal, rolling correlation drift across keyed series, AND commutativity-class flips between two factor-circuit commutativity matrices). A regime shift can invalidate the Phase-2 commutativity structure / optimal ordering WITHOUT tripping a drawdown breaker — this catches it so the circuit can be recomputed.
// @use: reach here AFTER a factor circuit has been built/optimized (factor-circuit.mjs) to decide whether the cached commutativity structure + optimal ordering is still valid — call detectRegimeShift() on each new window of market data; recommendation==='RECOMPUTE_CIRCUIT' means rebuild the circuit. Composes math-kernel's cusum/pearson and factor-circuit's commutativity matrices — does NOT reimplement them.
// @exports: detectChangePoint, volatilitySignal, correlationDrift, commutativityRegimeShift, detectRegimeShift
/**
 * regime-detector.mjs — AFL FM-5 regime-shift detector.
 *
 * THE FAILURE IT FIXES (FM-5): the Phase-2 quantum sequencer (factor-circuit.mjs) computes a
 * commutativity structure and an optimal factor application order from the CURRENT market regime.
 * When the regime shifts — correlations decouple, volatility regime changes, the joint return
 * structure rotates — that cached structure can SILENTLY go stale. A regime shift does NOT
 * necessarily trip a drawdown breaker (you can lose your edge without yet losing money), so a
 * P&L / drawdown guard will not catch it. This detector watches the STATISTICAL STRUCTURE directly
 * and signals RECOMPUTE_CIRCUIT before the stale ordering does damage.
 *
 * THREE FAIL-SOFT LAYERS (each optional based on which inputs the caller supplies):
 *   Layer 1 — change point : cusum() over a caller-supplied regime signal (rolling-vol delta,
 *                            rolling-mean-return delta, …). Slow-drift change-point alarm.
 *   Layer 2 — correlation  : pearson(before) vs pearson(after) for every pair of keyed series;
 *                            a pair whose |Δcorr| exceeds threshold has decoupled/recoupled.
 *   Layer 3 — commutativity: fraction of factor pairs that switched commuting<->non-commuting class
 *                            between a BEFORE and AFTER buildCommutativityMatrix — the most direct
 *                            invalidation of the Phase-2 ordering (validation TEST-4).
 *
 * COMPOSE, don't reimplement (CAPABILITY-FIRST):
 *   math/math-kernel.mjs    : cusum (change-point), pearson (correlation drift)
 *   factor-circuit.mjs      : buildCommutativityMatrix supplies the matrices Layer 3 compares
 *
 * HARD CONSTRAINTS (YURI-OS): ESM .mjs, fileURLToPath for paths, no commit/push, no protected
 * paths. Writes only this file. Advisory until local evidence verifies it.
 */

import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { cusum, pearson } from '../math/math-kernel.mjs';

const _HERE = path.dirname(fileURLToPath(import.meta.url));

const DEFAULT_CORR_THRESHOLD = 0.30; // |Δcorr| above this = a pair has drifted
const DEFAULT_DRIFT_FRACTION = 0.30; // fraction of pairs drifting that flips the composite
const DEFAULT_CLASS_FLIP = 0.30;     // fraction of pairs flipping commutativity class that flips the composite
const DEFAULT_COMM_TOL = 1e-9;       // commutator < tol => commuting (matches factor-circuit default)

// ───────────────────────────────────────────────────────────────────────────
// §1 — LAYER 1: CHANGE-POINT (thin CUSUM wrapper)
// ───────────────────────────────────────────────────────────────────────────

/**
 * detectChangePoint(signedStream, opts) -> { alarm, changeIndex, statistic }
 *
 * Thin wrapper over math-kernel's one-sided UPPER cusum on a SIGNED regime-signal stream the caller
 * supplies (e.g. a rolling-volatility delta or rolling-mean-return delta series). A persistent
 * positive shift in the signal accumulates past h and alarms — the slow-drift change point a single
 * outlier test would miss. Reads through cusum's exact return shape; surfaces only the contract trio.
 *
 * opts: { k = slack/reference allowance, h = decision threshold (must be > 0), mu0 = target mean }.
 * Defaults pick a mild slack so a genuine sustained shift alarms while small noise does not:
 *   k defaults to 0.5 (half-sigma slack), h defaults to 5 (≈ a few sustained excursions), mu0 = 0.
 */
export function detectChangePoint(signedStream, opts = {}) {
  const stream = Array.isArray(signedStream) ? signedStream : [];
  if (stream.length === 0) {
    return { alarm: false, changeIndex: -1, statistic: 0, direction: null };
  }
  // Non-finite guard (peer-review/DeepSeek fix): a NaN/Infinity in the stream makes cusum's running
  // sum NaN -> statistic NaN -> alarm:false, SILENTLY disabling the change-point layer (a poisoned
  // breaker that reports "nothing found"). Surface it as explicitly INOPERATIVE instead of a false all-clear.
  if (!stream.every((x) => Number.isFinite(x))) {
    return { alarm: false, changeIndex: -1, statistic: 0, direction: null, inoperative: true, reason: 'invalid-stream' };
  }
  const k = Number.isFinite(opts.k) ? opts.k : 0.5;
  const h = Number.isFinite(opts.h) && opts.h > 0 ? opts.h : 5;
  const mu0 = Number.isFinite(opts.mu0) ? opts.mu0 : 0;
  // TWO-SIDED (red-team CRITICAL fix): math-kernel cusum is one-sided UPPER — S_t clamps negative
  // excursions at 0, so a sustained DOWNWARD shift (edge erosion, a crash regime) never accumulates
  // and is SILENTLY MISSED. Run cusum on the stream AND its negation and OR the alarms so a sustained
  // shift in EITHER direction trips. (The dangerous miss is the downward one — never ship a one-sided
  // regime breaker.) For a VOLATILITY regime (symmetric, zero-mean), feed volatilitySignal() first.
  const up = cusum(stream, { k, h, mu0 });
  const down = cusum(stream.map((x) => -x), { k, h, mu0: -mu0 });
  const alarm = up.alarm || down.alarm;
  const statistic = Math.max(up.statistic || 0, down.statistic || 0);
  let changeIndex = -1;
  let direction = null;
  if (up.alarm && down.alarm) { direction = 'both'; changeIndex = Math.min(up.changeIndex, down.changeIndex); }
  else if (up.alarm) { direction = 'up'; changeIndex = up.changeIndex; }
  else if (down.alarm) { direction = 'down'; changeIndex = down.changeIndex; }
  return {
    alarm, changeIndex, statistic, direction,
    upper: { alarm: up.alarm, statistic: up.statistic },
    lower: { alarm: down.alarm, statistic: down.statistic },
  };
}

/**
 * volatilitySignal(stream, {window}) -> FIRST-DIFFERENCE of rolling stddev (≈ zero-mean). Raw signed
 * CUSUM cannot see a VOLATILITY regime shift (a symmetric, zero-mean amplitude change has the same
 * mean). The fix is NOT to feed raw rolling stddev — that is non-negative with a positive mean, so a
 * two-sided cusum at mu0=0 would false-alarm on CONSTANT vol (up-CUSUM) AND stay blind to a vol DROP
 * (negated signal ≤ 0 never accumulates). Instead emit the step-to-step CHANGE in rolling stddev: a
 * vol RISE -> positive spike (up-CUSUM), a vol DROP -> negative spike (down-CUSUM) — both caught by
 * the two-sided detectChangePoint at the default mu0=0. (peer-review/Mimo HIGH fix: the raw-stddev
 * composition was mathematically broken.)
 */
export function volatilitySignal(stream, { window = 5 } = {}) {
  const s = Array.isArray(stream) ? stream : [];
  if (window < 2 || s.length < window) return [];
  const out = [];
  let prevVol = null;
  for (let i = window - 1; i < s.length; i++) {
    const w = s.slice(i - window + 1, i + 1);
    const m = w.reduce((a, b) => a + b, 0) / w.length;
    const v = w.reduce((a, b) => a + (b - m) * (b - m), 0) / w.length;
    const vol = Math.sqrt(v);
    out.push(prevVol === null ? 0 : vol - prevVol); // first-difference -> ~zero-mean change stream
    prevVol = vol;
  }
  return out;
}

// ───────────────────────────────────────────────────────────────────────────
// §2 — LAYER 2: CORRELATION DRIFT (pairwise pearson before vs after)
// ───────────────────────────────────────────────────────────────────────────

/**
 * correlationDrift(seriesByKeyBefore, seriesByKeyAfter, opts) ->
 *   { driftFraction, flippedPairs: [{ pair, before, after, delta }] }
 *
 * For every UNORDERED pair of keys present in BOTH the before and after maps, computes
 * pearson(before_i, before_j) vs pearson(after_i, after_j). A pair whose |after − before| exceeds
 * opts.threshold (default 0.30) is flagged as drifted — its co-movement structure changed, which is
 * exactly what stales a correlation-derived factor circuit. driftFraction = flagged / total pairs.
 *
 * FAIL-SOFT: pearson already returns 0 on constant / <2-length input; a pair whose two before-series
 * (or after-series) have mismatched lengths is SKIPPED (can't correlate) rather than throwing, so a
 * single ragged series never breaks the layer. A key present in only one map is ignored.
 */
export function correlationDrift(seriesByKeyBefore, seriesByKeyAfter, opts = {}) {
  const before = (seriesByKeyBefore && typeof seriesByKeyBefore === 'object') ? seriesByKeyBefore : {};
  const after = (seriesByKeyAfter && typeof seriesByKeyAfter === 'object') ? seriesByKeyAfter : {};
  const threshold = Number.isFinite(opts.threshold) ? opts.threshold : DEFAULT_CORR_THRESHOLD;
  // A correlation that REVERSES SIGN (e.g. +0.10 -> -0.10) is a full co-movement inversion — a genuine
  // decoupling that stales an ordering — yet its |Δ| (0.20) can sit UNDER the magnitude threshold.
  // Flag a sign reversal when BOTH magnitudes clear a small significance floor. (red-team MEDIUM fix.)
  const signFloor = Number.isFinite(opts.signFloor) ? opts.signFloor : 0.1;

  // Keys present in BOTH maps with array-valued series (the only pairs we can compare).
  const keys = Object.keys(before).filter(
    (k) => Array.isArray(before[k]) && Array.isArray(after[k]),
  );

  const flippedPairs = [];
  const signFlips = [];
  let totalPairs = 0;
  let maxAbsDelta = 0; // L∞ severity: the single worst pair, so a concentrated decoupling can't hide
  for (let i = 0; i < keys.length; i++) {
    for (let j = i + 1; j < keys.length; j++) {
      const ki = keys[i];
      const kj = keys[j];
      const bi = before[ki];
      const bj = before[kj];
      const ai = after[ki];
      const aj = after[kj];
      // pearson requires equal-length, non-empty arrays; skip ragged pairs (fail-soft, no throw).
      if (bi.length < 1 || bj.length < 1 || ai.length < 1 || aj.length < 1) continue;
      if (bi.length !== bj.length || ai.length !== aj.length) continue;
      let corrBefore;
      let corrAfter;
      try {
        corrBefore = pearson(bi, bj);
        corrAfter = pearson(ai, aj);
      } catch {
        // A non-finite entry in a series makes the pair uncomparable — skip it, don't crash the layer.
        continue;
      }
      totalPairs += 1;
      const delta = corrAfter - corrBefore;
      const adelta = Math.abs(delta);
      if (adelta > maxAbsDelta) maxAbsDelta = adelta;
      const signFlip = Math.sign(corrBefore) !== Math.sign(corrAfter)
        && Math.min(Math.abs(corrBefore), Math.abs(corrAfter)) >= signFloor;
      if (adelta > threshold || signFlip) {
        const rec = { pair: [ki, kj], before: corrBefore, after: corrAfter, delta };
        if (signFlip) rec.signFlip = true;
        flippedPairs.push(rec);
        if (signFlip) signFlips.push(rec);
      }
    }
  }

  const driftFraction = totalPairs > 0 ? flippedPairs.length / totalPairs : 0;
  return { driftFraction, flippedPairs, maxAbsDelta, signFlips };
}

// ───────────────────────────────────────────────────────────────────────────
// §3 — LAYER 3: COMMUTATIVITY REGIME SHIFT (class flips between two matrices)
// ───────────────────────────────────────────────────────────────────────────

/**
 * commutativityRegimeShift(commMatrixBefore, commMatrixAfter, opts) ->
 *   { classFlipFraction, flipped: [{ i, j, before, after }] }
 *
 * Compares two commutativity matrices (the .matrix field of buildCommutativityMatrix, or a raw 2-D
 * array of commutator norms) over the SAME factor set. For each unordered factor pair (i,j) it
 * classifies commuting (norm < tol) vs non-commuting (norm >= tol) in BEFORE and AFTER; a pair whose
 * class changed is a flip. classFlipFraction = flipped / total pairs. A high fraction means the
 * Phase-2 ordering assumptions no longer hold — the single most direct invalidation signal.
 *
 * FAIL-SOFT: unwraps either {matrix} or a bare 2-D array; if shapes mismatch or there are <2 factors
 * it returns a zero result rather than throwing. Only the common upper-triangle indices are compared.
 */
export function commutativityRegimeShift(commMatrixBefore, commMatrixAfter, opts = {}) {
  const tol = Number.isFinite(opts.tol) ? opts.tol : DEFAULT_COMM_TOL;
  const A = unwrapMatrix(commMatrixBefore);
  const B = unwrapMatrix(commMatrixAfter);

  // Factor-set CHANGE = structural invalidation (peer-review/Mimo+DeepSeek MEDIUM fix). The old
  // min(dim) truncation compared only the common submatrix, so a NEW or DROPPED factor (and all its
  // commutator relationships) was invisible — yet the Phase-2 ordering was computed over the FULL set,
  // so any factor appearing/disappearing invalidates it. Fail SAFE: force a recompute.
  const dimA = matrixDim(A);
  const dimB = matrixDim(B);
  if (dimA !== dimB) {
    return {
      classFlipFraction: 1,
      flipped: [{ i: -1, j: -1, before: `dim=${dimA}`, after: `dim=${dimB}` }],
      dimensionChanged: true,
    };
  }

  const n = Math.min(dimA, dimB);
  if (n < 2) return { classFlipFraction: 0, flipped: [] };

  const flipped = [];
  let totalPairs = 0;
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const aVal = cellOrNull(A, i, j);
      const bVal = cellOrNull(B, i, j);
      // A missing/non-finite cell on either side makes this pair uncomparable — skip (fail-soft).
      if (aVal === null || bVal === null) continue;
      totalPairs += 1;
      const beforeCommutes = aVal < tol;
      const afterCommutes = bVal < tol;
      if (beforeCommutes !== afterCommutes) {
        flipped.push({
          i,
          j,
          before: beforeCommutes ? 'commuting' : 'non-commuting',
          after: afterCommutes ? 'commuting' : 'non-commuting',
        });
      }
    }
  }

  const classFlipFraction = totalPairs > 0 ? flipped.length / totalPairs : 0;
  return { classFlipFraction, flipped };
}

// ───────────────────────────────────────────────────────────────────────────
// §4 — COMPOSITE: detectRegimeShift
// ───────────────────────────────────────────────────────────────────────────

/**
 * detectRegimeShift(input, opts) ->
 *   { regimeShift, layers: { changePoint?, correlationDrift?, commutativity? }, reasons, recommendation }
 *
 * Composite over the three layers. Each layer runs ONLY if its inputs are supplied (fail-soft: a
 * missing layer is silently absent from `layers` and never throws). The composite verdict is OR over:
 *   Layer 1: changePoint.alarm
 *   Layer 2: correlationDrift.driftFraction > opts.driftFraction (default 0.30)
 *   Layer 3: commutativity.classFlipFraction > opts.classFlip (default 0.30)
 *
 * input fields (all optional):
 *   - signedStream            : number[]  -> Layer 1 change-point signal
 *   - seriesByKeyBefore /
 *     seriesByKeyAfter        : {k:number[]} -> Layer 2 correlation drift
 *   - commMatrixBefore /
 *     commMatrixAfter         : {matrix}|number[][] -> Layer 3 commutativity flips
 *
 * opts: { changePoint:{k,h,mu0}, correlation:{threshold}, commutativity:{tol},
 *         driftFraction = 0.30, classFlip = 0.30 }
 *
 * recommendation = 'RECOMPUTE_CIRCUIT' when regimeShift is true, else 'CIRCUIT_VALID'.
 */
export function detectRegimeShift(input = {}, opts = {}) {
  const inp = (input && typeof input === 'object') ? input : {};
  const driftFractionGate = Number.isFinite(opts.driftFraction) ? opts.driftFraction : DEFAULT_DRIFT_FRACTION;
  const classFlipGate = Number.isFinite(opts.classFlip) ? opts.classFlip : DEFAULT_CLASS_FLIP;

  const layers = {};
  const reasons = [];

  // ── Layer 1: change point (only if a signed stream is supplied) ──
  if (Array.isArray(inp.signedStream) && inp.signedStream.length > 0) {
    let cp;
    try {
      cp = detectChangePoint(inp.signedStream, opts.changePoint || {});
    } catch (e) {
      cp = { alarm: false, changeIndex: -1, statistic: 0, error: String((e && e.message) || e) };
    }
    layers.changePoint = cp;
    if (cp.alarm) {
      reasons.push(`change-point CUSUM alarm at index ${cp.changeIndex} (statistic ${round6(cp.statistic)})`);
    }
  }

  // ── Layer 2: correlation drift (only if both before/after series maps are supplied) ──
  if (isPopulatedObject(inp.seriesByKeyBefore) && isPopulatedObject(inp.seriesByKeyAfter)) {
    let cd;
    try {
      cd = correlationDrift(inp.seriesByKeyBefore, inp.seriesByKeyAfter, opts.correlation || {});
    } catch (e) {
      cd = { driftFraction: 0, flippedPairs: [], error: String((e && e.message) || e) };
    }
    layers.correlationDrift = cd;
    // Trip on ANY of: the fraction gate, an L∞ single-pair ceiling (a concentrated decoupling that the
    // fraction-of-pairs gate masks in a large universe — partition-fungibility, the recurring YURI
    // delta-gate lesson), or any qualifying sign reversal. (red-team MEDIUM x2 fix.)
    const maxPairDelta = Number.isFinite(opts.maxPairDelta) ? opts.maxPairDelta : 0.7;
    const fractionTrip = cd.driftFraction > driftFractionGate;
    const linfTrip = (cd.maxAbsDelta || 0) > maxPairDelta;
    const signTrip = Array.isArray(cd.signFlips) && cd.signFlips.length > 0;
    if (fractionTrip || linfTrip || signTrip) {
      const why = [];
      if (fractionTrip) why.push(`driftFraction ${round6(cd.driftFraction)} > ${driftFractionGate}`);
      if (linfTrip) why.push(`max single-pair |Δcorr| ${round6(cd.maxAbsDelta)} > ${maxPairDelta} (L∞ escape)`);
      if (signTrip) why.push(`${cd.signFlips.length} correlation sign-reversal(s)`);
      reasons.push(`correlation drift — ${why.join('; ')} (${cd.flippedPairs.length} pair(s) flagged)`);
    }
  }

  // ── Layer 3: commutativity class flips (only if both matrices are supplied) ──
  if (inp.commMatrixBefore != null && inp.commMatrixAfter != null) {
    let cf;
    try {
      cf = commutativityRegimeShift(inp.commMatrixBefore, inp.commMatrixAfter, opts.commutativity || {});
    } catch (e) {
      cf = { classFlipFraction: 0, flipped: [], error: String((e && e.message) || e) };
    }
    layers.commutativity = cf;
    if (cf.classFlipFraction > classFlipGate) {
      reasons.push(
        `commutativity class flips ${round6(cf.classFlipFraction)} > ${classFlipGate} `
        + `(${cf.flipped.length} pair(s) changed commuting class) — Phase-2 ordering invalidated`,
      );
    }
  }

  const regimeShift = reasons.length > 0;
  return {
    regimeShift,
    layers,
    reasons,
    recommendation: regimeShift ? 'RECOMPUTE_CIRCUIT' : 'CIRCUIT_VALID',
  };
}

// ───────────────────────────────────────────────────────────────────────────
// §5 — small helpers
// ───────────────────────────────────────────────────────────────────────────

function unwrapMatrix(m) {
  if (m && Array.isArray(m.matrix)) return m.matrix;
  if (Array.isArray(m)) return m;
  return [];
}

function matrixDim(m) {
  return Array.isArray(m) ? m.length : 0;
}

function cellOrNull(m, i, j) {
  const row = m[i];
  if (!Array.isArray(row)) return null;
  const v = row[j];
  return Number.isFinite(v) ? v : null;
}

function isPopulatedObject(o) {
  return o != null && typeof o === 'object' && Object.keys(o).length > 0;
}

function round6(x) {
  return Number.isFinite(x) ? Number(x.toFixed(6)) : x;
}

// ───────────────────────────────────────────────────────────────────────────
// §6 — SMOKE TEST (node regime-detector.mjs --smoke)
// ───────────────────────────────────────────────────────────────────────────

function smoke() {
  const out = { tests: {} };

  // (a) TWO CORRELATION REGIMES: pre = highly correlated, post = decorrelated.
  //     Build before-series that move together and after-series that move independently.
  {
    // Three keys. Before: all three follow the SAME signal (high pairwise correlation).
    const base = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
    const before = {
      a: base.map((x) => x + 0.01 * Math.sin(x)),
      b: base.map((x) => x + 0.02 * Math.cos(x)),
      c: base.map((x) => x - 0.01 * Math.sin(x * 1.3)),
    };
    // After: each key follows a DIFFERENT, near-orthogonal pattern (decorrelated).
    const after = {
      a: [3, -2, 5, -1, 4, -3, 2, -5, 1, -4, 3, -2],
      b: [-1, 4, -2, 5, -3, 1, -5, 2, -4, 3, -1, 4],
      c: [2, 2, -2, -2, 2, 2, -2, -2, 2, 2, -2, -2],
    };
    const cd = correlationDrift(before, after, { threshold: 0.30 });
    const det = detectRegimeShift({ seriesByKeyBefore: before, seriesByKeyAfter: after });
    out.tests.a_correlationRegimes = {
      driftFraction: round6(cd.driftFraction),
      flippedPairCount: cd.flippedPairs.length,
      samplePair: cd.flippedPairs[0]
        ? { pair: cd.flippedPairs[0].pair, before: round6(cd.flippedPairs[0].before), after: round6(cd.flippedPairs[0].after), delta: round6(cd.flippedPairs[0].delta) }
        : null,
      regimeShift: det.regimeShift,
      recommendation: det.recommendation,
      pass: cd.driftFraction > 0.30 && det.regimeShift === true,
    };
  }

  // (b) STATIONARY stream: cusum should NOT alarm, detectRegimeShift false.
  {
    // A zero-mean, small-noise signed stream around 0 — no sustained shift.
    const stationary = [0.1, -0.2, 0.15, -0.05, 0.2, -0.1, 0.05, -0.15, 0.1, -0.2, 0.12, -0.08, 0.05, -0.1];
    const cp = detectChangePoint(stationary, { k: 0.5, h: 5, mu0: 0 });
    const det = detectRegimeShift({ signedStream: stationary });
    out.tests.b_stationary = {
      alarm: cp.alarm,
      changeIndex: cp.changeIndex,
      statistic: round6(cp.statistic),
      regimeShift: det.regimeShift,
      recommendation: det.recommendation,
      pass: cp.alarm === false && det.regimeShift === false,
    };
  }

  // (b2) CONTROL: a clearly-shifted stream SHOULD alarm (proves the stationary pass isn't a dead detector).
  {
    const shifted = [0.1, -0.2, 0.15, -0.05, 0.2, 2, 2.2, 2.1, 2.3, 2.0, 2.4, 2.1, 2.2, 2.3];
    const cp = detectChangePoint(shifted, { k: 0.5, h: 5, mu0: 0 });
    const det = detectRegimeShift({ signedStream: shifted });
    out.tests.b2_shiftedControl = {
      alarm: cp.alarm,
      changeIndex: cp.changeIndex,
      statistic: round6(cp.statistic),
      regimeShift: det.regimeShift,
      pass: cp.alarm === true && det.regimeShift === true,
    };
  }

  // (c) COMMUTATIVITY: a before/after matrix where >30% of pairs flip commuting class.
  {
    // 4 factors => 6 pairs. tol = 0.1.
    // BEFORE: most pairs commuting (norm 0), a couple non-commuting.
    const tol = 0.1;
    const matBefore = [
      [0, 0.00, 0.00, 0.5],
      [0.00, 0, 0.00, 0.00],
      [0.00, 0.00, 0, 0.00],
      [0.5, 0.00, 0.00, 0],
    ];
    // AFTER: regime shifted — pairs (0,1),(0,2),(1,2) now non-commuting; (0,3) now commuting.
    const matAfter = [
      [0, 0.6, 0.7, 0.00],
      [0.6, 0, 0.8, 0.00],
      [0.7, 0.8, 0, 0.00],
      [0.00, 0.00, 0.00, 0],
    ];
    const cf = commutativityRegimeShift(matBefore, matAfter, { tol });
    const det = detectRegimeShift({ commMatrixBefore: matBefore, commMatrixAfter: matAfter }, { commutativity: { tol } });
    out.tests.c_commutativity = {
      classFlipFraction: round6(cf.classFlipFraction),
      flippedCount: cf.flipped.length,
      totalPairs: 6,
      flipped: cf.flipped.map((f) => ({ pair: [f.i, f.j], before: f.before, after: f.after })),
      regimeShift: det.regimeShift,
      recommendation: det.recommendation,
      pass: cf.classFlipFraction > 0.30 && det.regimeShift === true,
    };
  }

  // (d) Composite ALL-CLEAR control: stationary + low-drift + no commutativity flips => CIRCUIT_VALID.
  {
    const stationary = [0.1, -0.1, 0.05, -0.05, 0.1, -0.1, 0.05, -0.05];
    const before = {
      a: [1, 2, 3, 4, 5, 6, 7, 8],
      b: [2, 4, 6, 8, 10, 12, 14, 16],
    };
    // after barely changes => low drift
    const after = {
      a: [1, 2, 3, 4, 5, 6, 7, 8],
      b: [2.01, 4.02, 5.98, 8.01, 9.99, 12.02, 13.98, 16.01],
    };
    const matBefore = [[0, 0.5], [0.5, 0]];
    const matAfter = [[0, 0.5], [0.5, 0]]; // no class flip
    const det = detectRegimeShift(
      { signedStream: stationary, seriesByKeyBefore: before, seriesByKeyAfter: after, commMatrixBefore: matBefore, commMatrixAfter: matAfter },
      { commutativity: { tol: 0.1 } },
    );
    out.tests.d_allClearComposite = {
      regimeShift: det.regimeShift,
      recommendation: det.recommendation,
      activeLayers: Object.keys(det.layers),
      reasons: det.reasons,
      pass: det.regimeShift === false && det.recommendation === 'CIRCUIT_VALID' && Object.keys(det.layers).length === 3,
    };
  }

  // (e) FAIL-SOFT: empty input never throws, no layers, CIRCUIT_VALID.
  {
    let threw = false;
    let det;
    try { det = detectRegimeShift({}); } catch { threw = true; }
    out.tests.e_failSoftEmpty = {
      threw,
      regimeShift: det?.regimeShift,
      activeLayers: det ? Object.keys(det.layers) : null,
      recommendation: det?.recommendation,
      pass: threw === false && det.regimeShift === false && Object.keys(det.layers).length === 0,
    };
  }

  const allPass = Object.values(out.tests).every((t) => t.pass === true);
  out.allPass = allPass;
  console.log(JSON.stringify(out, null, 2));
  return out;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (process.argv.includes('--smoke')) {
    const res = smoke();
    process.exit(res.allPass ? 0 : 1);
  } else {
    console.log('regime-detector: AFL FM-5 regime-shift detector (change-point + correlation drift + commutativity class flips).');
    console.log('  node regime-detector.mjs --smoke');
    console.log('  import { detectRegimeShift, detectChangePoint, correlationDrift, commutativityRegimeShift } from "./regime-detector.mjs"');
  }
}
