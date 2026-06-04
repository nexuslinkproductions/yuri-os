#!/usr/bin/env node
/**
 * YURI Energy Trace — yuri-energy-trace.mjs
 *
 * Telemetry layer for yuri-energy gate evaluations. Captures every gate
 * evaluation as structured JSONL output under _SYSTEM/state/energy-trace/.
 *
 * Privacy Gate (Layer 7): enforced mechanically — the validator refuses to
 * serialize any record containing a string-typed value in a non-allow-listed
 * field. No free text, no prompt content, no memory bodies, no raw paths.
 *
 * Trace file path resolution:
 *   YURI_STATE_DIR set → ${YURI_STATE_DIR}/energy-trace/<YYYY-MM-DD>.jsonl
 *   default            → <repo-root>/_SYSTEM/state/energy-trace/<YYYY-MM-DD>.jsonl
 *
 * Status: fixture_ready. Foundational for Workstream B empirical collection.
 *
 * Related:
 *   - _SYSTEM/Scripts/math/yuri-energy.mjs  (gate evaluations traced here)
 *   - _SYSTEM/reports/energy-landscape-paper-2026-07/  (methodology paper)
 */

import {
  computeU,
  computeDeltaU,
  gateProposal,
  DEFAULT_WEIGHTS,
  DEFAULT_MAX_LADDER_INVERSION_CAP,
} from './yuri-energy.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// ---------------------------------------------------------------------------
// Privacy Gate — structural allow-list. String values are permitted only at
// specific full paths from the record root. Any string at any other path
// triggers refusal. Non-plain-object containers (Map, Set, Date, custom
// classes) are refused outright — only plain objects, arrays, and primitives
// are valid record material.
//
// Revision history:
//   2026-05-28 — initial: global key-name allow-list, plain-object-only via
//                Object.entries.
//   2026-05-28 — hardened (Codex BLOCKED 2026-05-28T19-54): (1) explicit
//                Map/Set/non-plain-object rejection, (2) global key-name
//                allow-list replaced with structural full-path allow-list.
// ---------------------------------------------------------------------------

const ALLOWED_STRING_PATHS = new Set([
  'timestamp',
  'runId',
  'lane',
  'user',     // stable per-user handle (gate-safe attribution) — see user-data-methodology.md §1 P4
  'regime',   // 'observability' | 'action' — synthetic baseline vs real-ΔU, kept separable
  'event',    // canonical Object+Action event name — see user-data-methodology.md §2
  'decision',
  'dominantTerm',
  // ENG-07 deferred-outcome record (energy-trace-outcomes/<date>.jsonl). Added
  // DELIBERATELY (per spec): the outcome record is numeric/closed-set except its
  // runId join key (already allow-listed) and resolvedAt — the ISO timestamp of when
  // the deferred outcome was observed. Distinct from the record's write `timestamp`
  // (when the row was appended), so it gets its own allow-listed path rather than
  // overloading `timestamp`. A re-canonicalized ISO string only; the resolver coerces
  // it through new Date(...).toISOString() before write, so no free text can land here.
  'resolvedAt',
]);

function isPlainObject(value) {
  if (value === null || typeof value !== 'object') return false;
  if (Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

/**
 * Recursively validate a record against the Privacy Gate.
 *
 * Throws on:
 *   - String values at any path not in ALLOWED_STRING_PATHS
 *   - Non-plain-object containers at any depth (Map, Set, Date, custom classes)
 *   - Function values at any depth (including toJSON hooks that smuggle
 *     forbidden content through JSON.stringify)
 *   - Plain objects that define an own `toJSON` method (would override
 *     serialization)
 *   - Symbol values (cannot be reasonably gated; reject)
 *   - BigInt values (JSON.stringify throws on BigInt — validator/serializer
 *     contract mismatch caught at validation time, not at write time)
 *
 * Allowed primitive types at any depth: number, boolean, null, undefined.
 * Allowed container types: Array, plain Object (without toJSON).
 * Strings allowed only at exact paths in ALLOWED_STRING_PATHS.
 */
function validateRecord(node, fieldPath = '') {
  // Primitives: only strings are gated by path; functions/symbols rejected.
  if (node === null || node === undefined) return;
  const type = typeof node;
  if (type === 'string') {
    if (!ALLOWED_STRING_PATHS.has(fieldPath)) {
      throw new Error(
        `Privacy Gate violation: string value at '${fieldPath || '<root>'}' ` +
          `is not in the structural allow-list (allowed paths: ${[...ALLOWED_STRING_PATHS].join(', ')})`,
      );
    }
    return;
  }
  if (type === 'function') {
    throw new Error(
      `Privacy Gate violation: function value at '${fieldPath || '<root>'}' — ` +
        `functions can hijack JSON.stringify via toJSON and are not permitted`,
    );
  }
  if (type === 'symbol') {
    throw new Error(
      `Privacy Gate violation: symbol value at '${fieldPath || '<root>'}' — ` +
        `symbols are not permitted in trace records`,
    );
  }
  if (type === 'bigint') {
    throw new Error(
      `Privacy Gate violation: BigInt value at '${fieldPath || '<root>'}' — ` +
        `JSON.stringify throws on BigInt; reject at validation to fail fast`,
    );
  }
  if (type !== 'object') return;

  // Arrays: recurse with indexed path.
  if (Array.isArray(node)) {
    for (let i = 0; i < node.length; i++) {
      validateRecord(node[i], `${fieldPath}[${i}]`);
    }
    return;
  }

  // Reject non-plain-object containers (Map, Set, Date, custom classes).
  if (!isPlainObject(node)) {
    const className = node.constructor?.name ?? 'unknown';
    throw new Error(
      `Privacy Gate violation: non-plain-object container (${className}) at ` +
        `'${fieldPath || '<root>'}' — only plain objects and arrays are permitted`,
    );
  }

  // Reject plain objects that define an own toJSON method — they would
  // override JSON.stringify's serialization and smuggle arbitrary content.
  if (Object.prototype.hasOwnProperty.call(node, 'toJSON')) {
    throw new Error(
      `Privacy Gate violation: object at '${fieldPath || '<root>'}' defines an ` +
        `own toJSON method — custom serialization hooks are not permitted`,
    );
  }

  // Plain object: recurse into each entry with extended path.
  for (const [key, value] of Object.entries(node)) {
    const currentPath = fieldPath ? `${fieldPath}.${key}` : key;
    validateRecord(value, currentPath);
  }
}

// Exported so tests can invoke it directly without going through appendTrace.
export { validateRecord, isPlainObject, ALLOWED_STRING_PATHS };

// ---------------------------------------------------------------------------
// Path resolution
// ---------------------------------------------------------------------------

const _HERE = path.dirname(fileURLToPath(import.meta.url));
// _HERE = _SYSTEM/Scripts/math/  →  ../../../ = repo root
const DEFAULT_REPO_ROOT = path.resolve(_HERE, '../../..');

function resolveTraceDir(options = {}) {
  if (options.traceDir) return options.traceDir;
  const stateDir = process.env.YURI_STATE_DIR;
  if (stateDir) return path.join(stateDir, 'energy-trace');
  return path.join(DEFAULT_REPO_ROOT, '_SYSTEM', 'state', 'energy-trace');
}

// ENG-07: deferred-outcome JSONL lives in a SEPARATE subdir (energy-trace-outcomes)
// so the decision stream and the outcome stream never interleave in one file and the
// labeler is a strictly second writer that cannot corrupt the live decision trace.
// Same YURI_STATE_DIR / explicit-dir precedence as the decision trace.
function resolveOutcomeDir(options = {}) {
  if (options.outcomeDir) return options.outcomeDir;
  const stateDir = process.env.YURI_STATE_DIR;
  if (stateDir) return path.join(stateDir, 'energy-trace-outcomes');
  return path.join(DEFAULT_REPO_ROOT, '_SYSTEM', 'state', 'energy-trace-outcomes');
}

// Exported so the labeler module (yuri-energy-trace-outcomes.mjs) and dashboards can
// resolve the same dir without re-deriving the precedence rules.
export { resolveTraceDir, resolveOutcomeDir };

// ---------------------------------------------------------------------------
// State summarization — extract only numeric/structural fields, no free text.
// ---------------------------------------------------------------------------

function safeCount(arr) {
  return Array.isArray(arr) ? arr.length : 0;
}

function safeInteger(v) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.max(0, Math.trunc(n)) : 0;
}

function evidenceAgeStats(evidence) {
  if (!Array.isArray(evidence) || evidence.length === 0) {
    return { min: 0, max: 0, mean: 0 };
  }
  const ages = evidence
    .map((e) =>
      e && typeof e === 'object'
        ? Number(e.age ?? e.ageDays ?? e.age_days ?? 0)
        : 0,
    )
    .map((n) => (Number.isFinite(n) ? Math.max(0, n) : 0));
  const sum = ages.reduce((a, b) => a + b, 0);
  return {
    min: Math.min(...ages),
    max: Math.max(...ages),
    mean: sum / ages.length,
  };
}

// CLOSED canonical promotion-label set for claimPromotionDistribution keys (privacy
// KEY guard). Defined locally — NOT imported — on purpose: this set IS the security
// control, and a privacy gate must stay hermetic, never coupled to another module's
// transitive load graph (cortex → energy, registry → lane-kernel, …). The closed set
// must equal the cortex LADDER (claim-cortex.LADDER = claim-integrity-gate.PROMOTION_STATES
// minus the 'deprecated' SINK). A drift test (yuri-energy-hardening.test.mjs) asserts this
// set EQUALS the live cortex LADDER, so a future ladder change that is not mirrored here
// fails the suite instead of silently dropping telemetry mass on disk.
//
// operator_validated was ADDED 2026-06-04 (ENG-08): it is a live promotion rung in the
// cortex LADDER (operator-note-ceilinged claims land here), but it was omitted from this
// closed set, so summarizeState silently dropped any claimPromotionDistribution mass at
// operator_validated from on-disk telemetry — corrupting any future weight-learning /
// calibration replay (ENG-07) that reads the trace. The drift test below now keys on the
// LADDER, not on trace-vs-sanitize agreement (both previously drifted together, hiding it).
//
// 'deprecated' stays OUT — it is a SINK (off the promotion ladder entirely), not a
// distribution rung; the drift test asserts that exclusion explicitly.
//
// summarizeState iterates THIS set, never the attacker-controlled keys, so an out-of-enum
// key — a secret, a 'ghp_...' token, a length-split chunk — is never read and cannot reach
// disk. (The earlier lowercase charset admitted lowercase secrets and was defeated by
// splitting a long secret in two.)
export const CANONICAL_PROMOTION_LABELS = Object.freeze([
  'draft', 'research', 'fixture_ready', 'runtime_tested', 'operator_validated', 'trusted',
]);
const CANONICAL_PROMOTION_LABEL_SET = new Set(CANONICAL_PROMOTION_LABELS);

function summarizeState(state) {
  if (!state || typeof state !== 'object' || Array.isArray(state)) {
    return {
      claimPromotionDistribution: {},
      claimedDistribution_length: 0,
      verifiedDistribution_length: 0,
      evidence_count: 0,
      evidence_age_stats: { min: 0, max: 0, mean: 0 },
      predictions_count: 0,
      forecasts_count: 0,
      protectedPathViolations: 0,
      promotionLadderInversions: 0,
      verifiedEvidenceCount: 0,
    };
  }

  // claimPromotionDistribution: numeric values only, keys are label strings.
  // Privacy KEY guard: these KEYS land verbatim in the on-disk JSONL, and
  // validateRecord gates VALUES by path but never KEYS. CLOSED-SET projection —
  // iterate the canonical label enum, NEVER the attacker-controlled keys — so any
  // out-of-enum key (a secret) is never read and cannot reach disk.
  const claimDist = {};
  const rawDist = state.claimPromotionDistribution;
  if (rawDist && typeof rawDist === 'object' && !Array.isArray(rawDist)) {
    for (const label of CANONICAL_PROMOTION_LABEL_SET) {
      if (!Object.hasOwn(rawDist, label)) continue;
      const n = Number(rawDist[label]);
      if (Number.isFinite(n)) claimDist[label] = n;
    }
  }

  return {
    claimPromotionDistribution: claimDist,
    claimedDistribution_length: safeCount(state.claimedDistribution),
    verifiedDistribution_length: safeCount(state.verifiedDistribution),
    evidence_count: safeCount(state.evidence),
    evidence_age_stats: evidenceAgeStats(state.evidence),
    predictions_count: safeCount(state.predictions),
    forecasts_count: safeCount(state.forecasts),
    protectedPathViolations: safeInteger(state.protectedPathViolations),
    promotionLadderInversions: safeInteger(state.promotionLadderInversions),
    verifiedEvidenceCount: safeInteger(state.verifiedEvidenceCount),
  };
}

// ---------------------------------------------------------------------------
// buildTraceRecord — pure function. No file I/O. No input mutation.
// ---------------------------------------------------------------------------

export function buildTraceRecord({
  lane,
  runId,
  user,
  regime = 'observability',
  stateBefore,
  stateAfter,
  computeUResult,
  computeDeltaUResult,
  gateProposalResult,
  weights = DEFAULT_WEIGHTS,
  threshold = 0,
  allowOverride = false,
}) {
  const uAfter = computeUResult?.result?.U ?? 0;
  const uBefore = computeDeltaUResult?.result?.uBefore ?? 0;
  const deltaU = computeDeltaUResult?.result?.deltaU ?? 0;
  const componentContributions = { ...(computeUResult?.result?.contributions ?? {}) };
  const componentDeltas = { ...(computeDeltaUResult?.result?.componentDeltas ?? {}) };

  const accept = gateProposalResult?.result?.accept ?? false;
  const dominantTerm = gateProposalResult?.result?.dominantTerm ?? null;

  // Regime keeps the synthetic baseline (observability) and real-ΔU runs
  // (action) in separate columns — see user-data-methodology.md §5.
  const regimeTag = regime === 'action' ? 'action' : 'observability';
  // Canonical Object+Action event name, derived from regime + decision (§2).
  const event = regimeTag === 'action'
    ? (accept ? 'Proposal Accepted' : 'Proposal Rejected')
    : 'Dispatch Recorded';

  return {
    timestamp: new Date().toISOString(),
    runId: String(runId ?? ''),
    lane: String(lane ?? ''),
    user: String(user ?? ''),
    regime: regimeTag,
    event,
    stateBefore_summary: summarizeState(stateBefore),
    stateAfter_summary: summarizeState(stateAfter),
    U_before: uBefore,
    U_after: uAfter,
    deltaU,
    componentContributions,
    componentDeltas,
    decision: accept ? 'accept' : 'reject',
    dominantTerm: dominantTerm ?? null,
    threshold: Number(threshold),
    allowOverride: Boolean(allowOverride),
    weights: { ...weights },
    advisory_only: true,
    local_truth_claim: false,
  };
}

// ---------------------------------------------------------------------------
// appendTrace — only file-write surface. Validates before writing.
// Returns the absolute path of the trace file written.
// ---------------------------------------------------------------------------

export function appendTrace(record, options = {}) {
  // Pre-serialization validation: rejects obvious smuggle vectors with clear
  // error messages naming the offending path.
  validateRecord(record);

  // Defense-in-depth: serialize first, then re-parse and re-validate. Catches
  // any smuggling that survived the pre-validation pass (e.g., getters that
  // return forbidden content only at serialization time). If this throws, the
  // pre-validation has a gap that should be patched — this is the canary.
  const serialized = JSON.stringify(record);
  const parsed = JSON.parse(serialized);
  validateRecord(parsed);

  const traceDir = resolveTraceDir(options);
  const date = options.dateOverride ?? new Date().toISOString().slice(0, 10);
  const filePath = path.join(traceDir, `${date}.jsonl`);

  fs.mkdirSync(traceDir, { recursive: true });
  fs.appendFileSync(filePath, serialized + '\n', {
    encoding: 'utf8',
  });

  return filePath;
}

// ---------------------------------------------------------------------------
// appendOutcome — ENG-07. The ONLY write surface for deferred-outcome records.
// Append-only, second JSONL (energy-trace-outcomes/<date>.jsonl). Passes the SAME
// Privacy Gate as appendTrace: pre-validate → serialize → re-parse → re-validate,
// so a getter / lazy value / non-allow-listed string cannot smuggle content into
// the outcome stream. Returns the absolute path of the outcome file written.
// ---------------------------------------------------------------------------

export function appendOutcome(record, options = {}) {
  // Identical canary discipline to appendTrace — the outcome stream is held to the
  // same privacy bar as the decision stream.
  validateRecord(record);
  const serialized = JSON.stringify(record);
  const parsed = JSON.parse(serialized);
  validateRecord(parsed);

  const outcomeDir = resolveOutcomeDir(options);
  const date = options.dateOverride ?? new Date().toISOString().slice(0, 10);
  const filePath = path.join(outcomeDir, `${date}.jsonl`);

  fs.mkdirSync(outcomeDir, { recursive: true });
  fs.appendFileSync(filePath, serialized + '\n', { encoding: 'utf8' });

  return filePath;
}

// ---------------------------------------------------------------------------
// traceGateEvaluation — evaluate gate and log atomically in one call.
// Returns { record, gateResult }.
// ---------------------------------------------------------------------------

export function traceGateEvaluation({
  lane,
  runId,
  user,
  regime = 'observability',
  stateBefore,
  stateAfter,
  weights = DEFAULT_WEIGHTS,
  threshold = 0,
  allowOverride = false,
  maxLadderInversionCap = DEFAULT_MAX_LADDER_INVERSION_CAP,
  traceOptions = {},
} = {}) {
  const computeUResult = computeU(stateAfter, weights);
  const computeDeltaUResult = computeDeltaU(stateBefore, stateAfter, weights);
  const gateResult = gateProposal({
    stateBefore,
    stateAfter,
    weights,
    threshold,
    allowOverride,
    maxLadderInversionCap,
  });

  const record = buildTraceRecord({
    lane,
    runId,
    user,
    regime,
    stateBefore,
    stateAfter,
    computeUResult,
    computeDeltaUResult,
    gateProposalResult: gateResult,
    weights,
    threshold,
    allowOverride,
  });

  appendTrace(record, traceOptions);

  return { record, gateResult };
}
