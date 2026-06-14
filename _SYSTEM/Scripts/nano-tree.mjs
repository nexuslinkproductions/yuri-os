#!/usr/bin/env node
// @capability: nano-tree-topology
// @serves: spawn tree | nano lineage | tree path identity | node budget | fan-out cap | depth cap | in-flight descendants | tree manifest | spawn governance counter | recursive swarm bounds
// @does: the BOUNDED-TREE substrate for the recursive exoskeleton nanoswarm (Move 1b). Path identity
//   (r / r.0 / r.0.2 — depth + parent + ancestor decode from the path, no pointer store), a durable
//   append-only per-tree spawn MANIFEST (node-budget counter source + orphan detection), an ATOMIC
//   budget-reserve (lease-serialized check+append → no sibling TOCTOU), and inflightDescendants() —
//   the barrier's whole-subtree liveness enumeration via nano-lease inspectLeases() prefix filter.
//   Three composing limits: node budget B (size) · decaying fan-out F_eff(d)=⌈F0·decay^d⌉ (shape) ·
//   depth tier (heavy>200B→5 / light→10, race-window bound). Pure mechanism — NO dispatch, NO spawn;
//   safe to ship un-gated (the spawn GATE lives in spawn_nano). Provenance: 07-ARCHITECTURE.md §3-5,§9.
// @use: initTree(rootRunId,{budget,f0,decay}) once; reserveSpawnSlots(rootRunId,specs,spawnerId) under
//   the budget lease to grant children atomically; inflightDescendants(rootRunId,path) for the barrier;
//   recordComplete(rootRunId,path) on EOT; manifestOrphans(rootRunId,path) for orphan signals.
// @exports: initTree, treeConfig, mintPath, depthOf, parentOf, isAncestor, nanoIdOf, inflightLeaseId,
//   fanoutAt, depthCapFor, tierForParamsB, reserveSpawnSlots, recordSpawn, recordComplete, recordVoid,
//   readManifest, nodeCount, inflightDescendants, manifestOrphans, treeDir, manifestPath, DEFAULTS

import { openSync, appendFileSync, fsyncSync, closeSync, mkdirSync, readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readJsonOrNull, atomicWriteFile } from './_lib/fs.mjs';
import { inspectLeases, acquireOrWait, releaseLease } from './nano-lease.mjs';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const TREES_DIR = process.env.YURI_NANO_TREES_DIR || path.join(REPO_ROOT, '_SYSTEM/state/nano/trees');
export const DEFAULTS = { budget: 64, f0: 4, decay: 0.5, heavyDepth: 5, lightDepth: 10, heavyParamsB: 200 };
const ROOT_PATH = 'r';

// ── PATH IDENTITY (lineage decodes from the string — no parent-pointer store) ──────────────────────
/** child path = `${parentPath}.${index}`. Root path is 'r'. */
export function mintPath(parentPath, index) {
  if (!parentPath) return ROOT_PATH;
  if (!Number.isInteger(index) || index < 0) throw new Error(`mintPath: bad index ${index}`);
  return `${parentPath}.${index}`;
}
/** depth = number of '.'-segments after root. 'r' → 0, 'r.0' → 1, 'r.0.2' → 2. */
export function depthOf(p) {
  const s = String(p || '');
  if (s === ROOT_PATH || s === '') return 0;
  return s.split('.').length - 1;
}
/** parent path, or null for the root. */
export function parentOf(p) {
  const s = String(p || '');
  const i = s.lastIndexOf('.');
  return i < 0 ? null : s.slice(0, i);
}
/** true iff `a` is a strict ancestor of `b` (b is in a's subtree). */
export function isAncestor(a, b) {
  return String(b).startsWith(`${a}.`);
}
export function nanoIdOf(rootRunId, p) { return `${rootRunId}/${p}`; }
/** the in-flight registry lease id for a node — the prefix the barrier filters on. */
export function inflightLeaseId(rootRunId, p) { return `nanotree:${rootRunId}:${p}`; }

// ── THE THREE LIMITS ────────────────────────────────────────────────────────────────────────────
/** decaying fan-out: at depth d a node may spawn at most this many children. */
export function fanoutAt(depth, { f0 = DEFAULTS.f0, decay = DEFAULTS.decay } = {}) {
  return Math.max(1, Math.ceil(f0 * Math.pow(decay, Math.max(0, depth))));
}
/** depth cap by tier (owner rule, sim-validated): heavy 5 / light 10. */
export function depthCapFor(tier, cfg = {}) {
  return tier === 'heavy' ? (cfg.heavyDepth ?? DEFAULTS.heavyDepth) : (cfg.lightDepth ?? DEFAULTS.lightDepth);
}
/** tier from trained-param count in BILLIONS: >200B → heavy (depth 5), else light (depth 10). */
export function tierForParamsB(paramsB, cfg = {}) {
  const t = cfg.heavyParamsB ?? DEFAULTS.heavyParamsB;
  return Number(paramsB) > t ? 'heavy' : 'light';
}

// ── PER-TREE MANIFEST (durable, append-only) ──────────────────────────────────────────────────────
export function treeDir(rootRunId) { return path.join(TREES_DIR, sanitize(rootRunId)); }
export function manifestPath(rootRunId) { return path.join(treeDir(rootRunId), 'manifest.jsonl'); }
const metaPath = (rootRunId) => path.join(treeDir(rootRunId), 'meta.json');
function sanitize(s) {
  const out = String(s).replace(/[^A-Za-z0-9._-]/g, '-');
  if (!out || out === '.' || out === '..') throw new Error(`invalid tree id: ${JSON.stringify(s)}`);
  return out;
}
// durable append (memory-kernel / canonical-store pattern): one line, fsync'd.
function appendLine(file, obj) {
  mkdirSync(path.dirname(file), { recursive: true });
  const fd = openSync(file, 'a');
  try { appendFileSync(fd, `${JSON.stringify(obj)}\n`); fsyncSync(fd); } finally { closeSync(fd); }
}

/** Initialize a tree: write meta (bounds) + record the root spawn. Idempotent-ish (re-init re-records meta). */
export function initTree(rootRunId, { budget = DEFAULTS.budget, f0 = DEFAULTS.f0, decay = DEFAULTS.decay, heavyDepth, lightDepth } = {}) {
  mkdirSync(treeDir(rootRunId), { recursive: true });
  const cfg = { rootRunId, budget, f0, decay, heavyDepth: heavyDepth ?? DEFAULTS.heavyDepth, lightDepth: lightDepth ?? DEFAULTS.lightDepth, createdAt: new Date().toISOString() };
  atomicWriteFile(metaPath(rootRunId), `${JSON.stringify(cfg, null, 2)}\n`);
  if (nodeCount(rootRunId) === 0) recordSpawn(rootRunId, { path: ROOT_PATH, lane: 'root', depth: 0 });
  return { rootRunId, rootPath: ROOT_PATH, ...cfg };
}
/** Read a tree's bounds; falls back to DEFAULTS if meta is missing. */
export function treeConfig(rootRunId) {
  const m = readJsonOrNull(metaPath(rootRunId));
  return { ...DEFAULTS, ...(m || {}), rootRunId };
}
/** Append a spawn record. Use reserveSpawnSlots for budget-safe granting; this is the raw write. */
export function recordSpawn(rootRunId, { path: p, lane, depth }) {
  appendLine(manifestPath(rootRunId), { type: 'spawn', path: p, lane: lane ?? null, depth: depth ?? depthOf(p), ts: new Date().toISOString() });
}
/** Append a completion marker (EOT landed) — complements the canonical claim for orphan detection. */
export function recordComplete(rootRunId, p) {
  appendLine(manifestPath(rootRunId), { type: 'complete', path: p, ts: new Date().toISOString() });
}
/** Append a VOID marker — a reserved slot that never ran (cost-rejected / aborted). NOT an orphan: it is
 *  accounted-but-intentionally-not-started, so the barrier must not flag it as incomplete work. */
export function recordVoid(rootRunId, p, reason = null) {
  appendLine(manifestPath(rootRunId), { type: 'void', path: p, reason, ts: new Date().toISOString() });
}
/** Parse the manifest, skipping torn/empty lines (crash-safe). */
export function readManifest(rootRunId) {
  const file = manifestPath(rootRunId);
  if (!existsSync(file)) return [];
  const out = [];
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    const t = line.trim(); if (!t) continue;
    try { out.push(JSON.parse(t)); } catch { /* torn tail — skip */ }
  }
  return out;
}
/** Count of spawned nodes so far (root included). The node-budget meter. */
export function nodeCount(rootRunId) {
  return readManifest(rootRunId).filter((e) => e.type === 'spawn').length;
}

// ── ATOMIC BUDGET RESERVE (lease-serialized check+append → no sibling TOCTOU, §13 #5) ──────────────
/**
 * Grant up to childSpecs.length children, capped by remaining node budget, ATOMICALLY: a short budget
 * lease serializes the count→grant→append so two siblings can't both pass the check and overflow B.
 * Each granted spec is assigned a path (mintPath under parentPath) and written to the manifest.
 * Returns { granted:[{...spec, path, depth}], rejected:[...spec], used, budget }.
 */
export async function reserveSpawnSlots(rootRunId, childSpecs = [], spawnerId, { parentPath = ROOT_PATH, maxWaitMs = 5000 } = {}) {
  const cfg = treeConfig(rootRunId);
  const lease = await acquireOrWait(`treebudget:${rootRunId}`, spawnerId || `spawner-${process.pid}`, { maxWaitMs });
  if (!lease.ok) return { granted: [], rejected: childSpecs.slice(), used: nodeCount(rootRunId), budget: cfg.budget, reason: 'budget-lease-timeout' };
  try {
    const used = nodeCount(rootRunId);
    const remaining = Math.max(0, cfg.budget - used);
    const childDepth = depthOf(parentPath) + 1;
    // base index continues after this parent's existing direct children (manifest-derived, stable on retry)
    const existingKids = readManifest(rootRunId).filter((e) => e.type === 'spawn' && parentOf(e.path) === parentPath).length;
    const granted = [];
    const rejected = [];
    for (let i = 0; i < childSpecs.length; i += 1) {
      if (granted.length >= remaining) { rejected.push(childSpecs[i]); continue; }
      const childPath = mintPath(parentPath, existingKids + granted.length);
      const rec = { ...childSpecs[i], path: childPath, depth: childDepth };
      recordSpawn(rootRunId, { path: childPath, lane: childSpecs[i].lane, depth: childDepth });
      granted.push(rec);
    }
    return { granted, rejected, used: used + granted.length, budget: cfg.budget };
  } finally {
    releaseLease(`treebudget:${rootRunId}`, spawnerId || `spawner-${process.pid}`);
  }
}

// ── BARRIER SUPPORT (INV-1 enumeration + orphan detection) ────────────────────────────────────────
/** All LIVE descendant leases of `path` (any depth) — the barrier's "is my subtree still in flight?". */
export function inflightDescendants(rootRunId, p, now = Date.now()) {
  const prefix = `${inflightLeaseId(rootRunId, p)}.`; // strict descendants only
  return inspectLeases(now).filter((l) => l.alive && String(l.leaseId || '').startsWith(prefix));
}
/**
 * Direct children spawned-but-not-accounted: a spawn record exists, but NO completion marker AND no live
 * lease. Caller (the barrier) additionally checks for an EOT canonical claim before declaring an orphan —
 * a child that completed (claim written) but whose 'complete' marker append was lost is NOT an orphan.
 */
export function manifestOrphans(rootRunId, parentPath = ROOT_PATH, now = Date.now()) {
  const man = readManifest(rootRunId);
  const spawned = man.filter((e) => e.type === 'spawn' && parentOf(e.path) === parentPath).map((e) => e.path);
  // a 'complete' (EOT landed) OR a 'void' (reserved-but-never-ran) marker clears a path from orphan suspicion.
  const completed = new Set(man.filter((e) => e.type === 'complete' || e.type === 'void').map((e) => e.path));
  const liveLeaseIds = new Set(inspectLeases(now).filter((l) => l.alive).map((l) => String(l.leaseId || '')));
  return spawned.filter((p) => !completed.has(p) && !liveLeaseIds.has(inflightLeaseId(rootRunId, p)));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  process.stdout.write(`${JSON.stringify({ module: 'nano-tree', defaults: DEFAULTS, treesDir: TREES_DIR,
    sample: { rootPath: ROOT_PATH, child: mintPath('r.0', 2), depth: depthOf('r.0.2'), parent: parentOf('r.0.2'), fanoutAt0: fanoutAt(0), fanoutAt4: fanoutAt(4) } }, null, 2)}\n`);
}
