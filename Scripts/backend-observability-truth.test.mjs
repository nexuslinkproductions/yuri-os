#!/usr/bin/env node

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { once } from 'node:events';

const PORT = 3342;
const API_KEY = 'test-api-key-123456';
const SERVER_READY = /NUDIMMUD_BACKEND_ONLINE/;
const serverSource = fs.readFileSync(path.join(process.cwd(), 'backend/src/server.ts'), 'utf8');

assert.equal(/Math\.random\s*\(/.test(serverSource), false, 'backend status paths must not use Math.random()');
assert.equal(/fake(?:Latency|Request|Error)/i.test(serverSource), false, 'backend status paths must not expose fake observability values');
assert.equal(/name:\s*['"]GITNEXUS_MCP['"]\s*,\s*status:\s*['"]CONNECTED['"]/.test(serverSource), false, 'probed integrations must not be hardcoded connected');
const retiredIdentityPattern = new RegExp([
  ['exeo', 'flow'].join(''),
  ['exeo', '-flow'].join(''),
  ['exeo', ' flow'].join(''),
].join('|'), 'i');

let child = null;

try {
  child = await startBackend();

  await request('/api/health/live');
  await request('/api/health/auth');
  const status = await request('/api/status');

  assert.equal(status.status, 200, 'status endpoint should respond');
  assert.equal(JSON.stringify(status.json).match(retiredIdentityPattern), null, 'status output must not expose retired identity labels');

  const runtime = status.json.metrics?.runtime;
  assert.equal(typeof runtime, 'object', 'status metrics must expose runtime counters');
  assert.ok(runtime.requestCount >= 2, `requestCount should reflect real handled requests, got ${runtime.requestCount}`);
  assert.ok(runtime.errorCount >= 1, `errorCount should include the unauthenticated auth probe, got ${runtime.errorCount}`);
  assert.ok(runtime.latencyTotalMs >= 0, 'latencyTotalMs should be real non-negative runtime data');
  assert.ok(runtime.averageLatencyMs >= 0, 'averageLatencyMs should be real non-negative runtime data');
  assert.ok(runtime.maxLatencyMs >= 0, 'maxLatencyMs should be real non-negative runtime data');
  assert.equal(typeof runtime.lastRequestAt, 'string', 'runtime metrics should expose lastRequestAt');
  assert.equal(typeof runtime.statusCodes, 'object', 'runtime metrics should expose status code counts');

  process.stdout.write('backend-observability-truth: pass\n');
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
      NUDIMMUD_DB_PATH: ':memory:',
      NUDIMMUD_TEST_MODE: '1',
      NUDIMMUD_DISABLE_WATCHERS: '1',
      NUDIMMUD_DISABLE_INTERVALS: '1',
      NUDIMMUD_DISABLE_SWARM_ORCHESTRATOR: '1',
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

async function request(route) {
  const response = await fetch(`http://127.0.0.1:${PORT}${route}`, {
    headers: { Origin: 'http://localhost:4200' },
  });
  const text = await response.text();
  let json = {};
  try { json = text ? JSON.parse(text) : {}; } catch { json = { raw: text }; }
  return { status: response.status, json };
}
