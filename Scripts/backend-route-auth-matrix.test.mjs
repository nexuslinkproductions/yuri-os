#!/usr/bin/env node

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { once } from 'node:events';

const PORT = 3341;
const API_KEY = 'test-api-key-123456';
const SERVER_READY = /NUDIMMUD_BACKEND_ONLINE/;
const ROOT = process.cwd();

const routeSources = [
  { file: 'backend/src/server.ts', prefix: '', routers: ['app'] },
  { file: 'backend/src/routes/api.ts', prefix: '/api', routers: ['router'] },
  { file: 'backend/src/routes/designAssistantRoutes.ts', prefix: '/api/design-assistant', routers: ['designAssistant'], inherited: { localOnly: true } },
  { file: 'backend/src/routes/siteBuilderRoutes.ts', prefix: '/api/site-builder', routers: ['siteBuilder'], inherited: { localOnly: true, auth: true } },
  { file: 'backend/src/routes/designStudioRoutes.ts', prefix: '/api/design-studio', routers: ['designStudio'], inherited: { localOnly: true, auth: true } },
  { file: 'backend/src/routes/notebookRoutes.ts', prefix: '/api', routers: ['router'] },
  { file: 'backend/src/routes/consumerRoutes.ts', prefix: '/api', routers: ['router'] },
];

const publicRoutes = new Map([
  ['GET /api/direct-test', 'direct liveness probe returns no local data'],
  ['GET /api/ping-test', 'router liveness probe returns no local data'],
  ['GET /api/status', 'aggregate status endpoint is the public health surface'],
  ['GET /api/health', 'health endpoint is the public monitor surface'],
  ['GET /api/health/live', 'liveness endpoint is the public monitor surface'],
  ['GET /api/health/ready', 'readiness endpoint is the public monitor surface'],
  ['GET /api/oracle/personality', 'read-only Oracle profile used before auth bootstrap'],
  ['GET /api/neural/models', 'read-only model catalog'],
  ['GET /api/neural/images/models', 'read-only image model catalog'],
  ['GET /api/catalog', 'read-only workflow catalog'],
  ['GET /api/catalog/search', 'read-only workflow catalog search'],
  ['GET /api/catalog/workflows', 'read-only workflow catalog'],
  ['GET /api/catalog/workflows/:id', 'read-only workflow catalog detail'],
  ['GET /api/catalog/skills', 'read-only skill catalog'],
  ['GET /api/catalog/skills/:id', 'read-only skill catalog detail'],
  ['GET /api/catalog/math-curves', 'read-only math curve catalog'],
  ['GET /api/catalog/math-curves/:id', 'read-only math curve catalog detail'],
  ['POST /api/consumer/contact', 'public contact form with validation and rate limiting'],
  ['GET /api/consumer/status', 'public consumer site status'],
  ['GET /api/consumer/chat', 'public placeholder response only'],
]);

const localOnlyRoutes = new Map([
  ['GET /api/auth/bootstrap', 'local bootstrap returns the runtime token only to loopback clients'],
  ['GET /api/notebook/notebooks/:id/stream', 'local notebook SSE stream is loopback-only'],
  ['GET /api/notebook/docs/:docId/pdf', 'local notebook PDF export is loopback-only'],
]);

const adminPrefixes = [
  '/api/sessions',
  '/api/control-plane',
  '/api/oracle/improvement',
  '/api/oracle/personality/rate',
  '/api/oracle/command',
  '/api/image-gen',
  '/api/neural/recalibrate',
  '/api/neural/images/',
  '/api/neural/chat',
  '/api/outlook',
  '/api/plane',
  '/api/swarm/route',
  '/api/projects/',
  '/api/tickets/',
  '/api/knowledge/refresh',
  '/api/agents/:name/status',
  '/api/vault',
  '/api/execute',
  '/api/terminal',
  '/api/swarm/execute',
  '/api/obsidian/reconnect',
  '/api/obsidian/restart-sync',
  '/api/obsidian/sync',
];

const authenticatedReadRoutes = new Set([
  '/api/health/auth',
  '/api/oracle/improvement',
  '/api/neural/status',
  '/api/neural/images/:taskId',
  '/api/neural/verify-cloud',
  '/api/briefing',
  '/api/temporal-graph',
  '/api/deities',
  '/api/agents',
  '/api/agents/detail',
  '/api/agents/:name/activity',
  '/api/projects',
  '/api/events',
  '/api/calendar',
  '/api/tickets',
  '/api/integrations',
  '/api/files/ls',
  '/api/knowledge',
  '/api/knowledge/search',
  '/api/knowledge/detail',
  '/api/search/hybrid',
  '/api/swarm/messages',
  '/api/swarm/metrics',
  '/api/obsidian/status',
  '/api/obsidian/paths',
  '/api/telemetry/tokens',
]);

const authenticatedReadPrefixes = [
  '/api/notebook/',
  '/api/site-builder/',
  '/api/design-studio/',
];

const localToolPrefixes = new Map([
  ['/api/design-assistant/', 'local browser design assistant bridge is loopback-only'],
]);

const retiredFlowRouteRe = new RegExp(['/api/', 'exeo', 'flow'].join(''), 'i');

const protectedReadRoutes = [
  '/api/neural/status',
  '/api/neural/verify-cloud',
  '/api/briefing',
  '/api/agents',
  '/api/projects',
  '/api/tickets',
  '/api/files/ls?path=backend/src',
  '/api/knowledge',
  '/api/knowledge/search?q=yuri',
  '/api/knowledge/detail?path=package.json',
  '/api/search/hybrid?q=yuri',
  '/api/swarm/messages',
  '/api/swarm/metrics',
  '/api/obsidian/status',
  '/api/obsidian/paths',
  '/api/telemetry/tokens',
  '/api/yuri-flow/entries',
  '/api/yuri-flow/pending',
  '/api/integrations',
];

const protectedWriteRoutes = [
  { route: '/api/sessions/start', body: {} },
  { route: '/api/execute', body: { commandKey: 'noop' } },
  { route: '/api/yuri-flow/time', body: { ticket_id: 'T-1', time: '1m' } },
  { route: '/api/notebook/notebooks', body: { title: 'Auth probe' } },
];

const publicProbeRoutes = [
  '/api/status',
  '/api/health/live',
  '/api/catalog',
  '/api/consumer/status',
];

const routes = collectRoutes();
assert.ok(routes.length > 100, `route inventory should include mounted backend routes; found ${routes.length}`);

for (const route of routes) {
  assert.equal(retiredFlowRouteRe.test(route.path), false, `${route.label} uses a retired flow route name`);

  const classification = classifyRoute(route);
  assert.ok(classification, `${route.label} is not classified in the Yuri route auth matrix`);

  if (classification.public) {
    assert.equal(typeof classification.reason, 'string', `${route.label} public route is missing a reason`);
    assert.ok(classification.reason.length >= 16, `${route.label} public reason is too terse`);
    continue;
  }

  if (classification.localOnly) {
    assert.equal(route.hasLocalOnly, true, `${route.label} should use localOnlyMiddleware`);
  }

  if (classification.authenticated) {
    assert.equal(
      route.hasAuth || route.hasManualApiKey,
      true,
      `${route.label} should use authMiddleware or an explicit runtime API key check`
    );
  }
}

let child = null;

try {
  child = await startBackend();

  for (const route of publicProbeRoutes) {
    const response = await request('GET', route);
    assert.notEqual(response.status, 401, `${route} should remain available as a justified public route`);
  }

  for (const route of protectedReadRoutes) {
    const response = await request('GET', route);
    assert.equal(response.status, 401, `${route} should reject unauthenticated read access`);
    assert.equal(response.json.error, 'UNAUTHORIZED', `${route} should return stable auth error`);
  }

  for (const { route, body } of protectedWriteRoutes) {
    const response = await request('POST', route, undefined, body);
    assert.equal(response.status, 401, `${route} should reject unauthenticated write access`);
    assert.equal(response.json.error, 'UNAUTHORIZED', `${route} should return stable auth error`);
  }

  process.stdout.write('backend-route-auth-matrix: pass\n');
} finally {
  if (child) await stopBackend(child);
}

function collectRoutes() {
  const found = [];

  for (const source of routeSources) {
    const absolutePath = path.join(ROOT, source.file);
    const text = fs.readFileSync(absolutePath, 'utf8');
    const routerPattern = source.routers.map(escapeRegExp).join('|');
    const routePattern = new RegExp(`\\b(?:${routerPattern})\\.(get|post|patch|delete)\\(\\s*['"]([^'"]+)['"]`, 'g');
    let match = null;

    while ((match = routePattern.exec(text))) {
      const method = match[1].toUpperCase();
      const routePath = normalizePath(`${source.prefix}${match[2]}`);
      const line = lineAt(text, match.index);
      const block = blockAt(text, match.index, 18);
      const inherited = source.inherited || {};

      found.push({
        method,
        path: routePath,
        label: `${method} ${routePath} (${source.file})`,
        file: source.file,
        hasAuth: Boolean(inherited.auth) || /\bauthMiddleware\b/.test(line),
        hasLocalOnly: Boolean(inherited.localOnly) || /\blocalOnlyMiddleware\b/.test(line),
        hasManualApiKey: /getRuntimeApiKey\(\)|X-API-KEY|providedKey/.test(block),
      });
    }
  }

  return found.sort((a, b) => a.label.localeCompare(b.label));
}

function classifyRoute(route) {
  const key = `${route.method} ${route.path}`;
  if (publicRoutes.has(key)) {
    return { category: 'public', public: true, reason: publicRoutes.get(key) };
  }

  if (localOnlyRoutes.has(key)) {
    return { category: 'local-only', localOnly: true, reason: localOnlyRoutes.get(key) };
  }

  for (const [prefix, reason] of localToolPrefixes) {
    if (route.path.startsWith(prefix)) {
      return { category: 'local-tool', localOnly: true, reason };
    }
  }

  if (route.path.startsWith('/api/yuri-flow/')) {
    return { category: 'yuri-flow', authenticated: true };
  }

  if (route.path === '/api/oracle/stream') {
    return { category: 'authenticated-stream', authenticated: true };
  }

  if (adminPrefixes.some((prefix) => route.path === prefix || route.path.startsWith(prefix))) {
    return { category: 'admin-system', authenticated: true };
  }

  if (authenticatedReadRoutes.has(route.path) || authenticatedReadPrefixes.some((prefix) => route.path.startsWith(prefix))) {
    return { category: 'authenticated-read', authenticated: true };
  }

  return null;
}

function normalizePath(routePath) {
  return routePath.replace(/\/+/g, '/').replace(/\/$/, '') || '/';
}

function lineAt(text, index) {
  const start = text.lastIndexOf('\n', index) + 1;
  const end = text.indexOf('\n', index);
  return text.slice(start, end === -1 ? text.length : end);
}

function blockAt(text, index, lineCount) {
  const lines = text.slice(index).split('\n').slice(0, lineCount);
  return lines.join('\n');
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
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

async function request(method, route, apiKey, body) {
  const headers = { Origin: 'http://localhost:4200' };
  if (apiKey) headers['X-API-KEY'] = apiKey;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const response = await fetch(`http://127.0.0.1:${PORT}${route}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  let json = {};
  try { json = text ? JSON.parse(text) : {}; } catch { json = { raw: text }; }
  return { status: response.status, json };
}
