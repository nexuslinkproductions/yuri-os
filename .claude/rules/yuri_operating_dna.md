# YURI-OS-MUSUBI Operating DNA — Claude Bridge

INHERIT: _SYSTEM/yuri-origin.md
INHERIT: ../../SOUL.md

This file is a Claude-specific workflow bridge. Shared policy lives in the canonical origin and persona files; do not restate it here.

## On-demand references

- `.claude/rules/research_pipeline.md` - research workflow
- `.claude/rules/skill-creation.md` - skill creation workflow
- `_SYSTEM/Scripts/llm-compat-contract.mjs` - routing and lifecycle contract

## Local exception handling

- Any exception must be explicit, scoped, and logged.
- Local evidence outranks model text.
- If a referenced file is missing, report it rather than inventing a pointer.

## Post-Plan-Approval Dispatch

After `ExitPlanMode` is approved, `plan_dispatch_gate` in `session-state.json` is armed.
The first mutation (Edit/Write/Bash) before a `route-plan` call triggers a
`post-plan-dispatch-required` advisory from `claude-protocol-guard.js`.

Correct response: run `_SYSTEM/Scripts/ai route-plan "<task>"` and dispatch to the
returned lane. Direct main-session implementation is only permitted if route-plan
returns `codexPolicy=none` (critical tier) or explicitly assigns `@claude` as the lane.

Bypass: `YURI_SPRINT_MODE=1` suppresses the advisory for authorized sprint sessions.

## Prompt compression

- Inherit the canonical contract by reference.
- Keep prompts short, evidence-backed, and file-bounded.

## Cost-tier fleet routing

The main session runs Sol (expensive) on every turn regardless of worker activity. Every inline action the main session does is Sol budget spent on work a worker could own. Route by tier:

- **CHEAP (deepseek-flash, mimo)** — EVIDENCE passes and R0 mechanical / read-only sub-passes only. Fan these in parallel, liberally. Hard mask: they may NOT produce R1+ semantic output — evidence-gatherers, not producers. "Use them more" means fan more R0/evidence to them, never promote them.
- **CHEAP-FRONTIER (terra, luna, minimax-M3, glm)** — R1+ frontier PRODUCER volume. Route here before escalating to Sol or Opus. Peer-grade workers, not advisory sidecars.
- **Sol seat + Opus** — orchestration decisions and R3 verification only. Never for R0/R1 work a cheaper tier can own.

The "2+ inline reads/greps/edits → stop and dispatch" rule in persona.md is a cost trigger: each done inline burns Sol budget on R0 work. persona.md is the always-loaded enforcement surface; this section is the reference anchor for dispatched-lane context. Mimo is availability-gated (`mure-artificer` must be registered in OpenClaw) — until then, DeepSeek carries the cheap tier.
