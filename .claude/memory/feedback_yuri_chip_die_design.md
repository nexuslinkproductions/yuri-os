---
name: feedback-yuri-chip-die-design
description: "Locked design direction for the YURI chip die (the core visual product) — schematic/blueprint, server-baked, whole-system, the specific look + interaction Marcel locked over a long 2026-06-09 iteration."
metadata: 
  node_type: memory
  type: feedback
  tier: high
  scope: yuri-chip-die
  trig: 
    - chip die
    - yuri-chip-die
    - circuitry die
    - build-chip-die
    - the die visual
    - system map
  refs: 
    - feedback-circuitry-visual-is-chip-die
    - feedback_motion_design_manifesto
    - circuitry-auto-registration-regen-vision
  originSessionId: 8424dd62-3aa1-4815-a898-fce13a8e42fb
---

RULE: The YURI chip die (`02_RESOURCES/RESEARCH/circuitry/yuri-chip-die.html`, built by `build-chip-die.mjs` from `yuri-die-graph.json`) renders the ENTIRE unified system (all ~242 canonical nodes: code organs = `kind:die` solid cells, flow nodes = `kind:peripheral` dashed cells) as a CLEAN SCHEMATIC / BLUEPRINT, deterministically placed. Marcel locked this look over a long 2026-06-09 session.

WHEN: any work on the die / circuitry visual.

DO:
- SERVER-BAKE the SVG as a string in Node (zero client-side `appendChild` construction) — Marcel opens the HTML via file://, not localhost; baked markup = instant open, no build lag. SVG needs explicit `width`/`height` (a viewBox alone collapses to 0 inside the absolutely-positioned `#world` → blank).
- Aesthetic: flat layer-colored cells, thin net-colored orthogonal traces, dark blueprint GRID substrate floor, SF Pro / Helvetica fonts. Per-layer wedge TINTS + bold bright region labels (dark halo) so each region reads as its own sector. FACING-ROTATION: every cell rotates around its center by its polar angle (fans toward the core); counter-flip text on the left half so labels stay upright. Gentle core pulse for life. NO photoreal glass/metal, NO heavy blur (kills perf + the schematic read).
- Interaction: click a node → a node-ANCHORED floating CARD beside it (NOT a right-side slab panel). Hover/select → ego-network highlight (focus node + lit neighbors + dim rest) + ANIMATED directional dash flow on every touching trace (shows where flow goes, out vs in). Pan/zoom via transform on `#world`.
- Layout (K1D-tiers floorplan, LOCKED concentric tiers — core/moat/systems/rim): each region = a COMPACT grid sized to its OWN cells (not ∝ count), grids spread EVENLY around the full ring (leftover arc = equal gaps) so the disc FILLS with minimal void. cellBase ~46 (small); gap/clearance/RSEP MUST scale with cellBase (they were absolute-px → huge void at small cells). Keep it overlap-free (adversarial-check.mjs is the gate).

DONT: side-panel for node info; client-side SVG construction; cyberpunk glow/plasma/photoreal; cells sized ∝ count (clusters them in over-sized wedges → void); cells spread to fill an over-sized wedge (→ long stretched sequential columns); `setPointerCapture` on pan (it retargets the click to the stage → node clicks silently never fire); a huge canvas (6.5k² stutters/artifacts on cursor move — keep ~3.3k²).

WHY: Marcel's hard requirements across the session — "the entire system represented on it, placed on purpose, nothing random"; "schematic"; "Helvetica / SF Pro"; "get creative, not the same right-hand panel"; "see where the flow goes"; "much smaller"; "no long sequential columns"; "too much void"; "pull governance/meta in". The die is the core visual product of YURI.

SEE: [[feedback-circuitry-visual-is-chip-die]] (the chip-die-not-organic-atlas call) · [[feedback_motion_design_manifesto]] · [[circuitry-auto-registration-regen-vision]].
