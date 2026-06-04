#!/usr/bin/env node
/**
 * YURI Energy Sanitizer — yuri-energy-sanitize.mjs
 *
 * Layer 7 (Retroactive Evaluation Privacy Gate) implementation. The ONLY
 * allowed bridge from raw `_SYSTEM/state/` events into experiment runners.
 * See `_SYSTEM/reports/energy-landscape-paper-2026-07/01-sandbox-simulation-architecture.md`
 * §2 Layer 7 for the authoritative three-zone spec.
 *
 * THREE-ZONE DISCIPLINE
 *   1. Raw zone     — `_SYSTEM/state/` itself. Operator-private. NEVER consumed
 *                     directly by experiments. This module deliberately does NOT
 *                     read any file; it operates on in-memory raw-event objects
 *                     passed as arguments. Reading real state files is out of
 *                     scope for this build by design.
 *   2. Sanitized    — `sanitizeStateEvent(rawEvent)`. Allow-list projection that
 *                     keeps ONLY schema-permitted numeric/structural fields plus
 *                     the gate-allowed string fields (timestamp, lane). Every
 *                     produced record is re-checked through the Privacy Gate v3
 *                     validator (`validateRecord`) before return; a failure
 *                     throws as a canary.
 *   3. Public       — `toPublicZone(sanitizedRecord)`. Second pass for published
 *                     reproducibility artifacts: lanes → generic labels,
 *                     timestamps → relative offset, large counts → buckets.
 *
 * ALLOW-LIST, NOT DENY-LIST
 *   Only explicitly allowed fields survive. Everything else is dropped. We never
 *   try to enumerate the forbidden set (memory bodies, prompt text, transcripts,
 *   protected-path content, raw identifiers, credentials, evidence excerpts,
 *   free text). The projection simply does not copy anything it does not
 *   recognize. New raw fields are dropped by default — fail-closed.
 *
 * STRING-FIELD CONSTRAINT (composition with Privacy Gate v3)
 *   The Privacy Gate v3 (`validateRecord` in yuri-energy-trace.mjs) permits
 *   string-typed leaf values ONLY at a fixed structural allow-list of root
 *   paths: timestamp, runId, lane, decision, dominantTerm. Arbitrary strings at
 *   any other path are rejected. We do NOT modify that allow-list — we compose
 *   with it.
 *
 *   Consequence: the sanitized record's only string leaves are `timestamp` and
 *   `lane` (both gate-allowed). `eventType` — which the spec describes as an
 *   "enum string" — is emitted as a numeric `eventTypeCode` (gate-safe) plus a
 *   small exported enum table so callers can round-trip the label WITHOUT a free
 *   string ever landing in a serialized record. This is strictly stronger than
 *   the spec's wording: a numeric enum code cannot smuggle free text.
 *
 * Status: fixture_ready. Operates on synthetic in-memory raw events only.
 *
 * Related:
 *   - _SYSTEM/Scripts/math/yuri-energy-trace.mjs  (Privacy Gate v3 — reused here)
 *   - _SYSTEM/reports/energy-landscape-paper-2026-07/01-sandbox-simulation-architecture.md
 */

import { validateRecord } from './yuri-energy-trace.mjs';

// ---------------------------------------------------------------------------
// Canonical enums and constants
// ---------------------------------------------------------------------------

/**
 * Canonical lane names. Any lane value not on this list is replaced with the
 * sentinel UNKNOWN_LANE rather than passed through — a raw lane-instance id
 * (e.g. "claude-pty-7f3a", "/Users/marcelspatz/...") must never survive as a
 * canonical name.
 */
export const CANONICAL_LANES = Object.freeze([
  'main',
  'claude',
  'codex',
  'deepseek',
  'shintai',
  'quantum',
  'prime',
  'kagami',
  'nvidia',
]);

const CANONICAL_LANE_SET = new Set(CANONICAL_LANES);
const UNKNOWN_LANE = 'unknown-lane';

/**
 * Event-type enum. The string label NEVER lands in a serialized record (the
 * Privacy Gate forbids free strings at non-allow-listed paths). Records carry
 * the numeric `eventTypeCode`; callers map back via EVENT_TYPE / eventTypeLabel.
 */
export const EVENT_TYPE = Object.freeze({
  UNKNOWN: 0,
  CLAIM_PROMOTION: 1,
  GATE_EVALUATION: 2,
  EVIDENCE_UPDATE: 3,
  PROTECTED_PATH_VIOLATION: 4,
  PROMOTION_LADDER_TRANSITION: 5,
  DISPATCH: 6,
});

const EVENT_TYPE_CODES = new Set(Object.values(EVENT_TYPE));
const EVENT_TYPE_LABEL_BY_CODE = Object.freeze(
  Object.fromEntries(Object.entries(EVENT_TYPE).map(([label, code]) => [code, label])),
);

/** Map a raw event-type input (string label or numeric code) to a known code. */
function normalizeEventTypeCode(raw) {
  if (typeof raw === 'number' && EVENT_TYPE_CODES.has(raw)) return raw;
  if (typeof raw === 'string') {
    const upper = raw.trim().toUpperCase();
    if (Object.hasOwn(EVENT_TYPE, upper)) return EVENT_TYPE[upper];
  }
  return EVENT_TYPE.UNKNOWN;
}

/** Reverse lookup: numeric code → canonical label. */
export function eventTypeLabel(code) {
  return EVENT_TYPE_LABEL_BY_CODE[code] ?? 'UNKNOWN';
}

/**
 * Canonical promotion-ladder transition labels. Counts are keyed by these and
 * nothing else — an arbitrary key (which could leak a claim body) is dropped.
 *
 * Must stay equal to yuri-energy-trace.CANONICAL_PROMOTION_LABELS, which in turn
 * must equal the cortex LADDER (claim-cortex.LADDER). operator_validated was ADDED
 * 2026-06-04 (ENG-08): it is a live LADDER rung that was omitted here AND in trace,
 * so both sets drifted from the actual ladder together — the old drift test only
 * checked trace==sanitize, so it stayed green while both silently dropped
 * operator_validated mass. 'deprecated' stays OUT (SINK, not a distribution rung).
 */
export const PROMOTION_LADDER_LABELS = Object.freeze([
  'draft',
  'research',
  'fixture_ready',
  'runtime_tested',
  'operator_validated',
  'trusted',
]);

const PROMOTION_LADDER_LABEL_SET = new Set(PROMOTION_LADDER_LABELS);

// Public-zone bucketing threshold. Counts strictly above this are reported as a
// bucket range string-free representation (numeric lower/upper bounds).
const PUBLIC_COUNT_BUCKET_THRESHOLD = 10;
const PUBLIC_BUCKET_WIDTH = 10;

// Reference epoch for relative-offset normalization when no reference supplied.
const PUBLIC_REFERENCE_EPOCH = '1970-01-01T00:00:00.000Z';

// ---------------------------------------------------------------------------
// Numeric coercion helpers — fail-closed to 0 / dropped on any anomaly.
// ---------------------------------------------------------------------------

/** Non-negative finite integer count, or 0. Rejects strings, NaN, Infinity. */
function safeCount(value) {
  if (typeof value !== 'number') return 0;
  if (!Number.isFinite(value)) return 0;
  if (value < 0) return 0;
  return Math.trunc(value);
}

/** Non-negative finite number (ages can be fractional days), or 0. */
function safeNonNegativeNumber(value) {
  if (typeof value !== 'number') return 0;
  if (!Number.isFinite(value)) return 0;
  if (value < 0) return 0;
  // Normalize -0 to 0 for stable serialization.
  return value === 0 ? 0 : value;
}

/**
 * ISO-8601 timestamp string, or null. Only accepts a value that already parses
 * as a date AND already looks like an ISO string (has a 'T'). We do NOT accept
 * arbitrary strings — a non-ISO string is dropped to null, never passed as free
 * text. The timestamp path is gate-allowed, so a valid ISO string survives.
 */
function safeIsoTimestamp(value) {
  if (typeof value !== 'string') return null;
  if (!value.includes('T')) return null;
  const ms = Date.parse(value);
  if (Number.isNaN(ms)) return null;
  // Re-canonicalize to strict ISO to strip any trailing free text the parser
  // tolerated (e.g. "2026-05-28T00:00:00Z extra words" — Date.parse may ignore
  // trailing junk on some inputs; re-emitting from the epoch guarantees clean).
  return new Date(ms).toISOString();
}

/** Canonical lane name, or the UNKNOWN_LANE sentinel. */
function safeLane(value) {
  if (typeof value !== 'string') return UNKNOWN_LANE;
  return CANONICAL_LANE_SET.has(value) ? value : UNKNOWN_LANE;
}

// ---------------------------------------------------------------------------
// Structural extractors — numeric/structural projection only.
// ---------------------------------------------------------------------------

/**
 * Project an arbitrary "counts by label" object onto the canonical label set.
 * Only canonical-label keys with finite non-negative numeric values survive;
 * every other key (which could be a claim body, a path, an id) is dropped.
 * Returns a plain object with numeric values only — gate-safe.
 */
function sanitizeLabeledCounts(raw, labelSet) {
  const out = {};
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
  for (const label of labelSet) {
    if (!Object.hasOwn(raw, label)) continue;
    const value = raw[label];
    // Idempotence: a Public record's labeled counts may already be bucket
    // ranges. Preserve a valid range; otherwise coerce to a non-negative count.
    out[label] = isBucketRange(value)
      ? { bucketLower: safeCount(value.bucketLower), bucketUpper: safeCount(value.bucketUpper) }
      : safeCount(value);
  }
  return out;
}

/**
 * Reduce evidence to numeric age statistics. We never copy evidence
 * bodies/excerpts — only the count and the age distribution stats.
 *
 * Idempotence-aware: accepts BOTH the raw shape (an array of evidence items,
 * each with a numeric age field) AND the already-sanitized shape (an
 * {count, ageMin, ageMax, ageMean} summary object). When handed a summary it
 * re-validates the numbers and passes them through, so sanitizing a sanitized
 * record reproduces the same evidence block.
 */
function sanitizeEvidenceAges(rawEvidence) {
  // Already-sanitized summary object: re-coerce its numeric fields and return.
  if (
    rawEvidence
    && typeof rawEvidence === 'object'
    && !Array.isArray(rawEvidence)
  ) {
    return {
      count: safeCount(rawEvidence.count),
      ageMin: safeNonNegativeNumber(rawEvidence.ageMin),
      ageMax: safeNonNegativeNumber(rawEvidence.ageMax),
      ageMean: safeNonNegativeNumber(rawEvidence.ageMean),
    };
  }

  if (!Array.isArray(rawEvidence) || rawEvidence.length === 0) {
    return { count: 0, ageMin: 0, ageMax: 0, ageMean: 0 };
  }
  const ages = [];
  for (const item of rawEvidence) {
    if (item && typeof item === 'object' && !Array.isArray(item)) {
      const a = item.age ?? item.ageDays ?? item.age_days;
      ages.push(safeNonNegativeNumber(typeof a === 'number' ? a : 0));
    } else {
      ages.push(0);
    }
  }
  const sum = ages.reduce((acc, n) => acc + n, 0);
  return {
    count: ages.length,
    ageMin: Math.min(...ages),
    ageMax: Math.max(...ages),
    ageMean: ages.length ? sum / ages.length : 0,
  };
}

/**
 * Read protected-path and promotion-ladder-inversion counts from a raw event
 * OR from an already-sanitized record's `violationCounts` block. Idempotence-
 * aware: prefers explicit raw fields, falls back to the sanitized nested shape.
 */
function sanitizeViolationCounts(src) {
  const nested = src.violationCounts && typeof src.violationCounts === 'object'
    && !Array.isArray(src.violationCounts)
    ? src.violationCounts
    : {};
  const protectedPath = Object.hasOwn(src, 'protectedPathViolations')
    ? safeCount(src.protectedPathViolations)
    : safeCount(nested.protectedPath);
  const promotionLadderInversion = Object.hasOwn(src, 'promotionLadderInversions')
    ? safeCount(src.promotionLadderInversions)
    : safeCount(nested.promotionLadderInversion);
  return { protectedPath, promotionLadderInversion };
}

// ---------------------------------------------------------------------------
// sanitizeStateEvent — Raw → Sanitized zone.
// ---------------------------------------------------------------------------

/**
 * Project an in-memory raw state event onto a Sanitized-zone record. Allow-list
 * enforced: only explicitly recognized fields survive; everything else dropped.
 *
 * The returned record contains ONLY:
 *   - timestamp        (ISO string | null)  — gate-allowed string path
 *   - lane             (canonical name)     — gate-allowed string path
 *   - eventTypeCode    (number)             — enum code, not a free string
 *   - claimDistribution (counts by canonical promotion label)
 *   - claimDistributionSize (number of distinct labels present)
 *   - evidence         ({count, ageMin, ageMax, ageMean})
 *   - violationCounts  ({protectedPath, promotionLadderInversion})
 *   - promotionLadderTransitions (counts by canonical transition label)
 *   - zone             (number: ZONE.SANITIZED)
 *
 * Every produced record is validated through the Privacy Gate v3 before return.
 * A validation failure throws — this is the canary that proves no forbidden
 * field leaked. Idempotent: sanitizing a sanitized record yields an equivalent
 * record (structural fields are re-read from the same field names).
 *
 * @param {object} rawEvent in-memory raw-event object (NOT a file path)
 * @returns {object} Sanitized-zone record (passes validateRecord)
 */
export function sanitizeStateEvent(rawEvent) {
  const src = rawEvent && typeof rawEvent === 'object' && !Array.isArray(rawEvent)
    ? rawEvent
    : {};

  const claimDistribution = sanitizeLabeledCounts(
    src.claimPromotionDistribution ?? src.claimDistribution,
    PROMOTION_LADDER_LABEL_SET,
  );

  const promotionLadderTransitions = sanitizeLabeledCounts(
    src.promotionLadderTransitions,
    PROMOTION_LADDER_LABEL_SET,
  );

  const record = {
    zone: ZONE.SANITIZED,
    timestamp: safeIsoTimestamp(src.timestamp),
    lane: safeLane(src.lane),
    eventTypeCode: normalizeEventTypeCode(src.eventType ?? src.eventTypeCode),
    claimDistribution,
    claimDistributionSize: Object.keys(claimDistribution).length,
    evidence: sanitizeEvidenceAges(src.evidence),
    violationCounts: sanitizeViolationCounts(src),
    promotionLadderTransitions,
    advisory_only: true,
    local_truth_claim: false,
  };

  // Canary: the produced record MUST pass the existing Privacy Gate. If a
  // forbidden free-text field somehow survived projection, this throws here
  // rather than leaking into an experiment runner.
  assertGatePasses(record, 'sanitizeStateEvent');
  return record;
}

// ---------------------------------------------------------------------------
// toPublicZone — Sanitized → Public zone.
// ---------------------------------------------------------------------------

export const ZONE = Object.freeze({
  SANITIZED: 1,
  PUBLIC: 2,
});

/**
 * Deterministic lane → generic-label map. Stable for the lifetime of the
 * process so repeated calls assign the same generic label to the same lane.
 * "lane-1", "lane-2" are NOT in the Privacy Gate string allow-list, so they
 * CANNOT be emitted as a free `lane` string in a record. Instead the public
 * record carries a numeric `laneGenericId` and exposes the human label only via
 * the exported `genericLaneLabel(id)` helper — same discipline as eventType.
 */
const _laneGenericIdByName = new Map();
let _nextLaneGenericId = 1;

function genericLaneId(canonicalLane) {
  if (canonicalLane === UNKNOWN_LANE) return 0;
  if (_laneGenericIdByName.has(canonicalLane)) {
    return _laneGenericIdByName.get(canonicalLane);
  }
  const id = _nextLaneGenericId++;
  _laneGenericIdByName.set(canonicalLane, id);
  return id;
}

/** Public-facing generic label for a lane id. Never serialized into a record. */
export function genericLaneLabel(id) {
  if (id === 0) return 'lane-unknown';
  return `lane-${id}`;
}

/** Reset the generic-lane assignment map. Test/seed hook only. */
export function _resetGenericLaneMap() {
  _laneGenericIdByName.clear();
  _nextLaneGenericId = 1;
}

/** True if a value is an already-bucketed {bucketLower, bucketUpper} range. */
function isBucketRange(v) {
  return v
    && typeof v === 'object'
    && !Array.isArray(v)
    && typeof v.bucketLower === 'number'
    && typeof v.bucketUpper === 'number';
}

/**
 * Bucket a count above the threshold into a [lower, upper) numeric range.
 * Counts at or below the threshold are reported exactly. Returns either a
 * number (exact) or a plain {bucketLower, bucketUpper} object — both gate-safe.
 *
 * Idempotence-aware: an already-bucketed range is passed through unchanged so
 * re-applying toPublicZone to a Public record does not zero out bucketed counts.
 */
function bucketCount(n) {
  if (isBucketRange(n)) {
    return { bucketLower: safeCount(n.bucketLower), bucketUpper: safeCount(n.bucketUpper) };
  }
  const c = safeCount(n);
  if (c <= PUBLIC_COUNT_BUCKET_THRESHOLD) return c;
  const lower = Math.floor(c / PUBLIC_BUCKET_WIDTH) * PUBLIC_BUCKET_WIDTH;
  return { bucketLower: lower, bucketUpper: lower + PUBLIC_BUCKET_WIDTH };
}

/** Bucket every numeric value of a labeled-counts object. */
function bucketLabeledCounts(counts) {
  const out = {};
  for (const [label, n] of Object.entries(counts)) {
    out[label] = bucketCount(n);
  }
  return out;
}

/**
 * Second-pass sanitization: Sanitized-zone record → Public-zone record safe for
 * a published reproducibility artifact.
 *
 * Beyond Sanitized-zone rules:
 *   - lane name replaced with a numeric generic id (laneGenericId); the literal
 *     "lane-N" label is available only via genericLaneLabel(), never serialized
 *   - timestamp normalized to a relative-offset number of seconds from a
 *     reference epoch (relativeOffsetSeconds). Absolute timestamps are dropped.
 *   - counts above PUBLIC_COUNT_BUCKET_THRESHOLD are bucketed into ranges
 *
 * @param {object} sanitizedRecord output of sanitizeStateEvent
 * @param {object} [options]
 * @param {string} [options.referenceTimestamp] ISO ref; offsets computed from it
 * @returns {object} Public-zone record (passes validateRecord)
 */
export function toPublicZone(sanitizedRecord, options = {}) {
  const src = sanitizedRecord && typeof sanitizedRecord === 'object' && !Array.isArray(sanitizedRecord)
    ? sanitizedRecord
    : {};

  // Re-run the sanitized projection field-by-field so toPublicZone is robust
  // even if handed a raw-ish object: we read only known structural fields.
  const claimDistribution = sanitizeLabeledCounts(src.claimDistribution, PROMOTION_LADDER_LABEL_SET);
  const promotionLadderTransitions = sanitizeLabeledCounts(
    src.promotionLadderTransitions,
    PROMOTION_LADDER_LABEL_SET,
  );

  // Lane id: idempotence-aware. A Sanitized record carries a canonical `lane`
  // string; a Public record (re-applied) carries only a numeric laneGenericId.
  // Prefer the existing numeric id when present so re-running is stable.
  const laneGenericIdValue = typeof src.laneGenericId === 'number' && Number.isInteger(src.laneGenericId)
    ? src.laneGenericId
    : genericLaneId(safeLane(src.lane));

  // Timestamp: a Sanitized record carries an absolute ISO `timestamp`; a Public
  // record (re-applied) carries only relativeOffsetSeconds. Preserve the latter.
  const refIso = safeIsoTimestamp(options.referenceTimestamp) ?? PUBLIC_REFERENCE_EPOCH;
  const recordIso = safeIsoTimestamp(src.timestamp);
  let relativeOffsetSeconds;
  if (recordIso !== null) {
    relativeOffsetSeconds = Math.round((Date.parse(recordIso) - Date.parse(refIso)) / 1000);
  } else if (typeof src.relativeOffsetSeconds === 'number' && Number.isFinite(src.relativeOffsetSeconds)) {
    relativeOffsetSeconds = src.relativeOffsetSeconds;
  } else {
    relativeOffsetSeconds = null;
  }

  const ev = src.evidence && typeof src.evidence === 'object' && !Array.isArray(src.evidence)
    ? src.evidence
    : {};

  const violations = src.violationCounts && typeof src.violationCounts === 'object' && !Array.isArray(src.violationCounts)
    ? src.violationCounts
    : {};

  const record = {
    zone: ZONE.PUBLIC,
    relativeOffsetSeconds,
    laneGenericId: laneGenericIdValue,
    eventTypeCode: EVENT_TYPE_CODES.has(src.eventTypeCode) ? src.eventTypeCode : EVENT_TYPE.UNKNOWN,
    claimDistribution: bucketLabeledCounts(claimDistribution),
    claimDistributionSize: Object.keys(claimDistribution).length,
    evidence: {
      count: bucketCount(ev.count),
      ageMin: safeNonNegativeNumber(ev.ageMin),
      ageMax: safeNonNegativeNumber(ev.ageMax),
      ageMean: safeNonNegativeNumber(ev.ageMean),
    },
    violationCounts: {
      protectedPath: bucketCount(violations.protectedPath),
      promotionLadderInversion: bucketCount(violations.promotionLadderInversion),
    },
    promotionLadderTransitions: bucketLabeledCounts(promotionLadderTransitions),
    advisory_only: true,
    local_truth_claim: false,
  };

  assertGatePasses(record, 'toPublicZone');
  return record;
}

// ---------------------------------------------------------------------------
// Privacy Gate composition — every produced record is re-validated.
// ---------------------------------------------------------------------------

/**
 * Run the existing Privacy Gate v3 validator over a produced record. Throws a
 * clearly-attributed error on failure. This is the canary required by spec:
 * "Run validateRecord on every produced record before returning; throw if it
 * fails." Defense-in-depth: serialize → re-parse → re-validate, matching the
 * appendTrace contract so getters / lazy values cannot smuggle content.
 */
function assertGatePasses(record, source) {
  try {
    validateRecord(record);
    const reparsed = JSON.parse(JSON.stringify(record));
    validateRecord(reparsed);
  } catch (err) {
    throw new Error(
      `Privacy Gate canary tripped in ${source}: ${err.message}`,
    );
  }
}

// Exported for direct test access.
export { assertGatePasses, safeIsoTimestamp, safeLane, bucketCount, PUBLIC_COUNT_BUCKET_THRESHOLD, UNKNOWN_LANE };
