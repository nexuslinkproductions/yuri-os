#!/usr/bin/env node

import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';

const PORT = 3358;
const API_KEY = 'test-api-key-123456';
const SERVER_READY = /YURI_BACKEND_ONLINE/;

let child = null;

try {
  child = await startBackend();

  const response = await fetch(`http://127.0.0.1:${PORT}/api/health/ready`, {
    headers: { Origin: 'http://localhost:4200' },
  });
  assert.notEqual(response.status, 500, 'readiness endpoint should not crash while reporting recovery metadata');

  const json = await response.json();
  assert.equal(typeof json.database.lastIntegrityCheckAt, 'string', 'readiness should expose last integrity check timestamp');
  assert.match(json.database.lastIntegrityCheckAt, /^\d{4}-\d{2}-\d{2}T/, 'last integrity check timestamp should be ISO-like');
  assert.equal(
    json.database.lastBackupAt === null || typeof json.database.lastBackupAt === 'string',
    true,
    'readiness should expose latest known DB recovery backup timestamp or null'
  );

  process.stdout.write('backend-db-readiness-recovery-metadata: pass\n');
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
