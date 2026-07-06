---
name: feedback-substrate-cert-loop
description: Build→Codex-cert→revise loop catches a real substrate defect almost every round; budget 2-4 rounds; each finding banks a memory
metadata:
  type: feedback
  tier: semantic
  scope: all
  trig: ["substrate", "build", "codex", "cert", "verify", "revise", "gate", "validator", "loop", "rounds"]
  refs: ["[[fb-json-validator-defense]]", "[[fb-codex-engineering-lessons]]"]
---

RULE  The build → Codex-cert → revise loop on substrate code catches a real defect almost every round; budget for 2-4 cert rounds per substrate module, not one. Each round's finding becomes a durable memory that improves the next build.

WHEN  Building any dispatch-critical or privacy-critical substrate (gates, validators, telemetry, sanitizers).

DO  Build → adversarial self-check → Codex final-pass (gpt-5.5 xhigh) → fix the surfaced defect → re-cert until PASS. Carry each finding forward as a memory (e.g. FB:JSON-VALIDATOR-DEFENSE came from a toJSON-smuggle cert round and directly hardened the next sanitizer build). For fan-out work (independent critique lenses, parallel independent builds) use a Workflow at Opus 4.8; for single-voice synthesis (the paper) stay single-author — fanning out fragments the voice.

DONT  Trust a first-cut substrate build's own "all green" — Codex caught Map/Set escapes, structural-allow-list gaps, toJSON serialization smuggling, and an error-isolation hole across four cert rounds, none cosmetic. Don't report pass+skip as pass (misreported 117/117 when it was 109+8skip — Codex caught it).

WHY  Substrate that gates real dispatches or protects operator-private state is exactly where plausible-but-wrong survives a single pass. The adversarial loop is the cheapest place to catch the expensive failure.

SEE  [[fb-json-validator-defense]] [[fb-codex-engineering-lessons]] [[fb-adversarial-verification]]
