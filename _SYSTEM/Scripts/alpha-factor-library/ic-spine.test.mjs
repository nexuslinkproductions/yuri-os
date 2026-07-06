#!/usr/bin/env node
// ic-spine.test.mjs — red/grey/green for the IC spine (MURE gap-1).
// Run: node --test _SYSTEM/Scripts/alpha-factor-library/ic-spine.test.mjs
//
// Acceptance (FABLE-BUILD-BRIEF P0.6): inject a signal with KNOWN forward-return correlation →
// assert IC recovers it; inject noise → assert IC≈0. Plus negative/mismatch tests (DISARMED
// degrade, length mismatch, ties, monotone-transform invariance, ledger seam, promotion gate).
//
// ARMING: tests sandbox the DISARMED flag via MURE_FLAG_DIR=/tmp/... — the REAL
// _SYSTEM/state/mure-ic-spine.enabled is never touched (arming is owner-gated).

import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

// Sandbox the flag dir BEFORE importing the module under test.
const FLAG_DIR = mkdtempSync(path.join(tmpdir(), 'mure-ic-'));
const FLAG = path.join(FLAG_DIR, 'mure-ic-spine.enabled');
process.env.MURE_FLAG_DIR = FLAG_DIR;
const arm = () => writeFileSync(FLAG, '1');
const disarm = () => { try { unlinkSync(FLAG); } catch { /* absent */ } };

const {
  spearmanRankIC, computeIC, computeICSeries, computeICDecay,
  icBreadthIR, effectiveBreadth, icPromotionGate,
} = await import('./ic-spine.mjs');
const { recallFactors } = await import('./trade-edge-audit.mjs');

// Deterministic rng (seeded LCG + Box-Muller) — every assertion is exact-repeatable.
function makeRng(seed) {
  let s = seed;
  const rand = () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; };
  const gauss = () => { let u = 0, v = 0; while (u === 0) u = rand(); while (v === 0) v = rand(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
  return { rand, gauss };
}

test.after(() => { rmSync(FLAG_DIR, { recursive: true, force: true }); });

// ═══ RED — DISARMED degrade (the flag contract) ═══════════════════════════════

test('DISARMED: every export degrades inert (no throw, no signal)', () => {
  disarm();
  assert.ok(Number.isNaN(spearmanRankIC([1, 2, 3], [1, 2, 3])), 'spearmanRankIC → NaN');
  const ic = computeIC([1, 2, 3], [1, 2, 3]);
  assert.ok(Number.isNaN(ic.ic) && Number.isNaN(ic.pValue) && ic.n === 0, 'computeIC → NaN degrade');
  assert.deepEqual(computeICSeries({ byFactor: new Map(), series: new Map() }, { factorId: 'x' }), [], 'computeICSeries → []');
  assert.deepEqual(computeICDecay({ byFactor: new Map(), series: new Map() }, { factorId: 'x' }), [], 'computeICDecay → []');
  const ir = icBreadthIR(0.05, 100, 0.02);
  assert.ok(Number.isNaN(ir.ir) && Number.isNaN(ir.icir), 'icBreadthIR → NaN');
  assert.ok(Number.isNaN(effectiveBreadth(10, 0.5)), 'effectiveBreadth → NaN');
  const gate = icPromotionGate({ ics: [0.1, 0.1, 0.1, 0.1, 0.1] });
  assert.equal(gate.promote, false);
  assert.match(gate.reasons[0], /DISARMED/);
});

// ═══ GREEN — known-answer recovery (armed) ════════════════════════════════════

test('KNOWN-CORRELATION RECOVERY: signal with true ρ≈0.707 → rank IC ≈ 0.69, Pearson IC ≈ 0.71', () => {
  arm();
  const { gauss } = makeRng(42);
  const T = 2000;
  const sig = Array.from({ length: T }, () => gauss());
  // fwdRet = sig + noise, both σ=1 → Pearson ρ = 1/√2 ≈ 0.7071.
  // Spearman of a bivariate normal: ρ_s = (6/π)·asin(ρ/2) ≈ 0.6902 for ρ=0.7071.
  const fwd = sig.map((s) => s + gauss());
  const rank = computeIC(sig, fwd, { method: 'spearman' });
  const pear = computeIC(sig, fwd, { method: 'pearson' });
  // SE ≈ 1/√(T−3) ≈ 0.022 → ±3 SE window.
  assert.ok(Math.abs(rank.ic - 0.6902) < 0.07, `rank IC recovers 0.690 (got ${rank.ic.toFixed(4)})`);
  assert.ok(Math.abs(pear.ic - 0.7071) < 0.07, `Pearson IC recovers 0.707 (got ${pear.ic.toFixed(4)})`);
  assert.ok(rank.pValue < 1e-6, `strong signal → tiny p (got ${rank.pValue})`);
  assert.equal(rank.n, T);
  assert.ok(rank.ci95[0] < rank.ic && rank.ic < rank.ci95[1], 'IC inside its own CI');
  assert.ok(rank.ci95[0] > 0.6, 'CI lower bound well above zero for a strong signal');
});

test('NOISE → IC ≈ 0 and p-value non-significant', () => {
  arm();
  const { gauss } = makeRng(1337);
  const T = 1000;
  const sig = Array.from({ length: T }, () => gauss());
  const noise = Array.from({ length: T }, () => gauss());
  const r = computeIC(sig, noise);
  // SE ≈ 1/√997 ≈ 0.0317; deterministic seed keeps this exact-repeatable.
  assert.ok(Math.abs(r.ic) < 0.09, `noise IC ≈ 0 (got ${r.ic.toFixed(4)})`);
  assert.ok(r.pValue > 0.01, `noise not significant (p=${r.pValue.toFixed(4)})`);
  assert.ok(r.ci95[0] < 0 && r.ci95[1] > 0, 'noise CI straddles zero');
});

test('EXACT small-sample Spearman: classic worked example ρ=0.8', () => {
  arm();
  // x=[1..5], y=[2,1,4,3,5]: Σd²=4 → ρ = 1 − 6·4/(5·24) = 0.8 (no ties → identity with Pearson-on-ranks)
  assert.ok(Math.abs(spearmanRankIC([1, 2, 3, 4, 5], [2, 1, 4, 3, 5]) - 0.8) < 1e-12);
});

test('MONOTONE INVARIANCE: rank IC unchanged under exp() transform; perfect monotone → ±1', () => {
  arm();
  const { gauss } = makeRng(7);
  const sig = Array.from({ length: 300 }, () => gauss());
  const fwd = sig.map((s) => s + gauss());
  const icRaw = spearmanRankIC(sig, fwd);
  const icExp = spearmanRankIC(sig.map((s) => Math.exp(s)), fwd); // strictly monotone transform
  assert.ok(Math.abs(icRaw - icExp) < 1e-12, `rank IC invariant under monotone transform (${icRaw} vs ${icExp})`);
  // Perfect monotone (cubic) → rank IC exactly 1; anti-monotone → −1. Pearson < 1 on the cube.
  const xs = Array.from({ length: 50 }, (_, i) => i + 1);
  const cubes = xs.map((x) => x ** 3);
  assert.ok(Math.abs(spearmanRankIC(xs, cubes) - 1) < 1e-12, 'monotone cubic → rank IC = 1');
  assert.ok(Math.abs(spearmanRankIC(xs, cubes.map((c) => -c)) + 1) < 1e-12, 'anti-monotone → rank IC = −1');
  const pearCube = computeIC(xs, cubes, { method: 'pearson' }).ic;
  assert.ok(pearCube < 1 - 1e-6, `Pearson on cubic < 1 (got ${pearCube}) — the rank/Pearson divergence diagnostic`);
});

test('TIES: average-rank handling is deterministic and bounded', () => {
  arm();
  const withTies = spearmanRankIC([1, 1, 2, 2, 3, 3], [1, 2, 3, 4, 5, 6]);
  assert.ok(Number.isFinite(withTies) && withTies > 0.9 && withTies <= 1, `tied signal, monotone return → high IC (got ${withTies})`);
  // All-constant signal → zero variance → NaN, never a fake correlation.
  assert.ok(Number.isNaN(spearmanRankIC([5, 5, 5, 5], [1, 2, 3, 4])), 'zero-variance signal → NaN');
});

// ═══ RED — misuse / mismatch ══════════════════════════════════════════════════

test('MISMATCH: length mismatch throws; non-array throws; NaN entries pair-filtered', () => {
  arm();
  assert.throws(() => computeIC([1, 2, 3], [1, 2]), TypeError, 'length mismatch is an integration bug → throw');
  assert.throws(() => computeIC('nope', [1, 2]), TypeError);
  assert.throws(() => spearmanRankIC([1, 2], null), TypeError);
  const r = computeIC([1, NaN, 2, 3, 4, 5], [1, 9, 2, NaN, 4, 5]); // NaN rows drop pairwise → n=4
  assert.equal(r.n, 4);
  assert.ok(Number.isFinite(r.ic));
});

// ═══ GREEN — ledger seam (recallFactors → IC series / decay) ══════════════════

function buildSyntheticLedger(file, { predictive }) {
  // Hourly rows for 400h. Signal value_i drives NEXT-hour return when predictive:
  //   price_{i+1} = price_i·(1 + 0.004·value_i + 0.001·noise). value stored on each row.
  const { gauss } = makeRng(predictive ? 9001 : 555);
  const base = 1_700_000_000;
  const rows = [];
  let price = 5000;
  const values = Array.from({ length: 400 }, () => gauss());
  for (let i = 0; i < 400; i++) {
    rows.push({ factorId: 'ic-test-ES-USD', market: 'ES-USD', ts: base + i * 3600, price, dir: values[i] >= 0 ? 1 : -1, value: values[i] });
    const drive = predictive ? 0.004 * values[i] : 0;
    price = price * (1 + drive + 0.001 * gauss());
  }
  rows.push({ factorId: 'ic-test-ES-USD', market: 'ES-USD', ts: base + 401 * 3600, price, dir: 1, value: 0 });
  writeFileSync(file, rows.map((r) => JSON.stringify(r)).join('\n') + '\n');
}

test('LEDGER SEAM: predictive factor → strongly positive rolling IC; non-predictive → IC ≈ 0', () => {
  arm();
  const led1 = path.join(FLAG_DIR, 'ledger-predictive.jsonl');
  const led2 = path.join(FLAG_DIR, 'ledger-noise.jsonl');
  buildSyntheticLedger(led1, { predictive: true });
  buildSyntheticLedger(led2, { predictive: false });

  const goodSeries = computeICSeries(recallFactors(led1), { factorId: 'ic-test-ES-USD', horizonS: 3600, window: 60 });
  assert.ok(goodSeries.length > 100, `rolling series produced (got ${goodSeries.length} windows)`);
  const meanGood = goodSeries.reduce((a, r) => a + r.ic, 0) / goodSeries.length;
  // 0.004·value vs 0.001·noise → true ρ = 4/√17 ≈ 0.97 → rank IC per 60-obs window ≈ 0.95+
  assert.ok(meanGood > 0.8, `predictive factor mean rolling IC strongly positive (got ${meanGood.toFixed(4)})`);

  const noiseSeries = computeICSeries(recallFactors(led2), { factorId: 'ic-test-ES-USD', horizonS: 3600, window: 60 });
  const meanNoise = noiseSeries.reduce((a, r) => a + r.ic, 0) / (noiseSeries.length || 1);
  assert.ok(Math.abs(meanNoise) < 0.15, `non-predictive factor mean rolling IC ≈ 0 (got ${meanNoise.toFixed(4)})`);

  // Unknown factor / empty recall → [] (fail-open, not throw)
  assert.deepEqual(computeICSeries(recallFactors(led1), { factorId: 'ghost' }), []);
  assert.deepEqual(computeICSeries(recallFactors('/tmp/absent-ledger-xyz.jsonl'), { factorId: 'ic-test-ES-USD' }), []);
});

test('IC DECAY: 1-step-predictive factor → high IC at 60m rung, decayed at 3h; BH marks the real rung', () => {
  arm();
  const led = path.join(FLAG_DIR, 'ledger-decay.jsonl');
  buildSyntheticLedger(led, { predictive: true });
  const decay = computeICDecay(recallFactors(led), { factorId: 'ic-test-ES-USD', minN: 12 });
  assert.ok(decay.length >= 2, `decay curve has ≥2 rungs (got ${decay.length}: ${decay.map((d) => d.label).join(',')})`);
  const r60 = decay.find((d) => d.label === '60m');
  assert.ok(r60, '60m rung present');
  assert.ok(r60.ic > 0.8, `60m IC high (got ${r60.ic.toFixed(4)})`);
  assert.ok(r60.bhRejected === true, '60m rung survives BH across rungs');
  const r3h = decay.find((d) => d.label === '3h');
  if (r3h) {
    // signal drives ONE hour; at 3h the return still contains that hour → attenuated, not zero.
    assert.ok(r3h.ic < r60.ic, `IC decays with horizon (3h ${r3h.ic.toFixed(3)} < 60m ${r60.ic.toFixed(3)})`);
  }
  // weekly rung must be ABSENT (400h of data cannot give 12 non-overlapping weekly obs) — honesty.
  assert.equal(decay.find((d) => d.label === 'weekly'), undefined, 'weekly rung honestly absent (insufficient independent obs)');
});

// ═══ GREEN — Grinold + promotion gate ═════════════════════════════════════════

test('GRINOLD: IR = IC×√BR, effective breadth shrink', () => {
  arm();
  const { ir, icir } = icBreadthIR(0.03, 2500, 0.05);
  assert.ok(Math.abs(ir - 1.5) < 1e-12, `IR = 0.03×√2500 = 1.5 (got ${ir})`);
  assert.ok(Math.abs(icir - 0.6) < 1e-12, `ICIR = 0.03/0.05 = 0.6 (got ${icir})`);
  assert.ok(Math.abs(effectiveBreadth(10, 0) - 10) < 1e-12, 'ρ̄=0 → N_eff = N');
  assert.ok(Math.abs(effectiveBreadth(10, 1) - 1) < 1e-12, 'ρ̄=1 → N_eff = 1 (10 clones = 1 bet)');
  const nEff = effectiveBreadth(10, 0.8);
  assert.ok(Math.abs(nEff - 10 / 8.2) < 1e-12, `ρ̄=0.8 → N_eff = 10/8.2 ≈ 1.22 (got ${nEff})`);
  assert.ok(Number.isNaN(effectiveBreadth(0, 0.5)), 'N≤0 → NaN');
});

test('PROMOTION GATE: consistent IC series promotes; noise IC series does not; nTrials deflates', () => {
  arm();
  const { gauss } = makeRng(2024);
  // Strong, consistent IC history: mean 0.05, std 0.02, n=100 → t≈25, icSharpe=2.5/window.
  const goodICs = Array.from({ length: 100 }, () => 0.05 + 0.02 * gauss());
  const good = icPromotionGate({ ics: goodICs }, { nTrials: 10 });
  assert.equal(good.promote, true, `good IC history promotes (reasons: ${good.reasons.join(' | ')})`);
  assert.ok(good.dsr > 0.95);
  assert.ok(good.tStat > 10);

  // Zero-mean IC noise → no promotion.
  const noiseICs = Array.from({ length: 100 }, () => 0.02 * gauss());
  const bad = icPromotionGate({ ics: noiseICs }, { nTrials: 10 });
  assert.equal(bad.promote, false, 'noise IC history does not promote');

  // Borderline IC + massive nTrials → the DSR deflation kills it (selection-bias honesty).
  const borderline = Array.from({ length: 40 }, () => 0.025 + 0.08 * gauss());
  const fewTrials = icPromotionGate({ ics: borderline }, { nTrials: 1 });
  const manyTrials = icPromotionGate({ ics: borderline }, { nTrials: 5000 });
  assert.ok(manyTrials.dsr <= fewTrials.dsr, `nTrials deflates DSR (${manyTrials.dsr} ≤ ${fewTrials.dsr})`);
  assert.equal(manyTrials.promote, false, '5000 trials on a borderline IC → no promotion');

  // minIC floor: strong t-stat but sub-floor mean IC → rejected.
  const tiny = Array.from({ length: 200 }, () => 0.01 + 0.002 * gauss());
  const tinyGate = icPromotionGate({ ics: tiny }, { nTrials: 1, minIC: 0.02 });
  assert.equal(tinyGate.promote, false, 'meanIC 0.01 < floor 0.02 → no promotion despite consistency');

  // Fleet BH: this factor's p must be a BH discovery when fleetPValues supplied.
  const fleetGate = icPromotionGate({ ics: goodICs }, { nTrials: 10, fleetPValues: [good.pValue, 0.4, 0.6, 0.8], q: 0.1 });
  assert.equal(fleetGate.promote, true, 'BH fleet membership passes for the tiny-p factor');

  // Insufficient evidence → refuse to decide (fail closed).
  const thin = icPromotionGate({ ics: [0.05, 0.04] });
  assert.equal(thin.promote, false);
  assert.match(thin.reasons[0], /insufficient/);
});
