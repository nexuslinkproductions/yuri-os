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
import { PROVIDER_ROUTE_REGISTRY } from './provider-route-registry.mjs';

// Pick live canary-proven routes from the registry rather than hardcoding route ids: the
// registry is a moving target under active OMP cutover, and the fixture only needs two
// distinct routes with a proven {model,agentId} pair.
function allRoutes() {
  const routes = [];
  for (const identity of Object.values(PROVIDER_ROUTE_REGISTRY.modelIdentities)) {
    for (const route of identity.routes) routes.push(route);
  }
  return routes;
}

const canaryRoutes = allRoutes()
  .filter((route) => route.status === 'canary-proven' && route.model && route.agentId)
  .sort((a, b) => a.id.localeCompare(b.id));
if (canaryRoutes.length < 2) {
  throw new Error('provider-route-scorecard tests require at least two canary-proven provider routes');
}
const [routeA, routeB] = canaryRoutes;

const completed = {
  routeId: routeA.id,
  jobId: 'CanaryScorecardJob1',
  agent: routeA.agentId,
  observedModel: routeA.model,
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
    routeId: routeB.id,
    jobId: 'CanaryScorecardJob2',
    agent: routeB.agentId,
    observedModel: null,
    result: 'blocked',
    latencyMs: null,
    evidenceAccurate: false,
    verifierVerdict: 'not-run',
    failureClass: 'request-schema',
  }]);
  assert.equal(summarizeProviderRouteScorecard(scorecard).eligibleRoutes, 0);
});

test('fails closed on unknown routes, duplicate routes, and model/agent mismatch', () => {
  assert.throws(() => createProviderRouteScorecard([{ ...completed, routeId: 'invented.route' }]), /unknown provider route/);
  assert.throws(() => createProviderRouteScorecard([completed, completed]), /one observation per routeId/);
  assert.throws(() => createProviderRouteScorecard([{ ...completed, observedModel: 'wrong/model' }]), /exact transcript model match/);
  assert.throws(() => createProviderRouteScorecard([{ ...completed, agent: 'wrong-agent-card' }]), /exact agent card match/);
});

test('rejects contradictory success, failure, and verifier claims', () => {
  assert.throws(() => createProviderRouteScorecard([{ ...completed, failureClass: 'timeout' }]), /failureClass none/);
  assert.throws(() => createProviderRouteScorecard([{ ...completed, result: 'lost' }]), /requires a failureClass/);
  assert.throws(() => createProviderRouteScorecard([{ ...completed, evidenceAccurate: false }]), /verifier pass requires/);
});

test('rejects legacy runId/childSessionKey/resolvedModel fields categorically', () => {
  assert.throws(() => createProviderRouteScorecard([{ ...completed, runId: 'legacy-run' }]), /legacy field 'runId'/);
  assert.throws(() => createProviderRouteScorecard([{ ...completed, childSessionKey: 'legacy-child' }]), /legacy field 'childSessionKey'/);
  assert.throws(() => createProviderRouteScorecard([{ ...completed, resolvedModel: 'legacy/model' }]), /legacy field 'resolvedModel'/);
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
    { ...completed, jobId: 'CanaryScorecardJob1b', latencyMs: 800 },
    {
      ...completed,
      jobId: 'CanaryScorecardJob1c',
      observedModel: null,
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
    routeId: routeA.id,
    provider: routeA.provider,
    model: routeA.model,
    trials: 3,
    completed: 2,
    eligible: 2,
    completionRate: 2 / 3,
    verifiedEligibilityRate: 2 / 3,
    medianCompletedLatencyMs: 1000,
    failureClasses: { timeout: 1 },
  });
});

test('trial ledger rejects replayed OMP completion identities', () => {
  assert.throws(() => createProviderRouteTrialLedger([
    completed,
    { ...completed },
  ]), /duplicate OMP completion identity/);
});

test('trial ledger deduplicates by jobId plus taskId when taskId is a grounded observation field', () => {
  const withTask = { ...completed, taskId: 'ScorecardTaskAlpha' };
  const sameJobDifferentTask = { ...withTask, taskId: 'ScorecardTaskBeta' };
  const ledger = createProviderRouteTrialLedger([withTask, sameJobDifferentTask]);
  assert.equal(ledger.observations.length, 2);
  assert.throws(() => createProviderRouteTrialLedger([withTask, { ...withTask }]), /duplicate OMP completion identity/);
});

test('trial ledger appends immutably and keeps the previous snapshot unchanged', () => {
  const first = createProviderRouteTrialLedger([completed]);
  const second = appendProviderRouteTrial(first, {
    ...completed,
    jobId: 'CanaryScorecardJob1d',
  });
  assert.equal(first.observations.length, 1);
  assert.equal(second.observations.length, 2);
  assert.ok(Object.isFrozen(second));
  assert.throws(() => appendProviderRouteTrial(first, completed), /duplicate OMP completion identity/);
});
