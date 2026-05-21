---
name: execution-domain-core
description: Scoped execution environment, task policy, and exit criteria system for Yuri OS / Nudimmud. Inspired by Domain Expansion, translated into enterprise-safe system behavior.
version: 1.0.0
status: active
enterprise_ready: true
non_destructive_default: true
triggers:
  - "/yuri domain"
  - "/domain"
  - "/edc"
requires:
  - enterprise-control-plane
  - audit-events
  - rollback-policy
---

# Execution Domain Core Skill

## When to use

Use this skill when the user asks Yuri OS / Nudimmud to perform work involving:

- user_goal
- target_paths
- constraints
- allowed_tools
- risk_tolerance
- deadline_or_budget
- enterprise_requirements

Also use it when the active task matches this operating principle:

> Create a bounded task environment with explicit rules, allowed tools, target files, risk limits, evidence requirements, and exit criteria before serious work begins.

## When not to use

Do not use this skill when:

- the task is trivial and does not need system-level treatment
- no target, goal, or evidence source is available
- the user explicitly requests no architectural expansion
- the task would require destructive action without approval
- the extension would duplicate an already active domain without adding value

## Trigger phrases

- "run execution-domain-core"
- "use Execution Domain Core"
- "turn this into Yuri OS DNA"
- "analyze and integrate this safely"
- "enterprise-ready extension"
- "non-destructive implementation plan"
- "bake this into the system"

## Required inputs

```yaml
input:
  goal: string
  artifact_type: user_goal | target_paths | constraints | allowed_tools | risk_tolerance | deadline_or_budget | enterprise_requirements
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
  extension_id: "execution-domain-core"
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

1. Goal intake.
2. Domain boundary definition.
3. Policy selection.
4. Tool and file permission mapping.
5. Risk evaluation.
6. Execution contract creation.
7. Progress checkpoints.
8. Exit validation.
9. Domain closure report.

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
  extension_id: "execution-domain-core"
  halt_reason: string
  completed_steps: []
  missing_inputs: []
  safety_concerns: []
  partial_outputs: []
  recommended_next_action: string
```

## Examples

```bash
/yuri domain --target ./repo --mode audit --enterprise --non-destructive
/yuri domain --target ./docs/system.md --mode integration --stage-only
/yuri domain --target ./memory/session-journal.md --mode audit --no-mutation
```

## Session Notes

### 2026-04-27
- session: 6m | peak ctx: 53% | compacts: 0
- tools: Read×27, Bash×8, Write×2, mcp×1
- corrections: none
- errors: none

### 2026-04-27
- session: 1m | peak ctx: 40% | compacts: 0
- tools: Read×7, Bash×4, Edit×3
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
  1. Replaced `primary_command: /yuri domain` with `triggers: ["/yuri domain", "/domain", "/edc"]`
  2. Changed `status: proposed` → `status: active`
  3. Added `## Session Notes` section (required by `.Codex/rules/skill-creation.md`)
- **Validation:** Schema now matches NUDIMMUD skill-creation checklist
- **Status:** Ready for command file registration
