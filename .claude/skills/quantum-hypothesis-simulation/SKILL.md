---
name: quantum-hypothesis-simulation
description: Use when evidence arrives in an ORDER that matters, when hypotheses interfere/are non-commuting, when you need the Schmidt coupling criterion for the cross-reference engine, or when a classical Bayes model may be missing order-effects — quantum-hypothesis-tracker.mjs does real-valued Hilbert-space hypothesis tracking (superposition until measurement, order-aware sequential evidence, QQ-equality), validated to beat classical Bayes on order-sensitive data without spurious wins on controls.
invocation: model
triggers:
  - "/quantum-sim"
  - "/qsim"
  - "quantum sim"
  - "quantum simulation"
  - "order effect"
  - "hypothesis superposition"
  - "quantum vs bayes"
  - "schmidt coupling"
  - "non-commuting evidence"
---

# Quantum Hypothesis Simulation

The quantum-probability layer for YURI's claim/pulse machinery. It models hypotheses as a **superposition** in a real-valued Hilbert space (ℝ^N) that only **projects** (collapses) when evidence is applied — so the ORDER evidence arrives in changes the posterior. That is the one thing a classical order-blind Bayes update structurally cannot represent, and it is the whole point: when `P(H | A then B) ≠ P(H | B then A)`, this is the right instrument.

Engine: `_SYSTEM/Scripts/quantum-hypothesis-tracker.mjs`. Falsification gate: `_SYSTEM/Scripts/quantum-vs-bayes-benchmark.mjs`. **GATE PASSED 2026-06-11** (benchmark 4/4; tracker unit tests 5/5 green; validated at scale by a 15M-eval run). Wired as an instrument of `probabilistic-decision-core`.

## Use When

- Evidence is **sequential and order-sensitive** — a later observation reframes an earlier one (question-order effects, framing, anchoring, path-dependent diagnosis).
- Hypotheses **interfere** / are non-commuting (the projectors don't commute), so a product-of-likelihoods Bayes update loses information.
- You need the **Schmidt coupling test** — the cross-reference engine's mathematical criterion for whether two subsystems are genuinely coupled vs separable.
- You suspect a classical model is silently missing an order-effect and want a falsifiable test of it.

## Skip When

- Evidence is order-independent and exchangeable → plain Bayes (`bayesSequential`) is correct and cheaper; don't reach for quantum to look sophisticated.
- The phases need to be complex (full ℂ^N interference) — this engine is **ℝ^N only**, phases 0 or π (sign flips). Adequate for real-valued hypothesis/evidence projectors; not a complex-interference model.

## Method → question map

| You want… | Function | What it gives |
|---|---|---|
| Posterior after an ORDERED evidence sequence | `hypothesisPosteriors(state, hypotheses, evidence)` | applies each evidence projector in order (collapsing the state), then reads P(H) — order-dependent |
| The raw sequential measurement | `measureSequential(projectors, psi)` | the order-effect core: project, renormalize, repeat |
| The falsifiable order-effect signature | `qqEquality(state, P_A, P_B)` | QQ statistic `sAB − sBA`; the quantum model guarantees ≈ 0 — the Wang-Busemeyer test |
| Are two subsystems genuinely COUPLED | `schmidtDecomposition(psi_AB, m, n)` | Schmidt spectrum (via Jacobi SVD) — the cross-ref engine's coupling criterion (separable ⇒ uncoupled) |
| The classical baseline you must BEAT | `bayesPosterior` / `bayesSequential` | order-blind posterior — the control |
| Run the whole falsification gate | `runBenchmark()` (benchmark module) | G1–G4 verdict (machinery, real-data win, honesty control, QQ residual) |

Run it as a throwaway harness (`import { … } from './quantum-hypothesis-tracker.mjs'`, build state vectors + projectors, print) or wire into a sim test. Pure, dependency-free, owner-gate-free.

## The proof discipline (this is the precision, not decoration)

A quantum model that "wins everywhere" is overfitting, not an order-effect. The gate is domain-blind and **two-sided** — both halves must hold:

- **G2 (it earns its keep):** on real order-effect data (Gallup Clinton/Gore marginals: Clinton 50→57%, Gore 68→60%) the quantum RMS must be **≥50% below** the best classical static model.
- **G3 (honesty/control):** on synthetic NO-order-effect data the quantum model must **NOT** beat classical by more than 0.005 RMS. A win on the control = the model is laundering flexibility as signal → reject.
- **G1** machinery recovery (RMS < 1e-3 on self-generated data, QQ exact < 1e-10); **G4** QQ residual on the real joint < 0.05.
- **DATA FLAG (carry it forward):** the Clinton/Gore **JOINT** cells are literature-recalled (Wang & Busemeyer 2013) → `OWNER-VERIFY`; the **marginals** are robustly attested and carry G2 on their own. Never present the literature-recalled joints as primary evidence.
- **Promotion path:** domain-blind proof gate — must beat the classical Bayes baseline on order-sensitive *logged* decision sequences before touching any live organ. Until then the layer is advisory.

## Boundaries

- Output is advisory until verified against live evidence — the falsification gate IS the verification; don't claim a quantum win without the two-sided G2+G3 pass.
- ℝ^N real-valued only; don't claim complex-interference behavior it doesn't have.

## Pair with

- **`probabilistic-decision-core`** (`/pdc`) — quantum tracking is wired as an instrument of PDC; PDC frames the forecast/confidence the tracker sharpens.
- **`cross-reference-navigation`** (`/xref`) — the Schmidt coupling test is the cross-ref engine's coupling criterion; use them together when judging whether two mechanisms are truly linked.
- **`decision-sim.mjs`** — a SEPARATE quantitative instrument (robust-decision: CVaR robustScore, pgdWitness flip-rules, minimax-regret, info-gap, multiverse). Reach for it for *robust optimization under uncertainty*; reach for the quantum tracker for *order-dependent evidence*. (Also unregistered as a capability — see report.)
- **`izanagi-simulator`** (`/izanagi`) — the qualitative 3-branch counterfactual front, for fast "should I even branch" calls before any computational sim.

## Session Notes

### 2026-06-13
- session: 84m | peak ctx: 0% | compacts: 0
- tools: Bash×916, Read×216, Edit×99, Write×57, StructuredOutput×32, TodoWrite×5, Agent×3, ScheduleWakeup×3, Skill×2, Workflow×2, AskUserQuestion×1
- corrections: none
- errors: none
