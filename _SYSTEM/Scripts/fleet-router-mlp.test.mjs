import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, appendFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { recordPrediction, recordOutcome } from './prediction-ledger.mjs';
import {
  extractFeatures,
  historicalSuccess,
  HISTORICAL_SUCCESS_FALLBACK,
  HISTORICAL_SUCCESS_MIN_SAMPLES,
  HISTORICAL_SUCCESS_WINDOW,
} from './fleet-router-mlp.mjs';

function tmpLedger() {
  const dir = mkdtempSync(join(tmpdir(), 'mlp-hist-'));
  return join(dir, 'ledger.jsonl');
}

/** Write a matched prediction+outcome pair mirroring fleet-mlp-feedback.mjs's shape. */
function writePair(file, { id, role, substrate, success, ts }) {
  recordPrediction({
    id,
    subject: `fleet-route:${id}`,
    change: `route ${id} (role=${role}) → ${substrate}`,
    predictedEffects: [{ target: 'substrate', effect: substrate, confidence: 0.7 }],
    features: null,
    source: 'fleet-router-mlp',
    ts,
  }, { file });
  recordOutcome({
    predictionId: id,
    observedEffects: [
      { target: 'substrate', effect: substrate },
      { target: 'success', effect: success },
      { target: 'quality', effect: success ? 0.9 : 0.2 },
    ],
    ts,
  }, { file });
}

describe('fleet-router-mlp: historicalSuccess evidence wiring', () => {
  it('extractFeatures f[3] is NOT a hardcoded constant when ledger evidence exists', () => {
    const file = tmpLedger();
    // 5 successes for engineer/glm-workhorse — well above the fallback of 0.6.
    for (let i = 0; i < 5; i++) {
      writePair(file, { id: `p${i}`, role: 'engineer', substrate: 'glm', success: 1, ts: new Date(2026, 0, i + 1).toISOString() });
    }
    const feats = extractFeatures(
      { role: 'engineer', prompt: 'x' },
      { historicalLedgerFile: file, historicalSubstrate: 'glm' },
    );
    assert.equal(feats[3], 1, 'all-success matched evidence should drive historicalSuccess to 1, not stay at the old 0.6 constant');
  });

  it('historicalSuccess falls back to the documented neutral default with no matching history', () => {
    const file = tmpLedger();
    const r = historicalSuccess('engineer', 'glm-workhorse', { file });
    assert.equal(r.value, HISTORICAL_SUCCESS_FALLBACK);
    assert.equal(r.fallback, true);
    assert.equal(r.sampleSize, 0);
  });

  it('historicalSuccess falls back below the minimum sample threshold', () => {
    const file = tmpLedger();
    writePair(file, { id: 'a', role: 'engineer', substrate: 'glm', success: 1, ts: new Date(2026, 0, 1).toISOString() });
    // Only 1 matched sample — below HISTORICAL_SUCCESS_MIN_SAMPLES.
    const r = historicalSuccess('engineer', 'glm-workhorse', { file });
    assert.equal(r.fallback, true);
    assert.equal(r.value, HISTORICAL_SUCCESS_FALLBACK);
    assert.equal(r.sampleSize, 1);
  });

  it('historicalSuccess computes real rolling mean once minimum samples are met', () => {
    const file = tmpLedger();
    // 2 success, 1 failure → mean 2/3.
    writePair(file, { id: 'a', role: 'engineer', substrate: 'glm', success: 1, ts: new Date(2026, 0, 1).toISOString() });
    writePair(file, { id: 'b', role: 'engineer', substrate: 'glm', success: 1, ts: new Date(2026, 0, 2).toISOString() });
    writePair(file, { id: 'c', role: 'engineer', substrate: 'glm', success: 0, ts: new Date(2026, 0, 3).toISOString() });
    const r = historicalSuccess('engineer', 'glm-workhorse', { file, minSamples: 3 });
    assert.equal(r.fallback, false);
    assert.equal(r.sampleSize, 3);
    assert.ok(Math.abs(r.value - 2 / 3) < 1e-9);
  });

  it('malformed rows (missing success label, non-numeric effect) cannot steer the average', () => {
    const file = tmpLedger();
    writePair(file, { id: 'a', role: 'engineer', substrate: 'glm', success: 1, ts: new Date(2026, 0, 1).toISOString() });
    writePair(file, { id: 'b', role: 'engineer', substrate: 'glm', success: 1, ts: new Date(2026, 0, 2).toISOString() });
    writePair(file, { id: 'c', role: 'engineer', substrate: 'glm', success: 1, ts: new Date(2026, 0, 3).toISOString() });
    // Prediction with no matching outcome (unresolved) — must be ignored, not counted as failure.
    recordPrediction({
      id: 'unresolved',
      subject: 'fleet-route:unresolved',
      change: 'route unresolved (role=engineer) → glm',
      predictedEffects: [{ target: 'substrate', effect: 'glm', confidence: 0.7 }],
      source: 'fleet-router-mlp',
      ts: new Date(2026, 0, 4).toISOString(),
    }, { file });
    // Outcome with a non-numeric / missing success effect — must be skipped as unlabeled.
    recordPrediction({
      id: 'nolabel',
      subject: 'fleet-route:nolabel',
      change: 'route nolabel (role=engineer) → glm',
      predictedEffects: [{ target: 'substrate', effect: 'glm', confidence: 0.7 }],
      source: 'fleet-router-mlp',
      ts: new Date(2026, 0, 5).toISOString(),
    }, { file });
    recordOutcome({
      predictionId: 'nolabel',
      observedEffects: [{ target: 'substrate', effect: 'glm' }], // no 'success' target at all
      ts: new Date(2026, 0, 5).toISOString(),
    }, { file });
    // Corrupt JSON line appended directly.
    appendFileSync(file, 'not json at all\n');

    const r = historicalSuccess('engineer', 'glm-workhorse', { file, minSamples: 3 });
    assert.equal(r.fallback, false);
    assert.equal(r.sampleSize, 3, 'unresolved / unlabeled / corrupt rows must not enter the sample count');
    assert.equal(r.value, 1);
  });

  it('role isolation: a different role with matched history does not leak in', () => {
    const file = tmpLedger();
    writePair(file, { id: 'a', role: 'engineer', substrate: 'glm', success: 1, ts: new Date(2026, 0, 1).toISOString() });
    writePair(file, { id: 'b', role: 'engineer', substrate: 'glm', success: 1, ts: new Date(2026, 0, 2).toISOString() });
    writePair(file, { id: 'c', role: 'engineer', substrate: 'glm', success: 1, ts: new Date(2026, 0, 3).toISOString() });
    writePair(file, { id: 'x', role: 'sentinel', substrate: 'glm', success: 0, ts: new Date(2026, 0, 4).toISOString() });
    writePair(file, { id: 'y', role: 'sentinel', substrate: 'glm', success: 0, ts: new Date(2026, 0, 5).toISOString() });
    writePair(file, { id: 'z', role: 'sentinel', substrate: 'glm', success: 0, ts: new Date(2026, 0, 6).toISOString() });

    const eng = historicalSuccess('engineer', 'glm-workhorse', { file, minSamples: 3 });
    const sen = historicalSuccess('sentinel', 'glm-workhorse', { file, minSamples: 3 });
    assert.equal(eng.value, 1);
    assert.equal(sen.value, 0);
  });

  it('substrate isolation: same role, different substrate family does not leak in', () => {
    const file = tmpLedger();
    writePair(file, { id: 'a', role: 'engineer', substrate: 'glm', success: 1, ts: new Date(2026, 0, 1).toISOString() });
    writePair(file, { id: 'b', role: 'engineer', substrate: 'glm', success: 1, ts: new Date(2026, 0, 2).toISOString() });
    writePair(file, { id: 'c', role: 'engineer', substrate: 'glm', success: 1, ts: new Date(2026, 0, 3).toISOString() });
    writePair(file, { id: 'x', role: 'engineer', substrate: 'omp_task', success: 0, ts: new Date(2026, 0, 4).toISOString() });
    writePair(file, { id: 'y', role: 'engineer', substrate: 'omp_task', success: 0, ts: new Date(2026, 0, 5).toISOString() });
    writePair(file, { id: 'z', role: 'engineer', substrate: 'omp_task', success: 0, ts: new Date(2026, 0, 6).toISOString() });

    const glm = historicalSuccess('engineer', 'glm-workhorse', { file, minSamples: 3 });
    const native = historicalSuccess('engineer', 'native', { file, minSamples: 3 });
    assert.equal(glm.value, 1);
    assert.equal(native.value, 0);
  });

  it('bounded rolling window: only the most recent N matched samples count', () => {
    const file = tmpLedger();
    // 3 old failures, then 3 recent successes. Window size 3 -> only recent successes count.
    for (let i = 0; i < 3; i++) {
      writePair(file, { id: `old${i}`, role: 'engineer', substrate: 'glm', success: 0, ts: new Date(2026, 0, i + 1).toISOString() });
    }
    for (let i = 0; i < 3; i++) {
      writePair(file, { id: `new${i}`, role: 'engineer', substrate: 'glm', success: 1, ts: new Date(2026, 0, i + 10).toISOString() });
    }
    const r = historicalSuccess('engineer', 'glm-workhorse', { file, minSamples: 3, window: 3 });
    assert.equal(r.sampleSize, 3);
    assert.equal(r.value, 1, 'window must keep only the most recent samples, dropping the old failures');
  });

  it('legacy pre-role-tag ledger rows (no "(role=...)" in change) are treated as unlabeled, never misparsed', () => {
    const file = tmpLedger();
    // Old-format rows written before this feature landed: no role tag in `change` at all.
    for (let i = 0; i < 5; i++) {
      recordPrediction({
        id: `legacy${i}`,
        subject: `fleet-route:legacy${i}`,
        change: `route legacy${i} → glm`,
        predictedEffects: [{ target: 'substrate', effect: 'glm', confidence: 0.7 }],
        source: 'fleet-router-mlp',
        ts: new Date(2026, 0, i + 1).toISOString(),
      }, { file });
      recordOutcome({
        predictionId: `legacy${i}`,
        observedEffects: [{ target: 'substrate', effect: 'glm' }, { target: 'success', effect: 1 }],
        ts: new Date(2026, 0, i + 1).toISOString(),
      }, { file });
    }
    const r = historicalSuccess('engineer', 'glm-workhorse', { file, minSamples: 1 });
    assert.equal(r.fallback, true, 'legacy rows carry no parseable role and must not be counted as matched samples');
    assert.equal(r.sampleSize, 0);
  });

  it('is deterministic: repeated calls on the same ledger snapshot return the same value', () => {
    const file = tmpLedger();
    writePair(file, { id: 'a', role: 'engineer', substrate: 'glm', success: 1, ts: new Date(2026, 0, 1).toISOString() });
    writePair(file, { id: 'b', role: 'engineer', substrate: 'glm', success: 0, ts: new Date(2026, 0, 2).toISOString() });
    writePair(file, { id: 'c', role: 'engineer', substrate: 'glm', success: 1, ts: new Date(2026, 0, 3).toISOString() });
    const r1 = historicalSuccess('engineer', 'glm-workhorse', { file, minSamples: 3 });
    const r2 = historicalSuccess('engineer', 'glm-workhorse', { file, minSamples: 3 });
    assert.deepEqual(r1, r2);
  });

  it('exported constants are stable and reasonable', () => {
    assert.equal(typeof HISTORICAL_SUCCESS_FALLBACK, 'number');
    assert.ok(HISTORICAL_SUCCESS_FALLBACK >= 0 && HISTORICAL_SUCCESS_FALLBACK <= 1);
    assert.ok(Number.isInteger(HISTORICAL_SUCCESS_MIN_SAMPLES) && HISTORICAL_SUCCESS_MIN_SAMPLES >= 1);
    assert.ok(Number.isInteger(HISTORICAL_SUCCESS_WINDOW) && HISTORICAL_SUCCESS_WINDOW >= HISTORICAL_SUCCESS_MIN_SAMPLES);
  });

  it('extractFeatures still honors an explicit context.historicalSuccess override (back-compat)', () => {
    const feats = extractFeatures({ role: 'engineer' }, { historicalSuccess: 0.42 });
    assert.equal(feats[3], 0.42);
  });

  it('extractFeatures with no ledger and no override falls back to the documented neutral default', () => {
    const file = tmpLedger();
    const feats = extractFeatures(
      { role: 'engineer', prompt: 'x' },
      { historicalLedgerFile: file, historicalSubstrate: 'glm' },
    );
    assert.equal(feats[3], HISTORICAL_SUCCESS_FALLBACK);
  });
});
