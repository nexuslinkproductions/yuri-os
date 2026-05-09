---
name: deepseek-workhorse
description: "Forge/run NUDIMMUD Workhorse X1 pipeline — intent → action plan → execute. Routes reasoning to DeepSeek Pro/Flash."
trigger: /deepseek-workhorse
skill: deepseek-workhorse
---

# /deepseek-workhorse

Invoke the NUDIMMUD Workhorse X1 orchestration pipeline on a rough idea. Generates structured intent, action plan, flash review, and optionally executes.

## Usage

```
/deepseek-workhorse forge "<rough idea>"
/deepseek-workhorse forge --execute "<rough idea>"
/deepseek-workhorse forge --live "<rough idea>"
/deepseek-workhorse forge --live --execute "<rough idea>"
/deepseek-workhorse forge --live --no-flash "<rough idea>"
/deepseek-workhorse forge --generate-plan "<rough idea>"
/deepseek-workhorse run --plan <path>
/deepseek-workhorse run --execute --plan <path>
```

## Arguments

| Arg | Description |
|-----|-------------|
| `forge` | Build pipeline: intent → action plan → flash review → executor |
| `run` | Execute from existing plan file |
| `--execute` | Actually run the actions (default: dry-run only) |
| `--live` | Use DeepSeek Pro for schema generation (recommended) |
| `--no-flash` | Skip DeepSeek Flash review step |
| `--generate-plan` | Generate action plan without executing |
| `--plan <path>` | Path to existing plan file for `run` |

## Output

Artifacts written to `~/.nudimmud/workhorse-runs/<run-id>/`:
- `request.json`, `intent.json`, `action-plan.json`
- `pro-prompt.md`, `flash-review.json`
- `final-executor-prompt.md`, `execution-summary.json`
- `final-report.md`

## Behavior Authority

Full pipeline behavior, schemas, transport config, and safety rules in `.claude/skills/deepseek-workhorse/SKILL.md`.
