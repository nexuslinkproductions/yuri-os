#!/usr/bin/env node
/**
 * afl-critical-gaps.test.mjs — node:test suite for the two AFL critical-gap fixes:
 *   data-quality-gate.mjs (FM-3 ingest gate) and regime-detector.mjs (FM-5 regime-shift detector).
 *
 * These two modules COMPOSE math-kernel primitives (scalarKalman NIS gate, cusum change-point,
 * pearson correlation) and factor-circuit's buildCommutativityMatrix. This suite does NOT
 * re-test those primitives in isolation — it tests the GAP-FIX behavior the modules add on top:
 *
 *   data-quality-gate:
 *     (1) validateBar HARD-rejects each malformed case (high<low, OC out of range, vol<0, non-finite)
 *     (2) validateSeries catches a Kalman-NIS outlier spike but NOT clean bars; detects non-monotone ts
 *     (3) dataQualityGate pass:true on clean, pass:false on hard-rejects, FAIL-CLOSED on garbage
 *
 *   regime-detector:
 *     (4) detectChangePoint alarms on a real level shift, silent on a stationary stream
 *     (5) correlationDrift.driftFraction HIGH across a correlation regime change, ~0 on stable
 *     (6) commutativityRegimeShift.classFlipFraction correct on a known before/after
 *     (7) detectRegimeShift composite true/false per layer + recommendation
 *
 * HARD CONSTRAINTS (YURI-OS): ESM .mjs, fileURLToPath for paths. Reads/writes only this file.
 *
 * Run: node --test _SYSTEM/Scripts/alpha-factor-library/afl-critical-gaps.test.mjs
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const _HERE = path.dirname(fileURLToPath(import.meta.url));

const {
  validateBar, validateSeries, dataQualityGate,
} = await import(path.join(_HERE, 'data-quality-gate.mjs'));

const {
  detectChangePoint, volatilitySignal, correlationDrift, commutativityRegimeShift, detectRegimeShift,
} = await import(path.join(_HERE, 'regime-detector.mjs'));

const { buildCommutativityMatrix } = await import(path.join(_HERE, 'factor-circuit.mjs'));

// ───────────────────────────────────────────────────────────────────────────
// shared fixtures
// ───────────────────────────────────────────────────────────────────────────

function round6(x) { return Number(x.toFixed(6)); }

/**
 * A smooth synthetic OHLCV series with gentle deterministic drift + tiny bounded
 * wiggle so closes move but no single bar is a statistical outlier; honest
 * high/low straddle, positive volume, strictly increasing timestamps. Mirrors the
 * module's own makeCleanSeries so the "clean" baseline is the intended-clean shape.
 */
function makeCleanSeries(nBars = 60, { start = 100, drift = 0.05, ts0 = 1_700_000_000_000, tsStep = 60_000 } = {}) {
  const bars = [];
  let level = start;
  for (let i = 0; i < nBars; i++) {
    const wiggle = Math.sin(i * 0.7) * 0.15;
    const open = level;
    const close = level + drift + wiggle;
    const high = Math.max(open, close) + 0.2;
    const low = Math.min(open, close) - 0.2;
    bars.push({
      open: round6(open),
      high: round6(high),
      low: round6(low),
      close: round6(close),
      volume: 1000 + i,
      timestamp: ts0 + i * tsStep,
    });
    level = close;
  }
  return bars;
}

// ═══════════════════════════════════════════════════════════════════════════
// (1) validateBar — HARD-rejects each malformed case
// ═══════════════════════════════════════════════════════════════════════════

test('(1a) validateBar accepts a structurally-valid bar', () => {
  const good = validateBar({ open: 10, high: 12, low: 9, close: 11, volume: 100 });
  assert.equal(good.ok, true);
  assert.deepEqual(good.rejects, []);
});

test('(1b) validateBar hard-rejects high < low (inverted range)', () => {
  const r = validateBar({ open: 100, high: 99, low: 101, close: 100, volume: 500 });
  assert.equal(r.ok, false);
  assert.ok(r.rejects.includes('high-lt-low'), `expected high-lt-low in ${JSON.stringify(r.rejects)}`);
});

test('(1c) validateBar hard-rejects open & close outside [low,high]', () => {
  const openOut = validateBar({ open: 50, high: 12, low: 9, close: 11, volume: 100 });
  assert.equal(openOut.ok, false);
  assert.ok(openOut.rejects.includes('open-outside-range'), JSON.stringify(openOut.rejects));

  const closeOut = validateBar({ open: 10, high: 12, low: 9, close: 99, volume: 100 });
  assert.equal(closeOut.ok, false);
  assert.ok(closeOut.rejects.includes('close-outside-range'), JSON.stringify(closeOut.rejects));
});

test('(1d) validateBar hard-rejects negative volume', () => {
  const r = validateBar({ open: 10, high: 12, low: 9, close: 11, volume: -42 });
  assert.equal(r.ok, false);
  assert.ok(r.rejects.includes('negative-volume'), JSON.stringify(r.rejects));
});

test('(1e) validateBar hard-rejects non-finite fields, NaN-safe (no cascade)', () => {
  // NaN high: only 'non-finite-high' should fire — NOT a misleading 'high-lt-low'
  // (NaN comparisons are false, the finite-first guard suppresses the range check).
  const nanHigh = validateBar({ open: 10, high: NaN, low: 9, close: 11, volume: 100 });
  assert.equal(nanHigh.ok, false);
  assert.deepEqual(nanHigh.rejects, ['non-finite-high']);

  // Each O/H/L/C/V non-finite case independently hard-rejects.
  for (const [field, bad] of [
    ['open', { open: Infinity, high: 12, low: 9, close: 11, volume: 100 }],
    ['close', { open: 10, high: 12, low: 9, close: NaN, volume: 100 }],
    ['volume', { open: 10, high: 12, low: 9, close: 11, volume: undefined }],
    ['low', { open: 10, high: 12, low: NaN, close: 11, volume: 100 }],
  ]) {
    const r = validateBar(bad);
    assert.equal(r.ok, false, `${field} should reject`);
    assert.ok(r.rejects.includes(`non-finite-${field}`), `${field}: ${JSON.stringify(r.rejects)}`);
  }

  // Non-finite optional timestamp is also a hard reject.
  const badTs = validateBar({ open: 10, high: 12, low: 9, close: 11, volume: 100, timestamp: Infinity });
  assert.equal(badTs.ok, false);
  assert.ok(badTs.rejects.includes('non-finite-timestamp'), JSON.stringify(badTs.rejects));

  // A non-object bar fails closed with a single stable reason.
  const notObj = validateBar(null);
  assert.equal(notObj.ok, false);
  assert.deepEqual(notObj.rejects, ['non-object-bar']);
});

// ═══════════════════════════════════════════════════════════════════════════
// (2) validateSeries — Kalman-NIS outlier spike caught, clean bars NOT;
//     non-monotone timestamps detected
// ═══════════════════════════════════════════════════════════════════════════

test('(2a) validateSeries flags a Kalman-NIS outlier spike, leaves clean bars unflagged + unrejected', () => {
  const bars = makeCleanSeries(60);
  // Bar 30: a ~100x close spike that still respects high/low (NOT a hard reject) —
  // the ONLY thing wrong is that it's a statistical outlier, so the NIS gate must catch it.
  const spikeClose = 100 * 100;
  bars[30] = {
    open: bars[30].open,
    high: spikeClose + 1,
    low: Math.min(bars[30].low, bars[30].open),
    close: spikeClose,
    volume: bars[30].volume,
    timestamp: bars[30].timestamp,
  };

  const res = validateSeries(bars);

  // The spike is NOT a hard reject (it's structurally valid, just an outlier).
  assert.equal(res.rejected.length, 0, `spike must not hard-reject: ${JSON.stringify(res.rejected)}`);
  // The Kalman filter ran and flagged at least one bar (the spike, or the bar after it as the
  // estimate snaps back — either is a legitimate NIS flag at/around index 30).
  assert.equal(res.stats.kalmanRan, true);
  assert.ok(res.flagged.length >= 1, 'expected >=1 statistical flag for the spike');
  const flaggedNearSpike = res.flagged.some((f) => f.index === 30 || f.index === 31);
  assert.ok(flaggedNearSpike, `flag should land at/after the spike: ${JSON.stringify(res.flagged.map((f) => f.index))}`);
  // Flag carries a NIS above the chi-sq(1) gate.
  const spikeFlag = res.flagged.find((f) => f.index === 30 || f.index === 31);
  assert.ok(spikeFlag.nis > res.stats.threshold, `flag NIS ${spikeFlag.nis} must exceed gate ${res.stats.threshold}`);
});

test('(2b) validateSeries does NOT flag a fully-clean series (negative control)', () => {
  const bars = makeCleanSeries(60);
  const res = validateSeries(bars);
  assert.equal(res.rejected.length, 0);
  assert.equal(res.nonMonotonic.length, 0);
  assert.equal(res.stats.kalmanRan, true, 'filter should run on a 60-bar clean series');
  // The whole point of the gate: a clean series produces ZERO outlier flags.
  assert.equal(res.flagged.length, 0, `clean series must not flag: ${JSON.stringify(res.flagged)}`);
});

test('(2c) validateSeries detects non-monotone (out-of-order) timestamps', () => {
  const bars = makeCleanSeries(60);
  // Swap two timestamps so the series is no longer strictly increasing.
  const t = bars[40].timestamp;
  bars[40].timestamp = bars[42].timestamp;
  bars[42].timestamp = t;
  const res = validateSeries(bars);
  assert.equal(res.stats.hasTimestamps, true);
  assert.ok(res.nonMonotonic.length >= 1, `expected >=1 non-monotone index: ${JSON.stringify(res.nonMonotonic)}`);
});

test('(2d) validateSeries flags a duplicate timestamp under strictMonotonic (default)', () => {
  const bars = makeCleanSeries(10);
  bars[5].timestamp = bars[4].timestamp; // equal ts => non-strictly-increasing
  const strict = validateSeries(bars);
  assert.ok(strict.nonMonotonic.includes(5), `strict should flag the dup: ${JSON.stringify(strict.nonMonotonic)}`);
  // Under non-strict monotonicity, an EQUAL timestamp is allowed (only a backwards ts is bad).
  const loose = validateSeries(bars, { strictMonotonic: false });
  assert.ok(!loose.nonMonotonic.includes(5), `non-strict should allow equal ts: ${JSON.stringify(loose.nonMonotonic)}`);
});

// ═══════════════════════════════════════════════════════════════════════════
// (3) dataQualityGate — pass on clean, fail on hard-rejects, fail-closed on garbage
// ═══════════════════════════════════════════════════════════════════════════

test('(3a) dataQualityGate pass:true on a clean series', () => {
  const g = dataQualityGate(makeCleanSeries(60));
  assert.equal(g.pass, true);
  assert.equal(g.rejectCount, 0);
  assert.equal(g.nonMonotonicCount, 0);
  assert.equal(g.report.reason, 'clean');
});

test('(3b) dataQualityGate pass:false when a bar hard-rejects (high<low + negative volume)', () => {
  const bars = makeCleanSeries(60);
  bars[10] = { open: 100, high: 99, low: 101, close: 100, volume: 500, timestamp: bars[10].timestamp };
  bars[20] = { ...bars[20], volume: -42 };
  const g = dataQualityGate(bars);
  assert.equal(g.pass, false);
  assert.ok(g.rejectCount >= 2, `expected >=2 hard-rejects, got ${g.rejectCount}`);
  assert.equal(g.report.reason, 'hard-rejects');
  const r10 = g.report.series.rejected.find((x) => x.index === 10);
  const r20 = g.report.series.rejected.find((x) => x.index === 20);
  assert.ok(r10 && r10.rejects.includes('high-lt-low'), JSON.stringify(r10));
  assert.ok(r20 && r20.rejects.includes('negative-volume'), JSON.stringify(r20));
});

test('(3c) dataQualityGate pass:false on non-monotone timestamps (no hard reject)', () => {
  const bars = makeCleanSeries(60);
  const t = bars[40].timestamp;
  bars[40].timestamp = bars[42].timestamp;
  bars[42].timestamp = t;
  const g = dataQualityGate(bars);
  assert.equal(g.pass, false);
  assert.equal(g.rejectCount, 0);
  assert.ok(g.nonMonotonicCount >= 1);
  assert.equal(g.report.reason, 'non-monotone-timestamps');
});

test('(3d) dataQualityGate — a spike alone still PASSES (flags advisory), fails with maxFlagFraction', () => {
  const bars = makeCleanSeries(60);
  const spikeClose = 100 * 100;
  bars[30] = {
    open: bars[30].open, high: spikeClose + 1,
    low: Math.min(bars[30].low, bars[30].open), close: spikeClose,
    volume: bars[30].volume, timestamp: bars[30].timestamp,
  };
  // Default: flags are advisory — no hard reject, monotone ts => gate PASSES despite the outlier.
  const g = dataQualityGate(bars);
  assert.equal(g.pass, true, 'flags should be advisory by default');
  assert.ok(g.flagCount >= 1, 'the spike should still be flagged');
  assert.equal(g.report.flagAdvisory, true);
  // Opt-in excess-outlier veto: maxFlagFraction:0 => any flag fails the gate.
  const g2 = dataQualityGate(bars, { maxFlagFraction: 0.0 });
  assert.equal(g2.pass, false);
  assert.equal(g2.report.reason, 'excess-outliers');
});

test('(3e) dataQualityGate FAIL-CLOSED on garbage / empty input', () => {
  const gNull = dataQualityGate(null);
  const gNum = dataQualityGate(42);
  const gStr = dataQualityGate('not-an-array');
  const gEmpty = dataQualityGate([]);
  assert.equal(gNull.pass, false);
  assert.equal(gNull.report.reason, 'malformed-input');
  assert.equal(gNum.pass, false);
  assert.equal(gNum.report.reason, 'malformed-input');
  assert.equal(gStr.pass, false);
  assert.equal(gStr.report.reason, 'malformed-input');
  assert.equal(gEmpty.pass, false);
  assert.equal(gEmpty.report.reason, 'empty-series');
  // requireNonEmpty:false lets an empty array through to a vacuous (but honest) pass.
  const gEmptyAllowed = dataQualityGate([], { requireNonEmpty: false });
  assert.equal(gEmptyAllowed.pass, true);
});

// ═══════════════════════════════════════════════════════════════════════════
// (4) detectChangePoint — alarms on a real level shift, silent on stationary
// ═══════════════════════════════════════════════════════════════════════════

test('(4a) detectChangePoint alarms on a sustained level shift', () => {
  // Stationary head, then a sustained positive shift the CUSUM should accumulate past h.
  const shifted = [0.1, -0.2, 0.15, -0.05, 0.2, 2, 2.2, 2.1, 2.3, 2.0, 2.4, 2.1, 2.2, 2.3];
  const cp = detectChangePoint(shifted, { k: 0.5, h: 5, mu0: 0 });
  assert.equal(cp.alarm, true, `expected alarm; statistic=${cp.statistic}`);
  assert.ok(cp.changeIndex >= 0, `alarm index should be set, got ${cp.changeIndex}`);
});

test('(4b) detectChangePoint silent on a stationary stream (negative control)', () => {
  const stationary = [0.1, -0.2, 0.15, -0.05, 0.2, -0.1, 0.05, -0.15, 0.1, -0.2, 0.12, -0.08, 0.05, -0.1];
  const cp = detectChangePoint(stationary, { k: 0.5, h: 5, mu0: 0 });
  assert.equal(cp.alarm, false, `stationary stream should not alarm; statistic=${cp.statistic}`);
  assert.equal(cp.changeIndex, -1);
});

test('(4c) detectChangePoint fail-soft on empty / non-array input', () => {
  assert.deepEqual(detectChangePoint([]), { alarm: false, changeIndex: -1, statistic: 0, direction: null });
  assert.deepEqual(detectChangePoint('nope'), { alarm: false, changeIndex: -1, statistic: 0, direction: null });
});

// ═══════════════════════════════════════════════════════════════════════════
// (5) correlationDrift — high driftFraction across a regime change, ~0 stable
// ═══════════════════════════════════════════════════════════════════════════

test('(5a) correlationDrift.driftFraction HIGH across a correlation regime change', () => {
  const base = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
  // Before: all three keys track the SAME ramp => high pairwise correlation.
  const before = {
    a: base.map((x) => x + 0.01 * Math.sin(x)),
    b: base.map((x) => x + 0.02 * Math.cos(x)),
    c: base.map((x) => x - 0.01 * Math.sin(x * 1.3)),
  };
  // After: each key follows a different, near-orthogonal pattern => decorrelated.
  const after = {
    a: [3, -2, 5, -1, 4, -3, 2, -5, 1, -4, 3, -2],
    b: [-1, 4, -2, 5, -3, 1, -5, 2, -4, 3, -1, 4],
    c: [2, 2, -2, -2, 2, 2, -2, -2, 2, 2, -2, -2],
  };
  const cd = correlationDrift(before, after, { threshold: 0.30 });
  assert.ok(cd.driftFraction > 0.30, `expected high drift, got ${cd.driftFraction}`);
  assert.ok(cd.flippedPairs.length >= 1, 'at least one pair should be flagged drifted');
  // Each flagged pair carries before/after correlations and a delta beyond threshold.
  for (const fp of cd.flippedPairs) {
    assert.ok(Math.abs(fp.delta) > 0.30, `flagged pair delta ${fp.delta} must exceed threshold`);
    assert.equal(round6(fp.after - fp.before), round6(fp.delta));
  }
});

test('(5b) correlationDrift.driftFraction ~0 on a stable correlation structure (negative control)', () => {
  const before = {
    a: [1, 2, 3, 4, 5, 6, 7, 8],
    b: [2, 4, 6, 8, 10, 12, 14, 16],
  };
  // After barely perturbs b => correlation essentially unchanged.
  const after = {
    a: [1, 2, 3, 4, 5, 6, 7, 8],
    b: [2.01, 4.02, 5.98, 8.01, 9.99, 12.02, 13.98, 16.01],
  };
  const cd = correlationDrift(before, after, { threshold: 0.30 });
  assert.equal(cd.driftFraction, 0, `stable structure must not drift, got ${cd.driftFraction}`);
  assert.equal(cd.flippedPairs.length, 0);
});

test('(5c) correlationDrift fail-soft: ragged/missing series are skipped, not thrown', () => {
  const before = { a: [1, 2, 3], b: [1, 2] };  // ragged lengths
  const after = { a: [1, 2, 3], b: [1, 2] };
  let result;
  assert.doesNotThrow(() => { result = correlationDrift(before, after); });
  // The single ragged pair is skipped => no comparable pairs => driftFraction 0.
  assert.equal(result.driftFraction, 0);
  assert.equal(result.flippedPairs.length, 0);
});

// ═══════════════════════════════════════════════════════════════════════════
// (6) commutativityRegimeShift — classFlipFraction correct on a known before/after
// ═══════════════════════════════════════════════════════════════════════════

test('(6a) commutativityRegimeShift classFlipFraction correct on a known matrix pair', () => {
  // 4 factors => 6 unordered pairs; tol = 0.1.
  // BEFORE: only pair (0,3) is non-commuting (norm 0.5); the other 5 commute (norm 0).
  const tol = 0.1;
  const matBefore = [
    [0, 0.00, 0.00, 0.5],
    [0.00, 0, 0.00, 0.00],
    [0.00, 0.00, 0, 0.00],
    [0.5, 0.00, 0.00, 0],
  ];
  // AFTER: (0,1),(0,2),(1,2) now non-commuting; (0,3) now commuting; (1,3),(2,3) stay commuting.
  // Flips vs BEFORE: (0,1) c->nc, (0,2) c->nc, (1,2) c->nc, (0,3) nc->c  => 4 of 6 pairs flip.
  const matAfter = [
    [0, 0.6, 0.7, 0.00],
    [0.6, 0, 0.8, 0.00],
    [0.7, 0.8, 0, 0.00],
    [0.00, 0.00, 0.00, 0],
  ];
  const cf = commutativityRegimeShift(matBefore, matAfter, { tol });
  assert.equal(cf.flipped.length, 4, `expected exactly 4 flips: ${JSON.stringify(cf.flipped)}`);
  assert.equal(round6(cf.classFlipFraction), round6(4 / 6));
  // Verify the specific class transitions.
  const byPair = new Map(cf.flipped.map((f) => [`${f.i},${f.j}`, `${f.before}->${f.after}`]));
  assert.equal(byPair.get('0,1'), 'commuting->non-commuting');
  assert.equal(byPair.get('0,2'), 'commuting->non-commuting');
  assert.equal(byPair.get('1,2'), 'commuting->non-commuting');
  assert.equal(byPair.get('0,3'), 'non-commuting->commuting');
});

test('(6b) commutativityRegimeShift zero flips when the matrix is unchanged (negative control)', () => {
  const mat = [[0, 0.5], [0.5, 0]];
  const cf = commutativityRegimeShift(mat, mat, { tol: 0.1 });
  assert.equal(cf.flipped.length, 0);
  assert.equal(cf.classFlipFraction, 0);
});

test('(6c) commutativityRegimeShift unwraps real buildCommutativityMatrix {matrix} output', () => {
  // Integration: feed two REAL commutativity matrices from buildCommutativityMatrix.
  // Same factor set, strict tol both sides => identical classification => zero flips.
  const factors = [
    { id: 'mom1', category: 'momentum', sharpe_tier: 'high', data_inputs: ['close'] },
    { id: 'vol1', category: 'volatility', sharpe_tier: 'medium', data_inputs: ['high', 'low'] },
    { id: 'val1', category: 'value', sharpe_tier: 'low', data_inputs: ['fundamentals'] },
  ];
  const cmBefore = buildCommutativityMatrix(factors, { tol: 1e-9 });
  const cmAfter = buildCommutativityMatrix(factors, { tol: 1e-9 });
  // Passing the wrapped {matrix,...} objects must work (the module unwraps .matrix).
  const cf = commutativityRegimeShift(cmBefore, cmAfter, { tol: 1e-9 });
  assert.equal(cf.classFlipFraction, 0, 'identical real matrices must show zero class flips');
  assert.equal(cf.flipped.length, 0);
});

test('(6d) commutativityRegimeShift fail-soft on <2 factors / shape mismatch', () => {
  assert.deepEqual(commutativityRegimeShift([[0]], [[0]]), { classFlipFraction: 0, flipped: [] });
  assert.deepEqual(commutativityRegimeShift(null, null), { classFlipFraction: 0, flipped: [] });
});

// ═══════════════════════════════════════════════════════════════════════════
// (7) detectRegimeShift — composite true/false per layer + recommendation
// ═══════════════════════════════════════════════════════════════════════════

test('(7a) detectRegimeShift composite TRUE when any single layer trips, with the right reason', () => {
  // Only Layer 1 (change point) trips.
  const shifted = [0.1, -0.2, 0.15, -0.05, 0.2, 2, 2.2, 2.1, 2.3, 2.0, 2.4, 2.1, 2.2, 2.3];
  const det1 = detectRegimeShift({ signedStream: shifted });
  assert.equal(det1.regimeShift, true);
  assert.equal(det1.recommendation, 'RECOMPUTE_CIRCUIT');
  assert.deepEqual(Object.keys(det1.layers), ['changePoint']);
  assert.equal(det1.layers.changePoint.alarm, true);
  assert.ok(det1.reasons.some((r) => r.includes('change-point')), JSON.stringify(det1.reasons));

  // Only Layer 2 (correlation drift) trips.
  const before = {
    a: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((x) => x + 0.01 * Math.sin(x)),
    b: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((x) => x + 0.02 * Math.cos(x)),
  };
  const after = {
    a: [3, -2, 5, -1, 4, -3, 2, -5, 1, -4, 3, -2],
    b: [-1, 4, -2, 5, -3, 1, -5, 2, -4, 3, -1, 4],
  };
  const det2 = detectRegimeShift({ seriesByKeyBefore: before, seriesByKeyAfter: after });
  assert.equal(det2.regimeShift, true);
  assert.deepEqual(Object.keys(det2.layers), ['correlationDrift']);
  assert.ok(det2.layers.correlationDrift.driftFraction > 0.30);
  assert.ok(det2.reasons.some((r) => r.includes('correlation drift')), JSON.stringify(det2.reasons));

  // Only Layer 3 (commutativity) trips.
  const matBefore = [
    [0, 0.00, 0.00, 0.5],
    [0.00, 0, 0.00, 0.00],
    [0.00, 0.00, 0, 0.00],
    [0.5, 0.00, 0.00, 0],
  ];
  const matAfter = [
    [0, 0.6, 0.7, 0.00],
    [0.6, 0, 0.8, 0.00],
    [0.7, 0.8, 0, 0.00],
    [0.00, 0.00, 0.00, 0],
  ];
  const det3 = detectRegimeShift(
    { commMatrixBefore: matBefore, commMatrixAfter: matAfter },
    { commutativity: { tol: 0.1 } },
  );
  assert.equal(det3.regimeShift, true);
  assert.deepEqual(Object.keys(det3.layers), ['commutativity']);
  assert.ok(det3.layers.commutativity.classFlipFraction > 0.30);
  assert.ok(det3.reasons.some((r) => r.includes('commutativity')), JSON.stringify(det3.reasons));
});

test('(7b) detectRegimeShift composite FALSE / CIRCUIT_VALID when all three layers are clear', () => {
  const stationary = [0.1, -0.1, 0.05, -0.05, 0.1, -0.1, 0.05, -0.05];
  const before = { a: [1, 2, 3, 4, 5, 6, 7, 8], b: [2, 4, 6, 8, 10, 12, 14, 16] };
  const after = { a: [1, 2, 3, 4, 5, 6, 7, 8], b: [2.01, 4.02, 5.98, 8.01, 9.99, 12.02, 13.98, 16.01] };
  const matBefore = [[0, 0.5], [0.5, 0]];
  const matAfter = [[0, 0.5], [0.5, 0]];
  const det = detectRegimeShift(
    { signedStream: stationary, seriesByKeyBefore: before, seriesByKeyAfter: after, commMatrixBefore: matBefore, commMatrixAfter: matAfter },
    { commutativity: { tol: 0.1 } },
  );
  assert.equal(det.regimeShift, false);
  assert.equal(det.recommendation, 'CIRCUIT_VALID');
  // All three layers ran (composite is genuinely evaluating, not skipping inputs).
  assert.deepEqual(Object.keys(det.layers).sort(), ['changePoint', 'commutativity', 'correlationDrift']);
  assert.equal(det.reasons.length, 0);
});

test('(7c) detectRegimeShift fail-soft on empty input: no layers, no throw, CIRCUIT_VALID', () => {
  let det;
  assert.doesNotThrow(() => { det = detectRegimeShift({}); });
  assert.equal(det.regimeShift, false);
  assert.equal(det.recommendation, 'CIRCUIT_VALID');
  assert.deepEqual(Object.keys(det.layers), []);
});

// ═══════════════════════════════════════════════════════════════════════════
// (8) RED-TEAM SAFETY REGRESSIONS — false-negative fixes (each FAILS the buggy version)
// ═══════════════════════════════════════════════════════════════════════════

test('(8a) detectChangePoint catches a DOWNWARD regime shift (two-sided; one-sided UPPER was blind)', () => {
  const down = [0.1, -0.1, 0.05, -0.05, 0.1, -2, -2.2, -2.1, -2.3, -2.0, -2.4, -2.1, -2.2, -2.3];
  const cp = detectChangePoint(down, { k: 0.5, h: 5, mu0: 0 });
  assert.equal(cp.alarm, true, 'sustained downward shift alarms (was silently missed)');
  assert.equal(cp.direction, 'down', 'direction reported as down');
});

test('(8b) volatilitySignal(first-diff) + detectChangePoint catches a VOLATILITY regime change, not the level', () => {
  const lowThenHighVol = [0.1, -0.1, 0.1, -0.1, 0.1, -0.1, 0.1, -0.1, 3, -3, 3, -3, 3, -3, 3, -3];
  const rawCp = detectChangePoint(lowThenHighVol, { k: 0.5, h: 5, mu0: 0 });
  assert.equal(rawCp.alarm, false, 'raw signed CUSUM is correctly blind to a symmetric zero-mean vol change');
  const vol = volatilitySignal(lowThenHighVol, { window: 4 });
  const volCp = detectChangePoint(vol, { k: 0.2, h: 2, mu0: 0 });
  assert.equal(volCp.alarm, true, 'the vol-CHANGE signal alarms on the regime shift');
  // NEGATIVE CONTROL (Mimo fix): CONSTANT volatility must NOT alarm — proves it detects the CHANGE,
  // not the level (the raw-stddev version would false-alarm here on the positive mean).
  const constVol = [1, -1, 1, -1, 1, -1, 1, -1, 1, -1, 1, -1, 1, -1, 1, -1];
  const cvCp = detectChangePoint(volatilitySignal(constVol, { window: 4 }), { k: 0.2, h: 2, mu0: 0 });
  assert.equal(cvCp.alarm, false, 'constant volatility does NOT alarm (detects change, not level)');
  // And a vol DROP (high -> low) is caught by the two-sided down-CUSUM.
  const highThenLowVol = [3, -3, 3, -3, 3, -3, 3, -3, 0.1, -0.1, 0.1, -0.1, 0.1, -0.1, 0.1, -0.1];
  const dropCp = detectChangePoint(volatilitySignal(highThenLowVol, { window: 4 }), { k: 0.2, h: 2, mu0: 0 });
  assert.equal(dropCp.alarm, true, 'a volatility DROP is caught (two-sided), not only a rise');
});

test('(8c) correlationDrift flags a correlation SIGN REVERSAL via the sign-flip clause', () => {
  const before = { x: [1, 2, 3, 4, 5, 6], y: [1, 2, 3, 4, 5, 6] };  // corr +1
  const after = { x: [1, 2, 3, 4, 5, 6], y: [6, 5, 4, 3, 2, 1] };   // corr -1
  const cd = correlationDrift(before, after, { signFloor: 0.1 });
  assert.ok(cd.signFlips.length >= 1, 'sign reversal captured in signFlips');
  assert.equal(cd.signFlips[0].signFlip, true);
  assert.ok(cd.maxAbsDelta > 1.5, 'maxAbsDelta surfaces the worst-pair severity (L∞)');
});

test('(8d) detectRegimeShift trips via the L∞ single-pair escape when the fraction gate alone would miss', () => {
  const s = [1, 2, 3, 4, 5, 6, 7, 8];
  const before = { a: s, b: s, c: s };                  // all +1 correlated
  const after = { a: s, b: s, c: s.map((v) => -v) };    // c decouples to -1 vs a,b: 2/3 pairs flip
  // driftFraction gate at 0.99 ⇒ the fraction path (0.667) CANNOT trip; only the per-pair L∞ ceiling can.
  const det = detectRegimeShift({ seriesByKeyBefore: before, seriesByKeyAfter: after }, { driftFraction: 0.99 });
  assert.equal(det.regimeShift, true, 'concentrated decoupling trips via L∞ even when driftFraction would not');
  assert.ok(det.reasons.join(' ').includes('L∞'), 'reason cites the L∞ escape');
});

// ═══════════════════════════════════════════════════════════════════════════
// (9) SECOND-ROUND PEER FIXES (Mimo + DeepSeek) — each FAILS the pre-fix version
// ═══════════════════════════════════════════════════════════════════════════

test('(9a) validateBar hard-rejects a non-positive close (was structurally "clean", poisons log-returns)', () => {
  const z = validateBar({ open: 1, high: 2, low: 0, close: 0, volume: 5 });
  assert.equal(z.ok, false);
  assert.ok(z.rejects.includes('non-positive-close'), 'non-positive-close flagged');
  // opt-out for markets with legitimately non-positive prices
  assert.equal(validateBar({ open: 1, high: 2, low: -1, close: -0.5, volume: 5 }, { requirePositivePrice: false }).rejects.includes('non-positive-close'), false);
});

test('(9b) robust MAD r — a big spike does NOT mask a later moderate spike (FM-3 self-masking fix)', () => {
  const bars = [];
  for (let i = 0; i < 60; i++) bars.push({ open: 100, high: 160, low: 90, close: 100 + Math.sin(i) * 0.5, volume: 10 });
  bars[10].close = 150; // huge spike (would inflate a variance-based r)
  bars[40].close = 108; // later moderate spike — must still be caught
  const vs = validateSeries(bars);
  const idx = vs.flagged.map((f) => f.index);
  assert.ok(idx.includes(10), 'big spike flagged');
  assert.ok(idx.includes(40), 'later moderate spike still flagged (not masked by the big one)');
});

test('(9c) commutativityRegimeShift forces recompute when the factor SET changes (dim mismatch)', () => {
  const cm = commutativityRegimeShift([[0, 0.5], [0.5, 0]], [[0, 0.5, 0.1], [0.5, 0, 0.2], [0.1, 0.2, 0]]);
  assert.equal(cm.classFlipFraction, 1, 'dim change forces full invalidation');
  assert.equal(cm.dimensionChanged, true);
});

test('(9d) detectChangePoint marks an invalid (NaN) stream INOPERATIVE, not a false all-clear', () => {
  const cp = detectChangePoint([1, 2, NaN, 4, 5]);
  assert.equal(cp.inoperative, true, 'NaN stream surfaced as inoperative');
  assert.equal(cp.alarm, false);
  assert.equal(cp.reason, 'invalid-stream');
});
