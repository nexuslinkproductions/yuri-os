// _SYSTEM/Scripts/mcs-persistence-sweep.test.mjs
// P2 Inc 7 gate — node:test + node:assert. Runs entirely in temp dirs (live store never touched). Needs
// YURI_NANO_LEASES_DIR set in the runner env (drainOnce acquires the drain lease): run with
//   YURI_NANO_LEASES_DIR=$(mktemp -d) node --test _SYSTEM/Scripts/mcs-persistence-sweep.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, existsSync, writeFileSync, readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { appendClaim, drainOnce, loadCanonical } from './memory-canonical-store.mjs';
import { persistenceSweep, verifySnapshot, restoreSnapshot, listSnapshots } from './mcs-persistence-sweep.mjs';

const mk = () => mkdtempSync(path.join(tmpdir(), 'mcs-ps-'));
const seed = (dir, n, lane = 'seed', sess = 's') => { for (let i = 0; i < n; i++) appendClaim(lane, sess, { kind: 'assert', subject: `k-${i}`, predicate: 'p', object: i }, { dir }); };
const clean = (...ds) => ds.forEach((d) => rmSync(d, { recursive: true, force: true }));

test('persistenceSweep DISARMED by default — returns a plan, writes nothing', () => {
  const dir = mk(); const dest = mk();
  seed(dir, 5); drainOnce('d1', { dir });
  const r = persistenceSweep({ dir, dest });
  assert.equal(r.armed, false);
  assert.equal(r.wrote, false);
  assert.ok(r.fileCount >= 1, 'plan still counts the files it WOULD copy');
  assert.equal(listSnapshots(dest).length, 0, 'no snapshot written while disarmed');
  clean(dir, dest);
});

test('persistenceSweep armed — snapshot + manifest sha256 verifies; currentGen recorded', () => {
  const dir = mk(); const dest = mk();
  seed(dir, 8); drainOnce('d1', { dir });
  const r = persistenceSweep({ dir, dest, arm: true });
  assert.equal(r.wrote, true);
  const snaps = listSnapshots(dest);
  assert.equal(snaps.length, 1, 'one snapshot published');
  const v = verifySnapshot(snaps[0]);
  assert.equal(v.ok, true, `manifest integrity ok (${JSON.stringify(v)})`);
  const manifest = JSON.parse(readFileSync(path.join(snaps[0], 'manifest.json'), 'utf8'));
  assert.match(manifest.currentGen || '', /canonical\.gen-\d+\.jsonl/, 'current generation recorded for symlink rebuild');
  assert.ok(manifest.files.some((f) => f.rel.startsWith('shards/')), 'shards captured');
  assert.ok(manifest.files.some((f) => f.rel.startsWith('canonical.gen-')), 'generations captured');
  clean(dir, dest);
});

test('no .tmp staging dir is left behind after an atomic publish', () => {
  const dir = mk(); const dest = mk();
  seed(dir, 4); drainOnce('d1', { dir });
  persistenceSweep({ dir, dest, arm: true });
  assert.ok(!readdirSync(dest).some((n) => n.includes('.tmp')), 'staging dir was renamed into place, not orphaned');
  clean(dir, dest);
});

test('verifySnapshot detects corruption (flipped byte)', () => {
  const dir = mk(); const dest = mk();
  seed(dir, 6); drainOnce('d1', { dir });
  persistenceSweep({ dir, dest, arm: true });
  const snap = listSnapshots(dest)[0];
  const genFile = readdirSync(snap).find((n) => n.startsWith('canonical.gen-'));
  const p = path.join(snap, genFile);
  writeFileSync(p, `${readFileSync(p, 'utf8')}X`);          // tamper
  const v = verifySnapshot(snap);
  assert.equal(v.ok, false);
  assert.ok(v.mismatches.includes(genFile), 'the tampered file is flagged');
  clean(dir, dest);
});

test('snapshot rotation keeps the last N', () => {
  const dir = mk(); const dest = mk();
  seed(dir, 3); drainOnce('d0', { dir });
  for (let i = 0; i < 7; i++) {
    appendClaim('seed', 's', { kind: 'assert', subject: `extra-${i}`, predicate: 'p', object: i }, { dir });
    drainOnce(`d-${i}`, { dir });
    persistenceSweep({ dir, dest, arm: true, keep: 3 });
  }
  assert.equal(listSnapshots(dest).length, 3, 'rotation kept only the last 3 snapshots');
  clean(dir, dest);
});

test('restore DISARMED by default — verify-only, writes nothing', () => {
  const dir = mk(); const dest = mk(); const tgt = mk();
  seed(dir, 5); drainOnce('d1', { dir });
  persistenceSweep({ dir, dest, arm: true });
  const snap = listSnapshots(dest)[0];
  const r = restoreSnapshot(snap, { targetDir: tgt });
  assert.equal(r.restored, false);
  assert.match(r.reason, /DISARMED/);
  assert.equal(loadCanonical({ dir: tgt }).length, 0, 'nothing restored while disarmed');
  clean(dir, dest, tgt);
});

test('restore round-trip — armed restore into a fresh dir reproduces canonical + the symlink works', () => {
  const dir = mk(); const dest = mk(); const tgt = mk();
  seed(dir, 10); drainOnce('d1', { dir });
  assert.equal(loadCanonical({ dir }).length, 10);
  persistenceSweep({ dir, dest, arm: true });
  const snap = listSnapshots(dest)[0];
  const r = restoreSnapshot(snap, { targetDir: tgt, arm: true });
  assert.equal(r.restored, true);
  assert.equal(loadCanonical({ dir: tgt }).length, 10, 'restored canonical matches the original');
  // symlink recreated -> a fresh append + drain on the RESTORED store works and stays exactly-once
  appendClaim('post', 's', { kind: 'assert', subject: 'after-restore', predicate: 'p', object: 1 }, { dir: tgt });
  assert.equal(drainOnce('post-d', { dir: tgt }).ok, true, 'drain works on the restored store (symlink intact)');
  assert.equal(loadCanonical({ dir: tgt }).length, 11);
  clean(dir, dest, tgt);
});
