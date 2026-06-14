// Tests for yuri-energy-corpus-seal.mjs — the calibration-corpus contamination seal.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  hashCorpusSlice, sealCorpus, assertCorpusSeal, verifyCorpusSeal, canonicalRecord, ContaminationError,
} from './yuri-energy-corpus-seal.mjs';

const corpus = () => [
  { id: 'r1', U: 1.2, accept: false }, { id: 'r2', U: -0.3, accept: true }, { id: 'r3', U: 5.0, accept: false },
];

test('seal verifies intact against the same corpus', () => {
  const c = corpus();
  assert.equal(verifyCorpusSeal(sealCorpus(c), c).intact, true);
});

test('order-independent: reordering the corpus stays intact', () => {
  const c = corpus();
  const seal = sealCorpus(c);
  const reordered = [c[2], c[0], c[1]];
  assert.equal(verifyCorpusSeal(seal, reordered).intact, true);
});

test('tamper-sensitive: a value change is DETECTED (negative control)', () => {
  const c = corpus();
  const seal = sealCorpus(c);
  const tampered = c.map((r) => (r.id === 'r2' ? { ...r, U: 99 } : r));
  assert.equal(verifyCorpusSeal(seal, tampered).intact, false);
});

test('add / remove a record is DETECTED', () => {
  const c = corpus();
  const seal = sealCorpus(c);
  assert.equal(verifyCorpusSeal(seal, [...c, { id: 'r4', U: 0 }]).intact, false);
  assert.equal(verifyCorpusSeal(seal, c.slice(0, 2)).intact, false);
});

test('assertCorpusSeal: returns true intact, throws ContaminationError on drift', () => {
  const c = corpus();
  const seal = sealCorpus(c);
  assert.equal(assertCorpusSeal(seal, c), true);
  assert.throws(() => assertCorpusSeal(seal, c.slice(0, 1)), ContaminationError);
});

test('canonicalRecord: key order does not change the hash (nested too)', () => {
  const a = { id: 'x', meta: { p: 1, q: 2 }, U: 3 };
  const b = { U: 3, id: 'x', meta: { q: 2, p: 1 } };
  assert.equal(canonicalRecord(a), canonicalRecord(b));
  assert.equal(hashCorpusSlice([a]), hashCorpusSlice([b]));
});

test('hashCorpusSlice is deterministic + handles empty/non-array', () => {
  assert.equal(hashCorpusSlice(corpus()), hashCorpusSlice(corpus()));
  assert.equal(hashCorpusSlice([]), hashCorpusSlice(null));
});

// RED-GREEN regression for red-team finding G-A (2026-06-14): the seal must DISTINGUISH
// special floats. On the unpatched code JSON.stringify collapsed NaN/Infinity/-Infinity to
// "null" and `undefined ?? null` to "null", so all of these hashed IDENTICALLY → the seal was
// blind to the exact contamination a broken calibration candidate (NaN in U) produces.
test('special floats hash DISTINCTLY — NaN/Infinity/-Infinity/null/undefined/0 all differ (G-A fix)', () => {
  const h = (u) => hashCorpusSlice([{ id: 'r', U: u }]);
  const variants = {
    nan: h(NaN), posInf: h(Infinity), negInf: h(-Infinity), nul: h(null), undef: h(undefined), zero: h(0),
  };
  const hashes = Object.values(variants);
  // every variant must be unique — on the OLD code nan===posInf===negInf===nul===undef ("null") and this FAILS
  assert.equal(new Set(hashes).size, hashes.length, `special floats must hash distinctly, got ${JSON.stringify(variants)}`);
});

test('NaN contamination is DETECTED — a NaN-poisoned U vs a clean U is caught (G-A fix)', () => {
  const clean = [{ id: 'r1', U: 1.2 }, { id: 'r2', U: 0.5 }];
  const seal = sealCorpus(clean);
  const poisoned = [{ id: 'r1', U: NaN }, { id: 'r2', U: 0.5 }];
  assert.equal(verifyCorpusSeal(seal, poisoned).intact, false);
  // and Infinity contamination too
  const poisonedInf = [{ id: 'r1', U: Infinity }, { id: 'r2', U: 0.5 }];
  assert.equal(verifyCorpusSeal(seal, poisonedInf).intact, false);
});

test('clean-value equivalence: the fix is INERT on finite/string/bool/null/object/array values', () => {
  // a corpus with only clean values must hash to a stable, recomputable digest (no special-float path taken)
  const c = [{ id: 'x', U: -0.3, accept: true, meta: { n: 5, tag: 'ok' }, seq: [1, 2, 3], note: null }];
  assert.equal(hashCorpusSlice(c), hashCorpusSlice(c.map((r) => ({ ...r }))));
  // canonicalRecord of a clean record contains no sentinel marker
  assert.equal(/<<(NaN|[+-]Infinity|undefined)>>/.test(canonicalRecord(c[0])), false);
});
