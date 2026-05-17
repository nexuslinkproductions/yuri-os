---
name: deepseek-workhorse
description: "NUDIMMUD Workhorse X1 — DeepSeek-backed orchestration for structured reasoning, planning, and execution via forge/plan/execute pipeline."
triggers:
  - "/deepseek-workhorse"
  - "/ds-pro"
  - "/offload --reasoning high"
routing_note: "For direct lane routing (flash/pro/research) use /deepseek-offload. Workhorse adds forge→plan→execute orchestration on top."
---

# NUDIMMUD Workhorse X1

## How to invoke

DO NOT spawn an Agent. Run the workhorse script directly via Bash.

### Forge (rough idea → plan → review → execution)

```bash
node Scripts/nudimmud-workhorse.mjs forge --generate-plan "<rough idea>"
```

Flags:
| Flag | Purpose |
|------|---------|
| `--generate-plan` | Build intent + action plan + flash review (default for bare idea) |
| `--execute` | Actually run the planned actions |
| `--live` | Route schema generation through DeepSeek Pro |
| `--no-flash` | Skip flash review |

### Run from existing plan

```bash
node Scripts/nudimmud-workhorse.mjs run --plan <path-to-plan.json>
node Scripts/nudimmud-workhorse.mjs run --execute --plan <path-to-plan.json>
```

### Self-test

```bash
node Scripts/nudimmud-workhorse.mjs --selftest
```

## What happens

The workhorse:
1. Takes your rough idea
2. Builds a structured `intent.json` (signed with schema version)
3. Generates an `action-plan.json` (scoped steps with file boundaries)
4. Runs a flash review (risk audit via DeepSeek Flash)
5. Produces `final-executor-prompt.md`
6. Optionally executes actions via `yuri-guarded-executor.mjs`
7. Writes `final-report.md`

All artifacts go to `~/.nudimmud/workhorse-runs/<run-id>/`

## Pipeline Flow

```
Rough Idea → Intent (SEM/KV) → Action Plan (scoped steps)
  → Flash Review (risk audit) → Executor Prompt → Guarded Execution
```

## Safety

- **Tier-0 (read-only):** Allowed — read_file, list_directory, file_diff, git_log, status_check, run_command
- **Tier-1 (mutation):** Schema-defined but BLOCKED at runtime
- **Path safety:** No absolute paths, no `..`, no `.git`/`.env` access
- **Forbidden commands:** rm, sudo, chmod, docker, pip install — blocked by executor

## Artifacts

| File | Contents |
|------|----------|
| `intent.json` | Structured intent (schema: `intent-schema.json`) |
| `action-plan.json` | Execution plan (schema: `deepseek-action-schema.json`) |
| `flash-review.json` | Flash risk review |
| `final-executor-prompt.md` | Aggregated executor prompt |
| `execution-summary.json` | Post-execution summary |
| `final-report.md` | Human-readable report |

## Example

```
/deepseek-workhorse forge "analyze what Obsidian cache/plugin state would break the vault load loop"
```

Equivalent Bash:
```bash
node Scripts/nudimmud-workhorse.mjs forge --generate-plan "analyze what Obsidian cache/plugin state would break the vault load loop"
```

## Dependencies

- Node.js 18+
- `Scripts/nudimmud-workhorse.mjs`
- `Scripts/offload-runner.mjs` — DeepSeek API transport
- `Scripts/yuri-guarded-executor.mjs` — guarded local runner
- `Scripts/deepseek-action-schema.json`
- `Scripts/intent-schema.json`

## Related

- `.claude/commands/deepseek-workhorse.md` — Claude Code command entry
- `.codex/config.toml` — Codex CLI skill registration

## Session Notes

### 2026-05-17
- session: 160m | peak ctx: 0% | compacts: 0
- tools: Bash×119, Read×52, Edit×34, Write×5, ToolSearch×2, mcp×1, ExitPlanMode×1, Skill×1
- corrections: none
- errors: none

### 2026-05-17
- session: 157m | peak ctx: 0% | compacts: 0
- tools: Bash×116, Read×52, Edit×34, Write×5, ToolSearch×2, mcp×1, ExitPlanMode×1, Skill×1
- corrections: none
- errors: none
