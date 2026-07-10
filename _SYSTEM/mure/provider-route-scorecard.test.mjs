import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  appendProviderRouteTrial,
  createProviderRouteScorecard,
  createProviderRouteTrialLedger,
  summarizeProviderRouteScorecard,
  summarizeProviderRouteTrialLedger,
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
    resolvedModel: 'ollama-cloud/deepseek-v4-flash',
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

test('trial ledger preserves repeated route observations and aggregates reliability', () => {
  const trials = createProviderRouteTrialLedger([
    completed,
    { ...completed, runId: 'run-deepseek-2', childSessionKey: 'agent:deepseek-flash:subagent:child-2', latencyMs: 800 },
    {
      ...completed,
      runId: 'run-deepseek-3',
      childSessionKey: 'agent:deepseek-flash:subagent:child-3',
      resolvedModel: null,
      result: 'lost',
      latencyMs: null,
      evidenceAccurate: false,
      verifierVerdict: 'not-run',
      failureClass: 'timeout',
    },
  ]);
  const summary = summarizeProviderRouteTrialLedger(trials);
  assert.equal(summary.totalTrials, 3);
  assert.equal(summary.observedRoutes, 1);
  assert.deepEqual(summary.routes[0], {
    routeId: 'deepseek-v4-flash.native',
    provider: 'deepseek',
    model: 'deepseek/deepseek-v4-flash',
    trials: 3,
    completed: 2,
    eligible: 2,
    completionRate: 2 / 3,
    verifiedEligibilityRate: 2 / 3,
    medianCompletedLatencyMs: 1000,
    failureClasses: { timeout: 1 },
  });
});

test('trial ledger rejects replayed native completion identities', () => {
  assert.throws(() => createProviderRouteTrialLedger([
    completed,
    { ...completed },
  ]), /duplicate native completion identity/);
});

test('trial ledger appends immutably and keeps the previous snapshot unchanged', () => {
  const first = createProviderRouteTrialLedger([completed]);
  const second = appendProviderRouteTrial(first, {
    ...completed,
    runId: 'run-deepseek-next',
    childSessionKey: 'agent:deepseek-flash:subagent:next',
  });
  assert.equal(first.observations.length, 1);
  assert.equal(second.observations.length, 2);
  assert.ok(Object.isFrozen(second));
  assert.throws(() => appendProviderRouteTrial(first, completed), /duplicate native completion identity/);
});
