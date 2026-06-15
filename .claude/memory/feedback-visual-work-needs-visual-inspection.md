---
name: feedback-visual-work-needs-visual-inspection
description: "Visual jobs MUST be verified by actually looking at rendered output (screenshots → image-capable inspection), not just code probes/smoke tests"
metadata: 
  node_type: memory
  type: feedback
  tier: semantic
  scope: main
  trig: 
    - visual verification
    - screenshot inspection
    - design verify
    - render check
  originSessionId: 58f041dd-49c1-462d-b2aa-28dd0d439ac3
---

RULE: A visual deliverable (hero scenes, canvas art, layout, motion) is NOT verified until the rendered pixels have been inspected visually.
WHEN: Any time I claim a visual build/iteration is done — before reporting to Marcel.
DO: Render screenshots (headless Chrome `--screenshot` against file:// with a debug scrub param like `?heroP=0.5`, or a real browser capture) at the key states/scroll positions; inspect the images myself (I can read images) or dispatch a cheap image-capable agent (Haiku/Sonnet) to critique composition, proportion, readability; iterate before claiming done.
DONT: Ship a visual claiming "verified" off syntax checks, SDF probes, and stubbed-DOM smoke tests alone — those prove it RUNS, not that it LOOKS right. Marcel caught a "male android Ironman knockoff" that all code probes called PASS (2026-06-12).
WHY: Geometry probes measure numbers, not gestalt. Proportion, silhouette read, palette balance, and composition only exist in the rendered image.
SEE: [[feedback-harness-batch-and-headless]] (dump-dom + real browser caveat) · [[feedback-design-iteration-marcel]]
