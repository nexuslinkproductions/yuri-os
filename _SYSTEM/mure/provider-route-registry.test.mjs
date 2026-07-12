import test from 'node:test';
import assert from 'node:assert/strict';

import {
  PROVIDER_ROUTE_REGISTRY,
  getNativeCanaryRoutes,
  listModelRoutes,
  validateProviderRouteRegistry,
} from './provider-route-registry.mjs';

test('provider route registry validates with OMP-native canary evidence', () => {
  assert.equal(validateProviderRouteRegistry(), true);
  // deepseek-v4-flash: only direct-api route remains (catalog-candidate)
  const deepseek = listModelRoutes('deepseek-v4-flash', { includeUnresolved: true });
  assert.equal(deepseek.length, 1);
  assert.equal(deepseek[0].provider, 'deepseek');
  assert.equal(deepseek[0].surface, 'direct-api');
  assert.equal(deepseek[0].status, 'catalog-candidate');
});

test('OGMP-native canary-proven routes carry valid OMP evidence', () => {
  const haiku = listModelRoutes('anthropic/claude-haiku-4-5');
  assert.equal(haiku.length, 1);
  assert.equal(haiku[0].status, 'canary-proven');
  assert.equal(haiku[0].surface, 'omp-native');
  assert.equal(haiku[0].source, 'omp-task-completion');
  assert.equal(haiku[0].canaryEvidence.taskResultStatus, 'completed');
  assert.equal(haiku[0].canaryEvidence.agentId, 'mure-scout-haiku');
  assert.equal(haiku[0].canaryEvidence.model, 'anthropic/claude-haiku-4-5');
  assert.equal(haiku[0].canaryEvidence.result.status, 'ok');

  const sonnet = listModelRoutes('anthropic/claude-sonnet-5');
  assert.equal(sonnet[0].status, 'canary-proven');
  assert.equal(sonnet[0].agentId, 'mure-engineer-sonnet5');

  const opus = listModelRoutes('anthropic/claude-opus-4-8');
  assert.equal(opus[0].status, 'canary-proven');
  assert.equal(opus[0].agentId, 'mure-yuri-opus48');

  const glm = listModelRoutes('zai/glm-5.2');
  assert.equal(glm[0].status, 'canary-proven');
  assert.equal(glm[0].agentId, 'mure-architect');

  const mimo = listModelRoutes('opencode-go/mimo-v2.5');
  assert.equal(mimo[0].status, 'canary-proven');
  assert.equal(mimo[0].agentId, 'mure-artificer-mimo25');

  const gemini = listModelRoutes('cursor/gemini-3.5-flash');
  assert.equal(gemini[0].status, 'canary-proven');
  assert.equal(gemini[0].agentId, 'mure-oracle');
  assert.equal(gemini[0].canaryEvidence.thinkingLevel, null);

  const minimax = listModelRoutes('minimax-code/MiniMax-M3');
  assert.equal(minimax[0].status, 'canary-proven');
  assert.equal(minimax[0].agentId, 'mure-synthesist-m3');
  assert.equal(minimax[0].canaryEvidence.thinkingLevel, 'high');
});

test('Terra is quota-blocked, not canary-proven', () => {
  const terra = listModelRoutes('openai/gpt-5.6-terra');
  assert.equal(terra.length, 1);
  assert.equal(terra[0].status, 'quota-blocked');
  assert.equal(terra[0].surface, 'omp-native');
  assert.match(terra[0].blockedReason, /usage_limit_reached/);
  assert.ok(!terra[0].canaryEvidence);
});

test('role topology keeps Sol above workers and verifiers independent', () => {
  const topology = PROVIDER_ROUTE_REGISTRY.roleTopology;
  assert.deepEqual(topology.orchestrator.allowedModels, ['openai/gpt-5.6-sol']);
  assert.equal(topology.orchestrator.mayExecuteWorkerTasks, false);
  assert.equal(topology.advisor.maySpawn, false);
  assert.equal(topology.verifier.mustBeIndependent, true);
  assert.ok(topology['strategic-peer'].preferredModels.includes('anthropic/claude-sonnet-5'));
  // worker topology uses cursor/gemini-3.5-flash (normalized OMP form)
  assert.ok(topology.worker.preferredModels.includes('cursor/gemini-3.5-flash'));
  assert.ok(topology.worker.preferredModels.includes('opencode-go/mimo-v2.5'));
});

test('registry explicitly excludes Fable 5 and Sol', () => {
  assert.ok(PROVIDER_ROUTE_REGISTRY.excludedModels.some((entry) => entry.model === 'anthropic/claude-fable-5'));
  assert.ok(PROVIDER_ROUTE_REGISTRY.excludedModels.some((entry) => entry.model === 'openai/gpt-5.6-sol'));
});

test('registry fails closed when a route model is null', () => {
  const invalid = structuredClone(PROVIDER_ROUTE_REGISTRY);
  invalid.modelIdentities['deepseek-v4-flash'].routes[0].model = null;
  assert.throws(() => validateProviderRouteRegistry(invalid), /model/);
});

test('registry rejects canary-proven route with legacy evidence fields', () => {
  const withRunId = structuredClone(PROVIDER_ROUTE_REGISTRY);
  withRunId.modelIdentities['anthropic/claude-haiku-4-5'].routes[0].canaryEvidence.runId = 'test-run-id';
  assert.throws(() => validateProviderRouteRegistry(withRunId), /legacy evidence/);

  const withChildSessionKey = structuredClone(PROVIDER_ROUTE_REGISTRY);
  withChildSessionKey.modelIdentities['anthropic/claude-haiku-4-5'].routes[0].canaryEvidence.childSessionKey = 'agent:test:subagent:xyz';
  assert.throws(() => validateProviderRouteRegistry(withChildSessionKey), /legacy evidence/);

  const withResolvedModel = structuredClone(PROVIDER_ROUTE_REGISTRY);
  withResolvedModel.modelIdentities['anthropic/claude-haiku-4-5'].routes[0].canaryEvidence.resolvedModel = 'anthropic/claude-haiku-4-5';
  assert.throws(() => validateProviderRouteRegistry(withResolvedModel), /legacy evidence/);
});

test('registry rejects canary-proven route with missing or invalid OMP fields', () => {
  // Missing jobId
  const noJobId = structuredClone(PROVIDER_ROUTE_REGISTRY);
  delete noJobId.modelIdentities['anthropic/claude-haiku-4-5'].routes[0].canaryEvidence.jobId;
  assert.throws(() => validateProviderRouteRegistry(noJobId), /jobId/);

  // Wrong taskResultStatus
  const failedStatus = structuredClone(PROVIDER_ROUTE_REGISTRY);
  failedStatus.modelIdentities['anthropic/claude-haiku-4-5'].routes[0].canaryEvidence.taskResultStatus = 'failed';
  assert.throws(() => validateProviderRouteRegistry(failedStatus), /taskResultStatus/);

  // Mismatched model
  const mismatchModel = structuredClone(PROVIDER_ROUTE_REGISTRY);
  mismatchModel.modelIdentities['anthropic/claude-haiku-4-5'].routes[0].canaryEvidence.model = 'anthropic/claude-sonnet-5';
  assert.throws(() => validateProviderRouteRegistry(mismatchModel), /model must match/);

  // Missing result
  const noResult = structuredClone(PROVIDER_ROUTE_REGISTRY);
  delete noResult.modelIdentities['anthropic/claude-haiku-4-5'].routes[0].canaryEvidence.result;
  assert.throws(() => validateProviderRouteRegistry(noResult), /result object/);

  // Invalid thinkingLevel
  const badThinking = structuredClone(PROVIDER_ROUTE_REGISTRY);
  badThinking.modelIdentities['zai/glm-5.2'].routes[0].canaryEvidence.thinkingLevel = 'super-high';
  assert.throws(() => validateProviderRouteRegistry(badThinking), /thinkingLevel/);
});

test('registry rejects blocked-schema without blockedReason', () => {
  // There are no blocked-schema routes in the current registry, but test the gate.
  const fixture = structuredClone(PROVIDER_ROUTE_REGISTRY);
  fixture.modelIdentities['deepseek-v4-flash'].routes[0].status = 'blocked-schema';
  delete fixture.modelIdentities['deepseek-v4-flash'].routes[0].blockedReason;
  // Need to add blockedReason definition; block-schema routes require blockedReason
  assert.throws(() => validateProviderRouteRegistry(fixture), /blockedReason/);
});

test('getNativeCanaryRoutes returns canary-proven and catalog-candidate routes', () => {
  const deepseek = getNativeCanaryRoutes('deepseek-v4-flash');
  assert.equal(deepseek.length, 1);
  assert.equal(deepseek[0].status, 'catalog-candidate');
  assert.equal(deepseek[0].model, 'deepseek-v4-flash:direct');
});

test('Gemini is no longer under old identity key', () => {
  assert.deepEqual(listModelRoutes('gemini-3.5-flash'), []);
  const cursorGemini = listModelRoutes('cursor/gemini-3.5-flash');
  assert.equal(cursorGemini.length, 1);
  assert.equal(cursorGemini[0].status, 'canary-proven');
});
