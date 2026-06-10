---
name: feedback-design-doc-first-take
description: Design visual docs work when built with real token values + live CSS demos + actual motion — not mockups or diagrams. First-take success on design-system-v2.html.
metadata: 
  node_type: memory
  type: feedback
  originSessionId: 74775e0d-977a-4d89-a045-5fa1449d1178
---

Design docs land on the first take when:
- Split the canvas by concept, not by section (HUD vs Kagami as opposing halves of the cover, not consecutive pages)
- Use **actual CSS custom properties** from the live system — real `--yuri-hud-cyan-glow` values, not placeholder colors
- Motion demos are **live animations** (easing balls looping on the actual cubic-bezier curves) — not static diagrams or descriptions
- The council/debate section makes the reasoning visible — Marcel wants to see how decisions got made, not just what the outcome was
- Particle canvas adds atmosphere without competing with the content
- Scroll-reveal on all major elements — nothing static in the viewport

**Why:** Marcel was surprised it worked first try. The gap was usually: generated docs feel like mockups. This felt like a real product because every visual element was sourced from the actual design system, not approximated.

**How to apply:** For any design doc, HTML report, or showcase: source every token, color, and animation directly from the system files. If it can't be pulled from a real value, it shouldn't be there.
