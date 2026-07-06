# OPERATION: Claim-to-Wiring Closure — Firing-Order Plan & Blueprint — 2026-06-13

**Upstream:** `_SYSTEM/reports/claim-wiring-audit-2026-06-13.md` (the ~34-item open-ends ledger this plan operationalizes).
**Purpose:** recon + execution blueprint for wiring YURI's unwired/half-wired mechanisms so every capability claim holds up. Solves the order-of-operations BEFORE the precision operation launches.
**Status:** recon complete; 4 intel gaps open (§7); no mutations yet.
**HEAD:** `8dffc7ee`. **Branch:** main.

---

## 0. Organizing principle

> **Fix the territory before redrawing the map; build the signal source before the gate that consumes it; arm the enforcer last, once its input is real.**

Two audit items that read "just wire it" have hidden prerequisites that, ignored, produce **dead code that looks wired** — the exact failure this operation exists to kill.

---

## 1. Firing-order backbone (verified from `.claude/settings.json`)

| Phase | Order (sync unless `async`) | Load-bearing facts |
|---|---|---|
| **SessionStart** | 1 `claude-memory-write reindex` → 2 `token-session-init` → 3 `brain-inject` *(→ yuri-nerve digest → openprocess-pool)* → 4 `musubi-ingest`(a) → 5 `startup-offload`(a) → 6 `scout-orch`(a) → 7 `skill-loader --validate`(a) | reindex@1 = **MEMORY.md only**, NOT the FTS5 corpus. brain-inject's digest reads whatever the overnight crons left. |
| **UserPromptSubmit** | `user-prompt-submit.js` | EOT keyword triggers live here (keyword-only; no threshold auto-trigger). |
| **PreToolUse `""`** | 1 `pre-tool-gate`**(async → advisory, CANNOT block)** → 2 `bash-security-guard` → 3 `operator-write-guard` → 4 `tirith-url` → 5 `claude-protocol-guard` → 6 `pre-tool-use` → 7 `musubi-protocol-enforce`*(never blocks)* → 8 `yuri-risk-lite` → 9 **`energy-enforce` (LAST)** | + `Agent`→`agent-spawn-guard`; `Write\|Edit`→`math-register-guard`+`filing-gate`; `Grep\|Glob\|Bash`→`gitnexus` enrich. Real deny power = positions 2-3; rest is soft. |
| **PostToolUse `""`** | all **async**: 1 `post-tool-use` → 2 `scout-orch` → 3 `session-checkpoint` → 4 **`energy-tick`** *(writes ΔU trace)* | + `gitnexus` freshness, `arch-graph-watch`, `filing-ledger`(a). |
| **Stop** | 1 `sentinel-stop`(a) → 2 `memory-session-write`(a) → 3 `token-status` → 4 **`yuri-dream` ENQUEUE** → 5 `session-reflect` | dream only enqueues; nothing drains. |

**Two timing laws:**
- **One-tool lag:** `energy-tick` (PostToolUse, tool N) writes the trace `energy-enforce` (PreToolUse, tool N+1) reads. The energy gate always judges the *previous* transition — a **trailing verdict**, never pre-hoc. Any gate acting on the *current* proposal (discovery-gate) is a different timing class and cannot live in the energy path.
- **Cross-session ring:** `Stop[enqueue]` → `overnight[drain→consolidate]` → `SessionStart[reindex→digest]`. Order around the ring sets freshness lag.

---

## 2. Dependency graph & sequencing laws

```
WAVE 0  truth-restore ──┐ (#2 is a HIDDEN prereq for any hook that calls `ai`)
   #2 PATH shadow ───────┼─→ reindex/route hooks depend on this
   P3 doc/header fixes ──┘
WAVE 1  routing (independent):  #1 code-local   #6 commands   #7 /research
WAVE 2  autonomic (independent): #9 crons→LaunchAgent ;  corpus reindex link
WAVE 3  claim/energy CORE (HARD-SEQUENCED):
   3a ζ key ∥ 3d discovery→agent-spawn ∥ [3b prose-claim source ─MUST PRECEDE─▶ 3c gateClaimTransition] ─▶ 3e ARM energy-enforce
WAVE 4  self-model regen (TERMINAL): RUN existing autoregen pipeline (guard→autowire→add-only merge into B) → purge dead nodes from A → clear stale labels → fix test-pulse-cortex.sh   [keep A/B split — NO glob-union]
```

**Hard laws (violate → ship dead code):**
1. **#4 `gateClaimTransition` cannot be wired now.** Its own header [`claim-cortex.mjs:868-883`](../Scripts/claim-cortex.mjs#L868): *"dead code until the v2 prose-claim source lands — wire it IN THE SAME CHANGE as that source, with separate try scopes (ledger evolution must never be reverted by a gate fault)."* The v1 proxy ledger can't produce a worsening single-tick transition, so the veto never trips. **Prereq: build 3b first.**
2. **Regenerate the graph LAST.** `circuitry-auto-register` rebuilds from live code; running it mid-operation re-encodes broken wiring as truth.
3. **Arm `energy-enforce` last.** Arming the breaker while the claim ledger is a v1 proxy = blocking tools on a proxy epistemic signal. Only meaningful after 3b/3c make the signal real.

---

## 3. Firing-order counterfactuals (scored EV × reversibility × blast-radius)

### ① discovery-precision-gate — WHERE it links
Takes a **lane claim with declared scope** (`allowed`/`denied` + targets), blast-radius via yuri-navigate. [`discovery-precision-gate.mjs:29`](../Scripts/discovery-precision-gate.mjs#L29): *no scope ⇒ unrestricted.*
- **V-A global PreToolUse:** raw tool inputs carry no scope → always unrestricted → **NO-OP** + latency. ❌
- **V-B `agent-spawn-guard` (matcher:Agent):** agents declare an envelope → gate WorkSubstrate before spawn. Right granularity, low frequency. ✅ **WINNER** (needs scope passed in).
- **V-C `ai auto` lane-dispatch:** gates ai-routed lanes; misses native Agent spawns. Partial — pair with V-B.
- **Verdict:** never a per-tool gate; it's a **lane-dispatch gate**.

### ② energy-enforce position
- **Keep LAST (current):** cheap deterministic guards fail-fast first; expensive energy read only if nothing denied. ✅ already optimal.
- **Move FIRST:** every tool pays energy-compute; fail-open layer ahead of hard layer inverts defense-in-depth. ❌
- **Verdict:** fix #3 via arming decision, NOT reorder.

### ③ claim-integrity-gate timing — THE KEYSTONE
- **Stop-only (current):** catches at closeout; bad claim already shipped in-session.
- **PreToolUse Write\|Edit:** lints before write → high false-positive, blocks legit writes. ❌
- **PostToolUse async (advisory):** scan written content for over-claim vocab, **author result into the claim ledger**. ✅
- **KEYSTONE:** the PostToolUse variant **IS the "v2 prose-claim source"** #4 is blocked on. Wire it to author prose-claims → in the same change `gateClaimTransition` gets live input → that makes arming `energy-enforce` meaningful. **#4 + claim-integrity-timing + #3 collapse into ONE build.** Highest leverage in the operation.

### ④ corpus reindex link
- SessionStart sync (boot latency) / SessionStart async (cheap, lags) / PostToolUse debounced (realtime, per-write cost) / **Stop + SessionStart-async catch-up** ✅ WINNER — fresh next session, zero in-session cost, pairs with `memory-session-write` at Stop.

### ⑤ autonomic loop order
- Drain via **LaunchAgent nightly** (proven 17-agent fleet pattern) beats session-bound cron (died 2026-06-11). Add **SessionStart async catch-up drain** (capped) as safety net.
- **Ring order load-bearing:** nightly = `drain → consolidate` (reverse → last session's dreams miss a cycle); SessionStart = `reindex → digest` (digest reads reindexed state). Current SessionStart order already respects this.

---

## 4. Landmines the intel exposed (NOT in the audit)

- **ζ fix necessary, not sufficient.** [`energy-tick-core.mjs:370-378`](../Scripts/energy-tick-core.mjs#L370): adding `staleness.halfLifeDays` lights ζ in U-level/trace but stays **ΔU-neutral for shared records** ("ΔU moves only when the CAP slice drops an old record"). Real fix = key **+** confirm the cap-slice eviction exercises it.
- **Spread-order hazard for 3b.** stateBefore/After = `{...gateState(s), ...clean(cgf)}`; it's load-bearing that claim-ledger **omits** the `evidence` key (else claim-evidence clobbers ζ-hydrated evidence). The v2 claim source MUST preserve the omission or reorder the spread.
- **Dead eval path already present.** `energy-tick-core` "ONE BOOK" comment: the claim-blind second `verdictFromStates` evaluation is dead — fold into Wave 3 cleanup.

---

## 5. Staged operation

| Wave | Items | Parallelism | Risk |
|---|---|---|---|
| **0 truth-restore** | #2 PATH shadow, P3 doc/header fixes | parallel | zero (reversible). #2 unblocks all `ai`-calling hooks. |
| **1 routing** | #1 code-local, #6 commands, #7 /research | parallel | low (isolated to ai/command/skill surface) |
| **2 autonomic** | #9 crons→LaunchAgent, reindex→Stop+catch-up | parallel | low (respect ring order) |
| **3 claim/energy core** | 3a ζ ∥ 3d discovery→agent-spawn ∥ [3b→3c] → 3e arm | **sequenced** | HIGH (the precision op; firing order make-or-break) |
| **4 self-model regen** | RUN existing autoregen pipeline (guard→autowire→add-only merge into B); PURGE dead nodes from A (retired pulse); clear UNWIRED labels; fix `test-pulse-cortex.sh` | terminal | med (do last; **NO glob-union — already rejected**) |

---

## 6. Decisions — LOCKED (Marcel 2026-06-13)

- **#3 energy-enforce = SHIPPED GUARANTEE.** Arm to committed-on (`YURI_ENERGY_ENFORCE=1` in settings.json env). Split timeline: the **protected-path veto** is independent + trustworthy → ships as the live guarantee; the **claim-transition/identity veto** lands with **3b** (it's not even in the breaker's tick path today). Arm at **3e (last)** so it can't deny tools mid-operation. *One concern (stated, proceeding):* energy-enforce is a **layer-2 fail-open conscience** — the actual hard protected-path guarantee already lives in the deterministic PreToolUse hooks + settings deny-list. Arming makes its blocking real (defense-in-depth); the verification target for a *true* guarantee is the deterministic layer, so don't let arming the soft layer create false confidence.
- **Discovery-gate & ALL agent work = governed at the llm-compat lane, nowhere else.** Native Agent-tool spawns are NOT the YURI agent path. Wire `discoveryPrecisionGate` at **llm-compat lane-dispatch**, scope sourced from the lane contract. **Sub-build:** the contract carries NO structured per-lane scope today (only prose mentions) — add an `{allowed,denied}` envelope per lane, then call the gate at dispatch. This also elevates **#1 (code-local lane broken)** from "coding convenience" to **a hole in the governed agent path** → promote #1 priority.
- **Graph = the merge mechanism already exists; do NOT glob-union.** The naive union (104-node glob) was already REJECTED. A(240 viz-topology) and B(118 wiring-provenance) are **two views by design**. Wave 4 = (a) RUN the existing owner-gated autoregen pipeline (`regenerative-nexus-guard` class-G → `nexus-guard-autowire` → add-only merge into B) to add legitimately-missing real modules; (b) PURGE dead nodes (retired pulse ×29, pulse-codex ×3) from A; (c) clear stale UNWIRED labels. Keep the split; make `circuitry-auto-register`/`nexus-guard-autowire` the single generator so it can't re-fork.

**Still open (not yet decided):** formula-foundry governance — wire into a live path, or restate the SKILL as CLI-only tool?

## 7. Intel gaps — CLOSED (recon 2026-06-13)

1. **Sync-hook short-circuit — NON-CRITICAL.** Claude Code runs all matching hooks and aggregates decisions (any `deny` blocks); no inter-hook short-circuit. *Doesn't affect this plan* — counterfactual ② keeps `energy-enforce` last and reorders nothing, so order only governs latency/messaging here. (Harness-level; confirm via claude-code-guide only if a future wave reorders gates.)
2. **`agent-spawn-guard` scope plumbing — RESOLVED, REVERSES ①.** [agent-spawn-guard.js](../../.claude/hooks/agent-spawn-guard.js) is **observability-only** (logs, always exits 0; policy reversed 2026-05-30). Agent `tool_input` = `{subagent_type, model, description}` — **no scope object, anywhere.** Native Agent spawns carry no declared file-scope. ⇒ ①V-B (agent-spawn link) is **blocked** — nothing to feed the gate. See revised ① below.
3. **v2 prose-claim schema — RESOLVED → 3b contract.** `gateClaimTransition`/`cortexSnapshot` consume claims shaped `{ id (STABLE, required), claimedStatus (ladder rung ∈ PROMOTION_STATES: …operator_validated, trusted; `deprecated`=sink), contentHash (opt-in, hash of STATEMENT text only), evidence: [{kind, capturedAt}] }`. Over-claim = claimed rung exceeds the rung the evidence justifies → `inversions>0`; severe = `verdict===RETRACT`. **Hard sub-problem:** an inverting RETRACT with **no stable id fails CLOSED (veto)** ([claim-cortex.mjs:926](../Scripts/claim-cortex.mjs#L926)) — so 3b MUST assign stable claim identity across turns (contentHash is the natural identity key), or it veto-storms. 3b is a **build (stable-claim-identity + rung mapping), not a wire.**
4. **dual-graph diff — RESOLVED, REFRAMES WAVE 4.** B(118) ⊂ A(240): **0 ids unique to B, 122 unique to A, 118 shared.** But **disjoint schemas** — A=`{id,tiers,flow,mechanism,label}` (topology/viz), B=`{id,label,layer,files,triggeredBy,description}` (provenance/wiring). Nav tools read B *because A lacks `files`/`triggeredBy` entirely.* ⇒ the "merge" is a **schema union + populating provenance for 122 nodes**, not a dedup. Cleanest fix: make `circuitry-auto-register` emit ONE unified-schema graph (topology + provenance) so the split can't reopen.

## 8. Post-recon plan deltas

- **① discovery-precision-gate — revised winner.** V-B blocked (no scope at agent-spawn). Only live scope source today is **V-C: `ai auto` lane-dispatch** (the lane contract can declare per-lane `allowed`/`denied`). BUT native Agent-tool work (the majority surface) routes around `ai` and stays ungated. **New intent call:** accept ai-dispatch-only coverage (small, cheap) **or** build a scope-declaration convention (agent prompts carry a parsed `SCOPE:` block) to gate native spawns (bigger). Until one lands, discovery-precision-gate stays a documented design-only organ.
- **3b is the true critical path of the whole operation** — stable prose-claim identity is the hard kernel; #4, claim-integrity-timing, and #3-arming all hang off it. Budget it as a multi-day build, not a wave-3 wire.
- **Dead vs armed, precisely:** through the tick path `gateProposal` gets `maxLadderInversionCap=1` → the L∞ **level-floor** is armed (refuses after-state inversion >1). What's dead is `gateClaimTransition`'s **identity-veto** (per-claim new-or-deeper + content-swap) — never called from the tick path. Level-floor live; identity-veto dormant.

---

## 9. DEEP-SIM — Wave 3 governance substrate (Izanagi record, 2026-06-13)

**Decision simmed:** how to build/wire the hard kernel — 3b (prose-claim source + stable identity) → 3c (`gateClaimTransition`) → 3e (arm energy-enforce), now coupled with **formula-foundry live wiring** (Core-A typing gate + Core-B `math-proof-gate` promotion + the never-written bakeoff ledger).

**Grounding:** `claim-integrity-gate` = vocab linter over files (`v0` report), NOT a structured-claim extractor. `math-proof-gate` = shipped Core-B oracle, unwired to a live trigger. `math-register-guard` already fires PreToolUse on `Write|Edit` to math files (the natural foundry trigger). `energy-tick` already reads the claim ledger via `claimGateFields` (verdict-consumption path exists; authoring + identity + `gateClaimTransition` are what's missing).

### Three divergent branches

| | **B1 — inline pre-hoc blocking** | **B2 — post-hoc trailing ledger** | **B3 — explicit-emit + anchored identity** |
|---|---|---|---|
| Claim firing | sync PreToolUse on Write\|Edit; block over-claim writes | async PostToolUse; author claims into ledger; energy-enforce catches catastrophic on next tool (1-tool lag) | model emits structured claims anchored to target+type; gate the claim, not the tool |
| Identity | contentHash (statement hash) | ledger-keyed + similarity match | **anchor-bound (target+type)** — stable by construction |
| Foundry | composeCheck sync in math-register-guard; proof-gate sync | composeCheck + proof-gate async → bakeoff ledger | cards already ARE anchored claims → nearly free |
| EV | moderate (real prevention) | high (completes existing arch, writes the dead ledger, gets teeth from armed enforce) | high (solves identity at root, cross-system coherence) |
| Reversibility | **LOW** (lives in blocking path) | **HIGH** (advisory→arm) | MEDIUM (additive convention) |
| Blast-radius | **HIGH** (blocks operator writes; veto-storms on paraphrase) | LOW-MED (trailing, non-blocking authoring) | LOW (additive) |
| Verdict | ❌ looks strongest, most dangerous | ✅ spine | ✅ identity model |

### Synthesis (committed path)
**B2 spine + B3 identity.** Post-hoc async authoring (B2 firing — matches the existing trailing energy architecture, completes the never-fired bakeoff ledger, reversible) **with anchor-bound identity (B3)** to kill the veto-storm root cause that B2's similarity-matching would suffer. Explicit-emit (full B3) is a later enhancement once the trailing version soaks clean.

### The unification (highest-leverage finding)
Claim-governance and formula-governance are **isomorphic substrates**: `anchored structured object → validity gate → promotion oracle → append-only ledger`. Claim = `{anchor, asserted-rung, evidence}` via `gateClaimTransition` + evidence-rung. Card = `{anchor, asserted-dimension, worked-example}` via `composeCheck` + `math-proof-gate`. **Build ONE governance substrate parameterized by payload, not two.** *Caveat (stay honest):* the substrate/pattern is shared; the **enforcement target differs** — claims feed energy-enforce (tool-blocking); formulas feed promotion/demotion (not tool-blocking). Unify the substrate, not the enforcement.

### Risks the sim surfaced (why we sim before firing)
1. **Veto-storm (dominant):** any churning identity (contentHash on paraphrase, fuzzy mis-split) → every rephrase reads as new RETRACT → fail-closed → blocks everything. **Anchor-bound identity is the mitigation; solve identity BEFORE arming.**
2. **Spread-order landmine:** if the claim source carries an `evidence` key it clobbers ζ-hydration in the tick. B2 contains it (authoring ≠ tick-eval); B1 puts it in the hot path.
3. **Arming on a churning signal:** reinforces the sequencing law — arm energy-enforce ONLY after the anchored ledger soaks clean in advisory mode. "Arm last" = arm last *and* after a soak.
4. **Foundry promotion latency:** `math-proof-gate` worked-example is slow → async bakeoff ledger, never sync-in-gate.

### Firing order — verdict for the unified substrate
`extract+type (PostToolUse async) → promote (async oracle) → append ledger → energy-tick reads ledger → trace → [next tool] → energy-enforce trailing (armed LAST, post-soak)`. The one-tool lag is a **feature** (lets the ledger settle before the breaker reads it), not a bug — it's the existing architecture, completed.

### 9.1 Quantitative sweep (256 configs × 20k weightings = 5.12M evals, 2026-06-13)
Sim: `/tmp/wave3-scenario-sim.mjs` (weight-simplex Monte-Carlo; robust = top-1 freq across all weightings).
- **Izanagi hand-pick returned #1 of 256** — `async-trailing | anchor-bound | long-soak | unified | async-bakeoff` (top1=45.7%, top5=90%). Hand-reasoning validated, not an artifact.
- **194/256 configs (76%) dominated** — never top-5 under any weighting. Effective decision = 2 near-tied configs.
- **High-leverage axes (get these right, rest is noise):** `firing` (sensitivity spread 0.184; async-trailing≫sync-block) and `identity` (0.146; anchor-bound≫contentHash). `arm`/`foundry`/`promote` are low-spread.
- **Near-tie:** promotion `async-bakeoff` (45.7%) vs `sync-gate` (44.5%) — pick `async-bakeoff` (writes the dead ledger, no sync latency); the sweep says nothing is lost.
- **LOCKED design:** firing=**async-trailing**, identity=**anchor-bound**, foundry=**unified**, promote=**async-bakeoff**, arm=**long-soak**.
- **Model limits (honest):** sweep scores MEAN-case fitness → under-weights tail risk, so `arm=long-soak`'s value exceeds its 0.062 spread (trust the arm-after-soak law over the number). Factor tables are estimates (auditable in the sim); weight-sweep handles weight-uncertainty, not factor error. **Next precision tier:** ground factor tables in measured data (e.g. real contentHash veto-storm rate on paraphrased-claim corpus) or a faithful scenario→state encoding scored through `computeU` — a genuine build, not free.

### 9.2 Intense round — sim v2 (uncertainty + catastrophe + regimes; `/tmp/wave3-scenario-sim-v2.mjs`, 2026-06-13)
Upgrades: per-factor uncertainty (Gaussian σ), explicit catastrophe model (veto-storm/false-block/spread-corruption, grounded in fail-closed mechanics), risk-aversion (λ) sweep, hostile weight regimes. 4 regimes × 12k trials.
- **REGIME-ROBUST:** the `async-trailing · anchor-bound · long-soak · unified` family wins or runner-up in ALL of uniform / safety-dominant / speed-dominant / cost-dominant. Not a weight artifact.
- **TAIL-RISK MAP (the new finding):** locked design **P(catastrophe)=0.1%** vs worst (`sync-block · contentHash · immediate`) **87.5%** — an **875× spread**. The catastrophe driver is the firing×identity×arm interaction. This is the *safety* argument (not just fitness) for anchor-bound + soak; the "looks-strongest" B1-inline branch is the near-certain self-deny.
- **HONEST PRECISION:** with uncertainty propagated, winner top-1 ≈ 11% (not 46%) → the answer is "top of a statistically-tied cluster," direction robust, exact-#1 within noise. Promote axis flips ±1% on regime = confirmed coin-flip.
- **ANCHOR SCHEME RESOLVED:** `target+claim-type` wins uniform/veto-immunity/coverage; `node-id` only under coherence-priority; `file:symbol` only under cost-priority. **Decision: anchor = `target+claim-type`, hybrid — use the circuitry-node-id as the target identifier when the target maps to a graph node** (captures node-id's coherence without losing coverage).

### LOCKED Wave-3 design (post sim v2)
`firing=async-trailing · identity=anchor-bound(target+claim-type, node-id when mappable) · arm=long-soak · foundry=unified · promote=async-bakeoff`. Regime-robust, 0.1% catastrophe, direction-stable under uncertainty.

## 10. Task backlog
- **[TASK] Refine the scenario simulator → measurement-grounded + standing instrument.** Today it's estimate-based (σ-banded guesses, auditable). Upgrade path: (1) ground factor tables + catastrophe probabilities in MEASURED data — real veto-storm rate on a paraphrased-claim corpus, real build-cost from comparable past builds, real false-block rate; (2) faithful scenario→state encoding scored through the real `computeU`/energy substrate (turns precise-estimation into precise-measurement); (3) graduate `/tmp/wave3-scenario-sim-v2.mjs` to `_SYSTEM/Scripts/` as a reusable decision-sim instrument any architecture choice runs through. Owner wants this as a durable capability ("calculable simulations at high mass/frequency/precision"). Status: queued.
- **[OPEN] formula-foundry** — decision locked (wire live, via the unified substrate); build sequenced in Wave 3.

## 11. Hardening + research + scaled-search synthesis (2 fleets + v4/v5, 2026-06-13)

**Two fleets, triple convergence.** 5 Opus lanes (local param-grounding) + 5 Sonnet lanes (online SOTA) converged independently on: gate-then-score (not smooth λ), correlated factors, family/regret metric, and the partition-adversary problem. The Sonnet adversarial-causal lane prescribed Stackelberg/CFR game-theory for exactly the adaptive partition attacker the Opus adversarial lane found in code.

**The "NULL wins 44%" fragility was a parameter artifact, now disproven.** Opus isolation proof: `NULL.safety=0.97` is incoherent (safest possible build = 0.85); flipping it alone collapsed NULL-win 6.8%→0.1%. Compounded by the `buildId` P0 inversion (charged the winner for its rejected alternative's cost) + the ungrounded λ lever. After hardening (v4), the locked build beats NULL **100%** across the entire (P_emit × κ) grid.

**v4 (gate-then-score, hardened params):** locked family wins 52% (vs noisy 11% in v2); regret-lowest = locked design. Under heavy partition-risk, `hybrid`/node-canonical identity edges pure anchor-bound — pointing at the fix below.

**v5 (scaled, ceiling lifted):** expanded to 5 discrete × 5 **continuous** vars (effectively infinite); cross-entropy optimizer (PROTES/CMA-ES analog) + CVaR robust scoring found the optimum WITHOUT enumeration. Converged 100%: `async-trailing · anchor+node-canonical · unified · target-keyed-aggGate`, continuous `soak≈30d · aggK≈3 · cap≈1` (rediscovered the live cap=1). Sims: `/tmp/wave3-sim-v4.mjs`, `/tmp/wave3-sim-v5-scaled.mjs`.

**Cross-anchor aggregate gate — BUILT + VERIFIED** (`/tmp/cross-anchor-aggregate-gate.mjs`): the partition attack (N× deltaRank-1 on one target, different claim-types) passes the live per-id veto + L∞ cap=1 but the target-keyed aggregate gate (sum sub-threshold inversion per TARGET, veto at K>2-3) catches it — without false-vetoing honest 2× parallel work or legitimately-spread claims. Extends `delta-gate-severity-laundering`: partition is the same disease one level up; the per-claim L∞ that closed the swap is itself partition-fungible across anchors.

### LOCKED Wave-3 design (post-hardening, FINAL)
`firing=async-trailing · identity=anchor+node-canonical (target+claim-type, node-id when mappable) · arm=long-soak(~30d) · foundry=unified · promote=async-bakeoff≈sync-gate(coin-flip) · aggGate=target-keyed K≈3 · L∞ cap=1`. Robust across all regimes, parameter-error, and the lifted-ceiling scaled search.

### Research adoption ladder (full report: workflow ww4p9vh7q output; sources cited there)
- **Tier 1 — JS-now, free:** minimax-regret (done in v4), multiverse/specification analysis, BMA rank-distributions, QMC/Sobol-sequences (O(1/N)), PGD-style worst-case-parameter witness ("NULL beats build only when P_cat>X AND coverage<Y"), Info-Gap robustness horizon.
- **Tier 2 — Python mature (measurement-grade):** SALib (Sobol/Morris/**RBD-FAST on existing MC for free**/**PAWN** for tail/P_cat/**Shapley effects** — correct for the correlated Dirichlet weights where Sobol misleads); Rhodium/EMA-Workbench (**PRIM scenario-discovery** = the human-readable "when does build lose to NULL" rule — highest value/cost); DoWhy (causal DAG, fixes the independence assumption); **CVaR via DecisionProgramming.jl** = principled replacement for the hand-tuned λ; EVPPI ("is grounding P_cat worth it?").
- **Tier 3 — frontier/scaling:** PROTES tensor-train (2^100 configs), QUBO+D-Wave/Fujitsu/CIM + QAOA (no advantage at our scale per the lane — upgrade-path + adversarial-search framing), Stackelberg/CFR/robust-MDP for the adaptive smuggling adversary.

## 12. Task backlog (updated)
- **[TASK] Live-wire the cross-anchor aggregate gate** into `claim-cortex.mjs` (cortexSnapshot: `aggregateInversionByTarget`, third non-offsettable veto at K∈[2,4], target-keyed, composed in cortex layer — energy core untouched). Prototype verified; sequence into Wave-3 substrate build (same change as gateClaimTransition wiring). Owner-gated.
- **[DONE 2026-06-13] Graduated the scenario-simulator** → `_SYSTEM/Scripts/decision-sim.mjs` (reusable engine) + `decision-sim.test.mjs` (7/7 green) + `wave3-decision.mjs` (the Wave-3 problem as a validation instance). Tier-1 methods native: cross-entropy/CVaR optimizer, minimax-regret, **PGD worst-case witness** (flip-rule), **Info-Gap robustness horizon**, multiverse/spec-curve, QMC Halton, seeded-reproducible PRNG. **Validation:** reproduces the LOCKED answer at 99.6–99.9% optimizer confidence (async-trailing · anchor+node · unified · target-keyed · soak≈30d · aggK≈3.2 · cap≈1.0; promote=sync-gate, the documented sync-gate≈async-bakeoff tie); PGD witness shows worst-case margin over NULL = **+0.334 (NO flip region in the scalar box)**; Info-Gap survives the FULL α≤1 horizon. The decision is MORE robust than the /tmp sims showed. **Tier-2 (SALib Sobol/Shapley/PAWN, Rhodium PRIM) DEFERRED — requires `pip install`, OWNER-GATED; not installed.** Residual unchanged: factor tables are hardened estimates; only the live 3b advisory hook retires factor error.
- **[TASK] Ground the catastrophe parameters** (the one residual unknown both fleets flagged): run the claim-extractor in ADVISORY mode over real sessions to MEASURE P_emit + the contentHash-vs-anchor veto-storm rate + false-block rate. Converts precise-estimation → precise-measurement.
- **[OPEN] formula-foundry** — wire live via the unified substrate (Wave 3).

## 13. EXECUTION — Wave 0 + 3b prose-claim extractor (2026-06-13, decision #2→#1→#3)

**Wave 0 — DONE & verified.**
- **#2 PATH-shadow:** `~/.local/bin/ai` was a dead wrapper `exec`-ing the nonexistent `NUDIMMUD/Scripts/ai`; repointed to the real `_SYSTEM/Scripts/ai` (backup `~/.local/bin/ai.dead-wrapper.bak-20260613`). Verified `bash -c 'ai search …'` (the exact non-interactive hook case) now resolves; all `ai`-calling hooks unblocked.
- **P3 doc/header fixes (verified against live code, not the audit alone):** `xref-query.mjs:13` 83→118-node · `ai` help "~26k"→"~41k docs" (actual 41,529) · `math-register-guard.mjs` header "NOT wired"→WIRED (it IS, settings.json:233) · `constitution.md` `.js`→`.mjs` · MEMORY.md L∞ index line marked RESOLVED. (Working tree was already chronically dirty — xref-query carried pre-existing uncommitted work; my edit is the isolated node-count line.)

**#1 — 3b prose-claim extractor (the Wave-3 keystone) — BUILT, RED-TEAMED, HARDENED, verified.**
- Files: `_SYSTEM/Scripts/prose-claim-extractor.mjs` (core + CLI), `.test.mjs` (14 tests, all green), `.claude/hooks/prose-claim-extract.mjs` (owner-gated PostToolUse hook, advisory/fail-open, NOT auto-wired). Shadow store: `_SYSTEM/state/claim-extractor/`.
- Does: prose → structured claims `{id(anchor-bound), claimedStatus(ladder rung), contentHash, evidence[]}` shaped exactly for `cortexSnapshot`/`gateClaimTransition`. ADVISORY: authors a SHADOW ledger + metrics, NEVER feeds energy-enforce, NEVER blocks. CLI: `reset|extract|measure|gate-shadow`.
- **Grounding measurements (the point — converts sim estimates → measured):**
  - **veto-storm/churn ≈ 3.5%** under a run where *every statement's text changed* (vs ~100% for a contentHash identity) — the empirical proof the LOCKED anchor-bound identity choice avoids the dominant Wave-3 risk.
  - **untrackedRetract = 0** (anchor identity stable by construction — no id-less fail-closed veto fuel).
  - **P_emit over historical memory ≈ 0.70 is an UPPER-BOUND ARTIFACT**, not the real rate: memory entries are summaries whose evidence lives in commits, not restated inline. Real P_emit needs the live hook on FRESH session writes (claim + evidence co-located). This is *why* the hook is the correct instrument, not batch-over-history.

**Aggressive red-team (self-pass + 7-lane sonnet-pinned fan-out, every finding empirically verified against the live tool): 50/55 attacks confirmed → 6 root-cause clusters, ALL closed + re-verified (15/15 exact-string re-attacks pass):**
- **A · modality blindness** (biggest veto-storm source): future/conditional/subjunctive/question/obligation/reported-speech parsed as present assertions → added a sentence-level MODALITY guard that neutralizes them.
- **B · target garbage**: function-words/anaphors/post-verb objects became anchors (`if:`,`says:`,`we:`,`call:`,`above:`) → big HARD_STOP set + drop-on-junk (return null, never anchor garbage) + pre-verb-bounded scan + compound-noun keep (`energy gate`→`energy-gate`).
- **C · evidence forgery** (enforcement bypass): prose-asserted evidence ("12/12 pass", nonexistent `.test.mjs`, "Marcel confirmed", bare "PASS") flipped RETRACT→ASSERT → detectEvidence now RESOLVES file refs against the real filesystem; unresolvable refs dropped; unverifiable prose capped at advisory rank. Forgery now requires actually creating a passing test file.
- **D/E · identity/aggregate splitting**: `foo-bar`≠`foo_bar`≠`foo bar`; RETRACTs invisible to the aggregate metric → normalizeTarget canonicalizes separators; added `retractsByTarget` for metric visibility (gate logic unchanged — sub-RETRACT sum stays correct).
- **F · unicode**: ZWJ/RTL injection manufactured fake churn → strip invisibles + NFKC before hash/match.
- **G · nowMs footgun**: missing clock poisoned evidence freshness → `extractClaims`/`measureClaims` require a finite nowMs (fail-closed).
- 5 attacks self-rejected by the verify lanes (false alarms). Design verbs ("enforces/blocks") flagging as capability claims = KEPT (defensible — the audit found exactly such unbacked claims).
- **Documented residuals (measurement undercount, NOT enforcement bypass):** synonym/homoglyph evasion (P_emit is a lower bound on evasive corpora) · highest-rung-wins can mask a co-occurring lower honest claim · cross-SENTENCE evidence uncredited · measuring over docs that DISCUSS the vocab self-flags (corpus-selection care) · MEMORY.md index-line handles pollute anchors (meta-file, not a work-product corpus).

**Next:** the extractor's `gateClaimTransition`/aggregate-gate live-wiring + arming energy-enforce stays the LATER Wave-3 step, gated on the advisory hook soaking clean on real sessions (owner arms the PostToolUse hook to start collecting). Then **#3 — sim refinement** (graduate the scenario-simulator + Tier-1 methods).

## 14. RED-TEAM ROUND 2 — findings + FIX PLAN (2026-06-13, DONE — all clusters applied + verified)

Round 2 (6 fresh dimensions, sonnet fan-out `wgf4zmt52`, 48 attacks / **43 confirmed**, output `/private/tmp/.../tasks/wgf4zmt52.output`). Sharper than round 1 — real ASSERT bypasses that partially RE-OPENED the round-1 forgery fix. Source is currently round-1-hardened only (21 tests green); the fixes below are PENDING.

**Fix cluster R2-A — evidence forgery re-opened (HIGH, enforcement-critical), in `prose-claim-extractor.mjs`:**
1. `fileExists`: reject `..` + assert `path.resolve(abs).startsWith(resolve(repoRoot)+sep)` (path-traversal `../../package.json` escaped repo).
2. `detectEvidence` needs the TARGET: a resolved file only credits if it RELATES to the target (shared ≥3-char token of basename vs target). Closes `energy-gate verified per memory-kernel.test.mjs`→ASSERT.
3. operator_note from prose → ALWAYS advisory (never upgrade off a resolved file). runtime_trace ("12/12 pass") upgrades ONLY if a RELATED `.test.mjs` resolved — a passive report/script never bridges. Closes the `hasResolvedFile` cross-kind bridge (report→runtime_trace→ASSERT; .mjs→operator_note→ASSERT).
4. (with operator_note→advisory, the cross-kind recurrence forgery F5 also closes — hasOperator can't be satisfied from prose.)

**Fix cluster R2-B — modality over/under-fire (HIGH veto-storm):** scope `isModal(statement, verbIndex)` — question patterns GLOBAL, future/conditional/obligation/reported checked ONLY in pre-verb slice (so "X is production-ready, and will improve" is NOT dropped); reported-speech requires a preceding ≥2-char word (so "Note that X is live" is kept, "Marcel notes that" drops). Move the isModal call INSIDE the verb loop (needs verbIndex).

**Fix cluster R2-C — negation phantoms (HIGH):** leading-negative check (`^\s*(?:nothing|nobody|none|neither|no one|not\b)`) → neutralize; add `about, node, nobody, none, neither` to HARD_STOP (kills `about:`/`nobody:`/`node-claim-cortex:` junk anchors).

**Fix cluster R2-D — hygiene (MED):** `statementHash` collapse `[\s_-]+` before hashing (kills false churn energy gate vs energy_gate); `segmentStatements` split lookahead `[A-Za-z...]` (split lowercase continuations → fixes fused-sentence masking); `mergeLedgers` `>=`→`>` (align tie-break, no reorder churn); `loadGraphNodeIndex` strip parenthetical labels + add separator-stripped key (memorykernel→memory-kernel); add `resetGraphIndex()` export (stale singleton).

**Fix R2-E — decision-sim HONESTY (MED, correct my overclaim):** `wave3-decision.mjs` must report that the **identity sub-choice anchor+node vs anchor-bound is WITHIN NOISE** — margin 0.0017, flips at tailFrac≥0.44 and on a ±5% buildId nudge; pgdWitness/infoGap cover only the 3 SCALAR axes not the 5-D weight simplex (margin is −0.026 at w=[0,0,0,0,1]). The robust dims are firing/foundry/aggGate/soak; identity refinement is a coin-flip the LIVE 3b hook must settle, not the sim. Add the anchor-bound-vs-anchor+node comparison + tailFrac caveat + "scalar-only" qualifier to the printout. Also: LOCKED hardcodes promote=async-bakeoff but CE optimum=sync-gate (documented tie — label it).

**DOCUMENTED residuals (NOT fixing in this pass):** gateClaimTransition content-swap fires on inversions>0 not just RETRACT (claim-cortex.mjs — the Wave-3 wiring step) · RETRACT ledger has no eviction on prose correction (ledger lifecycle = Wave-3) · "Not X but Y" loses the Y claim · mid-sentence conditionals → RETRACT not dropped (acceptable conservative) · nodeId case (LANE_MIMO) cosmetic.

**After fixes:** re-run both suites + expand tests for R2 cases + re-attack the round-2 strings, then update §13/§14 to DONE.

### 14.1 FIXES APPLIED + VERIFIED (2026-06-13)

All five clusters landed in `prose-claim-extractor.mjs` (R2-A..D) and `wave3-decision.mjs` (R2-E), then an independent Codex review (§14.2) re-opened R2-A and R2-E with sharper attacks — both now fixed + locked. Suites: **extractor 25/25** · **decision-sim 7/7** · **wave3-decision 4/4** (= 36; added 11 R2 + 1 Codex-R2A + 4 R2-E sim tests).

- **R2-A (forgery, HIGH) — CLOSED (hardened twice).** `fileExists` rejects any `..` segment + asserts lexical repo containment **+ realpath containment** (a symlink inside the repo pointing out is rejected — codex finding). `detectEvidence` takes the TARGET and a resolved file only credits if it RELATES (`fileRelatesToTarget`). **Codex re-open:** the first relation rule (any ≥3-char shared token) was laundered by a single GENERIC token — `claim-router` shared "claim" with `prose-claim-extractor.test.mjs` → ASSERT. Fixed: a `RELATION_STOP_TOKENS` set (claim/core/gate/test/node/module/service/script/file/system/engine/kernel/handler) is excluded; relation now needs an EXACT canonical match, or ≥2 shared non-generic tokens for a compound target (≥1 for a single-token target). operator_note from prose is ALWAYS advisory; a runtime_trace prose signal upgrades ONLY when a RELATED `.test.mjs` resolved (no `hasResolvedFile` cross-kind bridge). Re-attack: `claim-router`/`claim-auth` + the extractor test → RETRACT; exact/multi-token matches still count (no over-fix).
- **R2-B (modality scope, HIGH) — CLOSED.** MODALITY split into `MODALITY_GLOBAL` (questions, any position) + `MODALITY_PREVERB` (future/conditional/subjunctive/obligation/attribution/definition, checked only in the pre-verb slice); `isModal(statement, verbIndex)` moved INSIDE the verb loop. `REPORTED_SPEECH` now requires a ≥2-char subject before the reporting verb. Verified: "X is production-ready, and will improve" KEPT; "Note that X is live" KEPT; "Marcel notes that X is live" dropped.
- **R2-C (negation phantoms, HIGH) — CLOSED.** Leading-negation check (`^\s*(?:nothing|nobody|none|neither|no one|not)\b`) neutralizes; `about, node, nobody, none, neither` added to HARD_STOP.
- **R2-D (hygiene, MED) — CLOSED.** `statementHash` collapses `[\s_-]+` (no false churn); `segmentStatements` split lookahead now includes lowercase continuations; `mergeLedgers` tie-break `>=`→`>`; `loadGraphNodeIndex` strips parenthetical labels + adds a separator-stripped key; `resetGraphIndex()` exported.
- **R2-E (decision-sim honesty, MED) — CLOSED. My first "correction" was WRONG; the Codex review corrected it back.** `wave3-decision.mjs` prints a `HONESTY` block computed LIVE. Two parts: (1) identity anchor+node-vs-anchor-bound `|ΔrobustScore| ≤ 0.0021` across tailFrac (WITHIN NOISE; flips at tailFrac≈0.5) → coin-flip the live 3b hook settles; promote tie labeled; robust dims named (firing/foundry/aggGate/soak). (2) **the joint-worst error chain:** the original §14 figure "margin −0.026 at w=[0,0,0,0,1]" was correct. My first §14.1 pass "refuted" it with a live random-Dirichlet joint search that returned +0.0318 and I declared it didn't reproduce. **That refutation was the actual error** — the LOCKED-vs-NULL margin is provably AFFINE in the weight simplex (verified: midpoint == average exactly), so its minimum is at a VERTEX, which Dirichlet interior sampling hits with probability ZERO. Codex's deterministic vertex×scalar-corner scan found **−0.0264 at w=[0,0,0,0,1], Pemit=0.05, kappa=0.5, partRate=0.6** — a REAL flip. The honesty block now uses the deterministic corner enumeration and states the flip plainly: LOCKED loses to NULL only at the all-weight-on-build-cheapness / low-smuggle corner — i.e. the substrate dominates NULL exactly when the owner assigns non-trivial weight to prevention/safety, which is the reason to build it. Net surviving truth: pgdWitness/infoGap are scalar-only (uniform w) and MISS this corner; the decision is robust for any reasonable interior weighting but NOT at the degenerate vertex.

**Standing residuals (NOT enforcement bypass):** stopworded subjects ("The system is fully verified") under-count (P_emit lower bound, by-design drop-on-junk); plus the §14 list above (gateClaimTransition content-swap, RETRACT ledger eviction, "Not X but Y", mid-sentence conditionals, nodeId case) — all Wave-3 wiring-step or documented-conservative.

### 14.3 RESIDUAL FIX — leading-prepositional over-drop (2026-06-13, post-Codex)

The "`After much work, …` over-drops" residual is now CLOSED. A bare leading connective (if/once/when/after/…) is no longer treated as modal by itself; `isLeadingSubordinateClause` requires the segment up to the first comma to carry a COPULA/AUX (`is/are/has/…`), a leading status PARTICIPLE (`once built`), or an explicit status-verb phrase — so a prepositional adjunct ("After much work,") keeps the main assertion. Fixing it surfaced a second bug (the quantifier "much" leaked as the anchor target); quantifiers (`much/many/more/most/some/few/several/lot/little/less`) added to HARD_STOP, so the subject now resolves to the real noun ("engine"). Both locked by the `RESID` test (asserts target=`engine` + RETRACT).

## 15. STEP 1 ARMED — live P_emit collector (2026-06-13, owner-authorized)

Owner authorized arming the live collector ("arm step 1"). Did NOT arm blind — ran a 4-lens adversarial **pre-arm safety audit** (ultracode Workflow `wf_8903be23-dea`, sonnet-pinned: fail-open / ReDoS-perf / hook-semantics / settings-wiring). Verdict **ARM-WITH-CHANGES** — 3 lenses SAFE, the perf lens found a real **BLOCKER**:

- **Unbounded ledger growth (fixed before arming).** `measureClaims` is O(ledger) and ran on the full merged ledger every write; with no eviction it would cross ~100k claims in weeks of armed use and silently time out the hook forever. Independently reproduced (50k → 2217ms). **Fix:** `mergeLedgers(prior, fresh, { nowMs, maxClaims })` now keeps a **bounded rolling window** (recency-stamped `_seenMs`, evict oldest); the hook arms with `MAX_LEDGER_CLAIMS = 5000`. Verified: even against a pathological 200k-claim prior + a 4000-claim write, merge+measure = **423ms** (8% of the 5s budget); steady-state ~250ms. Closes the long-standing "RETRACT ledger has no eviction" residual too. Locked by the `PREARM` test (cap holds, fresh claims survive eviction). The CLI/tests are unaffected (no opts → unchanged behavior).

**Armed:** added `prose-claim-extract.mjs` to the `Write|Edit|MultiEdit` PostToolUse block in `.claude/settings.json` (async:true, timeout 5, alongside `filing-ledger.mjs`). settings.json re-validated as JSON. **Live-fire verified**: a real PostToolUse payload flowed end-to-end → 2 claims extracted, both RETRACT, advisory stderr ("not blocking"), **exit 0**, shadow ledger + metrics written. Shadow ledger reset to 0 so the soak starts clean. Suites now **extractor 27 · sim 7 · wave3 4 = 38**, all green.

**Soak in progress.** Every Write/Edit/MultiEdit now feeds `_SYSTEM/state/claim-extractor/` (advisory, fail-open, never blocks, never feeds energy-enforce). NEXT (still owner-gated): let it soak clean on real sessions → review P_emit/veto-storm/partition on fresh co-located claim+evidence → THEN live-wire `gateClaimTransition` + the cross-anchor aggregate gate → arm energy-enforce on the claim channel (the LATER Wave-3 step). To unwind the arm: remove the `prose-claim-extract.mjs` entry from the PostToolUse block.

### 14.2 INDEPENDENT CODEX REVIEW (gpt-5.5 xhigh, via llm-compat, 2026-06-13)

Dispatched through the LLM-compat lane (`ai llm --model gpt-5.5 --reasoning xhigh`, DRAFT/read-only spec per `CODEX_PROTOCOL.md`). Verdict: **BLOCK** — and correct on both counts (every finding re-verified locally before acceptance; refute-by-default applied to Codex too):
- **R2-B / R2-C / R2-D — CONFIRMED clean**, no bypass (Codex re-ran the modality/negation/hygiene vectors).
- **R2-A — re-opened (HIGH):** the one-generic-token relation collision above. Fixed + locked (`CODEX-R2A` test).
- **R2-E — re-opened (MED):** the affine-vertex flip my random search missed. Fixed (deterministic corner scan) + locked (`wave3-decision.test.mjs`, 4 tests incl. an affine-in-w proof and an explicit "interior sampling hides the flip" test).
- Codex made NO file writes (DRAFT honored — verified working tree unchanged except my own edits). Codex's proposed diffs were adapted, not applied verbatim (kept `normalizeTarget` canonicalization + the exact-match shortcut).

**Lesson recorded:** an independent lane caught a math-method error (measure-zero sampling) that I had used to overturn a correct finding. This is the value of the adversarial second opinion — and a reminder that "verified live" is only as good as the verification method.

**Net:** the 3b extractor is round-2-hardened; the keystone is ready for the owner-gated soak (arm the PostToolUse hook → collect live P_emit on fresh session writes). Live-wiring `gateClaimTransition` + aggregate gate + arming energy-enforce remains the LATER Wave-3 step. Still ADVISORY, hook NOT auto-wired, nothing committed.

## 16. WAVE-3 PARTITION GATE — BUILT (DISARMED) + red-team-validated (2026-06-13)

Owner: "continue with wave 3, red-team with Opus lanes, use the quantum/large-eval sims." Done.

**Sims (the large-eval muscle).** `wave3-gate-sim.mjs` (decision-sim engine, 2M+ evals) proved the GAP and the limit of the naive fix: with the L∞ cap=1 only, **100% of partition attacks evade**; a per-target COUNT gate cannot separate a partition from honest one-target clustering (catch/false-veto move together) — so a per-target aggK is the wrong axis and is soak-data-gated anyway.

**Red-team (workflow `wf_d8a80606-5cb`, 2 Opus + 2 sonnet + Opus synthesis).** Converged: GAP-REAL, FIX-AS-PROPOSED (per-target aggK) INSUFFICIENT — a **cross-target** partition defeats per-target ("per-target IS the attacker's partition axis"). Live repro (Opus, reproduced by me): 6 depth-1 advisory fabrications across 6 targets, funded by resolving honest debt on a 7th → `accept=true, identityVeto=false, structuralFloorVeto=false, maxSeverityVeto=false, deltaU=-39.99`. The correct signal: a **GLOBAL, target-agnostic, evidence-kind-weighted, depth² unsupported-inversion mass** (partition-immune on BOTH target and claimType axes; the executable-vs-advisory weighting breaks the magnitude-swap symmetry).

**Self-correction (adversarial verification earned its keep again).** The converged prescription said "non-offsettable DELTA floor (after-mass > before-mass)". I built it, then my own repro DEFEATED it: a net-delta floor IS offsettable — the attacker resolves 6 units of advisory debt (−6) while adding 6 fresh (+6), net 0, `accept=true`. A "non-offsettable net delta" is a contradiction. Corrected to a **per-claim NEW-or-DEEPER** unsupported-mass measure (mirrors the identity veto's beforeDepth): resolving other claims cannot fund a fresh fabrication. Now catches the offset (addedMass=6, accept=false) with zero false-veto on same-depth WIP or executable-backed work.

**Built (DISARMED, byte-identical to today under the default):**
- `cortexSnapshot` (`claim-cortex.mjs`): `unsupportedInversionMass` (metric) + `unsupportedDepthById` (per-claim, for the non-offsettable floor) + `untrackedUnsupportedMass` (id-less, fail-closed). Executable kinds = test/runtime_trace/fixture/schema/operator_note.
- `gateClaimTransition`: a new non-offsettable floor — veto when the sum of `inversionPenalty(depth)` over after-claims that are NEW-or-deeper UNSUPPORTED exceeds `opts.unsupportedMassAddedCap` (default **Infinity = OFF**). Returns `unsupportedMassVeto`, `addedUnsupportedMass`.
- `mergeLedgers` (`prose-claim-extractor.mjs`): **eviction hardened** — never recency-evict an `inversions>0` claim (assessed via cortexSnapshot only on overflow; protected set bounded by maxClaims). Closes the flood-eviction signal-suppression the red-team flagged as mandatory-before-arm.
- Tests: claim-cortex **61→67** (disarmed-byte-identical, armed-catches-offset, non-offsettable, no-false-veto×2, id-less-fail-closed); extractor **27→28** (eviction protects inverters). Full battery **133 green** incl. energy-tick-core 27 (integration intact).

**Residual risk (tracked, not closed):** evidence-kind AUTHENTICITY is the new attack surface — if an attacker forges executable-looking refs (fake `test`/`fixture`), the discriminator collapses; the R2-A relevance/containment fixes raise that bar but don't eliminate it. A patient attacker establishing standing advisory debt over many ticks is bounded by the per-claim (not net) measure but a slow-drift secondary budget may be needed — soak must measure standing advisory mass.

**Still owner-gated (NOT done):** (5) run the soak → measure honest new-or-deeper unsupported-mass distribution; (6) set `unsupportedMassAddedCap` from soak p99 (likely small, maybe 0-1); (7) wire `gateClaimTransition` onto the live PostToolUse hot path + arm. Arming energy-enforce stays owner-only. Nothing committed.
