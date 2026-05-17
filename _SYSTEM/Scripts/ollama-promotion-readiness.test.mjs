import assert from 'node:assert/strict';

import {
  evaluatePromotionReadiness,
  summarizeRouteClasses,
} from './ollama-promotion-readiness.mjs';

function row({
  lane,
  provider = lane,
  operation_type,
  status = 'ok',
  latency_ms = 100,
  cost_usd = 0.01,
  effective_tokens = 100,
  metadata = {},
  created_at = '2026-05-10T12:00:00.000Z',
}) {
  return {
    lane,
    provider,
    operation_type,
    status,
    latency_ms,
    cost_usd,
    effective_tokens,
    metadata_json: JSON.stringify(metadata),
    created_at,
  };
}

const rows = [
  ...Array.from({ length: 30 }, (_, index) => row({
    lane: 'ollama-local',
    operation_type: 'doc_generate',
    latency_ms: 60 + index,
    cost_usd: 0.004,
    metadata: index === 0 ? { rollback_path_proven: true, candidate_score: 0.78, baseline_score: 0.71 } : { candidate_score: 0.78, baseline_score: 0.71 },
  })),
  ...Array.from({ length: 25 }, (_, index) => row({
    lane: 'summarize-local',
    operation_type: 'doc_generate',
    latency_ms: 120 + index,
    cost_usd: 0.007,
    metadata: { candidate_score: 0.78, baseline_score: 0.71 },
  })),
  ...Array.from({ length: 12 }, () => row({
    lane: 'ollama-local',
    operation_type: 'triage',
    latency_ms: 50,
    cost_usd: 0.003,
  })),
  ...Array.from({ length: 30 }, (_, index) => row({
    lane: 'ollama-local',
    operation_type: 'embedding',
    latency_ms: 42 + index,
    cost_usd: 0.002,
    metadata: index === 0 ? { security_regression: true, candidate_score: 0.61, baseline_score: 0.64 } : { candidate_score: 0.61, baseline_score: 0.64 },
  })),
  ...Array.from({ length: 25 }, (_, index) => row({
    lane: 'triage-local',
    operation_type: 'embedding',
    latency_ms: 80 + index,
    cost_usd: 0.005,
    metadata: { candidate_score: 0.61, baseline_score: 0.64 },
  })),
];

const routeClasses = summarizeRouteClasses(rows);
const readiness = evaluatePromotionReadiness(routeClasses);

assert.equal(routeClasses.summarization.total, 55, 'summarization traces should aggregate');
assert.equal(readiness.summarization.promotion_ready, true, 'summarization should meet promotion gates');
assert.equal(readiness.summarization.gates.comparable_traces_per_route_class.satisfied, true, 'trace count gate should pass');
assert.equal(readiness.summarization.gates.evaluator_beats_baseline.satisfied, true, 'candidate should beat baseline');
assert.equal(readiness.summarization.gates.rollback_path_proven.satisfied, true, 'rollback path should be proven');
assert.equal(readiness.summarization.gates.no_security_regression.satisfied, true, 'summarization should have no security regression');
assert.equal(readiness.summarization.recommendations[0].action, 'promotion_candidate', 'summarization should be eligible for promotion candidate status');

assert.equal(routeClasses.triage.total, 12, 'triage traces should aggregate');
assert.equal(readiness.triage.promotion_ready, false, 'triage should not be ready with too few traces');
assert.equal(readiness.triage.recommendations[0].action, 'collect_more_traces', 'triage should request more traces');

assert.equal(routeClasses.retrieval.total, 55, 'retrieval traces should aggregate');
assert.equal(readiness.retrieval.gates.no_security_regression.satisfied, false, 'security regression should block promotion');
assert.equal(readiness.retrieval.recommendations[0].action, 'block_promotion', 'security regression should block promotion');

console.log('ollama-promotion-readiness: pass');
