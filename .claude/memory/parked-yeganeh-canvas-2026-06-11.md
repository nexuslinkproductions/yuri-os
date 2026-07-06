---
name: parked-yeganeh-canvas-2026-06-11
description: "Yeganeh formula-canvas thread PARKED 2026-06-11 — REMIND MARCEL ON 2026-06-16; visual output was a miss (NaN leaf, unrecognizable forms)"
metadata: 
  node_type: memory
  type: project
  originSessionId: 90a2ad8e-72f4-4f2f-bf66-7066b2bc861b
---

GOAL: Yeganeh-style constructive math art in YURI (formula-canvas engine).
STATE: PARKED by Marcel 2026-06-11 ("big miss, not a train wreck"). **REMIND HIM 2026-06-16** (in-session cron b1800eb3 exists but dies with the session — this memory is the durable reminder; any session active on/after that date should surface it).
WHERE: engine `_SYSTEM/Scripts/formula-canvas-engine.mjs` (tests 6/6) + refine runner; research doc 02_RESOURCES/research/yeganeh-math-art-mimo-2026-06-11.md.
WHY PARKED: rendered SVGs unrecognizable — leaf family emits all-NaN coordinates (suspect: pow with negative base in the AST evaluator), bird/heart are bare arc bands; the L1 density-grid score improves without producing recognizable form (score ≠ perception).
NEXT (on resume): (1) fix NaN path in evalNode/pow; (2) structure-aware scoring (edges/regions, not raw L1); (3) target-first formula design (place region generators on the target silhouette analytically, refine only residuals) instead of refine-from-random.
SEE: [[wave3-fix-wave-2026-06-11]]
