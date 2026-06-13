#!/usr/bin/env node
/**
 * YURI-owned Kagami event bus.
 *
 * This is the canonical append-only record for control-plane decisions. Claude
 * runtime files may mirror some events later, but they are not the source of
 * truth.
 */

import { randomUUID } from 'node:crypto';
import { appendFileSync, closeSync, existsSync, mkdirSync, openSync, readdirSync, readFileSync, renameSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import {
  KAGAMI_CANONICAL_STATE_ROOT,
  KAGAMI_CONTROL_DOMAIN_VERSION,
  KAGAMI_EVENT_KINDS,
  assertNoProtectedCanonicalState,
} from './kagami-control-domain.mjs';
import { isProtectedPath } from './lane-kernel.mjs';

export const KAGAMI_EVENT_BUS_FILE = 'events.jsonl';
export const KAGAMI_SESSION_INDEX_FILE = 'sessions.json';

export function resolveKagamiEventRoot(root = process.env.KAGAMI_CONTROL_STATE_ROOT || KAGAMI_CANONICAL_STATE_ROOT) {
  const value = String(root || '').trim() || KAGAMI_CANONICAL_STATE_ROOT;
  if (isProtectedPath(value)) {
    throw new Error(`Kagami event root cannot be protected: ${value}`);
  }
  assertNoProtectedCanonicalState([value]);
  return path.resolve(value);
}

export function kagamiEventFile(root) {
  return path.join(resolveKagamiEventRoot(root), KAGAMI_EVENT_BUS_FILE);
}

export function kagamiSessionIndexFile(root) {
  return path.join(resolveKagamiEventRoot(root), KAGAMI_SESSION_INDEX_FILE);
}

// ── Segmented log: rotation + bounded reads ────────────────────────────────────────────────────────
// The ACTIVE segment is events.jsonl — appends ALWAYS land here, unchanged. When it grows past a
// threshold the supervisor rotates it to a SEALED, immutable segment events.<seq>.jsonl. The source of
// truth for which segments exist is the DIRECTORY (readdir), never a read-modify-write manifest — so
// concurrent rotation can never corrupt the read set. events-index.json is a pure, REBUILDABLE
// optimization caching each sealed segment's ts-range so ancient segments can be skipped without being
// parsed. No sealed segments + no index = byte-identical to the original single-file behavior.
export const KAGAMI_SEGMENT_INDEX_FILE = 'events-index.json';
export const KAGAMI_ROTATE_BYTES = Number(process.env.KAGAMI_ROTATE_BYTES) || 4 * 1024 * 1024; // 4 MB
export const KAGAMI_ROTATE_LINES = Number(process.env.KAGAMI_ROTATE_LINES) || 5000;
const SEGMENT_RE = /^events\.(\d{6,})\.jsonl$/;

function segmentIndexFile(root) {
  return path.join(resolveKagamiEventRoot(root), KAGAMI_SEGMENT_INDEX_FILE);
}

function readSegmentIndex(root) {
  try {
    const parsed = JSON.parse(readFileSync(segmentIndexFile(root), 'utf8'));
    return parsed && typeof parsed === 'object' && parsed.segments && typeof parsed.segments === 'object'
      ? parsed.segments
      : {};
  } catch {
    return {}; // missing/partial index -> ranges are recomputed on demand; never block a read on it
  }
}

function writeSegmentIndex(root, segments) {
  const file = segmentIndexFile(root);
  const tmp = `${file}.tmp`;
  try {
    writeFileSync(tmp, `${JSON.stringify({ schemaVersion: 1, segments }, null, 2)}\n`);
    renameSync(tmp, file);
  } catch {
    // The index is a rebuildable optimization — a failed write degrades to full-segment scans, never breaks.
  }
}

// Sealed segment names in chronological (seq) order, then the active file last (it is the newest).
// Directory IS the truth; a sealed segment is immutable once renamed in.
function sealedSegmentNames(root) {
  const dir = resolveKagamiEventRoot(root);
  let names = [];
  try { names = readdirSync(dir).filter((n) => SEGMENT_RE.test(n)); } catch { names = []; }
  names.sort((a, b) => Number(a.match(SEGMENT_RE)[1]) - Number(b.match(SEGMENT_RE)[1]));
  return names;
}

function orderedSegmentNames(root) {
  return [...sealedSegmentNames(root), KAGAMI_EVENT_BUS_FILE];
}

// Snapshot-stable span read. A rotation between our directory listing and our parses would otherwise let
// a read MISS events that moved from the active file into a brand-new sealed segment absent from the
// stale listing — read∘rotate does not commute with rotate∘read. Guard: rebuild while the SEALED SET
// changed during the read. Sealed segments are immutable and only GROW in number, so an identical
// sealed-set before and after the parse proves no rotation interleaved and the span is consistent. Bounded
// retries (rotation is rare relative to reads); the final attempt returns best-effort rather than spinning.
function withStableSegments(root, build) {
  let last;
  // 8 attempts: under CONTINUOUS rotation a few attempts can each catch a fresh rotation. If even 8 can't
  // land a stable snapshot (pathological churn), we return best-effort — a transient per-read under-count,
  // never a permanent drop: every event stays on disk and the caller's PERSISTENT cursor re-reads it on the
  // next pass (the bus is eventually-consistent under concurrent rotation; permanent-drop = 0, proven by
  // the e2e cursor-continuity red-team). Reads are bounded by rotation, so retries stay cheap.
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const before = sealedSegmentNames(root);
    last = build([...before, KAGAMI_EVENT_BUS_FILE]);
    const after = sealedSegmentNames(root);
    if (before.length === after.length && before.every((n, i) => n === after[i])) return last;
  }
  return last;
}

function parseSegmentFile(root, name) {
  const file = path.join(resolveKagamiEventRoot(root), name);
  // Red-team I2b fix: read directly and swallow ENOENT -> []. existsSync + readFileSync can NEVER be made
  // atomic — when `name` is the active file, a concurrent rotation's renameSync lands in that window and
  // readFileSync throws ENOENT, which escaped the withStableSegments retry and CRASHED the reader. A
  // vanished active file simply means "no rows here this instant"; the stable-read retry then re-lists and
  // picks up the freshly-sealed segment. Parse errors (genuine corruption) still throw.
  let raw;
  try { raw = readFileSync(file, 'utf8'); }
  catch (err) { if (err && err.code === 'ENOENT') return []; throw err; }
  return raw
    .split('\n')
    .filter(Boolean)
    .map((line, index) => {
      try {
        return JSON.parse(line);
      } catch (err) {
        throw new Error(`Invalid Kagami event JSON in ${name} at line ${index + 1}: ${err.message}`);
      }
    });
}

// lastTs of a SEALED segment (immutable -> safely cacheable). The active file returns null (open-ended,
// so it is NEVER skipped). A cache miss recomputes from the file, so a missing index only costs a read.
function segmentLastTs(root, name, indexCache) {
  if (name === KAGAMI_EVENT_BUS_FILE) return null;
  const cached = indexCache[name];
  if (cached && typeof cached.lastTs === 'string') return cached.lastTs;
  const rows = parseSegmentFile(root, name);
  return rows.length ? rows[rows.length - 1].ts : null;
}

/**
 * Rotate the active events.jsonl into a sealed, immutable segment when it exceeds a byte/line threshold
 * (or `force`). The atomic renameSync of the active inode is the SERIALIZATION POINT: exactly one caller
 * can rename it; a racing rotator gets ENOENT and bails. Appends during/after the rename use flag 'a'
 * (create-if-missing) so they never clobber and are never lost — they land in either the sealed inode
 * (if opened pre-rename) or a freshly-recreated active file. The sealed file is re-read AFTER the rename
 * to compute its EXACT ts-range for the (best-effort) skip index.
 *
 * Rotation is normally driven by the SINGLETON supervisor (it holds a task:supervisor lease), which keeps
 * the segment index tidy and avoids wasted seq-reserved churn. But correctness no longer DEPENDS on that:
 * the destination name is reserved with an exclusive O_CREAT|O_EXCL create before the rename, so two
 * rotators that computed the same seq can't both seal onto the same name (renameSync REPLACES an existing
 * dest — without the reservation, the second silently destroyed the first's sealed segment).
 */
export function rotateEventLog(options = {}) {
  const root = resolveKagamiEventRoot(options.root);
  const active = path.join(root, KAGAMI_EVENT_BUS_FILE);
  if (!existsSync(active)) return { rotated: false, reason: 'no-active' };

  const maxBytes = Number(options.maxBytes ?? KAGAMI_ROTATE_BYTES);
  const maxLines = Number(options.maxLines ?? KAGAMI_ROTATE_LINES);
  let size = 0;
  try { size = statSync(active).size; } catch { return { rotated: false, reason: 'stat-failed' }; }
  // Cheap size gate first; only the line count needs a parse, and we need the rows for emptiness anyway.
  const preRows = parseSegmentFile(root, KAGAMI_EVENT_BUS_FILE);
  if (preRows.length === 0) return { rotated: false, reason: 'empty' };
  const overBytes = size >= maxBytes;
  const overLines = preRows.length >= maxLines;
  if (!options.force && !overBytes && !overLines) {
    return { rotated: false, reason: 'under-threshold', size, lines: preRows.length };
  }

  // next seq = (max existing sealed seq) + 1 — derived from the directory, the source of truth.
  let maxSeq = 0;
  try {
    for (const n of readdirSync(root)) {
      const m = n.match(SEGMENT_RE);
      if (m) maxSeq = Math.max(maxSeq, Number(m[1]));
    }
  } catch { /* fresh dir */ }
  const name = `events.${String(maxSeq + 1).padStart(6, '0')}.jsonl`;
  const dest = path.join(root, name);

  // Red-team I3 fix — reserve the destination NAME atomically BEFORE the rename. openSync(dest,'wx') is
  // O_CREAT|O_EXCL: exactly one rotator claims seq N; a racer that computed the same seq gets EEXIST and
  // bails (seq-reserved) instead of REPLACING the winner's sealed segment via renameSync (the ~45% silent
  // data loss the red-team proved under concurrent rotation).
  try { closeSync(openSync(dest, 'wx')); }
  catch (err) { return { rotated: false, reason: 'seq-reserved', error: err.code }; }
  // Atomically replace our reserved empty placeholder with the active inode's content.
  try { renameSync(active, dest); }
  catch (err) {
    try { unlinkSync(dest); } catch { /* reservation cleanup best-effort */ }
    return { rotated: false, reason: 'lost-race', error: err.code };
  }

  // The sealed segment is now immutable (nothing appends to a sealed name). Re-read it for the EXACT
  // range, so a late append that raced into the inode just before the rename is fully accounted for.
  const sealed = parseSegmentFile(root, name);
  const idx = readSegmentIndex(root);
  idx[name] = {
    firstTs: sealed[0]?.ts || null,
    lastTs: sealed.length ? sealed[sealed.length - 1].ts : null,
    count: sealed.length,
  };
  writeSegmentIndex(root, idx);
  // Deliberately do NOT recreate the active file — the next appendKagamiEvent recreates it via flag 'a',
  // leaving no clobber window.
  return { rotated: true, name, count: sealed.length, size };
}

/** Health/inventory of the segmented log: sealed segment count, active size/lines, total events. */
export function getKagamiLogSegments(options = {}) {
  const root = resolveKagamiEventRoot(options.root);
  const names = orderedSegmentNames(root);
  const idx = readSegmentIndex(root);
  const sealed = names.filter((n) => n !== KAGAMI_EVENT_BUS_FILE);
  let activeSize = 0;
  try { activeSize = statSync(path.join(root, KAGAMI_EVENT_BUS_FILE)).size; } catch { /* no active yet */ }
  return {
    root,
    sealedSegments: sealed.map((name) => ({ name, ...(idx[name] || {}) })),
    activeFile: KAGAMI_EVENT_BUS_FILE,
    activeSize,
  };
}

export function buildKagamiEvent(kind, payload = {}, options = {}) {
  if (!KAGAMI_EVENT_KINDS.includes(kind) && !options.allowUnknownKind) {
    throw new Error(`Unknown Kagami event kind: ${kind}`);
  }
  const evidenceRefs = payload.evidenceRefs || options.evidenceRefs || [];
  assertSafeEvidenceRefs(evidenceRefs);

  const event = compactObject({
    id: options.id || `evt_${randomUUID()}`,
    ts: options.ts || new Date().toISOString(),
    schemaVersion: KAGAMI_CONTROL_DOMAIN_VERSION,
    kind,
    signedBy: options.signedBy || payload.signedBy || 'kagami',
    session: payload.session || options.session,
    lane: payload.lane || options.lane,
    goalId: payload.goalId || options.goalId,
    parentId: payload.parentId || options.parentId,
    evidenceRefs,
    payload,
  });

  return event;
}

export function appendKagamiEvent(kind, payload = {}, options = {}) {
  const root = resolveKagamiEventRoot(options.root);
  mkdirSync(root, { recursive: true });
  const event = buildKagamiEvent(kind, payload, options);
  appendFileSync(path.join(root, KAGAMI_EVENT_BUS_FILE), `${JSON.stringify(event)}\n`);
  updateSessionIndex(root, event);
  return event;
}

export function readKagamiEvents(options = {}) {
  // Span sealed segments (oldest -> newest) then the active file, snapshot-stable against a concurrent
  // rotation. No sealed segments => just the active file, byte-identical to the original single-file read.
  const root = options.root;
  const rows = withStableSegments(root, (names) => {
    const out = [];
    for (const name of names) out.push(...parseSegmentFile(root, name));
    return out;
  });
  const limit = Number(options.limit || 0);
  return limit > 0 ? rows.slice(-limit) : rows;
}

// Read events AFTER a cursor, oldest-first — the per-nano self-refresh + swarm-board tail primitive.
// cursor = { afterId, afterTs, lane, kind, limit }. afterId gives an EXACT position (slice after that
// event); afterTs filters by ISO timestamp (lexicographic compare is chronological for ISO-8601).
// If afterId is given but not found (e.g. the log was rotated past it) we fall back to afterTs when
// present, else start from the beginning — fail-open to VISIBILITY; callers pass BOTH afterId+afterTs
// and dedup by id so a rotation can't silently drop or re-action events. `limit` here is FIRST-N
// after the cursor (chronological), the opposite of readKagamiEvents' last-N. Scale note: this still
// reads the whole file (see readKagamiEvents); an offset index + log rotation is the follow-up before
// the swarm grows past a handful of nanos.
export function readKagamiEventsSince(cursor = {}, options = {}) {
  const root = options.root;
  const { afterId, afterTs, lane, kind } = cursor;
  // SCALE: skip leading SEALED segments whose lastTs < afterTs (STRICT). Such a segment provably cannot
  // contain the cursor event (whose ts == afterTs) nor any event at/after it, so it is never parsed.
  // Strict `<` keeps any segment SHARING afterTs's millisecond in scope, so the same-ms positional-slice
  // semantics below are preserved exactly. The active file (lastTs null) is never skipped. This is the
  // O(events-after-cursor) win over the old whole-file read — without a fragile byte-offset index.
  const all = withStableSegments(root, (names) => {
    const indexCache = readSegmentIndex(root);
    let segStart = 0;
    if (afterTs) {
      while (segStart < names.length) {
        const lastTs = segmentLastTs(root, names[segStart], indexCache);
        if (lastTs && lastTs < afterTs) segStart += 1; else break;
      }
    }
    const rows = [];
    for (let i = segStart; i < names.length; i += 1) rows.push(...parseSegmentFile(root, names[i]));
    return rows;
  });
  let start = 0; let afterIdFound = false;
  if (afterId) {
    const idx = all.findIndex((e) => e && e.id === afterId);
    if (idx >= 0) { start = idx + 1; afterIdFound = true; } // exact position known
  }
  let rows = all.slice(start);
  // Red-team fix: afterTs is a FALLBACK narrowing for the ROTATION case only (afterId not found). When
  // afterId WAS found, the positional slice is authoritative + complete — applying a strict `> afterTs`
  // here would silently DROP a genuinely-new peer event sharing the cursor's millisecond (ISO ms is not
  // a reliable ordering key at append speed: ~88% same-ms collisions measured under burst).
  if (afterTs && !afterIdFound) rows = rows.filter((e) => e && typeof e.ts === 'string' && e.ts > afterTs);
  if (lane) rows = rows.filter((e) => e && e.lane === lane);
  if (kind) rows = rows.filter((e) => e && e.kind === kind);
  const lim = Number(cursor.limit || 0);
  return lim > 0 ? rows.slice(0, lim) : rows;
}

export function getKagamiEventBusHealth(options = {}) {
  const root = resolveKagamiEventRoot(options.root);
  const events = readKagamiEvents({ root });
  const sessionIndex = readSessionIndex(root);
  return {
    ok: true,
    root,
    eventsPath: kagamiEventFile(root),
    sessionsPath: kagamiSessionIndexFile(root),
    eventCount: events.length,
    sessionCount: Object.keys(sessionIndex.sessions || {}).length,
    lastEvent: events.at(-1) || null,
  };
}

export function appendRouteDecisionEvent(decision, extra = {}, options = {}) {
  return appendKagamiEvent(
    'ROUTE_DECISION_RECORDED',
    {
      source: extra.source || 'rick',
      decision,
      session: extra.session,
      lane: decision?.lane || '',
      blocked: Boolean(decision?.blocked),
      routeClass: decision?.class || '',
      reason: decision?.reason || '',
      mode: decision?.mode || '',
    },
    options,
  );
}

function assertSafeEvidenceRefs(evidenceRefs) {
  if (!Array.isArray(evidenceRefs)) {
    throw new Error('Kagami event evidenceRefs must be an array');
  }
  for (const ref of evidenceRefs) {
    if (isProtectedPath(ref)) {
      throw new Error(`Kagami event evidence ref cannot be protected: ${ref}`);
    }
  }
}

function readSessionIndex(root) {
  const file = kagamiSessionIndexFile(root);
  if (!existsSync(file)) {
    return { schemaVersion: 1, updatedAt: new Date().toISOString(), sessions: {} };
  }
  try {
    const parsed = JSON.parse(readFileSync(file, 'utf8'));
    if (parsed && typeof parsed === 'object' && parsed.sessions && typeof parsed.sessions === 'object') {
      return parsed;
    }
  } catch {
    // Runtime indexes are rebuildable. Keep appends moving instead of trusting a partial file.
  }
  return { schemaVersion: 1, updatedAt: new Date().toISOString(), sessions: {} };
}

function writeSessionIndex(root, index) {
  const file = kagamiSessionIndexFile(root);
  const tmp = `${file}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(index, null, 2)}\n`);
  renameSync(tmp, file);
}

function updateSessionIndex(root, event) {
  const session = event.session || event.sessionId;
  if (!session) return null;
  const index = readSessionIndex(root);
  const existing = index.sessions[session] || {
    session,
    firstSeenAt: event.ts,
    eventCount: 0,
  };
  index.sessions[session] = {
    ...existing,
    session,
    goalId: event.goalId || existing.goalId || null,
    lane: event.lane || existing.lane || null,
    lastEventId: event.id,
    lastKind: event.kind,
    lastSeenAt: event.ts,
    eventCount: Number(existing.eventCount || 0) + 1,
  };
  index.updatedAt = new Date().toISOString();
  writeSessionIndex(root, index);
  return index.sessions[session];
}

function compactObject(value) {
  return Object.fromEntries(
    Object.entries(value).filter(([, entry]) => entry !== undefined && entry !== null),
  );
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const events = readKagamiEvents({ limit: Number(process.argv[2] || 20) });
  console.log(JSON.stringify(events, null, 2));
}
