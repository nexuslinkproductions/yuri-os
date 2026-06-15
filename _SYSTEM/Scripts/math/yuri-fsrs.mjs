#!/usr/bin/env node
/**
 * yuri-fsrs.mjs — power-law retention scorer for the subconscious memory loop.
 *
 * Forgetting is loss of RETRIEVAL strength, not trace erasure (Bjork's New Theory of
 * Disuse; silent engrams, neuroscience-corpus NEU-CONS-04 / NEU-FORG-01). This module
 * computes how RETRIEVABLE a memory is right now, so the relocator can DEMOTE (relocate
 * + down-weight) low-retrievability items instead of deleting them — and so a recall can
 * raise retrievability back up (the testing effect).
 *
 * Retrievability follows the validated FSRS power-law curve:
 *     R(t) = (1 + FACTOR * t / S) ^ DECAY        with R(t=S) = 0.9
 * where t = days since last USE (not write-time, not atime — the bug that broke the old
 * evictor) and S = stability (days). Salience and use-frequency feed STABILITY, so an
 * important or often-recalled memory decays SLOWER (consolidation → durability), exactly
 * as the brain preferentially consolidates high-salience traces.
 *
 * Pure + injectable: no I/O, no clock, no config file read — callers pass `nowMs`, the
 * usage record, and the knob block (sourced from energy-weights.json `fsrs:{}` by the
 * caller). This mirrors the house style of yuri-energy.mjs so it is unit-testable in
 * isolation. Embedding-free (pure arithmetic) — honors the no-RAG / FTS5-only constraint.
 */

// FSRS-4.5 curve constants: DECAY=-0.5, FACTOR=19/81 give R(t=S)=0.9 exactly.
export const FSRS_DECAY = -0.5;
export const FSRS_FACTOR = 19 / 81;
const DAY_MS = 1000 * 60 * 60 * 24;

function finite(n, fallback = 0) {
  const v = Number(n);
  return Number.isFinite(v) ? v : fallback;
}
function clamp01(n) {
  const v = Number(n);
  // NaN-safe fail-closed: a non-finite value clamps to 0 (demote-eligible), never
  // launders through as NaN (NaN<floor is false → silent keep-forever).
  return Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : 0;
}

/**
 * Retrievability R in (0,1]: 1 right after use, decaying along the power-law curve.
 * @param {number} stabilityDays  S — larger = slower decay
 * @param {number} daysSinceUse   t — days since last USE
 */
export function retrievability(stabilityDays, daysSinceUse, { decay = FSRS_DECAY, factor = FSRS_FACTOR } = {}) {
  const S = finite(stabilityDays, 0);
  const t = finite(daysSinceUse, 0);
  // Domain guards: decay must be finite & < 0, factor finite & > 0 — invalid opts
  // fall back to the canonical FSRS curve (with d<0, f>0, S>0, t>0 the base
  // 1+f·t/S > 1, so pow(>1, neg) ∈ (0,1) and NaN is unreachable). The config
  // layer already validates; this covers direct callers.
  const d = Number.isFinite(decay) && decay < 0 ? decay : FSRS_DECAY;
  const f = Number.isFinite(factor) && factor > 0 ? factor : FSRS_FACTOR;
  if (S <= 0) return 0;       // no stability → unretrievable
  if (t <= 0) return 1;       // just used → fully retrievable
  const R = Math.pow(1 + f * (t / S), d);
  return Number.isFinite(R) ? R : 0; // unreachable belt — never launder NaN
}

/**
 * Effective stability: base stability boosted by use-frequency, salience, and the
 * |ΔU| surprise at encode. High-salience / often-recalled traces get larger S → slower
 * forgetting. All weights come from the fsrs:{} knob block (fail-closed defaults here).
 *
 * MEM-06 / card 29-H1 — renewal-RATE frequency term. Raw useCount conflates a memory
 * recalled 5× in one day with one recalled 5× over a year. Renewal theory says the real
 * consolidation signal is frequency-PER-TIME: r = useCount / max(elapsedDays, minWindow).
 * When `elapsedDays` is provided AND useCount ≥ renewalMinRecalls, the freq boost becomes
 * freq·log1p(r·scale) so dense recall dures harder than sparse recall over a long span.
 *
 * BLEND (math-base wave 2026-06-10, owner decision D3): whenever a window is known,
 * freqTerm = max(log1p(r·scale), κ·log1p(uc)) with κ = renewalCountFloor (default
 * 0.25). Max of two increasing concave functions of uc → monotone in uc and
 * continuous everywhere — the old uc>=minRecalls form-switch made recall #4 CUT
 * stability 40% (a monotonicity violation). Dense recall still dominates via the
 * rate term; sparse-old items keep a DISCOUNTED count floor, never the full prior.
 * No-window fallback stays log1p(uc) — byte-identical backward compat.
 * renewalMinRecalls is RETIRED for form selection (accepted-but-unused for one
 * release; it was never wired through yuri-energy-config anyway).
 *
 * Half-2 (inspection-paradox / length-biased age debias) is deliberately NOT implemented —
 * the catalog warns it rescues dead memories without a stationarity guard. PARKED.
 */
export function effectiveStability(baseStabilityDays, { useCount = 0, salience = 0, deltaU = 0, elapsedDays } = {}, weights = {}) {
  const w = { freq: 0.5, salience: 1.0, deltaU: 0.3, renewalScale: 1.0, renewalMinWindowDays: 1, renewalCountFloor: 0.25, ...weights };
  const S0 = (() => { const v = finite(baseStabilityDays, 0); return v > 0 ? v : 1; })();
  const uc = Math.max(0, finite(useCount));
  const ed = elapsedDays === undefined ? null : finite(elapsedDays, 0);
  const minWin = Math.max(1, finite(w.renewalMinWindowDays, 1));
  const kappa = Math.max(0, Math.min(1, finite(w.renewalCountFloor, 0.25)));
  let freqTerm;
  if (ed !== null && ed > 0) {
    const r = uc / Math.max(ed, minWin);                       // renewal RATE (recalls/day)
    // monotone-continuous blend: rate signal with a DISCOUNTED count floor —
    // dense recall dominates via the rate; sparse recall keeps κ·count, never
    // the full count prior (the old cliff: recall #4 CUT stability 40%).
    freqTerm = Math.max(Math.log1p(Math.max(0, r) * Math.max(0, finite(w.renewalScale, 1))), kappa * Math.log1p(uc));
  } else {
    freqTerm = Math.log1p(uc);                                 // no window → count prior (compat)
  }
  const boost = 1
    + finite(w.freq) * freqTerm
    + finite(w.salience) * Math.max(0, finite(salience))
    + finite(w.deltaU) * Math.abs(finite(deltaU));
  return S0 * boost;
}

/**
 * Decide whether a memory should DEMOTE to the subconscious (cold) tier.
 * Returns { demote, R, S, reason }. Force-keep is exempt (score = ∞, never demotes).
 * Demote iff retrievability has fallen below rFloor AND the item isn't force-kept.
 *
 * @param {object} item  { baseStabilityDays, lastUsedMs, useCount, salience, deltaU, forceKeep }
 * @param {object} cfg   { nowMs, rFloor, decay, factor, freq, salience, deltaU } (the fsrs knob block)
 */
export function evaluateRetention(item = {}, cfg = {}) {
  const { nowMs, rFloor = 0.6, decay = FSRS_DECAY, factor = FSRS_FACTOR, ...sw } = cfg;
  if (item.forceKeep) return { demote: false, R: 1, S: Infinity, reason: 'force-keep (exempt from decay)' };
  const now = finite(nowMs, 0);
  const lastUsed = finite(item.lastUsedMs, now);
  const daysSinceUse = Math.max(0, (now - lastUsed) / DAY_MS);
  // MEM-06 — recall WINDOW for the renewal rate: span from first-seen to now (the time over
  // which useCount recalls accumulated). Prefer an explicit item.elapsedDays; else derive from
  // item.firstSeenMs; else undefined → effectiveStability falls back to the count-based prior.
  const elapsedDays = item.elapsedDays !== undefined
    ? finite(item.elapsedDays, 0)
    : (Number.isFinite(Number(item.firstSeenMs)) ? Math.max(0, (now - Number(item.firstSeenMs)) / DAY_MS) : undefined);
  const S = effectiveStability(item.baseStabilityDays, { useCount: item.useCount, salience: item.salience, deltaU: item.deltaU, elapsedDays }, sw);
  const R = clamp01(retrievability(S, daysSinceUse, { decay, factor }));
  return {
    demote: R < rFloor,
    R,
    S,
    reason: R < rFloor ? `R=${R.toFixed(3)} < floor ${rFloor} (retrieval strength decayed)` : `R=${R.toFixed(3)} ≥ floor ${rFloor} (still retrievable)`,
  };
}

/**
 * Stability after a successful recall — the testing effect / expanding intervals.
 * Each retrieval strengthens the trace, so it survives longer before the next demotion.
 */
export function bumpStability(stabilityDays, { growth = 1.6, maxDays = 3650 } = {}) {
  const S = (() => { const v = finite(stabilityDays, 0); return v > 0 ? v : 1; })();
  // growth must be finite & > 0 (a recall STRENGTHENS): a non-positive/non-finite knob would
  // corrupt S to ≤0 (finite(-2,1.6) passes -2 straight through → S*-2 < 0). Fall back to the
  // canonical 1.6, mirroring retrievability's decay<0 / factor>0 domain guards. (math-base sim
  // assessment 2026-06-16: parity hardening — bumpStability was the one fsrs path with no knob guard.)
  const g = Number.isFinite(growth) && growth > 0 ? growth : 1.6;
  return Math.min(finite(maxDays, 3650), S * g);
}

// PARKED-BRANCH (card 29 Half-2 — inspection-paradox / length-biased age debias): NOT shipped.
// The renewal-theory residual-age correction A(t) would rescue dead memories unless gated by a
// stationarity guard (skip the correction for absorbing / hot-then-cold / shipped-project gaps).
// The catalog flags this as risky without the guard, so Half-2 is deliberately deferred. Do not
// implement an age debias here without first building the stationarity test it depends on.

if (import.meta.url === `file://${process.argv[1]}`) {
  // Tiny demo: a 10-day-stability item recalled 0 vs 40 days ago.
  const cfg = { nowMs: 40 * DAY_MS, rFloor: 0.6 };
  console.log(JSON.stringify({
    fresh: evaluateRetention({ baseStabilityDays: 10, lastUsedMs: 40 * DAY_MS, useCount: 0 }, cfg),
    stale: evaluateRetention({ baseStabilityDays: 10, lastUsedMs: 0, useCount: 0 }, cfg),
    forceKept: evaluateRetention({ baseStabilityDays: 10, lastUsedMs: 0, forceKeep: true }, cfg),
  }, null, 2));
}
