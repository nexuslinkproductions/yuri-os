---
name: Spec Kit Advisory Templates Only
description: Spec Kit at integrations/spec-kit/ provides format templates only; never overrides YURI routing, gates, or Codex-primary rule
type: feedback
---

# Rule: Spec Kit = Advisory Templates Only, Not Authority

**Set:** 2026-05-14
**Severity:** HARD ARCHITECTURAL RULE — applies to every Spec Kit interaction

## The Rule

The vendored Spec Kit at `integrations/spec-kit/` provides **format templates and methodology references only**. It is NEVER the authority for routing, implementation, verification, or memory.

## What's Allowed

✅ Read `integrations/spec-kit/templates/spec-template.md` to learn spec structure
✅ Read `integrations/spec-kit/templates/plan-template.md` to learn plan structure
✅ Read `integrations/spec-kit/templates/tasks-template.md` to learn task structure
✅ Read `integrations/spec-kit/spec-driven.md` for methodology background
✅ Use `/spec-intake` slash command (YURI-native authoring with Spec Kit format)
✅ Use `_SYSTEM/Scripts/spec-pipeline.mjs` to generate plan + tasks from a spec

## What's Forbidden

❌ Run `integrations/spec-kit/src/specify_cli/` Python typer CLI from YURI workflows
❌ Use Spec Kit's `scripts/{bash,powershell}/` shell implementations
❌ Adopt Spec Kit's `.github/workflows/` CI/CD
❌ Install Spec Kit as a dependency or `pip install`
❌ Let Spec Kit override `_SYSTEM/Scripts/offload-contract.mjs` routing
❌ Bypass anime DNA gates because Spec Kit "doesn't have them"
❌ Replace Codex-primary rule with Spec Kit's own implementer dispatch
❌ Use Spec Kit's `extensions/git/` (YURI has its own git/gitnexus discipline)
❌ Use Spec Kit's `presets/catalog.json` community extension index
❌ Treat Spec Kit's `AGENTS.md` as authority — YURI's `AGENTS.md` wins

## Authority Chain (per yuri-origin.md)

1. Owner intent
2. Direct local evidence
3. `_SYSTEM/yuri-origin.md`
4. `SOUL.md`
5. `AGENTS.md`, `CLAUDE.md`, `_SYSTEM/spec-kit-workflow-bridge.md` ← Spec Kit adapter sits here
6. `_SYSTEM/Scripts/offload-contract.mjs`
7. References / skills
8. Model inference

**Spec Kit operates at level 5 (thin adapter). It cannot override anything above it.**

## Workflow Mapping

Spec Kit phase → YURI universal workflow phase:

| Spec Kit | YURI |
|---|---|
| `/specify` | intake |
| `/clarify` | intake refinement |
| `/plan` | route + delegate setup |
| `/tasks` | delegate (per-task scope-lock) |
| `/analyze` | route (risk scoring) — optional |
| `/implement` | delegate (Codex/DeepSeek dispatch) |
| (none) | verify, merge, learn — YURI-only |

See `_SYSTEM/spec-kit-workflow-bridge.md` for the full mapping with phase ownership.

## Why Spec Kit Was Adopted At All

- Battle-tested spec/plan/task templates from external practitioners
- Provides shared vocabulary (`/specify`, `/plan`, `/tasks`) for cross-team work
- Documented Spec-Driven Development methodology (`spec-driven.md`)
- Vendored = no network/CI dependency; we own the snapshot

## When to Use vs Not

**Use Spec Kit format when:**
- Multi-task feature work that benefits from explicit spec phase
- Cross-functional handoff (sharing intent with non-Claude collaborators)
- Long-running feature where spec serves as anchor doc

**Skip Spec Kit and go direct when:**
- Single-file bounded fix (just dispatch Codex directly)
- Bug fix with clear root cause (failure-evolution loop covers it)
- Memory rule update (`memory/feedback_*.md` direct write)
- Hook config (.claude/settings.json edit)

## Storage

- `specs/active/<slug>.md` — work-in-progress
- `specs/done/YYYY-MM/<slug>/` — archived (with sibling plan + tasks) when implementation complete
- `.gitkeep` files maintain directory existence

## Evidence

- `integrations/spec-kit/YURI-ADOPTION.md` — original advisory-only declaration (pre-existing)
- `_SYSTEM/spec-kit-workflow-bridge.md` — operational bridge doc (this campaign)
- `.claude/commands/spec-intake.md` — entry-point slash command
- `_SYSTEM/Scripts/spec-pipeline.mjs` — spec → plan + tasks generator
- User instruction 2026-05-14: "Be specific about how users will invoke the workflow in this repo"
