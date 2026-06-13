#!/usr/bin/env node
/**
 * YURI-owned Kagami event bus.
 *
 * This is the canonical append-only record for control-plane decisions. Claude
 * runtime files may mirror some events later, but they are not the source of
 * truth.
 */

import { randomUUID } from 'node:crypto';
import { appendFileSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
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
  const file = kagamiEventFile(options.root);
  if (!existsSync(file)) return [];
  const rows = readFileSync(file, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((line, index) => {
      try {
        return JSON.parse(line);
      } catch (err) {
        throw new Error(`Invalid Kagami event JSON at line ${index + 1}: ${err.message}`);
      }
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
  const all = readKagamiEvents({ root: options.root });
  const { afterId, afterTs, lane, kind } = cursor;
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
