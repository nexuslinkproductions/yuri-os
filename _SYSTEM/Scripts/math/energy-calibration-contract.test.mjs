import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as contract from './energy-calibration-contract.mjs';
import {
  DEFAULT_WEIGHTS as CORE_DEFAULT_WEIGHTS,
  gateProposal as coreGateProposal,
} from './yuri-energy.mjs';
import { evaluateTransitions as coreEvaluateTransitions } from './yuri-energy-experiment.mjs';

const REQUIRED_EXPORTS = [
  'evaluateTransitions', 'DEFAULT_WEIGHTS', 'SOFT_WEIGHT_KEYS', 'evidence',
  'buildResultLabel', 'LANE_IDS', 'roundEnergy', 'gateProposal', 'makeSeededRng',
  'resolveFullWeights', 'validateCandidateWeights', 'reconstructRawComponents',
  'rescoreRecordU', 'BURN_IN_DEFAULT_SUBSET', 'resolveFormulaVersion',
  'formulaVersionTally', 'assertSingleEra', 'PASS_TYPES',
  'CONTRIBUTION_TO_WEIGHT',
];

test('compatibility surface exposes all 19 required names', () => {
  for (const name of REQUIRED_EXPORTS) assert.ok(name in contract, `missing export ${name}`);
  assert.equal(contract.DEFAULT_WEIGHTS, CORE_DEFAULT_WEIGHTS);
  assert.equal(contract.gateProposal, coreGateProposal);
  assert.equal(contract.evaluateTransitions, coreEvaluateTransitions);
});

test('soft weights and English-to-Greek contribution map are exact', () => {
  assert.deepEqual(contract.SOFT_WEIGHT_KEYS, [
    'alpha', 'beta', 'gamma', 'delta', 'epsilon',
    'zeta', 'iota', 'kappa', 'lambda', 'mu',
  ]);
  assert.equal(Object.keys(contract.CONTRIBUTION_TO_WEIGHT).length, 13);
  assert.equal(contract.CONTRIBUTION_TO_WEIGHT.klDivergence, 'beta');
  assert.equal(contract.CONTRIBUTION_TO_WEIGHT.wasserstein, 'beta');
  assert.equal(contract.CONTRIBUTION_TO_WEIGHT.overconfidenceDrift, 'mu');
  assert.ok(!contract.SOFT_WEIGHT_KEYS.includes('eta'));
  assert.ok(!contract.SOFT_WEIGHT_KEYS.includes('theta'));
});

test('candidate validation accepts delta/bare/full soft configs and refuses unsafe shapes', () => {
  assert.equal(contract.resolveFullWeights({ kind: 'delta', weights: { iota: 0.2 } }).iota, 0.2);
  assert.equal(contract.resolveFullWeights({ beta: 2.5 }).beta, 2.5);
  const full = Object.fromEntries(contract.SOFT_WEIGHT_KEYS.map((key) => [key, contract.DEFAULT_WEIGHTS[key]]));
  assert.deepEqual(contract.resolveFullWeights({ kind: 'full', weights: full }), contract.DEFAULT_WEIGHTS);

  for (const invalid of [
    { eta: 1 },
    { theta: 1 },
    { nope: 1 },
    { beta: -1 },
    { beta: Infinity },
    { alpha: 1e308 },
    { beta: '2' },
    { kind: 'delta', weights: null },
  ]) {
    assert.throws(() => contract.validateCandidateWeights(invalid));
  }
  assert.throws(() => contract.validateCandidateWeights({ kind: 'full', weights: { beta: 2 } }), /missing soft weight/);
});

test('reconstruction distinguishes linear, signed credit, absence, and failure', () => {
  const record = {
    energyFormulaVersion: 3,
    componentContributions: {
      wasserstein: 4,
      informationGain: -0.25,
      repeatedFailure: 10,
      logLoss: NaN,
    },
    weights: { ...contract.DEFAULT_WEIGHTS },
  };
  const out = contract.reconstructRawComponents(record);
  assert.equal(out.recovered.wasserstein.basis, 2);
  assert.equal(out.recovered.informationGain.basis, 0.25);
  assert.equal(out.recovered.repeatedFailure.basis, 2);
  assert.equal(out.recovered.repeatedFailure.rounds, true);
  assert.ok(out.absentComponents.includes('staleness'));
  assert.deepEqual(out.unrecoverable.find((entry) => entry.component === 'logLoss')?.reason, 'non-finite-contribution');
});

test('verified-evidence reconstruction is capped and right-censored', () => {
  const weight = contract.DEFAULT_WEIGHTS.iota;
  const contribution = contract.roundEnergy(-weight * Math.log1p(50));
  const out = contract.reconstructRawComponents({
    componentContributions: { verifiedEvidenceCredit: contribution },
    weights: { ...contract.DEFAULT_WEIGHTS },
  });
  assert.ok(Math.abs(out.recovered.verifiedEvidenceCredit.basis - 50) < 1e-5);
  assert.equal(out.rightCensored.length, 1);

  const incompatible = contract.reconstructRawComponents({
    componentContributions: { verifiedEvidenceCredit: contribution - 1 },
    weights: { ...contract.DEFAULT_WEIGHTS },
  });
  assert.equal(incompatible.recovered.verifiedEvidenceCredit, undefined);
  assert.equal(
    incompatible.unrecoverable.find((entry) => entry.component === 'verifiedEvidenceCredit')?.reason,
    'formula-incompatible-below-capped-credit-floor',
  );
});

test('same-weight rescoring is a fixed point over recoverable contributions', () => {
  const record = {
    energyFormulaVersion: 3,
    componentContributions: {
      entropy: 0.7,
      wasserstein: 4,
      informationGain: -0.25,
      repeatedFailure: 10,
      verifiedEvidenceCredit: contract.roundEnergy(-0.1 * Math.log1p(7)),
    },
    weights: { ...contract.DEFAULT_WEIGHTS },
  };
  const expected = contract.roundEnergy(
    Object.values(record.componentContributions).reduce((sum, value) => sum + value, 0),
  );
  const same = contract.rescoreRecordU(record, contract.DEFAULT_WEIGHTS);
  assert.equal(same.U, expected);
  assert.equal(same.rescoredCount, 5);

  const changed = contract.rescoreRecordU(record, { ...contract.DEFAULT_WEIGHTS, beta: 3 });
  assert.equal(changed.contributions.wasserstein, 6);
});

test('formula-era reader normalizes strings and refuses mixed eras', () => {
  assert.equal(contract.resolveFormulaVersion({}), 1);
  assert.equal(contract.resolveFormulaVersion({ energyFormulaVersion: 2 }), 2);
  assert.equal(contract.resolveFormulaVersion({ energyFormulaVersion: '3' }), 3);
  assert.deepEqual(contract.formulaVersionTally([
    {},
    { energyFormulaVersion: 2 },
    { energyFormulaVersion: '3' },
    { energyFormulaVersion: 3 },
  ]), { 1: 1, 2: 1, 3: 2 });
  assert.equal(contract.assertSingleEra([{ energyFormulaVersion: 3 }]), 3);
  assert.throws(
    () => contract.assertSingleEra([{}, { energyFormulaVersion: 2 }], { context: 'test' }),
    /multiple energyFormulaVersion eras/,
  );
  for (const invalid of [0, -1, 1.5, '', 'nope', null, '0x3', '3e0']) {
    assert.throws(() => contract.resolveFormulaVersion({ energyFormulaVersion: invalid }), /positive integer/);
  }
  assert.throws(() => contract.resolveFormulaVersion(null), /plain object/);
  assert.throws(() => contract.resolveFormulaVersion([]), /plain object/);
  assert.throws(() => contract.resolveFormulaVersion('x'), /plain object/);
  assert.throws(() => contract.resolveFormulaVersion({ energyFormulaVersion: 999 }), /unsupported/);
  assert.throws(
    () => contract.reconstructRawComponents({ energyFormulaVersion: 3, componentContributions: { klDivergence: 1 } }),
    /requires the wasserstein drift key/,
  );
  assert.throws(
    () => contract.reconstructRawComponents({ energyFormulaVersion: 1, componentContributions: { wasserstein: 1 } }),
    /requires the klDivergence drift key/,
  );
  assert.throws(
    () => contract.reconstructRawComponents({
      energyFormulaVersion: 3,
      componentContributions: { klDivergence: 1, wasserstein: 1 },
    }),
    /cannot contain both/,
  );
  assert.throws(
    () => contract.assertSingleEra([{
      energyFormulaVersion: 3,
      componentContributions: { klDivergence: 1 },
    }]),
    /requires the wasserstein drift key/,
  );
  assert.throws(
    () => contract.reconstructRawComponents({ componentContributions: { futureComponent: 1 } }),
    /unknown energy component contribution/,
  );
});

test('rounding and rescoring fail closed on finite overflow', () => {
  assert.throws(() => contract.roundEnergy(Number.MAX_VALUE), /rounding range/);
  assert.throws(
    () => contract.rescoreRecordU({
      energyFormulaVersion: 3,
      componentContributions: { entropy: Number.MAX_VALUE / 2 },
      weights: { ...contract.DEFAULT_WEIGHTS },
    }, { ...contract.DEFAULT_WEIGHTS, alpha: 4 }),
    /non-finite|overflow/,
  );
});

test('rounding, deterministic RNG, evidence, and result-label grammar are stable', () => {
  assert.equal(contract.roundEnergy(-0), 0);
  assert.equal(contract.roundEnergy(1.0000000006), 1.000000001);
  const a = contract.makeSeededRng(1);
  const b = contract.makeSeededRng(1);
  assert.deepEqual([a(), a(), a()], [b(), b(), b()]);
  assert.equal(contract.evidence.termCount('recoverable', 3), 'TERM_COUNT term=recoverable count=3');
  assert.equal(contract.evidence.fileCount('trace.jsonl', 4), 'FILE_COUNT file=trace.jsonl count=4');
  for (const invalidCount of [-1, 1.5, '', '3', Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(() => contract.evidence.termCount('recoverable', invalidCount), /non-negative safe integer/);
  }
  for (const invalidToken of ['', 'x count=999', 'x=y', 'x\nspoof', 'x\0spoof']) {
    assert.throws(() => contract.evidence.termCount(invalidToken, 1), /evidence token/);
    assert.throws(() => contract.evidence.fileCount(invalidToken, 1), /evidence token/);
    assert.throws(() => contract.evidence.match(invalidToken, 'term', 1, 'excerpt'), /evidence token/);
  }
  assert.throws(() => contract.evidence.match('file', 'x=y', 1, 'excerpt'), /evidence token/);
  assert.throws(() => contract.evidence.match('file', 'term', '1', 'excerpt'), /positive safe integer/);
  assert.throws(() => contract.roundEnergy('1'), /finite number/);
  assert.equal(
    contract.buildResultLabel({ laneId: '09AB', description: 'component ablation', passType: 'X' }),
    '09AB_COMPONENT_ABLATION_X_PASS_COMMITTED',
  );
});

test('tracked Analyze and Quantum modules import through the recovered seam', async () => {
  const analyze = await import('./yuri-energy-analyze.mjs');
  const quantum = await import('./yuri-energy-quantum-analyze.mjs');
  assert.equal(typeof analyze.burnInRescoreDelta, 'function');
  assert.equal(typeof quantum.recordContribVector, 'function');
});
