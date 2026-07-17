import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  bridgeMessage,
  parseMcpHttpPayload,
  requestOctober,
  resolveOctoberEnvironment,
} from './october-mcp-stdio-bridge.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../..');
const ROOT_RESOLVING_LAUNCH = 'exec node "$(git rev-parse --show-toplevel)/_SYSTEM/Scripts/october-mcp-stdio-bridge.mjs"';

function listen(handler) {
  const server = http.createServer(handler);
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server)));
}

function readJsonRequest(request, callback) {
  const chunks = [];
  request.on('data', (chunk) => chunks.push(chunk));
  request.on('end', () => callback(JSON.parse(Buffer.concat(chunks).toString('utf8'))));
}

function runChild({ cwd, env, message }) {
  return new Promise((resolve, reject) => {
    const child = spawn('sh', ['-c', ROOT_RESOLVING_LAUNCH], { cwd, env, stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    const timeout = setTimeout(() => child.kill(), 2_000);
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('error', reject);
    child.on('close', (code) => {
      clearTimeout(timeout);
      resolve({ code, stdout, stderr });
    });
    child.stdin.end(`${JSON.stringify(message)}\n`);
  });
}

test('requires attached October identity and validates a numeric loopback port', () => {
  assert.throws(() => resolveOctoberEnvironment({}), { code: 'configuration' });
  for (const port of ['tcp://12', '12.5', '0', '65536', '-1']) {
    assert.throws(
      () => resolveOctoberEnvironment({ OCTOBER_BUS_PORT: port, OCTOBER_BUS_CANVAS: 'canvas', OCTOBER_BUS_NODE: 'node' }),
      { code: 'configuration' },
    );
  }
  assert.deepEqual(
    resolveOctoberEnvironment({ OCTOBER_BUS_PORT: '27124', OCTOBER_BUS_CANVAS: 'canvas', OCTOBER_BUS_NODE: 'node' }),
    { host: '127.0.0.1', port: 27124, path: '/mcp', canvas: 'canvas', node: 'node' },
  );
});

test('Codex activation resolves the current worktree root and forwards only attached October identity', () => {
  const config = fs.readFileSync(path.join(ROOT, '.codex/config.toml'), 'utf8');
  const section = config.match(/\[mcp_servers\.october\]([\s\S]*?)(?=\n\[|$)/)?.[1] ?? '';
  assert.match(section, /command = "sh"/);
  assert.ok(section.includes(`args = ["-c", '${ROOT_RESOLVING_LAUNCH}']`));
  assert.match(section, /env_vars = \["OCTOBER_BUS_PORT", "OCTOBER_BUS_CANVAS", "OCTOBER_BUS_NODE"\]/);
  assert.doesNotMatch(section, /\/Users\/|YURI-OS-MUSUBI/);
  assert.doesNotMatch(section, /127\.0\.0\.1:\d+/);
});

test('parses JSON and multi-event SSE without leaking transport framing', () => {
  const one = { jsonrpc: '2.0', id: 1, result: { ok: true } };
  const two = { jsonrpc: '2.0', method: 'notifications/progress', params: { progress: 1 } };
  assert.deepEqual(parseMcpHttpPayload(JSON.stringify(one), 'application/json'), [one]);
  assert.deepEqual(
    parseMcpHttpPayload(`event: message\ndata: ${JSON.stringify(two)}\n\nevent: message\ndata: ${JSON.stringify(one)}\n\n`, 'text/event-stream'),
    [two, one],
  );
});

test('forwards attachment and MCP session headers and suppresses notification/202 output', async (t) => {
  const seen = [];
  const server = await listen((request, response) => readJsonRequest(request, (message) => {
    seen.push({ headers: request.headers, message });
    if (seen.length === 1) {
      response.writeHead(200, { 'Content-Type': 'application/json', 'Mcp-Session-Id': 'session-fixture' });
      response.end(JSON.stringify({ jsonrpc: '2.0', id: message.id, result: { initialized: true } }));
      return;
    }
    if (seen.length === 2) {
      response.writeHead(200, { 'Content-Type': 'text/event-stream' });
      response.end(`event: message\ndata: ${JSON.stringify({ jsonrpc: '2.0', id: message.id, result: { tools: [] } })}\n\n`);
      return;
    }
    response.writeHead(202, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify({ jsonrpc: '2.0', id: 99, result: { mustNotAppear: true } }));
  }));
  t.after(() => server.close());

  const { port } = server.address();
  const config = resolveOctoberEnvironment({
    OCTOBER_BUS_PORT: String(port),
    OCTOBER_BUS_CANVAS: 'canvas-fixture',
    OCTOBER_BUS_NODE: 'node-fixture',
  });
  const session = { id: null };

  const initialized = await bridgeMessage({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} }, config, session);
  assert.equal(initialized[0].result.initialized, true);
  assert.equal(session.id, 'session-fixture');
  const listed = await bridgeMessage({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} }, config, session);
  assert.deepEqual(listed[0].result.tools, []);
  const notification = await bridgeMessage({ jsonrpc: '2.0', method: 'notifications/initialized' }, config, session);
  assert.deepEqual(notification, []);

  assert.equal(seen[0].headers['x-october-canvas'], 'canvas-fixture');
  assert.equal(seen[0].headers['x-october-node'], 'node-fixture');
  assert.equal(seen[0].headers['mcp-session-id'], undefined);
  assert.equal(seen[1].headers['mcp-session-id'], 'session-fixture');
  assert.equal(seen[2].headers['mcp-session-id'], 'session-fixture');
});

test('enforces independent connect and whole-request deadlines', async (t) => {
  const config = { host: '127.0.0.1', port: 1, path: '/mcp', canvas: 'canvas', node: 'node' };
  const neverConnect = () => {
    const request = new EventEmitter();
    request.end = () => queueMicrotask(() => {
      const socket = new EventEmitter();
      socket.connecting = true;
      request.emit('socket', socket);
    });
    request.destroy = (error) => queueMicrotask(() => request.emit('error', error));
    return request;
  };
  await assert.rejects(
    requestOctober({ jsonrpc: '2.0', id: 1, method: 'initialize' }, config, { id: null }, {
      connectTimeoutMs: 30,
      requestTimeoutMs: 500,
      requestImpl: neverConnect,
    }),
    { code: 'connect-timeout' },
  );

  const stalled = await listen(() => {});
  t.after(() => {
    stalled.closeAllConnections?.();
    stalled.close();
  });
  config.port = stalled.address().port;
  await assert.rejects(
    requestOctober({ jsonrpc: '2.0', id: 2, method: 'tools/list' }, config, { id: null }, {
      connectTimeoutMs: 200,
      requestTimeoutMs: 50,
    }),
    { code: 'request-timeout' },
  );
});

test('CLI launches from root and nested cwd and keeps transport failures redacted', async (t) => {
  const server = await listen((request, response) => readJsonRequest(request, (message) => {
    if (message.method === 'redaction/test') {
      response.writeHead(503, { 'Content-Type': 'text/plain' });
      response.end('server-body-secret');
      return;
    }
    response.writeHead(200, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify({ jsonrpc: '2.0', id: message.id, result: { cwdSafe: true } }));
  }));
  t.after(() => server.close());
  const { port } = server.address();
  const env = {
    ...process.env,
    OCTOBER_BUS_PORT: String(port),
    OCTOBER_BUS_CANVAS: 'canvas-do-not-leak',
    OCTOBER_BUS_NODE: 'node-do-not-leak',
  };

  for (const cwd of [ROOT, HERE]) {
    const result = await runChild({ cwd, env, message: { jsonrpc: '2.0', id: cwd, method: 'initialize' } });
    assert.equal(result.code, 0);
    assert.equal(JSON.parse(result.stdout).result.cwdSafe, true);
    assert.equal(result.stderr, '');
  }

  const failed = await runChild({ cwd: HERE, env, message: { jsonrpc: '2.0', id: 7, method: 'redaction/test' } });
  assert.equal(failed.code, 0);
  assert.equal(JSON.parse(failed.stdout).error.message, 'October MCP bridge request failed');
  assert.match(failed.stderr, /HTTP 503/);
  for (const secret of ['canvas-do-not-leak', 'node-do-not-leak', 'server-body-secret', String(port)]) {
    assert.doesNotMatch(failed.stderr, new RegExp(secret));
  }
});
