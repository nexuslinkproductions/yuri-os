#!/usr/bin/env node
// @capability: bench-power
// @serves: statistical power for a benchmark | how many questions do I need | smallest resolvable effect | is this n big enough | sample size for an arm comparison
// @does: computes required n per effect size, and smallest resolvable effect per n, against the SAME confidence sequence the arm gate uses
// @use: before authoring or expanding any benchmark, and before believing any UNDECIDED verdict is a small-sample problem
// @exports: requiredN, smallestResolvableEffect, powerTable, main
// @tier: generic
// @couples: none
// @deps: none
//   Top of the release bundle: bench-power -> eval-processing -> decision-sim. All three generic,
//   node builtins only. This is the extractable unit — NOT bench-power alone, which was my claim
//   before extraction-scan traced the chain and falsified it.
//
// bench-power.mjs — REPRODUCIBLE statistical power for the Atlas benchmark.
//
// WHY THIS IS A SCRIPT AND NOT A JSON OF RESULTS
// ---------------------------------------------------------------------------------------------
// On 2026-07-28 a G6a calibration table was quarantined in
// skills/auto-research/references/retrieval-validation-gates.md because it had been produced by
// ad-hoc unpersisted code: a committed protocol doc carried a baseline no committed code could
// regenerate. Recording numbers is not the same as being able to reproduce them. Every figure
// below is computed on demand from the real gate, so it cannot drift from the thing it describes.
//
// CAPABILITY-FIRST: the decision rule here is NOT reimplemented. It imports `sequentialDecide`
// from _SYSTEM/Scripts/eval-processing.mjs — the exact empirical-Bernstein confidence sequence
// that `compareArms` uses to accept or reject an arm. If that gate changes, these numbers change
// with it. A power calculator that models the gate rather than calling it will silently disagree
// with it, which is the same class of defect as a benchmark answering an adjacent question.
//
// WHAT THE TWO BOUNDS MEAN
// ---------------------------------------------------------------------------------------------
//   zero-variance floor  — every paired delta identical. Variance term vanishes; only the
//                          range term (3·span·L_t/n) remains. This is the MATHEMATICAL BEST CASE
//                          and is not attainable by real data. Treat it as "no n smaller than
//                          this can possibly work."
//   max-variance ceiling — paired deltas at the range endpoints with the same mean. Pessimistic.
//                          Real data sits between the two, driven by the per-question value
//                          distribution: hit@k is BINARY and therefore sits near the high end.
//
// THE ASSUMPTION THAT WILL BITE (read before scaling n)
// ---------------------------------------------------------------------------------------------
// The confidence sequence assumes INDEPENDENT samples. Two questions about the SAME answer file
// are correlated — they share that file's retrievability. Feeding correlated items makes the
// sequence OPTIMISTIC: it will declare DECIDED before the evidence supports it. So "reach n=1000
// by writing 4 questions per path" does NOT buy 1000 independent samples. Estimate the effective-n
// penalty before trusting any n built that way.
//
// PEEK-SAFETY IS NOT FREE
// ---------------------------------------------------------------------------------------------
// This sequence is TIME-UNIFORM — valid under continuous peeking, which is exactly what the
// improvement loop needs when it checks after every iteration. A ONE-SHOT pre-registered
// comparison does not need that guarantee and a fixed-sample bound would need fewer samples.
// Using a peek-safe instrument for a non-peeking question inflates the required n. That is a
// live open question, not a settled one — do not "fix" it by loosening alpha.
//
// USAGE
//   node _SYSTEM/Scripts/atlas/bench-power.mjs
//   node _SYSTEM/Scripts/atlas/bench-power.mjs --json
//   node _SYSTEM/Scripts/atlas/bench-power.mjs --self-test

import { pathToFileURL } from 'node:url';
import { sequentialDecide } from '../eval-processing.mjs';

// Must mirror compareArms' gate configuration. If these drift, this file lies.
const GATE = { alpha: 0.05, range: [-1, 1], threshold: 0, csConst: 1.0 };
const MAX_N = 60000;

function constantDeltas(n, effect) {
  return new Array(n).fill(effect);
}

// Same mean, mass at the range endpoints — the pessimistic variance case.
function endpointDeltas(n, effect) {
  const [lo, hi] = GATE.range;
  const pHi = (effect - lo) / (hi - lo);
  const out = new Array(n);
  let acc = 0;
  for (let i = 0; i < n; i++) {
    acc += pHi;
    if (acc >= 1) { out[i] = hi; acc -= 1; } else { out[i] = lo; }
  }
  return out;
}

/** Smallest n at which a constant effect is DECIDED-BETTER. null if never within MAX_N. */
export function requiredN(effect, { variance = 'zero' } = {}) {
  const build = variance === 'max' ? endpointDeltas : constantDeltas;
  const r = sequentialDecide(build(MAX_N, effect), { ...GATE, maxN: MAX_N });
  return r.decision === 'above' ? r.nUsed : null;
}

/** Smallest effect resolvable at a given n. Bisection; deterministic. */
export function smallestResolvableEffect(n, { variance = 'zero', iterations = 40 } = {}) {
  const build = variance === 'max' ? endpointDeltas : constantDeltas;
  let lo = 0.0001;
  let hi = 1.0;
  for (let i = 0; i < iterations; i++) {
    const mid = (lo + hi) / 2;
    const r = sequentialDecide(build(n, mid), { ...GATE, maxN: n });
    if (r.decision === 'above') hi = mid; else lo = mid;
  }
  return hi;
}

export function powerTable({
  effects = [0.240, 0.150, 0.050, 0.035, 0.020],
  sampleSizes = [40, 100, 237, 500, 1000, 2000],
} = {}) {
  return {
    gate: GATE,
    requiredN: effects.map((e) => ({
      effect: e,
      zeroVarianceFloor: requiredN(e, { variance: 'zero' }),
      maxVarianceCeiling: requiredN(e, { variance: 'max' }),
    })),
    resolvableAt: sampleSizes.map((n) => ({
      n,
      smallestEffectZeroVarianceFloor: Number(smallestResolvableEffect(n).toFixed(4)),
    })),
    caveats: [
      'zero-variance is a mathematical best case, unattainable by real data',
      'hit@k is binary and therefore sits near the HIGH-variance end',
      'the sequence assumes INDEPENDENT samples; multiple questions per answer path are correlated and make it optimistic',
      'time-uniform peek-safety costs samples; a one-shot pre-registered comparison could use a cheaper fixed-sample bound',
    ],
  };
}

function selfTest() {
  let pass = 0;
  let fail = 0;
  const check = (name, ok) => { if (ok) { pass++; console.log(`  PASS ${name}`); } else { fail++; console.error(`  FAIL ${name}`); } };

  // Monotonicity: a smaller effect can never need fewer samples.
  const n50 = requiredN(0.050);
  const n35 = requiredN(0.035);
  const n20 = requiredN(0.020);
  check('required n is monotone decreasing in effect size', n50 < n35 && n35 < n20);

  // Monotonicity: more samples can never resolve a larger minimum effect.
  const e237 = smallestResolvableEffect(237);
  const e1000 = smallestResolvableEffect(1000);
  check('resolvable effect shrinks with n', e1000 < e237);

  // Round trip: the effect resolvable at n should require about n samples.
  const rt = requiredN(e237 * 1.02);
  check('round trip — effect resolvable at n=237 requires ~237', rt !== null && rt <= 237);

  // Max variance must never be cheaper than the zero-variance floor.
  check('max-variance ceiling >= zero-variance floor',
    requiredN(0.050, { variance: 'max' }) >= n50);

  // Determinism.
  check('deterministic', smallestResolvableEffect(237) === e237);

  console.log(`\nSELF-TEST: ${pass}/${pass + fail} passed`);
  return fail === 0;
}

export function main(argv = process.argv.slice(2)) {
  if (argv.includes('--self-test')) return selfTest() ? 0 : 1;
  const table = powerTable();
  if (argv.includes('--json')) { console.log(JSON.stringify(table, null, 2)); return 0; }

  console.log('bench-power — statistical power of the arm-comparison gate');
  console.log(`gate: alpha=${GATE.alpha} range=[${GATE.range}] threshold=${GATE.threshold} csConst=${GATE.csConst}\n`);
  console.log('REQUIRED n PER EFFECT SIZE');
  console.log('  effect   zero-var floor   max-var ceiling');
  for (const r of table.requiredN) {
    console.log(`  ${r.effect.toFixed(3)}    ${String(r.zeroVarianceFloor ?? '>' + MAX_N).padStart(10)}       ${String(r.maxVarianceCeiling ?? '>' + MAX_N).padStart(10)}`);
  }
  console.log('\nSMALLEST RESOLVABLE EFFECT PER n (zero-variance floor)');
  for (const r of table.resolvableAt) {
    console.log(`  n=${String(r.n).padStart(5)}   ${r.smallestEffectZeroVarianceFloor.toFixed(4)}`);
  }
  console.log('\nCAVEATS');
  for (const c of table.caveats) console.log(`  - ${c}`);
  return 0;
}

const isMain = process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url;
if (isMain) process.exit(main());
