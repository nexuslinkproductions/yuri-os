#!/usr/bin/env node
/**
 * yuri-energy-config — the bridge that makes the cockpit's dials REAL.
 *
 * Reads an optional `_SYSTEM/SELF/energy-weights.json` override and returns a
 * validated PARTIAL config { weights?, threshold?, salience?, evict?, fsrs?, recall? }. The
 * live gate path (energy-tick) merges this over its defaults, so a tuned value
 * persisted to that file actually steers every real transition. Absent or
 * invalid file → {} (fail-safe: the gate falls back to the standard defaults).
 *
 * Validation is fail-CLOSED: a field that is not a real number (boolean, null,
 * array, object, empty/whitespace string) or not finite is DROPPED, not coerced —
 * so a malformed config can never silently inject a wrong-but-finite knob. See
 * _SYSTEM/docs/icm-mwp-energy-governance-and-firing-policy.md.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEFAULT_WEIGHTS } from './yuri-energy.mjs';

const _HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(_HERE, '..', '..', '..'); // _SYSTEM/Scripts/math → repo root
export const CONFIG_FILE = path.join(REPO_ROOT, '_SYSTEM', 'SELF', 'energy-weights.json');

// Minimum surprise-band width. isSurprise (energy-tick-core.mjs) requires >= 3 samples
// before it can flag an outlier, so a configured window below 3 silently disables the
// WORK surprise tier forever. Keep this floor in sync with isSurprise's length check.
export const MIN_SURPRISE_WINDOW = 3;
// Red-team #1: veto-bearing weights must never be config-disabled to 0 (that forges the
// protected-path / structural floors open). They clamp to a positive floor; others allow 0.
export const MIN_VETO_WEIGHT = 1e-9;
const VETO_WEIGHT_KEYS = new Set(['eta', 'theta']);

// Coerce to a finite number, fail-CLOSED on type confusion. Rejects (-> null):
// booleans, null, arrays, objects, and empty/whitespace strings — all of which bare
// Number() would otherwise turn into a finite value (Number('')=0, Number(true)=1,
// Number(null)=0, Number([5])=5). Normalizes -0 to +0 to match roundEnergy hygiene.
export function num(v) {
  if (typeof v !== 'number' && typeof v !== 'string') return null;
  if (typeof v === 'string' && v.trim() === '') return null;
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  return n === 0 ? 0 : n;
}

/**
 * Read + validate the override file. Returns only the fields that are present
 * and valid; everything else is dropped (fail-closed on bad input).
 * @param {string} [file] override path (defaults to the canonical config file)
 */
export function loadEnergyConfig(file = CONFIG_FILE) {
  let raw;
  try { raw = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return {}; }
  if (!raw || typeof raw !== 'object') return {};
  const out = {};

  // weights — only known keys, finite, non-negative (mirror normalizeWeights).
  if (raw.weights && typeof raw.weights === 'object' && !Array.isArray(raw.weights)) {
    const w = {};
    for (const k of Object.keys(DEFAULT_WEIGHTS)) {
      const n = num(raw.weights[k]);
      const min = VETO_WEIGHT_KEYS.has(k) ? MIN_VETO_WEIGHT : 0;
      if (n !== null && n >= min) w[k] = n;
    }
    if (Object.keys(w).length) out.weights = w;
  }

  const t = num(raw.threshold);
  if (t !== null && t >= 0) out.threshold = t;

  // salience — depthThreshold (int>=1), surpriseK (>=0), surpriseWindow (int>=MIN_SURPRISE_WINDOW).
  if (raw.salience && typeof raw.salience === 'object' && !Array.isArray(raw.salience)) {
    const s = {};
    const dt = num(raw.salience.depthThreshold); if (dt !== null && dt >= 1) s.depthThreshold = Math.trunc(dt);
    const sk = num(raw.salience.surpriseK); if (sk !== null && sk >= 0) s.surpriseK = sk;
    const sw = num(raw.salience.surpriseWindow); if (sw !== null && sw >= MIN_SURPRISE_WINDOW) s.surpriseWindow = Math.trunc(sw);
    if (Object.keys(s).length) out.salience = s;
  }

  // evict — ttlDays (int>=1): forgetting horizon for the procedural memory tier
  // (memory-evict.mjs). Same fail-closed rule — a bad value is dropped, leaving the
  // evictor on its env override or the hardcoded default.
  if (raw.evict && typeof raw.evict === 'object' && !Array.isArray(raw.evict)) {
    const e = {};
    const ttl = num(raw.evict.ttlDays); if (ttl !== null && ttl >= 1) e.ttlDays = Math.trunc(ttl);
    if (Object.keys(e).length) out.evict = e;
  }

  // fsrs — subconscious forgetting-curve knobs (memory-relocator / yuri-fsrs evaluateRetention).
  // Fail-closed: rFloor in (0,1], decay < 0, factor > 0, stability weights (salience/freq/deltaU) >= 0.
  // MEM-02: redundancyFloor in [0,1] (0 disables the MDL axis → pure-FSRS baseline). MEM-05:
  // supersessionPenaltyDays >= 0 (0 disables the same-family back-date). MEM-06: scale/minWindow
  // for the renewal-rate stability term — scale > 0, minWindow >= 1 day.
  if (raw.fsrs && typeof raw.fsrs === 'object' && !Array.isArray(raw.fsrs)) {
    const f = {};
    const rf = num(raw.fsrs.rFloor);   if (rf !== null && rf > 0 && rf <= 1) f.rFloor = rf;
    const dc = num(raw.fsrs.decay);    if (dc !== null && dc < 0) f.decay = dc;
    const ft = num(raw.fsrs.factor);   if (ft !== null && ft > 0) f.factor = ft;
    const sa = num(raw.fsrs.salience); if (sa !== null && sa >= 0) f.salience = sa;
    const fq = num(raw.fsrs.freq);     if (fq !== null && fq >= 0) f.freq = fq;
    const du = num(raw.fsrs.deltaU);   if (du !== null && du >= 0) f.deltaU = du;
    const rdf = num(raw.fsrs.redundancyFloor);        if (rdf !== null && rdf >= 0 && rdf <= 1) f.redundancyFloor = rdf;
    const sup = num(raw.fsrs.supersessionPenaltyDays); if (sup !== null && sup >= 0) f.supersessionPenaltyDays = sup;
    const rsc = num(raw.fsrs.renewalScale);            if (rsc !== null && rsc > 0) f.renewalScale = rsc;
    const rcf = num(raw.fsrs.renewalCountFloor); if (rcf !== null && rcf >= 0 && rcf <= 1) f.renewalCountFloor = rcf;
    const rmw = num(raw.fsrs.renewalMinWindowDays);    if (rmw !== null && rmw >= 1) f.renewalMinWindowDays = rmw;
    if (Object.keys(f).length) out.fsrs = f;
  }

  // recall — cue-recall blend knobs (yuri-recall rankRecall) + the brain-inject conscious-set cap.
  // Fail-closed: floors/weights >= 0, topK/consciousSetCap int >= 1, halfLifeDays >= 1.
  if (raw.recall && typeof raw.recall === 'object' && !Array.isArray(raw.recall)) {
    const r = {};
    const rfl = num(raw.recall.relevanceFloor); if (rfl !== null && rfl >= 0) r.relevanceFloor = rfl;
    const tk  = num(raw.recall.topK);            if (tk !== null && tk >= 1) r.topK = Math.trunc(tk);
    const hl  = num(raw.recall.halfLifeDays);    if (hl !== null && hl >= 1) r.halfLifeDays = hl;
    const cap = num(raw.recall.consciousSetCap); if (cap !== null && cap >= 1) r.consciousSetCap = Math.trunc(cap);
    if (raw.recall.weights && typeof raw.recall.weights === 'object' && !Array.isArray(raw.recall.weights)) {
      const w = {};
      for (const k of ['bm25', 'recency', 'salience', 'crosslink']) {
        const n = num(raw.recall.weights[k]);
        if (n !== null && n >= 0) w[k] = n;
      }
      if (Object.keys(w).length) r.weights = w;
    }
    if (Object.keys(r).length) out.recall = r;
  }

  // staleness — flag-gated ζ wiring (owner decision D6). When halfLifeDays is set
  // (finite, >= 1, matching the recall convention), energy-tick-core hydrates
  // evidence at read time and the ζ term lights. Absent → ζ stays skipped.
  if (raw.staleness && typeof raw.staleness === 'object' && !Array.isArray(raw.staleness)) {
    const z = {};
    const zhl = num(raw.staleness.halfLifeDays); if (zhl !== null && zhl >= 1) z.halfLifeDays = zhl;
    if (Object.keys(z).length) out.staleness = z;
  }

  return out;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  console.log(JSON.stringify({ configFile: CONFIG_FILE, loaded: loadEnergyConfig() }, null, 2));
}
