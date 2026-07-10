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
const availabilityEvidence = Object.fromEntries(
  Object.entries(DEFAULT_POLICY.availabilityDefaults)
    .filter(([, available]) => available === false)
    .map(([model]) => [model, {
      source: 'native-completion-event',
      status: 'completed-native-canary',
      ok: true,
      resolvedModel: model,
      childSessionKey: `agent:test:subagent:${model.replace(/[^a-z0-9]/gi, '-')}`,
      runId: `run-${model.replace(/[^a-z0-9]/gi, '-')}`,
    }]),
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
    { availability: allAvailable, availabilityEvidence },
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
  assert.ok(!enabled.availabilityFallbacks.some((entry) => entry.model === 'opencode-go/mimo-v2.5'));
  const proven = routeTask(task, {
    availability: { 'opencode-go/mimo-v2.5': true },
    availabilityEvidence,
  });
  assert.equal(proven.availabilityFallbacks[0].model, 'opencode-go/mimo-v2.5');
  for (const childSessionKey of ['agent:', 'agent:test:subagent:fake\n']) {
    const forgedEvidence = structuredClone(availabilityEvidence);
    forgedEvidence['opencode-go/mimo-v2.5'].childSessionKey = childSessionKey;
    const forged = routeTask(task, {
      availability: { 'opencode-go/mimo-v2.5': true },
      availabilityEvidence: forgedEvidence,
    });
    assert.ok(!forged.availabilityFallbacks.some((entry) => entry.model === 'opencode-go/mimo-v2.5'));
  }
});

test('GLM 5.2 is masked by default until explicit availability evidence re-enables it', () => {
  const route = routeTask({ summary: 'design a service architecture', architecture: true });
  assert.equal(route.producer.model, 'minimax-portal/MiniMax-M3');
  assert.equal(route.selection, 'availability-fallback');
  const enabled = routeTask(
    { summary: 'design a service architecture', architecture: true },
    { availability: { 'zai/glm-5.2': true }, availabilityEvidence },
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
    assert.ok(!models.includes('openai/gpt-5.6-sol'), `Sol leaked into worker route ${route.classification.taskType}`);
  }
});

test('R1 implementation defaults to M3 with Sonnet 5 as the weighted secondary and Terra demoted to escalation-only', () => {
  const route = routeTask(
    { id: 'build-0', summary: 'implement a reversible API adapter', reversible: true, files: ['adapter.mjs'] },
    { availability: allAvailable, availabilityEvidence },
  );
  assert.equal(route.classification.riskClass, 'R1');
  assert.equal(route.producer.model, 'minimax-portal/MiniMax-M3');
  assert.equal(route.allocation.strategy, 'deterministic-weighted');
  // Sonnet 5 is now a weighted primary producer, not an availability fallback; the fallback is Opus.
  assert.equal(route.availabilityFallbacks[0].model, 'anthropic/claude-opus-4-8');
  // Terra (OpenAI worker) is demoted: never a primary producer, only a specialist quality escalation.
  const producerAndFallbackModels = [route.producer, ...route.availabilityFallbacks].map((entry) => entry.model);
  assert.ok(!producerAndFallbackModels.includes('openai/gpt-5.6-terra'));
  assert.ok(route.qualityEscalations.some((entry) => entry.model === 'openai/gpt-5.6-terra'));
});

test('weighted implementation routing is deterministic and splits M3 primary against the Sonnet 5 secondary, never an OpenAI worker', () => {
  const counts = { minimax: 0, anthropic: 0, openai: 0 };
  for (let index = 0; index < 1000; index += 1) {
    const route = routeTask({
      id: `weighted-implementation-${index}`,
      summary: 'implement a reversible adapter',
      reversible: true,
      files: ['adapter.mjs'],
    }, { availability: allAvailable });
    counts[route.producer.family] += 1;
    assert.equal(route.producer.model, routeTask({
      id: `weighted-implementation-${index}`,
      summary: 'implement a reversible adapter',
      reversible: true,
      files: ['adapter.mjs'],
    }, { availability: allAvailable }).producer.model);
  }
  // 0.8 M3 (minimax) / 0.2 Sonnet 5 (anthropic); Terra is demoted and never wins the primary split.
  assert.ok(counts.minimax >= 750 && counts.minimax <= 850, JSON.stringify(counts));
  assert.ok(counts.anthropic >= 150 && counts.anthropic <= 250, JSON.stringify(counts));
  assert.equal(counts.openai, 0, JSON.stringify(counts));
});

test('representative active workload stays under every provider ceiling and demotes OpenAI workers to zero dispatch', () => {
  const workload = [
    [40, (id) => ({ id, summary: 'grep exact references', readOnly: true, mechanical: true })],
    [18, (id) => ({ id, summary: 'implement a reversible adapter', reversible: true, files: ['a.mjs'] })],
    [3, (id) => ({ id, summary: 'patch authentication handling', security: true, implementation: true })],
    [3, (id) => ({ id, summary: 'audit authentication boundary', security: true })],
    [2, (id) => ({ id, summary: 'review governance policy', governance: true })],
    [8, (id) => ({ id, summary: 'design service architecture', architecture: true })],
    [4, (id) => ({ id, summary: 'synthesize whole corpus', longContext: true, estimatedTokens: 200_000 })],
    [10, (id) => ({ id, summary: 'synthesize findings', synthesis: true })],
    [8, (id) => ({ id, summary: 'research provider behavior', research: true })],
    [4, (id) => ({ id, summary: 'verify release gate', verification: true, blastRadius: 'MEDIUM' })],
    [3, (id) => ({ id, summary: 'adjudicate and red-team findings', adjudication: true })],
    [5, (id) => ({ id, summary: 'orchestrate delegated work', orchestration: true })],
    [5, (id) => ({ id, summary: 'analyze the best approach' })],
  ];
  const counts = {};
  for (const [count, make] of workload) {
    for (let index = 0; index < count; index += 1) {
      const route = routeTask(make(`representative-${counts.total || 0}-${index}`));
      for (const worker of [route.producer, route.verifier].filter(Boolean)) {
        counts[worker.family] = (counts[worker.family] || 0) + 1;
        counts.total = (counts.total || 0) + 1;
      }
    }
  }
  for (const [family, range] of Object.entries(DEFAULT_POLICY.providerCalibration.activeTargets)) {
    const share = (counts[family] || 0) / counts.total;
    const dispatched = (counts[family] || 0) > 0;
    // Ceiling binds every family; the floor only binds a family that actually reaches the
    // producer/verifier census. mimo (breadth availability-fallback only) and zai (masked by
    // default) legitimately show zero dispatch under healthy availability.
    assert.ok(share <= range.max, `${family}=${share} exceeds ceiling ${JSON.stringify(range)}`);
    if (dispatched) {
      assert.ok(share >= range.min, `${family}=${share} below floor ${JSON.stringify(range)}`);
    }
  }
  // The rebalance's core intent: OpenAI worker models never enter the active volume pool.
  assert.equal(counts.openai || 0, 0, JSON.stringify(counts));
});

test('long-context synthesis uses GLM 5.2 and M3 remains its volume fallback', () => {
  const route = routeTask(
    { id: 'synth-1', summary: 'synthesize the whole corpus', longContext: true, readOnly: true, estimatedTokens: 250_000 },
    { availability: allAvailable, availabilityEvidence },
  );
  assert.equal(route.classification.taskType, 'long-context');
  assert.equal(route.producer.model, 'zai/glm-5.2');
  assert.equal(route.availabilityFallbacks[0].model, 'minimax-portal/MiniMax-M3');
});

test('adjudication routes production to the M3 frontier lane and demotes GPT-5.6 Luna to escalation-only', () => {
  const route = routeTask(
    { id: 'adjudicate-1', summary: 'red-team and adjudicate the competing architecture findings', adjudication: true },
    { availability: allAvailable, availabilityEvidence },
  );
  assert.equal(route.classification.taskType, 'adjudication');
  assert.equal(route.classification.riskClass, 'R3');
  // Producer is the non-OpenAI frontier lane (M3); Sonnet 5 is masked as an R3 anthropic producer,
  // so the weighted primary collapses to M3. Opus independently verifies.
  assert.equal(route.producer.agentId, 'mure-synthesist');
  assert.equal(route.producer.model, 'minimax-portal/MiniMax-M3');
  assert.equal(route.verifier.model, 'anthropic/claude-opus-4-8');
  assert.deepEqual(route.producer.dispatch, {
    agentId: 'mure-synthesist',
    model: 'minimax-portal/MiniMax-M3',
    thinking: 'adaptive',
  });
  // Luna (OpenAI worker) never produces: it appears only in the availability-fallback and
  // quality-escalation queues, never as the primary producer.
  assert.notEqual(route.producer.model, 'openai/gpt-5.6-luna');
  const escalationModels = [...route.availabilityFallbacks, ...route.qualityEscalations].map((entry) => entry.model);
  assert.ok(escalationModels.includes('openai/gpt-5.6-luna'));
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

test('R3 security implementation offloads production to M3 and retains cross-provider Opus verification', () => {
  const route = routeTask(
    { id: 'sec-1', summary: 'patch an authentication bypass', security: true, files: ['auth.mjs'] },
    { availability: allAvailable },
  );
  assert.equal(route.classification.riskClass, 'R3');
  assert.equal(route.producer.model, 'minimax-portal/MiniMax-M3');
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
  assert.equal(route.producer.model, 'minimax-portal/MiniMax-M3');
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

test('R3 fails loud when only Anthropic production remains because Opus verification must be cross-provider', () => {
  const availability = Object.fromEntries(DEFAULT_POLICY.experts.map((expert) => [expert.model, false]));
  availability['anthropic/claude-sonnet-5'] = true;
  availability['anthropic/claude-opus-4-8'] = true;
  assert.throws(
    () => routeTask({ summary: 'security review of auth policy', security: true }, { availability }),
    (error) => error instanceof NoEligibleFrontierError && error.code === 'NO_ELIGIBLE_FRONTIER',
  );
});

test('invalid weighted producer configuration fails closed', () => {
  const policy = structuredClone(DEFAULT_POLICY);
  policy.taskProfiles.implementation.producerWeights = { m3: 0.5, invented: 0.5 };
  assert.throws(
    () => routeTask({ summary: 'implement an adapter' }, { policy, availability: allAvailable }),
    /unknown producers/,
  );
});

test('impossible provider calibration bands fail closed', () => {
  const policy = structuredClone(DEFAULT_POLICY);
  policy.providerCalibration.activeTargets = {
    minimax: { min: 0.8, max: 0.9 },
    anthropic: { min: 0.4, max: 0.5 },
  };
  assert.throws(
    () => routeTask({ summary: 'analyze the best approach' }, { policy, availability: allAvailable }),
    /complete allocation/,
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
    { availability: allAvailable, availabilityEvidence },
  );
  assert.equal(route.producer.model, 'minimax-portal/MiniMax-M3');
  assert.equal(route.producer.dispatch.thinking, 'adaptive');
  assert.equal(route.availabilityFallbacks[0].model, 'zai/glm-5.2');
  assert.equal(route.qualityEscalations[0].model, 'anthropic/claude-opus-4-8');
  assert.notDeepEqual(route.availabilityFallbacks, route.qualityEscalations);
});

test('quality escalation is never silently consumed as availability fallback', () => {
  // Implementation producers (M3, Sonnet 5) and its availability fallback (Opus) are all down;
  // only Terra — the quality escalation — remains. Terra must NOT be pulled in as a producer:
  // the route fails loud instead of silently consuming the escalation lane.
  const availability = {
    ...allAvailable,
    'minimax-portal/MiniMax-M3': false,
    'anthropic/claude-sonnet-5': false,
    'anthropic/claude-opus-4-8': false,
    'openai/gpt-5.6-terra': true,
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
    { summary: 'design a service architecture', architecture: true, files: ['a', 'b', 'c', 'd'] },
    { availability: {
      ...allAvailable,
      'zai/glm-5.2': false,
      'minimax-portal/MiniMax-M3': false,
    } },
  );
  assert.equal(route.producer.model, 'anthropic/claude-sonnet-5');
  assert.equal(route.verifier.model, 'anthropic/claude-opus-4-8');
  assert.notEqual(route.producer.agentId, route.verifier.agentId);
});

test('R3 routes retain a real quality escalation distinct from producer and Opus verifier', () => {
  const route = routeTask({ summary: 'audit authentication boundaries', security: true });
  assert.notEqual(route.producer.family, 'openai');
  assert.equal(route.verifier.model, 'anthropic/claude-opus-4-8');
  assert.ok(route.qualityEscalations.length >= 1);
  assert.ok(route.qualityEscalations.every((entry) => entry.model !== route.producer.model));
});

test('availability fallback selection is explicit for telemetry', () => {
  // Both weighted primary producers (M3, Sonnet 5) are down, so the route falls to the
  // implementation availability fallback (Opus) and reports the selection explicitly.
  const availability = {
    ...allAvailable,
    'minimax-portal/MiniMax-M3': false,
    'anthropic/claude-sonnet-5': false,
  };
  const route = routeTask(
    { summary: 'implement a reversible API adapter', files: ['adapter.mjs'] },
    { availability },
  );
  assert.equal(route.producer.model, 'anthropic/claude-opus-4-8');
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
  assert.equal(row.providerFamily, route.producer.family);
  assert.equal(row.verifierFamily, route.verifier?.family || null);
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
