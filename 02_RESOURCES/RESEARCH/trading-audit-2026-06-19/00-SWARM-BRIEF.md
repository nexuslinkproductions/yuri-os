# YURI Trading Engine — Ultra-Deep Audit Swarm Brief (2026-06-19)

> **READ THIS WHOLE FILE FIRST.** It is the single source of truth for your slice. You verify + extend prior findings; you do NOT rediscover them.

## MISSION
Marcel's vision: **automated quant trading** — use YURI OS's math base (quantum sim, decision-sim, calibration/conformal, energy gate, DSR/FDR) + **news/information intel** to reliably calculate and predict crypto markets, toward HFT. Symptom reported: "trading agents not working as intended," hunch the whole thing needs refactoring.

Your job: **adjudicate, per subsystem, whether it is (A) genuinely BROKEN, (B) HONEST-BUT-MISALIGNED-WITH-THE-VISION, or (C) ACTUALLY WORKING** — and produce `file:line`-anchored findings a synthesizer merges into ONE refactor-vs-redirect plan.

## CRITICAL — PRIOR FINDINGS EXIST (RECALL, DO NOT REDISCOVER)
This engine has been red-teamed 4+ times (2026-06-17→19). The CONVERGENT, operator-verified verdict (VERIFY each at current code, EXTEND with what was missed, CORRECT stale line numbers):
1. **1-min TA ensemble has ~0 edge**: Brier ≈0.255 (coin-flip), 0 factors survive DSR/BH-FDR/fees at any horizon. ~24 strategies but effective N≈2-3 (all sign the same price derivative).
2. **Fee model was #1 killer** (Coinbase 0.6% taker); now pivoted to Binance perp maker (0.02% maker / 0.05% taker).
3. **Real-edge signals are built but UNWIRED to sizing** (telemetry-only): funding/OI/OFI/cross-asset excluded from `combineSignals`.
4. **"Impressive math" is DISCONNECTED THEATER**: quantum factor-circuit (`snap.circuit`) never read by sizing; graduation R1→R2 unreachable from the cycle; energy-ΔU synthetic.
5. **Current live direction = A-S (Avellaneda-Stoikov) maker quoting** (`as-quote-live.mjs`, ARMED paper). Honest verdict: **−2.16 bps/fill at VIP0 = NO EDGE**; fee tier (VIP3+) is the real lever.
6. **Honest edge ceiling** after fee-fix + structural edge + calibration + quarter-Kelly: ~55-57% directional / Sharpe ~0.4-0.6 post-fee at 3-8x. NOT a rocket.

## ROOT + MAP
- Engine root: `_SYSTEM/Scripts/alpha-factor-library/` (+ `observatory/`).
- Board UI: `_SYSTEM/src/components/board/`. Math: `_SYSTEM/Scripts/math/`. ~37,570 LOC, ~85 `.mjs`.
- Daemon `com.yuri-os-musubi.observatory-gather` :4243 — UP (cycleCount 225, 3 markets, 0 errors, `as-quote` ARMED paper quoting BTCUSDT κ 0.0658).
- Live armed config (`_SYSTEM/state/overseer-config.json`): stopLoss 0.0015 / takeProfit 0.0025 / maxHold 300 / feeHurdle 0.002 / threshold 0.10 / minHold 3 / edgeGate true / regimeGate false.

## THE A/B/C ADJUDICATION (every finding tagged)
- **(A) BROKEN** — code is factually wrong (bug, wrong formula, dead code, wrong wire). Fix = repair.
- **(B) HONEST-BUT-MISALIGNED** — works as written, but doesn't serve Marcel's vision (telemetry-only edge, theater math, edgeless family being scored, wrong-horizon signal). Fix = redirect/rewire, not rewrite.
- **(C) WORKING** — correct + aligned. Fix = leave / extend.

Plus severity `[CRITICAL|HIGH|MED|LOW]` × type `[BUG|DESIGN-FLAW|MISSING-PRINCIPLE|THEATER]`.

## MANDATE (every agent)
1. MAX reasoning. READ THE REAL CODE (your read tool is repo-scoped — paths under the repo work; `/tmp` does NOT).
2. Anchor EVERY finding to `file:line` of CURRENT code + a one-line WHY + the FIX. **Prior line-numbers have drifted — re-anchor to current code, do not trust memorized numbers.**
3. Separate real BUG (code wrong) from DESIGN-FLAW (works, wrong approach) from MISSING (proven quant principle absent) from THEATER (looks real, isn't).
4. Tag A/B/C on every finding.
5. Be concrete about HFT-fitness + parallel-vs-sequential where relevant.
6. COMPACT: ≤35 lines of findings. No preamble, no restating this brief, no politeness.

## OUTPUT FORMAT (return as your final message)
```
AGENT NN — <slice>
SUMMARY (1 line): <the single most important thing you found>
[A/B/C | SEV | TYPE] file:line — finding. FIX: <one line>
... (ranked by severity, strongest first)
VERDICT for slice: <REFACTOR needed | REDIRECT needed | KEEP>
MISSING quant principle (if any in scope): <named, or none>
```

## THE 15 SLICES (your section below tells you which you are)

**A01 — Orchestrator core / hot loop.** `observatory/orchestrator.mjs` (largest, most load-bearing). Hunt: sequential markets (`for (const market of cfg.cryptoMarkets)` ~L1048/L1480 — should be `Promise.allSettled`); per-market serial overlay awaits; signal path (`computeLiveSignals`→`combineSignals(signals)` ~L738 — overlays excluded ~L700); crypto sizing path `equity*maxPct*min(1,strength*2)*regimeTrim` (~L904, bypasses `computeSize` ~L999); confluence entry-gate veto (~L137, ~L853); risk-exit + fastTick; tick-stream EXITS-ONLY default. This is the spine — be thorough.

**A02 — Ensemble + TA strategies (the edgeless predictor).** `ensemble.mjs`, `strategies-trend.mjs`, `strategies-meanrev.mjs`, `strategies-volume-vol.mjs`, `strategy-registry.mjs`, `strategy-weights.mjs`, `perp-signals.mjs`, `indicators.mjs`, `indicator-registry.mjs`. Hunt: effective-N≈2-3 (correlated signers); "Supertrend" mislabeled Keltner; EMA/WMA/MACD fire on STATE not CROSS-event (autocorr spam); ATR off-by-one; VWAP never session-reset; TRIX 100× overscaled; confidence `0.5+|net|/2` circular/uncalibrated; hand-tuned confidences. Are these even the right signal families for any edge?

**A03 — Structural / real-edge signals (built but UNWIRED).** `crypto-structural-signals.mjs`, `funding-carry.mjs`, `carry-vol-signal.mjs`, `cross-asset-signal.mjs`, `ofi.mjs`, `orderbook-imbalance.mjs` (dead code?), `funding-skew.mjs`, `high-mover-scanner.mjs`. Hunt: confirm each is telemetry-only / excluded from `combineSignals`; is `orderbook-imbalance.mjs` ever imported? `mapKline` dropping taker-buy volume (raw OFI material)? Which of these carry REAL multi-hour edge and at what horizon should they feed sizing?

**A04 — Multi-TF + regime + horizon gate.** `multi-tf-confluence.mjs`, `market-regime.mjs`, `regime-detector.mjs`, `regime-breaker.mjs`, `multi-horizon-gate.mjs`, `horizon-ladder.mjs`. Hunt: confluence = hierarchical higher-TF VETO (Marcel's "parallel not sequential" charge — confirm); static 1w-dominant weights vs regime-conditional; multi-horizon gate DISARMED; horizon-ladder honest-empty rungs; does regime ever TRIM not FREEZE?

**A05 — Paper engine + economics + principled sizing.** `afl-paper.mjs`, `afl-sizing.mjs`, `afl-organ-adapter.mjs`, `afl-validation.mjs`. Hunt: funding modeled wrong (charges all sides/never pays/entry-not-mark — was it fixed by the de-risk commit?); `computeSize` (fractional-Kelly+vol-target) wired for polymarket but BYPASSED for crypto; portfolio cap absent (3 corr × 10% × 20x ≈ 600% gross); liquidation math correctness; sizing on uncalibrated confidence.

**A06 — A-S maker quoting stack (current strategic direction).** `as-baseline.mjs`, `avellaneda-stoikov.mjs`, `maker-fill-sim.mjs`, `maker-exec-measure.mjs`, `fill-surface.mjs`, `adverse-attribution.mjs`, `kappa-fit.mjs`, `spread-correction.mjs`, `mutation-sweep.mjs`, `param-sweep.mjs`. Hunt: σ price-vs-return axis correctness (was a bug — verify fix); κ calibration validity + the "data bar" (≥10 days); is −2.16bps/fill VIP0 verdict methodologically sound? queue-decay + OFI λ-measurement honesty; adverse-selection at DEEP offsets (the unmeasured flip risk); fee-tier dependence (VIP3/VIP9) — is the math right that fee tier is the 3-5× lever?

**A07 — Microstructure feeds + live daemon + server.** `observatory/depth-book.mjs`, `tick-stream.mjs`, `trades-stream.mjs`, `tape-recorder.mjs`, `mark-price.mjs`, `as-quote-live.mjs`, `as-quote-view.mjs`, `timeframes.mjs`, `observatory-server.mjs`, `observatory-auth.mjs`, `tape-replay.mjs`. Hunt: crossed-book corruption (was 94.7% crossed — verify fix, topN pruning); depth-book emits bids/asks not topBids/topAsks; WS fail-open/reconnect; the 10s-poll→100ms latency claim; as-quote-live paper-only INV-1 (no order path); stateDir cwd-relative.

**A08 — Adapters / data ingestion.** `adapters/coinbase-adapter.mjs`, `adapters/perp-adapter.mjs`, `adapters/polymarket-adapter.mjs`, `adapters/polymarket-discovery.mjs`, `adapters/social-adapter.mjs`. Hunt: `mapKline` dropping taker-buy volume (k[9]); Binance diff-depth WS sync state machine (U/u/pu chaining); keyless/SSRF safety; Coinbase ES256 RAW-vs-DER JWS; funding/OI REST correctness; any look-ahead or stale-candle leak.

**A09 — Stat / math machinery (the audit itself — is "0 survive" trustworthy?).** `factor-evaluator.mjs`, `factor-reeval.mjs`, `factor-scorer.mjs`, `factor-return-vectors.mjs`, `trade-outcome-decoder.mjs`, `data-quality-gate.mjs`. Hunt: DSR excess-vs-raw kurtosis convention; `nTrials` double-counts factor×horizon; BH p-value derived from 1−DSR not a t-test; no autocorrelation/Bartlett correction → inflated t-stats; minN floors as low as 5-6; NO walk-forward/CSCV/PBO. Is the "0 factors survive" verdict statistically sound or an artifact of buggy stats?

**A10 — Quantum + energy "theater".** `factor-circuit.mjs`, `quantum-ab-shadow.mjs`, and (read-only, in `_SYSTEM/Scripts/math/`) `yuri-energy*.mjs`, `yuri-energy-conformal.mjs`; plus `prediction-ledger.mjs`. Hunt: is `snap.circuit` EVER read by sizing? does "resonance with ψ" link to expected return? are the 2 live inputs near-parallel so "non-commutativity" = noise? graduation R1→R2 unreachable from cycle? energy-ΔU = f(trade count) synthetic? regimeShift CUSUM fed raw price diffs (fires every cycle)? Platt/isotonic conformal DISARMED + trained on wrong label space (energy-gate mutations not trades)? Brutal: how much of this is math-dressed-theater vs real capability Marcel could actually use?

**A11 — CROSS-CUTTING: is the LEARN LOOP actually closed? (THE Scenario-A/B adjudicator).** Trace the full loop: `trade-outcome-decoder.attributeReturn` → `AFL_LEDGER` / forecast ledger → `factor-reeval` (DSR/Brier, `apply:false` dry-run) → `graduation` (R0→R3). **The keystone question**: does a trade outcome ever actually accrue to score the factor that predicted it, or does the loop CAPTURE signals but never SCORE them (the energy-gate learn loop had this exact pathology: 421k firings, 0 derived verdicts)? If the trading loop has the same shape, then "every factor DSR≈0/Brier≈0.25" is an ARTIFACT of a dead feedback loop, not honest truth — and that single distinction decides whether this is a refactor (close the loop) or a redirect (the edge isn't there). Files: `trade-outcome-decoder.mjs`, `prediction-ledger.mjs`, `factor-reeval.mjs`, `graduation.mjs`, `afl-organ-adapter.mjs`, `recordForecasts` usage in `orchestrator.mjs`.

**A12 — CROSS-CUTTING: vision↔reality gap map.** Marcel's vision = automated quant HFT + quantum prediction + news intel + market prediction + YURI math base. What's WIRED vs THEATER-vs-vision vs MISSING. Produce a gap matrix (vision-component → status: real/teather/missing) + the honest reorder: which vision-components are achievable at all on this setup, which are fantasy, and what's the smallest honest path from current-state to "working as he imagined."

**A13 — CROSS-CUTTING: news / information-edge layer (Marcel explicitly wants this).** What exists: `adapters/social-adapter.mjs`, the `pm-gdelt-news-tone` factor, any sentiment/event ingestion. What's MISSING for news-driven alpha: a real news pipeline (ingestion → NLP sentiment/event extraction → signal at the right horizon), event-driven catalysts, on-chain/whale flow, macro/calendar. At what horizon is news-edge REAL for retail (not μs-HFT)? Can YURI's existing NLP/LLM lanes feed it? Be concrete about what to build vs buy.

**A14 — CROSS-CUTTING: HFT-fitness + latency reality.** Marcel wants HFT. Hardware = Mac M2 Pro, retail internet, Binance public WS/REST. Hunt: what latency CLASS are we actually in (10s poll / 1s REST / ~100ms WS tick / μs)? True HFT (μs, co-located) is NOT achievable — quantify why (colocated act ~90ms ahead; queue position invisible on public L2; VIP0 no rebate). What strategy classes fit the ACTUAL latency (funding-carry 4h-daily, daily TS-momentum, cross-asset lead-lag minutes, A-S maker execution) vs the imagined μs-HFT? Kill the HFT fantasy honestly or redefine "HFT" to what's achievable.

**A15 — CROSS-CUTTING: unified REFACTOR-vs-REDIRECT verdict.** Given the prior 4 audits + all 14 sibling findings: is "refactor the entire thing" even the right frame? Hypothesis to adjudicate: the engine is structurally FUNCTIONAL (not buggy-to-the-bone) but architecturally MISALIGNED — real-edge unwired, theater math, edgeless families scored, sizing bypassed, vision drifted. If so, the answer is a **strategic REDIRECT** (cut theater, rewire real-edge, commit to one structural edge path, build the news layer) NOT a ground-up refactor. Give the ranked, minimum-viable path to "working as intended," the honest edge ceiling, and the single highest-EV first move. Own the recommendation.
