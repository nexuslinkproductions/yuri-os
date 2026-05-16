---
name: local-subagent
description: "Routes lightweight agent tasks through ollama-bridge MCP (local Ollama) before escalating to cloud Agent(). Use for skill lookup, file analysis, summarization, exploration — any task that doesn't need full Claude reasoning."
triggers:
  - "/local-subagent"
  - "local-subagent"
  - "@local"
---

# LOCAL-SUBAGENT ROUTING SKILL

## Purpose

Bridge for local-first agent execution. Replaces cloud `Agent()` calls for tasks where a local Ollama model is sufficient. Uses `mcp__ollama-bridge__ollama_run` and `mcp__ollama-bridge__ollama_explore_files` as the execution layer.

## When to Use (vs Cloud Agent)

| Task Type | Use Local | Use Cloud Agent |
|-----------|-----------|-----------------|
| Skill file lookup / SKILL.md read | ✓ | — |
| File summarization (< 40K chars) | ✓ | — |
| Codebase exploration / grep | ✓ | — |
| MEMORY.md index check | ✓ | — |
| Single-file analysis | ✓ | — |
| Multi-file cross-cutting analysis | — | ✓ |
| Implementation with tool loop | — | ✓ |
| Tasks requiring Claude-level reasoning | — | ✓ |

**Decision heuristic:** If the task can be answered by reading ≤5 files and returning a structured summary, route local. If it requires tool loops, writing code, or complex reasoning chains, escalate.

## Execution Protocol

### Step 1 — Classify task

```
lightweight = (file_paths provided OR task is lookup/summarize/explore/check)
            AND (no write operations needed)
            AND (no multi-file dependency tracing needed)
```

### Step 2 — Route

**Text-only task** (no files):
```
mcp__ollama-bridge__ollama_run({
  prompt: "<task description, be specific>",
  model: "qwen3.5:4b",   // from .claude/config/models.json → local.utility; override with OLLAMA_DEFAULT_MODEL env var if needed
  system: "You are a precise assistant. Return structured, terse output."
})
```

**File-based task** (up to 5 files):
```
mcp__ollama-bridge__ollama_explore_files({
  prompt: "<specific question about the files>",
  file_paths: ["<absolute path 1>", "<absolute path 2>", ...],
  model: "qwen3.5:4b",   // from .claude/config/models.json → local.utility
  system: "Analyze the provided files and return a precise, structured answer."
})
```

**Model selection logic:**
- Check `.claude/config/models.json` → `local.utility` for lightweight local-subagent work
- Use `local.primary` for general local reasoning when the utility model is insufficient
- Code-specific tasks: use `local.code` from same config
- If local model times out (>30s): escalate to Haiku, then Sonnet

### Step 3 — Assess sufficiency

- **Sufficient**: result is actionable, specific, and answers the original query → return it directly
- **Insufficient**: result is vague, hallucinates paths, or explicitly states uncertainty → escalate to `Agent()` with context note

### Step 4 — Escalation (if needed)

**For fetch/read/explore failures** (Ollama down, model missing, MCP error):
```
// Scripts/offload.sh -m deepseek-v4-flash "<original prompt>\n\nLocal attempt failed: <error>\nEscalated to deepseek-v4-flash fallback."
```

**For tasks requiring full Claude reasoning** (planning, implementation, testing):
```
Agent({
  description: "<task>",
  prompt: "<original prompt>\n\nLocal attempt result (insufficient): <local_result>\nEscalated to cloud for deeper analysis."
})
```

Rule: `model: "haiku"` for all utility escalations. Omit model param (Sonnet default) only for planning/impl/testing tasks.

## Model Selection

| Use Case | Model |
|----------|-------|
| Fast utility, lookup, extraction | `qwen3.5:4b` |
| Stable general reasoning | `qwen2.5:7b` |
| Code understanding, generation | `qwen2.5-coder:7b` |
| Deep explicit reasoning | `deepseek-r1:8b` |
| Fast fallback | `llama3.2:latest` |
| Multimodal/local inspection | `gemma4:e2b` |

Manual-only on 16 GB unified memory: `deepseek-liberated:latest`, `deepseek-v2:16b`, and `gemma4:latest`. Do not use them for hooks, scouts, or background local-subagent work.

Check available models first if uncertain:
```
mcp__ollama-bridge__ollama_models()
```

## Invocation Examples

```
/local-subagent summarize the graphify skill — what does it do and what tools does it call?
/local-subagent check memory/MEMORY.md — is there an entry for local routing?
@local what does mcp__ollama-bridge__ollama_run accept as parameters?
```

## Anti-Patterns

- Do NOT route tasks that require writing files, running bash, or calling non-ollama tools through local-subagent
- Do NOT use for tasks with >5 file dependencies — context window of local models is smaller
- Do NOT claim "local result is sufficient" without actually checking if the answer is complete and specific

## Session Notes

### 2026-05-16
- session: 77m | peak ctx: 0% | compacts: 0
- tools: Bash×88, Read×36, mcp×15, Edit×13, Write×10, ToolSearch×4, ExitPlanMode×1
- corrections: none
- errors: none

### 2026-05-16
- session: 72m | peak ctx: 0% | compacts: 0
- tools: Bash×87, Read×36, mcp×15, Edit×13, Write×10, ToolSearch×4, ExitPlanMode×1
- corrections: none
- errors: none

### 2026-05-16
- session: 57m | peak ctx: 0% | compacts: 0
- tools: Bash×78, Read×23, mcp×14, Write×8, Edit×7, ToolSearch×4, ExitPlanMode×1
- corrections: none
- errors: none

### 2026-04-27
- session: 1m | peak ctx: 30% | compacts: 0
- tools: Read×2, Skill×1, Bash×1
- corrections: none
- errors: none

### 2026-04-27
- session: 2m | peak ctx: 44% | compacts: 0
- tools: Read×13, Bash×4
- corrections: none
- errors: none

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
- session: 1m | peak ctx: 50% | compacts: 0
- tools: Bash×3, Read×1, Write×1
- corrections: none
- errors: none

### 2026-04-26
- session: 7m | peak ctx: 0% | compacts: 0
- tools: Bash×15, Read×9, Write×4, Agent×1, ToolSearch×1, ExitPlanMode×1, Edit×1
- corrections: none
- errors: none

### 2026-04-26
- session: 6m | peak ctx: 0% | compacts: 0
- tools: Bash×15, Read×9, Write×4, Agent×1, ToolSearch×1, ExitPlanMode×1, Edit×1
- corrections: none
- errors: none

### 2026-04-26
- session: 17m | peak ctx: 11% | compacts: 0
- tools: Read×26, Edit×4, Bash×2, Agent×2, Write×2, ToolSearch×1
- corrections: none
- errors: none

### 2026-04-26
- session: 16m | peak ctx: 11% | compacts: 0
- tools: Read×26, Edit×4, Bash×2, Agent×2, Write×2, ToolSearch×1
- corrections: none
- errors: none

### 2026-04-26
- Created as part of local-first subagent bridge project
- ollama-bridge MCP already wired in /Users/marcelspatz/.claude.json
- Default model: qwen3.5:4b
- Escalation path: Agent() with local result context injected
- tools used: Write
- errors: none
