---
name: design-source-pack
description: "Turn a design system or design reference into a reusable pack and portable skill. Use when extracting visual language from docs, PDFs, or curated design sources into a build/style/audit workflow."
---

# Design Source Pack

Use this skill when the task is to convert a design reference into a reusable skill and reference pack.

## Focus

- Treat design systems as reusable packs.
- Extract a compact visual language, not a giant asset dump.
- Keep the workflow build -> style -> audit.
- Use `DESIGN.md`-style source of truth when available.

## Output

- Portable design skill notes.
- Reusable design-system summary.
- Audit criteria and usage rules.

## Rules

- Keep the pack concise.
- Prefer stable design archetypes over one-off visuals.
- Preserve compatibility with multiple agent surfaces.
- Load the source pack FIRST for any design / motion / branding / experiential UI task. Skip for non-design prompts.
- Local docs win on conflict with upstream READMEs.
- React-three-fiber stays last-resort only — never default to it when ShaderGradient / liquid-glass-js fits.
- License-check before integration: liquid-logo is PolyForm Shield 1.0.0 (restrictive — demo only, real lib is `@paper-design/shaders-react`); ShaderGradient license unconfirmed (no LICENSE file at repo root, MIT-likely per npm); liquid-glass-js MIT; react-three-fiber MIT.

## Source Pack — Selection Matrix (PATCH 023 wave)

Canonical source: `design-uiux-knowledge-base/graph.json` (node IDs below) + `design-memory.json` (rules).

| Task | Primary | Secondary | Fallback |
|---|---|---|---|
| Ambient hero / motion background | **ShaderGradient** (`repo_shadergradient`) | react-three-fiber (`repo_react_three_fiber`) | none |
| Logo / brand treatment | **liquid-logo** (`repo_liquid_logo`) — inspiration only | ShaderGradient for inspiration only | none — use `@paper-design/shaders-react` for production |
| Glass UI prototype | **liquid-glass-js** (`repo_liquid_glass_js`) | ShaderGradient (atmosphere) | react-three-fiber (custom scene only) |
| Custom 3D scene | **react-three-fiber** (`repo_react_three_fiber`) | ShaderGradient / liquid-glass-js (effect refs) | none |

### Symbiotic-Pulse Preflight (every design task)

Before invoking any source, run this 5-step check:
1. **Source** — Which entry in the source pack maps to this task? (Selection Matrix above)
2. **Intent** — Production code, prototype, or inspiration only?
3. **Risk** — License compatible? React/Three.js version compatible? Production-readiness sufficient?
4. **Evidence** — Local docs vs upstream README — local wins; cite both.
5. **Action** — Implement per Primary; document Fallback condition in code comments.

### Out-of-scope (skip the pack)

- Non-design prompts (backend, infra, copy, data, etc.)
- Pure typography tasks (use `frontend-design` skill instead)
- Existing-component refactors (use `design-master` for memoryful design decisions)

### Related skills
- `frontend-design` — Anthropic's intentional design system enforcement
- `design-master` — design-memory-aware iterative design
- `graphify` — turn the source pack into knowledge graph for other agents

## Session Notes

### 2026-05-14
- session: 55m | peak ctx: 0% | compacts: 0
- tools: Bash×91, Read×25, TodoWrite×9, Edit×6, WebFetch×5, Write×4, Agent×2, ExitPlanMode×2, mcp×1, ToolSearch×1, AskUserQuestion×1
- corrections: none
- errors: none

### 2026-05-14
- session: 48m | peak ctx: 0% | compacts: 0
- tools: Bash×88, Read×23, TodoWrite×8, Edit×6, WebFetch×5, Write×4, Agent×2, ExitPlanMode×2, mcp×1, ToolSearch×1, AskUserQuestion×1
- corrections: none
- errors: none

### 2026-04-27
- session: 6m | peak ctx: 53% | compacts: 0
- tools: Read×27, Bash×8, Write×2, mcp×1
- corrections: none
- errors: none

### 2026-04-27
- session: 3m | peak ctx: 35% | compacts: 0
- tools: Bash×6, Read×4, mcp×3, Write×1
- corrections: none
- errors: none

### 2026-04-27
- session: 8m | peak ctx: 50% | compacts: 0
- tools: Read×41, Bash×15, Write×5, Agent×1
- corrections: none
- errors: none
