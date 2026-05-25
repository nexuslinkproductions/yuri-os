import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

async function importFreshLaneSession() {
  return import(`./lane-session.mjs?test=${Date.now()}-${Math.random()}`);
}

test('lane sessions default to YURI-owned runtime state', async () => {
  delete process.env.YURI_LANE_SESSION_DIR;
  delete process.env.YURI_LEGACY_LANE_SESSION_DIR;
  const mod = await importFreshLaneSession();
  const paths = mod.__test__.sessionPaths('deepseek-v4-pro', 'default');

  assert.match(paths.jsonl, /_SYSTEM\/state\/lane-sessions\/deepseek-v4-pro__default\.jsonl$/);
  assert.doesNotMatch(paths.jsonl, /\.claude\/lane-sessions/);
});

test('lane session dir can be overridden for tests and isolated workers', async () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'yuri-lane-session-'));
  process.env.YURI_LANE_SESSION_DIR = dir;
  delete process.env.YURI_LEGACY_LANE_SESSION_DIR;

  try {
    const mod = await importFreshLaneSession();
    const session = mod.loadLaneSession({ modelId: 'deepseek-v4-pro', sessionName: 'cache-test' });
    session.record('ping', 'pong');

    assert.equal(session.sessionPath, path.join(dir, 'deepseek-v4-pro__cache-test.jsonl'));
    const rows = readFileSync(session.sessionPath, 'utf8').trim().split('\n').map((line) => JSON.parse(line));
    assert.deepEqual(rows.map((row) => row.role), ['user', 'assistant']);
  } finally {
    delete process.env.YURI_LANE_SESSION_DIR;
    rmSync(dir, { recursive: true, force: true });
  }
});

test('lane sessions can be disabled for sterile health probes', async () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'yuri-lane-disabled-'));
  process.env.YURI_LANE_SESSION_DIR = dir;
  delete process.env.YURI_LEGACY_LANE_SESSION_DIR;

  try {
    const mod = await importFreshLaneSession();
    const session = mod.loadLaneSession({ modelId: 'deepseek-v4-pro', sessionName: 'health', disabled: true });
    session.record('Health preflight. Reply exactly PONG and nothing else.', 'PONG');

    assert.equal(session.enabled, false);
    assert.equal(session.sessionPath, null);
  } finally {
    delete process.env.YURI_LANE_SESSION_DIR;
    rmSync(dir, { recursive: true, force: true });
  }
});

test('NIM persistent sessions are isolated by concrete model, not provider bucket', async () => {
  const mod = await importFreshLaneSession();
  const qwenId = mod.laneSessionModelId({
    lane: 'nvidia-nim',
    model: 'qwen/qwen3.5-397b-a17b',
    endpoint: 'https://integrate.api.nvidia.com/v1',
  });
  const nemotronId = mod.laneSessionModelId({
    lane: 'nvidia-nim',
    model: 'nvidia/nemotron-3-super-120b-a12b',
    endpoint: 'https://integrate.api.nvidia.com/v1',
  });

  assert.equal(qwenId, 'nvidia-qwen/qwen3.5-397b-a17b');
  assert.equal(nemotronId, 'nvidia-nvidia/nemotron-3-super-120b-a12b');
  assert.notEqual(qwenId, nemotronId);
  assert.match(mod.__test__.sessionPaths(qwenId, 'default').jsonl, /nvidia-qwen_qwen3.5-397b-a17b__default\.jsonl$/);
});

test('trim rewrite tolerates a concurrently rotated session file', async () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'yuri-lane-trim-'));
  const jsonlPath = path.join(dir, 'deepseek-v4-pro__default.jsonl');

  try {
    const mod = await importFreshLaneSession();
    mod.__test__.rewriteTrimmedHistory(jsonlPath, [
      { role: 'system', content: '[LANE-MEMORY] compacted' },
      { role: 'user', content: 'recent task' },
    ]);

    const rows = readFileSync(jsonlPath, 'utf8').trim().split('\n').map((line) => JSON.parse(line));
    assert.deepEqual(rows.map((row) => row.role), ['system', 'user']);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('legacy Claude lane sessions migrate into YURI-owned state through the wrapper', async () => {
  const primaryDir = mkdtempSync(path.join(os.tmpdir(), 'yuri-lane-primary-'));
  const legacyDir = mkdtempSync(path.join(os.tmpdir(), 'yuri-lane-legacy-'));
  process.env.YURI_LANE_SESSION_DIR = primaryDir;
  process.env.YURI_LEGACY_LANE_SESSION_DIR = legacyDir;

  try {
    const legacyPath = path.join(legacyDir, 'deepseek-v4-pro__default.jsonl');
    writeFileSync(legacyPath, [
      JSON.stringify({ role: 'user', content: 'old question', ts: '2026-05-23T00:00:00.000Z' }),
      JSON.stringify({ role: 'assistant', content: 'old answer', ts: '2026-05-23T00:00:01.000Z' }),
      '',
    ].join('\n'));

    const mod = await importFreshLaneSession();
    const session = mod.loadLaneSession({ modelId: 'deepseek-v4-pro', sessionName: 'default' });

    assert.equal(session.sessionPath, path.join(primaryDir, 'deepseek-v4-pro__default.jsonl'));
    assert.equal(session.sourceSessionPath, legacyPath);
    assert.deepEqual(session.history.map((turn) => turn.content), ['old question', 'old answer']);
    assert.equal(readFileSync(session.sessionPath, 'utf8'), readFileSync(legacyPath, 'utf8'));
  } finally {
    delete process.env.YURI_LANE_SESSION_DIR;
    delete process.env.YURI_LEGACY_LANE_SESSION_DIR;
    rmSync(primaryDir, { recursive: true, force: true });
    rmSync(legacyDir, { recursive: true, force: true });
  }
});

test('lane compaction omits prior lane-memory turns to prevent recursive cache bloat', async () => {
  const mod = await importFreshLaneSession();
  const history = [
    { role: 'system', content: '[LANE-MEMORY] Earlier summary that should not be re-summarized '.repeat(20) },
    { role: 'user', content: 'first concrete user task '.repeat(20) },
    { role: 'assistant', content: 'first concrete answer '.repeat(20) },
    { role: 'user', content: 'recent task '.repeat(10) },
    { role: 'assistant', content: 'recent answer '.repeat(10) },
  ];

  const result = mod.compactHistory(history, { budgetChars: 400, summaryChars: 600 });

  assert.equal(result.trimmed, true);
  assert.equal(result.omittedLaneMemoryTurns, 1);
  assert.match(result.history[0].content, /prior LANE-MEMORY turns were not re-summarized/);
  assert.doesNotMatch(result.history[0].content, /Earlier summary that should not be re-summarized/);
});
