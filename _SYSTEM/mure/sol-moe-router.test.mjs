import test from 'node:test';
import assert from 'node:assert/strict';

import {
  DEFAULT_POLICY,
  NoEligibleFrontierError,
  classifyTask,
  createLedgerRow,
  produceCandidatePlan,
  routeTask,
} from './sol-moe-router.mjs';

const allAvailable = Object.fromEntries(
  DEFAULT_POLICY.experts.map((expert) => [expert.model, true]),
);

test('classifyTask assigns deterministic pre-LLM R0-R3 risk classes', () => {
  assert.equal(classifyTask({ summary: 'grep config keys', readOnly: true, mechanical: true }).riskClass, 'R0');
  assert.equal(classifyTask({ summary: 'implement a reversible parser', reversible: true, files: ['parser.mjs'] }).riskClass, 'R1');
  assert.equal(classifyTask({ summary: 'design a multi-service migration architecture', files: ['a', 'b', 'c', 'd'] }).riskClass, 'R2');
  assert.equal(classifyTask({ summary: 'audit authentication and rotate production credentials', security: true }).riskClass, 'R3');
});

test('classifyTask defaults ambiguous work to frontier R1 instead of cheap R0', () => {
  const classification = classifyTask({ summary: 'figure out the best approach' });
  assert.equal(classification.riskClass, 'R1');
  assert.equal(classification.taskType, 'general');
});

test('R0 breadth routes to DeepSeek Flash with MiMo as availability fallback', () => {
  const route = routeTask(
    { id: 'scan-1', summary: 'grep all TODO markers', readOnly: true, mechanical: true },
    { availability: allAvailable },
  );
  assert.equal(route.classification.riskClass, 'R0');
  assert.equal(route.producer.model, 'deepseek/deepseek-v4-flash');
  assert.deepEqual(route.producer.dispatch, {
    agentId: 'deepseek-flash',
    model: 'deepseek/deepseek-v4-flash',
    thinking: 'low',
  });
  assert.equal(route.availabilityFallbacks[0].model, 'opencode-go/mimo-v2.5');
  assert.equal(route.qualityEscalations[0].model, 'minimax-portal/MiniMax-M3');
});

test('MiMo stays masked until a completed native auth canary re-enables it', () => {
  const task = { id: 'scan-mask', summary: 'grep all TODO markers', readOnly: true, mechanical: true };
  const masked = routeTask(task);
  assert.equal(masked.producer.model, 'deepseek/deepseek-v4-flash');
  assert.ok(!masked.availabilityFallbacks.some((entry) => entry.model === 'opencode-go/mimo-v2.5'));
  const enabled = routeTask(task, { availability: { 'opencode-go/mimo-v2.5': true } });
  assert.equal(enabled.availabilityFallbacks[0].model, 'opencode-go/mimo-v2.5');
});

test('GLM 5.2 is masked by default until explicit availability evidence re-enables it', () => {
  const route = routeTask({ summary: 'design a service architecture', architecture: true });
  assert.equal(route.producer.model, 'minimax-portal/MiniMax-M3');
  assert.equal(route.selection, 'availability-fallback');
  const enabled = routeTask(
    { summary: 'design a service architecture', architecture: true },
    { availability: { 'zai/glm-5.2': true } },
  );
  assert.equal(enabled.producer.model, 'zai/glm-5.2');
  assert.equal(enabled.selection, 'primary');
});

test('no default task route selects or queues GLM while its availability mask is false', () => {
  const fixtures = [
    { summary: 'orchestrate and delegate agents', orchestration: true },
    { summary: 'grep all references', readOnly: true, mechanical: true },
    { summary: 'implement a reversible parser', reversible: true },
    { summary: 'implement authentication hardening', security: true, implementation: true },
    { summary: 'audit authentication boundaries', security: true },
    { summary: 'change protected governance policy', governance: true },
    { summary: 'design a service architecture', architecture: true },
    { summary: 'analyze a 1M token corpus', longContext: true },
    { summary: 'synthesize the findings', synthesis: true },
    { summary: 'research provider behavior', research: true },
    { summary: 'verify the release gate', verification: true },
    { summary: 'adjudicate competing findings', adjudication: true },
    { summary: 'figure out the best approach' },
  ];
  for (const fixture of fixtures) {
    const route = routeTask(fixture);
    const models = [
      route.producer,
      route.verifier,
      ...route.availabilityFallbacks,
      ...route.qualityEscalations,
    ].filter(Boolean).map((entry) => entry.model);
    assert.ok(!models.includes('zai/glm-5.2'), `GLM leaked into default ${route.classification.taskType} route`);
  }
});

test('R1 implementation uses Terra, preserving M3 for availability and Opus for quality escalation', () => {
  const route = routeTask(
    { id: 'build-1', summary: 'implement a reversible API adapter', reversible: true, files: ['adapter.mjs'] },
    { availability: allAvailable },
  );
  assert.equal(route.classification.riskClass, 'R1');
  assert.equal(route.producer.model, 'openai/gpt-5.6-terra');
  assert.equal(route.availabilityFallbacks[0].model, 'minimax-portal/MiniMax-M3');
  assert.equal(route.qualityEscalations[0].model, 'anthropic/claude-sonnet-5');
});

test('long-context synthesis uses GLM 5.2 and M3 remains its volume fallback', () => {
  const route = routeTask(
    { id: 'synth-1', summary: 'synthesize the whole corpus', longContext: true, readOnly: true, estimatedTokens: 250_000 },
    { availability: allAvailable },
  );
  assert.equal(route.classification.taskType, 'long-context');
  assert.equal(route.producer.model, 'zai/glm-5.2');
  assert.equal(route.availabilityFallbacks[0].model, 'minimax-portal/MiniMax-M3');
});

test('adjudication and red-team work routes to GPT-5.6 Luna as a native role expert', () => {
  const route = routeTask(
    { id: 'adjudicate-1', summary: 'red-team and adjudicate the competing architecture findings', adjudication: true },
    { availability: allAvailable },
  );
  assert.equal(route.classification.taskType, 'adjudication');
  assert.equal(route.classification.riskClass, 'R3');
  assert.equal(route.producer.agentId, 'mure-adjudicator');
  assert.equal(route.producer.model, 'openai/gpt-5.6-luna');
  assert.equal(route.verifier.model, 'anthropic/claude-opus-4-8');
  assert.deepEqual(route.producer.dispatch, {
    agentId: 'mure-adjudicator',
    model: 'openai/gpt-5.6-luna',
    thinking: 'high',
  });
});

test('R2 cheap candidates are evidence-only and rejected as semantic producer or final verifier', () => {
  const plan = produceCandidatePlan(
    classifyTask({ summary: 'design a new service architecture', architecture: true }),
    { availability: allAvailable },
  );
  const cheap = plan.evidenceGatherers.filter((candidate) => candidate.tier === 'cheap');
  assert.equal(cheap.length, 2);
  assert.ok(cheap.every((candidate) => candidate.allowedUses.length === 1 && candidate.allowedUses[0] === 'evidence'));
  assert.ok(plan.rejected.some((entry) => entry.model === 'deepseek/deepseek-v4-flash' && entry.use === 'semantic-producer'));
  assert.ok(plan.rejected.some((entry) => entry.model === 'opencode-go/mimo-v2.5' && entry.use === 'final-verifier'));
  assert.ok(plan.producers.every((candidate) => candidate.tier === 'frontier'));
  assert.ok(plan.verifiers.every((candidate) => candidate.tier === 'frontier'));
});

test('R3 security route requires Opus verification even when Terra produces implementation', () => {
  const route = routeTask(
    { id: 'sec-1', summary: 'patch an authentication bypass', security: true, files: ['auth.mjs'] },
    { availability: allAvailable },
  );
  assert.equal(route.classification.riskClass, 'R3');
  assert.equal(route.producer.model, 'openai/gpt-5.6-terra');
  assert.equal(route.verifier.model, 'anthropic/claude-opus-4-8');
  assert.equal(route.verifier.required, true);
  assert.notEqual(route.producer.model, route.verifier.model);
});

test('R3 reserves Opus for independent verification instead of self-verifying', () => {
  const route = routeTask(
    { id: 'sec-review', summary: 'security review of OAuth policy', security: true },
    { availability: allAvailable },
  );
  assert.equal(route.classification.riskClass, 'R3');
  assert.equal(route.producer.model, 'zai/glm-5.2');
  assert.equal(route.verifier.model, 'anthropic/claude-opus-4-8');
  assert.notEqual(route.producer.family, route.verifier.family);
  assert.ok(route.qualityEscalations.every((entry) => entry.id !== 'opus48'));
});

test('every R3 cause receives the global Opus verifier, not only security task profiles', () => {
  const route = routeTask(
    { id: 'publish-1', summary: 'publish the implementation result', implementation: true, outwardFacing: true },
    { availability: allAvailable },
  );
  assert.equal(route.classification.riskClass, 'R3');
  assert.equal(route.classification.taskType, 'implementation');
  assert.equal(route.verifier.model, 'anthropic/claude-opus-4-8');
});

test('R3 fails loud when Opus verifier is unavailable rather than degrading to cheap verification', () => {
  const availability = { ...allAvailable, 'anthropic/claude-opus-4-8': false };
  assert.throws(
    () => routeTask({ summary: 'security review of auth policy', security: true }, { availability }),
    (error) => error instanceof NoEligibleFrontierError && /Opus verification/.test(error.message),
  );
});

test('important work fails loud when no frontier producer is available', () => {
  const availability = Object.fromEntries(DEFAULT_POLICY.experts.map((expert) => [expert.model, expert.tier === 'cheap']));
  assert.throws(
    () => routeTask({ summary: 'implement a reversible compiler pass', files: ['compiler.mjs'] }, { availability }),
    (error) => error instanceof NoEligibleFrontierError && error.code === 'NO_ELIGIBLE_FRONTIER',
  );
});

test('availability fallback and quality escalation remain separate routes', () => {
  const route = routeTask(
    { summary: 'synthesize findings from many reports', synthesis: true, estimatedTokens: 80_000 },
    { availability: allAvailable },
  );
  assert.equal(route.producer.model, 'minimax-portal/MiniMax-M3');
  assert.equal(route.producer.dispatch.thinking, 'adaptive');
  assert.equal(route.availabilityFallbacks[0].model, 'zai/glm-5.2');
  assert.equal(route.qualityEscalations[0].model, 'openai/gpt-5.6-sol');
  assert.notDeepEqual(route.availabilityFallbacks, route.qualityEscalations);
});

test('quality escalation is never silently consumed as availability fallback', () => {
  const availability = {
    ...allAvailable,
    'openai/gpt-5.6-terra': false,
    'minimax-portal/MiniMax-M3': false,
    'anthropic/claude-sonnet-5': false,
    'anthropic/claude-opus-4-8': true,
  };
  assert.throws(
    () => routeTask({ summary: 'implement a reversible API adapter', files: ['adapter.mjs'] }, { availability }),
    (error) => error instanceof NoEligibleFrontierError,
  );
});

test('quality escalation never reuses the verifier model or agent identity', () => {
  const route = routeTask(
    { summary: 'verify an important release gate', verification: true, blastRadius: 'MEDIUM' },
    { availability: allAvailable },
  );
  assert.ok(route.verifier);
  assert.ok(route.qualityEscalations.every((entry) => entry.model !== route.verifier.model));
  assert.ok(route.qualityEscalations.every((entry) => entry.agentId !== route.verifier.agentId));
});

test('router selects a distinct verifier after an availability fallback changes the producer', () => {
  const route = routeTask(
    { summary: 'implement a reversible multi-file parser', reversible: true, files: ['a', 'b', 'c', 'd'] },
    { availability: {
      ...allAvailable,
      'openai/gpt-5.6-terra': false,
      'minimax-portal/MiniMax-M3': false,
      'zai/glm-5.2': true,
    } },
  );
  assert.equal(route.producer.model, 'anthropic/claude-sonnet-5');
  assert.equal(route.verifier.model, 'zai/glm-5.2');
  assert.notEqual(route.producer.agentId, route.verifier.agentId);
});

test('R3 routes retain a real quality escalation distinct from producer and Opus verifier', () => {
  const route = routeTask({ summary: 'audit authentication boundaries', security: true });
  assert.equal(route.producer.model, 'openai/gpt-5.6-sol');
  assert.equal(route.verifier.model, 'anthropic/claude-opus-4-8');
  assert.equal(route.qualityEscalations[0].model, 'anthropic/claude-sonnet-5');
});

test('availability fallback selection is explicit for telemetry', () => {
  const availability = { ...allAvailable, 'openai/gpt-5.6-terra': false };
  const route = routeTask(
    { summary: 'implement a reversible API adapter', files: ['adapter.mjs'] },
    { availability },
  );
  assert.equal(route.producer.model, 'minimax-portal/MiniMax-M3');
  assert.equal(route.selection, 'availability-fallback');
  assert.ok(route.availabilityFallbacks.every((entry) => entry.model !== route.producer.model));
});

test('ledger row is deterministic with an injected timestamp and contains no live write', () => {
  const route = routeTask(
    { id: 'ledger-1', summary: 'verify a release manifest', verification: true },
    { availability: allAvailable },
  );
  const row = createLedgerRow(route, {
    timestamp: '2026-07-09T21:00:00.000Z',
    outcome: 'pass',
    latencyMs: 1234,
    tokens: 900,
    verifierPass: true,
  });
  assert.equal(row.timestamp, '2026-07-09T21:00:00.000Z');
  assert.equal(row.taskId, 'ledger-1');
  assert.equal(row.model, route.producer.model);
  assert.equal(row.riskClass, route.classification.riskClass);
  assert.equal(row.verifierPass, true);
  assert.equal(row.policyVersion, DEFAULT_POLICY.version);
  assert.equal(row.routeKind, 'primary');
});

test('ledger row requires caller-supplied time to remain pure', () => {
  const route = routeTask(
    { id: 'ledger-2', summary: 'verify a release manifest', verification: true },
    { availability: allAvailable },
  );
  assert.throws(() => createLedgerRow(route, { outcome: 'pass' }), /timestamp/);
});
