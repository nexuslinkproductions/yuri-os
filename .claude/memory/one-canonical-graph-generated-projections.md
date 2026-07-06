---
name: one-canonical-graph-generated-projections
description: "YURI has ONE canonical graph (_SYSTEM/yuri-graph.json) since 2026-06-08. The two old graph files — yuri-graph-state.json (flow/arch view) + yuri-circuitry-graph.json (mechanism/die view) — are now LOSSLESS GENERATED PROJECTIONS, not separate sources. Edit the canonical, run yuri-graph-unify.mjs project. NEVER hand-edit the views."
metadata: 
  node_type: memory
  type: reference
  tier: high
  scope: nexus
  trig: "graph, circuitry graph, yuri-graph-state, yuri-graph, canonical, projection, two graphs, propagation, die, regenerate, drift"
  refs: 
    - circuitry-auto-registration-regen-vision
    - yuri-mathematical-filing-system
  originSessionId: 4ed73ec6-6154-40e8-99d5-61bd201923eb
---

FACTS:
- CANONICAL SINGLE SOURCE = `_SYSTEM/yuri-graph.json` (tiered union; each node has `tiers:[flow|mechanism]` + a
  per-view field bag). 237 nodes at creation.
- `_SYSTEM/yuri-graph-state.json` (flow / conceptual-operating map: USER→ENKI→ROUTING, layout/telemetry/metrics)
  and `02_RESOURCES/RESEARCH/yuri-circuitry-graph.json` (mechanism / code die: energy-fn/formula-foundry, files[])
  are GENERATED PROJECTIONS of the canonical — each carries a `_generated` do-not-hand-edit marker.
- They were NEVER clones (only ~4 of ~240 ids overlap) — two different ALTITUDES (flow vs mechanism). The problem
  was two SEPARATELY-EDITABLE sources → drift (the die went stale at 108 while the source was 112).
- Engine: `_SYSTEM/Scripts/yuri-graph-unify.mjs` (13/13 test). `seedCanonical` unions both; `projectFlow`/
  `projectMechanism` regenerate the views in ORIGINAL node + top-level-key order (1-line diff, not a re-sort);
  `verifyLossless` proves the byte-for-byte round-trip.

IMPLICATION (how to work the graph now):
- To add/edit a node or edge: edit `_SYSTEM/yuri-graph.json` (set `tiers`, the `flow`/`mechanism` field bag, and
  push to `flowOrder`/`mechOrder`), then `node _SYSTEM/Scripts/yuri-graph-unify.mjs project` — both views + (run
  build-chip-die) the chip-die regenerate. Then `verify` for losslessness.
- NEVER hand-edit yuri-graph-state.json or yuri-circuitry-graph.json — they are overwritten on the next project.
- navigate / propagation-scan / build-chip-die read the mechanism view; arch-graph-engine / visual-introspection
  read the flow view; all stay UNCHANGED (low-risk consolidation — consumers read the projections).
- Open follow-ons (the auto-registration organ, [[circuitry-auto-registration-regen-vision]]): a guard that
  blocks direct edits to the generated views; auto-running project on a canonical change; richer per-node
  affected-areas guidance. SEE [[yuri-mathematical-filing-system]].
