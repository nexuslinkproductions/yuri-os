---
name: anthropic-managed-agents
description: "Research Anthropic managed agents, sessions, events, tools, and skills, then distill the architecture into a portable agent brief. Use when you need a concise reference for agent/session/event design and long-running workflows."
triggers: ["/anthropic-managed-agents", "managed agents", "agent sessions architecture"]
scope: harness
invocation: ability
---

# Anthropic Managed Agents

Use this skill when the task is to understand how managed agents should be modeled or mirrored in this repo.

## Focus

- Separate agent config from session state.
- Treat events, traces, and tool calls as first-class.
- Keep skills lean and filesystem-based.
- Prefer small tools over giant catch-all interfaces.

## Output

- Agent/session/event mental model.
- Reusable design rules.
- Short portability notes for this repo.

## Rules

- Keep the top level brief.
- Put detail in references only when it helps progressive disclosure.
- Preserve portability across agent surfaces.

## Session Notes

### 2026-04-27
- session: 6m | peak ctx: 53% | compacts: 0
- tools: Read×27, Bash×8, Write×2, mcp×1
- corrections: none
- errors: none
