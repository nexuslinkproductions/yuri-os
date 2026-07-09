import test from 'node:test';
import assert from 'node:assert/strict';
import { OwnerConfirmationRequiredError, runSolMoeTask } from './sol-moe-run.mjs';
import { DEFAULT_POLICY } from './sol-moe-router.mjs';

const allAvailable = Object.fromEntries(DEFAULT_POLICY.experts.map((expert) => [expert.model, true]));
const architectureTask = {
  summary: 'End-to-end architecture task',
  subtasks: [{
    id: 'architecture',
    summary: 'design a multi-service routing architecture',
    prompt: 'design a multi-service routing architecture',
    role: 'architect',
    blastRadius: 'MEDIUM',
    reversible: true,
  }],
};

test('defaults to plan-only and performs no spawn effects', async () => {
  let calls = 0;
  const result = await runSolMoeTask(architectureTask, {
    availability: allAvailable,
    spawn: async () => { calls += 1; },
    timestamp: 'FIXED',
  });
  assert.equal(result.mode, 'plan-only-disarmed');
  assert.equal(result.execution, null);
  assert.equal(calls, 0);
  assert.equal(result.plan.queues.producers[0].model, 'zai/glm-5.2');
});

test('apply without explicit owner confirmation is rejected before spawning', async () => {
  let calls = 0;
  await assert.rejects(
    () => runSolMoeTask(architectureTask, {
      apply: true,
      availability: allAvailable,
      spawn: async () => { calls += 1; },
      timestamp: 'FIXED',
    }),
    (error) => error instanceof OwnerConfirmationRequiredError,
  );
  assert.equal(calls, 0);
});

test('owner-confirmed run composes planner, executor, and verifier contract', async () => {
  const calls = [];
  const result = await runSolMoeTask(architectureTask, {
    apply: true,
    ownerConfirmed: true,
    availability: allAvailable,
    timestamp: 'FIXED',
    spawn: async (request) => {
      calls.push(request);
      if (request.purpose === 'verifier') {
        assert.equal(request.upstream.producer.model, 'zai/glm-5.2');
        return { ok: true, verdict: 'pass', output: { verdict: 'pass' } };
      }
      return { ok: true, output: 'architecture-output' };
    },
  });
  assert.equal(result.mode, 'owner-confirmed-live');
  assert.equal(result.execution.status, 'passed');
  assert.deepEqual(calls.map((request) => request.routeKind), ['primary', 'verification']);
});

test('live transport failure consumes availability fallback, not quality escalation', async () => {
  const calls = [];
  const result = await runSolMoeTask(architectureTask, {
    apply: true,
    ownerConfirmed: true,
    availability: allAvailable,
    timestamp: 'FIXED',
    spawn: async (request) => {
      calls.push(request.model);
      if (request.model === 'zai/glm-5.2' && request.purpose === 'producer') {
        return { ok: false, failureKind: 'rate-limit', error: 'quota reset tomorrow' };
      }
      if (request.purpose === 'verifier') return { ok: true, verdict: 'pass' };
      return { ok: true, output: 'fallback-output' };
    },
  });
  assert.deepEqual(calls, [
    'zai/glm-5.2',
    'minimax-portal/MiniMax-M3',
    'anthropic/claude-sonnet-5',
  ]);
  assert.equal(result.execution.results[0].selectedRouteKind, 'availability-fallback');
});
