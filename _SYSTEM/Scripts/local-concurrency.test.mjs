#!/usr/bin/env node
// Tests for local-concurrency.mjs — the FS counting-semaphore for local-inference admission control.
// Fully ISOLATED: YURI_LOCAL_SLOTS_DIR is pointed at a throwaway tmp dir BEFORE the module loads
// (the module captures SLOTS_DIR at import time), so nothing here touches the real _SYSTEM/state slots.
import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';

const SLOTS = path.join(os.tmpdir(), `lc-test-${process.pid}-${crypto.randomBytes(4).toString('hex')}`);
process.env.YURI_LOCAL_SLOTS_DIR = SLOTS;
// dynamic import AFTER the env is set, so the module's load-time `const SLOTS_DIR` picks up the tmp dir.
const { maxConcurrency, localConcurrency, tryAcquireLocalSlot, releaseLocalSlot } =
  await import('./local-concurrency.mjs');
const HOST = os.hostname();

function reset() { fs.rmSync(SLOTS, { recursive: true, force: true }); } // node rmSync (not a bash rm)
function setMax(n) { process.env.YURI_LOCAL_MAX_CONCURRENCY = String(n); }

test('maxConcurrency: env override wins; default is >= 1', () => {
  setMax(3);
  assert.equal(maxConcurrency(), 3);
  delete process.env.YURI_LOCAL_MAX_CONCURRENCY;
  assert.ok(maxConcurrency() >= 1, 'default falls back to models.json or the safe sequential 1');
  setMax(0); // non-positive -> ignored -> fallback
  assert.ok(maxConcurrency() >= 1, 'a 0/negative env value must NOT be honored');
});

test('tryAcquireLocalSlot: acquires up to max, then refuses when full', () => {
  reset(); setMax(3);
  const a = tryAcquireLocalSlot({ lane: 'test' });
  const b = tryAcquireLocalSlot({ lane: 'test' });
  const c = tryAcquireLocalSlot({ lane: 'test' });
  assert.ok(a.ok && b.ok && c.ok, 'three acquires under max=3 succeed');
  assert.deepEqual([a.slotId, b.slotId, c.slotId].sort(), ['slot-0', 'slot-1', 'slot-2'], 'distinct slots filled low-first');
  const full = tryAcquireLocalSlot({ lane: 'test' });
  assert.equal(full.ok, false, 'the 4th acquire over max=3 is refused');
  assert.equal(full.active, 3);
  assert.equal(full.max, 3);
});

test('releaseLocalSlot: frees a slot so it can be re-acquired', () => {
  reset(); setMax(2);
  const a = tryAcquireLocalSlot();
  tryAcquireLocalSlot();
  assert.equal(tryAcquireLocalSlot().ok, false, 'full at max=2');
  assert.equal(releaseLocalSlot(a.slotId), true, 'release reports success');
  const re = tryAcquireLocalSlot();
  assert.ok(re.ok, 'a slot is free again after release');
  assert.equal(re.slotId, a.slotId, 'the freed (lowest) slot is reused');
});

test('localConcurrency: reports active / max / available honestly', () => {
  reset(); setMax(3);
  tryAcquireLocalSlot(); tryAcquireLocalSlot();
  const c = localConcurrency();
  assert.equal(c.max, 3);
  assert.equal(c.active, 2);
  assert.equal(c.available, 1);
  assert.equal(c.slots.length, 2);
});

test('reclamation: a dead/stale holder is pruned so capacity is not wedged', () => {
  reset(); setMax(2);
  const mine = tryAcquireLocalSlot(); // slot-0, held by THIS live pid
  // simulate a crashed REMOTE holder occupying slot-1: different host + stale `started` -> not alive.
  const ghost = path.join(SLOTS, 'slot-1');
  fs.mkdirSync(ghost, { recursive: true });
  fs.writeFileSync(path.join(ghost, 'meta.json'),
    JSON.stringify({ pid: 999999, host: 'ghost-host', lane: 'x', model: 'y', started: Date.now() - 60 * 60 * 1000 }));
  const c = localConcurrency();
  assert.equal(c.active, 1, 'the stale ghost slot is reclaimed; only the live holder counts');
  assert.equal(fs.existsSync(ghost), false, 'the stale slot dir is removed by prune');
  assert.ok(mine.ok);
});

test('releaseLocalSlot: guards a falsy id, and a no-op release of a missing slot does not throw', () => {
  reset(); setMax(1);
  assert.equal(releaseLocalSlot(''), false, 'falsy slotId is rejected by the guard');
  assert.equal(releaseLocalSlot(undefined), false);
  assert.equal(releaseLocalSlot('slot-404'), true, 'force-removing a missing slot is a successful no-op');
});
