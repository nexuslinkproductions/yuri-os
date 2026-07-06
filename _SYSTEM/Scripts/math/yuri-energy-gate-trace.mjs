#!/usr/bin/env node
// ===========================================================================
// CLAUDE CONTROL PACKET
//   goal:        Give gateProposal a GROUND-TRUTH resolved-outcome log + a replay
//                regression oracle (substrate-frontier-grade B4, the KEYSTONE).
//                Capture every verdict (inputs + decision + a fire-time weight
//                fingerprint); a replay harness re-runs logged transitions as the
//                oracle that catches a decision shift after any gate-core change.
//   target:      NEW module + ONE fail-open, default-OFF line inside gateProposal
//                (right before its return). The clean-path RETURN is unchanged.
//   constraints: OPT-IN (YURI_GATE_TRACE, default off ⇒ no I/O on the clean path);
//                FAIL-OPEN (a trace fault must NEVER break the gate); trace lives in
//                _SYSTEM/state (NOT a protected .claude/state dir); does NOT arm any
//                veto; clean-path byte-identical (proven ∀-input via the B3 prover).
//   acceptance:  replay of real verdicts matches (GREEN); a planted decision-flip
//                mutant is caught (RED); default-OFF writes nothing; the B3 corpus +
//                invariants stay GREEN with the trace ARMED (byte-identical proof).
//   test cmd:    node --test _SYSTEM/Scripts/math/yuri-energy-gate-trace.test.mjs
//   rollback:    rm this file + its .test.mjs; remove the maybeTraceGateVerdict
//                import + the single call in yuri-energy.mjs (gateProposal).
// ===========================================================================
//
// @capability: energy-gate-trace
// @serves: ground-truth resolved-outcome log for the energy gate | gateProposal verdict trace | replay regression oracle for gate decisions | weight-drift detection between fire and resolution | gate decision audit log
// @does: opt-in (default OFF) fail-open capture seam for gateProposal verdicts — appends each (stateBefore,stateAfter,weights,threshold,cap,allowOverride,weightHash)->decision to a JSONL trace; replayGateTrace re-runs logged transitions through the real gate (with the LOGGED weights, so it is drift-immune) as a regression oracle and flags decision shifts, tampered logs, and weight drift; resolveGateVerdict is the operator stub for the resolution side
// @use: set YURI_GATE_TRACE=1 to record live gate verdicts; run replayGateTrace(gateProposal) as a regression oracle in CI / after any gate-core change; resolveGateVerdict to attach the operator's ground-truth outcome to a logged verdict
// @exports: gateTraceEnabled, gateTracePath, corrIdEnabled, deriveCorrId, weightFingerprint, captureGateVerdict, maybeTraceGateVerdict, resolveGateVerdict, readGateTrace, replayGateTrace
//
// WHY THIS IS SAFE TO PUT INSIDE THE LIVE GATE: the only change to gateProposal is a
// single `maybeTraceGateVerdict({...})` call placed AFTER the return value is fully
// computed and BEFORE the `return`. It reads the already-computed verdict, never
// mutates it, and is a no-op unless YURI_GATE_TRACE is set — so with tracing off the
// gate does zero extra work and its return is byte-identical. With tracing on it does
// one append; any fault is swallowed. The accept decision is provably unchanged in
// both modes (the B3 ∀-input prover is the oracle for that claim).

import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';

const _HERE = path.dirname(fileURLToPath(import.meta.url));
// _SYSTEM/Scripts/math/<this> -> repo root is three levels up.
const REPO_ROOT = path.resolve(_HERE, '..', '..', '..');

// Trace path mirrors the claim-transition observer's convention: _SYSTEM/state by
// default (a non-protected runtime-state dir), overridable via YURI_STATE_DIR for
// test isolation. Deliberately NOT under .claude/state (protected, Claude-barred).
function stateDir() {
  return process.env.YURI_STATE_DIR
    ? process.env.YURI_STATE_DIR
    : path.join(REPO_ROOT, '_SYSTEM', 'state');
}
export function gateTracePath() {
  return path.join(stateDir(), 'energy-gate-trace.jsonl');
}

// A flag FILE in the (non-protected) state dir is the PERSISTENT, reversible arm — mirrors the
// energy-enforce.enabled pattern: env OR flag-file enables; absence of BOTH = OFF, so the DISARMED
// degrade contract holds when neither is present. Test isolation: stateDir() honors YURI_STATE_DIR,
// so a suite pointing at a tmp dir never sees the real arm flags.
function flagFileArmed(basename) {
  try { return fs.existsSync(path.join(stateDir(), basename)); } catch { return false; }
}

// OPT-IN switch. Default OFF ⇒ the gate seam is a no-op ⇒ clean path untouched.
// Armed by env YURI_GATE_TRACE=1 OR the flag file _SYSTEM/state/gate-trace.enabled.
export function gateTraceEnabled() {
  const v = process.env.YURI_GATE_TRACE;
  return v === '1' || v === 'true' || flagFileArmed('gate-trace.enabled');
}

// OPT-IN corrId switch. Default OFF ⇒ byte-identical to today (no corrId field).
// When ON, captureGateVerdict stamps a forward correlation id + claimIds on every verdict.
// Armed by env YURI_GATE_TRACE_CORRID=1 OR the flag file _SYSTEM/state/gate-trace-corrid.enabled.
export function corrIdEnabled() {
  const v = process.env.YURI_GATE_TRACE_CORRID;
  return v === '1' || v === 'true' || flagFileArmed('gate-trace-corrid.enabled');
}

// deriveCorrId — build a forward-joinable correlation id from the MOST-SPECIFIC
// available source. Precedence (highest first):
//   claimId (gate is scoring a claim) > traceId (lane output trace id) >
//   gitTrailer (commit-sha from a file-edit verdict) >
//   FALLBACK = proposal-level content hash of {stateBefore, stateAfter, reason, deltaU, subject, kind}
// The fallback is ts-INDEPENDENT: re-firings of the same proposal share one corrId (so the
// outcome joins to the proposal), while different proposals are discriminated by their content.
// This replaced an hour-bucket fallback that collided every identity-less firing in an hour.
export function deriveCorrId({ claimId, traceId, gitTrailer, subject, kind, ts,
  stateBefore, stateAfter, reason, deltaU } = {}) {
  if (claimId != null && String(claimId).trim()) return String(claimId).trim();
  if (traceId != null && String(traceId).trim()) return String(traceId).trim();
  if (gitTrailer != null && String(gitTrailer).trim()) return String(gitTrailer).trim();
  // FALLBACK: PROPOSAL-level content hash. Different proposals (even with no external
  // identity) get distinct corrIds via their state delta + reason + deltaU, killing the
  // old hour-bucket degeneracy where every identity-less firing collided. ts is
  // deliberately EXCLUDED: re-firings of the SAME proposal must share ONE corrId so the
  // eventual outcome joins to the proposal, not to a wall-clock instant (including ts
  // would make every re-evaluation a fresh id and break the firing->outcome join — the
  // whole point of the forward loop). An external claimId/traceId/gitTrailer still wins
  // by precedence above; this content hash is the best-effort proxy when none is supplied.
  const basis = JSON.stringify({
    sb: stateBefore ?? null,
    sa: stateAfter ?? null,
    r: reason ?? '',
    du: Number.isFinite(deltaU) ? deltaU : null,
    s: subject ?? '',
    k: kind ?? '',
  });
  return crypto.createHash('sha256').update(basis).digest('hex').slice(0, 16);
}

// weightFingerprint — a fire-time content WITNESS over the weights the gate used.
// Key-sorted canonical JSON ⇒ order-independent; SHA-256 (16-hex prefix). This is a
// fingerprint (integrity witness), NOT an HMAC signature — there is no secret key.
// It exists so that, when an outcome is resolved LATER, drift in the weight config
// between fire and resolution is detectable (the replay oracle recomputes it and
// compares). Returns null on any fault (fail-open; the caller treats null as "no
// fingerprint", never throws).
export function weightFingerprint(weights) {
  try {
    const obj = weights && typeof weights === 'object' && !Array.isArray(weights) ? weights : {};
    const sorted = {};
    for (const k of Object.keys(obj).sort()) sorted[k] = obj[k];
    return crypto.createHash('sha256').update(JSON.stringify(sorted)).digest('hex').slice(0, 16);
  } catch {
    return null;
  }
}

// Serialize the cap for storage: Infinity (the disabled default) does not survive
// JSON, so map it to the sentinel 'inf' and back on replay.
function capToWire(cap) {
  return cap === Infinity ? 'inf' : cap;
}
function capFromWire(wire) {
  return wire === 'inf' ? Infinity : wire;
}

// Content-addressed verdict id: a stable hash of the full fire-time input set + the
// decision, so a later resolution record can be joined back to its fire and replay
// can dedupe. Uses the weight FINGERPRINT (not the raw weights) to stay compact.
function verdictId(rec) {
  try {
    const basis = JSON.stringify({
      sb: rec.stateBefore,
      sa: rec.stateAfter,
      w: rec.weightHash,
      t: rec.threshold,
      c: rec.cap,
      o: rec.allowOverride,
      d: rec.decision,
    });
    return crypto.createHash('sha256').update(basis).digest('hex').slice(0, 16);
  } catch {
    return null;
  }
}

// captureGateVerdict — build the verdict record and append it to the trace (JSONL).
// Stores the FULL inputs (stateBefore/After/weights/threshold/cap/allowOverride) so
// replay is hermetic, plus the decision and a fire-time weight fingerprint. Returns
// the record on success, null on any fault. NEVER throws (fail-open contract).
export function captureGateVerdict({
  stateBefore, stateAfter, weights, threshold, cap, allowOverride = false,
  accept, reason, deltaU, nowIso = null,
  // trace-hygiene discriminator (2026-06-16): 'session' = live tool-transition tick; synthetic
  // callers (sim/experiment/shadow/study/breaker/best-of-n/mutation/claim/test) stamp their own.
  // Lets a soak filter origin==='session' to the LIVE population (mixed-population trace was a soak trap).
  origin = 'session',
  // corrId sources (only used when YURI_GATE_TRACE_CORRID is ON)
  claimId, traceId, gitTrailer, subject, kind, claimIds,
} = {}) {
  try {
    const weightHash = weightFingerprint(weights);
    const rec = {
      ts: nowIso || new Date().toISOString(),
      origin: typeof origin === 'string' && origin ? origin : 'session', // trace-hygiene tag (live vs synthetic)
      threshold,
      cap: capToWire(cap),
      allowOverride: allowOverride === true,
      weightHash,
      decision: accept === true, // normalize to a strict boolean
      reason: typeof reason === 'string' ? reason : null,
      deltaU: Number.isFinite(deltaU) ? deltaU : null,
      // full inputs for hermetic replay
      stateBefore,
      stateAfter,
      weights,
      // resolution side (operator stub; filled by resolveGateVerdict later)
      resolvedDecision: null,
      resolvedBy: null,
      resolvedAtIso: null,
    };
    // Stamp corrId when the flag is ON (DISARMED by default)
    if (corrIdEnabled()) {
      rec.corrId = deriveCorrId({ claimId, traceId, gitTrailer, subject, kind, ts: rec.ts,
        stateBefore, stateAfter, reason, deltaU });
      // Per-claim outcome join: an AGGREGATE gate firing (e.g. gateClaimTransition) judges a
      // batch of claims at once, so there is no single claimId. Store the worsened claim ids so
      // the outcome side (buildSignals.isReverted over claim-transition-trace) can label the
      // verdict by "did any of these claims revert" — the firing->outcome bridge for the claim path.
      if (Array.isArray(claimIds) && claimIds.length) {
        rec.claimIds = claimIds.map(String);
      }
    }
    rec.id = verdictId(rec);
    const p = gateTracePath();
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.appendFileSync(p, JSON.stringify(rec) + '\n');
    return rec;
  } catch {
    return null; // a trace fault must NEVER affect the gate
  }
}

// maybeTraceGateVerdict — THE GATE SEAM. The single line gateProposal calls. A no-op
// unless tracing is enabled (so the clean path is untouched by default), and fully
// fail-open (a fault here can never propagate into the gate's return).
export function maybeTraceGateVerdict(args) {
  if (!gateTraceEnabled()) return null;
  try {
    return captureGateVerdict(args);
  } catch {
    return null;
  }
}

// resolveGateVerdict — OPERATOR STUB for the resolution side. Appends an append-only
// RESOLUTION record keyed by the fired verdict's id (or corrId when corrId is provided
// and id is not). The replay harness / a future reconciler joins fire→resolution by id.
// Fail-open; returns the resolution record or null.
export function resolveGateVerdict({
  id, corrId, resolvedDecision, resolvedBy = 'operator', nowIso = null, tracePath = gateTracePath(),
} = {}) {
  try {
    const rec = {
      kind: 'resolution',
      id: id ?? null,
      corrId: corrId ?? null,
      resolvedDecision: resolvedDecision === undefined ? null : resolvedDecision,
      resolvedBy,
      resolvedAtIso: nowIso || new Date().toISOString(),
    };
    fs.mkdirSync(path.dirname(tracePath), { recursive: true });
    fs.appendFileSync(tracePath, JSON.stringify(rec) + '\n');
    return rec;
  } catch {
    return null;
  }
}

// readGateTrace — parse the JSONL trace into records. Fail-open: a missing file ⇒ [],
// a corrupt line is skipped (never throws). Includes both verdict and resolution rows.
export function readGateTrace(tracePath = gateTracePath()) {
  try {
    const txt = fs.readFileSync(tracePath, 'utf8');
    return txt.split('\n').filter(Boolean).map((line) => {
      try { return JSON.parse(line); } catch { return null; }
    }).filter(Boolean);
  } catch {
    return [];
  }
}

// replayGateTrace — THE REGRESSION ORACLE. Re-runs every LOGGED verdict through the
// supplied gate function and asserts the decision is unchanged. Three guarantees:
//   1. HERMETIC / drift-immune: replay uses the LOGGED weights (rec.weights), not the
//      current DEFAULT_WEIGHTS — so a weight-config change between fire and replay does
//      NOT cause a false regression. This is the whole reason the inputs are stored.
//   2. DECISION SHIFT detection: any logged decision the gate no longer reproduces is a
//      `mismatch` (the gate-core regression this oracle exists to catch).
//   3. INTEGRITY + DRIFT: recompute the weight fingerprint from rec.weights and compare
//      to the logged rec.weightHash (catches a tampered log → hashIntegrityFailures);
//      and, if referenceWeights is given, count verdicts whose fire-time weights differ
//      from the current reference (driftCount — informational, NOT a regression).
// `ok` = no decision shift AND no integrity failure. Resolution rows are skipped.
export function replayGateTrace(gateFn, { tracePath = gateTracePath(), referenceWeights = null } = {}) {
  const records = readGateTrace(tracePath).filter((r) => r && r.kind !== 'resolution');
  const refHash = referenceWeights ? weightFingerprint(referenceWeights) : null;
  const mismatches = [];
  let matched = 0;
  let hashIntegrityFailures = 0;
  let driftCount = 0;

  for (const rec of records) {
    // integrity: logged weights must still hash to the logged fingerprint
    const recomputed = weightFingerprint(rec.weights);
    if (recomputed !== rec.weightHash) hashIntegrityFailures += 1;
    // drift vs the current reference weights (informational only)
    if (refHash && rec.weightHash !== refHash) driftCount += 1;

    // hermetic replay with the LOGGED weights / cap / override
    let replayed;
    try {
      replayed = gateFn({
        stateBefore: rec.stateBefore,
        stateAfter: rec.stateAfter,
        weights: rec.weights,
        threshold: rec.threshold,
        allowOverride: rec.allowOverride === true,
        maxLadderInversionCap: capFromWire(rec.cap),
      }).result.accept;
    } catch (err) {
      mismatches.push({ id: rec.id, logged: rec.decision, replayed: `THREW:${String((err && err.message) || err)}` });
      continue;
    }
    if (replayed === rec.decision) matched += 1;
    else mismatches.push({ id: rec.id, logged: rec.decision, replayed });
  }

  return {
    total: records.length,
    matched,
    mismatchCount: mismatches.length,
    mismatches: mismatches.slice(0, 20),
    hashIntegrityFailures,
    driftCount,
    ok: mismatches.length === 0 && hashIntegrityFailures === 0,
  };
}

// ---------------------------------------------------------------------------
// CLI worked example — prove capture + replay round-trips, isolated to a temp dir.
// Wrapped in an async IIFE (NOT top-level await): this module and yuri-energy form an
// import cycle (yuri-energy imports the seam from here; here we dynamically import
// yuri-energy for the demo). A top-level await on that dynamic import would deadlock —
// it suspends THIS module's evaluation, which yuri-energy is waiting to finish. The
// IIFE lets the module body complete first, unblocking the cycle, then runs the demo.
// ---------------------------------------------------------------------------
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) (async () => {
  const os = await import('node:os');
  const { gateProposal, DEFAULT_WEIGHTS } = await import('./yuri-energy.mjs');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'gate-trace-'));
  const prevDir = process.env.YURI_STATE_DIR;
  const prevOn = process.env.YURI_GATE_TRACE;
  process.env.YURI_STATE_DIR = tmp;
  process.env.YURI_GATE_TRACE = '1';

  const descBefore = { verifiedEvidenceCount: 0, protectedPathViolations: 0, promotionLadderInversions: 0 };
  const descAfter = { verifiedEvidenceCount: 5, protectedPathViolations: 0, promotionLadderInversions: 0 };
  const vetoAfter = { verifiedEvidenceCount: 5, protectedPathViolations: 1, promotionLadderInversions: 0 };

  const g1 = gateProposal({ stateBefore: descBefore, stateAfter: descAfter });          // accept
  const g2 = gateProposal({ stateBefore: descBefore, stateAfter: vetoAfter });          // veto reject
  const g3 = gateProposal({ stateBefore: descAfter, stateAfter: descBefore, allowOverride: true }); // ascending + override

  const trace = readGateTrace();
  const replay = replayGateTrace(gateProposal, { referenceWeights: DEFAULT_WEIGHTS });

  const lines = [];
  lines.push('yuri-energy-gate-trace — B4 capture + replay oracle');
  lines.push(`captured rows: ${trace.length} (expected 3)`);
  lines.push(`g1 accept=${g1.result.accept} g2 accept=${g2.result.accept} g3 accept=${g3.result.accept}`);
  lines.push(`replay: total=${replay.total} matched=${replay.matched} mismatches=${replay.mismatchCount} integrity=${replay.hashIntegrityFailures} drift=${replay.driftCount}`);
  const okCapture = trace.length === 3;
  const okReplay = replay.ok && replay.matched === replay.total && replay.total === 3;
  lines.push(okCapture && okReplay ? 'OK: capture round-trips, replay reproduces every decision' : 'FAILURE');
  console.log(lines.join('\n'));

  fs.rmSync(tmp, { recursive: true, force: true });
  if (prevDir === undefined) delete process.env.YURI_STATE_DIR; else process.env.YURI_STATE_DIR = prevDir;
  if (prevOn === undefined) delete process.env.YURI_GATE_TRACE; else process.env.YURI_GATE_TRACE = prevOn;
  process.exit(okCapture && okReplay ? 0 : 1);
})();
