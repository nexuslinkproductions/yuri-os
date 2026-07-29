---
name: fleet-model-economy
description: "Use when fanning out MURE/subagent lanes across model tiers, deciding cheap-vs-heavy routing, or orchestrating a fleet — the canonical doctrine now lives in the fleet-economy skill; load that instead."
---

**SUPERSEDED — this doctrine is now canonical in the `fleet-economy` skill.**

`fleet-economy` (repo `skills/fleet-economy/SKILL.md`, published to `.claude/skills/`) is the single invoke-once surface for MoE/MLP fleet orchestration. It consolidates and replaces this earlier note with a verified roster, parallelism caps (deepseek-flash ≤5, minimax-m3 ≤3), the 5 Iron Rules (20% orchestrator, reads-always-cheap, medium/heavy coding, MANDATORY recursive offload with a leaf-lane exception, right-sizing), dispatch templates, and the Fable-5 apex final pass.

**Load `fleet-economy`.** Do not maintain routing doctrine here.
