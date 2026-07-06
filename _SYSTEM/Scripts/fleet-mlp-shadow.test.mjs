import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { recordMlpCounterfactualShadow, isMlpShadowArmed, COUNTERFACTUAL_SHADOW_FILE } from './fleet-mlp-feedback.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

test('recordMlpCounterfactualShadow skips when disarmed', () => {
  const prev = process.env.YURI_MLP_SHADOW;
  delete process.env.YURI_MLP_SHADOW;
  const flag = path.join(REPO, '_SYSTEM/state/mlp-shadow.enabled');
  const had = fs.existsSync(flag);
  if (had) fs.renameSync(flag, `${flag}.bak-test`);
  try {
    const r = recordMlpCounterfactualShadow({ glmLeaves: [], nativeSpecs: [] });
    assert.equal(r.skipped, true);
  } finally {
    if (had) fs.renameSync(`${flag}.bak-test`, flag);
    if (prev !== undefined) process.env.YURI_MLP_SHADOW = prev;
  }
});

test('recordMlpCounterfactualShadow appends when armed', () => {
  const prev = process.env.YURI_MLP_SHADOW;
  process.env.YURI_MLP_SHADOW = '1';
  const before = fs.existsSync(COUNTERFACTUAL_SHADOW_FILE)
    ? fs.readFileSync(COUNTERFACTUAL_SHADOW_FILE, 'utf8').split('\n').filter(Boolean).length
    : 0;
  try {
    const plan = {
      nativeSpecs: [{
        id: 't1',
        role: 'scout',
        routerSuggestion: { id: 't1-ollama', substrate: 'ollama', lane: 'ollama-flash' },
        routerConfidence: 0.4,
        routerRanked: [{ id: 't1-ollama', substrate: 'ollama', score: 0.7 }, { id: 't1', substrate: 'native', score: 0.5 }],
        affinityApplied: 'ollama-flash',
        dispatch: 'ollama-sidecar',
      }],
    };
    const r = recordMlpCounterfactualShadow(plan, { quotaPressure: 0.5 });
    assert.equal(r.skipped, false);
    assert.ok(r.count >= 1);
    const after = fs.readFileSync(COUNTERFACTUAL_SHADOW_FILE, 'utf8').split('\n').filter(Boolean).length;
    assert.ok(after > before);
    const last = JSON.parse(fs.readFileSync(COUNTERFACTUAL_SHADOW_FILE, 'utf8').trim().split('\n').pop());
    assert.equal(last.type, 'counterfactual-shadow');
    assert.equal(last.leafId, 't1');
  } finally {
    if (prev === undefined) delete process.env.YURI_MLP_SHADOW;
    else process.env.YURI_MLP_SHADOW = prev;
  }
});
