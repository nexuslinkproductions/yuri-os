#!/usr/bin/env node

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { once } from 'node:events';

const PORT = 3324;
const API_KEY = 'test-api-key-123456';
const SERVER_READY = /YURI_BACKEND_ONLINE/;

const repoScratch = path.join(process.cwd(), '.tmp');
fs.mkdirSync(repoScratch, { recursive: true });
const tempDir = fs.mkdtempSync(path.join(repoScratch, 'site-builder-routes-'));
const appDbPath = path.join(tempDir, 'app.db');
const memoryDbPath = path.join(tempDir, 'memory.db');

let child = null;

try {
  child = await startBackend();

  const anonymous = await request('GET', '/api/site-builder/pages');
  assert.equal(anonymous.status, 401, 'site builder pages should require auth');

  const pages = await request('GET', '/api/site-builder/pages', null, API_KEY);
  assert.equal(pages.status, 200, 'pages endpoint should be readable with auth');
  assert.equal(pages.json.pages.length, 5, 'pages endpoint should expose current website registry');

  const session = await request('POST', '/api/site-builder/sessions', {
    pageRoute: '/',
    mode: 'structure',
  }, API_KEY);
  assert.equal(session.status, 201, 'session endpoint should create a session');

  const annotation = await request('POST', '/api/site-builder/annotations', {
    sessionId: session.json.session.id,
    nodeId: 'home.hero',
    route: '/',
    note: 'Tighten hero offer and CTA hierarchy.',
  }, API_KEY);
  assert.equal(annotation.status, 201, 'annotation endpoint should persist node notes');

  const intent = await request('POST', '/api/site-builder/intents', {
    sessionId: session.json.session.id,
    nodeId: 'home.hero',
    route: '/',
    mode: 'design',
    operation: 'rewrite',
    prompt: 'Make the hero more concrete and conversion-led.',
    designSourceIds: ['linear', 'vercel-geist', 'raycast', 'frontier-design-intelligence'],
  }, API_KEY);
  assert.equal(intent.status, 201, 'intent endpoint should persist edit intents');

  const packet = await request('POST', `/api/site-builder/intents/${intent.json.intent.id}/packet`, {}, API_KEY);
  assert.equal(packet.status, 201, 'packet endpoint should create a reviewable packet');
  assert.match(packet.json.packet.markdown, /home\.hero/, 'packet should include target node in markdown');

  const detail = await request('GET', `/api/site-builder/sessions/${session.json.session.id}`, null, API_KEY);
  assert.equal(detail.status, 200, 'session detail should be reloadable');
  assert.equal(detail.json.session.annotations.length, 1, 'session detail should include annotations');
  assert.equal(detail.json.session.intents.length, 1, 'session detail should include intents');
  assert.equal(detail.json.session.packets.length, 1, 'session detail should include packets');

  process.stdout.write('site-builder-routes: pass\n');
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
      YURI_DB_PATH: appDbPath,
      YURI_MEMORY_DB_PATH: memoryDbPath,
      YURI_TEST_MODE: '1',
      YURI_DISABLE_WATCHERS: '1',
      YURI_DISABLE_INTERVALS: '1',
      YURI_DISABLE_SWARM_ORCHESTRATOR: '1',
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
  if (body) headers['Content-Type'] = 'application/json';
  const response = await fetch(`http://127.0.0.1:${PORT}${route}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await response.text();
  let json = {};
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    json = { raw: text };
  }
  return { status: response.status, json };
}
