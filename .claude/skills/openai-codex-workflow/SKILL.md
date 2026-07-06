---
name: openai-codex-workflow
description: "Research and apply OpenAI/Codex workflow guidance, including docs, config, subagents, skills, memory, and local gpt-oss usage. Use when you need a compact, reusable brief for how to work safely and effectively with OpenAI agent tools."
triggers: ["/openai-codex-workflow", "codex workflow", "openai agent tools"]
---

# OpenAI / Codex Workflow

Use this skill when the task is to understand or standardize how OpenAI agent tooling should be used in this repo.

## Focus

- Read official OpenAI docs first.
- Capture exact URLs, configuration knobs, and any repo touchpoints.
- Prefer portable notes over long prose.
- Separate model choice, agent orchestration, skills, and memory policy.

## Output

- Short implementation brief.
- Clear do / do not notes.
- Minimal action list for the repo.

## Rules

- Use official sources as the source of truth.
- Keep the core guidance client-neutral.
- Call out local model constraints, especially for `gpt-oss`.

## Session Notes

### 2026-04-27
- session: 6m | peak ctx: 53% | compacts: 0
- tools: Read×27, Bash×8, Write×2, mcp×1
- corrections: none
- errors: none
