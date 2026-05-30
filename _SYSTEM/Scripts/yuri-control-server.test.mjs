import { test } from 'node:test';
import assert from 'node:assert/strict';
import { preview, validate } from './yuri-control-server.mjs';

test('preview scores the protected scenario with the REAL gate', () => {
  const prot = preview({}).find((s) => s.name === 'Protected-path write');
  assert.equal(prot.deltaU, 100);
  assert.equal(prot.accept, false);
  assert.equal(prot.dominantTerm, 'protectedPathViolations');
});

test('preview is config-driven: eta=0 makes the protected scenario ACCEPT', () => {
  const prot = preview({ weights: { eta: 0 } }).find((s) => s.name === 'Protected-path write');
  assert.equal(prot.deltaU, 0);
  assert.equal(prot.accept, true);
});

test('preview: a failed check fires the calibration terms (ΔU > 0, reject)', () => {
  const fail = preview({}).find((s) => s.name === 'A check FAILS');
  assert.ok(fail.deltaU > 0, `expected ascent, got ${fail.deltaU}`);
  assert.equal(fail.accept, false);
});

test('preview: a healthy edit descends (ΔU < 0, accept)', () => {
  const ok = preview({}).find((s) => s.name === 'Healthy edit lands');
  assert.ok(ok.deltaU < 0);
  assert.equal(ok.accept, true);
});

test('validate drops unknown / negative / non-finite, keeps valid', () => {
  const v = validate({ weights: { eta: -5, bogus: 1, delta: 2 }, threshold: 0.3, salience: { surpriseK: 3 }, enforce: true });
  assert.equal(v.weights.eta, undefined);
  assert.equal(v.weights.bogus, undefined);
  assert.equal(v.weights.delta, 2);
  assert.equal(v.threshold, 0.3);
  assert.equal(v.salience.surpriseK, 3);
  assert.equal(v.enforce, true);
});
