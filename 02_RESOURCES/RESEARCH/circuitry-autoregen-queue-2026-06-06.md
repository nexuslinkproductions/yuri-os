---
name: circuitry-autoregen-queue-2026-06-06
description: QUEUE — the 15 core modules the Regenerative Nexus Guard (class G) found absent from yuri-circuitry-graph.json. These are the first concrete batch for the circuitry auto-regen build (C6+C9, owner-gated add-only graph merge). Source of truth = the guard's class-G set, regenerated each run.
metadata: { node_type: queue, date: 2026-06-06, status: queued-owner-gated, feeds: nexus-core-design-queue-2026-06-06c }
tags: circuitry_autoregen, ungraphed, class_g, add_only_merge, queue
---

# Circuitry Auto-Regen — input queue (from Nexus Guard class G)

The Regenerative Nexus Guard's class-G detector (core scope) found **15 modules on disk + (mostly) in
the math manual but absent from `yuri-circuitry-graph.json`**. These are the concrete first batch for the
**circuitry auto-regen build (C6+C9)** — design in [[nexus-core-design-queue-2026-06-06c]],
vision in [[circuitry-auto-registration-regen-vision]]. Graph writes are **owner-gated, add-only**
(never auto-delete; diff before merge — the continuity-propagation law).

## The 15 (regenerate via `node _SYSTEM/Scripts/regenerative-nexus-guard.mjs` → class G)
Math substrate (12) — most are already documented in MATH-SCIENCE-MANUAL.md, just not graph-wired:
```
_SYSTEM/Scripts/math/transfer-distance.mjs            _SYSTEM/Scripts/math/yuri-minhash.mjs
_SYSTEM/Scripts/math/transfer-distance-cores.mjs      _SYSTEM/Scripts/math/yuri-token-expand.mjs
_SYSTEM/Scripts/math/yuri-jaccard.mjs                 _SYSTEM/Scripts/math/yuri-mdl.mjs
_SYSTEM/Scripts/math/yuri-phi.mjs                     _SYSTEM/Scripts/math/math-adapters.mjs
_SYSTEM/Scripts/math/math-health.mjs                  _SYSTEM/Scripts/math/math-operational-simulation.mjs
_SYSTEM/Scripts/math/mechanism-pattern-registry.mjs   _SYSTEM/Scripts/math/yuri-energy-trace-outcomes.mjs
```
Self-improvement (3):
```
_SYSTEM/Scripts/self-improvement/cross-reference.mjs
_SYSTEM/Scripts/self-improvement/weekly-comp.mjs
_SYSTEM/Scripts/self-improvement/weekly-consolidation.mjs
```

## How the auto-regen consumes this
1. `circuitry-auto-register.mjs` already extracts module records + similarity-family edges from these files (the detection substrate).
2. `nexus-guard-autowire.mjs` (Phase-2 writer) generates an add-only graph NODE stub per class-G finding
   (`{id,label,layer,files:[rel],triggeredBy,description}`) → proposal file, never the live graph.
3. Owner reviews the proposed nodes → add-only merge into `yuri-circuitry-graph.json` → re-verify → `ai reindex`.
4. The math-board (C9, golden-angle phyllotaxis on `yuri-phi.goldenAnglePoints`) renders the regenerated die.

## Why these aren't auto-merged now
The graph is the CANONICAL structural wiring. Per the continuity-propagation law + full-prerequisite-closure,
a node add ripples into the viz/engine + the manual + re-verify. The guard SURFACES the gap (read-only);
the merge is the owner-gated step. This queue is the standing input — re-run the guard to refresh it.
