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
