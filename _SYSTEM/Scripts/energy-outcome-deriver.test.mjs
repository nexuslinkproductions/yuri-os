// @capability-test: energy-outcome-deriver
// Synthetic fixtures only — no live energy-trace reads, no live ledger writes.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  readFirings,
  firingToPrediction,
  deriveOutcome,
  runDeriver,
  calibrate,
} from './energy-outcome-deriver.mjs';

const tmpDir = mkdtempSync(join(tmpdir(), 'eod-test-'));
const shadowFile = join(tmpDir, 'shadow.jsonl');
const traceDir = join(tmpDir, 'trace');

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

// ── firingToPrediction ────────────────────────────────────────────────────────

test('accept → survives with sigmoid(|deltaU|) confidence in [0.05, 0.99]', () => {
  const p = firingToPrediction(mkFiring({ deltaU: -1.0 }));
  assert.equal(p.predictedEffects[0].effect, 'survives');
  assert.ok(p.predictedEffects[0].confidence >= 0.05);
  assert.ok(p.predictedEffects[0].confidence <= 0.99);
  assert.equal(p.source, 'energy-gate');
  // |deltaU|=1 → sigmoid(1) ≈ 0.731
  assert.ok(Math.abs(p.predictedEffects[0].confidence - 0.731) < 0.01);
});

test('reject → rejected-correctly', () => {
  const p = firingToPrediction(mkFiring({ decision: 'reject', deltaU: 3.0 }));
  assert.equal(p.predictedEffects[0].effect, 'rejected-correctly');
});

test('deltaU=0 → confidence ≈ 0.5 (uncertain)', () => {
  const p = firingToPrediction(mkFiring({ deltaU: 0 }));
  assert.ok(Math.abs(p.predictedEffects[0].confidence - 0.5) < 0.01);
});

// ── deriveOutcome precedence ─────────────────────────────────────────────────

test('R1 reverted beats R3 promoted (precedence conflict)', () => {
  const f = mkFiring();
  const signals = {
    isReverted: () => true,
    isRetriedAndSucceeded: () => false,
    isPromoted: () => true,  // matches BOTH R1 and R3
  };
  const o = deriveOutcome(f, signals);
  assert.equal(o.rule, 'R1');
  assert.equal(o.observedEffects[0].effect, 'reverted');
  assert.equal(o.status, 'derived');
});

test('R2 retried-and-succeeded beats R3 promoted', () => {
  const f = mkFiring();
  const signals = {
    isReverted: () => false,
    isRetriedAndSucceeded: () => true,
    isPromoted: () => true,
  };
  const o = deriveOutcome(f, signals);
  assert.equal(o.rule, 'R2');
  assert.equal(o.observedEffects[0].effect, 'retried-and-succeeded');
});

test('R3 promoted alone → survived', () => {
  const f = mkFiring();
  const signals = {
    isReverted: () => false,
    isRetriedAndSucceeded: () => false,
    isPromoted: () => true,
  };
  const o = deriveOutcome(f, signals);
  assert.equal(o.rule, 'R3');
  assert.equal(o.observedEffects[0].effect, 'survived');
});

test('no signal → R4 undeterminable, no observedEffects', () => {
  const f = mkFiring();
  const o = deriveOutcome(f, {});
  assert.equal(o.rule, 'R4');
  assert.equal(o.status, 'undeterminable');
  assert.deepEqual(o.observedEffects, []);
});

// ── readFirings ──────────────────────────────────────────────────────────────

test('readFirings: parses jsonl, skips corrupt lines', () => {
  mkdirSync(traceDir, { recursive: true });
  writeFileSync(join(traceDir, 'test.jsonl'), [
    JSON.stringify(mkFiring({ runId: 'r1' })),
    'CORRUPT LINE {{{',
    JSON.stringify(mkFiring({ runId: 'r2' })),
    '',
  ].join('\n'));
  const firings = readFirings({ traceDir: traceDir });
  assert.equal(firings.length, 2);
  assert.equal(firings[0].runId, 'r1');
  assert.equal(firings[1].runId, 'r2');
});

// ── runDeriver end-to-end ────────────────────────────────────────────────────

test('runDeriver: writes predictions + derived outcomes to shadow, undeterminable skips outcome row', () => {
  const firings = [
    mkFiring({ runId: 's-A', timestamp: '2026-06-14T00:00:00.000Z', deltaU: -2 }),
    mkFiring({ runId: 's-B', timestamp: '2026-06-14T00:00:01.000Z', deltaU: -1 }),
  ];
  const signals = {
    isReverted: (id) => id === 's-A',  // s-A → R1 reverted
    isRetriedAndSucceeded: () => false,
    isPromoted: (id) => id === 's-B',  // s-B → R3 survived
  };
  const result = runDeriver({ firings, file: shadowFile, signals });
  assert.equal(result.predicted, 2);
  assert.equal(result.outcomesDerived, 2);
  assert.equal(result.undeterminable, 0);
  assert.equal(result.byRule.R1, 1);
  assert.equal(result.byRule.R3, 1);

  const cal = calibrate({ file: shadowFile });
  assert.equal(cal.n, 2); // both resolved
});

test('runDeriver: undeterminable fires produce no outcome row', () => {
  const f = join(tmpDir, 'shadow2.jsonl');
  const firings = [mkFiring({ runId: 's-X', timestamp: '2026-06-14T00:00:02.000Z' })];
  const result = runDeriver({ firings, file: f, signals: {} });
  assert.equal(result.predicted, 1);
  assert.equal(result.outcomesDerived, 0);
  assert.equal(result.undeterminable, 1);
  assert.equal(result.byRule.R4, 1);

  const cal = calibrate({ file: f });
  assert.equal(cal.n, 0); // no resolved pairs
  assert.equal(cal.unresolved.length, 1); // prediction with no outcome
});

// ── cleanup ───────────────────────────────────────────────────────────────────
test('cleanup', () => { try { rmSync(tmpDir, { recursive: true, force: true }); } catch {} });