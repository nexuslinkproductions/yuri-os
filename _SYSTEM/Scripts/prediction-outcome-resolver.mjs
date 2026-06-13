#!/usr/bin/env node
/**
 * prediction-outcome-resolver.mjs — closes the prediction-ledger learn loop.
 *
 * For each unresolved propagation-scan prediction older than minAge, re-runs
 * propagation-scan on the subject, compares predicted vs CURRENT sibling set,
 * writes outcomes, returns calibrationReport. Idempotent (skips already-scored).
 *
 * DESIGN (obs-source, minAge, false-resolution, cron):
 * 1. OBSERVED = propagation re-scan on subject. Current sibling set IS structural
 *    ground truth — same tool, later timestamp. No external feed needed.
 * 2. minAge=1h: time for code change to land + GitNexus index refresh. Conservative
 *    enough to avoid false "no-break" resolutions while keeping learn loop tight.
 * 3. FALSE-RESOLUTION: only scores propagation-scan predictions (not claude-refinement).
 *    If change never landed, scan shows same siblings → "stable" outcomes → Brier
 *    penalizes the overconfident prediction. Calibration self-corrects. Future:
 *    git-log gate on subject-file mtime since prediction.ts.
 * 4. CRON: homeostat sensor `unresolved-predictions-aged` counting unresolved >minAge,
 *    reflex `node _SYSTEM/Scripts/prediction-outcome-resolver.mjs resolve`. Or cron
 *    `every-30 * * * *`. Re-running is safe — outcomes skip already-scored preds.
 *
 * Usage:
 *   node _SYSTEM/Scripts/prediction-outcome-resolver.mjs resolve [--min-age 7200000]
 */
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { readLedger, recordOutcome, calibrationReport } from './prediction-ledger.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');
const SCAN_SCRIPT = path.join(__dirname, 'propagation-scan.mjs');
const DEFAULT_MIN_AGE_MS = 60 * 60 * 1000;

// @capability: prediction-outcome-resolver
// @serves: close the learn loop | score predictions against outcomes | resolve unresolved predictions | populate calibration | did the predicted effects actually happen
// @does: re-runs propagation-scan on each unresolved (aged) propagation-scan prediction, compares predicted vs current sibling set, records outcomes, returns calibrationReport (Brier). Idempotent (skips already-scored).
// @use: on a schedule (homeostat reflex / cron) to keep the prediction-ledger calibration populated — the LEARN rung that scores recordPrediction writes against reality
// @exports: resolveOutcomes
export function resolveOutcomes(opts = {}) {
  const { nowMs = Date.now(), minAgeMs = DEFAULT_MIN_AGE_MS, file } = opts;
  const rows = readLedger({ file });
  const preds = new Map(), outcomeIds = new Set();
  for (const r of rows) {
    if (r.type === 'prediction') preds.set(r.id, r);
    if (r.type === 'outcome') outcomeIds.add(r.predictionId);
  }
  const resolved = [], skipped = [];
  for (const [id, pred] of preds) {
    if (outcomeIds.has(id)) continue;
    if (nowMs - pred.ts < minAgeMs) { skipped.push({ id, reason: 'too-young' }); continue; }
    if (pred.source !== 'propagation-scan') { skipped.push({ id, reason: 'non-scan-source' }); continue; }
    let scan;
    try {
      scan = JSON.parse(execFileSync('node', [SCAN_SCRIPT, pred.subject, '--dry-run', '--json'], {
        cwd: REPO_ROOT, timeout: 45_000, encoding: 'utf8', maxBuffer: 2 * 1024 * 1024,
      }));
    } catch (e) { skipped.push({ id, reason: `scan-failed` }); continue; }
    if (!scan?.ok || !Array.isArray(scan.siblings)) { skipped.push({ id, reason: 'scan-invalid' }); continue; }
    // Current sibling set = ground truth
    const curMap = new Map(scan.siblings.map(s => [s.nodeId, { confidence: s.confidence, pattern: s.pattern }]));
    const observedEffects = [];
    for (const pfx of pred.predictedEffects) {
      const cur = curMap.get(pfx.target);
      if (pfx.effect === 'breaks') {
        observedEffects.push({ target: pfx.target, effect: cur ? 'stable' : 'breaks' });
      } else if (pfx.effect === 'improves') {
        observedEffects.push({ target: pfx.target, effect: (cur && pfx.confidence != null && cur.confidence > pfx.confidence) ? 'improves' : 'stable' });
      } else {
        observedEffects.push({ target: pfx.target, effect: cur ? 'stable' : 'absent' });
      }
      curMap.delete(pfx.target);
    }
    // Unpredicted-but-present siblings → model missed these
    for (const [nodeId, cur] of curMap) {
      observedEffects.push({ target: nodeId, effect: cur.confidence > 0.7 ? 'emerged-strong' : 'emerged' });
    }
    recordOutcome({ predictionId: id, observedEffects, ts: nowMs }, { file });
    resolved.push({ id, n: observedEffects.length });
  }
  return { resolved: resolved.length, skipped: skipped.map(s => `${s.id}:${s.reason}`), calibration: calibrationReport({ file }) };
}

// ── CLI ──
if (import.meta.url === `file://${process.argv[1]}`) {
  const cmd = process.argv[2];
  if (cmd === 'resolve') {
    const mi = process.argv.indexOf('--min-age');
    const minAgeMs = mi > -1 ? Number(process.argv[mi + 1]) || DEFAULT_MIN_AGE_MS : DEFAULT_MIN_AGE_MS;
    try {
      const r = resolveOutcomes({ minAgeMs });
      console.log(`resolved=${r.resolved} skipped=${r.skipped.length}`);
      if (r.skipped.length) console.log(`skipped: ${r.skipped.join(', ')}`);
      const cal = r.calibration;
      console.log(`calibration: n=${cal.n} meanBrier=${cal.meanBrier.toFixed(4)} unresolved=${cal.unresolved.length}`);
      for (const b of cal.byConfidenceBucket) {
        if (b.n > 0) console.log(`  ${b.bucket.padEnd(10)} n=${String(b.n).padStart(4)} brier=${b.meanBrier.toFixed(4)} hitRate=${(b.hitRate*100).toFixed(1)}%`);
      }
      if (cal.n === 0) console.log('  (no resolved predictions — calibration still empty)');
    } catch (e) { console.error(`[prediction-outcome-resolver] ${e.message}`); process.exitCode = 1; }
  } else {
    console.log('prediction-outcome-resolver — close the learn loop.\n  node prediction-outcome-resolver.mjs resolve [--min-age ms]');
  }
}
