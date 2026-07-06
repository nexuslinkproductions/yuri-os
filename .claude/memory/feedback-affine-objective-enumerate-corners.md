---
name: feedback-affine-objective-enumerate-corners
description: "For affine/multilinear objectives over a simplex/box, the worst case is at a CORNER — enumerate vertices deterministically; random interior (Dirichlet/MC) sampling hits vertices with probability zero and HIDES flips"
metadata: 
  node_type: memory
  type: feedback
  tier: working
  scope: simulation-method
  trig: 
    - worst case
    - robustness
    - weight simplex
    - monte carlo
    - dirichlet
    - decision sim
    - margin flip
    - sensitivity sweep
  refs: 
    - proj-prose-claim-extractor-3b-2026-06-13
    - feedback-adversarial-persona-attack-loop
  originSessionId: d0121710-5fe7-4681-801a-e863c3393975
---

RULE: when searching for the worst case (min margin, max regret) of an objective that is AFFINE in a probability-simplex variable (e.g. decision weights) or MULTILINEAR over a box (independent scalar uncertainties), the extremum is at a CORNER — a simplex VERTEX × box-corner. Enumerate the corners deterministically. Do NOT Monte-Carlo / Dirichlet-sample the interior to find it.

WHEN: any robust-decision sim, sensitivity sweep, or "does X ever lose to NULL?" search over weights/uncertainties (decision-sim.mjs, wave3-decision.mjs, energy-weight calibration, any CVaR/minimax/info-gap analysis).

DO:
- Test affinity first: `margin(½·a + ½·b) == ½·(margin(a)+margin(b))` exactly → affine → vertices are the extrema.
- Enumerate: simplex vertices = the unit basis vectors [1,0,…],…,[0,…,1]; box corners = the cartesian product of each axis's {lo,hi}. Evaluate the cross product.
- Keep a random pass too if the objective is NONlinear in the interior, but never rely on it ALONE for an affine/multilinear one.

DONT: report a random-Dirichlet/uniform interior search as "the true worst case" for an affine objective — Dirichlet(1) draws are interior with probability 1, so a pure vertex (where the flip lives) is sampled with probability ZERO. This produces a falsely optimistic worst.

WHY: I did exactly this — used a 120k random-Dirichlet joint search to "refute" a correct round-2 finding (a −0.026 margin flip at weight-vertex [0,0,0,0,1]), reported +0.032, and declared no flip. The margin was affine in weights; my search structurally could not see the vertex. An independent Codex lane (gpt-5.5 xhigh) caught it. "Verified live" is only as good as the sampling method.

SEE: [[proj-prose-claim-extractor-3b-2026-06-13]] (R2-E) · `_SYSTEM/Scripts/wave3-decision.mjs` honesty() · `_SYSTEM/Scripts/wave3-decision.test.mjs`
