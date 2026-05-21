import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { BASELINE_COMMITS, buildReleaseEvidence, writeReleaseEvidence } from './yuri-supercharge-gate.mjs';

test('release evidence includes baseline commits, preflight hash, and health summary', () => {
  const evidence = buildReleaseEvidence({
    gateStatus: 'OK',
    healthSummary: {
      ok: true,
      status: 'ok',
      quarantinedLanes: [],
      crashCounts: {},
    },
    loopback: { ok: true },
  });

  assert.equal(evidence.schemaVersion, '1.0');
  assert.deepEqual(evidence.baselineCommits, BASELINE_COMMITS);
  assert.match(evidence.preflightSha256, /^[a-f0-9]{64}$/);
  assert.equal(evidence.healthSummary.status, 'ok');
});

test('release evidence writer appends JSONL and writes latest snapshot', () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'yuri-release-gate-'));
  try {
    const evidence = buildReleaseEvidence({
      gateStatus: 'ENV_BLOCKED',
      healthSummary: {
        ok: true,
        status: 'ok',
        quarantinedLanes: [],
        crashCounts: {},
      },
      loopback: { ok: false, code: 'EPERM' },
    });
    const paths = writeReleaseEvidence(evidence, { dir });

    const line = readFileSync(paths.jsonlPath, 'utf8').trim();
    const latest = JSON.parse(readFileSync(paths.latestPath, 'utf8'));
    assert.equal(JSON.parse(line).gateStatus, 'ENV_BLOCKED');
    assert.equal(latest.loopback.code, 'EPERM');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
