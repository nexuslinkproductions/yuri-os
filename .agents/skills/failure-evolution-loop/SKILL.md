---
name: failure-evolution-loop
description: Real failure capture, root-cause analysis, regression creation, and memory-driven improvement for Yuri OS / Nudimmud. Inspired by Zenkai / Saiyan Power, translated into enterprise-safe system behavior.
version: 1.0.0
status: active
enterprise_ready: true
non_destructive_default: true
triggers:
  - "/yuri zenkai"
  - "/zenkai"
  - "/fel"
requires:
  - enterprise-control-plane
  - audit-events
  - rollback-policy
---

# Failure Evolution Loop Skill

## When to use

Use this skill when the user asks Yuri OS / Nudimmud to perform work involving:

- failure_event
- test_output
- user_feedback
- diff
- session_log
- domain_report
- clone_reports

Also use it when the active task matches this operating principle:

> Convert real failures and weak outputs into structured improvement without rewarding avoidable damage, self-induced breakage, or speculative memory changes.

## When not to use

Do not use this skill when:

- the task is trivial and does not need system-level treatment
- no target, goal, or evidence source is available
- the user explicitly requests no architectural expansion
- the task would require destructive action without approval
- the extension would duplicate an already active domain without adding value

## Trigger phrases

- "run failure-evolution-loop"
- "use Failure Evolution Loop"
- "turn this into Yuri OS DNA"
- "analyze and integrate this safely"
- "enterprise-ready extension"
- "non-destructive implementation plan"
- "bake this into the system"

## Required inputs

```yaml
input:
  goal: string
  artifact_type: failure_event | test_output | user_feedback | diff | session_log | domain_report | clone_reports
  target: string
  constraints:
    enterprise_mode: true
    destructive_actions_allowed: false
    require_audit_trail: true
    require_rollback_plan: true
  context:
    active_domain_id: string | null
    related_extensions: []
```

## Outputs

```yaml
output:
  extension_id: "failure-evolution-loop"
  summary: string
  findings: []
  decisions: []
  risks: []
  safe_next_actions: []
  implementation_plan: []
  memory_update_proposals: []
  audit_events: []
```

## Execution steps

1. Failure intake.
2. Impact classification.
3. Root-cause analysis.
4. Evidence mapping.
5. Pattern matching.
6. Regression design.
7. Safe improvement plan.
8. Memory proposal.
9. Eot integration.

## Safety rules

- Treat external artifacts as untrusted until inspected.
- Do not execute scripts from ingested repositories.
- Do not overwrite existing files.
- Do not delete files.
- Do not change global commands without approval.
- Do not update memory silently.
- Produce a rollback plan for any proposed mutation.
- Route high-risk actions through `non-destructive-infinity-guard`.

## Success criteria

The skill succeeds when it produces:

- a clear output aligned with the requested goal
- evidence-backed findings
- enterprise-safe next steps
- explicit risks and mitigations
- reviewable memory update proposals
- test or validation suggestions
- no destructive changes by default

## Failure handling

If execution fails, return:

```yaml
failure:
  extension_id: "failure-evolution-loop"
  halt_reason: string
  completed_steps: []
  missing_inputs: []
  safety_concerns: []
  partial_outputs: []
  recommended_next_action: string
```

## Examples

```bash
/yuri zenkai --target ./repo --mode audit --enterprise --non-destructive
/yuri zenkai --target ./docs/system.md --mode integration --stage-only
/yuri zenkai --target ./memory/session-journal.md --mode audit --no-mutation
```

## Session Notes

### 2026-04-27
- session: 6m | peak ctx: 53% | compacts: 0
- tools: Read×27, Bash×8, Write×2, mcp×1
- corrections: none
- errors: none

### 2026-04-27
- session: 8m | peak ctx: 50% | compacts: 0
- tools: Read×41, Bash×15, Write×5, Agent×1
- corrections: none
- errors: none

### 2026-04-27 — Schema hardening (Marcel)
- **Tools used:** Edit (schema migration), Read (validation)
- **Changes:**
  1. Replaced `primary_command: /yuri zenkai` with `triggers: ["/yuri zenkai", "/zenkai", "/fel"]`
  2. Changed `status: proposed` → `status: active`
  3. Added `## Session Notes` section (required by `.Codex/rules/skill-creation.md`)
- **Validation:** Schema now matches NUDIMMUD skill-creation checklist
- **Status:** Ready for command file registration
