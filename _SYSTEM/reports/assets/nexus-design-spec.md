# Nexus Link — Design System Spec

**Codename:** *Forge & Thread*
**Voice:** Interwoven craft, forward precision. Premium, confident, alive, sophisticated.
**Not:** corporate-bland, not cyber/HUD, no `--yuri-hud-*` / `--yuri-kagami-*` tokens.

Derived from the Nexus Link Celtic-knot identity: the knot reads as worked
metal thread over a deep, quiet ground — intricate interlace = the network of
relationships and revenue paths the memo argues about; the single continuous
line = "two individuals, one link."

> **Logo evidence (verified, read the actual SVGs):** the real marks are
> **monochrome**. Only two colors exist across logo / element / wordmark:
> `#191d22` (deep ink, the dark-version fill) and `#b6b6b7` (silver-grey, the
> light-version line). There is **no gold** in the source identity. The element
> is a near-square (viewBox ~860×884) interwoven knot built from **9 filled
> `<path>` shapes** — it is filled forms, not a single stroked line, so a literal
> SVG "draw the one continuous stroke" effect needs a stroke overlay, not the raw
> paths. The wordmark is a wide thin lockup (viewBox ~1146×92).
>
> **Palette honesty:** `--nx-ground` (`#0C0E13`) is a faithful deepening of the
> logo ink `#191d22`. The **gold thread** (`--nx-thread` / Forge & Thread) is a
> deliberate *brand extension*, NOT taken from the marks — it warms a cold-start
> monochrome identity into something premium and alive. This is the right call
> for a revenue memo, but it is a design decision, not a logo fact. Build gets
> two tracks below; pick one and commit.

---

## 1. Palette — "Forge & Thread"

| Token | Hex | HSL | Role |
|---|---|---|---|
| `--nx-ground` | `#0C0E13` | `222 17% 6%` | deep ink ground (page) |
| `--nx-ground-2` | `#12151C` | `220 16% 9%` | raised surface |
| `--nx-ground-3` | `#1A1E28` | `221 16% 13%` | card / panel |
| `--nx-ground-4` | `#232836` | `222 21% 17%` | hover / table head |
| `--nx-thread` | `#C9A14A` | `42 53% 54%` | **primary — woven gold thread** |
| `--nx-thread-bright` | `#E3C677` | `42 66% 67%` | lit highlight |
| `--nx-thread-deep` | `#8A6A28` | `41 55% 35%` | shadowed thread |
| `--nx-patina` | `#2E7D74` | `174 46% 33%` | verdigris accent |
| `--nx-patina-bright` | `#4FB3A6` | `173 39% 50%` | lit patina (2nd accent) |
| `--nx-parchment` | `#F4F0E6` | `44 38% 93%` | warm off-white (inverted sections) |
| `--nx-ink-100 / 80 / 60 / 40` | `#F6F4EE` … `#5B606C` | — | text ramp on dark |

**Status (muted, never neon):** positive `#5FA882`, caution `#D7A24A`,
risk `#C76E63`, neutral/info `#6E8FB0`. Each has a `*-soft` translucent fill
for badges and row tints.

**Signature gradient** `--nx-grad-thread`: a 5-stop diagonal sweep
deep→gold→bright→gold→deep that reads as light catching a metal thread.
Used on hero headline (clipped to text), card top-edge, table bars, scroll
progress.

### Track B — "Logo-True" (monochrome, matches the marks exactly)

If Marcel wants the memo to stay *literally* on-brand with the silver/ink logo
(no invented gold), Build flips the accent ramp to the verified logo colors:

| Token | Hex | Source | Role |
|---|---|---|---|
| `--nx-ground` | `#0C0E13` | deepened from logo ink `#191d22` | page ground |
| `--nx-thread` | `#C8CACE` | from logo line `#b6b6b7`, lifted | **primary line/accent (silver)** |
| `--nx-thread-bright` | `#EDEEF0` | — | lit highlight |
| `--nx-thread-deep` | `#7E848C` | — | shadowed line |
| `--nx-patina` | `#5E94C0` | cool steel-blue | single restrained accent |

Everything else (grounds, ink ramp, status, type, motion, cursor, components)
is identical. The gradient becomes a brushed-metal silver sweep instead of gold.
**Recommendation:** ship Track A (gold) for the revenue memo — a cold-start
brand benefits from one warm, confident, ownable accent, and silver-on-dark
reads colder/more generic. But Track B is one CSS block away if Marcel
disagrees. Both are in `nexus-design-system.css` (Logo-True under a commented
override block at the end of the palette).

---

## 2. Type Scale

- **Display / headings:** high-contrast serif — `"Hoefler Text", "Iowan Old Style", Palatino, Georgia, serif`. System-only, no remote fonts. Timeless-craft register.
- **Body / UI:** humanist system sans — `ui-sans-serif, -apple-system, "Segoe UI", Inter, …`.
- **Figures:** `ui-monospace, "SF Mono", Menlo, …`, tabular-nums, for the data table.

Modular scale, ratio **1.250 (major third)**, base **17px**:

| Step | Size |
|---|---|
| overline | 12px (0.22em tracked, uppercase) |
| caption | ~14px |
| body | 17px |
| lede | ~21px |
| h4 → h1 | 24 → 33 → 48 → 69px |
| hero display | `clamp(3.2rem, 7vw, 6.7rem)` |

Line-heights: tight `1.04` (hero), snug `1.18` (headings), body `1.62`.
Heading tracking `-0.02em`; overline tracking `0.22em`.

---

## 3. Motion Doctrine

Motion = **animated moving parts**, not loaders/spinners. Everything is gated
behind `body.nx-motion` and fully neutralized under
`@media (prefers-reduced-motion: reduce)` (all content visible, zero movement,
custom cursor removed).

**Easings (bespoke):**
- `--nx-ease-weave` `cubic-bezier(.22,1,.36,1)` — gentle overshoot, default UI feel
- `--nx-ease-draw` `cubic-bezier(.65,0,.35,1)` — decisive line-draw
- `--nx-ease-settle` `cubic-bezier(.16,1,.30,1)` — soft landing for reveals

**Durations:** fast 180ms · base 420ms · slow 760ms · reveal 1100ms.

**What animates:**
1. **Hero knotwork line-draw** — the Celtic knot strokes draw themselves
   (`stroke-dashoffset` → 0, `--nx-ease-draw`) then breathe in opacity. JS sets
   `--nx-knot-len` per path.
2. **Gold-thread sheen** — hero headline gradient sweeps continuously (9s).
3. **Scroll-reveal** — `.nx-reveal` rises + fades on intersection (`is-in`),
   with `.nx-stagger` cascading children (90ms steps).
4. **Parallax** — `.nx-parallax` translates via JS-set `--nx-parallax`; hero knot
   drifts slower than foreground.
5. **Animated data** — table inline bars grow from 0 to `--nx-bar-w` when their
   row enters; card metrics rise + (JS) count up.
6. **Knot dividers** — rotate/scale-in on enter.
7. **Scroll progress** — a 2px gold thread tracks scroll at viewport top.
8. **Reactive hovers** — cards lift 4px + light a woven top edge; rows tint;
   links shift gold→parchment.

**Implementation contract for Build:** one `IntersectionObserver` adds `is-in`;
one `scroll`/`rAF` loop sets `--nx-scroll` and `--nx-parallax`; one
`pointermove` rAF loop drives the cursor. All JS inlined, no libraries.

---

## 4. Interactive Cursor

Two-element layer, `@media (pointer: fine)` only, hidden on touch and under
reduced-motion:

- **Dot** (`.nx-cursor-dot`, 6px, `--nx-thread-bright`) — precise point, tracks
  pointer 1:1 each frame.
- **Ring** (`.nx-cursor`, 34px, gold border, `mix-blend-mode: screen`, soft
  glow) — trails the dot with eased lerp (~0.15) for a weighted, alive feel.

**Reactive states (JS toggles classes):**
- `.is-active` over links/buttons/sortable `th` → ring expands to 56px, brightens, fills faint gold.
- `.is-text` over paragraphs/table body → ring tightens to 18px, shifts to patina.
- `.is-hidden` on window blur / pointer leave.

System cursor is hidden (`cursor:none`) only when `body.nx-cursor-on` is set and
a fine pointer exists, so keyboard/touch users are never stranded.

---

## 5. Celtic-Knot Motif Usage

- **Hero:** a large continuous interlace knot, centered, behind a bottom veil
  (`--nx-grad-veil`) so headline stays legible. Self-draws on load, breathes,
  parallax-drifts on scroll. This is the brand's emotional anchor.
- **Dividers:** small knot glyph between hairline rules (`--nx-grad-thread`),
  rotate-in on scroll — section transitions feel like the thread continuing.
- **Texture:** faint dual-color dot weave over the ground (`body::before`),
  masked to fade — suggests interlace without competing with content.
- **Edges:** card hover lights a gold thread along the top edge (the link
  "activating"); table bars and progress use the same thread gradient so every
  data mark belongs to the same woven system.

**Principle:** one continuous line, intricate but legible, gold over deep ground.
Everywhere a value, a row, a section, or a link activates, it does so with the
same thread — the knot is the system, not decoration.

---

## 6. Component Inventory (in `nexus-design-system.css`)

`.nx-hero` (+ `__knot/__veil/__content/__lede/__meta`) · `.nx-overline` ·
`.nx-section` (+ `--parchment`, `--tight`) · `.nx-section-head` · `.nx-divider` ·
`.nx-grid` · `.nx-card` (+ `__kicker/__metric`) · `.nx-callout` (+ `--patina`) ·
`.nx-figure` · `.nx-table` (sticky head, `aria-sort` affordance, `.nx-num`,
`.nx-bar`, `.nx-badge--pos/warn/risk/neutral`) · `.nx-footnotes` / `.nx-ref` ·
cursor layer (`.nx-cursor`, `.nx-cursor-dot`) · motion layer
(`.nx-reveal`, `.nx-stagger`, `.nx-parallax`, `.nx-progress`, `.nx-knot-path`).

All tokens are `--nx-*`. No HUD/Kagami tokens. Self-contained, offline-safe.
