# Math-Layer API Inventory — YURI Self-Governance & Goal-Scoring

**Date**: 2026-06-22  
**Purpose**: Extract exact public APIs from YURI math-kernel modules for agent self-governance and decision support wiring.  
**Scope**: `decision-sim.mjs`, `energy-tick-core.mjs`, `energy-breaker.mjs`, `quantum-hypothesis-tracker.mjs`, `prediction-ledger.mjs`, `calibration-tracker.mjs`, `izanagi-bridge.mjs`, `wave3-decision.mjs`.

---

## 1. decision-sim.mjs

**Module**: `/Users/marcelspatz/YURI-OS-MUSUBI/_SYSTEM/Scripts/decision-sim.mjs`  
**Capability Tag**: `robust-decision-sim`  
**Math Domain**: Robust optimization under uncertainty; CVaR / minimax regret / flip-rule / info-gap robustness.

| Function | Inputs | Output | What It Scores | Governance Use | Pure |
|----------|--------|--------|----------------|-----------------|------|
| `makeRng(seed)` | `seed: number` (default 1) | `() => [0,1)` – seeded PRNG closure | Reproducibility; seeded randomness | Deterministic runs across sessions | ✓ Yes |
| `gauss(rng)` | `rng: () => number` | `number` – standard-normal variate | Box-Muller Gaussian sampler | Sampling from Gaussian distributions | ✓ Yes |
| `halton(i, base)` | `i: int, base: prime` | `[0,1)` – quasi-random coordinate | Low-discrepancy QMC sampling; O(1/N) convergence | High-dimensional uncertainty sampling | ✓ Yes |
| `makeQmcRng({dim, draws, seed, force})` | `dim: int, draws: int, seed: int, force: bool` | `() => [0,1)` – Halton-based QMC sampler | Opt-in low-discrepancy sequence | Smooth, low-effective-dimension problems (opt-in disarmed) | ✓ Yes |
| `clamp(x, lo, hi)` | `x: number, lo, hi: number` (defaults 0,1) | `number` ∈ [lo, hi] | Boundary enforcement | Clip continuous params to bounds | ✓ Yes |
| `robustScore(problem, config, {draws, tailFrac, rng, qmc, qmcDim, qmcSeed})` | `problem: Problem, config: Config, opts: RobustOpts` | `number` – 0.5·mean + 0.5·CVaR(tail) | Worst-case + mean blended score; CVaR replaces hand-tuned λ | **Self-governance gate**: Is this option's worst-case acceptable? Score over uncertain params | ✓ Yes |
| `crossEntropyOptimize(problem, {pop, elite, iters, draws, tailFrac, seed})` | `problem: Problem, opts: OptOpts` | `{best: Config, confidence: {[dim]: {choice, mass}}, history: [scores]}` | Robust optimum via cross-entropy method (PROTES/CMA-ES analog) | **Role-selection / goal-scoring**: Which option wins under uncertainty? | ✓ Yes |
| `minimaxRegret(problem, configs, {draws, seed})` | `problem: Problem, configs: [Config], opts` | `{winner: {config, maxRegret}, ranked: [{config, maxRegret}]}` | Worst regret (max opportunity loss) per option; lowest-regret winner | **Goal-scoring**: Which choice minimizes regret? Rank by safety (regret) vs upside (CVaR) | ✓ Yes |
| `pgdWitness(problem, config, {restarts, steps, seed})` | `problem: Problem` (requires `.nullValue`), `config: Config`, `opts` | `{params: {...}, margin: number, robust: bool}` | Adversarial param point where config loses most to NULL; margin ≥ 0 → robust | **Adversarial-confidence**: When does a choice fail? Flip rule: "loses only when X > threshold" | ✓ Yes |
| `infoGapHorizon(problem, config, {nominal, draws, seed, maxAlpha, stepAlpha})` | `problem: Problem` (requires `.nullValue` + `.paramSpace`), `config: Config`, `nominal: {[param]: value}`, `opts` | `{horizon: number, flipped: bool}` | Robustness radius α: how far can params deviate from nominal before decision flips? | **Adversarial-confidence**: Scale tolerance to uncertainty; Info-Gap robustness horizon | ✓ Yes |
| `multiverse(problem, variants, pickWinner, {keyDims})` | `problem: Problem, variants: [{label, patch(p)→p}], pickWinner: Problem → Config, keyDims: [dims]` | `{baseline: Config, robustnessFraction: [0,1], rows: [{label, agrees, winner}]}` | Specification-curve / multiverse analysis: fraction of spec variants where winner is stable | **Self-governance**: Does the decision survive spec variants, or is it brittle? | ✓ Yes |

**Summary**: Pure robust-optimization instrument. **No side effects**. All functions are deterministic given seeded RNG. Used upstream of izanagi-bridge and adversarial-confidence gates.

---

## 2. energy-tick-core.mjs

**Module**: `/Users/marcelspatz/YURI-OS-MUSUBI/_SYSTEM/Scripts/energy-tick-core.mjs`  
**Capability Tag**: (implicit in hook wrapper)  
**Math Domain**: Real ΔU measurement from tool transitions; salience + calibration + protective gates.

| Function | Inputs | Output | What It Scores | Governance Use | Pure | Storage |
|----------|--------|--------|----------------|-----------------|------|---------|
| `isProtectedPath(filePath)` | `filePath: string` | `bool` | Protected-path pattern matching (regex test against `.env`, `backend/data/`, `.claude/state/`, etc.) | **Self-governance gate**: Structural-floor veto on file mutations | ✓ Yes | – |
| `classifyTransition(event)` | `event: ToolEvent` (from hook) | `{tool: string, filePath: string, success: bool, isMutating: bool, isBash: bool, protectedHit: bool}` | Tool type, mutating vs read, protected-path violation, success/failure | **Salience tier**: Is this a real work moment? | ✓ Yes | – |
| `salience(transition)` | `transition: ClassifiedTransition` | `TIER.SKIP \| TIER.WORK \| TIER.CRITICAL` | Tier 0 (reads), 1 (real progress), 2 (failures/violations) | **Salience front door**: Skip low-signal ticks (reads), gate deep math on WORK + CRITICAL | ✓ Yes | – |
| `shouldGate(transition)` | `transition: ClassifiedTransition` | `bool` | TIER.SKIP → false; else → true | **Gating entry**: Is this worth computing ΔU? | ✓ Yes | – |
| `isSurprise(absDeltaU, recentAbs, cfg)` | `absDeltaU: number, recentAbs: [number], cfg: SaliennceConfig` | `bool` | |ΔU| vs MAD band; True if stands out (> median + K·MAD) | **Surprise detection**: Is this ΔU an outlier in the recent band? | ✓ Yes | – |
| `surpriseEngaged({depth, deltaU, recentAbs, cfg})` | `depth: int, deltaU: number, recentAbs: [number], cfg` | `bool` | Composite: depth ≥ threshold AND |ΔU| surprising? | **Layer C**: Deep + surprising → fire evaluation | ✓ Yes | – |
| `shadowTrendReadout(signedStream, cfg)` | `signedStream: [number], cfg: ShadowTrendConfig` | `{available, cusumAlarm, cusumChangeIndex, cusumStatistic, cusumPeak, kalmanEstimate, kalmanSurprisedCount, kalmanLastSurprised, samples}` | CUSUM (slow-rot regime) + scalar-Kalman (recovery); scale-free dials (k, h factor MAD) | **Advisory shadow**: CUSUM change-point detection; Kalman re-sensitization readout. NOT used for verdict | ✓ Yes | – |
| `freshState()` | – | `{verifiedEvidenceCount, evidence: [], protectedPathViolations, promotionLadderInversions, maxLadderInversion, predictions: [], outcomes: []}` | Initial control-plane state | Session bootstrap | ✓ Yes | – |
| `applyTransition(prevState, transition, nowIso)` | `prevState: State, transition: ClassifiedTransition, nowIso: ISO8601` | `State` (immutable copy) | Updates evidence (ΔU↓), predictions/outcomes (failures), protected-path count | **State machine**: Roll forward one tick | ✓ Yes | – |
| `toGateState(state)` | `state: State` | `{verifiedEvidenceCount, evidence, protectedPathViolations, promotionLadderInversions, maxLadderInversion, predictions, outcomes}` | Cast to gate-proposal shape | **Adapter**: Hook state → gateProposal input | ✓ Yes | – |
| `evaluateTransition(prevState, event, nowIso)` | `prevState: State, event: ToolEvent, nowIso: ISO8601` | `{transition, nextState, deltaU: number, accept: bool, dominantTerm: string}` | Single evaluation via gateProposal (TEST-ONLY, no live gate defaults) | **Test entry**: Measure one transition in isolation | ✓ Yes | – |
| `tickAndTrace(prevState, event, opts)` | `prevState: State, event: ToolEvent, opts: {nowIso?, depth?, recentAbs?, recentSigned?, ledger?, configFile?, salience?, user?, runId?, ledgerFile?, ...}` | `{state, tier, traced, deltaU, depth, recentAbs, surpriseEngaged, deepEngaged, ledger, recentSigned, shadowTrend, verdict, claimFieldFailures}` | Live tick: classify → apply transition → gate → trace → breaker verdict | **Live path**: PostToolUse entry; returns next state + traced record | ✗ No – side-effect: appends trace via `traceGateEvaluation` | trace DB |

**Summary**: Observation layer (evidence, predictions, protected-path hits). **Pure except tickAndTrace** which appends to trace DB. Core ΔU formula feeds `gateProposal` (in energy.mjs).

**Protected Paths** (regex patterns):
- `/(^|\/)\.env$/`
- `/(^|\/)backend\/data\//`
- `/(^|\/)\.claude\/(state|history|file-history)\//`
- `/(^|\/)node_modules\//`
- `/(^|\/)\.amp\//`

---

## 3. energy-breaker.mjs

**Module**: `/Users/marcelspatz/YURI-OS-MUSUBI/_SYSTEM/Scripts/energy-breaker.mjs`  
**Capability Tag**: (implicit in gate guard)  
**Math Domain**: Circuit-breaker state machine (CLOSED/OPEN/HALF_OPEN); fail-fast + auto-escape.

| Function | Inputs | Output | What It Scores | Governance Use | Pure | Storage |
|----------|--------|--------|----------------|-----------------|------|---------|
| `loadBreakerCfg(env)` | `env: object` (default `process.env`) | `{waitDurationMs, maxHalfOpenMs, steerAscentWindow, steerAscentCount}` | Read env overrides; fall back to defaults | **Config load**: Tunable breaker thresholds | ✓ Yes | – |
| `freshBreaker()` | – | `{state: 'CLOSED', openedAt: 0, halfOpenAt: 0, reason: '', recentDeltaU: [], lastVerdictAt: 0}` | Initial breaker state | Bootstrap | ✓ Yes | – |
| `normBreaker(b)` | `b: any` | `{state, openedAt, halfOpenAt, reason, recentDeltaU, lastVerdictAt}` | Fail-open normalization of persisted breaker blob | **Resilience**: Corrupt/garbage state → CLOSED (fail-open) | ✓ Yes | – |
| `verdictFromStates(prevState, nextState, opts)` | `prevState: State, nextState: State, opts: {maxLadderInversionCap?, threshold?}` | `{accept: bool, protectedPathVeto, structuralFloorVeto, maxSeverityVeto, gateErrorVeto, deltaU, dominantTerm, error?}` | Call `gateProposal` on two states; wrap result | **Gate eval**: Standalone verdict (not live path) | ✓ Yes | – |
| `isCatastrophic(verdict)` | `verdict: Verdict` | `bool` | Any veto flag true? → catastrophic | **Veto test**: protected-path / structural-floor / max-severity / gate-error | ✓ Yes | – |
| `transitionOnVerdict(breaker, verdict, nowMs)` | `breaker: Breaker, verdict: Verdict, nowMs: number` | `Breaker` (updated state, never mutates input) | **OUTCOME-driven**: Catastrophic → OPEN; HALF_OPEN + accept → CLOSED; else roll steer band | **Verdict consumer**: Update breaker after a tool runs | ✓ Yes | – |
| `evaluateGate(breaker, nowMs, cfg)` | `breaker: Breaker, nowMs: number, cfg: BreakerConfig` | `{decision: 'allow'\|'deny'\|'probe'\|'steer', reason: string, breaker: Breaker}` | **TIME-driven**: OPEN cooldown elapsed? → probe. HALF_OPEN dwell exceeded? → auto-escape (CLOSED). CLOSED + ascending ΔU? → steer (advisory). | **PreToolUse gate**: Can the next tool run? ("allow" vs "deny" vs "probe" vs advisory "steer") | ✓ Yes | – |
| `trendReadout(recentDeltaU, opts)` | `recentDeltaU: [number], opts: {minSamples?, kFactor?, hFactor?, q?, r?}` | `{available, alarm, changeIndex, statistic, peak, k, h, mu0, samples, kalman: {estimate, surprisedCount}}` | CUSUM + scalar-Kalman over signed ΔU (scale-free via MAD) | **Advisory readout**: SLOW-ROT + RECOVERY (computed, never trips breaker) | ✓ Yes | – |

**Summary**: Resilience-engineering pattern (circuit breaker). **Pure except transitionOnVerdict storage** is managed by caller. Trip logic: one catastrophic event → OPEN; cooldown + timeout auto-escape anti-stuck. Soft ascending-ΔU is advisory only (never denies).

**Defaults**:
- `waitDurationMs`: 20s (OPEN → probe cooldown)
- `maxHalfOpenMs`: 60s (HALF_OPEN → CLOSED auto-escape)
- `steerAscentWindow`: 5 samples
- `steerAscentCount`: 3+ positive in window → advisory "steer"

---

## 4. quantum-hypothesis-tracker.mjs

**Module**: `/Users/marcelspatz/YURI-OS-MUSUBI/_SYSTEM/Scripts/quantum-hypothesis-tracker.mjs`  
**Capability Tag**: `quantum-hypothesis-simulation`  
**Math Domain**: Real-valued Hilbert-space (ℝ^N) superposition; order-effect-aware evidence; Schmidt coupling.

| Function | Inputs | Output | What It Scores | Governance Use | Pure |
|----------|--------|--------|----------------|-----------------|------|
| `dot(u, v)` | `u, v: [number]` | `number` – ⟨u\|v⟩ | Inner product | Vector mechanics | ✓ Yes |
| `norm(v)` | `v: [number]` | `number` – \|\|v\|\| | Euclidean norm | State normalization | ✓ Yes |
| `scale(c, v)` | `c: number, v: [number]` | `[number]` – c·v | Scalar-vector product | State scaling | ✓ Yes |
| `add(u, v)` | `u, v: [number]` | `[number]` – u+v | Vector addition | Superposition combine | ✓ Yes |
| `normalize(v, tol)` | `v: [number], tol: number` (default 1e-15) | `[number]` – v / \|\|v\|\| | Unit-norm projection; zero vector if \|\|v\|\| < tol | Quantum measurement renormalization | ✓ Yes |
| `matVec(M, v)` | `M: [[number]]` (m×n), `v: [number]` (len n) | `[number]` (len m) – M\|v⟩ | Matrix-vector product | Projector application | ✓ Yes |
| `matMul(A, B)` | `A: [[number]]` (m×k), `B: [[number]]` (k×n) | `[[number]]` (m×n) – A·B | Matrix product | Measurement sequencing | ✓ Yes |
| `transpose(M)` | `M: [[number]]` | `[[number]]` – M^T | Transpose | Projector dual | ✓ Yes |
| `identity(n)` | `n: number` | `[[number]]` (n×n identity) | I_n | Base projector | ✓ Yes |
| `stateVector(components)` | `components: [number]` | `[number]` (normalized) | ψ = normalize(components) | Superposition initialization | ✓ Yes |
| `projector(v)` | `v: [number]` (unit) | `[[number]]` – \|v⟩⟨v\| | Rank-1 projector | Hypothesis/evidence projector | ✓ Yes |
| `diagonalProjector(mask)` | `mask: [0\|1]` | `[[number]]` – diagonal P | Commuting basis projector | Standard-basis selection | ✓ Yes |
| `measure(P, psi, tol)` | `P: [[number]]` (projector), `psi: [number]` (state), `tol: number` | `{probability: [0,1], postState: [number]}` | Projection + renormalization: Pr = \|\|Pψ\|\|²; post = Pψ/\|\|Pψ\|\| | **Quantum measurement**: What's the outcome probability and collapsed state? | ✓ Yes |
| `measureSequential(projectors, psi, tol)` | `projectors: [[[number]]], psi: [number], tol: number` | `{jointProbability: [0,1], postState: [number]}` | Sequential projection P_k···P_1\|ψ⟩; joint prob = ∏ \|\|P_i ψ_i-1\|\|² | **Order-sensitive evidence**: What's the probability and state after a sequence? ORDER MATTERS (quantum interference) | ✓ Yes |
| `hypothesisPosteriors(state, hypotheses, evidence)` | `state: [number]`, `hypotheses: [[[number]]]` (projectors), `evidence: [[[number]]]` (projectors) | `[number]` – Pr(H_i \| E_1..E_k) | Bayesian posterior over hypothesis projectors, conditioned on evidence sequence | **Goal-scoring**: Which hypothesis is most likely given the evidence? Order-aware alternative to classicalBayes | ✓ Yes |
| `qqEquality(state, P_A, P_B)` | `state: [number]`, `P_A, P_B: [[number]]` (yes-projectors) | `{p_AyBn, p_AnBy, sAB, p_ByAn, p_BnAy, sBA, qqStatistic}` | QQ-equality test: sAB - sBA ≈ 0 (quantum) vs classical ~0.04 (order effect) | **Adversarial-confidence**: Do the evidence items interfere (non-commute)? Order matters? | ✓ Yes |
| `schmidtDecomposition(psi_AB, m, n, tol)` | `psi_AB: [number]` (len m·n), `m, n: number`, `tol: number` | `{rank: number, singularValues: [number]}` (SVD of reshaped m×n) | Schmidt rank & singular values; rank=1 → uncoupled, rank>1 → entangled/coupled | **Coupling criterion**: Are the two subsystems entangled? Cross-ref engine's coupling test | ✓ Yes |
| `bayesPosterior(prior, likelihoods)` | `prior: [number]`, `likelihoods: [number]` (per-hypothesis) | `[number]` – P(H_i\|E) = P(E\|H_i)·P(H_i) / Σ | Classical Bayes (order-blind) baseline | Comparison: does quantum order-effect matter? | ✓ Yes |
| `bayesSequential(prior, likelihoodSequence)` | `prior: [number]`, `likelihoodSequence: [[number]]` | `[number]` – P(H_i\|E_1..E_k) ∝ P(H_i)·∏ P(E_k\|H_i) | Multi-step Bayes (order-blind; product likelihood) | Control comparison for quantum gain | ✓ Yes |

**Summary**: Pure Hilbert-space mechanics (real-valued only; no complex phases). **No side effects**. All functions deterministic. Benchmarked 2026-06-11 (QQ-coincidence 0.96%, no spurious wins on order-free control). Wired into probabilistic-decision-core for claim/pulse machinery.

**Tradeoff**: Real ℝ^N only (all phases 0 or π via sign). Complex ℂ^N would capture full interference; sufficient for YURI's real-valued hypotheses.

---

## 5. prediction-ledger.mjs

**Module**: `/Users/marcelspatz/YURI-OS-MUSUBI/_SYSTEM/Scripts/prediction-ledger.mjs`  
**Capability Tag**: `prediction-ledger`  
**Math Domain**: Self-prediction ledger; Brier score calibration; confidence buckets.

| Function | Inputs | Output | What It Scores | Governance Use | Pure | Storage |
|----------|--------|--------|----------------|-----------------|------|---------|
| `recordPrediction(input, opts)` | `input: {id?, subject, change, predictedEffects: [{target, effect, confidence}], source, ts}`, `opts: {file?}` | `{ok: true, row}` | Append JSONL row: type='prediction', id, subject, change, predictedEffects, source, ts | **Prediction recording**: Log a forecast before outcome is known | ✗ No – appends to JSONL | `_SYSTEM/state/prediction-ledger.jsonl` |
| `recordOutcome(input, opts)` | `input: {predictionId, observedEffects: [{target, effect}], ts}`, `opts: {file?}` | `{ok: true, row}` | Append JSONL row: type='outcome', predictionId, observedEffects, ts | **Outcome recording**: Log what actually happened | ✗ No – appends to JSONL | prediction-ledger.jsonl |
| `scorePrediction(prediction, outcome, opts)` | `prediction: Prediction, outcome: Outcome, opts: {match?: (target, a, b)=>bool}` | `{brier: [0,2], hits, misses, falseAlarms, detail: [{target, predicted, observed, hit, miss, brier}]}` | **Brier score** per target: (confidence - hit?)²; unpredicted observed = miss + brier=1. Mean Brier over union. | **Calibration feedback**: Did the prediction come true? Assign Brier penalty. | ✓ Yes | – |
| `readLedger(opts)` | `opts: {file?}` | `[row]` (array of parsed JSONL objects) | Parse JSONL, skip corrupt lines, count warnings to stderr | **Ledger load**: Deserialize prediction+outcome records | ✓ Yes | – |
| `calibrationReport(opts)` | `opts: {file?, match?}` | `{n: int, meanBrier: [0,2], byConfidenceBucket: [{bucket, n, meanBrier, hitRate}], unresolved: [ids]}` | Read ledger, pair predictions ↔ outcomes by predictionId, compute meanBrier overall + per-confidence bucket [0-0.2], [0.2-0.4], ..., [0.8-1]. | **Calibration report**: Overall honesty + per-confidence alignment. Are 80% forecasts really correct ~80% of the time? | ✓ Yes | – |

**Summary**: Append-only JSONL ledger + pair/score functions. **recordPrediction/recordOutcome cause I/O (fail-open)**; read/score functions are pure. Use for learn-loop: record a mechanism's forecast (izanagi ruling, propagation effect), resolve it later, measure calibration drift.

**Buckets**: [0-0.2], [0.2-0.4], [0.4-0.6], [0.6-0.8], [0.8-1.0]

**CLI**: `node prediction-ledger.mjs report` invokes `calibrationReport()` (used by homeostat reflex).

---

## 6. calibration-tracker.mjs

**Module**: `/Users/marcelspatz/YURI-OS-MUSUBI/_SYSTEM/Scripts/calibration-tracker.mjs`  
**Capability Tag**: (advisor precision/recall tracker)  
**Math Domain**: Per-advisor F1 + precision + recall; deprioritization on low F1.

| Function | Inputs | Output | What It Scores | Governance Use | Pure | Storage |
|----------|--------|--------|----------------|-----------------|------|---------|
| `loadExistingPriors()` | – | `{advisors: {...}, ...} \| null` | Read `nisaba/calibration/priors.json` | **Prior load**: Reuse last calibration state | ✓ Yes | `nisaba/calibration/priors.json` |
| `loadRecentFindings()` | – | `[finding]` (filtered to 7-day window) | Read `pulse-bus.json`, filter by timestamp > now - 7d | **Findings load**: 7-day finding window from pulse bus | ✓ Yes | `_SYSTEM/state/pulse-bus.json` |
| `computeAdvisorStats(findings, priorState)` | `findings: [finding]`, `priorState: {advisors: {...}, ...}` | `{[source]: {precision, recall, f1, f1_delta, n_total, n_warn_plus, n_evaluated, deprioritize, last_updated}}` | Per-advisor: TP/(TP+FP), TP/(TP+FN), 2·prec·rec/(prec+rec), F1 delta from prior, counts | **Advisor evaluation**: Who is accurate? Who loses precision (drop > 15%)? | ✓ Yes | – |

**CLI script** (not exported functions): Reads pulse-bus findings, prior state, computes advisor stats, writes updated priors + calibration log entry.

**Output**:
- `nisaba/calibration/priors.json`: `{updated_ts, window_days, advisors, deprioritized, f1_dropped_advisors, recalibration_threshold_exceeded, total_findings_evaluated}`
- `_SYSTEM/SELF-IMPROVEMENT/02_EXTRACT/probability-calibration-log.md`: One-line append per run

**Advisor sources tracked**: DEEPSEEK, NVIDIA, YURI_SENTINEL, YURI_RISK, SWARM, CODEX_ADVISORY.

**Thresholds**: F1 drop > 15% → flag for recalibration.

---

## 7. izanagi-bridge.mjs

**Module**: `/Users/marcelspatz/YURI-OS-MUSUBI/_SYSTEM/Scripts/izanagi-bridge.mjs`  
**Capability Tag**: `izanagi-decision-bridge`  
**Math Domain**: Measured option values → robust methods (CVaR/regret/flip-rule) → izanagi ruling; corner-law guard (affine/multilinear worst-case at vertices).

| Function | Inputs | Output | What It Scores | Governance Use | Pure | Storage |
|----------|--------|--------|----------------|-----------------|------|---------|
| `vertices(paramSpace)` | `paramSpace: {[axis]: [lo, hi]}` | `[{[axis]: lo\|hi}, ...] \| null` | Enumerate 2^k corners (exact if k ≤ 16; else null → sample fallback) | **Corner law**: Affine/multilinear objective worst-case hides at vertices, not interior | ✓ Yes | – |
| `cornerAwareReadout(problem, configs, {draws, seed, biteEps})` | `problem: Problem`, `configs: [Config]`, `opts` | `{robust: [{config, score}], minimaxRegret: mr, perConfig: [{build, worstVertex, bestVertex, interiorMin, worstAt, cornerLawBite, robustFloor}], cornersExact}` | per-config: robustScore + worst/best VERTEX + interior worst; cornerLawBite flag when vertex < interior | **Corner-law detection**: Does interior sampling miss a silent flip? | ✓ Yes | – |
| `flipThresholds(problem, config, {nominal, steps})` | `problem: Problem` (requires .nullValue, .paramSpace), `config: Config`, `nominal: {[axis]: value}`, `opts` | `{[axis]: {threshold: number, losesWhen: string}}` | Per-axis: where does config's margin (config - NULL) cross zero? Linear interp crossing. | **Flip rule**: Human-readable "loses only when X > threshold" gate condition | ✓ Yes | – |
| `izanagiRuling(problem, configs, opts)` | `problem: Problem`, `configs: [Config]`, `opts: {draws?, seed?, biteEps?, record?, recordSource?, ledgerFile?}` | `{readout, robustWinner, regretWinner, disagree: bool, classified: [{build, verdict: BUILD\|GATE\|REJECT\|DEFER\|BASELINE, why, ...}], text: string}` | Classify each config (BUILD / GATE / REJECT / DEFER / BASELINE); surface robust-vs-upside split; emit ⬡ format | **Architecture decision**: Which option do we commit to? Quantitative izanagi | ✗ No – optional: calls recordPrediction if opts.record=true | prediction-ledger (opt-in) |
| `demoProblem()` | – | `problem: Problem` | Live "which math extension" decision from 16M-eval cap-sim | **Validation**: Smoke test reproducibility | ✓ Yes | – |
| `runDemo()` | – | `ruling` | Call demoProblem() → izanagiRuling() → print text | **CLI**: `node izanagi-bridge.mjs --demo` | ✓ Yes | – |

**Summary**: Bridges measured option values (MC / quantum sim) into decision-sim's robust methods + automated corner-law check + izanagi front-end. **Pure except izanagiRuling when opts.record=true** (calls prediction-ledger).

**Verdicts**:
- **BUILD**: Positive floor at every vertex (robustly wins)
- **GATE**: Upside exists but with a cheap conditional gate ("loses when X > threshold")
- **REJECT**: Upside only at multi-axis knife-edge over catastrophic floor
- **DEFER**: No positive vertex (best ≤ 0)
- **BASELINE**: Do-nothing reference (best=worst=0)

**Learn-loop edge**: recordPrediction({subject, change: 'izanagi-ruling', predictedEffects: [BUILD/GATE verdicts], source, ts}) if opts.record=true.

---

## 8. wave3-decision.mjs

**Module**: `/Users/marcelspatz/YURI-OS-MUSUBI/_SYSTEM/Scripts/wave3-decision.mjs`  
**Capability Tag**: (validation harness)  
**Math Domain**: Wave-3 governance-substrate decision; factor tables (hardened estimates); full multivariate sweep.

| Function | Inputs | Output | What It Scores | Governance Use | Pure | Storage |
|----------|--------|--------|----------------|-----------------|------|---------|
| `PROBLEM` (exported const) | – | `{name, discrete: {...}, continuous: {...}, paramSpace: {...}, sampleParams, value, nullValue}` | Wave-3 substrate choice problem: {firing, identity, foundry, promote, aggGate, soakLen, aggK, lInfCap} × {Pemit, kappa, partRate} | **Validation case**: Reproduces locked answer via cross-entropy + diagnostics (regret/pgdWitness/infoGap) | ✓ Yes | – |

**main() function** (CLI entry `node wave3-decision.mjs`):
1. **crossEntropyOptimize(PROBLEM)** → robust optimum (must reproduce LOCKED design)
2. **minimaxRegret(PROBLEM, family)** → regret winner over headline discrete families
3. **pgdWitness(PROBLEM, LOCKED)** → worst-case params (scalar-only; weights uniform)
4. **infoGapHorizon(PROBLEM, LOCKED)** → robustness radius α (scalar-only)
5. **honesty(ceBest)** → audit: identity is within noise; pgdWitness misses true joint worst (simplex VERTEX × scalar corner)

**Factor tables** (hardened, not re-derived):
- `T.prev`: [sync-block=0.92, explicit-emit=0.68, async-trailing=0.55, stop-batch=0.30]
- `T.safeFire`, `T.idChurn`, `T.archFire`, `T.buildId`, `T.pUnstable`, `T.smuggleRes`, `T.aSmuggle`: per-dimension factors
- `NULL_F`: [0.05, 0.42, 0.99, 0.32, 1.0] (corrected baseline prevention/safety/rev/archfit/buildcheap)

**Utility function**:
```
U = w[0]·prevention + w[1]·safety + w[2]·reversibility + w[3]·archfit + w[4]·buildcheap
```
where weights ~ Dirichlet(1) (normalized exponentials) × uncertainty axes (Pemit, kappa, partRate).

**Honesty block**: Verifies two corrections:
1. identity (anchor+node vs anchor-bound) is within noise (|ΔrobustScore| ≤ 0.0004 across tailFrac)
2. pgdWitness (scalar-only, uniform w) misses TRUE joint worst (simplex-VERTEX × scalar-corner); true worst lives at a weight corner

**Summary**: Validation + smoke test (CLI). Pure. Reproduces locked design; emits diagnostics (regret, flip-rule, horizon); documents residual uncertainty (identity indiff, simplex-corner miss).

---

## Wiring Table: Governance Use Cases

| Agent Decision Gate | Math Module | Function | Decision Output | Risk Class |
|---------------------|------------|----------|-----------------|-----------|
| **Role-selection** | decision-sim.mjs | crossEntropyOptimize | Best option over discrete space (model-agnostic) | Medium – uncertainty in problem definition |
| | izanagi-bridge.mjs | izanagiRuling | Verdict (BUILD/GATE/REJECT/DEFER) + flip rules | Medium – residual param uncertainty |
| **Goal-scoring** | decision-sim.mjs | robustScore | 0.5·mean + 0.5·CVaR(tail) | Low – deterministic calculation |
| | decision-sim.mjs | minimaxRegret | Config with lowest max opportunity loss | Low – ranked comparison |
| | quantum-hypothesis-tracker.mjs | hypothesisPosteriors | Pr(H_i \| E_1..E_k) order-aware | Medium – measurement collapse |
| **Self-governance gate** | energy-tick-core.mjs | salience | TIER.SKIP / WORK / CRITICAL | Low – deterministic classification |
| | energy-tick-core.mjs | tickAndTrace | Live state update + ΔU computation | Low – deterministic (given prior state) |
| | energy-breaker.mjs | evaluateGate | Decision (allow/deny/probe/steer) | Low – state machine |
| **Adversarial-confidence** | decision-sim.mjs | pgdWitness | Params where config loses most to NULL; margin ≥ 0? | Low – deterministic search (stochastic seeds) |
| | decision-sim.mjs | infoGapHorizon | Robustness radius α before decision flips | Low – deterministic sweep |
| | quantum-hypothesis-tracker.mjs | qqEquality | QQ-statistic ≈ 0 (quantum) vs order effect | Low – linear algebra |
| | quantum-hypothesis-tracker.mjs | schmidtDecomposition | Schmidt rank; rank > 1 → coupled/entangled | Low – SVD |
| **Calibration-feedback** | prediction-ledger.mjs | calibrationReport | meanBrier + per-confidence hitRate | Low – ledger aggregation |
| | calibration-tracker.mjs | computeAdvisorStats | Per-advisor F1, precision, recall, deprioritize flag | Low – counting / aggregation |

---

## Summary: API Classification

### Pure Functions (Safe to inline, no side effects, deterministic given seeded RNG)
- decision-sim: all exports (makeRng, gauss, halton, makeQmcRng, clamp, robustScore, crossEntropyOptimize, minimaxRegret, pgdWitness, infoGapHorizon, multiverse)
- energy-tick-core: classifyTransition, salience, shouldGate, isSurprise, surpriseEngaged, shadowTrendReadout, applyTransition, toGateState, evaluateTransition
- energy-breaker: all exports except transitionOnVerdict (which rolls state, managed by caller)
- quantum-hypothesis-tracker: all exports
- prediction-ledger: scorePrediction, readLedger
- izanagi-bridge: vertices, cornerAwareReadout, flipThresholds (izanagiRuling pure unless opts.record=true)
- wave3-decision: PROBLEM constant, demoProblem(), runDemo()

### Side-Effecting (I/O, ledger/DB append)
- energy-tick-core: tickAndTrace (appends trace via traceGateEvaluation hook)
- prediction-ledger: recordPrediction, recordOutcome (append to JSONL)
- izanagi-bridge: izanagiRuling if opts.record=true (calls recordPrediction)
- calibration-tracker: (CLI script only, not exported; computes stats + writes priors.json)

### Recommended Composition for Agent Loops
1. **Decision**: decision-sim.mjs (crossEntropyOptimize or robustScore)
2. **Robustness verification**: izanagi-bridge.mjs (cornerAwareReadout + flipThresholds + izanagiRuling)
3. **Evidence integration**: quantum-hypothesis-tracker.mjs (hypothesisPosteriors or qqEquality if order matters)
4. **Self-governance**: energy-tick-core.mjs (salience + evaluateTransition) → energy-breaker.mjs (evaluateGate)
5. **Learn loop**: prediction-ledger.mjs (recordPrediction → recordOutcome → calibrationReport)

---

**Audit Date**: 2026-06-22  
**Status**: Exact API extraction complete. All 8 modules inventoried. No inferred APIs—only verified exports and entry points.
