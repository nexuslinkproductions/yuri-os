import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { recordCrash } from './kagami-overseer.mjs';

const REPO_ROOT = fileURLToPath(new URL('../..', import.meta.url));

test('health-status outputs Kagami health JSON and exits nonzero when a lane is quarantined', () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'yuri-health-status-'));
  const logPath = path.join(dir, 'kagami-ledger.jsonl');
  const base = Date.parse('2026-05-20T12:00:00.000Z');
  try {
    for (let i = 0; i < 3; i += 1) {
      recordCrash('nvidia-glm', { logPath, timestamp: base + i * 1000, reason: 'provider-503' });
    }

    const result = spawnSync(process.execPath, ['_SYSTEM/Scripts/health-status.mjs'], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      env: {
        ...process.env,
        YURI_KAGAMI_LEDGER_PATH: logPath,
      },
    });

    assert.equal(result.status, 1);
    const summary = JSON.parse(result.stdout);
    assert.equal(summary.status, 'degraded');
    assert.deepEqual(summary.quarantinedLanes, ['nvidia-glm']);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
