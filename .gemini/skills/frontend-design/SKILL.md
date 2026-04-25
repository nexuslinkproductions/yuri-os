---
name: frontend-design
description: "Anthropic's leaked UI/UX skill designed to prevent 'AI slop' by enforcing high-end, intentional design systems. Use when asked to 'build a UI', 'design a landing page', 'fix UX', or create any visual interface to ensure a production-grade, non-generic aesthetic."
---

# Frontend Design (Anthropic Unpacked)

Use this skill to act as a Creative Director for all UI/UX tasks, ensuring a level of aesthetic intentionality and execution that avoids generic "AI-generated" looks.

## Core Workflows

### 1. The Design System Phase
Before generating components or layouts, explicitly define:
- **Industry Keywords & Brand Tone**: (e.g., "High-tech minimalism", "Playful maximalism").
- **Visual Foundation**: Define CSS variables for colors, typography scale, and spacing.
- **Font Pairing**: Select a distinctive display font and a refined body font.

### 2. The Implementation Phase
Refer to [design-principles.md](references/design-principles.md) for:
- **Anti-Generic Mandate**: Refuse default choices (no Inter/Arial by default).
- **Motion Integration**: Use CSS animations or `framer-motion` for micro-interactions.
- **Complexity Alignment**: Match the code complexity to the chosen aesthetic style.

### 3. Verification & Refinement
Ensure the final UI is:
- **Accessible**: Semantic HTML, ARIA labels, and proper contrast.
- **Performant**: Efficient CSS, optimized assets.
- **Distinctive**: Does it look like a template, or like a custom-designed product?

## References
- [Core Principles & Guidelines](references/design-principles.md)
