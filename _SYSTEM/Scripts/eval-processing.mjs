#!/usr/bin/env node
import { pathToFileURL } from 'node:url';
// eval-processing.mjs — the EVAL-PROCESSING LAYER under YURI's sim arsenal.
// Turns a million-eval sampling budget into a decision: stream-reduce (never store) → variance-reduce (CRN) →
// stop-when-decided (confidence sequence) → de-bias (held-out / split-conformal). Pure JS, zero deps.
// Consumed by cap-sim / decision-sim / izanagi-bridge. Roadmap: 02_RESOURCES/research/simulation-arsenal-wiring-2026-06-13.md
// (the "Eval-processing architecture" section). Reuses decision-sim.makeRng (seeded → reproducible).
// Research grounding: Welford 1962 (online variance); Vitter Alg-R (reservoir); common random numbers (CRN, classic
// variance reduction); empirical-Bernstein confidence sequence (Howard/Ramdas 2021, time-uniform → peek-valid);
// Split Conformal Prediction (Vovk/Shafer; Angelopoulos-Bates) — already logged in math/logbook-truth.json for the energy gate.

import { makeRng } from './decision-sim.mjs';

// --- defensive helpers (inlined, NOT math-kernel.percentile — that throws on edge input; a streaming hot path must not) ---
function sortedQuantile(sorted, p) {
  if (!sorted.length) return NaN;
  if (sorted.length === 1) return sorted[0];
  const idx = (p / 100) * (sorted.length - 1);
  const lo = Math.floor(idx), hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo); // linear interpolation
}
const isNum = (x) => typeof x === 'number' && Number.isFinite(x);

// ===========================================================================
// @capability: streaming-aggregator
// @serves: aggregate millions of evals without storing rows | online mean variance | streaming stats | reduce evals streaming | never store eval rows | running quantiles
// @does: Welford online moments (mean/variance/min/max, exact, O(1) memory) + a Vitter reservoir sample for quantiles/bootstrap — consume evals one at a time, never hoard the array
// @use: any time a sim produces a large stream of values and you only need its summary + a bootstrappable sub-sample; the first layer of the eval funnel (never store, reduce streaming)
// @exports: mkAggregator
// @tier: generic
// @couples: none
// @deps: none
//   FILE-LEVEL tier (this file carries several capability blocks). Imports only decision-sim,
//   which is itself generic — genericness is a property of the subgraph, not of one file.
//   Middle of the release bundle: bench-power -> eval-processing -> decision-sim.
// ===========================================================================
/**
 * Streaming aggregator: O(1)-memory exact moments (Welford) + a bounded reservoir (Vitter Algorithm R) for
 * quantiles and bootstrap. push() per eval; stats() collapses to a summary. Skips non-finite values (robust hot path).
 */
export function mkAggregator({ reservoir = 1000, seed = 1, rng } = {}) {
  const r = rng || makeRng(seed);
  let n = 0, mean = 0, M2 = 0, min = Infinity, max = -Infinity, sum = 0, skipped = 0;
  const res = [];
  return {
    push(x) {
      if (!isNum(x)) { skipped += 1; return; }
      n += 1;
      const d = x - mean; mean += d / n; M2 += d * (x - mean);
      if (x < min) min = x; if (x > max) max = x; sum += x;
      // Vitter reservoir: fill, then replace with prob reservoir/n
      if (res.length < reservoir) res.push(x);
      else { const j = Math.floor(r() * n); if (j < reservoir) res[j] = x; }
      return this;
    },
    pushAll(xs) { for (const x of xs) this.push(x); return this; },
    stats() {
      const variance = n > 1 ? M2 / (n - 1) : 0;
      const sorted = res.slice().sort((a, b) => a - b);
      return {
        n, skipped, mean: n ? mean : NaN, variance, std: Math.sqrt(variance),
        min: n ? min : NaN, max: n ? max : NaN, sum,
        sem: n > 1 ? Math.sqrt(variance / n) : NaN, // standard error of the mean
        p50: sortedQuantile(sorted, 50), p90: sortedQuantile(sorted, 90),
        p95: sortedQuantile(sorted, 95), p99: sortedQuantile(sorted, 99),
        reservoirSize: res.length, sample: sorted,
      };
    },
  };
}

// ===========================================================================
// @capability: crn-paired-delta
// @serves: compare two options with variance reduction | which is better A vs B | common random numbers | paired delta CI | tighter comparison same seeds | A/B sim comparison
// @does: scores two value-functions on the SAME random draws (common random numbers) so seed-variance cancels in the delta → a far tighter comparison CI; also computes the UNPAIRED CI to PROVE the reduction factor
// @use: any "is A better than B" sim question — CRN is nearly free and is the single biggest variance-reduction win for comparisons; reports varianceReductionFactor so you can see it worked
// @exports: pairedDelta
// ===========================================================================
/**
 * Common-random-numbers paired comparison. valueA/valueB are (params)=>number; sampleParams(rng)=>params.
 * Feeds the SAME params to both per draw → the shared-noise component cancels in (A−B). Returns the paired
 * delta + its CI, and the unpaired CI for contrast (varianceReductionFactor = unpairedVar/pairedVar, >1 ⇒ CRN helped).
 */
export function pairedDelta(sampleParams, valueA, valueB, { draws = 2000, seed = 7, z = 1.96, computeUnpaired = true } = {}) {
  const rng = makeRng(seed);
  const deltas = new Array(draws);
  for (let i = 0; i < draws; i += 1) {
    const p = sampleParams(rng);          // SAME params to both (common random numbers)
    deltas[i] = valueA(p) - valueB(p);
  }
  const mean = deltas.reduce((a, b) => a + b, 0) / draws;
  const pairedVar = deltas.reduce((a, b) => a + (b - mean) ** 2, 0) / Math.max(1, draws - 1);
  const pairedSem = Math.sqrt(pairedVar / draws);

  // unpaired baseline = the PROOF that CRN helped, but it costs 2× extra value() calls.
  // Skip it with computeUnpaired:false in production hot loops where you only need the delta CI.
  let unpairedSem = null, varianceReductionFactor = null;
  if (computeUnpaired) {
    const rngA = makeRng(seed + 101), rngB = makeRng(seed + 202);
    let mA = 0, mB = 0; const va = [], vb = [];
    for (let i = 0; i < draws; i += 1) { const a = valueA(sampleParams(rngA)); va.push(a); mA += a; }
    for (let i = 0; i < draws; i += 1) { const b = valueB(sampleParams(rngB)); vb.push(b); mB += b; }
    mA /= draws; mB /= draws;
    const varA = va.reduce((s, x) => s + (x - mA) ** 2, 0) / Math.max(1, draws - 1);
    const varB = vb.reduce((s, x) => s + (x - mB) ** 2, 0) / Math.max(1, draws - 1);
    const unpairedVar = varA + varB;
    unpairedSem = Math.sqrt(unpairedVar / draws);
    varianceReductionFactor = pairedVar > 0 ? unpairedVar / pairedVar : Infinity;
  }

  const lo = mean - z * pairedSem, hi = mean + z * pairedSem;
  return {
    meanDelta: mean, pairedCI: [lo, hi], pairedSem, unpairedSem, varianceReductionFactor,
    nDraws: draws,
    verdict: lo > 0 ? 'A>B' : hi < 0 ? 'B>A' : 'tie (CI spans 0)',
  };
}

// ===========================================================================
// @capability: sequential-stopping
// @serves: stop a sim early when decided | spend evals only on undecided cells | confidence sequence | peek without alpha inflation | anytime-valid early stop | sequential test allocator
// @does: an empirical-Bernstein confidence sequence (time-uniform → you can peek every step without inflating false-positives) + a decide()/sequentialDecide() that stops as soon as the running CI clears a threshold
// @use: when uniform allocation wastes evals on already-decided cells — peek as you go, stop the moment the CI excludes the threshold, reallocate the saved budget. Distinct from quantum-hypothesis-tracker.measureSequential (that is order-aware EVIDENCE projection, not stopping)
// @exports: confidenceSequence, sequentialDecide
// ===========================================================================
/**
 * Empirical-Bernstein confidence sequence (Howard/Ramdas family). Time-uniform: the guarantee holds at ALL t
 * simultaneously, so peeking/optional-stopping does NOT inflate the error rate. `csConst` scales the log term —
 * tuned so the empirical false-stop rate ≤ alpha (validated in the test suite, not asserted from a citation).
 * range = [a,b] bound on the values (for the Bernstein range term). push() then ci()/decided(threshold).
 */
export function confidenceSequence({ alpha = 0.05, range = [0, 1], csConst = 1.0 } = {}) {
  const bounded = Array.isArray(range);          // range:[a,b] → empirical-Bernstein; range:null → sub-Gaussian fallback
  const span = bounded ? range[1] - range[0] : null;
  let n = 0, mean = 0, M2 = 0;
  const radiusAt = () => {
    if (n < 2) return Infinity;
    const variance = M2 / (n - 1);
    // L_t carries an iterated-log term (1+log2 t) → time-uniformity (peek validity)
    const Lt = csConst * Math.log((2 / alpha) * (1 + Math.log2(Math.max(2, n))));
    const varTerm = Math.sqrt((2 * variance * Lt) / n);
    // bounded: + range term (3·span·Lt/n) → tight + valid for any [a,b] (empirical-Bernstein).
    // unbounded (range:null): variance term + an O(1/n) cushion → sub-Gaussian fallback. Valid for LIGHT-tailed
    // (finite-variance, ~sub-Gaussian) data; NOT guaranteed for heavy tails — prefer a bounded range when you have one.
    return bounded ? varTerm + (3 * span * Lt) / n : varTerm + (csConst * Lt) / n;
  };
  return {
    push(x) { if (isNum(x)) { n += 1; const d = x - mean; mean += d / n; M2 += d * (x - mean); } return this; },
    get n() { return n; },
    ci() { const r = radiusAt(); return { mean, lo: mean - r, hi: mean + r, radius: r, n }; },
    /** 'above' | 'below' | 'undecided' relative to threshold — decided when the CI excludes it */
    decided(threshold) { const r = radiusAt(); if (!Number.isFinite(r)) return 'undecided'; if (mean - r > threshold) return 'above'; if (mean + r < threshold) return 'below'; return 'undecided'; },
  };
}

/**
 * Drain a stream (array or generator-fn returning the next value, null to stop) into a confidence sequence,
 * stopping the instant the threshold is decided. Returns the decision + how many evals it actually used.
 */
export function sequentialDecide(nextValue, { alpha = 0.05, range = [0, 1], threshold = 0.5, maxN = 100000, csConst = 1.0 } = {}) {
  const cs = confidenceSequence({ alpha, range, csConst });
  const stream = Array.isArray(nextValue) ? (() => { let i = 0; return () => (i < nextValue.length ? nextValue[i++] : null); })() : nextValue;
  let used = 0;
  while (used < maxN) {
    const x = stream(); if (x === null || x === undefined) break;
    cs.push(x); used += 1;
    if (used >= 2) { const d = cs.decided(threshold); if (d !== 'undecided') return { decision: d, nUsed: used, savedFraction: 1 - used / maxN, ci: cs.ci() }; }
  }
  return { decision: 'undecided', nUsed: used, savedFraction: 1 - used / maxN, ci: cs.ci() };
}

// ===========================================================================
// @capability: heldout-split
// @serves: held out validation | train test split | measure in-sample optimism | de-bias overfit metric | split conformal calibration quantile | honest validation not in-sample
// @does: seeded train/test split (+ k-fold) and the in-sample-vs-held-out OPTIMISM GAP (fit on train, score on both → the gap is the overfit you can't see in-sample) + a split-conformal quantile (finite-sample ≤α miscoverage)
// @use: whenever a metric is fit and scored on the same data (the ECE=0 trap) — this MEASURES the optimism instead of trusting it; split-conformal gives a distribution-free calibrated bar. The honesty gate of the eval funnel
// @exports: heldOutSplit, conformalQuantile, inSampleVsHeldout
// ===========================================================================
/** Seeded shuffle + split. frac = train fraction. Reproducible under the same seed. */
export function heldOutSplit(items, { frac = 0.7, seed = 13 } = {}) {
  const a = items.slice();
  const r = makeRng(seed);
  for (let i = a.length - 1; i > 0; i -= 1) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } // Fisher-Yates
  const cut = Math.max(1, Math.min(a.length - 1, Math.round(a.length * frac)));
  return { train: a.slice(0, cut), test: a.slice(cut) };
}

/** k-fold indices (seeded). Returns array of {train, test} item-arrays. */
export function kFold(items, { k = 5, seed = 13 } = {}) {
  const a = items.slice(); const r = makeRng(seed);
  for (let i = a.length - 1; i > 0; i -= 1) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  const folds = Array.from({ length: k }, () => []);
  a.forEach((x, i) => folds[i % k].push(x));
  return folds.map((test, i) => ({ test, train: folds.filter((_, j) => j !== i).flat() }));
}

/**
 * Split Conformal quantile: given nonconformity scores on a held-out calibration set, the bar q̂ with
 * finite-sample marginal miscoverage ≤ alpha (Vovk; Angelopoulos-Bates). Uses the (n+1)(1−α) order statistic.
 */
export function conformalQuantile(calibScores, alpha = 0.1) {
  const s = calibScores.filter(isNum).slice().sort((a, b) => a - b);
  const n = s.length;
  if (!n) return Infinity;
  const rank = Math.ceil((n + 1) * (1 - alpha));
  if (rank > n) return Infinity;            // not enough calibration data for this α → conservative
  return s[rank - 1];
}

/**
 * The anti-overfit harness. fitFn(train)->model; scoreFn(model, dataItem)->number (higher=better, e.g. accuracy);
 * scores on BOTH train (in-sample) and test (held-out). The GAP = in-sample optimism you'd otherwise believe.
 */
export function inSampleVsHeldout(items, fitFn, scoreFn, { frac = 0.7, seed = 13 } = {}) {
  const { train, test } = heldOutSplit(items, { frac, seed });
  const model = fitFn(train);
  const avg = (arr) => arr.reduce((a, b) => a + b, 0) / Math.max(1, arr.length);
  const inSample = avg(train.map((d) => scoreFn(model, d)));
  const heldOut = avg(test.map((d) => scoreFn(model, d)));
  return { inSample, heldOut, optimismGap: inSample - heldOut, nTrain: train.length, nTest: test.length };
}

export default { mkAggregator, pairedDelta, confidenceSequence, sequentialDecide, heldOutSplit, kFold, conformalQuantile, inSampleVsHeldout };

// --- CLI demo / smoke ---
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href && process.argv.includes('--demo')) {
  const rng = makeRng(42);
  const agg = mkAggregator({ reservoir: 500, seed: 1 });
  for (let i = 0; i < 1e6; i += 1) agg.push(rng()); // 1M evals, O(1) memory
  const s = agg.stats();
  console.log(`streaming-aggregator: n=${s.n} mean=${s.mean.toFixed(4)} std=${s.std.toFixed(4)} p95=${s.p95.toFixed(4)} (reservoir ${s.reservoirSize}, stored ${s.reservoirSize}/${s.n})`);
  const pd = pairedDelta((r) => ({ u: r() }), (p) => p.u * 0.98 + 0.05, (p) => p.u, { draws: 5000 });
  console.log(`crn-paired-delta: meanΔ=${pd.meanDelta.toFixed(4)} CI=[${pd.pairedCI.map((x) => x.toFixed(4)).join(', ')}] reduction×${pd.varianceReductionFactor.toFixed(1)} ${pd.verdict}`);
  const r2 = makeRng(9);
  const sq = sequentialDecide(() => (r2() < 0.62 ? 1 : 0), { threshold: 0.5, range: [0, 1], maxN: 100000 });
  console.log(`sequential-stopping: ${sq.decision} after ${sq.nUsed} evals (saved ${(sq.savedFraction * 100).toFixed(1)}% of maxN)`);
  const items = Array.from({ length: 200 }, (_, i) => ({ x: i, noise: makeRng(i)() }));
  const iv = inSampleVsHeldout(items, (tr) => ({ mean: tr.reduce((a, d) => a + d.noise, 0) / tr.length }), (m, d) => 1 - Math.abs(d.noise - m.mean));
  console.log(`heldout-split: inSample=${iv.inSample.toFixed(4)} heldOut=${iv.heldOut.toFixed(4)} optimismGap=${iv.optimismGap.toFixed(4)}`);
}
