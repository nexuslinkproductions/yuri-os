---
name: parallel-clone-orchestrator
description: Retired skill tombstone. Do not invoke; use native planning plus llm-compat lanes for advisory work.
version: 1.0.1
status: retired
retired_on: 2026-06-07
replacement: "native planning + _SYSTEM/Scripts/llm-compat.sh / ai llm <lane>"
enterprise_ready: false
non_destructive_default: true
triggers: []
requires:
  - enterprise-control-plane
  - audit-events
  - rollback-policy
---

# Parallel Clone Orchestrator Skill (Retired)

## Retirement Notice

Retired on 2026-06-07 by owner directive. Do not route work through clone orchestration, `/pco`, `/clone`, or this skill. Complex decomposition now stays in the native planning session; advisory model calls go through the LLM compatibility lane only. DeepSeek specifically uses `ai llm deepseek ...`, `_SYSTEM/Scripts/llm-compat.sh`, or `llm-lane.mjs deepseek`.

## When to use

Do not use this skill. Historical material below is retained only to explain what was retired:

- domain_manifest
- task_breakdown
- clone_budget
- agent_roles
- source_artifacts
- output_contract

Also use it when the active task matches this operating principle:

> Split complex work into specialized sub-agents with bounded budgets, clear output contracts, evidence requirements, and a merge protocol that reconciles contradictions before action.

## When not to use

Do not use this skill when:

- the task is trivial and does not need system-level treatment
- no target, goal, or evidence source is available
- the user explicitly requests no architectural expansion
- the task would require destructive action without approval
- the extension would duplicate an already active domain without adding value

## Retired Trigger Phrases

These phrases used to activate the skill. They are no longer active triggers. Use native planning plus explicit llm-compat advisory lanes instead.

## Required inputs

```yaml
input:
  goal: string
  artifact_type: domain_manifest | task_breakdown | clone_budget | agent_roles | source_artifacts | output_contract
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
  extension_id: "parallel-clone-orchestrator"
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

1. Task decomposition.
2. Clone role assignment.
3. Budget allocation.
4. Parallel execution.
5. Evidence collection.
6. Contradiction detection.
7. Synthesis.
8. Merge decision.
9. Clone memory distillation.

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
  extension_id: "parallel-clone-orchestrator"
  halt_reason: string
  completed_steps: []
  missing_inputs: []
  safety_concerns: []
  partial_outputs: []
  recommended_next_action: string
```

## Examples

No active examples. This skill is retired; use native planning plus explicit llm-compat advisory lanes.

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
  1. Replaced `primary_command: /yuri clone` with `triggers: ["/yuri clone", "/clone", "/pco"]`
  2. Changed `status: proposed` → `status: active`
  3. Added `## Session Notes` section (required by `.Codex/rules/skill-creation.md`)
- **Validation:** Schema now matches NUDIMMUD skill-creation checklist
- **Status:** Ready for command file registration
