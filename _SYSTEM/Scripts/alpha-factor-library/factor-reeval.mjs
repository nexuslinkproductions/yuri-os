// @capability: factor-reeval
// @serves: nightly factor re-evaluation | rolling DSR brier | factor lifecycle promote retire | learn loop reeval
// @does: self-improvement engine — reads AFL_LEDGER outcomes, computes rolling DSR + Brier per factor, runs the fleet promotion gate, and (when armed) transitions factor lifecycle in the corpus DB
// @use: run nightly (or on demand) to close the learn loop: ledger outcomes → stats → gate → lifecycle. Dry-run by default (apply:false). Arm mutations with apply:true in the nightly beat.
// @exports: brierScore, computeFactorStats, reevaluateFactors
/**
 * factor-reeval.mjs — AFL self-improvement engine (nightly factor re-evaluation).
 *
 * Closes the learn loop that AFL Phase 1 left open:
 *
 *   AFL_LEDGER accrues per-factor outcome records over time (from the live trading paper
 *   engine, the nano-swarm hydration beat, or explicit resolveFactorSignal calls).
 *   This module reads those records, groups them by factorId, computes rolling statistics
 *   (Sharpe via backtestFactor, DSR via deflatedSharpe, Brier calibration score), runs
 *   factorPromotionGate with the FULL fleet for BH-FDR multiple-testing control, and
 *   (when apply:true) writes lifecycle transitions back to the corpus DB via updateFactor
 *   and logs performance metrics via recordPerformance.
 *
 * Record formats understood from AFL_LEDGER:
 *
 *   (A) Flat learn-loop records (the primary format the nightly beat emits):
 *         { factorId, realizedReturn, forecast, outcome, ts }
 *       where `realizedReturn` is a finite number, `forecast` is probability in [0,1],
 *       `outcome` is 0 or 1 (binary signal correctness).
 *
 *   (B) Prediction-ledger-style records (emitted by recordFactorSignal / recordFactorForecast):
 *         type:"prediction"  { id, subject:"factor:<factorId>", predictedEffects:[{target, effect, confidence}], ts }
 *         type:"outcome"     { predictionId, observedEffects:[{target, effect}], ts }
 *       Pairs are matched by predictionId. The confidence from the first predictedEffect
 *       becomes `forecast`; a matched effect becomes outcome=1, unmatched outcome=0.
 *       A `realizedReturn` field on the prediction row is carried through if present.
 *
 * In both formats, records with n < minN (default 30) are skipped — too few observations
 * to estimate a reliable Sharpe or DSR. The caller can lower minN for testing.
 *
 * Hard constraints (enforced in this module):
 *   - apply:false (the default) MUST NOT mutate the DB or any file. Zero writes.
 *   - NO look-ahead: only realized outcomes already in the ledger are consumed.
 *   - fail-soft: a corrupt ledger line or a NaN return is skipped, never throws.
 *   - pure ESM .mjs, deterministic, no network.
 *
 * Lifecycle transitions (apply:true only):
 *   - promote: status → 'validated' (from 'candidate' or 'hypothesis') if the gate passes.
 *     Logs metric 'dsr' and 'brier' via recordPerformance.
 *   - retire: status → 'retired' if n >= minN AND gate.promote === false AND current
 *     status is already 'validated' (persistent failure after confirmed edge). Protects
 *     hypothesis/candidate factors from premature retirement on thin data.
 *
 * Related:
 *   - factor-evaluator.mjs    (backtestFactor, deflatedSharpe, factorPromotionGate, AFL_LEDGER)
 *   - alpha-factor-store.mjs  (updateFactor, recordPerformance, getFactor)
 *   - prediction-ledger.mjs   (readLedger — used to parse format-B records)
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';

import {
  AFL_LEDGER,
  backtestFactor,
  deflatedSharpe,
  factorPromotionGate,
} from './factor-evaluator.mjs';
import {
  updateFactor,
  recordPerformance,
  getFactor,
} from './alpha-factor-store.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const isNum = (x) => typeof x === 'number' && Number.isFinite(x);

// ---------------------------------------------------------------------------
// brierScore — mean squared calibration error over {forecast, outcome} pairs.
// ---------------------------------------------------------------------------

/**
 * Brier score over an array of {forecast, outcome} pairs.
 *
 *   BS = (1/N) · Σ (forecast_i − outcome_i)²
 *
 * A perfectly calibrated binary forecaster scores 0. A coin-flip at 0.5 with
 * random outcomes scores ~0.25. An always-wrong forecaster scores 1.
 *
 * @param {Array<{forecast:number, outcome:0|1}>} pairs
 *   forecast in [0,1]; outcome binary (0 or 1). Non-finite entries are skipped.
 * @returns {number|null} mean squared error in [0,1], or null for an empty/all-skipped input.
 */
export function brierScore(pairs) {
  if (!Array.isArray(pairs) || pairs.length === 0) return null;
  let sum = 0;
  let n = 0;
  for (const p of pairs) {
    if (!p || !isNum(p.forecast) || !isNum(p.outcome)) continue;
    const f = p.forecast;
    const o = p.outcome;
    // Tolerate non-binary outcomes (e.g. 0.0 / 1.0) but skip anything out of [0,1].
    if (f < 0 || f > 1 || o < 0 || o > 1) continue;
    sum += (f - o) ** 2;
    n++;
  }
  if (n === 0) return null;
  return sum / n;
}

// ---------------------------------------------------------------------------
// Ledger parsing helpers.
// ---------------------------------------------------------------------------

/**
 * Read and parse AFL_LEDGER into flat per-factor records.
 * Supports format-A (flat) and format-B (prediction-ledger paired rows).
 * Corrupt / unrecognised lines are silently skipped (fail-soft contract).
 *
 * Returns an array of normalised records:
 *   { factorId:string, realizedReturn:number|null, forecast:number|null, outcome:0|1|null, ts:number }
 *
 * @param {string} ledgerPath  path to the AFL prediction ledger JSONL file
 * @returns {Array<object>}
 */
function readAflRecords(ledgerPath) {
  let raw;
  try {
    raw = readFileSync(ledgerPath, 'utf8');
  } catch {
    // File absent / unreadable → empty ledger.
    return [];
  }

  const lines = raw.split('\n');
  const rows = [];
  const predMap = new Map(); // id -> prediction row (format-B)
  const outcomeMap = new Map(); // predictionId -> outcome row (format-B)

  // First pass: parse all lines, bucket by format.
  for (const line of lines) {
    const t = line.trim();
    if (!t) continue;
    let obj;
    try {
      obj = JSON.parse(t);
    } catch {
      // Corrupt line — skip.
      continue;
    }
    if (!obj || typeof obj !== 'object') continue;

    if (obj.type === 'prediction') {
      // Format-B prediction row.
      if (obj.id != null) predMap.set(String(obj.id), obj);
      continue;
    }
    if (obj.type === 'outcome') {
      // Format-B outcome row.
      if (obj.predictionId != null) outcomeMap.set(String(obj.predictionId), obj);
      continue;
    }

    // Format-A: flat record with factorId.
    if (obj.factorId != null && isNum(obj.realizedReturn)) {
      rows.push({
        factorId: String(obj.factorId),
        realizedReturn: obj.realizedReturn,
        forecast: isNum(obj.forecast) ? obj.forecast : null,
        outcome: (obj.outcome === 0 || obj.outcome === 1) ? obj.outcome : null,
        ts: isNum(obj.ts) ? obj.ts : 0,
      });
    }
  }

  // Second pass: match format-B prediction↔outcome pairs.
  for (const [predId, pred] of predMap) {
    // Extract factorId: prefer the explicit top-level field (trade-outcome-decoder
    // writes it there), then the legacy subject "factor:<id>" convention.
    let factorId = null;
    if (typeof pred.factorId === 'string' && pred.factorId) {
      factorId = pred.factorId;
    } else if (typeof pred.subject === 'string') {
      const m = pred.subject.match(/^factor:(.+)$/);
      if (m) factorId = m[1];
    }
    if (!factorId) continue; // Not a factor record.

    // Extract forecast confidence from the first predictedEffect.
    let forecast = null;
    if (Array.isArray(pred.predictedEffects) && pred.predictedEffects.length > 0) {
      const pe = pred.predictedEffects[0];
      if (pe && isNum(pe.confidence)) forecast = pe.confidence;
    }

    // realizedReturn: the trade-outcome-decoder carries it as `ret` on the OUTCOME row;
    // fall back to a hybrid prediction-row field, then to the observed-effect value.
    const out = outcomeMap.get(predId);
    let realizedReturn = null;
    if (out && isNum(out.ret)) {
      realizedReturn = out.ret;
    } else if (isNum(pred.realizedReturn)) {
      realizedReturn = pred.realizedReturn;
    } else if (out && Array.isArray(out.observedEffects)) {
      const oeRet = out.observedEffects.find((e) => e && e.target === 'realized_return_positive');
      if (oeRet && isNum(oeRet.value)) realizedReturn = oeRet.value;
    }

    // Match outcome (was the directional call correct?) if available.
    let outcome = null;
    if (out && Array.isArray(out.observedEffects) && out.observedEffects.length > 0 &&
        Array.isArray(pred.predictedEffects) && pred.predictedEffects.length > 0) {
      // outcome = 1 if the first predicted effect matches the first observed effect.
      const pe = pred.predictedEffects[0];
      const oe = out.observedEffects[0];
      if (pe && oe && pe.target === oe.target) {
        outcome = pe.effect === oe.effect ? 1 : 0;
      }
    }

    // Only emit rows with at least a realized return OR a forecast+outcome pair.
    if (realizedReturn !== null || (forecast !== null && outcome !== null)) {
      rows.push({
        factorId,
        realizedReturn,
        forecast,
        outcome,
        ts: (out && isNum(out.ts)) ? out.ts : (isNum(pred.ts) ? pred.ts : 0),
      });
    }
  }

  return rows;
}

// ---------------------------------------------------------------------------
// computeFactorStats — group records by factorId, compute rolling stats.
// ---------------------------------------------------------------------------

/**
 * Compute rolling statistics per factor from AFL_LEDGER records.
 *
 * Groups the normalised records by factorId, then for each group with n >= 2 returns:
 *   - n: number of records used
 *   - meanReturn: arithmetic mean of realizedReturn values
 *   - sharpe: annualized Sharpe ratio (backtestFactor, periodsPerYear=365)
 *   - sharpePeriod: per-period (un-annualized) Sharpe (the DSR input)
 *   - dsr: Deflated Sharpe Ratio (deflatedSharpe, nTrials = total distinct factors in this run)
 *   - sr0: deflated bar from the False Strategy Theorem
 *   - brier: Brier score over {forecast, outcome} pairs present in the group (null if none)
 *
 * Factors with n < 2 are skipped (no variance estimate possible).
 *
 * @param {Array<object>} records  normalised AFL_LEDGER records (from readAflRecords)
 * @returns {Array<{factorId, n, meanReturn, sharpe, sharpePeriod, dsr, sr0, brier}>}
 */
export function computeFactorStats(records) {
  if (!Array.isArray(records) || records.length === 0) return [];

  // Group records by factorId.
  const byFactor = new Map();
  for (const r of records) {
    if (!r || !r.factorId) continue;
    if (!byFactor.has(r.factorId)) byFactor.set(r.factorId, []);
    byFactor.get(r.factorId).push(r);
  }

  const nFactors = byFactor.size; // Total distinct factors = nTrials for DSR.
  const result = [];

  for (const [factorId, recs] of byFactor) {
    // Collect return series (finite values only).
    const returns = recs
      .map((r) => r.realizedReturn)
      .filter((v) => isNum(v));

    if (returns.length < 2) continue; // Cannot estimate variance.

    const bt = backtestFactor(returns, { periodsPerYear: 365 });

    // DSR: nTrials = number of distinct factors in this evaluation run (multiple-testing).
    // T = number of return observations for this factor.
    // sharpePeriod is the per-period SR (annualization-free) — what DSR expects.
    const T = bt.n;
    const nTrials = Math.max(1, nFactors);
    const ds = deflatedSharpe(bt.sharpePeriod, { nTrials, T });

    // Brier score over pairs where both forecast and outcome are present.
    const brierPairs = recs
      .filter((r) => isNum(r.forecast) && (r.outcome === 0 || r.outcome === 1))
      .map((r) => ({ forecast: r.forecast, outcome: r.outcome }));
    const brier = brierScore(brierPairs);

    result.push({
      factorId,
      n: returns.length,
      meanReturn: bt.mean,
      sharpe: bt.sharpe,
      sharpePeriod: bt.sharpePeriod,
      dsr: ds.dsr,
      sr0: ds.sr0,
      brier,
    });
  }

  return result;
}

// ---------------------------------------------------------------------------
// reevaluateFactors — the main nightly beat entry point.
// ---------------------------------------------------------------------------

/**
 * Read the AFL_LEDGER, compute per-factor stats, run the fleet promotion gate,
 * and optionally transition lifecycle in the corpus DB.
 *
 * @param {object} opts
 * @param {string}  [opts.aflLedgerPath=AFL_LEDGER]  Path to the AFL prediction ledger JSONL.
 * @param {number}  [opts.minN=30]    Minimum observations per factor to evaluate.
 * @param {number}  [opts.q=0.1]      BH-FDR false-discovery rate threshold.
 * @param {boolean} [opts.apply=false] When true, write lifecycle transitions to the DB.
 *                                     MUST default false — dry-run, ZERO DB writes.
 *
 * @returns {Promise<{
 *   factors: Array<{factorId, stats, gate, transition:null|{from,to}}>,
 *   promoted: number,
 *   retired: number,
 *   evaluated: number,
 *   applied: boolean,
 * }>}
 *
 * Lifecycle transitions (apply:true only):
 *   PROMOTE: gate.promote === true AND current DB status is 'hypothesis' or 'candidate'
 *     → updateFactor(id, { status: 'validated' })
 *     + recordPerformance({ factorId, metric: 'dsr', value: stats.dsr })
 *     + recordPerformance({ factorId, metric: 'brier', value: stats.brier })
 *   RETIRE:  gate.promote === false AND current DB status === 'validated'
 *     → updateFactor(id, { status: 'retired' })
 *
 * Errors from DB writes are caught per-factor and logged to stderr; they do not abort
 * the run (fail-soft). A DB error on one factor never prevents the rest from evaluating.
 */
export async function reevaluateFactors({
  aflLedgerPath = AFL_LEDGER,
  minN = 30,
  q = 0.1,
  apply = false,
} = {}) {
  // (1) Read and parse the ledger. Fail-soft: returns [] on any I/O error.
  let allRecords;
  try {
    allRecords = readAflRecords(aflLedgerPath);
  } catch {
    allRecords = [];
  }

  // (2) Compute per-factor stats. Filter to factors with n >= minN.
  let allStats;
  try {
    allStats = computeFactorStats(allRecords);
  } catch {
    allStats = [];
  }
  const stats = allStats.filter((s) => s.n >= minN);

  if (stats.length === 0) {
    return {
      factors: [],
      promoted: 0,
      retired: 0,
      evaluated: 0,
      applied: apply,
    };
  }

  // (3) Build the fleet p-values array for BH-FDR.
  // Convert DSR (a probability) to a p-value: pValue = 1 - dsr.
  // The gate passes if pValue <= BH threshold (equivalently dsr >= 1 - threshold).
  const fleetPValues = stats.map((s) => 1 - s.dsr);

  // (4) Run factorPromotionGate per factor with the fleet for BH-FDR control.
  const factorResults = [];
  let promoted = 0;
  let retired = 0;

  for (let i = 0; i < stats.length; i++) {
    const s = stats[i];
    let gate;
    try {
      gate = factorPromotionGate({
        observedSharpe: s.sharpePeriod,
        nTrials: stats.length,  // Number of factors evaluated this run.
        T: s.n,
        pValue: fleetPValues[i],
        fleetPValues,
        q,
      });
    } catch (err) {
      // Fail-soft: emit a blocked gate and continue.
      gate = {
        promote: false,
        reasons: [`gate error: ${err && err.message ? err.message : String(err)}`],
        dsr: s.dsr,
        sr0: s.sr0,
        fdr: null,
      };
    }

    // (5) Determine lifecycle transition.
    let transition = null;

    if (apply) {
      // Fetch current status from DB (read-only; never throws on missing factor — treat as unknown).
      let currentStatus = 'unknown';
      try {
        const row = getFactor(s.factorId);
        if (row && row.status) currentStatus = row.status;
      } catch {
        currentStatus = 'unknown';
      }

      if (gate.promote && (currentStatus === 'hypothesis' || currentStatus === 'candidate')) {
        // Promote to validated.
        try {
          updateFactor(s.factorId, { status: 'validated' });
          recordPerformance({ factorId: s.factorId, metric: 'dsr', value: s.dsr });
          if (s.brier !== null) {
            recordPerformance({ factorId: s.factorId, metric: 'brier', value: s.brier });
          }
          transition = { from: currentStatus, to: 'validated' };
          promoted++;
        } catch (err) {
          process.stderr.write(
            `[factor-reeval] promote failed for ${s.factorId}: ${err && err.message ? err.message : String(err)}\n`
          );
        }
      } else if (!gate.promote && currentStatus === 'validated') {
        // Retire a previously validated factor that now persistently fails the gate.
        try {
          updateFactor(s.factorId, { status: 'retired' });
          transition = { from: 'validated', to: 'retired' };
          retired++;
        } catch (err) {
          process.stderr.write(
            `[factor-reeval] retire failed for ${s.factorId}: ${err && err.message ? err.message : String(err)}\n`
          );
        }
      }
    }

    factorResults.push({
      factorId: s.factorId,
      stats: s,
      gate,
      transition,
    });
  }

  return {
    factors: factorResults,
    promoted,
    retired,
    evaluated: stats.length,
    applied: apply,
  };
}

// ---------------------------------------------------------------------------
// Self-test — `node factor-reeval.mjs --test`
// ---------------------------------------------------------------------------

const _isMain = import.meta.url === (
  typeof process !== 'undefined'
    ? `file://${process.argv[1]}`
    : null
);

if (_isMain && process.argv.includes('--test')) {
  // ──────────────────────────────────────────────────────────────────
  // Test harness.
  // ──────────────────────────────────────────────────────────────────
  const { writeFileSync, unlinkSync, existsSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');

  let pass = 0;
  let fail = 0;
  const errs = [];

  function ok(label, cond, detail = '') {
    if (cond) {
      pass++;
    } else {
      fail++;
      errs.push(`FAIL [${label}]${detail ? ': ' + detail : ''}`);
    }
  }

  // ── Seeded deterministic LCG + Box-Muller ──────────────────────────
  function makeRng(seed0) {
    let s = (seed0 >>> 0);
    const rand = () => {
      s = (Math.imul(s, 1103515245) + 12345) & 0x7fffffff;
      return s / 0x7fffffff;
    };
    const gauss = () => {
      let u = 0, v = 0;
      while (u === 0) u = rand();
      while (v === 0) v = rand();
      return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
    };
    return { rand, gauss };
  }

  // Strong factor: drift=0.006/vol=0.02 → sharpePeriod≈0.29 → DSR≈0.999 with T=200, nTrials≤3.
  // Verified via dsr-probe: drift=0.006,n=200,nTrials=3 → dsr=0.9992 (passes=true).
  function makeStrongSeries(n = 200, drift = 0.006, vol = 0.02, seed = 42) {
    const { gauss } = makeRng(seed);
    return Array.from({ length: n }, () => drift + vol * gauss());
  }

  // Noisy zero-edge factor: zero drift, same vol.
  function makeNoisySeries(n = 200, vol = 0.02, seed = 99) {
    const { gauss } = makeRng(seed);
    return Array.from({ length: n }, () => vol * gauss());
  }

  // Calibrated forecasts for strong factor (high confidence, mostly correct).
  function makeStrongForecasts(n = 200, seed = 11) {
    const { rand } = makeRng(seed);
    return Array.from({ length: n }, () => ({
      forecast: 0.7 + 0.25 * rand(),  // 0.70..0.95, consistently high
      outcome: rand() > 0.25 ? 1 : 0, // 75% hit rate → low Brier
    }));
  }

  // Noisy forecasts: random, poorly calibrated (high forecast, random outcome).
  function makeNoisyForecasts(n = 200, seed = 77) {
    const { rand } = makeRng(seed);
    return Array.from({ length: n }, () => ({
      forecast: 0.4 + 0.4 * rand(),   // 0.4..0.8, mediocre
      outcome: rand() > 0.5 ? 1 : 0,  // 50% → ~coin flip → Brier ~0.25
    }));
  }

  // ── Build synthetic AFL_LEDGER in /tmp ────────────────────────────
  const tmpLedger = `${tmpdir()}/factor-reeval-test-${Date.now()}.jsonl`;

  const strong = makeStrongSeries(200);
  const noisy = makeNoisySeries(200);
  const strongFc = makeStrongForecasts(200);
  const noisyFc = makeNoisyForecasts(200);

  const ledgerRows = [];

  // STRONG_FACTOR: format-A flat records with realizedReturn + forecast + outcome.
  for (let i = 0; i < strong.length; i++) {
    ledgerRows.push(JSON.stringify({
      factorId: 'strong-factor',
      realizedReturn: strong[i],
      forecast: strongFc[i].forecast,
      outcome: strongFc[i].outcome,
      ts: 1_700_000_000_000 + i * 1000,
    }));
  }

  // NOISY_FACTOR: format-A flat records.
  for (let i = 0; i < noisy.length; i++) {
    ledgerRows.push(JSON.stringify({
      factorId: 'noisy-factor',
      realizedReturn: noisy[i],
      forecast: noisyFc[i].forecast,
      outcome: noisyFc[i].outcome,
      ts: 1_700_000_000_000 + i * 1000,
    }));
  }

  // ONE_SAMPLE_FACTOR: only 1 record — must be skipped by computeFactorStats (n<2).
  ledgerRows.push(JSON.stringify({
    factorId: 'one-sample-factor',
    realizedReturn: 0.01,
    forecast: 0.9,
    outcome: 1,
    ts: 1_700_000_000_000,
  }));

  // CONSTANT_FACTOR: all-identical returns (zero variance — Sharpe guard must fire).
  for (let i = 0; i < 50; i++) {
    ledgerRows.push(JSON.stringify({
      factorId: 'constant-factor',
      realizedReturn: 0.001, // constant
      forecast: 0.8,
      outcome: 1,
      ts: 1_700_000_000_000 + i * 1000,
    }));
  }

  // CORRUPT LINE: must be silently skipped.
  ledgerRows.push('{bad json :::');

  writeFileSync(tmpLedger, ledgerRows.join('\n') + '\n', 'utf8');

  // ── T1: brierScore hand-computed cases ──────────────────────────────
  {
    // All right: forecast=1.0, outcome=1 → (1-1)²=0 per pair.
    ok('brierScore.all-right', brierScore([
      { forecast: 1.0, outcome: 1 },
      { forecast: 1.0, outcome: 1 },
    ]) === 0, `expected 0`);

    // All wrong: forecast=1.0, outcome=0 → (1-0)²=1 per pair.
    ok('brierScore.all-wrong', brierScore([
      { forecast: 1.0, outcome: 0 },
      { forecast: 1.0, outcome: 0 },
    ]) === 1, `expected 1`);

    // Mixed exact: [(0.8,1),(0.4,0)] → ((0.8-1)²+(0.4-0)²)/2 = (0.04+0.16)/2 = 0.1
    const mixed = brierScore([
      { forecast: 0.8, outcome: 1 },
      { forecast: 0.4, outcome: 0 },
    ]);
    const mixedExpected = ((0.8 - 1) ** 2 + (0.4 - 0) ** 2) / 2;
    ok('brierScore.mixed-exact',
      Math.abs(mixed - mixedExpected) < 1e-12,
      `got ${mixed}, expected ${mixedExpected}`
    );

    // Empty → null.
    ok('brierScore.empty', brierScore([]) === null);
    ok('brierScore.null-arg', brierScore(null) === null);
    ok('brierScore.bad-pair-skipped', brierScore([{ forecast: NaN, outcome: 1 }]) === null);
  }

  // ── T2: computeFactorStats ────────────────────────────────────────
  {
    const records = readAflRecords(tmpLedger); // internal — not exported, access via reevaluateFactors
    // Re-derive stats directly for the test.
    const statsAll = computeFactorStats(records);
    const statsById = Object.fromEntries(statsAll.map((s) => [s.factorId, s]));

    const sf = statsById['strong-factor'];
    const nf = statsById['noisy-factor'];
    const cf = statsById['constant-factor'];

    ok('computeFactorStats.strong-exists', !!sf, 'strong-factor must appear in stats');
    ok('computeFactorStats.noisy-exists', !!nf, 'noisy-factor must appear in stats');
    ok('computeFactorStats.one-sample-absent', !statsById['one-sample-factor'],
      'one-sample-factor (n=1) must be skipped');
    ok('computeFactorStats.constant-exists', !!cf, 'constant-factor (n=50) must appear (n>=2 check only)');

    if (sf) {
      ok('computeFactorStats.strong.n', sf.n === 200, `expected 200, got ${sf.n}`);
      ok('computeFactorStats.strong.sharpe-positive', sf.sharpe > 0,
        `strong factor must have positive annualized Sharpe, got ${sf.sharpe}`);
      ok('computeFactorStats.strong.dsr-finite', isNum(sf.dsr), `dsr must be finite`);
      ok('computeFactorStats.strong.brier-finite', sf.brier !== null && isNum(sf.brier),
        `strong brier must be a finite number`);
    }
    if (nf) {
      ok('computeFactorStats.noisy.n', nf.n === 200, `expected 200, got ${nf.n}`);
      ok('computeFactorStats.noisy.dsr-finite', isNum(nf.dsr));
    }
    if (cf) {
      // Constant returns → zero variance → sharpePeriod should be 0 (backtestFactor guard).
      ok('computeFactorStats.constant.sharpe-zero', cf.sharpePeriod === 0,
        `constant series must yield sharpePeriod=0, got ${cf.sharpePeriod}`);
    }

    // Strong DSR should be greater than noisy DSR (strong factor has real edge).
    if (sf && nf) {
      ok('computeFactorStats.dsr-ordering', sf.dsr > nf.dsr,
        `strong.dsr=${sf.dsr} must exceed noisy.dsr=${nf.dsr}`);
      // Strong brier should be lower (better calibrated) than noisy brier.
      if (sf.brier !== null && nf.brier !== null) {
        ok('computeFactorStats.brier-ordering', sf.brier < nf.brier,
          `strong.brier=${sf.brier} must be lower than noisy.brier=${nf.brier}`);
      }
    }
  }

  // ── T3: reevaluateFactors dry-run (apply:false) ────────────────────
  {
    // Snapshot DB state before dry-run: strong-factor and noisy-factor likely
    // don't exist in the live DB, so we just verify nothing is written.
    // We confirm apply:false leaves the DB unmodified by checking that no
    // updateFactor call could have been invoked (no transition should be non-null
    // from a dry-run).
    const result = await reevaluateFactors({
      aflLedgerPath: tmpLedger,
      minN: 5,   // Low threshold so test data qualifies.
      q: 0.1,
      apply: false,
    });

    ok('reevaluateFactors.dryrun-applied-false', result.applied === false);
    ok('reevaluateFactors.dryrun-transitions-null',
      result.factors.every((f) => f.transition === null),
      'apply:false must leave ALL transitions null (no DB writes)'
    );
    ok('reevaluateFactors.dryrun-evaluated-positive', result.evaluated > 0,
      `expected at least 1 factor evaluated, got ${result.evaluated}`);

    const strongR = result.factors.find((f) => f.factorId === 'strong-factor');
    const noisyR = result.factors.find((f) => f.factorId === 'noisy-factor');

    ok('reevaluateFactors.dryrun-strong-exists', !!strongR);
    ok('reevaluateFactors.dryrun-noisy-exists', !!noisyR);

    if (strongR && noisyR) {
      ok('reevaluateFactors.strong-gate-promote', strongR.gate.promote === true,
        `strong factor must promote (gate.promote=true), reasons=${JSON.stringify(strongR.gate.reasons)}`);
      ok('reevaluateFactors.noisy-gate-no-promote', noisyR.gate.promote === false,
        `noisy factor must NOT promote (gate.promote=false), reasons=${JSON.stringify(noisyR.gate.reasons)}`);
    }
  }

  // ── T4: empty ledger ──────────────────────────────────────────────
  {
    const emptyLedger = `${tmpdir()}/factor-reeval-empty-${Date.now()}.jsonl`;
    writeFileSync(emptyLedger, '', 'utf8');
    const result = await reevaluateFactors({
      aflLedgerPath: emptyLedger,
      minN: 1,
      apply: false,
    });
    ok('reevaluateFactors.empty-ledger-ok', result.evaluated === 0 && result.factors.length === 0);
    unlinkSync(emptyLedger);
  }

  // ── T5: missing ledger (file does not exist) ───────────────────────
  {
    const missingPath = `${tmpdir()}/factor-reeval-missing-${Date.now()}.jsonl`;
    const result = await reevaluateFactors({
      aflLedgerPath: missingPath,
      minN: 1,
      apply: false,
    });
    ok('reevaluateFactors.missing-ledger-ok', result.evaluated === 0);
  }

  // ── T6: apply:false MUST NOT touch DB ─────────────────────────────
  // We verify this structurally: all transitions are null (checked in T3).
  // Redundant explicit check for clarity.
  {
    const result = await reevaluateFactors({
      aflLedgerPath: tmpLedger,
      minN: 5,
      apply: false,
    });
    ok('apply-false-no-db-writes',
      result.factors.every((f) => f.transition === null),
      'apply:false transitions must ALL be null — zero DB writes'
    );
    ok('apply-false-promoted-zero', result.promoted === 0,
      'apply:false promoted count must be 0'
    );
    ok('apply-false-retired-zero', result.retired === 0,
      'apply:false retired count must be 0'
    );
  }

  // ── T7: format-B (prediction-ledger-style) records ────────────────
  {
    const fmtBLedger = `${tmpdir()}/factor-reeval-fmtb-${Date.now()}.jsonl`;
    const rows = [];
    // Write 10 prediction+outcome pairs for a factor named 'fmtb-factor'.
    for (let i = 0; i < 10; i++) {
      const predId = `pred-fmtb-${i}`;
      rows.push(JSON.stringify({
        type: 'prediction',
        id: predId,
        subject: 'factor:fmtb-factor',
        change: 'signal:candidate',
        predictedEffects: [{ target: 'out_of_sample_sharpe_positive', effect: 'holds', confidence: 0.8 }],
        realizedReturn: 0.002 + 0.001 * i,
        source: 'test',
        ts: 1_700_000_000_000 + i * 1000,
      }));
      rows.push(JSON.stringify({
        type: 'outcome',
        predictionId: predId,
        observedEffects: [{ target: 'out_of_sample_sharpe_positive', effect: 'holds' }],
        ts: 1_700_000_000_000 + i * 1000 + 500,
      }));
    }
    writeFileSync(fmtBLedger, rows.join('\n') + '\n', 'utf8');

    const result = await reevaluateFactors({
      aflLedgerPath: fmtBLedger,
      minN: 2,
      apply: false,
    });
    const fmtbR = result.factors.find((f) => f.factorId === 'fmtb-factor');
    ok('fmtb-factor-parsed', !!fmtbR, 'format-B factor must be parsed from prediction-ledger records');
    if (fmtbR) {
      ok('fmtb-n-correct', fmtbR.stats.n >= 2, `n must be >= 2, got ${fmtbR.stats.n}`);
      ok('fmtb-brier-non-null', fmtbR.stats.brier !== null,
        'brier must be non-null when forecast+outcome are present');
    }
    unlinkSync(fmtBLedger);
  }

  // ── Cleanup ──────────────────────────────────────────────────────
  if (existsSync(tmpLedger)) unlinkSync(tmpLedger);

  // ── Result ────────────────────────────────────────────────────────
  const total = pass + fail;
  if (errs.length > 0) {
    for (const e of errs) process.stderr.write(e + '\n');
  }
  console.log(`factor-reeval --test: ${pass} pass, ${fail} fail`);
  process.exit(fail > 0 ? 1 : 0);
}
