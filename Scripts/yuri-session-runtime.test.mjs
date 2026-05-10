#!/usr/bin/env node

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { once } from 'node:events';

const PORT = 3320;
const API_KEY = 'test-api-key-123456';
const SERVER_READY = /NUDIMMUD_BACKEND_ONLINE/;

const repoScratch = path.join(process.cwd(), '.tmp');
fs.mkdirSync(repoScratch, { recursive: true });
const tempDir = fs.mkdtempSync(path.join(repoScratch, 'nudimmud-session-runtime-'));
const dbPath = path.join(tempDir, 'runtime.db');

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

  const current = await request('GET', '/api/sessions/current', null, API_KEY);
  assert.equal(current.status, 200, 'current session should be readable');
  assert.equal(current.json.session.id, started.json.session.id, 'current session should match started session');

  const heartbeat = await request('POST', '/api/sessions/heartbeat', {
    sessionId: started.json.session.id,
    currentTask: 'test heartbeat',
    checkpointRef: 'test-checkpoint-1',
  }, API_KEY);
  assert.equal(heartbeat.status, 200, 'heartbeat should update active session');
  assert.equal(heartbeat.json.session.currentTask, 'test heartbeat', 'heartbeat should persist current task');
  assert.equal(heartbeat.json.session.checkpointRef, 'test-checkpoint-1', 'heartbeat should persist checkpoint ref');
  assert.ok(
    heartbeat.json.session.lastHeartbeatAt >= started.json.session.lastHeartbeatAt,
    'heartbeat timestamp should move forward',
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
      NUDIMMUD_DB_PATH: dbPath,
      NUDIMMUD_TEST_MODE: '1',
      NUDIMMUD_DISABLE_WATCHERS: '1',
      NUDIMMUD_DISABLE_INTERVALS: '1',
      NUDIMMUD_DISABLE_SWARM_ORCHESTRATOR: '1',
      NUDIMMUD_SESSION_RUNTIME_TEST_MODE: '1',
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
