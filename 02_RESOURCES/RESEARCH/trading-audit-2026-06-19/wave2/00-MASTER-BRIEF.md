# Wave-2 Master Brief — "What are we MISSING for a functional trading platform?" (2026-06-19)

> READ THIS FIRST. Then your lane slice. Then produce a structured block.
> You are 1 of 5 GLM-5.2 peers (xhigh) working SIDE-BY-SIDE with the Claude/main author, who runs an
> independent parallel pass to cross-check you. **Lanes over-claim** — be honest, cite evidence, tag
> every load-bearing claim `[V]` (you verified vs current code/file) or `[A]` (asserted, confirm-at-build),
> or `[R]` (external research, cite the source). Do not invent line numbers or API behavior.

## MISSION
Wave-1 (the audit, `../01-AUDIT-PLAN.md`) produced the verdict: **STRATEGIC REDIRECT, not refactor** — the
engine is functional but architecturally misaligned in 4 cuts (real-edge signals unwired, sizing bypasses
Kelly, learn loop open, theater math on hot path). Honest edge ceiling ~55-57% / Sharpe 0.4-0.6 post-fee.

Wave-2 is **NOT the build.** It is the **context-gathering + simulation + professional-comparison** pass
that decides exactly *what capability we are missing* before we execute the ranked path. The owner's ask:
> "run several quantum simulations on that codebase along with calculations to check what we are doing
> makes sense as well as compare how professionals trade, use indicators, which factors play a relevant
> role, how many effective trading agents we need to run 24/7 each owning a set of roles."

So the deliverable of each lane is one column of that answer. Be concrete, numeric, and honest.

## CANONICAL CONTEXT (read before working)
- `../01-AUDIT-PLAN.md` — the full audit (§0 verdict, §1 keystone, §3 A/B/C tables, §6 ranked path, §8 residual risk).
- Engine root: `_SYSTEM/Scripts/alpha-factor-library/` (+ `observatory/` subfolder for the daemon).
- Key live files: `observatory/orchestrator.mjs` (hot loop), `ensemble.mjs`, `factor-circuit.mjs`,
  `factor-return-vectors.mjs`, `funding-carry.mjs`, `ofi.mjs`, `graduation.mjs`, `factor-reeval.mjs`,
  `factor-evaluator.mjs`, `afl-sizing.mjs`, `avellaneda-stoikov.mjs`, `maker-fill-sim.mjs`,
  `regime-detector.mjs`, `strategy-registry.mjs`, `indicators.mjs`.
- Quant sim tooling (USE THESE, don't rebuild): `_SYSTEM/Scripts/quantum-hypothesis-tracker.mjs`
  (qqEquality, schmidtDecomposition), `_SYSTEM/Scripts/alpha-factor-library/factor-circuit.mjs`
  (commutatorNorm, buildCommutativityMatrix, circuitQuality, optimizeFactorFactorCircuit),
  `_SYSTEM/Scripts/decision-sim.mjs`, `_SYSTEM/Scripts/alpha-factor-library/trade-edge-audit.mjs`,
  `_SYSTEM/Scripts/alpha-factor-library/param-sweep.mjs`.
- Local corpus search (MANDATORY FIRST before any online): `ai search "<query>"` (FTS5/BM25 over ~41k docs+code).
- Online is a STANDARD verification layer for external/factual claims — verify vs ≥2 PRIMARY sources
  (official docs, SSRN/academic, raw source), cite URL + date. Local execution stays ground truth for our code.

## HARD CONSTRAINTS
- **READ-ONLY. Do not edit, write, or mutate any file under `_SYSTEM/` or the repo.** You only WRITE your
  own output block (the author captures it). No git, no installs.
- Local-first research. `ai search` before online. Online = verification layer, cite primary sources.
- No protected paths. No secrets.
- Be concrete and numeric: "Sharpe 0.4-0.6", "effective-N=2", "VIP0 maker -2.16bps/fill" — not "should be fine."
- **Honest pessimism first.** If a capability is theater, say theater. If an edge is unproven, say unproven.
- Time-box your reasoning: depth where it changes the answer, skip where it doesn't.

## OUTPUT FORMAT (every lane emits this exact block)
```
PEER <N> — <lane title>
SUMMARY: <3-5 lines, the bottom line>
<body: findings as [V]/[A]/[R]-tagged items, each with file:line or source URL + the number/conclusion>
WHAT WE ARE MISSING (for this lane's domain): bullet list of concrete missing capabilities, each with
  a one-line "why it matters" and a rough build-size (S/M/L) + reversibility.
VERDICT: <one paragraph — what this lane says about the build>
RESIDUAL RISK / UNVERIFIED: what you could not confirm.
```

## LANE SLICES (which peer owns what)
- **P1 — Pro benchmark + factor survival + indicator reality** (how pros trade; retail-noise vs institutional).
- **P2 — Factor orthogonality + effective-N audit** (correlation/clustering; the orthogonal spine we lack).
- **P3 — Agent topology / role design** (how many 24/7 agents, role matrix, messaging, latency, failover).
- **P4 — Quantum order-effect simulation** (RUN factor-circuit; collinear vs orthogonal circuitQuality; cut/wire verdict).
- **P5 — Edge / Kelly / capacity / fee calc sheet** (does the math close, at what scale, honest monthly expectancy).

The author runs the SAME sims + calcs independently and cross-checks every load-bearing claim you emit.
