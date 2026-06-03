---
name: claude-output-lane
description: Use whenever Claude produces reusable output inside YURI-OS-MUSUBI, including plans, ideas, findings, reviews, draft artifacts, diff proposals, questions, decisions, or evidence packets that Codex/main must later inspect.
---

# Claude Output Lane

Use this skill to keep Claude output separated by type instead of mixing plans, findings, ideas, drafts, and review notes in one transcript.

## Master Lane

The persistent master lane is:

```text
_SYSTEM/reports/claude-output-lane/
```

This is a report/output lane, not source truth and not runtime state.

Claude output remains advisory until Codex/main verifies and integrates it.

## Sublanes

| Sublane | Use for | Typical authority |
| --- | --- | --- |
| `ideas/` | Brainstorms, options, design alternatives, rough concepts | proposal_only |
| `plans/` | Ordered implementation plans, phase maps, task packets | proposal_only |
| `findings/` | Bugs, risks, audit observations, contradictions | advisory_finding |
| `draft-artifacts/` | Draft reports, specs, docs, PR text, summaries | proposal_only |
| `diff-proposals/` | Unified diffs or patch sketches not yet applied | proposal_only |
| `reviews/` | Pressure tests, code reviews, plan reviews, second opinions | advisory_review |
| `questions/` | Open questions for owner, Codex, Prime, or Quantum | open_item |
| `decisions/` | Proposed decisions requiring owner/Codex acceptance | proposed_decision |
| `evidence/` | Bounded command output, screenshots notes, verification snippets | evidence_candidate |
| `raw-captures/` | Sanitized transcript excerpts when category is unclear | raw_advisory |

Do not put everything in `raw-captures/`. Use it only as a fallback.

## File Naming

Use:

```text
YYYY-MM-DD_<task-slug>_<lane>_<sublane>.md
```

Examples:

```text
2026-05-28_search-adapter_quantum_plan.md
2026-05-28_search-adapter_prime_review.md
2026-05-28_plugin-bridge_quantum_ideas.md
```

## Packet Contract

When Claude may write into this lane, the packet must include:

```text
CLAUDE_OUTPUT_LANE_ACTIVE
OUTPUT_SUBLANE=<ideas|plans|findings|draft-artifacts|diff-proposals|reviews|questions|decisions|evidence|raw-captures>
DRAFT_ARTIFACT_ALLOWED path=_SYSTEM/reports/claude-output-lane/<sublane>/<file>.md authority=proposal_only
```

If the packet does not include `DRAFT_ARTIFACT_ALLOWED`, Claude should return the categorized output in the TUI response instead of writing a file.

## Category Header

Every durable output file should start with:

```markdown
# <Title>

source_lane: Claude/<Sonnet|Opus>
private_lane: <Quantum Rick|Rick Prime|none>
output_sublane: <sublane>
authority: proposal_only
task: <task>
date: YYYY-MM-DD
codex_status: pending_review
```

## Mutation Boundary

Writing to the Claude output lane is not the same as source mutation.

Allowed with the proper packet:

- draft reports
- plan files
- review files
- idea files
- findings files
- diff proposals

Still requires explicit separate authorization:

- source code edits
- YURI core edits
- deploy config edits
- credentialed tool use
- live service calls
- GitHub/cloud/app connector actions
- commits or pushes

## Codex Review Flow

Codex/main should consume the lane by category:

1. Read `findings/` before summaries.
2. Read `reviews/` before accepting plans.
3. Read `plans/` before implementation.
4. Read `diff-proposals/` only as proposed patches.
5. Promote `draft-artifacts/` only after verification or rewrite.
6. Move final accepted truth into the task's canonical artifact path, not this lane.

## Failure Mode

If Claude writes the wrong category, Codex/main should leave the original intact and create or request a corrected categorized output. Do not silently merge unrelated output types.

## Session Notes

### 2026-06-03
- session: 1307m | peak ctx: 0% | compacts: 0
- tools: Edit×462, Read×351, Bash×259, WebFetch×99, WebSearch×92, StructuredOutput×29, ToolSearch×14, Workflow×5, Write×5, AskUserQuestion×1
- corrections: none
- errors: none

### 2026-06-02
- session: 61m | peak ctx: 0% | compacts: 0
- tools: Edit×263, Read×218, Bash×102, WebSearch×51, WebFetch×36, StructuredOutput×12, ToolSearch×7, Write×5, Workflow×2
- corrections: none
- errors: none
