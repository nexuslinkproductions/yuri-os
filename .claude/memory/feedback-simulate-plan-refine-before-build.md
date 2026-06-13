---
name: feedback-simulate-plan-refine-before-build
description: "In autonomous/auto build mode, run simulation + full plan + refinement (incl. mimo) BEFORE writing code — don't jump straight to Write"
metadata:
  node_type: memory
  type: feedback
  tier: hot
  scope: claude-behavioral
  trig:
    - autonomous
    - auto run
    - building yourself
    - before building
    - simulate first
    - plan before build
    - free-roam
  refs:
    - feedback-improve-loop-high-speed
    - feedback-adversarial-persona-attack-loop
    - feedback-research-via-mimo-lane
    - feedback-deliver-dont-defer-and-checkpoint
  type: feedback
  originSessionId: edb85ed5-bc21-4594-8321-aebf593bc5a1
---

RULE: the autonomous/auto build order of operations is PLAN → GROUND → SIMULATE → REFINE → BUILD → SELF-VERIFY → RED-TEAM → TRIAGE → LOG. Never jump straight to Write/Edit, and never call a build done before an INDEPENDENT red-team pass attacks the shipped artifact.
WHEN: any auto/free-roam build cycle, ESPECIALLY when unsupervised. Trivial mechanical edits exempt.
DO: (1) PLAN — externalize goal, blast radius, prerequisites (registration/full-prerequisite-closure so a hook doesn't block the write). (2) GROUND — read the REAL data/code the design assumes before locking it (a fictional assumption dies here). (3) SIMULATE — Izanagi: 2-3 divergent branches, score EV × reversibility × blast-radius, pick + record why. (4) REFINE — second opinion (mimo via `node _SYSTEM/Scripts/mimo.mjs`, UNSANDBOXED; or an agent) attacks the DESIGN at the fork, fold forward. (5) BUILD with prerequisites closed. (6) SELF-VERIFY — own adversarial check + real tests incl. negative cases, on real data. (7) RED-TEAM — AFTER the build, an INDEPENDENT attacker (mimo + a refute-by-default sonnet agent; ≥1 each for medium stakes, multi-Opus persona-loaded for high stakes) tries to BREAK the shipped code AND the TESTS: edge cases, fail-open holes, regex/parse gaps, security, the actual logic. (7b) RED-TEAM THE TESTS — never blindly trust a new test's first green. MUTATION-TEST each new/changed test: temporarily break the code it covers, confirm the test FAILS; if it still passes, the test is vacuous/tautological/asserting the wrong thing → fix the test. A green suite proves nothing until the tests are shown to bite. (8) TRIAGE — every red-team finding is a HYPOTHESIS; verify each against live code (file:line) before fixing or parking; kill the over-statements. (9) LOG the increment + residuals.
DONT: charge into code on first idea; treat the first design as proof; skip the simulation because "the answer is obvious"; leave prerequisites for after the write; treat SELF-VERIFY as the red-team (checking your own homework ≠ someone trying to break it); accept a red-team finding without verifying it against live code.
WHY: Marcel corrected twice (2026-06-13): first "run simulations and full plan sessions and refinements before building, especially when running auto"; then "after a build like this your work needs to be red teamed — add that to the autonomous order of operations." Auto mode magnifies a wrong move (no human to catch it early); the plan/sim/refine pass catches design flaws, the independent red-team catches build defects self-verify rationalizes past. Pairs with [[feedback-adversarial-persona-attack-loop]] + [[feedback-substrate-cert-loop]] (build→attack→verify each round banks a real defect).
SEE: [[feedback-improve-loop-high-speed]] · [[feedback-adversarial-persona-attack-loop]] · [[feedback-research-via-mimo-lane]]
