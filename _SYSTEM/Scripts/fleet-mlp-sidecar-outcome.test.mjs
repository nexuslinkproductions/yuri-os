import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deriveLeafOutcome, enrichRunResultWithSidecarPools } from './fleet-mlp-feedback.mjs';

test('enrichRunResultWithSidecarPools merges ollama sidecar results into pool', () => {
  const enriched = enrichRunResultWithSidecarPools({
    swarm: { poolOutputs: {} },
    ollamaSidecarResults: {
      results: [{
        label: 'SMOKE-M1-minimax',
        ok: true,
        resultLabel: '17OL_SMOKE_MINIMAX_X_PASS_COMMITTED',
        text: 'enabled flag present\n17OL_SMOKE_MINIMAX_X_PASS_COMMITTED',
      }],
    },
  });
  const o = deriveLeafOutcome('SMOKE-M1-minimax', enriched);
  assert.ok(!o.skipped);
  assert.equal(o.actualSubstrate, 'ollama');
  assert.equal(o.success, 1);
});

test('deriveLeafOutcome skips sidecar leaf only when truly empty', () => {
  const enriched = enrichRunResultWithSidecarPools({
    swarm: { poolOutputs: {} },
    ollamaSidecarResults: {
      results: [{ label: 'empty-leaf', ok: false, resultLabel: '', text: '' }],
    },
  });
  const o = deriveLeafOutcome('empty-leaf', enriched);
  assert.equal(o.skipped, true);
  assert.equal(o.reason, 'empty-outcome');
});
