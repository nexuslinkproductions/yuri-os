import test from 'node:test';
import assert from 'node:assert/strict';

import {
  PROVIDER_ROUTE_REGISTRY,
  getNativeCanaryRoutes,
  listModelRoutes,
  validateProviderRouteRegistry,
} from './provider-route-registry.mjs';

test('provider route registry validates and keeps model identity separate from execution surface', () => {
  assert.equal(validateProviderRouteRegistry(), true);
  const routes = listModelRoutes('deepseek-v4-flash', { includeUnresolved: true });
  assert.deepEqual(routes.map((route) => route.provider), ['deepseek', 'deepseek', 'ollama', 'cline', 'opencode']);
  assert.equal(routes.at(-1).model, null);
  assert.equal(routes.at(-1).status, 'unresolved');
});

test('DeepSeek native canary pool contains only exact configured model identities', () => {
  const routes = getNativeCanaryRoutes('deepseek-v4-flash');
  assert.ok(routes.some((route) => route.model === 'deepseek/deepseek-v4-flash'));
  assert.ok(routes.some((route) => route.model === 'deepseek-v4-flash:direct'));
  assert.ok(!routes.some((route) => route.model === 'ollama-cloud/deepseek-v4-flash:cloud'));
  assert.ok(routes.some((route) => route.model === 'cline-pass/cline-pass/deepseek-v4-flash'));
  assert.ok(!routes.some((route) => route.model === null));
});

test('provider outcomes promote exact completions and block schema-incompatible routes', () => {
  const deepseek = listModelRoutes('deepseek-v4-flash', { includeUnresolved: true });
  const ollama = deepseek.find((route) => route.provider === 'ollama');
  const cline = deepseek.find((route) => route.provider === 'cline');
  assert.equal(ollama.status, 'blocked-schema');
  assert.match(ollama.blockedReason, /rejected the compiled request schema/);
  assert.equal(cline.status, 'canary-proven');
  assert.equal(cline.canaryEvidence.result, 'completed');
  assert.equal(listModelRoutes('gemini-3.5-flash')[0].status, 'canary-proven');
  assert.equal(listModelRoutes('claude-haiku-4-5')[0].status, 'canary-proven');
});

test('role topology keeps Sol above workers and verifiers independent', () => {
  const topology = PROVIDER_ROUTE_REGISTRY.roleTopology;
  assert.deepEqual(topology.orchestrator.allowedModels, ['openai/gpt-5.6-sol']);
  assert.equal(topology.orchestrator.mayExecuteWorkerTasks, false);
  assert.equal(topology.advisor.maySpawn, false);
  assert.equal(topology.verifier.mustBeIndependent, true);
  assert.ok(PROVIDER_ROUTE_REGISTRY.excludedModels.some((entry) => entry.model === 'anthropic/claude-fable-5'));
});

test('registry fails closed on an invented unresolved route', () => {
  const invalid = structuredClone(PROVIDER_ROUTE_REGISTRY);
  invalid.modelIdentities['deepseek-v4-flash'].routes.at(-1).model = 'opencode-go/deepseek-v4-flash';
  assert.throws(() => validateProviderRouteRegistry(invalid), /unresolved route/);
});

test('registry rejects unsupported canary claims and reasonless schema blocks', () => {
  const unsupportedCanary = structuredClone(PROVIDER_ROUTE_REGISTRY);
  unsupportedCanary.modelIdentities['gemini-3.5-flash'].routes[0].canaryEvidence.result = 'admitted-only';
  assert.throws(() => validateProviderRouteRegistry(unsupportedCanary), /requires exact completed native evidence/);

  const reasonlessBlock = structuredClone(PROVIDER_ROUTE_REGISTRY);
  delete reasonlessBlock.modelIdentities['deepseek-v4-flash'].routes.find((route) => route.provider === 'ollama').blockedReason;
  assert.throws(() => validateProviderRouteRegistry(reasonlessBlock), /must have blockedReason/);
});
