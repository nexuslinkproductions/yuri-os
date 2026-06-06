#!/usr/bin/env node
/**
 * transfer-distance.test.mjs — invariants for the V2 transfer-distance engine.
 * Asserts ROBUST properties (bounds, determinism, gate, far>near, theater-killed) that hold
 * regardless of lexicon tuning. Run: node _SYSTEM/Scripts/math/transfer-distance.test.mjs
 */
import { readFileSync } from 'node:fs';
import { ncd, jaccardDistance, distance, bridge, transferScore, v1BlendMetric, antiTheaterGate, GATE, TIER, tierOf } from './transfer-distance.mjs';
import { fieldClassify, fieldDistance, mechanismFrameDistance, scoreTransferV2, operatorSkeletonDistance } from './transfer-distance-cores.mjs';

let pass = 0, fail = 0;
const ok = (cond, name) => { if (cond) { pass++; } else { fail++; console.log(`  FAIL ${name}`); } };
const inUnit = (v) => Number.isFinite(v) && v >= 0 && v <= 1;

const KALMAN = 'Kalman filter scalar adaptive recursive estimator with normalized innovation squared chi-square gating predicts then updates folding each sample weighted by measurement noise';
const HOPFIELD = 'Hopfield associative memory Amit Gutfreund Sompolinsky storage capacity bound before crosstalk between stored patterns produces spurious attractors super-linear interference';
const MEMORY_ORGAN = 'MEMORY GOVERNANCE add a hot-tier saturation probe governed by mutual interference flag over-capacity consolidate before recall degrades surface most-overlapping pairs as merge candidates';
const SALIENCE_ORGAN = 'SALIENCE SURPRISE replace the static median plus K times MAD outlier band with an adaptive self-scaling innovation gate that re-sensitises after a critical spike';

// ── bounds + determinism ──
ok(inUnit(ncd(KALMAN, HOPFIELD).ncd), 'ncd in [0,1]');
ok(inUnit(jaccardDistance(KALMAN, HOPFIELD)), 'jaccard in [0,1]');
ok(ncd(KALMAN, HOPFIELD).ncd === ncd(KALMAN, HOPFIELD).ncd, 'ncd deterministic');
ok(fieldDistance(KALMAN).d === fieldDistance(KALMAN).d, 'fieldDistance deterministic');
ok(ncd('hi', 'yo').lowQuality === true, 'ncd MIN_CHARS sentinel on short input');

// ── fieldClassify sanity ──
ok(fieldClassify(KALMAN).field === 'control_signal', 'Kalman → control_signal');
ok(fieldClassify(HOPFIELD).field === 'physics_neuro', 'Hopfield → physics_neuro');

// ── M6: tierOf banding boundaries are INCLUSIVE at the committed thresholds (>=) ──
// kills `>= TIER.X` → `> TIER.X` (which would mis-tier a value sitting exactly on the boundary).
ok(tierOf(TIER.INNOVATION) === 'INNOVATION', `tierOf(${TIER.INNOVATION}) === INNOVATION (inclusive)`);
ok(tierOf(TIER.INNOVATION - 1e-9) === 'USEFUL', 'tierOf just below INNOVATION → USEFUL');
ok(tierOf(TIER.USEFUL) === 'USEFUL', `tierOf(${TIER.USEFUL}) === USEFUL (inclusive)`);
ok(tierOf(TIER.USEFUL - 1e-9) === 'NEAR_OR_THEATER', 'tierOf just below USEFUL → NEAR_OR_THEATER');

// ── M12: pin the fieldClassify-tie cards (12/29/34) to their fields — a tie-break change would drift them ──
{
  const truth = JSON.parse(readFileSync(new URL('./logbook-truth.json', import.meta.url), 'utf8'));
  const fieldOf = (n) => { const c = truth.find((x) => x.n === n); return fieldClassify(c.sourceTheory || c.sourceText).field; };
  ok(fieldOf(12) === 'consensus_dist', 'card 12 (Split Conformal) → consensus_dist');
  ok(fieldOf(29) === 'survival_reliab', 'card 29 (Renewal theory) → survival_reliab');
  ok(fieldOf(34) === 'ml_bandit', 'card 34 (UCB1) → ml_bandit');
}

// ── fieldDistance: FAR field > NEAR field (the degree-of-farness axis) ──
ok(fieldDistance(HOPFIELD).d > fieldDistance(KALMAN).d, 'Hopfield(far) distance > Kalman(near) distance');
ok(inUnit(fieldDistance(HOPFIELD).d) && fieldDistance(HOPFIELD).d >= 0.8, 'Hopfield distance is high (>=0.8)');

// ── mechanismFrame bridge: genuine mechanism reconstructs better than a wrong one ──
const reconRight = 1 - mechanismFrameDistance(HOPFIELD, MEMORY_ORGAN).d;
const reconWrong = 1 - mechanismFrameDistance(KALMAN, MEMORY_ORGAN).d; // Kalman mechanism in a memory organ
ok(reconRight > reconWrong, 'right mechanism reconstructs target STRICTLY > wrong mechanism'); // was >= (passed on constant scorer)

// ── value gate: no-mechanism → 0; far+holds > 0 ──
const noMech = scoreTransferV2({ sourceText: HOPFIELD, targetText: MEMORY_ORGAN, mechanismText: '', structuralConf: 0.6, mismatchPresent: true });
ok(noMech.value === 0 && noMech.gate.reason === 'no-mechanism', 'empty mechanism gates value to 0');
const farHolds = scoreTransferV2({ sourceText: HOPFIELD, targetText: MEMORY_ORGAN, mechanismText: 'past an interference threshold mutual crosstalk between stored patterns degrades recall super-linearly saturation governed by interference not per-item decay', structuralConf: 0.6, mismatchPresent: true });
ok(farHolds.value > 0 && inUnit(farHolds.value), 'genuine far transfer scores > 0');
ok(farHolds.tier === 'INNOVATION' || farHolds.tier === 'USEFUL', 'far+holds tier is INNOVATION/USEFUL');

// ── noun-only mechanism (no operators) is killed vs genuine ──
const nounOnly = scoreTransferV2({ sourceText: HOPFIELD, targetText: MEMORY_ORGAN, mechanismText: 'the system the data the value the result the thing the part the item the area the field the table the record the context', structuralConf: 0.6, mismatchPresent: true });
ok(nounOnly.value < farHolds.value, 'noun-only mechanism scores below genuine (theater killed)');

// ── value bounded ──
ok(inUnit(farHolds.value) && inUnit(noMech.value) && inUnit(nounOnly.value), 'all values in [0,1]');

// ── REGRESSION (red-team): structuralConf clamped + metric NaN-safe → value always ∈ [0,1] ──
{
  const base = { sourceText: HOPFIELD, targetText: MEMORY_ORGAN, mechanismText: 'past an interference threshold mutual crosstalk between stored patterns degrades recall super-linearly', mismatchPresent: true };
  ok(scoreTransferV2({ ...base, structuralConf: -1 }).value >= 0, 'structuralConf<0 → value >= 0 (clamped)');
  ok(scoreTransferV2({ ...base, structuralConf: 5 }).value <= 1, 'structuralConf>1 → value <= 1 (clamped)');
  const nanV = transferScore(base, { distFn: () => ({ d: NaN }), reconFn: () => ({ d: NaN }) }).value;
  ok(Number.isFinite(nanV) && nanV >= 0 && nanV <= 1, 'metric returning NaN → value finite ∈ [0,1]');
}

// ── REGRESSION (red-team r2): implementation-viability (prerequisite) gate → BLOCKED tier ──
{
  const M = 'past an interference threshold mutual crosstalk between stored patterns degrades recall super-linearly saturation governed by interference not per-item decay';
  const blocked = scoreTransferV2({ sourceText: HOPFIELD, targetText: MEMORY_ORGAN, mechanismText: M, structuralConf: 0.9, mismatchText: 'HARD PREREQUISITE: a real transition function must be built first — it does not exist today' });
  ok(blocked.tier === 'BLOCKED', 'prerequisite-blocked transfer → BLOCKED tier (not INNOVATION)');
  ok(blocked.value <= 0.12 && blocked.signals.prereqBlocked === true, 'BLOCKED value capped + flagged');
  const viable = scoreTransferV2({ sourceText: HOPFIELD, targetText: MEMORY_ORGAN, mechanismText: M, structuralConf: 0.9, mismatchText: 'use covariance intersection because the lanes are correlated' });
  ok(viable.tier !== 'BLOCKED' && viable.signals.prereqBlocked === false, 'no hard prerequisite → not BLOCKED');
}

// ── GATE-INTERNAL mutation guards (from the mutation-test round — catch silent gate breaks) ──
{
  // M5 (invert apply) + M3 (BRIDGE_FLOOR→0): theater-only case must cap at CAP_THEATER, not pass through.
  const g = antiTheaterGate(0.9, { bridgeVal: 0.1, dist: 0.5, structuralConf: 1, mismatchPresent: true, hasMechanism: true });
  ok(g.cap === GATE.CAP_THEATER && g.value <= GATE.CAP_THEATER, 'antiTheaterGate fires (low bridge → CAP_THEATER); catches no-op/floor mutants');
  // M1 (bridge min→max): asymmetric reconstruction must take the WEAKER side (min, not max/avg).
  const A = 'reflected cross site scripting injection in the login form input sanitization layer here today';
  const B = 'persistent homology filtration union find barcode topological data analysis over a weighted graph';
  const Mtxt = 'reflected cross site scripting injection in the login form input field is not sanitized properly';
  const br = bridge(Mtxt, A, B);
  ok(br.reconSource !== br.reconTarget && br.bridge === Math.min(br.reconSource, br.reconTarget), 'bridge = min(recon) on asymmetric sides (catches min→max mutant)');
  // M8 (mechanismFamilySim const): a WRONG mechanism must be far from the target (absolute floor).
  ok(mechanismFrameDistance('Kalman filter scalar adaptive recursive estimator predicts then updates an innovation variance folding samples', MEMORY_ORGAN).d > 0.55, 'wrong-domain mechanism is structurally far from target (>0.55)');
  // M2 (clamp drop): assert on valueRaw (NOT the always-clamped value) — conf>1 must not inflate raw.
  ok(scoreTransferV2({ sourceText: HOPFIELD, targetText: MEMORY_ORGAN, mechanismText: 'past an interference threshold mutual crosstalk between stored patterns degrades recall super-linearly', structuralConf: 5, mismatchText: 'use covariance intersection' }).valueRaw <= 1, 'structuralConf>1 → valueRaw <= 1 (clamp non-vacuous, checks valueRaw)');
}

console.log(`\ntransfer-distance.test: ${pass} passed, ${fail} failed`);
process.exitCode = fail === 0 ? 0 : 1;
