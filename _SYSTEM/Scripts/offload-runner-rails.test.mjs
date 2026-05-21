import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { recordCrash } from './kagami-overseer.mjs';
import { allowOnlyIfBindable } from './loopback-capability.mjs';

const REPO_ROOT = fileURLToPath(new URL('../..', import.meta.url));

function runOffload(args, env) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, ['_SYSTEM/Scripts/offload-runner.mjs', ...args], {
      cwd: REPO_ROOT,
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });
    child.on('close', (status, signal) => resolve({ status, signal, stdout, stderr }));
  });
}

function isolatedEnv(tmpDir, port, extra = {}) {
  return {
    ...process.env,
    NVIDIA_API_KEY: 'mock-nvidia-key',
    NVIDIA_KEY_GPT_OSS_120B: '',
    NVIDIA_NIM_BASE_URL: `http://127.0.0.1:${port}/v1`,
    OFFLOAD_STREAM: '0',
    TOKEN_LEDGER_AUTO_DRAIN: '0',
    TOKEN_LEDGER_DB_PATH: path.join(tmpDir, 'memory.db'),
    TOKEN_LEDGER_QUEUE_DIR: path.join(tmpDir, 'token-queue'),
    TOKEN_LEDGER_FAULT_DIR: path.join(tmpDir, 'token-faults'),
    TOKEN_LEDGER_VAULT_DIR: path.join(tmpDir, 'token-vault'),
    YURI_NIM_TRANSIENT_INCIDENT_LOG: path.join(tmpDir, 'nim-transient.jsonl'),
    YURI_KAGAMI_LEDGER_PATH: path.join(tmpDir, 'kagami-ledger.jsonl'),
    YURI_MEMORY_LEDGER_PATH: path.join(tmpDir, 'memory-ledger.jsonl'),
    ...extra,
  };
}

function jsonChatResponse(model, content) {
  return JSON.stringify({
    model,
    choices: [{ message: { role: 'assistant', content } }],
    usage: {
      prompt_tokens: 1,
      completion_tokens: 1,
      total_tokens: 2,
    },
  });
}

test('offload runner retries transient NIM failures then falls back to nano Nemotron', { timeout: 15_000 }, async (t) => {
  if (!(await allowOnlyIfBindable(t))) return;
  const tmpDir = mkdtempSync(path.join(os.tmpdir(), 'yuri-offload-rails-'));
  const requests = [];
  const server = http.createServer((req, res) => {
    if (req.method !== 'POST' || req.url !== '/v1/chat/completions') {
      res.writeHead(404);
      res.end();
      return;
    }

    let raw = '';
    req.on('data', (chunk) => {
      raw += chunk.toString();
    });
    req.on('end', () => {
      const body = JSON.parse(raw || '{}');
      requests.push(body);
      if (body.model === 'nvidia/nemotron-3-super-120b-a12b') {
        res.writeHead(503, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ error: 'mock cold start' }));
        return;
      }
      assert.equal(body.model, 'nvidia/nemotron-3-nano-30b-a3b');
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(jsonChatResponse(body.model, 'fallback ok'));
    });
  });

  try {
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const { port } = server.address();
    const env = isolatedEnv(tmpDir, port);
    const result = await runOffload(['nvidia-nemotron-120b', 'say ok'], env);

    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /fallback ok/);
    assert.equal(requests.filter((entry) => entry.model === 'nvidia/nemotron-3-super-120b-a12b').length, 3);
    assert.equal(requests.filter((entry) => entry.model === 'nvidia/nemotron-3-nano-30b-a3b').length, 1);
    assert.match(result.stderr, /falling back to nvidia-nemotron-nano-30b/);

    const incidents = readFileSync(path.join(tmpDir, 'nim-transient.jsonl'), 'utf8');
    assert.match(incidents, /"action":"retry"/);
    assert.match(incidents, /"action":"fallback"/);
    const memoryLedger = readFileSync(path.join(tmpDir, 'memory-ledger.jsonl'), 'utf8');
    assert.match(memoryLedger, /"type":"lane_output"/);
  } finally {
    server.close();
    rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('offload runner aborts quarantined lanes when no healthy fallback is available', { timeout: 10_000 }, async () => {
  const tmpDir = mkdtempSync(path.join(os.tmpdir(), 'yuri-offload-no-fallback-'));
  const logPath = path.join(tmpDir, 'kagami-ledger.jsonl');
  const base = Date.parse('2026-05-20T12:00:00.000Z');
  for (const lane of ['nvidia-nemotron-120b', 'nvidia-nemotron-nano-30b', 'nvidia-mistral-medium']) {
    for (let i = 0; i < 3; i += 1) {
      recordCrash(lane, {
        logPath,
        timestamp: base + i * 1000,
        reason: 'provider-503',
        status: 503,
      });
    }
  }

  try {
    const env = isolatedEnv(tmpDir, 65530, { YURI_KAGAMI_LEDGER_PATH: logPath });
    const result = await runOffload(['nvidia-nemotron-120b', 'say ok'], env);

    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /NO_HEALTHY_LANE_FOR_TASK/);
    const ledger = readFileSync(logPath, 'utf8');
    assert.match(ledger, /"event":"escalation"/);
    assert.match(ledger, /NO_HEALTHY_LANE_FOR_TASK/);
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('offload runner treats user shell blocks as prompt text', { timeout: 10_000 }, async (t) => {
  if (!(await allowOnlyIfBindable(t))) return;
  const tmpDir = mkdtempSync(path.join(os.tmpdir(), 'yuri-offload-input-rails-'));
  let receivedPrompt = '';
  const server = http.createServer((req, res) => {
    if (req.method !== 'POST' || req.url !== '/v1/chat/completions') {
      res.writeHead(404);
      res.end();
      return;
    }

    let raw = '';
    req.on('data', (chunk) => {
      raw += chunk.toString();
    });
    req.on('end', () => {
      const body = JSON.parse(raw || '{}');
      receivedPrompt = body.messages?.at(-1)?.content || '';
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(jsonChatResponse(body.model, 'plain ok'));
    });
  });

  try {
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const { port } = server.address();
    const env = isolatedEnv(tmpDir, port);
    const result = await runOffload([
      'nvidia-mistral-medium',
      'inspect this only',
      '```bash',
      'echo SHOULD_NOT_RUN',
      '```',
    ], env);

    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stderr, /user shell block treated as prompt text/);
    assert.match(result.stdout, /plain ok/);
    assert.match(receivedPrompt, /echo SHOULD_NOT_RUN/);
  } finally {
    server.close();
    rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('offload runner substitutes quarantined NIM lanes before dispatch', { timeout: 10_000 }, async (t) => {
  if (!(await allowOnlyIfBindable(t))) return;
  const tmpDir = mkdtempSync(path.join(os.tmpdir(), 'yuri-offload-quarantine-'));
  const logPath = path.join(tmpDir, 'kagami-ledger.jsonl');
  const base = Date.parse('2026-05-20T12:00:00.000Z');
  for (let i = 0; i < 3; i += 1) {
    recordCrash('nvidia-nemotron-120b', {
      logPath,
      timestamp: base + i * 1000,
      reason: 'provider-503',
      status: 503,
    });
  }

  const requests = [];
  const server = http.createServer((req, res) => {
    if (req.method !== 'POST' || req.url !== '/v1/chat/completions') {
      res.writeHead(404);
      res.end();
      return;
    }

    let raw = '';
    req.on('data', (chunk) => {
      raw += chunk.toString();
    });
    req.on('end', () => {
      const body = JSON.parse(raw || '{}');
      requests.push(body);
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(jsonChatResponse(body.model, 'substituted ok'));
    });
  });

  try {
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const { port } = server.address();
    const env = isolatedEnv(tmpDir, port, { YURI_KAGAMI_LEDGER_PATH: logPath });
    const result = await runOffload(['nvidia-nemotron-120b', 'say ok'], env);

    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /substituted ok/);
    assert.equal(requests.length, 1);
    assert.equal(requests[0].model, 'nvidia/nemotron-3-nano-30b-a3b');
    assert.match(result.stderr, /quarantined nvidia-nemotron-120b; substituting nvidia-nemotron-nano-30b/);
  } finally {
    server.close();
    rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('offload runner blocks lane output when declared evidence ids are missing', { timeout: 10_000 }, async (t) => {
  if (!(await allowOnlyIfBindable(t))) return;
  const tmpDir = mkdtempSync(path.join(os.tmpdir(), 'yuri-offload-output-rails-'));
  const server = http.createServer((req, res) => {
    if (req.method !== 'POST' || req.url !== '/v1/chat/completions') {
      res.writeHead(404);
      res.end();
      return;
    }

    req.resume();
    req.on('end', () => {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(jsonChatResponse('nvidia/mistral-medium-3.1', 'model output should be blocked'));
    });
  });

  try {
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const { port } = server.address();
    const env = isolatedEnv(tmpDir, port, {
      YURI_OUTPUT_REQUIRED_EVIDENCE_IDS: 'source-a,source-b',
      YURI_OUTPUT_EVIDENCE_IDS: 'source-a',
    });
    const outputFile = path.join(tmpDir, 'blocked-output.txt');
    const result = await runOffload(['nvidia-mistral-medium', '--output-file', outputFile, 'say ok'], env);

    assert.equal(result.status, 2);
    assert.equal(result.stdout.includes('model output should be blocked'), false);
    assert.equal(existsSync(outputFile), false);
    assert.match(result.stderr, /required output evidence missing: source-b/);
    const memoryLedger = readFileSync(path.join(tmpDir, 'memory-ledger.jsonl'), 'utf8');
    assert.match(memoryLedger, /"exitCode":2/);
    assert.match(memoryLedger, /"ok":false/);
    assert.match(memoryLedger, /required output evidence missing: source-b/);
  } finally {
    server.close();
    rmSync(tmpDir, { recursive: true, force: true });
  }
});
