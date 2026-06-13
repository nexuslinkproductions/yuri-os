---
name: feedback-refactoring-authorized-method
description: "Refactoring is an authorized autonomous task type (when it improves the system); method = cross-reference + quantum/Izanagi simulation + agent fan-out ≤16 + creativity"
metadata:
  node_type: memory
  type: feedback
  tier: hot
  scope: claude-behavioral
  trig:
    - refactor
    - refactoring
    - improve the system
    - spawn agents
    - quantum simulation
    - cross reference refactor
    - autonomous
  refs:
    - feedback-simulate-plan-refine-before-build
    - feedback-fanout-self-size
    - feedback-research-via-mimo-lane
    - cross-reference-engine
  type: feedback
  originSessionId: edb85ed5-bc21-4594-8321-aebf593bc5a1
---

RULE: in autonomous mode, REFACTORING is an authorized task type to actively look for — not just new builds — as long as the refactor demonstrably IMPROVES the system. The refactoring method is mandatory.
WHEN: any autonomous/free-roam cycle. Refactor targets: duplication, dead/unused code, over-complex functions, drift/inconsistency, accretion from prior cycles.
DO: (1) CROSS-REFERENCE first — map every site + the blast radius via `xref-query.mjs` / `propagation-scan.mjs` / gitnexus before touching anything (a refactor that misses a call site breaks silently). (2) QUANTUM/IZANAGI SIMULATION — generate 3+ genuinely divergent refactor SEQUENCES/possibilities, score each by EV × reversibility × blast-radius, commit to the highest-value with a recorded rationale; "get real creative" — explore non-obvious sequences, not just the first clean path. (3) May SPAWN OWN AGENTS to scout/execute in parallel — HARD CAP 16 concurrent (Marcel 2026-06-13), sonnet-pinned for cost (see [[feedback-research-via-mimo-lane]]). (4) Then the standard order of operations: build → self-verify → red-team → mutation-test → log. Use coverage (test/usage) to find weak spots worth refactoring.
DONT: refactor without cross-referencing the full impact first; pick the first sequence without simulating alternatives; exceed 16 concurrent agents; touch governed surfaces (energy/security/safety-gate/registry-DATA) or commit without owner nod; "refactor" something that doesn't actually improve the system (churn ≠ improvement).
WHY: Marcel expanded the autonomous mandate (2026-06-13): "you may also spawn your own agents… dont exceed a spawn of 16 at once. your tasks you should look out for include refactoring… as long as it improves the system. for refactoring always use crossreferencing and quantum calculation simulations for more sequences and possibilities. get real creative." Pairs with the cross-reference engine being built this run — refactoring is its first real consumer.
SEE: [[feedback-simulate-plan-refine-before-build]] · [[feedback-fanout-self-size]] · [[cross-reference-engine]]
