#!/usr/bin/env node

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { once } from 'node:events';

const PORT = 3334;
const API_KEY = 'test-api-key-123456';
const SERVER_READY = /YURI_BACKEND_ONLINE/;

const repoScratch = path.join(process.cwd(), '.tmp');
fs.mkdirSync(repoScratch, { recursive: true });
const tempDir = fs.mkdtempSync(path.join(repoScratch, 'design-studio-routes-'));
const appDbPath = path.join(tempDir, 'app.db');
const memoryDbPath = path.join(tempDir, 'memory.db');

let child = null;

try {
  child = await startBackend();

  const anonymous = await request('GET', '/api/design-studio/projects');
  assert.equal(anonymous.status, 401, 'design studio projects should require auth');

  const project = await request('POST', '/api/design-studio/projects', {
    name: 'Route test design project',
    targetRoot: process.cwd(),
  }, API_KEY);
  assert.equal(project.status, 201, 'project endpoint should create project');

  const artifact = await request('POST', '/api/design-studio/artifacts', {
    projectId: project.json.project.id,
    type: 'website',
    name: 'Headless control plane',
    uri: 'http://127.0.0.1:3334/api/control-plane/status',
  }, API_KEY);
  assert.equal(artifact.status, 201, 'artifact endpoint should create website artifact');

  const capture = await request('POST', `/api/design-studio/artifacts/${artifact.json.artifact.id}/capture`, {
    label: 'Current viewport',
    previewUri: 'http://127.0.0.1:3334/api/control-plane/status',
    metadata: { route: '/api/control-plane/status' },
  }, API_KEY);
  assert.equal(capture.status, 201, 'capture endpoint should persist visual evidence');

  const selection = await request('POST', '/api/design-studio/selections', {
    projectId: project.json.project.id,
    artifactId: artifact.json.artifact.id,
    captureId: capture.json.capture.id,
    label: 'Hero region',
    kind: 'region',
    locator: { type: 'bbox', bbox: { x: 20, y: 30, width: 400, height: 240 }, url: artifact.json.artifact.uri },
  }, API_KEY);
  assert.equal(selection.status, 201, 'selection endpoint should persist region selection');

  const references = await request('POST', '/api/design-studio/reference-sets', {
    projectId: project.json.project.id,
    sourceIds: ['linear', 'vercel-geist', 'raycast'],
  }, API_KEY);
  assert.equal(references.status, 201, 'reference endpoint should persist selected design sources');

  const intent = await request('POST', '/api/design-studio/intents', {
    projectId: project.json.project.id,
    selectionId: selection.json.selection.id,
    mode: 'design',
    operation: 'restyle',
    prompt: 'Make the selected hero sharper and more useful for Codex visual work.',
    constraints: ['No direct browser-side source mutation'],
    acceptanceChecks: ['Run npm run build'],
    designSourceIds: references.json.referenceSet.sourceIds,
  }, API_KEY);
  assert.equal(intent.status, 201, 'intent endpoint should persist design intent');

  const packet = await request('POST', `/api/design-studio/intents/${intent.json.intent.id}/packet`, {}, API_KEY);
  assert.equal(packet.status, 201, 'packet endpoint should create Codex packet');
  assert.match(packet.json.packet.markdown, /Codex Design Control Packet/);

  const mcp = await request('GET', `/api/design-studio/mcp/resources?projectId=${project.json.project.id}`, null, API_KEY);
  assert.equal(mcp.status, 200, 'MCP resource manifest should be readable');
  assert.equal(mcp.json.resources.some((resource) => resource.uri.includes('packets')), true);

  process.stdout.write('design-studio-routes: pass\n');
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
