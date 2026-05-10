#!/usr/bin/env node

import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';

const PORT = 3317;
const API_KEY = 'test-api-key-123456';
const SERVER_READY = /NUDIMMUD_BACKEND_ONLINE/;

const child = spawn('npm', ['--prefix', 'backend', 'run', 'dev'], {
  cwd: process.cwd(),
  env: {
    ...process.env,
    API_KEY,
    PORT: String(PORT),
    NUDIMMUD_DB_PATH: ':memory:',
    NUDIMMUD_TEST_MODE: '1',
    NUDIMMUD_DISABLE_WATCHERS: '1',
    NUDIMMUD_DISABLE_INTERVALS: '1',
    NUDIMMUD_DISABLE_SWARM_ORCHESTRATOR: '1',
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
