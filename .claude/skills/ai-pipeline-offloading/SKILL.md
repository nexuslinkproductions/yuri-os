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

Route work to the smallest useful lane automatically. Tokenmaxxing bakes the behavior into session start, and `Scripts/offload-contract.mjs` is the single lane, scenario, and lifecycle contract. Trigger words are compatibility aliases only.

## Lanes

| Lane | Route | Use Case | Status |
|------|-------|----------|--------|
| `@deepseek` | `./Scripts/ai @deepseek` | Reasoning, code analysis, multi-step logic | ✓ Active |
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
├── Reasoning / code analysis / multi-step? → @deepseek
├── General task / triage / extraction? → @triage-local or @summarize-local
├── Formatting / synthesis / template text? → @gpt-oss
├── Consensus / review / high-stakes parallel check? → @swarm
├── Cloud reasoning / very deep context? → @kimi
├── Browser interaction / web research? → @comet / @perplexity
└── Final merge / policy gate / owner-sensitive decision? → main session
```

## Shared Contract

- Shared command contract: `Scripts/offload-contract.mjs`
- Machine-readable route plan: `./Scripts/ai route-plan "<request>"`
- Embedded examples: `./Scripts/ai route-examples`
- Shared swarm default: `deepseek-v4-pro-lite-budget,deepseek-v4-flash`
- Compatibility aliases: `/tokenmaxxing`, `btw`, `/btw`, `btw offload this`, explicit `@lane`
- Universal workflow: intake → route → delegate → verify → merge → learn

## Offload CLI

```bash
./Scripts/ai auto "fix the failing api test"
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
- Do not duplicate lane tables elsewhere; reference the shared contract.
- Scenario examples should live in the contract when they improve future routing or prevent repeated correction.
