// Tests for claim-transition-observer.mjs — the OBSERVE-mode runtime caller for the
// identity veto. Proves it FIRES on real attack pairs (non-vacuous), stays quiet on
// clean pairs, fails OPEN on a bad input, and the emitter writes a JSONL trace.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { observeClaimTransition, emitObservation, observeTracePath } from './claim-transition-observer.mjs';

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
