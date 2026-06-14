#!/usr/bin/env node
// @capability: mcs-persistence-sweep
// @serves: canonical truth | off-disk backup | snapshot | restore | persistence sweep | continuity | disk-loss recovery | backup rotation | memory durability
// @does: P2 Inc 7 — DISARMED-by-default snapshot/restore for the canonical store. persistenceSweep({arm}) copies the
//        durable canonical state (shards + all generations + read-view + offsets) into <dest>/snap-NNNNN/ via an
//        atomic temp+rename, with a sha256 manifest; rotates to keep the last N. verifySnapshot recomputes hashes.
//        restoreSnapshot({arm}) verifies + copies back + recreates the canonical.jsonl symlink. arm:false = plan/verify only.
// @use: persistenceSweep({ dir, dest, arm:true }) on a schedule for off-disk continuity; verifySnapshot(snapDir) to audit
//       integrity; restoreSnapshot(snapDir, { targetDir, arm:true }) to recover after disk loss. DISARMED until arm:true
//       (or env YURI_CANONICAL_BACKUP_ARM=1). Default dest = `<base>-backup` (gitignored). Single-writer (like the drainer).
// @exports: persistenceSweep, verifySnapshot, restoreSnapshot, listSnapshots, resolveBackupDir, SNAP_PREFIX
// @depends: memory-canonical-store.mjs (resolveDirs, listGenerations)

import {
  mkdirSync, readdirSync, readFileSync, writeFileSync, existsSync,
  statSync, rmSync, renameSync, copyFileSync, realpathSync, symlinkSync,
} from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { resolveDirs, listGenerations } from './memory-canonical-store.mjs';

export const SNAP_PREFIX = 'snap-';
const DEFAULT_KEEP = 5;
const SCHEMA_V = 1;

const sha256File = (p) => crypto.createHash('sha256').update(readFileSync(p)).digest('hex');
const snapName = (n) => `${SNAP_PREFIX}${String(n).padStart(5, '0')}`;
const snapNumber = (name) => { const m = name.match(/snap-(\d+)$/); return m ? parseInt(m[1], 10) : 0; };

/** Default backup dir: a gitignored sibling of the store base (`<base>-backup` matches the *-backup/ gitignore rule). `dest` opt overrides. */
export function resolveBackupDir(opts = {}) {
  if (opts.dest) return path.resolve(opts.dest);
  const { base } = resolveDirs(opts);
  return `${base}-backup`;
}

/** Published snapshots (oldest -> newest), excluding in-progress .tmp dirs. */
export function listSnapshots(dest) {
  if (!existsSync(dest)) return [];
  return readdirSync(dest)
    .filter((n) => n.startsWith(SNAP_PREFIX) && !n.includes('.tmp'))
    .sort()                                          // zero-padded names sort chronologically
    .map((n) => path.join(dest, n));
}

// The durable files to snapshot: shards/*, every canonical.gen-*, read-view.json, drainer-offsets.json.
// The canonical.jsonl SYMLINK is NOT copied (it is a pointer) — its target gen is recorded in the manifest and
// rebuilt on restore.
function collectFiles(base) {
  const files = [];
  const { shardsDir, readViewPath, offsetsPath } = resolveDirs({ dir: base });
  const add = (abs, rel) => { if (existsSync(abs) && statSync(abs).isFile()) files.push({ abs, rel }); };
  if (existsSync(shardsDir)) for (const n of readdirSync(shardsDir)) if (n.endsWith('.jsonl')) add(path.join(shardsDir, n), path.join('shards', n));
  for (const g of listGenerations(base)) add(g, path.basename(g));
  add(readViewPath, path.basename(readViewPath));
  add(offsetsPath, path.basename(offsetsPath));
  return files;
}

function currentGenName(base) {
  const { canonicalLog } = resolveDirs({ dir: base });
  try { return path.basename(realpathSync(canonicalLog)); } catch { return null; }
}

/**
 * Snapshot the canonical store to <dest>/snap-NNNNN/. DISARMED by default (arm:false) -> returns a PLAN
 * (files, totalBytes, dest, snapshot name) and writes NOTHING. arm:true (or env YURI_CANONICAL_BACKUP_ARM=1) ->
 * copies into a .tmp dir then atomically renames into place, writes a sha256 manifest, rotates to keep the last N.
 * Single-writer (run on the drainer's leased schedule); concurrent sweeps are not supported (rename would collide).
 */
export function persistenceSweep(opts = {}) {
  const { base } = resolveDirs(opts);
  const dest = resolveBackupDir(opts);
  const arm = opts.arm === true || process.env.YURI_CANONICAL_BACKUP_ARM === '1';
  const keep = Number.isInteger(opts.keep) ? opts.keep : DEFAULT_KEEP;
  const files = collectFiles(base);
  const totalBytes = files.reduce((s, f) => s + statSync(f.abs).size, 0);
  const currentGen = currentGenName(base);
  const next = listSnapshots(dest).map((s) => snapNumber(path.basename(s))).reduce((a, b) => Math.max(a, b), 0) + 1;
  const plan = { armed: arm, base, dest, snapshot: snapName(next), fileCount: files.length, totalBytes, currentGen };
  if (!arm) return { ...plan, wrote: false, reason: 'DISARMED — pass { arm:true } or set YURI_CANONICAL_BACKUP_ARM=1' };
  if (files.length === 0) return { ...plan, wrote: false, reason: 'nothing-to-snapshot' };

  mkdirSync(dest, { recursive: true });
  const finalDir = path.join(dest, snapName(next));
  const tmpDir = `${finalDir}.tmp-${process.pid}-${crypto.randomBytes(3).toString('hex')}`;
  try { rmSync(tmpDir, { recursive: true, force: true }); } catch { /* */ }
  mkdirSync(tmpDir, { recursive: true });
  const manifestFiles = [];
  for (const f of files) {
    const target = path.join(tmpDir, f.rel);
    mkdirSync(path.dirname(target), { recursive: true });
    copyFileSync(f.abs, target);
    manifestFiles.push({ rel: f.rel, bytes: statSync(target).size, sha256: sha256File(target) });
  }
  const manifest = { v: SCHEMA_V, createdAt: opts.stamp || new Date().toISOString(), base, currentGen, totalBytes, files: manifestFiles };
  writeFileSync(path.join(tmpDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  renameSync(tmpDir, finalDir);                      // ATOMIC publish — a partial snapshot is never visible as snap-NNNNN
  // rotation: keep the last N published snapshots
  const pruned = [];
  const all = listSnapshots(dest);
  if (all.length > keep) for (const s of all.slice(0, all.length - keep)) { try { rmSync(s, { recursive: true, force: true }); pruned.push(path.basename(s)); } catch { /* best-effort */ } }
  return { ...plan, wrote: true, snapshotDir: finalDir, pruned };
}

/** Recompute every manifest sha256 and compare. Returns { ok, mismatches:[], missing:[], fileCount, snapshotDir }. */
export function verifySnapshot(snapshotDir) {
  const manifestPath = path.join(snapshotDir, 'manifest.json');
  if (!existsSync(manifestPath)) return { ok: false, reason: 'no-manifest', snapshotDir };
  let manifest; try { manifest = JSON.parse(readFileSync(manifestPath, 'utf8')); } catch { return { ok: false, reason: 'bad-manifest', snapshotDir }; }
  const mismatches = [], missing = [];
  for (const f of manifest.files || []) {
    const p = path.join(snapshotDir, f.rel);
    if (!existsSync(p)) { missing.push(f.rel); continue; }
    if (sha256File(p) !== f.sha256) mismatches.push(f.rel);
  }
  return { ok: mismatches.length === 0 && missing.length === 0, mismatches, missing, fileCount: (manifest.files || []).length, snapshotDir };
}

/**
 * Restore a snapshot into targetDir. DISARMED by default -> verifies + returns a plan, writes NOTHING. arm:true ->
 * verifies (REFUSES on any mismatch — never restores corrupt data), copies the files into targetDir, and recreates
 * the canonical.jsonl symlink -> the recorded current generation (so drainOnce/loadCanonical work post-restore).
 * Assumes a clean/empty targetDir; it overwrites the manifest's files but does not delete unrelated pre-existing ones.
 */
export function restoreSnapshot(snapshotDir, opts = {}) {
  const verify = verifySnapshot(snapshotDir);
  const target = path.resolve(opts.targetDir || resolveDirs(opts).base);
  const arm = opts.arm === true;
  if (!verify.ok) return { restored: false, reason: 'verify-failed', verify, target };
  if (!arm) return { restored: false, reason: 'DISARMED — pass { arm:true }', target, wouldRestore: verify.fileCount, verify };
  const manifest = JSON.parse(readFileSync(path.join(snapshotDir, 'manifest.json'), 'utf8'));
  mkdirSync(target, { recursive: true });
  for (const f of manifest.files) {
    const src = path.join(snapshotDir, f.rel);
    const dst = path.join(target, f.rel);
    mkdirSync(path.dirname(dst), { recursive: true });
    copyFileSync(src, dst);
  }
  // recreate canonical.jsonl -> currentGen (relative symlink, same convention as the store's swapSymlink)
  let symlinked = null;
  if (manifest.currentGen) {
    const { canonicalLog } = resolveDirs({ dir: target });
    try { rmSync(canonicalLog, { force: true }); } catch { /* */ }
    try { symlinkSync(manifest.currentGen, canonicalLog); symlinked = manifest.currentGen; } catch { /* */ }
  }
  return { restored: true, target, fileCount: manifest.files.length, currentGen: symlinked };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [cmd, a] = process.argv.slice(2);
  if (cmd === 'sweep') console.log(JSON.stringify(persistenceSweep({}), null, 2));      // DISARMED unless YURI_CANONICAL_BACKUP_ARM=1
  else if (cmd === 'list') console.log(JSON.stringify(listSnapshots(resolveBackupDir({})).map((s) => path.basename(s)), null, 2));
  else if (cmd === 'verify') console.log(JSON.stringify(verifySnapshot(a), null, 2));
  else process.stdout.write('usage: mcs-persistence-sweep.mjs [sweep|list|verify <snapshotDir>]  (sweep DISARMED unless YURI_CANONICAL_BACKUP_ARM=1)\n');
}
