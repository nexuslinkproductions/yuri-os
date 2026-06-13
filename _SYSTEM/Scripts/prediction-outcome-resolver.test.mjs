// prediction-outcome-resolver.test.mjs — guard-logic coverage (deterministic, no scan invoked).
// The scan-comparison path is integration-verified live (resolve --min-age 0 → resolved=1, calibration populated);
// this suite locks the skip/idempotency guards that decide WHETHER a scan even runs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, rmSync } from 'node:fs';
import { resolveOutcomes } from './prediction-outcome-resolver.mjs';

const TMP = '/tmp/por-test-ledger.jsonl';
const ledger = (rows) => writeFileSync(TMP, rows.map((r) => JSON.stringify(r)).join('\n') + '\n');

test('resolver guards: skip already-scored, too-young, and non-scan-source — never invokes a scan', () => {
  const now = 1_000_000_000;
  ledger([
    // 'a': old propagation-scan prediction, but already has an outcome → silently skipped (bare continue)
    { type: 'prediction', id: 'a', subject: 'x', source: 'propagation-scan', predictedEffects: [{ target: 't', effect: 'breaks' }], ts: now - 10_000_000 },
    { type: 'outcome', predictionId: 'a', observedEffects: [], ts: now },
    // 'b': propagation-scan but younger than minAge → skipped too-young (no scan)
    { type: 'prediction', id: 'b', subject: 'y', source: 'propagation-scan', predictedEffects: [{ target: 't', effect: 'breaks' }], ts: now - 1000 },
    // 'c': old enough but izanagi-bridge source → skipped non-scan-source (no scan)
    { type: 'prediction', id: 'c', subject: 'z', source: 'izanagi-bridge', predictedEffects: [{ target: 't', confidence: 0.7 }], ts: now - 10_000_000 },
  ]);
  const r = resolveOutcomes({ file: TMP, nowMs: now, minAgeMs: 60 * 60 * 1000 });
  assert.equal(r.resolved, 0, 'no resolutions without triggering a real scan');
  const reasons = r.skipped.join(',');
  assert.match(reasons, /b:too-young/, 'young prediction skipped');
  assert.match(reasons, /c:non-scan-source/, 'non-scan source skipped');
  assert.ok(!reasons.includes('a:'), 'already-scored prediction is silently skipped (idempotent), not listed');
  assert.ok(r.calibration && typeof r.calibration.meanBrier === 'number', 'returns a calibration report');
  rmSync(TMP, { force: true });
});

test('resolver: empty ledger → 0 resolved, empty calibration, no throw', () => {
  ledger([]);
  const r = resolveOutcomes({ file: TMP, nowMs: 1_000_000_000 });
  assert.equal(r.resolved, 0);
  assert.equal(r.calibration.n, 0);
  rmSync(TMP, { force: true });
});
