// Tests for claim-transition-observer.mjs — the OBSERVE-mode runtime caller for the
// identity veto. Proves it FIRES on real attack pairs (non-vacuous), stays quiet on
// clean pairs, fails OPEN on a bad input, and the emitter writes a JSONL trace.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { observeClaimTransition, emitObservation, observeTracePath, shouldObserve } from './claim-transition-observer.mjs';

const NOW = 1_700_000_000_000;

test('clean transition => no identity veto (quiet)', () => {
  const c = [{ id: 'a', claimedStatus: 'trusted', evidence: [], contentHash: 'x' }];
  const o = observeClaimTransition(c, c, { nowMs: NOW });
  assert.equal(o.ok, true);
  assert.equal(o.identityVeto, false);
});

test('content-swap (same id, changed hash) => identity veto FIRES', () => {
  const before = [{ id: 'k', claimedStatus: 'trusted', evidence: [], contentHash: 'aaa' }];
  const after = [{ id: 'k', claimedStatus: 'trusted', evidence: [], contentHash: 'bbb' }];
  const o = observeClaimTransition(before, after, { nowMs: NOW });
  assert.equal(o.identityVeto, true);
  assert.equal(o.worsenedCount, 1);
  assert.equal(o.worsened[0].contentSwapped, true);
});

test('untracked RETRACT (no id) => identity veto FIRES (fail-closed enforcing stance preserved)', () => {
  const o = observeClaimTransition([], [{ claimedStatus: 'trusted', evidence: [] }], { nowMs: NOW });
  assert.equal(o.identityVeto, true);
  assert.ok(o.untrackedRetract >= 1);
});

test('OBSERVE fails OPEN: a bad input never throws, returns identityVeto=false', () => {
  // null/garbage must not propagate — observability cannot break the session.
  let o;
  assert.doesNotThrow(() => { o = observeClaimTransition(null, undefined, { nowMs: NOW }); });
  assert.equal(o.identityVeto, false);
});

// ---- A3 (2026-06-14): widened pre-filter shouldObserve — the guard the live hook uses. ----

test('shouldObserve — WIDENED guard fires on a content-hash swap (churnedAnchors>0, NO RETRACT)', () => {
  // The exact gap A3 closes: a swap fires the identity veto but carries no RETRACT verdict, so the
  // old `byVerdict.RETRACT>0` guard skipped the observer entirely. churnedAnchors is the live proxy.
  assert.equal(shouldObserve({ retracts: 0, inversions: 0, churnedAnchors: 1, byVerdict: {} }), true);
});

test('shouldObserve — fires on a bare ladder inversion (inversions>0, no RETRACT)', () => {
  assert.equal(shouldObserve({ retracts: 0, inversions: 2, churnedAnchors: 0, byVerdict: {} }), true);
});

test('shouldObserve — still fires on RETRACT (superset: old behavior preserved)', () => {
  assert.equal(shouldObserve({ retracts: 1, inversions: 0, churnedAnchors: 0 }), true);
  assert.equal(shouldObserve({ byVerdict: { RETRACT: 1 } }), true); // byVerdict fallback
});

test('shouldObserve — quiet on a clean write (no retract/inversion/swap) — keeps the cheap pre-filter', () => {
  assert.equal(shouldObserve({ retracts: 0, inversions: 0, churnedAnchors: 0, byVerdict: {} }), false);
});

test('shouldObserve — fail-open: garbage/missing metrics never throw, default to no-observe', () => {
  assert.doesNotThrow(() => shouldObserve(null));
  assert.equal(shouldObserve(null), false);
  assert.equal(shouldObserve(undefined), false);
  assert.equal(shouldObserve({}), false);
  assert.equal(shouldObserve({ retracts: 'x', inversions: NaN, churnedAnchors: undefined }), false);
});

test('VERIFY-FIRST content-swap — observer fires identityVeto; the guard would now run it', () => {
  const before = [{ id: 'k', claimedStatus: 'trusted', evidence: [], contentHash: 'aaa' }];
  const after = [{ id: 'k', claimedStatus: 'trusted', evidence: [], contentHash: 'bbb' }];
  const o = observeClaimTransition(before, after, { nowMs: NOW });
  assert.equal(o.identityVeto, true);
  assert.equal(o.worsened[0].contentSwapped, true);
  // the swap shows up in the metric the widened guard keys on
  assert.equal(shouldObserve({ churnedAnchors: 1, retracts: 0, inversions: 0 }), true);
});

test('evidence-regression — trusted claim loses its evidence: soft mass detected, no hard veto', () => {
  // Verified live behavior (2026-06-14 probe): evidence regression with an unchanged hash is NOT an
  // identity veto — it surfaces as addedUnsupportedMass. Documents the boundary: the identity veto is
  // for swaps/RETRACTs; evidence erosion is a separate (softer) channel.
  const before = [{ id: 'm', claimedStatus: 'trusted', evidence: [{ kind: 'test' }], contentHash: 'h1' }];
  const after = [{ id: 'm', claimedStatus: 'trusted', evidence: [], contentHash: 'h1' }];
  const o = observeClaimTransition(before, after, { nowMs: NOW });
  assert.equal(o.ok, true);
  assert.equal(o.identityVeto, false);
  assert.ok(o.addedUnsupportedMass > 0, 'evidence regression should register as added unsupported mass');
});

test('emitObservation writes a JSONL record to the trace (isolated temp state dir)', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cto-'));
  const prev = process.env.YURI_STATE_DIR;
  process.env.YURI_STATE_DIR = tmp;
  try {
    const o = observeClaimTransition([{ id: 'k', claimedStatus: 'trusted', evidence: [], contentHash: 'a' }],
      [{ id: 'k', claimedStatus: 'trusted', evidence: [], contentHash: 'b' }], { nowMs: NOW });
    const wrote = emitObservation(o, { nowIso: '2026-06-14T00:00:00Z', source: 'test' });
    assert.equal(wrote, true);
    const lines = fs.readFileSync(observeTracePath(), 'utf8').trim().split('\n');
    assert.equal(lines.length, 1);
    const rec = JSON.parse(lines[0]);
    assert.equal(rec.identityVeto, true);
    assert.equal(rec.source, 'test');
  } finally {
    if (prev === undefined) delete process.env.YURI_STATE_DIR; else process.env.YURI_STATE_DIR = prev;
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
