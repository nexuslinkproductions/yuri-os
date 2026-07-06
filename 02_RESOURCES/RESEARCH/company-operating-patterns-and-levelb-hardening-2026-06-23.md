# Company Operating Patterns + Level-B Recursion Hardening — 2026-06-23

Synthesis of 3 parallel Sonnet research lanes (Node-1: "self-improvement intelligence ∥ Level-B hardening").
Self-improvement patterns are captured as pool jobs (added 2026-06-23, pool→34); this doc preserves the
reasoning + the **precise Level-B hardening design** for implementation. [L]=local-verified · [A]=online-advisory.

## A. Operating-model patterns → MURE (top, ranked by leverage)

1. **Independent critic structurally off the executor loop** [L: NS2 0/4 self-report failure; Voyager/Sakana reviewer] → MURE adjudicator/oracle are off-loop by design; GAP: no sequencing lock preventing helmsman from calling critic in the same leaf as executor.
2. **Goodhart fit-audit** [A: Skalse arXiv:2310.09144; DORA-2025 dropped tiers for gaming] → THE residual doctrine gap: `fit(J,A)` is self-reported at SELECT; grader sees truth only post-exec. Sample claimed-vs-verdict drift. (job added — highest leverage, protects all axes.)
3. **Build-Measure-Learn + Brier** [A: Ries; calibration log exists but empty] → add `hypothesis` to jobs + Brier(prediction,verdict) → resolved rows to probability-calibration-log.md. (job added.)
4. **Improvement Kata — name the obstacle** [A: Toyota/Rother, NIST] → recommend() should emit a target-condition+experiment per under-served axis, not just the axis. (job added.)
5. **Typed role-pair handoffs** [L: MetaGPT 100% vs ChatDev waterfall; arXiv:2308.00352] → validate inter-role handoffs at the seam, not just outer convergence. (job added.)
6. **Blameless 5-Whys postmortem** [A: Google SRE, DORA-2024] → systemic root-cause block on cycle failure → seed a fix job. (job added.)
7. **Capability-bounded goal proposal (Voyager curriculum)** [A: arXiv:2305.16291] → wire prediction-ledger completed/failed goals INTO goal-engine PROPOSE (currently params, unpopulated).
8. **Substrate health / paved-road signal** [A: Spotify Golden Path; DORA] → per-substrate 5-cycle success rate on the dashboard so the company avoids a degraded lane. (job added.)
9. **Reflection on importance-threshold, not every turn** [A: Generative Agents arXiv:2304.03442] → archivist synthesis fires on accumulated importance. (job added.)
10. **Self-improvement gated + sandboxed, not live-patch** [A: DGM arXiv:2505.22954; governance.mjs gate-self-mod veto L] → evolver sandbox+benchmark before the owner arm-gate. (job added, owner-sourced.)
11. **Ideas-over-compute / sustainable pace (takt)** [L: opus-fleet model; DORA-2025 high-impact = reduce toil] → the usage-governor + a self-governed max-jobs/cycle + min-rest (vs owner-installed cron).

## B. Level-B recursion hardening — DESIGN (implement DISARMED; arming stays owner-gated)

Recursive path: `llm-lane spawn_nano → spawnNano [nano-spawn.mjs:68] → depthCap/fanout [nano-tree.mjs] →
reserveSpawnSlots → admit [cost-reservation-pool] → acquireLease [nano-lease INV-1] → dispatchNano
[nano-dispatch.mjs:46] → externalNanoWork → tick → closeNano (claim→release)`. Arm = `YURI_NANOSWARM_SPAWN=1` +
flag `_SYSTEM/state/nanoswarm-spawn.enabled`. Caps today: depth (heavy 5/light 10), fanout (F0·decay^depth),
node-budget lease, barrier (nano-barrier canFinalize blocks on live descendants).

**The 6 hardening changes (all DISARMED-safe — they only alter behavior inside an already-armed path):**
- **H1 lease heartbeat** (nano-dispatch.mjs): a slow >5min child gets its in-flight lease reaped (TTL=5min) → false orphan CRITICAL. Add `setInterval(renewLease, TTL/3)` during the blocking `tick()` await; `clearInterval` in finally. Parent holds the lease (INV-1) so parent renews. Needs `parentPath` passed into childCtx. (`renewLease` exists nano-lease.mjs:152.)
- **H2 failed-child lease release** (nano-dispatch.mjs): `closeNano` only runs on ok===true → a failed child's lease leaks "in-flight". On fail/timeout, `releaseLease(inflightLeaseId, parentNanoId)` + `recordVoid(...,'dispatch-failed')`.
- **H3 wall-clock tree kill-switch** (nano-tree.mjs + nano-spawn.mjs): no total-tree timeout (64 serial nodes ×3min = 3.2h). Add `treeTimeoutMs` (default 30min) to initTree meta.json; in spawnNano check `Date.now()-createdAt > treeTimeoutMs → reason:'tree-timeout'`. Override via YURI_NANO_TREE_TIMEOUT_MS. Zero new state.
- **H4 INC-5 bash guard** (.claude/hooks/bash-security-guard.js): the deferred `isBlockedUngovernedNanoSpawn` deny was never wired into `isBlockedInner` (~line 234) — a lane setting YURI_NANO_CLI_FIRE=1 in its own bash bypasses the cooperative refuse. Apply `inc5-bash-guard-deny.patch.md` exactly. (file clean in git.)
- **H5 root-tree seeding** (nano-dispatch.mjs): top-level spawn_nano refuses (nanoCtxFromEnv→null) — correct, but no auto-seed. Add `seedRootTree(runId,opts)` = initTree + acquire root lease + return `{YURI_NANO_ROOT_RUN_ID,YURI_NANO_PATH:'r',YURI_NANO_DEPTH:'0'}`. DISARMED-safe compositor; owner sets the env at arm-time.
- **H6 budget-lease tolerance** (nano-tree.mjs): `reserveSpawnSlots maxWaitMs 5000→15000` (config `budgetLeaseMaxWaitMs`) to avoid spurious sibling rejection under concurrent async dispatch.

**Test plan:** RED — heartbeat fires before TTL on a slow child; failed-child lease not left alive; tree-timeout
refuses; INC-5 blocks ungoverned bash fire; budget sibling succeeds. GREEN (keep) — DISARMED degrade, depth/fanout/
budget caps, INV-1 atomic, barrier blocks on live descendants, EOT claim-before-release.

**Stays OWNER-GATED (the deep-arm):** YURI_NANOSWARM_SPAWN=1 + flag; seedRootTree at session start; INC-6
llm-lane wire patch; YURI_SWARM_CONVERGENCE=1; YURI_COST_ADMISSION_ENFORCE=1 + cap. The hardening makes arming
SAFE; it does not arm.

**Unverified (flag):** nano-eot.mjs closeNano body not read line-by-line; kagami-swarm-supervisor renewLease
interaction with H1 heartbeat; runSwarm's flat glmFleet fan-out is a SEPARATE substrate (hardening applies only
to the spawn_nano recursive path).

## Sources
Local: NS2 nano-swarm failure (feedback-nano-swarm-orchestration), MURE BUILD-DOCTRINE.md, governance.mjs
gate-self-mod veto, SWARM_ARCHITECTURE_AUDIT_2026.md, sakana-blueprint-2026-06-22/.
Online-advisory (≥2 primary/claim): MetaGPT arXiv:2308.00352, Voyager arXiv:2305.16291, DGM arXiv:2505.22954,
Generative Agents arXiv:2304.03442, Skalse arXiv:2310.09144, Google DORA 2024/2025, Toyota Kata (Rother/NIST).
