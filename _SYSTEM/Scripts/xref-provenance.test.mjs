// xref-provenance.test.mjs — invariants for the shared cross-ref confidence + provenance model.
// Run: node --test _SYSTEM/Scripts/xref-provenance.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
  scoreHit,
  gateHit,
  validateHit,
  serializeRevalidate,
  XREF_PROVENANCE_KNOBS,
  EVIDENCE_KIND,
} from './xref-provenance.mjs';

const REPO_ROOT = path.resolve(import.meta.dirname, '../..');
const SCHEMA_PATH = path.join(REPO_ROOT, '_SYSTEM/config/schemas/xref-hit.schema.json');

// ----------------------------------------------------------------------------------------
// SPEC INVARIANT 1 — a gitnexus structural hit with gitnexusStale=true scores BELOW the same
// hit with stale=false (the staleness penalty applies).
// ----------------------------------------------------------------------------------------
test('SPEC: gitnexusStale=true scores below gitnexusStale=false (staleness penalty applies)', () => {
  const fresh = scoreHit({ surface: EVIDENCE_KIND.STRUCTURAL, structuralMatch: true, lexicalScore: 1.0, gitnexusStale: false });
  const stale = scoreHit({ surface: EVIDENCE_KIND.STRUCTURAL, structuralMatch: true, lexicalScore: 1.0, gitnexusStale: true });
  assert.ok(fresh.confidence > stale.confidence, `expected ${fresh.confidence} > ${stale.confidence}`);
  assert.equal(stale.stale, true);
  assert.equal(fresh.stale, false);
  // Penalty is exactly the knob multiplier.
  assert.ok(Math.abs(stale.confidence - fresh.confidence * XREF_PROVENANCE_KNOBS.stalenessPenalty) < 1e-9);
});

test('SPEC: a fresh structural hit lands in the HIGH band 0.8..1.0', () => {
  const fresh = scoreHit({ surface: EVIDENCE_KIND.STRUCTURAL, structuralMatch: true, lexicalScore: 1.0 });
  assert.ok(fresh.confidence >= 0.8 && fresh.confidence <= 1.0, `confidence ${fresh.confidence} out of HIGH band`);
  assert.equal(fresh.evidenceKind, EVIDENCE_KIND.STRUCTURAL);
});

// ----------------------------------------------------------------------------------------
// SPEC INVARIANT 2 — a writes-edge neighbor returns null (never surfaced as a sibling).
// ----------------------------------------------------------------------------------------
test('SPEC: graph-neighbor on a writes edge returns null (never a sibling)', () => {
  const r = scoreHit({ surface: EVIDENCE_KIND.NEIGHBOR, edgeKind: 'writes', lexicalScore: 1.0 });
  assert.equal(r, null);
});

test('SPEC: graph-neighbor on calls|reads lands in MED band 0.55..0.75', () => {
  for (const edgeKind of ['calls', 'reads']) {
    const r = scoreHit({ surface: EVIDENCE_KIND.NEIGHBOR, edgeKind, lexicalScore: 1.0 });
    assert.ok(r, `expected a hit for ${edgeKind}`);
    assert.ok(r.confidence >= 0.55 && r.confidence <= 0.75, `${edgeKind} confidence ${r.confidence} out of MED band`);
    assert.equal(r.evidenceKind, EVIDENCE_KIND.NEIGHBOR);
  }
});

// ----------------------------------------------------------------------------------------
// SPEC INVARIANT 3 — a lexical-only hit with no mismatch -> gateHit -> surfaced:false.
// ----------------------------------------------------------------------------------------
test('SPEC: lexical-only is below the floor and flags requireMismatch', () => {
  const r = scoreHit({ surface: EVIDENCE_KIND.LEXICAL, lexicalScore: 1.0 });
  assert.ok(r.confidence < XREF_PROVENANCE_KNOBS.confidenceFloor, `lexical confidence ${r.confidence} must be < floor`);
  assert.equal(r.requireMismatch, true);
  assert.equal(r.evidenceKind, EVIDENCE_KIND.LEXICAL);
});

test('SPEC: gateHit suppresses a low-confidence hit with no mismatch (surfaced:false, sublog:true)', () => {
  const scored = scoreHit({ surface: EVIDENCE_KIND.LEXICAL, lexicalScore: 0.9 });
  const hit = { path: 'a.mjs', surface: 'lexical', snippet: 'x', score: scored.confidence,
    provenance: { evidenceKind: scored.evidenceKind, confidence: scored.confidence } };
  const g = gateHit(hit);
  assert.equal(g.surfaced, false);
  assert.equal(g.sublog, true);
});

test('gateHit SURFACES a low-confidence hit once it carries a named mismatch', () => {
  const scored = scoreHit({ surface: EVIDENCE_KIND.LEXICAL, lexicalScore: 0.9 });
  const hit = { path: 'a.mjs', surface: 'lexical', snippet: 'x', score: scored.confidence,
    provenance: { evidenceKind: scored.evidenceKind, confidence: scored.confidence, mismatch: 'both ring-buffer a sliding window but XREF caps by count, target by bytes' } };
  const g = gateHit(hit);
  assert.equal(g.surfaced, true);
});

test('gateHit SURFACES a high-confidence structural hit with no mismatch', () => {
  const scored = scoreHit({ surface: EVIDENCE_KIND.STRUCTURAL, structuralMatch: true, lexicalScore: 1.0 });
  const hit = { path: 'a.mjs', surface: 'fn', snippet: 'x', score: scored.confidence,
    provenance: { evidenceKind: scored.evidenceKind, confidence: scored.confidence, stale: scored.stale } };
  assert.equal(gateHit(hit).surfaced, true);
});

// ----------------------------------------------------------------------------------------
// SPEC INVARIANT 4 — the closed schema REJECTS an unknown field.
// ----------------------------------------------------------------------------------------
test('SPEC: schema file is closed (additionalProperties:false) at both object levels', () => {
  const schema = JSON.parse(readFileSync(SCHEMA_PATH, 'utf8'));
  assert.equal(schema.additionalProperties, false);
  assert.equal(schema.$defs.provenance.additionalProperties, false);
  // confidence is range-bound 0..1.
  assert.equal(schema.$defs.provenance.properties.confidence.minimum, 0);
  assert.equal(schema.$defs.provenance.properties.confidence.maximum, 1);
});

test('SPEC: validateHit REJECTS an unknown top-level field (closed schema)', () => {
  const hit = { path: 'a.mjs', surface: 'fn', snippet: 's', score: 0.9,
    provenance: { evidenceKind: EVIDENCE_KIND.STRUCTURAL, confidence: 0.9 }, rogue: true };
  const v = validateHit(hit);
  assert.equal(v.ok, false);
  assert.ok(v.errors.some((e) => e.includes('unknown field: rogue')), v.errors.join('; '));
});

test('validateHit REJECTS an unknown provenance field (closed nested schema)', () => {
  const hit = { path: 'a.mjs', surface: 'fn', snippet: 's', score: 0.9,
    provenance: { evidenceKind: EVIDENCE_KIND.STRUCTURAL, confidence: 0.9, sneaky: 1 } };
  const v = validateHit(hit);
  assert.equal(v.ok, false);
  assert.ok(v.errors.some((e) => e.includes('unknown provenance field: sneaky')), v.errors.join('; '));
});

test('validateHit ACCEPTS a well-formed structural hit', () => {
  const hit = { path: 'a.mjs', surface: 'fn', snippet: 's', score: 0.92,
    provenance: { evidenceKind: EVIDENCE_KIND.STRUCTURAL, confidence: 0.92, stale: false } };
  assert.equal(validateHit(hit).ok, true);
});

test('validateHit ACCEPTS the forward-compat structuralUnavailable flag (XREF-05 downstream)', () => {
  const hit = { path: 'a.mjs', surface: 'fn', snippet: 's', score: 0.4,
    provenance: { evidenceKind: EVIDENCE_KIND.LEXICAL, confidence: 0.4, mismatch: 'm', structuralUnavailable: true } };
  assert.equal(validateHit(hit).ok, true);
});

test('validateHit REJECTS confidence out of [0,1]', () => {
  for (const bad of [-0.01, 1.01, NaN, Infinity, 'high']) {
    const hit = { path: 'a.mjs', surface: 'fn', snippet: 's', score: 0.9,
      provenance: { evidenceKind: EVIDENCE_KIND.STRUCTURAL, confidence: bad } };
    assert.equal(validateHit(hit).ok, false, `confidence ${bad} should be rejected`);
  }
});

test('validateHit REJECTS missing required fields', () => {
  assert.equal(validateHit({ surface: 'fn', snippet: 's', score: 0.9, provenance: { evidenceKind: EVIDENCE_KIND.STRUCTURAL, confidence: 0.9 } }).ok, false);
  assert.equal(validateHit({ path: 'a.mjs', snippet: 's', score: 0.9, provenance: { evidenceKind: EVIDENCE_KIND.STRUCTURAL, confidence: 0.9 } }).ok, false);
  assert.equal(validateHit({ path: 'a.mjs', surface: 'fn', snippet: 's', score: 0.9 }).ok, false);
});

// ----------------------------------------------------------------------------------------
// ADVERSARIAL — fail-open hunting.
// ----------------------------------------------------------------------------------------
test('ADVERSARIAL: unknown surface throws (fail-closed, no invented confidence)', () => {
  assert.throws(() => scoreHit({ surface: 'sql-injection', lexicalScore: 1 }), /unknown surface/);
  assert.throws(() => scoreHit({ surface: undefined }), /unknown surface/);
  assert.throws(() => scoreHit({}), /unknown surface/);
});

test('ADVERSARIAL: structural surface with structuralMatch=false returns null (no silent promotion)', () => {
  const r = scoreHit({ surface: EVIDENCE_KIND.STRUCTURAL, structuralMatch: false, lexicalScore: 1.0 });
  assert.equal(r, null);
});

test('ADVERSARIAL: neighbor with a bogus/missing edgeKind returns null (closed-set, not charset)', () => {
  for (const edgeKind of ['deletes', 'WRITES', '', undefined, 'calls ', 'reads\n']) {
    assert.equal(scoreHit({ surface: EVIDENCE_KIND.NEIGHBOR, edgeKind, lexicalScore: 1 }), null, `edgeKind ${JSON.stringify(edgeKind)} must not surface`);
  }
});

test('ADVERSARIAL: non-finite lexicalScore fails LOW, never high', () => {
  for (const bad of [NaN, Infinity, -Infinity, undefined, 'lots', null]) {
    const struct = scoreHit({ surface: EVIDENCE_KIND.STRUCTURAL, structuralMatch: true, lexicalScore: bad });
    assert.ok(struct.confidence >= 0.8, 'structural floor is band-low 0.8, still valid');
    const neigh = scoreHit({ surface: EVIDENCE_KIND.NEIGHBOR, edgeKind: 'calls', lexicalScore: bad });
    assert.ok(neigh.confidence >= 0.55 && neigh.confidence <= 0.75);
    const lex = scoreHit({ surface: EVIDENCE_KIND.LEXICAL, lexicalScore: bad });
    assert.ok(lex.confidence < 0.55);
  }
});

test('ADVERSARIAL: out-of-range lexicalScore is clamped into the band (no band overflow)', () => {
  const over = scoreHit({ surface: EVIDENCE_KIND.NEIGHBOR, edgeKind: 'reads', lexicalScore: 99 });
  assert.ok(over.confidence <= 0.75);
  const under = scoreHit({ surface: EVIDENCE_KIND.NEIGHBOR, edgeKind: 'reads', lexicalScore: -99 });
  assert.ok(under.confidence >= 0.55);
});

test('ADVERSARIAL: gateHit fails closed on malformed/missing provenance (whitespace-only mismatch does not count)', () => {
  assert.equal(gateHit({}).surfaced, false);
  assert.equal(gateHit({ provenance: null }).surfaced, false);
  assert.equal(gateHit({ provenance: { confidence: 'high' } }).surfaced, false);
  // whitespace-only mismatch must NOT count as a named mismatch.
  const g = gateHit({ provenance: { confidence: 0.3, mismatch: '   ' } });
  assert.equal(g.surfaced, false);
});

test('ADVERSARIAL: a hit AT the floor (0.55) surfaces without a mismatch (boundary is strict <)', () => {
  const hit = { path: 'a.mjs', surface: 'fn', snippet: 's', score: 0.55,
    provenance: { evidenceKind: EVIDENCE_KIND.NEIGHBOR, confidence: 0.55 } };
  assert.equal(gateHit(hit).surfaced, true);
});

test('ADVERSARIAL: serializeRevalidate canary rejects a malformed provenance object', () => {
  // Bad evidenceKind + out-of-range confidence: the serialized form fails the closed schema -> canary.
  const bad = { path: 'a.mjs', surface: 'fn', snippet: 's', score: 0.9,
    provenance: { evidenceKind: 'made-up-kind', confidence: 2 } };
  assert.throws(() => serializeRevalidate(bad), /canary|re-validation/);
});

test('ADVERSARIAL: serializeRevalidate canary catches a toJSON that smuggles an unknown field POST-stringify', () => {
  // The live provenance object is shape-clean; its toJSON injects a rogue field that only manifests
  // after JSON.stringify. The canary validates the SERIALIZED form, so it catches the smuggle that a
  // live-object-only check would miss. This is the whole point of serialize-then-revalidate.
  const prov = { evidenceKind: EVIDENCE_KIND.STRUCTURAL, confidence: 0.9 };
  Object.defineProperty(prov, 'toJSON', {
    enumerable: false,
    value() { return { evidenceKind: EVIDENCE_KIND.STRUCTURAL, confidence: 0.9, smuggled: true }; },
  });
  const hit = { path: 'a.mjs', surface: 'fn', snippet: 's', score: 0.9, provenance: prov };
  // Sanity: the LIVE object passes the hand-rolled validator (toJSON is non-enumerable -> not a key).
  assert.equal(validateHit(hit).ok, true);
  // But the serialized wire form carries the smuggled field -> canary rejects it.
  assert.throws(() => serializeRevalidate(hit), /canary|re-validation/);
});

test('ADVERSARIAL: serializeRevalidate fails closed on an unserializable hit (BigInt)', () => {
  const hit = { path: 'a.mjs', surface: 'fn', snippet: 's', score: 0.9,
    provenance: { evidenceKind: EVIDENCE_KIND.STRUCTURAL, confidence: 0.9 }, };
  // inject a BigInt via a non-schema escape hatch to force JSON.stringify to throw
  const evil = { ...hit };
  Object.defineProperty(evil, 'snippet', { enumerable: true, value: 10n });
  assert.throws(() => serializeRevalidate(evil), /not serializable|canary|re-validation/);
});

test('serializeRevalidate returns a clean round-tripped hit on a valid input', () => {
  const hit = { path: 'a.mjs', surface: 'fn', snippet: 's', score: 0.9,
    provenance: { evidenceKind: EVIDENCE_KIND.STRUCTURAL, confidence: 0.9, stale: false } };
  const out = serializeRevalidate(hit);
  assert.deepEqual(out, hit);
});

test('KNOBS: the floor and penalty are externalized, frozen, and in range', () => {
  assert.equal(XREF_PROVENANCE_KNOBS.confidenceFloor, 0.55);
  assert.equal(XREF_PROVENANCE_KNOBS.stalenessPenalty, 0.6);
  assert.ok(Object.isFrozen(XREF_PROVENANCE_KNOBS));
  assert.throws(() => { XREF_PROVENANCE_KNOBS.confidenceFloor = 0; }, TypeError);
});
