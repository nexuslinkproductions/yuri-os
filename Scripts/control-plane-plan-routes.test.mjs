#!/usr/bin/env node

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { once } from 'node:events';

const PORT = 3336;
const API_KEY = 'test-api-key-123456';
const SERVER_READY = /YURI_BACKEND_ONLINE/;

const repoScratch = path.join(process.cwd(), '.tmp');
fs.mkdirSync(repoScratch, { recursive: true });
const tempDir = fs.mkdtempSync(path.join(repoScratch, 'control-plane-plan-routes-'));
const appDbPath = path.join(tempDir, 'app.db');

let child = null;

try {
  child = await startBackend();

  const marketPlan = await request('POST', '/api/control-plane/plan', {
    prompt: 'backtest the market signal for Solana positions',
    mode: 'plan',
    source: 'route-test',
  }, API_KEY);
  assert.equal(marketPlan.status, 201, 'headless plan endpoint should create a plan');
  assert.equal(marketPlan.json.plan.routeDecision.yuriLane, 'trading');
  assert.equal(marketPlan.json.plan.routeDecision.actionGate, 'simulation_only');
  assert.equal(marketPlan.json.plan.guardrails.uiRemoved, true);
  assert.equal(marketPlan.json.plan.guardrails.liveTradingSimulationsEnabled, false);
  assert.ok(marketPlan.json.plan.blockedActions.includes('active_trading_simulations_disabled'));
  assert.match(marketPlan.json.plan.nextAction, /defer simulation/i);

  const growthPlan = await request('POST', '/api/control-plane/plan', {
    prompt: 'audit SEO, PPC, and structured data for the landing page',
    source: 'route-test',
  }, API_KEY);
  assert.equal(growthPlan.status, 201, 'headless plan endpoint should support growth work');
  assert.equal(growthPlan.json.plan.routeDecision.yuriLane, 'growth');
  assert.equal(growthPlan.json.plan.routeDecision.actionGate, 'draft_only');
  assert.ok(growthPlan.json.plan.blockedActions.includes('frontend_runtime_disabled'));
  assert.match(growthPlan.json.plan.nextAction, /draft/i);

  const blocked = await request('POST', '/api/control-plane/plan', {
    prompt: '',
  }, API_KEY);
  assert.equal(blocked.status, 400, 'blank prompts should be rejected');

  process.stdout.write('control-plane-plan-routes: pass\n');
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
