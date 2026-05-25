---
name: pattern-mirror-core
description: Artifact perception, pattern extraction, weakness detection, and yuri-native reconstruction for Yuri OS / Nudimmud. Inspired by Sharingan / Copy Technique, translated into enterprise-safe system behavior.
version: 1.0.0
status: active
enterprise_ready: true
non_destructive_default: true
triggers:
  - "/yuri pattern-mirror"
  - "/pattern-mirror"
  - "/pmc"
requires:
  - enterprise-control-plane
  - audit-events
  - rollback-policy
---

# Pattern Mirror Core Skill

## When to use

Use this skill when the user asks Yuri OS / Nudimmud to perform work involving:

- repo
- document
- pdf
- prompt
- codebase
- system_spec
- workflow
- memory_log

Also use it when the active task matches this operating principle:

> Observe an external or internal artifact, extract its useful operating patterns, detect prerequisites and flaws, then rebuild a safer, stronger, Yuri-native version without blind copying.

## When not to use

Do not use this skill when:

- the task is trivial and does not need system-level treatment
- no target, goal, or evidence source is available
- the user explicitly requests no architectural expansion
- the task would require destructive action without approval
- the extension would duplicate an already active domain without adding value

## Trigger phrases

- "run pattern-mirror-core"
- "use Pattern Mirror Core"
- "turn this into Yuri OS DNA"
- "analyze and integrate this safely"
- "enterprise-ready extension"
- "non-destructive implementation plan"
- "bake this into the system"

## Required inputs

```yaml
input:
  goal: string
  artifact_type: repo | document | pdf | prompt | codebase | system_spec | workflow | memory_log
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
  extension_id: "pattern-mirror-core"
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

1. Intake and provenance capture.
2. Artifact decomposition.
3. Pattern extraction.
4. Prerequisite detection.
5. Weakness and gap scan.
6. Yuri-native reconstruction.
7. Safety review.
8. Implementation plan.
9. Memory update proposal.

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
  extension_id: "pattern-mirror-core"
  halt_reason: string
  completed_steps: []
  missing_inputs: []
  safety_concerns: []
  partial_outputs: []
  recommended_next_action: string
```

## Examples

```bash
/yuri pattern-mirror --target ./repo --mode audit --enterprise --non-destructive
/yuri pattern-mirror --target ./docs/system.md --mode integration --stage-only
/yuri pattern-mirror --target ./memory/session-journal.md --mode audit --no-mutation
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
  1. Replaced `primary_command: /yuri pattern-mirror` with `triggers: ["/yuri pattern-mirror", "/pattern-mirror", "/pmc"]`
  2. Changed `status: proposed` → `status: active`
  3. Added `## Session Notes` section (required by `.Codex/rules/skill-creation.md`)
- **Validation:** Schema now matches NUDIMMUD skill-creation checklist
- **Status:** Ready for command file registration
