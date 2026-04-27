---
name: yuri-domain
description: Scoped execution environment with policy enforcement and exit criteria
trigger: /yuri domain
aliases: [/domain, /edc]
skill: execution-domain-core
agent: execution-domain-core-agent
model: claude-sonnet-4-6
---

# /yuri domain

Invoke Execution Domain Core for creating bounded task environments.

## Usage

```
/yuri domain [--target PATH] [--goal TEXT] [--constraints YAML] [--exit-criteria YAML]
```

## Options

- `--target PATH` — Primary task target (file, directory, or artifact)
- `--goal TEXT` — High-level objective
- `--constraints YAML` — Task policy constraints (allowed tools, risk limits, etc.)
- `--exit-criteria YAML` — Conditions for domain closure
- `--enterprise` — Apply enterprise compliance rules
- `--non-destructive` — Enforce no-mutation policy (default: true)

## Examples

```
/yuri domain --target ./repo --goal "audit code style" --constraints rules.yaml
/yuri domain --target ./docs --goal "integrate changes" --exit-criteria closure.yaml
```

## Output

- Domain manifest with policy, tools, and boundaries
- Domain lifecycle contract
- Progress checkpoints
- Domain closure report with evidence
