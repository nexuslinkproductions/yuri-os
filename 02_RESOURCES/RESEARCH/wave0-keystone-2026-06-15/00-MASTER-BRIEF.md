# 00 — MASTER BRIEF: Wave-0 Keystone — Close the Verifier's Feedback Loop

> Ground-truth doc for the autonomous overnight build (owner asleep 2026-06-15). Every lane reads this FIRST.
> Owner mandate: "build something remarkable by morning, fully autonomous, 6-lane peer swarm does the heavy
> lifting, go all out with quantum-sims/sims/calculations/red-team, predictions + possibilities are in scope
> and viable if done right, lanes self-assess via calculation when unsure. DON'T STOP BUILDING."

## THE MISSION (why this is THE keystone)
The 2026 frontier (RLVR, PRMs, generative verifiers, zeroth-order, rStar-Math) all converge on ONE shape:
**a verifier at the center.** YURI already HAS one — `computeU`/`gateProposal`, deterministic, 12-term, **55,754
firings**. But it fires **OPEN-LOOP: ZERO outcome labels.** It measures→commits, never LEARNS. Close that loop
and the whole verifier-centric stack unlocks (calibration, reward-eval, self-evolution, eventually an SLM PRM).
This is "the one move that makes every other move possible" (15-SYSTEM-SYNTHESIS §1).

## THE REAL SEAM (grounded this session — do NOT trust the synthesis's file names blindly)
- **CORRECTION:** the synthesis named `yuri-energy-trace-outcomes.mjs` — that file is a **swarm hallucination,
  does not exist.** Do NOT reference or import it. The real infra is below.
- **The harvester harness already EXISTS, DISARMED:** `_SYSTEM/Scripts/energy-outcome-deriver.mjs` (complete,
  113 lines). It maps gate firings → prediction records in a SHADOW file, derives outcomes via a fixed-precedence
  rule engine (R1 reverted > R2 retried-and-succeeded > R3 promoted > R4 undeterminable), NEVER writes the live
  ledger. Exports: `readFirings, firingToPrediction, deriveOutcome, runDeriver, calibrate`.
- **The LEARN store (real):** `_SYSTEM/Scripts/prediction-ledger.mjs` — `recordPrediction, recordOutcome,
  scorePrediction (Brier), readLedger, calibrationReport`. Append-only JSONL.
- **The gate capture seam (real):** `_SYSTEM/Scripts/math/yuri-energy-gate-trace.mjs` — `captureGateVerdict,
  maybeTraceGateVerdict (the one-line gate seam), resolveGateVerdict (operator resolution stub), readGateTrace,
  replayGateTrace`.
- **DATA SOURCES (real, located):**
  - Firings: `_SYSTEM/state/energy-trace/*.jsonl` — ~20 daily files, real `computeU` firings (fields incl
    `runId, deltaU, decision, regime, event, timestamp` per the deriver contract — INSPECT to confirm).
  - `isPromoted` ← `_SYSTEM/state/claim-transition-trace.jsonl` (+ `claim-cortex.mjs` LADDER/PROMOTION_STATES).
  - `dispatchAccepted` ← `_SYSTEM/state/originator-telemetry.jsonl`.
  - `isReverted` ← `git log` (protected-path edit reverted in-session / file change undone).
  - `isRetriedAndSucceeded` ← bash/pulse trace `_SYSTEM/state/lane-pulse-trace.jsonl` (rejected Bash later fixed).
  - Existing shadow output: `_SYSTEM/state/energy-outcome-shadow.jsonl` (the deriver has run before — append/replace, never the live ledger).

## THE GAP (what Wave-0 builds)
The deriver needs `signals = { isReverted(runId), isRetriedAndSucceeded(runId), isPromoted(runId) }` injected —
**those detectors don't exist.** Plus the LEARN scorer (beyond `calibrate()`), the red-team controls, and the
real backfill run. That's the whole Wave-0.

## CONTRACTS (build to these — all lanes parallel, I integrate)
- **Signal interface:** `{ isReverted(runId)->bool, isRetriedAndSucceeded(runId)->bool, isPromoted(runId)->bool, dispatchAccepted(runId)->bool }`. Pure deterministic readers. NO side effects. Fail-CLOSED to `false` (unknown ⇒ not-labeled, never a false label).
- **Shadow-ledger format:** whatever `prediction-ledger.recordPrediction/recordOutcome` emit (do NOT invent a format; reuse the ledger).
- **DISARMED everywhere:** shadow files only (`_SYSTEM/state/energy-outcome-*.jsonl`), NEVER write
  `_SYSTEM/state/prediction-ledger.jsonl`. NO cron, NO launchd, NO live wiring into `gateProposal`. Arming is
  OWNER-GATED (holds for owner's wake).

## 6-LANE DECOMPOSITION (peers, not candidates — collect-best from all)
- **L1 kimi-k2.7-code** → `_SYSTEM/Scripts/energy-outcome-signals.mjs`: the 4 signal detectors (isReverted/git,
  isRetriedAndSucceeded/pulse, isPromoted/claim-transition-trace, dispatchAccepted/originator-telemetry). Pure,
  fail-closed, + `.test.mjs`. INSPECT the source JSONL formats first.
- **L2 deepseek-v4-pro** → `_SYSTEM/Scripts/math/yuri-energy-rewardbench.mjs`: score the gate AS a reward model
  over the shadow ledger — pairwise accuracy, best-of-N, calibration (Brier/ECE). Answer "is the gate actually
  right?" + `.test.mjs`. Log a prediction-ledger forecast of the result BEFORE running.
- **L3 glm-5.1** → RED-TEAM: `_SYSTEM/Scripts/math/yuri-energy-labelaudit.mjs` — (a) identity-leak control: fit a
  calibrator on (U → the gate's OWN verdict), show it hits ~100% and is worthless (guards against calibrating the
  gate to itself); (b) per-rule spot-check: each signal rule is a HYPOTHESIS — quantify how often it fires + a
  falsifiable check it isn't laundering the gate's own bias. + `.test.mjs`.
- **L4 minimax-m3** → integration + backfill: run `runDeriver` over the REAL `energy-trace/*.jsonl` firings with
  L1's signals → populate the shadow ledger → first real `calibrationReport`. DISARMED (shadow only). Report
  Brier + per-bucket + rule histogram. Log a prediction of the calibration BEFORE running it.
- **L5 nemotron-3-ultra** → SIM / POSSIBILITIES lane: quantum order-effect sim (does signal-precedence R1>R2>R3
  interact with firing-order? gate-integrations don't commute per QSIM-B — test the harvester's order-sensitivity
  + qqEquality) + decision-sim (CVaR robustness of the calibration under label-noise) + a counterfactual design
  probe (is fixed-precedence optimal vs a weighted blend?). Pure /tmp harnesses, near-zero cost. Write findings to this dir.
- **L6 deepseek-v4-flash** → Wave-1 prep: read 15-SYSTEM-SYNTHESIS §3 Wave-1 + write build-specs for the NEXT
  wave (conformal C-layer `yuri-energy-conformal.mjs`, generate-then-verify `gate-rerank.mjs`, `eml-tree.mjs` 2nd
  formula-foundry generator + izanagi-bridge#vertices hardening, `ccr-compress` into buildContextPack,
  `verifierBestOfN`). One spec file per item in this dir.

## RAILS (non-negotiable)
- DISARMED-first; ARMING is owner-gated. Reversible, scoped pathspec, DIFF-CHECK before every commit (the tree is
  chronically dirty — never sweep foreign uncommitted work), `--no-verify` ONLY for parallel capabilities.json drift.
- Every lane: log a prediction-ledger forecast + run a sim where it applies; red-team your own output; first-run
  success is a hypothesis. Self-assess via calculation when unsure.
- Protected paths off-limits. No paid/outward actions. No SLM cloud train.

## STATUS LOG (the orchestrator appends each wave)
- 2026-06-15: brief written; seam grounded; deriver confirmed complete+DISARMED; wave-1 dispatch next.
- 2026-06-15 WAVE-0 BUILD (6-lane swarm): infra built+green — deriver (exists) + signals (energy-outcome-signals.mjs, 33/33) + labelaudit (yuri-energy-labelaudit.mjs, 16/16) + backfill (energy-outcome-backfill.mjs) ; rewardbench WIP (format-mismatch fix in flight).
- 2026-06-15 **CRITICAL RED-TEAM FINDING — runId-join is DEAD**: gate firings carry `runId="ollama-lane-..."` (corpus = 56,021 decisions: 54,367 accept / 1,654 reject, 55,566 with a runId), but those runIds appear in ZERO outcome sources (claim-transition=0, originator-telemetry=0, git=0). Backfill over the real firings derived **0/56,017** outcomes (100% undeterminable). The 15-SYSTEM-SYNTHESIS `resolveOutcome(runId)` keystone ASSUMED a runId linkage that does not exist in the data. Global `stateAfter_summary` is confounded (reflects all-lane activity between firings) → state-trajectory labels would be noisy. **HONEST PATH**: the loop must close FORWARD — the gate emits a downstream-joinable id + `resolveGateVerdict` resolves on real post-hoc signals as they happen (owner-gated arm); the historical 56k can't be cleanly labeled. The built infra (deriver/signals-framework/rewardbench/labelaudit/backfill) is the reusable asset; the LINKAGE is the real open problem to solve forward.
- 2026-06-15 LANE LEARNING: kimi/glm FENCE (emit code as text, don't write files) on read-heavy tasks — they exhausted the 24-iter tool budget on reading before reaching the write call. FIX: raised llm-lane default `--max-iters` 24→200 + route file-writes to the reliable writers (minimax/deepseek). Lanes are equal peers (owner directive).
- 2026-06-15 WAVE-1 (nano swarm, 5 modules built from L6 specs): **conformal C-layer 12/12 GREEN — COMMITTED+PUSHED (a66f7c71)**. On disk, uncommitted, mixed: eml-tree 20/4, gate-rerank 17/6, verifier-best-of-n (recheck), ccr-compress 0/1 (broken). rewardbench still 8/11.
- 2026-06-15 **BLOCKER for math/ fixes — nexus-guard registration**: the PreToolUse nexus-guard BLOCKS edits to any `_SYSTEM/Scripts/math/*.mjs` not registered in MATH-SCIENCE-MANUAL.md + the circuitry graph (the lanes wrote them via raw bash, bypassing this). So eml-tree/gate-rerank/rewardbench/verifier-best-of-n/conformal/labelaudit are all UNREGISTERED. autowire (`nexus-guard-autowire.mjs`) is the fast path BUT (a) the guard's suggested CLI syntax errored ("unknown argument" — find real usage), (b) it writes `yuri-graph.json` + `yuri-graph-state.json` which are ALREADY dirty (foreign uncommitted) → committing registration risks sweeping. RECONCILE REGISTRATION AT OWNER WAKE (shared-state, not safe to force autonomously at night).
- 2026-06-15 **rewardbench DIAGNOSED (fix ready, blocked by registration)**: failures are a VOCABULARY mismatch — predictions use effect `'survives'`/`'rejected-correctly'`, outcomes use `'survived'`/`'reverted'`/`'retried-and-succeeded'`; `scorePrediction` does raw string-equality so every pair scores miss. FIX = a semantic hit-map in `resolveRows` (~8 lines): `survives`→hit iff observed ∈ {survived,retried-and-succeeded}; `rejected-correctly`→hit iff observed ∈ {reverted}. (Drafted; the Edit was nexus-guard-blocked.)
- 2026-06-15 **RESUME MAP**: (1) find autowire's real CLI + register the 6 new math modules (reconcile the dirty yuri-graph WITH owner); (2) apply the rewardbench semantic hit-map → green; (3) fix eml-tree(4)/gate-rerank(6) fails; (4) fix ccr-compress (NON-math, editable now, no guard); (5) commit the green Wave-1 batch; (6) THE REAL KEYSTONE — forward loop-closure (gate emits a downstream-joinable id + resolveGateVerdict resolves on live signals; owner-gated ARM) since the historical runId-join is dead. DISARMED throughout; nothing armed.
