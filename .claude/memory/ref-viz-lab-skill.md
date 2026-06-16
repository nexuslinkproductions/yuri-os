---
name: ref-viz-lab-skill
description: "viz-lab skill — best-tool, real-data-grounded visualization of YURI's own systems"
metadata: 
  node_type: memory
  tier: reference
  scope: viz
  trig: 
    - viz
    - visualize
    - visualization
    - 3D
    - three.js
    - d3
    - graph
    - surface
    - dashboard
    - demo
    - make this 3D
  refs: 
    - feedback-no-hud-kagami-tokens
  type: reference
  originSessionId: 18d6fbcf-a6d1-45e3-b497-69f1499630c8
---

FACTS:
- viz-lab skill BUILT 2026-06-16 — canonical `skills/viz-lab/SKILL.md` + published mirror `.claude/skills/viz-lab/SKILL.md`; registered in `skills/domain-index.json` (06-design-content-business) + `_SYSTEM/AGENTS/skills-registry.md`; skill-hash manifest refreshed (`yuri-skill-loader --write-manifest`, 241 entries); architecture-audit = PASS (0 FAIL, one of 13 clean).
- METHOD: ground every viz in REAL YURI code/data via a `demos/build/*.mjs` generator; best-tool-per-depiction (NOT least-friction); standalone-first `file://`-safe (CDN module imports + local-data `<script src>` globals, NEVER relative imports / fetch); adversarial fidelity verify (recompute a cell, confirm a real invariant, independent render-review); port to the Vite/R3F app.
- ASSETS: demos in `demos/` (vol-surface, energy-surface=real computeU, qsphere=real quantum-hypothesis-tracker embedded, circuitry-heb + circuitry-die-3d=real yuri-die-graph 242 nodes). Landscape survey `02_RESOURCES/RESEARCH/visualization-landscape-2026-06-16.md`.
- CREATE-SKILL FLOW (this rework's convention): write `skills/<name>/SKILL.md` (byte-0 frontmatter, name + CSO description, Session Notes) → mirror to `.claude/skills/<name>/` (new skills must be placed in BOTH; skill-sync SKIPS uncommitted) → register in `domain-index.json` + `skills-registry.md` → `yuri-skill-loader --write-manifest` → `skill-architecture-audit` (0 FAIL required).

IMPLICATION: invoke `/viz-lab` (or "visualize X" / "make this 3D") for YURI visualization builds; reuse the create-skill flow for any new skill.
SEE: [[feedback-no-hud-kagami-tokens]]
