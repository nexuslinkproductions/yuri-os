#!/usr/bin/env node
/**
 * YURI Energy Trace — Deferred-Outcome Labeler — yuri-energy-trace-outcomes.mjs
 *
 * ENG-07. PURE-ADDITIVE observability. This module is a strictly SECOND writer on
 * top of the energy decision trace (yuri-energy-trace.mjs). It adds NOTHING to the
 * live gate: it does not import computeU / gateProposal / the breaker, it never
 * touches the decision JSONL, and tickAndTrace output is byte-identical with this
 * module loaded or not.
 *
 * THE GAP IT CLOSES
 *   The decision trace is write-once: each row records the gate's call at the moment
 *   of the transition (accept/reject, ΔU, U). It has NO later outcome label — "did
 *   the gated claim get promoted and survive?", "was the protected-path edit reverted
 *   within the session?", "did the failed Bash later get fixed?". Three high-value
 *   learning transfers (OCO no-regret learned weights, Split-Conformal ASSERT bar,
 *   Cox β by partial likelihood) are ALL fenced behind a join that does not exist
 *   today: a deferred-outcome record keyed by runId.
 *
 * WHAT THIS BUILDS
 *   1. buildOutcomeRecord({runId, outcome, resolvedAt}) — pure; gate-safe record.
 *   2. resolveOutcome(...) — the resolver: build + append to a SECOND JSONL
 *      (energy-trace-outcomes/<date>.jsonl), through the SAME Privacy Gate
 *      (serialize-then-re-validate canary). Append-only.
 *   3. readJoinedDecisions(options) — left-join decisions → outcomes by runId.
 *      Reuses readTraces from yuri-action-mode-study (the existing replay plumbing),
 *      NOT a duplicate reader.
 *
 * PRIVACY
 *   The outcome record carries only:
 *     - runId      (string)  — join key, already in the trace ALLOWED_STRING_PATHS
 *     - timestamp  (string)  — ISO write time, already allow-listed
 *     - resolvedAt (string)  — ISO observation time, allow-listed DELIBERATELY (ENG-07)
 *     - outcome    (number)  — closed set {0, 1}; anything else is rejected
 *     - resolvedAtMs (number)— numeric epoch ms mirror of resolvedAt for cheap sorting
 *     - advisory_only/local_truth_claim (boolean)
 *   appendOutcome runs the SAME validateRecord → serialize → re-parse → re-validate
 *   canary as appendTrace, so a non-allow-listed string (a secret in a smuggled field)
 *   makes the append THROW.
 *
 * Status: fixture_ready. Read/append-only. No live-gate change.
 *
 * Related:
 *   - _SYSTEM/Scripts/math/yuri-energy-trace.mjs        (decision trace + Privacy Gate)
 *   - _SYSTEM/Scripts/yuri-action-mode-study.mjs        (readTraces — reused here)
 *   - 02_RESOURCES/RESEARCH/math-theory-transfer-catalog-2026-06-03.md (cards 11/12/18)
 */

import { appendOutcome, resolveTraceDir, resolveOutcomeDir } from './yuri-energy-trace.mjs';
import { readTraces } from '../yuri-action-mode-study.mjs';

// Closed set for the binary outcome label. NOT a charset / range check — an exact
// membership test, so 0.999, "1", true, NaN, 2 are all rejected. 1 = the gated move
// proved good (claim promoted-and-survived / protected edit NOT reverted / failure
// later fixed); 0 = it proved bad. There is no third value.
export const OUTCOME_VALUES = Object.freeze([0, 1]);
const OUTCOME_SET = new Set(OUTCOME_VALUES);

/**
 * Coerce + validate an outcome label to the closed set {0, 1}. Strict: only the
 * literal numbers 0 and 1 pass. Returns the number, or throws — fail-closed, never
 * silently default a malformed label to 0 (that would poison every learned-weight /
 * conformal / Cox fit downstream).
 */
function strictOutcome(value) {
  if (typeof value !== 'number' || !OUTCOME_SET.has(value)) {
    throw new Error(
      `Deferred-outcome violation: outcome must be exactly 0 or 1 (got ${
        typeof value === 'string' ? JSON.stringify(value) : String(value)
      })`,
    );
  }
  return value;
}

/**
 * Strict runId: a non-empty string. The join is meaningless without a key, and an
 * empty/missing key would orphan the outcome (it could never match a decision), so
 * reject rather than write a dead row.
 */
function strictRunId(runId) {
  if (typeof runId !== 'string' || runId.length === 0) {
    throw new Error(
      `Deferred-outcome violation: runId must be a non-empty string (got ${
        runId === undefined ? 'undefined' : JSON.stringify(runId)
      })`,
    );
  }
  return runId;
}

/**
 * Re-canonicalize an ISO timestamp. Accepts a Date or an ISO-parseable string and
 * re-emits strict ISO via Date#toISOString — this strips any trailing free text a
 * lenient parser tolerated, so no arbitrary string can ride in on resolvedAt. An
 * unparseable input throws (fail-closed) rather than writing a junk label.
 */
function canonicalIso(value, fieldName) {
  let ms;
  if (value instanceof Date) {
    ms = value.getTime();
  } else if (typeof value === 'string' || typeof value === 'number') {
    ms = Date.parse(value);
  } else {
    ms = NaN;
  }
  if (!Number.isFinite(ms)) {
    throw new Error(
      `Deferred-outcome violation: ${fieldName} must be an ISO-8601 date or Date (got ${
        typeof value === 'string' ? JSON.stringify(value) : String(value)
      })`,
    );
  }
  return { iso: new Date(ms).toISOString(), ms };
}

// ---------------------------------------------------------------------------
// buildOutcomeRecord — pure. No file I/O. No input mutation.
// ---------------------------------------------------------------------------

/**
 * Build a gate-safe deferred-outcome record.
 *
 * @param {object} args
 * @param {string} args.runId      join key into the decision trace (non-empty)
 * @param {0|1}    args.outcome    closed-set binary label
 * @param {string|Date} [args.resolvedAt] when the outcome was observed (ISO). Defaults to now.
 * @returns {object} record that passes the trace Privacy Gate (validateRecord)
 */
export function buildOutcomeRecord({ runId, outcome, resolvedAt } = {}) {
  const id = strictRunId(runId);
  const label = strictOutcome(outcome);
  const resolved = canonicalIso(resolvedAt ?? new Date(), 'resolvedAt');
  return {
    timestamp: new Date().toISOString(),
    runId: id,
    outcome: label,
    resolvedAt: resolved.iso,
    resolvedAtMs: resolved.ms,
    advisory_only: true,
    local_truth_claim: false,
  };
}

// ---------------------------------------------------------------------------
// resolveOutcome — THE resolver. Build + append (append-only second JSONL).
// ---------------------------------------------------------------------------

/**
 * Resolve a deferred outcome for a prior gated decision: build the record and
 * append it to energy-trace-outcomes/<date>.jsonl through the SAME Privacy Gate as
 * the decision trace. Append-only; never reads/edits the decision stream.
 *
 * @param {object} args see buildOutcomeRecord
 * @param {object} [options] { outcomeDir?, dateOverride? } — same shape as appendTrace opts
 * @returns {{ record: object, filePath: string }}
 */
export function resolveOutcome(args, options = {}) {
  const record = buildOutcomeRecord(args);
  const filePath = appendOutcome(record, options);
  return { record, filePath };
}

// ---------------------------------------------------------------------------
// readJoinedDecisions — left-join decisions → outcomes by runId (for replay).
// ---------------------------------------------------------------------------

/**
 * Reduce the outcome stream to the LATEST outcome per runId. A runId may be
 * resolved more than once (a claim that survived, then was later retracted); the
 * last-resolved label is the truth at replay time. Ordering is by resolvedAtMs
 * (numeric, monotonic), falling back to timestamp, so a torn/missing resolvedAt
 * never silently wins over a well-formed later row.
 */
function latestOutcomeByRunId(outcomeRecords) {
  const byId = new Map();
  for (const o of outcomeRecords) {
    if (!o || typeof o !== 'object') continue;
    if (typeof o.runId !== 'string' || o.runId.length === 0) continue;
    if (typeof o.outcome !== 'number' || !OUTCOME_SET.has(o.outcome)) continue;
    const ts = Number.isFinite(o.resolvedAtMs)
      ? o.resolvedAtMs
      : (Date.parse(o.resolvedAt ?? o.timestamp ?? '') || 0);
    const prev = byId.get(o.runId);
    if (!prev || ts >= prev._ts) {
      byId.set(o.runId, { outcome: o.outcome, resolvedAt: o.resolvedAt ?? null, _ts: ts });
    }
  }
  return byId;
}

/**
 * Left-join the decision trace to the outcome trace by runId.
 *
 * LEFT join semantics: every decision row appears in the output exactly once.
 *   - resolved   = true  + outcome/resolvedAt set, when a matching outcome exists
 *   - resolved   = false + outcome=null,           when no outcome has been written yet
 *
 * For supervised learning (cards 11/12/18) the caller filters to resolved===true;
 * unresolved rows are the not-yet-labeled tail and MUST be excluded from a fit, but
 * are surfaced here so the caller can SEE the resolution rate rather than silently
 * losing rows.
 *
 * Reuses readTraces from yuri-action-mode-study for BOTH streams — no duplicate
 * read/parse/skip-torn-line logic.
 *
 * @param {object} [options]
 * @param {string} [options.traceDir]   override decision-trace dir (default: resolveTraceDir)
 * @param {string} [options.outcomeDir] override outcome-trace dir (default: resolveOutcomeDir)
 * @param {boolean}[options.resolvedOnly] when true, drop unresolved rows (replay-ready set)
 * @returns {{ joined: object[], decisionCount: number, resolvedCount: number, unresolvedCount: number }}
 */
export function readJoinedDecisions(options = {}) {
  const traceDir = options.traceDir ?? resolveTraceDir(options);
  const outcomeDir = options.outcomeDir ?? resolveOutcomeDir(options);

  const decisions = readTraces(traceDir);
  const outcomes = readTraces(outcomeDir);
  const outcomeById = latestOutcomeByRunId(outcomes);

  const joined = [];
  let resolvedCount = 0;
  for (const d of decisions) {
    if (!d || typeof d !== 'object') continue;
    const runId = typeof d.runId === 'string' ? d.runId : null;
    const hit = runId ? outcomeById.get(runId) : undefined;
    if (hit) {
      resolvedCount += 1;
      joined.push({
        ...d,
        outcome: hit.outcome,
        resolvedAt: hit.resolvedAt,
        resolved: true,
      });
    } else {
      joined.push({ ...d, outcome: null, resolvedAt: null, resolved: false });
    }
  }

  const result = {
    joined: options.resolvedOnly ? joined.filter((r) => r.resolved) : joined,
    decisionCount: joined.length,
    resolvedCount,
    unresolvedCount: joined.length - resolvedCount,
  };
  return result;
}

// CLI: print a join summary over the live trace (read-only). No write side effect.
if (import.meta.url === `file://${process.argv[1]}`) {
  const summary = readJoinedDecisions();
  const out = {
    ranAt: new Date().toISOString(),
    mode: 'deferred-outcome join (read-only; no live-gate change)',
    decisionCount: summary.decisionCount,
    resolvedCount: summary.resolvedCount,
    unresolvedCount: summary.unresolvedCount,
    resolutionRate: summary.decisionCount
      ? +((summary.resolvedCount / summary.decisionCount) * 100).toFixed(2)
      : 0,
  };
  process.stdout.write(JSON.stringify(out, null, 2) + '\n');
}
