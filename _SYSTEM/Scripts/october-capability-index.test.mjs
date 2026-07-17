import assert from 'node:assert/strict';
import http from 'node:http';
import test from 'node:test';

import {
  buildRegistry,
  classifyTool,
  fetchOctoberTools,
  parseMcpResponse,
  schemaDigest,
  validateRegistry,
} from './october-capability-index.mjs';

const FIXTURE_TOOLS = [
  { name: 'wait_for_nodes', description: 'Wait for workers.', inputSchema: { type: 'object' } },
  { name: 'send_to_node', description: 'Drive a worker.', inputSchema: { type: 'object' } },
  { name: 'claim_task', description: 'Claim a task atomically.', inputSchema: { type: 'object' } },
  { name: 'message_peer', description: 'Message a peer.', inputSchema: { type: 'object' } },
  { name: 'browser_read', description: 'Read a browser.', inputSchema: { type: 'object' } },
];
const META = { version: '1.0.30', bundleSha256: 'a'.repeat(64) };

function listen(handler) {
  const server = http.createServer(handler);
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server)));
}

test('classifies representative October side effects', () => {
  assert.equal(classifyTool('browser_read').authorizationClass, 'read-only');
  assert.equal(classifyTool('check_inbox').authorizationClass, 'stateful-read');
  assert.equal(classifyTool('claim_task').authorizationClass, 'board-write');
  assert.equal(classifyTool('send_to_node').authorizationClass, 'communication-write');
  assert.equal(classifyTool('browser_eval').userConfirmation, true);
});

test('parses JSON and SSE MCP tools/list envelopes', () => {
  const payload = { jsonrpc: '2.0', id: 1, result: { tools: FIXTURE_TOOLS } };
  assert.equal(parseMcpResponse(JSON.stringify(payload)).length, FIXTURE_TOOLS.length);
  assert.equal(parseMcpResponse(`event: message\ndata: ${JSON.stringify(payload)}\n\n`).length, FIXTURE_TOOLS.length);
});

test('registry build is sorted, deterministic, external-authority, and valid', () => {
  const a = buildRegistry(FIXTURE_TOOLS, META);
  const b = buildRegistry([...FIXTURE_TOOLS].reverse(), META);
  assert.equal(a.toolSchemaSha256, b.toolSchemaSha256);
  assert.deepEqual(a.tools.map((tool) => tool.name), [...a.tools.map((tool) => tool.name)].sort());
  assert.equal(a.authority.owner, 'October');
  assert.match(a.authority.rule, /does not redefine/);
  assert.equal(validateRegistry(a).ok, true);
  assert.equal(schemaDigest(FIXTURE_TOOLS), a.toolSchemaSha256);
});

test('live discovery sends October attachment headers and reads SSE', async (t) => {
  let seenHeaders;
  const server = await listen((req, res) => {
    seenHeaders = req.headers;
    res.writeHead(200, { 'Content-Type': 'text/event-stream' });
    res.end(`event: message\ndata: ${JSON.stringify({ result: { tools: FIXTURE_TOOLS }, jsonrpc: '2.0', id: 1 })}\n\n`);
  });
  t.after(() => server.close());
  const { port } = server.address();
  const tools = await fetchOctoberTools({ OCTOBER_BUS_PORT: String(port), OCTOBER_BUS_CANVAS: 'canvas-fixture', OCTOBER_BUS_NODE: 'node-fixture' }, { timeoutMs: 500 });
  assert.equal(tools.length, FIXTURE_TOOLS.length);
  assert.equal(seenHeaders['x-october-canvas'], 'canvas-fixture');
  assert.equal(seenHeaders['x-october-node'], 'node-fixture');
  assert.match(seenHeaders.accept, /text\/event-stream/);
});

test('live discovery aborts a stalled October endpoint inside the outer hook budget', async (t) => {
  const server = await listen(() => {});
  t.after(() => {
    server.closeAllConnections?.();
    server.close();
  });
  const { port } = server.address();
  const started = Date.now();
  await assert.rejects(
    fetchOctoberTools({ OCTOBER_BUS_PORT: String(port), OCTOBER_BUS_CANVAS: 'canvas-fixture', OCTOBER_BUS_NODE: 'node-fixture' }, { timeoutMs: 60 }),
  );
  assert.ok(Date.now() - started < 1000, 'stalled request must fail soft before an outer harness timeout');
});

test('validator rejects unclassified new October tools to force explicit drift review', () => {
  const registry = buildRegistry([...FIXTURE_TOOLS, { name: 'future_mutator', description: 'New tool.', inputSchema: {} }], META);
  const verdict = validateRegistry(registry);
  assert.equal(verdict.ok, false);
  assert.ok(verdict.errors.includes('unclassified October tool: future_mutator'));
});
