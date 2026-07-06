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

test('valid weights / threshold / salience pass through', () => {
  const c = loadEnergyConfig(tmp({
    weights: { eta: 50, iota: 0.3 }, threshold: 0.5,
    salience: { depthThreshold: 8, surpriseK: 3, surpriseWindow: 30 },
  }));
  assert.equal(c.weights.eta, 50);
  assert.equal(c.weights.iota, 0.3);
  assert.equal(c.threshold, 0.5);
  assert.equal(c.salience.depthThreshold, 8);
  assert.equal(c.salience.surpriseK, 3);
});

test('unknown keys, negatives, and non-finite weights are dropped (fail-closed)', () => {
  const c = loadEnergyConfig(tmp({ weights: { eta: -5, bogus: 9, gamma: 'x', delta: 2 } }));
  assert.equal(c.weights.eta, undefined);   // negative dropped
  assert.equal(c.weights.bogus, undefined); // unknown key dropped
  assert.equal(c.weights.gamma, undefined); // non-numeric dropped
  assert.equal(c.weights.delta, 2);         // valid kept
});

test('veto-bearing weights cannot be disabled by config zero (red-team #1)', () => {
  const c = loadEnergyConfig(tmp({ weights: { eta: 0, theta: 0, gamma: 0 }, threshold: -1 }));
  assert.equal(c.weights.eta, undefined);   // eta=0 dropped (clamped to positive floor)
  assert.equal(c.weights.theta, undefined); // theta=0 dropped
  assert.equal(c.weights.gamma, 0);         // non-veto weight: 0 still allowed
  assert.equal(c.threshold, undefined);     // negative threshold rejected
});

test('malformed JSON yields {} — the gate falls back to standards', () => {
  const f = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'ec-')), 'energy-weights.json');
  fs.writeFileSync(f, '{ broken json');
  assert.deepEqual(loadEnergyConfig(f), {});
});

test('type confusion is dropped fail-closed, not coerced to a finite number', () => {
  // bare Number() would turn each of these into a finite value; the guard must DROP them.
  assert.equal(loadEnergyConfig(tmp({ weights: { eta: '' } })).weights, undefined);    // '' -> would be 0
  assert.equal(loadEnergyConfig(tmp({ weights: { eta: null } })).weights, undefined);   // null -> would be 0
  assert.equal(loadEnergyConfig(tmp({ weights: { eta: true } })).weights, undefined);   // true -> would be 1
  assert.equal(loadEnergyConfig(tmp({ weights: { eta: [5] } })).weights, undefined);    // [5] -> would be 5
  assert.equal(loadEnergyConfig(tmp({ threshold: '' })).threshold, undefined);          // '' -> would be 0
  assert.equal(loadEnergyConfig(tmp({ threshold: '  ' })).threshold, undefined);        // whitespace
  assert.equal(loadEnergyConfig(tmp({ salience: { surpriseWindow: true } })).salience, undefined); // true -> 1
  assert.equal(loadEnergyConfig(tmp({ evict: { ttlDays: true } })).evict, undefined);   // true -> 1
  // a genuine numeric string is still accepted (back-compat for string-typed knobs)
  assert.equal(loadEnergyConfig(tmp({ weights: { eta: '50' } })).weights.eta, 50);
});

test('surpriseWindow below the band minimum (3) is dropped — cannot silently kill the surprise tier', () => {
  assert.equal(loadEnergyConfig(tmp({ salience: { surpriseWindow: 1 } })).salience, undefined);
  assert.equal(loadEnergyConfig(tmp({ salience: { surpriseWindow: 2 } })).salience, undefined);
  assert.equal(loadEnergyConfig(tmp({ salience: { surpriseWindow: 3 } })).salience.surpriseWindow, 3);
  assert.equal(loadEnergyConfig(tmp({ salience: { surpriseWindow: 20 } })).salience.surpriseWindow, 20);
});

test('fsrs / recall blocks pass through when valid; unknown keys dropped', () => {
  const c = loadEnergyConfig(tmp({
    fsrs: { rFloor: 0.7, decay: -0.4, factor: 0.25, salience: 2, freq: 1, deltaU: 0.5, bogus: 9 },
    recall: { relevanceFloor: 0.2, topK: 8, halfLifeDays: 45, consciousSetCap: 20, weights: { bm25: 2, recency: 1, salience: 1, crosslink: 0.5, bogus: 3 } },
  }));
  assert.deepEqual(c.fsrs, { rFloor: 0.7, decay: -0.4, factor: 0.25, salience: 2, freq: 1, deltaU: 0.5 });
  assert.equal(c.recall.relevanceFloor, 0.2);
  assert.equal(c.recall.topK, 8);
  assert.equal(c.recall.halfLifeDays, 45);
  assert.equal(c.recall.consciousSetCap, 20);
  assert.deepEqual(c.recall.weights, { bm25: 2, recency: 1, salience: 1, crosslink: 0.5 });
});

test('fsrs / recall fail-closed: out-of-range + type confusion dropped, fractional ints truncated', () => {
  assert.equal(loadEnergyConfig(tmp({ fsrs: { rFloor: 0 } })).fsrs, undefined);        // rFloor must be > 0
  assert.equal(loadEnergyConfig(tmp({ fsrs: { rFloor: 1.5 } })).fsrs, undefined);      // > 1 dropped
  assert.equal(loadEnergyConfig(tmp({ fsrs: { decay: 0.5 } })).fsrs, undefined);       // decay must be < 0
  assert.equal(loadEnergyConfig(tmp({ fsrs: { factor: 0 } })).fsrs, undefined);        // factor must be > 0
  assert.equal(loadEnergyConfig(tmp({ fsrs: { freq: -1 } })).fsrs, undefined);         // negative dropped
  assert.equal(loadEnergyConfig(tmp({ recall: { topK: 0 } })).recall, undefined);      // topK >= 1
  assert.equal(loadEnergyConfig(tmp({ recall: { halfLifeDays: 0 } })).recall, undefined); // >= 1
  assert.equal(loadEnergyConfig(tmp({ recall: { consciousSetCap: true } })).recall, undefined); // type confusion
  assert.equal(loadEnergyConfig(tmp({ recall: { topK: 7.9 } })).recall.topK, 7);       // truncated to int
});

// MEM-02 / MEM-05 / MEM-06 — new fsrs knobs pass through valid, fail-closed on bad input.
test('fsrs: redundancyFloor / supersessionPenaltyDays / renewal knobs pass through valid', () => {
  const c = loadEnergyConfig(tmp({ fsrs: {
    redundancyFloor: 0.2, supersessionPenaltyDays: 45, renewalScale: 2, renewalMinWindowDays: 3,
  } })).fsrs;
  assert.equal(c.redundancyFloor, 0.2);
  assert.equal(c.supersessionPenaltyDays, 45);
  assert.equal(c.renewalScale, 2);
  assert.equal(c.renewalMinWindowDays, 3);
});

test('fsrs new knobs fail-closed: out-of-range / type confusion dropped', () => {
  // redundancyFloor: [0,1] inclusive (0 is the valid "disable" sentinel)
  assert.equal(loadEnergyConfig(tmp({ fsrs: { redundancyFloor: 0 } })).fsrs.redundancyFloor, 0);
  assert.equal(loadEnergyConfig(tmp({ fsrs: { redundancyFloor: 1.5 } })).fsrs, undefined);   // > 1 dropped → block empty
  assert.equal(loadEnergyConfig(tmp({ fsrs: { redundancyFloor: -0.1 } })).fsrs, undefined);  // < 0 dropped
  // supersessionPenaltyDays >= 0 (0 disables)
  assert.equal(loadEnergyConfig(tmp({ fsrs: { supersessionPenaltyDays: 0 } })).fsrs.supersessionPenaltyDays, 0);
  assert.equal(loadEnergyConfig(tmp({ fsrs: { supersessionPenaltyDays: -5 } })).fsrs, undefined);
  // renewalScale > 0, renewalMinWindowDays >= 1
  assert.equal(loadEnergyConfig(tmp({ fsrs: { renewalScale: 0 } })).fsrs, undefined);
  assert.equal(loadEnergyConfig(tmp({ fsrs: { renewalMinWindowDays: 0 } })).fsrs, undefined);
  assert.equal(loadEnergyConfig(tmp({ fsrs: { supersessionPenaltyDays: true } })).fsrs, undefined); // type confusion
});

test('evict.ttlDays passes through when valid, drops + truncates per fail-closed rule', () => {
  assert.equal(loadEnergyConfig(tmp({ evict: { ttlDays: 45 } })).evict.ttlDays, 45);  // valid kept
  assert.equal(loadEnergyConfig(tmp({ evict: { ttlDays: 12.9 } })).evict.ttlDays, 12); // truncated to int
  assert.equal(loadEnergyConfig(tmp({ evict: { ttlDays: 0 } })).evict, undefined);     // < 1 dropped
  assert.equal(loadEnergyConfig(tmp({ evict: { ttlDays: -3 } })).evict, undefined);    // negative dropped
  assert.equal(loadEnergyConfig(tmp({ evict: { ttlDays: 'x' } })).evict, undefined);   // non-numeric dropped
  assert.equal(loadEnergyConfig(tmp({ evict: [1, 2] })).evict, undefined);             // array (not object) dropped
});

test('fsrs.renewalCountFloor validates 0<=v<=1; out-of-range dropped', () => {
  assert.equal(loadEnergyConfig(tmp({ fsrs: { renewalCountFloor: 0.4 } })).fsrs.renewalCountFloor, 0.4);
  assert.equal(loadEnergyConfig(tmp({ fsrs: { renewalCountFloor: 2 } })).fsrs?.renewalCountFloor, undefined);
});
