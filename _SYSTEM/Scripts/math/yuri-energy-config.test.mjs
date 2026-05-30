import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { loadEnergyConfig } from './yuri-energy-config.mjs';

const tmp = (obj) => {
  const f = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'ec-')), 'energy-weights.json');
  fs.writeFileSync(f, JSON.stringify(obj));
  return f;
};

test('loadEnergyConfig returns {} when the file is missing', () => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'ec-'));
  assert.deepEqual(loadEnergyConfig(path.join(d, 'energy-weights.json')), {});
});

test('valid weights / threshold / salience / enforce pass through', () => {
  const c = loadEnergyConfig(tmp({
    weights: { eta: 50, iota: 0.3 }, threshold: 0.5,
    salience: { depthThreshold: 8, surpriseK: 3, surpriseWindow: 30 }, enforce: true,
  }));
  assert.equal(c.weights.eta, 50);
  assert.equal(c.weights.iota, 0.3);
  assert.equal(c.threshold, 0.5);
  assert.equal(c.salience.depthThreshold, 8);
  assert.equal(c.salience.surpriseK, 3);
  assert.equal(c.enforce, true);
});

test('unknown keys, negatives, and non-finite weights are dropped (fail-closed)', () => {
  const c = loadEnergyConfig(tmp({ weights: { eta: -5, bogus: 9, gamma: 'x', delta: 2 } }));
  assert.equal(c.weights.eta, undefined);   // negative dropped
  assert.equal(c.weights.bogus, undefined); // unknown key dropped
  assert.equal(c.weights.gamma, undefined); // non-numeric dropped
  assert.equal(c.weights.delta, 2);         // valid kept
});

test('malformed JSON yields {} — the gate falls back to standards', () => {
  const f = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'ec-')), 'energy-weights.json');
  fs.writeFileSync(f, '{ broken json');
  assert.deepEqual(loadEnergyConfig(f), {});
});
