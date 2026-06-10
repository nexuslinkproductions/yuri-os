---
name: energy-gate-linfinity-doubly-inert
description: "VERIFIED energy-gate finding (Nemotron red-team via the adapter, 2026-06-05): the L∞ max-severity veto in gateProposal is DOUBLY inert — not just cap=Infinity by default, but maxLadderInversion is HARDCODED 0 in the live tick path (energy-tick-core.mjs:230, propagated ?? 0 at 252/286). So arming the cap alone does NOTHING; the field feeding it is always 0."
metadata: 
  node_type: memory
  type: project
  tier: working
  scope: main
  trig: 
    - energy gate
    - gateProposal
    - L-infinity
    - maxSeverityVeto
    - maxLadderInversion
    - red team
    - wave 3
  refs: 
    - "[[delta-gate-severity-laundering]]"
    - "[[redteam-conscience-findings-2026-06-04]]"
    - "[[nemotron-framework-adapter-idea]]"
  originSessionId: 2448e5f4-5e5f-4625-bfa9-db81dc67ab4c
---

FINDING (verified vs live code): the L∞ max-severity veto (`maxSeverityVeto` / `maxLadderInversionCap`) in `gateProposal` (`_SYSTEM/Scripts/math/yuri-energy.mjs`) is inert on TWO independent axes, not one:
1. KNOWN: cap defaults to Infinity (`DEFAULT_MAX_LADDER_INVERSION_CAP`) → `capArmed=false` → the veto branch never runs. (Wave-3 owner-gated arming, already tracked.)
2. NEW (Nemotron-found, verified): even if you ARM the cap, `maxLadderInversion` is **hardcoded 0 in the live tick path** — `energy-tick-core.mjs:230` sets `maxLadderInversion: 0`, and lines 252/286 propagate `base.maxLadderInversion ?? 0` / `v.maxLadderInversion ?? 0`. The cortex emits the signal as groundwork but the live energy-tick path never populates it with real per-claim severity. So `maxLadderAfter` is always 0, `0 > cap` never fires → the veto is dead even when armed.

IMPLICATION: arming the L∞ cap (Wave-3) is NECESSARY-BUT-NOT-SUFFICIENT. You must ALSO wire real per-claim max-severity into `maxLadderInversion` along the live tick path (energy-tick-core), or the swap-fungibility / equal-magnitude-laundering hole the L∞ term was designed to close stays open in production. This is the deeper layer under [[delta-gate-severity-laundering]].

PROVENANCE: surfaced by the Nemotron-3-Ultra reasoning lane via the framework adapter (tool-grounded — it read the live files), then verified by Claude against energy-tick-core.mjs:230/252/286. The adapter + cross-model triangulation earned a real, verified build lead. (The DeepSeek lane returned empty on the same task — separate lane bug, see report.)

NEXT (Wave-3, owner-gated): when arming the L∞ veto, also populate maxLadderInversion with real per-claim severity in energy-tick-core; add a test that an armed cap + a real high-severity claim actually trips.
