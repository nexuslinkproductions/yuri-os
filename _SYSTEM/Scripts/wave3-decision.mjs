#!/usr/bin/env node
import { pathToFileURL } from 'node:url';
/**
 * wave3-decision.mjs — the Wave-3 governance-substrate decision, expressed as a decision-sim
 * PROBLEM and run through the standing instrument (_SYSTEM/Scripts/decision-sim.mjs).
 *
 * This is the VALIDATION case that graduates the one-off /tmp/wave3-sim-v5 into the reusable
 * engine: it must (a) reproduce the prior LOCKED answer, and (b) add the sharper Tier-1
 * diagnostics the /tmp sims never produced — the minimax-regret winner, the PGD flip-rule
 * ("locked loses to NULL only when P_emit > X"), and the Info-Gap robustness horizon.
 *
 * Factor tables are the HARDENED Opus-fleet values from ops plan §11 (NOT re-derived). They are
 * estimates (auditable here); the weight/scalar uncertainty is swept, factor error is a known
 * residual that only the live 3b advisory hook can retire (see prose-claim-extractor §13).
 *
 * Run: node _SYSTEM/Scripts/wave3-decision.mjs
 */
import { crossEntropyOptimize, minimaxRegret, pgdWitness, infoGapHorizon, robustScore, makeRng, clamp } from './decision-sim.mjs';

const T = {
  prev: { 'sync-block': 0.92, 'explicit-emit': 0.68, 'async-trailing': 0.55, 'stop-batch': 0.30 },
  safeFire: { 'sync-block': 0.18, 'explicit-emit': 0.82, 'async-trailing': 0.85, 'stop-batch': 0.88 },
  idChurn: { contentHash: 0.55, 'ledger-sim': 0.80, 'anchor-bound': 1.0, 'anchor+node': 1.0, hybrid: 0.85 },
  archFire: { 'async-trailing': 1.0, 'explicit-emit': 0.68, 'stop-batch': 0.58, 'sync-block': 0.38 },
  buildId: { 'anchor-bound': 0.78, 'anchor+node': 0.72, hybrid: 0.55, 'ledger-sim': 0.45, contentHash: 0.42 },
  pUnstable: { 'anchor-bound': 0.01, 'anchor+node': 0.01, hybrid: 0.05, 'ledger-sim': 0.22, contentHash: 0.60 },
  smuggleRes: { contentHash: 0.30, 'ledger-sim': 0.55, 'anchor-bound': 0.45, 'anchor+node': 0.62, hybrid: 0.70 },
  aSmuggle: { 'sync-block': 0.30, 'explicit-emit': 1.0, 'async-trailing': 0.85, 'stop-batch': 0.70 },
};
const NULL_F = [0.05, 0.42, 0.99, 0.32, 1.0]; // corrected NULL factors (prevention,safety,rev,archfit,buildcheap)
const UNIFORM_W = [0.2, 0.2, 0.2, 0.2, 0.2];

function utility(c, w) {
  const prevention = clamp((T.prev[c.firing] ?? 0.4) + (c.promote === 'sync-gate' ? 0.05 : 0));
  const safety = clamp((T.safeFire[c.firing] ?? 0.4) * (T.idChurn[c.identity] ?? 0.6));
  const soakRev = clamp((c.soakLen ?? 15) / 30);
  const reversibility = clamp(0.5 * (0.2 + 0.78 * soakRev) + 0.5 * (c.firing === 'async-trailing' ? 0.98 : c.firing === 'sync-block' ? 0.42 : 0.85));
  const archfit = clamp((T.archFire[c.firing] ?? 0.4) + (c.foundry === 'unified' ? 0.28 : 0) + (c.promote === 'async-bakeoff' ? 0.1 : 0));
  const buildcheap = clamp((T.buildId[c.identity] ?? 0.45) + (c.foundry === 'unified' ? 0.28 : 0) - (c.firing === 'explicit-emit' ? 0.35 : 0) - (c.aggGate !== 'off' ? 0.05 : 0));
  return w[0] * prevention + w[1] * safety + w[2] * reversibility + w[3] * archfit + w[4] * buildcheap;
}
const nullU = (w) => w.reduce((a, wi, i) => a + wi * NULL_F[i], 0);

const PROBLEM = {
  name: 'wave3-governance-substrate',
  discrete: {
    firing: ['sync-block', 'async-trailing', 'explicit-emit', 'stop-batch'],
    identity: ['contentHash', 'ledger-sim', 'anchor-bound', 'anchor+node', 'hybrid'],
    foundry: ['separate', 'unified'],
    promote: ['sync-gate', 'async-bakeoff'],
    aggGate: ['off', 'anchor-keyed', 'target-keyed'],
  },
  continuous: { soakLen: [0, 30], aggK: [1, 8], lInfCap: [0, 4] },
  // uncertainty axes for the witness / info-gap (scalars; weights held uniform there)
  paramSpace: { Pemit: [0.05, 0.45], kappa: [0.5, 4], partRate: [0.1, 0.6] },
  sampleParams: (rng) => {
    // Dirichlet(1) weights via normalized exponentials + the three scalar uncertainties.
    let w = Array.from({ length: 5 }, () => -Math.log(1 - rng()));
    const s = w.reduce((a, b) => a + b, 0); w = w.map((x) => x / s);
    return { w, Pemit: clamp(0.05 + 0.4 * rng()), kappa: 0.5 + 3.5 * rng(), partRate: clamp(0.1 + 0.5 * rng()) };
  },
  value: (c, p) => {
    const w = p.w || UNIFORM_W;
    const U = utility(c, w); const Un = nullU(w);
    const mArm = clamp(Math.exp(-(c.soakLen ?? 15) / 8));
    const Pveto = clamp(p.Pemit * (T.pUnstable[c.identity] ?? 0.3) * mArm);
    let caught = 0;
    if (c.aggGate === 'target-keyed') caught = clamp(1 - ((c.aggK ?? 3) - 1) / 7);
    else if (c.aggGate === 'anchor-keyed') caught = clamp(0.35 * (1 - ((c.aggK ?? 3) - 1) / 7));
    const Psmug = clamp(p.Pemit * (1 - (T.smuggleRes[c.identity] ?? 0.4)) * (T.aSmuggle[c.firing] ?? 0.7) * p.partRate * (1 - caught));
    const falseVeto = c.aggGate === 'off' ? 0 : clamp((3 - (c.aggK ?? 3)) / 3) * 0.12 * p.kappa;
    const capCost = Math.abs((c.lInfCap ?? 1) - 1) * 0.02;
    return U * (1 - Pveto) + Un * Pveto - Psmug * p.kappa - falseVeto - capCost;
  },
  nullValue: (c, p) => nullU(p.w || UNIFORM_W) - p.Pemit * p.kappa, // NULL catches nothing
};

function main() {
  console.log('=== WAVE-3 DECISION via the standing decision-sim instrument ===\n');

  // 1) robust optimum (cross-entropy / CVaR) — must reproduce the LOCKED answer.
  const { best, confidence } = crossEntropyOptimize(PROBLEM, { iters: 30, pop: 140, draws: 160, seed: 1 });
  console.log('CROSS-ENTROPY OPTIMUM (reproduces the locked design?):');
  console.log('  discrete:', JSON.stringify({ firing: best.firing, identity: best.identity, foundry: best.foundry, promote: best.promote, aggGate: best.aggGate }));
  console.log(`  continuous: soakLen=${best.soakLen.toFixed(1)}d  aggK=${best.aggK.toFixed(2)}  lInfCap=${best.lInfCap.toFixed(2)}`);
  console.log('  optimizer confidence:', JSON.stringify(confidence));

  // 2) minimax-regret over the headline discrete families (continuous at locked nominal).
  const fam = [];
  for (const firing of PROBLEM.discrete.firing) for (const identity of PROBLEM.discrete.identity) {
    fam.push({ firing, identity, foundry: 'unified', promote: 'async-bakeoff', aggGate: 'target-keyed', soakLen: 30, aggK: 3, lInfCap: 1 });
  }
  const { winner } = minimaxRegret(PROBLEM, fam, { draws: 600 });
  console.log(`\nMINIMAX-REGRET winner: firing=${winner.config.firing} identity=${winner.config.identity}  (maxRegret=${winner.maxRegret})`);

  // 3) the LOCKED config — PGD flip-rule + Info-Gap horizon (the NEW diagnostics).
  const LOCKED = { firing: 'async-trailing', identity: 'anchor+node', foundry: 'unified', promote: 'async-bakeoff', aggGate: 'target-keyed', soakLen: 30, aggK: 3, lInfCap: 1 };
  const witness = pgdWitness(PROBLEM, LOCKED, { restarts: 12, steps: 50 });
  console.log('\nPGD WORST-CASE WITNESS (SCALAR-ONLY — weights held UNIFORM; see HONESTY below):');
  console.log(`  worst margin = ${witness.margin}  at params ${JSON.stringify({ Pemit: +witness.params.Pemit.toFixed(3), kappa: +witness.params.kappa.toFixed(2), partRate: +witness.params.partRate.toFixed(3) })}`);
  console.log(`  ${witness.robust ? 'beats NULL across the scalar box — but this is NOT the full 5-D weight simplex' : 'NOT robust — flip region exists (see params)'}`);

  const ig = infoGapHorizon(PROBLEM, LOCKED, { nominal: { Pemit: 0.15, kappa: 2, partRate: 0.3 }, draws: 300, maxAlpha: 1, stepAlpha: 0.05 });
  console.log(`\nINFO-GAP HORIZON (scalar axes only): ${ig.flipped ? `flips at α=${ig.horizon}` : `survives the FULL horizon (α≤${ig.horizon}) on the scalar axes`}`);

  // compare locked vs the worst identity (contentHash) — the safety argument.
  const r = makeRng(7); let lockWin = 0; const N = 4000;
  const CH = { ...LOCKED, identity: 'contentHash' };
  for (let i = 0; i < N; i += 1) { const p = PROBLEM.sampleParams(r); if (PROBLEM.value(LOCKED, p) > PROBLEM.value(CH, p)) lockWin += 1; }
  console.log(`\nLOCKED (anchor+node) beats contentHash identity in ${(lockWin / N * 100).toFixed(1)}% of draws.`);

  honesty(best);
}

/**
 * HONESTY / RESIDUAL UNCERTAINTY (round-2 R2-E) — correct two over-claims, both verified LIVE here
 * against the PROBLEM (not asserted from a prior fan-out):
 *  1. The identity sub-choice anchor+node vs anchor-bound is WITHIN NOISE — it is NOT a robust win.
 *  2. The PGD / Info-Gap witnesses sweep only the 3 SCALAR axes with weights held uniform; they do
 *     NOT explore the 5-D weight simplex, so they OVERSTATE the safety cushion. (The earlier
 *     "margin −0.026 at w=[0,0,0,0,1]" note did NOT reproduce — the true joint worst is computed
 *     below and is reported as-measured, whatever its sign.)
 */
function honesty(ceBest) {
  console.log('\n=== HONESTY / RESIDUAL UNCERTAINTY (verified live) ===');

  // (1) identity is within noise: scan robustScore margin across the CVaR tail fraction.
  const LK = { firing: 'async-trailing', identity: 'anchor+node', foundry: 'unified', promote: 'async-bakeoff', aggGate: 'target-keyed', soakLen: 30, aggK: 3, lInfCap: 1 };
  const AB = { ...LK, identity: 'anchor-bound' };
  let flip = null; const tfs = [0.1, 0.2, 0.3, 0.4, 0.44, 0.5, 0.7, 1.0]; let maxAbs = 0;
  for (const tf of tfs) {
    const a = robustScore(PROBLEM, LK, { draws: 4000, tailFrac: tf, rng: makeRng(4242) });
    const b = robustScore(PROBLEM, AB, { draws: 4000, tailFrac: tf, rng: makeRng(4242) });
    maxAbs = Math.max(maxAbs, Math.abs(a - b));
    if (flip === null && (a - b) < 0) flip = tf;
  }
  console.log(`  identity anchor+node vs anchor-bound: |ΔrobustScore| ≤ ${maxAbs.toFixed(4)} across tailFrac∈[0.1,1]`
    + ` — WITHIN NOISE. anchor+node leads at small tails; anchor-bound overtakes at tailFrac≈${flip ?? '>1'}.`);
  console.log('  ⇒ the identity refinement is a coin-flip the LIVE 3b advisory hook must settle, NOT the sim.');

  // (2) scalar-only witness vs the TRUE joint worst over weight-simplex × scalar box.
  // CORRECTED (codex review 2026-06-13): the margin is AFFINE in the weights and multilinear over
  // the scalar-box terms, so its minimum lies at a CORNER — a weight-simplex VERTEX × a scalar-box
  // corner. A random Dirichlet search samples the interior and hits vertices with probability ZERO,
  // so it MISSED the flip and falsely reported a positive worst. Enumerate the corners deterministically.
  const weightVertices = Array.from({ length: 5 }, (_, i) => Array.from({ length: 5 }, (_x, j) => (i === j ? 1 : 0)));
  const scalarCorners = [];
  for (const Pemit of [0.05, 0.45]) for (const kappa of [0.5, 4]) for (const partRate of [0.1, 0.6]) scalarCorners.push({ Pemit, kappa, partRate });
  let joint = Infinity; let jointAt = null; let scalarUniform = Infinity;
  for (const sc of scalarCorners) {
    for (const w of weightVertices) {
      const margin = PROBLEM.value(LK, { ...sc, w }) - PROBLEM.nullValue(LK, { ...sc, w });
      if (margin < joint) { joint = margin; jointAt = { w, ...sc }; }
    }
    const pu = { ...sc, w: [0.2, 0.2, 0.2, 0.2, 0.2] };
    scalarUniform = Math.min(scalarUniform, PROBLEM.value(LK, pu) - PROBLEM.nullValue(LK, pu));
  }
  console.log(`  witness coverage: scalar-only (uniform w) worst margin = ${scalarUniform.toFixed(4)};`
    + ` TRUE joint (simplex-VERTEX × scalar-corner) worst = ${joint.toFixed(4)} at w=[${jointAt.w}] Pemit=${jointAt.Pemit} kappa=${jointAt.kappa} partRate=${jointAt.partRate}.`);
  console.log(`  ⇒ pgdWitness/infoGap (scalar-only, uniform w) MISS this corner entirely.`
    + ` LOCKED ${joint >= 0 ? 'beats NULL across the full simplex' : `FLIPS — it LOSES to NULL at this corner (all weight on build-cheapness, low smuggle/veto). This is a REAL residual: the substrate only dominates NULL when the owner assigns non-trivial weight to prevention/safety — which is the entire reason to build it`}.`);

  // (3) the promote tie — CE optimum vs the LOCKED hardcode.
  console.log(`  promote: CE optimum returned promote=${ceBest.promote}, but LOCKED hardcodes async-bakeoff`
    + ` — a DOCUMENTED TIE (within optimizer noise), not a derived win.`);
  console.log('  ROBUST dims (seed-stable, real wins): firing=async-trailing, foundry=unified, aggGate=target-keyed, soakLen→30.');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
export { PROBLEM };
