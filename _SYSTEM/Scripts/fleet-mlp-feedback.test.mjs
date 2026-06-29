import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  shouldPersistMlp,
  recordMlpFeedbackStub,
  recordMlpPredictions,
  recordMlpOutcomesFromRun,
  deriveLeafOutcome,
} from './fleet-mlp-feedback.mjs';

function fakePlan() {
  return {
    glmLeaves: [{
      id: 'leaf-a',
      role: 'engineer',
      prompt: 'test task',
      routerSuggestion: { substrate: 'glm', lane: 'glm-max' },
      routerConfidence: 0.72,
    }],
    nativeSpecs: [],
  };
}

describe('fleet-mlp-feedback', () => {
  it('dry-run stub: advisory, no persist', async () => {
    const r = await recordMlpFeedbackStub(fakePlan(), { quotaPressure: 0.4 });
    assert.equal(r.advisory, true);
    assert.equal(r.persisted, false);
    assert.ok(r.count >= 0);
  });

  it('shouldPersistMlp false by default (dry-run)', () => {
    assert.equal(shouldPersistMlp({ dryRun: true }), false);
    assert.equal(shouldPersistMlp({ dryRun: false }), false);
  });

  it('shouldPersistMlp true when persist flag set', () => {
    assert.equal(shouldPersistMlp({ dryRun: false, persist: true }), true);
    assert.equal(shouldPersistMlp({ dryRun: false, mlpLearn: true }), true);
  });

  it('recordMlpPredictions dry path: ids without ledger write', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'mlp-pred-'));
    const ledger = join(dir, 'ledger.jsonl');
    const r = await recordMlpPredictions(fakePlan(), {}, { dryRun: true, ledgerFile: ledger });
    assert.ok(r.ids['leaf-a']);
    let size = 0;
    try { size = statSync(ledger).size; } catch { size = 0; }
    assert.equal(size, 0);
  });

  it('recordMlpOutcomesFromRun with mock run derives success from pool', async () => {
    const plan = fakePlan();
    const pred = await recordMlpPredictions(plan, {}, { dryRun: true });
    const runResult = {
      swarm: {
        converged: true,
        poolOutputs: {
          'leaf-a': { status: 'ok', label: '07O1_OPERATIONAL_MLP_X_PASS_COMMITTED', text: 'done' },
        },
      },
    };
    const out = await recordMlpOutcomesFromRun(plan, runResult, pred, { dryRun: true, persist: false });
    assert.equal(out.persisted, false);
    assert.equal(out.count, 1);
    assert.equal(out.records[0].success, 1);
  });

  it('deriveLeafOutcome marks fail without ok status', () => {
    const o = deriveLeafOutcome('x', { swarm: { poolOutputs: { x: { status: 'fail' } } } });
    assert.equal(o.success, 0);
  });
});
