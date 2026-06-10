---
name: feedback-prose-not-outrun-wiring
description: Verify operational claims vs LIVE code/runtime, never comments or happy-path tests
metadata:
  type: feedback
  tier: semantic
  scope: all
  trig: ["operational", "is it working", "gate", "registered", "verify", "wired", "cosmetic"]
  refs: ["[[feedback-substrate-cert-loop]]"]
---

RULE: Operational claims ("it gates", "all N terms fire", "it's on", "registered") must be verified against LIVE code + runtime — never against comments, a module's own header, or a green happy-path suite. The recurring failure mode is prose/claims outrunning the wiring.
WHEN: Any time I claim something is operational, working, complete, secure, or wired — especially substrate I just built.
DO: Trace each claim to the live path — grep for actual consumers, run it, perturb inputs, confirm registration. Distinguish "tested in isolation" from "wired into production." State the honest gap out loud.
DONT: Trust headers/comments; assume a written feature is wired; let happy-path green imply operational reality; say "gate" when the wiring only observes.
[STYLE]: Truth before polish — "telemetry that observes" is not "a gate that blocks"; name which is actually true.
WHY: 2026-05-30 hardening attack found the energy "gate" only OBSERVES (PostToolUse, never blocks), 4 of 9 terms never fire in production, and the master switch was dead-by-default — all of it had been claimed operational. These were reproduced bugs, not opinion.
SEE: _SYSTEM/reports/energy-hardening-attack-2026-05-30.md; [[feedback-substrate-cert-loop]]
