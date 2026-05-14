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

## Phase 2 — Spec Authoring (DeepSeek auto-fill, then user review)

Generate `specs/active/<slug>.md` where:
- `<slug>` = `slugify(feature_title).slice(0, 40)` — kebab-case, lowercase

**Auto-fill via DeepSeek-with-tools** (C7 from plan — saves manual section drafting):

```bash
bash Scripts/offload.sh -m deepseek-v4-pro --reasoning high "$(cat <<PROMPT
Use your tools (read_file, bash) to autonomously draft a NUDIMMUD spec for: <feature_title>

PATTERN-MIRROR FIRST: scan codebase for similar prior implementations
(use bash + grep to find related files, then read_file the top 3-5 most relevant ones)

THEN write_file specs/active/<slug>.md with this structure (fill EVERY section
with concrete content; mark unknowns as [TBD: <specific question>]):

- Title + one-line summary
- Goal (deterministic outcome — what success looks like)
- Non-goals (explicit out-of-scope to prevent scope creep)
- Stakeholders (who benefits, who reviews)
- Acceptance criteria (testable bullets — each becomes a task scaffold)
- Constraints (T7 paths NEVER touch, protected surfaces, anime DNA gates apply)
- Risks (with likelihood + mitigation)
- Open questions (require user input before implementation)

Reference any existing patterns from the codebase scan with file:line citations.
PROMPT
)"
```

After DeepSeek writes the draft, present the spec to user with summary of [TBD] markers.
User reviews, edits inline, then proceeds to Phase 3.

**Manual fallback** (if DeepSeek unavailable or user prefers): main thread fills the same template structure interactively with the user.

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
