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
    const o = deriveLeafOutcome('x', {
      swarm: { poolOutputs: { x: { status: 'fail', text: 'Error: build failed during compilation step' } } },
    });
    assert.equal(o.skipped, undefined);
    assert.equal(o.success, 0);
  });

  // WS-J-K1 outcome gate (MURE §B.2)
  it('deriveLeafOutcome skips empty outcome (no label + no text)', () => {
    const o = deriveLeafOutcome('leaf-x', { swarm: { poolOutputs: { 'leaf-x': { status: 'ok' } } } });
    assert.equal(o.skipped, true);
    assert.equal(o.reason, 'empty-outcome');
    assert.equal(o.leafId, 'leaf-x');
    // skipped outcomes must NOT carry success/quality — they are not training signal
    assert.equal('success' in o, false);
  });

  it('deriveLeafOutcome skips empty outcome with whitespace-only text', () => {
    const o = deriveLeafOutcome('leaf-x', {
      swarm: { poolOutputs: { 'leaf-x': { status: 'ok', text: '   \n\t  ' } } },
    });
    assert.equal(o.skipped, true);
    assert.equal(o.reason, 'empty-outcome');
  });

  it('deriveLeafOutcome does NOT skip when label present (no text)', () => {
    const o = deriveLeafOutcome('leaf-x', {
      swarm: { poolOutputs: { 'leaf-x': { status: 'ok', label: '07O1_THING_X_PASS_COMMITTED' } } },
    });
    assert.equal(o.skipped, undefined);
    assert.equal(o.success, 1);
    assert.equal(o.quality, 0.9);
  });

  it('deriveLeafOutcome does NOT skip when substantive text present (no label)', () => {
    const longText = 'This is substantive output that exceeds the minimum threshold of sixteen chars.';
    const o = deriveLeafOutcome('leaf-x', {
      swarm: { poolOutputs: { 'leaf-x': { status: 'ok', text: longText } } },
    });
    assert.equal(o.skipped, undefined);
    // no label → success should be 0 (statusOk but no passLabel/label)
    assert.equal(o.success, 0);
  });

  it('deriveLeafOutcome skips missing packet entirely', () => {
    const o = deriveLeafOutcome('leaf-missing', { swarm: { poolOutputs: {} } });
    assert.equal(o.skipped, true);
    assert.equal(o.reason, 'empty-outcome');
  });

  it('recordMlpOutcomesFromRun skips updateFromOutcome on empty outcomes and counts skippedOutcomes', async () => {
    const plan = fakePlan();
    const pred = await recordMlpPredictions(plan, {}, { dryRun: true });
    // Empty pool → leaf-a outcome is skipped
    const runResult = { swarm: { converged: false, poolOutputs: {} } };
    const out = await recordMlpOutcomesFromRun(plan, runResult, pred, { dryRun: true, persist: false });
    assert.equal(out.persisted, false);
    assert.equal(out.skippedOutcomes, 1);
    assert.equal(out.records[0].skipped, true);
    assert.equal(out.records[0].skipReason, 'empty-outcome');
    assert.equal(out.records[0].persisted, false);
  });

  it('recordMlpOutcomesFromRun does NOT skip when outcome has a label', async () => {
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
    assert.equal(out.skippedOutcomes, 0);
    assert.equal(out.records[0].skipped, undefined);
    assert.equal(out.records[0].success, 1);
  });
});
