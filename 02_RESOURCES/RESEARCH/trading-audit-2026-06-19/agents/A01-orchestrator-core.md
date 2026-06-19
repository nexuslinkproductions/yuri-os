All evidence confirmed. I have every finding anchored to current code.

```
AGENT 01 — Orchestrator core / hot loop
SUMMARY: Markets run sequentially (await-in-loop), real-edge overlays are built then discarded from sizing, crypto sizing hardcodes equity*pct*strength bypassing computeSize, and the risk-exit/fastTick layer is entirely default-off — the spine trades edgeless 1m TA on conviction-scaled noise.

[A|CRITICAL|BUG] orchestrator.mjs:1480-1485 — `for (const market of cfg.cryptoMarkets) { … await runCryptoCycle(…) }` is SEQUENTIAL. 6 markets × (getCandles + perp + social + cross-asset + carry-vol network calls) serialized. A single slow/stale market blocks all others. FIX: `Promise.allSettled(cfg.cryptoMarkets.map(m => runCryptoCycle(m, snap, cfg)))`.

[B|HIGH|DESIGN-FLAW] orchestrator.mjs:738 — `combineSignals(signals, …)` receives ONLY price `signals`; overlaySignals (funding/perp L664, cross-asset L674, carry-vol L695, social L668) are pushed to `snap.signals` for telemetry but never fused into the ensemble decision. The only signals with documented real multi-hour edge (funding carry, OI) are excluded from sizing. FIX: pass `[...signals, ...overlaySignals]` (with unit-normalized confidence) into combineSignals, or a separate overlay-weighted tilt.

[A|HIGH|BUG] orchestrator.mjs:904 — Crypto sizing `equity * maxPct * Math.min(1, ensemble.strength*2) * regimeTrim` bypasses `computeSize` entirely. computeSize (fractional-Kelly + vol-target + edge-CI) is imported L43 but used ONLY on the Polymarket path L999. Crypto sizes on raw uncalibrated `strength` (itself derived from `0.5+|net|/2` circular confidence). FIX: route crypto through computeSize({edgeMean, edgeLowerCI, winProb, returns, equity, targetVol}) like Polymarket.

[B|HIGH|DESIGN-FLAW] orchestrator.mjs:861 — Confluence gate is a hard directional VETO (`skipped = 'confluence-conflict'`). Even armed, it's all-or-nothing block on conflict — never a TRIM. Combined with regimeGate (L846) already being trim-only, the gate design is inconsistent. FIX: confluence conflict should scale size (e.g. ×0.25) not zero it, mirroring regimeTrim.

[A|MED|BUG] orchestrator.mjs:578-579 — `const start = now - 5*3600; const end = now;` computed but never passed to `PerpAdapter.getCandles` (only interval+limit at L585). Dead variables — misleading. FIX: delete or pass as startTime/endTime.

[A|MED|BUG] orchestrator.mjs:299 — `atrSeries` uses high-low range only (b.high - b.low), NOT True Range (omits the |close_prev - high| / |close_prev - low| gap component). This systematically underestimates ATR on gapping instruments → vol-regime signal misfires. FIX: use full TR = max(H-L, |H-Cp|, |L-Cp|).

[B|MED|DESIGN-FLAW] orchestrator.mjs:1087/1497 — fastRiskExit + the fastTick 1s loop are wired but ALL default-off (stopLoss/takeProfit/maxHoldSec gated by overseer-config; live config has them armed but fastRiskExit only runs if the daemon calls it — runCycle L1474 never calls fastRiskExit). The slow 15s cycle carries the only exit path. FIX: call fastRiskExit() inside the cycle or the tick-stream loop.

[B|MED|DESIGN-FLAW] orchestrator.mjs:674 — Cross-asset overlay depends on `_recentCloses` populated by EARLIER markets in the same sequential pass (comment L577 "BTC first"). If markets go parallel (fix #1), the leader's series may not be populated yet → lagger signals vanish or use stale prior-cycle data. FIX: populate _recentCloses in a pre-pass before the parallel signal phase.

[B|LOW|THEATER] orchestrator.mjs:344-365 — `computeEnergyDelta` builds synthetic before/after states (verifiedEvidenceCount = completedTrades/2) and calls gateProposal — ΔU is f(trade_count), not f(risk/edge). Pure telemetry theater, never blocks. FIX: delete or wire to actual portfolio risk state.

VERDICT for slice: REFACTOR needed (sequential→parallel loop, wire overlays into sizing, route crypto through computeSize, fix ATR, call fastRiskExit)
MISSING quant principle: portfolio-level risk budgeting — no cross-market gross/net cap enforced in the crypto hot loop (caps exist per-engine at L437 but 6 independent engines × 10% × 20x = 1200% gross uncoordinated).
```