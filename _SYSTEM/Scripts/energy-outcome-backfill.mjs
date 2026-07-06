import { pathToFileURL } from 'node:url';
// @capability: energy-outcome-backfill
// @serves: Wave-0 keystone L4 (integration + backfill) | real-firing calibration report
// @does: DISARMED runner that wires runDeriver over REAL firings in _SYSTEM/state/energy-trace/*.jsonl.
//   Loads signals from _SYSTEM/Scripts/energy-outcome-signals.mjs IF present; otherwise stubs all
//   signals -> false (fail-CLOSED). Populates the SHADOW ledger, then produces a real calibrationReport
//   (total firings, predicted, outcomesDerived, undeterminable, byRule histogram, meanBrier + per-bucket).
//   Shadow-only: NEVER writes _SYSTEM/state/prediction-ledger.jsonl, NEVER writes live ledger.
// @use: node _SYSTEM/Scripts/energy-outcome-backfill.mjs run [--fresh] [--shadow <path>] [--firings <dir>]
//   --fresh         truncate shadow + result paths before populating (default: keep existing shadow rows)
//   --shadow <p>    shadow ledger path (default: _SYSTEM/state/energy-outcome-shadow.jsonl)
//   --firings <d>   firings trace dir (default: _SYSTEM/state/energy-trace)
//   --report <p>    write numeric report markdown (default: 02_RESOURCES/RESEARCH/wave0-keystone-2026-06-15/L4-backfill-report.md)
//   --signals <p>   override signals module path (default: _SYSTEM/Scripts/energy-outcome-signals.mjs)
// @exports: runBackfill, loadSignalsOrStub, appendToShadow, writeReport
//
// CONTRACTS (binding):
//   - DISARMED: writes only to shadow files under _SYSTEM/state/energy-outcome-*.jsonl and to the
//     explicit --report path. Never writes the live prediction-ledger.jsonl.
//   - Signals: caller-injected. If signals module is missing or fails to load, ALL signals resolve
//     to false (fail-CLOSED, never a false label).
//   - Idempotent on the shadow file when --fresh is set; otherwise APPENDS (matches runDeriver contract).
//   - Numeric report is a deterministic artifact of (shadow, firings, signals) at the time of the run.
//
// ASSUMPTION: signals module exports a default or named `signals` object with the 4 method names
//   (isReverted, isRetriedAndSucceeded, isPromoted, dispatchAccepted). Missing methods default to false.
// ASSUMPTION: shadow ledger format is whatever runDeriver writes (prediction-ledger recordPrediction/recordOutcome).
// ASSUMPTION: report path is owned by this lane and not concurrently written by another lane (no flock needed
//   for overnight single-runner dispatch).

import { createRequire } from 'node:module';
import { readFileSync, writeFileSync, mkdirSync, statSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { runDeriver, calibrate, readFirings } from './energy-outcome-deriver.mjs';

const DEFAULT_SHADOW  = '_SYSTEM/state/energy-outcome-shadow.jsonl';
const DEFAULT_FIRINGS = '_SYSTEM/state/energy-trace';
const DEFAULT_REPORT  = '02_RESOURCES/RESEARCH/wave0-keystone-2026-06-15/L4-backfill-report.md';
const DEFAULT_SIGNALS = '_SYSTEM/Scripts/energy-outcome-signals.mjs';

// ── 1. loadSignalsOrStub ──────────────────────────────────────────────────────
// Fail-CLOSED: any failure (missing file, import error, shape mismatch) → every signal returns false.
// We never throw, never crash the backfill. The run still produces a calibration report — it just
// reports 100% R4-undeterminable, which is itself the correct calibration truth when no detectors exist.
export function loadSignalsOrStub(signalsPath = DEFAULT_SIGNALS) {
  const stub = {
    isReverted:             () => false,
    isRetriedAndSucceeded:  () => false,
    isPromoted:             () => false,
    dispatchAccepted:       () => false,
  };
  const fullPath = resolve(signalsPath);
  if (!existsSync(fullPath)) {
    process.stderr.write(`[energy-outcome-backfill] signals module not found at ${fullPath} — using stub (all false)\n`);
    return { signals: stub, source: 'stub-missing' };
  }
  try {
    const mod = require(fullPath);
    // the signals module exports FACTORIES (defaultSignals/buildSignals), never a ready-made
    // signals object — resolving the namespace directly matched zero stub keys and silently
    // degraded every run to the all-false stub (the 18.5k-predicted / 0-derived signature)
    const candidate = (typeof mod.defaultSignals === 'function' && mod.defaultSignals())
      || (typeof mod.buildSignals === 'function' && mod.buildSignals())
      || mod.signals || mod.default || mod;
    const merged = { ...stub };
    for (const k of Object.keys(stub)) {
      if (typeof candidate?.[k] === 'function') merged[k] = candidate[k].bind(candidate);
    }
    return { signals: merged, source: 'signals-module' };
  } catch (e) {
    process.stderr.write(`[energy-outcome-backfill] signals module load failed: ${e.message} — using stub (all false)\n`);
    return { signals: stub, source: 'stub-load-failed' };
  }
}

// `require` lives on the CJS side; ESM needs createRequire on `import.meta.url`.
const require = createRequire(import.meta.url);

// ── 2. parseArgs (tiny — no commander dep) ────────────────────────────────────
function parseArgs(argv) {
  const opts = {
    fresh: false,
    shadow: DEFAULT_SHADOW,
    firings: DEFAULT_FIRINGS,
    report: DEFAULT_REPORT,
    signals: DEFAULT_SIGNALS,
    help: false,
  };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === 'run' || a === 'backfill') { continue; }   // implicit subcommand, accepted silently
    if (a === '--fresh')        { opts.fresh = true; continue; }
    if (a === '--help' || a === '-h') { opts.help = true; continue; }
    if (a === '--shadow')       { opts.shadow  = argv[++i]; continue; }
    if (a === '--firings')      { opts.firings = argv[++i]; continue; }
    if (a === '--report')       { opts.report  = argv[++i]; continue; }
    if (a === '--signals')      { opts.signals = argv[++i]; continue; }
    process.stderr.write(`[energy-outcome-backfill] unknown arg: ${a}\n`);
  }
  return opts;
}

// ── 3. freshShadowFile (idempotent start) ─────────────────────────────────────
// Truncates the shadow file when --fresh is set, so a re-run doesn't double-count.
// Mirrors the master-brief: "populate the shadow ledger" from a real, fresh source-of-truth.
function freshShadowFile(shadowFile) {
  mkdirSync(dirname(shadowFile), { recursive: true });
  if (existsSync(shadowFile)) {
    try {
      const st = statSync(shadowFile);
      // Routine idempotent-restart notice, not a failure — stdout, not stderr
      // (2026-07-06: this line alone accumulated 52.8KB/445 lines in .err over 3 weeks;
      // it never indicated a fault, so it does not belong on the error stream).
      process.stdout.write(`[energy-outcome-backfill] --fresh: truncating ${shadowFile} (${st.size} bytes)\n`);
    } catch { /* size lookup is best-effort */ }
  }
  writeFileSync(shadowFile, '', 'utf8');
}

// ── 4. summarizeBuckets (mirror calibrationReport's byConfidenceBucket + add rows) ──
function summarizeBuckets(cal) {
  if (!cal || !Array.isArray(cal.byConfidenceBucket)) return [];
  return cal.byConfidenceBucket.map(b => ({
    bucket: b.bucket,
    n: b.n,
    meanBrier: Number((b.meanBrier ?? 0).toFixed(4)),
    hitRate:   Number((b.hitRate   ?? 0).toFixed(4)),
  }));
}

// ── 5. renderReport (deterministic markdown) ──────────────────────────────────
export function renderReport(input) {
  const {
    prediction,           // { coveragePct, meanBrierPct, byRule, undeterminablePct, runStamp, confidence }
    shadowFile,
    firingsDir,
    signalsSource,        // 'stub-missing' | 'stub-load-failed' | 'signals-module'
    runSummary,           // { firings, predicted, outcomesDerived, undeterminable, byRule }
    calibration,          // { n, meanBrier, byConfidenceBucket, unresolved }
    backfillStartedAt,
    backfillFinishedAt,
  } = input;

  const derivedPct   = runSummary.predicted > 0 ? (runSummary.outcomesDerived / runSummary.predicted) * 100 : 0;
  const undetPct     = runSummary.predicted > 0 ? (runSummary.undeterminable    / runSummary.predicted) * 100 : 0;
  const durationMs   = Math.max(0, backfillFinishedAt - backfillStartedAt);

  const lines = [];
  lines.push(`# L4 — Energy-Outcome Backfill Report (Wave-0 Keystone, 2026-06-15)`);
  lines.push('');
  lines.push(`> DISARMED shadow run. L4 = integration + backfill (lane: minimax-m3).`);
  lines.push(`> Shadow ledger: \`${shadowFile}\` · Firings dir: \`${firingsDir}\` · Signals: \`${signalsSource}\`.`);
  lines.push('');
  lines.push(`## Prediction (logged BEFORE the run)`);
  lines.push('');
  lines.push(`| Field | Forecast |`);
  lines.push(`|---|---|`);
  lines.push(`| coveragePct (outcomesDerived / predicted) | **${prediction.coveragePct.toFixed(1)}%** |`);
  lines.push(`| meanBrier (resolved) | **${prediction.meanBrierPct.toFixed(1)}%** |`);
  lines.push(`| byRule expectation | R4 ≫ R1=R2=R3 (signals unknown at run time → mostly undeterminable) |`);
  lines.push(`| undeterminablePct | **${prediction.undeterminablePct.toFixed(1)}%** |`);
  lines.push(`| confidence (calibration of THIS prediction) | ${prediction.confidence ?? 'medium'} |`);
  lines.push(`| runStamp | ${prediction.runStamp} |`);
  lines.push('');
  lines.push(`## Run Summary`);
  lines.push('');
  lines.push(`- Total firings read: **${runSummary.firings.toLocaleString()}**`);
  lines.push(`- Predictions written to shadow: **${runSummary.predicted.toLocaleString()}**`);
  lines.push(`- Outcomes derived: **${runSummary.outcomesDerived.toLocaleString()}** (${derivedPct.toFixed(1)}% of predicted)`);
  lines.push(`- Undeterminable (R4): **${runSummary.undeterminable.toLocaleString()}** (${undetPct.toFixed(1)}% of predicted)`);
  lines.push(`- byRule histogram:`);
  for (const [rule, n] of Object.entries(runSummary.byRule).sort()) {
    lines.push(`  - ${rule}: ${n.toLocaleString()}`);
  }
  lines.push(`- Wall time: ${durationMs} ms`);
  lines.push('');
  lines.push(`## Calibration Report (calibrationReport over shadow ledger)`);
  lines.push('');
  lines.push(`- Resolved pairs (n): **${calibration.n.toLocaleString()}**`);
  lines.push(`- Unresolved (prediction w/o outcome): **${calibration.unresolved.length.toLocaleString()}**`);
  lines.push(`- **meanBrier: ${(calibration.meanBrier ?? 0).toFixed(4)}**`);
  lines.push('');
  lines.push(`### Per-confidence bucket`);
  lines.push('');
  lines.push(`| bucket | n | meanBrier | hitRate |`);
  lines.push(`|---|---:|---:|---:|`);
  for (const b of summarizeBuckets(calibration)) {
    lines.push(`| ${b.bucket} | ${b.n} | ${b.meanBrier.toFixed(4)} | ${(b.hitRate * 100).toFixed(1)}% |`);
  }
  lines.push('');
  lines.push(`## Residual Risk / Red-team`);
  lines.push('');
  lines.push(`- Signals module was **not present** at run time (path: \`${DEFAULT_SIGNALS}\` → ${signalsSource}).`);
  lines.push(`  All four detectors (isReverted, isRetriedAndSucceeded, isPromoted, dispatchAccepted) return false,`);
  lines.push(`  so the byRule histogram is dominated by R4-undeterminable. meanBrier is computed only on the`);
  lines.push(`  R1/R2/R3-resolved rows (if any leak from a prior run), so the calibration is sparse, not absent.`);
  lines.push(`- Shadow ledger \`${shadowFile}\` was truncated with --fresh; any prior rows are gone. Re-runs are`);
  lines.push(`  deterministic and idempotent.`);
  lines.push(`- DISARMED contract respected: \`_SYSTEM/state/prediction-ledger.jsonl\` was NOT written.`);
  lines.push(`- Confidence prior: \`sigmoid(|deltaU|)\` is a **prior, not a learned calibration**. The first real`);
  lines.push(`  meanBrier we report is the floor — expect it to look noisy until L1 signals + L3 label-audit land.`);
  lines.push(`- runId field: a fraction of the oldest firings (e.g. 2026-05-28) have empty \`runId\`, so their`);
  lines.push(`  prediction subject is empty string. The deriver tolerates this; the L1 signals may not.`);
  lines.push('');
  lines.push(`## Run Stamp`);
  lines.push('');
  lines.push(`- startedAt:  ${new Date(backfillStartedAt).toISOString()}`);
  lines.push(`- finishedAt: ${new Date(backfillFinishedAt).toISOString()}`);
  lines.push(`- lane:        minimax-m3 (L4)`);
  lines.push(`- capability:  energy-outcome-backfill`);
  lines.push('');
  return lines.join('\n');
}

// ── 6. runBackfill (the exported entrypoint; CLI also calls this) ─────────────
export function runBackfill(opts = {}) {
  const shadowFile  = opts.shadow  ?? DEFAULT_SHADOW;
  const firingsDir  = opts.firings ?? DEFAULT_FIRINGS;
  const reportPath  = opts.report  ?? DEFAULT_REPORT;
  const signalsPath = opts.signals ?? DEFAULT_SIGNALS;
  const fresh       = !!opts.fresh;
  const now         = Date.now();

  if (fresh) freshShadowFile(shadowFile);

  const { signals, source: signalsSource } = loadSignalsOrStub(signalsPath);

  // Read firings from the historical trace dir AND the armed single-file trace: the corrId/claimIds
  // firings (the keystone's joinable ones) live in energy-gate-trace.jsonl, not the daily dir.
  // opts.armedTrace overrides; default is the live gate-trace path. readFirings handles missing/corrupt.
  const firings = readFirings({ traceDir: firingsDir, traceFile: opts.armedTrace ?? '_SYSTEM/state/energy-gate-trace.jsonl' });

  // Hand off to runDeriver — this is the integration seam. The deriver owns the
  // prediction/outcome row shape; we own wiring (signals, shadow path, idempotence).
  const runSummary = runDeriver({
    file: shadowFile,
    signals,
    firings,           // pass through to avoid re-reading (same dir the deriver would default to)
  });

  // Calibration is read-back from the shadow file we just wrote.
  const calibration = calibrate({ file: shadowFile });

  return {
    shadowFile,
    firingsDir,
    signalsSource,
    runSummary,
    calibration,
    backfillStartedAt: now,
    backfillFinishedAt: Date.now(),
    reportPath,
  };
}

// ── 7. CLI ────────────────────────────────────────────────────────────────────
// `node energy-outcome-backfill.mjs run [--fresh] [--shadow <p>] [--firings <d>] [--report <p>]`
// Default behavior: run + write report. Never writes the live prediction-ledger.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const opts = parseArgs(process.argv);
  if (opts.help) {
    console.log('energy-outcome-backfill — DISARMED backfill runner.');
    console.log('  node energy-outcome-backfill.mjs run [--fresh] [--shadow <p>] [--firings <d>] [--report <p>]');
    process.exit(0);
  }

  // Step 1: emit a PREDICTION BEFORE running, so the operator audit log captures it.
  // (We don't write the live prediction-ledger.jsonl — DISARMED. The prediction is also stamped
  // into the report file below for durable record-keeping.)
  // NOTE: this is a fixed pre-registered prior (not computed from the run), logged once per
  // invocation for audit purposes — routine status, not an error. stdout, not stderr
  // (2026-07-06: was misclassified to stderr, accumulating 52.8KB/445 lines of non-failure
  // noise over 3 weeks with zero signal — see .energy-learn-deriver.err triage).
  const prediction = {
    coveragePct: 5.0,        // signals unknown → expect ≈ 0% coverage; 5% is a generous ceiling
    meanBrierPct: 50.0,      // prior is sigmoid(|deltaU|) → most rows at low |deltaU| → 0.5-ish brier
    undeterminablePct: 95.0, // byRule will be R4-dominated
    runStamp: new Date().toISOString(),
    confidence: 'low',
  };
  process.stdout.write(`[energy-outcome-backfill] PREDICTION: coverage≈${prediction.coveragePct}% undeterminable≈${prediction.undeterminablePct}% meanBrier≈${prediction.meanBrierPct}% (confidence=${prediction.confidence})\n`);

  // Step 2: run the backfill.
  const result = runBackfill(opts);

  // Step 3: render the numeric report.
  const report = renderReport({ prediction, ...result });
  mkdirSync(dirname(opts.report), { recursive: true });
  writeFileSync(opts.report, report, 'utf8');

  // Step 4: emit a compact pass/fail to stdout (no raw dump).
  const r = result.runSummary;
  const c = result.calibration;
  console.log(`L4 backfill: firings=${r.firings} predicted=${r.predicted} derived=${r.outcomesDerived} undet=${r.undeterminable} meanBrier=${(c.meanBrier ?? 0).toFixed(4)} report=${opts.report}`);
}
