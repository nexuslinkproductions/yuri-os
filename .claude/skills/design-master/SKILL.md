---
name: design-master
description: "Single entry point for all YURI/Kagami visual work. Reads DESIGN.md v2 dual-namespace tokens (--yuri-hud-* / --yuri-kagami-*), design-memory.json surface discriminator, and component-catalog-2026. Dispatches implementation via Scripts/ai auto. Improves with every task via memory writes."
triggers:
  - "design this"
  - "make this look"
  - "style the"
  - "UI for"
  - "frontend design"
  - "HUD"
  - "component layout"
  - "visual revamp"
  - "build the UI"
  - "design the"
  - "redesign"
  - "CSS for"
  - "layout for"
  - "dashboard UI"
  - "interface for"
  - "visual design"
  - "make it look"
  - "design system"
  - "landing page"
  - "build a page"
  - "design the dashboard"
  - "color palette"
  - "dark theme"
  - "musubi brand"
  - "ember accent"
  - "build a report"
  - "html report"
  - "audit html"
  - "glassmorphism"
  - "atmosphere"
  - "depth"
  - "background depth"
  - "design the audit"
  - "kagami"
  - "operator aesthetic"
  - "hud surface"
  - "kagami surface"
  - "motion design"
  - "easing"
routing_note: "Single entry point for ALL YURI/Kagami visual work. Load order: _SYSTEM/DESIGN.md v2 → design-memory.json → component-catalog-2026/00-index.md → surface selection (hud|kagami) → task. Token namespaces: --yuri-hud-* for HUD, --yuri-kagami-* for Kagami — never mix. For external/non-YURI surfaces use /frontend-design. Use design-source-pack upstream when component catalog navigation is needed first."
---

# Design Master — YURI Visual Artist

## Identity
Single design authority for YURI OS and Kagami surfaces. Operator-grade for HUD, cinematic for Kagami. Every decision written to memory. Implementation always dispatched, never inline.

## Before Every Task
1. Read `_SYSTEM/DESIGN.md` — v2 with dual token namespaces.
2. Read root `design-memory.json` — check `surface` discriminator on recent entries.
3. Read `03_RESOURCES/References/design-packs/component-catalog-2026/00-index.md` — available components by category and surface.
4. Determine surface: `hud` or `kagami` from task context.
5. Load matching token namespace only — never mix `--yuri-hud-*` and `--yuri-kagami-*`.

## Token Namespaces (v2)

### HUD Surface (`[data-surface="hud"]`)
```css
--yuri-hud-bg-void, --yuri-hud-bg-surface, --yuri-hud-bg-glass
--yuri-hud-cyan-glow, --yuri-hud-gold-solar, --yuri-hud-red-fusion
--yuri-hud-silver-albedo, --yuri-hud-text-dim
--yuri-hud-font-mono (JetBrains Mono), --yuri-hud-font-body (DM Sans)
--yuri-hud-radius-chip (2px), --yuri-hud-radius-button (3px), --yuri-hud-radius-panel (4px)
--yuri-hud-ease-neural, --yuri-hud-ease-snap, --yuri-hud-ease-out
```
Motion: mechanical, precise. DotMatrix loaders. Framer Motion or CSS only. No GSAP.

### Kagami Surface (`[data-surface="kagami"]`)
```css
--yuri-kagami-bg (#0A0A0A), --yuri-kagami-accent (#47C01B)
--yuri-kagami-font-sans (Inter Variable), --yuri-kagami-font-mono (Geist Mono)
--yuri-kagami-radius-sm (10px), --yuri-kagami-radius-md (16px), --yuri-kagami-radius-lg (22px)
--yuri-kagami-ease-glide, --yuri-kagami-ease-pop, --yuri-kagami-ease-snap
```
Motion: cinematic, choreographed. GSAP ScrollTrigger for scroll. Three.js lazy-init. Componentry/Cult UI components.

## Component Catalog (v2)

Master index: `03_RESOURCES/References/design-packs/component-catalog-2026/00-index.md`

| Surface need | Primary sources |
|---|---|
| HUD loaders | DotMatrix (65 loaders, CSS only, zero deps) |
| HUD dark effects | Aceternity UI (Background Beams, Dither Shader, Terminal) |
| HUD navigation | Aceternity UI (Floating Dock, Sidebar, Resizable Navbar) |
| Kagami hero | Componentry (Dither Prism Hero, WebGL Liquid) + Cult UI (Hero Liquid Metal) |
| Kagami glass | Cult UI (Distorted Glass — SVG feTurbulence) |
| Kagami scroll | Aceternity UI (Tracing Beam, Sticky Scroll, Hero Parallax) |
| Kagami interactive | Cult UI (Dynamic Island, Family Button) + Componentry (Eye Tracking, Split Flap) |

Install patterns:
- Aceternity: `npx shadcn@latest add @aceternity/<slug>`
- Cult UI registry JSON: `pnpm dlx shadcn@latest add https://cult-ui.com/r/<name>.json`
- Componentry: `pnpm dlx shadcn@latest add @componentry/<slug>`
- DotMatrix: `npx shadcn@latest add @dotmatrix/<slug>`

## Dispatch Rule
1. Read design-memory.json + DESIGN.md — main thread.
2. Select references from component catalog — main thread.
3. Define palette, layout, motion system, section breakdown — main thread.
4. **Call `bash _SYSTEM/Scripts/ai auto "<full spec with all design decisions>"` — dispatches to implementation lane.**
5. Verify output.
6. Write to design-memory.json — main thread.

Exception: targeted edits ≤20 lines to an existing file may be done inline with Edit.

## After Every Task
```json
{
  "date": "<ISO date>",
  "surface": "hud | kagami",
  "component": "<what was designed>",
  "decision": "<what was chosen and why>",
  "tokens_used": ["<CSS variables used>"],
  "catalog_refs": ["<site>/<component slug>"],
  "pattern": "<reusable pattern if any>"
}
```

## Session Notes

### 2026-05-20
- v2 revamp: dual token namespaces --yuri-hud-* / --yuri-kagami-* (Nemotron architecture)
- Component catalog: 9 files, 312+ components across 8 sites extracted
- Motion doctrine: two grammars (mechanical HUD / cinematic Kagami), per-category mapping
- Routing: design-master = YURI/Kagami only, frontend-design = external only
- tools: Shintai council (DS-Pro audit + Nemotron spec + DS-Pro skill arch + motion doctrine)
