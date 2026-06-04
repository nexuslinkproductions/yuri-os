#!/usr/bin/env node
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  MECHANISM_PATTERN_VERBS,
  MIN_WITNESSES,
  validateMechanismPatternRegistry,
  validateRegistryFile,
} from './mechanism-pattern-registry.mjs';

// A minimal valid verb entry factory — start from a known-good shape, mutate per test.
function validVerb(overrides = {}) {
  return {
    verb: 'compose-readonly-analyzer',
    definition: 'compose read-only analyzers over a frozen artifact',
    witnesses: ['_SYSTEM/Scripts/math/math-health.mjs:16', '_SYSTEM/Scripts/math/math-health.mjs:36'],
    rippleClass: 'LOW',
    guardRequirement: 'read-only stays read-only',
    cascadeFamily: 'readonly-graph',
    ...overrides,
  };
}

function validRegistry(verbs) {
  return {
    schema: 'yuri.mechanism-pattern-registry.v0',
    id: 'test-registry',
    version: '0.1.0',
    promotionStatus: 'research',
    advisoryOnly: true,
    verbs,
  };
}

test('the on-disk registry file passes with exactly 5 verbs', () => {
  const result = validateRegistryFile();
  assert.equal(result.ok, true, `errors: ${result.errors.join(', ')}`);
  assert.equal(result.verbCount, 5);
  assert.deepEqual(result.errors, []);
});

test('the closed verb Set is exactly the 5 v0 verbs and is frozen', () => {
  assert.equal(MECHANISM_PATTERN_VERBS.size, 5);
  assert.equal(Object.isFrozen(MECHANISM_PATTERN_VERBS), true);
  for (const v of [
    'replace-hand-tuned-constant',
    'read-lower-bound-not-point',
    'gate-on-identity-not-aggregate',
    'shared-prerequisite-unlock',
    'compose-readonly-analyzer',
  ]) {
    assert.ok(MECHANISM_PATTERN_VERBS.has(v), `missing ${v}`);
  }
});

test('a valid in-memory registry passes', () => {
  const result = validateMechanismPatternRegistry(validRegistry([validVerb()]));
  assert.equal(result.ok, true, `errors: ${result.errors.join(', ')}`);
  assert.deepEqual(result.errors, []);
});

test('an unknown 6th verb is rejected (closed-set, no self-mint)', () => {
  const result = validateMechanismPatternRegistry(
    validRegistry([validVerb(), validVerb({ verb: 'invent-a-new-verb' })]),
  );
  assert.equal(result.ok, false);
  assert.ok(
    result.errors.some((e) => e.includes('invent-a-new-verb') && e.includes('closed v0 set')),
    `errors: ${result.errors.join(', ')}`,
  );
});

test('a verb with only 1 witness is rejected', () => {
  const result = validateMechanismPatternRegistry(
    validRegistry([validVerb({ witnesses: ['_SYSTEM/Scripts/math/math-health.mjs:16'] })]),
  );
  assert.equal(result.ok, false);
  assert.ok(
    result.errors.some((e) => e.includes(`>=${MIN_WITNESSES} witnesses`)),
    `errors: ${result.errors.join(', ')}`,
  );
});

test('a non path:line witness is rejected', () => {
  const result = validateMechanismPatternRegistry(
    validRegistry([validVerb({ witnesses: ['_SYSTEM/Scripts/math/math-health.mjs', 'not-a-witness'] })]),
  );
  assert.equal(result.ok, false);
  assert.ok(
    result.errors.some((e) => e.includes('malformed witness')),
    `errors: ${result.errors.join(', ')}`,
  );
});

// --- adversarial / negative + mismatch cases beyond the required four ---

test('a bare-number-only or range witness is rejected (not point-line)', () => {
  const range = validateMechanismPatternRegistry(
    validRegistry([validVerb({ witnesses: ['foo.mjs:12-20', 'foo.mjs:30'] })]),
  );
  assert.equal(range.ok, false, 'a line range must not pass the point-line gate');

  const doubleColon = validateMechanismPatternRegistry(
    validRegistry([validVerb({ witnesses: ['a:b:5', 'foo.mjs:30'] })]),
  );
  assert.equal(doubleColon.ok, false, 'double-colon noise must not pass');
});

test('non-object and wrong-type inputs fail closed, never throw', () => {
  for (const bad of [null, undefined, 'string', 42, []]) {
    const result = validateMechanismPatternRegistry(bad);
    assert.equal(result.ok, false, `${JSON.stringify(bad)} should fail closed`);
    assert.ok(Array.isArray(result.errors) && result.errors.length > 0);
  }
});

test('a wrong schema constant is rejected', () => {
  const reg = validRegistry([validVerb()]);
  reg.schema = 'yuri.mechanism-pattern-registry.v1';
  const result = validateMechanismPatternRegistry(reg);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => e.includes('unsupported schema')));
});

test('a duplicate verb entry is rejected', () => {
  const result = validateMechanismPatternRegistry(validRegistry([validVerb(), validVerb()]));
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => e.includes('duplicate verb')));
});

test('a known verb with a missing required field (cascadeFamily) is rejected', () => {
  const v = validVerb();
  delete v.cascadeFamily;
  const result = validateMechanismPatternRegistry(validRegistry([v]));
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => e.includes('cascadeFamily is required')));
});

test('empty verbs array is rejected (registry must carry verbs)', () => {
  const result = validateMechanismPatternRegistry(validRegistry([]));
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => e.includes('non-empty array')));
});

test('a whitespace-padded witness is rejected (regression: space-padded paths read well-formed but never grep)', () => {
  const lead = validateMechanismPatternRegistry(
    validRegistry([validVerb({ witnesses: [' foo.mjs:5', 'foo.mjs:6'] })]),
  );
  assert.equal(lead.ok, false, 'leading-space witness must be rejected');
  const trail = validateMechanismPatternRegistry(
    validRegistry([validVerb({ witnesses: ['foo.mjs:5 ', 'foo.mjs:6'] })]),
  );
  assert.equal(trail.ok, false, 'trailing-space witness must be rejected');
  // a path with an interior space is legitimate and must still pass
  const inner = validateMechanismPatternRegistry(
    validRegistry([validVerb({ witnesses: ['my dir/foo.mjs:5', 'foo.mjs:6'] })]),
  );
  assert.equal(inner.ok, true, `interior-space path must pass: ${inner.errors.join(', ')}`);
});

test('non-string witness entries (number/object) are rejected, no throw', () => {
  const result = validateMechanismPatternRegistry(
    validRegistry([validVerb({ witnesses: [123, { path: 'x', line: 1 }] })]),
  );
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => e.includes('malformed witness')));
});

// --- closed-set immutability (Finding #9): an importer must not be able to mutate
// the shared verb membership and poison validation. Object.freeze(new Set) did NOT
// block .add(); a frozen array + per-call rebuilt Set does. ---

test('the exported verb surface exposes no mutator (add/delete/clear absent)', () => {
  assert.equal(typeof MECHANISM_PATTERN_VERBS.add, 'undefined', 'add must not be exposed');
  assert.equal(typeof MECHANISM_PATTERN_VERBS.delete, 'undefined', 'delete must not be exposed');
  assert.equal(typeof MECHANISM_PATTERN_VERBS.clear, 'undefined', 'clear must not be exposed');
});

test('mutating the exported verb surface cannot poison closed-set validation (Finding #9)', () => {
  const POISON = 'attacker-self-minted-verb';

  // An importer attempts to widen the supposedly-closed set before validation.
  // On the old Object.freeze(new Set) export, .add() silently succeeded and the
  // verb below then passed the closed-set gate. The surface must now refuse it.
  let mutationRejected = false;
  try {
    // eslint-disable-next-line no-restricted-syntax
    MECHANISM_PATTERN_VERBS.add?.(POISON);
  } catch {
    mutationRejected = true;
  }
  // Either add is absent (optional-chain no-op) or it throws — either way membership
  // must be unchanged.
  assert.ok(
    typeof MECHANISM_PATTERN_VERBS.add === 'undefined' || mutationRejected,
    'a mutator either must not exist or must throw',
  );
  assert.equal(MECHANISM_PATTERN_VERBS.has(POISON), false, 'membership must not have grown');
  assert.equal(MECHANISM_PATTERN_VERBS.size, 5, 'size must stay exactly 5');

  // The load-bearing assertion: even after the poison attempt, a registry carrying
  // the self-minted verb must be rejected by the closed-set gate.
  const result = validateMechanismPatternRegistry(
    validRegistry([validVerb({ verb: POISON })]),
  );
  assert.equal(result.ok, false, 'self-minted verb must be rejected after poison attempt');
  assert.ok(
    result.errors.some((e) => e.includes(POISON) && e.includes('closed v0 set')),
    `expected closed-set rejection, got: ${result.errors.join(', ')}`,
  );
});
