---
name: anthropic-managed-agents
description: "Research Anthropic managed agents, sessions, events, tools, and skills, then distill the architecture into a portable agent brief. Use when you need a concise reference for agent/session/event design and long-running workflows."
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

