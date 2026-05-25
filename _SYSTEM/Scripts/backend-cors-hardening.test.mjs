#!/usr/bin/env node

import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const BACKEND_ROOT = path.join(REPO_ROOT, '_SYSTEM/backend');
const PORT = 3317;
const API_KEY = 'test-api-key-123456';
const SERVER_READY = /YURI_BACKEND_ONLINE/;

const child = spawn('npm', ['run', 'dev'], {
  cwd: BACKEND_ROOT,
  env: {
    ...process.env,
    API_KEY,
    PORT: String(PORT),
    YURI_DB_PATH: ':memory:',
    YURI_TEST_MODE: '1',
    YURI_DISABLE_WATCHERS: '1',
    YURI_DISABLE_INTERVALS: '1',
    YURI_DISABLE_SWARM_ORCHESTRATOR: '1',
  },
  stdio: ['ignore', 'pipe', 'pipe'],
});

let output = '';

try {
  await waitForServer(child);

  const blocked = await fetch(`http://127.0.0.1:${PORT}/api/health/live`, {
    headers: { Origin: 'https://evil.example' },
  });
  const blockedText = await blocked.text();
  assert.equal(blocked.status, 403, 'blocked CORS origin should return 403');
  assert.match(blocked.headers.get('content-type') || '', /application\/json/i, 'blocked CORS response should be JSON');
  assert.doesNotMatch(blockedText, /<html|stack|backend\/src\/server/i, 'blocked CORS response should not leak HTML or stack paths');
  assert.equal(JSON.parse(blockedText).error, 'CORS_BLOCKED', 'blocked CORS response should expose stable error code');

  const allowed = await fetch(`http://127.0.0.1:${PORT}/api/health/live`, {
    headers: { Origin: 'http://localhost:4200' },
  });
  assert.equal(allowed.status, 200, 'loopback CORS origin should be allowed');
  assert.equal(allowed.headers.get('x-powered-by'), null, 'x-powered-by should be disabled');

  const ready = await fetch(`http://127.0.0.1:${PORT}/api/health/ready`, {
    headers: { Origin: 'http://localhost:4200' },
  });
  const readyJson = await ready.json();
  assert.equal(readyJson.database.available, true, 'readiness should expose database availability');
  assert.equal(readyJson.database.quickCheck, 'ok', 'readiness should expose sqlite quick_check result');
  assert.equal(readyJson.database.foreignKeyViolations, 0, 'readiness should expose foreign key check count');
  assert.equal(readyJson.database.ready, true, 'readiness should mark database ready only after sqlite checks pass');

  for (const route of [
    ['/api/oracle/personality/rate', { rating: 'positive' }],
    ['/api/swarm/route', { prompt: 'route this unauthenticated request' }],
    ['/api/obsidian/reconnect', {}],
    ['/api/obsidian/restart-sync', {}],
    ['/api/obsidian/sync', { action: 'test' }],
  ]) {
    const [path, body] = route;
    const response = await fetch(`http://127.0.0.1:${PORT}${path}`, {
      method: 'POST',
      headers: {
        Origin: 'http://localhost:4200',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    assert.equal(response.status, 401, `${path} should reject unauthenticated mutation/control requests`);
  }

  const leakedToken = 'leaky-token-should-not-enter-logs';
  const streamAuth = await fetch(`http://127.0.0.1:${PORT}/api/oracle/stream?apiKey=${leakedToken}&command=ping`, {
    headers: { Origin: 'http://localhost:4200' },
  });
  assert.equal(streamAuth.status, 401, 'oracle stream should reject invalid query token');
  assert.equal(output.includes(leakedToken), false, 'request logs should redact apiKey query values');

  process.stdout.write('backend-cors-hardening: pass\n');
} finally {
  child.kill('SIGTERM');
  await Promise.race([
    once(child, 'exit'),
    new Promise((resolve) => setTimeout(resolve, 3000)),
  ]);
}

async function waitForServer(proc) {
  const deadline = Date.now() + 20_000;

  proc.stdout.on('data', (chunk) => {
    output += chunk.toString();
  });
  proc.stderr.on('data', (chunk) => {
    output += chunk.toString();
  });

  while (Date.now() < deadline) {
    if (SERVER_READY.test(output)) return;
    if (proc.exitCode !== null) {
      throw new Error(`backend exited before ready:\n${output}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  throw new Error(`backend did not become ready:\n${output}`);
}
