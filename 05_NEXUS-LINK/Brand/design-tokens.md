# Design Tokens — Nexus Link Productions

OS kernel identity. Source of truth for all brand implementations.
Generated from: NEURAL-NETWORK/evo-nexus + RESEARCH/ORACLE-CORPUS/openclaw-clawhub

---

## CSS Custom Properties

```css
:root {
  /* ── Surfaces ── */
  --color-void:     #06060a;   /* deepest background */
  --color-deep:     #0a0a10;   /* page background */
  --color-surface:  #101018;   /* cards, panels */
  --color-elevated: #16161f;   /* modals, dropdowns */
  --color-hover:    #1c1c28;   /* hover state */

  /* ── Borders ── */
  --color-border-subtle: #1e1e2a;
  --color-border:        #2a2a3a;

  /* ── Text ── */
  --color-text-primary:   #e4e4ed;
  --color-text-secondary: #8888a0;
  --color-text-muted:     #5a5a70;

  /* ── Accent: Purple (primary) ── */
  --color-purple:     #7c3aed;
  --color-purple-dim: #5b21b6;

  /* ── Accent: Cyan (CTA / highlight) ── */
  --color-cyan:     #00FFA7;
  --color-cyan-dim: #00cc86;

  /* ── Semantic ── */
  --color-danger:  #EF4444;
  --color-success: #10b981;
  --color-warning: #F59E0B;

  /* ── Typography ── */
  --font-sans:    'Outfit', system-ui, sans-serif;
  --font-heading: 'Space Grotesk', sans-serif;
  --font-mono:    'JetBrains Mono', 'Fira Code', monospace;

  /* ── Type Scale ── */
  --text-xs:  0.75rem;   /* 12px */
  --text-sm:  0.875rem;  /* 14px */
  --text-base: 1rem;     /* 16px */
  --text-lg:  1.125rem;  /* 18px */
  --text-xl:  1.25rem;   /* 20px */
  --text-2xl: 1.5rem;    /* 24px */
  --text-3xl: 1.875rem;  /* 30px */
  --text-4xl: 2.25rem;   /* 36px */
  --text-5xl: 3rem;      /* 48px */
  --text-6xl: 3.75rem;   /* 60px */

  /* ── Spacing ── */
  --space-1:  0.25rem;  /* 4px */
  --space-2:  0.5rem;   /* 8px */
  --space-3:  0.75rem;  /* 12px */
  --space-4:  1rem;     /* 16px */
  --space-5:  1.25rem;  /* 20px */
  --space-6:  1.5rem;   /* 24px */
  --space-8:  2rem;     /* 32px */
  --space-12: 3rem;     /* 48px */
  --space-16: 4rem;     /* 64px */
  --space-24: 6rem;     /* 96px */

  /* ── Radius ── */
  --radius-sm:   8px;
  --radius-md:   12px;
  --radius-lg:   16px;
  --radius-full: 9999px;

  /* ── Shadows / Glow ── */
  --glow-purple:      0 0 20px rgba(124, 58, 237, 0.4);
  --glow-purple-soft: 0 0 40px rgba(124, 58, 237, 0.15);
  --glow-cyan:        0 0 20px rgba(0, 255, 167, 0.4);
  --shadow-sm:        0 1px 2px rgba(0, 0, 0, 0.4);
  --shadow-md:        0 4px 12px rgba(0, 0, 0, 0.5);
  --shadow-lg:        0 8px 24px rgba(0, 0, 0, 0.6);

  /* ── Motion ── */
  --ease-out:        cubic-bezier(0.4, 0, 0.2, 1);
  --duration-fast:   150ms;
  --duration-normal: 300ms;
  --duration-slow:   500ms;
}
```

---

## Token Reference

| Token | Value | Use |
|-------|-------|-----|
| `--color-void` | `#06060a` | Deepest bg, full-bleed sections |
| `--color-deep` | `#0a0a10` | Page background |
| `--color-surface` | `#101018` | Cards, panels |
| `--color-elevated` | `#16161f` | Modals, popovers |
| `--color-hover` | `#1c1c28` | Hover states |
| `--color-border-subtle` | `#1e1e2a` | Dividers, subtle outlines |
| `--color-border` | `#2a2a3a` | Default borders |
| `--color-text-primary` | `#e4e4ed` | Body copy, headings |
| `--color-text-secondary` | `#8888a0` | Labels, metadata |
| `--color-text-muted` | `#5a5a70` | Placeholders, disabled |
| `--color-purple` | `#7c3aed` | Primary accent, interactive |
| `--color-purple-dim` | `#5b21b6` | Hover on purple |
| `--color-cyan` | `#00FFA7` | CTA buttons, highlights |
| `--color-cyan-dim` | `#00cc86` | Hover on cyan |
| `--color-danger` | `#EF4444` | Error, destructive |
| `--color-success` | `#10b981` | Confirmed, done |
| `--color-warning` | `#F59E0B` | Caution, pending |
| `--font-sans` | Outfit | UI, body |
| `--font-heading` | Space Grotesk | H1–H4 |
| `--font-mono` | JetBrains Mono | Code, data |
| `--glow-purple` | `0 0 20px rgba(124,58,237,0.4)` | Focus rings, active cards |
| `--glow-cyan` | `0 0 20px rgba(0,255,167,0.4)` | CTA emphasis |

---

## Replaced Tokens

| Old | New | Reason |
|-----|-----|--------|
| `crimson #DC143C` | `purple #7c3aed` + `cyan #00FFA7` | OS kernel identity |
| `#000000` page bg | `--color-void #06060a` | More depth, less harsh |
| `#121212` surface | `--color-surface #101018` | Consistent with kernel |
| System fonts | Outfit + Space Grotesk + JetBrains Mono | Brand-specific type system |
