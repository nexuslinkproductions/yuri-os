#!/usr/bin/env node
/**
 * Decision-Sim — decision-sim.mjs
 *
 * A STANDING, reusable robust-decision simulator. Graduates the one-off Wave-3 sims
 * (/tmp/wave3-sim-v4/v5) into a general instrument any YURI architecture choice can run
 * through ("calculable simulations at high mass / frequency / precision", owner directive).
 *
 * A PROBLEM is a plain object the caller supplies:
 *   {
 *     name,
 *     discrete:   { dim: [option, ...], ... },          // categorical choices
 *     continuous: { var: [lo, hi], ... },               // bounded real knobs
 *     sampleParams(rng) -> params,                       // draw one uncertainty realization
 *     value(config, params) -> number,                  // realized value of a config under a draw
 *     nullValue?(config, params) -> number,             // optional baseline (do-nothing) value
 *   }
 * config = { ...one option per discrete dim, ...one real per continuous var }.
 *
 * METHODS (Tier-1 research adoption, all JS-native, no deps):
 *   - crossEntropyOptimize  — find the robust optimum over the mixed discrete+continuous space
 *                             WITHOUT enumeration (PROTES/CMA-ES analog), scored by CVaR.
 *   - robustScore           — 0.5·mean + 0.5·CVaR(tail) over uncertainty draws (CVaR replaces a
 *                             hand-tuned risk λ — research recommendation).
 *   - minimaxRegret         — among a candidate set, the config with the lowest MAX regret.
 *   - pgdWitness            — coordinate-descent search for the worst-case parameter point where
 *                             a config's margin over NULL is minimized → the human-readable
 *                             "this choice loses only when P_cat > X" flip rule (PGD-style witness).
 *   - infoGapHorizon        — how far (α) the parameters can deviate from nominal before the
 *                             decision flips — the Info-Gap robustness radius.
 *   - multiverse            — robustness fraction of a winner across many reasonable spec variants
 *                             (specification-curve / multiverse analysis).
 *   - sobolish (QMC)        — low-discrepancy Halton sampler for O(1/N) vs O(1/√N) MC convergence.
 *
 * REPRODUCIBILITY: a seeded PRNG (mulberry32) — same seed ⇒ identical run (the /tmp sims used
 * Math.random and were not reproducible). All randomness flows through the injected rng.
 *
 * Tier-2 (SALib Sobol/Shapley/PAWN, Rhodium/EMA PRIM scenario-discovery) is a Python sidecar —
 * DEFERRED: requires `pip install`, which is OWNER-GATED. This module does Tier-1 only.
 *
 * Related: _SYSTEM/reports/claim-wiring-ops-plan-2026-06-13.md §9–§11 (the Wave-3 sims this
 * generalizes), §10/§12 (the graduate-the-simulator task).
 */

// ---------------------------------------------------------------------------
// Reproducible PRNG + QMC.
// ---------------------------------------------------------------------------

/** mulberry32 — fast seeded PRNG. Returns a function ()=>[0,1). */
// @capability: robust-decision-sim
// @serves: robust decision under uncertainty | CVaR worst-case score | minimax regret | when does a choice flip | flip-rule witness | info-gap robustness | does the winner survive spec changes | quasi-Monte-Carlo sampler
// @does: the robust-optimization engine — robustScore (0.5·mean+0.5·CVaR), crossEntropyOptimize, minimaxRegret, pgdWitness (flip rule), infoGapHorizon, multiverse, + halton/sobolish QMC samplers; seeded/reproducible
// @use: a decision with 2+ paths whose outcome depends on uncertain params — reach here for the COMPUTED EV/worst-case (the quantitative tier under izanagi-bridge); pair with eval-processing for streaming/CRN/stopping
// @exports: robustScore, crossEntropyOptimize, minimaxRegret, pgdWitness, infoGapHorizon, multiverse, makeRng, halton
export function makeRng(seed = 1) {
  let a = seed >>> 0;
  return function rng() {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Standard-normal via Box-Muller (uses the injected rng). */
export function gauss(rng) {
  let u = 0; let v = 0;
  while (!u) u = rng();
  while (!v) v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

/** Halton low-discrepancy value for index i in a prime base — QMC O(1/N) coverage. */
export function halton(i, base) {
  let f = 1; let r = 0; let n = i;
  while (n > 0) { f /= base; r += f * (n % base); n = Math.floor(n / base); }
  return r;
}
const PRIMES = [2, 3, 5, 7, 11, 13, 17, 19, 23, 29, 31, 37, 41, 43, 47, 53];

export function clamp(x, lo = 0, hi = 1) { return Math.max(lo, Math.min(hi, x)); }

// ---------------------------------------------------------------------------
// Sampling configs + scoring.
// ---------------------------------------------------------------------------

function sampleConfig(problem, rng) {
  const c = {};
  for (const [dim, opts] of Object.entries(problem.discrete || {})) c[dim] = opts[Math.floor(rng() * opts.length)];
  for (const [v, [lo, hi]] of Object.entries(problem.continuous || {})) c[v] = lo + rng() * (hi - lo);
  return c;
}

/**
 * Robust score of a config = 0.5·mean + 0.5·CVaR(tailFrac) over `draws` uncertainty realizations.
 * CVaR (expected value of the worst tailFrac fraction) replaces a hand-tuned risk λ.
 */
export function robustScore(problem, config, { draws = 200, tailFrac = 0.1, rng } = {}) {
  const r = rng || makeRng(12345);
  const vs = new Array(draws);
  for (let i = 0; i < draws; i += 1) vs[i] = problem.value(config, problem.sampleParams(r));
  vs.sort((a, b) => a - b);
  const k = Math.max(1, Math.floor(draws * tailFrac));
  const cvar = vs.slice(0, k).reduce((a, b) => a + b, 0) / k;
  const mean = vs.reduce((a, b) => a + b, 0) / draws;
  return 0.5 * mean + 0.5 * cvar;
}

// ---------------------------------------------------------------------------
// Cross-entropy optimizer over the mixed discrete+continuous space.
// ---------------------------------------------------------------------------

function sampleCat(probs, rng) {
  let acc = 0; const u = rng();
  for (let i = 0; i < probs.length; i += 1) { acc += probs[i]; if (u <= acc) return i; }
  return probs.length - 1;
}

export function crossEntropyOptimize(problem, opts = {}) {
  const { pop = 140, elite = 18, iters = 30, draws = 160, tailFrac = 0.1, seed = 1 } = opts;
  const rng = makeRng(seed);
  const dKeys = Object.keys(problem.discrete || {});
  const cKeys = Object.keys(problem.continuous || {});
  const dist = {}; for (const k of dKeys) dist[k] = problem.discrete[k].map(() => 1 / problem.discrete[k].length);
  const cmu = {}; const csd = {};
  for (const k of cKeys) { const [lo, hi] = problem.continuous[k]; cmu[k] = (lo + hi) / 2; csd[k] = (hi - lo) / 3; }

  let best = null;
  const history = [];
  for (let it = 0; it < iters; it += 1) {
    const popArr = [];
    for (let p = 0; p < pop; p += 1) {
      const c = {};
      for (const k of dKeys) c[k] = problem.discrete[k][sampleCat(dist[k], rng)];
      for (const k of cKeys) { const [lo, hi] = problem.continuous[k]; c[k] = clamp(cmu[k] + gauss(rng) * csd[k], lo, hi); }
      c.__score = robustScore(problem, c, { draws, tailFrac, rng });
      popArr.push(c);
    }
    popArr.sort((a, b) => b.__score - a.__score);
    if (!best || popArr[0].__score > best.__score) best = { ...popArr[0] };
    const el = popArr.slice(0, elite);
    for (const k of dKeys) {
      const counts = problem.discrete[k].map(() => 0.02);
      el.forEach((e) => { counts[problem.discrete[k].indexOf(e[k])] += 1; });
      const s = counts.reduce((a, b) => a + b, 0);
      dist[k] = counts.map((x) => x / s);
    }
    for (const k of cKeys) {
      const vals = el.map((e) => e[k]);
      cmu[k] = vals.reduce((a, b) => a + b, 0) / vals.length;
      csd[k] = Math.max(0.02, Math.sqrt(vals.reduce((a, b) => a + (b - cmu[k]) ** 2, 0) / vals.length));
    }
    history.push(best.__score);
  }
  // optimizer confidence = final categorical distribution top-mass per dim
  const confidence = {};
  for (const k of dKeys) {
    const top = dist[k].map((p, i) => [problem.discrete[k][i], p]).sort((a, b) => b[1] - a[1])[0];
    confidence[k] = { choice: top[0], mass: +top[1].toFixed(3) };
  }
  return { best, confidence, history };
}

// ---------------------------------------------------------------------------
// Minimax-regret over a candidate set.
// ---------------------------------------------------------------------------

export function minimaxRegret(problem, configs, { draws = 400, seed = 7 } = {}) {
  const rng = makeRng(seed);
  const params = Array.from({ length: draws }, () => problem.sampleParams(rng));
  const maxRegret = configs.map(() => 0);
  for (const p of params) {
    const vals = configs.map((c) => problem.value(c, p));
    const best = Math.max(...vals);
    vals.forEach((v, i) => { maxRegret[i] = Math.max(maxRegret[i], best - v); });
  }
  const ranked = configs.map((c, i) => ({ config: c, maxRegret: +maxRegret[i].toFixed(5) }))
    .sort((a, b) => a.maxRegret - b.maxRegret);
  return { winner: ranked[0], ranked };
}

// ---------------------------------------------------------------------------
// PGD-style worst-case witness: where does `config` lose to NULL?
// Coordinate-descent over the continuous params to MINIMIZE margin = value(config) − nullValue.
// Returns the adversarial param point + margin (≥0 ⇒ config robustly beats NULL everywhere found).
// ---------------------------------------------------------------------------

export function pgdWitness(problem, config, opts = {}) {
  if (typeof problem.nullValue !== 'function') throw new Error('pgdWitness requires problem.nullValue');
  const { restarts = 8, steps = 40, seed = 99 } = opts;
  const rng = makeRng(seed);
  const pKeys = Object.keys(problem.paramSpace || {});
  if (!pKeys.length) throw new Error('pgdWitness requires problem.paramSpace = { param:[lo,hi] } describing the uncertainty axes');
  const margin = (pt) => problem.value(config, pt) - problem.nullValue(config, pt);

  let worst = null;
  for (let r = 0; r < restarts; r += 1) {
    const pt = {};
    for (const k of pKeys) { const [lo, hi] = problem.paramSpace[k]; pt[k] = lo + rng() * (hi - lo); }
    let m = margin(pt);
    for (let s = 0; s < steps; s += 1) {
      for (const k of pKeys) {
        const [lo, hi] = problem.paramSpace[k];
        const span = (hi - lo) * (0.25 / (1 + s * 0.1));
        for (const dir of [-1, 1]) {
          const trial = { ...pt, [k]: clamp(pt[k] + dir * span, lo, hi) };
          const mt = margin(trial);
          if (mt < m) { pt[k] = trial[k]; m = mt; }
        }
      }
    }
    if (!worst || m < worst.margin) worst = { params: { ...pt }, margin: +m.toFixed(5) };
  }
  return { ...worst, robust: worst.margin >= 0 };
}

// ---------------------------------------------------------------------------
// Info-Gap robustness horizon: scale all params' deviation from nominal by α until the
// decision flips (config no longer beats NULL on average). The α at the flip is the horizon.
// ---------------------------------------------------------------------------

export function infoGapHorizon(problem, config, opts = {}) {
  if (typeof problem.nullValue !== 'function') throw new Error('infoGapHorizon requires problem.nullValue');
  const { nominal, draws = 200, seed = 23, maxAlpha = 1, stepAlpha = 0.05 } = opts;
  const pKeys = Object.keys(problem.paramSpace || {});
  if (!nominal || !pKeys.length) throw new Error('infoGapHorizon requires problem.paramSpace + opts.nominal');
  const rng = makeRng(seed);
  const meanMargin = (alpha) => {
    let sum = 0;
    for (let i = 0; i < draws; i += 1) {
      const pt = {};
      for (const k of pKeys) {
        const [lo, hi] = problem.paramSpace[k];
        const dev = (hi - lo) * alpha * (rng() * 2 - 1);
        pt[k] = clamp(nominal[k] + dev, lo, hi);
      }
      sum += problem.value(config, pt) - problem.nullValue(config, pt);
    }
    return sum / draws;
  };
  let horizon = maxAlpha;
  for (let a = 0; a <= maxAlpha + 1e-9; a += stepAlpha) {
    if (meanMargin(a) < 0) { horizon = +a.toFixed(3); return { horizon, flipped: true }; }
  }
  return { horizon: maxAlpha, flipped: false }; // survived the whole horizon
}

// ---------------------------------------------------------------------------
// Multiverse / specification-curve: robustness fraction of a winner across spec variants.
// variants: [{ label, patch(problem)->problem }]. Returns the fraction in which `pickWinner`
// agrees with the baseline winner on the high-leverage dims.
// ---------------------------------------------------------------------------

export function multiverse(problem, variants, pickWinner, { keyDims } = {}) {
  const base = pickWinner(problem);
  const dims = keyDims || Object.keys(problem.discrete || {});
  const sig = (w) => dims.map((d) => `${d}=${w[d]}`).join('|');
  const baseSig = sig(base);
  const rows = variants.map((v) => {
    const w = pickWinner(v.patch({ ...problem }));
    return { label: v.label, agrees: sig(w) === baseSig, winner: dims.reduce((o, d) => ((o[d] = w[d]), o), {}) };
  });
  const agree = rows.filter((r) => r.agrees).length;
  return { baseline: dims.reduce((o, d) => ((o[d] = base[d]), o), {}), robustnessFraction: +(agree / (variants.length || 1)).toFixed(3), rows };
}

export default {
  makeRng, gauss, halton, clamp, robustScore, crossEntropyOptimize,
  minimaxRegret, pgdWitness, infoGapHorizon, multiverse,
};
