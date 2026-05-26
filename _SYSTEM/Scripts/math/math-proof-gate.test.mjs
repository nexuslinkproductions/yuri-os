#!/usr/bin/env node
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  inspectFormulaBankDirectory,
  ProofGateError,
  runFormulaCounterexample,
  runFormulaProofGate,
  validateFormulaBank,
} from './math-proof-gate.mjs';

test('formula bank proof gate validates promoted banks and executes examples', () => {
  const result = inspectFormulaBankDirectory();

  assert.equal(result.ok, true, result.errors.join('\n'));
  assert.ok(result.banks.length >= 5);
  assert.ok(result.traces.length >= 20);
  assert.ok(result.traces.every((trace) => trace.schema === 'yuri.math.proof-trace.v0'));
  assert.ok(result.traces.every((trace) => trace.passed === true));
  assert.ok(result.traces.some((trace) => trace.counterexample === true));
  assert.ok(result.banks.some((bank) => bank.executableCounterexamples > 0));
  for (const bank of result.banks.filter((entry) => entry.promotionStatus === 'verified-baseline')) {
    assert.ok(bank.executableExamples >= bank.formulaCount);
    assert.ok(bank.executableCounterexamples >= bank.formulaCount);
  }
});

test('proof gate emits deterministic traces for the same formula input', () => {
  const first = runFormulaProofGate({
    formulaId: 'brier-score',
    input: { predictions: [0.9, 0.2], outcomes: [1, 0] },
    expected: { score: 0.025 },
  });
  const second = runFormulaProofGate({
    formulaId: 'brier-score',
    input: { predictions: [0.9, 0.2], outcomes: [1, 0] },
    expected: { score: 0.025 },
  });

  assert.equal(first.inputHash, second.inputHash);
  assert.equal(first.resultHash, second.resultHash);
  assert.equal(first.formulaHash, second.formulaHash);
});

test('proof gate rejects invalid promoted formula inputs in strict mode', () => {
  assert.throws(
    () => runFormulaProofGate({
      formulaId: 'brier-score',
      input: { predictions: [-0.1], outcomes: [1] },
    }),
    ProofGateError,
  );
});

test('proof gate can preserve failed hypotheses in advisory mode', () => {
  const trace = runFormulaProofGate({
    formulaId: 'brier-score',
    input: { predictions: [-0.1], outcomes: [1] },
    mode: 'advisory',
  });

  assert.equal(trace.passed, false);
  assert.match(trace.error, /between 0 and 1/);
});

test('proof gate executes promoted counterexamples as negative proofs', () => {
  const trace = runFormulaCounterexample({
    formulaId: 'brier-score',
    input: { predictions: [-0.1], outcomes: [1] },
    expectedError: 'between 0 and 1',
  });

  assert.equal(trace.counterexample, true);
  assert.equal(trace.passed, true);
  assert.match(trace.error, /between 0 and 1/);
  assert.equal(trace.errorMatcher, 'message-regex');
});

test('proof gate rejects counterexamples that unexpectedly pass', () => {
  assert.throws(
    () => runFormulaCounterexample({
      formulaId: 'brier-score',
      input: { predictions: [0.5], outcomes: [1] },
      expectedError: 'between 0 and 1',
    }),
    ProofGateError,
  );
});

test('validator keeps fixture banks advisory without executable requirements', () => {
  const result = validateFormulaBank({
    schema: 'yuri.math.formula-bank.v0',
    id: 'fixture-bank',
    version: '0.1.0',
    promotionStatus: 'fixture',
    advisoryOnly: true,
    formulas: [
      {
        id: 'synthetic-fixture',
        notation: 'a = b',
        purpose: 'Teach fixture validation.',
        proofObligations: ['synthetic_only'],
      },
    ],
  });

  assert.equal(result.ok, true, result.errors.join('\n'));
});

test('validator rejects loose counterexample error patterns for promoted formulas', () => {
  const result = validateFormulaBank({
    schema: 'yuri.math.formula-bank.v0',
    id: 'loose-counterexample-bank',
    version: '0.1.0',
    promotionStatus: 'verified-baseline',
    advisoryOnly: false,
    formulas: [{
      id: 'brier-score',
      domain: 'probability-calibration',
      notation: 'mean((p - y)^2)',
      purpose: 'Score binary probabilistic forecasts.',
      implementedBy: 'math-kernel.brierScore',
      variables: [
        { symbol: 'p', meaning: 'predictions', type: 'number[]', constraints: ['0 <= p <= 1'] },
        { symbol: 'y', meaning: 'outcomes', type: 'number[]', constraints: ['0 <= y <= 1'] },
      ],
      assumptions: ['equal length arrays'],
      invalidInputs: ['invalid probabilities'],
      failureModes: ['loose counterexample matching'],
      workedExamples: [{
        name: 'valid forecast',
        input: { predictions: [0.5], outcomes: [1] },
        expected: { score: 0.25 },
        interpretation: 'valid example',
      }],
      counterexamples: [{
        name: 'too broad',
        input: { predictions: [-0.1], outcomes: [1] },
        expectedError: 'error',
      }],
      promotionStatus: 'verified-baseline',
      advisoryOnly: false,
      proofObligations: ['worked_examples_execute', 'counterexamples_fail'],
    }],
  });

  assert.equal(result.ok, false);
  assert.match(result.errors.join('\n'), /loose expectedError/);
});
