# Frontend Design Guidelines: Anti-Generic & Production-Grade

## The Anti-Generic Mandate
To avoid "AI slop" and the generic layouts LLMs typically converge upon, follow these strict directives:
- **Never Converge on Common Choices**: Explicitly avoid overused fonts (e.g., Inter, Space Grotesk) and generic bootstrap-style layouts.
- **Interpret Creatively**: Make unexpected choices that feel genuinely designed for the context.
- **No Two Designs Alike**: Ensure every generation varies in theme, font, and aesthetic.

## Aesthetic Pillars
- **Typography**: Pair a distinctive display font with a refined body font. Avoid Arial/Inter in favor of characterful choices.
- **Color & Theme**: Create a cohesive aesthetic using CSS variables. Dominant colors with sharp accents outperform timid, evenly-distributed palettes.
- **Motion**: Prioritize CSS-only animations for HTML and `framer-motion` for React to create high-impact micro-interactions.

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
