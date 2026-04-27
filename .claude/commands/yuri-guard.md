---
name: yuri-guard
description: Always-on action boundary, risk classifier, and mutation approval gate
trigger: /yuri guard
aliases: [/guard, /ndig]
skill: non-destructive-infinity-guard
agent: non-destructive-infinity-guard-agent
model: claude-sonnet-4-6
---

# /yuri guard

Invoke Non-Destructive Infinity Guard for action boundary analysis and risk classification.

## Usage

```
/yuri guard [--target PATH] [--mode audit|integration|analysis] [--enterprise] [--non-destructive]
```

## Options

- `--target PATH` — Path to analyze (file, directory, or artifact)
- `--mode audit` — Read-only inspection (default)
- `--mode integration` — Stage patches for integration
- `--mode analysis` — Full weakness + risk assessment
- `--enterprise` — Apply enterprise compliance rules
- `--non-destructive` — Enforce no-mutation policy (default: true)

## Examples

```
/yuri guard --target ./repo --mode audit --enterprise --non-destructive
/yuri guard --target ./docs --mode integration --stage-only
/yuri guard --target ./memory/session.md --mode audit
```

## Output

- Analysis report with findings, risks, and recommendations
- Staged patch proposals (no direct mutations)
- Audit events logged to `.claude/state/anime-dna-infinity-guard.jsonl`
- Memory update proposals for review
