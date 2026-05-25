import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildReport, collectPaths, formatReport } from './yuri-closeout.mjs';

test('closeout rejects protected scoped paths', () => {
  assert.throws(
    () => collectPaths(['--path', '.claude/state/pulse-bus.json']),
    /forbidden path/,
  );
});

test('closeout report is deterministic, read-only, and user-readable', () => {
  const report = buildReport(['_SYSTEM/Scripts/yuri-closeout.mjs'], { recentEventLimit: 2 });
  const text = formatReport(report);

  assert.equal(report.schemaVersion, 'yuri.closeout.v1');
  assert.equal(report.mode, 'deterministic-readonly');
  assert.ok(report.nonClaims.includes('no mutation performed'));
  assert.ok(report.nonClaims.includes('no protected provider runtime read'));
  assert.match(text, /EOT Checkpoint/);
  assert.match(text, /node --check pass/);
  assert.match(text, /Next boot:/);
});
