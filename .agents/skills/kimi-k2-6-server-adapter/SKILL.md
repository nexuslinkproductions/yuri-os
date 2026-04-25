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

