#!/usr/bin/env node
/**
 * yuri-phi.mjs — NEXUS CORE: π / golden-ratio (φ) / Fibonacci applied primitives (pure, deterministic,
 * embedding-free). Owner directive (Marcel 2026-06-06): these are not a research curiosity — they are
 * first-class NEXUS CORE math functions. The breakthrough is NOT "φ is magic"; it is that φ/Fibonacci
 * are the efficient way to spend COMPARISONS, INTERVALS, or TIME-PHASES when the structure is already
 * one-dimensional, ordered, or resonance-prone (E1 deep-dive, 2026-06-06).
 *
 * WHAT'S HERE (the READY tier — each maps to a real YURI organ; numerology killed):
 *  1. goldenSectionSearch — derivative-free 1-D minimization of a unimodal objective by φ-ratio bracket
 *     reduction (one new eval per step). → tune scalar knobs (energy weights, thresholds β/η/θ,
 *     saturation thresholds) WITHOUT gradients or a labeler once an objective is frozen. (Kiefer 1953.)
 *  2. fibonacciSearchMin — discrete unimodal minimization over an ordered finite index range, sublinear
 *     evals. → locate a threshold band over an expensive-to-evaluate discrete candidate set.
 *  3. phiPoint / phiSequence — additive-recurrence low-discrepancy sequence x_n = frac(x0 + n/φ). φ is
 *     the "most irrational" → maximally de-correlated, anti-resonant SEQUENCING with NO RNG. → polling/
 *     backoff jitter, sampling cadence, candidate rotation that must not phase-lock. (Three-distance
 *     theorem: at most 3 distinct gap sizes — the signature of an optimally-even 1-D spread.)
 *  4. goldenAngle / goldenAnglePoints — the phyllotaxis spiral θ = i·(π(3−√5)). Fuses π AND φ for an
 *     even, non-clustering 2-D point/angle distribution. → even node/hue placement in the circuitry-die
 *     viz (cross-links the circuitry self-model) and any "spread N things evenly on a disk/circle" need.
 *  5. fib / fibBig — the Fibonacci generator (Number-exact ≤ F(78); BigInt for unbounded, e.g. the OSS
 *     authorship-watermark generator — see D1).
 *
 * PARKED (do NOT build until a target organ pulls them, per the discipline): π/FFT spectral probe
 * (needs stable sanitized traces), Knuth/Fibonacci multiplicative hashing (no measured bucket-skew),
 * Fibonacci heap (no profiled graph hot-path). See math-primitive-candidates-parking.md.
 *
 * Pure + injectable: no I/O, no clock, no RNG. Mirrors yuri-jaccard / yuri-fsrs house style.
 */

export const PHI = (1 + Math.sqrt(5)) / 2;          // golden ratio ≈ 1.6180339887
export const INV_PHI = (Math.sqrt(5) - 1) / 2;      // 1/φ = φ−1 ≈ 0.6180339887
export const INV_PHI_SQ = (3 - Math.sqrt(5)) / 2;   // 1/φ² = 1−1/φ ≈ 0.3819660113
export const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5)); // ≈ 2.39996323 rad ≈ 137.50776° — fuses π and φ

// ── 5. Fibonacci generator ───────────────────────────────────────────────────────────────────
const FIB_NUMBER_MAX_N = 78; // F(79) > 2^53 → Number loses exactness; beyond this use fibBig().
/** F(n): F(0)=0, F(1)=1, F(n)=F(n-1)+F(n-2). Number-exact for n ≤ 78. */
export function fib(n) {
  if (!Number.isInteger(n) || n < 0) throw new Error(`fib: n must be a non-negative integer, got ${n}`);
  if (n > FIB_NUMBER_MAX_N) throw new Error(`fib: n>${FIB_NUMBER_MAX_N} loses Number precision — use fibBig(n)`);
  let a = 0, b = 1;
  for (let i = 0; i < n; i++) { const t = a + b; a = b; b = t; }
  return a;
}
/** F(n) as a BigInt — unbounded precision (deterministic seed source for the watermark generator). */
export function fibBig(n) {
  if (!Number.isInteger(n) || n < 0) throw new Error(`fibBig: n must be a non-negative integer, got ${n}`);
  let a = 0n, b = 1n;
  for (let i = 0; i < n; i++) { const t = a + b; a = b; b = t; }
  return a;
}
/** [F(0)..F(count-1)]. */
export function fibSequence(count) {
  if (!Number.isInteger(count) || count < 0) throw new Error(`fibSequence: count must be a non-negative integer, got ${count}`);
  const out = [];
  let a = 0, b = 1;
  for (let i = 0; i < count; i++) { out.push(a); const t = a + b; a = b; b = t; }
  return out;
}

// ── 1. Golden-section search (continuous unimodal minimization) ────────────────────────────────
/**
 * Minimize a UNIMODAL f on [a,b] by φ-ratio interval reduction. Deterministic, derivative-free, one
 * new evaluation per iteration. Returns the bracket midpoint estimate of the minimizer.
 * @param {(x:number)=>number} f  unimodal objective (one interior minimum on [a,b])
 * @param {number} a  lower bound
 * @param {number} b  upper bound (b > a)
 * @param {{tol?:number, maxIter?:number}} [opts]
 * @returns {{x:number, fx:number, iters:number, evals:number, bracket:[number,number]}}
 */
export function goldenSectionSearch(f, a, b, { tol = 1e-10, maxIter = 500 } = {}) {
  if (typeof f !== 'function') throw new Error('goldenSectionSearch: f must be a function');
  if (!(b > a)) throw new Error(`goldenSectionSearch: require b > a, got [${a}, ${b}]`);
  let lo = a, hi = b, evals = 0;
  const F = (x) => { evals++; return f(x); };
  let h = hi - lo;
  let c = lo + INV_PHI_SQ * h;
  let d = lo + INV_PHI * h;
  let fc = F(c), fd = F(d);
  let iters = 0;
  while (h > tol && iters < maxIter) {
    if (fc < fd) {                          // minimum in [lo, d]
      hi = d; d = c; fd = fc;
      h = hi - lo; c = lo + INV_PHI_SQ * h; fc = F(c);
    } else {                                // minimum in [c, hi]
      lo = c; c = d; fc = fd;
      h = hi - lo; d = lo + INV_PHI * h; fd = F(d);
    }
    iters++;
  }
  const x = fc < fd ? (lo + d) / 2 : (c + hi) / 2;
  return { x, fx: f(x), iters, evals, bracket: [lo, hi] };
}

// ── 2. Fibonacci search (discrete unimodal minimization over [0, n-1]) ─────────────────────────
/**
 * Minimize a UNIMODAL discrete objective f(i) over integer indices i ∈ [0, n-1] using φ-ratio bracket
 * reduction (the golden/Fibonacci interval-search family, Kiefer 1953) plus a final exact scan of the
 * ≤3-wide residual bracket — so the returned index is the EXACT argmin, in sublinear evaluations.
 * @param {(i:number)=>number} f  unimodal objective over [0, n-1]
 * @param {number} n  domain size (n ≥ 1)
 * @returns {{index:number, value:number, evals:number}}
 */
export function fibonacciSearchMin(f, n) {
  if (typeof f !== 'function') throw new Error('fibonacciSearchMin: f must be a function');
  if (!Number.isInteger(n) || n < 1) throw new Error(`fibonacciSearchMin: n must be a positive integer, got ${n}`);
  const memo = new Map();
  let evals = 0;
  const F = (i) => { if (memo.has(i)) return memo.get(i); evals++; const v = f(i); memo.set(i, v); return v; };
  let lo = 0, hi = n - 1;
  while (hi - lo > 2) {
    const span = hi - lo;
    let m1 = Math.round(hi - INV_PHI * span);   // ≈ lo + INV_PHI_SQ·span
    let m2 = Math.round(lo + INV_PHI * span);
    if (m1 <= lo) m1 = lo + 1;
    if (m2 >= hi) m2 = hi - 1;
    if (m1 >= m2) { m1 = lo + 1; m2 = hi - 1; } // guarantee two distinct interior probes
    if (F(m1) < F(m2)) hi = m2; else lo = m1;   // unimodal: drop the side that cannot contain the min
  }
  let best = lo, bv = F(lo);
  for (let i = lo + 1; i <= hi; i++) { const v = F(i); if (v < bv) { bv = v; best = i; } }
  return { index: best, value: bv, evals };
}

// ── 3. φ low-discrepancy sequence (anti-resonant cadence) ──────────────────────────────────────
/** nth term of the additive recurrence frac(x0 + n/φ) ∈ [0,1). Deterministic, no RNG. */
export function phiPoint(n, x0 = 0) {
  if (!Number.isInteger(n) || n < 0) throw new Error(`phiPoint: n must be a non-negative integer, got ${n}`);
  const v = (x0 + n * INV_PHI) % 1;
  return v < 0 ? v + 1 : v;
}
/** [phiPoint(0)..phiPoint(count-1)] — an optimally-even low-discrepancy 1-D spread. */
export function phiSequence(count, x0 = 0) {
  if (!Number.isInteger(count) || count < 0) throw new Error(`phiSequence: count must be a non-negative integer, got ${count}`);
  const out = new Array(count);
  for (let i = 0; i < count; i++) out[i] = phiPoint(i, x0);
  return out;
}

// ── 4. Golden-angle phyllotaxis (even 2-D / angular distribution — π × φ) ───────────────────────
/** nth golden-angle ∈ [0, 2π): θ_n = (n · GOLDEN_ANGLE) mod 2π. Even angular spread, no clustering. */
export function goldenAnglePoint(n) {
  if (!Number.isInteger(n) || n < 0) throw new Error(`goldenAnglePoint: n must be a non-negative integer, got ${n}`);
  const TAU = 2 * Math.PI;
  const v = (n * GOLDEN_ANGLE) % TAU;
  return v < 0 ? v + TAU : v;
}
/**
 * n points on a disk via the sunflower/phyllotaxis spiral: r_i = radius·√((i+0.5)/n), θ_i = i·goldenAngle.
 * Maximally even areal coverage with no radial spokes — ideal for laying out N nodes/hues without clusters.
 * @returns {Array<{x:number, y:number, r:number, theta:number}>}
 */
export function goldenAnglePoints(n, { radius = 1 } = {}) {
  if (!Number.isInteger(n) || n < 0) throw new Error(`goldenAnglePoints: n must be a non-negative integer, got ${n}`);
  const out = new Array(n);
  for (let i = 0; i < n; i++) {
    const r = radius * Math.sqrt((i + 0.5) / n);
    const theta = i * GOLDEN_ANGLE;
    out[i] = { x: r * Math.cos(theta), y: r * Math.sin(theta), r, theta };
  }
  return out;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const quad = goldenSectionSearch((x) => (x - 2) ** 2, 0, 5);
  const arr = [9, 7, 5, 3, 1, 2, 4, 6, 8]; // unimodal, min at index 4
  const fibMin = fibonacciSearchMin((i) => arr[i], arr.length);
  const seq = phiSequence(8);
  console.log(JSON.stringify({
    PHI: PHI.toFixed(8), INV_PHI: INV_PHI.toFixed(8), GOLDEN_ANGLE_deg: (GOLDEN_ANGLE * 180 / Math.PI).toFixed(4),
    goldenSection_min_of_quadratic: { x: quad.x.toFixed(6), evals: quad.evals },
    fibonacciSearchMin: { index: fibMin.index, value: fibMin.value, evals: fibMin.evals, n: arr.length },
    fib_0_to_10: fibSequence(11),
    phiSequence_8: seq.map((v) => v.toFixed(4)),
  }, null, 2));
}
