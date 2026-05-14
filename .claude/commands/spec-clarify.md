---
name: spec-clarify
description: DeepSeek-with-tools 1M-context audit pass on a spec — flags ambiguities, identifies missing acceptance criteria, surfaces hidden assumptions. Optional refinement layer between /spec-intake and Scripts/spec-pipeline.mjs.
triggers:
  - "/spec-clarify"
---

# /spec-clarify — Spec Ambiguity Audit (DeepSeek 1M context)

When invoked with a spec path (default: most recent in `specs/active/`), execute:

## Phase — Pattern-Mirror via DeepSeek-with-tools

```bash
bash Scripts/offload.sh -m deepseek-v4-pro --reasoning high "$(cat <<PROMPT
Use your tools (read_file, bash) to autonomously audit a NUDIMMUD spec.

Spec path: <path>

STEPS:
1. read_file the spec
2. read_file integrations/spec-kit/templates/spec-template.md to know the canonical structure
3. bash grep recent commits / similar specs in specs/done/ for prior patterns
4. read_file _SYSTEM/yuri-origin.md + memory/feedback_*.md for project rules

PRODUCE 4-section ambiguity audit (max 60 lines):

🔴 AMBIGUITY: phrases / requirements that could be interpreted multiple ways
🟡 MISSING ACCEPTANCE: implied requirements with no testable criterion
🟠 HIDDEN ASSUMPTION: things the spec assumes without stating
🟢 RISK ESCALATION: items that should be marked higher risk than current

Each finding: <one-line summary> + <suggested fix> + <confidence 0-1>

Conclude with VERDICT: GREEN (proceed to spec-pipeline), YELLOW (revise then proceed), RED (fundamental rewrite needed).
PROMPT
)"
```

## Phase — User Review

Present DeepSeek's audit verbatim. User decides:
- GREEN → proceed to `Scripts/spec-pipeline.mjs --spec <path>`
- YELLOW → user edits spec inline; re-run `/spec-clarify` to verify
- RED → user reconsiders feature scope; may discard the spec

## Authority Boundaries

- `/spec-clarify` is OPTIONAL between `/spec-intake` and `spec-pipeline.mjs`
- DeepSeek output is ADVISORY (per offload-contract: `model_output: advisory_only=true`)
- All anime DNA gates apply if the audit triggers any mutation (it shouldn't — this is read-only)

## When to Use

- Multi-stakeholder feature where ambiguity has high cost
- Spec drafted under time pressure (likely incomplete)
- Spec touches protected surfaces (Conclave, T7, secrets)
- Cross-codebase impact (multiple modules)

## When to Skip

- Single-file bounded fix (just go straight to dispatch)
- Spec already reviewed by user
- Bug fix with known root cause
