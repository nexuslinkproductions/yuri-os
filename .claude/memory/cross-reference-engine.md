---
name: cross-reference-engine
description: "ACTIVE BUILD IDEA (Marcel 2026-06-04, loved it live): the systematic cross-reference capability — take any artifact, verify it against the WHOLE system, surface siblings/drift/dependencies/moot — is becoming a first-class YURI instrument. Marcel wants it improved. It is the SPINE that unifies the propagation engine + cross-domain-transfer + the breadth/depth law. 5 improvement axes."
metadata:
  node_type: memory
  type: project
  tier: working
  scope: main
  trig:
    - cross reference
    - cross-reference engine
    - cross referencing
    - improve the cross referencing
    - systematic overview
    - verify against the system
    - drift detection
    - where does this live
  refs:
    - "[[upgrade-propagation-engine]]"
    - "[[cross-domain-transfer-engine]]"
    - "[[hold-big-picture-breadth-and-depth]]"
    - "[[circuitry-change-propagation-continuity]]"
  originSessionId: fbd2b7b2-1d10-45fd-b2bb-5481c763f291
---

GOAL: evolve the manual cross-referencing (demonstrated live this session — verify the 36-card catalog vs live code, map the RAG drift surface, find every sibling site) into a first-class YURI **Cross-Reference Engine**. WHO: Marcel (loved it live, asked to improve it). WHEN: 2026-06-04, active. WHERE: substrate = circuitry graph (`02_RESOURCES/RESEARCH/yuri-circuitry-graph.json`, 83n/153e) + FTS5 corpus (`ai search`, 38.7k docs) + GitNexus (call graph/impact) + mechanism spectrum (267).

## THE CONVERGENCE (decoded 2026-06-04) — one spine, three hats
Marcel's three asks this session are the SAME instrument:
1. "wire the maths" + two-tier math engine → needs cross-ref to find where each transfer applies + its siblings.
2. [[hold-big-picture-breadth-and-depth]] (the meta-law) → cross-ref IS the mechanism that holds breadth while going deep (the full systematic overview, always live).
3. "improve the cross-referencing" → build the engine all of the above depend on.
The Cross-Reference Engine is the GENERAL capability; [[upgrade-propagation-engine]] (find siblings to UPGRADE) and [[cross-domain-transfer-engine]] (find mechanisms to TRANSFER) are two CONSUMERS of it. The circuitry instrument is its live externalized substrate.

## WHAT IT DOES (mechanically, today, run by hand)
INPUT an artifact (card / term / upgrade / claim) → map hits across surfaces (FTS5 + grep/live-code + circuitry graph + GitNexus + spectrum) → CLASSIFY each (sibling-to-upgrade / drift / legitimate-leave / blocked-by-prereq / strategically-moot) → VERIFY vs LIVE code, not docs → surface the cascade + risk + confidence.

## 5 IMPROVEMENT AXES (Marcel "is there a way we can improve it more?")
1. **Unify the surfaces** — one query fans across FTS5 + circuitry-graph + GitNexus + spectrum and merges, instead of me hopping 4 surfaces by hand. They are complementary lenses: lexical / structural / call-graph / conceptual.
2. **Mechanism-signatures, not lexical overlap** (THE biggest lever). The judged propagation design's #1 risk = "mechanism-fit theater" — BM25 surfaces VOCABULARY-siblings not MECHANISM-siblings, flooding the queue with plausible noise that kills trust. Fix: tag each node/mechanism with its underlying PATTERN (hand-tuned-constant / lower-bound-not-point / identity-not-aggregate / read-only-graph-analyzer …) so cross-ref scores on shared MECHANISM. Turns a search into a transfer engine. (= the V2 spectrum-tagging the judge flagged as the precision unlock.)
3. **Live-verification / drift-detection built in** — the highest-value move this session was checking claims vs LIVE code (caught the ~1-day line-drift, the offload corpse, the already-built spectral engine). The engine should AUTO-CHECK "does this seam still exist at path:line?" → a standing drift detector; every hit carries a freshness/verified stamp. This mechanizes [[circuitry-change-propagation-continuity]] — the model can't silently drift from reality.
4. **Confidence + provenance per hit** — call-graph sibling (GitNexus) = HIGH; pattern-signature sibling = HIGH; lexical-only = LOW + a MANDATORY human-read "why it might NOT transfer" (the judge's containing gate). Keeps the backlog trustworthy.
5. **Continuous + externalized** — a standing index kept fresh on change, so the full systematic overview is ALWAYS live (not on-demand). The circuitry graph becomes the engine's live substrate; the instrument visualizes it. Breadth+depth-at-once, mechanized.

## HOME = the repurposed offload organ (Marcel 2026-06-04, DELICATE)
Owner decision: the offload deletion order was about the OUTDATED CONTENTS, not the organ slot. The cross-reference engine gets INSTALLED in that slot; the sector gets RENAMED. Sector = the `Skills & Orchestration` graph layer (`offload-contract`, `offload-runner`, `startup-offload`, `shintai-dispatch`, `scout-orchestrator`). Does NOT revive cards 5/7 (dispatch contents still go; the SLOT is reborn). STAGED build (offload has ~16 importers; cross-ref engine not built yet; continuity law forbids a false rename): build engine → migrate importers → delete husks → install → rename sector across graph+registries+docs in one motion → reverify+reindex. Each step owner-gated. Full plan: roadmap §10.2 (`02_RESOURCES/RESEARCH/yuri-math-engine-and-propagation-roadmap-2026-06-04.md`).

## TIES TO THE LIVE MEMORY-FULL PROBLEM (2026-06-04)
The subconscious is healthy but starved (demote=0, rapid-mlx LLM-dedup offline) — memory bloats. The cross-ref engine's sibling discipline + the memory-organ cards 14 (MDL/gzip) + 30 (Jaccard) are the LLM-free dedup that fixes it. Same coherence mission: keep the system clean + cross-referenced. Roadmap §10.3.

## CORRECTION (2026-06-04, adversarial+coherence+competitive pass) — the UNIT is the GRAPH NODE, not the formula-card
My "evolved formula-card = one unit, four engines" was over-unified. Verified live: 21 thin math-primitive cards, none carrying mechanismPattern/organ; the 5 patterns describe CROSS-ORGAN CODE mechanisms (energy weights, guards, memory code) that aren't formula cards. CORRECTED through-line: the circuitry-graph NODE is the universal mechanism record; the formula-card is the math-specific elaboration on math nodes. mechanismPattern lives on the NODE. Three render channels, ONE owner each: structure→size (arch-graph engine), pattern→color/edges (mechanismPattern), heat→breath (live channel) — no triple-sizing double-build.

**Axis 2 SHARPENED by prior art (the #1 transfer, all 5 tools agree):** match siblings on SEMANTIC STRUCTURE, not lexical tokens. OpenRewrite/Refaster match on typed LST/AST; none guess from words. YURI's token-based DETECT is the exact lexical guess they avoid → add a STRUCTURAL leg via GitNexus call-graph (same edge-kinds, same kernel primitive, same before-shape); auto-suppress lexical-pass/structural-fail. Plus Semgrep's negative-fixture rule = the machine-check against mechanism-fit theater (a pattern must ship a look-alike that is NOT it). Full shaped design + citations: `02_RESOURCES/research/three-seams-shaped-with-prior-art-2026-06-04.md`.

## NEXT
Fold these axes into the propagation-engine spec (the judged Design-B-core gets axes 2+4 as its precision layer; axis 3 is the drift-detector half). Sequence in the two-tier math roadmap. The mechanism-signature tagging (axis 2) is the shared unlock for BOTH the cross-ref engine precision AND the propagation engine's pattern_cooccur/tag terms.

SEE: [[upgrade-propagation-engine]] · [[cross-domain-transfer-engine]] · [[hold-big-picture-breadth-and-depth]] · [[circuitry-change-propagation-continuity]]
