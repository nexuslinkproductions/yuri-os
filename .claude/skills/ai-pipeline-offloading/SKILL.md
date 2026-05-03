---
name: ai-pipeline-offloading
description: "Global offload routing for NUDIMMUD. Local-first: Deepseek, Qwen, GPT-OSS. Browser: Comet, Perplexity. Swarm via Ruflo. Cloud (Kimi) when limit allows."
triggers:
  - "@deepseek"
  - "@qwen"
  - "@gpt-oss"
  - "@ollama"
  - "@comet"
  - "@perplexity"
  - "@claude"
  - "@kimi"
  - "@haiku"
---

# AI Pipeline Offloading

Route work to the smallest useful lane. Local first. Browser second. Cloud when needed.

## Lanes

| Lane | Binary | Use Case | Status |
|------|--------|----------|--------|
| `@deepseek` | `./Scripts/ai --model deepseek` | Reasoning, code analysis, multi-step logic | ✓ Active |
| `@qwen` | `./Scripts/ai --model $(jq -r '.local.primary' .claude/config/models.json)` | General tasks, summarization, extraction (model from .claude/config/models.json) | ✓ Active |
| `@gpt-oss` | `./Scripts/ai @gpt-oss` | Formatting, synthesis, template generation | ✓ Active |
| `@ollama` | `./Scripts/ai @ollama` | Any registered local Ollama model | ✓ Active |
| `@comet` | browser-use MCP | UI interaction, screenshot, browser control | ✓ Active |
| `@perplexity` | browser-use via Comet | Web research, real-time data fetch | ✓ Active |
| `@swarm` | `./Scripts/offload.sh --swarm` | Parallel fan-out, consensus, cross-check | ✓ Active |
| `@claude` | main session | High-nuance, safety-critical, final merge | ✓ Active |
| `@kimi` | `./Scripts/ai @kimi` | High-grade remote reasoning | ⏳ Rate-limited |
| `@haiku` | `Agent({ model: "haiku" })` | Fallback when local fails: fetch, read, explore, summarize | ✓ Active |

## Routing Decision Tree

```
Task arrives
├── Shell/deterministic work? → Bash tool directly (no offload)
├── Reasoning / code analysis? → @deepseek
├── General / summarization? → @qwen
├── Formatting / output synthesis? → @gpt-oss
├── Browser interaction needed? → @comet
├── Web research / real-time data? → @perplexity
├── Consensus needed / high-stakes? → @swarm (deepseek + qwen + gpt-oss)
├── Frontier reasoning / wide context? → @claude (main session)
└── Local failed + utility task? → @haiku (fetch/read/explore fallback ceiling)
```

**Local-fail rule:** Ollama error/unavailable → `@haiku`, not `@claude`. Main thread stays Sonnet 4.6.

## Capacity (M2 Pro, 16GB unified memory)

⚠️ **ONE LOCAL LLM AT A TIME. Parallel Ollama = OOM crash.**

```
RAM cap:        10GB max for Ollama (out of 16GB unified)
Local model:    1 at a time — kill previous before loading next
Browser tasks:  2–3 tabs OK alongside ONE active model
Claude agents:  parallel OK (cloud, not local memory)
─────────────────────────────────────────────────────
Safe:    1 local model + browser tasks
DANGER:  2+ local models simultaneously → system crash
```

Kill between models: `pkill -f ollama && sleep 3`
**⚠ NEVER benchmark multiple models in sequence** — full sweep freezes M2 Pro 16GB. Test one model, read result, decide next.

Monitor load before spawning: `./Scripts/offload.sh --list`

## Claude Code Subagent Pattern

When delegating via Agent tool:
```
Agent(
  description: "<3-5 word task>",
  subagent_type: "general-purpose" | "Explore",
  prompt: "Caveman terse. [role]. [task]. [files]. [output format].",
  run_in_background: true  // for fire-and-forget work
)
```

Swarm = multiple parallel Agent calls in one message.
Max parallel: 8–14 (memory-bound, not Agent-bound).
Main thread: overseer, router, and final merge only.

## Offload CLI (direct shell)

```bash
# Single model
./Scripts/ai @deepseek "analyze this function for edge cases"
./Scripts/ai @qwen "summarize these notes"
./Scripts/ai @gpt-oss "reformat this as markdown table"

# Swarm (parallel)
./Scripts/ai @swarm "fact-check this approach"
./Scripts/offload.sh --swarm deepseek,qwen "validate this plan"

# Force model override
./Scripts/offload.sh --model deepseek-r1:latest "complex reasoning task"

# List available models
./Scripts/offload.sh --list
```

## Model Steering

- `btw` or `/btw` prefix = live steering signal.
- `/tokenmaxxing` = master activation (preferred). Engages full offload-default with no trigger word.
- `btw offload this` = legacy partial trigger. Delegate immediately, choose smallest lane.
- Do not describe work in main session that can run in a lane.

## Ruflo Integration

- `@swarm` routes through Ruflo `agent-coordination` skill.
- State tracked in `_SYSTEM/OS_KERNEL/memory.db`.
- Handoff via `_SYSTEM/OS_KERNEL/swarm-handoff.sh`.
- One worker → one boundary → one completion check.

## OpenClaw Integration

- `openclaw mcp set offload` to register offload MCP server.
- Use `skill-discovery` for model discovery across lanes.
- Use `delegate-task` for explicit skill-to-model routing.

## Output Format

1. State chosen lane.
2. State why it is minimum viable.
3. Execute.

## Token Budget Policy

- Heavy reading, search, classification → cheap/offloaded lanes only: Haiku, @swarm, local scripts, grep. Never an expensive orchestrator.
- Expensive orchestrators (Sonnet, Kimi) receive compact evidence only; handle mutation, live DB/process checks, security gates, final decisions.
- Transcript budget: small tasks soft 5k–15k, hard max 40k. Stop/reshape if trajectory is above budget.
- No command may intentionally output more than 60–80 lines.
- Dirty repos: scoped marker-only commands; no broad `git status`, `git diff`, `find .`, or full grep dumps.
- Reports: marker-only on pass; failure-only verbose logs; no repeated harness or code blocks.
- Runtime script flags planned separately; docs-only patches run first.

## Low-Cost Research Ladder

Default routing for all research tasks. Do not skip tiers.

| Tier | Source | Method | Approval |
|------|--------|---------|----------|
| 0 | Local cache / git history | Read, grep, git log | None |
| 1 | Package registry metadata | `npm view <pkg> --json \| jq` | None |
| 2 | Raw source files | raw.githubusercontent.com + `head -N` line cap | None |
| 3 | Snippets / highlights | Targeted grep on raw source | None |
| 4 | Targeted extract | Single scoped file read | None |
| 5 | Full crawl / WebFetch | Rendered GitHub or full page | Explicit owner approval |

- No subagents for routine package or web research. Direct shell tools only.
- Package audits: `npm view <pkg> --json | jq '.versions,.description,.dist-tags'`
- GitHub source: raw URL + `head -200` max. Never rendered GitHub WebFetch.
- Full crawl / WebFetch: explicit owner approval required before every call.
- DeepSeek reinforcement: compact evidence only, never raw command dumps.

## Session Notes

### 2026-05-02
- session: 4m | peak ctx: 14% | compacts: 0
- tools: Bash×16, Read×4, Edit×4, Skill×1
- corrections: none
- errors: none

### 2026-05-02
- session: 1m | peak ctx: 34% | compacts: 0
- tools: Bash×6, Read×4
- corrections: none
- errors: none

### 2026-05-01
- session: 1m | peak ctx: 44% | compacts: 0
- tools: Bash×15, Read×5
- corrections: none
- errors: none

### 2026-05-01
- session: 1m | peak ctx: 45% | compacts: 0
- tools: Bash×13, Read×6
- corrections: none
- errors: none

### 2026-05-01
- session: 3m | peak ctx: 49% | compacts: 0
- tools: Bash×23, Read×9
- corrections: none
- errors: none

### 2026-04-28
- session: 8m | peak ctx: 22% | compacts: 0
- tools: Bash×12, Read×11, Edit×11, Write×2
- corrections: none
- errors: none

### 2026-04-28
- session: 348m | peak ctx: 50% | compacts: 0
- tools: Read×9, Bash×8, Agent×1, mcp×1
- corrections: none
- errors: none

### 2026-04-27
- session: 2m | peak ctx: 41% | compacts: 0
- tools: Read×11, Bash×5
- corrections: none
- errors: none

### 2026-04-27
- session: 2m | peak ctx: 33% | compacts: 0
- tools: Bash×11, Read×2
- corrections: none
- errors: none

### 2026-04-27
- session: 2m | peak ctx: 33% | compacts: 0
- tools: Bash×11, Read×2
- corrections: none
- errors: none

### 2026-04-27
- session: 22m | peak ctx: 49% | compacts: 0
- tools: Bash×14, Read×4, Write×2, Edit×1
- corrections: none
- errors: none

### 2026-04-27
- session: 19m | peak ctx: 48% | compacts: 0
- tools: Bash×14, Read×4, Write×2, Edit×1
- corrections: none
- errors: none

### 2026-04-27
- session: 6m | peak ctx: 53% | compacts: 0
- tools: Read×27, Bash×8, Write×2, mcp×1
- corrections: none
- errors: none

### 2026-04-27
- session: 1m | peak ctx: 40% | compacts: 0
- tools: Read×7, Bash×4, Edit×3
- corrections: none
- errors: none

### 2026-04-27
- session: 3m | peak ctx: 35% | compacts: 0
- tools: Bash×6, Read×4, mcp×3, Write×1
- corrections: none
- errors: none

### 2026-04-27
- session: 8m | peak ctx: 50% | compacts: 0
- tools: Read×41, Bash×15, Write×5, Agent×1
- corrections: none
- errors: none

### 2026-04-26
- session: 1m | peak ctx: 40% | compacts: 0
- tools: Edit×2, Read×1
- corrections: none
- errors: none

### 2026-04-26
- session: 11m | peak ctx: 63% | compacts: 1
- tools: Read×8, Write×6, Edit×6, Bash×6, ToolSearch×2, AskUserQuestion×1, ExitPlanMode×1
- corrections: none
- errors: none

### 2026-04-26
- session: 2m | peak ctx: 9% | compacts: 0
- tools: Read×31, Bash×15
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
- session: 5m | peak ctx: 9% | compacts: 0
- tools: Bash×31, Read×19, Edit×2, Agent×1
- corrections: none
- errors: none

### 2026-04-25
- session: 0m | peak ctx: 14% | compacts: 0
- tools: Read×9, Bash×4, Write×2, Edit×2
- corrections: none
- errors: none

### 2026-04-25
- session: 3m | peak ctx: 20% | compacts: 0
- tools: Edit×6, Bash×4, Read×3, Skill×1
- corrections: none
- errors: none

### 2026-04-25
- session: 2m | peak ctx: 8% | compacts: 0
- tools: Read×56, Bash×23, TaskCreate×11, Write×1, ExitPlanMode×1, ToolSearch×1
- corrections: none
- errors: none
