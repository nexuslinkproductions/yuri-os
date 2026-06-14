// _SYSTEM/Scripts/mcs-subconscious.test.mjs
// P2 Inc 8 gate — node:test + node:assert. Temp dirs only (live store untouched). Backdates a generation's mtime
// (utimesSync) to drive the age-salience classifier deterministically. Run with:
//   YURI_NANO_LEASES_DIR=$(mktemp -d) node --test _SYSTEM/Scripts/mcs-subconscious.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, utimesSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { appendClaim, drainOnce, loadCanonical, readView, resolveDirs, listGenerations } from './memory-canonical-store.mjs';
import { subconsciousView, eventGenAgeIndex } from './mcs-subconscious.mjs';

const mk = () => mkdtempSync(path.join(tmpdir(), 'mcs-sub-'));
const seed = (dir, n, lane = 'seed', sess = 's') => { for (let i = 0; i < n; i++) appendClaim(lane, sess, { kind: 'assert', subject: `k-${i}`, predicate: 'p', object: i }, { dir }); };
const clean = (...ds) => ds.forEach((d) => rmSync(d, { recursive: true, force: true }));
const backdateGens = (base, days) => { const t = new Date(Date.now() - days * 86_400_000); for (const g of listGenerations(base)) utimesSync(g, t, t); };

test('fresh claims classify HOT — nothing demotes to subconscious', () => {
  const dir = mk();
  seed(dir, 6); drainOnce('d1', { dir });
  const v = subconsciousView({ dir });
  assert.equal(v.total, 6);
  assert.equal(v.hot.length, 6, 'all fresh claims are hot');
  assert.equal(v.subconscious.length, 0, 'nothing cold yet');
  clean(dir);
});

test('aged claims demote to the subconscious tier', () => {
  const dir = mk(); const { base } = resolveDirs({ dir });
  seed(dir, 5); drainOnce('d1', { dir });
  backdateGens(base, 60);                                   // 60 days old -> stalenessScore ≈ 1 >= 0.6
  const v = subconsciousView({ dir });
  assert.equal(v.subconscious.length, 5, 'all aged claims demoted to subconscious');
  assert.equal(v.hot.length, 0);
  assert.ok(v.subconscious.every((c) => c.tier === 'subconscious' && c.staleness >= v.threshold), 'tagged + above threshold');
  clean(dir);
});

test('CONTESTED claims stay HOT even when aged (unsettled never demotes)', () => {
  const dir = mk(); const { base } = resolveDirs({ dir });
  // same key, two distinct objects from two lanes -> contested
  appendClaim('laneA', 'sA', { kind: 'assert', subject: 'x', predicate: 'p', object: 1 }, { dir });
  appendClaim('laneB', 'sB', { kind: 'assert', subject: 'x', predicate: 'p', object: 2 }, { dir });
  appendClaim('laneC', 'sC', { kind: 'assert', subject: 'settled', predicate: 'p', object: 9 }, { dir });
  drainOnce('d1', { dir });
  assert.equal(Object.keys(readView({ dir }).contested).length, 1, 'precondition: exactly one contested key (subject x), separator-agnostic');
  backdateGens(base, 90);
  const v = subconsciousView({ dir });
  const xp = [...v.hot, ...v.subconscious].find((c) => c.subject === 'x');
  assert.equal(xp.tier, 'hot', 'contested claim stays hot despite age');
  assert.equal(xp.reason, 'contested');
  const settled = [...v.hot, ...v.subconscious].find((c) => c.subject === 'settled');
  assert.equal(settled.tier, 'subconscious', 'the uncontested aged claim still demotes');
  clean(dir);
});

test('threshold controls the cut — 0 demotes all (uncontested), >1 demotes none', () => {
  const dir = mk(); const { base } = resolveDirs({ dir });
  seed(dir, 4); drainOnce('d1', { dir });
  backdateGens(base, 30);
  assert.equal(subconsciousView({ dir, threshold: 0 }).subconscious.length, 4, 'threshold 0 -> all cold');
  assert.equal(subconsciousView({ dir, threshold: 1.5 }).subconscious.length, 0, 'threshold >1 -> none cold');
  clean(dir);
});

test('subconsciousView is PURE — it mutates neither canonical nor the read-view', () => {
  const dir = mk(); const { base } = resolveDirs({ dir });
  seed(dir, 5); drainOnce('d1', { dir });
  backdateGens(base, 60);
  const beforeCanonical = loadCanonical({ dir }).length;
  const beforeView = JSON.stringify(readView({ dir }));
  const v = subconsciousView({ dir });
  assert.equal(v.hot.length + v.subconscious.length, v.total, 'every claim classified exactly once (partition)');
  assert.equal(loadCanonical({ dir }).length, beforeCanonical, 'loadCanonical unchanged');
  assert.equal(JSON.stringify(readView({ dir })), beforeView, 'read-view unchanged — pure projection');
  clean(dir);
});

test('eventGenAgeIndex maps every folded event to a non-negative age', () => {
  const dir = mk(); const { base } = resolveDirs({ dir });
  seed(dir, 3); drainOnce('d1', { dir });
  const idx = eventGenAgeIndex(base);
  assert.ok(idx.size >= 3, 'all folded events indexed');
  for (const age of idx.values()) assert.ok(age >= 0 && Number.isFinite(age), 'ages are finite + non-negative');
  clean(dir);
});
