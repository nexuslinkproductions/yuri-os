# Frontend Design Guidelines: Anti-Generic & Production-Grade

## The Anti-Generic Mandate
To avoid "AI slop" and the generic layouts LLMs typically converge upon, follow these strict directives:
- **Never Converge on Common Choices**: Explicitly avoid overused fonts (e.g., Inter, Space Grotesk) and generic bootstrap-style layouts.
- **Interpret Creatively**: Make unexpected choices that feel genuinely designed for the context.
- **No Two Designs Alike**: Ensure every generation varies in theme, font, and aesthetic.
- **Reference Before Rendering**: Select 3-7 named sources from local design packs or Design Radar before choosing layout and motion.
- **Diverge From Memory**: Check root `design-memory.json`; do not repeat the same HUD/card/hero pattern unless it is required by product continuity.

## Aesthetic Pillars
- **Typography**: Pair a distinctive display font with a refined body font. Avoid Arial/Inter in favor of characterful choices.
- **Color & Theme**: Create a cohesive aesthetic using CSS variables. Dominant colors with sharp accents outperform timid, evenly-distributed palettes.
- **Motion**: Prioritize CSS-only animations for HTML and `framer-motion` for React to create high-impact micro-interactions.
- **Motion Budget**: Use one primary motion system and one optional ambient layer. Provide a reduced-motion variant.

## Implementation Standards
- **Complexity Matching**: Maximalist designs need elaborate code; minimalist designs need restraint, precision, and careful attention to spacing.
- **Production-Grade**: Code must be functional, accessible (semantic HTML, ARIA labels), and meticulously refined.
- **Conceptual Direction**: Choose a clear direction (e.g., "Bold Maximalism" or "Refined Minimalism") and execute it with precision.

## Design Systems
Before writing UI code, define:
1. **Product Type & Industry Keywords**.
2. **Brand Visual Language**.
3. **Color Palette (CSS Variables)**.
4. **Typography Scale**.
5. **Spacing System**.
6. **Reference Set & Divergence Check**.

## AI-Tell Catalog (countable)
Pre-flight gate over generated UI. Each tell is countable, not a vibe-check. Tags: `[general]` applies to any surface; `[landing]` applies to landing / marketing / portfolio pages ONLY. Do NOT apply `[landing]` rules to YURI HUD instruments or Kagami cinematic surfaces (those follow design-master's surface model).

- `[general]` Em-dash in rendered copy = fail. Use commas, periods, or restructure.
- `[general]` AI-default palettes = fail: the premium-consumer beige/brass/espresso family, and the "AI purple" glow gradient. Pick a palette motivated by the brief.
- `[general]` Decorative status dots, div-based fake "screenshots", and locale/weather/clock filler strips = fail.
- `[landing]` Section-number "eyebrows" above more than `ceil(sectionCount / 3)` sections = fail.
- `[landing]` Three or more consecutive image-and-text split sections in the same zigzag rhythm = fail.
- `[landing]` Two CTAs with the same intent, or a CTA that wraps onto two lines = fail.
- `[general]` Button contrast below WCAG AA (light-on-light, dark-on-dark) = fail.
- `[general]` Performative-craftsman copy ("handcrafted", "meticulously designed", "thoughtfully built") = fail. Show the craft, do not narrate it.

A later Tier-3 item may turn this catalog into an executable linter; today it is a countable pre-flight checklist.
