---
name: kimi-k2-6-server-adapter
description: "Plan Kimi K2.6 as a self-hosted, server-grade model behind an OpenAI-compatible endpoint. Use when you need a concise adapter brief, not a consumer-local runtime plan."
---

# Kimi K2.6 Server Adapter

Use this skill when the task is to expose Kimi K2.6 through a server-backed inference layer.

## Focus

- Treat Kimi K2.6 as server-grade only.
- Use an OpenAI-compatible endpoint.
- Keep endpoint URLs configurable.
- Preserve reasoning and tool-call passthrough where needed.

## Output

- Server adapter plan.
- Model registry implications.
- Health-check expectations.

## Rules

- Do not frame this as a desktop-local model.
- Call out when the recommended engines are server-class.
- Keep the repo integration thin.

## Session Notes

### 2026-04-27
- session: 6m | peak ctx: 53% | compacts: 0
- tools: Read×27, Bash×8, Write×2, mcp×1
- corrections: none
- errors: none

### 2026-04-27
- session: 8m | peak ctx: 50% | compacts: 0
- tools: Read×41, Bash×15, Write×5, Agent×1
- corrections: none
- errors: none
