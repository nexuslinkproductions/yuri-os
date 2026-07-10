import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  createProviderRouteScorecard,
  summarizeProviderRouteScorecard,
} from './provider-route-scorecard.mjs';

const completed = {
  routeId: 'deepseek-v4-flash.native',
  runId: 'run-deepseek',
  childSessionKey: 'agent:deepseek-flash:subagent:child',
  resolvedModel: 'deepseek/deepseek-v4-flash',
  result: 'completed',
  latencyMs: 1200,
  evidenceAccurate: true,
  verifierVerdict: 'pass',
  failureClass: 'none',
  observed: '2026-07-10T20:00:00Z',
};

test('exact completed evidence becomes deterministically eligible', () => {
  const scorecard = createProviderRouteScorecard([completed]);
  const summary = summarizeProviderRouteScorecard(scorecard);
  assert.equal(summary.observedRoutes, 1);
  assert.equal(summary.eligibleRoutes, 1);
  assert.equal(summary.routes[0].eligibleForDeterministicRouting, true);
  assert.ok(Object.isFrozen(scorecard.observations[0]));
});

test('blocked schema outcome remains visible but ineligible', () => {
  const scorecard = createProviderRouteScorecard([{
    ...completed,
    routeId: 'deepseek-v4-flash.ollama',
    runId: 'run-ollama',
    resolvedModel: 'ollama-cloud/deepseek-v4-flash:cloud',
    result: 'blocked',
    latencyMs: null,
    evidenceAccurate: false,
    verifierVerdict: 'not-run',
    failureClass: 'request-schema',
  }]);
  assert.equal(summarizeProviderRouteScorecard(scorecard).eligibleRoutes, 0);
});

test('fails closed on unknown routes, duplicate routes, and model mismatch', () => {
  assert.throws(() => createProviderRouteScorecard([{ ...completed, routeId: 'invented.route' }]), /unknown provider route/);
  assert.throws(() => createProviderRouteScorecard([completed, completed]), /one observation per routeId/);
  assert.throws(() => createProviderRouteScorecard([{ ...completed, resolvedModel: 'wrong/model' }]), /exact resolvedModel/);
});

test('rejects contradictory success, failure, and verifier claims', () => {
  assert.throws(() => createProviderRouteScorecard([{ ...completed, failureClass: 'timeout' }]), /failureClass none/);
  assert.throws(() => createProviderRouteScorecard([{ ...completed, result: 'lost' }]), /requires a failureClass/);
  assert.throws(() => createProviderRouteScorecard([{ ...completed, evidenceAccurate: false }]), /verifier pass requires/);
});

test('scorecard stays outside live planner, router, reducer, and runner imports', async () => {
  const sources = await Promise.all([
    'sol-moe-company.mjs', 'sol-moe-router.mjs', 'sol-moe-native-dispatch.mjs', 'sol-moe-run.mjs',
  ].map((name) => readFile(new URL(`./${name}`, import.meta.url), 'utf8')));
  for (const source of sources) assert.equal(source.includes('provider-route-scorecard'), false);
});
