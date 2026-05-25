---
title: General Math Hardening Plan
date: 2026-05-25
advisory_only: true
local_truth_claim: false
promotion_status: active-plan
---

# General Math Hardening Plan

## Correction

The mathematical operating substrate is not domain-specific. The hardening path is
general-purpose mathematics for YURI operations. Any domain-specific fixture must stay
outside the foundational substrate unless separately validated and promoted.

## Immediate Hardening Slice

The next professional step is to deepen the core with deterministic primitives that
support general reasoning:

- Vector geometry: dot product, p-norm, cosine similarity.
- Weighted statistics: weighted mean, weighted variance, weighted standard deviation.
- Probability calibration: Brier score and log loss.
- Bayesian reasoning: binary Bayes update.
- Decision primitives: expected value.
- Routing/scoring support: softmax and logarithmic scaling.

These are small enough to verify, broad enough to be useful, and foundational enough
to support future adapters.

## Formula Banks

Add richer formula banks for:

- `probability-calibration`: Brier score, log loss, Bayes update, softmax.
- `vector-geometry`: dot product, p-norm, cosine similarity.
- `scoring-normalization`: weighted mean, weighted variance, expected value, log scale.

Each card must include variables, assumptions, invalid inputs, failure modes, worked
examples, implementation pointer, and proof obligations.

## Visual Proof Lab Path

The visual lab should expand beyond pathfinding:

- Distribution evolution plot for Bayesian update.
- Reliability/calibration plot for predicted probabilities.
- Vector geometry view for cosine similarity and clustering.
- Optimization contour trace for solver behavior.
- Constraint graph view for scheduling and dependency problems.

The first production-quality visual lab should remain read-only and fixture-driven.

## Adapter Roadmap

1. NetworkX adapter for graph baseline comparison.
2. SymPy adapter for symbolic simplification and exact expression checks.
3. NumPy/SciPy adapter for linear algebra and optimization.
4. OR-Tools adapter for scheduling and constraint solving.
5. Z3 adapter for satisfiability checks.
6. Lean adapter for long-term formal proof objects.

## Gate Policy

Hypotheses should be preserved. Trust should be gated.

- Output rail marks missing evidence as advisory, not discarded.
- Runtime truth still requires local tests and evidence hashes.
- Adapter outputs cannot write runtime truth directly.
- Formula promotion requires examples and deterministic tests.
- Stale, ambiguous, or contradicted formulas are quarantined.

## Proof-Gate Slice

The current implementation target is the bridge between "formula exists" and
"formula can be used correctly in an operating situation."

- Validate promoted formula-bank structure.
- Require per-formula promotion status and advisory boundary.
- Resolve `implementedBy` into a local kernel binding.
- Execute every promoted worked example.
- Compare actual output with expected output.
- Emit deterministic proof traces with input, formula, and result hashes.
- Feed proof trace counts into `math-health`.

## Success Criteria

- YURI can map an operating situation to variables and formulas.
- Formula cards explain when a formula applies and when it does not.
- Core primitives reject invalid input instead of hiding instability.
- Math health proves graph, probability, scoring, and vector primitives.
- External tools expand capability without becoming authority by default.
