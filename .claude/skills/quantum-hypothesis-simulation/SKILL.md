---
name: quantum-hypothesis-simulation
description: Use when evidence arrives in an ORDER that matters, when hypotheses interfere/are non-commuting, when you need the Schmidt coupling criterion for the cross-reference engine, or when a classical Bayes model may be missing order-effects — quantum-hypothesis-tracker.mjs does real-valued Hilbert-space hypothesis tracking (superposition until measurement, order-aware sequential evidence, QQ-equality), gated to beat classical Bayes on order-sensitive data without spurious control wins. Tier 3 of YURI's 4-tier simulation arsenal.
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
  - "simulation arsenal"
  - "decide under uncertainty"
---

# Quantum Hypothesis Simulation

The quantum-probability layer for YURI's claim/pulse machinery, and **tier 3 of the simulation arsenal**. It models hypotheses as a **superposition** in a real-valued Hilbert space (ℝ^N) that only **projects** (collapses) when evidence is applied — so the ORDER evidence arrives in changes the posterior. That is the one thing a classical order-blind Bayes update structurally cannot represent, and it is the whole point: when `P(H | A then B) ≠ P(H | B then A)`, this is the right instrument.

Engine: `_SYSTEM/Scripts/quantum-hypothesis-tracker.mjs` (313 lines, 19 exports). Falsification gate: `_SYSTEM/Scripts/quantum-vs-bayes-benchmark.mjs`. **GATE re-verified PASS 2026-06-14** on current code (G1–G4 all true; tracker unit tests 5/5; eval-processing 11/11; validated at a 15M-eval scale). Wired as an instrument of `probabilistic-decision-core`. **Living system — actively being built**; the public export API is stable (method-map below intact) but internals + the surrounding arsenal keep moving, so re-read the source before relying on a fine detail.

## The simulation arsenal (where this sits) — `faeb5b67` (arsenal) → `15cfc088` (learn-loop closed)

A decision-under-uncertainty pipeline: **measure → robustify → commit → learn.**

1. **`izanagi-simulator`** (`/izanagi`) — qualitative 3-branch commit (EV × reversibility × blast). The fast "should I even branch" front.
2. **`decision-sim.mjs`** — robust optimization: `robustScore` (0.5·mean + 0.5·CVaR), `minimaxRegret`, `pgdWitness` (flip-rule), `crossEntropyOptimize`, `infoGapHorizon`, `multiverse`, + `halton`/`sobolish` QMC. Reproducible (seeded `makeRng`). 7/7 green.
3. **`quantum-hypothesis-tracker.mjs`** ← *you are here* — order-aware evidence (below).
4. **`izanagi-bridge.mjs`** (`@capability: izanagi-decision-bridge`) — turns measured/MC option values into a robust ruling: CVaR + minimax-regret + PGD **with an AUTOMATIC corner-law vertex guard** (enumerates paramSpace vertices where an affine/multilinear worst case hides from interior sampling) + per-axis flip thresholds. Demo-validated (`runDemo`), no unit test yet. This is izanagi made *computational*.
   - Learn-loop edge: `izanagiRuling(…, {record:true})` writes the prediction to `prediction-ledger.mjs` (opt-in, off by default). **CLOSED 2026-06-13 (`15cfc088`):** `prediction-outcome-resolver.mjs` (`@capability`) re-runs propagation-scan on aged unresolved predictions, scores predicted-vs-observed, records outcomes + populates calibration — idempotent, execFileSync-safe, REPO_ROOT-anchored, live-verified (resolved=1, calibration n=2) + guard test. **Remaining edge:** a SCHEDULED age-sweep cadence (the resolver runs on-demand; a cron/launchd beat to sweep aged predictions is owner-config).

Reach for **`izanagi-bridge`** for "which option do I build / commit under uncertainty"; reach for **this quantum tier** when the *evidence order* itself carries information.

## Use When (quantum tier specifically)

- Evidence is **sequential and order-sensitive** — a later observation reframes an earlier one (question-order, framing, anchoring, path-dependent diagnosis).
- Hypotheses **interfere** / are non-commuting (the projectors don't commute), so a product-of-likelihoods Bayes update loses information.
- You need the **Schmidt coupling test** — the cross-reference engine's mathematical criterion for whether two subsystems are genuinely coupled vs separable.
- You suspect a classical model is silently missing an order-effect and want a falsifiable test of it.

## Skip When

- Evidence is order-independent and exchangeable → plain Bayes (`bayesSequential`) is correct and cheaper; don't reach for quantum to look sophisticated.
- You want robust *optimization* over options, not order-effects → that's `decision-sim` / `izanagi-bridge`.
- The phases need to be complex (full ℂ^N interference) — this engine is **ℝ^N only**, phases 0 or π. Adequate for real-valued projectors; not a complex-interference model.

## Method → question map (quantum tracker)

| You want… | Function | What it gives |
|---|---|---|
| Posterior after an ORDERED evidence sequence | `hypothesisPosteriors(state, hypotheses, evidence)` | applies each projector in order (collapsing the state), then reads P(H) — order-dependent |
| The raw sequential measurement | `measureSequential(projectors, psi)` | the order-effect core: project, renormalize, repeat |
| The falsifiable order-effect signature | `qqEquality(state, P_A, P_B)` | QQ statistic `sAB − sBA`; the quantum model guarantees ≈ 0 — the Wang-Busemeyer test |
| Are two subsystems genuinely COUPLED | `schmidtDecomposition(psi_AB, m, n)` | Schmidt spectrum (Jacobi SVD) — the cross-ref engine's coupling criterion (separable ⇒ uncoupled) |
| The classical baseline you must BEAT | `bayesPosterior` / `bayesSequential` | order-blind posterior — the control |
| Run the whole falsification gate | `runBenchmark()` (benchmark module) | G1–G4 verdict |

Plus the ℝ^N primitives (`dot`/`norm`/`normalize`/`matVec`/`matMul`/`projector`/`diagonalProjector`/`measure`/`stateVector`). Pure, dependency-free, owner-gate-free — run as a throwaway harness or wire into a sim test.

## Eval-processing — turning a million-eval budget into a decision (`eval-processing.mjs`, NEW)

**Reframe (the juicy part):** an eval count is a sampling *budget*, not a result. Needing millions usually means you allocated badly — good design resolves most decisions at **thousands**; millions are only for rare tails, fine grids, or hi-dim corners. "Processing" collapses N evals → one decision + flip rule + residual CI. The funnel (4 capabilities, **11/11 green** as of `15cfc088`, all surface via capability-recall); `15cfc088` added residuals — `pairedDelta` `computeUnpaired:false` (skip the 2× baseline in hot loops) + `confidenceSequence` sub-Gaussian fallback (`range:null` for unbounded data, α-control validated on a Gaussian null):

- `mkAggregator` (**streaming-aggregator**) — Welford moments + Vitter reservoir, O(1) memory, never store the rows.
- `pairedDelta` (**crn-paired-delta**) — common-random-numbers → variance-reduced A/B delta CI (the biggest free win; computes the unpaired CI too as proof).
- `confidenceSequence` / `sequentialDecide` (**sequential-stopping**) — empirical-Bernstein confidence sequence, peek-valid (α-control empirically validated, not just cited; distinct from quantum `measureSequential`).
- `heldOutSplit` / `kFold` / `conformalQuantile` / `inSampleVsHeldout` (**heldout-split**) — kills the in-sample ECE=0 optimism trap.

The CI width + flip location are what made the 16M-eval cap-sim honest — not the count.

## The proof discipline (this is the precision, not decoration)

A model that "wins everywhere" is overfitting, not an effect. Gates are domain-blind and **two-sided** — both halves must hold:

- **G2 (earns its keep):** on real order-effect data (Gallup Clinton/Gore marginals: Clinton 50→57%, Gore 68→60%) quantum RMS must be **≥50% below** the best classical static model.
- **G3 (honesty/control):** on synthetic NO-order-effect data quantum must **NOT** beat classical by more than 0.005 RMS. A win on the control = laundering flexibility as signal → reject.
- **G1** machinery recovery; **G4** QQ residual on the real joint < 0.05.
- **DATA FLAG:** the Clinton/Gore **JOINT** cells are literature-recalled (Wang & Busemeyer 2013) → `OWNER-VERIFY`; the **marginals** are robustly attested and carry G2 on their own.
- **Corner law (automated downstream):** for an affine/multilinear objective the worst case sits at a **VERTEX** an interior Dirichlet/uniform sampler hits with probability 0 — `izanagi-bridge.cornerAwareReadout` enumerates vertices so a flip can't hide. See `[[feedback-affine-objective-enumerate-corners]]`.
- **Promotion path:** must beat the classical Bayes baseline on order-sensitive *logged* sequences before touching any live organ. Until then, advisory.

## Boundaries

- Output is advisory until verified against live evidence — the falsification gate IS the verification; don't claim a quantum win without the two-sided G2+G3 pass.
- ℝ^N real-valued only; don't claim complex-interference behavior it doesn't have.
- The arsenal is **still being built** — value models / bridge constants are hand-encoded (advisory, not measured truth); the learn loop is **closed on-demand** (`prediction-outcome-resolver` scores predictions→outcomes), with only a SCHEDULED sweep cadence still owner-config.

## Pair with

- **`izanagi-bridge.mjs`** (`@capability: izanagi-decision-bridge`) — the measure→robustify→commit step; corner-law-guarded ruling from option values.
- **`decision-sim.mjs`** — robust optimization tier (CVaR / regret / flip-rule / info-gap / multiverse).
- **`eval-processing.mjs`** — the funnel that turns a quantum/MC sim's evals into an honest decision+CI.
- **`prediction-outcome-resolver.mjs`** (`@capability`) — closes the learn loop: scores recorded predictions against observed outcomes (re-runs propagation-scan), populates calibration. Pairs with `izanagi-bridge`'s `{record:true}` ledger writes.
- **`probabilistic-decision-core`** (`/pdc`) — the EV/calibration discipline the tracker sharpens.
- **`cross-reference-navigation`** (`/xref`) — the Schmidt coupling test is the cross-ref engine's coupling criterion; use together when judging whether two mechanisms are truly linked.
- **`izanagi-simulator`** (`/izanagi`) — the qualitative 3-branch front.
- Recall surface: memory `[[ref-simulation-arsenal]]` (the 4-tier map + roadmap) · `[[ref-capability-first-wiring]]`.

## Session Notes

- 2026-06-14 (refresh) — Marcel: "you need to update that skill, it wasnt updated." Audited drift vs the doc's `faeb5b67` baseline: one new commit `15cfc088` "outcome-resolver closes the loop + eval-processing residuals" — the doc still called the learn loop "half-closed / nothing scores predictions→outcomes," now STALE. Ground-truth checked: tracker 313 lines / 19 exports (public API unchanged → method-map intact), benchmark **VERDICT PASS** (G1–G4 true, re-run live), tracker tests **5/5**, eval-processing **11/11**. Updated: learn-loop CLOSED via `prediction-outcome-resolver.mjs` (on-demand; scheduled cadence still owner-config), eval funnel 9/9→11/11 + the two residuals, added the resolver to Pair-with, bumped commit refs + re-verify date. Touched only this skill doc. Context: invoked to run order-effect sims on the recursive-nanoswarm `spawn_nano` design (child-EOT→canonical vs parent-converge non-commuting pair) before building Move 1b.
- 2026-06-13 (refresh) — Updated to the committed reality (`faeb5b67` "sim arsenal + eval-processing + enforced registry"). Tracker grew +313 lines (internal hardening; export API unchanged → method-map intact); arsenal now has tier 4 (`izanagi-bridge`) + an eval-processing layer + a half-closed learn loop. Re-verified on current code before documenting: tracker 5/0, eval-processing 9/0, decision-sim 7/0, quantum-vs-bayes benchmark **VERDICT PASS** (G1–G4 true). Marcel: "update the skill to the most current update of that whole process, it's juicy" + "still being built" → marked living; touched only this skill doc, not the tracker source. `@capability` block on the tracker survived his commit. Residual: izanagi-bridge has no unit test (demo-validated); roadmap at `02_RESOURCES/research/simulation-arsenal-wiring-2026-06-13.md`.
- 2026-06-13 (create) — Built after "turn simulations into recallable skills," corrected from decision-sim onto the quantum tracker. Registered the tracker's `@capability` (was 0 → capability-recall now surfaces it).
