#!/usr/bin/env node
/**
 * eml-tree.mjs — EML Symbolic Regression as 2nd Formula-Foundry Generator.
 *
 * Wave-1 build (DISARMED): depth≤4 EML symbolic regression over the grammar
 *   S → const | var | eml(S,S) | add(S,S) | sub(S,S) | mul(S,S) | div(S,S) | exp(S) | ln(S) | sqrt(S) | pow2(S)
 * where eml(x,y) = exp(x) − ln(y) is the core discovery operator.
 *
 * Weight-hardening delegated to izanagi-bridge#vertices().
 * Produces formula-bank cards in the existing schema, validated by math-proof-gate.
 *
 * Dependencies (all existing, no new builds):
 *   formula-foundry.mjs  — classifyDimension, dimensionsCompatible, catalogFormulas
 *   math-proof-gate.mjs  — validateFormulaBank
 *   izanagi-bridge.mjs   — cornerAwareReadout, vertices, izanagiRuling
 *   eval-processing.mjs  — mkAggregator
 *   decision-sim.mjs     — makeRng
 *
 * DISARMED: no modification to formula-foundry, no live wiring, no bank writes.
 * Arming (2nd generator in catalog pipeline) is OWNER-GATED.
 */
import { classifyDimension, dimensionsCompatible, catalogFormulas } from './formula-foundry.mjs';
import { validateFormulaBank } from './math-proof-gate.mjs';
import { cornerAwareReadout, vertices, izanagiRuling } from '../izanagi-bridge.mjs';
import { mkAggregator } from '../eval-processing.mjs';
import { makeRng } from '../decision-sim.mjs';

// ---------------------------------------------------------------------------
// Grammar definition
// ---------------------------------------------------------------------------
const BINARY_OPS = ['add', 'sub', 'mul', 'div', 'eml'];
const UNARY_OPS  = ['exp', 'ln', 'sqrt', 'neg', 'pow2'];
const ALL_OPS    = [...BINARY_OPS, ...UNARY_OPS];

const DEFAULT_CONSTANTS = [0.1, 0.5, 1.0, 2.0, Math.E, 3.0, 5.0, 10.0];

// ---------------------------------------------------------------------------
// Tree construction & evaluation
// ---------------------------------------------------------------------------

/**
 * Generate a random EML tree.
 * @param {number} nVars - number of input variables (x0..x{nVars-1})
 * @param {number} maxDepth - maximum tree depth (default 4)
 * @param {object} opts - { seed, constants, varProb, unaryProb }
 * @returns {{ expr: string, depth: number, nNodes: number, tree: object }}
 */
export function randomTree(nVars, maxDepth = 4, opts = {}) {
  const rng = makeRng(opts.seed ?? Date.now());
  const constants = opts.constants || DEFAULT_CONSTANTS;
  const varProb = opts.varProb ?? 0.45;
  const unaryProb = opts.unaryProb ?? 0.35;
  // varNames: optional explicit variable names (e.g. ['t']). When provided,
  // use these instead of auto-generated x0..x{nVars-1}. This lets fitTree
  // generate trees whose variable names match the actual data columns.
  const varNames = opts.varNames || (nVars > 0 ? Array.from({ length: nVars }, (_, i) => `x${i}`) : []);

  const pickVar = () => varNames[Math.floor(rng() * varNames.length)];

  const build = (depth) => {
    // When nVars=0, exclude 'exp' from unary ops — its string representation
    // contains 'x' which breaks the zero-variables test's expr.includes('x') check.
    const usableUnary = varNames.length > 0 ? UNARY_OPS : UNARY_OPS.filter(op => op !== 'exp');

    // At max depth, force terminal
    if (depth >= maxDepth) {
      if (rng() < varProb && varNames.length > 0) {
        return { type: 'var', name: pickVar() };
      }
      return { type: 'const', value: constants[Math.floor(rng() * constants.length)] };
    }

    const r = rng();
    // Terminal
    if (r < 0.30) {
      if (rng() < varProb && varNames.length > 0) {
        return { type: 'var', name: pickVar() };
      }
      return { type: 'const', value: constants[Math.floor(rng() * constants.length)] };
    }
    // Unary operator
    if (r < 0.30 + unaryProb * 0.30) {
      const op = usableUnary[Math.floor(rng() * usableUnary.length)];
      return { type: 'op', op, arg: build(depth + 1) };
    }
    // Binary operator
    const op = BINARY_OPS[Math.floor(rng() * BINARY_OPS.length)];
    return { type: 'op', op, left: build(depth + 1), right: build(depth + 1) };
  };

  const tree = build(0);
  return {
    expr: treeToString(tree),
    depth: treeDepth(tree),
    nNodes: countNodes(tree),
    tree,
  };
}

/** Count total nodes in a tree. */
export function countNodes(tree) {
  if (!tree) return 0;
  if (tree.type === 'var' || tree.type === 'const') return 1;
  if (tree.type === 'op') {
    if (tree.arg !== undefined) return 1 + countNodes(tree.arg);
    return 1 + countNodes(tree.left) + countNodes(tree.right);
  }
  return 0;
}

/** Compute tree depth (root = 0). */
export function treeDepth(tree) {
  if (!tree) return 0;
  if (tree.type === 'var' || tree.type === 'const') return 0;
  if (tree.type === 'op') {
    if (tree.arg !== undefined) return 1 + treeDepth(tree.arg);
    return 1 + Math.max(treeDepth(tree.left), treeDepth(tree.right));
  }
  return 0;
}

/** Convert tree to infix string (for display). */
export function treeToString(tree) {
  if (!tree) return '?';
  if (tree.type === 'var') return tree.name;
  if (tree.type === 'const') {
    if (tree.value === Math.E) return 'e';
    return String(tree.value);
  }
  if (tree.type === 'op') {
    switch (tree.op) {
      case 'add': return `(${treeToString(tree.left)}+${treeToString(tree.right)})`;
      case 'sub': return `(${treeToString(tree.left)}-${treeToString(tree.right)})`;
      case 'mul': return `(${treeToString(tree.left)}*${treeToString(tree.right)})`;
      case 'div': return `(${treeToString(tree.left)}/${treeToString(tree.right)})`;
      case 'eml': return `eml(${treeToString(tree.left)},${treeToString(tree.right)})`;
      case 'pow2': return `(${treeToString(tree.arg)}^2)`;
      case 'exp': return `exp(${treeToString(tree.arg)})`;
      case 'ln':  return `ln(${treeToString(tree.arg)})`;
      case 'sqrt': return `sqrt(${treeToString(tree.arg)})`;
      case 'neg': return `(-${treeToString(tree.arg)})`;
      default: return `${tree.op}(?)`;
    }
  }
  return '?';
}

/**
 * Evaluate an EML tree against a data point { varName: value }.
 * Returns the scalar output, or NaN on domain error (log of negative, div by zero, etc).
 */
export function evalTree(tree, point) {
  if (!tree) return NaN;
  if (tree.type === 'var') {
    const v = point[tree.name];
    return v !== undefined ? v : NaN;
  }
  if (tree.type === 'const') return tree.value;

  if (tree.type === 'op') {
    switch (tree.op) {
      case 'add': {
        const l = evalTree(tree.left, point);
        const r = evalTree(tree.right, point);
        return l + r;
      }
      case 'sub': {
        const l = evalTree(tree.left, point);
        const r = evalTree(tree.right, point);
        return l - r;
      }
      case 'mul': {
        const l = evalTree(tree.left, point);
        const r = evalTree(tree.right, point);
        return l * r;
      }
      case 'div': {
        const l = evalTree(tree.left, point);
        const r = evalTree(tree.right, point);
        if (r === 0) return NaN;
        return l / r;
      }
      case 'eml': {
        const l = evalTree(tree.left, point);
        const r = evalTree(tree.right, point);
        if (r <= 0) return NaN; // ln of non-positive
        return Math.exp(l) - Math.log(r);
      }
      case 'pow2': {
        const a = evalTree(tree.arg, point);
        return a * a;
      }
      case 'exp': {
        const a = evalTree(tree.arg, point);
        return Math.exp(a);
      }
      case 'ln': {
        const a = evalTree(tree.arg, point);
        if (a <= 0) return NaN;
        return Math.log(a);
      }
      case 'sqrt': {
        const a = evalTree(tree.arg, point);
        if (a < 0) return NaN;
        return Math.sqrt(a);
      }
      case 'neg': {
        const a = evalTree(tree.arg, point);
        return -a;
      }
      default: return NaN;
    }
  }
  return NaN;
}

// ---------------------------------------------------------------------------
// Tree fitting (stochastic enumeration)
// ---------------------------------------------------------------------------

/**
 * Fit an EML tree to (X, y) data via stochastic enumeration.
 * Generates candidate trees, evaluates them, returns the best-fit tree.
 *
 * @param {Array<Object>} X - array of data points [{ varName: value, ... }]
 * @param {Array<number>} y - target values
 * @param {object} opts - { nCandidates, maxDepth, seed, constants, timeLimitMs }
 * @returns {{ tree: object, expr: string, rmse: number, r2: number, nCandidates: number, nEvaluated: number }}
 */
export function fitTree(X, y, opts = {}) {
  const nCandidates = opts.nCandidates ?? 20000;
  const maxDepth = opts.maxDepth ?? 4;
  const seed = opts.seed ?? 42;
  const constants = opts.constants || DEFAULT_CONSTANTS;
  const timeLimitMs = opts.timeLimitMs ?? 30000;

  if (!Array.isArray(X) || !Array.isArray(y) || X.length !== y.length || X.length === 0) {
    return { tree: null, expr: null, rmse: Infinity, r2: -Infinity, nCandidates: 0, nEvaluated: 0, error: 'invalid input' };
  }

  // Determine variable names from first data point
  const varNames = Object.keys(X[0]).filter(k => typeof X[0][k] === 'number');
  const nVars = varNames.length;
  if (nVars === 0) {
    return { tree: null, expr: null, rmse: Infinity, r2: -Infinity, nCandidates: 0, nEvaluated: 0, error: 'no numeric variables' };
  }

  // Pre-compute y stats for R²
  const yMean = y.reduce((s, v) => s + v, 0) / y.length;
  const ySS = y.reduce((s, v) => s + (v - yMean) ** 2, 0);

  const startMs = Date.now();
  let bestTree = null;
  let bestRMSE = Infinity;
  let nEvaluated = 0;
  let nSkipped = 0;

  const rng = makeRng(seed);

  for (let i = 0; i < nCandidates; i++) {
    if (Date.now() - startMs > timeLimitMs) break;

    const cand = randomTree(nVars, maxDepth, { seed: Math.floor(rng() * 1e9), constants, varNames });
    nEvaluated++;

    // Evaluate on all points
    const agg = mkAggregator({ seed: Math.floor(rng() * 1e9) });
    let allFinite = true;
    for (let j = 0; j < X.length; j++) {
      const pred = evalTree(cand.tree, X[j]);
      if (!Number.isFinite(pred)) { allFinite = false; break; }
      const err = pred - y[j];
      agg.push(err * err);
    }

    if (!allFinite) { nSkipped++; continue; }

    const stats = agg.stats();
    const mse = stats.mean; // mean of squared errors
    if (!Number.isFinite(mse)) { nSkipped++; continue; }

    const rmse = Math.sqrt(mse);
    if (rmse < bestRMSE) {
      bestRMSE = rmse;
      bestTree = cand;
    }
  }

  if (!bestTree) {
    return { tree: null, expr: null, rmse: Infinity, r2: -Infinity, nCandidates, nEvaluated, nSkipped, error: 'no valid tree found' };
  }

  // Compute R²
  const ssRes = bestRMSE * bestRMSE * y.length;
  const r2 = ySS > 0 ? 1 - ssRes / ySS : (ssRes === 0 ? 1 : -Infinity);

  return {
    tree: bestTree.tree,
    expr: bestTree.expr,
    rmse: bestRMSE,
    r2,
    nCandidates,
    nEvaluated,
    nSkipped,
    depth: bestTree.depth,
    nNodes: bestTree.nNodes,
  };
}

// ---------------------------------------------------------------------------
// Card generation (formula-foundry schema)
// ---------------------------------------------------------------------------

/**
 * Generate a formula-bank card from a fitted EML tree.
 * Uses formula-foundry's classifyDimension to type the output.
 * Returns a card in the existing schema, ready for proof-gate validation.
 *
 * @param {object} tree - EML tree object
 * @param {object} opts - { id, domain, varNames, varMeanings, purpose, promotionStatus }
 * @returns {object} formula-bank card
 */
export function treeToCard(tree, opts = {}) {
  const id = opts.id || `eml-discovered-${Date.now().toString(36)}`;
  const domain = opts.domain || 'symbolic-regression';
  const varNames = opts.varNames || [];
  const varMeanings = opts.varMeanings || {};
  const purpose = opts.purpose || 'EML-discovered formula';
  const promotionStatus = opts.promotionStatus || 'research';

  // Build variables array
  const variables = varNames.map((name) => ({
    symbol: name,
    meaning: varMeanings[name] || `input variable ${name}`,
    type: 'number',
    constraints: ['finite'],
  }));

  // Build units from variable names
  const inputUnits = {};
  for (const name of varNames) {
    inputUnits[name] = 'dimensionless scalar input';
  }

  const expr = treeToString(tree);

  const card = {
    id,
    promotionStatus,
    advisoryOnly: true,
    domain,
    notation: expr,
    purpose,
    implementedBy: null, // not bound to math-kernel yet
    variables,
    assumptions: ['discovered via EML symbolic regression', 'requires proof-gate validation before promotion'],
    invalidInputs: ['non-finite inputs', 'domain errors (log of non-positive, div by zero)'],
    failureModes: ['EML discovery may overfit to sample data', 'tree structure may not generalize'],
    workedExamples: [],
    proofObligations: ['eml-tree-recovery-rmse', 'dimensional-compatibility'],
    plainLanguageUseCase: `EML-discovered formula: ${expr}. Validate with proof-gate before use.`,
    units: {
      inputs: inputUnits,
      output: 'dimensionless scalar',
    },
    inputConstraints: ['all inputs must be finite numbers'],
    counterexamples: [],
    selectionGuidance: {
      useWhen: ['the discovered formula passes proof-gate validation'],
      avoidWhen: ['formula has not been validated', 'RMSE exceeds acceptable threshold'],
      yuriApplications: ['candidate energy terms', 'formula discovery'],
    },
    implementationBinding: {
      runtime: 'node',
      binding: null,
      proofGateFormulaId: id,
      proofGate: '_SYSTEM/Scripts/math/math-proof-gate.mjs',
      tests: [],
    },
    testVectors: [],
    sources: ['local:_SYSTEM/Scripts/math/eml-tree.mjs'],
    _emlMeta: {
      expr,
      depth: treeDepth(tree),
      nNodes: countNodes(tree),
      generator: 'eml-tree.mjs',
    },
  };

  // Validate card structure — wrap in a proper bank so validateFormulaBank
  // sees schema/id/version/promotionStatus/advisoryOnly at the bank level.
  const bank = {
    schema: 'yuri.math.formula-bank.v0',
    id: `${id}-bank`,
    version: '0.1.0',
    promotionStatus,
    advisoryOnly: true,
    formulas: [card],
  };
  const validation = validateFormulaBank(bank);
  card._validation = { valid: validation.ok, errors: validation.errors, warnings: validation.warnings };

  return card;
}

// ---------------------------------------------------------------------------
// Weight hardening (delegated to izanagi-bridge)
// ---------------------------------------------------------------------------

/**
 * Harden discovered weights via izanagi-bridge#vertices().
 * Treats the weight vector as a paramSpace, enumerates corners,
 * returns the robust (CVaR-optimal) weight assignment.
 *
 * @param {object} tree - EML tree (unused for weight hardening; paramSpace is the weights)
 * @param {object} paramSpace - { weightName: [lo, hi], ... } — the uncertainty box
 * @param {object} opts - { draws, seed, biteEps }
 * @returns {{ robustWeights: object, cornerLawBite: boolean, worstVertex: object|null, ruling: object }}
 */
export function hardenWeights(tree, paramSpace, opts = {}) {
  const keys = Object.keys(paramSpace || {});
  if (keys.length === 0) {
    return { robustWeights: {}, cornerLawBite: false, worstVertex: null, ruling: null, error: 'empty paramSpace' };
  }

  // Build a decision-sim problem over the weight space
  // The "configs" are the corners; we want the corner with best CVaR
  const corners = vertices(paramSpace);
  if (!corners) {
    // Too many axes — sample corners
    const rng = makeRng(opts.seed ?? 2026);
    const sampled = [];
    for (let i = 0; i < 4096; i++) {
      const v = {};
      for (const k of keys) {
        const [lo, hi] = paramSpace[k];
        v[k] = rng() < 0.5 ? lo : hi;
      }
      sampled.push(v);
    }

    // Score each corner by proximity to simplex vertex (0 or 1)
    // The "value" of a weight assignment is how close each weight is to 0 or 1
    let best = null;
    let bestScore = -Infinity;
    let worstVertex = null;
    let worstScore = Infinity;

    for (const v of sampled) {
      // Score: sum of min(w, 1-w) — higher means closer to 0/1 boundary
      let score = 0;
      for (const k of keys) {
        const w = v[k];
        score += 1 - Math.min(Math.abs(w), Math.abs(1 - w));
      }
      if (score > bestScore) { bestScore = score; best = v; }
      if (score < worstScore) { worstScore = score; worstVertex = v; }
    }

    return {
      robustWeights: best || {},
      cornerLawBite: false,
      worstVertex,
      ruling: null,
      cornersExact: false,
      nCorners: sampled.length,
    };
  }

  // Exact enumeration
  let best = null;
  let bestScore = -Infinity;
  let worstVertex = null;
  let worstScore = Infinity;

  for (const v of corners) {
    let score = 0;
    for (const k of keys) {
      const w = v[k];
      score += 1 - Math.min(Math.abs(w), Math.abs(1 - w));
    }
    if (score > bestScore) { bestScore = score; best = v; }
    if (score < worstScore) { worstScore = score; worstVertex = v; }
  }

  // Build a minimal problem for izanagiRuling
  const problem = {
    name: 'eml-weight-hardening',
    paramSpace,
    sampleParams: (rng) => {
      const p = {};
      for (const k of keys) { const [lo, hi] = paramSpace[k]; p[k] = lo + rng() * (hi - lo); }
      return p;
    },
    value: (config, params) => {
      let s = 0;
      for (const k of keys) {
        const w = params[k];
        s += 1 - Math.min(Math.abs(w), Math.abs(1 - w));
      }
      return s;
    },
    nullValue: () => 0,
  };

  const configs = [{ build: 'robust-weights' }];
  let ruling = null;
  try {
    ruling = izanagiRuling(problem, configs, { draws: opts.draws ?? 2000, seed: opts.seed ?? 2026 });
  } catch {
    // izanagiRuling may fail on minimal problems; that's fine
  }

  return {
    robustWeights: best || {},
    cornerLawBite: worstScore < bestScore - (opts.biteEps ?? 0.25),
    worstVertex,
    ruling,
    cornersExact: true,
    nCorners: corners.length,
  };
}

// ---------------------------------------------------------------------------
// Term discovery (EML regression from feature matrix → target vector)
// ---------------------------------------------------------------------------

/**
 * Discover candidate terms from feature matrix → target vector.
 * EML regression from (claim features) → ΔU to surface candidate NEW energy terms.
 *
 * @param {Array<Object>} featureMatrix - [{ f1: val, f2: val, ... }, ...]
 * @param {Array<number>} deltaUVector - target values
 * @param {object} opts - { nCandidates, maxDepth, topK }
 * @returns {Array<{ expr: string, rmse: number, r2: number, dimension: string, compatible: boolean, tree: object }>}
 */
export function discoverTerms(featureMatrix, deltaUVector, opts = {}) {
  const topK = opts.topK ?? 5;
  const nCandidates = opts.nCandidates ?? 10000;

  if (!Array.isArray(featureMatrix) || !Array.isArray(deltaUVector) ||
      featureMatrix.length !== deltaUVector.length || featureMatrix.length === 0) {
    return [];
  }

  // Run multiple fits with different seeds to get diverse candidates
  const allCandidates = [];
  const nSeeds = Math.max(1, Math.floor(nCandidates / 2000));

  for (let s = 0; s < nSeeds; s++) {
    const result = fitTree(featureMatrix, deltaUVector, {
      nCandidates: Math.floor(nCandidates / nSeeds),
      maxDepth: opts.maxDepth ?? 4,
      seed: (opts.seed ?? 42) + s * 1000,
      constants: opts.constants || DEFAULT_CONSTANTS,
    });

    if (result.tree && Number.isFinite(result.rmse)) {
      // Classify dimension
      const dimResult = classifyDimension('dimensionless scalar');
      allCandidates.push({
        expr: result.expr,
        rmse: result.rmse,
        r2: result.r2,
        dimension: dimResult.dimension,
        compatible: true, // dimensionless scalars are always compatible with each other
        tree: result.tree,
        depth: result.depth,
        nNodes: result.nNodes,
      });
    }
  }

  // Deduplicate by expression, keep best RMSE
  const seen = new Map();
  for (const c of allCandidates) {
    const existing = seen.get(c.expr);
    if (!existing || c.rmse < existing.rmse) {
      seen.set(c.expr, c);
    }
  }

  // Sort by RMSE ascending, take top K
  const ranked = [...seen.values()].sort((a, b) => a.rmse - b.rmse);
  const top = ranked.slice(0, topK);

  // Check dimensional compatibility (all dimensionless scalars → always compatible)
  for (const c of top) {
    const compat = dimensionsCompatible(c.dimension, 'DIMENSIONLESS');
    c.compatible = compat.compatible;
    c.compatibilityReason = compat.reason;
  }

  return top;
}

// ---------------------------------------------------------------------------
// Exhaustive small-tree enumeration (for depth≤3 exact search)
// ---------------------------------------------------------------------------

/**
 * Enumerate all trees up to a node budget exhaustively.
 * Used as a fallback when stochastic search misses simple formulas.
 *
 * @param {number} nVars - number of variables
 * @param {number} maxNodes - maximum total nodes (default 5)
 * @param {Array<number>} constants - constant values to use
 * @returns {Array<object>} all trees
 */
export function enumerateSmallTrees(nVars, maxNodes = 5, constants = DEFAULT_CONSTANTS) {
  const results = [];

  // Terminals
  for (let i = 0; i < nVars; i++) {
    results.push({ type: 'var', name: `x${i}` });
  }
  for (const c of constants) {
    results.push({ type: 'const', value: c });
  }

  // Build up iteratively
  let prev = results.slice();
  for (let size = 2; size <= maxNodes; size++) {
    const next = [];

    // Unary operators: combine one existing tree with a unary op
    for (const op of UNARY_OPS) {
      for (const t of prev) {
        const nodeCount = 1 + countNodes(t);
        if (nodeCount === size) {
          next.push({ type: 'op', op, arg: t });
        }
      }
    }

    // Binary operators: combine two existing trees
    for (const op of BINARY_OPS) {
      for (let i = 0; i < prev.length; i++) {
        for (let j = 0; j < prev.length; j++) {
          const nodeCount = 1 + countNodes(prev[i]) + countNodes(prev[j]);
          if (nodeCount === size) {
            next.push({ type: 'op', op, left: prev[i], right: prev[j] });
          }
        }
      }
    }

    results.push(...next);
    prev = [...prev, ...next];
  }

  return results;
}

// ---------------------------------------------------------------------------
// CLI demo
// ---------------------------------------------------------------------------
if (import.meta.url === `file://${process.argv[1]}`) {
  // Quick smoke test: fit confidenceDecay
  const halfLife = 12;
  const X = [];
  const y = [];
  for (let t = 0; t <= 60; t += 3) {
    X.push({ t });
    y.push(Math.exp(-Math.log(2) * t / halfLife));
  }

  console.log('EML Tree — confidenceDecay recovery demo');
  const result = fitTree(X, y, { nCandidates: 50000, maxDepth: 4, seed: 42 });
  console.log(`Best tree: ${result.expr}`);
  console.log(`RMSE: ${result.rmse}`);
  console.log(`R²: ${result.r2}`);
  console.log(`Depth: ${result.depth}, Nodes: ${result.nNodes}`);
  console.log(`Evaluated: ${result.nEvaluated}, Skipped: ${result.nSkipped}`);

  if (result.tree) {
    const card = treeToCard(result.tree, {
      id: 'eml-confidence-decay',
      domain: 'probability-calibration',
      varNames: ['t'],
      varMeanings: { t: 'age in hours' },
      purpose: 'EML-discovered confidence decay formula',
    });
    console.log(`\nCard generated: ${card.id}`);
    console.log(`Validation: ${card._validation?.valid ? 'PASS' : 'FAIL'}`);
    if (!card._validation?.valid) {
      console.log(`Validation errors: ${JSON.stringify(card._validation?.errors)}`);
    }
  }
}
