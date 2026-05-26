# PRISM Workbench v1 Handoff

PRISM v1 is the c2moviez Sales Engagement Workbench: today-first, source-aware, compliance-safe, and built for Fanny's daily acquisition loop.

## TL;DR

- PRISM is not a CRM. It is a premium internal operator surface for manual outreach work.
- The campaign is already defined in `_SYSTEM/campaigns/c2moviez-acquisition-workbench/03-execution-plan.md` and `04-acceptance-checklist.md`.
- Claudio's next job is to orient, confirm the current state, then choose the next highest-leverage slice before implementing anything.

## 5-Minute Orientation

Read in this order:

1. `docs/03-execution-plan.md` - campaign goals and phase order
2. `POSTMORTEM_FILLED.md` - current state, open threads, and what is already known
3. `ARCHITECTURE.md` - system map and implementation shape
4. `docs/04-acceptance-checklist.md` - what "done" means for v1

If you only have time for one pass, read the execution plan and acceptance checklist first.

## File Tour

| Directory | Contents | Purpose |
| --- | --- | --- |
| `docs/` | Campaign docs, acceptance notes, doctrine, decisions, postmortem | Source of truth for goals, constraints, and done criteria |
| `backend/` | Service-layer notes, API contracts, server-side work items | Where state, compliance, and send-gate behavior belong |
| `frontend/` | UI notes, screen structure, visual decisions, interaction details | Where Today view, dossier, drafts, and operator flow live |
| `scripts/` | Validation, checks, local utilities, regression helpers | Where repeatable proof and guardrails live |
| `memory/` | Session notes, decisions, thread summaries, carry-forward context | Where Claudio can preserve what matters between Claude sessions |

## Fresh Claude Code Session

Start with `ONBOARDING_PROMPT.md`.

That prompt is written as a literal paste-into-Claude starting point for a clean session.

## Hard Rules

Carry the operating rules in `HARD_RULES.md` into every Claude session that touches PRISM.

These rules are not decorative. They govern mutation routing, agent use, and safety boundaries.

## Environment

Use `ENV_CHECKLIST.md` to discover the environment shape and prepare a local `.env` without leaking real secrets.

The checklist intentionally uses placeholders only.

## Open Threads

See `POSTMORTEM_FILLED.md`, especially the section titled `Open Threads for Claudio`.

That section should be the active backlog for the takeover.

## Contact

Marcel Spatz  
Nexus Link Productions  
contact@nexuslinkproductions.com

## Notes for Claudio

PRISM is a partner handoff, not a greenfield build.

Keep the current language, decisions, and safety posture intact unless a follow-up spec explicitly changes them.

If a file seems to contradict another, prefer the campaign docs and the hard rules before improvising.

