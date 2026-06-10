---
name: circuitry-change-propagation-continuity
description: "Standing law — any change to something the circuitry represents triggers the FULL propagation (graph → viz/engine → manual → re-verify → reindex); the rigorous large process IS the quality bar, and it generalizes to ALL YURI aspects"
metadata: 
  node_type: memory
  type: feedback
  tier: binding
  scope: all
  trig: 
    - circuitry
    - change propagation
    - update the viz
    - update the manual
    - continuity
    - keep in sync
    - extend yuri
    - any change
  refs: 
    - "[[upgrade-propagation-engine]]"
    - "[[session-resume-2026-06-03-cortex-decoder-circuitry]]"
    - "[[feedback-clean-structure-no-clutter]]"
  originSessionId: ac838f3b-aa39-4793-9049-6c32b65bdb31
---

RULE: The moment anything in YURI extends / changes / improves something the circuitry represents (an organ, mechanism, edge, file, or status), it TRIGGERS a mandatory full propagation — never a silent one-spot edit.

WHEN: any commit/edit/build that touches a node the circuitry graph models, OR (generalized) any change where a dependent artifact/doc would otherwise drift.

DO (in order): (1) verify the change vs LIVE code; (2) cross-reference the circuitry graph (`02_RESOURCES/RESEARCH/yuri-circuitry-graph.json`) for what it touches + its siblings (this is the [[upgrade-propagation-engine]] substrate — one idea ripples YURI-wide); (3) update the graph.json + regenerate the viz/engine; (4) update the BUILD-MANUAL (`02_RESOURCES/RESEARCH/circuitry/BUILD-MANUAL.md` — provenance §5 / decisions §9 / build-log §12); (5) re-run determinism + invariant checks; (6) `ai reindex`. The "large process" is REQUIRED, not optional.

DONT: patch the viz without the graph; touch the graph without the manual; ship a circuitry change unverified; let the model drift from the live architecture (a drifted model is a lie). Don't optimize for speed at continuity's expense.

WHY: the circuitry is a MODEL of the live YURI architecture; continuity between model and reality IS the product (Marcel's operating model: drift/forgetting = broken trust). The rigour is the feature, not overhead.

STYLE: applies to ALL YURI aspects, not just circuitry — any change → propagate to every dependent artifact + doc in one motion, then re-verify + reindex.

SEE: [[upgrade-propagation-engine]] (this is its operational doctrine) · [[session-resume-2026-06-03-cortex-decoder-circuitry]] · BUILD-MANUAL §11.
