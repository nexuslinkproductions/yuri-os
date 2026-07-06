#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as kernel from './math-kernel.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../../..');
const FORMULA_BANK_DIR = path.join(REPO_ROOT, '_SYSTEM/data/math/formula-banks');
const TRACE_SCHEMA = 'yuri.math.proof-trace.v0';
const FORMULA_BANK_SCHEMA = 'yuri.math.formula-bank.v0';
const ALLOWED_PROMOTION_STATES = new Set(['research', 'verified-baseline', 'stable', 'quarantined', 'fixture']);
const PROMOTED_STATES = new Set(['verified-baseline', 'stable']);
const EPSILON = 1e-12;

// @capability: math-proof-gate
// @serves: promote a formula from advisory to proven | held-out validation oracle | counterexample search | proof gate for math | bind a symbol with a worked example
// @does: the math proof gate — validateFormulaBank, runFormulaProofGate, runFormulaCounterexample, inspectFormulaBankDirectory; a held-out executable validation oracle gating a formula advisory→fact
// @use: before a generated/derived formula or sim finding touches a live organ, run it through the proof gate (the domain-blind promotion bar); pairs with formula-foundry (propose) and the quantum G1–G4 gate
// @exports: ProofGateError, inspectFormulaBankDirectory, validateFormulaBank, runFormulaProofGate, runFormulaCounterexample
export class ProofGateError extends Error {
  constructor(message, trace = null) {
    super(message);
    this.name = 'ProofGateError';
    this.trace = trace;
  }
}

const FORMULA_IMPLEMENTATIONS = {
  'shannon-entropy': {
    kernelFn: kernel.entropy,
    invoke: (input) => ({ entropy: kernel.entropy(input.probabilities, { base: input.base }) }),
  },
  'kl-divergence': {
    kernelFn: kernel.klDivergence,
    invoke: (input) => ({ divergence: kernel.klDivergence(input.p, input.q, { base: input.base }) }),
  },
  'cross-entropy': {
    kernelFn: kernel.crossEntropy,
    invoke: (input) => ({ crossEntropy: kernel.crossEntropy(input.p, input.q, { base: input.base }) }),
  },
  'information-gain': {
    kernelFn: kernel.informationGain,
    invoke: (input) => ({ gain: kernel.informationGain(input.before, input.after, { base: input.base }) }),
  },
  'astar-evaluation': {
    kernelFn: kernel.astar,
    invoke: (input) => {
      const fixture = loadFixture(input.fixture);
      const result = kernel.astar(fixture.graph, fixture.source, fixture.target, fixture.heuristic, { strict: true });
      return { path: result.path, cost: result.cost };
    },
  },
  'dijkstra-relaxation': {
    kernelFn: kernel.dijkstra,
    invoke: (input) => {
      const fixture = loadFixture(input.fixture);
      const result = kernel.dijkstra(fixture.graph, fixture.source, fixture.target);
      return { path: result.path, cost: result.cost };
    },
  },
  'topological-dependency-order': {
    kernelFn: kernel.topologicalSort,
    invoke: (input) => {
      const edges = (input.edges || []).map((edge) => Array.isArray(edge) ? { from: edge[0], to: edge[1] } : edge);
      return { order: kernel.topologicalSort({ nodes: input.nodes, edges }).order };
    },
  },
  'brier-score': {
    kernelFn: kernel.brierScore,
    invoke: (input) => ({ score: kernel.brierScore(input.predictions, input.outcomes) }),
  },
  'log-loss': {
    kernelFn: kernel.logLoss,
    invoke: (input) => ({ loss: kernel.logLoss(input.predictions, input.outcomes, { epsilon: input.epsilon }) }),
  },
  'bayes-update': {
    kernelFn: kernel.bayesUpdate,
    invoke: (input) => ({ posterior: kernel.bayesUpdate(input) }),
  },
  softmax: {
    kernelFn: kernel.softmax,
    invoke: (input) => ({ distribution: kernel.softmax(input.values, { temperature: input.temperature }) }),
  },
  'weighted-mean': {
    kernelFn: kernel.weightedMean,
    invoke: (input) => ({ mean: kernel.weightedMean(input.values, input.weights) }),
  },
  'weighted-variance': {
    kernelFn: kernel.weightedVariance,
    invoke: (input) => ({ variance: kernel.weightedVariance(input.values, input.weights) }),
  },
  'weighted-std-dev': {
    kernelFn: kernel.weightedStdDev,
    invoke: (input) => ({ stdDev: kernel.weightedStdDev(input.values, input.weights) }),
  },
  'expected-value': {
    kernelFn: kernel.expectedValue,
    invoke: (input) => ({ value: kernel.expectedValue(input.values, input.probabilities) }),
  },
  'log-scale': {
    kernelFn: kernel.logScale,
    invoke: (input) => ({ score: kernel.logScale(input.value, input.min, input.max, input.points) }),
  },
  'dot-product': {
    kernelFn: kernel.dotProduct,
    invoke: (input) => ({ value: kernel.dotProduct(input.left, input.right) }),
  },
  'p-norm': {
    kernelFn: kernel.pNorm,
    invoke: (input) => ({ value: kernel.pNorm(input.values, input.p) }),
  },
  'cosine-similarity': {
    kernelFn: kernel.cosineSimilarity,
    invoke: (input) => ({ similarity: kernel.cosineSimilarity(input.left, input.right) }),
  },
  'confidence-decay': {
    kernelFn: kernel.confidenceDecay,
    invoke: (input) => ({ decay: kernel.confidenceDecay(input) }),
  },
};

export function inspectFormulaBankDirectory(bankDir = FORMULA_BANK_DIR) {
  const errors = [];
  const warnings = [];
  const traces = [];
  const banks = [];

  if (!existsSync(bankDir)) {
    return { ok: false, errors: [`formula bank directory missing: ${rel(bankDir)}`], warnings, banks, traces };
  }

  for (const file of readdirSync(bankDir).filter((entry) => entry.endsWith('.json')).sort()) {
    const fullPath = path.join(bankDir, file);
    const bank = readJson(fullPath);
    const validation = validateFormulaBank(bank, { file: rel(fullPath) });
    errors.push(...validation.errors);
    warnings.push(...validation.warnings);

    const bankSummary = {
      id: bank.id,
      path: rel(fullPath),
      promotionStatus: bank.promotionStatus,
      advisoryOnly: bank.advisoryOnly,
      formulaCount: bank.formulas?.length || 0,
      executableExamples: 0,
      executableCounterexamples: 0,
    };

    if (validation.errors.length === 0 && PROMOTED_STATES.has(bank.promotionStatus) && bank.advisoryOnly === false) {
      for (const formula of bank.formulas || []) {
        for (const example of formula.workedExamples || []) {
          try {
            const trace = runFormulaProofGate({
              bank,
              formula,
              input: example.input,
              expected: example.expected,
              exampleName: example.name,
              mode: 'strict',
            });
            traces.push(trace);
            bankSummary.executableExamples += 1;
          } catch (error) {
            errors.push(`${file}:${formula.id}:${example.name || 'example'} ${error.message}`);
            if (error.trace) traces.push(error.trace);
          }
        }
        for (const counterexample of formula.counterexamples || []) {
          try {
            const trace = runFormulaCounterexample({
              bank,
              formula,
              input: counterexample.input,
              expectedError: counterexample.expectedError,
              exampleName: counterexample.name,
              mode: 'strict',
            });
            traces.push(trace);
            bankSummary.executableCounterexamples += 1;
          } catch (error) {
            errors.push(`${file}:${formula.id}:${counterexample.name || 'counterexample'} ${error.message}`);
            if (error.trace) traces.push(error.trace);
          }
        }
      }
      if (bankSummary.executableExamples < bankSummary.formulaCount) {
        errors.push(`${file} expected at least ${bankSummary.formulaCount} executable worked examples, got ${bankSummary.executableExamples}`);
      }
      if (bankSummary.executableCounterexamples < bankSummary.formulaCount) {
        errors.push(`${file} expected at least ${bankSummary.formulaCount} executable counterexamples, got ${bankSummary.executableCounterexamples}`);
      }
    } else if (validation.errors.length === 0) {
      // ADVISORY pass: run research/fixture/quarantined examples for
      // visibility — report, never certify. Failures land in warnings only;
      // executableExamples stays a promoted-only certification count.
      for (const formula of bank.formulas || []) {
        if (!FORMULA_IMPLEMENTATIONS[formula.id]) continue;
        for (const example of formula.workedExamples || []) {
          const trace = runFormulaProofGate({
            bank,
            formula,
            input: example.input,
            expected: example.expected,
            exampleName: example.name,
            mode: 'advisory',
          });
          trace.advisory = true;
          traces.push(trace);
          if (!trace.passed) {
            warnings.push(`${file}:${formula.id}:${example.name || 'example'} ADVISORY example fails (bank not promoted — reported, not certified)`);
          }
        }
      }
    }

    banks.push(bankSummary);
  }

  return {
    ok: errors.length === 0,
    errors,
    warnings,
    banks,
    traces,
  };
}

export function validateFormulaBank(bank, options = {}) {
  const label = options.file || bank?.id || 'formula-bank';
  const errors = [];
  const warnings = [];

  if (!bank || typeof bank !== 'object') {
    return { ok: false, errors: [`${label} must be an object`], warnings };
  }

  requireString(bank, 'schema', label, errors);
  requireString(bank, 'id', label, errors);
  requireString(bank, 'version', label, errors);
  requireString(bank, 'promotionStatus', label, errors);
  requireBoolean(bank, 'advisoryOnly', label, errors);
  if (bank.schema && bank.schema !== FORMULA_BANK_SCHEMA) errors.push(`${label} has invalid schema: ${bank.schema}`);
  if (bank.promotionStatus && !ALLOWED_PROMOTION_STATES.has(bank.promotionStatus)) {
    errors.push(`${label} has invalid promotionStatus: ${bank.promotionStatus}`);
  }
  if (!Array.isArray(bank.formulas) || bank.formulas.length === 0) errors.push(`${label} must include formulas`);

  for (const formula of bank.formulas || []) {
    validateFormulaCard(bank, formula, label, errors, warnings);
  }

  return { ok: errors.length === 0, errors, warnings };
}

export function runFormulaProofGate(options = {}) {
  const bank = options.bank || findBankForFormula(options.formulaId);
  const formula = options.formula || bank?.formulas?.find((entry) => entry.id === options.formulaId);
  if (!bank || !formula) throw new ProofGateError(`unknown formula: ${options.formulaId}`);

  const formulaImpl = FORMULA_IMPLEMENTATIONS[formula.id];
  const traceBase = buildTraceBase({ bank, formula, input: options.input, exampleName: options.exampleName });

  if (!formulaImpl) {
    const trace = { ...traceBase, passed: false, error: 'missing formula implementation binding' };
    return failOrReturn(options.mode, `missing formula implementation binding for ${formula.id}`, trace);
  }

  try {
    const result = formulaImpl.invoke(options.input || {});
    // Vacuous-pass guard sits AFTER invoke so invalid-input error paths are
    // untouched: an empty OR missing expected is a vacuous certification — the
    // gate must never stamp `passed` on a card that asserts nothing.
    const match = matchesExpected(result, options.expected);
    const trace = {
      ...traceBase,
      result,
      resultHash: sha256Stable(result),
      expected: options.expected || null,
      passed: match.ok,
      warnings: [],
    };
    if (!match.ok) {
      trace.error = match.mismatches.join('; ');
      return failOrReturn(options.mode, `formula example mismatch for ${formula.id}: ${trace.error}`, trace);
    }
    return trace;
  } catch (error) {
    const trace = {
      ...traceBase,
      result: null,
      resultHash: null,
      expected: options.expected || null,
      passed: false,
      error: error.message,
      warnings: [],
    };
    return failOrReturn(options.mode, `formula proof gate failed for ${formula.id}: ${error.message}`, trace);
  }
}

export function runFormulaCounterexample(options = {}) {
  const bank = options.bank || findBankForFormula(options.formulaId);
  const formula = options.formula || bank?.formulas?.find((entry) => entry.id === options.formulaId);
  if (!bank || !formula) throw new ProofGateError(`unknown formula: ${options.formulaId}`);

  const formulaImpl = FORMULA_IMPLEMENTATIONS[formula.id];
  const traceBase = {
    ...buildTraceBase({ bank, formula, input: options.input, exampleName: options.exampleName }),
    counterexample: true,
    expectedError: options.expectedError || null,
  };

  if (!formulaImpl) {
    const trace = { ...traceBase, passed: false, error: 'missing formula implementation binding' };
    return failOrReturn(options.mode, `missing formula implementation binding for ${formula.id}`, trace);
  }

  try {
    const result = formulaImpl.invoke(options.input || {});
    const trace = {
      ...traceBase,
      result,
      resultHash: sha256Stable(result),
      passed: false,
      error: 'counterexample unexpectedly produced a result',
      warnings: [],
    };
    return failOrReturn(options.mode, `counterexample unexpectedly passed for ${formula.id}`, trace);
  } catch (error) {
    const expected = String(options.expectedError || '').trim();
    const matched = expected ? matchesExpectedError(error.message, expected) : true;
    const trace = {
      ...traceBase,
      result: null,
      resultHash: null,
      passed: matched,
      error: error.message,
      errorMatcher: 'message-regex',
      warnings: [],
    };
    if (!matched) {
      return failOrReturn(options.mode, `counterexample error mismatch for ${formula.id}: ${error.message}`, trace);
    }
    return trace;
  }
}

function validateFormulaCard(bank, formula, label, errors, warnings) {
  if (!formula || typeof formula !== 'object') {
    errors.push(`${label} formula entry must be an object`);
    return;
  }
  const formulaLabel = `${label}:${formula.id || 'unknown-formula'}`;
  requireString(formula, 'id', label, errors);
  requireString(formula, 'notation', formulaLabel, errors);
  requireString(formula, 'purpose', formulaLabel, errors);
  requireArray(formula, 'proofObligations', formulaLabel, errors);

  if (bank.promotionStatus === 'fixture' || bank.advisoryOnly === true) {
    // A DECLARED kernel binding is a CLAIM that must hold even on the advisory/fixture path — fail closed: if a
    // card declares implementedBy=<path>#<symbol>, the symbol MUST resolve, or a fabricated binding sails through
    // preflight reporting validationOk:true (the docstring claims it resolves the symbol; it didn't). No binding
    // ⇒ legitimately inert; non-'#' / non-kernel implementedBy forms are unaffected (the resolver skips them).
    if (formula.implementedBy) assertImplementedBySymbolResolves(formula.implementedBy, formulaLabel, errors);
    if (FORMULA_IMPLEMENTATIONS[formula.id]) assertImplementedByIdentity(formula, formulaLabel, errors);
    if (formula.implementedBy || FORMULA_IMPLEMENTATIONS[formula.id]) {
      warnings.push(`${formulaLabel} fixture has executable binding but remains advisory`);
    }
    return;
  }

  requireString(formula, 'domain', formulaLabel, errors);
  requireString(formula, 'implementedBy', formulaLabel, errors);
  assertImplementedBySymbolResolves(formula.implementedBy, formulaLabel, errors);
  assertImplementedByIdentity(formula, formulaLabel, errors);
  requireArray(formula, 'variables', formulaLabel, errors);
  requireArray(formula, 'assumptions', formulaLabel, errors);
  requireArray(formula, 'invalidInputs', formulaLabel, errors);
  requireArray(formula, 'failureModes', formulaLabel, errors);
  requireArray(formula, 'workedExamples', formulaLabel, errors);
  requireArray(formula, 'counterexamples', formulaLabel, errors);
  requireString(formula, 'promotionStatus', formulaLabel, errors);
  requireBoolean(formula, 'advisoryOnly', formulaLabel, errors);

  if (formula.promotionStatus && !ALLOWED_PROMOTION_STATES.has(formula.promotionStatus)) {
    errors.push(`${formulaLabel} has invalid promotionStatus: ${formula.promotionStatus}`);
  }
  if (formula.advisoryOnly === true && PROMOTED_STATES.has(formula.promotionStatus)) {
    errors.push(`${formulaLabel} cannot be advisoryOnly while promoted`);
  }
  if (!FORMULA_IMPLEMENTATIONS[formula.id]) {
    errors.push(`${formulaLabel} has no proof-gate implementation binding`);
  }
  for (const variable of formula.variables || []) {
    if (!variable || typeof variable !== 'object') {
      errors.push(`${formulaLabel} variable must be an object`);
      continue;
    }
    requireString(variable, 'symbol', formulaLabel, errors);
    requireString(variable, 'meaning', formulaLabel, errors);
    requireString(variable, 'type', formulaLabel, errors);
    requireArray(variable, 'constraints', formulaLabel, errors);
  }
  for (const example of formula.workedExamples || []) {
    if (!example || typeof example !== 'object') {
      errors.push(`${formulaLabel} workedExample must be an object`);
      continue;
    }
    requireString(example, 'name', formulaLabel, errors);
    requireObject(example, 'input', formulaLabel, errors);
    requireNonEmptyObject(example, 'expected', formulaLabel, errors);
    requireString(example, 'interpretation', formulaLabel, errors);
  }
  for (const counterexample of formula.counterexamples || []) {
    if (!counterexample || typeof counterexample !== 'object') {
      errors.push(`${formulaLabel} counterexample must be an object`);
      continue;
    }
    requireString(counterexample, 'name', formulaLabel, errors);
    requireObject(counterexample, 'input', formulaLabel, errors);
    requireString(counterexample, 'expectedError', formulaLabel, errors);
    if (isLooseExpectedErrorPattern(counterexample.expectedError)) {
      errors.push(`${formulaLabel} counterexample ${counterexample.name || '(unnamed)'} has loose expectedError`);
    }
  }
}

function assertImplementedByIdentity(formula, formulaLabel, errors) {
  // The card's implementedBy symbol must BE the function the proof gate
  // executes (function identity, not name existence) — kills the binding
  // desync where a card documents klDivergence while the gate runs entropy.
  const impl = FORMULA_IMPLEMENTATIONS[formula.id];
  if (!impl || typeof impl.kernelFn !== 'function') return;
  const value = String(formula.implementedBy || '');
  if (!value.includes('#')) return;
  const [pathPart, symbol] = value.split('#');
  if (!pathPart.endsWith('math-kernel.mjs') || !symbol) return; // shape errors handled by the existing resolver
  if (kernel[symbol] !== impl.kernelFn) {
    errors.push(`${formulaLabel} implementedBy kernel#${symbol} is not the function the proof gate executes for ${formula.id} (binding desync)`);
  }
}

function assertImplementedBySymbolResolves(implementedBy, formulaLabel, errors) {
  // Fail-closed provenance check: when a card declares a kernel symbol via
  // '<path>#<symbol>', the symbol MUST be a real exported function of
  // math-kernel.mjs. This makes the documented kernel function load-bearing so a
  // future card-author or propagation auto-edit cannot silently desync the
  // documented function from the executed binding. Scoped to math-kernel.mjs
  // references only (the runtime); other paths (e.g. fixtures) skip the symbol check.
  if (typeof implementedBy !== 'string' || !implementedBy.includes('#')) return;
  const [pathPart, symbol] = implementedBy.split('#');
  if (!pathPart.endsWith('math-kernel.mjs')) return;
  if (!symbol || symbol.trim() === '') {
    errors.push(`${formulaLabel} implementedBy declares an empty kernel symbol after '#'`);
    return;
  }
  if (typeof kernel[symbol] !== 'function') {
    errors.push(`${formulaLabel} implementedBy declares kernel#${symbol} which is not an exported function of math-kernel.mjs`);
  }
}

function buildTraceBase({ bank, formula, input, exampleName }) {
  return {
    schema: TRACE_SCHEMA,
    bankId: bank.id,
    bankVersion: bank.version,
    formulaId: formula.id,
    formulaHash: sha256Stable({
      id: formula.id,
      notation: formula.notation,
      implementedBy: formula.implementedBy,
      variables: formula.variables || [],
      proofObligations: formula.proofObligations || [],
      promotionStatus: formula.promotionStatus || bank.promotionStatus,
      advisoryOnly: formula.advisoryOnly ?? bank.advisoryOnly,
    }),
    promotionStatus: formula.promotionStatus || bank.promotionStatus,
    advisoryOnly: formula.advisoryOnly ?? bank.advisoryOnly,
    exampleName: exampleName || null,
    input,
    inputHash: sha256Stable(input || {}),
    constraints: (formula.variables || []).map((variable) => ({
      symbol: variable.symbol,
      constraints: variable.constraints || [],
    })),
    proofObligations: formula.proofObligations || [],
  };
}

function failOrReturn(mode, message, trace) {
  if (mode === 'advisory') return trace;
  throw new ProofGateError(message, trace);
}

function matchesExpected(result, expected) {
  const entries = Object.entries(expected || {});
  if (entries.length === 0) return { ok: false, mismatches: ['vacuous expectation: no expected keys'] };
  const mismatches = [];
  for (const [key, expectedValue] of entries) {
    if (!result || typeof result !== 'object' || !(key in result)) {
      mismatches.push(`expected key '${key}' absent from result`);
      continue;
    }
    if (!deepAlmostEqual(result[key], expectedValue)) mismatches.push(`value mismatch at '${key}'`);
  }
  return { ok: mismatches.length === 0, mismatches };
}

function matchesExpectedError(message, expectedPattern) {
  try {
    return new RegExp(expectedPattern, 'i').test(String(message || ''));
  } catch {
    return String(message || '').toLowerCase().includes(String(expectedPattern || '').toLowerCase());
  }
}

function isLooseExpectedErrorPattern(value) {
  const pattern = String(value || '').trim();
  if (!pattern || pattern.length < 3) return true;
  return /^(?:\.?\*|error|invalid|fail|failed|throw|throws|exception)$/iu.test(pattern);
}

function deepAlmostEqual(left, right) {
  if (typeof left === 'number' || typeof right === 'number') {
    return typeof left === 'number' && typeof right === 'number' && Math.abs(left - right) <= EPSILON;
  }
  if (Array.isArray(left) || Array.isArray(right)) {
    if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) return false;
    return left.every((value, index) => deepAlmostEqual(value, right[index]));
  }
  if (left && typeof left === 'object' || right && typeof right === 'object') {
    if (!left || !right || typeof left !== 'object' || typeof right !== 'object') return false;
    const keys = Object.keys(right);
    return keys.every((key) => deepAlmostEqual(left[key], right[key]));
  }
  return Object.is(left, right);
}

function findBankForFormula(formulaId) {
  for (const file of readdirSync(FORMULA_BANK_DIR).filter((entry) => entry.endsWith('.json'))) {
    const bank = readJson(path.join(FORMULA_BANK_DIR, file));
    if (bank.formulas?.some((formula) => formula.id === formulaId)) return bank;
  }
  return null;
}

function loadFixture(relPath) {
  if (!relPath || typeof relPath !== 'string') throw new Error('fixture path is required');
  const fullPath = path.resolve(REPO_ROOT, relPath);
  if (!fullPath.startsWith(REPO_ROOT + path.sep)) throw new Error('fixture path must stay inside repo');
  return readJson(fullPath);
}

function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, 'utf8'));
}

function requireString(value, key, label, errors) {
  if (typeof value[key] !== 'string' || value[key].trim() === '') errors.push(`${label} missing ${key}`);
}

function requireBoolean(value, key, label, errors) {
  if (typeof value[key] !== 'boolean') errors.push(`${label} missing ${key}`);
}

function requireArray(value, key, label, errors) {
  if (!Array.isArray(value[key]) || value[key].length === 0) errors.push(`${label} missing ${key}`);
}

function requireObject(value, key, label, errors) {
  if (!value[key] || typeof value[key] !== 'object' || Array.isArray(value[key])) errors.push(`${label} missing ${key}`);
}

function requireNonEmptyObject(value, key, label, errors) {
  if (!value[key] || typeof value[key] !== 'object' || Array.isArray(value[key])) {
    errors.push(`${label} missing ${key}`);
  } else if (Object.keys(value[key]).length === 0) {
    errors.push(`${label} has empty ${key} (vacuous example)`);
  }
}

function sha256Stable(value) {
  return createHash('sha256').update(stableJson(value)).digest('hex');
}

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`;
  }
  if (typeof value === 'number' && !Number.isFinite(value)) return JSON.stringify(String(value));
  return JSON.stringify(value);
}

function rel(filePath) {
  return path.relative(REPO_ROOT, filePath).replaceAll(path.sep, '/');
}

function isCliEntrypoint() {
  return path.resolve(process.argv[1] || '') === fileURLToPath(import.meta.url);
}

if (isCliEntrypoint()) {
  const result = inspectFormulaBankDirectory();
  console.log(JSON.stringify(result, null, 2));
  if (!result.ok) process.exitCode = 1;
}
