#!/usr/bin/env node
// @capability: nano-lease-registry
// @serves: work lease | file lock | nano collision | dont clobber | exclusive claim | who owns this file | partition work across lanes | stale lease reclaim
// @does: the NANO SWARM anti-clobber keystone (G1) — per-resource ATOMIC leases via mkdir-EXCL (one winner, no TOCTOU), owner-verified release, heartbeat renew, TTL + dead/stale-holder reclaim (race-safe rename-then-delete). Resource IDs encode anything: file:src/x.ts | task:build | slot:gpu-2.
// @use: a nano calls acquireLease(id, nanoId) before touching a shared resource; others skip what's held. Worktree-per-nano covers the 95% case (own-branch edits); leases cover the contended ~5%.
// @exports: acquireLease, releaseLease, renewLease, reclaimLeases, acquireOrWait, listLeases, leaseDir, DEFAULT_TTL_MS
//
// Generalizes local-concurrency.mjs's proven atomic-mkdir semaphore from fixed slot-0..N to arbitrary
// resource-keyed leases. Staleness is keyed on renewedAt in the .owner JSON ONLY (a peer review mixed
// mtime + JSON ts — that inconsistency is fixed here: one timestamp source). Reuses _lib/fs atomic IO.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { readJsonOrNull, atomicWriteFile } from './_lib/fs.mjs';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const LEASES_DIR = process.env.YURI_NANO_LEASES_DIR || path.join(REPO_ROOT, '_SYSTEM/state/nano/leases');
export const DEFAULT_TTL_MS = Number(process.env.YURI_NANO_LEASE_TTL_MS) || 5 * 60 * 1000;
const HOST = os.hostname();

export function leaseDir(id) {
  const key = crypto.createHash('sha256').update(String(id)).digest('hex').slice(0, 40);
  return path.join(LEASES_DIR, key);
}
const ownerFile = (dir) => path.join(dir, '.owner');
const readOwner = (dir) => readJsonOrNull(ownerFile(dir));

// Alive if: same host AND pid responds to signal 0; OR (remote/unprobeable AND not past its TTL).
// Remote pids can't be probed, so cross-host reclamation is staleness-only — exactly local-concurrency.
function holderAlive(meta, now = Date.now()) {
  if (!meta || typeof meta.renewedAt !== 'number') return false;
  const fresh = now - meta.renewedAt < (Number(meta.ttlMs) || DEFAULT_TTL_MS);
  if (meta.host === HOST && Number.isInteger(meta.pid)) {
    let pidLive; try { process.kill(meta.pid, 0); pidLive = true; } catch (e) { pidLive = e.code === 'EPERM'; }
    // Red-team #2 fix: a same-host holder is alive only if its pid is live AND the lease is fresh.
    // A live-but-STALE holder (renewedAt older than ttl) is a crashed nano whose pid was RECYCLED by
    // an unrelated process, or one stuck not-renewing — reclaimable either way. (Live nanos heartbeat
    // via renewLease within ttl, so a healthy holder always reads fresh.)
    return pidLive && fresh;
  }
  return fresh; // remote: unprobeable pid -> staleness-only
}

// Race-safe teardown: rename the dir to a unique staging name FIRST (atomic — exactly one winner),
// then delete the staged copy. A concurrent reclaimer that loses the rename gets ENOENT → skips, so
// a lease can never be double-freed out from under a fresh re-acquire.
function destroyLeaseDir(dir) {
  const staged = `${dir}.rcl-${process.pid}-${crypto.randomBytes(4).toString('hex')}`;
  try { fs.renameSync(dir, staged); } catch { return false; } // lost the race (already gone/renamed)
  try { fs.rmSync(staged, { recursive: true, force: true }); } catch { /* orphan staged dir -> age-swept by reclaimLeases */ }
  return true;
}

function writeOwner(dir, meta) { atomicWriteFile(ownerFile(dir), JSON.stringify(meta), { mkdir: false }); }

// Red-team #1 fix: claim with the owner ALREADY INSIDE, then atomically rename the staging dir into
// place. A directory rename onto an existing NON-empty dir fails (ENOTEMPTY) — and a claimed lease dir
// always contains .owner — so there is NO empty-owner window for a racer to misread as "dead" and
// steal. Exactly one renamer wins; losers clean their staging dir. Replaces the old mkdir-then-write
// (which left the dir owner-less for ~10 lines and let 40 concurrent procs all "win").
function claimViaRename(dir, meta) {
  let staging;
  try { staging = fs.mkdtempSync(path.join(LEASES_DIR, '.stage-')); } catch { return false; }
  try {
    fs.writeFileSync(path.join(staging, '.owner'), JSON.stringify(meta));
    fs.renameSync(staging, dir); // ATOMIC: succeeds only if `dir` does not already exist
    return true;
  } catch {
    try { fs.rmSync(staging, { recursive: true, force: true }); } catch { /* best-effort */ }
    return false;
  }
}

/**
 * Atomically claim `id` for `nanoId` via owner-included rename (no TOCTOU). A dead/stale holder is
 * reclaimed and the lease retaken ONCE. Returns { ok:true, leaseId, dir } or { ok:false, heldBy }.
 */
export function acquireLease(id, nanoId, { ttlMs = DEFAULT_TTL_MS } = {}) {
  if (!id || !nanoId) return { ok: false, reason: 'id and nanoId required' };
  fs.mkdirSync(LEASES_DIR, { recursive: true });
  const dir = leaseDir(id);
  const now = Date.now();
  const meta = { leaseId: String(id), nanoId: String(nanoId), host: HOST, pid: process.pid, acquiredAt: now, renewedAt: now, ttlMs };
  if (claimViaRename(dir, meta)) return { ok: true, leaseId: meta.leaseId, dir };
  // Lost the rename OR a holder already exists — inspect it.
  const cur = readOwner(dir);
  if (holderAlive(cur, now)) return { ok: false, heldBy: cur?.nanoId || 'unknown', since: cur?.acquiredAt };
  // dead/stale holder → reclaim then retry the atomic claim ONCE (a third party may win the retry).
  destroyLeaseDir(dir);
  if (claimViaRename(dir, meta)) return { ok: true, leaseId: meta.leaseId, dir };
  const c2 = readOwner(dir);
  return { ok: false, heldBy: c2?.nanoId || 'reacquire-race' };
}

/** Release — ONLY the owner can. Returns true if released (or already gone), false if held by another. */
export function releaseLease(id, nanoId) {
  if (!id || !nanoId) return false;
  const dir = leaseDir(id);
  if (!fs.existsSync(dir)) return true; // already free
  const cur = readOwner(dir);
  // Red-team #3 fix: FAIL-CLOSED — refuse if the owner is null/unparseable OR not us. (Was: a null
  // owner skipped the guard, letting any caller free a dir another nano was mid-claiming. Reclaiming
  // a genuinely dead owner-less dir is reclaimLeases'/the reaper's job, not a non-owner release.)
  if (!cur || cur.nanoId !== String(nanoId)) return false;
  return destroyLeaseDir(dir);
}

/** Heartbeat — bump renewedAt so the lease doesn't go stale. Owner-only. Returns true on success. */
export function renewLease(id, nanoId, { ttlMs } = {}) {
  const dir = leaseDir(id);
  const cur = readOwner(dir);
  if (!cur || cur.nanoId !== String(nanoId)) return false;
  cur.renewedAt = Date.now();
  if (ttlMs) cur.ttlMs = ttlMs;
  try { writeOwner(dir, cur); return true; } catch { return false; }
}

const isStagingName = (n) => n.includes('.rcl-') || n.includes('.stage-');
// Red-team #4 fix: a staging/reclaiming dir older than this is an orphan (process died between
// rename and rm) — swept so it can't leak forever (the old "GC'd later" never happened).
const STALE_ORPHAN_MS = 2 * DEFAULT_TTL_MS;

/** Sweep all leases; reclaim dead/stale holders + age-sweep orphan staging dirs (race-safe). */
export function reclaimLeases(now = Date.now()) {
  const reclaimed = [];
  let entries = [];
  try { entries = fs.readdirSync(LEASES_DIR, { withFileTypes: true }); } catch { return reclaimed; }
  for (const ent of entries) {
    if (!ent.isDirectory()) continue;
    const dir = path.join(LEASES_DIR, ent.name);
    if (isStagingName(ent.name)) { // orphan staging/reclaiming dir -> age-sweep
      try { if (now - fs.statSync(dir).mtimeMs > STALE_ORPHAN_MS) fs.rmSync(dir, { recursive: true, force: true }); } catch { /* gone/racing */ }
      continue;
    }
    const meta = readOwner(dir);
    if (holderAlive(meta, now)) continue;
    if (destroyLeaseDir(dir)) reclaimed.push(meta?.leaseId || ent.name);
  }
  return reclaimed;
}

/** List currently-held (live) leases, pruning dead ones first. */
export function listLeases(now = Date.now()) {
  reclaimLeases(now);
  const out = [];
  let entries = [];
  try { entries = fs.readdirSync(LEASES_DIR, { withFileTypes: true }); } catch { return out; }
  for (const ent of entries) {
    if (!ent.isDirectory() || isStagingName(ent.name)) continue;
    const meta = readOwner(path.join(LEASES_DIR, ent.name));
    if (meta) out.push(meta);
  }
  return out;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Block (async) until `id` is acquired or `maxWaitMs` elapses. Reclaims + jitters each poll to
 *  break thundering-herd. Returns the acquireLease result (with ok:false, timeout:true on giving up). */
export async function acquireOrWait(id, nanoId, { ttlMs = DEFAULT_TTL_MS, maxWaitMs = 30_000, pollMs = 150, rng = Math.random } = {}) {
  const deadline = Date.now() + maxWaitMs;
  for (;;) {
    const r = acquireLease(id, nanoId, { ttlMs });
    if (r.ok) return r;
    if (Date.now() >= deadline) return { ...r, timeout: true };
    reclaimLeases();
    await sleep(pollMs + Math.floor(rng() * pollMs)); // jitter 1x–2x pollMs
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const cmd = process.argv[2] || 'list';
  if (cmd === 'list') { for (const l of listLeases()) console.log(`  ${l.leaseId} held by ${l.nanoId} (pid ${l.pid}, renewed ${new Date(l.renewedAt).toISOString()})`); }
  else if (cmd === 'reclaim') { console.log('reclaimed:', reclaimLeases()); }
  else console.log('usage: nano-lease.mjs [list|reclaim]');
}
