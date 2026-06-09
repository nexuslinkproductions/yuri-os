---
name: organ-filing-assessor
description: "Deterministic, READ-ONLY placement assessor for YURI artifacts. As YURI grows, generated artifacts (research docs, /tmp scratch, memories, reports, lane outputs, telemetry) land in pools that aren't…"
triggers:
  - "organ-filing-assessor"
  - "how do I use filing-assessor"
  - "filing-assessor usage"
  - "filing-assessor guide"
  - "Filing Assessor (deterministic read-only placement + staleness)"
generated: true
source_node: "filing-assessor"
source_file: "_SYSTEM/Scripts/filing-assessor.mjs"
---

<!-- GENERATED from the canonical graph node "filing-assessor" (mechanism.guide) by _SYSTEM/Scripts/yuri-guide-project.mjs.
     DO NOT hand-edit — edit _SYSTEM/organ-guides.json, then run: node _SYSTEM/Scripts/yuri-guide-seed.mjs && node _SYSTEM/Scripts/yuri-guide-project.mjs -->

# Organ Guide — Filing Assessor (deterministic read-only placement + staleness)

**Module:** `_SYSTEM/Scripts/filing-assessor.mjs` · **Layer:** Self-Improvement · **Invocation:** both · **CLI:** `<path...> [--json]`

**Purpose.** Deterministic, READ-ONLY placement assessor for YURI artifacts. As YURI grows, generated artifacts (research docs, /tmp scratch, memories, reports, lane outputs, telemetry) land in pools that aren't clean enough. This is the ASSESSMENT half of the filing system: classify an artifact → its canonical zone, score purge candidates by hazard-decay staleness, and dedup. It RECOMMENDS; it never moves or deletes a file.

## Exports
- `ZONE_RULES (const)`
  - in: —
  - out: the closed-set ordered rules mapping a path → its canonical zone
- `classifyArtifact(filePath)`
  - in: a file path
  - out: the canonical zone the artifact belongs in (closed-set)
- `assess(filePath)`
  - in: a file path
  - out: { zone, current, misfiled, staleness, recommendation, advisory_only } — protected paths are vetoed (never recommended for move/purge)
- `stalenessScore(ageHours, halfLifeHours = 168)`
  - in: age in hours + optional half-life
  - out: a hazard-decay staleness score (math-kernel confidenceDecay)
- `assessAll(paths, opts = {})`
  - in: array of paths + opts
  - out: a sorted assessment report over all paths

## Security boundary
Strictly READ-ONLY — RECOMMENDS placement/purge, never moves or deletes (the mutation half is a separate owner-gated build). PROTECTED VETO (fail-closed): a protected/secret path is NEVER recommended for relocation or purge, even if misfiled (isProtectedPath is traversal-hardened). Deterministic: closed-set zone rules, sorted output, no RNG.

## When to use
Deciding where a generated artifact canonically belongs, finding misfiled files, or scoring stale purge candidates — to produce a report the OWNER acts on. Never to actually move/delete (that is owner-gated).

## Gotchas
- READ-ONLY by contract — it recommends; the actual relocate/purge is a separate owner-gated mutation half, not here.
- Protected/secret paths are NEVER recommended for move or purge, even when misfiled (fail-closed veto).
- Zone classification is a CLOSED ordered ruleset (ZONE_RULES) — an artifact matching no rule gets the default zone, not an error.

## Session Notes
- 2026-06-09 — generated from canonical node `filing-assessor`.mechanism.guide (source-grounded; export list hard-gated against the live module by yuri-guide-seed.mjs). Authored source: _SYSTEM/organ-guides.json.
