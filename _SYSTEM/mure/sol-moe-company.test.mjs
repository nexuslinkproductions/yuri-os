import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planSolMoeCompany } from './sol-moe-company.mjs';
import { DEFAULT_POLICY } from './sol-moe-router.mjs';
import { executeSolMoePlan } from './sol-moe-executor.mjs';

const allAvailable = Object.fromEntries(DEFAULT_POLICY.experts.map((expert) => [expert.model, true]));
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

test('plans separate immediate, availability, and quality queues', async () => {
  const plan = await planSolMoeCompany({
    summary: 'Sol MoE routing test',
    subtasks: [
      {
        id: 'architecture',
        summary: 'Design a multi-service architecture',
        prompt: 'Design a multi-service architecture',
        role: 'architect',
        reversible: true,
        blastRadius: 'MEDIUM',
      },
    ],
  }, { availability: allAvailable, availabilityEvidence, timestamp: '2026-07-09T22:00:00.000Z' });

  assert.equal(plan.mode, 'manifest-only-disarmed');
  assert.equal(plan.routes[0].route.classification.riskClass, 'R2');
  assert.equal(plan.queues.producers[0].model, 'zai/glm-5.2');
  assert.equal(plan.queues.verifiers[0].model, 'anthropic/claude-sonnet-5');
  assert.ok(plan.queues.availabilityFallbacks.some((entry) => entry.model === 'minimax-portal/MiniMax-M3'));
  assert.ok(plan.queues.qualityEscalations.some((entry) => entry.model === 'anthropic/claude-opus-4-8'));
  assert.notDeepEqual(plan.queues.availabilityFallbacks, plan.queues.qualityEscalations);
  assert.equal(plan.summary.initialReadyTasks, 1);
  assert.equal(plan.summary.deferredVerifiers, 1);
  assert.equal('immediateSpawns' in plan.summary, false);
  assert.deepEqual(plan.summary.plannedProviderMix.producers.counts, { zai: 1 });
  assert.deepEqual(plan.summary.plannedProviderMix.verifiers.counts, { anthropic: 1 });
  assert.equal(plan.summary.providerCalibrationTargets.openai.max, 0.30);
  assert.match(DEFAULT_POLICY.providerCalibration.metric, /dispatch count/);
  assert.equal(plan.availabilityEvidence['zai/glm-5.2'].resolvedModel, 'zai/glm-5.2');
});

test('owner-held governance work never enters an immediate spawn queue', async () => {
  const plan = await planSolMoeCompany({
    summary: 'Held governance test',
    subtasks: [
      {
        id: 'arm-router',
        summary: 'Arm the live router',
        prompt: 'Arm the live router',
        role: 'steward',
        arming: true,
        reversible: true,
      },
    ],
  }, { availability: allAvailable, rulings: { source: 'test', map: new Map(), rulings: [] } });

  assert.equal(plan.routes[0].held, true);
  assert.equal(plan.queues.producers.length, 0);
  assert.equal(plan.queues.verifiers.length, 0);
  assert.equal(plan.ledgerSeed[0].outcome, 'owner-held');
});

test('id-less owner-held work receives the same stable key on both sides of the hold join', async () => {
  const plan = await planSolMoeCompany({
    summary: 'Id-less held governance test',
    subtasks: [{
      summary: 'Arm the live router',
      prompt: 'Arm the live router',
      role: 'steward',
      arming: true,
      reversible: true,
    }],
  }, { availability: allAvailable, rulings: { source: 'test', map: new Map(), rulings: [] } });

  assert.equal(plan.routes[0].taskId, 'subtask-1');
  assert.equal(plan.routes[0].held, true);
  assert.equal(plan.governed.held[0].subtaskId, 'subtask-1');
  assert.equal(plan.queues.producers.length, 0);
});

test('important route fails loud per subtask without killing other routes', async () => {
  const cheapOnly = Object.fromEntries(DEFAULT_POLICY.experts.map((expert) => [expert.model, expert.tier === 'cheap']));
  const plan = await planSolMoeCompany({
    summary: 'Mixed availability test',
    subtasks: [
      {
        id: 'scan',
        summary: 'grep and list all TODO markers',
        prompt: 'grep and list all TODO markers',
        role: 'scout',
        readOnly: true,
        mechanical: true,
      },
      {
        id: 'implementation',
        summary: 'implement a reversible parser refactor',
        prompt: 'implement a reversible parser refactor',
        role: 'engineer',
        reversible: true,
      },
    ],
  }, { availability: cheapOnly });

  assert.equal(plan.routes.length, 1);
  assert.equal(plan.routes[0].taskId, 'scan');
  assert.equal(plan.blocked.length, 1);
  assert.equal(plan.blocked[0].taskId, 'implementation');
  assert.equal(plan.blocked[0].status, 'fail-loud');
  assert.equal(plan.queues.producers[0].model, 'deepseek/deepseek-v4-flash');
});

test('important tasks do not auto-spawn cheap evidence unless explicitly requested', async () => {
  const baseTask = {
    summary: 'Important implementation',
    subtasks: [{
      id: 'build',
      summary: 'implement a four-file runtime adapter',
      prompt: 'implement a four-file runtime adapter',
      role: 'engineer',
      files: ['a.mjs', 'b.mjs', 'c.mjs', 'd.mjs'],
      reversible: true,
    }],
  };
  const defaultPlan = await planSolMoeCompany(baseTask, { availability: allAvailable });
  const evidencePlan = await planSolMoeCompany(baseTask, { availability: allAvailable, includeEvidence: true });
  assert.equal(defaultPlan.routes[0].route.classification.riskClass, 'R2');
  assert.equal(defaultPlan.queues.evidence.length, 0);
  assert.ok(evidencePlan.queues.evidence.length >= 1);
  assert.ok(evidencePlan.queues.evidence.every((entry) => entry.purpose === 'evidence'));
});

test('the same input produces the same dispatch queues', async () => {
  const task = {
    summary: 'Determinism test',
    subtasks: [{
      id: 'synthesis',
      summary: 'synthesize findings from many reports',
      prompt: 'synthesize findings from many reports',
      role: 'synthesist',
      synthesis: true,
      estimatedTokens: 80_000,
      reversible: true,
    }],
  };
  const a = await planSolMoeCompany(task, { availability: allAvailable, timestamp: 'FIXED' });
  const b = await planSolMoeCompany(task, { availability: allAvailable, timestamp: 'FIXED' });
  assert.deepEqual(a.queues, b.queues);
  assert.deepEqual(a.ledgerSeed, b.ledgerSeed);
});

test('planner and executor compose across an availability fallback and verifier gate', async () => {
  const availability = { ...allAvailable, 'zai/glm-5.2': false };
  const plan = await planSolMoeCompany({
    summary: 'Planner/executor seam',
    subtasks: [{
      id: 'architecture-fallback',
      summary: 'design a multi-service routing architecture',
      prompt: 'design a multi-service routing architecture',
      role: 'architect',
      blastRadius: 'MEDIUM',
      reversible: true,
    }],
  }, { availability, timestamp: 'FIXED' });
  const calls = [];
  const execution = await executeSolMoePlan(plan, {
    spawn: async (request) => {
      calls.push({ model: request.model, routeKind: request.routeKind, upstream: request.upstream });
      if (request.purpose === 'verifier') {
        assert.equal(request.upstream.producer.model, 'minimax-portal/MiniMax-M3');
        return { ok: true, verdict: 'pass', output: { verdict: 'pass' } };
      }
      return { ok: true, output: 'frontier-output' };
    },
  });

  assert.equal(plan.queues.producers[0].model, 'minimax-portal/MiniMax-M3');
  assert.equal(plan.routes[0].route.selection, 'availability-fallback');
  assert.equal(execution.status, 'passed');
  assert.deepEqual(calls.map((call) => call.routeKind), ['availability-fallback', 'verification']);
});
