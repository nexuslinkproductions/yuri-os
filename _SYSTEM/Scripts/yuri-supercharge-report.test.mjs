import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import {
  collectSuperchargeEvidence,
  renderSuperchargeReport,
  writeSuperchargeReport,
} from './yuri-supercharge-report.mjs';

test('supercharge report renders all waves and release gate evidence', () => {
  const evidence = collectSuperchargeEvidence({ now: new Date('2026-05-21T00:00:00.000Z') });
  const report = renderSuperchargeReport(evidence);

  assert.match(report, /YURI OS Supercharge Final Report/);
  assert.match(report, /Wave 0: Evidence Gate — PASS/);
  assert.match(report, /Wave 2: Guardrail Kernel — WARN/);
  assert.match(report, /Wave 7: Documentation And Release Gate/);
  assert.match(report, /node _SYSTEM\/Scripts\/yuri-supercharge-gate\.mjs/);
  assert.match(report, /latestReleaseGate:/);
  assert.match(report, /automation-health-latest\.json/);
  assert.match(report, /backend\/data\//);
});

test('supercharge report writes to caller-selected docs path', () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'yuri-supercharge-report-'));
  const reportPath = path.join(dir, 'report.md');
  try {
    const result = writeSuperchargeReport({
      reportPath,
      now: new Date('2026-05-21T00:00:00.000Z'),
    });

    assert.equal(result.ok, true);
    assert.match(readFileSync(reportPath, 'utf8'), /Final Report/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
