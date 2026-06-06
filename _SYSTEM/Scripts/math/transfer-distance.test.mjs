#!/usr/bin/env node
/**
 * transfer-distance.test.mjs — invariants for the V2 transfer-distance engine.
 * Asserts ROBUST properties (bounds, determinism, gate, far>near, theater-killed) that hold
 * regardless of lexicon tuning. Run: node _SYSTEM/Scripts/math/transfer-distance.test.mjs
 */
import { ncd, jaccardDistance, distance, bridge, transferScore, v1BlendMetric } from './transfer-distance.mjs';
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

// ── fieldDistance: FAR field > NEAR field (the degree-of-farness axis) ──
ok(fieldDistance(HOPFIELD).d > fieldDistance(KALMAN).d, 'Hopfield(far) distance > Kalman(near) distance');
ok(inUnit(fieldDistance(HOPFIELD).d) && fieldDistance(HOPFIELD).d >= 0.8, 'Hopfield distance is high (>=0.8)');

// ── mechanismFrame bridge: genuine mechanism reconstructs better than a wrong one ──
const reconRight = 1 - mechanismFrameDistance(HOPFIELD, MEMORY_ORGAN).d;
const reconWrong = 1 - mechanismFrameDistance(KALMAN, MEMORY_ORGAN).d; // Kalman mechanism in a memory organ
ok(reconRight >= reconWrong, 'right mechanism reconstructs target >= wrong mechanism');

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

console.log(`\ntransfer-distance.test: ${pass} passed, ${fail} failed`);
process.exitCode = fail === 0 ? 0 : 1;
