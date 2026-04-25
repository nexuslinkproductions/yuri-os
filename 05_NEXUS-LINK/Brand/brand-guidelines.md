# Brand Guidelines — Nexus Link Productions

**Updated:** 2026-04-24 | Replaces old crimson identity. Aligned to OS kernel design system.

---

## Brand Essence

**Company:** Nexus Link Productions — premium video production, Vienna.
**Not:** a social media agency, content farm, or generalist studio.
**Person:** Marcel Spatz — Video Producer (not videographer).

**Three words:** Premium · Futuristic · Precise

---

## Color System

### Palette

| Role | Name | Hex | Use |
|------|------|-----|-----|
| Background | Void | `#06060a` | Full-bleed, darkest surfaces |
| Page | Deep | `#0a0a10` | Default page bg |
| Card | Surface | `#101018` | Cards, panels |
| Raised | Elevated | `#16161f` | Modals, drawers |
| Interactive | Hover | `#1c1c28` | Hover bg state |
| **Primary accent** | **Purple** | **`#7c3aed`** | **CTAs, links, active states** |
| Purple dim | — | `#5b21b6` | Hover on purple |
| **Secondary accent** | **Cyan** | **`#00FFA7`** | **Highlights, badges, hero CTA** |
| Cyan dim | — | `#00cc86` | Hover on cyan |
| Text | Primary | `#e4e4ed` | Body, headings |
| Text | Secondary | `#8888a0` | Labels, metadata |
| Text | Muted | `#5a5a70` | Placeholders, disabled |
| Danger | — | `#EF4444` | Errors |
| Success | — | `#10b981` | Confirmations |
| Warning | — | `#F59E0B` | Caution states |

### Rules
- Dark-first. No light mode for core brand surfaces.
- Purple = primary interactive. Cyan = high-attention / hero moments.
- One accent per context. Don't mix purple + cyan on the same CTA.
- Never use old crimson `#DC143C`. It's retired.

---

## Typography

### Typefaces

| Role | Family | Weights |
|------|--------|---------|
| UI / Body | **Outfit** | 300, 400, 500, 600, 700 |
| Headings | **Space Grotesk** | 400, 500, 600, 700 |
| Code / Data | **JetBrains Mono** | 400, 500 |

### Scale (base 16px, 1.25 ratio)

| Token | Size | Use |
|-------|------|-----|
| xs | 12px | Labels, captions |
| sm | 14px | Secondary body, metadata |
| base | 16px | Default body |
| lg | 18px | Emphasized body |
| xl | 20px | Subheadings |
| 2xl | 24px | Section heads |
| 3xl | 30px | Page titles |
| 4xl | 36px | Hero subtitles |
| 5xl | 48px | Hero primary |
| 6xl | 60px | Full-bleed statements |

### Rules
- Headings: Space Grotesk, weight 600–700, letter-spacing -0.5px
- Body: Outfit, weight 400, letter-spacing 0.5px
- Code: JetBrains Mono, color `--color-cyan` on dark
- No serif. No generic system font stack in brand contexts.

---

## Logo Usage

### Files
- `Identity/NLP LOGO/logo dark nexus.svg` — dark bg (primary)
- `Identity/NLP LOGO/logo light nexus.svg` — light bg only
- `Identity/NLP LOGO/wordmark dark nexus.svg` — text-only version
- `Identity/NLP LOGO/element dark nexus.svg` — icon/mark only

### Rules
- Always use SVG. Never PNG in digital contexts.
- Dark version on all OS kernel / app surfaces.
- Minimum clear space: 1× logo height on all sides.
- Never recolor, rotate, stretch, or add drop shadows.
- Animated logo (Brand/R logo.aep) for hero and showreel use only.

---

## Voice & Tone

**Premium, direct, technical.** No fluff. No hype.

| Context | Tone |
|---------|------|
| Service descriptions | Precise, outcome-focused |
| Client communication | Confident, warm |
| OS / product UI | Terse, functional |
| Error messages | Clear, never apologetic |

**Do:** "We shoot, edit, and deliver broadcast-ready work."
**Don't:** "We're passionate storytellers who bring brands to life!"

---

## Motion

### Keyframes

```css
@keyframes breathe {
  0%, 100% { opacity: 1; }
  50%       { opacity: 0.6; }
}

@keyframes pulse-glow {
  0%, 100% { box-shadow: 0 0 40px rgba(124, 58, 237, 0.15); }
  50%       { box-shadow: 0 0 20px rgba(124, 58, 237, 0.4); }
}

@keyframes slide-in {
  from { opacity: 0; transform: translateY(8px); }
  to   { opacity: 1; transform: translateY(0); }
}
```

### Timing
- Fast interactions: 150ms
- Standard transitions: 300ms
- Deliberate reveals: 500ms
- Easing: `cubic-bezier(0.4, 0, 0.2, 1)` (ease-out)

### Rules
- Breathe = ambient / idle states (logo, status indicators)
- Pulse-glow = active / in-progress (purple glow on cards)
- Slide-in = page entries, toasts, drawers
- Never loop animations on interactive elements

---

## Do / Don't

| ✅ Do | ❌ Don't |
|------|---------|
| Void + purple + cyan | Crimson on any surface |
| Outfit / Space Grotesk / JetBrains Mono | Generic system fonts |
| Dark-first, one accent per context | Mixed accents in one CTA |
| Tight, functional copy | Hype, filler, buzzwords |
| SVG logos | PNG logos in digital |
| Purple glow on interactive | Glow on static text |

---

## Reference

- **Tokens:** [design-tokens.md](./design-tokens.md)
- **OS kernel CSS:** `NEURAL-NETWORK/evo-nexus/dashboard/frontend/src/index.css`
- **ClawHub CSS:** `RESEARCH/ORACLE-CORPUS/openclaw-clawhub/src/styles.css`
- **Landing CSS:** `01_PROJECTS/NEXUS-LINK-LANDING/src/app/globals.css`
- **Design radar:** `RESEARCH/DESIGN-RADAR/synthesis.md`
