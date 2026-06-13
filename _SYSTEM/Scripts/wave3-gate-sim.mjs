#!/usr/bin/env node
/**
 * wave3-gate-sim.mjs — large-eval simulation of the Wave-3 claim-transition gate, focused on the
 * WIRING GAP: gateClaimTransition enforces a PER-CLAIM L∞ floor (maxLadderInversionCap) + identity
 * veto + content-swap, but NOT the cross-anchor AGGREGATE-per-target inversion (the partition
 * signal the extractor measures as maxAggregateInversionPerTarget). This sim quantifies the gap and
 * finds the robust aggregate cap `aggK` to wire alongside the L∞ cap.
 *
 * THREAT MODEL (partition attack): instead of one claim with inversion depth D on target T (caught
 * by the L∞ cap when D > lInfCap), the attacker emits k SUB-RETRACT claims on T, each with shallow
 * inversion s (s ≤ lInfCap so each evades the per-claim floor and is VERIFY_FIRST, not RETRACT).
 * The per-target aggregate is k·s; the gate as-wired sees only max single = s ≤ cap → ACCEPTS.
 * The aggregate gate vetoes when the per-target inversion sum exceeds aggK.
 *
 * Run through the standing decision-sim instrument (CVaR robust optimum + corner-exact worst case,
 * the R2-E lesson: the margin is multilinear over the uncertainty box, so enumerate corners — a
 * random interior sweep hits the worst case with probability ~0).
 *
 * Run: node _SYSTEM/Scripts/wave3-gate-sim.mjs
 */
import { crossEntropyOptimize, robustScore, makeRng, clamp } from './decision-sim.mjs';

// --- gate model -------------------------------------------------------------
// A write contributes claims to per-target inversion buckets. The gate (with caps lInfCap, aggK)
// vetoes a write iff (max single-claim inversion > lInfCap) OR (max per-target sum > aggK).
function gateVetoes(perTargetDepths, lInfCap, aggK) {
  for (const depths of perTargetDepths) {
    if (depths.some((d) => d > lInfCap)) return true;        // per-claim L∞ floor
    if (depths.reduce((a, b) => a + b, 0) > aggK) return true; // cross-anchor aggregate floor (the wiring)
  }
  return false;
}

// An ATTACK write: split a fabrication of total depth D across k anchors on ONE target, each shallow
// s = max(1, round(D/k)) but capped at lInfCap-equivalent shallowness (attacker keeps singles ≤ cap).
function attackWrite(D, k, lInfCap) {
  const s = Math.min(lInfCap, Math.max(1, Math.round(D / k)));
  return [Array.from({ length: k }, () => s)]; // one target, k shallow claims
}
// An HONEST write: a few targets, each with a small benign borderline inversion count (mostly 0-1,
// occasionally a cluster). honestAgg = the heaviest honest per-target aggregate this write produces.
function honestWrite(nTargets, honestAgg) {
  const depths = Array.from({ length: Math.max(1, honestAgg) }, () => 1); // honestAgg borderline 1-rung claims on one target
  const others = Array.from({ length: nTargets }, () => [1]);
  return [depths, ...others];
}

const PROBLEM = {
  name: 'wave3-aggregate-gate',
  discrete: {},
  continuous: { lInfCap: [1, 4], aggK: [2, 10] },
  // uncertainty: attacker shape (D total depth, k split) + honest-traffic shape.
  paramSpace: { D: [3, 12], k: [2, 8], honestAgg: [0, 6], attackRate: [0.02, 0.3], falseVetoWeight: [0.5, 4] },
  sampleParams: (rng) => ({
    D: 3 + Math.floor(rng() * 10),          // fabrication total depth 3..12
    k: 2 + Math.floor(rng() * 7),           // split into 2..8 anchors
    honestAgg: Math.floor(rng() * 7),       // honest heaviest per-target aggregate 0..6
    attackRate: clamp(0.02 + 0.28 * rng()), // fraction of writes that are attacks
    falseVetoWeight: 0.5 + 3.5 * rng(),     // how costly a false-veto of honest work is
  }),
  // value = catch attacks − falseVetoWeight·(false-veto honest) ; both as probabilities under the draw.
  value: (c, p) => {
    const lInfCap = c.lInfCap, aggK = c.aggK;
    const attackCaught = gateVetoes(attackWrite(p.D, p.k, lInfCap), lInfCap, aggK) ? 1 : 0;
    const honestVetoed = gateVetoes(honestWrite(3, p.honestAgg), lInfCap, aggK) ? 1 : 0;
    return p.attackRate * attackCaught - p.falseVetoWeight * (1 - p.attackRate) * honestVetoed;
  },
  // NULL = no aggregate gate (aggK = ∞): only the L∞ per-claim cap. Quantifies the GAP.
  nullValue: (c, p) => {
    const lInfCap = c.lInfCap;
    const attackCaught = gateVetoes(attackWrite(p.D, p.k, lInfCap), lInfCap, Infinity) ? 1 : 0;
    const honestVetoed = gateVetoes(honestWrite(3, p.honestAgg), lInfCap, Infinity) ? 1 : 0;
    return p.attackRate * attackCaught - p.falseVetoWeight * (1 - p.attackRate) * honestVetoed;
  },
};

function main() {
  console.log('=== WAVE-3 AGGREGATE-GATE SIM (partition attack vs the aggregate cap) ===\n');

  // 1) Quantify the GAP: how often does the partition attack evade the L∞-only gate (NULL)?
  const r = makeRng(7); let evaded = 0; let total = 0; const N = 2_000_000;
  for (let i = 0; i < N; i += 1) {
    const p = PROBLEM.sampleParams(r);
    if (p.D <= (1 + Math.floor(4)) ) { /* keep all */ }
    // is it a "real" partition (k≥2, each shallow under a mid cap of 1)? count evasion under L∞-only.
    const lInfCap = 1; // the LOCKED cap
    const caughtByLinf = gateVetoes(attackWrite(p.D, p.k, lInfCap), lInfCap, Infinity);
    total += 1; if (!caughtByLinf) evaded += 1;
  }
  console.log(`GAP: with the L∞ cap=1 only (no aggregate gate), ${(evaded / total * 100).toFixed(1)}% of partition attacks EVADE the gate (${N.toLocaleString()} evals).`);

  // 2) Robust optimum aggK via cross-entropy (CVaR-scored) over the full uncertainty space.
  const { best, confidence } = crossEntropyOptimize(PROBLEM, { iters: 40, pop: 200, draws: 400, seed: 1 });
  console.log(`\nROBUST OPTIMUM (CVaR): lInfCap=${best.lInfCap.toFixed(2)}  aggK=${best.aggK.toFixed(2)}  (conf: ${JSON.stringify(confidence)})`);

  // 3) aggK sweep: catch-rate vs false-veto-rate at the LOCKED lInfCap=1, large evals per point.
  console.log('\naggK sweep @ lInfCap=1 (catch = partition attacks vetoed; falseVeto = honest writes vetoed):');
  const rr = makeRng(11); const M = 500_000;
  for (let aggK = 2; aggK <= 8; aggK += 1) {
    let caught = 0; let atk = 0; let fv = 0; let hon = 0;
    for (let i = 0; i < M; i += 1) {
      const p = PROBLEM.sampleParams(rr);
      const a = gateVetoes(attackWrite(p.D, p.k, 1), 1, aggK);
      const h = gateVetoes(honestWrite(3, p.honestAgg), 1, aggK);
      atk += 1; caught += a ? 1 : 0; hon += 1; fv += h ? 1 : 0;
    }
    console.log(`  aggK=${aggK}: catch=${(caught / atk * 100).toFixed(1)}%  falseVeto=${(fv / hon * 100).toFixed(1)}%`);
  }

  // 4) corner-exact worst case (R2-E lesson): enumerate the uncertainty-box corners, don't sample interior.
  const corners = [];
  for (const D of [3, 12]) for (const k of [2, 8]) for (const honestAgg of [0, 6]) for (const attackRate of [0.02, 0.3]) for (const falseVetoWeight of [0.5, 4]) corners.push({ D, k, honestAgg, attackRate, falseVetoWeight });
  const cfg = { lInfCap: 1, aggK: Math.round(best.aggK) };
  let worst = Infinity; let worstAt = null;
  for (const p of corners) { const m = PROBLEM.value(cfg, p) - PROBLEM.nullValue(cfg, p); if (m < worst) { worst = m; worstAt = p; } }
  console.log(`\nCORNER-EXACT worst margin (aggregate gate vs L∞-only) at aggK=${cfg.aggK}: ${worst.toFixed(4)} at ${JSON.stringify(worstAt)}`);
  console.log(`  ${worst >= 0 ? 'aggregate gate never does WORSE than L∞-only across the corner box' : 'WARNING: a corner exists where the aggregate gate is net-negative (false-veto dominates) — see params'}`);
}

if (import.meta.url === `file://${process.argv[1]}`) main();
export { PROBLEM, gateVetoes, attackWrite, honestWrite };
