---
name: energy-gate-linfinity-doubly-inert
description: "RESOLVED 2026-06-10 (math-base audit, 2 independent auditors converged): L∞ veto is LIVE in the tick path — cap=0 armed (DEFAULT_MAX_LADDER_INVERSION_CAP), maxLadderInversion populated via claim-ledger←cortexSnapshot. Residual inertness moved to the BREAKER wire: verdictFromStates is claim-blind (no claimGateFields merge), so structural-floor + L∞ classes still can't trip the one layer that denies. gateProposal API default stays Infinity (back-compat)."
metadata: 
  node_type: memory
  type: project
  tier: working
  scope: main
  trig: 
    - energy gate
    - gateProposal
    - L-infinity
    - maxSeverityVeto
    - maxLadderInversion
    - red team
    - wave 3
  refs: 
    - "[[delta-gate-severity-laundering]]"
    - "[[redteam-conscience-findings-2026-06-04]]"
    - "[[nemotron-framework-adapter-idea]]"
  originSessionId: 2448e5f4-5e5f-4625-bfa9-db81dc67ab4c
---

FINDING (verified vs live code): the L∞ max-severity veto (`maxSeverityVeto` / `maxLadderInversionCap`) in `gateProposal` (`_SYSTEM/Scripts/math/yuri-energy.mjs`) is inert on TWO independent axes, not one:
1. KNOWN: cap defaults to Infinity (`DEFAULT_MAX_LADDER_INVERSION_CAP`) → `capArmed=false` → the veto branch never runs. (Wave-3 owner-gated arming, already tracked.)
2. NEW (Nemotron-found, verified): even if you ARM the cap, `maxLadderInversion` is **hardcoded 0 in the live tick path** — `energy-tick-core.mjs:230` sets `maxLadderInversion: 0`, and lines 252/286 propagate `base.maxLadderInversion ?? 0` / `v.maxLadderInversion ?? 0`. The cortex emits the signal as groundwork but the live energy-tick path never populates it with real per-claim severity. So `maxLadderAfter` is always 0, `0 > cap` never fires → the veto is dead even when armed.

IMPLICATION: arming the L∞ cap (Wave-3) is NECESSARY-BUT-NOT-SUFFICIENT. You must ALSO wire real per-claim max-severity into `maxLadderInversion` along the live tick path (energy-tick-core), or the swap-fungibility / equal-magnitude-laundering hole the L∞ term was designed to close stays open in production. This is the deeper layer under [[delta-gate-severity-laundering]].

PROVENANCE: surfaced by the Nemotron-3-Ultra reasoning lane via the framework adapter (tool-grounded — it read the live files), then verified by Claude against energy-tick-core.mjs:230/252/286. The adapter + cross-model triangulation earned a real, verified build lead. (The DeepSeek lane returned empty on the same task — separate lane bug, see report.)

NEXT (Wave-3, owner-gated): when arming the L∞ veto, also populate maxLadderInversion with real per-claim severity in energy-tick-core; add a test that an armed cap + a real high-severity claim actually trips.

---

STATUS UPDATE 2026-06-10 (math-base audit; agents A+E independently converged, then personally source-verified):
- **Both original axes FIXED on HEAD**: (1) live tick arms `DEFAULT_MAX_LADDER_INVERSION_CAP=0` (yuri-energy.mjs:83, armed energy-tick-core.mjs:360 + yuri-energy-trace.mjs:427); (2) `maxLadderInversion` is populated — claim-ledger.mjs:125 ← cortexSnapshot max (claim-cortex.mjs:800) spread AFTER toGateState in the trace path. Probe: cap=0 rejects the depth-5 equal-magnitude id-reuse swap.
- **Residual #1 (the new hole)**: the BREAKER verdict (`verdictFromStates`, energy-tick-core.mjs) builds states from `toGateState` ONLY — no claimGateFields merge, default weights, threshold from opts. So structural-floor + L∞ vetoes are dead at the deny layer; live breaker trips only on protectedPathVeto/gateErrorVeto. Same tick: trace reject (dominantTerm=maxLadderInversion, ΔU=-20.87) → breaker accept:true.
- **Residual #2**: cap=0 also vetoes an HONEST 1-rung VERIFY-FIRST inversion (contradicts the gate's own calibration text claim-cortex.mjs:862-865) — blanket block once enforce armed.
- **Residual #3**: claimGateFields is fail-open (catch→{}) — a poisoned ledger silently disarms the floor.
- gateProposal API default remains Infinity (back-compat for bare callers incl. evaluateTransition — no live caller found).
Full evidence: `_SYSTEM/reports/math-base-audit-2026-06-10-checkpoint.md`.

---

STATUS UPDATE 2026-06-10 (math-base fix wave EXECUTED — all three residuals CLOSED):
- **Residual #1 FIXED (one book)**: tickAndTrace now derives the breaker verdict from its OWN traced gateResult (claim fields + tuned weights/threshold/cap included); the hook consumes `result.verdict`; verdictFromStates demoted to a standalone/test surface. Wire test: claim-veto tick → trace reject AND breaker OPEN + deny, ΔU identical to 1e-9; iota-skew discriminator proves tuned weights reach the verdict.
- **Residual #2 FIXED (D1=cap=1, owner 2026-06-10)**: `DEFAULT_MAX_LADDER_INVERSION_CAP = 1` — 1-rung VERIFY-FIRST accepts (calibration text now true), ≥2 vetoes. yuri-originator deliberately pins its own stricter local cap=0 (`ORIGINATOR_MAX_LADDER_INVERSION_CAP`). Honest residual: depth-1↔depth-1 content swaps uncaught until the v2 claim ledger; gateClaimTransition gained opt-in contentHash binding as groundwork.
- **Residual #3 FIXED (bounded fail-open)**: claimGateFields returns a distinct FAILED sentinel; 3 consecutive read failures trip gateErrorVeto through the verdict (SKIP ticks neither reset nor extend the window); hook persists the counter.
- Enforce remains observability-only; the breaker steer-band burn-in must be RE-RUN before arming (recentDeltaU now records trace-true magnitudes, e.g. -20.87 not -0.069).
Wave report: `_SYSTEM/reports/math-base-fix-wave-report-2026-06-10.md`.
