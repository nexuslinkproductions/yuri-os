# Algorithmic Spine

Date: 2026-05-24
advisory_only: true
local_truth_claim: false

## Principle

Algorithms are not utility functions here. They are operating modes for YURI.

Every plan, memory traversal, route decision, formula search, and task dependency graph can be modeled as graph structure plus a cost function. YURI's intelligence improves when the cost function is explicit, testable, and corrigible.

## V1 Primitives

| Primitive | Role | Runtime Status |
|---|---|---|
| Entropy | Measure uncertainty | Implemented in `math-kernel.mjs` |
| KL divergence | Measure distribution shift | Implemented in `math-kernel.mjs` |
| Cross-entropy | Measure prediction/target mismatch | Implemented in `math-kernel.mjs` |
| Confidence decay | Model memory confidence over time | Implemented in `math-kernel.mjs` |
| Dijkstra | Complete non-negative shortest path baseline | Implemented in `math-kernel.mjs` |
| A* | Heuristic shortest path search | Implemented in `math-kernel.mjs` |
| Topological sort | Task dependency ordering | Implemented in `math-kernel.mjs` |

## Deferred Primitives

| Primitive | Reason Deferred |
|---|---|
| Bellman-Ford | Needed for negative-cost business/finance graphs, but v1 starts with non-negative proofable paths |
| MCTS | Useful for long-horizon search, but requires rollout policy, budget control, and stochastic determinism policy |
| Learned heuristics | Strong future track, but v1 must first prove baseline heuristics |
| EML formula-space A* | Valuable, but requires EML parser, numeric domain policy, and symbolic validation |

## Operational Mapping

- Dijkstra is discovery mode: use when no reliable direction signal exists.
- A* is performance mode: use when a heuristic is admissible or explicitly advisory.
- Topological sort is dependency mode: use when a plan is a DAG.
- Entropy is uncertainty mode: use when YURI must know whether a distribution is sharp or diffuse.
- KL divergence is correction mode: use when comparing prediction to verified outcome.
- Confidence decay is memory-aging mode: use when old evidence should lose weight without disappearing.

## Proof Obligations

Algorithms promoted into runtime must declare:

- input shape
- complexity class
- resource bounds
- correctness assumptions
- failure mode
- deterministic output envelope
- test fixture coverage

This is how YURI turns algorithms from opaque code into reusable mathematical artifacts.
