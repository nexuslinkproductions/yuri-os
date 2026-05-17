# NUDIMMUD Design Audit HUD — Usage Guide

## What Was Built

A premium interactive document audit system integrated into the NUDIMMUD HUD shell.
Three-screen flow: Design Catalog → Confirmation → Document Audit HUD.

## How to Launch

1. `npm run dev` from `/Users/marcelspatz/NUDIMMUD/`
2. Open `http://localhost:5173`
3. Click **Design Audit** in the left sidebar (OPS section, after Catalog)
4. Or type `/audit` in the global command input (routes to DIRECTIVE module — use sidebar instead)

## Screen Flow

### Screen 1: Design Catalog
- 6 category rows, each with chip options
- Click any chip to select it — the chip glows and the debug JSON panel updates live
- Multi-select for **Interactive Functions** (12 toggles)
- Progress bar at bottom shows how many categories are configured
- **Continue →** button activates only when all 6 primary categories are selected

### Screen 2: Confirm
- Full config summary table (left) + token preview strip (right)
- Preview shows: accent color swatch, font sample, motion timing label, surface style description, audit tone badge
- **Confirm and Generate Audit** — generates the HUD
- **← Adjust Setup** — returns to catalog with config preserved (no reset)

### Screen 3: Document Audit HUD

**Header bar (top):**
- Document name + config theme badge + session ID
- **Copy Handoff** — copies `NUDIMMUD_DESIGN_HANDOFF` JSON to clipboard
- **↓ Export HANDOFF.json** — downloads JSON file
- **Config** — toggles the right debug panel (shows live `NudimmudDesignConfig`)
- **↺ Reset** — returns to catalog, clears config

**Left sidebar:**
- Overall quality score (animated score meter)
- Section nav: click any section to open it in the main area
- Score meter per section (animated on mount, staggered)
- Suggestions quick view

**Main area:**
- Selected section: header, score, animated bar, summary text
- Findings list: click to expand detail, hover to populate Inspector Bar
- Suggestions: collapsible cards with IMPACT details

**Inspector Bar (bottom):**
- Hover any finding row → inspector shows the detailed explanation
- Idle state shows "Hover a finding to inspect"

**Right debug panel (toggleable):**
- Live `NudimmudDesignConfig` JSON
- `NUDIMMUD_DESIGN_HANDOFF` preview metadata

## Exporting the Handoff Payload

Two ways:
1. **↓ Export HANDOFF.json** — downloads a `.json` file named `NUDIMMUD_DESIGN_HANDOFF_{timestamp}.json`
2. **Copy Handoff** — copies the full JSON to clipboard (button shows "✓ Copied" for 2s)

The payload schema:
```json
{
  "schema": "1.0.0",
  "generated": "<ISO timestamp>",
  "config": { /* NudimmudDesignConfig */ },
  "auditSummary": {
    "overallScore": 78,
    "strongestSection": "UX Audit",
    "weakestSection": "Visual Audit",
    "sectionScores": { "structure": 82, "visual": 71, "ux": 84, "content": 76 }
  },
  "suggestions": [ /* 5 suggestions with priority/category/text/impact */ ],
  "styleDirection": "Cyber HUD / Sharp tactical / Cinematic motion",
  "nextBuildInstructions": [ /* 7 specific next steps */ ]
}
```

## Technical Details

| File | Purpose |
|------|---------|
| `src/components/DesignAuditHUD/types.ts` | All interfaces, catalog data, mock audit data |
| `src/components/DesignAuditHUD/index.tsx` | Root screen state machine, AnimatePresence transitions |
| `src/components/DesignAuditHUD/DesignCatalog.tsx` | Screen 1: chip selection UI |
| `src/components/DesignAuditHUD/ConfirmScreen.tsx` | Screen 2: config summary + CTAs |
| `src/components/DesignAuditHUD/AuditHUD.tsx` | Screen 3: full audit HUD |
| `src/components/DesignAuditHUD/ParticleBackground.tsx` | Canvas particle animation (reduced-motion aware) |

**No new dependencies added.** Uses existing: React 19, Framer Motion 12, TypeScript 5, Vite 5.

## Reduced Motion

The app fully respects `prefers-reduced-motion`:
- Canvas particle background hidden (replaced with static dark gradient)
- All Framer Motion transitions set to instant
- Score meter fills apply immediately without animation

Enable in browser DevTools → Rendering → Emulate prefers-reduced-motion.

## Limitations (Proto v1.0)

- Audit data is **mock data** — real document analysis requires backend integration
- Config choices affect the UI cosmetically (theme badge, background behavior) but do not generate a dynamically themed interface
- `backgroundLife: 'Animated gradient'` and `'Grid scanlines'` show partial behavior (particles still render; full mode-specific canvas specialization is a next iteration task)
- No persistence — config resets on navigate-away (intentional for proto)

## Next Iteration

1. Wire config choices to actual CSS token swapping (inject class on root based on `theme` + `componentStyle`)
2. Replace mock audit data with a real document analysis pipeline (could pipe any document through Claude API)
3. Add `backgroundLife` full mode implementations for gradient field and light trails
4. Persist config to `localStorage` with explicit "Save Config" action
5. Add keyboard navigation: `Tab` through sections, `Space` to expand, `Escape` to go back
