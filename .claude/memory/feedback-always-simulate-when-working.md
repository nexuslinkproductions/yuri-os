---
name: feedback-always-simulate-when-working
description: "STANDING MANDATE — every non-trivial work cycle runs quantum-sim + simulation + calculation + prediction, not optional"
metadata: 
  node_type: memory
  type: feedback
  tier: binding
  scope: all-work
  trig: 
    - planning
    - building
    - verifying
    - deciding
    - reviewing-peer-output
    - any fork-or-claim
  refs: 
    - ref-simulation-arsenal
    - proj-canonical-memory-store-2026-06-14
  originSessionId: 27e6476f-e479-4e3a-a38a-a94ec10b4c86
---

RULE: Every non-trivial work cycle MUST include — quantum simulation + simulation + calculation + prediction. Not "when it seems relevant," not optional. Marcel (2026-06-14): "we always have to run quantum simulations, simulations and calculations as well as predictions when we work. the progress we are able to make with this is substantial and speeds up the entire work we do at a literal calculated precision."

WHEN: any planning, build, verification, decision between options, or review of peer output — anything with a fork or a claim.

DO:
- quantum-sim → `quantum-hypothesis-tracker.mjs`: order-effect (`qqEquality`/`measureSequential`) when evidence is sequential; Schmidt coupling (`schmidtDecomposition`) when judging whether two mechanisms are genuinely linked.
- simulation → `decision-sim.mjs` (robust CVaR / pgdWitness / minimax-regret) for choice-under-uncertainty; `izanagi` for fast 3-branch "should I even branch."
- calculation → exact local math; for any affine/multilinear objective over a simplex/box enumerate CORNERS (don't Monte-Carlo the interior — corner-law).
- prediction → log a falsifiable forecast to the prediction-ledger BEFORE acting; close it against outcome after.
- Run as throwaway node harnesses (`/tmp/*.mjs`) — deterministic local compute, near-zero of MY (Anthropic-weekly) tokens.

DONT: skip them to "save time" — they ARE the speed-up at calculated precision. Don't assert a sim win without its gate (quantum two-sided G2+G3; corner scan over the real vertices).

WHY: cheap deterministic compute catches what prose reasoning misses — order-effects, extremal-corner flips, genuine-vs-cosmetic coupling. Evidence it works: quantum-sim CAUGHT a real order-dependent retract bug a parallel session shipped (commit bf1e2a5a, fold-commutativity). Converts open-loop guessing into measured precision.

SEE: [[ref-simulation-arsenal]] · quantum-hypothesis-simulation skill · [[proj-canonical-memory-store-2026-06-14]]
