---
tags:
  - research
  - governance
  - documentation
status: active
priority: high
kind: policy
---
# Research Governance

**Purpose:** Define how research is captured, validated, synthesized, and preserved.

---

## Mission

Research here exists to become durable knowledge. It should survive context loss, future audits, and handoff to another person without depending on memory.

## What Belongs Here

- Web research worth reusing later
- Source notes with URLs and access dates
- Claims that need verification
- Syntheses that combine several sources
- Decisions, recommendations, and rationale
- Watchlists for topics that need follow-up

## What Does Not Belong Here

- Loose brainstorming without sources
- Unattributed opinions presented as fact
- Temporary task chatter
- Secret material, credentials, or sensitive tokens
- Duplicate copies of the same source without added value

## Evidence Hierarchy

Use the strongest source available:
- Primary source: official docs, papers, vendor pages, direct data, original filings
- Secondary source: reputable analysis, documentation summaries, expert reporting
- Tertiary source: aggregation, discussion, forum context

When sources conflict, preserve the conflict and note why.

## Source Grading

- A: Primary, current, directly relevant, attributable
- B: Credible secondary, recent, mostly direct
- C: Useful but indirect, partial, or dated
- D: Weak, anecdotal, or not independently supported

If a note uses grade C or D material, it should say so explicitly.

## Fact Discipline

Write the difference between:
- Fact: directly supported by the source
- Inference: your interpretation of the fact
- Hypothesis: a plausible but unproven explanation
- Decision: a chosen action based on the evidence

Do not blur these together.

## Lifecycle

1. Intake: capture quickly, preserve source details.
2. Verification: check whether the claim is current and supportable.
3. Synthesis: combine multiple sources into a clearer view.
4. Decision: record what action or conclusion follows.
5. Archive: move closed work out of active attention.

## Required Fields For New Research Notes

- Title
- Status
- Date accessed or created
- Source or sources
- Key claim
- Evidence
- Confidence
- Next action

## Update Rules

- Never overwrite history when a note evolves; append dated updates.
- When a note changes meaning, add a revision note or changelog.
- If a source becomes stale, mark it stale instead of deleting it.
- Link to related material rather than duplicating entire sections.

## Retention

Keep durable research in `RESEARCH/` once it is mature enough to matter later.
Keep intake notes short-lived unless they are themselves useful reference material.

## Artifact Promotion

When research matures into a reusable behavior, it can become one of three things:
- a skill, when the pattern is mostly procedural and language-driven
- a tool, when the pattern benefits from deterministic code or repeatable automation
- both, when the skill needs a script or command surface to work correctly

Promote only when the evidence is stable:
- at least 3 supporting notes or executions
- clear repeated behavior
- low contradiction risk
- explicit owner or use case
- reviewable draft scope

Drafts are generated into `02_AREAS/skills/drafts/` first.
Only reviewed drafts should be copied into `.claude/skills/`.

## Review Cadence

- Weekly: clear intake and identify items worth synthesis
- Monthly: refresh active research and retire stale items
- Quarterly: review the library for gaps, duplication, and obsolete claims

## Respect Contract

This system deserves careful handling.
If a note is incomplete, say what is missing.
If a claim is uncertain, mark the uncertainty.
If a source is fragile, preserve enough context to re-derive the conclusion later.
