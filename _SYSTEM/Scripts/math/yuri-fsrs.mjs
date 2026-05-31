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
  return Math.max(0, Math.min(1, n));
}

/**
 * Retrievability R in (0,1]: 1 right after use, decaying along the power-law curve.
 * @param {number} stabilityDays  S — larger = slower decay
 * @param {number} daysSinceUse   t — days since last USE
 */
export function retrievability(stabilityDays, daysSinceUse, { decay = FSRS_DECAY, factor = FSRS_FACTOR } = {}) {
  const S = finite(stabilityDays, 0);
  const t = finite(daysSinceUse, 0);
  if (S <= 0) return 0;       // no stability → unretrievable
  if (t <= 0) return 1;       // just used → fully retrievable
  return Math.pow(1 + factor * (t / S), decay);
}

/**
 * Effective stability: base stability boosted by use-frequency, salience, and the
 * |ΔU| surprise at encode. High-salience / often-recalled traces get larger S → slower
 * forgetting. All weights come from the fsrs:{} knob block (fail-closed defaults here).
 */
export function effectiveStability(baseStabilityDays, { useCount = 0, salience = 0, deltaU = 0 } = {}, weights = {}) {
  const w = { freq: 0.5, salience: 1.0, deltaU: 0.3, ...weights };
  const S0 = (() => { const v = finite(baseStabilityDays, 0); return v > 0 ? v : 1; })();
  const boost = 1
    + finite(w.freq) * Math.log1p(Math.max(0, finite(useCount)))
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
  const S = effectiveStability(item.baseStabilityDays, { useCount: item.useCount, salience: item.salience, deltaU: item.deltaU }, sw);
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
  return Math.min(finite(maxDays, 3650), S * finite(growth, 1.6));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  // Tiny demo: a 10-day-stability item recalled 0 vs 40 days ago.
  const cfg = { nowMs: 40 * DAY_MS, rFloor: 0.6 };
  console.log(JSON.stringify({
    fresh: evaluateRetention({ baseStabilityDays: 10, lastUsedMs: 40 * DAY_MS, useCount: 0 }, cfg),
    stale: evaluateRetention({ baseStabilityDays: 10, lastUsedMs: 0, useCount: 0 }, cfg),
    forceKept: evaluateRetention({ baseStabilityDays: 10, lastUsedMs: 0, forceKeep: true }, cfg),
  }, null, 2));
}
