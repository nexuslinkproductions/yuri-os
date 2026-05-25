#!/usr/bin/env node
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  inspectFormulaBankDirectory,
  ProofGateError,
  runFormulaProofGate,
  validateFormulaBank,
} from './math-proof-gate.mjs';

test('formula bank proof gate validates promoted banks and executes examples', () => {
  const result = inspectFormulaBankDirectory();

  assert.equal(result.ok, true, result.errors.join('\n'));
  assert.ok(result.banks.length >= 5);
  assert.ok(result.traces.length >= 10);
  assert.ok(result.traces.every((trace) => trace.schema === 'yuri.math.proof-trace.v0'));
  assert.ok(result.traces.every((trace) => trace.passed === true));
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
