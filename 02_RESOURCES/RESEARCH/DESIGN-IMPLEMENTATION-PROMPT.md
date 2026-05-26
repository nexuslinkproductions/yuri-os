# Design Implementation - Nexus Link Productions

> Purpose: translate the design system into code without collapsing into generic AI UI.
> Primary source of truth: `design-memory.json`.
> Motion source: Framer resources and design radar.
> Mood source only: `RESEARCH/pinterest-refs/`.

---

## Source Hierarchy

1. `design-memory.json` - canonical decisions, tokens, and approved patterns.
2. `RESEARCH/DESIGN-RADAR/README.md` and `RESEARCH/DESIGN-RADAR/synthesis.md` - source selection and motion guidance.
3. `02_RESOURCES/References/design-packs/frontier-design-intelligence/README.md` - system foundation, accessibility, and source selection.
4. `02_RESOURCES/References/design-packs/framer-university-resource-atlas/README.md` - motion families, interaction structures, and component behavior.
5. `RESEARCH/06-ANALYZED-WEBSITES.md` - implementation patterns worth adapting.
6. `RESEARCH/pinterest-refs/INDEX.md` - tone and mood only. Do not copy layout, spacing, or component structure from Pinterest.

If a Pinterest cue conflicts with memory, tokens, or Framer guidance, ignore the Pinterest cue.

---

## What Pinterest Is For

- Contrast.
- Geometry.
- Tone.
- Aesthetic pressure.

Not for:

- Layout systems.
- Component anatomy.
- Spacing rhythm.
- Motion language.
- Token selection.

---

## What Framer Is For

- Picking the motion family before writing code.
- Hover reveal systems.
- Orbital and radial selection systems.
- Scroll-story systems.
- Text-lift and mask-reveal systems.
- Ambient motion that supports atmosphere without hurting readability.

Framer is the source for interaction structure, not decoration.

---

## Design Rules

- Token-first. Use `src/styles/tokens.css` values and add tokens before inventing one-off colors.
- Editorial, not template. Prefer depth, asymmetry, and controlled tension over flat symmetry.
- One dominant motion system per viewport. Secondary ambient motion only if it helps the composition.
- Build atmosphere with layering, lighting, blur, and spacing, not with more borders.
- Keep text readable over motion and backgrounds.
- No generic Claude Code UI. No safe gray cards. No flat stacks with no hierarchy.
- Accessibility stays mandatory: keyboard support, focus states, contrast, and reduced-motion paths.

---

## Practical Workflow

1. Read the source hierarchy above.
2. Identify the motion family from Framer atlas or design radar.
3. Implement tokens, spacing, and motion together.
4. Audit against the "generic, flat, Claude Code UI" failure mode.
5. Keep the result reusable across pages and agent surfaces.

---

## Current Site Intent

- Premium editorial shell.
- Dark graphite and glass surfaces.
- Soft rose/crimson accent used sparingly.
- Cinematic motion with restraint.
- No new UI experiments unless they strengthen the system.
