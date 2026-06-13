#!/usr/bin/env node
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  MECHANISM_PATTERN_VERBS,
  MIN_WITNESSES,
  validateMechanismPatternRegistry,
  validateRegistryFile,
  loadVerbRecords,
  classifyMechanism,
  MECHANISM_CONFIDENCE,
  MECHANISM_PROVENANCE,
  UNCLASSIFIED_MECHANISM,
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

test('witness line numbers are 1-based, no zero-padding (fail closed)', () => {
  const witnessError = (w) => !validateMechanismPatternRegistry(validRegistry([validVerb({ witnesses: [w, '_SYSTEM/Scripts/math/math-health.mjs:16'] })])).ok;
  assert.equal(witnessError('_SYSTEM/Scripts/math/math-health.mjs:1'), false, ':1 accepted');
  assert.equal(witnessError('_SYSTEM/Scripts/math/math-health.mjs:0'), true, ':0 rejected');
  assert.equal(witnessError('_SYSTEM/Scripts/math/math-health.mjs:01'), true, ':01 rejected');
});

// ================================================================================================
// classifyMechanism — axis-2 mechanism-signature classifier (folded into the registry module).
// ================================================================================================

// Synthetic verb set with a deliberate AMBIGUOUS file (two verbs witness shared.mjs) so the
// multi-verb-degeneracy path is covered without depending on the live registry's exact shape.
function synthVerbs() {
  return [
    { verb: 'replace-hand-tuned-constant', witnesses: ['_SYSTEM/Scripts/math/energy.mjs:51', '_SYSTEM/Scripts/math/energy.mjs:53'],
      definition: 'd', rippleClass: 'HIGH', guardRequirement: 'g', cascadeFamily: 'energy-weights' },
    { verb: 'gate-on-identity-not-aggregate', witnesses: ['_SYSTEM/Scripts/shared.mjs:10', '_SYSTEM/Scripts/track.mjs:5'],
      definition: 'd', rippleClass: 'MED', guardRequirement: 'g', cascadeFamily: 'lane-identity' },
    { verb: 'shared-prerequisite-unlock', witnesses: ['_SYSTEM/Scripts/shared.mjs:42', '_SYSTEM/Scripts/track.mjs:8'],
      definition: 'd', rippleClass: 'LOW', guardRequirement: 'g', cascadeFamily: 'outcome-log' },
  ];
}

test('classify HIGH: sibling file IS the unambiguous witness file of exactly one verb', () => {
  const r = classifyMechanism({ siblingFile: '_SYSTEM/Scripts/math/energy.mjs', witnessNames: ['x'], verbs: synthVerbs() });
  assert.equal(r.confidence, MECHANISM_CONFIDENCE.HIGH);
  assert.equal(r.provenance, MECHANISM_PROVENANCE.STRUCTURAL_ANCHOR);
  assert.equal(r.verb, 'replace-hand-tuned-constant');
  assert.equal(r.antiWitness, false);
  assert.equal(r.anchorFile, '_SYSTEM/Scripts/math/energy.mjs');
});

test('classify MED ambiguous-anchor: a file witnessing TWO verbs never lexical-tiebreaks to HIGH', () => {
  // shared.mjs is a witness for BOTH gate-on-identity AND shared-prerequisite-unlock (mimo's killer case).
  const r = classifyMechanism({ siblingFile: '_SYSTEM/Scripts/shared.mjs', witnessNames: ['shared'], verbs: synthVerbs() });
  assert.equal(r.confidence, MECHANISM_CONFIDENCE.MED, 'multi-verb site must NOT be promoted to HIGH');
  assert.equal(r.provenance, MECHANISM_PROVENANCE.AMBIGUOUS_ANCHOR);
  assert.equal(r.antiWitness, false);
  assert.equal(r.candidates.length, 2, 'both candidate mechanisms are surfaced, not one lexical winner');
  assert.ok(r.whyMightNotTransfer.includes('undisambiguated'));
});

test('classify MED import-hop: sibling imports a witness file but is not one', () => {
  const r = classifyMechanism({
    siblingFile: '_SYSTEM/Scripts/consumer.mjs',
    witnessNames: ['totallyUnrelated'],
    siblingImports: ['_SYSTEM/Scripts/math/energy.mjs'],
    verbs: synthVerbs(),
  });
  assert.equal(r.confidence, MECHANISM_CONFIDENCE.MED);
  assert.equal(r.provenance, MECHANISM_PROVENANCE.IMPORT_HOP);
  assert.equal(r.verb, 'replace-hand-tuned-constant');
  assert.equal(r.antiWitness, false);
});

test('classify LOW antiWitness: THE theater case — sharedFn is a vocabulary look-alike, not a sibling', () => {
  // The exact live bug: witness symbol `sharedFn` lexically hits the `shared` token of
  // shared-prerequisite-unlock. With no structural bond it MUST be flagged, never scored structural.
  const r = classifyMechanism({ siblingFile: '_SYSTEM/Scripts/unrelated.mjs', witnessNames: ['sharedFn'], verbs: synthVerbs() });
  assert.equal(r.confidence, MECHANISM_CONFIDENCE.LOW);
  assert.equal(r.provenance, MECHANISM_PROVENANCE.LEXICAL_ONLY);
  assert.equal(r.antiWitness, true, 'lexical-pass/structural-fail MUST raise the anti-witness flag');
  assert.ok(r.whyMightNotTransfer.includes('look-alike'));
});

test('classify NONE: no structural, import, or lexical signal -> unclassified, no claim', () => {
  const r = classifyMechanism({ siblingFile: '_SYSTEM/Scripts/nowhere.mjs', witnessNames: ['zzz'], verbs: synthVerbs() });
  assert.equal(r.verb, UNCLASSIFIED_MECHANISM);
  assert.equal(r.confidence, MECHANISM_CONFIDENCE.NONE);
  assert.equal(r.antiWitness, false, 'no claim = no theater');
});

test('classify fail-open: empty/garbage verb set returns unclassified, never throws', () => {
  assert.equal(classifyMechanism({ siblingFile: 'x.mjs', witnessNames: ['y'], verbs: [] }).verb, UNCLASSIFIED_MECHANISM);
  assert.equal(classifyMechanism({}).verb, UNCLASSIFIED_MECHANISM);
  assert.equal(classifyMechanism({ siblingFile: 'x', verbs: null }).verb, UNCLASSIFIED_MECHANISM);
});

test('classify against the LIVE registry: real witness file anchors HIGH, look-alike flags antiWitness', () => {
  const { ok, verbs } = loadVerbRecords();
  assert.equal(ok, true);
  // yuri-energy.mjs is a witness for exactly replace-hand-tuned-constant in the live registry.
  const hi = classifyMechanism({ siblingFile: '_SYSTEM/Scripts/math/yuri-energy.mjs', witnessNames: ['halfLife'], verbs });
  assert.equal(hi.confidence, MECHANISM_CONFIDENCE.HIGH);
  assert.equal(hi.verb, 'replace-hand-tuned-constant');
  // claim-cortex.mjs witnesses TWO live verbs -> ambiguous MED, never a single lexical HIGH.
  const amb = classifyMechanism({ siblingFile: '_SYSTEM/Scripts/claim-cortex.mjs', witnessNames: ['x'], verbs });
  assert.equal(amb.confidence, MECHANISM_CONFIDENCE.MED);
  assert.ok(amb.candidates.length >= 2);
});

// ================================================================================================
// classifyWitnessAnchors — derived witness-provenance map (DEF/COMMENT/JSDOC/STRUCTURAL/MISSING).
// ================================================================================================
import { classifyWitnessAnchors, WITNESS_ANCHOR } from './mechanism-pattern-registry.mjs';

function fakeFile(lines) { return lines.join('\n'); }

test('witness anchors: DEF lines yield a symbol; comment/jsdoc/structural do not; past-EOF is MISSING', () => {
  const files = {
    'f/defs.mjs': fakeFile([
      'export function runMathHealth() {', // line 1 DEF
      '  const halfLife = 0.5;', //          line 2 DEF (const)
      'class BeliefVector {}', //            line 3 DEF (class)
    ]),
    'f/notdef.mjs': fakeFile([
      '// a line comment', //   line 1 COMMENT
      ' * a jsdoc body line', //line 2 JSDOC
      '});', //                 line 3 STRUCTURAL
    ]),
  };
  const readFile = (rel) => {
    if (files[rel] === undefined) throw new Error(`no such file ${rel}`);
    return files[rel];
  };
  const verbs = [{
    verb: 'compose-readonly-analyzer',
    witnesses: ['f/defs.mjs:1', 'f/defs.mjs:2', 'f/defs.mjs:3', 'f/notdef.mjs:1', 'f/notdef.mjs:2', 'f/notdef.mjs:3', 'f/defs.mjs:99'],
  }];
  const map = classifyWitnessAnchors(verbs, { readFile });
  const by = (w) => map.find((m) => m.witness === w);
  assert.equal(by('f/defs.mjs:1').anchorType, WITNESS_ANCHOR.DEF);
  assert.equal(by('f/defs.mjs:1').symbol, 'runMathHealth');
  assert.equal(by('f/defs.mjs:2').symbol, 'halfLife');
  assert.equal(by('f/defs.mjs:3').symbol, 'BeliefVector');
  assert.equal(by('f/notdef.mjs:1').anchorType, WITNESS_ANCHOR.COMMENT);
  assert.equal(by('f/notdef.mjs:2').anchorType, WITNESS_ANCHOR.JSDOC);
  assert.equal(by('f/notdef.mjs:3').anchorType, WITNESS_ANCHOR.STRUCTURAL);
  assert.equal(by('f/defs.mjs:99').anchorType, WITNESS_ANCHOR.MISSING, 'line past EOF is a drift signal');
});

test('witness anchors: an unreadable file (retired witness) is MISSING, never throws', () => {
  const verbs = [{ verb: 'gate-on-identity-not-aggregate', witnesses: ['gone/retired.mjs:365', 'gone/retired.mjs:1'] }];
  const map = classifyWitnessAnchors(verbs, { readFile: () => { throw new Error('ENOENT'); } });
  assert.equal(map.length, 2);
  assert.ok(map.every((m) => m.anchorType === WITNESS_ANCHOR.MISSING));
});

test('witness anchors: the LIVE registry surfaces the retired shintai-dispatch witness as MISSING (drift)', () => {
  const { verbs } = loadVerbRecords();
  const map = classifyWitnessAnchors(verbs);
  const dead = map.find((m) => m.witness.includes('shintai-dispatch.mjs'));
  assert.ok(dead, 'the shintai-dispatch witness is present in the registry');
  assert.equal(dead.anchorType, WITNESS_ANCHOR.MISSING, 'retired file -> MISSING drift signal');
});

test('witness anchors: bad input fails open to []', () => {
  assert.deepEqual(classifyWitnessAnchors(null), []);
  assert.deepEqual(classifyWitnessAnchors(undefined), []);
  assert.deepEqual(classifyWitnessAnchors([{ verb: 'x' }]), []); // no witnesses array
});

// --- red-team fixes (C line-split, D DEF coverage) — each mutation-verified to fail on broken code ---

test('RT-D F6: anonymous default-export function is DEF (symbol null), not STRUCTURAL', () => {
  const files = { 'f/a.mjs': ['export default function () {', 'export default async function() {'].join('\n') };
  const map = classifyWitnessAnchors([{ verb: 'compose-readonly-analyzer', witnesses: ['f/a.mjs:1', 'f/a.mjs:2'] }], { readFile: (r) => files[r] });
  assert.equal(map[0].anchorType, WITNESS_ANCHOR.DEF);
  assert.equal(map[0].symbol, null);
  assert.equal(map[1].anchorType, WITNESS_ANCHOR.DEF);
});

test('RT-D F5: destructuring const/let export is DEF (symbol null), not STRUCTURAL', () => {
  const files = { 'f/b.mjs': ['export const { scoreHit, gateHit } = xref;', 'const [first] = list;'].join('\n') };
  const map = classifyWitnessAnchors([{ verb: 'compose-readonly-analyzer', witnesses: ['f/b.mjs:1', 'f/b.mjs:2'] }], { readFile: (r) => files[r] });
  assert.equal(map[0].anchorType, WITNESS_ANCHOR.DEF);
  assert.equal(map[1].anchorType, WITNESS_ANCHOR.DEF);
});

test('RT-C: CRLF endings + a witness one line past real EOF -> MISSING (not a phantom STRUCTURAL)', () => {
  // 2 real CRLF lines + trailing CRLF; naive split("\n") would make a phantom 3rd "" line that
  // wrongly passes the range check, and leave a stray \r in the captured symbol.
  const files = { 'f/c.mjs': 'export function runMathHealth() {\r\nconst x = 1;\r\n' };
  const map = classifyWitnessAnchors([{ verb: 'compose-readonly-analyzer', witnesses: ['f/c.mjs:1', 'f/c.mjs:2', 'f/c.mjs:3'] }], { readFile: (r) => files[r] });
  assert.equal(map[0].symbol, 'runMathHealth', 'symbol must not carry a trailing \\r');
  assert.equal(map[1].anchorType, WITNESS_ANCHOR.DEF);
  assert.equal(map[2].anchorType, WITNESS_ANCHOR.MISSING, 'past-EOF line is drift, not STRUCTURAL');
});

// ================================================================================================
// FORK 1 — symbol-anchor HIGH tier + buildVerbSymbolIndex guards. (mutation-verified below)
// ================================================================================================
import { buildVerbSymbolIndex } from './mechanism-pattern-registry.mjs';

test('buildVerbSymbolIndex: live registry yields ONLY the 3 verbs with discriminating DEF symbols', () => {
  const idx = buildVerbSymbolIndex(loadVerbRecords().verbs);
  assert.deepEqual(idx.get('gate-on-identity-not-aggregate'), ['computeAdvisorStats']);
  assert.deepEqual(idx.get('compose-readonly-analyzer').slice().sort(), ['inspectArchive', 'runMathHealth']);
  assert.equal(idx.has('replace-hand-tuned-constant'), false, 'a zero-DEF verb gets no symbol coverage');
  assert.equal(idx.has('read-lower-bound-not-point'), false);
});

test('buildVerbSymbolIndex guard #1: a generic stoplist symbol (run/init) is excluded', () => {
  const files = { 'f/g.mjs': ['export function run() {', 'function init() {'].join('\n') };
  const idx = buildVerbSymbolIndex([{ verb: 'compose-readonly-analyzer', witnesses: ['f/g.mjs:1', 'f/g.mjs:2'] }], { readFile: (r) => files[r] });
  assert.equal(idx.has('compose-readonly-analyzer'), false, 'run/init are generic -> no discriminating symbol');
});

test('buildVerbSymbolIndex guard #2: a symbol shared across 2 verbs is dropped (non-discriminating)', () => {
  const files = { 'f/a.mjs': 'export function sharedSym() {', 'f/b.mjs': 'export function sharedSym() {' };
  const idx = buildVerbSymbolIndex([
    { verb: 'gate-on-identity-not-aggregate', witnesses: ['f/a.mjs:1', 'f/a.mjs:1'] },
    { verb: 'compose-readonly-analyzer', witnesses: ['f/b.mjs:1', 'f/b.mjs:1'] },
  ], { readFile: (r) => files[r] });
  assert.equal(idx.size, 0, 'a cross-verb collision symbol is discarded everywhere');
});

test('classifyMechanism symbol-anchor: sharing a verb def symbol -> HIGH symbol-anchor', () => {
  const verbs = loadVerbRecords().verbs;
  const r = classifyMechanism({ siblingFile: '_SYSTEM/Scripts/other.mjs', witnessNames: ['computeAdvisorStats'], verbs, symbolIndex: buildVerbSymbolIndex(verbs) });
  assert.equal(r.confidence, MECHANISM_CONFIDENCE.HIGH);
  assert.equal(r.provenance, MECHANISM_PROVENANCE.SYMBOL_ANCHOR);
  assert.equal(r.verb, 'gate-on-identity-not-aggregate');
});

test('classifyMechanism precedence: a discriminating symbol-anchor BEATS file-anchor', () => {
  const verbs = loadVerbRecords().verbs;
  // sibling IS math-health.mjs (a compose-readonly-analyzer witness file -> file-anchor) but shares
  // gate-on-identity's actual symbol -> the symbol (the real mechanism identifier) must win.
  const r = classifyMechanism({ siblingFile: '_SYSTEM/Scripts/math/math-health.mjs', witnessNames: ['computeAdvisorStats'], verbs, symbolIndex: buildVerbSymbolIndex(verbs) });
  assert.equal(r.provenance, MECHANISM_PROVENANCE.SYMBOL_ANCHOR, 'symbol must beat file-anchor');
  assert.equal(r.verb, 'gate-on-identity-not-aggregate');
});

test('classifyMechanism symbol-anchor fail-open: with NO symbolIndex, file-anchor still applies', () => {
  const verbs = loadVerbRecords().verbs;
  const r = classifyMechanism({ siblingFile: '_SYSTEM/Scripts/math/math-health.mjs', witnessNames: ['computeAdvisorStats'], verbs });
  assert.equal(r.provenance, MECHANISM_PROVENANCE.STRUCTURAL_ANCHOR, 'no index -> today behavior (file-anchor)');
  assert.equal(r.verb, 'compose-readonly-analyzer');
});

test('classifyMechanism symbol-anchor: a generic/non-indexed symbol does NOT fire it', () => {
  const verbs = loadVerbRecords().verbs;
  const r = classifyMechanism({ siblingFile: '_SYSTEM/Scripts/other.mjs', witnessNames: ['run', 'helper'], verbs, symbolIndex: buildVerbSymbolIndex(verbs) });
  assert.notEqual(r.provenance, MECHANISM_PROVENANCE.SYMBOL_ANCHOR);
});

test('RT-#4: stoplist rejects morphological generic variants (_init, setup2, run_), keeps specific', () => {
  const files = { 'f/v.mjs': ['export function _init() {', 'function setup2() {', 'export function run_() {', 'export function realMechanismX() {'].join('\n') };
  const idx = buildVerbSymbolIndex([{ verb: 'compose-readonly-analyzer', witnesses: ['f/v.mjs:1', 'f/v.mjs:2', 'f/v.mjs:3', 'f/v.mjs:4'] }], { readFile: (r) => files[r] });
  assert.deepEqual(idx.get('compose-readonly-analyzer'), ['realMechanismX'], '_init/setup2/run_ strip to stoplisted roots; only the specific symbol survives');
});

// ================================================================================================
// FORK 2 — witness-staleness gate. Structural INVARIANTS, not a golden snapshot (mimo: a golden's
// --update reflex normalizes drift until it mirrors the world instead of speccing it). Self-healing:
// fails ONLY when a witness actually drifts (file/line vanishes) or the symbol index collapses — not
// when the world changes harmlessly. Only the quarantine allowlist ages. Test-only, no schema change.
// ================================================================================================
const QUARANTINED_MISSING = new Map([
  // witness-suffix -> WHY. A quarantined witness is EXPECTED to be MISSING (a known, owner-gated stale
  // witness). MISSING is never an accepted golden state — it must be consciously listed here.
  ['shintai-dispatch.mjs:365', 'REG-STALE-WITNESS: file retired (commit fad88bf6); owner-gated re-anchor pending'],
]);
const EXPECTED_WITNESS_COUNT = 13; // inventory tripwire — a governed registry-DATA change must update this

function liveAnchors() { return classifyWitnessAnchors(loadVerbRecords().verbs); }
// Match at a path boundary so a key like `shintai-dispatch.mjs:365` cannot over-match a different
// witness such as `old-shintai-dispatch.mjs:365` (red-team: endsWith over-match).
function isQuarantined(witness) {
  return [...QUARANTINED_MISSING.keys()].some((k) => witness === k || witness.endsWith(`/${k}`));
}

test('staleness gate 1: every live MISSING witness is quarantined (no NEW silent drift)', () => {
  const newMissing = liveAnchors().filter((a) => a.anchorType === WITNESS_ANCHOR.MISSING && !isQuarantined(a.witness));
  assert.deepEqual(newMissing.map((a) => a.witness), [],
    'a NEW missing witness drifted — re-anchor it in the registry-DATA (owner) or add to QUARANTINED_MISSING with a WHY');
});

test('staleness gate 2: every quarantined witness is still MISSING (no dead quarantine entries)', () => {
  const anchors = liveAnchors();
  for (const [key, why] of QUARANTINED_MISSING) {
    const hit = anchors.find((a) => a.witness.endsWith(key));
    assert.ok(hit, `quarantine entry ${key} matches no witness — remove it (${why})`);
    assert.equal(hit.anchorType, WITNESS_ANCHOR.MISSING,
      `quarantined ${key} now RESOLVES (${hit.anchorType}) — remove it from QUARANTINED_MISSING (${why})`);
  }
});

test('staleness gate 3: witness inventory count unchanged (governed registry-DATA tripwire)', () => {
  assert.equal(liveAnchors().length, EXPECTED_WITNESS_COUNT,
    'registry witness inventory changed — review the registry-DATA change and update EXPECTED_WITNESS_COUNT');
});

test('staleness gate 4: the symbol index has not collapsed (red-team #5 as a standing check)', () => {
  assert.ok(buildVerbSymbolIndex(loadVerbRecords().verbs).size >= 1,
    'verb symbol index EMPTY despite verb records — every DEF witness unreadable/moved; symbol-anchor disabled');
});

const EXPECTED_DEF_COUNT = 4; // DEF-witness floor — catches a DEF drifting to COMMENT/STRUCTURAL
test('staleness gate 5: DEF-witness count unchanged (catches a DEF symbol silently lost to a line shift)', () => {
  const defs = liveAnchors().filter((a) => a.anchorType === WITNESS_ANCHOR.DEF);
  assert.equal(defs.length, EXPECTED_DEF_COUNT,
    'DEF-witness count changed — a witness drifted onto/off a definition line; the symbol-anchor tier coverage moved. Re-anchor the registry-DATA (owner) or update EXPECTED_DEF_COUNT');
});

// Per-VERB symbol coverage (not per-symbol): which verbs have ANY discriminating def symbol. Pins
// coverage at the VERB granularity, so a symbol RENAME self-heals (index rebuilds from live files)
// but a verb losing ALL its symbols — or a 1-for-1 DEF swap between verbs (which gate 5's total count
// misses) — is caught. Ages only on a genuine governed coverage change (like the quarantine list).
const EXPECTED_SYMBOL_VERBS = ['compose-readonly-analyzer', 'gate-on-identity-not-aggregate', 'shared-prerequisite-unlock'];
test('staleness gate 6: the SET of symbol-covered verbs is unchanged (per-verb coverage, rename-safe)', () => {
  const covered = [...buildVerbSymbolIndex(loadVerbRecords().verbs).keys()].sort();
  assert.deepEqual(covered, EXPECTED_SYMBOL_VERBS.slice().sort(),
    'the set of verbs with discriminating def symbols changed — a verb gained/lost symbol-anchor coverage. Re-anchor the registry-DATA (owner) or update EXPECTED_SYMBOL_VERBS');
});

test('staleness gate 7: quarantine match is path-boundary safe (no endsWith over-match)', () => {
  assert.equal(isQuarantined('_SYSTEM/Scripts/shintai-dispatch.mjs:365'), true, 'the real witness path matches');
  assert.equal(isQuarantined('shintai-dispatch.mjs:365'), true, 'the exact key matches');
  assert.equal(isQuarantined('_SYSTEM/Scripts/old-shintai-dispatch.mjs:365'), false, 'a decoy that merely ends with the key must NOT over-match');
});
