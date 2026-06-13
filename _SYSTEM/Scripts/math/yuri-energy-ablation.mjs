import { writeFileSync } from 'node:fs';
import {
  evaluateTransitions,
  DEFAULT_WEIGHTS,
  SOFT_WEIGHT_KEYS,
  evidence,
  buildResultLabel,
  LANE_IDS,
  roundEnergy,
} from './energy-calibration-contract.mjs';
import scenario from './experiments/component-ablation.mjs';

// `seed` is accepted for cross-lane interface symmetry but is intentionally a no-op:
// ablation is EXHAUSTIVE (it zeroes/scales every soft weight), not sampled, so there is
// no RNG and the output is deterministic regardless of seed. Do not add a makeSeededRng
// here implying stochastic behavior that does not exist.
export function runAblation({ weights = DEFAULT_WEIGHTS, seed = 1 } = {}) {
  void seed;

  const baseline = evaluateTransitions(scenario, {
    scenario: 'component-ablation',
    runId: 'ablation-baseline-09AB',
    lane: LANE_IDS.ABLATION,
    weights,
  });

  const n = baseline.steps.length;
  const baselineRejectCount = baseline.steps.filter((s) => !s.accept).length;
  const baselineRejectionRate = baselineRejectCount / n;

  const table = [];

  for (const w of SOFT_WEIGHT_KEYS) {
    const zeroedWeights = { ...weights, [w]: 0 };
    const zeroed = evaluateTransitions(scenario, {
      scenario: 'component-ablation',
      runId: `ablation-zero-${w}-09AB`,
      lane: LANE_IDS.ABLATION,
      weights: zeroedWeights,
    });

    const zeroedRejectCount = zeroed.steps.filter((s) => !s.accept).length;
    const zeroedRejectionRate = zeroedRejectCount / n;

    let flippedCount = 0;
    let totalAbsDeltaU = 0;
    for (let i = 0; i < n; i++) {
      if (baseline.steps[i].accept !== zeroed.steps[i].accept) {
        flippedCount++;
      }
      totalAbsDeltaU += Math.abs(
        zeroed.steps[i].deltaU - baseline.steps[i].deltaU
      );
    }

    const meanAbsDeltaUShift = roundEnergy(totalAbsDeltaU / n);
    // carriesSignal = DECISION signal (D3 bar): zeroing w changes the rejection rate
    // OR flips a verdict. carriesEnergySignal = the weight moves ΔU above the noise
    // floor but may NOT independently flip a decision in this scenario (e.g. kappa is
    // decision-masked by logLoss co-firing on the same predictions/outcomes). CALIBRATE's
    // proof-gated rung reads carriesSignal; carriesEnergySignal is the diagnostic context.
    const carriesSignal =
      zeroedRejectionRate !== baselineRejectionRate || flippedCount > 0;
    const carriesEnergySignal = meanAbsDeltaUShift > 1e-6;

    table.push({
      weight: w,
      baselineRejectionRate,
      zeroedRejectionRate,
      flippedCount,
      meanAbsDeltaUShift,
      carriesSignal,
      carriesEnergySignal,
    });
  }

  return { table, baselineRejectionRate, generatedAt: null };
}

/* ── CLI ─────────────────────────────────────────────────────────────── */
if (
  typeof process !== 'undefined' &&
  process.argv[1] &&
  import.meta.url === `file://${process.argv[1]}`
) {
  const args = process.argv.slice(2);
  let outPath = null;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--out') {
      const next = args[i + 1];
      if (next !== undefined && !next.startsWith('--')) {
        outPath = next;
      }
      break;
    }
  }

  const result = runAblation();

  console.table(result.table);
  for (const row of result.table) {
    console.log(evidence.termCount(row.weight, row.flippedCount));
  }
  console.log(
    buildResultLabel({
      laneId: LANE_IDS.ABLATION,
      description: 'component ablation signal table',
      passType: 'X',
    })
  );

  if (typeof outPath === 'string') {
    writeFileSync(outPath, JSON.stringify(result, null, 2));
  }
}
