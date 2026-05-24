import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { BASELINE_COMMITS, buildChecks, buildReleaseEvidence, writeReleaseEvidence } from './yuri-supercharge-gate.mjs';

test('release gate includes cyber intelligence and security lens checks', () => {
  const checkNames = buildChecks({ includeBrowser: false }).map(([name]) => name);

  assert.ok(checkNames.includes('syntax:threat-intel-kernel'));
  assert.ok(checkNames.includes('test:threat-intel-kernel'));
  assert.ok(checkNames.includes('syntax:security-lens'));
  assert.ok(checkNames.includes('test:security-lens'));
  assert.ok(checkNames.includes('syntax:cyber-lab-harness'));
  assert.ok(checkNames.includes('test:cyber-lab-harness'));
  assert.ok(checkNames.includes('syntax:cyber-lab-runner'));
  assert.ok(checkNames.includes('test:cyber-lab-runner'));
  assert.ok(checkNames.includes('syntax:cyber-guardrail-proof'));
  assert.ok(checkNames.includes('test:cyber-guardrail-proof'));
  assert.ok(checkNames.includes('syntax:cyber-pilot-pack'));
  assert.ok(checkNames.includes('test:cyber-pilot-pack'));
  assert.ok(checkNames.includes('syntax:secret-leak-scan'));
  assert.ok(checkNames.includes('test:secret-leak-scan'));
  assert.ok(checkNames.includes('syntax:lane-cache-rotator'));
  assert.ok(checkNames.includes('test:lane-cache-rotator'));
  assert.ok(checkNames.includes('syntax:artifact-registry'));
  assert.ok(checkNames.includes('test:artifact-registry'));
  assert.ok(checkNames.includes('test:lane-session'));
  assert.ok(checkNames.includes('security:secret-leak-live'));
});

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
  assert.ok(evidence.baselineCommits.includes('559138b6'));
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

test('release evidence writer uses durable fsync writes', () => {
  const source = readFileSync(new URL('./yuri-supercharge-gate.mjs', import.meta.url), 'utf8');

  assert.match(source, /fsyncSync/);
  assert.match(source, /durableWrite/);
});
