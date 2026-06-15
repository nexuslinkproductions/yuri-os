// WORK PACKAGE ANALYZE — YURI energy-weight calibration swarm
// Pure deterministic measurement instrument: bootstrap CIs + differential comparison

import { percentile, median } from './math-kernel.mjs';
import {
  DEFAULT_WEIGHTS,
  resolveFullWeights,
  validateCandidateWeights,
  reconstructRawComponents,
  rescoreRecordU,
  BURN_IN_DEFAULT_SUBSET,
  resolveFormulaVersion,
  formulaVersionTally,
  assertSingleEra,
  makeSeededRng,
  buildResultLabel,
  LANE_IDS,
  PASS_TYPES,
  evidence,
} from './energy-calibration-contract.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ── Private helpers ──────────────────────────────────────────────

function mean(values) {
  if (values.length === 0) return NaN;
  let sum = 0;
  for (let i = 0; i < values.length; i++) sum += values[i];
  return sum / values.length;
}

function fractionTrue(values) {
  if (values.length === 0) return NaN;
  let count = 0;
  for (let i = 0; i < values.length; i++) {
    if (values[i] === true) count++;
  }
  return count / values.length;
}

// ── Exported pure functions ──────────────────────────────────────

/**
 * Descriptive statistics for a numeric array.
 * @returns {{ n, mean, median, p05, p95, min, max }}
 */
export function summarize(values) {
  if (!Array.isArray(values) || values.length === 0) {
    return { n: 0, mean: NaN, median: NaN, p05: NaN, p95: NaN, min: NaN, max: NaN };
  }
  const sorted = [...values].sort((a, b) => a - b);
  return {
    n: values.length,
    mean: mean(values),
    median: median(values),
    p05: percentile(values, 5),
    p95: percentile(values, 95),
    min: sorted[0],
    max: sorted[sorted.length - 1],
  };
}

/**
 * Bootstrap confidence interval for an arbitrary statistic.
 * Deterministic: same (values, seed, resamples) → identical {point, lo, hi}.
 * @returns {{ point, lo, hi, resamples, n, sampledN }}
 */
export function bootstrapCI(values, statFn, { resamples = 2000, seed = 1, ciLevel = 95, maxN } = {}) {
  if (!Array.isArray(values) || values.length === 0) {
    const pt = Array.isArray(values) ? statFn(values) : NaN;
    return { point: pt, lo: NaN, hi: NaN, resamples: 0, n: values ? values.length : 0, sampledN: 0 };
  }

  const rng = makeSeededRng(seed);
  let working = values;
  let sampledN = values.length;

  // Deterministic subsample via Fisher-Yates partial shuffle if maxN exceeded
  if (maxN != null && values.length > maxN) {
    const idxArr = Array.from({ length: values.length }, (_, i) => i);
    for (let i = 0; i < maxN; i++) {
      const j = i + Math.floor(rng() * (values.length - i));
      const tmp = idxArr[i]; idxArr[i] = idxArr[j]; idxArr[j] = tmp;
    }
    working = idxArr.slice(0, maxN).map(i => values[i]);
    sampledN = maxN;
  }

  const point = statFn(working);

  // Resample-with-replacement loop (same RNG, consumed sequentially)
  const stats = new Array(resamples);
  for (let r = 0; r < resamples; r++) {
    const sample = new Array(sampledN);
    for (let i = 0; i < sampledN; i++) {
      sample[i] = working[Math.floor(rng() * sampledN)];
    }
    stats[r] = statFn(sample);
  }

  const lo = percentile(stats, (100 - ciLevel) / 2);
  const hi = percentile(stats, 100 - (100 - ciLevel) / 2);

  return { point, lo, hi, resamples, n: values.length, sampledN };
}

/**
 * Differential comparison between two series with bootstrap CI on the delta.
 * @returns {{ metric, pointA, pointB, deltaPoint, ci:{lo,hi}, significant, sampledN }}
 */
export function differential(
  seriesA,
  seriesB,
  { metric = 'meanDeltaU', resamples = 2000, seed = 1, ciLevel = 95, maxN } = {}
) {
  // Validate boolean requirement for rejectionRate
  if (metric === 'rejectionRate') {
    for (const series of [seriesA, seriesB]) {
      for (const v of series) {
        if (typeof v !== 'boolean') {
          throw new Error(
            `differential(metric='rejectionRate') requires boolean arrays (isReject per item). ` +
            `Got ${typeof v} — if you have a summary.json deltaUSeries, use metric='meanDeltaU' instead, ` +
            `or derive booleans from steps[].accept via seriesFromSteps(steps, 'rejectionRate').`
          );
        }
      }
    }
  }

  const statFn = metric === 'rejectionRate' ? fractionTrue : mean;
  const rng = makeSeededRng(seed);

  let workA = seriesA;
  let workB = seriesB;
  let sampledNA = seriesA.length;
  let sampledNB = seriesB.length;

  // Subsample if needed
  if (maxN != null) {
    if (seriesA.length > maxN) {
      const idxArr = Array.from({ length: seriesA.length }, (_, i) => i);
      for (let i = 0; i < maxN; i++) {
        const j = i + Math.floor(rng() * (seriesA.length - i));
        const tmp = idxArr[i]; idxArr[i] = idxArr[j]; idxArr[j] = tmp;
      }
      workA = idxArr.slice(0, maxN).map(i => seriesA[i]);
      sampledNA = maxN;
    }
    if (seriesB.length > maxN) {
      const idxArr = Array.from({ length: seriesB.length }, (_, i) => i);
      for (let i = 0; i < maxN; i++) {
        const j = i + Math.floor(rng() * (seriesB.length - i));
        const tmp = idxArr[i]; idxArr[i] = idxArr[j]; idxArr[j] = tmp;
      }
      workB = idxArr.slice(0, maxN).map(i => seriesB[i]);
      sampledNB = maxN;
    }
  }

  const pointA = statFn(workA);
  const pointB = statFn(workB);
  const deltaPoint = pointB - pointA;

  // Bootstrap the delta distribution (independent resamples from each series)
  const deltas = new Array(resamples);
  for (let r = 0; r < resamples; r++) {
    const sampleA = new Array(sampledNA);
    for (let i = 0; i < sampledNA; i++) {
      sampleA[i] = workA[Math.floor(rng() * sampledNA)];
    }
    const sampleB = new Array(sampledNB);
    for (let i = 0; i < sampledNB; i++) {
      sampleB[i] = workB[Math.floor(rng() * sampledNB)];
    }
    deltas[r] = statFn(sampleB) - statFn(sampleA);
  }

  const lo = percentile(deltas, (100 - ciLevel) / 2);
  const hi = percentile(deltas, 100 - (100 - ciLevel) / 2);
  const significant = lo > 0 || hi < 0;

  return {
    metric,
    pointA,
    pointB,
    deltaPoint,
    ci: { lo, hi },
    significant,
    sampledN: Math.min(sampledNA, sampledNB),
  };
}

/**
 * Extract observation arrays from evaluateTransitions steps[] for use with differential().
 * steps[] ONLY — never records[].
 */
export function seriesFromSteps(steps, metric) {
  if (metric === 'meanDeltaU') {
    return steps.map(s => s.deltaU);
  }
  if (metric === 'rejectionRate') {
    return steps.map(s => !s.accept);
  }
  throw new Error(`seriesFromSteps: unknown metric '${metric}'. Use 'meanDeltaU' or 'rejectionRate'.`);
}

/**
 * Load burn-in records from the trace directory.
 * @returns {{ records, total, subsetCount, traceDir }}
 */
export function loadBurnInRecords({ traceDir, subset = BURN_IN_DEFAULT_SUBSET, maxRecords, sample = 'prefix', formulaVersion = 'all' } = {}) {
  const dir = traceDir || path.resolve(__dirname, '../../state/energy-trace');

  if (!fs.existsSync(dir)) {
    throw new Error(`loadBurnInRecords: trace directory not found: ${dir}`);
  }

  const files = fs.readdirSync(dir)
    .filter(f => f.endsWith('.jsonl'))
    .sort();

  const allRecords = [];
  for (const file of files) {
    const content = fs.readFileSync(path.join(dir, file), 'utf-8');
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        allRecords.push(JSON.parse(trimmed));
      } catch {
        /* skip unparseable */
      }
    }
  }

  const total = allRecords.length;

  let filtered = allRecords;
  if (subset === 'rejects' || subset === BURN_IN_DEFAULT_SUBSET) {
    filtered = allRecords.filter(r => r.decision === 'reject');
  } else if (subset === 'accepts') {
    // The strictness FP channel (yuri-energy-twosided) needs previously-ACCEPTED records to
    // measure newly-introduced rejections (FP introduction) under a stricter candidate.
    filtered = allRecords.filter(r => r.decision === 'accept');
  } else if (subset !== 'all') {
    throw new Error(`loadBurnInRecords: unknown subset '${subset}'. Use 'rejects', 'accepts', or 'all'.`);
  }

  // Energy-formula era filter (migration safety; see contract §1b). 'all' = no filter (back-compat) but
  // the era split is ALWAYS surfaced so a caller cannot silently pool incommensurable drift scales.
  // 'current' = the single newest era present in THIS subset (what the live formula stamps now). A
  // positive integer = that era only. The split before filtering is reported as subsetVersionTally so a
  // 'current'/<n> caller sees exactly what was dropped (no silent truncation).
  const subsetVersionTally = formulaVersionTally(filtered);
  let resolvedVersion = formulaVersion;
  if (formulaVersion === 'current') {
    const eras = Object.keys(subsetVersionTally).map(Number);
    resolvedVersion = eras.length ? Math.max(...eras) : null;
  }
  if (resolvedVersion != null && resolvedVersion !== 'all') {
    if (!Number.isInteger(resolvedVersion) || resolvedVersion <= 0) {
      throw new Error(`loadBurnInRecords: formulaVersion must be a positive integer, 'current', or 'all' (got ${JSON.stringify(formulaVersion)})`);
    }
    filtered = filtered.filter((r) => resolveFormulaVersion(r) === resolvedVersion);
  }

  const subsetCount = filtered.length;
  let records;
  if (maxRecords != null && filtered.length > maxRecords) {
    if (sample === 'stride') {
      // Deterministic evenly-spaced sample across the FULL (date-sorted) range so the subsample is not
      // biased toward the oldest records (a prefix slice over date-sorted files scores only the oldest
      // window — understating FP propensity on recent traffic).
      const stride = filtered.length / maxRecords;
      records = [];
      for (let k = 0; k < maxRecords; k++) records.push(filtered[Math.floor(k * stride)]);
    } else {
      records = filtered.slice(0, maxRecords);
    }
  } else {
    records = filtered;
  }

  return {
    records,
    total,
    subsetCount,
    traceDir: dir,
    sample,
    formulaVersion: resolvedVersion === 'all' ? 'all' : resolvedVersion,
    subsetVersionTally,                       // era split BEFORE the era filter (what was available)
    versionTally: formulaVersionTally(records), // era split of what is actually RETURNED
  };
}

/**
 * Characterize recoverability of a set of burn-in records via WP0 reconstructRawComponents.
 * @returns {{ perComponentRecovered, absentTally, unrecoverableTally, rightCensoredCount, recordsWithAnyRecoverable, totalRecords }}
 */
export function reconstructBurnIn(records) {
  const perComponentRecovered = {};
  const absentTally = {};
  const unrecoverableTally = {};
  let rightCensoredCount = 0;
  let recordsWithAnyRecoverable = 0;

  for (const record of records) {
    const rc = reconstructRawComponents(record);

    if (rc.recoveredCount > 0) recordsWithAnyRecoverable++;

    for (const [component] of Object.entries(rc.recovered || {})) {
      perComponentRecovered[component] = (perComponentRecovered[component] || 0) + 1;
    }

    for (const comp of rc.absentComponents || []) {
      absentTally[comp] = (absentTally[comp] || 0) + 1;
    }

    for (const entry of rc.unrecoverable || []) {
      const reason = entry.reason || 'unknown';
      unrecoverableTally[reason] = (unrecoverableTally[reason] || 0) + 1;
    }

    rightCensoredCount += (rc.rightCensored || []).length;
  }

  return {
    perComponentRecovered,
    absentTally,
    unrecoverableTally,
    rightCensoredCount,
    recordsWithAnyRecoverable,
    totalRecords: records.length,
  };
}

/**
 * Differential rescore of burn-in records: baseline vs candidate weight config.
 * Returns RECOVERABLE-SUBSET PROXY — NOT a from-scratch verdict.
 * @returns {{ metric, baselineWeights, candidateWeights, rescoredCount, excludedCount, coverage, perRecord, deltaUStat, flips, note }}
 */
export function burnInRescoreDelta(
  records,
  candidateConfig,
  { baselineConfig = null, seed = 1, resamples = 2000, maxRecords } = {}
) {
  // Barriers refused
  validateCandidateWeights(candidateConfig);

  const baselineWeights = baselineConfig
    ? resolveFullWeights(baselineConfig)
    : { ...DEFAULT_WEIGHTS };
  const candidateWeights = resolveFullWeights(candidateConfig);

  const workRecords =
    maxRecords != null && records.length > maxRecords
      ? records.slice(0, maxRecords)
      : records;

  // FAIL-CLOSED migration guard (contract §1b): refuse to rescore a set spanning >1 energy-formula era —
  // the drift-term scales (v1 KL≈41, v2 KL≈11, v3 W₁∈[0,11] under a renamed key) are not commensurable,
  // and pooling them folds migration noise into ΔU. Pin loadBurnInRecords({formulaVersion}) first.
  assertSingleEra(workRecords, { context: 'burnInRescoreDelta' });

  const totalConsidered = workRecords.length;
  const perRecord = [];
  let excludedCount = 0;

  for (const record of workRecords) {
    const baseR = rescoreRecordU(record, baselineWeights);
    const candR = rescoreRecordU(record, candidateWeights);

    if (baseR.rescoredCount === 0 && candR.rescoredCount === 0) {
      excludedCount++;
      continue;
    }

    perRecord.push({
      baseU: baseR.U,
      candU: candR.U,
      deltaU: candR.U - baseR.U,
    });
  }

  const rescoredCount = perRecord.length;

  // Decision proxy over recoverable U: U > 0 → reject
  let baselineRejectRecoverable = 0;
  let candidateRejectRecoverable = 0;
  let flipped = 0;
  for (const rec of perRecord) {
    const bRej = rec.baseU > 0;
    const cRej = rec.candU > 0;
    if (bRej) baselineRejectRecoverable++;
    if (cRej) candidateRejectRecoverable++;
    if (bRej !== cRej) flipped++;
  }

  const deltaUStat = bootstrapCI(
    perRecord.map(r => r.deltaU),
    mean,
    { seed, resamples, maxN: maxRecords }
  );

  return {
    metric: 'burnInRecoverableU',
    baselineWeights,
    candidateWeights,
    rescoredCount,
    excludedCount,
    coverage: totalConsidered > 0 ? rescoredCount / totalConsidered : 0,
    perRecord,
    deltaUStat,
    flips: { baselineRejectRecoverable, candidateRejectRecoverable, flipped },
    note:
      'RECOVERABLE-SUBSET PROXY: sanitized trace cannot reproduce a from-scratch verdict; ' +
      'baseline and candidate are re-scored on the SAME recoverable components so dropped terms cancel. ' +
      'Coverage reported; NOT a true verdict.',
  };
}

// ── CLI ──────────────────────────────────────────────────────────

const isMainModule =
  process.argv[1] && path.resolve(process.argv[1]) === __filename;

if (isMainModule) {
  const args = process.argv.slice(2);
  const command = args[0];

  // --out <path>  (value-less --out => stdout only; guard out===true)
  let outPath = null;
  const outIdx = args.indexOf('--out');
  if (outIdx !== -1) {
    const val = args[outIdx + 1];
    if (val && val !== true && typeof val === 'string' && !val.startsWith('--')) {
      outPath = val;
    }
  }

  function emit(text) {
    if (outPath) {
      fs.writeFileSync(outPath, text + '\n', 'utf-8');
    } else {
      process.stdout.write(text + '\n');
    }
  }

  if (command === 'burnin-coverage') {
    // Diagnostic coverage is intentionally FULL-corpus ('all' eras) — recoverability across every era is the
    // migration-planning signal. But surface subsetVersionTally so the era split is EXPLICIT (contract §1b:
    // no SILENT pooling). This path only counts field presence (reconstructBurnIn) — it does NOT rescore, so
    // mixing eras here cannot corrupt a weight verdict; the silence was the only issue.
    const { records, total, subsetCount, traceDir, subsetVersionTally } = loadBurnInRecords({ formulaVersion: 'all' });
    const coverage = reconstructBurnIn(records);
    const label = buildResultLabel({
      laneId: LANE_IDS.ANALYZE,
      description: 'burnin-coverage',
      passType: PASS_TYPES[0],
    });

    const lines = [
      `=== ${label} ===`,
      `traceDir: ${traceDir}`,
      `total records: ${total}`,
      `subset (rejects): ${subsetCount}`,
      `energyFormulaVersion split (rejects): ${JSON.stringify(subsetVersionTally)}  [v1=hard-floor KL · v2=mixture KL · v3=Wasserstein-1; scales NOT commensurable — do not pool for a verdict]`,
      `evidence.termCount: ${evidence.termCount}`,
      `evidence.fileCount: ${evidence.fileCount}`,
      `evidence.match: ${evidence.match}`,
      '',
      'Coverage report:',
      JSON.stringify(coverage, null, 2),
    ];

    emit(lines.join('\n'));
  } else {
    emit('Usage: node yuri-energy-analyze.mjs burnin-coverage [--out <path>]');
    process.exit(1);
  }
}
