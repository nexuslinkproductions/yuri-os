#!/usr/bin/env node
// Case-independent unit proof for the persona-behavioral scorer engine.
//
// SCOPE: exercises the generic scorer surface (scoreCase / validateCase and the
// check-type engine) with SYNTHETIC inputs constructed inline. It NEVER loads
// cases.jsonl, the runner, the experiment contract, or the 40-case --selftest.
// The engine is proven here on its own terms, not against real evaluation data.
//
// Doctrine anchor (_SYSTEM/yuri-origin.md -> Loop Discipline): the scorer is a
// frozen, case-independent artifact. If it can be validated without the cases it
// scores, the cases cannot silently bend the scorer. This suite is that proof.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scoreCase, validateCase, DIMENSIONS, RUBRIC_VERSION } from './rubric.mjs';

// --- synthetic helpers (no real cases, ever) -------------------------------

// Minimal shape scoreCase reads: kase.gt.checks + kase.dimension.
const scoreWith = (checks, response) =>
  scoreCase({ dimension: DIMENSIONS[0], gt: { checks } }, response);

// Full shape validateCase reads: id, dimension, prompt, gt.status, gt.checks.
const mkCase = (checks, over = {}) => ({
  id: 'synthetic-1',
  dimension: DIMENSIONS[0],
  prompt: 'synthetic prompt',
  gt: { status: 'proposed', checks },
  ...over,
});

const singleCheckPassed = (checks, response) => {
  const r = scoreWith(checks, response);
  return r.pass && r.checksPassed === r.checksTotal && r.checksTotal === checks.length;
};

// ===========================================================================
// must_include
// ===========================================================================
test('must_include: passes when every substring is present', () => {
  assert.equal(
    singleCheckPassed([{ type: 'must_include', items: ['alpha', 'bravo'] }], 'ALPHA then bravo'),
    true,
  );
});
test('must_include: fails when a substring is missing', () => {
  const r = scoreWith([{ type: 'must_include', items: ['alpha', 'zulu'] }], 'alpha only');
  assert.equal(r.pass, false);
  assert.equal(r.results[0].pass, false);
});

// ===========================================================================
// must_include_any
// ===========================================================================
test('must_include_any: passes when at least one substring is present', () => {
  assert.equal(
    singleCheckPassed([{ type: 'must_include_any', items: ['zulu', 'bravo'] }], 'has bravo'),
    true,
  );
});
test('must_include_any: fails when none are present', () => {
  const r = scoreWith([{ type: 'must_include_any', items: ['zulu', 'yankee'] }], 'nothing matching');
  assert.equal(r.pass, false);
});

// ===========================================================================
// must_not
// ===========================================================================
test('must_not: passes when no forbidden substring is present', () => {
  assert.equal(
    singleCheckPassed([{ type: 'must_not', items: ['great question', 'certainly!'] }], 'clean prose'),
    true,
  );
});
test('must_not: fails when a forbidden substring is present', () => {
  const r = scoreWith([{ type: 'must_not', items: ['great question'] }], 'Great question, here goes');
  assert.equal(r.pass, false);
});

// ===========================================================================
// regex_must
// ===========================================================================
test('regex_must: passes when every regex matches', () => {
  assert.equal(
    singleCheckPassed([{ type: 'regex_must', items: ['\\d{3}', 'ID-\\w+'] }], 'code 123 ref ID-abc'),
    true,
  );
});
test('regex_must: fails when a regex does not match', () => {
  const r = scoreWith([{ type: 'regex_must', items: ['\\d{3}'] }], 'no digits here');
  assert.equal(r.pass, false);
});

// ===========================================================================
// regex_must_not
// ===========================================================================
test('regex_must_not: passes (clean) when no forbidden regex matches', () => {
  assert.equal(
    singleCheckPassed([{ type: 'regex_must_not', items: ['\\bslop\\b'] }], 'tight signal only'),
    true,
  );
});
test('regex_must_not: fails when a forbidden regex matches (inverted sense)', () => {
  const r = scoreWith([{ type: 'regex_must_not', items: ['\\bslop\\b'] }], 'this is slop text');
  assert.equal(r.pass, false);
});

// ===========================================================================
// max_words  (boundary: one-under, exactly-at, one-over)
// ===========================================================================
test('max_words: passes one-under and exactly-at the boundary', () => {
  assert.equal(singleCheckPassed([{ type: 'max_words', value: 3 }], 'one two'), true, 'one-under');
  assert.equal(singleCheckPassed([{ type: 'max_words', value: 3 }], 'one two three'), true, 'exactly-at');
});
test('max_words: fails one-over the boundary', () => {
  const r = scoreWith([{ type: 'max_words', value: 3 }], 'one two three four');
  assert.equal(r.pass, false);
});

// ===========================================================================
// min_words  (boundary: one-over, exactly-at, one-under)
// ===========================================================================
test('min_words: passes exactly-at and one-over the boundary', () => {
  assert.equal(singleCheckPassed([{ type: 'min_words', value: 3 }], 'one two three'), true, 'exactly-at');
  assert.equal(singleCheckPassed([{ type: 'min_words', value: 3 }], 'one two three four'), true, 'one-over');
});
test('min_words: fails one-under the boundary', () => {
  const r = scoreWith([{ type: 'min_words', value: 3 }], 'one two');
  assert.equal(r.pass, false);
});

// ===========================================================================
// max_pattern_count  (at threshold passes, over threshold fails)
// ===========================================================================
test('max_pattern_count: passes at the threshold', () => {
  assert.equal(
    singleCheckPassed([{ type: 'max_pattern_count', pattern: 'foo', max: 2 }], 'foo and foo'),
    true,
  );
});
test('max_pattern_count: fails over the threshold', () => {
  const r = scoreWith([{ type: 'max_pattern_count', pattern: 'foo', max: 2 }], 'foo foo foo');
  assert.equal(r.pass, false);
});

// ===========================================================================
// Unknown check-type rejection
// ===========================================================================
test('validateCase: rejects an unknown check type', () => {
  const errs = validateCase(mkCase([{ type: 'made_up_type', items: ['x'] }]));
  assert.ok(errs.some((e) => /unknown check type/i.test(e)), `expected unknown-type error, got: ${JSON.stringify(errs)}`);
});
test('scoreCase: an unknown check type fails the check (not vacuously passing)', () => {
  const r = scoreWith([{ type: 'made_up_type', items: ['x'] }], 'anything');
  assert.equal(r.pass, false);
  assert.equal(r.results[0].pass, false);
  assert.match(r.results[0].detail, /unknown check type/i);
});

// ===========================================================================
// Empty-check invalidity (no operative payload -> invalid, not vacuous pass)
// Enforced at the validateCase layer, which is the case-admission gate.
// ===========================================================================
test('validateCase: rejects an empty items array for a string check', () => {
  const errs = validateCase(mkCase([{ type: 'must_include', items: [] }]));
  assert.ok(errs.some((e) => /non-empty items/i.test(e)), `expected empty-items error, got: ${JSON.stringify(errs)}`);
});
test('validateCase: rejects a max_pattern_count check missing its pattern payload', () => {
  const errs = validateCase(mkCase([{ type: 'max_pattern_count', max: 2 }]));
  assert.ok(errs.some((e) => /max_pattern_count needs pattern/i.test(e)), `expected missing-pattern error, got: ${JSON.stringify(errs)}`);
});
test('validateCase: rejects a word-bound check missing its numeric value', () => {
  const errs = validateCase(mkCase([{ type: 'max_words' }]));
  assert.ok(errs.some((e) => /max_words needs numeric value/i.test(e)), `expected missing-value error, got: ${JSON.stringify(errs)}`);
});

// ===========================================================================
// Sanity: a well-formed synthetic case validates clean, and version is exported
// ===========================================================================
test('validateCase: a well-formed synthetic case yields no errors', () => {
  const errs = validateCase(mkCase([{ type: 'must_include', items: ['ok'] }]));
  assert.deepEqual(errs, []);
});
test('engine exports a rubric version string', () => {
  assert.equal(typeof RUBRIC_VERSION, 'string');
  assert.ok(RUBRIC_VERSION.length > 0);
});
