---
name: feedback-improve-loop-high-speed
description: "Standing method — tight build→red-team→fix→re-test→improve loop, each pass sharpening the input; mutation-test the tests themselves; fold every round's feedback forward. Compresses \"33-year\" work into months."
metadata: 
  node_type: memory
  type: feedback
  tier: high
  scope: yuri
  trig: 
    - build
    - red-team
    - test
    - verify
    - iterate
    - stress test
    - attack the tests
  refs: 
    - feedback-substrate-cert-loop
    - feedback-adversarial-persona-attack-loop
    - hold-big-picture-breadth-and-depth
  originSessionId: e8b8407a-e81c-4e19-89f4-66c3aaeb0a5a
---

RULE: Run development as a high-SPEED, high-ACCURACY feedback loop — build → adversarial red-team (bounded fleet) → fix → re-test → improve, and FOLD each round's findings into the next input so quality compounds per pass. Don't stop at one red-team round; re-fire with the new knowledge.
WHEN: any substantial build, especially pre-OSS / high-stakes substrate (the math/NEXUS-CORE engines).
DO: bounded fleets (Claude agents + Codex + DeepSeek lanes) attacking distinct dimensions; verify every finding vs LIVE code (refute-by-default) before fixing; add a regression test per real finding; ALSO attack the TESTS (mutation-test: break the impl, confirm a test goes red — surfaces vacuous/false-negative assertions); re-run the full suite each pass; capture sources/findings to the corpus + reindex so it compounds.
DONT: treat first-green as done; ship a metric/engine without a cold proof that can FAIL; trust a passing test without confirming it's non-vacuous; cram a fresh red-team round's full fix-list into an exhausted session — hand off the tail precisely instead.
WHY: Marcel's thesis (2026-06-06), proven live this session — "fast iterations + improvements + testing make process development significantly faster and effective; work that takes 33 years can be cut to months." Two red-team rounds + a test-attack round turned a forge with a failing proof into a hardened, 2-round-verified substrate in one sitting.
SEE: [[feedback-substrate-cert-loop]] · [[feedback-adversarial-persona-attack-loop]]
