# SYNTHESIS — Is the "prove-the-edge-first" gate real, or self-imposed paralysis?

**Date:** 2026-06-19 · **Owner:** Marcel · **Lanes:** 5 Sonnet agents (A1–A5) + Claude/main power-calc, ultracode fan-out (via Agent tool, not Workflow — binding memory `feedback-no-workflow-tool-use-agent-only`)
**Trigger:** owner challenged the wave-2 framing that "we must PROVE a real net edge before sizing aggressively," suspecting it is a self-made gate blocking realistic progress.

## VERDICT — Marcel is right. The gate AS FRAMED is substantially self-imposed paralysis.

Three independent lanes (A1 meta-audit, A4 bug-out, A5 posture) converge: the "prove edge to full statistical confidence on paper before any forward capital" bar over-rotates. The narrow risk mechanism it gestures at is **real and must stay**; the broad paralysis frame is **self-imposed and should go**.

**The smoking gun (A1, [V]):** wave-2's "VALIDATE → DEPLOY only after proof" frame is the *exact* frame Marcel scrapped **one day earlier**. `crypto-perp-edge-strategy-2026-06-18.md` Correction #2 (owner's words): *"MY ERROR: imported a RESEARCHER's 'prove edge before acting' into a TRADER's 'read setup → predict → act → manage.'"* Wave-2 reverted to the researcher frame. **The gate was self-imposed twice.**

## What's REAL (keep, narrow form) — 3 primary sources
The over-Kelly ruin mechanism is genuine (MacLean-Thorp-Ziemba-Blazenko; Berkeley "Good & Bad Properties of Kelly"; Downey fractional-Kelly sim — all agree). Size on the **lower-CI** edge, never full-Kelly on an assumed one; cap per-position leverage so a single wick can't liquidate; measure **net of real cost**. `computeSize` already enforces the first mechanically (`edgeLowerCI ≤ 0 → 0`, fail-closed). **This is ~4 lines of doctrine, not a multi-month proof bar.**

## The real disease: OVER-gated on theater, UNDER-gated on the one real risk (A4)
The engine computes `computeCircuit` (quantum commutator) + `computeEnergyDelta` (ΔU) **every cycle** — read by NOTHING in sizing (telemetry only). Meanwhile the crypto path (`orchestrator.mjs:904`) **bypasses the one principled ruin guard (`computeSize`)** and runs at `maxGrossExposurePct: 6.0` (600%) on 6 correlated markets. **The 600% cap is not a risk-limiter — it is a ruin-enabler** (no Kelly, no lower-CI gate, no correlation adjustment; ρ up to +0.77 / −0.98 in the ledger). And `apply:true` exists **NOWHERE in live code** — the "promotion gate" isn't gated, it's *unbuilt*. The "prove-first" paralysis is a symptom; the disease is misallocated gating.

## The bootstrapping paradox, RESOLVED (A5)
"Can't prove an edge without trading out-of-sample" is real — but it dissolves once you split two operations the docs conflated:
- **MEASURE (class-A):** writes a ledger, changes nothing the system DOES. Self-governable NOW (all 6 charter criteria pass).
- **PROMOTE (class-B):** feeds into the sizer / decides live trades. Owner-gated.

**The keystone measurement instrument (M3) was MISCATEGORIZED as owner-gated.** Measuring differently changes what *we know*, not what the system *does*. Rule: **record = arm; feed-into-decision = hold.**

## The fastest possible answer to "do we have an edge?" (A2)
The loop is open because there are **two disjoint ledgers never reconciled**: `strategy-forecasts.jsonl` (574k rows, no outcome/cost/horizon/confidence) vs `afl-prediction-ledger.jsonl` (12.7k rows, from closed trades only, scored at trade-exit not forecast-horizon). **`scoreForecasts` EXISTS, is leak-free, and is NEVER CALLED** (dead import).

**Immediate self-governable unblock (Phase 1, S, zero new data, zero live-output risk):** extend the forecast schema + wire the dead `scoreForecasts` with the **cost-cliff subtraction** (Binance 2/5bps + slippage + funding, primary-verified) → an **honest gross-vs-net readout on the 574k existing rows in minutes.** This tells us whether ANY gross edge survives costs *before* spending a single forward trade. Confidence is currently circular by construction (`ensemble.confidence = 0.5+|net|/2` → the t=20.11 artifact); fix via walk-forward isotonic calibration on `(rawConf, sign(netReturn))`.

## The forward-test + gate-realism (Claude/main power-calc, execution-verified)
Distinguish p=0.55 from no-edge, one-sided α=0.05, 80% power — **trades needed:**

| true net p | trades | @30/day | verdict |
|---|---|---|---|
| 0.55 | 617 | ~3 wk | REALISTIC |
| 0.53 | 1717 | ~8 wk | HARD |
| 0.52 | 3864 | ~4 mo | HARD |
| 0.51 | 15461 | ~1.4 yr | PARALYSIS |

**The gate realism depends entirely on the true edge magnitude — which we don't know.** So we do NOT pre-commit to "prove it fully." We run an **SPRT (sequential test) on 200–600 forward trades at €1–3, quarter-Kelly on lower-CI**: stops EARLY if edge is strong (p≈0.55 → ~3wk), stops if clearly none (→ re-architect to structural edges: OFI, funding-carry). 1–4 weeks, not years; not paper-forever, not a yolo.

## LITERATURE CALIBRATION (A3, primary-sourced)
de Prado / Bailey (DSR, PBO, AFML Ch.11–14) + Robot Wealth: the realistic cadence is **backtest → paper → small-live walk-forward**, where small-live **measures backtest-to-live decay** (slippage/queue/latency) — it does NOT re-prove the statistical edge. **No amount of paper reproduces execution.** DSR≈0 on the current TA family is the literature's *correct* answer, not paralysis. YURI's posture is doctrinally right; the calibration error was treating paper as the place to "prove fully" instead of as one of three phases.

## BUG-OUT LIST (A4, ranked — the "remove everything unrealistic" inventory)
**CUT (theater, nothing reads them):**
1. `computeCircuit` off the hot loop (orchestrator.mjs:703,990) — move to nightly offline
2. `computeEnergyDelta` ΔU off the hot loop (:899,1009) — measures trade-COUNT not edge
3. legacy √5 multi-horizon fallback (:866-897) — known-bad path Marcel asked to replace
4. `yuri-energy-conformal.mjs` zombie — trained on wrong label space
5. redundant `regimeGate`/`confluenceGate` double-gates once computeSize is wired

**RECLASSIFY + WIRE (the real risk):**
6. **600% gross cap → ruin-enabler, not limiter.** Replace with correlation-adjusted `computeSize` (sane gross ~7.7% @8×, not 600%).
7. **Wire crypto path through `computeSize`** (:904 → route like :999). The bypass is the bug, not the gate. Self-governable (fail-closed by construction).
8. **Build the learn loop** (`apply:true` nightly beat) — it's DEAD, not gated. Build DISARMED; owner arms.
9. **Wire graduation R1→R2 metrics** — computable, currently null. Feed the bar, don't lower it.

**CONVERT (DISARMED → live measurement, all class-A, all self-governable):**
10. The 5 overlays (funding/OFI/cross-asset/sentiment/vol-regime) → measurement paper-book (the eff-N fix). `OBSERVATORY_RECORDER`/`TICK_STREAM`/`AS_QUOTE` → arm (read-only/paper, starve the κ/OFI/fill-sim of real tape otherwise).

## DECISION POINT
- **Self-governable NOW (class-A, reversible, no live-output change):** Phase-1 wire of dead `scoreForecasts` + cost cliff → the honest edge readout on 574k existing rows (answers the question in minutes). + cut the theater off the hot loop (#1–5). + arm the measurement recorders (#10).
- **Owner-gated (class-B, finished ruling + one-token confirm):** wire measurement → sizer (#7), `apply:true` promotion (#8), real-money / venue sends.

**Net:** the unblock is not "remove safety" — it's **stop computing cosplay, wire the one real gate that already exists but is bypassed, and convert five built-but-idle instruments into the measurement fleet that earns the right to trade.** Marcel's instinct was correct.
