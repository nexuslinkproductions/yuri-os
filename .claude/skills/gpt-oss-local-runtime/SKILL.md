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

