---
name: frontend-design
description: "Anthropic's leaked UI/UX skill designed to prevent 'AI slop' by enforcing high-end, intentional design systems. Use when asked to 'build a UI', 'design a landing page', 'fix UX', or create any visual interface to ensure a production-grade, non-generic aesthetic."
triggers:
  - "build a UI"
  - "design a landing page"
  - "fix UX"
  - "create a page"
  - "build a website"
  - "make it look professional"
  - "no AI slop"
  - "production design"
  - "web design"
  - "design principles"
routing_note: "Secondary to design-master for NUDIMMUD surfaces. Use for general web UI, external products, or non-NUDIMMUD interfaces. Pairs with design:design-critique for feedback and design:accessibility-review for a11y."
---

# Frontend Design (Anthropic Unpacked)

Use this skill to act as a Creative Director for all UI/UX tasks, ensuring a level of aesthetic intentionality and execution that avoids generic "AI-generated" looks.

## NUDIMMUD Load Order
Before any interface work, load context in this order:
1. `DESIGN.md`
2. Root `design-memory.json`
3. `03_RESOURCES/References/design-packs/frontier-design-intelligence/00-start-here.md`
4. `03_RESOURCES/References/design-packs/framer-university-resource-atlas/00-start-here.md` when motion, galleries, cursor effects, 3D, or experiential work is relevant
5. The target app's tokens, component primitives, and current route/screen implementation

Pick 3-7 concrete references before designing. Use them to set the type posture, layout grammar, component behavior, and motion trigger model.

## Core Workflows

### 1. The Design System Phase
Before generating components or layouts, explicitly define:
- **Industry Keywords & Brand Tone**: (e.g., "High-tech minimalism", "Playful maximalism").
- **Visual Foundation**: Define CSS variables for colors, typography scale, and spacing.
- **Font Pairing**: Select a distinctive display font and a refined body font.
- **Reference Set**: Name 3-7 sources from the frontier atlas, Design Radar, Framer atlas, or product-specific references.

### 2. The Implementation Phase
Refer to [design-principles.md](references/design-principles.md) for:
- **Anti-Generic Mandate**: Refuse default choices (no Inter/Arial by default).
- **Motion Integration**: Use CSS animations or `framer-motion` for micro-interactions.
- **Complexity Alignment**: Match the code complexity to the chosen aesthetic style.
- **Style Divergence**: Avoid repeating recent memory patterns unless continuity is required.

### 3. Verification & Refinement
Ensure the final UI is:
- **Accessible**: Semantic HTML, ARIA labels, and proper contrast.
- **Performant**: Efficient CSS, optimized assets.
- **Distinctive**: Does it look like a template, or like a custom-designed product?
- **Verified**: Browser or screenshot check at desktop and mobile widths when a runnable target exists.

## References
- [Core Principles & Guidelines](references/design-principles.md)
- `03_RESOURCES/References/design-packs/frontier-design-intelligence/README.md`
