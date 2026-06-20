# Overlay-Source Validation — Validate-First Verdict (2026-06-20)

**Task #16 disposition.** Owner chose the *validate-first (rigorous)* path for wiring the 5 advisory
overlay sources into the crypto position sizer: build the predictive-validation evidence BEFORE wiring,
wire only what validates. This doc is that evidence.

## Question

The 5 advisory overlay sources (funding-carry / perp-basis / carry-vol / cross-asset lead-lag / social
sentiment) are persisted to the forecast ledger every cycle as `{factorId, market, dir, ts, price}` but
are deliberately **telemetry-only** (orchestrator.mjs:653 — "edge units differ from price-return edge;
inform positioning, not P&L"). Do any of them actually predict forward returns — enough to justify
reversing that guard and feeding them to `computeSize`?

## Method (capability-first — reuses existing machinery, no new math)

`_SYSTEM/Scripts/alpha-factor-library/overlay-edge-validate.mjs` wraps `trade-edge-audit`:
- `recallFactors()` reads `_SYSTEM/state/strategy-forecasts.jsonl` (735,778 rows) + builds a per-market
  forward-return price series.
- `factorEdgeStats()` pairs each overlay forecast's `dir` with the SAME-market realized return over the
  horizon (leak-free: price strictly ≥ ts+horizonS; non-overlapping by stride). Independent of whether
  the overlay drove a trade — pure predictive accuracy.
- Honest multiple-testing penalty: `deflatedSharpe(sharpe, {nTrials: factors×rungs})`.
- A family VALIDATES iff some horizon has **t>2 AND n≥30 AND deflated-Sharpe survives**.

OFI (order-flow) is out of scope — it feeds λ-calc only and needs real-tape R², not the forecast ledger.

## Verdict (live ledger, 2026-06-20)

| family | horizon | n | mean(bps) | t | hit% | verdict |
|---|---|---|---|---|---|---|
| perp-funding-carry | 15m | 33 | 0.0 | −0.01 | 48.5 | **NOT_PREDICTIVE** |
| perp-basis | 15m | 5 | −15.6 | −0.54 | 40.0 | INSUFFICIENT_N |
| carry-vol | 15m | 36 | −3.0 | −1.10 | 50.0 | **NOT_PREDICTIVE** |
| xasset-lead | 60m | 57 | 12.9 | 1.16 | 50.9 | **NOT_PREDICTIVE** |
| social-sentiment | 60m | 43 | −10.9 | −1.42 | 48.8 | **NOT_PREDICTIVE** |

**0/5 overlay families validate.** 4/5 now have sufficient data (n≥30) and none predict — all |t|<1.5,
hit-rates ≈ coin-flip (48–51%), social-sentiment marginally *negative*. Only perp-basis (n=5) remains
data-thin. This is consistent with the fleet-wide honest no-edge verdict (every factor R0, DSR≈0).

## Conclusion

**Do NOT wire the overlays into the sizer.** The validate-first gate returned no-go. The deliberate
unit-mismatch guard at orchestrator.mjs:653 stands correctly — there is no predictive edge in these
sources to convert into P&L sizing. Wiring them (option "edge-sources + shadow") would have imported
phantom edge into `computeSize`.

## Re-run path (the tool is durable + reusable)

`node _SYSTEM/Scripts/alpha-factor-library/overlay-edge-validate.mjs` — re-run as the daemon keeps
accruing overlay forecasts (passive, cheap). The 4 data-sufficient families are unlikely to flip (n is
already ≥30 with flat hit-rates); perp-basis needs more accrual before it's decidable. If a future
re-run shows a family validating (t>2, n≥30, DSR-pass), THAT family becomes a wiring candidate — with
its unit-transform defined then (not before).

Red-team note: aggregation reports the strongest horizon among those with n≥minN (never a tiny-n
high-t fluke); OFI deferred; measurement is Class-A (advisory, changes what we know, not what the
system does).
