import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { DEFAULT_WEIGHTS } from './math/yuri-energy.mjs';
import { CONFIG_FILE } from './math/yuri-energy-config.mjs';
import { DEFAULT_SALIENCE } from './energy-tick-core.mjs';
import { FSRS_DECAY, FSRS_FACTOR } from './math/yuri-fsrs.mjs';

// The canonical surface claims (in _doc.values_are_defaults) that every value equals the
// in-code default. This converts that PROSE promise into an ENFORCED invariant: because the
// file is merged OVER the in-code defaults at runtime, a drift between them silently makes a
// stale file override a changed code default with no other signal. This test fails the moment
// they diverge, so changing a default forces updating the canonical surface (and vice-versa).
test('energy-weights.json matches the in-code defaults (no silent drift)', () => {
  const file = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
  assert.deepEqual(file.weights, { ...DEFAULT_WEIGHTS }, 'file.weights drifted from DEFAULT_WEIGHTS');
  assert.deepEqual(file.salience, { ...DEFAULT_SALIENCE }, 'file.salience drifted from DEFAULT_SALIENCE');
  assert.equal(file.threshold, 0, 'file.threshold should be the default 0');
  assert.equal(file.evict.ttlDays, 90, 'file.evict.ttlDays should be the default 90');
});

// Same no-silent-drift invariant for the subconscious-loop knobs (L7). fsrs/recall are merged
// over the in-code defaults in yuri-fsrs (evaluateRetention/effectiveStability), yuri-recall
// (rankRecall), and brain-inject (consciousSetCap). A drift here would silently override a
// changed code default, so pin the file to those defaults.
test('energy-weights.json fsrs/recall blocks match the subconscious-loop in-code defaults', () => {
  const file = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
  // fsrs — defaults in yuri-fsrs.mjs (evaluateRetention rFloor; effectiveStability salience/freq/deltaU).
  assert.equal(file.fsrs.rFloor, 0.6, 'fsrs.rFloor drifted (evaluateRetention default)');
  assert.equal(file.fsrs.decay, FSRS_DECAY, 'fsrs.decay drifted from FSRS_DECAY');
  assert.equal(file.fsrs.factor, FSRS_FACTOR, 'fsrs.factor drifted from FSRS_FACTOR');
  assert.equal(file.fsrs.salience, 1.0, 'fsrs.salience drifted (effectiveStability default)');
  assert.equal(file.fsrs.freq, 0.5, 'fsrs.freq drifted (effectiveStability default)');
  assert.equal(file.fsrs.deltaU, 0.3, 'fsrs.deltaU drifted (effectiveStability default)');
  // recall — defaults in yuri-recall.mjs rankRecall, + the brain-inject conscious-set cap (12).
  assert.equal(file.recall.relevanceFloor, 0, 'recall.relevanceFloor drifted (rankRecall default)');
  assert.equal(file.recall.topK, 5, 'recall.topK drifted (rankRecall default)');
  assert.equal(file.recall.halfLifeDays, 30, 'recall.halfLifeDays drifted (rankRecall default)');
  assert.equal(file.recall.consciousSetCap, 12, 'recall.consciousSetCap drifted (brain-inject default)');
  assert.deepEqual(file.recall.weights, { bm25: 1.0, recency: 0.5, salience: 0.5, crosslink: 0.3 }, 'recall.weights drifted from rankRecall defaults');
});
