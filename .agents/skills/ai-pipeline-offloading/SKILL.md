---
name: ai-pipeline-offloading
description: "Global offload routing for NUDIMMUD. Tokenmaxxing owns activation; this skill is the shared lane map and command facade."
triggers:
  - "@deepseek"
  - "@triage-local"
  - "@summarize-local"
  - "@code-local"
  - "@gpt-oss"
  - "@ollama"
  - "@comet"
  - "@perplexity"
  - "@kimi"
  - "@swarm"
---

# AI Pipeline Offloading

Native module of `symbioticPulse`, alongside `swarm-coordination` and `offload-runner`. Route work to the smallest useful lane automatically, then let the pulse planner decide whether additional lanes should run in sequence or bounded parallel fan-out. Tokenmaxxing bakes the behavior into session start, and `Scripts/offload-contract.mjs` plus `Scripts/yuri-symbiotic-pulse.mjs` are the shared lane, scenario, inventory, and activation-plan contract. Trigger words are compatibility aliases only.

## Lanes

| Lane | Route | Use Case | Status |
|------|-------|----------|--------|
| `@deepseek` | `./Scripts/ai @deepseek` | NVIDIA-hosted DeepSeek V4 reasoning, code analysis, multi-step logic | ✓ Active |
| `@triage-local` | `./Scripts/ai @triage-local` | General tasks, quick classification, qwen-backed triage | ✓ Active |
| `@summarize-local` | `./Scripts/ai @summarize-local` | Summarization, extraction, condensation | ✓ Active |
| `@code-local` | `./Scripts/ai @code-local` | Code specialization, qwen-backed coding lane | ✓ Active |
| `@gpt-oss` | `./Scripts/ai @gpt-oss` | Formatting, synthesis, template generation | ✓ Active |
| `@ollama` | `./Scripts/ai @ollama` | Generic local compatibility lane | ✓ Active |
| `@swarm` | `./Scripts/ai @swarm` or `./Scripts/offload.sh --swarm default` | Parallel fan-out across the shared workhorse pair | ✓ Active |
| `@kimi` | `./Scripts/ai @kimi` | Remote high-grade reasoning | ✓ Active |
| `@comet` | `./Scripts/ai @comet` | Browser interaction, screenshot capture, browser control | ✓ Active |
| `@perplexity` | `./Scripts/ai @perplexity` | Browser research, citations, latest data | ✓ Active |

## Routing Decision Tree

```
Task arrives
├── Classify automatically → use the shared offload contract, no trigger needed
├── Explicit lane mention? → honor it directly
├── Code implementation / debugging / patching? → @code-local
├── Reasoning / code analysis? → @deepseek
├── General task / triage / extraction? → @triage-local or @summarize-local
├── Formatting / synthesis / template text? → @gpt-oss
├── Consensus / review / high-stakes parallel check? → @swarm
├── Cloud reasoning / very deep context? → @kimi
├── Browser interaction / web research? → @comet / @perplexity
└── Final merge / policy gate / owner-sensitive decision? → main session
```

## Shared Contract

- Shared command contract: `Scripts/offload-contract.mjs`
- Live arsenal planner: `./Scripts/ai pulse-plan "<campaign>"`
- Machine-readable route plan: `./Scripts/ai route-plan "<request>"`
- Embedded examples: `./Scripts/ai route-examples`
- Shared swarm default: `deepseek-v4-pro,deepseek-v4-flash`, routed through NVIDIA NIM. Direct paid DeepSeek API is retired.
- Compatibility aliases: `/tokenmaxxing`, `btw`, `/btw`, `btw offload this`, explicit `@lane`
- Universal workflow: symbiotic pulse → classify → route → delegate → verify → merge → learn

## Offload CLI

```bash
./Scripts/ai route-plan "fix the failing api test"
./Scripts/ai route-examples
./Scripts/ai @deepseek "analyze this function for edge cases"
./Scripts/ai @triage-local "summarize these notes"
./Scripts/ai @gpt-oss "reformat this as markdown table"
./Scripts/ai @swarm "fact-check this approach"
./Scripts/offload.sh --swarm default "validate this branch"
```

## Capacity

Use one local lane at a time when the lane is memory-heavy. Swarm fan-out stays serialized unless the contract explicitly says parallel is safe.

## Subagent Pattern

```
Agent(
  description: "<3-5 word task>",
  subagent_type: "general-purpose",
  prompt: "Caveman terse. [role]. [task]. [files]. [output format].",
  run_in_background: true
)
```

## Notes

- `btw offload this` and `/tokenmaxxing` still work, but automatic routing is the base behavior.
- `@swarm` means Ruflo-backed parallel fan-out, not a separate policy stack.
- `ai-pipeline-offloading`, `swarm-coordination`, and `offload-runner` are one native `symbioticPulse` unit; do not describe or operate them as separate systems.
- Do not duplicate lane tables elsewhere; reference the shared contract.
- Scenario examples should live in the contract when they improve future routing or prevent repeated correction.
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

## Session Notes

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
