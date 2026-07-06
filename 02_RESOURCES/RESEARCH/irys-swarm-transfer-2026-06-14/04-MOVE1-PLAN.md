# MOVE 1 — IMPLEMENTATION PLAN (4-lane converged, code-grounded)

> Consolidated from Claude/Opus + Mimo + DeepSeek + Nemotron-3-Ultra (all via llm-compat). Integration point adjudicated against live code: **3 grounded lanes (DeepSeek, Nemotron, Claude-read) → `yuri-workcell.mjs`**; Mimo+Kimi's "kagami" pick was a misread of the cron janitor (`kagami-swarm-supervisor.mjs` header: *"NOT a loop — cron is the scheduler... this is the janitor+monitor"*).
> Status: SPEC — owner-gated. DISARMED-first. This is also the **governor for the recursive exoskeleton nanoswarm** ([[proj-irys-swarm-transfer]] + `nano-external.mjs`): recursive spawn without this = exponential blowup.

## SCOPE (Move 1 only)
Standalone `_SYSTEM/Scripts/swarm-convergence.mjs` (3-layer convergence gate + damping), additive, feature-flagged `YURI_SWARM_CONVERGENCE=1`, reversible, TDD. NOT wired into the workcell loop yet (that's the owner-gated arming step). NOT the typed blackboard / debt sensors / custody taxonomy (later moves). NOT the `spawn_nano` tool (Move-1b, on top of this governor).

## MODULE API (`swarm-convergence.mjs`)
```mjs
export const CONVERGENCE_STATE_DIR = '_SYSTEM/state/swarm-convergence'; // ephemeral per-run
export function buildObligationLedger(decomposition)        // → {leafTasks:[{id,role,expectedOutputType}], leafCount}
export function checkObligationFloor(ledger, poolOutputs)   // → {ok, missing:[id], nonConforming:[id], details}
export function checkCriticalSignalBlock(signals)           // → {blocked, blockers:[]}
export async function runAdversarialPass(runId, poolOutputs, lanes, opts) // → {ok, rejections:[{leafId,gap,actionable}]}
export function checkDamping(state, round)                  // → {continue, reason, updatedState}
export function converge({ledger, poolOutputs, signals, adversarialResult, damping, round, opts}) // → {converged, reason, blocking:[], nextRoundWork:[], damping'}
```
Every fn pure except `runAdversarialPass` (dispatches a peer lane) + state read/write. `converge` is the single entry a round loop calls; short-circuits on first blocking layer. **DISARMED default:** if `YURI_SWARM_CONVERGENCE!=='1'`, `converge` returns `{converged:true, reason:'gate-disarmed'}` (passthrough — never blocks a real run until armed).

## THE 3 LAYERS (reified, file:symbol grounded)
1. **Obligation-ledger floor (deterministic).** Ledger from `validateDecompositionDag` (`yuri-workcell.mjs:925`) leaves. Conforming leaf = `readPoolOutput(runId,role)` (`yuri-workcell.mjs:1329`) returns non-empty AND `parseResultLabel(label).ok` with `passType ∈ {X,P}` (`contract-conformance.mjs`, PASS_TYPE_CANON). **Ledger is HYPOTHESIS** (open-ended work can spawn scope the decomposition didn't anticipate) — a missing leaf means the decomposition was incomplete, not that work is done.
2. **Critical-signal block (deterministic).** Any unresolved `kind:CRITICAL` signal on the Kagami bus (`kagami-event-bus.mjs`) → not converged. Sources: detected contradiction, security/data-loss flag, `validateWorkerOutput` (`yuri-workcell.mjs:1137`) returning invalid. Signals carried on the per-run damping state.
3. **Adversarial peer pass (LLM, one non-work lane).** Prompt (Nemotron domain-shift): *"the swarm says done — find what's missing: verification / edge-case / test / integration."* Gaps accepted only if material∧specific∧actionable; accepted gaps → `nextRoundWork` (re-injected as new DAG leaves) + signals. Supervisor pass = default-APPROVE, rejects only on the same tri-filter.

## DAMPING STATE (`_SYSTEM/state/swarm-convergence/<runId>.json`, ephemeral, auto-clean)
```js
{ seenFindingHashes:[sha256], signalRegistry:[{hash,kind,round,expiryRound}], // crit/high no expiry; med/low round+3
  actionCooldown:{"action:target":round}, roundYields:[5,3,1,0], budgetUsed:0, round:3 }
```
Rules: trigram/hash dedup on SIGNALS (not findings — lossy); priority-tiered expiry; action+target cooldown (N rounds); marginal-value cutoff (stop when yield < threshold for K rounds); budget governor reuses `cost-reservation-pool.mjs`.

## INTEGRATION (deferred to arming step — spec only here)
Standalone module. Primary caller: the workcell/Workflow round loop calls `converge(...)` after `readPoolOutput` returns each round; if `!converged`, inject `nextRoundWork` as new leaves + continue. Optional second gate: `kagami-swarm-supervisor.superviseOnce` may emit a convergence-liveness summary on its cron cycle (advisory board signal only — NOT the gate home). `lane-kernel.mjs` is config-only (no loop) — not a hook.

## TDD (DISARMED behind `YURI_SWARM_CONVERGENCE=1`; `_SYSTEM/Scripts/swarm-convergence.test.mjs`)
- (a) blocks on open critical signal · (b) blocks on empty/non-conforming leaf · (c) adversarial reject re-injects to nextRoundWork · (d) damping stops oscillation (repeated finding-hash cooled; marginal-yield cutoff) · (e) converges when all leaves conform + zero critical + adversarial-clean + yield>threshold · (f) DISARMED passthrough (flag unset → converged:true, gate-disarmed).
Adversarial pass injected as a fake runner in tests (no live lane). Run: `YURI_SWARM_CONVERGENCE=1 node --test _SYSTEM/Scripts/swarm-convergence.test.mjs`.

## REVERSIBILITY / BLAST / BREAKS
Reversible: one new module + one test, zero mutation of existing files, feature-flagged, ephemeral state. Rollback = delete 2 files + unset env. Blast: zero until armed (passthrough). BREAKS (honest): no coverage denominator (ledger=hypothesis); content-quality undefined (Move 2 deterministic quality gate narrows it); signal/adversarial detection is LLM-dependent (accuracy floor shared with the source system); a truly open-ended task may never structurally "converge" — gate degrades to adversarial-only, still better than K-empty-rounds.

## NANOSWARM TIE-IN
This gate + damping IS the governor for recursive `spawn_nano` (Move-1b): depth cap + budget governor + convergence-stop + rejected-action memory prevent the exponential blowup recursive exoskeleton spawning would otherwise cause. Build order: governor (Move 1) → `spawn_nano` tool wrapping `nano-external.mjs:externalNanoWork` with depth/fanout caps in ctx (Move 1b).

RESULT_LABEL: 08RX_MOVE1_PLAN_4LANE_CONVERGED_X_PASS_UNCOMMITTED
