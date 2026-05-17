#!/usr/bin/env node

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { once } from 'node:events';

const PORT = 3336;
const API_KEY = 'test-api-key-123456';
const BRIDGE_ORIGIN = `http://127.0.0.1:${PORT}`;
const SERVER_READY = /YURI_BACKEND_ONLINE/;

const repoScratch = path.join(process.cwd(), '.tmp');
fs.mkdirSync(repoScratch, { recursive: true });
const tempDir = fs.mkdtempSync(path.join(repoScratch, 'design-assistant-mcp-'));
const appDbPath = path.join(tempDir, 'app.db');

let backend = null;
let mcp = null;

try {
  backend = await startBackend();
  const capture = await request('POST', '/api/design-assistant/captures', {
    url: 'http://localhost:4200/operator',
    title: 'Operator',
    viewport: { width: 1280, height: 800 },
  });
  const selection = await request('POST', '/api/design-assistant/selections', {
    captureId: capture.json.capture.id,
    url: capture.json.capture.url,
    kind: 'region',
    bounds: { x: 20, y: 20, width: 300, height: 160 },
  });
  const designRequest = await request('POST', '/api/design-assistant/requests', {
    captureId: capture.json.capture.id,
    selectionId: selection.json.selection.id,
    instruction: 'MCP contract request.',
  });

  mcp = spawn(process.execPath, ['tools/chrome-design-assistant/mcp-server.mjs'], {
    cwd: process.cwd(),
    env: { ...process.env, DESIGN_ASSISTANT_BRIDGE_ORIGIN: BRIDGE_ORIGIN },
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  const client = createMcpClient(mcp);
  const initialized = await client.call('initialize', {});
  assert.equal(initialized.serverInfo.name, 'chrome-design-assistant');

  const tools = await client.call('tools/list', {});
  assert.equal(tools.tools.some((tool) => tool.name === 'design_assistant.claim_next_request'), true);

  const resources = await client.call('resources/list', {});
  assert.equal(resources.resources.some((resource) => resource.uri === 'design-assistant://requests/pending'), true);

  const claimed = await client.call('tools/call', {
    name: 'design_assistant.claim_next_request',
    arguments: { claimedBy: 'mcp-contract' },
  });
  const claimedJson = JSON.parse(claimed.content[0].text);
  assert.equal(claimedJson.request.id, designRequest.json.request.id);

  const posted = await client.call('tools/call', {
    name: 'design_assistant.post_response',
    arguments: {
      requestId: designRequest.json.request.id,
      source: 'codex',
      status: 'done',
      message: 'MCP contract response.',
    },
  });
  assert.match(posted.content[0].text, /MCP contract response/);

  process.stdout.write('design-assistant-mcp-contract: pass\n');
} finally {
  if (mcp) mcp.kill('SIGTERM');
  if (backend) await stopBackend(backend);
  fs.rmSync(tempDir, { recursive: true, force: true });
}

function createMcpClient(proc) {
  let nextId = 1;
  let buffer = Buffer.alloc(0);
  const pending = new Map();
  proc.stdout.on('data', (chunk) => {
    buffer = Buffer.concat([buffer, chunk]);
    while (buffer.length) {
      const headerEnd = buffer.indexOf('\r\n\r\n');
      if (headerEnd === -1) return;
      const header = buffer.slice(0, headerEnd).toString('utf8');
      const match = header.match(/Content-Length:\s*(\d+)/i);
      if (!match) throw new Error(`bad MCP frame header: ${header}`);
      const length = Number(match[1]);
      const frameStart = headerEnd + 4;
      const frameEnd = frameStart + length;
      if (buffer.length < frameEnd) return;
      const message = JSON.parse(buffer.slice(frameStart, frameEnd).toString('utf8'));
      buffer = buffer.slice(frameEnd);
      const callbacks = pending.get(message.id);
      if (!callbacks) continue;
      pending.delete(message.id);
      if (message.error) callbacks.reject(new Error(message.error.message));
      else callbacks.resolve(message.result);
    }
  });

  return {
    call(method, params) {
      const id = nextId++;
      const body = JSON.stringify({ jsonrpc: '2.0', id, method, params });
      proc.stdin.write(`Content-Length: ${Buffer.byteLength(body, 'utf8')}\r\n\r\n${body}`);
      return new Promise((resolve, reject) => {
        pending.set(id, { resolve, reject });
        setTimeout(() => reject(new Error(`MCP timeout for ${method}`)), 5000);
      });
    },
  };
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

async function request(method, route, body) {
  const headers = { Origin: 'chrome-extension://mcp-contract-extension-id' };
  if (body) headers['Content-Type'] = 'application/json';
  const response = await fetch(`${BRIDGE_ORIGIN}${route}`, {
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
  assert.equal(response.ok, true, `${method} ${route} failed: ${text}`);
  return { status: response.status, json };
}
