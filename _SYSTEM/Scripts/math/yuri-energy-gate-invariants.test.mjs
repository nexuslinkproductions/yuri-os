// Tests for yuri-energy-gate-invariants.mjs — B3 gateProposal property verifier.
// GREEN: the real gate satisfies every invariant. RED: each planted mutant is caught (non-vacuity).
// Plus the spec cross-check, the throw contract, and spelled-out non-offsettability assertions.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { gateProposal } from './yuri-energy.mjs';
import {
  runGateInvariants,
  runMutationCheck,
  genGateCorpus,
  crossCheckSpec,
  referenceDecision,
  realGate,
  GATE_INVARIANTS,
  GATE_MUTANTS,
  isMalformedCount,
  readCount,
} from './yuri-energy-gate-invariants.mjs';

test('corpus is non-trivial and covers both veto and no-veto regimes', () => {
  const corpus = genGateCorpus();
  assert.ok(corpus.length > 100, `corpus too small: ${corpus.length}`);
  // every row is a valid (non-throwing) gate input shape
  for (const args of corpus) {
    assert.ok(args.stateBefore && typeof args.stateBefore === 'object' && !Array.isArray(args.stateBefore));
    assert.ok(args.stateAfter && typeof args.stateAfter === 'object' && !Array.isArray(args.stateAfter));
  }
});

test('spec cross-check: referenceDecision({}) is bit-identical to the real gate decision', () => {
  const cross = crossCheckSpec();
  assert.equal(cross.ok, true, `spec diverges from gate: ${JSON.stringify(cross.mismatches[0] ?? null)}`);
});

test('GREEN — the real gateProposal satisfies every invariant over the corpus', () => {
  const res = runGateInvariants(realGate);
  for (const inv of GATE_INVARIANTS) {
    assert.equal(
      res.results[inv.name].ok,
      true,
      `invariant ${inv.name} failed: ${JSON.stringify(res.results[inv.name].counterexample ?? null)}`,
    );
    assert.ok(res.results[inv.name].checked > 0, `invariant ${inv.name} was never exercised`);
  }
  assert.equal(res.results.DETERMINISM.ok, true);
  assert.equal(res.ok, true);
});

test('RED — every planted mutant is caught by its target invariant (suite is non-vacuous)', () => {
  const res = runMutationCheck();
  for (const m of res.perMutant) {
    assert.equal(m.caught, true, `mutant ${m.name} was NOT caught by ${m.target} — invariant is vacuous`);
  }
  assert.equal(res.ok, true);
  // sanity: we actually exercised every declared mutant
  assert.equal(res.perMutant.length, GATE_MUTANTS.length);
});

test('throw contract — gateProposal rejects structurally invalid args', () => {
  assert.throws(() => gateProposal({}), /requires stateBefore and stateAfter/);
  assert.throws(() => gateProposal({ stateBefore: [], stateAfter: {} }), /requires stateBefore and stateAfter/);
  assert.throws(() => gateProposal({ stateBefore: {}, stateAfter: [] }), /requires stateBefore and stateAfter/);
  assert.throws(() => gateProposal({ stateBefore: {}, stateAfter: {}, threshold: NaN }), /threshold must be finite/);
  assert.throws(
    () => gateProposal({ stateBefore: {}, stateAfter: {}, maxLadderInversionCap: -1 }),
    /maxLadderInversionCap must be Infinity or a finite non-negative number/,
  );
  assert.throws(
    () => gateProposal({ stateBefore: {}, stateAfter: {}, maxLadderInversionCap: 'x' }),
    /maxLadderInversionCap must be Infinity or a finite non-negative number/,
  );
});

test('non-offsettability — a protected-path increase rejects despite descending ΔU AND override', () => {
  // huge verified-evidence credit (descending ΔU) + override — both should be powerless against the veto.
  const res = gateProposal({
    stateBefore: { protectedPathViolations: 0, verifiedEvidenceCount: 0 },
    stateAfter: { protectedPathViolations: 3, verifiedEvidenceCount: 50 },
    threshold: 1000,
    allowOverride: true,
  }).result;
  assert.equal(res.protectedPathVeto, true);
  assert.equal(res.accept, false, 'protected-path veto must be non-offsettable by ΔU/override');
});

test('non-offsettability — a malformed protected field rejects (fail-closed, masking attack)', () => {
  // NaN protectedPathViolations in stateAfter drops its eta contribution → ΔU LOOKS like a repair.
  const res = gateProposal({
    stateBefore: { protectedPathViolations: 2 },
    stateAfter: { protectedPathViolations: NaN },
    threshold: 0,
    allowOverride: true,
  }).result;
  assert.equal(res.protectedPathVeto, true, 'malformed protected field must fail closed');
  assert.equal(res.accept, false);
});

test('A4 regression — a present-but-negative veto field rejects (clamp-to-0 must not slip the veto)', () => {
  const res = gateProposal({
    stateBefore: { protectedPathViolations: 5 },
    stateAfter: { protectedPathViolations: -5 }, // clamps to 0 → reads as a repair unless failed closed
    threshold: 0,
    allowOverride: true,
  }).result;
  assert.equal(res.protectedPathVeto, true, 'negative protected field must fail closed (A4)');
  assert.equal(res.accept, false);
});

test('no-veto descending transition accepts; ascending rejects (threshold rule live)', () => {
  const desc = gateProposal({
    stateBefore: { verifiedEvidenceCount: 0 },
    stateAfter: { verifiedEvidenceCount: 5 }, // credit lowers U → ΔU < 0
    threshold: 0,
  }).result;
  assert.equal(desc.accept, true);
  const asc = gateProposal({
    stateBefore: { verifiedEvidenceCount: 5 },
    stateAfter: { verifiedEvidenceCount: 0 }, // credit removed → ΔU > 0
    threshold: 0,
  }).result;
  assert.equal(asc.accept, false);
});

test('CAP-DISABLED — default cap ignores maxLadderInversion entirely', () => {
  const res = gateProposal({
    stateBefore: {},
    stateAfter: { maxLadderInversion: 999 }, // no cap armed → field is inert
    threshold: 0,
  }).result;
  assert.equal(res.maxSeverityVeto, false);
  assert.equal(res.accept, true);
});

test('spec predicate units — isMalformedCount / readCount match the gate field semantics', () => {
  // malformed = present AND (non-finite OR negative)
  assert.equal(isMalformedCount(undefined), false);
  assert.equal(isMalformedCount(null), false);
  assert.equal(isMalformedCount(''), false);
  assert.equal(isMalformedCount(0), false);
  assert.equal(isMalformedCount(3), false);
  assert.equal(isMalformedCount(NaN), true);
  assert.equal(isMalformedCount('garbage'), true);
  assert.equal(isMalformedCount(-1), true);
  // readCount mirrors readNonNegativeField's numeric read
  assert.equal(readCount(undefined), 0);
  assert.equal(readCount(NaN), 0);
  assert.equal(readCount(-1), 0);
  assert.equal(readCount('5'), 5);
  assert.equal(readCount(3), 3);
});

test('referenceDecision with no disable equals the gate on a spot transition', () => {
  const args = {
    stateBefore: { promotionLadderInversions: 0 },
    stateAfter: { promotionLadderInversions: 2 },
    threshold: 0,
  };
  const spec = referenceDecision(args, {});
  const real = gateProposal(args).result;
  assert.equal(spec.accept, real.accept);
  assert.equal(spec.structuralFloorVeto, real.structuralFloorVeto);
});
