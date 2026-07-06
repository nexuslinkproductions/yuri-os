// _SYSTEM/Scripts/math/yuri-energy-adversarial.mjs
// YURI Energy-Weight Calibration — Adversarial Probe Harness
// Runs the adversarial scenario against a weight configuration and measures
// gate evasion rate.  STRICT comparison gate: any evasion increase fails.

import {
  evaluateTransitions,
  gateProposal,
  DEFAULT_WEIGHTS,
  evidence,
  buildResultLabel,
  LANE_IDS,
  makeSeededRng
} from './energy-calibration-contract.mjs';

import {
  scenario,
  expectVeto,
  ATTACK_CLASSES
} from './experiments/adversarial-probe.mjs';

import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/**
 * Run the adversarial probe against a given weight configuration.
 * @param {object} opts
 * @param {object} opts.weights   — weight dict (DEFAULT_WEIGHTS if omitted)
 * @param {number} opts.threshold — gate threshold (0 if omitted)
 * @param {number} opts.seed      — deterministic seed for runId (1 if omitted)
 * @returns {{ evasions, vetoEvasions, softEvasions, perClass, total }}
 */
export function runProbe({ weights = DEFAULT_WEIGHTS, threshold = 0, seed = 1 } = {}) {
  // Seed consumed for deterministic runId derivation
  const _rng = makeSeededRng(seed);
  const runId = `adv-probe-${seed}`;

  const { steps } = evaluateTransitions(scenario, {
    scenario: 'adversarial-probe',
    runId,
    lane: LANE_IDS.ADVERSARIAL,
    weights,
    threshold
  });

  const evasions = [];
  const vetoEvasions = [];
  const softEvasions = [];

  // Per-class tallies
  const perClass = {};
  for (const cls of ATTACK_CLASSES) {
    perClass[cls] = { total: 0, evasions: 0 };
  }

  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    const exp = expectVeto[i];
    if (!exp || !exp.shouldReject) continue;

    // Extract class name from label  "classN:className:intent"
    const m = step.label.match(/^class\d+:([^:]+):/);
    const cls = m ? m[1] : 'unknown';

    if (perClass[cls]) perClass[cls].total++;

    // An evasion = expected-bad transition that the gate ACCEPTED
    if (step.accept) {
      const entry = { index: i, label: step.label, deltaU: step.deltaU };
      evasions.push(entry);
      if (exp.vetoExpected) {
        vetoEvasions.push(entry);
      } else {
        softEvasions.push(entry);
      }
      if (perClass[cls]) perClass[cls].evasions++;
    }
  }

  return { evasions, vetoEvasions, softEvasions, perClass, total: evasions.length };
}

/**
 * STRICT gate (D5): candidate must NOT raise evasion vs baseline.
 * @param {object} baselineWeights
 * @param {object} candidateWeights
 * @param {object} [opts]
 * @returns {{ ok, vetoEvasionDelta, softEvasionDelta, baseline, candidate }}
 */
export function compareEvasion(baselineWeights, candidateWeights, opts = {}) {
  const threshold = opts.threshold ?? 0;
  const seed = opts.seed ?? 1;

  const baseline = runProbe({ weights: baselineWeights, threshold, seed });
  const candidate = runProbe({ weights: candidateWeights, threshold, seed });

  const vetoEvasionDelta = candidate.vetoEvasions.length - baseline.vetoEvasions.length;
  const softEvasionDelta = candidate.softEvasions.length - baseline.softEvasions.length;

  // STRICT: ANY increase in either category fails
  const ok = vetoEvasionDelta <= 0 && softEvasionDelta <= 0;

  return { ok, vetoEvasionDelta, softEvasionDelta, baseline, candidate };
}

// ── CLI ──────────────────────────────────────────────────
const __filename = fileURLToPath(import.meta.url);
if (process.argv[1] === __filename) {
  const args = process.argv.slice(2);
  const outIdx = args.indexOf('--out');
  let outPath = null;
  if (outIdx !== -1) {
    const val = args[outIdx + 1];
    // Guard: value-less --out or --out true  →  stdout only
    if (val && val !== 'true' && !val.startsWith('-')) {
      outPath = val;
    }
  }

  const result = runProbe();

  console.log('=== YURI Adversarial Probe ===');
  console.log(`Total evasions: ${result.total}`);
  console.log(`Veto evasions:  ${result.vetoEvasions.length}`);
  console.log(`Soft evasions:  ${result.softEvasions.length}`);
  console.log('\nPer-class breakdown:');
  for (const [cls, data] of Object.entries(result.perClass)) {
    console.log(`  ${cls}: ${data.evasions}/${data.total} evaded`);
  }

  // Evidence grammar lines (one TERM_COUNT per attack class + the total)
  console.log('');
  for (const [cls, data] of Object.entries(result.perClass)) {
    console.log(evidence.termCount(cls, data.evasions));
  }
  console.log(evidence.termCount('total_evasions', result.total));

  const label = buildResultLabel({
    laneId: LANE_IDS.ADVERSARIAL,
    description: 'adversarial probe 5 attack classes',
    passType: result.total === 0 ? 'X' : 'F'
  });
  console.log(`\n${label}`);

  if (outPath) {
    writeFileSync(outPath, JSON.stringify(result, null, 2));
    console.log(`\nJSON written to ${outPath}`);
  }
}
