# OFI Edge Validation — Verdict (2026-06-20)

**Question:** Does order-flow imbalance (OFI, Cont-Kukanov-Stoikov) predict BTCUSDT returns at short horizon — i.e., is the microstructure "structural edge" (audit: "the one edge that could lift eff-N") real on Binance crypto perp?

## Method (capability-first — reuses existing machinery)

`_SYSTEM/Scripts/alpha-factor-library/ofi-edge-validate.mjs` wraps `tape-replay` (book reconstruction) + `ofi.mjs` (OFI contributions):
- Streams a bounded window of the recorded L2 tape (streaming avoids the >1GB V8-string-limit on `readFileSync`; loadTape's array branch needs parsed OBJECTS, not strings — both are real footguns, fixed).
- Reconstructs the book via `tape-replay.bookAt` (the TESTED reconstructor with proper pu-sync — a hand-rolled recon silently desyncs and produces only ~14 events/30min, a false-negative).
- Computes OFI via `ofiContribution` between consecutive 200ms bookAt samples.
- Predictive R² = corr(OFI@t, forward mid-return@[t, t+h])². Bar: >0.15 meaningful, <0.10 noise.

## Verdict (today's tape, 30min window)

| horizon | n | R² | r | verdict |
|---|---|---|---|---|
| 200ms | 9000 | 0.0083 | 0.091 | ✗ noise |
| 500ms | 8998 | 0.0064 | 0.080 | ✗ noise |
| 1s | 8996 | 0.0063 | 0.079 | ✗ noise |
| 5s | 8976 | 0.0041 | 0.064 | ✗ noise |

Diagnostics: 45 snaps, 52.9k diffs, 9001 samples, mid range 0.204% (realistic), OFI non-zero 49% (book genuinely updating — the reconstruction is sound).

**OFI does not predict BTCUSDT returns at 200ms–5s on this tape.** R²≈0.006–0.008 — ~50× below the equity-literature R²≈0.3 @1s (Cont-Kukanov-Stoikov). The weak positive r (~0.08) means there's a *trace* of signal, but nowhere near a sizing edge.

## Why the gap with the literature

The Cont-Kukanov R²~0.3 is **equities/highly-structured futures**. Crypto perp microstructure differs: retail-heavy flow, 24/7, different venue mechanics, thinner top-of-book stability. The edge doesn't replicate at our Mac+WebSocket cadence (200ms sample floor). This is consistent with the audit's A14 (HFT-latency-reality): true microstructure alpha needs institutional latency we don't have.

## Conclusion

**OFI is not a sizing edge here. Do not wire it.** This is the **3rd no-edge validation** (32 TA factors → 0; 5 overlays → 0; OFI → ~0). The predictive/microstructure path is exhausted at our latency. The remaining edge candidate is **structural, not predictive**: funding-carry harvest (Engine 1 in the quant-methods blueprint) + maker-only execution — neither depends on predicting price.

## Caveats / re-run

- 30min of BTCUSDT in one regime; other assets/timeframes/regimes could differ (re-run `node ofi-edge-validate.mjs <tape>` on fresh tapes).
- OFI here is bucketed-net at 200ms (not pure event-driven); a pure event-driven measure might be marginally higher but won't close a 50× gap.
- The validator is durable + re-runnable; treat the equity-lit R²~0.3 as asset/venue-specific, not universal.
