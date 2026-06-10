---
name: circuitry-auto-registration-regen-vision
description: "Standing directive (Marcel 2026-06-06) — stop hand-adding circuitry nodes; everything that joins YURI's wiring (incl. TESTS) auto-registers + the die is mathematically regenerated; microscope LOD-zoom viz"
metadata: 
  node_type: memory
  type: project
  tier: high
  scope: circuitry
  trig: 
    - circuitry
    - die
    - node
    - regenerate
    - register
    - viz
    - test-node
    - zoom
  refs: 
    - circuitry-change-propagation-continuity
    - master-navigation-index-vision
    - cross-domain-transfer-engine
  originSessionId: fd6806d3-8e56-47d5-ac11-51d2752c5091
---

GOAL: Replace MANUAL circuitry-node addition with a REGISTRATION + MATHEMATICAL-REGENERATION pipeline. Anything added to YURI's wiring — modules, mechanisms, AND tests — gets registered once; the circuitry die is then deterministically *derived/regenerated* from the registry + the live filesystem/code/test graph (model = reality applied to the self-model). This closes the [[circuitry-change-propagation-continuity]] law BY CONSTRUCTION instead of by discipline.

WHO: Marcel (owner directive, decoded + confirmed 2026-06-06).

WHERE: circuitry generators at 02_RESOURCES/RESEARCH/build-circuitry-html.mjs + 02_RESOURCES/RESEARCH/circuitry/build-circuitry-instrument.mjs; graph 02_RESOURCES/RESEARCH/yuri-circuitry-graph.json; layout docs circuitry-layout-theory-2026-06-04.md + circuitry-visual-layout-doctrine-2026-06-03.md.

STATE: Vision captured + a design lane dispatched (2026-06-06). Three fused requirements:
1. AUTO-REGISTRATION — declare a node/mechanism/test once; no hand-drawn graph edits. Tests are first-class nodes (each test = a tiny safety-parameter / guard-vector worth showing in the die).
2. MATH REGENERATION — the die is regenerated from the registry deterministically; change the system → regenerate → die already reflects it. The matcher engine (corpus-match `{id,text}` over the code+test corpus) is the natural substrate — same spine as [[master-navigation-index-vision]].
3. MICROSCOPE VIZ — one large multi-scale map with LOD zoom: macro organs → modules → mechanisms → individual tests/parameters revealed as you zoom in, like a chip die under magnification. CONSTRAINT (Marcel 2026-06-06c): build this INTO the EXISTING circuitry die (yuri-circuitry-chip.svg / the current circuitry instrument + build-circuitry generator) — extend it with the LOD/zoom layers, do NOT create a new/parallel visualization. Nothing new; deepen what we have.
4. MATH-GENERATED BOARD ENVIRONMENT (Marcel 2026-06-06c) — not just the nodes: the BOARD/substrate they sit in is itself mathematically generated and AUTO-EVENLY-DEVELOPS as it fills over time. Mechanism = incremental low-discrepancy placement: the golden-angle / φ sequence (now BUILT in math/yuri-phi.mjs → goldenAnglePoints, phiSequence) drops the n-th node into the current largest gap, so the layout stays EVEN at every N — add a node and the board re-balances without a full re-layout or hand-tuning. As organ-regions fill, the environment subdivides evenly (recursive low-discrepancy / region treemap). The die grows trace-by-trace, never lopsided. yuri-phi is the layout engine for this.

NEXT: fold the design-lane architecture; decide registry schema + the derive-from-filesystem mechanism + the LOD-zoom viz approach; then owner-gated build. Until built, the standing RULE applies: every artifact I add that's part of YURI's wiring (incl. new test files) must be registered into the circuitry — do not leave orphan additions.

SEE: [[circuitry-change-propagation-continuity]] (the propagation law this automates), [[master-navigation-index-vision]] (shared retrieval-completeness spine), [[feedback-circuitry-visual-is-chip-die]] (the chip-die aesthetic the viz must hold).
