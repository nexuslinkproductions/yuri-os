---
name: trade-edge-audit
description: The EDGE LENS for trading peers — recalls EVERY factor/indicator running from the live forecast ledger (no enumeration) and renders the whole pile through the edge arsenal off ONE call: multi-horizon scoring (the ladder) + deflated Sharpe (overfit) + Benjamini-Hochberg FDR (multiple-testing across the fleet) + spread-bounce + maker-fee falsification, then ranks only what survives ALL of it. Use when a peer must answer "does ANY running factor have real, overfit-corrected, multiple-testing-corrected, fee-surviving edge, and at which horizon" without hand-assembling 6 tools. The trade-engine analog of quantum-hypothesis-simulation.
invocation: model
triggers:
  - "/trade-edge-audit"
  - "/edge-audit"
  - "is there edge"
  - "does any factor have edge"
  - "audit factor edge"
  - "factor edge audit"
  - "recall all factors and score"
  - "trade brain edge lens"
  - "overfit and multiple testing corrected"
---

# Trade Edge Audit — the edge lens

The trading analog of `quantum-hypothesis-simulation`: a **capability-wrapper** that hands a peer YURI's whole edge arsenal off one invocation. The peer picks the *lens* (edge); the skill hauls in **everything running** and runs the battery behind it. No re-assembling six tools, no enumerating indicators.

Engine: `_SYSTEM/Scripts/alpha-factor-library/trade-edge-audit.mjs` (capability `trade-edge-audit`, 11/0). It ORCHESTRATES existing capabilities — it does not re-implement their math.

## The two moves

**1. RECALL (the recollection layer).** `recallFactors(ledgerPath)` reads the live forecast ledger (`_SYSTEM/state/strategy-forecasts.jsonl`) and returns every factor that has fired + a per-market price series. That ledger IS "everything running" — every price signal, funding/basis, cross-asset, social overlay the orchestrator records. The peer never lists indicators; the skill recalls them.

**2. RENDER through the arsenal.** `auditEdge({ledgerPath, q})` runs, per horizon rung (15m → weekly):
- **Multi-horizon edge** — per-factor forward-return mean / std / per-period Sharpe / one-sided t p-value / hit-rate, non-overlapping (independent obs).
- **Deflated Sharpe** (`factor-evaluator.deflatedSharpe`) — kills overfit; `nTrials` = the FULL (factor × rung) selection universe (`selectionTrials`), so the bar reflects every comparison the audit made, not one rung's.
- **Benjamini-Hochberg FDR** (`factor-evaluator.benjaminiHochberg`) — kills multiple-testing luck across the fleet (with 100+ factors, some look good by chance; this is exactly where you catch it).
- **Falsification** — `spread-correction` (bid-ask-bounce artifact + lag-1 autocorr) + `maker-fill-sim` (fee reality: taker vs maker net, break-even adverse-selection).
- **Survivor** = positive mean AND deflated-Sharpe-passes AND FDR-discovered AND not a bounce-prone (meanrev) family. Ranked by DSR.

Output: a structured verdict — which factors (if any) have real, overfit-and-multiple-testing-corrected, fee-surviving edge, at which horizon. **It is built to say "NO edge" when there is none — that honesty is the product, not a failure.**

## Method map

| Need | Call |
|------|------|
| Recall everything running | `recallFactors(ledgerPath)` → `{rows, series, byFactor, factorIds, markets}` |
| Per-factor edge stats at one horizon | `factorEdgeStats(recall, {horizonS, strideS})` → `{[id]:{n,mean,std,sharpe,tStat,pValue,hitRate,market}}` |
| Full battery + verdict | `auditEdge({ledgerPath, q=0.1, makerSchedule='real-tier0'})` → `{recall, selectionTrials, rungs, falsification, verdict}` |
| CLI (live ledger) | `node _SYSTEM/Scripts/alpha-factor-library/trade-edge-audit.mjs --audit` |
| Self-test | `… trade-edge-audit.mjs --test` |

## Dual consumption (both peer lanes)

- **Native Sonnet agent:** dispatch with *"run/extend the edge lens — `.claude/skills/trade-edge-audit/SKILL.md`; call `auditEdge` on the live ledger and return the verdict + any survivors."* The agent reads this file.
- **ollama nano-swarm lane:** inject this body as the procedure preamble (no filesystem) + the deltas. The lane runs `--audit` (or `auditEdge`) and reports.

Either way: the result is ADVISORY until a local run verifies it (the standing doctrine). Re-run `--audit` yourself before trusting a survivor.

## Limitations (honest)

- **Long rungs need data.** 12h/weekly stay empty until enough non-overlapping observations accrue (12h ~2 days, weekly ~1 month). Not a bug — `evaluated=0` is honest.
- **Brier/calibration not yet fused.** The forecast ledger stores direction, not a probability, so calibration (Brier) lives in the decoded-outcome AFL ledger path — a v2 fusion.
- **vwap-* classified meanrev.** `classifyFamily` (shared spread tool) puts any `vwap` name in the bounce-prone `meanrev` family, so a `vwap-momentum` factor is conservatively EXCLUDED. False-negative only (drops a real edge, never admits a fake one) — acceptable for an honesty-first audit; don't loosen the shared classifier just for this.
- **Per-rung FDR.** FDR is controlled within each horizon's fleet; cross-rung multiplicity is handled by the deflated-Sharpe `nTrials` (full selection universe), not by a cross-rung BH.

## Sibling lenses (planned)

- `trade-decision-sim` — the DECISION lens: recall the live snapshot + render through `factor-circuit` (order-optimal sequencing) + `decision-sim` (CVaR/robust sizing). "Given everything now, what's the order-optimal, risk-robust call + size."
- `peer-redteam` — generic adversarial-review contract (sibling of `peer-signal-build`).

## Session Notes

### 2026-06-17
- tools: Read, Edit, Bash, Agent (Sonnet red-team), capability-scan
- origin: built from Marcel's reframe — "turn all the indicators running into ONE skill that renders everything through an evaluator/decision-sim, like quantum-sim, so peers dig in quick + powerful." This is the edge lens; recall-everything + render-through-arsenal.
- red-team (Sonnet): SHIP, no CRITICAL/HIGH. Verified correct: per-period Sharpe input, one-sided p-value + CDF accuracy, BH index-alignment (input-order), no look-ahead in forward pairing, fail-soft complete. Fixed the MED: `nTrials` now the cross-rung selection universe (was per-rung → DSR bar too low).
- live verdict: 205 factors recalled, selectionTrials 247, 0 survivors — no overfit/FDR/fee-robust edge yet (the honest core). Cross-validates the standalone maker-fill verdict exactly (taker −245 / maker −47 bps).
- self-inflicted catch: first cut had the `'..','state'` path bug + a `'mean-reversion'` vs `'meanrev'` family typo — both caught by verify-locally, the exact discipline `peer-signal-build` encodes.
