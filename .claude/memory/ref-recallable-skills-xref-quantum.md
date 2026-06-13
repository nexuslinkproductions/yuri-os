---
name: ref-recallable-skills-xref-quantum
description: "Two recallable skills built 2026-06-13 to make GROUND + SIMULATE reflexive: cross-reference-navigation (/xref) wraps the upgraded fused xref-query; quantum-hypothesis-simulation (/quantum-sim) wraps the quantum order-effect tracker (now @capability-registered)"
metadata:
  node_type: memory
  type: reference
  tier: hot
  scope: claude-behavioral
  trig:
    - xref
    - quantum sim
    - skill
    - navigation
    - simulation
    - order effect
    - capability
  refs:
    - feedback-simulate-plan-refine-before-build
    - feedback-affine-objective-enumerate-corners
    - ref-mimo-pipe-artifact
  type: reference
  originSessionId: edb85ed5-bc21-4594-8321-aebf593bc5a1
---

FACTS:
- cross-reference-navigation skill --invoke--> /xref (commands/xref.md) --wraps--> `_SYSTEM/Scripts/xref-query.mjs` (fused FTS5+graph+GitNexus+spectrum, confidence-graded; the GROUND step)
- quantum-hypothesis-simulation skill --invoke--> /quantum-sim | /qsim --wraps--> `_SYSTEM/Scripts/quantum-hypothesis-tracker.mjs` (order-dependent evidence, QQ-equality, Schmidt coupling; gate PASSED 2026-06-11, 15M-eval; the SIMULATE step for order-sensitive evidence)
- quantum-hypothesis-tracker.mjs --now-has--> @capability tags (was 0) --so--> capability-recall surfaces it by function (match 10.3 on "evidence order matters")
- decision-sim.mjs --is--> a SEPARATE unregistered robust-decision instrument (CVaR/pgdWitness/minimax-regret/info-gap/multiverse, 7/7 green) — NOT skill-ified (Marcel meant the quantum sim, not this); available to skill-ify on owner request

IMPLICATION: Before broad exploration → `/xref` (or run xref-query directly). When evidence ORDER matters / hypotheses interfere / need the cross-ref coupling criterion → `/quantum-sim`, NOT plain order-blind Bayes; its proof gate is two-sided (beat classical on order data G2 AND no spurious win on order-free controls G3). Marcel was actively improving the quantum sim 2026-06-13 → the skill doc is a snapshot; REFRESH it (signatures/methods) once he says the sim is settled. The forgotten-capability lesson repeated here (decision-sim AND quantum-tracker both lacked @capability tags → capability-recall missed them) — tag every reusable mechanism at the source.
SEE: [[feedback-simulate-plan-refine-before-build]] · [[feedback-affine-objective-enumerate-corners]] · [[ref-mimo-pipe-artifact]]
