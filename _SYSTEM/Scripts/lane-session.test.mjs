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
