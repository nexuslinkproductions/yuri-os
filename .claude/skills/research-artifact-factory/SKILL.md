---
name: research-artifact-factory
description: Convert mature research notes into draft Codex skills and supporting tool scaffolds. Use when a research thread has repeated stable behavior, enough evidence to justify reuse, and needs a reviewed draft before promotion into .claude/skills.
triggers:
  - "convert this research into a skill"
  - "promote research to skill"
  - "artifact-candidate"
scope: harness
invocation: ability
---

# Research Artifact Factory

Turn durable research into reusable automation, but keep the review gate intact.

## Use This Skill When

- a research thread keeps repeating the same procedure
- the behavior is stable enough to codify
- deterministic code would reduce errors or repetition
- the result should become a skill, a tool, or both

## Required Inputs

- `02_AREAS/research-intake/ARTIFACT-CANDIDATE.md`
- supporting research notes in `RESEARCH/` or `02_AREAS/research-intake/`
- an explicit artifact name
- an explicit kind: `skill`, `tool`, or `both`

## Creation Rule

Draft first. Publish later.

Generate into `02_AREAS/skills/drafts/<slug>/` before anything touches `.claude/skills/`.

## Workflow

1. Review the candidate note.
2. Confirm the evidence is stable and repeated.
3. Separate language-only guidance from code that should become a tool.
4. Draft the skill with one reusable job.
5. Draft the tool scaffold only when the workflow needs deterministic execution.
6. Record the evidence trail in `manifest.json`.
7. Do not promote without review.

## Draft Outputs

- `SKILL.md` with the reusable behavior, guardrails, and evidence trail
- `manifest.json` with candidate metadata and source note references
- `scripts/<tool>.js` when a deterministic command surface is needed

## Guardrails

- Never turn weak or contradictory research into a published skill.
- Never bundle unrelated behaviors into one artifact.
- Never skip the review queue.
- Keep tool scaffolds minimal and deterministic.

## Generator

Use the factory script:

```bash
node _SYSTEM/research-skill-factory/generate.js
```

Add `--watch` to keep drafts up to date while research changes.

## Session Notes

### 2026-04-27
- session: 6m | peak ctx: 53% | compacts: 0
- tools: Read×27, Bash×8, Write×2, mcp×1
- corrections: none
- errors: none

### 2026-04-26
- session: 7m | peak ctx: 0% | compacts: 0
- tools: Bash×15, Read×9, Write×4, Agent×1, ToolSearch×1, ExitPlanMode×1, Edit×1
- corrections: none
- errors: none
