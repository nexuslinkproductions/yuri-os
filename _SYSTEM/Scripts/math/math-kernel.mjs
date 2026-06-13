#!/usr/bin/env node
import { createHash } from 'node:crypto';

const RESULT_SCHEMA = 'yuri.math.result.v0';
const EPSILON = 1e-12;

// @capability: math-kernel
// @serves: core math primitives | entropy KL divergence | weighted variance | percentile quantile | normalize distribution | information-theoretic helpers
// @does: the shared deterministic math kernel — normalizeDistribution, entropy, klDivergence, weightedVariance, weightedStdDev, percentile, median, rankWithTies (roundStable, finite-checked)
// @use: reach here for any standard stats / info-theory primitive before hand-rolling one (21+ importers incl. the energy gate); the canonical home for variance / quantile / entropy
// @exports: normalizeDistribution, entropy, klDivergence, weightedVariance, percentile, median
export function normalizeDistribution(values) {
  assertNumberArray(values, 'distribution');
  for (const value of values) {
    if (value < 0) throw new Error('distribution values must be non-negative');
  }
  const sum = values.reduce((total, value) => total + value, 0);
  if (sum <= 0) throw new Error('distribution must have a positive sum');
  // Fail-closed on aggregate overflow: a sum of 1e308-scale inputs saturates to
  // Infinity, so value/Infinity silently collapses every probability to 0 and
  // downstream entropy/KL emit garbage. A non-finite sum is not a valid
  // distribution — reject it rather than return a [0,...,0] phantom.
  if (!Number.isFinite(sum)) {
    throw new Error('distribution sum overflowed to a non-finite value');
  }
  return values.map((value) => assertFiniteResult(value / sum, 'normalized probability'));
}

export function entropy(probabilities, options = {}) {
  const base = options.base ?? Math.E;
  assertLogBase(base);
  const distribution = normalizeDistribution(probabilities);
  return roundStable(-distribution.reduce((total, probability) => {
    if (probability === 0) return total;
    return total + probability * logBase(probability, base);
  }, 0));
}

export function klDivergence(p, q, options = {}) {
  const base = options.base ?? Math.E;
  assertLogBase(base);
  const left = normalizeDistribution(p);
  const right = normalizeDistribution(q);
  assertSameLength(left, right, 'KL divergence');
  return roundStable(left.reduce((total, probability, index) => {
    const reference = right[index];
    if (probability === 0) return total;
    if (reference === 0) {
      throw new Error('KL divergence is infinite because q has zero where p is positive');
    }
    return total + probability * logBase(probability / reference, base);
  }, 0));
}

export function crossEntropy(p, q, options = {}) {
  const base = options.base ?? Math.E;
  assertLogBase(base);
  const left = normalizeDistribution(p);
  const right = normalizeDistribution(q);
  assertSameLength(left, right, 'cross entropy');
  return roundStable(-left.reduce((total, probability, index) => {
    const reference = right[index];
    if (probability === 0) return total;
    if (reference === 0) {
      throw new Error('cross entropy is infinite because q has zero where p is positive');
    }
    return total + probability * logBase(reference, base);
  }, 0));
}

export function informationGain(before, after, options = {}) {
  // Plain entropy delta H(before) − H(after), in the units of options.base
  // (nats by default). NOT the weighted-children information gain of decision
  // trees, and it CAN be negative when the posterior is more uncertain than
  // the prior (informationGain([1,0],[0.5,0.5],{base:2}) = −1).
  return roundStable(entropy(before, options) - entropy(after, options));
}

export function confidenceDecay({ base, age, halfLife }) {
  assertFiniteNumber(base, 'base');
  assertFiniteNumber(age, 'age');
  assertFiniteNumber(halfLife, 'halfLife');
  if (base < 0 || base > 1) throw new Error('base confidence must be between 0 and 1');
  if (age < 0) throw new Error('age must be non-negative');
  if (halfLife <= 0) throw new Error('halfLife must be positive');
  return roundStable(base * Math.pow(0.5, age / halfLife));
}

// Cox proportional-hazards per-class evidence aging (catalog card 18). A multiplier
// on the BASELINE decay rate keyed on an evidence sourceClass: effectiveDecayRate =
// baseRate · exp(beta · covariate), here pre-collapsed to a hardcoded closed-set
// prior (Phase 1 — beta is fit by partial likelihood in Phase 2, owner-gated). A
// runtime-verified MATCH ages SLOW (<1); council-text / a happy-path report ages
// FAST (>1) so the staleness term rises faster for the classes YURI already
// distrusts (PROSE-NOT-OUTRUN-WIRING made mechanical).
//
// FAIL-SAFE, not fail-open: an UNKNOWN class returns 1.0 (baseline), NEVER < 1.0 —
// an unrecognized source must not be granted slow aging it did not earn. The map is
// a CLOSED set; membership is exact, never a charset / prefix match.
const HAZARD_MULTIPLIERS = Object.freeze({
  runtime_trace: 0.3,
  test: 0.3,
  fixture: 1.0,
  schema: 1.0,
  advisory: 3.0,
  report: 3.0,
  operator_note: 0.5,
});

export const HAZARD_CLASSES = Object.freeze(Object.keys(HAZARD_MULTIPLIERS));

export function hazardMultiplier(sourceClass) {
  // Exact closed-set membership only. A non-string, an unknown class, or an
  // attacker-supplied lookalike all collapse to the baseline 1.0 (fail-safe).
  if (typeof sourceClass !== 'string') return 1.0;
  return Object.hasOwn(HAZARD_MULTIPLIERS, sourceClass)
    ? HAZARD_MULTIPLIERS[sourceClass]
    : 1.0;
}

export function dotProduct(left, right) {
  assertVectorPair(left, right, 'dot product');
  return roundStable(assertFiniteResult(
    left.reduce((total, value, index) => total + value * right[index], 0), 'dot product'));
}

export function pNorm(values, p = 2) {
  assertNumberArray(values, 'vector');
  assertFiniteNumber(p, 'p');
  if (p < 1) throw new Error('p-norm requires p >= 1');
  return roundStable(assertFiniteResult(
    Math.pow(values.reduce((total, value) => total + Math.abs(value) ** p, 0), 1 / p), 'p-norm'));
}

export function cosineSimilarity(left, right) {
  assertVectorPair(left, right, 'cosine similarity');
  // Both norms can be individually finite while their product overflows —
  // roundStable can round a norm of ~sqrt(MAX_VALUE) up past the exact
  // square-root boundary, so the denominator must pass the same fail-closed
  // invariant as the aggregates (otherwise finite-dot/Infinity → silent 0).
  const denominator = assertFiniteResult(pNorm(left, 2) * pNorm(right, 2), 'cosine similarity denominator');
  if (denominator <= 0) throw new Error('cosine similarity requires non-zero vectors');
  const similarity = dotProduct(left, right) / denominator;
  if (Math.abs(similarity - 1) < EPSILON) return 1;
  if (Math.abs(similarity + 1) < EPSILON) return -1;
  return roundStable(clampNumber(similarity, -1, 1));
}

export function weightedMean(values, weights) {
  assertVectorPair(values, weights, 'weighted mean');
  const weightSum = assertWeightVector(weights);
  // Fail-closed on overflow: a numerator/denominator of 1e308-scale values can
  // saturate to Infinity/Infinity = NaN. A weighted mean is an aggregate
  // primitive that must never silently emit NaN/Infinity.
  const mean = values.reduce((total, value, index) => total + value * weights[index], 0) / weightSum;
  return roundStable(assertFiniteResult(mean, 'weighted mean'));
}

export function weightedVariance(values, weights) {
  // Population (biased) form: divides by the raw weight sum — no Bessel /
  // effective-sample-size correction. Deliberate: full-population aggregate
  // weights, not a sample estimator.
  assertVectorPair(values, weights, 'weighted variance');
  const weightSum = assertWeightVector(weights);
  const mean = weightedMean(values, weights);
  return roundStable(assertFiniteResult(
    values.reduce((total, value, index) => total + weights[index] * (value - mean) ** 2, 0) / weightSum, 'weighted variance'));
}

export function weightedStdDev(values, weights) {
  return roundStable(Math.sqrt(weightedVariance(values, weights)));
}

export function median(values) {
  // Averaged-middle convention (house registry axis 8). Kernel-strict
  // non-finite policy: throws on any NaN/Infinity entry via assertNumberArray;
  // boundary callers pre-filter with Number.isFinite before calling in.
  assertNumberArray(values, 'median input');
  const s = [...values].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return roundStable(s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2);
}

export function percentile(values, p) {
  // Nearest-rank (ceil) convention: sorted[ceil(p/100·n)−1], no interpolation.
  // Under nearest-rank, p50 ≠ averaged median on even n BY DESIGN — both are
  // correct; never "fix" them to agree. Kernel-strict on non-finite entries.
  assertFiniteNumber(p, 'percentile');
  if (p <= 0 || p > 100) throw new Error('percentile p must be in (0, 100]');
  assertNumberArray(values, 'percentile input');
  const s = [...values].sort((a, b) => a - b);
  return roundStable(s[Math.ceil((p / 100) * s.length) - 1]);
}

/** Average ranks over tie blocks (1-based positions). Shared rank primitive. */
export function rankWithTies(arr) {
  assertNumberArray(arr, 'rankWithTies input');
  const idx = arr.map((v, i) => [v, i]).sort((a, b) => a[0] - b[0]);
  const r = new Array(arr.length);
  for (let i = 0; i < idx.length;) {
    let j = i;
    while (j + 1 < idx.length && idx[j + 1][0] === idx[i][0]) j += 1;
    const avg = (i + j + 2) / 2; // mean of the tied block's 1-based positions i+1..j+1
    for (let k = i; k <= j; k += 1) r[idx[k][1]] = avg;
    i = j + 1;
  }
  return r;
}

/** Pearson correlation; constant input on either side → 0 (no linear signal). */
export function pearson(xs, ys) {
  assertVectorPair(xs, ys, 'pearson');
  const n = xs.length;
  if (n < 2) return 0;
  const mx = xs.reduce((a, b) => a + b) / n;
  const my = ys.reduce((a, b) => a + b) / n;
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (let i = 0; i < n; i += 1) {
    const dx = xs[i] - mx;
    const dy = ys[i] - my;
    sxy += dx * dy;
    sxx += dx * dx;
    syy += dy * dy;
  }
  return (sxx > 0 && syy > 0) ? roundStable(sxy / Math.sqrt(sxx * syy)) : 0;
}

export function spearman(xs, ys) {
  // Spearman = Pearson over average-tied ranks — exact under ties. The
  // 6Σd²/n(n²−1) shortcut is valid only for distinct ranks and is BANNED
  // (registry axis 2). Degenerate input (zero rank variance on either side)
  // returns 0: no monotone signal.
  assertVectorPair(xs, ys, 'spearman');
  return pearson(rankWithTies(xs), rankWithTies(ys));
}

export function brierScore(predictions, outcomes) {
  assertVectorPair(predictions, outcomes, 'Brier score');
  return roundStable(predictions.reduce((total, probability, index) => {
    assertProbability(probability, `prediction ${index}`);
    assertProbability(outcomes[index], `outcome ${index}`);
    return total + (probability - outcomes[index]) ** 2;
  }, 0) / predictions.length);
}

export function logLoss(predictions, outcomes, options = {}) {
  const epsilon = options.epsilon ?? 1e-15;
  assertFiniteNumber(epsilon, 'epsilon');
  if (epsilon <= 0 || epsilon >= 0.5) throw new Error('epsilon must be between 0 and 0.5');
  assertVectorPair(predictions, outcomes, 'log loss');
  return roundStable(-predictions.reduce((total, probability, index) => {
    assertProbability(probability, `prediction ${index}`);
    assertProbability(outcomes[index], `outcome ${index}`);
    const clipped = clampNumber(probability, epsilon, 1 - epsilon);
    const outcome = outcomes[index];
    return total + outcome * Math.log(clipped) + (1 - outcome) * Math.log(1 - clipped);
  }, 0) / predictions.length);
}

export function bayesUpdate({ prior, likelihoodIfTrue, likelihoodIfFalse }) {
  assertProbability(prior, 'prior');
  assertFiniteNumber(likelihoodIfTrue, 'likelihoodIfTrue');
  assertFiniteNumber(likelihoodIfFalse, 'likelihoodIfFalse');
  if (likelihoodIfTrue < 0 || likelihoodIfFalse < 0) throw new Error('likelihoods must be non-negative');
  const positiveMass = prior * likelihoodIfTrue;
  const negativeMass = (1 - prior) * likelihoodIfFalse;
  const evidenceMass = positiveMass + negativeMass;
  if (evidenceMass <= 0) throw new Error('Bayes update requires positive evidence mass');
  return roundStable(positiveMass / evidenceMass);
}

export function softmax(values, options = {}) {
  assertNumberArray(values, 'softmax vector');
  const temperature = options.temperature ?? 1;
  assertFiniteNumber(temperature, 'temperature');
  if (temperature <= 0) throw new Error('temperature must be positive');
  const scaled = values.map((value) => value / temperature);
  const maxValue = Math.max(...scaled);
  const expValues = scaled.map((value) => Math.exp(value - maxValue));
  return normalizeDistribution(expValues).map(roundStable);
}

export function expectedValue(values, probabilities) {
  assertVectorPair(values, probabilities, 'expected value');
  const distribution = normalizeDistribution(probabilities);
  // Overflow-safe by construction: normalized probabilities bound every
  // partial sum by max|value|, which assertNumberArray already proved finite.
  return roundStable(values.reduce((total, value, index) => total + value * distribution[index], 0));
}

export function logScale(value, min, max, points = 1) {
  assertFiniteNumber(value, 'value');
  assertFiniteNumber(min, 'min');
  assertFiniteNumber(max, 'max');
  assertFiniteNumber(points, 'points');
  if (min <= 0) throw new Error('logScale min must be positive');
  if (max <= min) throw new Error('logScale max must be greater than min');
  if (points < 0) throw new Error('logScale points must be non-negative');
  if (value <= min) return 0;
  if (value >= max) return points;
  return roundStable((Math.log(value) - Math.log(min)) / (Math.log(max) - Math.log(min)) * points);
}

export function bregmanDivergence(p, q, psi) {
  // Bregman divergence D_psi(p||q) = psi(p) - psi(q) - <grad psi(q), p - q>.
  // psi.value(x) -> scalar potential; psi.grad(x) -> gradient vector.
  // canary: psi = negEntropy reproduces klDivergence to the digit — for raw
  // counts too, because the potential's domain projection is applied ONCE here.
  if (!psi || typeof psi.value !== 'function' || typeof psi.grad !== 'function') {
    throw new Error('Bregman potential must expose value(x) and grad(x) functions');
  }
  assertVectorPair(p, q, 'Bregman divergence');
  // Domain projection: a potential may declare its domain (e.g. the simplex)
  // via project(x). value, grad, AND the inner product consume the SAME
  // projected vectors — mixing a normalizing potential with raw deltas was the
  // silent-wrong bug (bregman([2,2],[1,3]) returned 0.9678, KL says 0.1438).
  const hasProject = typeof psi.project === 'function';
  const pp = hasProject ? psi.project(p) : p;
  const qq = hasProject ? psi.project(q) : q;
  const psiP = psi.value(pp);
  const psiQ = psi.value(qq);
  assertFiniteNumber(psiP, 'Bregman potential at p');
  assertFiniteNumber(psiQ, 'Bregman potential at q');
  const gradQ = psi.grad(qq);
  assertNumberArray(gradQ, 'Bregman gradient at q');
  assertSameLength(gradQ, pp, 'Bregman gradient');
  let inner = 0;
  for (let index = 0; index < pp.length; index += 1) {
    inner += gradQ[index] * (pp[index] - qq[index]);
  }
  const divergence = psiP - psiQ - inner;
  // Bregman divergence is non-negative for convex psi; clamp tiny negative round-off to 0.
  if (divergence < 0 && divergence > -1e-9) return 0;
  if (divergence < 0) throw new Error('Bregman divergence is negative; potential is not convex on this input');
  return roundStable(divergence);
}

export function negEntropyPotential(options = {}) {
  // Convex potential psi(x) = sum_i x_i log_b(x_i) on the (normalized) simplex.
  // Its Bregman divergence equals KL divergence to the digit (the regression canary).
  const base = options.base ?? Math.E;
  assertLogBase(base);
  return {
    base,
    // Simplex projection, applied once by bregmanDivergence. The internal
    // normalizeDistribution in value/grad stays as defense for direct callers —
    // idempotent to within 1 ulp on projected input; exact on dyadic fixtures.
    project: (x) => normalizeDistribution(x),
    value: (x) => {
      const distribution = normalizeDistribution(x);
      return distribution.reduce((total, value) => {
        if (value === 0) return total;
        return total + value * logBase(value, base);
      }, 0);
    },
    grad: (x) => {
      const distribution = normalizeDistribution(x);
      // d/dx_i [x_i log_b x_i] = log_b(x_i) + 1/ln(b); the constant cancels on the simplex.
      return distribution.map((value) => {
        if (value === 0) throw new Error('negEntropy gradient is undefined at zero mass');
        return logBase(value, base) + 1 / Math.log(base);
      });
    },
  };
}

export function maxEntBelief(meanRank, support, options = {}) {
  // Maximum-entropy distribution p_i ∝ exp(lambda * i) over i in [0, support-1]
  // matching the constraint E[i] = meanRank. lambda found by a 1-D Newton solve.
  assertFiniteNumber(meanRank, 'meanRank');
  if (!Number.isInteger(support) || support < 2) {
    throw new Error('support must be an integer >= 2');
  }
  const maxRank = support - 1;
  if (meanRank < 0 || meanRank > maxRank) {
    throw new Error(`meanRank must be within [0, ${maxRank}]`);
  }
  const tolerance = options.tolerance ?? 1e-12;
  const maxIterations = options.maxIterations ?? 100;
  // Validate solver options BEFORE the uniform early-return so bad options
  // always throw (maxIterations:0 used to silently return the uniform
  // distribution regardless of meanRank — a constraint-violating phantom).
  assertFiniteNumber(tolerance, 'tolerance');
  if (tolerance <= 0) throw new Error('tolerance must be positive');
  if (!Number.isInteger(maxIterations) || maxIterations < 1) {
    throw new Error('maxIterations must be an integer >= 1');
  }
  const uniformMean = maxRank / 2;
  // Exact uniform case: lambda = 0 (avoids 0/0 in the Newton derivative).
  if (Math.abs(meanRank - uniformMean) < 1e-12) {
    return new Array(support).fill(roundStable(1 / support));
  }

  const ranks = Array.from({ length: support }, (_, index) => index);
  const meanGivenLambda = (lambda) => {
    const dist = buildExpDistribution(ranks, lambda);
    let mean = 0;
    for (let index = 0; index < support; index += 1) mean += ranks[index] * dist[index];
    return { mean, dist };
  };
  const varianceGivenLambda = (lambda, mean) => {
    const dist = buildExpDistribution(ranks, lambda);
    let variance = 0;
    for (let index = 0; index < support; index += 1) variance += (ranks[index] - mean) ** 2 * dist[index];
    return variance;
  };

  let lambda = 0;
  let distribution = buildExpDistribution(ranks, lambda);
  for (let iteration = 0; iteration < maxIterations; iteration += 1) {
    const { mean, dist } = meanGivenLambda(lambda);
    distribution = dist;
    const residual = mean - meanRank;
    if (Math.abs(residual) < tolerance) break;
    // dE[i]/dlambda = Var(i) under the exponential family (always > 0 off the uniform case).
    const slope = varianceGivenLambda(lambda, mean);
    if (slope < EPSILON) break;
    lambda -= residual / slope;
    if (!Number.isFinite(lambda)) throw new Error('maxEntBelief Newton step diverged');
  }
  return distribution.map(roundStable);
}

export function lmsrIncrement(beliefBefore, beliefAfter, b) {
  // Logarithmic Market Scoring Rule per-step increment on a single resolved index:
  // credit = b * (ln beliefAfter[resolved] - ln beliefBefore[resolved]).
  // Strictly proper. `bound` = b*ln(N) is the UNIFORM-PRIOR worst case only:
  // moving from the uniform 1/N to certainty 1 costs exactly b*ln(N). It is NOT a
  // per-increment bound from an arbitrary prior — from a near-zero pBefore a
  // single increment can far exceed b*ln(N) (e.g. pBefore=MIN_VALUE → ~744 for
  // b=1,N=2). Callers must read `bound` as the uniform-prior subsidy cap, not a
  // guarantee on `increments` for non-uniform beliefBefore.
  assertFiniteNumber(b, 'b');
  if (b <= 0) throw new Error('LMSR liquidity b must be positive');
  const before = normalizeDistribution(beliefBefore);
  const after = normalizeDistribution(beliefAfter);
  assertSameLength(before, after, 'LMSR increment');
  const increments = before.map((_, index) => {
    const pAfter = after[index];
    const pBefore = before[index];
    if (pBefore <= 0 || pAfter <= 0) {
      throw new Error('LMSR increment requires positive belief mass on every index');
    }
    return roundStable(b * (Math.log(pAfter) - Math.log(pBefore)));
  });
  const bound = roundStable(b * Math.log(before.length));
  return { increments, bound };
}

export function mergeLaneEvidence(eValues, weights, dependence = 'arbitrary') {
  // Merge calibrated e-values under a dependence assumption.
  // 'independent' -> product (valid only for provably-independent lanes);
  // 'arbitrary'   -> weighted arithmetic mean (the only admissible merge under
  // arbitrary dependence). Equal-weight mean of N identical lanes == one lane,
  // which is exactly how council redundancy gets exposed.
  assertNumberArray(eValues, 'e-values');
  for (const value of eValues) {
    if (value < 0) throw new Error('e-values must be non-negative');
  }
  if (dependence === 'independent') {
    const merged = eValues.reduce((product, value) => product * value, 1);
    // Fail-closed on overflow: a product of 1e308-scale e-values saturates to
    // Infinity. A merged e-value must be a finite scalar, not a phantom Infinity.
    return { merged: roundStable(assertFiniteResult(merged, 'merged e-value')), merge: 'product', dependence };
  }
  if (dependence !== 'arbitrary') {
    throw new Error("dependence must be 'arbitrary' or 'independent'");
  }
  const merged = weightedMean(eValues, weights);
  return { merged: roundStable(merged), merge: 'weighted-mean', dependence };
}

export function cusum(signedDeltas, options = {}) {
  // One-sided UPPER CUSUM change-point alarm on a SIGNED stream.
  // S_t = max(0, S_{t-1} + (x_t - mu0) - k); alarm when S_t > h.
  // Catches slow regime drift that no single step flags as an outlier.
  assertNumberArray(signedDeltas, 'signed deltas');
  const k = options.k ?? 0;
  const h = options.h ?? 0;
  const mu0 = options.mu0 ?? 0;
  assertFiniteNumber(k, 'k');
  assertFiniteNumber(h, 'h');
  assertFiniteNumber(mu0, 'mu0');
  if (k < 0) throw new Error('CUSUM slack k must be non-negative');
  if (h <= 0) throw new Error('CUSUM threshold h must be positive');

  // changeIndex is the ALARM index (first S_t > h), NOT the change-point
  // estimate. The canonical change-point estimate is lastZeroIndex + 1 —
  // change onset right after the last time S sat at zero before the climb;
  // lastZeroIndex = -1 means the climb began at stream start (or no alarm).
  // lastZeroIndex is computed on the RAW statistic (exact zeros come from the
  // max(0,..) clamp); in the sub-1e-12 band the roundStable series may display
  // 0 where the raw statistic was a positive sliver — the raw value governs.
  let cumulative = 0;
  let alarm = false;
  let changeIndex = -1;
  let lastZeroIndex = -1;
  let peak = 0;
  const series = [];
  for (let index = 0; index < signedDeltas.length; index += 1) {
    cumulative = Math.max(0, cumulative + (signedDeltas[index] - mu0) - k);
    series.push(roundStable(cumulative));
    if (!alarm && cumulative === 0) lastZeroIndex = index;
    if (cumulative > peak) peak = cumulative;
    if (!alarm && cumulative > h) {
      alarm = true;
      changeIndex = index;
    }
  }
  return { alarm, changeIndex, lastZeroIndex: alarm ? lastZeroIndex : -1, statistic: roundStable(cumulative), peak: roundStable(peak), series };
}

export function scalarKalman(stream, options = {}) {
  // Scalar Kalman recovery filter with one-sided NIS gating.
  // Each step: predict (var += q), innovate (y = z - estimate),
  // S = var + r, gain = var/S, update estimate + var. surprised when y>0 and
  // NIS = y^2/S exceeds the chi-square(1) threshold. q drives re-sensitization.
  assertNumberArray(stream, 'stream');
  const q = options.q ?? 0;
  const r = options.r ?? 1;
  const threshold = options.threshold ?? 3.841458820694124; // chi2(1) at 0.95
  assertFiniteNumber(q, 'q');
  assertFiniteNumber(r, 'r');
  assertFiniteNumber(threshold, 'threshold');
  if (q < 0) throw new Error('process noise q must be non-negative');
  if (r <= 0) throw new Error('measurement noise r must be positive');
  if (threshold <= 0) throw new Error('NIS threshold must be positive');

  let estimate = options.initialEstimate ?? stream[0];
  let variance = options.initialVariance ?? r;
  assertFiniteNumber(estimate, 'initialEstimate');
  assertFiniteNumber(variance, 'initialVariance');
  if (variance < 0) throw new Error('initial variance must be non-negative');

  const estimates = [];
  const surprises = [];
  let surprisedCount = 0;
  for (let index = 0; index < stream.length; index += 1) {
    const measurement = stream[index];
    const priorVariance = variance + q;
    const innovation = measurement - estimate;
    const innovationVariance = priorVariance + r;
    const nis = (innovation * innovation) / innovationVariance;
    const surprised = innovation > 0 && nis > threshold;
    if (surprised) surprisedCount += 1;
    surprises.push({ index, nis: roundStable(nis), surprised });
    const gain = priorVariance / innovationVariance;
    estimate = estimate + gain * innovation;
    variance = (1 - gain) * priorVariance;
    estimates.push(roundStable(estimate));
  }
  return {
    estimate: roundStable(estimate),
    variance: roundStable(variance),
    estimates,
    surprises,
    surprisedCount,
  };
}

function buildExpDistribution(ranks, lambda) {
  const maxExponent = Math.max(...ranks.map((rank) => lambda * rank));
  const unnormalized = ranks.map((rank) => Math.exp(lambda * rank - maxExponent));
  const sum = unnormalized.reduce((total, value) => total + value, 0);
  return unnormalized.map((value) => value / sum);
}

export function makeMathResult({ operation, input, result, proof = {} }) {
  if (!operation) throw new Error('operation is required');
  return {
    schema: RESULT_SCHEMA,
    operation,
    deterministic: true,
    inputsHash: sha256Stable(input ?? {}),
    resultHash: sha256Stable(result ?? {}),
    result,
    proof,
  };
}

export function dijkstra(graph, source, target, options = {}) {
  const normalized = normalizeGraph(graph, { allowNegative: false });
  assertNode(normalized, source, 'source');
  assertNode(normalized, target, 'target');

  const distances = new Map(normalized.nodes.map((node) => [node, Infinity]));
  const previous = new Map();
  const visited = new Set();
  const visitedOrder = [];
  const queue = new MinPriorityQueue();

  distances.set(source, 0);
  queue.push(source, 0);

  while (!queue.isEmpty()) {
    const current = queue.pop();
    if (visited.has(current.value)) continue;
    visited.add(current.value);
    visitedOrder.push(current.value);
    if (current.value === target) break;

    for (const edge of normalized.adjacency.get(current.value) || []) {
      if (visited.has(edge.to)) continue;
      const nextDistance = distances.get(current.value) + edge.weight;
      if (nextDistance + EPSILON < distances.get(edge.to)) {
        distances.set(edge.to, nextDistance);
        previous.set(edge.to, current.value);
        queue.push(edge.to, nextDistance);
      }
    }
  }

  return buildPathResult({
    algorithm: 'dijkstra',
    source,
    target,
    cost: distances.get(target),
    previous,
    visitedOrder,
    proof: {
      algorithm: 'dijkstra',
      complexity: 'O((V + E) log V)',
      assumptions: ['non_negative_edge_weights'],
      warnings: options.warnings || [],
    },
  });
}

export function astar(graph, source, target, heuristic = {}, options = {}) {
  const normalized = normalizeGraph(graph, { allowNegative: false });
  assertNode(normalized, source, 'source');
  assertNode(normalized, target, 'target');
  const heuristicFn = buildHeuristic(heuristic);
  const assumptions = ['non_negative_edge_weights'];
  const warnings = [];

  if (options.strict) {
    // Under the no-reopen closed set below, consistency — not mere
    // admissibility — is the property that guarantees a popped node's gScore
    // is final. Admissibility is checked first to preserve its error contract.
    validateAdmissibleHeuristic(normalized, target, heuristicFn);
    validateConsistentHeuristic(normalized, heuristicFn);
    assumptions.push('admissible_heuristic_checked', 'consistent_heuristic_checked');
  } else {
    warnings.push('heuristic_admissibility_not_checked');
  }

  const gScore = new Map(normalized.nodes.map((node) => [node, Infinity]));
  const previous = new Map();
  const closed = new Set();
  const visitedOrder = [];
  const queue = new MinPriorityQueue();

  gScore.set(source, 0);
  queue.push(source, heuristicFn(source));

  while (!queue.isEmpty()) {
    const current = queue.pop();
    if (closed.has(current.value)) continue;
    closed.add(current.value);
    visitedOrder.push(current.value);
    if (current.value === target) break;

    for (const edge of normalized.adjacency.get(current.value) || []) {
      const tentative = gScore.get(current.value) + edge.weight;
      if (tentative + EPSILON < gScore.get(edge.to)) {
        gScore.set(edge.to, tentative);
        previous.set(edge.to, current.value);
        queue.push(edge.to, tentative + heuristicFn(edge.to));
      }
    }
  }

  const result = buildPathResult({
    algorithm: 'astar',
    source,
    target,
    cost: gScore.get(target),
    previous,
    visitedOrder,
    proof: {
      algorithm: 'astar',
      complexity: 'O((V + E) log V) with binary heap frontier',
      assumptions,
      warnings,
    },
  });
  if (result.reachable && result.path.length) {
    // Defense-in-depth cost invariant: the reported cost must equal the
    // edge-sum of the returned path. Both sides pass through the same
    // 15-significant-digit roundStable quantization, compared under a relative
    // tolerance — an absolute check would fire on its own rounding residue for
    // |cost| > ~1e6 with non-dyadic weights. Post-consistency-check this is a
    // dead assert in strict mode; it exists to catch future search-core
    // regressions. Non-strict is the documented no-guarantee lane: the result
    // stops lying about itself (cost reconciled to the actual path), warned.
    const pathCost = computePathCost(normalized.adjacency, result.path);
    const roundedPathCost = roundStable(pathCost);
    if (Math.abs(roundedPathCost - result.cost) > 1e-9 * Math.max(1, Math.abs(result.cost))) {
      if (options.strict) {
        throw new Error(`astar invariant violation: reported cost ${result.cost} != reconstructed path cost ${roundedPathCost}`);
      }
      result.cost = roundedPathCost;
      result.proof.warnings.push('cost_recomputed_from_reconstructed_path');
    }
  }
  return result;
}

export function topologicalSort(dag) {
  if (!dag || typeof dag !== 'object') throw new Error('dag must be an object');
  const nodes = [...new Set(dag.nodes || [])];
  if (!nodes.length) throw new Error('dag.nodes must include at least one node');
  const nodeSet = new Set(nodes);
  const indegree = new Map(nodes.map((node) => [node, 0]));
  const adjacency = new Map(nodes.map((node) => [node, []]));

  for (const edge of dag.edges || []) {
    if (!nodeSet.has(edge.from) || !nodeSet.has(edge.to)) {
      throw new Error(`edge references unknown node: ${edge.from} -> ${edge.to}`);
    }
    adjacency.get(edge.from).push(edge.to);
    indegree.set(edge.to, indegree.get(edge.to) + 1);
  }

  const queue = nodes.filter((node) => indegree.get(node) === 0);
  const order = [];
  for (let index = 0; index < queue.length; index += 1) {
    const current = queue[index];
    order.push(current);
    for (const next of adjacency.get(current)) {
      indegree.set(next, indegree.get(next) - 1);
      if (indegree.get(next) === 0) queue.push(next);
    }
  }

  if (order.length !== nodes.length) {
    throw new Error('topological sort failed because the graph contains a cycle');
  }

  return {
    algorithm: 'topological-sort',
    order,
    proof: {
      algorithm: 'kahn',
      complexity: 'O(V + E)',
      assumptions: ['directed_acyclic_graph'],
      warnings: [],
    },
  };
}

function validateAdmissibleHeuristic(normalized, target, heuristicFn) {
  for (const node of normalized.nodes) {
    const estimate = heuristicFn(node);
    if (estimate < 0) throw new Error(`heuristic for ${node} must be non-negative`);
    const trueCost = dijkstra(normalized.sourceGraph, node, target).cost;
    if (Number.isFinite(trueCost) && estimate > trueCost + EPSILON) {
      throw new Error(`inadmissible heuristic for ${node}: ${estimate} > ${trueCost}`);
    }
  }
}

function validateConsistentHeuristic(normalized, heuristicFn) {
  // Consistency (monotonicity): h(u) <= w(u,v) + h(v) for EVERY directed edge
  // (normalized.edges already contains both directions for undirected graphs).
  // Under the no-reopen closed set in astar, consistency — not mere
  // admissibility — is what guarantees a popped node's gScore is final. O(E).
  for (const edge of normalized.edges) {
    const hFrom = heuristicFn(edge.from);
    const hTo = heuristicFn(edge.to);
    if (hFrom > edge.weight + hTo + EPSILON) {
      throw new Error(`inconsistent heuristic at edge ${edge.from} -> ${edge.to}: h(${edge.from})=${hFrom} > ${edge.weight} + h(${edge.to})=${hTo}`);
    }
  }
}

function computePathCost(adjacency, path) {
  let total = 0;
  for (let i = 0; i + 1 < path.length; i += 1) {
    const candidates = (adjacency.get(path[i]) || []).filter((e) => e.to === path[i + 1]);
    if (!candidates.length) throw new Error(`reconstructed path uses missing edge ${path[i]} -> ${path[i + 1]}`);
    total += Math.min(...candidates.map((e) => e.weight)); // min handles parallel edges
  }
  return total;
}

function buildPathResult({ algorithm, source, target, cost, previous, visitedOrder, proof }) {
  const reachable = Number.isFinite(cost);
  const path = reachable ? reconstructPath(previous, source, target) : [];
  return {
    algorithm,
    source,
    target,
    path,
    cost: reachable ? roundStable(cost) : Infinity,
    reachable,
    visitedOrder,
    expandedCount: visitedOrder.length,
    proof,
  };
}

function reconstructPath(previous, source, target) {
  const path = [target];
  let current = target;
  while (current !== source) {
    current = previous.get(current);
    if (!current) return [];
    path.push(current);
  }
  return path.reverse();
}

function normalizeGraph(graph, options = {}) {
  if (!graph || typeof graph !== 'object') throw new Error('graph must be an object');
  const nodes = [...new Set(graph.nodes || [])];
  if (!nodes.length) throw new Error('graph.nodes must include at least one node');
  const nodeSet = new Set(nodes);
  const directed = graph.directed !== false;
  const adjacency = new Map(nodes.map((node) => [node, []]));
  const sourceEdges = [];

  for (const edge of graph.edges || []) {
    assertEdge(edge, nodeSet, options);
    adjacency.get(edge.from).push({ from: edge.from, to: edge.to, weight: edge.weight });
    sourceEdges.push({ from: edge.from, to: edge.to, weight: edge.weight });
    if (!directed) {
      adjacency.get(edge.to).push({ from: edge.to, to: edge.from, weight: edge.weight });
      sourceEdges.push({ from: edge.to, to: edge.from, weight: edge.weight });
    }
  }

  return {
    nodes,
    edges: sourceEdges,
    directed: true,
    adjacency,
    sourceGraph: {
      directed: true,
      nodes,
      edges: sourceEdges,
    },
  };
}

function assertEdge(edge, nodeSet, options) {
  if (!edge || typeof edge !== 'object') throw new Error('edge must be an object');
  if (!nodeSet.has(edge.from) || !nodeSet.has(edge.to)) {
    throw new Error(`edge references unknown node: ${edge.from} -> ${edge.to}`);
  }
  assertFiniteNumber(edge.weight, `edge weight ${edge.from} -> ${edge.to}`);
  if (!options.allowNegative && edge.weight < 0) {
    throw new Error('Dijkstra/A* require non-negative edge weights');
  }
}

function buildHeuristic(heuristic) {
  if (typeof heuristic === 'function') {
    return (node) => {
      const value = heuristic(node);
      assertFiniteNumber(value, `heuristic for ${node}`);
      return value;
    };
  }
  if (!heuristic || typeof heuristic !== 'object') throw new Error('heuristic must be a function or object');
  return (node) => {
    // Object.hasOwn: a node named 'constructor'/'toString' must default to 0,
    // not read the inherited prototype property.
    const value = Object.hasOwn(heuristic, node) ? heuristic[node] : 0;
    assertFiniteNumber(value, `heuristic for ${node}`);
    return value;
  };
}

function assertNode(graph, node, label) {
  if (!graph.nodes.includes(node)) throw new Error(`${label} node is not in graph: ${node}`);
}

function assertSameLength(left, right, label) {
  if (left.length !== right.length) throw new Error(`${label} requires distributions of equal length`);
}

function assertVectorPair(left, right, label) {
  assertNumberArray(left, `${label} left`);
  assertNumberArray(right, `${label} right`);
  assertSameLength(left, right, label);
}

function assertNumberArray(values, label) {
  if (!Array.isArray(values) || values.length === 0) throw new Error(`${label} must be a non-empty array`);
  for (const value of values) {
    assertFiniteNumber(value, label);
  }
}

function assertWeightVector(weights) {
  let total = 0;
  for (const weight of weights) {
    if (weight < 0) throw new Error('weights must be non-negative');
    total += weight;
  }
  if (total <= 0) throw new Error('weights must have a positive sum');
  return total;
}

function assertProbability(value, label) {
  assertFiniteNumber(value, label);
  if (value < 0 || value > 1) throw new Error(`${label} must be between 0 and 1`);
}

function assertFiniteNumber(value, label) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`${label} must be a finite number`);
  }
}

// Post-aggregate finite invariant. Inputs may be individually valid yet still
// produce a non-finite aggregate via overflow (sum/product of 1e308-scale terms
// → Infinity → Infinity/Infinity → NaN). These primitives must fail closed on a
// non-finite intermediate rather than silently emit NaN/Infinity/[0,...,0].
function assertFiniteResult(value, label) {
  if (!Number.isFinite(value)) {
    throw new Error(`${label} is non-finite (aggregate overflow)`);
  }
  return value;
}

function assertLogBase(base) {
  // Entropy-family bases must be > 1: a base in (0,1) silently flips the sign
  // of every entropy/KL/cross-entropy (H([.5,.5], base .5) = −1), violating
  // H >= 0. The finite check stays first — Infinity > 1 is true, and
  // logBase(x, Infinity) would return 0 for every distribution.
  assertFiniteNumber(base, 'log base');
  if (base <= 1) throw new Error('log base must be a finite number greater than 1');
}

function logBase(value, base) {
  return Math.log(value) / Math.log(base);
}

function roundStable(value) {
  if (!Number.isFinite(value)) return value;
  if (Math.abs(value) < EPSILON) return 0;
  return Number(value.toPrecision(15));
}

function clampNumber(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function sha256Stable(value) {
  return createHash('sha256').update(stableJson(value)).digest('hex');
}

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`;
  }
  if (typeof value === 'number' && !Number.isFinite(value)) return JSON.stringify(String(value));
  return JSON.stringify(value);
}

class MinPriorityQueue {
  #items = [];

  isEmpty() {
    return this.#items.length === 0;
  }

  push(value, priority) {
    this.#items.push({ value, priority });
    this.#bubbleUp(this.#items.length - 1);
  }

  pop() {
    if (this.#items.length === 0) return null;
    const root = this.#items[0];
    const last = this.#items.pop();
    if (this.#items.length > 0) {
      this.#items[0] = last;
      this.#sinkDown(0);
    }
    return root;
  }

  #bubbleUp(index) {
    while (index > 0) {
      const parent = Math.floor((index - 1) / 2);
      if (this.#items[parent].priority <= this.#items[index].priority) break;
      this.#swap(parent, index);
      index = parent;
    }
  }

  #sinkDown(index) {
    while (true) {
      const left = index * 2 + 1;
      const right = index * 2 + 2;
      let smallest = index;
      if (left < this.#items.length && this.#items[left].priority < this.#items[smallest].priority) {
        smallest = left;
      }
      if (right < this.#items.length && this.#items[right].priority < this.#items[smallest].priority) {
        smallest = right;
      }
      if (smallest === index) break;
      this.#swap(index, smallest);
      index = smallest;
    }
  }

  #swap(left, right) {
    const temp = this.#items[left];
    this.#items[left] = this.#items[right];
    this.#items[right] = temp;
  }
}
