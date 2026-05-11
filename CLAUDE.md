# NUDIMMUD Operational Protocol

INHERIT: ./OPERATOR_PROTOCOL.md
INHERIT: ./SOUL.md
INHERIT: _SYSTEM/yuri-origin.md

## CLAUDE-SPECIFIC DIRECTIVES

### END OF TRANSMISSION (Global Session-Close Command — Full Auto)

Continuous background reflection engine with two modes:
- **Micro-EOT** (auto-triggered mid-session): background Haiku workers, runs checkpoint reflection phases only, unblocks main thread
- **Full EOT** (manual `/eot`): complete 9-phase evidence-based pipeline

When the user says `end of transmission` (exact or semantic), stop all implementation work and enter **End-of-Session Reflection Mode** in **full auto execution**.

Load and execute the `end-of-transmission` skill (`.claude/skills/end-of-transmission/SKILL.md`). Also invokable as `/eot` or `/end-of-transmission`.

This command is deliberate pre-authorization for the entire EOT pipeline. Do not pause for confirmation, format selection, approval to proceed, or mid-pipeline review. Run the full 9-phase evidence-based reflection pipeline uninterrupted. All mechanical work offloaded to Haiku workers (run_in_background: true). Main thread performs final synthesis directly from Haiku outputs — no Sonnet escalation. If an action is blocked by platform permissions, log it as blocked, produce a patch proposal, and continue. Protected areas (Conclave, secrets, T7, production code) remain untouched regardless of full-auto permission.

## General Conduct

Follow `OPERATOR_PROTOCOL.md` for operational priority, evidence handling, mutation safety, and verdict-first review outputs. Follow `SOUL.md` for persona, tone, and brain-dump decoding. Do not restate those rules here.

## Offload Routing

Default to the smallest useful lane before using the main model. This is automatic and triggerless; commands like `btw`, `/tokenmaxxing`, and explicit `@lane` mentions are compatibility aliases for the same contract.

- `reading`, `fetching`, `summarizing`, `extracting`, `listing`, `formatting` -> offload first
- `ambiguous reasoning`, `high-stakes judgment`, `final synthesis`, `safety-sensitive decisions` -> main model
- `simple shell/file operations` -> local deterministic tools first
- `protocol`, `IDE`, `agent harness`, `workflow`, and `routing` changes -> update `Scripts/offload-contract.mjs` first, then sync inheriting rule surfaces
- `./Scripts/ai route-plan "<request>"` returns lane, lifecycle scenario, DeepSeek advisory decision, and learning capture fields from `Scripts/offload-contract.mjs`
- `./Scripts/ai auto "<request>"` applies the shared contract and dispatches automatically
- DeepSeek V4 Flash/Pro are advisory only; discard output that lacks exact evidence, conflicts with local proof, expands scope, or proposes forbidden operations

## Tool Routing Discipline — HARD ENFORCED

Before any Agent() call, attempt with local tools first.

Local tools suffice for:
- **File reads & inventory**: Use `Read`, `Bash find/grep/ls`
- **Directory exploration**: Use `Bash find`, `Bash tree`, `Bash ls -R`
- **Extraction & parsing**: Use `Bash grep/sed/awk`, `Read` multiple files, then synthesize locally
- **Markdown cleanup & normalization**: `gpt-5.3-codex-spark` is OK if ≥5 files; single file -> local tool

Escalate to Agent only when:
- Task requires cross-file reasoning
- Task involves subjective judgment
- Task requires synthesis beyond grep/find
- Local tool result is insufficient and Agent reasoning adds value

If a local lane can handle the work accurately, use it before a cloud model. Mechanical reads, inventories, extraction, and first-pass cleanup should stay local whenever possible.
Cost rule: file reads that consume 45k tokens via Agent can be done locally for <100 tokens.

## Agent & Escalation Protocols

### Agent Creation Validation (EOT Patch 001)

When creating or batch-creating subagent definition files:
1. After creation, verify model IDs match canonical strings: `grep -h "^model:" ~/.claude/agents/*.md | sort | uniq`
2. Confirm all files have `model:` and `description:` fields present and non-empty
3. Only mark agents as "created and verified" after both checks pass

This prevents silent mismatches like `claude-haiku-3-5` (wrong) vs `claude-haiku-4-5-20251001` (correct).

### Risk Escalation Clarity (EOT Patch 002)

When deferring a system-level change, log the escalation explicitly:
```
ESCALATION: [file/setting] — deferred. Reason: [specific impact]. Scope: [global/project/session]. Approval: [who].
```

Not: "This is too risky."
Yes: "Changes global model default for all sessions; requires explicit user approval."

This ensures session handoff is clear and future readers understand the decision boundary.

## Work Loop

- Parallelize independent tasks.
- Keep file boundaries explicit.
- Build first, then polish, audit, critique when the task spans multiple files.
- Verify locally before merge.

---

<!-- gitnexus:start -->
# GitNexus — Code Intelligence

This project is indexed by GitNexus as **nudimmud-vault** (76465 symbols, 107230 relationships, 300 execution flows). Use the GitNexus MCP tools to understand code, assess impact, and navigate safely.

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
