---
name: gpt-oss-local-runtime
description: "Set up and reason about local gpt-oss runtime paths, defaulting to Ollama with LM Studio as fallback. Use when you need a concise local-offload plan, endpoint mapping, or compatibility notes for OpenAI-shaped clients."
---

# GPT-OSS Local Runtime

Use this skill when the task is to run or integrate `gpt-oss-20b` locally.

## Focus

- Default to Ollama first.
- Use LM Studio as the fallback path.
- Keep the provider boundary OpenAI-compatible.
- Note Harmony-format and tool-call constraints.

## Output

- Runtime recommendation.
- Endpoint and model mapping.
- Limits, risks, and fallback notes.

## Rules

- Do not assume consumer hardware can handle every deployment path.
- State when a server-grade path is a better fit.
- Keep the integration surface small.

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

### 2026-04-26
- session: 5m | peak ctx: 9% | compacts: 0
- tools: Bash×31, Read×19, Edit×2, Agent×1
- corrections: none
- errors: none
