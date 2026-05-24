import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { collectLaneSessionHealth, REPO_ROOT } from './lane-cache-rotator.mjs';

function makeSessionDir() {
  return mkdtempSync(path.join(REPO_ROOT, '_SYSTEM', 'state', 'lane-sessions-test-'));
}

function writeSession(dir, name, turns) {
  const file = path.join(dir, name);
  writeFileSync(file, turns.map((turn) => JSON.stringify({
    role: turn.role,
    content: turn.content,
    ts: '2026-05-24T00:00:00.000Z',
  })).join('\n') + '\n');
  return file;
}

test('lane cache rotator dry-run reports compactable sessions without writing', () => {
  const dir = makeSessionDir();
  try {
    const file = writeSession(dir, 'deepseek-v4-pro__default.jsonl', [
      { role: 'system', content: '[LANE-MEMORY] previous summary '.repeat(20) },
      { role: 'user', content: 'large task '.repeat(80) },
      { role: 'assistant', content: 'large answer '.repeat(80) },
      { role: 'user', content: 'second large task '.repeat(80) },
      { role: 'assistant', content: 'second large answer '.repeat(80) },
      { role: 'user', content: 'recent' },
    ]);

    const result = collectLaneSessionHealth({ sessionDir: dir, budgetChars: 500 });

    assert.equal(result.ok, true);
    assert.equal(result.totals.files, 1);
    assert.equal(result.totals.compactable, 1);
    assert.equal(result.totals.applied, 0);
    assert.equal(existsSync(path.join(dir, 'archive')), false);
    assert.equal(readFileSync(file, 'utf8').includes('large task'), true);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('lane cache rotator apply compacts and archives original sessions', () => {
  const dir = makeSessionDir();
  try {
    const file = writeSession(dir, 'deepseek-v4-pro__default.jsonl', [
      { role: 'system', content: '[LANE-MEMORY] previous summary '.repeat(20) },
      { role: 'user', content: 'large task '.repeat(80) },
      { role: 'assistant', content: 'large answer '.repeat(80) },
      { role: 'user', content: 'second large task '.repeat(80) },
      { role: 'assistant', content: 'second large answer '.repeat(80) },
      { role: 'user', content: 'recent' },
    ]);

    const result = collectLaneSessionHealth({ sessionDir: dir, budgetChars: 500, apply: true });
    const compacted = readFileSync(file, 'utf8');
    const meta = JSON.parse(readFileSync(file.replace(/\.jsonl$/, '.meta.json'), 'utf8'));

    assert.equal(result.ok, true);
    assert.equal(result.totals.applied, 1);
    assert.equal(result.sessions[0].archive.includes('archive/'), true);
    assert.equal(existsSync(path.join(dir, 'archive')), true);
    assert.match(compacted, /prior LANE-MEMORY turns were not re-summarized/);
    assert.equal(meta.omittedLaneMemoryTurns, 1);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('lane cache rotator refuses protected and non-YURI session directories', () => {
  assert.throws(
    () => collectLaneSessionHealth({ sessionDir: path.join(REPO_ROOT, '.claude', 'lane-sessions') }),
    /only manages _SYSTEM\/state\/lane-sessions|protected/,
  );
  assert.throws(
    () => collectLaneSessionHealth({ sessionDir: path.join(REPO_ROOT, 'backend', 'data') }),
    /protected|only manages/,
  );
});

test('lane cache rotator fails closed on secret-like session content', () => {
  const dir = makeSessionDir();
  try {
    writeSession(dir, 'deepseek-v4-pro__default.jsonl', [
      { role: 'user', content: `do not store ${'nvapi-' + 'a'.repeat(48)}` },
      { role: 'assistant', content: 'blocked' },
    ]);

    const result = collectLaneSessionHealth({ sessionDir: dir, budgetChars: 20, apply: true });

    assert.equal(result.ok, false);
    assert.equal(result.totals.secretLike, 1);
    assert.equal(result.totals.applied, 0);
    assert.equal(existsSync(path.join(dir, 'archive')), false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
