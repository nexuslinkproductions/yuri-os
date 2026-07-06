// @capability: afl-phase1-tests
// @serves: alpha factor library phase 1 tests | afl integration test | factor evaluator test | factor scorer test | homeostat ledger isolation regression | afl store lifecycle test
// @does: Phase-1 integration + unit suite for the Alpha Factor Library — end-to-end organ wiring, the homeostat-ledger-isolation regression guard, evaluator overfit controls, scorer composite, and store lifecycle.
// @use: run `node --test _SYSTEM/Scripts/alpha-factor-library/afl-phase1.test.mjs` to verify AFL Phase 1; the homeostat-isolation test is the guard that AFL forecasts never pollute YURI's self-model ledger.
/**
 * afl-phase1.test.mjs — Alpha Factor Library Phase-1 integration + unit suite.
 *
 * Covers (per the Phase-1 test contract):
 *   (1) END-TO-END organ wiring: seeded factor -> backtest -> quality score -> claim ->
 *       gate transition -> forecast record/resolve/calibration round-trip.
 *   (2) HOMEOSTAT ISOLATION (critical regression): the live homeostat ledger
 *       (_SYSTEM/state/prediction-ledger.jsonl) is NOT created or modified by AFL work.
 *   (3) evaluator: deflatedSharpe rejects pure noise; benjaminiHochberg matches a
 *       hand-computed cutoff; temporalSplit preserves chronological order.
 *   (4) scorer: factorQualityScore monotonic in sharpe; confidenceDecay object-arg path.
 *   (5) store lifecycle: updateFactor partial patch flips status without nulling cols.
 *
 * Constraints honored: ESM .mjs, paths via fileURLToPath(import.meta.url), no commit/push,
 * no touching protected surfaces. The suite restores the live DB to its starting factor
 * count and removes / restores any ledger it creates so the workspace is left clean.
 *
 * LEDGER STRATEGY: the adapter + evaluator hardcode AFL_LEDGER to
 * _SYSTEM/state/afl-prediction-ledger.jsonl with NO env override, and factorCalibration()
 * reads that exact path. So the end-to-end ledger round-trip MUST exercise the real
 * AFL_LEDGER. The suite snapshots the AFL ledger's pre-existing state (absent or its
 * bytes) at startup and restores it at teardown, while the homeostat-isolation test
 * proves the SEPARATE default ledger is left byte-identical. Determinism: a fixed
 * injected nowMs clock everywhere; a seeded LCG+Box-Muller for the synthetic series.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync, statSync, readFileSync, writeFileSync, rmSync } from 'node:fs';

import {
  AFL_LEDGER,
  factorToClaim,
  gateFactorTransition,
  recordFactorSignal,
  resolveFactorSignal,
  factorCalibration,
  buildFactorTms,
  factorRetractionCascade,
} from './afl-organ-adapter.mjs';
import {
  backtestFactor,
  temporalSplit,
  heldOutEvaluate,
  deflatedSharpe,
  benjaminiHochberg,
  factorPromotionGate,
} from './factor-evaluator.mjs';
import {
  factorQualityScore,
  factorEvidenceDecay,
  portfolioDiversification,
} from './factor-scorer.mjs';
import {
  getFactor,
  listFactors,
  updateFactor,
  upsertFactor,
  openDb,
} from './alpha-factor-store.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// alpha-factor-library/ -> Scripts/ -> _SYSTEM/ -> _SYSTEM/state/prediction-ledger.jsonl
// This is YURI's OWN self-model ledger (yuri-homeostat.mjs reads it as self-accuracy).
const HOMEOSTAT_LEDGER = path.resolve(
  __dirname, '..', '..', 'state', 'prediction-ledger.jsonl',
);

// Fixed, deterministic, epoch-MILLISECONDS clock (in claim-cortex's plausibility band
// [1e12, 4e12]). ~2023-11. Every cortex/ledger call uses this so the suite is reproducible.
const NOW_MS = 1_700_000_000_000;
const DAY_MS = 86_400_000;

// --- deterministic synthetic return series ---------------------------------------------
// Seeded LCG + Box-Muller so the "edge" and "noise" series are byte-stable across runs
// (no Math.random — the contract requires a synthetic, reproducible edge series).
function makeRng(seed0) {
  let seed = seed0 >>> 0;
  const rand = () => {
    seed = (Math.imul(seed, 1103515245) + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };
  const gauss = () => {
    let u = 0, v = 0;
    while (u === 0) u = rand();
    while (v === 0) v = rand();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  };
  return { rand, gauss };
}
function makeEdgeSeries(n = 1000, drift = 0.0025, vol = 0.02, seed = 12345) {
  const { gauss } = makeRng(seed);
  return Array.from({ length: n }, () => drift + vol * gauss());
}
function makeNoiseSeries(n = 1000, vol = 0.02, seed = 67890) {
  const { gauss } = makeRng(seed);
  return Array.from({ length: n }, () => vol * gauss());
}

// --- ledger snapshot / restore helpers -------------------------------------------------
// Snapshot a file's exact bytes (or its absence) so teardown can restore it precisely.
function snapshotFile(file) {
  if (!existsSync(file)) return { existed: false, bytes: null };
  return { existed: true, bytes: readFileSync(file) };
}
function restoreFile(file, snap) {
  if (!snap.existed) {
    // It did not exist before — remove anything the suite created.
    if (existsSync(file)) rmSync(file, { force: true });
    return;
  }
  // It existed — restore its original bytes exactly.
  writeFileSync(file, snap.bytes);
}
// A homeostat-ledger fingerprint: (existence, size, mtimeMs). The isolation test asserts
// this is unchanged after a full AFL run — the guard that AFL never writes the self-model.
function fingerprint(file) {
  if (!existsSync(file)) return { existed: false };
  const s = statSync(file);
  return { existed: true, size: s.size, mtimeMs: s.mtimeMs };
}

// ===========================================================================
// (1) END-TO-END organ wiring.
// ===========================================================================
test('(1) end-to-end: seeded factor -> backtest -> score -> claim -> gate -> ledger round-trip', () => {
  // --- snapshot BOTH ledgers up front; restore the AFL ledger at the end -----------------
  const aflSnap = snapshotFile(AFL_LEDGER);
  const homeostatFp = fingerprint(HOMEOSTAT_LEDGER);
  try {
    // (a) Seeded factor from the LIVE store.
    const seed = getFactor('rsi-14');
    assert.ok(seed, 'rsi-14 seed factor must exist in the live store');
    assert.equal(seed.id, 'rsi-14');

    // (b) Backtest a synthetic EDGE series (positive drift -> positive Sharpe).
    const edge = makeEdgeSeries(1000, 0.0025, 0.02, 12345);
    const bt = backtestFactor(edge, { periodsPerYear: 365 });
    assert.ok(Number.isFinite(bt.sharpe), 'backtest sharpe must be finite');
    assert.ok(bt.sharpe > 0, `edge series must yield positive annualized Sharpe (got ${bt.sharpe})`);
    assert.equal(bt.n, 1000, 'all 1000 finite returns must be counted');

    // (c) factorQualityScore — feed the backtested Sharpe via a synthetic factor shape.
    const scoredFactor = { ...seed, backtest_results: { sharpe: bt.sharpe } };
    const quality = factorQualityScore(scoredFactor, {
      maxPairwiseCorr: 0.1,
      calibrationBrier: 0.1,
      daysSinceConfirmed: 1,
      stabilityDays: 60,
    });
    assert.ok(quality >= 0 && quality <= 1, `quality score must land in [0,1] (got ${quality})`);

    // (d) Build a CLAIM via factorToClaim from a backtested factor + assert its shape.
    const backtestedFactor = {
      id: 'e2e-factor',
      status: 'validated', // -> runtime_tested rung
      formula: 'rsi based momentum',
      backtest_results: { sharpe: bt.sharpe, capturedAt: NOW_MS - DAY_MS, reference: 'e2e-run-1' },
    };
    const claim = factorToClaim(backtestedFactor, { nowMs: NOW_MS });
    assert.equal(claim.id, 'e2e-factor');
    assert.equal(claim.claimedStatus, 'runtime_tested', 'validated -> runtime_tested rung');
    assert.equal(claim.evidence.length, 1, 'a backtest yields one evidence record');
    assert.equal(claim.evidence[0].kind, 'runtime_trace', 'a backtest maps to runtime_trace evidence');
    assert.ok(claim.evidence[0].capturedAt > 0, 'evidence carries a real capturedAt');

    // (e) gateFactorTransition(before, after, {nowMs}) -> a BOOLEAN accept.
    //     candidate (fixture_ready) -> validated (runtime_tested), justified by the backtest.
    const before = {
      id: 'e2e-factor', status: 'candidate', formula: 'rsi based momentum',
      backtest_results: backtestedFactor.backtest_results,
    };
    const gate = gateFactorTransition(before, backtestedFactor, { nowMs: NOW_MS });
    assert.equal(typeof gate.accept, 'boolean', 'gateFactorTransition.accept must be a boolean');
    assert.equal(gate.accept, true, 'a backtest-justified promotion must be accepted');
    assert.equal(gate.identityVeto, false, 'a justified promotion is not identity-vetoed');

    // (f) recordFactorSignal -> resolveFactorSignal -> factorCalibration round-trip.
    //     Record a HIT prediction (confidence 0.9, observed effect matches) so calibration
    //     resolves it. ALL adapter calls land on the ISOLATED AFL_LEDGER.
    const rec = recordFactorSignal(
      backtestedFactor,
      { target: 'next_return', effect: 'up', confidence: 0.9 },
      { nowMs: NOW_MS },
    );
    assert.equal(rec.ok, true, 'recordFactorSignal must succeed');
    assert.ok(rec.row && rec.row.id, 'recordFactorSignal returns a row with a prediction id');
    const predictionId = rec.row.id;

    const res = resolveFactorSignal(
      predictionId,
      [{ target: 'next_return', effect: 'up' }], // matches the prediction -> a hit
      { nowMs: NOW_MS + DAY_MS },
    );
    assert.equal(res.ok, true, 'resolveFactorSignal must succeed');

    const calib = factorCalibration();
    assert.ok(calib.n >= 1, `calibration must count >=1 resolved prediction (got n=${calib.n})`);
    assert.ok(Number.isFinite(calib.meanBrier), 'calibration meanBrier must be finite');
    // A confidence-0.9 prediction that HIT has a low per-target Brier ((0.9-1)^2 = 0.01).
    assert.ok(calib.meanBrier <= 0.5, `a hit at high confidence must keep meanBrier low (got ${calib.meanBrier})`);

    // (g) factorRetractionCascade — lineage parent retraction cascades to its child.
    const factors = [{ id: 'parent-f' }, { id: 'child-f' }];
    const edges = [{ parentId: 'parent-f', childId: 'child-f', transform: 'derive' }];
    const { tms } = buildFactorTms(factors, edges);
    const cascade = factorRetractionCascade(tms, 'parent-f');
    assert.equal(cascade.retracted, 'parent-f');
    assert.ok(cascade.affected.includes('child-f'), 'retracting the parent must cascade to the child');

    // --- HOMEOSTAT GUARD (inline, belt-and-braces): the default ledger is untouched here too.
    const afterFp = fingerprint(HOMEOSTAT_LEDGER);
    assert.deepEqual(afterFp, homeostatFp, 'end-to-end AFL work must not touch the homeostat ledger');
  } finally {
    // Restore the AFL ledger to its pre-test state (it did not exist before -> removed).
    restoreFile(AFL_LEDGER, aflSnap);
  }
});

// ===========================================================================
// (2) HOMEOSTAT ISOLATION — the critical regression guard.
// ===========================================================================
test('(2) homeostat isolation: a full AFL run never creates or modifies the self-model ledger', () => {
  // Fingerprint the homeostat ledger BEFORE any AFL work (existence + size + mtimeMs).
  const before = fingerprint(HOMEOSTAT_LEDGER);
  const aflSnap = snapshotFile(AFL_LEDGER);
  try {
    // Drive the adapter's ledger surface hard — multiple record + resolve + calibration
    // cycles. If ANY of these omitted {file: AFL_LEDGER}, the default (homeostat) ledger
    // would be written and this guard would catch it.
    for (let i = 0; i < 5; i += 1) {
      const f = { id: `iso-factor-${i}`, status: 'validated', formula: `f${i}`,
        backtest_results: { sharpe: 1.5, reference: `iso-run-${i}` } };
      const rec = recordFactorSignal(
        f, { target: 'ret', effect: 'up', confidence: 0.7 }, { nowMs: NOW_MS + i * DAY_MS },
      );
      resolveFactorSignal(
        rec.row.id, [{ target: 'ret', effect: i % 2 === 0 ? 'up' : 'down' }],
        { nowMs: NOW_MS + (i + 1) * DAY_MS },
      );
    }
    factorCalibration();

    // The AFL ledger SHOULD now exist / have grown (proves the writes actually happened
    // and landed SOMEWHERE — otherwise the guard is vacuous).
    assert.ok(existsSync(AFL_LEDGER), 'AFL work must write to the ISOLATED AFL ledger');

    // The homeostat ledger MUST be byte-for-byte unchanged (existence + size + mtimeMs).
    const after = fingerprint(HOMEOSTAT_LEDGER);
    assert.deepEqual(
      after, before,
      'AFL forecasts must NOT create or modify _SYSTEM/state/prediction-ledger.jsonl (homeostat self-model)',
    );
  } finally {
    restoreFile(AFL_LEDGER, aflSnap);
  }
});

// ===========================================================================
// (3) EVALUATOR.
// ===========================================================================
test('(3a) deflatedSharpe rejects pure noise (DSR does not pass on a zero-drift series)', () => {
  const noise = makeNoiseSeries(1000, 0.02, 67890);
  const bt = backtestFactor(noise, { periodsPerYear: 365 });
  // Under selection bias (nTrials=20) a pure-noise per-period Sharpe must NOT clear the
  // deflated 95% bar. (Even with nTrials=1, a zero-drift series should not pass cleanly.)
  const dsr = deflatedSharpe(bt.sharpePeriod, { nTrials: 20, T: bt.n });
  assert.equal(dsr.passes, false, `pure noise must fail the deflated-Sharpe hurdle (dsr=${dsr.dsr})`);
  const gate = factorPromotionGate({ observedSharpe: bt.sharpePeriod, nTrials: 20, T: bt.n });
  assert.equal(gate.promote, false, 'a noise factor must not promote');
});

test('(3a-contrast) deflatedSharpe accepts a genuine single-trial edge', () => {
  const edge = makeEdgeSeries(1000, 0.0025, 0.02, 12345);
  const bt = backtestFactor(edge, { periodsPerYear: 365 });
  const dsr = deflatedSharpe(bt.sharpePeriod, { nTrials: 1, T: bt.n });
  assert.equal(dsr.passes, true, `a genuine edge (single trial) should clear the DSR bar (dsr=${dsr.dsr})`);
});

test('(3b) benjaminiHochberg matches a hand-computed cutoff', () => {
  // Hand-computed: N=10, q=0.1. crit_k = (k/10)*0.1 = k*0.01.
  // sorted p: 0.001,0.002,0.003,0.4,... -> p_(1)=0.001<=0.01, p_(2)=0.002<=0.02,
  // p_(3)=0.003<=0.03, p_(4)=0.4>0.04. Largest qualifying k=3, threshold=p_(3)=0.003.
  const pvals = [0.001, 0.002, 0.003, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 0.95];
  const bh = benjaminiHochberg(pvals, 0.1);
  assert.equal(bh.k, 3, 'BH must discover exactly 3 hypotheses');
  assert.equal(bh.threshold, 0.003, 'BH threshold must be p_(3)=0.003');
  // rejected mask is in INPUT order: the first three (the tiny p-values) are rejected.
  assert.deepEqual(bh.rejected, [true, true, true, false, false, false, false, false, false, false]);

  // Canonical Benjamini-Hochberg (1995) worked example, q=0.05, N=15 -> published k=4, thr=0.0095.
  const pvec = [0.0001, 0.0004, 0.0019, 0.0095, 0.0201, 0.0278, 0.0298, 0.0344, 0.0459, 0.3240, 0.4262, 0.5719, 0.6528, 0.7590, 1.000];
  const bh2 = benjaminiHochberg(pvec, 0.05);
  assert.equal(bh2.k, 4, 'canonical BH 1995 example discovers 4');
  assert.equal(bh2.threshold, 0.0095, 'canonical BH 1995 threshold = 0.0095');
});

test('(3c) temporalSplit preserves order — the test set is strictly later than the train set', () => {
  // A strictly increasing, time-ordered series; a chronological split means every test
  // element is greater than (later than) every train element.
  const ordered = Array.from({ length: 100 }, (_, i) => i); // 0..99 ascending
  const { train, test: testSet } = temporalSplit(ordered, { frac: 0.7 });
  assert.equal(train.length, 70, 'train is the first 70%');
  assert.equal(testSet.length, 30, 'test is the last 30%');
  // Order preserved: train is a contiguous prefix, test a contiguous suffix.
  assert.deepEqual(train, ordered.slice(0, 70));
  assert.deepEqual(testSet, ordered.slice(70));
  // Strictly later: max(train) < min(test).
  const maxTrain = Math.max(...train);
  const minTest = Math.min(...testSet);
  assert.ok(maxTrain < minTest, `train max (${maxTrain}) must precede test min (${minTest}) — no look-ahead leakage`);

  // heldOutEvaluate uses the SAME chronological split (regression: not the random one).
  const ho = heldOutEvaluate(ordered, { frac: 0.7, periodsPerYear: 365 });
  assert.equal(ho.nTrain, 70, 'heldOutEvaluate trains on the first 70% (chronological)');
  assert.equal(ho.nTest, 30, 'heldOutEvaluate tests on the last 30% (chronological)');
});

// ===========================================================================
// (4) SCORER.
// ===========================================================================
test('(4a) factorQualityScore is monotonic in sharpe (all else equal)', () => {
  const opts = { maxPairwiseCorr: 0.2, calibrationBrier: 0.2, daysSinceConfirmed: 5, stabilityDays: 30 };
  const low = factorQualityScore({ backtest_results: { sharpe: 0.2 } }, opts);
  const mid = factorQualityScore({ backtest_results: { sharpe: 1.0 } }, opts);
  const high = factorQualityScore({ backtest_results: { sharpe: 3.0 } }, opts);
  assert.ok(low < mid, `score must rise with sharpe: low(${low}) < mid(${mid})`);
  assert.ok(mid < high, `score must rise with sharpe: mid(${mid}) < high(${high})`);
  // A negative sharpe must score below a zero/positive one (the squash keeps it in-range but penalized).
  const neg = factorQualityScore({ backtest_results: { sharpe: -1.0 } }, opts);
  assert.ok(neg < low, `a negative sharpe must score below a small positive one: neg(${neg}) < low(${low})`);
});

test('(4b) confidenceDecay object-arg path: one half-life halves the base', () => {
  // factorEvidenceDecay(base, ageDays, halfLifeDays) wraps confidenceDecay({base, age, halfLife}).
  const oneHalfLife = factorEvidenceDecay(1.0, 30, 30);
  assert.ok(Math.abs(oneHalfLife - 0.5) < 1e-9, `one half-life must halve base 1.0 -> 0.5 (got ${oneHalfLife})`);
  const twoHalfLives = factorEvidenceDecay(1.0, 60, 30);
  assert.ok(Math.abs(twoHalfLives - 0.25) < 1e-9, `two half-lives -> 0.25 (got ${twoHalfLives})`);
  const ageZero = factorEvidenceDecay(0.8, 0, 30);
  assert.ok(Math.abs(ageZero - 0.8) < 1e-9, 'age 0 returns the base unchanged');
  // Sanity: portfolioDiversification entropy — even weights beat a concentrated book.
  const even = portfolioDiversification([1, 1, 1, 1]);
  const skewed = portfolioDiversification([10, 1, 1, 1]);
  assert.ok(even > skewed, `an even book is more diversified than a concentrated one (${even} > ${skewed})`);
});

// ===========================================================================
// (5) STORE LIFECYCLE — partial patch flips status without nulling other cols.
// ===========================================================================
test('(5) updateFactor partial patch flips status hypothesis->backtested without nulling other columns', () => {
  const TEST_ID = '__afl_phase1_lifecycle_probe__';
  // Defensive: clear any probe left by a prior crashed run BEFORE the count baseline, so the
  // baseline is honest (the live DB should be at 60 factors with no probe present).
  openDb().prepare('DELETE FROM alpha_factors WHERE id = ?').run(TEST_ID);
  const startCount = listFactors({}).length;

  try {
    // Insert a fully-populated probe factor (status hypothesis).
    upsertFactor({
      id: TEST_ID,
      name: 'Phase1 Lifecycle Probe',
      category: 'momentum',
      formula: 'probe_formula',
      formula_desc: 'a probe for the lifecycle test',
      sharpe_estimate: 1.23,
      correlation_cluster: 'cluster-probe',
      crypto_compatible: true,
      status: 'hypothesis',
      tags: ['probe', 'phase1'],
    });
    const inserted = getFactor(TEST_ID);
    assert.ok(inserted, 'probe factor must insert');
    assert.equal(inserted.status, 'hypothesis');
    assert.equal(inserted.name, 'Phase1 Lifecycle Probe');
    assert.equal(inserted.formula, 'probe_formula');
    assert.equal(inserted.sharpe_estimate, 1.23);
    assert.equal(inserted.correlation_cluster, 'cluster-probe');
    assert.equal(inserted.crypto_compatible, 1);
    assert.deepEqual(inserted.tags, ['probe', 'phase1']);

    // PARTIAL patch: flip ONLY status. Everything else must survive untouched.
    const changed = updateFactor(TEST_ID, { status: 'backtested' });
    assert.equal(changed, 1, 'one row changed');
    const patched = getFactor(TEST_ID);
    assert.equal(patched.status, 'backtested', 'status flipped to backtested');
    // The columns NOT in the patch must keep their values (NOT nulled — the partial-patch contract).
    assert.equal(patched.name, 'Phase1 Lifecycle Probe', 'name preserved');
    assert.equal(patched.formula, 'probe_formula', 'formula preserved');
    assert.equal(patched.formula_desc, 'a probe for the lifecycle test', 'formula_desc preserved');
    assert.equal(patched.sharpe_estimate, 1.23, 'sharpe_estimate preserved');
    assert.equal(patched.correlation_cluster, 'cluster-probe', 'correlation_cluster preserved');
    assert.equal(patched.crypto_compatible, 1, 'crypto_compatible preserved');
    assert.equal(patched.category, 'momentum', 'category preserved');
    assert.deepEqual(patched.tags, ['probe', 'phase1'], 'tags preserved');
  } finally {
    // Teardown: remove the probe row via a raw DB delete so the live DB returns to its
    // starting factor count. (The store exposes openDb; no delete export, so delete directly.)
    const db = openDb();
    db.prepare('DELETE FROM alpha_factors WHERE id = ?').run(TEST_ID);
  }
  const endCount = listFactors({}).length;
  assert.equal(endCount, startCount, `live DB must return to its starting factor count (${startCount})`);
});
