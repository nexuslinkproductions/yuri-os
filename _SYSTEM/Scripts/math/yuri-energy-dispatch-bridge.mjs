#!/usr/bin/env node
/**
 * YURI Energy Dispatch Bridge — yuri-energy-dispatch-bridge.mjs
 *
 * Integration layer between YURI dispatch surfaces and the A.1 telemetry module.
 * Wires shintai, offload-runner, and codex-final-pass into yuri-energy gate
 * evaluation in observability mode.
 *
 * Invariants (non-negotiable):
 *   1. Default OFF — zero I/O when YURI_ENERGY_OBSERVABILITY !== '1'.
 *   2. Error isolation — telemetry errors NEVER propagate to the dispatch path.
 *      Errors are caught; a single stderr warning fires per process.
 *   3. Privacy Gate v3 compliance — string values in numericContext are stripped
 *      before record construction; only numeric fields reach the trace module.
 *   4. ΔU = 0 — identical before/after synthetic state; records the fact of the
 *      dispatch without measuring a state change (honest for A.2.a).
 *
 * Status: fixture_ready. Workstream A.2.a.
 *
 * Related:
 *   _SYSTEM/Scripts/math/yuri-energy-trace.mjs   (telemetry layer)
 *   _SYSTEM/Scripts/math/yuri-energy.mjs          (gate)
 *   _SYSTEM/reports/energy-landscape-paper-2026-07/  (methodology paper)
 */

import { traceGateEvaluation } from './yuri-energy-trace.mjs';

// ---------------------------------------------------------------------------
// Per-process one-time warning sentinel
// ---------------------------------------------------------------------------

let _warnedOnce = false;

/**
 * Emit the one-time telemetry warning. Fully guarded: if the stderr write
 * itself throws (closed fd, EPIPE, etc.), the failure is swallowed. This is
 * the innermost safety net — nothing in the telemetry path may ever propagate
 * to the dispatch caller.
 */
function _emitWarnOnce(err) {
  if (_warnedOnce) return;
  _warnedOnce = true;
  try {
    const msg = (err && err.message) ? err.message : String(err);
    process.stderr.write(
      `[yuri-energy-dispatch-bridge] telemetry error (suppressed, dispatch unaffected): ${msg}\n`,
    );
  } catch {
    // stderr write failed — no safe action remains. Swallow.
  }
}

/**
 * Test-only reset of the one-time warning sentinel. Guarded: in any context
 * other than an explicit test (YURI_ENERGY_TEST === '1'), this is a no-op,
 * so a stray production import cannot re-enable repeated stderr noise.
 */
export function _resetWarnOnce() {
  if (process.env.YURI_ENERGY_TEST !== '1') return;
  _warnedOnce = false;
}

// ---------------------------------------------------------------------------
// Observability gate
// ---------------------------------------------------------------------------

/**
 * Returns true only when YURI_ENERGY_OBSERVABILITY is exactly '1'.
 * All other values (unset, '0', 'true', 'yes') return false.
 */
export function isObservabilityEnabled() {
  return process.env.YURI_ENERGY_OBSERVABILITY === '1';
}

// ---------------------------------------------------------------------------
// Privacy Gate — strip non-numeric values from caller-supplied context
// ---------------------------------------------------------------------------

function sanitizeNumericContext(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const safe = {};
  for (const [k, v] of Object.entries(raw)) {
    if (typeof v === 'number' && Number.isFinite(v)) safe[k] = v;
  }
  return safe;
}

// ---------------------------------------------------------------------------
// Synthetic state construction
// ---------------------------------------------------------------------------

/**
 * Build a minimal YURI state from sanitized numeric context.
 * Both stateBefore and stateAfter use this same constructor so ΔU = 0.
 * Evidence array is capped at 10 items to prevent large allocations.
 */
function buildDispatchState(ctx) {
  const state = {
    verifiedEvidenceCount: Math.max(0, Math.trunc(ctx.verifiedEvidenceCount ?? 0)),
    protectedPathViolations: 0,
    promotionLadderInversions: 0,
  };
  const evidenceCap = Math.min(10, Math.max(0, Math.trunc(ctx.evidence_count ?? 0)));
  if (evidenceCap > 0) {
    state.evidence = Array.from({ length: evidenceCap }, () => ({ base: 1.0, age: 0 }));
  }
  return state;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Trace a dispatch event in observability mode.
 *
 * No-op when YURI_ENERGY_OBSERVABILITY !== '1'. When enabled, builds a synthetic
 * state pair, runs traceGateEvaluation, and appends a JSONL record. Errors are
 * caught silently; a single stderr warning fires per process.
 *
 * Accepts a single argument of any shape. The ENTIRE body — including the
 * observability check, argument destructuring, and sanitization — runs inside
 * one try/catch. `traceDispatchEvent(null)`, `traceDispatchEvent(42)`, or any
 * malformed input is absorbed without propagation. This is the non-negotiable
 * error-isolation invariant: telemetry must never affect dispatch outcome.
 *
 * @param {Object} [args]
 * @param {string}  [args.lane]           - canonical dispatch surface name
 * @param {string}  [args.runId]          - unique identifier for this dispatch event
 * @param {Object}  [args.numericContext] - numeric metadata (strings are stripped)
 */
export function traceDispatchEvent(args) {
  try {
    if (!isObservabilityEnabled()) return;

    const { lane, runId, numericContext } =
      (args && typeof args === 'object') ? args : {};
    const ctx = sanitizeNumericContext(numericContext ?? {});
    // Identical before/after guarantees ΔU = 0 — honest for A.2.a.
    const stateBefore = buildDispatchState(ctx);
    const stateAfter  = buildDispatchState(ctx);

    traceGateEvaluation({
      lane:  String(lane  ?? ''),
      runId: String(runId ?? ''),
      stateBefore,
      stateAfter,
    });
  } catch (err) {
    _emitWarnOnce(err);
  }
}
