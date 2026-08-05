#!/usr/bin/env node
// bootstrap.mjs - case-cluster bootstrap with per-dimension paired estimates.
//
// Contract:
//   unit=case_id
//   replicates=10000
//   seed=20260729
//   cluster_rule: a resample picks case_ids WITH REPLACEMENT from the
//     declared case universe; repeated cases are valid samples and MUST
//     preserve multiplicity (a single case can appear >1 in the same
//     resample). All arms and all three trials for each occurrence are
//     kept together in the resampled cluster.
//
// Point estimates:
//   overall_point_a_minus_c : overall A-minus-C point difference (mean
//     across all cases x dimensions)
//   per_dimension_point_a_minus_c : per-dimension A-minus-C point diff
//   per_dimension_interval_b_minus_a : paired bootstrap CI for B-minus-A
//   per_dimension_intervals : { [dim]: { b_minus_a: {lo,hi} } }
//   intervals : paired overall B-minus-A bootstrap CI
//
// G1 evaluates overall A-vs-C POINT difference + per-dimension A-vs-C
// POINT estimates, NOT bootstrap medians.
//
// G4 evaluates B-vs-A on non-safety dimensions, using per_dimension
// paired bootstrap CIs (kept from earlier contract).

import { createHash } from 'node:crypto';
import { Buffer } from 'node:buffer';

const ARMS = ['A', 'B', 'C'];

function mulberry32(a) {
  return function() {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Trial record shape:
//   { case_id, dimension, arm_id, trial_index, pass }
// pass = boolean (passed the case check).
//
// Pass an array of trial records grouped by [case_id, dimension]; we
// return point-A-minus-C means + paired bootstrap CIs of B-A per

function percentile(arr, p) {
  if (arr.length === 0) return 0;
  const sorted = arr.slice().sort((x, y) => x - y);
  const idx = Math.min(sorted.length - 1, Math.floor(p * sorted.length));
  return sorted[idx];
}
function ci(arr) { return { lo: percentile(arr, 0.025), hi: percentile(arr, 0.975) }; }

function mean(arr) { if (!arr.length) return 0; let s = 0; for (const v of arr) s += v; return s / arr.length; }

// dimension + paired overall B-A bootstrap CI.
function bootstrapCaseCluster({ trialsByCaseArm, dimensionTrials, seed, replicates }) {
  // Group trials by (case_id, dimension, arm_id)
  const byCaseArm = new Map(); // key: case_id|arm_id -> [pass, pass, ...] (length up to 3 trials)
  for (const t of trialsByCaseArm) {
    const key = `${t.case_id}|${t.arm_id}`;
    if (!byCaseArm.has(key)) byCaseArm.set(key, []);
    byCaseArm.get(key).push(t.pass ? 1 : 0);
  }
  // Distinct (case_id, dimension) list, preserves declared order.
  const cases = [];
  const caseSet = new Set();
  for (const t of trialsByCaseArm) {
    const k = `${t.case_id}|${t.dimension}`;
    if (!caseSet.has(k)) { caseSet.add(k); cases.push({ case_id: t.case_id, dimension: t.dimension }); }
  }
  // Pre-compute per-case per-arm mean pass-rate.
  const meanByCaseArm = new Map();
  for (const [key, arr] of byCaseArm) meanByCaseArm.set(key, mean(arr));

  // Overall case-level pass-rate for each arm: aggregate across trials.
  // For A-minus-C point we use case-level means.
  function caseLevelMeans(armId) {
    const out = [];
    for (const c of cases) {
      const arr = byCaseArm.get(`${c.case_id}|${armId}`);
      if (arr && arr.length > 0) out.push(mean(arr));
    }
    return out;
  }
  // Per-dimension A-minus-C point: mean across cases in that dimension.
  function dimPoint(armId, dim) {
    const out = [];
    for (const c of cases) {
      if (c.dimension !== dim) continue;
      const arr = byCaseArm.get(`${c.case_id}|${armId}`);
      if (arr && arr.length > 0) out.push(mean(arr));
    }
    return out.length ? mean(out) : null;
  }

  // rng with user seed.
  const rng = mulberry32(seed);

  // Resample cases WITH REPLACEMENT; preserve multiplicity. Each drawn
  // case contributes its (A-mean, B-mean, C-mean) tuple once.
  function resampleOnce() {
    const out = [];
    for (let i = 0; i < cases.length; i++) {
      const idx = Math.floor(rng() * cases.length);
      out.push({ case_id: cases[idx].case_id, dimension: cases[idx].dimension, mu: cases[idx] });
    }
    return out;
  }

  function diffBMinusA(samples) {
    let s = 0; let n = 0;
    for (const s_ of samples) {
      const aKey = `${s_.case_id}|A`;
      const bKey = `${s_.case_id}|B`;
      const aMean = meanByCaseArm.get(aKey);
      const bMean = meanByCaseArm.get(bKey);
      if (aMean !== undefined && bMean !== undefined) { s += (bMean - aMean); n += 1; }
    }
    return n > 0 ? s / n : 0;
  }
  function diffAMinusC(samples) {
    let s = 0; let n = 0;
    for (const s_ of samples) {
      const aMean = meanByCaseArm.get(`${s_.case_id}|A`);
      const cMean = meanByCaseArm.get(`${s_.case_id}|C`);
      if (aMean !== undefined && cMean !== undefined) { s += (aMean - cMean); n += 1; }
    }
    return n > 0 ? s / n : 0;
  }
  function dimDiff(samples, dim, metric /* 'b-a'|'a-c' */) {
    let s = 0; let n = 0;
    for (const s_ of samples) {
      if (s_.dimension !== dim) continue;
      const aMean = meanByCaseArm.get(`${s_.case_id}|A`);
      if (aMean === undefined) continue;
      const other = metric === 'b-a' ? meanByCaseArm.get(`${s_.case_id}|B`) : meanByCaseArm.get(`${s_.case_id}|C`);
      if (other === undefined) continue;
      s += (metric === 'b-a' ? (other - aMean) : (aMean - other));
      n += 1;
    }
    return n > 0 ? s / n : 0;
  }

  // Replicate.
  const overallBA = [];
  const overallAC = [];
  const perDimBA = {}; // { dim: [replicates] }
  const perDimAC = {};
  for (let i = 0; i < replicates; i++) {
    const s = resampleOnce();
    overallBA.push(diffBMinusA(s));
    overallAC.push(diffAMinusC(s));
    for (const c of cases) {
      perDimBA[c.dimension] = perDimBA[c.dimension] || [];
      perDimBA[c.dimension].push(dimDiff(s, c.dimension, 'b-a'));
      perDimAC[c.dimension] = perDimAC[c.dimension] || [];
      perDimAC[c.dimension].push(dimDiff(s, c.dimension, 'a-c'));
    }
  }

  // AXIS 1 (Atlas#1) — nest under b_minus_a so evalG4 (which reads
  // intervals.b_minus_a.lo/hi) sees the overall paired B-minus-A CI, exactly
  // as per_dimension_intervals nests { [dim]: { b_minus_a: {lo,hi} } }.
  const intervals = { b_minus_a: ci(overallBA) };
  const per_dimension_intervals = {};
  for (const dim of Object.keys(perDimBA)) per_dimension_intervals[dim] = { b_minus_a: ci(perDimBA[dim]) };
  const intervals_a_minus_c = ci(overallAC);
  const per_dimension_intervals_a_minus_c = {};
  for (const dim of Object.keys(perDimAC)) per_dimension_intervals_a_minus_c[dim] = { a_minus_c: ci(perDimAC[dim]) };

  // POINT estimates.
  const aMeansAll = caseLevelMeans('A');
  const cMeansAll = caseLevelMeans('C');
  const overallPointAC = aMeansAll.length ? (mean(aMeansAll) - mean(cMeansAll)) : 0;
  const perDimensionPointAC = {};
  for (const dim of new Set(cases.map((c) => c.dimension))) {
    const a = dimPoint('A', dim);
    const c = dimPoint('C', dim);
    perDimensionPointAC[dim] = (a !== null && c !== null) ? (a - c) : 0;
  }
  // Per-dimension B-minus-A POINT estimates (G4 floor check uses the
  // raw obs mean, not the bootstrap median).
  const perDimensionPointBA = {};
  for (const dim of new Set(cases.map((c) => c.dimension))) {
    const a = dimPoint('A', dim);
    const b = dimPoint('B', dim);
    perDimensionPointBA[dim] = (a !== null && b !== null) ? (b - a) : 0;
  }
  // Per-case point A-minus-C.
  const perCasePointAC = cases.map((c) => {
    const a = meanByCaseArm.get(`${c.case_id}|A`);
    const k = meanByCaseArm.get(`${c.case_id}|C`);
    return { case_id: c.case_id, dimension: c.dimension, point_a_minus_c: (a !== undefined && k !== undefined) ? (a - k) : 0 };
  });
  // Raw per-arm per-dimension pass rates + counts.
  const armDimensionStats = {};
  for (const armId of ARMS) {
    armDimensionStats[armId] = {};
    for (const dim of new Set(cases.map((c) => c.dimension))) {
      let totalTrials = 0; let passingTrials = 0;
      for (const c of cases) {
        if (c.dimension !== dim) continue;
        const arr = byCaseArm.get(`${c.case_id}|${armId}`) || [];
        totalTrials += arr.length;
        for (const v of arr) if (v === 1) passingTrials += 1;
      }
      armDimensionStats[armId][dim] = {
        trials: totalTrials,
        passes: passingTrials,
        pass_rate: totalTrials > 0 ? passingTrials / totalTrials : 0,
      };
    }
  }
  return {
    intervals,
    per_dimension_intervals,
    intervals_a_minus_c,
    per_dimension_intervals_a_minus_c,
    overall_point_a_minus_c: overallPointAC,
    per_dimension_point_a_minus_c: perDimensionPointAC,
    per_dimension_point_b_minus_a: perDimensionPointBA,
    per_case_point_a_minus_c: perCasePointAC,
    arm_dimension_stats: armDimensionStats,
    n: replicates,
    seed,
  };
}



export const _internal = { mulberry32, percentile, mean };
export { bootstrapCaseCluster };
