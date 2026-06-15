---
name: feedback-diagnose-metric-before-system
description: "When an instrument shows something alarming, diagnose the METRIC's composition before assuming the system is broken or hiding it"
metadata: 
  node_type: memory
  type: feedback
  tier: standing
  scope: claude-behavioral
  trig: "alarming graph, drift, plateau, weird telemetry, \"fix the graph\", dashboards"
  refs: nexus-link-investor-deck-2026-06-13
  originSessionId: 58f041dd-49c1-462d-b2aa-28dd0d439ac3
---

RULE: An alarming reading is a hypothesis about the metric before it is a fact about the system.
WHEN: Any chart/telemetry/instrument shows something scary or embarrassing (plateau, spike, flatline) and the impulse is to hide it or "fix the system".
DO: Open the raw trace first. Decompose the metric (which term dominates, what is baseline vs dynamics). Re-derive the honest quantity that answers the actual question, label what was removed, and show that.
DONT: Smooth, clip, or delete the ugly region; ship the wrong composition because it was the default; assume drift/failure from an absolute value when the story lives in the deltas.
WHY: The V2 deck "drift plateau" at U≈41 was a constant klDivergence baseline riding on healthy work dynamics. The corrected work-dynamics component (U minus structural baseline) never crossed zero, which was a STRONGER story than the one the broken chart was hiding. Truth beat cosmetics on the first try.
SEE: [[nexus-link-investor-deck-2026-06-13]]
