// Tests for yuri-energy-invariants.mjs — the ∀-input property harness for computeU.
// GREEN: every invariant holds on the real gate. RED: every planted mutant is caught
// (proves the suite is non-vacuous — the discipline, not decoration).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  runInvariants, runMutationCheck, INVARIANTS, MUTANTS, FLOOR, makeRng, genState,
} from './yuri-energy-invariants.mjs';

test('GREEN: all computeU invariants hold over the random state space', () => {
  const { passed, results } = runInvariants(undefined, { trials: 3000 });
  const failed = results.filter((r) => !r.ok).map((r) => `${r.name} ce=${JSON.stringify(r.counterexample)}`);
  assert.equal(passed, true, `invariants violated:\n${failed.join('\n')}`);
  assert.equal(results.length, INVARIANTS.length);
});

test('RED: every planted mutant is caught by >=1 invariant (non-vacuous)', () => {
  const { allCaught, report } = runMutationCheck({ trials: 1500 });
  const escaped = Object.entries(report).filter(([, v]) => !v.caught).map(([n]) => n);
  assert.equal(allCaught, true, `mutants escaped the suite: ${escaped.join(', ')}`);
  // each mutant must be caught by the specific invariant class it breaks
  assert.ok(report['reconstruction-break'].failedInvariants.some((n) => n.startsWith('reconstruction')));
  assert.ok(report['nonfinite'].failedInvariants.some((n) => n.startsWith('finiteness') || n.startsWith('reconstruction')));
  assert.ok(report['sign-flip-barrier'].failedInvariants.some((n) => n.startsWith('barrier-dominance') || n.startsWith('monotone: up protected')));
  assert.ok(report['unbounded-credit'].failedInvariants.some((n) => n.startsWith('U-floor')));
  // B2: the reconstruction-drop-both-sides escape is closed ONLY by term-presence — prove it is
  // the UNIQUE catcher (reconstruction PASSES it because both sides lose the same mass).
  assert.ok(report['drop-unconditional-term'].failedInvariants.some((n) => n.startsWith('term-presence')),
    'drop-unconditional-term must be caught by term-presence');
  assert.ok(!report['drop-unconditional-term'].failedInvariants.some((n) => n.startsWith('reconstruction')),
    'reconstruction must NOT catch it (both sides drop equally) — proves term-presence is load-bearing');
});

test('B2: enriched genState exercises the staleness + malformedForecast evaluators', () => {
  // Over many seeds the generator must (a) sometimes carry aged evidence (drives ζ) and (b)
  // sometimes carry an out-of-range forecast (drives λ) — the bias the fix removed. Without this,
  // those evaluators' fail-closed seams are never reached by the prover OR the coverage meter.
  const rng = makeRng(0x5eed);
  let withEvidence = 0;
  let withMalformed = 0;
  for (let i = 0; i < 500; i += 1) {
    const s = genState(rng);
    if (Array.isArray(s.evidence) && s.evidence.length > 0) withEvidence += 1;
    if (Array.isArray(s.forecasts) && s.forecasts.some((p) => !(Number.isFinite(p) && p >= 0 && p <= 1))) withMalformed += 1;
    for (const e of s.evidence) { // items carry the {base, age, halfLife} shape confidenceDecay reads
      assert.ok(Number.isFinite(e.base) && Number.isFinite(e.age) && Number.isFinite(e.halfLife));
    }
  }
  assert.ok(withEvidence > 100, `expected many states with evidence, got ${withEvidence}/500`);
  assert.ok(withMalformed > 20, `expected some states with malformed forecasts, got ${withMalformed}/500`);
});

test('determinism: same seed reproduces the same verdict', () => {
  const a = runInvariants(undefined, { trials: 500, seed: 123 });
  const b = runInvariants(undefined, { trials: 500, seed: 123 });
  assert.deepEqual(a.results.map((r) => r.ok), b.results.map((r) => r.ok));
});

test('FLOOR matches the analytic lower bound (-epsilon*1 - iota*log1p(50))', () => {
  assert.ok(Math.abs(FLOOR - (-(1.0 + 0.1 * Math.log1p(50)))) < 1e-12);
});

test('genState is well-formed and seed-stable', () => {
  const s = genState(makeRng(7));
  assert.ok(Array.isArray(s.claimedDistribution) && s.claimedDistribution.length >= 2);
  assert.ok(Number.isInteger(s.protectedPathViolations) && s.protectedPathViolations >= 0);
});
