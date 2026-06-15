---
name: ref-circuitry-dual-graph-architecture
description: "YURI has TWO circuitry graphs by design (A=viz/240, B=wiring/118); B is canonical for nav; merge is an owner-gated add-only pipeline, glob-union was rejected"
metadata: 
  node_type: memory
  type: reference
  tier: 2
  scope: circuitry
  trig: 
    - which graph
    - two graphs
    - yuri-graph.json
    - circuitry-graph.json
    - propagation-scan not found
    - graph merge
    - dual graph
    - 240 vs 118
  refs: 
    - proj-claim-wiring-audit-2026-06-13
    - circuitry-material-mix-merge
    - circuitry-auto-registration-regen-vision
  originSessionId: d0121710-5fe7-4681-801a-e863c3393975
---

FACTS:
- TWO circuitry graphs exist BY DESIGN, not as a bug. A = `_SYSTEM/yuri-graph.json` (240 nodes, keys `{id,tiers,flow,mechanism,label}`) = VIZ/topology graph for the chip-die render; carries dead/retired nodes (the 29 retired pulse-orchestrator refs + 3 pulse-codex-runner refs live in A). B = `02_RESOURCES/RESEARCH/yuri-circuitry-graph.json` (118 nodes, keys `{id,label,layer,files,triggeredBy,description}`) = WIRING/provenance graph; CANONICAL for navigation.
- `xref-query.mjs` + `propagation-scan.mjs` read B (the 118-node provenance graph) — this is CORRECT (B carries the `files`/`triggeredBy` fields nav needs; A lacks them entirely). B ⊂ A: all 118 of B's ids are in A; 122 ids are A-only.
- Merge mechanism EXISTS and is owner-gated add-only: `regenerative-nexus-guard.mjs` class-G detector finds modules on disk absent from B → `nexus-guard-autowire.mjs` emits add-only node stubs in B-schema → owner reviews → add-only merge into B → `ai reindex`. Standing queue: `02_RESOURCES/RESEARCH/circuitry-autoregen-queue-2026-06-06.md`. `circuitry-auto-register.mjs` is the detection/similarity-edge substrate.
- The naive 104-node GLOB union was REJECTED ("boilerplate-glued, not a real merge — both lanes agree", yuri-enhancement-architecture-2026-06-06.md). DO NOT propose a schema-union/glob to "merge the two graphs."

IMPLICATION:
- `propagation-scan` returning "node-id not found" for 122 A-only ids is part-legitimate (real modules like BASH_GUARD absent from B → add via the autoregen pipeline) and part-correct (A-only viz/dead nodes that should NOT be in the wiring graph). The fix is RUN the existing pipeline + purge dead nodes from A — never a glob-union.
- When asked to "merge the graphs," reach for the owner-gated autoregen pipeline, not a union. Keep A/B as two views.

SEE: [[proj-claim-wiring-audit-2026-06-13]], ops plan `_SYSTEM/reports/claim-wiring-ops-plan-2026-06-13.md`, [[circuitry-material-mix-merge]] (separate — that's a VISUAL material merge, not graphs).
