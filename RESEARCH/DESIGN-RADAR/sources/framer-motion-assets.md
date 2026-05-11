# Framer Motion Assets

Sources:
- https://framer.university/resources/x-ray-hover-effect-in-framer
- https://framer.university/resources/particle-sphere-component-for-framer
- https://www.framer.com/marketplace/components/gallery-spin/
- https://www.framer.com/marketplace/components/3d-parallax-grid/
- https://www.framer.com/marketplace/components/spectranoise/
- https://www.framer.com/marketplace/components/vortex-gallery-pro/
- https://framer.university/resources/circular-cd-selection-in-framer
- https://www.framer.com/marketplace/components/motion-tiles/

## Signals

- Cinematic depth without heavy custom 3D infrastructure.
- Cursor-reactive motion that makes static layouts feel tactile.
- Hover-reveal mechanics that expose hidden detail on demand.
- Orbital and tunnel-like gallery systems for premium image showcases.
- Ambient noise and scanline layers for dark, futuristic atmosphere.
- Selection UIs that combine click, hover, and keyboard states.

## Asset Digest

| Asset | Archetype | Best Use |
|---|---|---|
| X-Ray Hover Effect | Hover mask reveal | Story-led reveals, before/after comparisons, hidden-state previews |
| Particle Sphere | Particle field / orbital hero | Ambient hero motion, abstract brand moments, spatial backgrounds |
| Gallery Spin | Concentric ring gallery | Image-heavy feature showcases, mood boards, portfolio walls |
| 3D Parallax Grid | Depth grid / scroll parallax | Dense image grids, product libraries, showcase sections |
| SpectraNoise | Noise and scanline overlay | Futuristic atmosphere, section texture, dark UI energy |
| Vortex Gallery Pro | 3D tunnel gallery | Editorial galleries, cinematic portfolios, motion-first hero sections |
| Circular CD Selection | Radial selector | Choice wheels, playlist browsers, category pickers |
| Motion Tiles | Cursor-driven 3D tiles | Service cards, feature highlights, hero feature panels |

## Useful Patterns

- One dominant motion concept per screen.
- Hide complexity behind a calm default state.
- Use hover or cursor motion to reveal detail, not to decorate empty space.
- Treat gallery motion as a framing device, not the message itself.
- Keep depth readable: near items large and opaque, far items smaller and softer.
- Pair radial selectors with keyboard support and clear active states.
- Add texture layers only when they support the mood of the content.

## Apply To NUDIMMUD

- Use `X-Ray Hover Effect` for hidden evidence, compare/contrast views, and inspect-on-hover account cards.
- Use `Particle Sphere` or `SpectraNoise` for subdued ambient energy behind hero or command surfaces.
- Use `Gallery Spin`, `3D Parallax Grid`, or `Vortex Gallery Pro` for premium image collections, benchmark galleries, and portfolio showcases.
- Use `Circular CD Selection` for radial mode pickers, category wheels, or chapter selectors.
- Use `Motion Tiles` for interactive service blocks, account summaries, or feature callouts that need tactile depth.
- Keep the motion budget tight: no more than one primary motion system plus one ambient layer on a single surface.

## Guardrails

- Avoid stacking multiple 3D systems on the same viewport.
- Avoid ambient noise if the surface already has dense data or small text.
- Avoid hover-reveal only interactions when the hidden state contains essential information.
- Keep active and focused states obvious; motion should not be the only cue.
- Prefer Framer-native controls when the interaction is mostly presentation, not application logic.
