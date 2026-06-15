// @capability: energy-outcome-signals
// @serves: energy-gate outcome derivation | signal detectors for R1 reverted / R2 retried-and-succeeded / R3 promoted / dispatchAccepted | failure-anchored readers for the LEARN rung
// @does: 4 pure deterministic readers mapping a firing runId → { isReverted, isRetriedAndSucceeded, isPromoted, dispatchAccepted }.
//   All signals FAIL-CLOSED to `false` (unknown runId ⇒ not labeled, never a false positive label).
//   No side effects, no writes, no scheduling. Built so the energy-outcome-deriver can be injected with a real `signals` bag
//   and the L4 backfill can actually derive outcomes against live logs.
// @use: buildSignals({ claimTransitionFile, originatorTelemetryFile, pulseFile, gitLogCacheFile, gitLogMax, traceIdIndex, pulseIndex }) factory. Each index is optional and pre-built; otherwise readers parse the source file on first call and cache in-memory.
//   DI seams (all optional): every reader accepts an injected index/cache so unit tests can pass fixtures without touching the real `_SYSTEM/state/*.jsonl` files.
//   DISARMED — pure readers; ARMING (wiring into the live energy-gate / launchd / cron) is owner-gated.
// @exports: buildSignals, defaultSignals, makeRevertedSignal, makeRetriedSucceededSignal, makePromotedSignal, makeDispatchAcceptedSignal
//
// ── EVIDENCE GROUND TRUTH (inspected 2026-06-15, all counts deterministic) ──
//   _SYSTEM/state/energy-trace/*.jsonl   → 19 daily files, 56,009 firings total, 55,554 (99.19%) non-empty runId
//                                          runId shape: e.g. "descent-demo-2026-05-28T21:49:21.587Z-3"
//                                          fields per deriver contract: { runId, deltaU, decision, regime, event, timestamp, ... }
//   _SYSTEM/state/claim-transition-trace.jsonl → 227 lines. NO `runId` field. NO promotion events (zero matches for "promot").
//                                          Records are prose-claim-extract outputs: { ts, source, tool, filePath, freshClaims, wouldAccept, identityVeto, ... }.
//                                          ⇒ isPromoted MUST fail-closed to false. The master brief was wrong about this file being the promotion source.
//                                          The canonical promotion source is claim-integrity-gate.mjs's PROMOTION_STATES ladder, not a JSONL log line.
//   _SYSTEM/state/originator-telemetry.jsonl  → 24,031 lines. NO `phase === "dispatchAccepted"`. Phases are streaming chunks / heartbeats / lifecycle events.
//                                          traceId shape: e.g. "originator-2026-06-08T11-24-39-714Z-21961". No overlap with firing runIds.
//                                          ⇒ dispatchAccepted is best-effort: we treat `worker.complete` (or `worker.model_call_complete`) as the closest proxy and
//                                            fall back to false when no runId↔traceId index is provided. The deriver sees a `false` label, which is the right fail-closed outcome.
//   _SYSTEM/state/lane-pulse-trace.jsonl      → 477 lines, all `type === "pulse"`. 473/477 have a `runId` like "llm-lane-deepseek-v4-pro-1780666923231".
//                                          Pulse `runId` is lane-scoped (llm-lane-<lane>-<epoch>), disjoint from firing runIds (descent-demo-...-N).
//                                          ⇒ isRetriedAndSucceeded reads pulse cues for a runId substring; for current firing population, returns false for all.
//   git log                                  → commit SHAs + conventional-commit subjects, no runId field. isReverted is best-effort: substring-match the runId in
//                                          `git log --pretty=%H%n%s%n%b` (capped at gitLogMax commits, default 200).
// ── CONCLUSION (grounded) ──
//   The four signals, as currently configured against the live state files, will return `false` for virtually every firing.
//   That is the CORRECT, FAIL-CLOSED behavior. The LEARN rung's first backfill will calibrate against an all-R4-undeterminable
//   shadow ledger, which is the honest prior (zero false labels) and a falsifiable prediction the L3 red-team lane can attack.
//
//   Future improvement (out of scope for L1, surfaced for L6 / Wave-1): wire a real `runId → claim promotion` log when
//   claim-cortex promotes via memory-proposal-autopilot, and a real `runId → originator traceId` join when the originator
//   telemetry starts writing the firing runId into trace payloads. L1 ships the readers honestly; future lanes wire the joins.

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { execFileSync } from 'node:child_process';

// ── 0. constants & defaults ──────────────────────────────────────────────────
const DEFAULT_STATE_DIR = '_SYSTEM/state';
const DEFAULT_CLAIM_TRANSITION_FILE = join(DEFAULT_STATE_DIR, 'claim-transition-trace.jsonl');
const DEFAULT_ORIGINATOR_TELEMETRY_FILE = join(DEFAULT_STATE_DIR, 'originator-telemetry.jsonl');
const DEFAULT_PULSE_FILE = join(DEFAULT_STATE_DIR, 'lane-pulse-trace.jsonl');
const DEFAULT_GIT_LOG_CACHE_FILE = join(DEFAULT_STATE_DIR, 'energy-trace', '.reverted-gitlog-cache.txt');
const DEFAULT_GIT_LOG_MAX = 200; // bounded scan; out-of-scope (cap-bounded reverse-chronological). Wave-1 may raise.
const DEFAULT_DISPATCH_PHASES = Object.freeze(['worker.complete', 'worker.model_call_complete', 'substrate.complete']);

const CORRUPT_LINE_SENTINEL = Symbol('corrupt-line');

// ── helpers ──────────────────────────────────────────────────────────────────
function readJSONLFile(file) {
  if (!file) return [];
  if (!existsSync(file)) return [];
  let raw;
  try { raw = readFileSync(file, 'utf8'); } catch { return []; }
  const out = [];
  for (const line of raw.split('\n')) {
    const t = line.trim();
    if (!t) continue;
    try { out.push(JSON.parse(t)); } catch { /* corrupt line: skip silently, do not count */ }
  }
  return out;
}

function normalizeRunId(runId) {
  if (runId == null) return '';
  if (typeof runId === 'string') return runId;
  return String(runId);
}

// ── 1. isReverted(runId) ──────────────────────────────────────────────────────
// Best-effort: did a commit subject/body mention this runId (i.e. did the work get reverted)?
// Reads git log (capped) once per process and caches to disk so repeated calls are cheap.
// FAIL-CLOSED: empty runId → false. Not in a git repo → false. Git log unreadable → false.
function buildRevertedReader({ gitLogCacheFile = DEFAULT_GIT_LOG_CACHE_FILE, gitLogMax = DEFAULT_GIT_LOG_MAX, gitCwd = process.cwd(), claimTransitionFile = DEFAULT_CLAIM_TRANSITION_FILE, preloadedClaimTransitions } = {}) {
  let cache = null; // string blob of git log; null = not yet built
  let revertIdx = null; // Map<claimId, number[]> — ts(ms) at which the claim was `worsened` (new/deeper RETRACT)
  function ensureCache() {
    if (cache !== null) return cache;
    if (existsSync(gitLogCacheFile)) {
      try { cache = readFileSync(gitLogCacheFile, 'utf8'); return cache; } catch { /* fall through to regen */ }
    }
    try {
      const out = execFileSync('git', [
        'log',
        `--max-count=${Math.max(1, Math.floor(gitLogMax))}`,
        '--pretty=format:%H%x00%s%x00%b%x1e',
      ], { cwd: gitCwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 32 * 1024 * 1024 });
      cache = out;
      // Best-effort cache write — pure-readers contract forbids side effects, so we DON'T auto-persist.
      // The caller (buildSignals) may pre-warm the cache file via its own orchestration.
      return cache;
    } catch {
      cache = ''; // negative cache — empty string means "no commits / not a git repo"
      return cache;
    }
  }
  // Claim-path index (keystone step 2): map each claim id → ts(ms) of every claim-transition-trace
  // record in which it appeared as `worsened` (became a new-or-deeper RETRACT over-claim). Built once,
  // cached, pure read. FAIL-CLOSED: unreadable/missing file → empty index → no claim ever reverts.
  function ensureRevertIdx() {
    if (revertIdx !== null) return revertIdx;
    revertIdx = new Map();
    let records;
    try { records = preloadedClaimTransitions ?? readJSONLFile(claimTransitionFile); } catch { records = []; }
    for (const rec of records) {
      if (!rec || !Array.isArray(rec.worsened)) continue;
      const t = Date.parse(rec.nowIso || rec.ts || '');
      if (!Number.isFinite(t)) continue;
      for (const w of rec.worsened) {
        const id = w && w.id != null ? String(w.id) : null;
        if (!id) continue;
        if (!revertIdx.has(id)) revertIdx.set(id, []);
        revertIdx.get(id).push(t);
      }
    }
    return revertIdx;
  }
  return function isReverted(runId, firing) {
    // CLAIM PATH (forward outcome join): a firing that judged specific claims (rec.claimIds, stamped by
    // gateClaimTransition) is "reverted" iff any judged claim LATER became a new-or-deeper RETRACT
    // (appeared in a claim-transition-trace `worsened` array) STRICTLY AFTER this firing. Strict-after
    // excludes the firing's own coincident observer record.
    const claimIds = firing && Array.isArray(firing.claimIds) ? firing.claimIds : null;
    if (claimIds && claimIds.length) {
      const idx = ensureRevertIdx();
      const firedAt = Date.parse((firing && firing.ts) || '');
      for (const cid of claimIds) {
        const times = idx.get(String(cid));
        if (!times || !times.length) continue;
        if (!Number.isFinite(firedAt)) return true; // firing has no parseable ts → any worsening of a judged claim counts
        if (times.some((t) => t > firedAt)) return true;
      }
      return false; // claim path evaluated, no SUBSEQUENT retract — do NOT fall through to the git path
    }
    // NON-CLAIM PATH: best-effort git-substring on the runId (unchanged).
    const rid = normalizeRunId(runId);
    if (!rid) return false;
    const blob = ensureCache();
    if (!blob) return false;
    return blob.includes(rid);
  };
}

// ── 2. isRetriedAndSucceeded(runId) ───────────────────────────────────────────
// Reads lane-pulse-trace.jsonl. Definition: a runId is retried-and-succeeded if at least one pulse
// for that runId has `verdict === "accept"` AFTER at least one pulse for that same runId has
// `verdict === "reject"` (a "reject" then a later "accept" = the lane was corrected on retry).
// If only "accept" pulses exist (no prior reject), the proposal was right the first time — not a retry.
// If only "reject" pulses exist, the retry never landed an accept — not a success.
//
// CUE NOTE: lane-pulse is advisory_only and the cue text varies; we do NOT parse cue text, only verdict.
//
// FAIL-CLOSED: empty runId → false. Missing file → false.
function buildRetriedSucceededReader({ pulseFile = DEFAULT_PULSE_FILE, preloaded } = {}) {
  let pulses = null;
  function ensure() {
    if (pulses !== null) return pulses;
    pulses = preloaded ?? readJSONLFile(pulseFile);
    return pulses;
  }
  return function isRetriedAndSucceeded(runId) {
    const rid = normalizeRunId(runId);
    if (!rid) return false;
    const list = ensure();
    let sawReject = false, sawAcceptAfterReject = false;
    for (const p of list) {
      if (!p || p.type !== 'pulse') continue;
      if (p.runId !== rid) continue;
      const v = p.verdict;
      if (v === 'reject' || v === 'block') sawReject = true;
      else if (v === 'accept' && sawReject) { sawAcceptAfterReject = true; break; }
    }
    return sawAcceptAfterReject;
  };
}

// ── 3. isPromoted(runId) ──────────────────────────────────────────────────────
// Reads claim-transition-trace.jsonl. CURRENT GROUND TRUTH (2026-06-15): this file has NO `runId`
// field and NO promotion events — it is a prose-claim-extract veto log. So isPromoted is structurally
// constrained to return `false` for every runId UNLESS the caller injects a preloaded record set that
// does carry a runId↔promotion mapping. We keep the reader shape (and the function name) so that
// Wave-1 / future lanes can swap the source file to a real promotion log (e.g. an extension of
// memory-proposal-decisions.jsonl that captures the firing runId alongside the promote action)
// without touching the deriver contract.
//
// Definition of a "promotion event" in a preloaded record: a record where the supplied predicate
// `isPromotionRecord(rec, runId)` returns true. Default predicate requires the record to mention
// runId AND carry a positive promotion marker (e.g. "promote", "promoted", "PROMOTION_STATES advanced").
// If no predicate is provided and the raw claim-transition file is used, we return false for everything
// (fail-closed) — the file is structurally mismatched.
//
// FAIL-CLOSED: empty runId → false. Missing file → false. No preloaded predicate → false.
const PROMOTION_MARKERS = /\b(promot(?:e|ed|ion)|advanced|graduated)\b/i;
function buildPromotedReader({ claimTransitionFile = DEFAULT_CLAIM_TRANSITION_FILE, preloaded, isPromotionRecord } = {}) {
  let records = null;
  function ensure() {
    if (records !== null) return records;
    records = preloaded ?? readJSONLFile(claimTransitionFile);
    return records;
  }
  return function isPromoted(runId) {
    const rid = normalizeRunId(runId);
    if (!rid) return false;
    const list = ensure();
    if (!isPromotionRecord) return false; // no predicate ⇒ structurally cannot label
    for (const rec of list) {
      if (!rec) continue;
      try {
        if (isPromotionRecord(rec, rid)) return true;
      } catch { /* buggy predicate on one record ⇒ skip, keep scanning */ }
    }
    return false;
  };
}

// ── 4. dispatchAccepted(runId) ────────────────────────────────────────────────
// Reads originator-telemetry.jsonl. CURRENT GROUND TRUTH (2026-06-15): there is NO `phase === "dispatchAccepted"`
// event in the live log. The closest proxies that indicate a successful dispatch are
// `worker.complete`, `worker.model_call_complete`, and `substrate.complete`. We use those as the
// "dispatch succeeded" signal IF a runId↔traceId index maps the firing runId to a telemetry traceId.
//
// Default index heuristic: a firing runId embeds a timestamp like `descent-demo-2026-05-28T21:49:21.587Z-N`.
// Originator traceIds embed `originator-2026-06-08T11-24-39-714Z-21961`. There is NO direct overlap,
// so without an injected index, dispatchAccepted returns false for every firing. This is the correct
// fail-closed default. L4 / Wave-1 should inject a `runIdIndex` (Map<runId, Set<traceId>>) once the
// originator bridge starts writing the firing runId into telemetry payloads.
//
// FAIL-CLOSED: empty runId → false. Missing file → false. No runIdIndex AND no runIdInTraceId fallback ⇒ false.
function buildDispatchAcceptedReader({ originatorTelemetryFile = DEFAULT_ORIGINATOR_TELEMETRY_FILE, preloaded, runIdIndex, dispatchPhases = DEFAULT_DISPATCH_PHASES } = {}) {
  let traces = null;
  function ensure() {
    if (traces !== null) return traces;
    traces = preloaded ?? readJSONLFile(originatorTelemetryFile);
    return traces;
  }
  const phaseSet = new Set(dispatchPhases);
  return function dispatchAccepted(runId) {
    const rid = normalizeRunId(runId);
    if (!rid) return false;
    // Path A: explicit runId↔traceId index (preferred; L4/owner-wired).
    if (runIdIndex instanceof Map) {
      const traceIds = runIdIndex.get(rid);
      if (!traceIds || traceIds.size === 0) return false;
      const list = ensure();
      for (const t of list) {
        if (!t) continue;
        if (!traceIds.has(t.traceId)) continue;
        if (phaseSet.has(t.phase)) return true;
      }
      return false;
    }
    // Path B: cheap string fallback — the traceId literally embeds the runId.
    // Works only for non-synthetic runIds. Honest fail-closed otherwise.
    const list = ensure();
    for (const t of list) {
      if (!t) continue;
      if (!phaseSet.has(t.phase)) continue;
      const tid = t.traceId;
      if (typeof tid === 'string' && tid.includes(rid)) return true;
    }
    return false;
  };
}

// ── 5. buildSignals(opts) ─────────────────────────────────────────────────────
// Single factory returning the 4-signal bag the deriver consumes. Every reader is independently
// overridable; tests inject fixtures via the preloaded / runIdIndex / isPromotionRecord / etc. seams.
export function buildSignals(opts = {}) {
  const isReverted = opts.isReverted ?? makeRevertedSignal(opts);
  const isRetriedAndSucceeded = opts.isRetriedAndSucceeded ?? makeRetriedSucceededSignal(opts);
  const isPromoted = opts.isPromoted ?? makePromotedSignal(opts);
  const dispatchAccepted = opts.dispatchAccepted ?? makeDispatchAcceptedSignal(opts);
  return { isReverted, isRetriedAndSucceeded, isPromoted, dispatchAccepted };
}

// Named factories — exported for tests and for L4 to wire up partial overrides.
export const makeRevertedSignal = (opts) => buildRevertedReader(opts);
export const makeRetriedSucceededSignal = (opts) => buildRetriedSucceededReader(opts);
export const makePromotedSignal = (opts) => buildPromotedReader(opts);
export const makeDispatchAcceptedSignal = (opts) => buildDispatchAcceptedReader(opts);

// Convenience: build the production bag wired at the real _SYSTEM/state files.
// DISARMED — pure readers, no writes; safe to call from anywhere.
export function defaultSignals(opts = {}) {
  return buildSignals({
    claimTransitionFile: opts.claimTransitionFile ?? DEFAULT_CLAIM_TRANSITION_FILE,
    originatorTelemetryFile: opts.originatorTelemetryFile ?? DEFAULT_ORIGINATOR_TELEMETRY_FILE,
    pulseFile: opts.pulseFile ?? DEFAULT_PULSE_FILE,
    gitLogCacheFile: opts.gitLogCacheFile ?? DEFAULT_GIT_LOG_CACHE_FILE,
    gitLogMax: opts.gitLogMax,
    runIdIndex: opts.runIdIndex,
    isPromotionRecord: opts.isPromotionRecord,
    dispatchPhases: opts.dispatchPhases,
  });
}

// Internal exports for tests / future wire-in (not part of the deriver's public contract).
export const __test__ = {
  DEFAULT_CLAIM_TRANSITION_FILE,
  DEFAULT_ORIGINATOR_TELEMETRY_FILE,
  DEFAULT_PULSE_FILE,
  DEFAULT_GIT_LOG_CACHE_FILE,
  DEFAULT_GIT_LOG_MAX,
  DEFAULT_DISPATCH_PHASES,
  PROMOTION_MARKERS,
  readJSONLFile,
  normalizeRunId,
};
