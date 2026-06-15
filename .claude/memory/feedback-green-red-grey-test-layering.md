---
name: feedback-green-red-grey-test-layering
description: Verification completeness = GREEN/RED/GREY layers; RED (planted mutants) only covers failure modes WE imagined; shrink GREY with independent oracles + an automated mutation survivor sweep
metadata: 
  node_type: memory
  type: feedback
  originSessionId: 27e6476f-e479-4e3a-a38a-a94ec10b4c86
---

RULE: Treat test completeness as three layers, not two. GREEN = real code holds the property ∀-input. RED = planted mutants get caught — but this ONLY proves we catch failure modes we *imagined and hand-wrote*; RED's reach equals our imagination, nothing more. GREY = everything unplanted: unknown-unknown bugs · equivalent mutants (undecidable to detect, SHOULDN'T be caught) · wrong-property risk (code ⊨ a property that is itself wrong/vacuous) · unmeasured input regions. RED passing is NOT completeness.

WHEN: Building or hardening any verification instrument (invariant prover, metamorphic suite, gate property verifier, coverage meter, equivalence checker) — or when asked "what catches the ones we didn't think of" (Marcel's "grey test" question, 2026-06-14).

DO: Shrink GREY with mechanisms that catch bugs WITHOUT a planted mutant — (1) independent/differential oracle (B3 `crossCheckSpec`: spec encoded independently of impl, any ∀-input divergence flags either side — the strongest); (2) oracle-free metamorphic relations `f(T(x)) R f(x)`; (3) falsifiable structural claims (throw 1000s of extreme inputs trying to break an "impossible" claim — D's phantom test); (4) property-based RANDOM exploration (random state space, not hand-picked cases); (5) coverage meter (names blind regions → converts unknown→known unknowns). The systematic grey-catcher to BUILD: an AUTOMATED MUTATION SURVIVOR SWEEP over computeU+gateProposal — auto-generate a family of mutants (negate/zero/drop/scale/bias/swap a contribution; drop a veto arm; flip a comparator), run each through the FULL green+red+cross-check suite, report SURVIVORS (caught by none) = real gaps vs equivalent mutants, emit a mutation score. Plus the failure-anchored loop: an escaped bug becomes a new permanent mutant → grey shrinks monotonically.

DONT: Call a suite "complete" because RED passes (RED = imagined mutants only). Auto-flag equivalent mutants as bugs (undecidable). Drop a coverage bin using a GENERATOR-domain max (that launders a generator gap as impossibility — only structural impossibility justifies dropping, and it must be falsifiable).

STYLE: The survivor sweep also grades the graders — it measures whether the controls themselves have the coverage we claim. Build it as the capstone of a verification-hardening wave.

WHY: No finite suite eliminates GREY (unknown-unknowns are unbounded; equivalent-mutant detection is undecidable). The win is shrinking GREY AND making the shrinking systematic. Marcel named the exact limit of mutation testing and endorsed building the survivor sweep.

SEE: [[proj-energy-calibration-swarm-sheet-2026-06-13]] · substrate-frontier-grade B2 wave (yuri-energy-invariants / -metamorphic / -coverage / -equivalence / -gate-invariants) · BUILD-CONTRACT at 02_RESOURCES/RESEARCH/substrate-frontier-grade-2026-06-14/00-BUILD-CONTRACT.md
