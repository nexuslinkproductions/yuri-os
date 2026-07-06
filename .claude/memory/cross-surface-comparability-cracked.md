---
name: cross-surface-comparability-cracked
description: "How YURI's \"0.4 in memory ≠ 0.4 in code\" cross-surface recall got solved — containment + RRF (v2, shipped), with the build order and the structure-first verdict for what's next."
metadata: 
  node_type: memory
  type: project
  tier: high
  scope: nexus
  trig: "cross-surface, recallAll, containment, comparability, fusion, calibration, navigate"
  refs: 
    - governance-gvf-gpd-breakthrough
  originSessionId: 4ed73ec6-6154-40e8-99d5-61bd201923eb
---

GOAL: make `recallAll("<cue>")` rank across surfaces (code/memory/docs/graph) — Marcel: "expand the
mathematical possibilities so it works, i know it is possible." DONE for v2, CONFIRMED on real data (2026-06-07).

WHO: 9-agent wave (1 native Claude + 5 Codex gpt-5.5 + 3 DeepSeek, separate quota).

WHERE: `_SYSTEM/Scripts/yuri-containment-match.mjs` (+ precision-gate), `yuri-match-fusion.mjs` (RRF),
`yuri-match-global-space.mjs`, `yuri-match.mjs` (recallAsym/recallAll), `xs-confirm-containment.mjs` (the
confirm-or-kill). Synthesis: `02_RESOURCES/RESEARCH/yuri-cross-surface-synthesis-2026-06-07.md`.

STATE: root cause = symmetric Jaccard punishes size mismatch (4-feature cue in a 120-feature doc has a HARD
ceiling |q|/|d|≈0.033, then the length band excludes it) + per-corpus feature space. Fix that shipped:
**containment** `|q∩d|/|q|` (cue-anchored, size-immune, complete via posting-count ≥ ⌈t·|q|⌉) + **RRF** k=60
over per-surface complete sets (distribution-free, no calibration dep) + IDF-weighted precision-gate (= BM25
b=0, |q|<4 → sharp:false, never drops a complete result). Confirm-or-kill: code cue surfaced code+memory+doc
at containment 0.88–1.0, decoys ≤0.18. Tests: containment 15/15, fusion 8/8, global-space 17/17, regressions green.

NEXT (frontier-unanimous, STRUCTURE-FIRST): (1) id-bridge table + `yuri-navigate.mjs` — typed structural edges
bypass similarity comparability entirely, THE highest-leverage brick; (2) GVF calibration C-layer (labels-gated
keystone — needs a shadow ledger + deterministic label harvest since memory has ~11 items) → comparable SCORES
+ score-fusion P(overclaim)≤α + full GPD ΔU loop; (3) global feature space DEFERRED (marginal over calibrated RRF).

SEE: [[governance-gvf-gpd-breakthrough]] · roadmap `02_RESOURCES/RESEARCH/YURI-NEXUS-ROADMAP.md`.
