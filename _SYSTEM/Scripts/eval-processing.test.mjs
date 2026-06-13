// eval-processing.test.mjs — simulate + red-team the eval-processing layer.
// The critical adversarial test is alpha-control under peeking (the confidence sequence's whole correctness claim).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeRng, gauss } from './decision-sim.mjs';
import { mkAggregator, pairedDelta, confidenceSequence, sequentialDecide, heldOutSplit, conformalQuantile, inSampleVsHeldout } from './eval-processing.mjs';

// --- 1. streaming-aggregator: Welford variance == naive two-pass (exact) ---
test('streaming-aggregator: Welford matches naive two-pass variance', () => {
  const xs = [2, 4, 4, 4, 5, 5, 7, 9]; // known sample variance = 4.5714286 (n-1)
  const agg = mkAggregator({ reservoir: 100 }); xs.forEach((x) => agg.push(x));
  const s = agg.stats();
  const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
  const naiveVar = xs.reduce((a, b) => a + (b - mean) ** 2, 0) / (xs.length - 1);
  assert.equal(s.n, 8);
  assert.ok(Math.abs(s.mean - mean) < 1e-12, `mean ${s.mean} vs ${mean}`);
  assert.ok(Math.abs(s.variance - naiveVar) < 1e-9, `var ${s.variance} vs ${naiveVar}`);
  assert.equal(s.min, 2); assert.equal(s.max, 9);
});

// --- 2. streaming-aggregator: O(1) memory over a large stream + reservoir preserves the mean ---
test('streaming-aggregator: reservoir is representative over 200k evals, memory bounded', () => {
  const rng = makeRng(3);
  const agg = mkAggregator({ reservoir: 1000, seed: 5 });
  for (let i = 0; i < 200000; i += 1) agg.push(rng());
  const s = agg.stats();
  assert.equal(s.reservoirSize, 1000, 'memory bounded to reservoir size, not 200k');
  assert.ok(Math.abs(s.mean - 0.5) < 0.01, `stream mean ${s.mean}`);
  const resMean = s.sample.reduce((a, b) => a + b, 0) / s.sample.length;
  assert.ok(Math.abs(resMean - s.mean) < 0.05, `reservoir mean ${resMean} ≈ stream mean ${s.mean}`);
  assert.ok(s.p95 > s.p50 && s.p50 > s.min, 'quantiles ordered');
});

// --- 3. streaming-aggregator: robust to non-finite (must not throw / poison) ---
test('streaming-aggregator: skips NaN/Inf without poisoning', () => {
  const agg = mkAggregator(); [1, NaN, 2, Infinity, 3, undefined].forEach((x) => agg.push(x));
  const s = agg.stats();
  assert.equal(s.n, 3); assert.equal(s.skipped, 3); assert.equal(s.mean, 2);
});

// --- 4. crn-paired-delta: variance reduction on correlated A/B, NO false reduction on independent ---
test('crn-paired-delta: CRN reduces variance when A,B share noise; ~1 when they do not', () => {
  // A and B both depend on the same shared u → CRN cancels it → big reduction
  const shared = pairedDelta((r) => ({ u: r() }), (p) => p.u + 0.05, (p) => p.u, { draws: 8000 });
  assert.ok(shared.varianceReductionFactor > 5, `expected strong reduction, got ×${shared.varianceReductionFactor}`);
  assert.ok(shared.pairedCI[0] > 0, `CI should exclude 0 (A>B): ${shared.pairedCI}`);
  assert.equal(shared.verdict, 'A>B');
  // A,B depend on DIFFERENT independent draws → CRN can't cancel → factor ~1 (no fake reduction)
  const indep = pairedDelta((r) => ({ u: r(), v: r() }), (p) => p.u + 0.05, (p) => p.v, { draws: 8000 });
  assert.ok(indep.varianceReductionFactor < 2.0, `expected ~1 (no reduction), got ×${indep.varianceReductionFactor}`);
});

// --- 5. THE RED TEAM: confidence sequence alpha-control under peeking (peek every step, H0 true) ---
test('sequential-stopping: false-stop rate under H0 stays <= alpha despite peeking every step', () => {
  const ALPHA = 0.05, M = 300, MAXN = 1500;
  let falseStops = 0;
  for (let m = 0; m < M; m += 1) {
    const r = makeRng(1000 + m);
    // H0: true mean EXACTLY on the threshold (the hardest null)
    const res = sequentialDecide(() => (r() < 0.5 ? 1 : 0), { alpha: ALPHA, range: [0, 1], threshold: 0.5, maxN: MAXN });
    if (res.decision !== 'undecided') falseStops += 1; // ANY decision is a false positive here
  }
  const rate = falseStops / M;
  // time-uniform CS guarantees P(ever cross) <= alpha; allow finite-M slack but it must be near/under alpha
  assert.ok(rate <= 0.08, `false-stop rate ${rate} (${falseStops}/${M}) exceeded alpha-control budget`);
});

// --- 6. confidence sequence POWER: a real effect stops early, correctly ---
test('sequential-stopping: real effect (0.65 vs 0.5) decides "above" and stops before maxN', () => {
  let decided = 0, totalUsed = 0; const M = 50, MAXN = 20000;
  for (let m = 0; m < M; m += 1) {
    const r = makeRng(5000 + m);
    const res = sequentialDecide(() => (r() < 0.65 ? 1 : 0), { alpha: 0.05, range: [0, 1], threshold: 0.5, maxN: MAXN });
    if (res.decision === 'above') { decided += 1; totalUsed += res.nUsed; }
    assert.notEqual(res.decision, 'below'); // must never decide the wrong direction
  }
  assert.ok(decided >= M * 0.9, `power: only ${decided}/${M} detected the real effect`);
  assert.ok(totalUsed / decided < MAXN * 0.5, `should stop well early, avg used ${Math.round(totalUsed / decided)}`);
});

// --- 7. heldout-split: detects in-sample optimism an overfit metric hides ---
test('heldout-split: optimism gap exposes an overfitter', () => {
  // overfit fitter: memorizes each train item's exact label → perfect in-sample, useless held-out
  const items = Array.from({ length: 300 }, (_, i) => ({ id: i, y: makeRng(i)() < 0.5 ? 0 : 1 }));
  const fit = (tr) => { const mem = new Map(tr.map((d) => [d.id, d.y])); return { mem, prior: tr.reduce((a, d) => a + d.y, 0) / tr.length }; };
  const score = (m, d) => (m.mem.has(d.id) ? (m.mem.get(d.id) === d.y ? 1 : 0) : (Math.round(m.prior) === d.y ? 1 : 0));
  const iv = inSampleVsHeldout(items, fit, score, { frac: 0.7, seed: 21 });
  assert.ok(iv.inSample > 0.99, `overfitter should be ~perfect in-sample, got ${iv.inSample}`);
  assert.ok(iv.optimismGap > 0.3, `optimism gap should be large, got ${iv.optimismGap}`);
});

// --- 8. heldout-split: deterministic under same seed, different across seeds ---
test('heldout-split: seeded reproducibility', () => {
  const items = Array.from({ length: 50 }, (_, i) => i);
  const a = heldOutSplit(items, { seed: 7 }), b = heldOutSplit(items, { seed: 7 }), c = heldOutSplit(items, { seed: 8 });
  assert.deepEqual(a.train, b.train, 'same seed → same split');
  assert.notDeepEqual(a.train, c.train, 'different seed → different split');
  assert.equal(a.train.length + a.test.length, 50, 'partition is complete');
});

// --- 9. conformalQuantile: empirical miscoverage <= alpha (finite-sample guarantee) ---
test('conformalQuantile: held-out calibration gives <= alpha miscoverage', () => {
  const ALPHA = 0.1, M = 400; let miss = 0;
  for (let m = 0; m < M; m += 1) {
    const r = makeRng(7000 + m);
    const calib = Array.from({ length: 200 }, () => Math.abs(r() * 2 - 1)); // nonconformity scores
    const qhat = conformalQuantile(calib, ALPHA);
    const testScore = Math.abs(r() * 2 - 1);
    if (testScore > qhat) miss += 1; // miscoverage event
  }
  const rate = miss / M;
  assert.ok(rate <= ALPHA + 0.04, `conformal miscoverage ${rate} should be <= alpha ${ALPHA} (+slack)`);
});

// --- 10. crn-paired-delta: computeUnpaired:false skips the 2× baseline, keeps the delta CI ---
test('crn-paired-delta: computeUnpaired:false skips the baseline (null reduction), delta CI intact', () => {
  const pd = pairedDelta((r) => ({ u: r() }), (p) => p.u + 0.05, (p) => p.u, { draws: 2000, computeUnpaired: false });
  assert.equal(pd.varianceReductionFactor, null, 'no reduction factor when baseline skipped');
  assert.equal(pd.unpairedSem, null, 'no unpaired baseline computed');
  assert.ok(pd.pairedCI[0] > 0 && pd.verdict === 'A>B', 'delta + CI still valid');
});

// --- 11. sub-Gaussian CS (range:null): alpha-control on an unbounded Gaussian null ---
test('sequential-stopping: sub-Gaussian variant (range:null) controls alpha on a Gaussian null', () => {
  const ALPHA = 0.05, M = 300, MAXN = 1500;
  let falseStops = 0;
  for (let m = 0; m < M; m += 1) {
    const r = makeRng(20000 + m);
    const cs = confidenceSequence({ alpha: ALPHA, range: null }); // unbounded, sub-Gaussian fallback
    let used = 0, stopped = false;
    while (used < MAXN) { cs.push(gauss(r)); used += 1; if (used >= 2 && cs.decided(0) !== 'undecided') { stopped = true; break; } } // H0: mean 0 ON threshold 0
    if (stopped) falseStops += 1;
  }
  const rate = falseStops / M;
  assert.ok(rate <= 0.12, `sub-Gaussian false-stop rate ${rate} (${falseStops}/${M}) should stay near/under alpha`);
});
