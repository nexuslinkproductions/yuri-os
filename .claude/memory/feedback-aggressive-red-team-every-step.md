---
name: feedback-aggressive-red-team-every-step
description: "Owner standing directive — aggressively red-team EVERY module/step the moment it's 'done'; self-reported PASS is a hypothesis, not proof"
metadata: 
  node_type: memory
  type: feedback
  tier: working
  scope: all
  trig: 
    - red team
    - done
    - verify
    - build step
    - peer reported pass
    - adversarial
  refs: 
    - "[[feedback-nano-swarm-orchestration]]"
    - "[[proj-keystone-verifier-learn-loop-2026-06-16]]"
  originSessionId: 7ce507aa-0657-4c74-8e6b-9cf4489ff64c
---

RULE: After ANY module/wave is "done", aggressively red-team it before trusting it — attack it, run negative/mismatch tests, verify at the real seam. Self-reported / first-run PASS is a hypothesis.

WHEN: every build step, especially peer-lane (ollama/mimo/deepseek) output, my own fixes, and any "tests pass" claim.

DO: run the actual code (self-tests, mapper→consumer seam, live-shape probe); dispatch an independent adversarial lane (Sonnet agent is a strong fit) prompted to REFUTE, not confirm; report REAL bugs with file:line + failing evidence + a fix; fix + re-verify (re-run the test to green).

DONT: accept a peer's "PASS / N tests green" at face value; eyeball instead of execute; call something done before it's been attacked.

WHY: owner directive 2026-06-16 ("everything we do has to be aggressively red-teamed once done"). Proven same session: 3 ollama peers self-reported PASS on the venue adapters; a Sonnet adversarial pass found 2 real polymarket bugs (fee fp over-round with a RED self-test the peer missed + a `_vwap` field leak in multi-bar output). Peers over-claim ([[feedback-nano-swarm-orchestration]]); red-team is how the over-claim gets caught.

SEE: 02_RESOURCES/RESEARCH/yuri-observatory-build-2026-06-16/00-MASTER-BRIEF.md §7 · [[feedback-nano-swarm-orchestration]]
