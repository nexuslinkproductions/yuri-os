---
name: design-source-pack
description: "Catalog navigator and component extraction skill. Navigates the 8-site component-catalog-2026 reference pack, selects components matching a design task by surface and category, feeds structured references into design-master. Also runs fresh site extraction into catalog format. Upstream of design-master always."
triggers:
  - "extract design system"
  - "design pack"
  - "design reference"
  - "extract visual language"
  - "turn this design into a skill"
  - "design source"
  - "import design system"
  - "what components should I use"
  - "find a component for"
  - "catalog navigation"
  - "extract from site"
  - "pull from this site"
routing_note: "Upstream of design-master and frontend-design. Run first when a task needs component selection from the catalog or fresh extraction from a URL. Feeds structured component refs into the calling skill's load order. Catalog path: 03_RESOURCES/References/design-packs/component-catalog-2026/00-index.md"
---

# Design Source Pack — Catalog Navigator

## Role
Navigate the YURI component catalog and feed structured references into design-master or frontend-design. Also extracts new components from URLs into catalog format.

## Catalog Access

Master index: `03_RESOURCES/References/design-packs/component-catalog-2026/00-index.md`
Individual site files in: `03_RESOURCES/References/design-packs/component-catalog-2026/`

## Selection Matrix (8-site catalog)

| Surface / Need | Primary Sites | Category in Index |
|---|---|---|
| HUD dark backgrounds | Aceternity UI | background |
| HUD loaders | DotMatrix | animation |
| HUD navigation | Aceternity UI | nav |
| HUD cards/panels | Aceternity UI, Cult UI | card |
| Kagami hero/WebGL | Componentry | hero |
| Kagami glass effects | Cult UI | effect |
| Kagami scroll | Aceternity UI | layout |
| Kagami interactive | Cult UI, Componentry | interactive |
| Any text animation | Componentry, Aceternity UI | text, animation |
| Visual inspiration (no code) | Refero Styles | reference |

## Symbiotic Preflight (every selection task)
1. **Surface** — which surface: hud or kagami?
2. **Category** — what type of component is needed?
3. **Deps** — what framework/deps are acceptable?
4. **License** — check each site's install path (all 4 main sites are MIT-compatible)
5. **Action** — return top 3 matches from index with install command

## Fresh Extraction (new URL)

Use the `extraction-sprint` skill for multi-site extractions.
For single URL, follow this spec:
1. Fetch the page (WebFetch or curl for static; note JS-rendered sites need headless)
2. Try shadcn registry endpoint first: `curl https://<site>/r/<name>.json`
3. Extract verbatim code — no paraphrasing
4. Write to `03_RESOURCES/References/design-packs/component-catalog-2026/<sitename>.md`
5. Update `00-index.md` with new entries

## Known Registry Endpoints (direct source access)
- Cult UI: `curl https://cult-ui.com/r/<name>.json` → full source
- Aceternity: `npx shadcn@latest add @aceternity/<slug>` → post-install in components/ui/
- Componentry: `pnpm dlx shadcn@latest add @componentry/<slug>`
- DotMatrix: `npx shadcn@latest add @dotmatrix/<slug>`

## Known Partial Sites (JS-rendered, need headless browser)
- Skiper UI (skiper-ui.com/components) — PARTIAL
- Ali Imam (aliimam.in/docs/components) — PARTIAL

## Session Notes

### 2026-05-20
- v2: replaced abstract 4-lib selection matrix with 8-site catalog reference system
- component-catalog-2026 created: 9 files, 312+ components, Aceternity(131)/Cult UI(74)/Componentry(42)/DotMatrix(65)
- extraction lesson: shadcn registry JSON is the right path, WebFetch can't get JS-rendered code
