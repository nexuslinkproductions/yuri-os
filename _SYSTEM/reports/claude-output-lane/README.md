# Claude Output Lane

Status: active convention  
Owner: YURI control plane  
Purpose: sorted advisory output from persistent Claude lanes

This directory is the master output lane for Claude-produced material that Codex/main needs to inspect later.

It is not source truth. It is not runtime state. It is not a replacement for task-specific final artifacts.

## Sublanes

| Path | Output type |
| --- | --- |
| `ideas/` | Brainstorms, options, rough concepts |
| `plans/` | Implementation plans and phase maps |
| `findings/` | Bugs, risks, contradictions, audit findings |
| `draft-artifacts/` | Draft reports, specs, docs, summaries |
| `diff-proposals/` | Patch sketches and unified diffs not yet applied |
| `reviews/` | Pressure tests, critiques, second opinions |
| `questions/` | Open questions for owner or peer lanes |
| `decisions/` | Proposed decisions awaiting acceptance |
| `evidence/` | Bounded verification snippets and evidence candidates |
| `raw-captures/` | Sanitized excerpts only when no tighter category fits |

## Rule

Claude can write into a sublane only when the packet grants:

```text
CLAUDE_OUTPUT_LANE_ACTIVE
OUTPUT_SUBLANE=<sublane>
DRAFT_ARTIFACT_ALLOWED path=_SYSTEM/reports/claude-output-lane/<sublane>/<file>.md authority=proposal_only
```

Without that grant, Claude should return categorized output in the TUI response.

## Authority

Everything here is advisory until Codex/main verifies, integrates, or rewrites it into a canonical task artifact.

## Naming

```text
YYYY-MM-DD_<task-slug>_<lane>_<sublane>.md
```

Example:

```text
2026-05-28_context-router-adapter_quantum_plan.md
```

