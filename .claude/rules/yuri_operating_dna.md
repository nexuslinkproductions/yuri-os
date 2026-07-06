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
