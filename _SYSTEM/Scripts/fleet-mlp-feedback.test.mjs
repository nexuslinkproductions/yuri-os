import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, statSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  shouldPersistMlp,
  recordMlpFeedbackStub,
  recordMlpPredictions,
  recordMlpOutcomesFromRun,
  deriveLeafOutcome,
} from './fleet-mlp-feedback.mjs';
import { recordPrediction, recordOutcome } from './prediction-ledger.mjs';

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
    assert.equal(shouldPersistMlp({ dryRun: false, persist: false }), false);
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
  // ── Fail-label calibration defect: !!label fallback must not catch explicit failures ──

  it('deriveLeafOutcome marks F-type label as failure even with ok status', () => {
    // F-type = lane self-declared FAILURE. The !!label fallback used to count this as
    // success=1, feeding a false-positive gradient to the MLP router.
    const o = deriveLeafOutcome('leaf-f', {
      swarm: { poolOutputs: { 'leaf-f': { status: 'ok', label: '08CW_AUDIT_F_PASS_COMMITTED', text: 'self-declared failure' } } },
    });
    assert.equal(o.skipped, undefined, 'a labeled outcome must not be skipped');
    assert.equal(o.success, 0, 'F-type (failure) label must NOT count as success regardless of status');
  });

  it('deriveLeafOutcome marks BLOCKED terminal as failure even with ok status', () => {
    // BLOCKED terminal = work did not complete. Even with P-type self-certification,
    // a blocked task is a routing failure — the substrate could not complete the work.
    const o = deriveLeafOutcome('leaf-b', {
      swarm: { poolOutputs: { 'leaf-b': { status: 'ok', label: '08CW_TASK_P_BLOCKED', text: 'task blocked' } } },
    });
    assert.equal(o.skipped, undefined);
    assert.equal(o.success, 0, 'BLOCKED terminal must NOT count as success');
  });

  it('deriveLeafOutcome marks REPAIR_REQUIRED terminal as failure even with ok status', () => {
    const o = deriveLeafOutcome('leaf-r', {
      swarm: { poolOutputs: { 'leaf-r': { status: 'ok', label: '08CW_TASK_X_REPAIR_REQUIRED', text: 'needs repair' } } },
    });
    assert.equal(o.skipped, undefined);
    assert.equal(o.success, 0, 'REPAIR_REQUIRED terminal must NOT count as success');
  });

  it('deriveLeafOutcome F-type with COMMITTED terminal (no PASS) is also failure', () => {
    const o = deriveLeafOutcome('leaf-fc', {
      swarm: { poolOutputs: { 'leaf-fc': { status: 'ok', label: '08CW_TASK_F_COMMITTED', text: 'committed failure' } } },
    });
    assert.equal(o.skipped, undefined);
    assert.equal(o.success, 0, 'F-type COMMITTED must NOT count as success');
  });

  it('deriveLeafOutcome P-type COMMITTED (no PASS, no BLOCKED) still counts as degraded success', () => {
    // Negative-path: P/X-type with plain COMMITTED (not PASS, not BLOCKED/REPAIR) is
    // a degraded pass — the lane self-certified but without explicit PASS verification.
    // The !!label fallback correctly handles this ambiguous case.
    const o = deriveLeafOutcome('leaf-pc', {
      swarm: { poolOutputs: { 'leaf-pc': { status: 'ok', label: '08CW_TASK_P_COMMITTED', text: 'committed' } } },
    });
    assert.equal(o.skipped, undefined);
    assert.equal(o.success, 1, 'P-type COMMITTED is a degraded success, not a failure');
    assert.equal(o.quality, 0.65);
  });
});

/** Seed a matched, labeled (role, substrate) sample directly on a ledger file — mirrors the
 * shape recordMlpPredictions/recordMlpOutcomesFromRun write in production. */
function seedMatchedSample(ledgerFile, { id, role, substrate, success, ts }) {
  recordPrediction({
    id,
    subject: `fleet-route:${id}`,
    change: `route ${id} (role=${role}) → ${substrate}`,
    predictedEffects: [{ target: 'substrate', effect: substrate, confidence: 0.7 }],
    source: 'fleet-router-mlp',
    ts,
  }, { file: ledgerFile });
  recordOutcome({
    predictionId: id,
    observedEffects: [
      { target: 'substrate', effect: substrate },
      { target: 'success', effect: success },
      { target: 'quality', effect: success ? 0.9 : 0.2 },
    ],
    ts,
  }, { file: ledgerFile });
}

function planWithLeaf(id, role, substrate) {
  return {
    glmLeaves: [{
      id, role, prompt: 'test task',
      routerSuggestion: { substrate, lane: substrate === 'glm' ? 'glm-max' : substrate },
      routerConfidence: 0.72,
    }],
    nativeSpecs: [],
  };
}

function okRunResult(id) {
  return {
    swarm: {
      converged: true,
      poolOutputs: { [id]: { status: 'ok', label: '01AA_TEST_X_PASS_COMMITTED', text: 'done' } },
    },
  };
}

describe('fleet-mlp-feedback: Track-A historicalSuccess evidence bridge', () => {
  it('threshold met: writes exactly ONE aggregated snapshot, never a raw per-outcome row', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'mlp-evidence-'));
    const ledgerFile = join(dir, 'ledger.jsonl');
    const memoryLogPath = join(dir, 'memory-ledger.jsonl');
    // 2 prior matched samples — below HISTORICAL_SUCCESS_MIN_SAMPLES(3) on their own.
    seedMatchedSample(ledgerFile, { id: 'seed1', role: 'engineer', substrate: 'glm', success: 1, ts: new Date(2026, 0, 1).toISOString() });
    seedMatchedSample(ledgerFile, { id: 'seed2', role: 'engineer', substrate: 'glm', success: 1, ts: new Date(2026, 0, 2).toISOString() });

    const plan = planWithLeaf('leaf-x', 'engineer', 'glm');
    const pred = await recordMlpPredictions(plan, {}, { persist: true, ledgerFile });
    const out = await recordMlpOutcomesFromRun(plan, okRunResult('leaf-x'), pred, { persist: true, ledgerFile, memoryLogPath });

    // Primary path unaffected.
    assert.equal(out.records[0].success, 1);
    assert.equal(out.skippedOutcomes, 0);

    // Aggregated evidence: exactly one snapshot, sampleSize 3 (2 seeded + this run's own outcome).
    assert.equal(out.memoryEvidence.length, 1);
    const snap = out.memoryEvidence[0];
    assert.equal(snap.skipped, false);
    assert.equal(snap.role, 'engineer');
    assert.equal(snap.substrateFamily, 'glm-workhorse');
    assert.equal(snap.sampleSize, 3);
    assert.equal(snap.value, 1);

    // The Track-A ledger itself carries exactly one aggregated row, never a raw per-outcome dump.
    const lines = readFileSync(memoryLogPath, 'utf8').trim().split('\n').filter(Boolean);
    assert.equal(lines.length, 1);
    const row = JSON.parse(lines[0]);
    assert.equal(row.type, 'evidence');
    assert.equal(row.metadata.role, 'engineer');
    assert.equal(row.metadata.substrateFamily, 'glm-workhorse');
    assert.equal(row.metadata.sampleSize, 3);
    assert.equal(row.content.includes('resultLabel'), false, 'must never leak a raw per-outcome field');
    assert.equal(row.content.includes('01AA_TEST'), false, 'must never leak the raw RESULT_LABEL');
  });

  it('below minimum samples: no evidence snapshot is written, Track-A ledger untouched', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'mlp-evidence-'));
    const ledgerFile = join(dir, 'ledger.jsonl');
    const memoryLogPath = join(dir, 'memory-ledger.jsonl');

    const plan = planWithLeaf('leaf-y', 'engineer', 'glm');
    const pred = await recordMlpPredictions(plan, {}, { persist: true, ledgerFile });
    const out = await recordMlpOutcomesFromRun(plan, okRunResult('leaf-y'), pred, { persist: true, ledgerFile, memoryLogPath });

    assert.equal(out.memoryEvidence.length, 1);
    assert.equal(out.memoryEvidence[0].skipped, true);
    assert.equal(out.memoryEvidence[0].reason, 'below-min-samples');
    assert.equal(out.memoryEvidence[0].sampleSize, 1);

    let size = 0;
    try { size = statSync(memoryLogPath).size; } catch { size = 0; }
    assert.equal(size, 0, 'no Track-A entry may be written below the minimum-sample threshold');
  });

  it('malformed/empty outcome produces no evidence at all (never fabricates a false snapshot)', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'mlp-evidence-'));
    const ledgerFile = join(dir, 'ledger.jsonl');
    const memoryLogPath = join(dir, 'memory-ledger.jsonl');
    // Even with plenty of matched prior history, THIS run's own outcome is empty/unlabeled.
    seedMatchedSample(ledgerFile, { id: 'seed1', role: 'engineer', substrate: 'glm', success: 1, ts: new Date(2026, 0, 1).toISOString() });
    seedMatchedSample(ledgerFile, { id: 'seed2', role: 'engineer', substrate: 'glm', success: 1, ts: new Date(2026, 0, 2).toISOString() });
    seedMatchedSample(ledgerFile, { id: 'seed3', role: 'engineer', substrate: 'glm', success: 1, ts: new Date(2026, 0, 3).toISOString() });

    const plan = planWithLeaf('leaf-z', 'engineer', 'glm');
    const pred = await recordMlpPredictions(plan, {}, { persist: true, ledgerFile });
    const emptyRunResult = { swarm: { poolOutputs: { 'leaf-z': { status: 'error', label: '', text: '' } } } };
    const out = await recordMlpOutcomesFromRun(plan, emptyRunResult, pred, { persist: true, ledgerFile, memoryLogPath });

    assert.equal(out.skippedOutcomes, 1);
    assert.equal(out.memoryEvidence.length, 0, 'a skipped/malformed outcome must never reach the evidence bridge');
    let size = 0;
    try { size = statSync(memoryLogPath).size; } catch { size = 0; }
    assert.equal(size, 0);
  });

  it('delta-gating: an unchanged snapshot value is NOT re-appended on the next run', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'mlp-evidence-'));
    const ledgerFile = join(dir, 'ledger.jsonl');
    const memoryLogPath = join(dir, 'memory-ledger.jsonl');
    seedMatchedSample(ledgerFile, { id: 'seed1', role: 'engineer', substrate: 'glm', success: 1, ts: new Date(2026, 0, 1).toISOString() });
    seedMatchedSample(ledgerFile, { id: 'seed2', role: 'engineer', substrate: 'glm', success: 1, ts: new Date(2026, 0, 2).toISOString() });

    const plan1 = planWithLeaf('leaf-d1', 'engineer', 'glm');
    const pred1 = await recordMlpPredictions(plan1, {}, { persist: true, ledgerFile });
    const out1 = await recordMlpOutcomesFromRun(plan1, okRunResult('leaf-d1'), pred1, { persist: true, ledgerFile, memoryLogPath });
    assert.equal(out1.memoryEvidence[0].skipped, false);
    assert.equal(out1.memoryEvidence[0].sampleSize, 3);
    assert.equal(out1.memoryEvidence[0].value, 1);

    // A second success barely moves sampleSize (3→4, below the 5-sample step) and not at all the
    // mean (still 1.0, below the 0.05 delta threshold) — must be treated as no material change.
    const plan2 = planWithLeaf('leaf-d2', 'engineer', 'glm');
    const pred2 = await recordMlpPredictions(plan2, {}, { persist: true, ledgerFile });
    const out2 = await recordMlpOutcomesFromRun(plan2, okRunResult('leaf-d2'), pred2, { persist: true, ledgerFile, memoryLogPath });
    assert.equal(out2.memoryEvidence[0].skipped, true);
    assert.equal(out2.memoryEvidence[0].reason, 'no-material-change');

    const lines = readFileSync(memoryLogPath, 'utf8').trim().split('\n').filter(Boolean);
    assert.equal(lines.length, 1, 'no-material-change must not append a second Track-A row');
  });

  it('a memory-bridge failure (e.g. IO fault) never aborts primary outcome/ledger recording', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'mlp-evidence-'));
    const ledgerFile = join(dir, 'ledger.jsonl');
    seedMatchedSample(ledgerFile, { id: 'seed1', role: 'engineer', substrate: 'glm', success: 1, ts: new Date(2026, 0, 1).toISOString() });
    seedMatchedSample(ledgerFile, { id: 'seed2', role: 'engineer', substrate: 'glm', success: 1, ts: new Date(2026, 0, 2).toISOString() });

    const plan = planWithLeaf('leaf-fail', 'engineer', 'glm');
    const pred = await recordMlpPredictions(plan, {}, { persist: true, ledgerFile });
    // A directory path forces recallEntries/appendMemoryEntry to throw (EISDIR).
    const out = await recordMlpOutcomesFromRun(plan, okRunResult('leaf-fail'), pred, { persist: true, ledgerFile, memoryLogPath: dir });

    // Primary outcome recording must complete normally despite the bridge fault.
    assert.equal(out.records.length, 1);
    assert.equal(out.records[0].success, 1);
    assert.equal(out.persisted, true);

    assert.equal(out.memoryEvidence.length, 1);
    assert.equal(out.memoryEvidence[0].skipped, true);
    assert.equal(out.memoryEvidence[0].reason, 'evidence-bridge-error');
    assert.equal(typeof out.memoryEvidence[0].error, 'string');
  });
});

describe('fleet-mlp-feedback: custom ledger path reaches extractFeatures (historicalLedgerFile)', () => {
  // Inject a recording router via the opts.router DI seam (production never passes it) so the
  // exact context handed to extractFeatures is observable on both the prediction and outcome paths.
  function recordingRouter() {
    const calls = [];
    return {
      calls,
      extractFeatures: (task, ctx) => { calls.push({ stage: 'extract', ctx }); return new Array(8).fill(0); },
      updateFromOutcome: async () => ({ persisted: false, error: null }),
    };
  }

  it('recordMlpPredictions threads opts.ledgerFile as historicalLedgerFile into extractFeatures', async () => {
    const router = recordingRouter();
    const ledgerFile = '/tmp/custom-prediction-ledger.jsonl';
    const plan = planWithLeaf('leaf-p', 'engineer', 'glm');
    await recordMlpPredictions(plan, {}, { router, ledgerFile });
    const extractCalls = router.calls.filter((c) => c.stage === 'extract');
    assert.ok(extractCalls.length > 0, 'extractFeatures was never called');
    for (const c of extractCalls) {
      assert.equal(c.ctx.historicalLedgerFile, ledgerFile,
        `prediction extractFeatures did not receive historicalLedgerFile; got ctx=${JSON.stringify(c.ctx)}`);
    }
  });

  it('recordMlpOutcomesFromRun threads opts.ledgerFile as historicalLedgerFile into extractFeatures', async () => {
    const router = recordingRouter();
    const ledgerFile = '/tmp/custom-outcome-ledger.jsonl';
    const plan = planWithLeaf('leaf-o', 'engineer', 'glm');
    await recordMlpOutcomesFromRun(plan, okRunResult('leaf-o'), {}, { router, ledgerFile });
    const extractCalls = router.calls.filter((c) => c.stage === 'extract');
    assert.ok(extractCalls.length > 0, 'extractFeatures was never called');
    for (const c of extractCalls) {
      assert.equal(c.ctx.historicalLedgerFile, ledgerFile,
        `outcome extractFeatures did not receive historicalLedgerFile; got ctx=${JSON.stringify(c.ctx)}`);
    }
  });

  it('when opts.ledgerFile is unset, no historicalLedgerFile key is forced (common path untouched)', async () => {
    const router = recordingRouter();
    const plan = planWithLeaf('leaf-u', 'engineer', 'glm');
    await recordMlpPredictions(plan, {}, { router });
    await recordMlpOutcomesFromRun(plan, okRunResult('leaf-u'), {}, { router });
    assert.ok(router.calls.length > 0, 'no extractFeatures calls captured');
    for (const c of router.calls) {
      assert.equal('historicalLedgerFile' in c.ctx, false,
        `common path must not force historicalLedgerFile; got ctx=${JSON.stringify(c.ctx)}`);
    }
  });
});
