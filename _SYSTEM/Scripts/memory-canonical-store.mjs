#!/usr/bin/env node
// @capability: memory-canonical-store
// @serves: canonical truth | one memory path all llms | converge memory | shared truth store | event-sourced memory | per-lane shard | drainer fold | peer-open memory read | concurrent memory write
// @does: the CANONICAL TRUTH convergence store (Mission v2). Every lane/session/agent appends immutable claim events to its OWN shard file (one writer per file -> zero cross-writer interleave, PIPE_BUF-irrelevant). A single elected drainer (nano-lease) folds shards into a GENERATION-ROTATED append-only canonical log + a materialized read-view, dedup by sha256 content-hash, idempotent re-fold. READ is peer-open (no wrapper); WRITE is shard-append by all, fold serialized for safety not authority.
// @use: appendClaim(lane,session,claim) to propose truth from any lane; drainOnce(drainerId) on a leased schedule to fold + rotate; readView()/loadCanonical() for open peer read. Reuses nano-lease (election+reclaim), _lib/fs atomicWriteFile (atomic publish), the memory-kernel append+fsync pattern, the yuri-nerve dedup-by-deterministic-id pattern (sha256, not FNV — scale).
// @exports: appendClaim, drainOnce, loadCanonical, readView, contentHashOf, mintEventId, shardPath, resolveDirs, listGenerations, MAX_EVENT_BYTES, DRAIN_LEASE_ID
//
// DESIGN PROVENANCE: 02_RESOURCES/RESEARCH/memory-architecture-evolution-2026-06-14/ (00..04). P0/P1 = shards
// + drainer + dedup. P2 Inc-2 = GENERATION ROTATION (glm-5.1 design, cross-verified by nemotron + DeepSeek
// fault #9 + [[feedback-posix-fs-concurrency-floor]]): NEVER rename a live log (orphans a writer's fd ->
// silent loss). Instead: `canonical.jsonl` is a SYMLINK -> `canonical.gen-NNNNN.jsonl`; the drainer appends
// to realpath(symlink); on size>threshold it SEALs the current gen (a no-eventId sentinel) + creates gen+1 +
// atomically swaps the symlink. Reads iterate ALL generations (each bounded by the rotation size, so a plain
// readFileSync per gen stays memory-safe). Crash-recovery stays idempotent: dedup seed = eventIds across all
// gens; offsets written LAST after canonical + read-view are durably published.

import {
  openSync, appendFileSync, fsyncSync, closeSync, mkdirSync,
  readFileSync, readdirSync, existsSync,
  realpathSync, symlinkSync, renameSync, rmSync, statSync,
} from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { acquireLease, releaseLease, renewLease } from './nano-lease.mjs';
import { atomicWriteFile, readJsonOrNull } from './_lib/fs.mjs';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

export const MAX_EVENT_BYTES = 4096;        // torn-write floor; one-writer-per-shard makes PIPE_BUF moot, this bounds skip-on-parse-fail recovery
export const DRAIN_LEASE_ID = 'drainer:canonical-truth';
const DRAIN_TTL_MS = 30_000;
const SCHEMA_V = 1;
const ROTATION_DEFAULT_BYTES = 50 * 1024 * 1024;   // 50MB per generation; keeps each gen readFileSync-safe
const GEN_PREFIX = 'canonical.gen-';
const genName = (n) => `${GEN_PREFIX}${String(n).padStart(5, '0')}.jsonl`;
function rotationBytes(opts = {}) {
  return Number(opts.rotationBytes || process.env.YURI_CANONICAL_ROTATION_BYTES) || ROTATION_DEFAULT_BYTES;
}

/** All canonical paths derive from ONE base dir (env-overridable -> tests run in a temp dir, live store untouched). */
export function resolveDirs(opts = {}) {
  const base = path.resolve(opts.dir || process.env.YURI_CANONICAL_DIR || path.join(REPO_ROOT, '_SYSTEM/state/memory-canonical'));
  return {
    base,
    shardsDir: path.join(base, 'shards'),
    canonicalLog: path.join(base, 'canonical.jsonl'),   // SYMLINK -> current generation
    readViewPath: path.join(base, 'read-view.json'),
    offsetsPath: path.join(base, 'drainer-offsets.json'),
  };
}

// filesystem-safe, traversal-proof segment (lane/session ids land in a filename)
function sanitizeSeg(s) {
  const out = String(s).replace(/[^A-Za-z0-9._-]/g, '-');
  if (!out || out === '.' || out === '..') throw new Error(`invalid id segment: ${JSON.stringify(s)}`);
  return out;
}

/** Canonical content hash: sha256 over the claim's identity tuple. Same fact from two lanes -> same hash -> dedup. */
export function contentHashOf(claim = {}) {
  const canon = JSON.stringify([claim.kind || 'assert', claim.subject ?? '', claim.predicate ?? '', claim.object ?? null]);
  return crypto.createHash('sha256').update(canon).digest('hex');
}

/** eventId IS the content hash (dedup identity). Two identical claims collapse to one event. */
export function mintEventId(claim = {}) {
  return `evt.${claim.kind || 'assert'}.${contentHashOf(claim)}`;
}

export function shardPath(laneId, sessionId, opts = {}) {
  const { shardsDir } = resolveDirs(opts);
  return path.join(shardsDir, `${sanitizeSeg(laneId)}--${sanitizeSeg(sessionId)}.jsonl`);
}

// memory-kernel.appendLineDurable pattern (internal there; replicated to avoid editing a shared file).
function appendDurable(logPath, line) {
  mkdirSync(path.dirname(logPath), { recursive: true });
  const fd = openSync(logPath, 'a');
  try { appendFileSync(fd, line); fsyncSync(fd); } finally { closeSync(fd); }
}

// ── Generation rotation (Inc 2) ──────────────────────────────────────────────────────────────────
/** All generation files (oldest -> newest) as absolute paths. */
export function listGenerations(base) {
  if (!existsSync(base)) return [];
  return readdirSync(base)
    .filter((n) => n.startsWith(GEN_PREFIX) && n.endsWith('.jsonl'))
    .sort()                                          // zero-padded names sort chronologically
    .map((n) => path.join(base, n));
}

/** Atomically point `linkPath` at `targetName` (relative): temp symlink + rename = atomic replace. */
function swapSymlink(base, linkPath, targetName) {
  const tmp = path.join(base, `.current.${process.pid}.${crypto.randomBytes(3).toString('hex')}.lnk`);
  try { rmSync(tmp, { force: true }); } catch { /* */ }
  symlinkSync(targetName, tmp);
  renameSync(tmp, linkPath);                         // replaces the (possibly existing) symlink atomically
}

/** Resolve (and lazily init/repair) the current writable generation via the canonical.jsonl symlink. */
function currentGen(base, canonicalLog) {
  mkdirSync(base, { recursive: true });
  try { return realpathSync(canonicalLog); } catch { /* missing or dangling symlink -> init/repair below */ }
  const gens = listGenerations(base);
  const targetName = gens.length ? path.basename(gens[gens.length - 1]) : genName(1);
  const targetAbs = path.join(base, targetName);
  if (!existsSync(targetAbs)) closeSync(openSync(targetAbs, 'a'));
  swapSymlink(base, canonicalLog, targetName);
  return targetAbs;
}

const genNumber = (absPath) => {
  const m = path.basename(absPath).match(/canonical\.gen-(\d+)\.jsonl$/);
  return m ? parseInt(m[1], 10) : 1;
};

/** Seal current gen (no-eventId sentinel — fold skips it), create the next gen, atomically swap the symlink. */
function sealAndRotate(base, canonicalLog) {
  const cur = currentGen(base, canonicalLog);
  const n = genNumber(cur);
  const nextName = genName(n + 1);
  const nextAbs = path.join(base, nextName);
  appendDurable(cur, `${JSON.stringify({ seal: true, gen: n, next: n + 1 })}\n`);   // no eventId -> skipped by fold/dedup
  if (!existsSync(nextAbs)) closeSync(openSync(nextAbs, 'a'));
  swapSymlink(base, canonicalLog, nextName);
  return { sealed: n, current: n + 1 };
}

/**
 * Any lane/session/agent appends an immutable claim event to ITS OWN shard. No lock, no shared file.
 * claim: { kind?, subject, predicate, object?, supersedes?, vc?, memory_type?, domain?, tier?, lifecycle?, agent?, stamp? }
 * Returns { ok, eventId, bytes } or { ok:false, reason }.
 */
export function appendClaim(laneId, sessionId, claim = {}, opts = {}) {
  if (!laneId || !sessionId) return { ok: false, reason: 'laneId and sessionId required' };
  if (claim.subject == null || claim.predicate == null) return { ok: false, reason: 'claim.subject and claim.predicate required' };
  const eventId = mintEventId(claim);
  const envelope = {
    v: SCHEMA_V,
    eventId,
    kind: claim.kind || 'assert',
    subject: claim.subject,
    predicate: claim.predicate,
    object: claim.object ?? null,
    contentHash: contentHashOf(claim),
    supersedes: claim.supersedes || null,
    provenance: { lane: String(laneId), session: String(sessionId), agent: claim.agent || null },
    vc: claim.vc || null,                       // vector clock (causal order); wall-clock is NEVER the order key
    memory_type: claim.memory_type || null,
    domain: claim.domain || null,
    tier: claim.tier || null,
    lifecycle: claim.lifecycle || null,
    stamp: claim.stamp || null,                 // caller-supplied; ordering uses append-offset + vc, not this
  };
  const line = `${JSON.stringify(envelope)}\n`;
  const bytes = Buffer.byteLength(line, 'utf8');
  if (bytes > MAX_EVENT_BYTES) return { ok: false, reason: 'event-too-large', bytes, cap: MAX_EVENT_BYTES };
  appendDurable(shardPath(laneId, sessionId, opts), line);
  return { ok: true, eventId, bytes };
}

/**
 * Read JSONL from a byte offset. Consumes only COMPLETE lines (ending in \n); a torn trailing line is left
 * for the next read (newOffset stays before it). Malformed lines are skipped WITH a stderr warning.
 */
function readFromOffset(filePath, fromOffset) {
  if (!existsSync(filePath)) return { events: [], newOffset: fromOffset };
  const buf = readFileSync(filePath);
  if (fromOffset >= buf.length) return { events: [], newOffset: buf.length };
  const text = buf.subarray(fromOffset).toString('utf8');
  const lastNl = text.lastIndexOf('\n');
  if (lastNl < 0) return { events: [], newOffset: fromOffset };       // no complete line yet
  const complete = text.slice(0, lastNl + 1);
  const consumed = Buffer.byteLength(complete, 'utf8');
  const events = [];
  for (const ln of complete.split('\n')) {
    const t = ln.trim();
    if (!t) continue;
    try { events.push(JSON.parse(t)); }
    catch { process.stderr.write(`[memory-canonical-store] skipped malformed line in ${path.basename(filePath)}\n`); }
  }
  return { events, newOffset: fromOffset + consumed };
}

/** Set of eventIds present across ALL canonical generations — the idempotency seed for crash-safe re-fold. */
function canonicalEventIds(base) {
  const ids = new Set();
  for (const gen of listGenerations(base)) {
    if (!existsSync(gen)) continue;
    for (const ln of readFileSync(gen, 'utf8').split('\n')) {
      const t = ln.trim(); if (!t) continue;
      try { const e = JSON.parse(t); if (e && e.eventId) ids.add(e.eventId); } catch { /* skip */ }
    }
  }
  return ids;
}

/**
 * Elect via nano-lease, fold all shards into the current canonical generation (dedup by eventId, idempotent),
 * rebuild the read-view, checkpoint offsets LAST, then rotate if the current gen exceeds the size threshold.
 * Returns { ok, folded, skipped, shards, claims, rotated } or { ok:false, heldBy }.
 */
export function drainOnce(drainerId, opts = {}) {
  if (!drainerId) return { ok: false, reason: 'drainerId required' };
  const { base, shardsDir, canonicalLog, readViewPath, offsetsPath } = resolveDirs(opts);
  const lease = acquireLease(DRAIN_LEASE_ID, drainerId, { ttlMs: DRAIN_TTL_MS });
  if (!lease.ok) return { ok: false, heldBy: lease.heldBy, reason: 'drainer-held' };
  try {
    const seen = canonicalEventIds(base);                     // idempotency seed (all generations)
    const offsets = readJsonOrNull(offsetsPath) || {};
    const curGen = currentGen(base, canonicalLog);            // drainer is the sole canonical writer (holds lease)
    let folded = 0, skipped = 0;
    const shards = existsSync(shardsDir)
      ? readdirSync(shardsDir).filter((n) => n.endsWith('.jsonl'))
      : [];
    const nextOffsets = { ...offsets };
    for (const shard of shards) {
      const { events, newOffset } = readFromOffset(path.join(shardsDir, shard), offsets[shard] || 0);
      for (const ev of events) {
        if (!ev || !ev.eventId) { skipped += 1; continue; }
        if (seen.has(ev.eventId)) { skipped += 1; continue; }   // dedup + idempotent re-fold
        appendDurable(curGen, `${JSON.stringify(ev)}\n`);       // each event fsync'd before offset advances
        seen.add(ev.eventId);
        folded += 1;
      }
      nextOffsets[shard] = newOffset;
    }
    // LEASE-LOSS GUARD (DeepSeek attack #3): if our lease expired mid-fold and a 2nd drainer reclaimed it,
    // DO NOT publish offsets or rotate — that would regress incremental progress (stale offsets overwrite
    // the live drainer's fresher ones) + churn generations. Our appended canonical events are already
    // durable and the live drainer incorporates them via the dedup seed. A successful renew also resets
    // renewedAt, so the remaining (synchronous, no-await) publish+rotate completes inside a fresh TTL.
    if (!renewLease(DRAIN_LEASE_ID, drainerId, { ttlMs: DRAIN_TTL_MS })) {
      return { ok: false, reason: 'lease-lost-mid-drain', folded, skipped };
    }
    // Rebuild + publish read-view (atomic temp+rename), THEN checkpoint offsets LAST (durability ordering:
    // offsets never point past data that isn't already durable in canonical).
    const view = buildReadView(base, opts.stamp);
    atomicWriteFile(readViewPath, `${JSON.stringify(view, null, 2)}\n`, { fsync: true });
    atomicWriteFile(offsetsPath, `${JSON.stringify(nextOffsets, null, 2)}\n`, { fsync: true });
    // Rotation AFTER durable publish: if the current gen outgrew the threshold, seal it + open the next.
    let rotated = null;
    try { if (statSync(curGen).size > rotationBytes(opts)) rotated = sealAndRotate(base, canonicalLog); } catch { /* */ }
    return { ok: true, folded, skipped, shards: shards.length, claims: Object.keys(view.claims).length, rotated };
  } finally {
    releaseLease(DRAIN_LEASE_ID, drainerId);
  }
}

const keyOf = (e) => `${e.subject} ${e.predicate}`;   // NUL separator — collision-safe for spaces in subject/predicate

/** Fold ALL canonical generations into current state: dedup by eventId, supersede + retract resolution, last-write-wins per (subject,predicate). */
function foldCanonical(base) {
  const byKey = new Map();        // (subject|predicate) -> winning claim
  const byEvent = new Map();      // eventId -> claim (for supersede targeting)
  const contested = new Map();    // key -> Map(lane -> object) when >1 distinct active object
  const seenEvents = new Set();
  for (const gen of listGenerations(base)) {                 // oldest -> newest = causal (append) order
    if (!existsSync(gen)) continue;
    for (const ln of readFileSync(gen, 'utf8').split('\n')) {
      const t = ln.trim(); if (!t) continue;
      let e; try { e = JSON.parse(t); } catch { continue; }
      if (!e || !e.eventId || seenEvents.has(e.eventId)) continue;   // SEAL sentinels (no eventId) skipped here too
      seenEvents.add(e.eventId);
      if (e.supersedes && byEvent.has(e.supersedes)) {
        const old = byEvent.get(e.supersedes);
        if (old && byKey.get(keyOf(old))?.eventId === old.eventId) byKey.delete(keyOf(old));
      }
      const k = keyOf(e);
      if (e.kind === 'retract') { byKey.delete(k); contested.delete(k); byEvent.set(e.eventId, e); continue; }
      byKey.set(k, e);
      byEvent.set(e.eventId, e);
      // contested tracking: distinct active objects for the same key from (any) lane
      const seenObjs = contested.get(k) || new Map();
      seenObjs.set(`${e.provenance?.lane}|${JSON.stringify(e.object)}`, { lane: e.provenance?.lane, object: e.object });
      const distinctObjs = new Set([...seenObjs.values()].map((v) => JSON.stringify(v.object)));
      if (distinctObjs.size > 1) contested.set(k, seenObjs); else contested.delete(k);
    }
  }
  return { byKey, contested };
}

function buildReadView(base, stamp) {
  const { byKey, contested } = foldCanonical(base);
  const claims = {};
  for (const [k, e] of byKey) {
    claims[k] = {
      subject: e.subject, predicate: e.predicate, object: e.object,
      eventId: e.eventId, kind: e.kind, provenance: e.provenance,
      memory_type: e.memory_type, domain: e.domain, tier: e.tier, lifecycle: e.lifecycle,
      status: 'active',
    };
  }
  const contestedOut = {};
  for (const [k, m] of contested) contestedOut[k] = { competing: [...m.values()] };
  return { v: SCHEMA_V, foldedAt: stamp || new Date().toISOString(), claimCount: Object.keys(claims).length, claims, contested: contestedOut };
}

/** Open peer read: current canonical claim set (dedup + supersede resolved, across all generations). No wrapper, no lease. */
export function loadCanonical(opts = {}) {
  const { base } = resolveDirs(opts);
  const { byKey } = foldCanonical(base);
  const all = [...byKey.values()];
  // filing-lane claims are ADVISORY (transition-only placement history) — excluded by default; opt in to surface.
  return opts.includeAdvisory ? all : all.filter((c) => c.provenance?.lane !== 'filing');
}

/** Open peer read: the materialized read-view ({ claims, contested, foldedAt }). Falls back to empty. */
export function readView(opts = {}) {
  const { readViewPath } = resolveDirs(opts);
  return readJsonOrNull(readViewPath) || { v: SCHEMA_V, foldedAt: null, claimCount: 0, claims: {}, contested: {} };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [cmd, a, b] = process.argv.slice(2);
  if (cmd === 'drain') console.log(JSON.stringify(drainOnce(a || `cli-${process.pid}`), null, 2));
  else if (cmd === 'view') console.log(JSON.stringify(readView(), null, 2));
  else if (cmd === 'append') console.log(JSON.stringify(appendClaim(a || 'cli', `s-${process.pid}`, JSON.parse(b || '{}')), null, 2));
  else if (cmd === 'gens') console.log(JSON.stringify(listGenerations(resolveDirs().base), null, 2));
  else process.stdout.write('usage: memory-canonical-store.mjs [drain <id>|view|append <lane> <json>|gens]\n');
}
