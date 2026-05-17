# NUDIMMUD HUD OS — Design System

> Active design system for NUDIMMUD Command Center. Supersedes NVIDIA-legacy reference.
> All tokens live in `index.css`. Component decisions live in canonical root `design-memory.json`; skill-local copies are compatibility mirrors only.

---

## 1. Product Personality

**NUDIMMUD HUD OS** is a dark operator system — not a consumer product, not a corporate dashboard.

| Trait | Expression |
|-------|-----------|
| Futuristic | Sparse, precise, high-contrast |
| Interactive | Every click produces visible state change |
| Game-like | GTA customization energy — tactile, immersive |
| Premium | No noise, no decoration, high-craft detail |
| Tactical | Operator-grade information density |
| Notebook-native | Embeds cleanly in HUD shells and iframes |

---

## 2. Visual Tokens

All tokens are CSS custom properties on `:root` in `index.css`. Never add new root-level variables without a documented reason.

### Color Roles

```css
--bg-void:        hsl(0, 0%, 0%)           /* Page background — absolute black */
--bg-surface:     hsla(0, 0%, 8%, 0.92)    /* Panel background — near-black glass */
--bg-glass:       hsla(0, 0%, 8%, 0.72)    /* Frosted glass — use for floating cards */

--cyan-glow:      hsl(96, 68%, 74%)        /* Primary accent — lime/neon green */
--cyan-dim:       hsl(96, 42%, 24%)        /* Muted accent — borders, inactive chips */
--gold-solar:     hsl(90, 100%, 36%)       /* Secondary — warnings, badges, value labels */
--red-fusion:     hsl(12, 84%, 58%)        /* Danger — critical alerts, HIGH priority */

--silver-albedo:  hsl(0, 0%, 97%)          /* Primary text — headlines, key values */
--text-dim:       hsl(0, 0%, 66%)          /* Secondary text — labels, metadata */
```

### Typography

```css
--font-display:  'Bricolage Grotesque', 'DM Sans', system-ui
--font-body:     'DM Sans', system-ui
--font-mono:     'JetBrains Mono', monospace
```

Scale: 0.55rem (micro labels) → 0.6rem → 0.7rem → 0.82rem → 1rem → 1.2rem → 1.6rem → 2.4rem (hero scores)

Weight: 400 (body) / 600 (subheadings) / 700 (display, scores, CTAs)

### Spacing

Base unit: **8px**. Use multiples: 4, 8, 12, 16, 24, 32, 40, 48.  
Component padding: 12–16px. Section gaps: 24–32px. Never arbitrary values.

```css
--grid-unit: 8px;
```

### Easing

```css
--ease-neural:    cubic-bezier(0.23, 1, 0.32, 1)   /* Primary — overshoot-free elastic feel */
--ease-out:       cubic-bezier(0, 0, 0.2, 1)        /* Panel entry, drawer open */
--ease-in-out:    cubic-bezier(0.4, 0, 0.2, 1)      /* Material standard, less preferred */
--transition-master: 250ms var(--ease-neural)        /* Default interactive transition */
```

### Shadows & Glow

- Glow on active elements: `box-shadow: 0 0 12px rgba(150,220,120,0.2)`
- Panel shadows: `0 4px 24px rgba(0,0,0,0.6)`
- No drop shadows on text. No colored shadows except `--cyan-glow` and `--red-fusion` on explicit indicators.

### Blur / Transparency

- Glass panels: `backdrop-filter: blur(12px)` + `background: var(--bg-glass)`
- Use blur only when it creates meaningful depth. Never blur text layers.
- Scanline overlay: `rgba(cyan,0.03)` max — decorative only, never structural.

### Borders

- Primary border: `1px solid rgba(255,255,255,0.07)`
- Active/selected border: `1px solid var(--cyan-glow)` with matching glow
- Never use `2px` borders for decorative borders — only for focus rings.

---

## 3. Layout Rules

```
┌──────────────────────────────────────────────────────────────┐
│ ACTIVITY BAR (48px) │ SIDEBAR NAV (220px) │ EDITOR AREA     │
│                     │                     │                  │
│ Icon buttons        │ nav-nodes           │ ┌─ TAB BAR ──┐  │
│ Status orb          │ Section groups      │ │ BREADCRUMB  │  │
│                     │ Dividers            │ ├─────────────┤  │
│                     │                     │ │ MODULE      │  │
│                     │                     │ │ CONTENT     │  │
│                     │                     │ └─────────────┘  │
│ ══════════════ STATUS BAR (footer) ═══════════════════════   │
└──────────────────────────────────────────────────────────────┘
```

**Inside module content:**
- Two-column HUD: left sidebar 260px + flex-1 main area
- Always-visible inspector bar at bottom (48px, bordered)
- Header bar when needed (48px, `background: rgba(0,0,0,0.3)`)
- Panels float via `background: var(--bg-glass)` + border + blur

**Responsive:** The app shell is fixed-viewport (no mobile). Components should scroll internally, not the outer viewport. Use `overflow: hidden` on outer shells, `overflow-y: auto` on scrollable inner areas.

---

## 4. Motion Rules

### Use motion to communicate state — never for decoration.

| Trigger | Behavior |
|---------|---------|
| Screen transition | `AnimatePresence mode="wait"`, x: ±24px, opacity 0→1, 280ms |
| Panel entry | `y: 8 → 0`, opacity 0→1, 250–320ms, `--ease-neural` |
| Chip/button hover | `scale: 1.02`, 150ms |
| Chip/button tap | `scale: 0.97`, 100ms |
| Collapsible open | `height: 0 → auto`, opacity 0→1, 220ms (requires `overflow: hidden` wrapper) |
| Score meter fill | `scaleX: 0 → target`, 900ms `--ease-neural`, applied via `useEffect` + `setTimeout` delay |
| Stagger rows | `staggerChildren: 0.06`, each child: `opacity 0→1, y: 16→0` |
| Inspector item | `x: 8→0`, opacity 0→1, 150ms, `mode="wait"` |
| Background particles | Canvas RAF, velocity ±0.3 px/frame, 40 particles |

### Reduced motion

Always check `useReducedMotion()` from Framer Motion:
- Disable canvas animation
- Set all Framer transitions to `duration: 0`
- Skip `setTimeout` delays on score meters (apply immediately)

---

## 5. Component Rules

### Buttons

- Primary: `background: rgba(150,220,120,0.1)`, `border: 1px solid var(--cyan-glow)`, color: `--cyan-glow`
- Secondary: transparent bg, `border: 1px solid rgba(255,255,255,0.12)`, color: `--text-dim`
- Danger: `border-color: var(--red-fusion)`, color: `--red-fusion`
- All: `font-mono`, 0.6–0.78rem, `letter-spacing: 0.1em`, `border-radius: 3–4px`
- Always: `outline: none` + custom `:focus-visible` ring (`outline: 2px solid var(--cyan-glow)`)

### Chips (selection)

- Unselected: `background: rgba(255,255,255,0.03)`, `border: 1px solid rgba(255,255,255,0.1)`, color: `--text-dim`
- Selected: `background: rgba(150,220,120,0.08)`, `border-color: var(--cyan-glow)`, color: `--cyan-glow`, glow shadow
- Active indicator dot: 6px circle, `background: --cyan-glow`, top-right corner

### Cards / Panels

- `background: rgba(255,255,255,0.02)`, `border: 1px solid rgba(255,255,255,0.07)`, `border-radius: 6px`
- Glass variant: `background: var(--bg-glass)`, `backdrop-filter: blur(12px)`
- No drop shadows on panels by default. Add only for floating/elevated elements.

### Score Meters

- Track: `background: rgba(255,255,255,0.07)`, height 3px (small) or 6px (large)
- Fill: `background` based on score: ≥80 `--cyan-glow`, ≥70 `--gold-solar`, <70 `--red-fusion`
- Animation: CSS `transform: scaleX()`, `transformOrigin: left center`
- `aria-live="polite"` on container for accessibility

### Collapsible Sections

- Always wrap content in `AnimatePresence` + `motion.div` with `overflow: hidden` parent
- State: local `useState(false)` — never lift collapse state unless needed across siblings
- Toggle: click on section header row

### Code / Debug Panels

- `font-family: var(--font-mono)`, `font-size: 0.6–0.62rem`, `line-height: 1.7`
- JSON key color: `rgba(255,255,255,0.3)`, value color: `var(--gold-solar)`
- Background: `var(--bg-void)` — darker than panels

### Priority Badges

- HIGH: `background: var(--red-fusion)`
- MED: `background: var(--gold-solar)`
- LOW: `background: var(--cyan-glow)`
- All: `color: rgba(0,0,0,0.8)`, `font-mono`, 0.55rem, `border-radius: 2px`, `padding: 2px 5-6px`

---

## 6. Interaction Philosophy

- **Every click produces clear, immediate visual feedback.** No silent state changes.
- **Motion clarifies state — it does not distract.** Background animations are at 20–25% opacity max.
- **Background should feel alive but never reduce readability.** Particles and gradients are decorative layers, not foreground.
- **User choices must visibly change the interface.** Config selections update chip states, debug panels, and downstream screens immediately.
- **Inspector surfaces detail without navigation.** Hover reveals detail in-place; no new pages or modals for inspection.
- **Debug panels are always honest.** Show live state objects (config JSON) without sanitization.

---

## 7. Anti-Patterns

| Anti-pattern | Why banned |
|-------------|-----------|
| Generic SaaS dashboard look | Kills the operator personality |
| Plain white or light gray cards | Violates dark-first system |
| Random gradients | Must map to a token or a specific documented reason |
| Decorative animation with no state meaning | Motion budget is limited — spend it purposefully |
| Inconsistent spacing | Strict 8px base unit — no arbitrary values |
| Weak contrast | `--text-dim` is the minimum for body text, never lighter |
| Inline TODO comments | All work must be complete or explicitly documented as mock data |
| Fake "coming soon" sections | Never ship placeholder without a real fallback |
| Unsigned transitions | All `transition:` declarations must reference `--ease-neural` or a documented easing |

---

## 8. Design Audit HUD — Screen Architecture

The Design Audit HUD (`src/components/DesignAuditHUD/`) follows this 3-screen state machine:

```
'catalog'  →  'confirm'  →  'hud'
               ↓                ↓
            (back to catalog) (reset to catalog)
```

### State Object

```typescript
NudimmudDesignConfig = {
  theme: string;             // 6 options
  motionIntensity: string;   // 4 options
  backgroundLife: string;    // 6 options
  layoutMode: string;        // 5 options
  componentStyle: string;    // 5 options
  auditTone: string;         // 5 options
  enabledFunctions: string[]; // multi-select, 12 options
  confirmed: boolean;
}
```

### Handoff Payload

```typescript
NUDIMMUD_DESIGN_HANDOFF = {
  schema: '1.0.0';
  generated: ISO timestamp;
  config: NudimmudDesignConfig;
  auditSummary: { overallScore, strongestSection, weakestSection, sectionScores };
  suggestions: AuditSuggestion[];
  styleDirection: string;
  nextBuildInstructions: string[];
}
```

Export: JSON download via `Blob + URL.createObjectURL`. Copy: `navigator.clipboard.writeText`.
