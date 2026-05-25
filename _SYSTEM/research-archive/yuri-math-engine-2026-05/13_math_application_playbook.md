---
title: Math Application Playbook
date: 2026-05-25
advisory_only: true
local_truth_claim: false
promotion_status: active-playbook
---

# Math Application Playbook

## Purpose

This playbook turns YURI math from a bag of formulas into an operating method.
The goal is not to make every decision look mathematical. The goal is to know
when a mathematical structure is useful, how messy context becomes variables,
and when a result is strong enough to influence YURI operations.

Local truth is a promotion layer. Exploration can use external ecosystems,
Shintai hypotheses, DeepSeek synthesis, Python, NetworkX, SymPy, NumPy, future
theorem provers, WASM kernels, and symbolic-regression labs. Trusted operating
truth still requires YURI proof gates, examples, counterexamples, and local
verification.

## Translation Loop

Use this loop before applying a formula or algorithm:

1. State the operating question in plain language.
2. Decide whether the question has a mathematical object: distribution, graph,
   vector, score, probability, dependency DAG, constraint set, or optimization
   objective.
3. Map messy context into variables, units, constraints, assumptions, and
   missing data.
4. Select a formula card by purpose and selection guidance.
5. Reject invalid inputs before calculating.
6. Run the deterministic kernel or a governed external adapter.
7. Preserve proof metadata: input hash, formula id, implementation binding,
   result hash, assumptions, caveats, and warnings.
8. Interpret the result as advisory unless the formula, implementation, and use
   case are promoted.
9. Record counterexamples and failure modes when the result surprises YURI.

## Domain Selection

| Operating shape | Use | Avoid |
|---|---|---|
| Probability distribution | entropy, KL divergence, cross-entropy, softmax | raw scores with no probability meaning |
| Weighted graph | Dijkstra or A* | negative edge costs or untrusted heuristics |
| Dependency DAG | topological sort and critical path thinking | cycles that need human arbitration |
| Numeric feature vector | dot product, p-norm, cosine similarity | incompatible dimensions or missing scaling |
| Confidence forecast | Brier score, log loss, Bayes update | unverifiable outcomes or invented likelihoods |
| Mixed evidence score | weighted mean, weighted variance, log scaling | veto conditions that should not be averaged away |
| Resource schedule | dependency ordering, expected value, constraints | hidden commitments or creative judgment that cannot be reduced safely |

## Variable Mapping

Every operational math use should name:

- Variables: symbols and plain-language definitions.
- Units: probability, cost, time, score, count, vector feature, or dimensionless.
- Constraints: finite numbers, non-negative weights, equal lengths, acyclic graph,
  admissible heuristic, positive evidence mass, or valid log base.
- Assumptions: independence, comparable scales, binary hypothesis, trusted
  reference distribution, or stable edge costs.
- Invalid inputs: what must fail before a result is emitted.
- Human boundary: what the number cannot decide.

If any of those cannot be named, the result stays exploratory.

## Correct Use Checks

YURI knows a formula is being used correctly when all are true:

- The selected card's purpose matches the operating question.
- The variables match declared units and constraints.
- A worked example executes through the proof gate.
- At least one counterexample fails deterministically.
- The implementation binding resolves to a governed kernel or adapter.
- The failure modes are visible in the result envelope or report.
- The output is interpreted with its promotion status.

## Operational Examples

### Memory Ranking

Question: Which memory candidate deserves attention now?

Math shape: weighted evidence score plus information gain.

Variables:

- `recencyConfidence`: confidence decay from base confidence, age, and half-life.
- `sourceReliability`: normalized source reliability score.
- `informationGain`: entropy before minus entropy after using the memory.
- `similarity`: cosine similarity between query and memory features.

Use weighted mean only after each component is normalized and the weights are
explicit. Use weighted variance to flag disagreement among components.

Failure modes:

- stale memory gets a high score because age was not modeled
- unreliable source dominates because weights were implicit
- similarity is high but information gain is near zero

### Context Routing

Question: Which context packet or lane should handle this task?

Math shape: graph route plus score distribution.

Variables:

- nodes are context packets, adapters, or lanes
- edges are transition costs: load cost, risk, latency, or evidence distance
- heuristic is a lower-bound estimate only when it can be defended

Use Dijkstra for baseline routing. Use A* only when the heuristic is checked as
admissible. Use softmax only to inspect relative candidates, not to hide a
decision.

Failure modes:

- heuristic overestimates and prunes the right path
- costs combine incompatible units
- packet selection ignores protected surfaces

### RAG Conflict Detection

Question: Did retrieval drift away from the trusted evidence mix?

Math shape: distribution shift.

Variables:

- `p`: observed retrieval distribution by source class, topic, or claim state
- `q`: trusted baseline distribution
- `base`: log base, usually 2 for interpretability

Use KL divergence for directional drift and cross-entropy for predictive
mismatch. If `q` has zero support where `p` is positive, quarantine the case
instead of pretending the score is finite.

Failure modes:

- categories are not aligned
- zero support hides a novel but important source
- one scalar score replaces claim-level review

### Tool And Lane Routing

Question: Which tool or lane should YURI use for a bounded internal action?

Math shape: expected utility and uncertainty display.

Variables:

- outcome values are explicit utility or cost estimates
- probabilities are non-negative evidence weights
- uncertainty is shown as a distribution or variance, not buried

Use expected value for reversible, bounded choices. Use softmax to inspect
relative preference after scores are normalized. Keep owner intent and safety
gates above utility math.

Failure modes:

- tail risk is averaged away
- values are not commensurable
- model output is treated as evidence without verification

### Release Gate Scoring

Question: Is a change ready to release or promote?

Math shape: weighted evidence score plus invalid-input veto.

Variables:

- syntax/test pass rate
- proof trace count
- protected-surface result
- provenance score
- unresolved risk count

Use weighted mean for positive evidence only after hard blockers are checked.
Use weighted variance to highlight disagreement between strong tests and weak
provenance. A hard blocker stays a blocker even if the aggregate score is high.

Failure modes:

- a single score hides a failed required gate
- missing proof traces are counted as neutral instead of failing
- runtime truth is changed by an advisory adapter

### Creative Production Scheduling

Question: What order keeps creative work moving without blocking later pieces?

Math shape: dependency DAG plus critical path thinking.

Variables:

- nodes are tasks: concept, references, draft, review, render, package
- edges are prerequisites
- durations are estimates, not promises

Use topological sort to find a valid order and catch cycles. Use critical path
thinking to identify the tasks that control completion time. Preserve creative
judgment: math can expose bottlenecks, but it cannot decide taste.

Failure modes:

- cycles hide unresolved decisions
- durations are treated as precise
- creative exploration is over-constrained too early

## Visual Proof Rule

A visual proof is inspectable only when Marcel or Jan can run a command and see
artifacts:

- JSON for deterministic machine inspection
- SVG for static readable structure
- PNG for quick viewing in normal image tools
- HTML for a stitched human report

Visual proofs are lab artifacts. They do not write runtime truth. Their job is
to make an algorithm, assumption, or failure mode easy to inspect before
promotion.

## External Adapter Rule

External adapters may:

- compute candidate results
- cross-check YURI kernel outputs
- render visual proof artifacts
- search symbolic simplifications
- produce advisory reports

External adapters must not:

- write trusted runtime state directly
- bypass proof gates
- silently promote model or solver output
- read protected surfaces
- hide library/version assumptions

Promotion requires a YURI-owned formula card, deterministic examples,
counterexamples, implementation binding, test vectors, and health/release checks.

## When Not To Use Math

Do not force math when:

- the inputs cannot be named or bounded
- the decision is mostly taste, consent, ethics, or owner preference
- a hard safety rule already decides the outcome
- missing evidence would make the number decorative
- a scalar score would hide a contradiction that needs review

The professional move is sometimes to refuse the formula and write down why.
