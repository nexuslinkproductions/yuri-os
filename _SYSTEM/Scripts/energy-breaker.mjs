#!/usr/bin/env node
/**
 * energy-breaker — a circuit breaker over the TRAILING energy verdict.
 *
 * Cross-domain transfer (resilience-engineering -> agent governance, 2026-06-03):
 * the distributed-systems Circuit Breaker pattern (resilience4j / Hystrix / Polly)
 * ported to the YURI work-dynamics gate. States CLOSED / OPEN / HALF_OPEN, with a
 * bounded cooldown (OPEN -> HALF_OPEN) and an auto-escape (HALF_OPEN -> CLOSED) so
 * the breaker can NEVER permanently brick a session — the documented #1 failure
 * mode of half-open breakers ("stuck in HALF_OPEN").
 *
 * The structural mismatch resolved: resilience4j wraps the SAME call it measures;
 * YURI's verdict is TRAILING (computed PostToolUse, read PreToolUse), so the
 * "probe" is the next real tool call, judged at its own PostToolUse. Catastrophic,
 * NON-offsettable verdicts (protected-path veto / structural-floor veto) trip the
 * breaker IMMEDIATELY (single event, no failure-rate window). Soft ascending-deltaU
 * is advisory STEER only, never a trip — keeping false-positives ~0.
 *
 * Layering: this is layer-2 defense-in-depth UNDER the deterministic
 * operator-write-guard + settings deny-list (the real protected-path floor). It
 * therefore FAILS OPEN on any data gap (missing/malformed snapshot) and only ever
 * RESTRICTS via deny when explicitly enabled. Pure + testable; the hooks do I/O.
 */
import { gateProposal, DEFAULT_MAX_LADDER_INVERSION_CAP } from './math/yuri-energy.mjs';
import { toGateState } from './energy-tick-core.mjs';
import { cusum, scalarKalman } from './math/math-kernel.mjs';

export const BREAKER_STATE = Object.freeze({ CLOSED: 'CLOSED', OPEN: 'OPEN', HALF_OPEN: 'HALF_OPEN' });
const VALID_STATES = new Set(Object.values(BREAKER_STATE));
const DELTAU_CAP = 20; // bound the rolling band so a long session never grows it

// Defaults are STANDARDS, not law — env-overridable now, energy-weights.json later.
export const DEFAULT_BREAKER_CFG = Object.freeze({
  waitDurationMs: 20000,   // OPEN -> HALF_OPEN cooldown; fail-fast window after a trip
  maxHalfOpenMs: 60000,    // HALF_OPEN auto-escape to CLOSED (anti-stuck guard)
  steerAscentWindow: 5,    // recent deltaU samples that define the soft-steer band
  steerAscentCount: 3,     // >= this many positive deltaU in window -> steer advisory
});

export function loadBreakerCfg(env = process.env) {
  const num = (v, d) => { const n = Number(v); return Number.isFinite(n) && n >= 0 ? n : d; };
  return {
    waitDurationMs: num(env.YURI_ENERGY_BREAKER_WAIT_MS, DEFAULT_BREAKER_CFG.waitDurationMs),
    maxHalfOpenMs: num(env.YURI_ENERGY_BREAKER_HALFOPEN_MS, DEFAULT_BREAKER_CFG.maxHalfOpenMs),
    steerAscentWindow: DEFAULT_BREAKER_CFG.steerAscentWindow,
    steerAscentCount: DEFAULT_BREAKER_CFG.steerAscentCount,
  };
}

export function freshBreaker() {
  return { state: BREAKER_STATE.CLOSED, openedAt: 0, halfOpenAt: 0, reason: '', recentDeltaU: [], lastVerdictAt: 0 };
}

/** Coerce any persisted/garbage breaker blob into a valid breaker (fail-open: -> CLOSED). */
export function normBreaker(b) {
  if (!b || typeof b !== 'object' || Array.isArray(b)) return freshBreaker();
  let state = VALID_STATES.has(b.state) ? b.state : BREAKER_STATE.CLOSED;
  const openedAt = Number.isFinite(b.openedAt) ? b.openedAt : 0;
  const halfOpenAt = Number.isFinite(b.halfOpenAt) ? b.halfOpenAt : 0;
  // Fail-open: a tripped (OPEN) or probing (HALF_OPEN) state without a trustworthy
  // positive timestamp cannot have its cooldown/dwell computed — so a corrupt or
  // tampered timing field would otherwise freeze a block. Distrust it -> CLOSED.
  if (state === BREAKER_STATE.OPEN && !(openedAt > 0)) state = BREAKER_STATE.CLOSED;
  if (state === BREAKER_STATE.HALF_OPEN && !(halfOpenAt > 0)) state = BREAKER_STATE.CLOSED;
  return {
    state,
    openedAt,
    halfOpenAt,
    reason: typeof b.reason === 'string' ? b.reason.slice(0, 120) : '',
    recentDeltaU: Array.isArray(b.recentDeltaU)
      ? b.recentDeltaU.filter((x) => Number.isFinite(x)).slice(-DELTAU_CAP)
      : [],
    lastVerdictAt: Number.isFinite(b.lastVerdictAt) ? b.lastVerdictAt : 0,
  };
}

/**
 * Compact verdict for a transition (prev -> next control-plane state). Never throws:
 * a thrown gate (malformed states) fails CLOSED (red-team #2) — an enforcing layer that
 * cannot prove safety must treat the transition as catastrophic, not wave it through.
 * (Garbage INPUTS are a different case: toGateState normalizes them into a clean
 * fresh state → accept — input-normalization is fail-open by design, layer-2.)
 * The LIVE tick path no longer calls this — tickAndTrace derives the verdict from
 * its own traced gateResult (single evaluation, single book). Kept exported for
 * tests/standalone callers.
 */
export function verdictFromStates(prevState, nextState, opts = {}) {
  try {
    const g = gateProposal({
      stateBefore: toGateState(prevState),
      stateAfter: toGateState(nextState),
      maxLadderInversionCap: opts.maxLadderInversionCap ?? DEFAULT_MAX_LADDER_INVERSION_CAP,
      threshold: opts.threshold,
    });
    const r = g.result;
    return {
      accept: r.accept === true,
      protectedPathVeto: r.protectedPathVeto === true,
      structuralFloorVeto: r.structuralFloorVeto === true,
      maxSeverityVeto: r.maxSeverityVeto === true,
      gateErrorVeto: false,
      deltaU: Number.isFinite(r.deltaU) ? r.deltaU : 0,
      dominantTerm: r.dominantTerm || null,
    };
  } catch (err) {
    return { accept: false, protectedPathVeto: false, structuralFloorVeto: false, maxSeverityVeto: false, gateErrorVeto: true, deltaU: 0, dominantTerm: 'gateProposal', error: err.message };
  }
}

/** The catastrophic, non-offsettable classes that trip the breaker on a single event. */
export function isCatastrophic(verdict) {
  return !!(verdict && (verdict.protectedPathVeto === true || verdict.structuralFloorVeto === true || verdict.maxSeverityVeto === true || verdict.gateErrorVeto === true));
}

/**
 * OUTCOME-driven transition (PostToolUse, verdict is known). Pure; never mutates input.
 *   - catastrophic verdict        -> OPEN (trip), from ANY state
 *   - HALF_OPEN + clean accept     -> CLOSED (probe recovered)
 *   - else                         -> state unchanged (rolls the steer band)
 */
export function transitionOnVerdict(breaker, verdict, nowMs) {
  const b = normBreaker(breaker);
  const at = Number.isFinite(nowMs) ? nowMs : 0;
  const dU = (verdict && Number.isFinite(verdict.deltaU)) ? verdict.deltaU : 0;
  const recentDeltaU = [...b.recentDeltaU, dU].slice(-DELTAU_CAP);
  const next = { ...b, recentDeltaU, lastVerdictAt: at };

  if (isCatastrophic(verdict)) {
    next.state = BREAKER_STATE.OPEN;
    next.openedAt = at;
    next.halfOpenAt = 0;
    next.reason = verdict.protectedPathVeto
      ? 'protected-path veto'
      : verdict.structuralFloorVeto
        ? 'structural-floor veto'
        : verdict.maxSeverityVeto
          ? 'max-severity veto'
          : 'gate-error veto';
    return next;
  }
  if (b.state === BREAKER_STATE.HALF_OPEN && verdict && verdict.accept === true) {
    next.state = BREAKER_STATE.CLOSED;
    next.openedAt = 0;
    next.halfOpenAt = 0;
    next.reason = '';
    return next;
  }
  return next;
}

/**
 * TIME-driven enforcement read (PreToolUse). Pure; returns { decision, reason, breaker }.
 *   decision: 'allow' | 'deny' | 'probe' | 'steer'
 * The CALLER decides whether 'deny' actually blocks (enforce flag) or is metrics-only.
 * Always returns the (possibly advanced) breaker so the caller can persist state.
 *   - OPEN, within cooldown      -> deny (fail-fast)
 *   - OPEN, cooldown elapsed     -> probe (OPEN -> HALF_OPEN; this call is the probe)
 *   - HALF_OPEN, within dwell    -> probe (probe in flight)
 *   - HALF_OPEN, dwell exceeded  -> allow (auto-escape -> CLOSED; anti-stuck)
 *   - CLOSED, ascending deltaU   -> steer (advisory; never blocks)
 *   - CLOSED                     -> allow
 */
export function evaluateGate(breaker, nowMs, cfg = DEFAULT_BREAKER_CFG) {
  const b = normBreaker(breaker);
  const now = Number.isFinite(nowMs) ? nowMs : 0;
  const c = { ...DEFAULT_BREAKER_CFG, ...(cfg || {}) };

  if (b.state === BREAKER_STATE.OPEN) {
    const elapsed = now - b.openedAt;
    // Cooldown elapsed -> probe. A NEGATIVE elapsed means openedAt is in the FUTURE
    // (clock skew, NTP step, or a tampered timestamp): the cooldown could never
    // legitimately count down, so a strict `elapsed >= wait` would DENY FOREVER — a
    // permanent-block bug, the OPEN-state cousin of "stuck in HALF_OPEN" (found via
    // the disclosed bug-bounty business-logic cross-ref, 2026-06-03). Treat an
    // untrustworthy/future openedAt as ready-to-probe: fail toward recovery, never
    // toward a permanent block.
    if (elapsed < 0 || elapsed >= c.waitDurationMs) {
      return {
        decision: 'probe',
        reason: `energy breaker cooldown elapsed; probing recovery after ${b.reason || 'a veto'}`,
        breaker: { ...b, state: BREAKER_STATE.HALF_OPEN, halfOpenAt: now },
      };
    }
    const waitLeft = Math.max(0, Math.ceil((c.waitDurationMs - elapsed) / 1000));
    return {
      decision: 'deny',
      reason: `energy circuit-breaker OPEN — the prior transition tripped a ${b.reason || 'catastrophic veto'} (non-offsettable). Fail-fast ~${waitLeft}s, then it probes recovery. Address the violation, or set YURI_ENERGY_BREAKER_RESET=1 to force-close.`,
      breaker: b,
    };
  }

  if (b.state === BREAKER_STATE.HALF_OPEN) {
    const dwell = now - b.halfOpenAt;
    if (dwell > c.maxHalfOpenMs) {
      return {
        decision: 'allow',
        reason: 'energy breaker HALF_OPEN auto-escape (probe unresolved) -> CLOSED',
        breaker: { ...b, state: BREAKER_STATE.CLOSED, openedAt: 0, halfOpenAt: 0, reason: '' },
      };
    }
    return { decision: 'probe', reason: 'energy breaker HALF_OPEN — probe in flight', breaker: b };
  }

  // CLOSED: soft ascending-deltaU steer (advisory only)
  const win = b.recentDeltaU.slice(-c.steerAscentWindow);
  const positives = win.filter((x) => x > 0).length;
  if (win.length >= c.steerAscentWindow && positives >= c.steerAscentCount) {
    return {
      decision: 'steer',
      reason: `energy rising: ${positives}/${win.length} recent transitions raised ΔU — verify before continuing`,
      breaker: b,
    };
  }
  return { decision: 'allow', reason: '', breaker: b };
}

// ── ADVISORY trend readout (computed/shadow metric — NEVER a trip cause) ─────────
// Catalog cards #2 (CUSUM change-point) + #1 (scalar-Kalman recovery) over the
// breaker's SIGNED ΔU history. This is a READOUT the breaker EXPOSES for metrics /
// burn-in audit; it is intentionally NOT called by evaluateGate or
// transitionOnVerdict, so the 3-state CLOSED/OPEN/HALF_OPEN trip logic, thresholds,
// and the energy-enforce veto are byte-identical with or without it. CUSUM catches
// the SLOW ROT the shock-only steer band is blind to (a thread drifting
// progressing->degrading where no single ΔU is an outlier); Kalman-q gives the
// re-sensitization readout. Scale-free per the no-fixed-ΔU-number discipline:
// k = 0.5·runningMAD, h = 5·MAD, μ0 = recent median signed ΔU.

/** Median of a numeric array (non-mutating). Returns 0 for an empty array. */
function medianOf(values) {
  if (!Array.isArray(values) || values.length === 0) return 0;
  const sorted = values.filter((x) => Number.isFinite(x)).slice().sort((a, b) => a - b);
  if (sorted.length === 0) return 0;
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

/** Median Absolute Deviation — robust scale, blind to the outliers MAD must survive. */
function madOf(values) {
  const finite = (Array.isArray(values) ? values : []).filter((x) => Number.isFinite(x));
  if (finite.length === 0) return 0;
  const med = medianOf(finite);
  return medianOf(finite.map((x) => Math.abs(x - med)));
}

/** Population std-dev — non-degenerate scale fallback when MAD collapses to 0. */
function stdOf(values) {
  const finite = (Array.isArray(values) ? values : []).filter((x) => Number.isFinite(x));
  if (finite.length < 2) return 0;
  const mean = finite.reduce((a, b) => a + b, 0) / finite.length;
  return Math.sqrt(finite.reduce((a, b) => a + (b - mean) ** 2, 0) / finite.length);
}

/**
 * ADVISORY-ONLY signed-ΔU regime readout. Pure; never throws (a broken instrument
 * must not invent a regime change). Returns a flat in-control readout when the
 * sample is too small or scale is degenerate. NOTHING in here can deny, trip, or
 * steer — it is purely a number the breaker exposes.
 *
 * @returns {{ available:boolean, alarm:boolean, changeIndex:number, statistic:number,
 *             peak:number, k:number, h:number, mu0:number, samples:number,
 *             kalman:{ estimate:number, surprisedCount:number } }}
 */
export function trendReadout(recentDeltaU, opts = {}) {
  const flat = {
    available: false, alarm: false, changeIndex: -1, statistic: 0, peak: 0,
    k: 0, h: 0, mu0: 0, samples: 0,
    kalman: { estimate: 0, surprisedCount: 0 },
  };
  try {
    const stream = (Array.isArray(recentDeltaU) ? recentDeltaU : []).filter((x) => Number.isFinite(x));
    const minSamples = Number.isFinite(opts.minSamples) && opts.minSamples > 0 ? opts.minSamples : 4;
    if (stream.length < minSamples) return flat;

    // Scale-free dial. Floor MAD with 0.6745·std (= MAD for a Gaussian) so a clean
    // ramp whose MAD collapses to 0 doesn't blind the detector; std is only 0 on a
    // truly constant stream, which carries no regime signal.
    const scale = Math.max(madOf(stream), 0.6745 * stdOf(stream));
    // Degenerate scale (a flat/constant stream) => no admissible dial => report
    // in-control rather than fabricate an alarm with h<=0.
    if (!(scale > 0)) return { ...flat, available: true, samples: stream.length, mu0: medianOf(stream) };

    const k = (Number.isFinite(opts.kFactor) ? opts.kFactor : 0.5) * scale;
    const h = (Number.isFinite(opts.hFactor) ? opts.hFactor : 5) * scale;
    const mu0 = medianOf(stream);

    const c = cusum(stream, { k, h, mu0 });
    // Kalman recovery readout over the same signed stream (q drives re-sensitization).
    const ka = scalarKalman(stream, {
      q: Number.isFinite(opts.q) ? opts.q : 0.3 * scale,
      r: Number.isFinite(opts.r) && opts.r > 0 ? opts.r : Math.max(scale, 1e-9),
    });

    return {
      available: true,
      alarm: c.alarm === true,
      changeIndex: c.changeIndex,
      statistic: c.statistic,
      peak: c.peak,
      k, h, mu0,
      samples: stream.length,
      kalman: { estimate: ka.estimate, surprisedCount: ka.surprisedCount },
    };
  } catch {
    return flat;
  }
}
