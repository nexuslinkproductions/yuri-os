#!/usr/bin/env node
/**
 * Regression test for Obsidian route surface.
 *
 * Verifies that the canonical api.ts implementations are reachable after the
 * four duplicate server.ts registrations were removed (commit: duplicate route
 * cleanup). Key behavioral contract being pinned: /api/obsidian/sync calls
 * testConnection(), not ping(), and returns { success: boolean, test: true }.
 */

import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const BACKEND_ROOT = path.join(REPO_ROOT, '_SYSTEM/backend');
const PORT = 3338;
const API_KEY = 'test-api-key-123456';
const SERVER_READY = /YURI_BACKEND_ONLINE/;

let child = null;

try {
  child = await startBackend();

  // GET /api/obsidian/status — authenticated local diagnostics only.
  const statusNoAuth = await request('GET', '/api/obsidian/status');
  assert.equal(statusNoAuth.status, 401, 'obsidian/status without auth should return 401');
  const status = await request('GET', '/api/obsidian/status', undefined, API_KEY);
  assert.equal(status.status, 200, 'obsidian/status with valid auth should return 200');
  assert.ok('mode' in status.json, 'obsidian/status response should include a mode field');
  assert.ok('connected' in status.json, 'obsidian/status response should include a connected field');

  // GET /api/obsidian/paths — authenticated because it exposes local vault paths.
  const pathsNoAuth = await request('GET', '/api/obsidian/paths');
  assert.equal(pathsNoAuth.status, 401, 'obsidian/paths without auth should return 401');
  const paths = await request('GET', '/api/obsidian/paths', undefined, API_KEY);
  assert.equal(paths.status, 200, 'obsidian/paths with valid auth should return 200');
  assert.ok(Array.isArray(paths.json.vaults), 'obsidian/paths response should include a vaults array');
  assert.equal(typeof paths.json.count, 'number', 'obsidian/paths response should include a numeric count');

  // POST /api/obsidian/sync unauthenticated → 401 (auth gate must be active)
  const syncNoAuth = await request('POST', '/api/obsidian/sync', { action: 'test' });
  assert.equal(syncNoAuth.status, 401, 'obsidian/sync without auth should return 401');

  // POST /api/obsidian/sync authenticated with action:test → { success: boolean, test: true }
  // This pins the api.ts implementation (testConnection) over the removed server.ts one (ping).
  const syncAuth = await request('POST', '/api/obsidian/sync', { action: 'test' }, API_KEY);
  assert.equal(syncAuth.status, 200, 'obsidian/sync with valid auth should return 200');
  assert.equal(typeof syncAuth.json.success, 'boolean', 'obsidian/sync response must include boolean success');
  assert.equal(syncAuth.json.test, true, 'obsidian/sync response must include test:true sentinel');

  // POST /api/obsidian/sync authenticated with unknown action → 400
  const syncBadAction = await request('POST', '/api/obsidian/sync', { action: 'noop' }, API_KEY);
  assert.equal(syncBadAction.status, 400, 'obsidian/sync with unknown action should return 400');

  // POST /api/obsidian/reconnect unauthenticated → 401
  const reconnectNoAuth = await request('POST', '/api/obsidian/reconnect', {});
  assert.equal(reconnectNoAuth.status, 401, 'obsidian/reconnect without auth should return 401');

  // POST /api/obsidian/reconnect authenticated → { success: boolean, status: 'RECONNECT_ATTEMPTED' }
  const reconnectAuth = await request('POST', '/api/obsidian/reconnect', {}, API_KEY);
  assert.equal(reconnectAuth.status, 200, 'obsidian/reconnect with valid auth should return 200');
  assert.equal(typeof reconnectAuth.json.success, 'boolean', 'obsidian/reconnect must include boolean success');
  assert.equal(reconnectAuth.json.status, 'RECONNECT_ATTEMPTED', 'obsidian/reconnect must include RECONNECT_ATTEMPTED status');

  // POST /api/obsidian/restart-sync unauthenticated → 401
  const restartNoAuth = await request('POST', '/api/obsidian/restart-sync', {});
  assert.equal(restartNoAuth.status, 401, 'obsidian/restart-sync without auth should return 401');

  process.stdout.write('obsidian-routes: pass\n');
} finally {
  if (child) await stopBackend(child);
}

async function startBackend() {
  const proc = spawn('npm', ['run', 'dev'], {
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

async function request(method, route, body, apiKey) {
  const headers = { Origin: 'http://localhost:4200' };
  if (apiKey) headers['X-API-KEY'] = apiKey;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const response = await fetch(`http://127.0.0.1:${PORT}${route}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await response.text();
  let json = {};
  try { json = text ? JSON.parse(text) : {}; } catch { json = { raw: text }; }
  return { status: response.status, json };
}
