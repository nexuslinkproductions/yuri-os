import test from 'node:test';
import assert from 'node:assert/strict';
import { NativeParentRequiredError, runSolMoeTask } from './sol-moe-run.mjs';
import { DEFAULT_POLICY } from './sol-moe-router.mjs';

const allAvailable = Object.fromEntries(DEFAULT_POLICY.experts.map((expert) => [expert.model, true]));
const availabilityEvidence = Object.fromEntries(
  Object.entries(DEFAULT_POLICY.availabilityDefaults)
    .filter(([, available]) => available === false)
    .map(([model]) => [model, {
      source: 'omp-task-result',
      status: 'completed-omp-canary',
      ok: true,
      jobId: `canary-${model.replace(/[^a-z0-9]/gi, '-')}`,
      model,
      agentId: DEFAULT_POLICY.experts.find((expert) => expert.model === model)?.agentId,
    }]),
);
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

test('compiles native dispatch intent and performs no spawn effects', async () => {
  let calls = 0;
  const result = await runSolMoeTask(architectureTask, {
    availability: allAvailable,
    availabilityEvidence,
    timestamp: 'FIXED',
  });
  assert.equal(result.mode, 'native-dispatch-intent');
  assert.equal(result.schemaVersion, 'sol-moe-run-v2');
  assert.equal(calls, 0);
  assert.equal(result.plan.queues.producers[0].model, 'zai/glm-5.2');
  assert.equal(result.nextAction.type, 'omp-task-spawn');
  assert.deepEqual(Object.keys(result.nextAction.args).sort(), [
    'context', 'i', 'tasks',
  ]);
});

test('any attempt to execute from Node is rejected in favor of the native parent tool', async () => {
  await assert.rejects(
    () => runSolMoeTask(architectureTask, {
      apply: true,
      availability: allAvailable,
      availabilityEvidence,
      timestamp: 'FIXED',
    }),
    (error) => error instanceof NativeParentRequiredError,
  );
});

test('R2 dispatch intent defers the verifier until the producer completion event', async () => {
  const result = await runSolMoeTask(architectureTask, {
    availability: allAvailable,
    availabilityEvidence,
    timestamp: 'FIXED',
  });
  assert.equal(result.nextAction.purpose, 'producer');
  assert.equal(result.nativeState.tasks.architecture.status, 'awaiting');
  assert.equal(result.nativeState.tasks.architecture.producer, null);
});

test('default availability mask routes around GLM without probing it', async () => {
  const result = await runSolMoeTask(architectureTask, {
    timestamp: 'FIXED',
  });
  assert.equal(result.nextAction.args.tasks[0].agent, 'mure-synthesist');
  assert.equal(result.nextAction.routeKind, 'availability-fallback');
});
