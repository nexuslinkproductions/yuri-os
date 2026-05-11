# NUDIMMUD Operational Protocol

INHERIT: ./_SYSTEM/yuri-origin.md
INHERIT: ./SOUL.md

## CLAUDE-SPECIFIC DIRECTIVES

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
