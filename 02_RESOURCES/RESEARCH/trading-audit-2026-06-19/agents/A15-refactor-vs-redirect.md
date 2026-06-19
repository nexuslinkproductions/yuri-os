Verified all load-bearing claims. The hypothesis is **confirmed with important corrections**. Notable: the prior synthesis has drifted facts — stop-loss IS set, news layer IS partially built (Agent-Reach Exa + RSS), carry/funding/perp/cross-asset ARE all wired as overlays. The engine is more complete than the red-team believed. The core pathology is narrower and sharper: overlays → telemetry-only, learn-loop captures-but-never-promotes, sizing bypasses Kelly on the crypto path.

```
AGENT 15 — A15: unified REFACTOR-vs-REDIRECT verdict
SUMMARY: Hypothesis CONFIRMED — engine is FUNCTIONAL not buggy-to-bone; answer is STRATEGIC REDIRECT, not ground-up refactor. Prior "ruin/no-stop-loss" claims are STALE.

[C|CRIT|MISSING-PRINCIPLE] orchestrator.mjs:700 vs :638 — ALL real-edge overlays (funding/perp/carry-vol/cross-asset/social, L643-696) feed `overlaySignals` → telemetry ledger only; `combineSignals(signals)` at L638 gets price-derivatives ONLY. FIX: promote one overlay (funding-carry) into the sizing ensemble at its 8h horizon rung — this is THE redirect.
[A|CRIT|DESIGN-FLAW] orchestrator.mjs:907 vs :999 — crypto sizing = `equity*maxPct*min(1,strength*2)*regimeTrim` (ad-hoc, unbounded gross); `computeSize` (fractional-Kelly+vol-target) wired ONLY at polymarket path L999. FIX: route crypto through computeSize with portfolio cap (3×corr×lev).
[B|CRIT|MISSING-PRINCIPLE] orchestrator.mjs:1251,1279,1511 — learn loop CAPTURES but never PROMOTES: decodeAll (L1511) → AFL_LEDGER → reevaluateFactors runs `apply:false` dry-run (L1251) → getGraduation exported (L1279) but UNCALLED from cycle. "Every factor DSR≈0/Brier≈0.25" is an artifact of a DEAD feedback loop, NOT honest truth. FIX: arm apply:true nightly beat + wire graduation verdict back to strategy weights. THIS IS THE KEYSTONE.
[B|HIGH|THEATER] orchestrator.mjs:703,1361 — quantum factor-circuit writes `snap.circuit` (L703), never read by sizing; L1361 self-labels "DISARMED telemetry, never sizes". Honest label, but it is theater-vs-vision until armed or cut. FIX: move off hot path OR prove ratio>1 lifts outcomes (shadow ledger already records it).
[A|HIGH|DESIGN-FLAW] orchestrator.mjs:1048,1480 — 3 markets run SEQUENTIALLY (for-await). FIX: Promise.allSettled. Zero signal change, ~6s→~1s.
[C|HIGH|MISSING-PRINCIPLE] — ensemble.mjs confidence `0.5+|net|/2` is circular/unccalibrated; Platt/isotonic exist (yuri-energy-conformal) but DISARMED + trained on wrong label space. FIX: isotonic on (signal, trade-outcome) from the closed learn-loop — prerequisite for confidence-scaled holding at 20x.
[B|HIGH|DESIGN-FLAW] multi-tf-confluence.mjs:43 + orchestrator.mjs:853 — confluence = hierarchical higher-TF VETO (hard-gate), Marcel's "grave mistake" literally in code. FIX: penalized-weight not hard-veto; regime-conditional weights.

VERDICT for slice: STRATEGIC REDIRECT — NOT refactor. The engine is structurally sound (cycles run, feeds valid, overlays built, risk exits set stopLossPct:0.015 L127). It is ARCHITECTURALLY MISALIGNED: real-edge overlays unwired from sizing, learn-loop captures-but-never-promotes (the single root cause of "0 edge"), sizing bypasses Kelly, theater math on hot path, vision (HFT/quantum/news) drifted to μs-fantasy. Ground-up refactor would discard working plumbing; redirect rewires it.

HONEST EDGE CEILING: after redirect — ~55-57% directional / Sharpe ~0.4-0.6 post-fee at 3-8x (funding-carry path: +5-15%/mo on €300). NOT a rocket. HFT (μs, co-located) is FANTASY on Mac M2/retail-internet/public-WS — reframe to what fits: funding-carry 4h-daily, cross-asset lead-lag minutes, A-S maker execution.

RANKED MINIMUM-VIABLE PATH TO WORKING-AS-INTENDED:
1. CLOSE THE LEARN LOOP (keystone): arm reevaluateFactors apply:true nightly + graduation→weight feedback. Without this, no "edge" verdict is trustworthy — every factor scores 0 on a dead loop. Cheapest, highest-EV, reverses the entire "no edge" narrative.
2. PROMOTE funding-carry → sizing ensemble at 8h rung (the one structural edge with a mechanical basis: longs pay shorts since 2016).
3. ROUTE crypto sizing → computeSize (quarter-Kelly, vol-target, portfolio cap). Removes unbounded-gross ruin.
4. Promise.allSettled markets+overlays (parallel, not sequential).
5. CALIBRATE confidence (isotonic on closed-loop outcomes) → enables confidence-scaled holding without ruin.
6. CUT theater (quantum/graduation/energy) off hot path or arm it honestly.
7. NEWS layer (A13): Agent-Reach Exa + RSS intake EXISTS (orchestrator.mjs:516) but is sentiment-overlay only; build NLP event-extraction → catalyst signal at 15min-1h horizon (retail-achievable, YURI's LLM lanes can feed it).

SINGLE HIGHEST-EV FIRST MOVE: Close the learn loop (step 1). It is ~50 lines, fully reversible, and it is the one change that converts "every factor is edgeless" from an ARTIFACT into a TESTABLE CLAIM. Until the loop promotes, all 6 other steps rest on unverified priors. Do this first; the data it produces decides which edge is real.

MISSING quant principle: CLOSED-FEEDBACK-LOOP (capture→attribute→score→reweight→promote). The loop captures at every step EXCEPT promote. This is the same pathology the energy-gate learn loop had (421k firings, 0 verdicts). It is THE missing principle, and it is upstream of everything else.
```

**I own this recommendation.** The hypothesis holds — with one sharpening: the engine is *more complete* than the prior red-team believed (stop-loss set, news intake built, carry/funding/perp/cross-asset all wired as overlays). The misalignment is narrower and more surgical than "refactor the whole thing." The keystone is the dead learn-loop: until `reevaluateFactors` runs `apply:true` and `getGraduation` feeds back into weights, the "0 factors survive" verdict is measuring a broken feedback channel, not honest market truth. Close that loop first; the data it generates is the compass for every subsequent redirect decision.