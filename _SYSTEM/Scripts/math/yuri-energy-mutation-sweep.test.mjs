// Tests for yuri-energy-mutation-sweep.mjs — the B5 grey-zone survivor sweep.
// The sweep auto-generates mutants and reports which SURVIVE the property provers (the grey the
// hand-planted RED mutants never modeled). These tests prove the sweep itself is sound:
//  - the equivalent-mutant filter works BOTH ways (no false gaps, no false kills);
//  - the probe set is term-exhaustive (else the filter lies — mimo's catch);
//  - it KILLS what the provers should catch (gate grid → 100%, non-vacuous);
//  - it SURFACES genuine grey (a soft-term sign mutation no current invariant pins);
//  - it is deterministic.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeU, DEFAULT_WEIGHTS } from './yuri-energy.mjs';
import { COMPONENT_KEYS } from './yuri-energy-coverage.mjs';
import {
  COMPUTEU_OPERATORS, GATE_OPERATORS, makeComputeUMutant, makeGateMutant,
  termExhaustiveProbes, isEquivalentMutant, runSweep,
} from './yuri-energy-mutation-sweep.mjs';

const projComputeU = (r) => JSON.stringify({ U: r.U, c: r.contributions });

test('grid shape: 12 computeU targets × 6 ops + 5 gate ops', () => {
  assert.equal(COMPUTEU_OPERATORS.length, 6);
  assert.equal(GATE_OPERATORS.length, 5);
  assert.equal(COMPONENT_KEYS.length * COMPUTEU_OPERATORS.length + GATE_OPERATORS.length, 77);
});

test('term-exhaustive probe set: the 12 contribution keys are ALL emitted across probes', () => {
  // mimo's correctness requirement — if a key is never emitted by any probe, a DROP_KEY/SCALE mutant
  // on it is indistinguishable from real and falsely reads EQUIVALENT (a hidden false-negative).
  const probes = termExhaustiveProbes();
  const emitted = new Set();
  for (const [state] of probes.computeU) {
    for (const k of Object.keys(computeU(state).result.contributions)) emitted.add(k);
  }
  const missing = COMPONENT_KEYS.filter((k) => !emitted.has(k));
  assert.deepEqual(missing, [], `probe set must emit every contribution key; missing: ${missing}`);
});

test('equivalent-mutant filter — BOTH directions (no false gap, no false kill)', () => {
  const probes = termExhaustiveProbes();
  const realU = (s, w = DEFAULT_WEIGHTS) => computeU(s, w).result;
  // a literal identity "mutant" must read EQUIVALENT (else the sweep would report false gaps)
  const identity = (s, w = DEFAULT_WEIGHTS) => computeU(s, w).result;
  assert.equal(isEquivalentMutant(identity, realU, probes.computeU, projComputeU), true);
  // a real-difference mutant (NEGATE entropy) must NOT read equivalent (else a real change is hidden)
  const neg = makeComputeUMutant('entropy', 'NEGATE');
  assert.equal(isEquivalentMutant((s, w) => neg(s, w), realU, probes.computeU, projComputeU), false);
});

test('RED — every gate mutant is KILLED by the gate property prover (non-vacuous, validates B3)', () => {
  const r = runSweep({ trials: 200 });
  const gate = r.details.filter((d) => d.kind === 'gate');
  assert.equal(gate.length, GATE_OPERATORS.length);
  const survivedGate = gate.filter((d) => d.status === 'SURVIVED');
  assert.deepEqual(survivedGate, [], `gate mutants must all be killed by runGateInvariants; survived: ${JSON.stringify(survivedGate)}`);
});

test('GREY — the sweep SURFACES genuine survivors the planted suites miss', () => {
  const r = runSweep({ trials: 200 });
  assert.ok(r.mutationScore > 0 && r.mutationScore <= 1, `score in (0,1]: ${r.mutationScore}`);
  assert.ok(r.survived > 0, 'the sweep must surface grey survivors (its whole purpose)');
  // a soft-term SIGN flip is genuine grey: no per-term sign invariant exists, and the symmetric MRs
  // (permute/scale) survive a uniform negation → it passes BOTH provers. This is the actionable
  // finding (→ add a per-soft-term sign invariant in the failure-anchored loop).
  const softSignSurvivor = r.survivors.some((s) => s.kind === 'computeU' && s.op === 'NEGATE');
  assert.ok(softSignSurvivor, 'a soft-term NEGATE should survive — the per-term-sign gap the sweep exists to reveal');
});

test('determinism: the sweep is reproducible', () => {
  const a = runSweep({ trials: 150 });
  const b = runSweep({ trials: 150 });
  assert.equal(a.mutationScore, b.mutationScore);
  assert.equal(a.survived, b.survived);
  assert.deepEqual(a.survivors.map((s) => `${s.kind}:${s.target || ''}:${s.op}`).sort(),
    b.survivors.map((s) => `${s.kind}:${s.target || ''}:${s.op}`).sort());
});
