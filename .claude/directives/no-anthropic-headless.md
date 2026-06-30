---
handle: no-anthropic-headless
tier: observe
description: "Forbidden: claude -p / --print / SDK headless against the ANTHROPIC lane (no-session-persistence paid call). EXEMPT: Mimo via the wrapper (ai claude-mimo) or mimo.mjs — Mimo is meant to be fired one-shot/headless, cheaply."
conditions:
  - "bash:*claude -p*"
  - "bash:*claude --print*"
constraints:
  - kind: command_matches
    pattern: "^(?!.*(?:mimo|claude-mimo)).*claude\s+(-p|--print)"
    message: "claude -p/--print against the Anthropic lane is forbidden (headless paid call). Use the Agent tool or a tmux/PTY lane. The Mimo wrapper / mimo.mjs is exempt."
---
Launch-shape rule, SCOPED to the Anthropic lane (Marcel clarification 2026-06-13): the ban is about expensive headless Anthropic prompt calls, not Mimo. Mimo through the claude wrapper or mimo.mjs is the intended one-shot pattern and does NOT trip this. Source: CLAUDE.md Required Launch Shape, persona behavioral floor.
