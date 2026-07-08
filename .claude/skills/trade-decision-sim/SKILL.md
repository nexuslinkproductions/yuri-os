---
name: trade-decision-sim
description: The DECISION LENS for trading peers — recalls the CURRENT signal snapshot per market from the live ledger and renders it through the sim arsenal off ONE call: quantum factor-circuit order-optimal sequencing + decision-sim CVaR-robust sizing, sized against the MEASURED per-factor edge (from the edge-audit), correlation-aware. Emits an actionable call per market {side, sizePct, confidence, sequence}. Flat/zero-size when there is no measured edge after cost — the honest default. Sibling of trade-edge-audit (the EDGE lens); the trade-engine analog of quantum-hypothesis-simulation for a live decision.
triggers:
  - "/trade-decision-sim"
  - "/decide"
  - "what should I trade now"
  - "order-optimal trade decision"
  - "risk-robust position size"
  - "decision lens"
  - "size the trade"
scope: instance
invocation: ability
---

# Trade Decision Sim — the decision lens

Sibling of `trade-edge-audit`. Where the edge lens asks *"is there real edge in the history?"*, the decision lens asks *"given everything firing RIGHT NOW, what should I do per market — order-optimal and risk-robust?"* A capability-wrapper (the quantum-sim pattern): one call recalls the current snapshot and renders it through the whole arsenal.

Engine: `_SYSTEM/Scripts/alpha-factor-library/trade-decision-sim.mjs` (capability `trade-decision-sim`, 12/0). It ORCHESTRATES — it does not re-implement the math.

## The two moves

**1. RECALL (current snapshot).** `recallSnapshot(ledgerPath)` reads the live forecast ledger and takes the LATEST row per factor (its current directional call), grouped by market. That is "what every indicator is saying now."

**2. RENDER through the arsenal, per market:**
- **Net side** — the directional vote of the current factors (flat if it cancels).
- **Measured edge** — averages each factor's `factorEdgeStats` (mean dir-return + std) from the edge-audit. This is the SIZING input: **no fabricated edge.** With today's ~zero measured edge, every market correctly goes flat — consistent with the edge-audit.
- **Order-optimal sequencing** — `factor-circuit.optimizeFactorCircuit` finds the non-commuting optimal factor order; `circuitQuality > 1` = a real sequencing advantage (it amplifies edge, it cannot manufacture it).
- **Risk-robust sizing** — `decision-sim.robustScore` (0.5·mean + 0.5·CVaR over normal shocks) gates the size, correlation-aware (effective-N dilution; flat above ρ 0.85), clamped to maxPct.
- **Honest gate** — `measuredEdge ≤ round-trip cost → flat`, regardless of consensus (consensus on a no-edge set is the bounce trap).

Output per market: `{ market, side, sizePct, confidence, edgeBps, orderOptimalSequence, circuitQuality, rationale }` + a verdict. Built to say "flat — no measured edge" when that's the truth (the default right now).

## Method map

| Need | Call |
|------|------|
| Recall current snapshot | `recallSnapshot(ledgerPath)` → `{byFactor, byMarket, factorIds, markets}` |
| One market's decision | `buildMarketDecision(market, signals, {maxPct, corr, edgeStats})` |
| Full battery + verdict | `decideTrades({ledgerPath, maxPct, corr})` → `{decisions, verdict, recall}` |
| CLI (live) | `node …/trade-decision-sim.mjs --decide` |
| Self-test | `… --decide.mjs --test` |

## Dual consumption (both peer lanes)

- **Native Sonnet agent:** "run/extend the decision lens — `.claude/skills/trade-decision-sim/SKILL.md`; call `decideTrades` on the live ledger, return the per-market calls."
- **ollama nano-swarm lane:** inject this body + deltas (lanes' `read_file` is repo-scoped — put any brief in a REPO path, not `/tmp`, or they can't read it).

Result is ADVISORY until a local run verifies it. INV-1: pure analysis, no order path.

## Limitations (honest)

- **Sizing is binary in v1** (flat-vs-maxPct): the value function is linear in size, so robustScore is effectively a gate, not a fractional sizer. Conservative + safe; genuine mean-variance/Kelly fractional sizing (concave value term) is a v2 enhancement.
- **In-code cost floor** (round-trip 5bps) — the real Coinbase taker floor is ~20bps (retail ~120bps). The gate uses the engine's in-code cost for consistency; the edge-audit owns the real-fee analysis. At real fees the bar is far higher.
- **Edge from history, decision from now** — sizing uses each factor's historical measured edge; the call uses the current snapshot side. Sign-aligned (a current side opposite the factor's historical edge → negative center → flat).
- **No proven edge yet** — so the lens is flat everywhere today. That is correct, not broken; it activates when a factor develops real, cost-clearing, multiple-testing-surviving edge (per the edge-audit).

## Sibling

- `trade-edge-audit` (`/edge-audit`) — the EDGE lens: is there real, overfit+FDR+fee-surviving edge in the history. Run it to find edge; run this to act on it.

## Session Notes

### 2026-06-17
- tools: Bash, Read, Edit, Write, Agent (Sonnet red-team), capability-scan
- origin: owner directive — build the decision lens PEER-FIRST (kimi/nemotron/minimax/glm/flash/mimo swarm; "lanes do most of the work, you verify/wire/fine-tune").
- swarm reality: kimi-k2.7-code delivered a strong core (interfaces verified against source — factorVector/optimizeFactorCircuit/robustScore shapes all correct, genuinely read the source). nemotron (sizing-math) ETIMEDOUT-retry-stalled and blocked the wave barrier so glm/flash never fired; minimax couldn't read the /tmp brief (lanes' read_file is repo-scoped). I covered the missing roles myself. LESSON: no `wait` barriers between independent lanes; put briefs in a repo path.
- operator fixes over kimi's draft: replaced a FABRICATED 1.5% edge with the MEASURED edge from the edge-audit (the honest core — connects the two lenses); clamped maxPct (red-team HIGH — unclamped → leverage); gauss shocks not uniform (crypto tails); market-filter on edge lookup (cross-market contamination guard).
- Sonnet red-team: FIX-FIRST on the maxPct clamp (fixed + regression-tested); edge-sign alignment, interfaces, gate logic, category slots, fail-soft all confirmed CORRECT. 12/0; live = all markets honest-flat (no measured edge), consistent with the edge-audit.
