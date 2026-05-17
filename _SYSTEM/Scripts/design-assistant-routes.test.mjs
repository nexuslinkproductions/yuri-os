#!/usr/bin/env node

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { once } from 'node:events';

const PORT = 3335;
const API_KEY = 'test-api-key-123456';
const SERVER_READY = /YURI_BACKEND_ONLINE/;

const repoScratch = path.join(process.cwd(), '.tmp');
fs.mkdirSync(repoScratch, { recursive: true });
const tempDir = fs.mkdtempSync(path.join(repoScratch, 'design-assistant-routes-'));
const appDbPath = path.join(tempDir, 'app.db');

let child = null;

try {
  child = await startBackend();

  const capture = await request('POST', '/api/design-assistant/captures', {
    tabId: 3,
    url: 'http://127.0.0.1:3335/api/control-plane/plan',
    title: 'Headless Control Plane',
    viewport: { width: 1280, height: 800 },
    screenshotDataUrl: 'data:image/png;base64,aGVsbG8=',
  });
  assert.equal(capture.status, 201, 'capture endpoint should persist browser screenshot evidence');
  assert.equal(capture.json.capture.url, 'http://127.0.0.1:3335/api/control-plane/plan');

  const oversizedScreenshot = 'data:image/png;base64,' + Buffer.alloc(180_000, 7).toString('base64');
  const largeCapture = await request('POST', '/api/design-assistant/captures', {
    tabId: 4,
    url: 'http://127.0.0.1:3335/oversized',
    title: 'Oversized capture',
    viewport: { width: 1920, height: 1080 },
    screenshotDataUrl: oversizedScreenshot,
  });
  assert.equal(largeCapture.status, 201, 'capture endpoint should accept a full visible-tab screenshot payload');
  assert.equal(largeCapture.json.capture.url, 'http://127.0.0.1:3335/oversized');

  const selection = await request('POST', '/api/design-assistant/selections', {
    captureId: capture.json.capture.id,
    tabId: 3,
    url: capture.json.capture.url,
    kind: 'element',
    selector: 'main h1',
    label: 'Hero headline',
    role: 'heading',
    text: 'Command Center',
    bounds: { x: 80, y: 64, width: 560, height: 84 },
    computedStyles: { fontSize: '56px' },
    structure: { parent: 'main', siblings: ['p', 'button'] },
  });
  assert.equal(selection.status, 201, 'selection endpoint should persist element metadata');

  const designRequest = await request('POST', '/api/design-assistant/requests', {
    captureId: capture.json.capture.id,
    selectionId: selection.json.selection.id,
    instruction: 'Make this headless control plane easier to read and operate.',
    constraints: ['Backend remains the only active surface', 'No UI mutation'],
    targetProjectRoot: process.cwd(),
    designSourceIds: ['linear', 'vercel', 'raycast'],
    payload: { route: '/api/control-plane/plan' },
  });
  assert.equal(designRequest.status, 201, 'request endpoint should queue Codex work');

  const pending = await request('GET', '/api/design-assistant/requests/pending');
  assert.equal(pending.status, 200);
  assert.equal(pending.json.requests.length, 1);

  const claimed = await request('POST', '/api/design-assistant/requests/claim-next', { claimedBy: 'route-test' });
  assert.equal(claimed.status, 200);
  assert.equal(claimed.json.request.id, designRequest.json.request.id);
  assert.equal(claimed.json.request.status, 'claimed');

  const response = await request('POST', '/api/design-assistant/responses', {
    requestId: designRequest.json.request.id,
    source: 'codex',
    status: 'working',
    message: 'Route test response.',
    artifacts: [{ path: 'backend/src/services/headlessControlPlaneService.ts' }],
  });
  assert.equal(response.status, 201, 'response endpoint should append Codex status');

  const resources = await request('GET', '/api/design-assistant/mcp/resources');
  assert.equal(resources.status, 200);
  assert.equal(resources.json.resources.some((resource) => resource.uri === 'design-assistant://latest-selection'), true);

  const read = await request('GET', `/api/design-assistant/mcp/resources/read?uri=${encodeURIComponent('design-assistant://requests/pending')}`);
  assert.equal(read.status, 200);
  assert.deepEqual(read.json.resource, []);

  const applied = await request('POST', `/api/design-assistant/requests/${designRequest.json.request.id}/applied`, {
    notes: 'Applied by route test.',
  });
  assert.equal(applied.status, 200);
  assert.equal(applied.json.request.status, 'applied');

  process.stdout.write('design-assistant-routes: pass\n');
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
      YURI_MEMORY_DB_PATH: appDbPath,
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

async function request(method, route, body) {
  const headers = { Origin: 'chrome-extension://route-test-extension-id' };
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
