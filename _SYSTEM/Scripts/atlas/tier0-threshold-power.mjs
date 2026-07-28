#!/usr/bin/env node
// @capability: tier0-threshold-power
// @serves: does Tier-0 rate-vs-threshold gate survive at n | one-sided threshold power | grep-saturation gate feasibility
// @does: runs sequentialDecide on Bernoulli rates vs fixed θ (range [0,1]) and Wilson one-shot clear/fail bars; writes regenerable JSON
// @use: before claiming a Tier-0 hard STOP/GO gate on a stratified find-n set
// @exports: decideRate, minPAbove, maxPBelow, wilson, wilsonClearFail, powerTable, writeArtifact, main
// @tier: atlas-eval
// @couples: _SYSTEM/Scripts/eval-processing.mjs sequentialDecide
//
// 2026-07-28: Hermes asserted a one-sided threshold check survives at n=28 where paired arm
// comparison does not. Orion measured: under the same peek-safe CS, even 28/28 stays UNDECIDED
// vs θ=0.6. This script regenerates that measurement so the withdrawal is reproducible.

import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { sequentialDecide } from '../eval-processing.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, '..', '..', '..');
const OUT_DIR = join(REPO, '_SYSTEM', 'state', 'atlas');

export const CS_PARAMS = {
  alpha: 0.05,
  range: [0, 1],
  csConst: 1.0,
};

export function decideRate(values, threshold, params = CS_PARAMS) {
  return sequentialDecide(values, {
    alpha: params.alpha,
    range: params.range,
    threshold,
    maxN: values.length,
    csConst: params.csConst,
  });
}

export function minPAbove(n, θ, params = CS_PARAMS) {
  let lo = θ;
  let hi = 1;
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    const r = decideRate(Array(n).fill(mid), θ, params);
    if (r.decision === 'above') hi = mid;
    else lo = mid;
  }
  return hi;
}

export function maxPBelow(n, θ, params = CS_PARAMS) {
  let lo = 0;
  let hi = θ;
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    const r = decideRate(Array(n).fill(mid), θ, params);
    if (r.decision === 'below') lo = mid;
    else hi = mid;
  }
  return lo;
}

export function wilson(k, n, z = 1.96) {
  const p = k / n;
  const den = 1 + (z * z) / n;
  const centre = p + (z * z) / (2 * n);
  const margin = z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n));
  return [(centre - margin) / den, (centre + margin) / den];
}

export function wilsonClearFail(n, θ, z = 1.96) {
  let clearMin = null;
  let failMax = null;
  for (let k = 0; k <= n; k++) {
    const [lo, hi] = wilson(k, n, z);
    if (lo > θ && clearMin === null) clearMin = { k, rate: k / n, lo, hi };
    if (hi < θ) failMax = { k, rate: k / n, lo, hi };
  }
  return { clearMin, failMax };
}

/** Smallest n where constant p=1.0 decides above θ under the CS. */
export function minNPerfectAbove(θ, params = CS_PARAMS, maxN = 500) {
  for (let n = 2; n <= maxN; n++) {
    const r = decideRate(Array(n).fill(1), θ, params);
    if (r.decision === 'above') return { n, nUsed: r.nUsed, ci: r.ci };
  }
  return null;
}

export function decisionAtPerfect(n, θ, params = CS_PARAMS) {
  return decideRate(Array(n).fill(1), θ, params);
}

export function powerTable({
  ns = [28, 40, 88, 100, 145],
  thresholds = [0.6, 0.7],
  params = CS_PARAMS,
} = {}) {
  const cs = {};
  for (const θ of thresholds) {
    cs[θ] = {};
    for (const n of ns) {
      const perfect = decisionAtPerfect(n, θ, params);
      cs[θ][n] = {
        minP_decide_CLEAR_above: Number(minPAbove(n, θ, params).toFixed(4)),
        maxP_decide_NOTCLEAR_below: Number(maxPBelow(n, θ, params).toFixed(4)),
        perfect_p1_decision: perfect.decision,
        perfect_ci: perfect.ci,
      };
    }
  }
  const wilsonBars = {};
  for (const θ of thresholds) {
    for (const n of [28, 40]) {
      wilsonBars[`${n}_${θ}`] = wilsonClearFail(n, θ);
    }
  }
  return {
    schema: 'tier0-threshold-power/v1',
    regenerator: '_SYSTEM/Scripts/atlas/tier0-threshold-power.mjs',
    measured_at: new Date().toISOString(),
    instrument: 'sequentialDecide (empirical-Bernstein CS) + Wilson one-shot reference',
    cs_params: params,
    thresholds,
    sample_sizes: ns,
    ruling_2026_07_28: [
      'Under CS_PARAMS, n=28 cannot CLEAR θ=0.6 even at 28/28 successes (perfect_p1_decision=undecided).',
      'Tier-0 hard STOP/GO gate on Channel-C-stratified find-28 is DEAD under this instrument.',
      'Hermes withdrew survival claim; Tier-0 on find-40 is DESCRIPTIVE ONLY (Option C).',
      'Wilson one-shot can CLEAR at n=28 only with operable observed rate ≫ θ (see wilson_one_shot).',
    ],
    cs_constant_p: cs,
    min_n_perfect_clear: {
      0.6: minNPerfectAbove(0.6, params),
      0.7: minNPerfectAbove(0.7, params),
    },
    wilson_one_shot: wilsonBars,
  };
}

export function writeArtifact({ outDir = OUT_DIR } = {}) {
  mkdirSync(outDir, { recursive: true });
  const table = powerTable();
  const path = join(outDir, 'tier0-threshold-power.json');
  const { measured_at, ...stable } = table;
  table.content_sha256 = createHash('sha256').update(JSON.stringify(stable)).digest('hex');
  writeFileSync(path, JSON.stringify(table, null, 2) + '\n');
  return { path, table };
}

export function main(argv = process.argv.slice(2)) {
  if (argv.includes('--write')) {
    const { path, table } = writeArtifact();
    console.log(JSON.stringify({
      wrote: path,
      n28_t60_perfect: table.cs_constant_p[0.6][28].perfect_p1_decision,
      min_n_p1_clear_060: table.min_n_perfect_clear[0.6],
      wilson_28_060_clearMin: table.wilson_one_shot['28_0.6'].clearMin,
    }, null, 2));
    return 0;
  }
  const table = powerTable();
  if (argv.includes('--json')) {
    console.log(JSON.stringify(table, null, 2));
    return 0;
  }
  console.log('tier0-threshold-power');
  console.log(`  cs: alpha=${CS_PARAMS.alpha} range=[${CS_PARAMS.range}] csConst=${CS_PARAMS.csConst}`);
  for (const θ of [0.6, 0.7]) {
    const row = table.cs_constant_p[θ][28];
    console.log(`  n=28 θ=${θ}: perfect_p1=${row.perfect_p1_decision}  minP_CLEAR=${row.minP_decide_CLEAR_above}`);
  }
  console.log(`  min n for p=1 CLEAR θ=0.6: ${JSON.stringify(table.min_n_perfect_clear[0.6])}`);
  console.log('Re-run with --write to refresh _SYSTEM/state/atlas/tier0-threshold-power.json');
  return 0;
}

const isMain = process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url;
if (isMain) process.exit(main());
