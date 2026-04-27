---
name: yuri-clone
description: Budgeted multi-agent decomposition, specialist execution, and synthesis
trigger: /yuri clone
aliases: [/clone, /pco]
skill: parallel-clone-orchestrator
agent: parallel-clone-orchestrator-agent
model: claude-sonnet-4-6
---

# /yuri clone

Invoke Parallel Clone Orchestrator for multi-agent task decomposition.

## Usage

```
/yuri clone [--target PATH] [--goal TEXT] [--clone-budget N] [--roles YAML]
```

## Options

- `--target PATH` — Primary artifact or task target
- `--goal TEXT` — High-level objective to decompose
- `--clone-budget N` — Number of parallel agents (default: 3)
- `--roles YAML` — Agent role definitions (specialist assignments)
- `--output-contract YAML` — Expected output structure from clones

## Examples

```
/yuri clone --target ./complex-task --goal "audit and refactor" --clone-budget 3
/yuri clone --target ./data --roles specialists.yaml --clone-budget 5
```

## Output

- Task decomposition plan
- Clone role assignments with budgets
- Parallel execution trace
- Evidence collection summary
- Synthesis report with contradiction detection
- Merge decision and clone memory distillation
