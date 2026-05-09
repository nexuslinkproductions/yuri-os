---
name: ai-pipeline-offloading
description: "Global offload routing for YURI OS. Cloud-first: DeepSeek V4 Pro/Flash workhorse family. Local (Ollama) lanes FROZEN — will re-enable later."
triggers:
  - "@deepseek"
  - "@deepseek-flash"
  - "@swarm"
  - "@codex"
  - "@codex-mini"
  - "@gpt-oss"
  - "@claude"
---

# AI Pipeline Offloading

Route work to the smallest useful lane. Cloud first. Local lanes frozen.

## Lanes

| Lane | Route | Use Case | Status |
|------|-------|----------|--------|
| `@deepseek` | `./Scripts/offload.sh -m deepseek-v4-pro` | Reasoning, code analysis, multi-step logic | ✓ Active |
| `@deepseek-flash` | `./Scripts/offload.sh -m deepseek-v4-flash` | Fast reasoning, code generation | ✓ Active |
| `@swarm` | `./Scripts/offload.sh --swarm` | Parallel fan-out across workhorse family | ✓ Active |
| `@codex` | `./Scripts/offload.sh -m codex` | OpenAI Responses API (gpt-5.5) | ✓ Active |
| `@codex-mini` | `./Scripts/offload.sh -m codex-mini` | OpenAI Responses API (gpt-5.4-mini) | ✓ Active |
| `@claude` | main session | High-nuance, safety-critical, final merge | ✓ Active |
| `@gpt-oss` | — | **FROZEN** — Ollama daemon offline, will re-enable later | ❄️ |

## Routing Decision Tree

```
Task arrives
├── Reasoning / code analysis / multi-step? → @deepseek
├── Fast generation / quick answer? → @deepseek-flash
├── Consensus / parallel check needed? → @swarm (flash + pro + codex)
├── Frontier / safety-critical / final merge? → @claude (main session)
├── OpenAI Responses API? → @codex or @codex-mini
└── Local lane? → ❄️ FROZEN — use cloud lanes instead
```

## Workhorse Family (Primary Offload Target)

The DeepSeek V4 workhorse family is the default offload target:

| Model | Role | Best For |
|-------|------|----------|
| `deepseek-v4-pro` | Heavy workhorse | Complex reasoning, multi-step logic, deep analysis |
| `deepseek-v4-flash` | Fast workhorse | Code generation, quick answers, simpler tasks |
| `codex` | OpenAI fallback | When DeepSeek unavailable |

Swarm pattern for consensus:
```bash
./Scripts/offload.sh --swarm deepseek-v4-flash,deepseek-v4-pro "analyze X"
```

## Offload CLI

```bash
# Single model
./Scripts/offload.sh -m deepseek-v4-pro "analyze this function"
./Scripts/offload.sh -m deepseek-v4-flash "quick code review"
./Scripts/offload.sh -m codex "reformat as markdown"

# Swarm (parallel — cloud models)
./Scripts/offload.sh --swarm deepseek-v4-flash,deepseek-v4-pro "validate this approach"

# List available models
./Scripts/offload.sh --list
```

## Capacity

No local models active. All lanes route to cloud APIs.
Parallel swarm safe — no memory collision.

## Claude Code Subagent Pattern

```
Agent(
  description: "<3-5 word task>",
  subagent_type: "general-purpose",
  prompt: "Caveman terse. [role]. [task]. [files]. [output format].",
  run_in_background: true
)
```

## Codex CLI Invocation

In Codex CLI, use shell scripts:
```
./Scripts/offload.sh -m deepseek-v4-pro "<task>"       # → DeepSeek Pro
./Scripts/offload.sh -m deepseek-v4-flash "<task>"      # → DeepSeek Flash
./Scripts/offload.sh --swarm deepseek-v4-flash,deepseek-v4-pro "<task>"  # → swarm
```
