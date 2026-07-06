---
name: feedback-adversarial-persona-attack-loop
description: High-stakes substrate: build then multi-Opus persona-loaded refute-by-default attack, verify each bug, before claiming done/novel
metadata:
  type: feedback
  tier: semantic
  scope: all
  trig: ["harden", "confirm", "attack", "hard confirmation", "is this real", "operational", "novel"]
  refs: ["[[feedback-substrate-cert-loop]]", "[[feedback-prose-not-outrun-wiring]]"]
---

RULE: For high-stakes substrate, run build → multi-Opus adversarial attack (persona+cognitive-blueprint loaded, refute-by-default, every critical/high bug independently re-verified) → fix only verified findings, BEFORE claiming done, secure, or novel.
WHEN: Before declaring a built system operational/publishable, or on owner request for hard confirmation.
DO: Fan out persona-loaded Opus agents one per attack front (operational reality, math soundness, privacy, security, control-plane integration, novelty); make agents RUN the code, not read comments; re-verify each bug with a separate skeptic; synthesize an honest verdict including steelman AND skeptic on the novelty claim.
DONT: trust a single happy-path pass; let agents flatter; count an un-re-verified bug; conflate telemetry with enforcement.
WHY: 2026-05-30: one such workflow (21 Opus agents, 7 fronts) found 12 verified-real bugs — including a one-write privilege escalation and a privacy key-smuggle — plus a sharp honest novelty verdict, in a system that looked solid. Confirms the substrate-cert pattern at Opus-fleet scale.
SEE: [[feedback-substrate-cert-loop]]; _SYSTEM/reports/energy-hardening-attack-2026-05-30.md
