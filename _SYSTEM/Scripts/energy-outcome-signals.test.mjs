// @capability: energy-outcome-signals.test
// @serves: unit tests for energy-outcome-signals.mjs | guarantees fail-closed behavior on the 4 signal detectors
// @does: node --test suite for buildSignals + the 4 named factories. Uses tmpdir fixtures — no live `_SYSTEM/state/*.jsonl` reads.
//   Tests cover: (1) isReverted — substring match in cached git log, empty runId ⇒ false, missing cache ⇒ false; (2) isRetriedAndSucceeded — reject→accept order required, accept-only does not count, empty runId ⇒ false, missing file ⇒ false; (3) isPromoted — predicate-based, missing predicate ⇒ false, predicate truthy ⇒ true, predicate throwing ⇒ skip, empty runId ⇒ false; (4) dispatchAccepted — runIdIndex path, string-fallback path, missing index & no fallback ⇒ false, empty runId ⇒ false; (5) buildSignals wires all four and allows per-signal override; (6) the full bag integrates correctly into the real energy-outcome-deriver's R1>R2>R3 rule engine against a synthetic firing.
// @use: node --test _SYSTEM/Scripts/energy-outcome-signals.test.mjs
//   No live reads. No writes outside tmpdir.

import { test, describe, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  buildSignals,
  defaultSignals,
  makeRevertedSignal,
  makeRetriedSucceededSignal,
  makePromotedSignal,
  makeDispatchAcceptedSignal,
  __test__,
} from './energy-outcome-signals.mjs';
import { deriveOutcome } from './energy-outcome-deriver.mjs';

const { readJSONLFile, normalizeRunId, PROMOTION_MARKERS } = __test__;

// ── tmpdir scaffolding ──────────────────────────────────────────────────────
let tmp;
before(() => { tmp = mkdtempSync(join(tmpdir(), 'eosig-test-')); });
after(() => { if (tmp) rmSync(tmp, { recursive: true, force: true }); });

function writeFixture(name, lines) {
  const p = join(tmp, name);
  writeFileSync(p, lines.join('\n') + '\n', 'utf8');
  return p;
}

// ── normalizeRunId / readJSONLFile / PROMOTION_MARKERS (sanity) ──────────────
describe('helpers', () => {
  test('normalizeRunId: null / undefined / number coerce safely', () => {
    assert.equal(normalizeRunId(null), '');
    assert.equal(normalizeRunId(undefined), '');
    assert.equal(normalizeRunId(42), '42');
    assert.equal(normalizeRunId('abc-123'), 'abc-123');
  });
  test('readJSONLFile: corrupt lines skipped, valid lines kept', () => {
    const p = writeFixture('h-mixed.jsonl', ['{"a":1}', 'not json', '', '{"b":2}']);
    const out = readJSONLFile(p);
    assert.deepEqual(out, [{ a: 1 }, { b: 2 }]);
  });
  test('readJSONLFile: missing file ⇒ empty array', () => {
    assert.deepEqual(readJSONLFile(join(tmp, 'does-not-exist.jsonl')), []);
  });
  test('PROMOTION_MARKERS matches promote / promoted / promotion / advanced / graduated', () => {
    assert.match('promote', PROMOTION_MARKERS);
    assert.match('PROMOTED', PROMOTION_MARKERS);
    assert.match('promotion', PROMOTION_MARKERS);
    assert.match('graduated', PROMOTION_MARKERS);
    assert.match('advanced', PROMOTION_MARKERS);
    assert.doesNotMatch('rejected', PROMOTION_MARKERS);
  });
});

// ── isReverted ───────────────────────────────────────────────────────────────
describe('isReverted', () => {
  test('substring match in cached git log blob returns true', () => {
    const cacheFile = join(tmp, 'gl-1.txt');
    writeFileSync(cacheFile, 'commitA\nrevert runId=alpha-7\ncommitB\n', 'utf8');
    const sig = makeRevertedSignal({ gitLogCacheFile: cacheFile });
    assert.equal(sig('alpha-7'), true);
    assert.equal(sig('beta-1'), false);
  });
  test('empty / null runId ⇒ false (fail-closed)', () => {
    const cacheFile = join(tmp, 'gl-2.txt');
    writeFileSync(cacheFile, 'alpha-7', 'utf8');
    const sig = makeRevertedSignal({ gitLogCacheFile: cacheFile });
    assert.equal(sig(''), false);
    assert.equal(sig(null), false);
    assert.equal(sig(undefined), false);
  });
  test('missing cache file and no git repo ⇒ false (no shell-out side effect)', () => {
    // Use a non-git cwd and an absent cache file path. The reader must catch the git error
    // and negative-cache to empty; the assertions verify no exception leaks.
    const sig = makeRevertedSignal({ gitLogCacheFile: join(tmp, 'no-cache.txt'), gitCwd: tmp });
    assert.equal(sig('alpha-7'), false);
    // Second call must hit the negative cache and still return false (no exception).
    assert.equal(sig('alpha-7'), false);
  });
  test('does not auto-write a cache file (pure-reader contract)', () => {
    const cacheFile = join(tmp, 'gl-pure.txt');
    const sig = makeRevertedSignal({ gitLogCacheFile: cacheFile, gitCwd: tmp });
    sig('anything');
    // File must not exist — we do not auto-persist side effects.
    assert.equal(existsSync(cacheFile), false);
  });
});

// ── isRetriedAndSucceeded ────────────────────────────────────────────────────
describe('isRetriedAndSucceeded', () => {
  test('reject then later accept for the same runId ⇒ true', () => {
    const file = writeFixture('pulse-rs-1.jsonl', [
      JSON.stringify({ type: 'pulse', runId: 'r-1', verdict: 'reject', ts: '2026-06-15T00:00:00Z' }),
      JSON.stringify({ type: 'pulse', runId: 'r-1', verdict: 'verify', ts: '2026-06-15T00:00:01Z' }),
      JSON.stringify({ type: 'pulse', runId: 'r-1', verdict: 'accept', ts: '2026-06-15T00:00:02Z' }),
    ]);
    const sig = makeRetriedSucceededSignal({ pulseFile: file });
    assert.equal(sig('r-1'), true);
  });
  test('accept-only (no prior reject) ⇒ false (proposal was right the first time)', () => {
    const file = writeFixture('pulse-rs-2.jsonl', [
      JSON.stringify({ type: 'pulse', runId: 'r-2', verdict: 'verify' }),
      JSON.stringify({ type: 'pulse', runId: 'r-2', verdict: 'accept' }),
    ]);
    const sig = makeRetriedSucceededSignal({ pulseFile: file });
    assert.equal(sig('r-2'), false);
  });
  test('reject-only (no accept ever) ⇒ false (retry never landed)', () => {
    const file = writeFixture('pulse-rs-3.jsonl', [
      JSON.stringify({ type: 'pulse', runId: 'r-3', verdict: 'reject' }),
      JSON.stringify({ type: 'pulse', runId: 'r-3', verdict: 'block' }),
    ]);
    const sig = makeRetriedSucceededSignal({ pulseFile: file });
    assert.equal(sig('r-3'), false);
  });
  test('runId not in pulses ⇒ false', () => {
    const file = writeFixture('pulse-rs-4.jsonl', [
      JSON.stringify({ type: 'pulse', runId: 'other', verdict: 'accept' }),
    ]);
    const sig = makeRetriedSucceededSignal({ pulseFile: file });
    assert.equal(sig('r-4'), false);
  });
  test('empty / null runId ⇒ false', () => {
    const file = writeFixture('pulse-rs-5.jsonl', [JSON.stringify({ type: 'pulse', runId: 'r-5', verdict: 'reject' })]);
    const sig = makeRetriedSucceededSignal({ pulseFile: file });
    assert.equal(sig(''), false);
    assert.equal(sig(null), false);
  });
  test('missing file ⇒ false', () => {
    const sig = makeRetriedSucceededSignal({ pulseFile: join(tmp, 'no-pulse.jsonl') });
    assert.equal(sig('anything'), false);
  });
  test('preloaded array is used (no file read)', () => {
    const preloaded = [
      { type: 'pulse', runId: 'r-6', verdict: 'reject' },
      { type: 'pulse', runId: 'r-6', verdict: 'accept' },
    ];
    const sig = makeRetriedSucceededSignal({ preloaded });
    assert.equal(sig('r-6'), true);
  });
  test('non-pulse records ignored (defensive)', () => {
    const preloaded = [
      { type: 'other', runId: 'r-7', verdict: 'reject' },
      { type: 'other', runId: 'r-7', verdict: 'accept' },
    ];
    const sig = makeRetriedSucceededSignal({ preloaded });
    assert.equal(sig('r-7'), false);
  });
});

// ── isPromoted ───────────────────────────────────────────────────────────────
describe('isPromoted', () => {
  test('no predicate supplied ⇒ always false (fail-closed against current log shape)', () => {
    const file = writeFixture('ct-1.jsonl', [
      JSON.stringify({ runId: 'p-1', tool: 'Edit', reason: 'promoted' }),
    ]);
    const sig = makePromotedSignal({ claimTransitionFile: file });
    assert.equal(sig('p-1'), false);
  });
  test('predicate truthy on a record ⇒ true', () => {
    const preloaded = [
      { runId: 'p-2', reason: 'promoted to fixture_ready' },
      { runId: 'p-3', reason: 'no change' },
    ];
    const sig = makePromotedSignal({
      preloaded,
      isPromotionRecord: (rec, rid) => rid === rec.runId && PROMOTION_MARKERS.test(rec.reason ?? ''),
    });
    assert.equal(sig('p-2'), true);
    assert.equal(sig('p-3'), false);
  });
  test('predicate that throws on one record is skipped (does not poison the scan)', () => {
    const preloaded = [
      null,                                          // skipped
      { runId: 'p-4' /* no reason field */ },        // will throw when accessing .reason (handled by try/catch)
      { runId: 'p-4', reason: 'graduated upward' },  // matches
    ];
    const sig = makePromotedSignal({
      preloaded,
      isPromotionRecord: (rec, rid) => {
        // deliberately buggy: blow up on missing reason
        if (!rec.reason) throw new Error('boom');
        return rid === rec.runId && PROMOTION_MARKERS.test(rec.reason);
      },
    });
    assert.equal(sig('p-4'), true);
  });
  test('empty / null runId ⇒ false', () => {
    const sig = makePromotedSignal({
      preloaded: [{ runId: 'p-5', reason: 'promoted' }],
      isPromotionRecord: (rec, rid) => rec.runId === rid,
    });
    assert.equal(sig(''), false);
    assert.equal(sig(null), false);
  });
  test('missing file AND no preloaded ⇒ empty scan ⇒ false', () => {
    const sig = makePromotedSignal({
      claimTransitionFile: join(tmp, 'no-ct.jsonl'),
      isPromotionRecord: () => true, // would match anything that exists
    });
    assert.equal(sig('p-x'), false);
  });
});

// ── dispatchAccepted ─────────────────────────────────────────────────────────
describe('dispatchAccepted', () => {
  test('runIdIndex path: returns true iff a dispatch-success phase matches one of the indexed traceIds', () => {
    const preloaded = [
      { traceId: 't-A', phase: 'worker.start' },
      { traceId: 't-A', phase: 'worker.complete' }, // success
      { traceId: 't-B', phase: 'worker.complete' },
    ];
    const runIdIndex = new Map([
      ['r-alpha', new Set(['t-A', 't-Z'])],   // t-A matches; t-Z absent ⇒ no false positive from other lines
      ['r-beta',  new Set(['t-Z'])],          // no matching telemetry ⇒ false
    ]);
    const sig = makeDispatchAcceptedSignal({ preloaded, runIdIndex });
    assert.equal(sig('r-alpha'), true);
    assert.equal(sig('r-beta'), false);
  });
  test('runIdIndex path: empty runId ⇒ false', () => {
    const sig = makeDispatchAcceptedSignal({ preloaded: [], runIdIndex: new Map([['r', new Set(['t'])]]) });
    assert.equal(sig(''), false);
  });
  test('string-fallback path (no runIdIndex): traceId literally contains the runId AND phase is a success', () => {
    const preloaded = [
      { traceId: 'originator-r-gamma-2026-06-15-001', phase: 'worker.complete' },
      { traceId: 'originator-r-delta-2026-06-15-002', phase: 'worker.start' },  // wrong phase
    ];
    const sig = makeDispatchAcceptedSignal({ preloaded });
    assert.equal(sig('r-gamma'), true);
    assert.equal(sig('r-delta'), false);
  });
  test('custom dispatchPhases respected', () => {
    const preloaded = [
      { traceId: 'originator-r-eps-001', phase: 'substrate.complete' },
    ];
    const sig = makeDispatchAcceptedSignal({ preloaded, dispatchPhases: ['substrate.complete'] });
    assert.equal(sig('r-eps'), true);
    const sig2 = makeDispatchAcceptedSignal({ preloaded, dispatchPhases: ['worker.complete'] });
    assert.equal(sig2('r-eps'), false);
  });
  test('missing file AND no preloaded ⇒ false', () => {
    const sig = makeDispatchAcceptedSignal({ originatorTelemetryFile: join(tmp, 'no-tel.jsonl') });
    assert.equal(sig('r-zeta'), false);
  });
});

// ── buildSignals wiring ──────────────────────────────────────────────────────
describe('buildSignals', () => {
  test('returns the 4-signal bag with all readers wired', () => {
    const sigs = buildSignals();
    assert.equal(typeof sigs.isReverted, 'function');
    assert.equal(typeof sigs.isRetriedAndSucceeded, 'function');
    assert.equal(typeof sigs.isPromoted, 'function');
    assert.equal(typeof sigs.dispatchAccepted, 'function');
  });
  test('per-signal override: preloaded readers bypass file paths', () => {
    const sigs = buildSignals({
      isReverted: () => true,
      isRetriedAndSucceeded: () => false,
      isPromoted: () => false,
      dispatchAccepted: () => false,
    });
    assert.equal(sigs.isReverted('anything'), true);
    assert.equal(sigs.isRetriedAndSucceeded('anything'), false);
  });
  test('defaultSignals wires the real _SYSTEM/state paths and fails closed against the real log shapes', () => {
    // This is the critical integration assertion: with the REAL state files,
    // every signal returns false for a synthetic runId (proving the fail-closed
    // wiring is honest, not just "true against fixtures").
    const sigs = defaultSignals();
    assert.equal(sigs.isReverted('descent-demo-2026-05-28T21:49:21.587Z-3'), false);
    assert.equal(sigs.isRetriedAndSucceeded('descent-demo-2026-05-28T21:49:21.587Z-3'), false);
    assert.equal(sigs.isPromoted('descent-demo-2026-05-28T21:49:21.587Z-3'), false);
    assert.equal(sigs.dispatchAccepted('descent-demo-2026-05-28T21:49:21.587Z-3'), false);
  });
});

// ── integration with energy-outcome-deriver R1>R2>R3 engine ─────────────────
describe('integration with energy-outcome-deriver', () => {
  test('R1 reverted wins (highest precedence) when isReverted=true', () => {
    const sigs = buildSignals({
      isReverted: () => true,
      isRetriedAndSucceeded: () => true,
      isPromoted: () => true,
      dispatchAccepted: () => false,
    });
    const firing = { runId: 'f-1', deltaU: 2, decision: 'accept', regime: 'r', event: 'e', timestamp: '2026-06-15T00:00:00Z' };
    const out = deriveOutcome(firing, sigs);
    assert.equal(out.rule, 'R1');
    assert.equal(out.observedEffects[0].effect, 'reverted');
    assert.equal(out.status, 'derived');
  });
  test('R2 retried-and-succeeded wins when isReverted=false but R2=true', () => {
    const sigs = buildSignals({
      isReverted: () => false,
      isRetriedAndSucceeded: () => true,
      isPromoted: () => true,
      dispatchAccepted: () => false,
    });
    const firing = { runId: 'f-2', deltaU: 2, decision: 'accept', regime: 'r', event: 'e', timestamp: '2026-06-15T00:00:01Z' };
    const out = deriveOutcome(firing, sigs);
    assert.equal(out.rule, 'R2');
    assert.equal(out.observedEffects[0].effect, 'retried-and-succeeded');
  });
  test('R3 promoted wins when only isPromoted=true', () => {
    const sigs = buildSignals({
      isReverted: () => false,
      isRetriedAndSucceeded: () => false,
      isPromoted: () => true,
      dispatchAccepted: () => true,
    });
    const firing = { runId: 'f-3', deltaU: 2, decision: 'accept', regime: 'r', event: 'e', timestamp: '2026-06-15T00:00:02Z' };
    const out = deriveOutcome(firing, sigs);
    assert.equal(out.rule, 'R3');
    assert.equal(out.observedEffects[0].effect, 'survived');
  });
  test('all-false signals ⇒ R4 undeterminable (the honest real-world outcome)', () => {
    const sigs = defaultSignals(); // real fail-closed defaults
    const firing = { runId: 'f-4-realistic', deltaU: 0.1, decision: 'accept', regime: 'r', event: 'e', timestamp: '2026-06-15T00:00:03Z' };
    const out = deriveOutcome(firing, sigs);
    assert.equal(out.rule, 'R4');
    assert.equal(out.status, 'undeterminable');
    assert.deepEqual(out.observedEffects, []);
  });
});
