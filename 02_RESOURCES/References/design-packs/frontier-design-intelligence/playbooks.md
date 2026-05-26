# Frontier Design Playbooks

## Before Designing

1. Read `DESIGN.md` and `design-memory.json`.
2. Classify the task: app, landing, portfolio, dashboard, motion experiment, brand site, or tool surface.
3. Select 3-7 references from `source-index.json`.
4. Write a one-sentence visual direction and one-sentence interaction direction.
5. Define what must stay YURI-native and what can borrow from external references.

## Build Rules

- Use headless primitives for behavior when controls are complex.
- Use animated component libraries as reference, not as unreviewed paste-ins.
- Keep dominant palette intentional; avoid generic purple-blue SaaS gradients.
- Preserve readable text and stable layout before adding depth or motion.
- Prefer one strong visual idea over many small effects.

## Verification

- Desktop and mobile screenshot check.
- Keyboard focus check for all controls.
- Reduced-motion path check.
- Canvas/Three.js nonblank pixel check when 3D is used.
- CSS color scan for one-note palette drift.
- Text-overlap check at narrow and wide viewports.
