---
name: upgrade-propagation-engine
description: "ACTIVE DESIGN+BUILD (Marcel re-flagged 2026-06-04 'broad aware upgrade'): when one mechanism is added/improved, detect it, cross-reference the circuitry graph + mechanism spectrum to find sibling mechanisms that get the SAME treatment, queue each as a prioritized GATED proposal. One idea ripples YURI-wide, not siloed. The SIBLING-PROPAGATION half of the Broad-Aware Upgrade doctrine (the doc-sync half = [[circuitry-change-propagation-continuity]])."
metadata: 
  node_type: memory
  type: project
  tier: working
  scope: main
  trig: 
    - upgrade propagation
    - cross pollination
    - yuri wide upgrade
    - propagation engine
    - cross-domain transfer engine
    - ripple
    - amplify upgrades
    - cutting edge sweep
    - broad aware upgrade
    - broad-aware upgrade
    - treat the rest too
    - one upgrade ripples
  refs: 
    - "[[session-resume-2026-06-03-cortex-decoder-circuitry]]"
    - "[[cross-domain-transfer-engine]]"
    - "[[moat-activation-4track-2026-06-03]]"
    - "[[circuitry-change-propagation-continuity]]"
  originSessionId: 7c5d16a8-012a-45bd-9e7f-e27f602edc51
---

GOAL: build an UPGRADE-PROPAGATION ENGINE so improvements to YURI ripple YURI-wide instead of staying siloed on the one mechanism being worked on. WHO: Marcel (owner, vision 2026-06-03); Claude drives the design. WHEN: next session ("lets figure that out in the next session aswell").

## THE VISION (Marcel's words, decoded)
When we add or improve a mechanism (e.g. apply a transfer from the math-theory catalog), don't just patch that one spot — DETECT the improvement, CROSS-REFERENCE where the same pattern/weakness lives elsewhere in YURI, and queue every sibling for the same upgrade, EACH at full treatment + priority. "One little idea can influence and improve multiple parts independently across YURI" → continuously, holistically cutting-edge.

Worked example (his): the math research that dropped — a transfer like "Cox hazard aging replaces a hand-tuned constant" should fire a sweep: where ELSE do we hand-tune a constant a learnable curve could replace? (the cortex's beliefWidth, the energy weights, FSRS params, the freshness floor...). The improvement propagates to every applicable site.

## WHY IT'S NOT FROM-SCRATCH — two existing pieces point straight at it
1. **The circuitry graph IS the substrate.** `02_RESOURCES/RESEARCH/yuri-circuitry-graph.json` (83 nodes / 153 edges, now fully prose-described) is the dependency/affected-pieces map this engine traverses to find "where else." GitNexus impact analysis is the call-graph complement.
2. **It's the Cross-Domain Transfer Engine, turned INWARD.** The circuitry map flagged "Cross-Domain Transfer Engine" as a CLAUDE.md PHANTOM (claimed live, never built — [[cross-domain-transfer-engine]]). Marcel's idea = that engine self-directed: external = "transfer mechanism from domain A to YURI problem B"; inward = "when YURI mechanism X is upgraded, transfer the upgrade to sibling mechanisms Y, Z that share the pattern." Building this makes the phantom REAL with a higher-value job.

## DESIGN SHAPE (to figure out next session)
- DETECT: an upgrade/addition (a commit, a new mechanism, a catalog transfer) → extract the PATTERN it embodies (e.g. "replaced a hand-tuned constant with a learnable curve", "added fail-closed timestamp validation", "added an identity-not-magnitude veto").
- CROSS-REFERENCE: scan the mechanism spectrum (267) + circuitry graph + corpus for sibling sites where that same pattern applies → candidate list with applicability scores.
- RANK + GATE: surface the top N as PROPOSALS (full treatment each), NOT auto-apply. Bound the cascade.

## THE RISK TO DESIGN AGAINST (adversarial-ally flag, Marcel acknowledged the vision)
Unbounded cascade / scope-explosion: "every improvement triggers YURI-wide upgrades, each full-priority" can spawn 20 cascading rewrites from one tweak (Marcel's named risk: context explosion). The engine MUST be disciplined: detect → rank by real applicability → bound → propose top N, not chain-react. Propagation gated, not automatic.

## 2026-06-04 — ELEVATED TO ACTIVE (Marcel re-flagged this turn)
Marcel: "my idea of implementing a mechanism of broad aware upgrade, one thing in yuri gets upgraded, the rest gets treated too where applicable ... it should be in planning or noted." Status: NOW IN ACTIVE PLANNING, not a parked next-session idea.

**Unified doctrine — "Broad-Aware Upgrade" = two halves of one motion:**
1. **Doc/artifact-sync half** = [[circuitry-change-propagation-continuity]] (existing law): any change → propagate to every dependent artifact + doc (graph → viz/engine → manual → re-verify → reindex). Keeps the MODEL honest.
2. **Sibling-mechanism half** = THIS engine: any *improvement* → find every sibling SITE that shares the upgrade's pattern and queue it for the same treatment (gated). Makes the SYSTEM cutting-edge holistically.

**First concrete fuel = the 36-card math-transfer catalog** (`02_RESOURCES/RESEARCH/math-theory-transfer-catalog-2026-06-03.md`). It is already pattern-clustered, which IS the propagation substrate. Key recurring patterns (each = a propagation trigger):
- "replace a hand-tuned constant with a learnable/principled curve" → cards 18 (Cox β), 28 (MaxEnt retires beliefWidth), 11 (OCO weights), 9 (IDM generalizes n≥50), 1 (Kalman Q/R). **This IS Marcel's worked example** (Cox-aging fires "where ELSE do we hand-tune a constant?").
- "read the sample-count-aware LOWER BOUND, not the point estimate" → cards 9, 25, 19.
- "gate on per-source IDENTITY, not a conserved magnitude aggregate" → shipped delta-gate veto, cards 18, 36 ([[delta-gate-severity-laundering]]).
- "shared resolved-outcome-log prerequisite unblocks several cards at once" → cards 11 + 12 + 27 (build the log once, three transfers light up). The propagation engine should surface this kind of shared-prereq automatically.
- "composable read-only architecture-graph analyzers" → cards 4, 16, 17 collapse into one analyzer.

**THE BIND (decoded this turn):** wiring the maths and building the propagation engine are the SAME mechanism from two ends — the act of wiring transfer X is exactly the DETECT event the engine fires on; the catalog's pattern-clusters are exactly the sibling-site map it cross-references. Build the engine using the catalog as its first validated corpus; each math we wire becomes a live propagation demo.

**Plan artifact:** roadmap forthcoming this session at `02_RESOURCES/RESEARCH/` (sequences maths-wiring through the propagation lens + holds the open moat threads T3 + CAPSTONE). Design grounded by a live seam-verification + 3-design judge workflow (run 2026-06-04).

SEE: [[session-resume-2026-06-03-cortex-decoder-circuitry]] · [[cross-domain-transfer-engine]] · [[moat-activation-4track-2026-06-03]] · [[circuitry-change-propagation-continuity]] · [[delta-gate-severity-laundering]]
