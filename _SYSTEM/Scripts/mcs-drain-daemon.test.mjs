// _SYSTEM/Scripts/mcs-drain-daemon.test.mjs
// P2 Inc 4 gate — node:test + node:assert only. Runs in a temp dir via drainOpts (never the live store).
// Requires YURI_NANO_LEASES_DIR set to a temp dir in the runner env (the daemon's drainOnce acquires the drain lease).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { drainDaemon } from './mcs-drain-daemon.mjs';
import { appendClaim, loadCanonical, drainOnce } from './memory-canonical-store.mjs';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

test('drainDaemon: folds across cycles, picks up a mid-run append, clean+idempotent stop, lease freed', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'mcsd-'));
  const drainOpts = { dir };
  appendClaim('lane-a', 's1', { subject: 'd', predicate: 'p', object: 1 }, drainOpts);
  const daemon = drainDaemon('daemon-1', { intervalMs: 40, drainOpts });
  await sleep(150);                                       // a few drain cycles fold 'd'
  appendClaim('lane-a', 's1', { subject: 'e', predicate: 'p', object: 2 }, drainOpts);  // appended mid-run
  await sleep(150);                                       // subsequent cycles fold 'e'
  await daemon.stop();
  await daemon.stop();                                    // idempotent — a second stop must neither hang nor throw
  const live = loadCanonical(drainOpts);
  assert.equal(live.length, 2, 'daemon folded both claims across cycles (incl. the mid-run append)');
  // after shutdown the drain lease is free -> a fresh drainOnce acquires + succeeds
  const after = drainOnce('post-daemon', drainOpts);
  assert.equal(after.ok, true, 'drain lease was released on daemon shutdown');
  rmSync(dir, { recursive: true, force: true });
});

test('drainDaemon: empty drainerId is rejected', () => {
  assert.throws(() => drainDaemon(''), /drainerId required/);
});
