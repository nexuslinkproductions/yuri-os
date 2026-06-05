import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
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

function runOffloadWrapper(args, env) {
  return new Promise((resolve) => {
    const child = spawn('_SYSTEM/Scripts/offload.sh', args, {
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
    DEEPSEEK_API_KEY: 'mock-deepseek-key',
    DEEPSEEK_BASE_URL: `http://127.0.0.1:${port}/v1`,
    OFFLOAD_STREAM: '0',
    TOKEN_LEDGER_AUTO_DRAIN: '0',
    TOKEN_LEDGER_DB_PATH: path.join(tmpDir, 'memory.db'),
    TOKEN_LEDGER_QUEUE_DIR: path.join(tmpDir, 'token-queue'),
    TOKEN_LEDGER_FAULT_DIR: path.join(tmpDir, 'token-faults'),
    TOKEN_LEDGER_VAULT_DIR: path.join(tmpDir, 'token-vault'),
    YURI_NIM_TRANSIENT_INCIDENT_LOG: path.join(tmpDir, 'nim-transient.jsonl'),
    YURI_KAGAMI_LEDGER_PATH: path.join(tmpDir, 'kagami-ledger.jsonl'),
    YURI_MEMORY_LEDGER_PATH: path.join(tmpDir, 'memory-ledger.jsonl'),
    YURI_GUARDRAIL_VIOLATION_LOG: path.join(tmpDir, 'guardrail-violations.jsonl'),
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

function mockTransportEnv(tmpDir, content = 'plain ok', extra = {}) {
  return {
    YURI_OFFLOAD_MOCK_TRANSPORT: '1',
    YURI_OFFLOAD_MOCK_CONTENT: content,
    YURI_OFFLOAD_MOCK_REQUEST_LOG: path.join(tmpDir, 'mock-requests.jsonl'),
    ...extra,
  };
}

function readMockRequests(tmpDir) {
  return readFileSync(path.join(tmpDir, 'mock-requests.jsonl'), 'utf8')
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

test('offload runner retries transient failures on the same lane only', { timeout: 15_000 }, async () => {
  const tmpDir = mkdtempSync(path.join(os.tmpdir(), 'yuri-offload-rails-'));

  try {
    const env = isolatedEnv(tmpDir, 65530, mockTransportEnv(tmpDir, 'same lane ok', {
      YURI_OFFLOAD_MOCK_STATUSES: '503,503,200',
    }));
    const result = await runOffload(['deepseek-v4-pro', 'say ok'], env);
    const requests = readMockRequests(tmpDir).map((entry) => entry.body);

    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /same lane ok/);
    assert.equal(requests.length, 3);
    assert.equal(requests.filter((entry) => entry.model === 'deepseek-v4-pro').length, 3);
    assert.doesNotMatch(result.stderr, /falling back to|substituting/);

    const incidents = readFileSync(path.join(tmpDir, 'nim-transient.jsonl'), 'utf8');
    assert.match(incidents, /"action":"retry"/);
    assert.doesNotMatch(incidents, /"action":"fallback"/);
    const memoryLedger = readFileSync(path.join(tmpDir, 'memory-ledger.jsonl'), 'utf8');
    assert.match(memoryLedger, /"type":"lane_output"/);
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('offload runner does not substitute quarantined lanes across models', { timeout: 10_000 }, async () => {
  const tmpDir = mkdtempSync(path.join(os.tmpdir(), 'yuri-offload-no-substitute-'));
  const logPath = path.join(tmpDir, 'kagami-ledger.jsonl');
  const base = Date.parse('2026-05-20T12:00:00.000Z');
  for (let i = 0; i < 3; i += 1) {
    recordCrash('deepseek-v4-pro', {
      logPath,
      timestamp: base + i * 1000,
      reason: 'provider-503',
      status: 503,
    });
  }

  try {
    const env = isolatedEnv(tmpDir, 65530, {
      YURI_KAGAMI_LEDGER_PATH: logPath,
      ...mockTransportEnv(tmpDir, 'quarantine observed'),
    });
    const result = await runOffload(['deepseek-v4-pro', 'say ok'], env);
    const requests = readMockRequests(tmpDir).map((entry) => entry.body);

    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /quarantine observed/);
    assert.equal(requests.length, 1);
    assert.equal(requests[0].model, 'deepseek-v4-pro');
    assert.doesNotMatch(result.stderr, /substituting|NO_HEALTHY_LANE_FOR_TASK/);
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('offload runner treats user shell blocks as prompt text', { timeout: 10_000 }, async () => {
  const tmpDir = mkdtempSync(path.join(os.tmpdir(), 'yuri-offload-input-rails-'));

  try {
    const env = isolatedEnv(tmpDir, 65530, mockTransportEnv(tmpDir, 'plain ok'));
    const result = await runOffload([
      'deepseek-v4-pro',
      'inspect this only',
      '```bash',
      'echo SHOULD_NOT_RUN',
      '```',
    ], env);

    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stderr, /user shell block treated as prompt text/);
    assert.match(result.stdout, /plain ok/);
    const receivedPrompt = readMockRequests(tmpDir).at(-1).body.messages?.at(-1)?.content || '';
    assert.match(receivedPrompt, /echo SHOULD_NOT_RUN/);
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('offload runner preserves lane output as advisory when declared evidence ids are missing', { timeout: 10_000 }, async () => {
  const tmpDir = mkdtempSync(path.join(os.tmpdir(), 'yuri-offload-output-rails-'));

  try {
    const env = isolatedEnv(tmpDir, 65530, {
      YURI_OUTPUT_REQUIRED_EVIDENCE_IDS: 'source-a,source-b',
      YURI_OUTPUT_EVIDENCE_IDS: 'source-a',
      ...mockTransportEnv(tmpDir, 'model output should be preserved'),
    });
    const outputFile = path.join(tmpDir, 'advisory-output.txt');
    const result = await runOffload(['deepseek-v4-pro', '--output-file', outputFile, 'say ok'], env);

    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout.includes('model output should be preserved'), true);
    assert.equal(result.stdout.includes('[ADVISORY_HYPOTHESIS_ONLY]'), true);
    assert.equal(existsSync(outputFile), true);
    assert.match(readFileSync(outputFile, 'utf8'), /model output should be preserved/);
    assert.match(result.stderr, /required output evidence missing: source-b/);
    const memoryLedger = readFileSync(path.join(tmpDir, 'memory-ledger.jsonl'), 'utf8');
    assert.match(memoryLedger, /"exitCode":0/);
    assert.match(memoryLedger, /"ok":true/);
    assert.match(memoryLedger, /required output evidence missing: source-b/);
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('offload runner denies protected --output-file targets', { timeout: 10_000 }, async () => {
  const tmpDir = mkdtempSync(path.join(os.tmpdir(), 'yuri-offload-protected-output-'));

  try {
    const env = isolatedEnv(tmpDir, 65530, mockTransportEnv(tmpDir, 'plain ok'));
    const result = await runOffload(['deepseek-v4-pro', '--output-file', 'backend/data/blocked-output.txt', 'say ok'], env);

    assert.equal(result.status, 2);
    assert.match(result.stdout, /plain ok/);
    assert.match(result.stderr, /protected output file denied/);
    const guardrailLog = readFileSync(path.join(tmpDir, 'guardrail-violations.jsonl'), 'utf8');
    assert.match(guardrailLog, /output-file/);
    assert.match(guardrailLog, /backend\/data\/blocked-output\.txt/);
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('offload runner marks missing configured lane key as exit 3', { timeout: 10_000 }, async () => {
  const tmpDir = mkdtempSync(path.join(os.tmpdir(), 'yuri-offload-minimax-'));
  try {
    const env = isolatedEnv(tmpDir, 65531, {
      NVIDIA_API_KEY: '',
      DEEPSEEK_API_KEY: '',
      CODE_DEEPSEEK_API_KEY: '',
      YURI_DISABLE_KEYCHAIN_LOOKUP: '1',
    });
    const result = await runOffload(['deepseek-v4-pro', 'pong'], env);

    assert.equal(result.status, 3);
    assert.equal(result.stdout, '');
    assert.match(result.stderr, /^OFFLOAD_FAIL code=3 lane=deepseek-v4-pro reason=SKIPPED_MISSING_KEY\n$/);
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('offload runner marks removed or unknown lane as exit 3', { timeout: 10_000 }, async () => {
  const tmpDir = mkdtempSync(path.join(os.tmpdir(), 'yuri-offload-removed-lane-'));
  try {
    const env = isolatedEnv(tmpDir, 65531);
    const result = await runOffload(['nvidia-minimax-m27', 'pong'], env);

    assert.equal(result.status, 3);
    assert.equal(result.stdout, '');
    assert.match(result.stderr, /^OFFLOAD_FAIL code=3 lane=nvidia-minimax-m27 reason=Unsupported_lane:_nvidia-minimax-m27\n$/);
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('offload wrapper routes Kimi through NVIDIA NIM vendor model', { timeout: 10_000 }, async () => {
  const tmpDir = mkdtempSync(path.join(os.tmpdir(), 'yuri-offload-kimi-wrapper-'));

  try {
    const env = isolatedEnv(tmpDir, 65530, {
      NVIDIA_API_KEY: 'mock-nvidia-key',
      OFFLOAD_QUEUE_BYPASS: '1',
      ...mockTransportEnv(tmpDir, 'PONG'),
    });
    const result = await runOffloadWrapper(['-m', 'kimi-k2.6', 'Reply PONG only.'], env);
    const requests = readMockRequests(tmpDir).map((entry) => entry.body);

    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /PONG/);
    assert.match(result.stderr, /MANUAL_OVERRIDE :: model=kimi-k2.6/);
    assert.match(result.stderr, /ROUTING_TO_KIMI_NIM/);
    assert.doesNotMatch(result.stderr, /UNKNOWN_MODEL/);
    assert.equal(requests.length, 1);
    assert.equal(requests[0].model, 'moonshotai/kimi-k2.6');
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('offload wrapper forwards no-session to NIM runner', { timeout: 10_000 }, async () => {
  const tmpDir = mkdtempSync(path.join(os.tmpdir(), 'yuri-offload-no-session-'));
  const sessionDir = path.join(tmpDir, 'lane-sessions');

  try {
    const env = isolatedEnv(tmpDir, 65530, {
      OFFLOAD_QUEUE_BYPASS: '1',
      YURI_LANE_SESSION_DIR: sessionDir,
      ...mockTransportEnv(tmpDir, 'PONG'),
    });
    const result = await runOffloadWrapper(['-m', 'nemotron-3-ultra-550b-a55b', '--no-tools', '--no-session', 'Reply PONG only.'], env);
    const requests = readMockRequests(tmpDir).map((entry) => entry.body);

    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /PONG/);
    assert.equal(requests.length, 1);
    assert.doesNotMatch(result.stderr, /lane-session.*persisted/);
    assert.equal(existsSync(sessionDir) ? readdirSync(sessionDir).length : 0, 0);
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('offload runner dry-runs only the three configured offload lanes', { timeout: 10_000 }, async () => {
  const tmpDir = mkdtempSync(path.join(os.tmpdir(), 'yuri-offload-three-lanes-'));
  try {
    const env = isolatedEnv(tmpDir, 65532);
    const expected = [
      ['deepseek-v4-pro', 'deepseek-v4-pro', 131072],
      ['nemotron-3-ultra-550b-a55b', 'nvidia/nemotron-3-ultra-550b-a55b', 32768],
      ['kimi-k2.6', 'moonshotai/kimi-k2.6', 32768],
    ];
    for (const [lane, model, maxTokens] of expected) {
      const result = await runOffload([lane, '--dry-run', 'pong'], env);
      const payload = JSON.parse(result.stdout);
      assert.equal(result.status, 0, result.stderr);
      assert.equal(payload.lane, lane);
      assert.equal(payload.model, model);
      assert.equal(payload.maxTokens, maxTokens);
      assert.equal(payload.apiKey, '[set]');
    }

    const removed = await runOffload(['nvidia-minimax-m27', '--dry-run', 'pong'], env);
    assert.equal(removed.status, 3);
    assert.match(removed.stderr, /^OFFLOAD_FAIL code=3 lane=nvidia-minimax-m27 reason=Unsupported_lane:_nvidia-minimax-m27\n$/);
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
});
