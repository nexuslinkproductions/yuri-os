#!/usr/bin/env node
// ===========================================================================
// CLAUDE CONTROL PACKET
//   goal:        The GREY-ZONE catcher (substrate-frontier-grade B5). Hand-planted
//                RED mutants only prove we catch failure modes WE imagined. This
//                AUTO-GENERATES a mutation grid over computeU + gateProposal and
//                reports which SURVIVE the ∀-input property provers — the failure
//                modes nobody planted (Marcel's "grey test", 2026-06-14).
//   target:      NEW file only. Post-processes computeU/gateProposal OUTPUT (the
//                cloneAndBreak pattern) — NEVER edits gate-core. Observe-only.
//   constraints: pure, dependency-free, deterministic (seeded; no Math.random/
//                Date.now), reversible by deletion; mutates NO real gate behavior.
//   acceptance:  (1) the sweep KILLS the mutants the provers should catch (gate
//                grid → 100%); (2) it SURFACES a constructed known-grey survivor
//                (non-vacuous); (3) an always-equivalent mutant is filtered, not
//                a false gap; (4) deterministic.
//   test cmd:    node --test _SYSTEM/Scripts/math/yuri-energy-mutation-sweep.test.mjs
//   rollback:    rm this file + its .test.mjs.
// ===========================================================================
//
// @capability: energy-mutation-survivor-sweep
// @serves: automated mutation testing computeU gateProposal | find verification gaps the hand-planted mutants miss | grey-zone catcher | mutation score | survivor report for the energy provers
// @does: enumerates a mutation grid (12 computeU contribution targets × 6 operators + gateProposal veto-arm/threshold/override operators), runs each generated mutant as the injected function-under-test through the ∀-input property provers (runInvariants / runGateInvariants), classifies KILLED / SURVIVED / EQUIVALENT, filters equivalents behaviorally over a term-exhaustive probe set, and emits a mutation score + the survivor list (the grey gaps the planted mutants never modeled)
// @use: after building/changing the energy provers, run to measure what they DON'T catch; each non-equivalent SURVIVOR is a grey gap that should become a new permanent hand-planted mutant (failure-anchored loop)
// @exports: COMPUTEU_OPERATORS, GATE_OPERATORS, makeComputeUMutant, makeGateMutant, termExhaustiveProbes, isEquivalentMutant, runSweep
//
// WHY THIS COMPLEMENTS RED: RED (planted mutants) proves the suite catches the bugs we
// IMAGINED. This proves nothing more than that — its reach is our imagination. The sweep
// auto-generates a systematic grid and reports SURVIVORS: mutants that pass every prover.
// A survivor is either an equivalent mutant (filtered) or a real GREY gap (→ add a mutant).
// SCOPE (honest, not a silent cap): a computeU mutant is run through TWO killer layers — the
// invariant prover AND the metamorphic relations; a gate mutant through the gate invariant prover.
// A SURVIVED verdict means BOTH the invariant and metamorphic layers miss it (genuine grey for the
// property layer). The coverage meter (measures reach, doesn't kill) and the gate cross-check
// (differential oracle, not yet injectable without a param) would kill ADDITIONAL survivors —
// wiring them is a documented extension, NOT a silent cap.

import { computeU, gateProposal, DEFAULT_WEIGHTS } from './yuri-energy.mjs';
import { runInvariants } from './yuri-energy-invariants.mjs';
import { survivesMetamorphic } from './yuri-energy-metamorphic.mjs';
import { runGateInvariants, genGateCorpus } from './yuri-energy-gate-invariants.mjs';
import { COMPONENT_KEYS } from './yuri-energy-coverage.mjs';

// --- mutation operators ----------------------------------------------------
export const COMPUTEU_OPERATORS = ['NEGATE', 'ZERO', 'DROP_KEY', 'SCALE', 'BIAS', 'SWAP_NEXT'];
export const GATE_OPERATORS = ['DROP_PROTECTED_VETO', 'DROP_STRUCTURAL_VETO', 'DROP_MAXSEV_VETO', 'FLIP_THRESHOLD', 'OVERRIDE_BEATS_VETO'];

// makeComputeUMutant — a scorer clone that post-processes computeU's contributions for ONE
// target with ONE operator, adjusting U by the EXACT contribution delta (so U==Σ is preserved
// — reconstruction is NOT the killer; the OTHER invariants are — and there is no rounding drift,
// which keeps the equivalence check exact). When the target is absent for an input, the mutant
// returns the real output verbatim (the operator is a no-op there).
export function makeComputeUMutant(target, op) {
  return (state, weights = DEFAULT_WEIGHTS) => {
    const r = computeU(state, weights).result;
    const c = { ...r.contributions };
    if (!(target in c)) return { U: r.U, contributions: c }; // no-op when the term didn't fire
    const orig = c[target];
    let u = r.U;
    if (op === 'DROP_KEY') {
      delete c[target];
      u = r.U - orig;
    } else {
      let neu = orig;
      switch (op) {
        case 'NEGATE': neu = -orig; break;
        case 'ZERO': neu = 0; break;
        case 'SCALE': neu = orig * 2; break;
        case 'BIAS': neu = orig + 1; break;
        case 'SWAP_NEXT': {
          const i = COMPONENT_KEYS.indexOf(target);
          const next = COMPONENT_KEYS[(i + 1) % COMPONENT_KEYS.length];
          neu = c[next] ?? r.contributions[next] ?? 0;
          break;
        }
        default: neu = orig;
      }
      c[target] = neu;
      u = r.U - orig + neu;
    }
    return { U: u, contributions: c };
  };
}

// makeGateMutant — a gateFn clone that recomputes `accept` from a mutated veto/threshold/override
// rule. Returns the gateProposal output shape (result + proof) so runGateInvariants reads it
// uniformly. These map onto B3's planted GATE_MUTANTS → the gate provers should KILL all of them
// (the sweep both validates B3's reach and would expose any gate-arm B3 misses).
export function makeGateMutant(op) {
  return (args) => {
    const full = gateProposal(args);
    const r = full.result;
    let protectedPathVeto = r.protectedPathVeto;
    let structuralFloorVeto = r.structuralFloorVeto;
    let maxSeverityVeto = r.maxSeverityVeto;
    const override = args && args.allowOverride === true;
    if (op === 'DROP_PROTECTED_VETO') protectedPathVeto = false;
    if (op === 'DROP_STRUCTURAL_VETO') structuralFloorVeto = false;
    if (op === 'DROP_MAXSEV_VETO') maxSeverityVeto = false;
    const anyVeto = protectedPathVeto || structuralFloorVeto || maxSeverityVeto;
    let accept;
    if (op === 'OVERRIDE_BEATS_VETO') {
      accept = override ? true : (anyVeto ? false : r.deltaU <= r.threshold);
    } else if (op === 'FLIP_THRESHOLD') {
      accept = anyVeto ? false : (r.deltaU > r.threshold || override);
    } else {
      accept = anyVeto ? false : (r.deltaU <= r.threshold || override);
    }
    return { result: { ...r, protectedPathVeto, structuralFloorVeto, maxSeverityVeto, accept }, proof: full.proof };
  };
}

// --- term-exhaustive probe set (the equivalent-mutant filter depends on this) ----
// CRITICAL (mimo's catch): the probe set MUST emit every one of the 12 contribution keys
// non-trivially and trigger every gate veto arm. If a term is absent across ALL probes, a
// DROP_KEY/SCALE/etc. mutant on it is indistinguishable from real → falsely flagged EQUIVALENT
// (a hidden false-negative). energy-mutation-sweep.test.mjs asserts the union covers all 12.
export function termExhaustiveProbes() {
  const computeUStates = [
    // rich state: distributions + predictions + forecasts + aged evidence (staleness) + barriers
    {
      claimPromotionDistribution: { a: 0.5, b: 0.3, c: 0.2 },
      claimedDistribution: [0.6, 0.3, 0.1],
      verifiedDistribution: [0.2, 0.3, 0.5],
      predictions: [0.9, 0.2], outcomes: [0, 1],
      forecasts: [0.8, 0.3], results: [1, 0],
      priorState: [0.25, 0.25, 0.25, 0.25], posteriorState: [0.7, 0.1, 0.1, 0.1],
      evidence: [{ base: 0.9, age: 200, halfLife: 60 }],
      protectedPathViolations: 2, promotionLadderInversions: 1, verifiedEvidenceCount: 12,
    },
    // malformedForecast trigger (out-of-range forecast) + a different shape
    {
      claimedDistribution: [0.5, 0.5], verifiedDistribution: [0.1, 0.9],
      forecasts: [2, 0.3], results: [1, 0],
      protectedPathViolations: 0, promotionLadderInversions: 0, verifiedEvidenceCount: 0,
    },
  ];
  const gateArgs = [
    { stateBefore: { verifiedEvidenceCount: 0 }, stateAfter: { verifiedEvidenceCount: 5 } },                 // accept
    { stateBefore: { protectedPathViolations: 0 }, stateAfter: { protectedPathViolations: 1 } },             // protected veto
    { stateBefore: { promotionLadderInversions: 0 }, stateAfter: { promotionLadderInversions: 2 } },         // structural veto
    { stateBefore: {}, stateAfter: { maxLadderInversion: 5 }, maxLadderInversionCap: 3 },                    // L∞ veto
    { stateBefore: { verifiedEvidenceCount: 5 }, stateAfter: { verifiedEvidenceCount: 0 }, allowOverride: true }, // override accept
  ];
  return {
    computeU: computeUStates.map((s) => [s]),
    gate: gateArgs.map((a) => [a]),
  };
}

// isEquivalentMutant — behavioral, deterministic (NOT undecidable static analysis): a mutant is
// EQUIVALENT iff its projected output is bit-identical to the real fn across EVERY probe. project
// extracts the observable surface (computeU: {U,contributions}; gate: accept + veto flags).
export function isEquivalentMutant(mutantFn, realFn, probes, project) {
  for (const p of probes) {
    let a; let b;
    try { a = project(mutantFn(...p)); } catch { return false; }
    try { b = project(realFn(...p)); } catch { return false; }
    if (a !== b) return false;
  }
  return true;
}

const projComputeU = (r) => JSON.stringify({ U: r.U, c: r.contributions });
const projGate = (r) => JSON.stringify({
  a: r.result.accept, p: r.result.protectedPathVeto, s: r.result.structuralFloorVeto, m: r.result.maxSeverityVeto,
});

// --- the sweep -------------------------------------------------------------
export function runSweep({ trials = 300 } = {}) {
  const probes = termExhaustiveProbes();
  const realU = (s, w = DEFAULT_WEIGHTS) => computeU(s, w).result;
  const realG = (a) => gateProposal(a);
  const corpus = genGateCorpus();
  const details = [];

  // computeU grid: 12 targets × 6 operators
  for (const target of COMPONENT_KEYS) {
    for (const op of COMPUTEU_OPERATORS) {
      const m = makeComputeUMutant(target, op);
      if (isEquivalentMutant((s, w) => m(s, w), realU, probes.computeU, projComputeU)) {
        details.push({ kind: 'computeU', target, op, status: 'EQUIVALENT' });
        continue;
      }
      // TWO killer layers: the invariant prover AND the metamorphic relations (both peers' designs +
      // the grey-test doctrine — a mutant is grey only if it survives BOTH). Survival here means the
      // invariant+metamorphic layer misses it; coverage/cross-check would kill more (documented scope).
      const inv = runInvariants((s, w) => m(s, w), { trials });
      const met = survivesMetamorphic((s, w) => m(s, w), { numStates: Math.min(trials, 250) });
      const killedBy = [
        ...(inv.passed ? [] : inv.results.filter((r) => !r.ok).map((r) => `inv:${r.name}`)),
        ...(met.survived ? [] : met.killedBy.map((n) => `mr:${n}`)),
      ];
      details.push({ kind: 'computeU', target, op, status: killedBy.length ? 'KILLED' : 'SURVIVED', killedBy });
    }
  }

  // gateProposal grid: veto-arm / threshold / override operators
  for (const op of GATE_OPERATORS) {
    const m = makeGateMutant(op);
    if (isEquivalentMutant(m, realG, probes.gate, projGate)) {
      details.push({ kind: 'gate', op, status: 'EQUIVALENT' });
      continue;
    }
    const res = runGateInvariants(m, corpus);
    details.push({
      kind: 'gate', op,
      status: res.ok ? 'SURVIVED' : 'KILLED',
      killedBy: res.ok ? [] : Object.entries(res.results).filter(([, r]) => !r.ok).map(([n]) => n),
    });
  }

  const testable = details.filter((d) => d.status !== 'EQUIVALENT');
  const killed = testable.filter((d) => d.status === 'KILLED');
  const survived = testable.filter((d) => d.status === 'SURVIVED');
  return {
    total: details.length,
    testable: testable.length,
    killed: killed.length,
    survived: survived.length,
    equivalent: details.filter((d) => d.status === 'EQUIVALENT').length,
    mutationScore: testable.length ? +(killed.length / testable.length).toFixed(3) : 1,
    survivors: survived,
    details,
  };
}

// CLI worked example.
if (import.meta.url === `file://${process.argv[1]}`) {
  const r = runSweep();
  const lines = [];
  lines.push('yuri-energy-mutation-sweep — B5 grey-zone survivor sweep');
  lines.push(`grid: ${r.total} mutants (${r.equivalent} equivalent-filtered, ${r.testable} testable)`);
  lines.push(`mutation score: ${(r.mutationScore * 100).toFixed(1)}%  (killed ${r.killed}/${r.testable})`);
  lines.push(`SURVIVORS (grey gaps in the invariant layer): ${r.survived}`);
  for (const s of r.survivors) lines.push(`  • ${s.kind} ${s.target ? s.target + ' ' : ''}${s.op}`);
  lines.push('Each survivor is a candidate for a new permanent hand-planted mutant (failure-anchored loop).');
  console.log(lines.join('\n'));
}
