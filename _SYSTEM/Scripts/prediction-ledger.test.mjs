// roadmap organ 5 — prediction-ledger tests
// All tests use temp files via fs.mkdtempSync in os.tmpdir().

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  recordPrediction,
  recordOutcome,
  scorePrediction,
  calibrationReport,
  readLedger,
} from './prediction-ledger.mjs';

function tmpFile() {
  return join(mkdtempSync(join(tmpdir(), 'pl-')), 'ledger.jsonl');
}

describe('prediction-ledger', () => {

  it('1. perfect prediction → brier 0, hit counted', () => {
    const file = tmpFile();
    const { row: pred } = recordPrediction({
      subject: 'modA',
      change: 'refactor X',
      predictedEffects: [{ target: 'perf', effect: 'improves', confidence: 1 }],
      source: 'test',
      ts: 100,
    }, { file });

    const outcome = {
      predictionId: pred.id,
      observedEffects: [{ target: 'perf', effect: 'improves' }],
      ts: 200,
    };
    const s = scorePrediction(pred, outcome);

    assert.equal(s.brier, 0);
    assert.equal(s.hits, 1);
    assert.equal(s.misses, 0);
    assert.equal(s.falseAlarms, 0);
    assert.equal(s.detail.length, 1);
    assert.equal(s.detail[0].hit, true);
  });

  it('2. confident miss → per-target brier 0.81', () => {
    const pred = {
      predictedEffects: [{ target: 'latency', effect: 'improves', confidence: 0.9 }],
    };
    const outcome = {
      observedEffects: [{ target: 'latency', effect: 'breaks' }],
    };
    const s = scorePrediction(pred, outcome);

    assert.equal(s.brier, 0.81);
    assert.equal(s.hits, 0);
    assert.equal(s.falseAlarms, 1);
    assert.equal(s.misses, 0);
    assert.equal(s.detail[0].hit, false);
    assert.equal(s.detail[0].brier, 0.81);
  });

  it('3. unpredicted observed effect → miss, mean brier reflects 1.0 penalty', () => {
    const pred = {
      predictedEffects: [{ target: 'cpu', effect: 'improves', confidence: 1 }],
    };
    const outcome = {
      observedEffects: [
        { target: 'cpu', effect: 'improves' },
        { target: 'mem', effect: 'breaks' },
      ],
    };
    const s = scorePrediction(pred, outcome);

    assert.equal(s.hits, 1);
    assert.equal(s.misses, 1);
    assert.equal(s.falseAlarms, 0);
    // mean = (0 + 1) / 2 = 0.5
    assert.equal(s.brier, 0.5);

    const missDetail = s.detail.find(d => d.target === 'mem');
    assert.equal(missDetail.miss, true);
    assert.equal(missDetail.brier, 1);
  });

  it('4. calibration buckets: two 0.9 predictions → 0.8-1 bucket, hitRate 0.5', () => {
    const file = tmpFile();

    // Prediction 1: hit
    const { row: p1 } = recordPrediction({
      subject: 'a', change: 'c1',
      predictedEffects: [{ target: 'x', effect: 'improves', confidence: 0.9 }],
      source: 't', ts: 10,
    }, { file });
    recordOutcome({
      predictionId: p1.id,
      observedEffects: [{ target: 'x', effect: 'improves' }],
      ts: 20,
    }, { file });

    // Prediction 2: false alarm (effect didn't occur)
    const { row: p2 } = recordPrediction({
      subject: 'b', change: 'c2',
      predictedEffects: [{ target: 'y', effect: 'improves', confidence: 0.9 }],
      source: 't', ts: 30,
    }, { file });
    recordOutcome({
      predictionId: p2.id,
      observedEffects: [{ target: 'y', effect: 'breaks' }],
      ts: 40,
    }, { file });

    const r = calibrationReport({ file });
    assert.equal(r.n, 2);
    assert.equal(r.unresolved.length, 0);

    const bucket = r.byConfidenceBucket.find(b => b.bucket === '0.8-1');
    assert.equal(bucket.n, 2);
    assert.equal(bucket.hitRate, 0.5);
    // Per-effect brier: (0.9-1)^2 = 0.01, (0.9-0)^2 = 0.81 → mean 0.41
    assert.ok(Math.abs(bucket.meanBrier - 0.41) < 1e-10);
  });

  it('5. unresolved predictions listed, excluded from meanBrier', () => {
    const file = tmpFile();

    // Resolved: perfect hit → brier 0
    const { row: p1 } = recordPrediction({
      subject: 'a', change: 'c1',
      predictedEffects: [{ target: 'x', effect: 'improves', confidence: 1 }],
      source: 't', ts: 10,
    }, { file });
    recordOutcome({
      predictionId: p1.id,
      observedEffects: [{ target: 'x', effect: 'improves' }],
      ts: 20,
    }, { file });

    // Unresolved: no outcome
    const { row: p2 } = recordPrediction({
      subject: 'b', change: 'c2',
      predictedEffects: [{ target: 'y', effect: 'improves', confidence: 0.5 }],
      source: 't', ts: 30,
    }, { file });
    // deliberately no recordOutcome for p2

    const r = calibrationReport({ file });

    assert.equal(r.n, 1);
    assert.ok(r.unresolved.includes(p2.id));
    assert.equal(r.unresolved.length, 1);
    // meanBrier only from resolved p1: perfect hit → 0
    assert.equal(r.meanBrier, 0);
  });

  it('6. corrupt JSONL line skipped without throwing; valid rows still parsed', () => {
    const file = tmpFile();

    // Valid row 1
    recordPrediction({
      subject: 'a', change: 'c1',
      predictedEffects: [{ target: 'x', effect: 'improves', confidence: 1 }],
      source: 't', ts: 10,
    }, { file });

    // Inject corrupt line
    writeFileSync(file, 'NOT JSON\n', { flag: 'a' });

    // Valid row 2
    recordPrediction({
      subject: 'b', change: 'c2',
      predictedEffects: [{ target: 'y', effect: 'improves', confidence: 0.5 }],
      source: 't', ts: 30,
    }, { file });

    // Capture stderr to verify warning
    let stderrMsg = '';
    const origWrite = process.stderr.write;
    process.stderr.write = (chunk) => { stderrMsg += String(chunk); return true; };
    try {
      const rows = readLedger({ file });
      assert.equal(rows.length, 2);
      assert.equal(rows[0].subject, 'a');
      assert.equal(rows[1].subject, 'b');
      assert.match(stderrMsg, /1 corrupt/);
    } finally {
      process.stderr.write = origWrite;
    }
  });

});
