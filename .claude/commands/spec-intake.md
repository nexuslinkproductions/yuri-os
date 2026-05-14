---
name: spec-intake
description: Convert a feature idea into a NUDIMMUD-formatted spec using Spec Kit templates as advisory format. Spec written to specs/active/<slug>.md. Then user runs Scripts/spec-pipeline.mjs to generate plan + tasks.
triggers:
  - "/spec-intake"
  - "/spec"
---

# /spec-intake — Feature Spec Authoring

When invoked with a feature idea (e.g. `/spec-intake add auto-dark-mode toggle`), execute this workflow:

## Phase 1 — Pattern-Mirror (mandatory)

Before writing anything:

1. Run `mcp__obsidian-vault__rebuild_index` if palace stale (>7d)
2. Use DeepSeek-with-tools (1M ctx) to scan codebase for similar prior implementations:
   ```
   bash Scripts/offload.sh -m deepseek-v4-pro --reasoning high "scan codebase for existing <feature concept>; report files + functions; identify reuse opportunities"
   ```
3. Read `integrations/spec-kit/templates/spec-template.md` to understand the spec format
4. Read `_SYSTEM/spec-kit-workflow-bridge.md` to confirm authority chain

## Phase 2 — Spec Authoring

Generate `specs/active/<slug>.md` where:
- `<slug>` = `slugify(feature_title).slice(0, 40)` — kebab-case, lowercase
- Content follows `templates/spec-template.md` structure with these sections filled:
  - **Title** + one-line summary
  - **Goal** (deterministic outcome)
  - **Non-goals** (explicit out-of-scope)
  - **Stakeholders** (who benefits, who reviews)
  - **Acceptance criteria** (testable bullets — each becomes a task)
  - **Constraints** (T7 paths, protected surfaces, anime DNA gates)
  - **Risks** (with likelihood + mitigation)
  - **Open questions** (require user input before implementation)

## Phase 3 — Hand-off

After spec written:

1. Print: `✅ Spec written to specs/active/<slug>.md`
2. Print: `→ Next: node Scripts/spec-pipeline.mjs --spec specs/active/<slug>.md`
3. Do NOT auto-trigger spec-pipeline — user reviews spec first

## Authority Boundaries

- This command is a NUDIMMUD-native authoring helper that USES Spec Kit's spec-template.md format
- It does NOT invoke Spec Kit's Python `specify` CLI
- All anime DNA gates apply: pattern-mirror (Phase 1), execution-domain (Phase 2 acceptance criteria), infinity-guard (no live writes outside specs/active/)
- Codex remains primary co-pilot for any subsequent implementation
- DeepSeek-tools is the analysis engine for Phase 1 codebase scan

## Example Invocation

```
User: /spec-intake add health-check endpoint for backend
Claude:
  1. (Phase 1) DeepSeek scans backend/src/ for existing /health, /status, /ping
  2. (Phase 2) Writes specs/active/add-health-check-endpoint.md with all 8 sections
  3. (Phase 3) Reports path + next-step command
User: (reviews spec)
User: node Scripts/spec-pipeline.mjs --spec specs/active/add-health-check-endpoint.md
  → generates plan.md + tasks.md siblings
User: implements via Codex per tasks.md
```

## Storage Convention

- `specs/active/` — work-in-progress specs
- `specs/done/YYYY-MM/` — archived specs (move when all tasks committed)
- Both directories tracked by `.gitkeep` files
