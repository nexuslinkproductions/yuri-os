#!/usr/bin/env node
// @capability: neuron-loop-trend
// @serves: sustained-decline alarm for a score time-series | slow-drift detection | CUSUM change-point on improvement_score | Kalman recovery estimate for neuron-loop
// @does: computeScoreTrend(scores) wraps the Tier-1 math-kernel's one-sided upper
//   CUSUM (cusum) and scalar Kalman filter (scalarKalman) into a single, never-throw
//   advisory readout over an oldest->newest improvement_score series. Detects
//   sustained decline invisible to a single-step diff (neuron-loop's existing
//   flaws_delta/rules_delta are SHOCK-only, vs-immediately-prior views); stays
//   silent on noisy-stable or improving traces; degenerate/flat input never
//   fabricates an alarm.
// @use: reach here before hand-rolling any change-point/trend-alarm logic over a
//   bounded numeric run-history (synthesis logs, calibration scores, health
//   metrics) — do not re-derive CUSUM/Kalman math, wrap the kernel primitives.
// @exports: computeScoreTrend
//
// Sign convention (read carefully before touching k/h/scale): the one-sided
// UPPER CUSUM in math-kernel only climbs on POSITIVE signed input. A DECLINING
// score is the failure mode we must catch, so each step's signed delta is
// `scores[i] - scores[i + 1]` (previous minus next) — a downward score move
// yields a POSITITVE signed delta (climbs the CUSUM), and an upward score move
// yields a NEGATIVE signed delta (immediately clamped to 0 by max(0, ...)).
// This is why an improving trace can never alarm: every signed delta is <= 0.
//
// Scale (k/h) is MAD-derived, not hardcoded magic numbers, so the alarm adapts
// to the actual noise floor of the series rather than a fixed point scale:
//   scale = max(0.6745^-1 * MAD(signedDeltas, center=0), SCALE_FLOOR)
// 0.6745 is the standard MAD->sigma normalization constant (median absolute
// deviation of a standard normal is 0.6745); dividing by it (equivalently
// multiplying by ~1.4826) turns a robust MAD into a robust sigma estimate.
// SCALE_FLOOR keeps k/h from collapsing to 0 on a perfectly flat series (which
// would make ANY nonzero noise a false alarm) without ever fabricating an
// alarm on truly flat data (all signed deltas are exactly 0 either way).
//
// k (CUSUM slack) = 0.25 * scale — absorbs sub-noise-floor jitter.
// h (CUSUM alarm threshold) = 3 * scale — requires several slack-adjusted
//   noise-scales of accumulated decline before alarming (robust to a single
//   outlier step, sensitive to sustained multi-step drift).

import { cusum, scalarKalman, median } from './math/math-kernel.mjs';

const MIN_SAMPLES = 7;
const SCALE_FLOOR = 0.25;
const K_MULT = 0.25;
const H_MULT = 3;
const KALMAN_Q = 0.01;
const KALMAN_R = 1;

function unavailable() {
  return {
    available: false,
    alarm: false,
    changeIndex: -1,
    statistic: 0,
    samples: 0,
    kalman_estimate: null,
  };
}

function sanitizeScores(input) {
  if (!Array.isArray(input)) return null;
  const out = [];
  for (const value of input) {
    if (typeof value !== 'number' || !Number.isFinite(value)) return null;
    out.push(value);
  }
  return out;
}

/**
 * computeScoreTrend(scores) — advisory CUSUM/Kalman readout over an
 * oldest->newest improvement_score series. NEVER throws; unavailable input
 * (non-array, too few points, any non-finite entry) returns a safe default.
 *
 * @param {unknown} scores - array of numbers, oldest -> newest
 * @returns {{available:boolean, alarm:boolean, changeIndex:number,
 *   statistic:number, samples:number, kalman_estimate:number|null}}
 */
export function computeScoreTrend(scores) {
  try {
    const sanitized = sanitizeScores(scores);
    if (!sanitized || sanitized.length < MIN_SAMPLES) return unavailable();

    const n = sanitized.length;
    // signedDeltas[i] = scores[i] - scores[i+1]: decline -> positive (climbs
    // the one-sided upper CUSUM), improvement -> negative (clamped at 0).
    const signedDeltas = [];
    for (let i = 0; i < n - 1; i += 1) {
      signedDeltas.push(sanitized[i] - sanitized[i + 1]);
    }

    const absDeltas = signedDeltas.map((d) => Math.abs(d));
    const mad = median(absDeltas.length ? absDeltas : [0]);
    const scale = Math.max(mad / 0.6745, SCALE_FLOOR);
    const k = K_MULT * scale;
    const h = H_MULT * scale;

    const cusumResult = cusum(signedDeltas, { k, h, mu0: 0 });
    // Map the alarm index from signedDeltas space back into scores space:
    // signedDeltas[i] represents the transition INTO scores[i + 1].
    const changeIndex = cusumResult.alarm ? cusumResult.changeIndex + 1 : -1;

    const kalmanResult = scalarKalman(sanitized, { q: KALMAN_Q, r: KALMAN_R });

    return {
      available: true,
      alarm: cusumResult.alarm,
      changeIndex,
      statistic: cusumResult.statistic,
      samples: n,
      kalman_estimate: kalmanResult.estimate,
    };
  } catch {
    // Never throw — this is a pure advisory readout feeding a sentinel note.
    return unavailable();
  }
}
