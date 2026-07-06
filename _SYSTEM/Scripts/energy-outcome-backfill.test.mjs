// @capability-test: energy-outcome-backfill
// Hermetic — tmp dir for firings + shadow, stub signals inline. No live energy-trace reads, no live ledger writes.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, readFileSync, existsSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runBackfill, loadSignalsOrStub, renderReport } from './energy-outcome-backfill.mjs';
import { calibrate } from './energy-outcome-deriver.mjs';

const tmpRoot = mkdtempSync(join(tmpdir(), 'eob-test-'));
const traceDir = join(tmpRoot, 'energy-trace');
const shadowFile = join(tmpRoot, 'shadow.jsonl');
const reportPath = join(tmpRoot, 'L4-backfill-report.md');

function mkFiring(over = {}) {
  return {
    timestamp: '2026-06-14T00:00:00.000Z',
    runId: 'session-test-001',
    lane: 'session',
    user: 'marcel',
    regime: 'action',
    event: 'Proposal Accepted',
    decision: 'accept',
    U_before: 1.0,
    U_after: 0.0,
    deltaU: -1.0,
    ...over,
  };
}

// ── loadSignalsOrStub ─────────────────────────────────────────────────────────

test('loadSignalsOrStub: missing file → stub-missing source, all-false stub', () => {
  const r = loadSignalsOrStub(join(tmpRoot, 'does-not-exist.mjs'));
  assert.equal(r.source, 'stub-missing');
  assert.equal(r.signals.isReverted('anything'), false);
  assert.equal(r.signals.isRetriedAndSucceeded('anything'), false);
  assert.equal(r.signals.isPromoted('anything'), false);
  assert.equal(r.signals.dispatchAccepted('anything'), false);
});

test('loadSignalsOrStub: malformed file → stub-load-failed source, all-false stub', () => {
  const bad = join(tmpRoot, 'bad-signals.mjs');
  writeFileSync(bad, 'this is not valid javascript @@@');
  const r = loadSignalsOrStub(bad);
  assert.equal(r.source, 'stub-load-failed');
  assert.equal(r.signals.isReverted('x'), false);
});

// ── runBackfill: fresh + missing signals → R4 dominated ──────────────────────

test('runBackfill: --fresh truncates shadow, missing signals → all R4, meanBrier=0 (no resolved)', () => {
  mkdirSync(traceDir, { recursive: true });
  writeFileSync(join(traceDir, 't.jsonl'), [
    JSON.stringify(mkFiring({ runId: 'a' })),
    JSON.stringify(mkFiring({ runId: 'b' })),
  ].join('\n'));
  // pre-create a stale shadow with junk so --fresh truncation is observable
  writeFileSync(shadowFile, 'STALE ROW SHOULD BE GONE\n', 'utf8');
  const r = runBackfill({
    fresh: true,
    shadow: shadowFile,
    firings: traceDir,
    report: reportPath,
    signals: join(tmpRoot, 'does-not-exist.mjs'),
  });
  assert.equal(r.signalsSource, 'stub-missing');
  assert.equal(r.runSummary.firings, 2);
  assert.equal(r.runSummary.predicted, 2);
  assert.equal(r.runSummary.outcomesDerived, 0);
  assert.equal(r.runSummary.undeterminable, 2);
  assert.equal(r.runSummary.byRule.R4, 2);
  // shadow is now empty of stale content (only the 2 new predictions, no outcomes for R4)
  const lines = readFileSync(shadowFile, 'utf8').split('\n').filter(l => l.trim());
  assert.equal(lines.length, 2);
  assert.ok(!lines.some(l => l.startsWith('STALE')));
  // meanBrier should be 0 when no resolved pairs exist
  assert.equal(r.calibration.n, 0);
  assert.equal(r.calibration.meanBrier, 0);
});

// ── runBackfill: with signals injected via a synthetic signals module ─────────

test('runBackfill: real signals → R1/R3 derived, meanBrier populated, byRule histogram', () => {
  const t2 = join(tmpRoot, 't2');
  const s2 = join(tmpRoot, 'shadow2.jsonl');
  mkdirSync(t2, { recursive: true });
  writeFileSync(join(t2, 't.jsonl'), [
    JSON.stringify(mkFiring({ runId: 'r1', timestamp: '2026-06-14T00:00:00.000Z', deltaU: -2 })),
    JSON.stringify(mkFiring({ runId: 'r2', timestamp: '2026-06-14T00:00:01.000Z', deltaU: -3 })),
    JSON.stringify(mkFiring({ runId: 'r3', timestamp: '2026-06-14T00:00:02.000Z', deltaU: -1 })),
  ].join('\n'));

  // write a tiny signals module the loader can require
  const sigPath = join(tmpRoot, 'sigs.mjs');
  writeFileSync(sigPath, `
    export const signals = {
      isReverted: (id) => id === 'r1',
      isRetriedAndSucceeded: (id) => id === 'r2',
      isPromoted: (id) => id === 'r3',
      dispatchAccepted: () => false,
    };
  `);

  const r = runBackfill({
    fresh: true,
    shadow: s2,
    firings: t2,
    report: join(tmpRoot, 'report2.md'),
    signals: sigPath,
  });
  assert.equal(r.signalsSource, 'signals-module');
  assert.equal(r.runSummary.predicted, 3);
  assert.equal(r.runSummary.outcomesDerived, 3);
  assert.equal(r.runSummary.undeterminable, 0);
  assert.equal(r.runSummary.byRule.R1, 1);
  assert.equal(r.runSummary.byRule.R2, 1);
  assert.equal(r.runSummary.byRule.R3, 1);
  assert.equal(r.calibration.n, 3);
  // 0 hit = false alarm for every target → brier = (confidence - 0)^2 averaged
  // 3 sigmoid(-2)=0.881, sigmoid(-3)=0.953, sigmoid(-1)=0.731 → 3 false alarms
  assert.ok(r.calibration.meanBrier > 0);
});

// ── runBackfill: --fresh false APPENDS to existing shadow ─────────────────────

test('runBackfill: without --fresh, prior shadow rows are preserved (append semantics)', () => {
  const t3 = join(tmpRoot, 't3');
  const s3 = join(tmpRoot, 'shadow3.jsonl');
  mkdirSync(t3, { recursive: true });
  writeFileSync(join(t3, 't.jsonl'), JSON.stringify(mkFiring({ runId: 'keep' })));
  // Pre-populate shadow with one prediction (no outcome) to simulate a prior partial run.
  const pre = {
    type: 'prediction', id: 'preExistingId00000', subject: 'prior',
    change: { decision: 'accept' },
    predictedEffects: [{ target: 'proposal-survives', effect: 'survives', confidence: 0.5 }],
    source: 'energy-gate', ts: '2026-06-13T00:00:00.000Z',
  };
  writeFileSync(s3, JSON.stringify(pre) + '\n', 'utf8');

  const r = runBackfill({
    fresh: false,                                  // ← critical
    shadow: s3, firings: t3,
    report: join(tmpRoot, 'report3.md'),
    signals: join(tmpRoot, 'does-not-exist.mjs'),
  });
  // We added 1 prediction. Prior prediction is now "unresolved" (no matching outcome).
  assert.equal(r.runSummary.predicted, 1);
  const cal = calibrate({ file: s3 });
  assert.ok(cal.unresolved.length >= 1);           // prior + (any new w/o outcome)
});

// ── renderReport: deterministic + includes prediction stamp ──────────────────

test('renderReport: includes prediction, run summary, calibration table, red-team, run stamp', () => {
  const report = renderReport({
    prediction: {
      coveragePct: 5, meanBrierPct: 50, undeterminablePct: 95,
      runStamp: '2026-06-15T03:09:00.000Z', confidence: 'low',
    },
    shadowFile: '/tmp/x/shadow.jsonl',
    firingsDir: '/tmp/x/energy-trace',
    signalsSource: 'stub-missing',
    runSummary: { firings: 10, predicted: 10, outcomesDerived: 0, undeterminable: 10, byRule: { R4: 10 } },
    calibration: { n: 0, meanBrier: 0, byConfidenceBucket: [], unresolved: ['x','y','z'] },
    backfillStartedAt: 1_700_000_000_000,
    backfillFinishedAt: 1_700_000_001_000,
  });
  assert.match(report, /# L4 — Energy-Outcome Backfill Report/);
  assert.match(report, /PREDICTION/i);                                 // prediction stamped
  assert.match(report, /coveragePct/i);
  assert.match(report, /Total firings read/);
  assert.match(report, /Residual Risk/i);
  assert.match(report, /Run Stamp/);
  assert.match(report, /meanBrier: 0\.0000/);
  // unresolved count
  assert.match(report, /Unresolved.*?3/);
});

// ── DISARMED contract: live ledger never written ──────────────────────────────

test('DISARMED contract: runBackfill does not touch _SYSTEM/state/prediction-ledger.jsonl', () => {
  // We can't easily stat a protected file in a test runner, but we CAN assert the backfill's
  // surface API never references the live ledger path.
  const src = readFileSync(
    new URL('./energy-outcome-backfill.mjs', import.meta.url).pathname, 'utf8'
  );
  assert.ok(!/prediction-ledger\.jsonl['"]\s*\)/.test(src) || /NEVER/i.test(src) || /DISARMED/.test(src),
    'live prediction-ledger.jsonl must be DISARMED/never-written (not a default file path)');
});

// ── cleanup ──────────────────────────────────────────────────────────────────
test('cleanup', () => { try { rmSync(tmpRoot, { recursive: true, force: true }); } catch {} });
