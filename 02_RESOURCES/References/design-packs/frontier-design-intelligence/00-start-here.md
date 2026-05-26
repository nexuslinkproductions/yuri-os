# Start Here

Use this pack when the task involves frontend design, UI implementation, visual polish, interaction design, website generation, or design review.

## Canonical Load Order

1. `DESIGN.md`
2. `design-memory.json`
3. `03_RESOURCES/References/design-packs/frontier-design-intelligence/README.md`
4. `03_RESOURCES/References/design-packs/framer-university-resource-atlas/README.md` when motion or Framer-like effects are relevant
5. A task-specific source subset from `source-index.json`
6. Implementation constraints from the target app

## Source Selection

- SaaS/app UI: Vercel, React docs, Primer, Atlassian, shadcn, Radix/Base UI, Mobbin.
- Motion-heavy landing: Framer University, Motion Primitives, Codrops, Magic UI, React Bits, GSAP.
- Dark operator/HUD: YURI DESIGN.md, Dark Mode Design, Vercel restraint, Codrops interaction references.
- AI-generated UI workflow: Anthropic frontend-design, Vercel agent skills, 21st.dev, v0, Figma Make.
- Accessibility-heavy controls: React Aria, React purity/state docs, Radix, Base UI, Headless UI, Vercel Web Interface Guidelines.

## Hard Rules

- Pick references first, then implement.
- Use references to choose structure and interaction grammar, not to clone visuals.
- One primary motion system per viewport; one optional ambient layer only when text density is low.
- Every frontend result needs hover, focus, reduced-motion, responsive, and screenshot/browser verification.
