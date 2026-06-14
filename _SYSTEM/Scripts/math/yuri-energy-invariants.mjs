#!/usr/bin/env node
// ===========================================================================
// CLAUDE CONTROL PACKET
//   goal:        Prove computeU's mathematical invariants over ALL inputs
//                (property-based / ∀-quantified), not just the 46 example tests.
//                Candidate A of the substrate-frontier-grade mission (T1 gap).
//   target:      NEW file only. Reads computeU; mutates NO gate behavior.
//   constraints: dependency-free (no `npm i` — honors the no-install floor);
//                seeded PRNG (reproducible counterexamples); observe-mode;
//                fully reversible by deletion.
//   acceptance:  (GREEN) every invariant holds on the real computeU over N
//                random states; (RED) every planted mutant is CAUGHT by ≥1
//                invariant — proves the suite is non-vacuous.
//   test cmd:    node --test _SYSTEM/Scripts/math/yuri-energy-invariants.test.mjs
//   rollback:    rm this file + its .test.mjs (no other file touched).
// ===========================================================================
//
// @capability: energy-invariant-prover
// @serves: prove computeU invariants for all inputs | property based testing energy gate | monotonicity boundedness barrier-dominance proof | verify a scorer is non-vacuous
// @does: ∀-input property harness for computeU (reconstruction, finiteness, monotonicity, sign-convention, U-floor, barrier-dominance, weight-isolation) with seeded reproducible generation + planted-mutant negative controls
// @use: after ANY change to computeU / its weights / a drift term, run this to prove the math invariants still hold over the random input space — beyond the example tests; the mutant battery guards the harness itself against vacuity
// @exports: makeRng, genState, INVARIANTS, runInvariants, MUTANTS, runMutationCheck, FLOOR
//
// Frontier-discipline transfer: QuickCheck/fast-check property-based testing +
// metamorphic relations (chip ABV / SVA) → the YURI scoring function. The
// negative-control battery is the RED half of RED-GREEN discipline: a property
// test that only ever runs against correct code can be silently vacuous.

import { computeU, DEFAULT_WEIGHTS } from './yuri-energy.mjs';

// --- seeded PRNG (mulberry32): deterministic so a violation reproduces ------
export function makeRng(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const randInt = (rng, lo, hi) => lo + Math.floor(rng() * (hi - lo + 1));
const randDist = (rng, n) => Array.from({ length: n }, () => rng()); // unnormalized; computeU normalizes internally
const randProbs = (rng, n) => Array.from({ length: n }, () => 0.01 + rng() * 0.98); // strictly in (0,1)
const randLabels = (rng, n) => Array.from({ length: n }, () => (rng() < 0.5 ? 0 : 1));

// --- valid-state generator -------------------------------------------------
// Produces well-formed states. Distributions are valid (computeU normalizes);
// predictions/forecasts strictly inside (0,1) to avoid logLoss singularities;
// evidence kept [] (its schema is exercised by candidate D, not here).
export function genState(rng) {
  const nc = randInt(rng, 2, 6);   // class count for distributions
  const np = randInt(rng, 1, 5);   // forecast count
  return {
    claimPromotionDistribution: randDist(rng, nc),
    claimedDistribution: randDist(rng, nc),
    verifiedDistribution: randDist(rng, nc),
    predictions: randProbs(rng, np),
    outcomes: randLabels(rng, np),
    forecasts: randProbs(rng, np),
    results: randLabels(rng, np),
    priorState: randDist(rng, nc),
    posteriorState: randDist(rng, nc),
    evidence: [],
    protectedPathViolations: randInt(rng, 0, 3),
    promotionLadderInversions: randInt(rng, 0, 3),
    verifiedEvidenceCount: randInt(rng, 0, 60),
  };
}

// computeU adapter -> {U, contributions}
const real = (state, weights = DEFAULT_WEIGHTS) => {
  const r = computeU(state, weights).result;
  return { U: r.U, contributions: r.contributions };
};

// Theoretical lower bound on U with DEFAULT_WEIGHTS: the ONLY negative
// contributions are the info-gain credit (−ε·gain, gain∈[0,1]) and the
// verified-evidence credit (−ι·log1p(min(ev,50))). Everything else ≥ 0.
const VERIFIED_EVIDENCE_CREDIT_CAP = 50; // yuri-energy.mjs:654 Math.min(..,CAP)
export const FLOOR = -(DEFAULT_WEIGHTS.epsilon * 1 + DEFAULT_WEIGHTS.iota * Math.log1p(VERIFIED_EVIDENCE_CREDIT_CAP));

const EPS = 1e-6;
const sumContribs = (c) => Object.values(c).reduce((s, v) => s + v, 0);

// --- INVARIANTS (each parameterized by the scorer so mutants reuse them) ----
// Each returns {ok, counterexample|null}. `scorer(state,weights) -> {U,contributions}`.
export const INVARIANTS = [
  {
    name: 'reconstruction: U == sum(contributions)',
    run(scorer, rng, trials) {
      for (let i = 0; i < trials; i++) {
        const s = genState(rng);
        const { U, contributions } = scorer(s);
        if (Math.abs(U - sumContribs(contributions)) > EPS) {
          return { ok: false, counterexample: { state: s, U, sum: sumContribs(contributions) } };
        }
      }
      return { ok: true };
    },
  },
  {
    name: 'finiteness: U is finite',
    run(scorer, rng, trials) {
      for (let i = 0; i < trials; i++) {
        const s = genState(rng);
        const { U } = scorer(s);
        if (!Number.isFinite(U)) return { ok: false, counterexample: { state: s, U } };
      }
      return { ok: true };
    },
  },
  {
    name: 'monotone: up protectedPathViolations never lowers U',
    run(scorer, rng, trials) {
      for (let i = 0; i < trials; i++) {
        const s = genState(rng);
        const d = randInt(rng, 1, 4);
        const u0 = scorer(s).U;
        const u1 = scorer({ ...s, protectedPathViolations: s.protectedPathViolations + d }).U;
        if (u1 < u0 - 1e-9) return { ok: false, counterexample: { state: s, d, u0, u1 } };
      }
      return { ok: true };
    },
  },
  {
    name: 'monotone: up promotionLadderInversions never lowers U',
    run(scorer, rng, trials) {
      for (let i = 0; i < trials; i++) {
        const s = genState(rng);
        const d = randInt(rng, 1, 4);
        const u0 = scorer(s).U;
        const u1 = scorer({ ...s, promotionLadderInversions: s.promotionLadderInversions + d }).U;
        if (u1 < u0 - 1e-9) return { ok: false, counterexample: { state: s, d, u0, u1 } };
      }
      return { ok: true };
    },
  },
  {
    name: 'monotone: up verifiedEvidenceCount never raises U (credit)',
    run(scorer, rng, trials) {
      for (let i = 0; i < trials; i++) {
        const s = genState(rng);
        const d = randInt(rng, 1, 10);
        const u0 = scorer(s).U;
        const u1 = scorer({ ...s, verifiedEvidenceCount: s.verifiedEvidenceCount + d }).U;
        if (u1 > u0 + 1e-9) return { ok: false, counterexample: { state: s, d, u0, u1 } };
      }
      return { ok: true };
    },
  },
  {
    name: 'sign-convention: penalty-only state => U >= 0',
    run(scorer, rng, trials) {
      for (let i = 0; i < trials; i++) {
        // only the two integer penalty fields set; no soft inputs, no credits
        const s = {
          protectedPathViolations: randInt(rng, 0, 3),
          promotionLadderInversions: randInt(rng, 0, 3),
        };
        const { U } = scorer(s);
        if (U < -1e-9) return { ok: false, counterexample: { state: s, U } };
      }
      return { ok: true };
    },
  },
  {
    name: `U-floor: U >= ${FLOOR.toFixed(4)} (bounded below)`,
    run(scorer, rng, trials) {
      for (let i = 0; i < trials; i++) {
        const s = genState(rng);
        const { U } = scorer(s);
        if (U < FLOOR - EPS) return { ok: false, counterexample: { state: s, U, floor: FLOOR } };
      }
      return { ok: true };
    },
  },
  {
    name: 'barrier-dominance: protectedPathViolations >= 1 => U > 0',
    run(scorer, rng, trials) {
      for (let i = 0; i < trials; i++) {
        const s = genState(rng);
        s.protectedPathViolations = randInt(rng, 1, 3);
        const { U } = scorer(s);
        if (!(U > 0)) return { ok: false, counterexample: { state: s, U } };
      }
      return { ok: true };
    },
  },
  {
    name: 'weight-isolation: alpha=0 => entropy contribution = 0',
    run(scorer, rng, trials) {
      const w = { ...DEFAULT_WEIGHTS, alpha: 0 };
      for (let i = 0; i < trials; i++) {
        const s = genState(rng);
        const { contributions } = scorer(s, w);
        const e = contributions.entropy ?? 0;
        if (Math.abs(e) > 1e-9) return { ok: false, counterexample: { state: s, entropy: e } };
      }
      return { ok: true };
    },
  },
];

export function runInvariants(scorer = real, { trials = 2000, seed = 0x5eed } = {}) {
  const results = INVARIANTS.map((inv) => {
    const rng = makeRng(seed + inv.name.length); // per-invariant stream, still deterministic
    let r;
    try {
      r = inv.run(scorer, rng, trials);
    } catch (err) {
      // a scorer that THROWS is itself a violation (robustness) — surface it, never crash the run
      r = { ok: false, counterexample: { threw: String((err && err.message) || err) } };
    }
    return { name: inv.name, ok: r.ok, trials, counterexample: r.counterexample ?? null };
  });
  return { passed: results.every((r) => r.ok), trials, results };
}

// --- NEGATIVE CONTROLS: planted mutants that MUST be caught -----------------
// Each is a deliberately-broken scorer. A non-vacuous suite flags >=1 invariant
// failure on each. (We never mutate the real computeU — the gate — only clones.)
export const MUTANTS = {
  'sign-flip-barrier': (state, weights = DEFAULT_WEIGHTS) => {
    // computeU fail-closes on negative weights, so we cannot inject one — instead post-process a
    // VALID result to negate the barrier contribution: more violations -> LOWER U (breaks
    // monotone + barrier + sign + floor) while keeping reconstruction intact (U == sum still holds).
    const r = computeU(state, weights).result;
    const c = { ...r.contributions };
    const orig = c.protectedPathViolations ?? 0; // = eta * violations >= 0
    c.protectedPathViolations = -orig;
    return { U: r.U - 2 * orig, contributions: c };
  },
  'reconstruction-break': (state, weights = DEFAULT_WEIGHTS) => {
    const r = computeU(state, weights).result;
    return { U: r.U + 7, contributions: r.contributions }; // U no longer equals sum(contribs)
  },
  'unbounded-credit': (state, weights = DEFAULT_WEIGHTS) => {
    // 1000x the evidence credit -> U dives far below the floor (breaks U-floor + sign + barrier)
    const r = computeU(state, weights).result;
    const c = { ...r.contributions };
    const extra = -1000 * Math.abs(c.verifiedEvidenceCredit ?? 1);
    c.verifiedEvidenceCredit = (c.verifiedEvidenceCredit ?? 0) + extra;
    return { U: r.U + extra, contributions: c };
  },
  'nonfinite': (state, weights = DEFAULT_WEIGHTS) => {
    const r = computeU(state, weights).result;
    return { U: state.protectedPathViolations > 1 ? Infinity : r.U, contributions: r.contributions };
  },
};

export function runMutationCheck({ trials = 1500, seed = 0x5eed } = {}) {
  const report = {};
  let allCaught = true;
  for (const [name, mutant] of Object.entries(MUTANTS)) {
    const { passed, results } = runInvariants(mutant, { trials, seed });
    const caught = !passed; // a mutant is "caught" iff some invariant FAILS on it
    report[name] = { caught, failedInvariants: results.filter((r) => !r.ok).map((r) => r.name) };
    if (!caught) allCaught = false;
  }
  return { allCaught, report };
}

// --- CLI -------------------------------------------------------------------
if (import.meta.url === `file://${process.argv[1]}`) {
  const trials = Number(process.argv[2]) || 5000;
  const green = runInvariants(real, { trials });
  const red = runMutationCheck({ trials: Math.min(trials, 1500) });
  console.log(`\nGREEN — computeU invariants (${trials} trials each):`);
  for (const r of green.results) console.log(`  ${r.ok ? 'PASS' : 'FAIL'}  ${r.name}${r.ok ? '' : '  ce=' + JSON.stringify(r.counterexample)}`);
  console.log(`\nRED — planted mutants (must be caught):`);
  for (const [n, v] of Object.entries(red.report)) console.log(`  ${v.caught ? 'CAUGHT' : 'ESCAPED'}  ${n}  via=[${v.failedInvariants.join(', ')}]`);
  const ok = green.passed && red.allCaught;
  console.log(`\n${ok ? 'OK' : 'FAILURE'}: invariants ${green.passed ? 'hold' : 'VIOLATED'}, mutants ${red.allCaught ? 'all caught' : 'ESCAPED'}`);
  process.exit(ok ? 0 : 1);
}
