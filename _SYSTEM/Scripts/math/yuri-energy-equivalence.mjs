#!/usr/bin/env node
// ===========================================================================
// CLAUDE CONTROL PACKET
//   goal:        Cross-era equivalence checker (Candidate C). Verify the v2→v3
//                energy-formula migration CO-RANKS states (didn't scramble or
//                invert verdicts) and QUANTIFY its intended divergence. Chip LEC
//                / differential random testing → YURI gate.
//   target:      NEW file only. Reads computeU + invariants genState; mutates
//                NO gate behavior.
//   constraints: dependency-free; seeded PRNG (reproducible); observe-mode;
//                fully reversible by deletion.
//   acceptance:  (GREEN) on DRIFT-ISOLATED states v2 & v3 co-rank (Spearman
//                ρ ≥ CORANK_MIN) AND zero drift ⇒ U bit-identical; (RED) a
//                planted sign-flipped era is CAUGHT (ρ ≤ ANTI_MAX vs both).
//   test cmd:    node --test _SYSTEM/Scripts/math/yuri-energy-equivalence.test.mjs
//   rollback:    rm this file + its .test.mjs.
// ===========================================================================
//
// @capability: energy-era-equivalence
// @serves: cross-era equivalence checker | differential random testing energy eras | prove era migration co-ranks verdicts | quantify intended drift divergence | silicon LEC for the energy gate
// @does: over a DRIFT-ISOLATING generator scores states with v2 (KL drift) and v3 (W₁+μ), GATES on co-ranking (Spearman ρ ≥ CORANK_MIN) + zero-drift exactness, CATCHES a sign-flipped era (ρ ≤ ANTI_MAX), and REPORTS top/bottom drift-tail agreement as the intended-divergence profile (W₁ distance-awareness vs KL saturation)
// @use: after any drift-term change or era bump, run this to prove the new era still co-ranks states with the old (didn't invert/scramble verdicts) and to quantify how much it intentionally reorders the high-drift tail
// @exports: v2Scorer, v3Scorer, equivalenceCheck, brokenEraCheck, zeroDriftIdentical, BROKEN_SCORER, genDriftState, spearmanRho, CORANK_MIN, ANTI_MAX
//
// PROVENANCE: DeepSeek peer-built the LEC/DRT scaffold (v2/v3 scorers, Spearman,
// sign-flip negative control). Claude-verify caught that its property was
// BARRIER-CONFOUNDED — the default generator's eta=100 barrier swamps β·W₁≤~10,
// so full-U rank correlation passed trivially AND the sign-flip control went
// uncaught. This refinement: (1) a DRIFT-ISOLATING generator (only claimed/verified
// → U is pure drift); (2) the honest property — v2(KL) and v3(W₁) are INTENTIONALLY
// non-equivalent (W₁ reorders where KL saturates), so we GATE on CO-RANKING (real
// eras correlate, broken eras anti-correlate — a discrimination test) + zero-drift
// exactness, and REPORT the tail divergence rather than demand blanket equality.

import { computeU, DEFAULT_WEIGHTS } from './yuri-energy.mjs';
import { makeRng, genState } from './yuri-energy-invariants.mjs';
import { klDivergence } from './math-kernel.mjs';

// --- inline evalKL: the v2 drift evaluator (not exported by yuri-energy) -----
const KL_EPSILON = 1e-12;
const clampDistribution = (arr) => arr.map((v) => {
  const n = Number(v);
  return Number.isFinite(n) && n > KL_EPSILON ? n : KL_EPSILON;
});
function distributionPoisoned(arr) {
  let mass = false;
  for (const v of arr) {
    const n = Number(v);
    if (!Number.isFinite(n) || n < 0) return true;
    if (n > KL_EPSILON) mass = true;
  }
  return !mass;
}
function evalKL({ claimed, verified }) {
  if (!claimed || !verified) return { skipped: true };
  if (!Array.isArray(claimed) || !Array.isArray(verified)) return { skipped: true };
  if (claimed.length !== verified.length) return { value: Math.log(1 / KL_EPSILON), skipped: false };
  if (distributionPoisoned(claimed) || distributionPoisoned(verified)) return { value: Math.log(1 / KL_EPSILON), skipped: false };
  try { return { value: klDivergence(clampDistribution(claimed), clampDistribution(verified)), skipped: false }; }
  catch { return { skipped: true }; }
}

// --- generators -------------------------------------------------------------
const randInt = (rng, lo, hi) => lo + Math.floor(rng() * (hi - lo + 1));
const randDist = (rng, n) => Array.from({ length: n }, () => rng());

// DRIFT-ISOLATING generator: ONLY claimed/verified set → every other component
// skips and the 3 always-emitted terms are 0, so U reduces to PURE drift
// (v3 = β·W₁+μ·conc·W₁, v2 = β·KL). This is what makes the comparison about the
// drift formulas rather than barrier-dominated full U.
export function genDriftState(rng) {
  const n = randInt(rng, 2, 6);
  return { claimedDistribution: randDist(rng, n), verifiedDistribution: randDist(rng, n) };
}

// --- era scorers ------------------------------------------------------------
export function v2Scorer(state, weights = DEFAULT_WEIGHTS) {
  const r = computeU(state, weights).result;
  const c = { ...r.contributions };
  let U = r.U - (c.wasserstein ?? 0) - (c.overconfidenceDrift ?? 0);
  delete c.wasserstein; delete c.overconfidenceDrift;
  const kl = evalKL({ claimed: state.claimedDistribution, verified: state.verifiedDistribution });
  if (!kl.skipped) { const k = weights.beta * kl.value; U += k; c.klDivergence = k; }
  return { U, contributions: c, era: 'v2' };
}
export function v3Scorer(state, weights = DEFAULT_WEIGHTS) {
  const r = computeU(state, weights).result;
  return { U: r.U, contributions: r.contributions, era: 'v3' };
}

// --- Spearman rank correlation (avg-rank ties) ------------------------------
export function spearmanRho(xs, ys) {
  const n = xs.length;
  if (n < 2) return 1;
  const rank = (arr) => {
    const idx = arr.map((v, i) => ({ v, i }));
    idx.sort((a, b) => a.v - b.v);
    const r = new Array(n);
    for (let i = 0; i < n;) {
      let j = i;
      while (j < n && idx[j].v === idx[i].v) j++;
      const avg = (i + j - 1) / 2 + 1;
      for (let k = i; k < j; k++) r[idx[k].i] = avg;
      i = j;
    }
    return r;
  };
  const rx = rank(xs); const ry = rank(ys);
  const mx = rx.reduce((s, v) => s + v, 0) / n;
  const my = ry.reduce((s, v) => s + v, 0) / n;
  let num = 0, dx = 0, dy = 0;
  for (let i = 0; i < n; i++) { const a = rx[i] - mx, b = ry[i] - my; num += a * b; dx += a * a; dy += b * b; }
  return dx === 0 || dy === 0 ? 1 : num / Math.sqrt(dx * dy);
}

// Principled thresholds (discrimination, not fitted-to-pass):
//   CORANK_MIN  — real eras must POSITIVELY co-rank well above noise. A scrambled
//                 era sits at ~0 and a sign-flipped era at ~−1, so 0.5 cleanly
//                 separates "genuinely co-ranking" from "broken/random".
//   ANTI_MAX    — a broken era must be clearly ANTI-correlated (≤ −0.5). The v2
//                 arm is bounded by the real KL↔W₁ correlation (~0.815), so the
//                 sign-flip reaches ~−0.8 there and −1.0 vs v3 — both well past −0.5.
export const CORANK_MIN = 0.5;
export const ANTI_MAX = -0.5;

// equivalenceCheck — GATE on co-ranking; REPORT the tail divergence profile.
export function equivalenceCheck(scorerA, scorerB, { trials = 5000, seed = 0x2eec, generator = genDriftState, weights = DEFAULT_WEIGHTS } = {}) {
  const rng = makeRng(seed);
  const A = new Array(trials), B = new Array(trials);
  for (let i = 0; i < trials; i++) { const s = generator(rng); A[i] = scorerA(s, weights).U; B[i] = scorerB(s, weights).U; }
  const rho = spearmanRho(A, B);

  // Tail divergence PROFILE (reported, not gated): how much do the top/bottom
  // drift quartiles keep their membership across eras?
  const idx = A.map((u, i) => ({ a: u, b: B[i], i }));
  const byA = [...idx].sort((x, y) => x.a - y.a);
  const byB = [...idx].sort((x, y) => x.b - y.b);
  const q = Math.max(1, Math.floor(trials / 4));
  const bTop = new Set(byB.slice(trials - q).map((e) => e.i));
  const bBot = new Set(byB.slice(0, q).map((e) => e.i));
  const topAgree = byA.slice(trials - q).filter((e) => bTop.has(e.i)).length / q;
  const bottomAgree = byA.slice(0, q).filter((e) => bBot.has(e.i)).length / q;

  return { rho, coRanks: rho >= CORANK_MIN, tailAgreement: { top: topAgree, bottom: bottomAgree }, trials, seed, generator: generator.name };
}

// Zero-drift exactness: identical distributions ⇒ KL=0, W₁=0, μ·conc·0=0 ⇒ the
// two eras produce a bit-identical U. The one thing that MUST be exact.
export function zeroDriftIdentical(seed = 7) {
  const rng = makeRng(seed);
  const dist = randDist(rng, 5);
  const state = { claimedDistribution: dist, verifiedDistribution: dist.slice() };
  const v2 = v2Scorer(state).U; const v3 = v3Scorer(state).U;
  return { identical: v2 === v3, v2, v3 };
}

// --- negative control: sign-flipped drift -----------------------------------
export const BROKEN_SCORER = {
  name: 'sign-flipped-drift',
  score(state, weights = DEFAULT_WEIGHTS) {
    const r = computeU(state, weights).result;
    const c = { ...r.contributions };
    const drift = (c.wasserstein ?? 0) + (c.overconfidenceDrift ?? 0);
    c.wasserstein = -(c.wasserstein ?? 0); c.overconfidenceDrift = -(c.overconfidenceDrift ?? 0);
    return { U: r.U - 2 * drift, contributions: c, era: 'broken' };
  },
};

// brokenEraCheck — on DRIFT-ISOLATED states a sign-flipped era must be clearly
// anti-correlated with BOTH real eras (drift drives U). caught = both ≤ ANTI_MAX.
export function brokenEraCheck({ trials = 3000, seed = 0x2eec, generator = genDriftState } = {}) {
  const broken = BROKEN_SCORER.score.bind(BROKEN_SCORER);
  const run = (other, sd) => {
    const rng = makeRng(sd); const X = [], Y = [];
    for (let i = 0; i < trials; i++) { const s = generator(rng); X.push(broken(s).U); Y.push(other(s).U); }
    return spearmanRho(X, Y);
  };
  const rho_v2 = run(v2Scorer, seed);
  const rho_v3 = run(v3Scorer, seed + 1);
  return { caught: rho_v2 <= ANTI_MAX && rho_v3 <= ANTI_MAX, rho_v2, rho_v3 };
}

// --- CLI --------------------------------------------------------------------
if (import.meta.url === `file://${process.argv[1]}`) {
  const trials = Number(process.argv[2]) || 6000;
  const prim = equivalenceCheck(v2Scorer, v3Scorer, { trials, generator: genDriftState });
  const full = equivalenceCheck(v2Scorer, v3Scorer, { trials, generator: genState });
  const zero = zeroDriftIdentical();
  const red = brokenEraCheck({ trials: Math.min(trials, 3000) });
  console.log('=== CROSS-ERA EQUIVALENCE (v2 KL ↔ v3 W₁+μ) ===');
  console.log('\nPRIMARY — drift-isolated (the real test):');
  console.log(`  co-ranking Spearman ρ = ${prim.rho.toFixed(4)}  (gate ≥ ${CORANK_MIN})  CO-RANKS=${prim.coRanks}`);
  console.log(`  intended-divergence profile (REPORTED): top-tail ${(prim.tailAgreement.top * 100).toFixed(1)}% · bottom-tail ${(prim.tailAgreement.bottom * 100).toFixed(1)}%  ← top<100% is the W₁-vs-KL reordering, by design`);
  console.log(`  zero-drift exactness: v2=${zero.v2} v3=${zero.v3}  IDENTICAL=${zero.identical}`);
  console.log('\nSECONDARY — full state (lenient, barrier-dominated; shows WHY isolation is needed):');
  console.log(`  ρ=${full.rho.toFixed(4)} top=${(full.tailAgreement.top * 100).toFixed(1)}% bottom=${(full.tailAgreement.bottom * 100).toFixed(1)}%`);
  console.log('\nNEGATIVE CONTROL — sign-flipped drift (must be caught):');
  console.log(`  ρ vs v2=${red.rho_v2.toFixed(4)}  ρ vs v3=${red.rho_v3.toFixed(4)}  (gate ≤ ${ANTI_MAX})  CAUGHT=${red.caught}`);
  const ok = prim.coRanks && zero.identical && red.caught;
  console.log(`\n${ok ? 'OK' : 'FAILURE'}: co-rank=${prim.coRanks}, zero-drift-exact=${zero.identical}, neg-control-caught=${red.caught}`);
  process.exit(ok ? 0 : 1);
}
