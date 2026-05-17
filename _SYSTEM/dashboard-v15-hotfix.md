# V15 HOTFIX — Dashboard render + PDF density

Two critical issues from user feedback. Both must be fixed.

## HOTFIX 1 — Dashboard district planes render as BLACK RECTANGLES

Visible bug: large opaque black hex-shaped slabs are blocking nodes from USER down through PULSE_BUS. Only nodes ENKI_DECIDES and below are visible.

Debug steps:
1. Read yuri-os-dashboard.html around the makeDistrictPlane function (~line 7917)
2. Check `geometry.rotateX(Math.PI / 2)` is producing horizontal planes
3. Verify each plane's `fillMesh.position.y` matches its section's actual position
4. Verify `material.opacity` stays at 0.025 (highly translucent) — not getting overridden
5. Check `renderOrder` — planes should render BEFORE nodes (renderOrder = -1) so depth sort doesn't make them block nodes

Fix:
- Set `fillMesh.renderOrder = -1` and `outline.renderOrder = -1` so planes render under nodes
- Ensure `depthWrite: false` is preserved on both materials (already in code — verify it sticks)
- Sync each plane's y to its section node's CURRENT position (not the stored stageY constant if section.position.y differs)
- Add `transparent: true` confirmation
- If color is being overridden anywhere, force colorHex from sector palette

After fix: reload dashboard. All section labels (USER, USER_INPUT, ENKI, MEMORY, etc.) must be visible.

## HOTFIX 2 — PDF was a catastrophe

User feedback: "one point per page is a fucking waste. previous documents were high end great visualised documents, now its a degraded terminal looking ass page per page."

Reference quality: yuri-os-v4-design-sheet.pdf (committed earlier). That doc had multiple sections per page, visual hierarchy, real layout density, KPI cards, palette swatches as visual blocks, embedded SVG diagrams.

The current `yuri-os-v15-system-audit.pdf` has:
- One section per A4 page — wasted vertical space
- No visual elements after the cover
- Plain paragraphs where tables/charts were specified
- Mermaid syntax leaked as raw text (no JS in headless print)

**Scrap current PDF approach. Generate with these new rules:**

### Density rule
Average 2-3 sections per A4 page, NOT 1. Target: 30 pages of DENSE content. Each page should have minimum 60% ink coverage (charts, tables, callouts, color blocks).

### Visual elements required (all inline SVG, NO Mermaid, NO JS dependencies)
- **KPI grids** — 4-up or 8-up cards with large numerals + label
- **Comparison tables** — explicit `<table>` with cell borders, alternating row tints, header row in cyan
- **Process diagrams** — inline SVG flowcharts (boxes + arrows + labels). Hand-author them in SVG, not Mermaid.
- **Architecture maps** — inline SVG with nodes (rect/circle) and edges (path), colored by sector
- **Palette swatches** — color blocks with hex labels as horizontal bands
- **Stat bars** — horizontal progress bars showing before/after metrics
- **Code callouts** — terminal-style code blocks with syntax highlighting via CSS
- **Status pills** — badge components for "applied-v15", "pending", "deprecated"

### Layout system
- A4 portrait, 18mm margins (was 22 — increase content area)
- 12-column grid with explicit `.span-N` classes
- Each page uses 1-3 sections stacked, with `.section { margin-bottom: 8mm; }`
- Generous use of color blocks, NOT walls of paragraph text

### Page densification
Combine these sections onto SINGLE pages where logical:
- Page 1: Cover + Hero KPI grid (4 cards) + 1-line description
- Page 2: Executive summary KPIs + change ledger TABLE in 2 columns
- Page 3: Document map TOC + Primary sources panel
- Page 4: System map (inline SVG diagram, FULL PAGE)
- Page 5: NexusPulse pipeline (inline SVG, full page)
- Page 6: Memory architecture diagram (inline SVG full page with 4 layers)
- Page 7: Token efficiency + Long-cross memory (split page, 2 sections, each with metric callouts)
- Page 8: Skill consolidation TABLE + Command consolidation TABLE (split page)
- Page 9: Lane priority (8-row table) + NVIDIA suite (7-row sub-table)
- Page 10: Repo audit table + yuri-shura/yuri-report skill specs side-by-side
- Pages 11-14: Mac Mini deployment — hardware specs grid, env vars table, launchd plist code blocks, verification checklist
- Pages 15-17: Risk register table with severity badges + rollback git commands
- Pages 18-20: Deprecation timeline (Gantt-style horizontal bar chart, hand-SVG)
- Pages 21-25: Detailed architecture flows for each subsystem (cortex, memory, lane wrap, codex two-phase)
- Pages 26-28: v16 roadmap with prioritized cards
- Page 29: Performance metrics dashboard (multiple stat-bar comparisons)
- Page 30: Sign-off page with verification checklist + commit hashes

### Design system enforce
```css
.section { margin-bottom: 8mm; }
.kpi-card { ... display:flex; align-items:center; }
.kpi-num { font: 600 26pt Inter; color: #f3f4f6; }
.kpi-label { font: 500 8pt "JetBrains Mono"; letter-spacing: 0.14em; color: #94a3b8; }
table { width:100%; border-collapse: collapse; }
th { background: rgba(56,189,248,0.10); color: #38bdf8; padding: 3mm 2mm; }
td { padding: 2.5mm 2mm; border-bottom: 1px solid rgba(148,163,184,0.18); }
tr:hover { background: rgba(56,189,248,0.04); }
.badge { display:inline-block; padding: 0.6mm 2mm; border-radius: 2px; font: 600 7pt "JetBrains Mono"; }
.badge-applied { background: rgba(118,185,0,0.18); color: #76b900; }
.badge-pending { background: rgba(255,179,71,0.18); color: #FFB347; }
.badge-deprecated { background: rgba(148,163,184,0.18); color: #94a3b8; }
.stat-bar { display:flex; align-items:center; gap:4mm; margin:2mm 0; }
.stat-bar .fill { height: 6mm; background: linear-gradient(90deg, #38bdf8, #76b900); border-radius: 1px; }
.callout { border-left: 3px solid #38bdf8; padding: 3mm 5mm; background: rgba(31,41,55,0.55); margin: 3mm 0; }
.svg-diagram { width:100%; max-height: 200mm; }
```

### Inline SVG diagrams (no Mermaid)
For System Map (page 4):
```html
<svg viewBox="0 0 600 800" class="svg-diagram">
  <!-- USER node -->
  <rect x="260" y="20" width="80" height="32" rx="2" fill="rgba(118,185,0,0.15)" stroke="#76b900"/>
  <text x="300" y="40" text-anchor="middle" fill="#f3f4f6" font-family="Inter" font-size="11">USER</text>
  <!-- arrow -->
  <line x1="300" y1="52" x2="300" y2="80" stroke="#38bdf8" stroke-width="1.5" marker-end="url(#arrow)"/>
  <!-- ... continue for all 17 sections vertically with edges ... -->
  <defs>
    <marker id="arrow" markerWidth="8" markerHeight="8" refX="6" refY="4" orient="auto">
      <path d="M0,0 L0,8 L8,4 z" fill="#38bdf8"/>
    </marker>
  </defs>
</svg>
```

This gives a STATIC visual flowchart in the PDF without needing JS to render.

### Output
- HTML: _SYSTEM/SELF-IMPROVEMENT/yuri-os-v15-system-audit.html (REPLACE existing)
- PDF: yuri-os-v15-system-audit.pdf (REPLACE existing)

Render:
```
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless --disable-gpu \
  --no-pdf-header-footer --print-to-pdf="/Users/marcelspatz/YURI-OS-MUSUBI/yuri-os-v15-system-audit.pdf" \
  --virtual-time-budget=10000 \
  "file:///Users/marcelspatz/YURI-OS-MUSUBI/_SYSTEM/SELF-IMPROVEMENT/yuri-os-v15-system-audit.html"
```

Verify:
- 30 pages exactly
- Each page must have visible structure: cards/tables/diagrams/callouts (NOT just paragraphs)
- Open PDF in Chrome, screenshot pages 2/5/8/15/25 to spot-check density and visual richness

If PDF still looks sparse, increase page content. Better to overflow content than to have 70% blank pages.

---

## EXECUTION ORDER

1. Fix dashboard plane bug first (5min). Test: reload http://127.0.0.1:8765/yuri-os-dashboard.html and confirm USER/ENKI/MEMORY all visible.
2. Regenerate PDF with dense visual rules (15-20min). Render. Verify.
3. Commit both fixes together.
