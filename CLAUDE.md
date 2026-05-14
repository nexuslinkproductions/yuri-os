# NUDIMMUD Operational Protocol

INHERIT: ./_SYSTEM/yuri-origin.md
INHERIT: ./SOUL.md

## CLAUDE-SPECIFIC DIRECTIVES

## CLAUDE_ULTRA_CONTROL_PLANE

Claude Code is the control plane. It may plan, route, review, and integrate, but every direct implementation move must be bounded by a packet before mutation.

### CLAUDE CONTROL PACKET

Use this packet for direct Claude control-plane work:

```
## CLAUDE CONTROL PACKET

**Goal:** <one-sentence outcome>

**Target files:**
- <path> - <reason>

**Constraints:**
- <scope boundary>
- <no-touch paths or dependencies>

**Acceptance criteria:**
- [ ] <deterministic check>

**Test command:** `<command>`

**Rollback boundary:** `<git diff boundary>`

**Route-plan classification:** `<Scripts/ai route-plan evidence summary>`

**GitNexus impact:** `<required before symbol edits>`

**Verification before merge/promotion:** `<tests, GitNexus detect_changes, review gate>`
```

Codex dispatch remains governed by `CODEX_PROTOCOL.md` and must include `## CODEX TASK SPEC`. Claude inherits that discipline but uses the broader packet above for direct control-plane work.

### Gate Rules

- Direct `Write`, `Edit`, `MultiEdit`, risky `Bash`, or implementation `Agent` use without a packet should trigger a warn-first protocol gate.
- Codex-bound commands such as `codex exec`, `Scripts/ai codex`, `codex-spark`, or `Scripts/codex-offload-runner.mjs` require a valid `## CODEX TASK SPEC`.
- Protocol, routing, memory, promotion, Protected Paths, or high-stakes work requires `Scripts/ai route-plan` evidence and explicit DeepSeek/symbioticPulse advisory expectations.
- Run GitNexus impact before symbol edits and `gitnexus_detect_changes` before merge or promotion review.
- Hermes and Argus native gates stay always-on. Obliteratus is required for high-risk protocol, promotion, governance, sandbox, protected-path, or canonical memory work.
- OpenClaw is bridge-only advisory research in v1. It is not direct code-edit authority and not canonical memory authority without local verification.
- Existing hard-blocks for secrets, destructive commands, and protected surfaces stay owned by `bash-security-guard.js`.

### END OF TRANSMISSION (Global Session-Close Command - Full Auto)

Continuous background reflection engine with two modes:
- **Micro-EOT** (auto-triggered mid-session): background Haiku workers, runs checkpoint reflection phases only, unblocks main thread
- **Full EOT** (manual `/eot`): complete 9-phase evidence-based pipeline

When the user says `end of transmission` (exact or semantic), stop implementation work and enter **End-of-Session Reflection Mode** in **full auto execution**.

Load and execute the `end-of-transmission` skill (`.claude/skills/end-of-transmission/SKILL.md`). Also invokable as `/eot` or `/end-of-transmission`.

This command is deliberate pre-authorization for the entire EOT pipeline. Do not pause for confirmation, format selection, approval to proceed, or mid-pipeline review. Run the full 9-phase evidence-based reflection pipeline uninterrupted. All mechanical work may be offloaded to Haiku workers (`run_in_background: true`). Main thread performs final synthesis directly from worker outputs. If an action is blocked by platform permissions, log it as blocked, produce a patch proposal, and continue. Protected areas remain untouched regardless of full-auto permission.

The `/eot` alias is defined in `./.claude/commands/eot.md`.

### Agent Creation Validation (EOT Patch 001)

When creating or batch-creating subagent definition files:
1. After creation, verify model IDs match canonical strings: `grep -h "^model:" ~/.claude/agents/*.md | sort | uniq`
2. Confirm all files have `model:` and `description:` fields present and non-empty
3. Only mark agents as "created and verified" after both checks pass

This prevents silent mismatches like `claude-haiku-3-5` (wrong) vs `claude-haiku-4-5-20251001` (correct).

### Risk Escalation Clarity (EOT Patch 002)

When deferring a system-level change, log the escalation explicitly:
```
ESCALATION: [file/setting] - deferred. Reason: [specific impact]. Scope: [global/project/session]. Approval: [who].
```

Not: "This is too risky."
Yes: "Changes global model default for all sessions; requires explicit user approval."

This ensures session handoff is clear and future readers understand the decision boundary.

<!-- gitnexus:start -->
# GitNexus — Code Intelligence

This project is indexed by GitNexus as **nudimmud-vault** (93054 symbols, 134029 relationships, 300 execution flows). Use the GitNexus MCP tools to understand code, assess impact, and navigate safely.

> If any GitNexus tool warns the index is stale, run `npx gitnexus analyze` in terminal first.

## Always Do

- **MUST run impact analysis before editing any symbol.** Before modifying a function, class, or method, run `gitnexus_impact({target: "symbolName", direction: "upstream"})` and report the blast radius (direct callers, affected processes, risk level) to the user.
- **MUST run `gitnexus_detect_changes()` before committing** to verify your changes only affect expected symbols and execution flows.
- **MUST warn the user** if impact analysis returns HIGH or CRITICAL risk before proceeding with edits.
- When exploring unfamiliar code, use `gitnexus_query({query: "concept"})` to find execution flows instead of grepping. It returns process-grouped results ranked by relevance.
- When you need full context on a specific symbol — callers, callees, which execution flows it participates in — use `gitnexus_context({name: "symbolName"})`.

## Never Do

- NEVER edit a function, class, or method without first running `gitnexus_impact` on it.
- NEVER ignore HIGH or CRITICAL risk warnings from impact analysis.
- NEVER rename symbols with find-and-replace — use `gitnexus_rename` which understands the call graph.
- NEVER commit changes without running `gitnexus_detect_changes()` to check affected scope.

## Resources

| Resource | Use for |
|----------|---------|
| `gitnexus://repo/nudimmud-vault/context` | Codebase overview, check index freshness |
| `gitnexus://repo/nudimmud-vault/clusters` | All functional areas |
| `gitnexus://repo/nudimmud-vault/processes` | All execution flows |
| `gitnexus://repo/nudimmud-vault/process/{name}` | Step-by-step execution trace |

## CLI

| Task | Read this skill file |
|------|---------------------|
| Understand architecture / "How does X work?" | `.claude/skills/gitnexus/gitnexus-exploring/SKILL.md` |
| Blast radius / "What breaks if I change X?" | `.claude/skills/gitnexus/gitnexus-impact-analysis/SKILL.md` |
| Trace bugs / "Why is X failing?" | `.claude/skills/gitnexus/gitnexus-debugging/SKILL.md` |
| Rename / extract / split / refactor | `.claude/skills/gitnexus/gitnexus-refactoring/SKILL.md` |
| Tools, resources, schema reference | `.claude/skills/gitnexus/gitnexus-guide/SKILL.md` |
| Index, status, clean, wiki CLI commands | `.claude/skills/gitnexus/gitnexus-cli/SKILL.md` |

<!-- gitnexus:end -->
