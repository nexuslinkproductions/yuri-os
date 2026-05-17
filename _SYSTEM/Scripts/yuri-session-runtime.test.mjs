#!/usr/bin/env node

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { once } from 'node:events';

const PORT = 3320;
const API_KEY = 'test-api-key-123456';
const SERVER_READY = /YURI_BACKEND_ONLINE/;

const repoScratch = path.join(process.cwd(), '.tmp');
fs.mkdirSync(repoScratch, { recursive: true });
const tempDir = fs.mkdtempSync(path.join(repoScratch, 'yuri-session-runtime-'));
const dbPath = path.join(tempDir, 'runtime.db');
const controlPlaneArtifacts = createControlPlaneArtifacts(tempDir);

let child = null;

try {
  child = await startBackend();

  const anonymousStart = await request('POST', '/api/sessions/start', { prompt: 'unauthorized' });
  assert.equal(anonymousStart.status, 401, 'session start should require auth');
  assert.equal(anonymousStart.json.error, 'UNAUTHORIZED', 'session start should return stable auth error');

  const started = await request('POST', '/api/sessions/start', {
    prompt: 'prove durable Yuri runtime',
    title: 'Durable Runtime Test',
    durationMs: 120_000,
    idleMode: 'backlog',
  }, API_KEY);
  assert.equal(started.status, 201, 'authenticated session start should create a session');
  assert.equal(started.json.session.status, 'active', 'started session should be active');
  assert.equal(started.json.session.id.startsWith('yuri-session-'), true, 'session id should use Yuri runtime prefix');
  assert.equal(started.json.session.targetDurationMs, 120_000, 'target duration should be persisted');
  assert.equal(started.json.session.idleMode, 'backlog', 'idle mode should be persisted');
  assert.ok(started.json.session.deadlineAt > started.json.session.startTs, 'deadline should be after start');

  const seededBacklog = await request('GET', `/api/sessions/backlog?sessionId=${started.json.session.id}`, null, API_KEY);
  assert.equal(seededBacklog.status, 200, 'backlog should be readable');
  assert.ok(seededBacklog.json.summary.queued >= 4, 'session start should seed safe autonomous backlog tasks');
  assert.equal(
    seededBacklog.json.tasks.every((task) => task.sessionId === started.json.session.id),
    true,
    'backlog tasks should be scoped to the active session',
  );

  const addedBacklog = await request('POST', '/api/sessions/backlog', {
    sessionId: started.json.session.id,
    title: 'Urgent deterministic backlog task',
    prompt: 'Run the highest-priority deterministic backlog verification.',
    reason: 'test priority ordering',
    priority: 1,
  }, API_KEY);
  assert.equal(addedBacklog.status, 201, 'authenticated backlog add should create a task');
  assert.equal(addedBacklog.json.task.status, 'queued', 'new backlog task should start queued');

  const claimedBacklog = await request('POST', '/api/sessions/backlog/claim-next', {
    sessionId: started.json.session.id,
  }, API_KEY);
  assert.equal(claimedBacklog.status, 200, 'claim-next should select a backlog task');
  assert.equal(claimedBacklog.json.task.id, addedBacklog.json.task.id, 'claim-next should prefer highest priority');
  assert.equal(claimedBacklog.json.task.status, 'running', 'claimed backlog task should be running');
  assert.match(claimedBacklog.json.session.currentTask, /Urgent deterministic backlog task/, 'session current task should reflect claimed backlog');

  const completedBacklog = await request('POST', `/api/sessions/backlog/${addedBacklog.json.task.id}/complete`, {
    sessionId: started.json.session.id,
    checkpointRef: 'backlog-checkpoint-1',
  }, API_KEY);
  assert.equal(completedBacklog.status, 200, 'complete should finalize a running backlog task');
  assert.equal(completedBacklog.json.task.status, 'completed', 'completed backlog task should be completed');
  assert.equal(completedBacklog.json.session.checkpointRef, 'backlog-checkpoint-1', 'completion should update session checkpoint');

  const current = await request('GET', '/api/sessions/current', null, API_KEY);
  assert.equal(current.status, 200, 'current session should be readable');
  assert.equal(current.json.session.id, started.json.session.id, 'current session should match started session');

  const heartbeat = await request('POST', '/api/sessions/heartbeat', {
    sessionId: started.json.session.id,
    currentTask: 'test heartbeat',
    checkpointRef: 'test-checkpoint-1',
    graphId: controlPlaneArtifacts.graphId,
    intentId: controlPlaneArtifacts.intentId,
    graphPlanPath: controlPlaneArtifacts.graphPlanPath,
    normalizedIntentPath: controlPlaneArtifacts.normalizedIntentPath,
    verificationState: 'partial',
    promotionState: 'blocked_pending_verification',
  }, API_KEY);
  assert.equal(heartbeat.status, 200, 'heartbeat should update active session');
  assert.equal(heartbeat.json.session.currentTask, 'test heartbeat', 'heartbeat should persist current task');
  assert.equal(heartbeat.json.session.checkpointRef, 'test-checkpoint-1', 'heartbeat should persist checkpoint ref');
  assert.equal(heartbeat.json.session.graphId, controlPlaneArtifacts.graphId, 'heartbeat should persist graph id');
  assert.equal(heartbeat.json.session.intentId, controlPlaneArtifacts.intentId, 'heartbeat should persist intent id');
  assert.equal(heartbeat.json.session.graphPlanPath, controlPlaneArtifacts.graphPlanPath, 'heartbeat should persist graph artifact path');
  assert.equal(heartbeat.json.session.normalizedIntentPath, controlPlaneArtifacts.normalizedIntentPath, 'heartbeat should persist normalized intent artifact path');
  assert.equal(heartbeat.json.session.verificationState, 'partial', 'heartbeat should persist verification state');
  assert.equal(heartbeat.json.session.promotionState, 'blocked_pending_verification', 'heartbeat should persist promotion state');
  assert.ok(
    heartbeat.json.session.lastHeartbeatAt >= started.json.session.lastHeartbeatAt,
    'heartbeat timestamp should move forward',
  );

  const controlPlaneStatus = await request('GET', '/api/control-plane/status', null, API_KEY);
  assert.equal(controlPlaneStatus.status, 200, 'control-plane status should be readable');
  assert.equal(controlPlaneStatus.json.activeSession.id, started.json.session.id, 'control-plane status should join active session');
  assert.equal(controlPlaneStatus.json.currentGraph.graphId, controlPlaneArtifacts.graphId, 'control-plane status should summarize graph plan');
  assert.equal(controlPlaneStatus.json.currentGraph.intentId, controlPlaneArtifacts.intentId, 'control-plane status should summarize intent id');
  assert.equal(controlPlaneStatus.json.currentGraph.nodeCount, 3, 'control-plane status should expose graph node count');
  assert.equal(controlPlaneStatus.json.nodeCountsByVerificationStatus.verified, 1, 'control-plane status should count verified nodes');
  assert.equal(controlPlaneStatus.json.nodeCountsByVerificationStatus.pending, 2, 'control-plane status should count pending nodes');
  assert.equal(
    controlPlaneStatus.json.promotionGateStatus.status,
    'blocked_pending_verification',
    'promotion gate status should prefer session promotion metadata',
  );

  const history = await request('GET', '/api/sessions/history', null, API_KEY);
  assert.equal(history.status, 200, 'history should be readable');
  assert.equal(
    history.json.sessions.some((session) => session.id === started.json.session.id),
    true,
    'history should include the active session',
  );

  await stopBackend(child);
  child = await startBackend();

  const recovered = await request('GET', '/api/sessions/current', null, API_KEY);
  assert.equal(recovered.status, 200, 'current session should be readable after backend restart');
  assert.equal(recovered.json.session.id, started.json.session.id, 'restart should recover the same active session');
  assert.ok(recovered.json.session.restartCount >= 1, 'restart recovery should increment restart count');
  assert.equal(recovered.json.session.canResume, true, 'recovered session should advertise resumability');
  assert.equal(recovered.json.session.graphId, controlPlaneArtifacts.graphId, 'restart should recover graph id');
  assert.equal(recovered.json.session.graphPlanPath, controlPlaneArtifacts.graphPlanPath, 'restart should recover graph artifact path');

  const recoveredBacklog = await request('GET', `/api/sessions/backlog?sessionId=${started.json.session.id}`, null, API_KEY);
  assert.equal(recoveredBacklog.status, 200, 'backlog should be readable after backend restart');
  assert.equal(
    recoveredBacklog.json.tasks.some((task) => task.id === addedBacklog.json.task.id && task.status === 'completed'),
    true,
    'completed backlog task should persist after restart',
  );

  const recoveredControlPlaneStatus = await request('GET', '/api/control-plane/status', null, API_KEY);
  assert.equal(recoveredControlPlaneStatus.status, 200, 'control-plane status should survive restart');
  assert.equal(
    recoveredControlPlaneStatus.json.currentGraph.graphId,
    controlPlaneArtifacts.graphId,
    'restart status should recover graph summary from persisted path',
  );

  const stopped = await request('POST', '/api/sessions/stop', {
    sessionId: started.json.session.id,
    reason: 'test complete',
  }, API_KEY);
  assert.equal(stopped.status, 200, 'stop should complete active session');
  assert.equal(stopped.json.session.status, 'completed', 'stopped session should be completed');

  const empty = await request('GET', '/api/sessions/current', null, API_KEY);
  assert.equal(empty.status, 200, 'current session should remain readable after stop');
  assert.equal(empty.json.session, null, 'no active session should remain after stop');

  process.stdout.write('yuri-session-runtime: pass\n');
} finally {
  if (child) await stopBackend(child);
  fs.rmSync(tempDir, { recursive: true, force: true });
}

async function startBackend() {
  const proc = spawn('npm', ['--prefix', 'backend', 'run', 'dev'], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      API_KEY,
      PORT: String(PORT),
      YURI_DB_PATH: dbPath,
      YURI_TEST_MODE: '1',
      YURI_DISABLE_WATCHERS: '1',
      YURI_DISABLE_INTERVALS: '1',
      YURI_DISABLE_SWARM_ORCHESTRATOR: '1',
      YURI_SESSION_RUNTIME_TEST_MODE: '1',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let output = '';
  proc.stdout.on('data', (chunk) => {
    output += chunk.toString();
  });
  proc.stderr.on('data', (chunk) => {
    output += chunk.toString();
  });

  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    if (SERVER_READY.test(output)) return proc;
    if (proc.exitCode !== null) {
      throw new Error(`backend exited before ready:\n${output}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  proc.kill('SIGTERM');
  throw new Error(`backend did not become ready:\n${output}`);
}

async function stopBackend(proc) {
  if (!proc || proc.exitCode !== null) return;
  proc.kill('SIGTERM');
  await Promise.race([
    once(proc, 'exit'),
    new Promise((resolve) => setTimeout(resolve, 3000)),
  ]);
}

async function request(method, route, body, apiKey) {
  const headers = { Origin: 'http://localhost:4200' };
  if (apiKey) headers['X-API-KEY'] = apiKey;
  if (body) headers['Content-Type'] = 'application/json';

  const res = await fetch(`http://127.0.0.1:${PORT}${route}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  return {
    status: res.status,
    json,
  };
}

function createControlPlaneArtifacts(root) {
  const runDir = path.join(root, 'control-plane-run');
  const verificationDir = path.join(runDir, 'node-verifications');
  fs.mkdirSync(verificationDir, { recursive: true });
  const graphId = 'graph-runtime-test';
  const intentId = 'intent-runtime-test';
  const normalizedIntentPath = path.join(runDir, 'normalized-intent.json');
  const graphPlanPath = path.join(runDir, 'graph-plan.json');
  const nodes = [
    node('intake', 'intake', 'verified'),
    node('verify', 'verify', 'pending'),
    node('promote', 'promote', 'pending'),
  ];
  fs.writeFileSync(normalizedIntentPath, JSON.stringify({
    id: intentId,
    normalized_goal: 'prove control-plane session metadata recovery',
    artifact_policy: {
      raw_output_tainted: true,
    },
  }, null, 2));
  fs.writeFileSync(graphPlanPath, JSON.stringify({
    graph_id: graphId,
    graph_version: 'yuri.control-plane.v1',
    intent_id: intentId,
    created_at: new Date().toISOString(),
    scenario: 'control-plane-orchestration',
    route_lane: 'swarm',
    lifecycle: ['intake', 'normalize', 'graph-plan', 'route', 'execute', 'verify', 'sanitize', 'promote'],
    artifact_policy: {
      artifact_root: runDir,
      raw_output_tainted: true,
    },
    canonical_state_policy: {
      raw_output_tainted: true,
      sanitized_verified_summary_only: true,
      promotion_requires_review: true,
    },
    nodes: nodes.map(({ verificationStatus, ...entry }) => entry),
  }, null, 2));
  for (const entry of nodes) {
    fs.writeFileSync(
      path.join(verificationDir, `${entry.node_id}.verification.json`),
      JSON.stringify({ node_id: entry.node_id, verification_status: entry.verificationStatus }, null, 2),
    );
  }
  return { graphId, intentId, normalizedIntentPath, graphPlanPath };
}

function node(nodeId, kind, verificationStatus) {
  return {
    node_id: nodeId,
    kind,
    dependencies: [],
    capability: `${nodeId}-capability`,
    lane_hint: 'swarm',
    permission_tier: 'tier0_readonly',
    required_artifacts: [`${nodeId}.json`],
    verifier: `${nodeId}-verifier`,
    promotion_gate: {
      requires_verification: kind === 'promote',
      action: kind === 'promote' ? 'existing-learning-review-only' : 'none',
    },
    verificationStatus,
  };
}
