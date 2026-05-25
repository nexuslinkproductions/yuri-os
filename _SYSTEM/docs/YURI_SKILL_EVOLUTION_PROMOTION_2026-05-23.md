# YURI Skill Evolution Promotion

Date: 2026-05-23
Status: active concept migration
Owner: YURI control plane

## Purpose

YURI should keep the useful architecture patterns from retired research surfaces without preserving old subsystem identities in the active tree.

This document promotes the reusable parts into YURI-owned language:

- skills are versioned capabilities, not loose prompt files
- every skill has provenance, maturity, tests, and last-used evidence
- skill changes should leave a diffable trail
- useful outputs should feed memory/RAG only after verification
- dashboards are projections over registries, not sources of truth

## Skill Evolution Contract

Each durable skill should eventually expose:

- `name`
- `purpose`
- `trigger language`
- `required context`
- `forbidden context`
- `inputs`
- `outputs`
- `verification`
- `maturity`: `draft`, `usable`, `trusted`, `deprecated`
- `last_verified`
- `owner`

## Registry Pattern

The skill tree should be navigated by registry first, file tree second.

The active registry surfaces are:

- `skills/` for canonical root-visible YURI skills
- `.agents/` for agent recipes that reference skill IDs
- `.codex/skills/` for Codex-specific skills
- `_SYSTEM/Scripts/yuri-skill-loader.mjs` for load/validate behavior
- `_SYSTEM/Scripts/yuri-capability-census.mjs` for capability inventory
- `_SYSTEM/context/context-registry.json` for task-to-context packet selection

## Evolution Loop

1. Capture the real task and friction.
2. Identify whether an existing skill should be used, edited, split, or retired.
3. Update the skill or create a new one with narrow triggers.
4. Add a verification command or concrete checklist.
5. Record what changed in the registry or capability census.
6. Promote only after the skill succeeds in real use.

## Memory/RAG Integration

Skill memory should not become folklore.

Only promote:

- verified repeated user preferences
- proven workflows
- failures with reproducible fixes
- benchmark results tied to exact files or commands
- domain vocabulary that improves routing

Do not promote:

- one-off guesses
- stale tool identities
- provider-specific assumptions
- raw runtime logs
- secrets or protected state

## Visual/Operator Projection

The eventual YURI wiki and dashboards should display:

- active skills by domain
- maturity and last verification
- dependencies between skills
- recent failures and fixes
- suggested next improvements

Those projections must be generated from registry/source files, not maintained by hand as hidden truth.
