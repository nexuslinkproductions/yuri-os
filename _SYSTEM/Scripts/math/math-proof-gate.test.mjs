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
  // Certification traces must all pass; advisory traces (research/fixture
  // banks, gates-foundry-11) are reported-not-certified and may legitimately fail.
  assert.ok(result.traces.filter((trace) => !trace.advisory).every((trace) => trace.passed === true));
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

test('validator rejects implementedBy declaring a non-existent kernel symbol (fail-closed provenance)', () => {
  const result = validateFormulaBank({
    schema: 'yuri.math.formula-bank.v0',
    id: 'desync-provenance-bank',
    version: '0.1.0',
    promotionStatus: 'verified-baseline',
    advisoryOnly: false,
    formulas: [{
      id: 'shannon-entropy',
      domain: 'information-theory',
      notation: 'H(P) = -sum_i p_i log_b(p_i)',
      purpose: 'Measure uncertainty.',
      implementedBy: '_SYSTEM/Scripts/math/math-kernel.mjs#fakeFn',
      variables: [
        { symbol: 'p', meaning: 'probabilities', type: 'number[]', constraints: ['p >= 0'] },
      ],
      assumptions: ['normalizable'],
      invalidInputs: ['empty array'],
      failureModes: ['provenance desync'],
      workedExamples: [{
        name: 'valid',
        input: { probabilities: [0.5, 0.5], base: 2 },
        expected: { entropy: 1 },
        interpretation: 'one bit',
      }],
      counterexamples: [{
        name: 'negative weight',
        input: { probabilities: [1, -1], base: 2 },
        expectedError: 'non-negative',
      }],
      promotionStatus: 'verified-baseline',
      advisoryOnly: false,
      proofObligations: ['probabilities_non_negative'],
    }],
  });

  assert.equal(result.ok, false);
  assert.match(result.errors.join('\n'), /kernel#fakeFn which is not an exported function/);
});

test('validator accepts a real kernel symbol in implementedBy and all shipped banks resolve', () => {
  const real = validateFormulaBank({
    schema: 'yuri.math.formula-bank.v0',
    id: 'real-provenance-bank',
    version: '0.1.0',
    promotionStatus: 'verified-baseline',
    advisoryOnly: false,
    formulas: [{
      id: 'shannon-entropy',
      domain: 'information-theory',
      notation: 'H(P) = -sum_i p_i log_b(p_i)',
      purpose: 'Measure uncertainty.',
      implementedBy: '_SYSTEM/Scripts/math/math-kernel.mjs#entropy',
      variables: [
        { symbol: 'p', meaning: 'probabilities', type: 'number[]', constraints: ['p >= 0'] },
      ],
      assumptions: ['normalizable'],
      invalidInputs: ['empty array'],
      failureModes: ['none'],
      workedExamples: [{
        name: 'valid',
        input: { probabilities: [0.5, 0.5], base: 2 },
        expected: { entropy: 1 },
        interpretation: 'one bit',
      }],
      counterexamples: [{
        name: 'negative weight',
        input: { probabilities: [1, -1], base: 2 },
        expectedError: 'non-negative',
      }],
      promotionStatus: 'verified-baseline',
      advisoryOnly: false,
      proofObligations: ['probabilities_non_negative'],
    }],
  });

  // The desync check must not produce a kernel-symbol error for a real export.
  assert.equal(real.errors.some((error) => /not an exported function/.test(error)), false, real.errors.join('\n'));

  // Every shipped promoted bank still validates with the provenance check armed.
  const inspection = inspectFormulaBankDirectory();
  assert.equal(inspection.ok, true, inspection.errors.join('\n'));
  assert.equal(inspection.errors.some((error) => /not an exported function/.test(error)), false);
});

// Shared honest shannon card for the attack tests below.
function shannonCard(overrides = {}) {
  return {
    id: 'shannon-entropy',
    domain: 'information-theory',
    notation: 'H(P) = -sum_i p_i log_b(p_i)',
    purpose: 'Measure uncertainty.',
    implementedBy: '_SYSTEM/Scripts/math/math-kernel.mjs#entropy',
    variables: [{ symbol: 'p', meaning: 'probabilities', type: 'number[]', constraints: ['p >= 0'] }],
    assumptions: ['normalizable'],
    invalidInputs: ['empty array'],
    failureModes: ['none'],
    workedExamples: [{ name: 'valid', input: { probabilities: [0.5, 0.5], base: 2 }, expected: { entropy: 1 }, interpretation: 'one bit' }],
    counterexamples: [{ name: 'negative weight', input: { probabilities: [1, -1], base: 2 }, expectedError: 'non-negative' }],
    promotionStatus: 'verified-baseline',
    advisoryOnly: false,
    proofObligations: ['probabilities_non_negative'],
    ...overrides,
  };
}

// gates-foundry-1: vacuous certification closed in three layers.
test('gate rejects a card that asserts nothing', () => {
  assert.throws(() => runFormulaProofGate({ formulaId: 'shannon-entropy', input: { probabilities: [0.5, 0.5], base: 2 }, expected: {}, mode: 'strict' }), /vacuous/);
  // MISSING expected is just as vacuous as expected:{} — both refuse to certify.
  const adv = runFormulaProofGate({ formulaId: 'shannon-entropy', input: { probabilities: [0.5, 0.5], base: 2 }, mode: 'advisory' });
  assert.equal(adv.passed, false);
  assert.match(adv.error, /vacuous/);
  const v = validateFormulaBank({
    schema: 'yuri.math.formula-bank.v0', id: 'atk', version: '0.1.0', promotionStatus: 'verified-baseline', advisoryOnly: false,
    formulas: [shannonCard({ workedExamples: [{ name: 'vacuous', input: { probabilities: [0.5, 0.5], base: 2 }, expected: {}, interpretation: 'asserts nothing' }] })],
  });
  assert.equal(v.ok, false);
  assert.ok(v.errors.some((e) => /empty expected/.test(e)));
});

// gates-foundry-2: function-identity binding assertion (existence is not enough).
test('validator rejects an implementedBy symbol that is not the executed binding', () => {
  const result = validateFormulaBank({
    schema: 'yuri.math.formula-bank.v0', id: 'desync-identity-bank', version: '0.1.0', promotionStatus: 'verified-baseline', advisoryOnly: false,
    formulas: [shannonCard({ implementedBy: '_SYSTEM/Scripts/math/math-kernel.mjs#klDivergence' })],
  });
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => /binding desync/.test(e)));
});

// gates-foundry-8: worked-example expected values are the exact kernel doubles
// (the 1e-12 gate tolerance must never launder a card literal drift).
test('worked-example expected values are the exact kernel doubles', () => {
  const exact = (result, expected, label) => {
    if (typeof expected === 'number') {
      assert.ok(Object.is(result, expected), `${label} is not the exact kernel double (${result} vs ${expected})`);
    } else if (Array.isArray(expected)) {
      expected.forEach((v, i) => exact(result?.[i], v, `${label}[${i}]`));
    }
  };
  for (const trace of inspectFormulaBankDirectory().traces.filter((t) => !t.counterexample && t.expected && !t.advisory)) {
    for (const [key, value] of Object.entries(trace.expected)) {
      exact(trace.result?.[key], value, `${trace.formulaId}:${trace.exampleName} expected.${key}`);
    }
  }
});

// gates-foundry-11: research banks execute advisorily — reported, never certified.
test('research banks execute advisorily: reported, never certified', async () => {
  const fs = await import('node:fs');
  const os = await import('node:os');
  const path = await import('node:path');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gate-adv-'));
  try {
    fs.writeFileSync(path.join(dir, 'r.json'), JSON.stringify({
      schema: 'yuri.math.formula-bank.v0', id: 'research-probe', version: '0.1.0', promotionStatus: 'research', advisoryOnly: true,
      formulas: [{
        id: 'shannon-entropy', notation: 'H', purpose: 'probe', proofObligations: ['x'],
        workedExamples: [{ name: 'wrong', input: { probabilities: [0.5, 0.5], base: 2 }, expected: { entropy: 9 }, interpretation: 'deliberately wrong' }],
      }],
    }));
    const r = inspectFormulaBankDirectory(dir);
    assert.equal(r.ok, true); // advisory failures never block
    assert.equal(r.traces.filter((t) => t.advisory).length, 1);
    assert.equal(r.banks[0].executableExamples, 0); // certification counts stay promoted-only
    assert.equal(r.warnings.filter((w) => /ADVISORY example fails/.test(w)).length, 1);
    // total = the pre-existing fixture-binding warning + the advisory failure.
    assert.equal(r.warnings.length, 2);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
