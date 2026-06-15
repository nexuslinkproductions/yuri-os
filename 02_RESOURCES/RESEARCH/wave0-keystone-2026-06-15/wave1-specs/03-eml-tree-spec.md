# Wave-1 Spec: `eml-tree.mjs` — EML Symbolic Regression as 2nd Formula-Foundry Generator

> Build-spec for S2: depth≤4 EML symbolic regression as a 2nd generator in formula-foundry. Weight-hardening delegated to `izanagi-bridge#vertices()`. New differentiable formula-discovery organ.

## Target Path

`_SYSTEM/Scripts/math/eml-tree.mjs`

## Ground Truth (read from real files)

- **`formula-foundry.mjs`** — Core A (typing): `classifyDimension`, `dimensionsCompatible`, `catalogFormulas`, `composeCheck`, `composableTargets`. Reads existing formula-bank cards, classifies input/output dimensions, checks composition legality. Does NOT mint cards — that's the gap this spec fills.
- **`math-proof-gate.mjs`** — Core B (validation oracle): validates executable examples + deterministic proof traces for formula-bank cards.
- **`izanagi-bridge.mjs:4`** — `cornerAwareReadout(problem, configs, opts)`: robust readout with automatic corner-law guard. `vertices(paramSpace)`: enumerates 2^k corners of an uncertainty box (k ≤ 16). `flipThresholds(problem, config, opts)`: per-axis flip thresholds.
- **`izanagi-bridge.mjs:117`** — `izanagiRuling(problem, configs, opts)`: full decision ruling with BUILD/GATE/REJECT/DEFER classification.
- **`decision-sim.mjs`** — `robustScore`, `minimaxRegret`, `pgdWitness`, `makeRng`. The quantitative tier under `izanagi-bridge`.
- **`eval-processing.mjs:35`** — `mkAggregator`: streaming eval aggregator (Welford + Vitter reservoir).
- **`_SYSTEM/data/math/formula-banks/`** — Existing typed formula-bank cards (JSON). The EML generator produces cards in this same schema.
- **EML × YURI sim (3/3 pass, from 15-SYSTEM-SYNTHESIS §2):** `eml(x,y)=exp(x)−ln(y)` reconstructs the elementary basis at ~1e-15; YURI's real `confidenceDecay` is EML-expressible (4.6e-13); gradient descent recovered its `halfLife` exactly (12.0000, err 1.9e-15). → EML works on YURI formulas at shallow depth.
- **Depth-5 cliff (<1% recovery):** EML discovers shallow terms + recovers known primitives; it cannot recover the full 12-term composite (entropy/W₁ need inner-loop sums EML lacks). Adds terms, doesn't redesign.

## Interface

```js
// eml-tree.mjs — EML Symbolic Regression as 2nd Formula-Foundry Generator
// depth≤4 EML SR, weight-hardening delegated to izanagi-bridge#vertices().
// Produces formula-bank cards in the existing schema.

/**
 * EML grammar: depth≤4 binary tree over { +, -, *, /, exp, ln, pow(·,2), sqrt }.
 * Terminals: { x0..xn, constants in [0.1, 10] }.
 * Returns a random EML tree (for seeding the generator).
 */
export function randomTree(nVars, maxDepth = 4)  // -> { expr: string, depth, nNodes }

/**
 * Evaluate an EML tree against a data point { varName: value }.
 * Returns the scalar output.
 */
export function evalTree(tree, point)  // -> number

/**
 * Fit an EML tree to (X, y) data via brute-force enumeration over the grammar
 * (depth≤4 → ~10^4 candidates, tractable). Returns the best-fit tree + RMSE.
 * Uses mkAggregator for streaming eval.
 */
export function fitTree(X, y, opts = {})  // -> { tree, rmse, r2, nCandidates }

/**
 * Generate a formula-bank card from a fitted EML tree.
 * Uses formula-foundry's classifyDimension to type the output.
 * Returns a card in the existing schema, ready for proof-gate validation.
 */
export function treeToCard(tree, opts = {})  // -> { id, domain, formula, units: { inputs, output }, variables, ... }

/**
 * Harden discovered weights via izanagi-bridge#vertices().
 * Treats the weight vector as a paramSpace, enumerates corners,
 * returns the robust (CVaR-optimal) weight assignment.
 * Delegates to cornerAwareReadout internally.
 */
export function hardenWeights(tree, paramSpace, opts = {})  // -> { robustWeights, cornerLawBite, worstVertex }

/**
 * Discover candidate terms from claim-features → ΔU data.
 * EML regression from (claim features) → ΔU to surface candidate NEW energy terms
 * (e.g. an entropy×staleness interaction the hand-tuned weights miss).
 * Returns ranked candidate terms with dimensional compatibility check.
 */
export function discoverTerms(featureMatrix, deltaUVector, opts = {})  // -> [{ expr, rmse, dimension, compatible }]
```

## Dependencies

| Dep | Path | Why |
|---|---|---|
| `classifyDimension` | `formula-foundry.mjs` | Type EML output for card generation |
| `dimensionsCompatible` | `formula-foundry.mjs` | Check discovered terms are legal |
| `catalogFormulas` | `formula-foundry.mjs` | Read existing banks for seed templates |
| `validateFormulaBank` | `math-proof-gate.mjs` | Validate generated cards |
| `cornerAwareReadout` | `izanagi-bridge.mjs:4` | Weight hardening via vertex enumeration |
| `vertices` | `izanagi-bridge.mjs` | Corner enumeration |
| `izanagiRuling` | `izanagi-bridge.mjs:117` | Full decision ruling for weight selection |
| `mkAggregator` | `eval-processing.mjs:35` | Streaming eval for tree fitting |
| `makeRng` | `decision-sim.mjs` | Seeded RNG for tree generation |

## DISARMED Contract

- **NO modification to `formula-foundry.mjs` or `math-proof-gate.mjs`.** `eml-tree.mjs` is a standalone generator that produces cards for the existing pipeline.
- **NO live wiring into formula-foundry's `catalogFormulas` or `composeCheck`.** The EML generator is callable but not called by any hot path.
- **NO write to `_SYSTEM/data/math/formula-banks/`.** Generated cards are returned in-memory; promotion to the bank dir is OWNER-GATED.
- **Weight hardening via `izanagi-bridge#vertices()` is advisory** — the robust weights are returned but not applied to any live gate.
- **Arming** (inserting EML as a 2nd generator inside formula-foundry's catalog pipeline) is OWNER-GATED.

## Test Plan

File: `_SYSTEM/Scripts/math/eml-tree.test.mjs`

1. **EML reconstruction of known primitive:** `confidenceDecay(t, halfLife=12)` → EML recovers `exp(-ln(2)*t/12)` at RMSE < 1e-12 (reproducing the 3/3 sim pass).
2. **Depth-4 enumeration:** `randomTree(3, 4)` produces valid trees; `evalTree` matches manual evaluation.
3. **Fit to synthetic data:** generate y = exp(x0) - ln(x1) + noise → `fitTree` recovers the structure at R² > 0.95.
4. **Card generation:** `treeToCard` produces a valid formula-bank card (passes `validateFormulaBank`).
5. **Weight hardening:** `hardenWeights` with a 2-axis paramSpace returns robust weights + corner-law bite flag.
6. **Term discovery:** `discoverTerms` on synthetic feature→ΔU data surfaces the true generative term in top-3.
7. **Dimensional compatibility:** discovered terms are checked against `dimensionsCompatible` — mismatched terms are flagged, not silently accepted.
8. **Depth-5 cliff:** `fitTree` on a depth-5 target (requires inner-loop sum) fails gracefully (R² < 0.5, warning emitted).

## Ordered-Roadmap Note

Wave-1 builds the EML generator as a standalone module. Wave-2 runs the EML calibration/term-discovery sims (deepseek's Sim 2/3): EML vertex pre-filter vs brute-force enumeration; EML regression from claim-features→ΔU to surface candidate new energy terms. Wave-3 wires EML as a 2nd generator inside formula-foundry's catalog pipeline (owner-gated). The depth-5 cliff is a documented limitation — EML adds terms, doesn't redesign the full composite.
