#!/usr/bin/env node
// @capability: memory-canonical-store
// @serves: canonical truth | one memory path all llms | converge memory | shared truth store | event-sourced memory | per-lane shard | drainer fold | peer-open memory read | concurrent memory write
// @does: the CANONICAL TRUTH convergence store (Mission v2). Every lane/session/agent appends immutable claim events to its OWN shard file (one writer per file -> zero cross-writer interleave, PIPE_BUF-irrelevant). A single elected drainer (nano-lease) folds shards into a GENERATION-ROTATED append-only canonical log + a materialized read-view, dedup by sha256 content-hash, idempotent re-fold. READ is peer-open (no wrapper); WRITE is shard-append by all, fold serialized for safety not authority.
// @use: appendClaim(lane,session,claim) to propose truth from any lane; drainOnce(drainerId) on a leased schedule to fold + rotate; readView()/loadCanonical() for open peer read. Reuses nano-lease (election+reclaim), _lib/fs atomicWriteFile (atomic publish), the memory-kernel append+fsync pattern, the yuri-nerve dedup-by-deterministic-id pattern (sha256, not FNV — scale).
// @exports: appendClaim, drainOnce, loadCanonical, readView, contentHashOf, mintEventId, shardPath, resolveDirs, listGenerations, MAX_EVENT_BYTES, DRAIN_LEASE_ID, compactGeneration, compactionScore, safeUnlinkSealedGens, keyOf
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
import { stalenessScore } from './filing-assessor.mjs';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

export const MAX_EVENT_BYTES = 4096;        // torn-write floor; one-writer-per-shard makes PIPE_BUF moot, this bounds skip-on-parse-fail recovery
export const DRAIN_LEASE_ID = 'drainer:canonical-truth';
const DRAIN_TTL_DEFAULT_MS = 30_000;
// Drain-lease TTL — env/opt-tunable (default 30s) so a deterministic multi-proc lease-loss test can force a tiny TTL.
function drainTtlMs(opts = {}) {
  return Number(opts.ttlMs || process.env.YURI_CANONICAL_DRAIN_TTL_MS) || DRAIN_TTL_DEFAULT_MS;
}
const SCHEMA_V = 1;
const ROTATION_DEFAULT_BYTES = 50 * 1024 * 1024;   // 50MB per generation; keeps each gen readFileSync-safe
const GEN_PREFIX = 'canonical.gen-';
const genName = (n) => `${GEN_PREFIX}${String(n).padStart(5, '0')}.jsonl`;
function rotationBytes(opts = {}) {
  return Number(opts.rotationBytes || process.env.YURI_CANONICAL_ROTATION_BYTES) || ROTATION_DEFAULT_BYTES;
}

// ── Compaction thresholds (Inc 3) ─────────────────────────────────────────────────────────────────
const COMPACT_DEAD_RATIO = 0.3;        // compact sealed gens when >30% of their events are dead (superseded/retracted)
const COMPACT_GEN_THRESHOLD = 5;       // …or when sealed-gen count exceeds this (bounds canonical read fan-out)
const SEAL_TTL_MS = 86_400_000;        // 24h grace before an ALL-DEAD sealed gen is eligible for unlink
const SEAL_STABLE_MS = 300_000;        // require mtime older than this (no recent writes) before unlink

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

// ── Compaction + safe-unlink (Inc 3) ──────────────────────────────────────────────────────────────
/**
 * LOG-SIZE compaction observability for one generation: stalenessScore(age) × deadRatio. A size/health
 * signal ONLY — it never decides truth and never retracts a decision. deadRatio = fraction of this gen's
 * events that are no longer live (superseded/retracted) per the current fold.
 */
export function compactionScore(genPath, opts = {}) {
  const base = opts.base || path.dirname(genPath);
  if (!existsSync(genPath)) return { score: 0, ageHours: 0, totalEvents: 0, deadEvents: 0, deadRatio: 0, genPath };
  const liveIds = liveEventIds(base);   // winners + contested-backing events (compaction must not drop the disagreement signal)
  let total = 0, dead = 0;
  for (const ln of readFileSync(genPath, 'utf8').split('\n')) {
    const t = ln.trim(); if (!t) continue;
    let e; try { e = JSON.parse(t); } catch { continue; }
    if (!e?.eventId) continue;                                    // SEAL sentinels don't count
    total += 1;
    if (!liveIds.has(e.eventId)) dead += 1;
  }
  const deadRatio = total > 0 ? dead / total : 0;
  const ageHours = Math.max(0, (Date.now() - statSync(genPath).mtimeMs) / 3_600_000);
  return { score: stalenessScore(ageHours, opts.halfLifeHours ?? 168) * deadRatio, ageHours, totalEvents: total, deadEvents: dead, deadRatio, genPath };
}

/**
 * Compact SEALED generations (never the live one): re-extract only events that are still live (in the
 * current fold) into gen-00001, then drop the now-redundant older sealed gens. Live events are RESCUED
 * into gen-00001 BEFORE any unlink, so no live claim is ever lost. Triggers when the sealed-gen dead
 * ratio exceeds compactDeadRatio OR the sealed-gen count exceeds compactGenThreshold. Idempotent.
 */
export function compactGeneration(base, canonicalLog, opts = {}) {
  const deadRatioTh = opts.compactDeadRatio ?? COMPACT_DEAD_RATIO;
  const genTh = opts.compactGenThreshold ?? COMPACT_GEN_THRESHOLD;
  let curLive; try { curLive = realpathSync(canonicalLog); } catch { return { compacted: false, reason: 'no-current-gen' }; }
  const curLiveName = path.basename(curLive);   // compare by NAME: realpathSync resolves /var->/private/var; listGenerations does not
  const sealed = listGenerations(base).filter((g) => path.basename(g) !== curLiveName);
  if (sealed.length === 0) return { compacted: false, reason: 'no-sealed-gens' };
  const liveIds = liveEventIds(base);   // winners + contested-backing events (compaction must not drop the disagreement signal)
  let total = 0, dead = 0; const live = []; const seenLive = new Set();
  for (const gen of sealed) {
    if (!existsSync(gen)) continue;
    for (const ln of readFileSync(gen, 'utf8').split('\n')) {
      const t = ln.trim(); if (!t) continue;
      let e; try { e = JSON.parse(t); } catch { continue; }
      if (!e?.eventId) continue;
      total += 1;
      if (liveIds.has(e.eventId)) { if (!seenLive.has(e.eventId)) { live.push(t); seenLive.add(e.eventId); } }
      else dead += 1;
    }
  }
  const dr = total > 0 ? dead / total : 0;
  if (dr < deadRatioTh && sealed.length <= genTh) return { compacted: false, deadRatio: dr, sealedGens: sealed.length };
  const dst = path.join(base, genName(1));
  atomicWriteFile(dst, live.map((l) => `${l}\n`).join(''), { fsync: true });    // rescue live events FIRST (atomic)
  const rm = [];
  for (const g of sealed) { if (g === dst) continue; try { rmSync(g, { force: true }); rm.push(g); } catch { /* best-effort */ } }
  return { compacted: true, liveEvents: live.length, deadEvents: dead, totalEvents: total, deadRatio: dr, gensRemoved: rm.length };
}

/**
 * Unlink SEALED generations that (a) hold ZERO live claims (their live contribution was already
 * consolidated elsewhere, e.g. by compactGeneration) AND (b) are older than sealTtlMs. The live-claims
 * guard is the real safety floor: a gen that still backs ANY live claim is NEVER unlinked, so truth is
 * never lost — the TTL is only a grace window on top. The current (symlinked) generation is always kept.
 */
export function safeUnlinkSealedGens(base, canonicalLog, opts = {}) {
  const ttl = opts.sealTtlMs ?? SEAL_TTL_MS;
  const stable = opts.sealStableMs ?? SEAL_STABLE_MS;
  const now = Date.now();
  let curLive; try { curLive = realpathSync(canonicalLog); } catch { return { unlinked: [], skipped: [], reason: 'no-current-gen' }; }
  const curLiveName = path.basename(curLive);   // compare by NAME: realpathSync resolves /var->/private/var; listGenerations does not
  const liveIds = liveEventIds(base);   // winners + contested-backing events (compaction must not drop the disagreement signal)
  const unlinked = [], skipped = [];
  for (const gen of listGenerations(base)) {
    if (path.basename(gen) === curLiveName) { skipped.push({ path: gen, reason: 'current-live' }); continue; }
    try {
      // PRIMARY GUARD: never unlink a gen that still backs a LIVE claim (would lose truth).
      let holdsLive = false;
      for (const ln of readFileSync(gen, 'utf8').split('\n')) {
        const t = ln.trim(); if (!t) continue;
        let e; try { e = JSON.parse(t); } catch { continue; }
        if (e?.eventId && liveIds.has(e.eventId)) { holdsLive = true; break; }
      }
      if (holdsLive) { skipped.push({ path: gen, reason: 'holds-live-claims' }); continue; }
      const ageMs = now - statSync(gen).mtimeMs;
      if (ageMs < ttl) { skipped.push({ path: gen, reason: 'age<ttl' }); continue; }
      if (ageMs < stable) { skipped.push({ path: gen, reason: 'mtime-unstable' }); continue; }
      rmSync(gen, { force: true }); unlinked.push(gen);
    } catch (e) { skipped.push({ path: gen, reason: e.message }); }
  }
  return { unlinked, skipped };
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
  const lease = acquireLease(DRAIN_LEASE_ID, drainerId, { ttlMs: drainTtlMs(opts) });
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
    if (!renewLease(DRAIN_LEASE_ID, drainerId, { ttlMs: drainTtlMs(opts) })) {
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
    // Inc 3: COMPACTION + SAFE-UNLINK — destructive structural ops on generation files, intentionally placed
    // AFTER the renewLease guard above (we hold a fresh lease) so a second drainer can never co-mutate gens.
    // Both non-fatal: a failure here never corrupts the canonical log/offsets already durably published above.
    let compacted = null;
    try { compacted = compactGeneration(base, canonicalLog, opts); } catch { /* non-fatal */ }
    let unlinked = null;
    try { unlinked = safeUnlinkSealedGens(base, canonicalLog, opts); } catch { /* non-fatal */ }
    return { ok: true, folded, skipped, shards: shards.length, claims: Object.keys(view.claims).length, rotated, compacted, unlinked };
  } finally {
    releaseLease(DRAIN_LEASE_ID, drainerId);
  }
}

export const keyOf = (e) => `${e.subject} ${e.predicate}`;   // NUL separator — collision-safe for spaces in subject/predicate

/** Fold ALL canonical generations into current state: dedup by eventId, supersede + retract resolution, last-write-wins per (subject,predicate). */
function foldCanonical(base) {
  const byKey = new Map();        // (subject|predicate) -> winning claim
  const byEvent = new Map();      // eventId -> claim (for supersede targeting)
  const contested = new Map();    // key -> Map(lane|objJSON -> {lane,object}) when >1 distinct active object competes
  const objsByKey = new Map();    // key -> PERSISTENT accumulator of competing (lane,object) — survives across events
  const seenEvents = new Set();
  const supersededIds = new Set();  // eventIds known superseded — order-independent dead-marking (compaction-safe)
  // refresh the contested flag for key k from its persistent accumulator (flag only when >1 distinct object remains)
  const refreshContested = (k) => {
    const m = objsByKey.get(k);
    const distinct = m ? new Set([...m.values()].map((v) => JSON.stringify(v.object))) : new Set();
    if (distinct.size > 1) contested.set(k, m); else contested.delete(k);
  };
  for (const gen of listGenerations(base)) {                 // oldest -> newest = causal (append) order
    let raw;
    // ENOENT-tolerant read: a PEER-OPEN live re-fold (loadCanonical) runs with NO lease, so a concurrent
    // LEASED compaction can rmSync an old sealed gen between listGenerations() and this read. compaction
    // rescues every live event into gen-00001 BEFORE unlinking, so a vanished gen never holds an un-rescued
    // live claim — skipping it keeps the peer read crash-free (at worst a transient undercount THIS pass,
    // never a lost claim; readView() is the atomic, fully-consistent peer surface).
    try { raw = readFileSync(gen, 'utf8'); } catch (err) { if (err.code === 'ENOENT') continue; throw err; }
    for (const ln of raw.split('\n')) {
      const t = ln.trim(); if (!t) continue;
      let e; try { e = JSON.parse(t); } catch { continue; }
      if (!e || !e.eventId || seenEvents.has(e.eventId)) continue;   // SEAL sentinels (no eventId) skipped here too
      seenEvents.add(e.eventId);
      // Order-INDEPENDENT supersede: a superseding event marks its target dead whether the target was already
      // folded (delete from byKey now) OR arrives later (the supersededIds guard skips it below). Keeps
      // last-write-wins correct under arbitrary shard read-order AND after compaction has dropped a superseded
      // event from canonical while its shard could still re-emit it on offset-loss recovery.
      if (e.supersedes) {
        supersededIds.add(e.supersedes);
        const old = byEvent.get(e.supersedes);
        if (old) {
          const ok = keyOf(old);
          if (byKey.get(ok)?.eventId === old.eventId) byKey.delete(ok);
          // a cleanly superseded object is RESOLUTION, not conflict -> drop it from the competing set
          const om = objsByKey.get(ok);
          if (om) { om.delete(`${old.provenance?.lane}|${JSON.stringify(old.object)}`); refreshContested(ok); }
        }
      }
      const k = keyOf(e);
      byEvent.set(e.eventId, e);
      if (e.kind === 'retract') { byKey.delete(k); objsByKey.delete(k); contested.delete(k); continue; }
      if (supersededIds.has(e.eventId)) continue;                    // this event was superseded by another — never active
      byKey.set(k, e);
      // contested tracking: accumulate distinct active objects per key in a PERSISTENT map (a momentary single object
      // must NOT discard the accumulator — else two lanes' conflicting asserts never co-exist long enough to be flagged),
      // then refresh the flag from it.
      const m = objsByKey.get(k) || new Map();
      m.set(`${e.provenance?.lane}|${JSON.stringify(e.object)}`, { lane: e.provenance?.lane, object: e.object, eventId: e.eventId });
      objsByKey.set(k, m);
      refreshContested(k);
    }
  }
  return { byKey, contested };
}

/**
 * Event IDs that compaction/unlink must PRESERVE: the current per-key winners (byKey) PLUS every event backing a
 * CONTESTED key. Without the contested-backing events, compaction (which keeps only winners) drops the losing
 * object and the "lanes disagree" signal silently clears on the next re-fold (Mimo Inc-8 finding, 2026-06-14).
 */
function liveEventIds(base) {
  const { byKey, contested } = foldCanonical(base);
  const ids = new Set([...byKey.values()].map((e) => e.eventId));
  for (const m of contested.values()) for (const v of m.values()) if (v.eventId) ids.add(v.eventId);
  return ids;
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
