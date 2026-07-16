#!/usr/bin/env node
// @capability: nano-lease-registry
// @serves: work lease | file lock | nano collision | dont clobber | exclusive claim | who owns this file | partition work across lanes | stale lease reclaim
// @does: the NANO SWARM anti-clobber keystone (G1) — per-resource ATOMIC leases via mkdir-EXCL (one winner, no TOCTOU), owner-verified release, heartbeat renew, TTL + dead/stale-holder reclaim (race-safe rename-then-delete). Resource IDs encode anything: file:src/x.ts | task:build | slot:gpu-2.
// @use: a nano calls acquireLease(id, nanoId) before touching a shared resource; others skip what's held. Worktree-per-nano covers the 95% case (own-branch edits); leases cover the contended ~5%.
// @exports: acquireLease, releaseLease, renewLease, reclaimLeases, acquireOrWait, listLeases, inspectLeases, leaseDir, DEFAULT_TTL_MS
//
// Generalizes local-concurrency.mjs's proven atomic-mkdir semaphore from fixed slot-0..N to arbitrary
// resource-keyed leases. Staleness is keyed on renewedAt in the .owner JSON ONLY (a peer review mixed
// mtime + JSON ts — that inconsistency is fixed here: one timestamp source). Reuses _lib/fs atomic IO.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
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

// Take EXCLUSIVE custody of `dir` by renaming it to a unique staging name (atomic — exactly one winner;
// losers get ENOENT and skip). While staged, no other process can see or claim `dir` until we destroy it
// or restore it. The `.rcl-` prefix is age-swept by reclaimLeases if we die mid-teardown.
function stageDir(dir) {
  const staged = `${dir}.rcl-${process.pid}-${crypto.randomBytes(4).toString('hex')}`;
  try { fs.renameSync(dir, staged); return staged; } catch { return null; }
}

// Red-team K2 fix — DEAD-ONLY teardown re-evaluated UNDER CUSTODY. The old path read the owner, judged it
// dead, then destroyed the dir UNCONDITIONALLY: a process that claimed a fresh LIVE lease in that window
// had it destroyed and re-granted to the reclaimer (double-acquire + lost updates). Here:
//   1. PRE-CHECK — if the dir already turned over to a live owner, don't even take custody (cheap; avoids
//      the common turnover eviction).
//   2. Take exclusive custody (atomic stage rename — one winner).
//   3. Re-read the owner UNDER CUSTODY; destroy ONLY if it is dead/ownerless RIGHT NOW. A live owner —
//      a brand-new claim OR the same lease just RENEWED (same identity, fresh renewedAt) — is restored
//      untouched, never torn down (dead-ness is judged fresh here, not from the stale inspect).
// Residual (cooperative-lease floor; unavoidable on a plain POSIX FS with no lock manager): a 3-way race —
// a lease goes live between the pre-check and the stage, and a third party claims the now-free dir before
// our restore — can EVICT that live owner without granting it to us. NEVER a double-OWNER (we return
// false); the evicted owner detects the loss on its next owner-checked renew/release.
function reclaimDirIfDead(dir, now = Date.now()) {
  const pre = readOwner(dir);
  if (pre && holderAlive(pre, now)) return false; // already live again -> don't disturb it
  const staged = stageDir(dir);
  if (!staged) return false; // lost custody
  const owner = readJsonOrNull(path.join(staged, '.owner'));
  if (!owner || !holderAlive(owner, now)) { // dead/ownerless under custody -> safe to destroy
    try { fs.rmSync(staged, { recursive: true, force: true }); } catch { /* orphan -> age-swept */ }
    return true;
  }
  try { fs.renameSync(staged, dir); } catch { /* dir retaken; live owner evicted -> fails its next renew */ }
  return false;
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
 * reclaimed and the lease retaken ONCE. Returns { ok:true, leaseId, dir } or { ok:false, reason, heldBy, since }.
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
  if (holderAlive(cur, now)) return { ok: false, reason: 'live-holder', heldBy: cur?.nanoId || 'unknown', since: cur?.acquiredAt ?? now };
  // dead/stale holder → reclaim ONLY the exact dead lease we inspected (owner-matched), then retry the
  // atomic claim ONCE. If a live lease was claimed in the window, reclaim refuses → we report contended
  // rather than stealing it.
  if (!reclaimDirIfDead(dir, now)) {
    const c0 = readOwner(dir);
    return { ok: false, reason: 'reacquire-race', heldBy: c0?.nanoId || 'unknown', since: c0?.acquiredAt ?? now };
  }
  if (claimViaRename(dir, meta)) return { ok: true, leaseId: meta.leaseId, dir };
  const c2 = readOwner(dir);
  return { ok: false, reason: 'reacquire-race', heldBy: c2?.nanoId || 'unknown', since: c2?.acquiredAt ?? now };
}

/** Release — ONLY the owner can. Returns true if released (or already gone), false if held by another. */
export function releaseLease(id, nanoId) {
  if (!id || !nanoId) return false;
  const dir = leaseDir(id);
  const cur = readOwner(dir);
  // FAIL-CLOSED — refuse if the owner is null/unparseable OR not us, WITHOUT disturbing the dir (a null
  // owner is someone mid-claim; reclaiming a dead owner-less dir is the reaper's job, not a non-owner
  // release). gone -> already released.
  if (!cur) return !fs.existsSync(dir);
  if (cur.nanoId !== String(nanoId)) return false;
  // Believed ours → take custody and RE-CONFIRM before destroying. Kills the read→destroy TOCTOU where the
  // lease was reclaimed + re-acquired by another nano in the window (we'd otherwise destroy THEIR lease).
  const staged = stageDir(dir);
  if (!staged) return true; // vanished after our read -> already released
  const owner = readJsonOrNull(path.join(staged, '.owner'));
  if (owner && owner.nanoId === String(nanoId)) {
    try { fs.rmSync(staged, { recursive: true, force: true }); } catch { /* orphan -> age-swept */ }
    return true;
  }
  try { fs.renameSync(staged, dir); } catch { /* dir retaken between our read and stage */ }
  return false;
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
    // dead-only teardown under custody: won't destroy a lease that went live between our read and reclaim.
    if (reclaimDirIfDead(dir, now)) reclaimed.push(meta?.leaseId || ent.name);
  }
  return reclaimed;
}

/**
 * Inspect every lease WITHOUT mutating — owner + computed alive flag, for the supervisor reaper and the
 * swarm board. Unlike listLeases (which reclaims first), this is a pure read so the supervisor can
 * attribute a soon-to-be-reaped lease to its owning nano BEFORE reclaimLeases destroys it. An ownerless
 * dir (mid-claim / corrupt) reports alive:false + ownerless:true.
 */
export function inspectLeases(now = Date.now()) {
  const out = [];
  let entries = [];
  try { entries = fs.readdirSync(LEASES_DIR, { withFileTypes: true }); } catch { return out; }
  for (const ent of entries) {
    if (!ent.isDirectory() || isStagingName(ent.name)) continue;
    const meta = readOwner(path.join(LEASES_DIR, ent.name));
    if (!meta) { out.push({ leaseId: null, nanoId: null, dirHash: ent.name, alive: false, ownerless: true }); continue; }
    out.push({
      leaseId: meta.leaseId, nanoId: meta.nanoId, pid: meta.pid, host: meta.host,
      renewedAt: meta.renewedAt, alive: holderAlive(meta, now),
    });
  }
  return out;
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

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const cmd = process.argv[2] || 'list';
  if (cmd === 'list') { for (const l of listLeases()) console.log(`  ${l.leaseId} held by ${l.nanoId} (pid ${l.pid}, renewed ${new Date(l.renewedAt).toISOString()})`); }
  else if (cmd === 'reclaim') { console.log('reclaimed:', reclaimLeases()); }
  else console.log('usage: nano-lease.mjs [list|reclaim]');
}
