#!/usr/bin/env node

import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';

const PORT = 3352;
const API_KEY = 'test-api-key-123456';
const SERVER_READY = /YURI_BACKEND_ONLINE/;

let child = null;

try {
  child = await startBackend();

  const response = await fetch(`http://127.0.0.1:${PORT}/api/health/ready`, {
    headers: { Origin: 'http://localhost:4200' },
  });
  assert.notEqual(response.status, 500, 'readiness endpoint should not crash while reporting database status');

  const json = await response.json();
  assert.equal(json.database.available, true, 'readiness should expose database availability');
  assert.equal(json.database.quickCheck, 'ok', 'readiness should expose sqlite quick_check result');
  assert.equal(json.database.foreignKeyViolations, 0, 'readiness should expose foreign key check count');
  assert.equal(Number.isInteger(json.database.schemaVersion), true, 'readiness should expose sqlite user_version');
  assert.equal(Number.isInteger(json.database.latestSchemaVersion), true, 'readiness should expose expected schema version');
  assert.equal(json.database.schemaVersion, json.database.latestSchemaVersion, 'readiness should expose migration parity');
  assert.equal(json.database.migrationsReady, true, 'readiness should mark migrations ready only at latest schema version');
  assert.equal(json.database.ready, true, 'database readiness should require integrity and migration checks');

  process.stdout.write('backend-db-readiness-migration-status: pass\n');
} finally {
  if (child) await stopBackend(child);
}

async function startBackend() {
  const proc = spawn('npm', ['--prefix', 'backend', 'run', 'dev'], {
    cwd: process.cwd(),
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
  proc.stdout.on('data', (chunk) => { output += chunk.toString(); });
  proc.stderr.on('data', (chunk) => { output += chunk.toString(); });

  const deadline = Date.now() + 45_000;
  while (Date.now() < deadline) {
    if (SERVER_READY.test(output)) return proc;
    if (proc.exitCode !== null) throw new Error(`backend exited before ready:\n${output}`);
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
