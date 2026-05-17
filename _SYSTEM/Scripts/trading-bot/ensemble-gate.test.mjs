#!/usr/bin/env node
import assert from 'node:assert/strict';
import {
  shouldRunFullEnsemble,
  applyRollingBrierWeights,
} from './ensemble-inference.mjs';

const rejected = shouldRunFullEnsemble(
  { market_id: 'LOW', quality_score: 0.1, source_count: 0, sentiment_score: 0 },
  {},
  { enabled: true, logOnly: false, minQuality: 0.3, minEdge: 0.02, minSources: 1 },
);
assert.equal(rejected.run, false);
assert.equal(rejected.enforced, true);

const logOnly = shouldRunFullEnsemble(
  { market_id: 'LOW', quality_score: 0.1, source_count: 0, sentiment_score: 0 },
  {},
  { enabled: true, logOnly: true, minQuality: 0.3, minEdge: 0.02, minSources: 1 },
);
assert.equal(logOnly.run, true);
assert.equal(logOnly.enforced, false);

const weights = applyRollingBrierWeights(
  { claude: 0.2, grok: 0.2, gpt4o: 0.2, deepseek: 0.2, gemini: 0.2 },
  'financial',
  { market_types: { financial: { models: { deepseek: { brierScore: 0.1, sampleCount: 5 }, grok: { brierScore: 0.4, sampleCount: 5 } } } } },
);
assert.ok(weights.deepseek > weights.grok);

console.log('ensemble-gate.test: ok');
