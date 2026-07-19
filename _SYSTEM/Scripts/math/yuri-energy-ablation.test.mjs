import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { runAblation } from './yuri-energy-ablation.mjs';
import {
  evaluateTransitions,
  DEFAULT_WEIGHTS,
  LANE_IDS,
} from './energy-calibration-contract.mjs';
import scenario from './experiments/component-ablation.mjs';

describe('YURI energy component ablation', () => {
  const defaultRun = evaluateTransitions(scenario, {
    scenario: 'component-ablation',
    runId: 'test-default-09AB',
    lane: LANE_IDS.ABLATION,
    weights: DEFAULT_WEIGHTS,
  });

  it('T_r rejects at DEFAULT weights', () => {
    const step = defaultRun.steps.find(
      (s) => s.label === 'T_r:lambda+kappa-reject',
    );
    assert.ok(step, 'T_r step must exist');
    assert.equal(step.accept, false, 'T_r must reject at default weights');
  });

  it('zeroing lambda lowers T_r deltaU (kappa still fires)', () => {
    const zeroRun = evaluateTransitions(scenario, {
      scenario: 'component-ablation',
      runId: 'test-zero-lambda-09AB',
      lane: LANE_IDS.ABLATION,
      weights: { ...DEFAULT_WEIGHTS, lambda: 0 },
    });
    const base = defaultRun.steps.find(
      (s) => s.label === 'T_r:lambda+kappa-reject',
    );
    const zero = zeroRun.steps.find(
      (s) => s.label === 'T_r:lambda+kappa-reject',
    );
    assert.ok(
      zero.deltaU < base.deltaU,
      `deltaU must decrease when lambda zeroed: ${zero.deltaU} < ${base.deltaU}`,
    );
    // kappa co-fires so T_r still rejects — do NOT assert a verdict flip
  });

  it('zeroing beta lowers overall rejection rate via T_b', () => {
    const result = runAblation({ weights: DEFAULT_WEIGHTS, seed: 1 });
    const row = result.table.find((r) => r.weight === 'beta');
    assert.ok(
      row.zeroedRejectionRate < result.baselineRejectionRate,
      `zeroed ${row.zeroedRejectionRate} must be < baseline ${result.baselineRejectionRate}`,
    );
  });

  it('beta, kappa, lambda each have >= 1 non-zero componentDeltas entry', () => {
    function findNonZero(labels, keys) {
      for (const label of labels) {
        const step = defaultRun.steps.find((s) => s.label === label);
        if (!step || !step.componentDeltas) continue;
        for (const key of keys) {
          const v = step.componentDeltas[key];
          if (v !== undefined && v !== null && Math.abs(Number(v)) > 1e-10) {
            return true;
          }
        }
      }
      return false;
    }

    assert.ok(
      findNonZero(['T_b:drift-reject'], ['klDivergence', 'wasserstein', 'beta']),
      'beta drift term must have non-zero componentDeltas (wasserstein ≥v3, klDivergence ≤v2)',
    );
    assert.ok(
      findNonZero(
        ['T_r:lambda+kappa-reject', 'T_k:kappa-offset', 'T_k2:kappa-raw'],
        ['repeatedFailure', 'kappa'],
      ),
      'kappa/repeatedFailure must have non-zero componentDeltas',
    );
    assert.ok(
      findNonZero(
        ['T_r:lambda+kappa-reject', 'T_l:lambda-only'],
        ['malformedForecast', 'lambda'],
      ),
      'lambda/malformedForecast must have non-zero componentDeltas',
    );
  });

  it('lambda + beta carry DECISION signal (verdict flip)', () => {
    const result = runAblation({ weights: DEFAULT_WEIGHTS, seed: 1 });
    for (const w of ['lambda', 'beta']) {
      const row = result.table.find((r) => r.weight === w);
      assert.equal(row.carriesSignal, true, `${w} must carry decision signal (flip)`);
    }
  });

  it('kappa carries ENERGY signal but is decision-masked by logLoss co-firing (real gate finding)', () => {
    // kappa (confidently-wrong penalty) moves ΔU substantially, but it cannot
    // INDEPENDENTLY flip a reject: logLoss co-fires on the same predictions/outcomes
    // and logLoss alone exceeds threshold 0, so zeroing kappa leaves the transition
    // rejected. carriesSignal (decision) is therefore false; carriesEnergySignal is true.
    const result = runAblation({ weights: DEFAULT_WEIGHTS, seed: 1 });
    const kappa = result.table.find((r) => r.weight === 'kappa');
    assert.equal(kappa.carriesSignal, false, 'kappa cannot independently flip a verdict here (logLoss co-rejects)');
    assert.equal(kappa.carriesEnergySignal, true, 'kappa must carry energy signal (large ΔU shift)');
    assert.ok(kappa.meanAbsDeltaUShift > 1, `kappa ΔU shift should be substantial, got ${kappa.meanAbsDeltaUShift}`);
  });

  it('epsilon + zeta components actually EVALUATE (no silent skip): dedicated steps carry a non-zero componentDelta', () => {
    // Guards the false-negative-as-true-negative trap: a SKIPPED component (wrong input
    // shape) is not the same as a weight that fired and carried no signal. T_e must light
    // informationGain; T_z must light staleness — proven via componentDeltas, not a
    // tautological typeof check.
    const te = defaultRun.steps.find((s) => s.label === 'T_e:infoGain-credit');
    const tz = defaultRun.steps.find((s) => s.label === 'T_z:staleness-signal');
    assert.ok(te && Math.abs(Number(te.componentDeltas.informationGain ?? 0)) > 1e-10,
      'T_e must produce a non-zero informationGain componentDelta (epsilon genuinely exercised, not skipped)');
    assert.ok(tz && Math.abs(Number(tz.componentDeltas.staleness ?? 0)) > 1e-10,
      'T_z must produce a non-zero staleness componentDelta (zeta genuinely exercised, not skipped)');
  });

  it('epsilon (credit) carries energy signal but no flip; zeta (penalty) carries decision signal', () => {
    const result = runAblation({ weights: DEFAULT_WEIGHTS, seed: 1 });
    const epsilon = result.table.find((r) => r.weight === 'epsilon');
    const zeta = result.table.find((r) => r.weight === 'zeta');
    assert.equal(epsilon.carriesEnergySignal, true, 'epsilon must carry energy signal (infoGain credit now fires)');
    assert.equal(epsilon.carriesSignal, false, 'epsilon is a credit; it does not independently flip an accept here');
    assert.equal(zeta.carriesSignal, true, 'zeta (staleness penalty) flips T_z reject→accept when zeroed');
  });

  it('fixture isolates beta from mu while still exercising the mu severity term', () => {
    const beta = defaultRun.steps.find((step) => step.label === 'T_b:drift-reject');
    const mu = defaultRun.steps.find((step) => step.label === 'T_m:overconfidence-signal');
    assert.ok(beta && mu);
    assert.equal(beta.componentDeltas.overconfidenceDrift ?? 0, 0, 'uniform claim must isolate beta from mu');
    assert.ok(Math.abs(mu.componentDeltas.overconfidenceDrift ?? 0) > 1e-10, 'T_m must exercise mu');
  });

  it('fixture is immutable, deterministic data with 12 unique transition labels', () => {
    assert.equal(scenario.length, 12);
    assert.equal(new Set(scenario.map((step) => step.label)).size, 12);
    assert.equal(Object.isFrozen(scenario), true);
    assert.equal(Object.isFrozen(scenario[0].stateBefore), true);
    assert.equal(JSON.stringify(scenario).includes('timestamp'), false);
  });

  it('determinism: runAblation({seed:7}) twice produces identical tables', () => {
    const r1 = runAblation({ seed: 7 });
    const r2 = runAblation({ seed: 7 });
    assert.deepEqual(r1.table, r2.table);
  });

  it('output contains no records-derived fields (e.g. no timestamp)', () => {
    const result = runAblation({ weights: DEFAULT_WEIGHTS, seed: 1 });
    assert.equal(result.generatedAt, null, 'generatedAt must be null');
    const json = JSON.stringify(result);
    assert.ok(
      !json.includes('"timestamp"'),
      'output must not contain any timestamp sourced from records[]',
    );
  });
});
