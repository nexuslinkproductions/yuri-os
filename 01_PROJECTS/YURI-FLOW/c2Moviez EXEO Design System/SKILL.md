# c2moviez · EXEO — Design System

**Brand name:** always `c2moviez` (lowercase, one word). Never `C2Moviez`, `C2moviez`, `c2 moviez`, or `c2-moviez`.
**Product:** `EXEO` — all caps. The autonomous COO platform at `ops.c2moviez.com`.
**Tagline:** swiss creative-technology firm.

## Files

- `tokens.css` — variables, font imports, ambient orbs, motion primitives
- `components.css` — the component library (26 components)
- `index.html` — design system home
- `preview/colors.html` — color foundation
- `preview/typography.html` — six font families, scale, pairing
- `preview/motion.html` — primitives, durations, easings, rules
- `preview/brand.html` — name rules, logo variants, clear space, voice, anti-patterns
- `preview/components.html` — full component catalog
- `preview/dashboard-kit.html` — EXEO dashboard pattern
- `preview/proposal-kit.html` — client proposal pattern
- `preview/marketing-hero.html` — c2moviez.com marketing hero

## Typography stack

| Family | Var | Weights | Job |
|---|---|---|---|
| Space Grotesk | `--hd` | 300·500·600·700 | Headlines, KPI values |
| Inter | `--sa` | 400·500·600·700 | Body, UI sans |
| JetBrains Mono | `--mo` | 400·500·700 | Captions, numerics, eyebrows |
| Outfit | `--mk` | 300–800 | Marketing, proposals |
| DM Serif Display | `--ed` | 400 · 400 italic | Editorial accents |
| Nunito | `--doc` | 400·600·700 | Long-form documents |

## Signature rules

1. Gradient cyan→violet wordmark, drop-shadow cyan.
2. Monospace captions with 0.14–0.28em letter-spacing, uppercase.
3. Frosted glass over deep-space dark (#060912, never #000).
4. Drifting ambient orbs on hero surfaces.
5. Animated conic-gradient border — at most once per viewport.

## Motion primitives

`drift` (24s) · `pulse` (2.4s) · `fade-up` (400ms stagger 60ms) · `urgent-glow` (2.4s) · `border-rotate` (8s via @property `--ds-angle`).
