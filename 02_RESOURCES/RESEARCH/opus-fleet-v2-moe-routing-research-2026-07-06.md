# opus-fleet v2 — MoE Model-to-Task Routing Research

**Author:** ResearchArc lane
**Date:** 2026-07-06
**Scope:** Optimal model→role routing across the full OMP model zoo for the opus-fleet v2 Mixture-of-Experts (MoE) MLP router. Read-only research — no code modified. Every claim cites the config file it rests on.
**Status:** Advisory. The MLP router is ADVISORY + DISARMED by default (`_SYSTEM/Scripts/fleet-router-mlp.mjs:10-16`; `_SYSTEM/mure/README.md:304`); none of these recommendations change live dispatch until an owner arms it.

---

## 0. Method + provenance

Sources read in full for this artifact:

| File | What it gives | Anchor |
|---|---|---|
| `_SYSTEM/config/cloud-fleet-models.json` | Substrate roster (omp_task / glm_fleet / ollama_cloud / mimo / cursor), per-tier ctx + use, retired list, mureNativeTranslation | `:39-170`, `:171-175`, `:176-193` |
| `_SYSTEM/config/llm-affinity-matrix.json` | Declarative role→substrate routing (preferred/fallback/rationale), cost tiers, the 4 role groups | `:12-22` (substrates+tiers), `:23-44` (affinities), `:45-48` (groups) |
| `_SYSTEM/Scripts/llm-lane.mjs` | The ~30-entry ALIAS map (lane name → concrete model) | `:77-103` |
| `_SYSTEM/config/fleet-roles.json` | The 20 roles: id, group, capabilities, substrate, lane, fallbackLane, autonomyClass | `:23-345` |
| `_SYSTEM/mure/role-registry.mjs` | Roster loader + the SUBSTRATES / NATIVE_LANES / GLM_LANES enums | `:21-24` |
| `_SYSTEM/Scripts/fleet-router-mlp.mjs` | The MLP: 12-feature schema, forward(), predictRoute(), confidence, updateFromOutcome() | `:36-49`, `:122-230`, `:245-281` |
| `_SYSTEM/Scripts/company.mjs` | `DEFAULT_MURE_BUDGET_CAP = 48` + `resolveBudgetCap()` | `:42-43`, `:46-52` |
| `_SYSTEM/Scripts/glm-fleet.mjs` | GLM concurrency default = 3 | `:288` |
| `_SYSTEM/Scripts/runSwarm.mjs` | MLP router wiring + confidence→timeout gate at 0.25 | `:111-160` (esp. `:152`) |
| `_SYSTEM/mure/README.md` | Substrate concurrency table, budgetCap doc, P9 shadow | `:293-298`, `:302`, `:304` |

The model surface is fully captured by the ALIAS map (`llm-lane.mjs:77-103`) resolving to these concrete models:

- **glm-max → `glm-5.2`** (1M ctx, premium) — `llm-lane.mjs:101`; tier use "orchestrator-peer, architecture, adversarial, synthesis" (`cloud-fleet-models.json:89-93`)
- **glm → `glm-5.1`** (200K ctx, mid) — `llm-lane.mjs:102`; "code-gen, refactor, judgment (workhorse)" (`cloud-fleet-models.json:94-98`)
- **glm-flash → `glm-5-turbo`** (200K, mid) — alias remapped because `glm-4.7-flash` empty-output-stops on bulk (`llm-lane.mjs:93-96`); "census, scan, fast bulk" (`cloud-fleet-models.json:99-103`)
- **glm-turbo → `glm-5-turbo`** (200K, mid) — "reactive / snappy" (`cloud-fleet-models.json:104-108`)
- **glm-vision → `glm-4.6v`** (64K) — `llm-lane.mjs:98`; "screenshots / UI" (`cloud-fleet-models.json:109-113`)
- **ollama-flash → `deepseek-v4-flash:cloud`** (cheap) — "default bulk — best quality/usage" (`cloud-fleet-models.json:122-126`)
- **ollama-minimax → `minimax-m3:cloud`** (cheap) — "efficient generalist" (`cloud-fleet-models.json:127-130`)
- **mimo-v2.5-pro[1m]** (1M, premium) — "Opus-class Anthropic-protocol" (`cloud-fleet-models.json:151-154`)
- **native OMP** = Claude sonnet/haiku/opus via `task()` subagents (`cloud-fleet-models.json:42-76`)
- **cursor → `composer-2.5`** (premium) — orchestrator fallback when Claude capped (`cloud-fleet-models.json:165-169`)
- **Retired:** local Ollama SLMs, Codex, direct DeepSeek API (`cloud-fleet-models.json:171-175`)

---

## 1. Per-role model recommendation table (20 roles)

The 20 roles are grouped exactly as the affinity matrix declares (`llm-affinity-matrix.json:45-48`). **Note:** `ideator` is one of the 20 roles (`fleet-roles.json:73-87`) but is **absent from all four named groups** in the affinity matrix — it is included here for completeness under a fifth "research/divergent (ungrouped)" heading so the table reaches the required 20 rows honestly.

Legend:
- **Recommendation** = the (model, reasoning-level) pair I recommend, citing the role's mission + cost tier + ctx need.
- **Affinity match** = whether `llm-affinity-matrix.json` already agrees (`fleet-roles.json` lane in parentheses).
- **Δ** = proposed update with rationale where the recommendation differs from the live affinity.

Reasoning level defaults: the GLM fleet runs `reasoning: high` by default (`cloud-fleet-models.json:87`). I call out where **max** (deliberator/evolver/adjudicator) or **low** (mechanical bulk) is warranted.

### 1.1 bulkRoles — scout, artificer, archivist, chronicler,envoy (`llm-affinity-matrix.json:45`)

| # | Role | Task type | ctx need | Cost tier | Recommendation (model, reasoning) | Affinity (roster lane) | Δ |
|---|---|---|---|---|---|---|---|
| 1 | **scout** | local-first research + online + citation (`fleet-roles.json:92-94`) | 200K | cheap→mid | **Split:** native `sonnet` @ high for tool-using research (xref/capability-recall/agent-reach/citation); `ollama-flash` @ low only for pure census sub-tasks | preferred `ollama-flash` / fb `glm-turbo` (`:28`); roster lane `sonnet` (`:95-96`) | **PROPOSED:** affinity misclassifies scout as bulk. Mission says "cite primary sources" + "research local corpus first" (`:92-93`) — needs native tools. Bulk census is a *subset*, not the whole role. Make `sonnet` preferred, `ollama-flash` the bulk-sub-task path. |
| 2 | **artificer** | scaffolding + mechanical edits + test-run + census (`fleet-roles.json:189-191`) | 128K | cheap | `ollama-flash` @ low for scaffold/census; native `haiku` @ low when the sub-task is `test-run` (needs tools) | preferred `ollama-flash` / fb `glm-turbo` (`:34`); roster lane `haiku` (`:193-194`) | **MINOR:** affinity and roster disagree on the cheap lane. Align roster lane → `ollama-flash` (doesn't spend the Claude weekly pool; 3-wide Pro concurrency, `cloud-fleet-models.json:120`). Keep native `haiku` as fallback for tool-needing edits. |
| 3 | **archivist** | memory curation + skill-library + lineage (`fleet-roles.json:285-287`) | 200K | cheap | `ollama-flash` @ low for bulk skill-library sweep; native `haiku` @ mid for curated writes | preferred `ollama-flash` / fb `native` (`:40`); roster lane `native` (`:289-290`) | **KEEP.** Affinity right; roster's native lane is the curated-write path. No change. |
| 4 | **chronicler** | docs + summaries + result-labeling (`fleet-roles.json:301-303`) | 200K | cheap→mid | `ollama-flash` @ low for bulk doc drafts; `glm` (5.1) @ high for owner-facing summaries | preferred `ollama-flash` / fb `glm` (`:41`); roster lane `sonnet` (`:305-306`) | **KEEP affinity; align roster.** Roster `sonnet` over-spends for bulk drafts. Cheap-first is correct. |
| 5 | **envoy** | brain-dump decode — rank intents, surface hidden constraint + meta-need (`fleet-roles.json:333-335`) | 200K | **mid** | **`glm` (5.1) @ high** — intent-decoding is reasoning, not bulk | preferred `ollama-flash` / fb `glm` (`:43`); roster lane `sonnet` (`:337-338`) | **PROPOSED:** affinity misclassifies envoy as bulk. Decoding a brain dump is divergent/convergent reasoning ("rank intents, surface hidden constraint"), which is exactly `glm` mid-cost reasoning (`:17`). `ollama-flash` is wrong. Make `glm` preferred, `glm-turbo` fallback. |

### 1.2 codeRoles — engineer, mechanic (`llm-affinity-matrix.json:47`)

| # | Role | Task type | ctx need | Cost tier | Recommendation (model, reasoning) | Affinity (roster lane) | Δ |
|---|---|---|---|---|---|---|---|
| 6 | **engineer** | core domain code-gen (`fleet-roles.json:157-159`) | 200K | mid | `glm` (5.1) @ high default; **escalate to `glm-max`/native `opus`** for architecturally-heavy features | preferred `glm` / fb `cline` (`:32`); roster lane `glm` (`:161-162`) | **KEEP.** Aligns with Marcel's "Opus for heavy coding" via the escalation rule — `glm` workhorse for routine scoped builds, hand off to `glm-max`/opus when the build touches architecture. |
| 7 | **mechanic** | integration + refactor + wiring (`fleet-roles.json:173-175`) | 200K | mid | `glm` (5.1) @ high | preferred `glm` / fb `cline` (`:33`); roster lane `glm` (`:177-178`) | **KEEP.** Workhorse lane sufficient. |

### 1.3 heavyRoles — architect, adjudicator, kernelsmith, deliberator, oracle, synthesist, evolver (`llm-affinity-matrix.json:46`)

| # | Role | Task type | ctx need | Cost tier | Recommendation (model, reasoning) | Affinity (roster lane) | Δ |
|---|---|---|---|---|---|---|---|
| 8 | **architect** | system/interface design, capability composition (`fleet-roles.json:44-46`) | **1M** | premium | `glm-max` (5.2) @ high | preferred `glm-max` / fb `tmux-zai` (`:25`); roster lane `glm-max` (`:48`) | **KEEP.** 1M ctx for whole-system design (`cloud-fleet-models.json:90-91`). |
| 9 | **adjudicator** | adversarial critic, refute-by-default, structurally independent (`fleet-roles.json:237-239, :246`) | 1M | premium | `glm-max` (5.2) @ **max** | preferred `glm-max` / fb `tmux-zai` (`:37`); roster lane `glm-max` (`:241`) | **KEEP, raise reasoning to max.** Independence from producers (`independentOf` `:246`) is satisfied by substrate isolation; max reasoning because refutation is the highest-stakes call. |
| 10 | **kernelsmith** | hot-path optimization + benchmark + language-consolidation (`fleet-roles.json:221-223`) | 1M | premium | `glm-max` (5.2) @ high | preferred `glm-max` / fb `tmux-zai` (`:36`); roster lane `glm-max` (`:225`) | **KEEP.** |
| 11 | **deliberator** | continuous-thought deep reasoning, compute-self-allocation (`fleet-roles.json:141-143`) | 1M | premium | `glm-max` (5.2) @ **max** | preferred `glm-max` / fb `tmux-zai` (`:31`); roster lane `glm-max` (`:145`) | **KEEP, raise reasoning to max.** The role is literally "adaptive compute" — max reasoning is its reason to exist. |
| 12 | **oracle** | test execution + fitness scoring + accept/reject (`fleet-roles.json:253-255`) | 200K | premium (native) | native `sonnet`/`opus` @ high (needs test-runner tools); `glm-turbo` fb | preferred `native` / fb `glm-turbo` (`:38`); roster lane `native` (`:257`) | **KEEP.** Must run tests → native tools. |
| 13 | **synthesist** | lattice synthesis + cross-domain transfer + long-context merge (`fleet-roles.json:108-110`) | **1M** | premium | `glm-max` (5.2) @ high | preferred `glm-max` / fb `tmux-zai` (`:29`); roster lane `glm-max` (`:112`) | **KEEP.** 1M ctx for merge (`cloud-fleet-models.json:90-91`). |
| 14 | **evolver** | evolutionary self-modification proposals, owner-gated (`fleet-roles.json:124-126, :130, :134`) | 1M | premium | `glm-max` (5.2) @ **max**, `gatedBehind: oracle` (`:134`) | preferred `glm-max` / fb `tmux-zai` (`:30`); roster lane `glm-max` (`:128`) | **KEEP, raise reasoning to max.** Highest blast radius (`:125`) → max reasoning + the oracle gate. |

### 1.4 nativeOnlyRoles — helmsman, steward, sentinel, calibrator, quartermaster (`llm-affinity-matrix.json:48`)

| # | Role | Task type | ctx need | Cost tier | Recommendation (model, reasoning) | Affinity (roster lane) | Δ |
|---|---|---|---|---|---|---|---|
| 15 | **helmsman** | goal-spine + decomposition + dispatch + finalize authority (`fleet-roles.json:28-30, :38`) | session | premium | native `opus` (the orchestrator session) @ max; fb `glm-max` | preferred `native` / fb `glm-max` (`:24`); roster lane `opus` (`:32-33`) | **KEEP.** Owner cockpit + commit authority (`finalizeAuthority: true`, `:38`) must be native. |
| 16 | **steward** | 6-gate charter, blast-radius, owner-HOLD — **deterministic** (`fleet-roles.json:60-62`) | n/a | — | native (deterministic, no LLM substrate) | preferred `native` / fb `native` (`:26`); roster lane `native` (`:64-65`) | **KEEP.** No LLM needed; governance.mjs is code, not a model. |
| 17 | **sentinel** | security-review + protected-path audit + red-team (`fleet-roles.json:205-207`) | 200K | premium | native `sonnet`/`opus` @ high | preferred `native` / fb `glm` (`:35`); roster lane `sonnet` (`:209-210`) | **KEEP.** Needs native tools for protected-path audit (`:207`). |
| 18 | **calibrator** | Brier scoring + advisor-weighting — **deterministic math** (`fleet-roles.json:269-271`) | n/a | — | native (deterministic) | preferred `native` / fb `native` (`:39`); roster lane `native` (`:273-274`) | **KEEP.** math-bridge, not a model. |
| 19 | **quartermaster** | token-budget accounting + budgetCap enforcement — **deterministic** (`fleet-roles.json:317-319`) | n/a | — | native (deterministic) | preferred `native` / fb `native` (`:42`); roster lane `native` (`:321-322`) | **KEEP.** Code, not a model. |

### 1.5 research/divergent (ungrouped in the affinity matrix)

| # | Role | Task type | ctx need | Cost tier | Recommendation (model, reasoning) | Affinity (roster lane) | Δ |
|---|---|---|---|---|---|---|---|
| 20 | **ideator** | divergent hypothesis generation + novelty-scoring + remote-association (`fleet-roles.json:76-78`) | 200K | mid | `glm` (5.1) @ high; fan 3–8 wide for breadth | preferred `glm` / fb `ollama-flash` (`:27`); roster lane `glm` (`:80-81`) | **KEEP + add to a group.** ideator is missing from all four affinity groups (`:45-48`) — file a matrix update to list it (research/divergent). Recommendation matches existing affinity. |

### 1.6 Proposed affinity-matrix updates (summary)

Three concrete deltas, all in the cheap-vs-reasoning boundary the matrix currently gets wrong:

1. **scout** (`:28`): `ollama-flash` → split. Preferred `native` (sonnet) for tool-using research; `ollama-flash` reserved for the census *sub-task*. The role needs citation + xref + capability-recall (`fleet-roles.json:92-94`), which are native tools, not bulk-scan.
2. **envoy** (`:43`): `ollama-flash` → `glm`. Intent-decoding ("rank intents, surface hidden constraint and meta-need", `fleet-roles.json:334`) is reasoning, classed mid-cost by the matrix's own `glm` tier (`:17`). `ollama-flash` is a cost-tier mismatch with the cognitive load.
3. **ideator**: add to the affinity group lists (`:45-48`) — currently unclassified.
4. **artificer/chronicler** roster alignment (`fleet-roles.json:193, :305`): roster lanes (`haiku`/`sonnet`) over-spend relative to the affinity's cheap-first intent; align roster to `ollama-flash` for the bulk path.

---

## 2. Fan-out economics

### 2.1 The concrete ceilings (all grounded)

| Substrate | Concurrency ceiling | Source |
|---|---|---|
| Native OMP (Opus `Agent` tool) | **~12 parallel Agents** | `_SYSTEM/mure/README.md:295` |
| z.ai GLM fleet | **3 default**, plan-dependent (runSwarm default `concurrency || 3`) | `_SYSTEM/Scripts/glm-fleet.mjs:288`; `_SYSTEM/mure/README.md:296`; `_SYSTEM/Scripts/company.mjs:903` |
| Ollama Cloud (Pro) | **3 concurrent** (hardcoded `"concurrency": 3`) | `_SYSTEM/config/cloud-fleet-models.json:120`; `_SYSTEM/mure/README.md:297` |
| Mimo | not concurrency-capped in config (single Anthropic-protocol endpoint) | `_SYSTEM/config/cloud-fleet-models.json:149-164` |
| Cursor | single interactive lane (orchestrator fallback) | `_SYSTEM/config/cloud-fleet-models.json:165-169` |
| **runSwarm lane-call budget** | **48** (`DEFAULT_MURE_BUDGET_CAP`, "~16 leaves × 3 rounds") | `_SYSTEM/Scripts/company.mjs:42-43`; `_SYSTEM/mure/README.md:302` |
| runSwarm default rounds | 2 (`company.mjs`) / 3 (`runSwarm.mjs` CLI) | `_SYSTEM/Scripts/company.mjs:903`; `_SYSTEM/Scripts/runSwarm.mjs:387` |

The budget cap is enforced as a cumulative lane-call counter; when it exhausts, `swarm-convergence` damping fires a force-stop (`_SYSTEM/Scripts/swarm-convergence.mjs:237-239`; `_SYSTEM/mure/README.md:302`). Override: `task.budgetCap`, `YURI_MURE_BUDGET=<n>`, or `YURI_MURE_BUDGET_UNLIMITED=1` (`company.mjs:46-52`).

### 2.2 What binds first

At any sensible width, **concurrency binds before budget**:
- Native-only wave: 12-wide × 1 round = 12 calls ≪ 48. You can run ~4 such waves before the budget bites.
- GLM-only wave: 3-wide × 3 rounds = 9 calls ≪ 48. Budget never the constraint on GLM.
- The 48-cap only bites on **deep refinement trees** (3+ rounds × wide leaves) or runaway re-dispatch loops where leaves never converge — which is exactly what the force-stop is for (`swarm-convergence.mjs:239`).

So the real fan-out question is **width given concurrency**, not width given budget.

### 2.3 Optimal width per layer (Marcel's philosophy)

Marcel's stated philosophy: **Haiku/Sonnet fanned wide at max reasoning for workers; Opus for heavy coding/orchestration/design; the orchestrator session as the single mastermind.** Mapped to the zoo:

- **Haiku-wide** = `ollama-flash` (deepseek-v4-flash:cloud, cheap, 3-wide) + native `haiku` Agent + `glm-flash`/`glm-turbo` (`cloud-fleet-models.json:99-108`).
- **Sonnet-wide** = native OMP `task()` sonnet agents (the ~12-wide ceiling, `README.md:295`) + `glm` (5.1) workers.
- **Opus-heavy** = `glm-max` (5.2, "orchestrator-peer", `cloud-fleet-models.json:89-93`) + native `opus` + `mimo-v2.5-pro[1m]` (Opus-class Anthropic-protocol, `:151-154`).
- **Mastermind** = the orchestrator session itself — single-threaded, holds the goal spine, owns finalize (`fleet-roles.json:38`).

**Per-layer width recommendation:**

| Layer | Role(s) | Substrate | Width | Reasoning | Rationale |
|---|---|---|---|---|---|
| **L0 — worker fan (independent)** | scout, artificer, chronicler, ideator | native sonnet / ollama-flash | **8–12 wide** | high | Independent, latency-bound; native ceiling is ~12 (`README.md:295`). Below 8 underuses the divergent breadth Marcel wants; above 12 hits the native wall. |
| **L0 — cheap bulk census** | scout (census sub-task), artificer, archivist | ollama-flash / glm-flash | **3 wide** | low | Pro plan hard-caps at 3 (`cloud-fleet-models.json:120`). Run all three tiers in parallel (flash/minimax/kimi) for a 3-model nano-swarm. |
| **L1 — merge / defend** | synthesist, adjudicator | glm-max (5.2) | **1–2 wide** | high/max | Collapses N leaf outputs into 1 defended artifact. Substrate-isolated from producers (`fleet-roles.json:246`). |
| **L2 — heavy / owner-gated** | architect, deliberator, evolver, kernelsmith | glm-max (5.2) | **1 wide** | max | Single deep reasoner per hard sub-problem; `gatedBehind: oracle` for evolver (`:134`). |
| **Native spine** | helmsman, steward, sentinel, oracle, calibrator, quartermaster | native opus/sonnet | **1** (session) | max | Single-threaded orchestrator + deterministic governance; never fanned. |

**Concrete number:** a full Marcel-philosophy wave = **~12 native workers (L0) + 1 glm-max synthesist (L1) + 1 glm-max adjudicator (L1) = 14 lane-calls per wave**, leaving ~34 of the 48-call budget for a second refinement wave (re-dispatch only the gap leaves per `swarm-convergence` damping). At 2 rounds that is ~28 calls — comfortably under cap, with headroom for the owner-gated heavy layer.

### 2.4 Depth-vs-breadth — when each wins

**1-deep × W-wide (flat fan) wins when:**
- Sub-tasks are **independent** and the outputs do NOT need merging (parallel scout census of N distinct sources; artificer scaffolding N unrelated files; ideator generating N divergent hypotheses; chronicler writing N independent doc sections).
- **Latency-bound**: one round, W parallel calls ≈ 1× wall-clock.
- Cost: W calls. Constraint: W ≤ 12 (native) or W ≤ 3 (GLM/ollama).

**3-deep × W-wide (refinement tree) wins when:**
- Each layer's output is the **next layer's input** — scout→synthesist→adjudicator, or ideator→architect→kernelsmith.
- The value is in **merging + defending**, not raw throughput.
- Cost: W + ⌈W/4⌉ + 1 ≈ 1.25W + 1 calls; latency ≈ 3× wall-clock (serial rounds).

**The crossover** (when does breadth stop paying?): when outputs need **merging**. N independent drafts cost N calls but yield N un-merged artifacts; a synthesist adds 1 call and collapses N→1 defended. Beyond ~8–12 independent outputs the merge-and-defend cost dominates a flat fan, so you split into a 2- or 3-deep tree (sub-merge at L1, final merge at L2) instead.

**Worked examples (all within the 48-call budget):**

| Pattern | Shape | Calls | Rounds | Use when |
|---|---|---|---|---|
| Flat census | 1-deep × 12-wide (native sonnet) | 12 | 1 | 12 independent sources, no merge needed |
| Cheap nano-swarm | 1-deep × 3-wide (ollama flash/minimax/kimi) | 3 | 1 | Bulk draft diversity on one question |
| Defended synthesis | 2-deep: 8 scouts → 1 synthesist → 1 adjudicator | 10 | 2 | Research → merged → red-teamed |
| Evolutionary refinement | 3-deep: 4 ideators → 1 architect → 1 kernelsmith | 6 | 3 | Diverge → design → optimize (evolver path) |
| Max flat | 1-deep × 12-wide × 4 waves (native) | 48 | 4 | Exhausts the budget; only if convergence is not required |

The budget cap (48) is **never** the binding constraint at sensible widths (≤12); **concurrency (3–12) always binds first.** The 48-cap exists to stop runaway re-dispatch when leaves never converge (`swarm-convergence.mjs:239`), not to throttle a well-shaped fan.

---

## 3. Steering-threshold recommendation (τ)

### 3.1 The router's current state — verified, not assumed

I ran the training pipeline (`node _SYSTEM/Scripts/train-fleet-router-from-ledger.mjs --epochs=4 --lr=0.015 --dry`) and an in-memory reproduction to verify the baseline the assignment cited. Results:

| Metric | Value | Source |
|---|---|---|
| Ledger rows | **266** (180 predictions + 86 outcomes) | `_SYSTEM/state/prediction-ledger.jsonl` |
| Matched training examples | **86** (68 train / 18 eval) | `train-fleet-router-from-ledger.mjs:161` |
| Held-out mean Brier | **0.1630** (random ≈ 0.25) | dry-run output; `train-fleet-router-from-ledger.mjs:54-69` |
| Dry-run training error | **flat 0.2793 across all 4 epochs** | dry-run output |
| Pre-training neutral error | ~0.481 | dry-run output |

**Two corrections to the assignment's framing, both evidence-grounded:**

**(a) The flat dry-run curve is a `persist:false` cloning artifact, NOT dead ReLUs.** In dry mode, `updateFromOutcome` is called with `persist: !dry = false` (`train-fleet-router-from-ledger.mjs:184`). With `persist === false`, the function does `const w = structuredClone(liveWeights)` (`fleet-router-mlp.mjs:254`) and then skips `saveWeights` (`:279`). The in-memory singleton `_weights` is **never mutated** during a dry run, so every example in every epoch forward-passes against the **identical** persisted weights → identical error 0.2793. The flatness is expected from the dry-run machinery, independent of any dead-ReLU problem.

**(b) When weights actually mutate (in-memory, single accumulating object), gradient IS flowing — but the network is getting WORSE, not stuck.** I reproduced the exact backprop from `updateFromOutcome` (`fleet-router-mlp.mjs:260-277`) on a single mutable weight object across 4 epochs:

| Start weights | Epoch errors (mean\|err\|) | All 8 hidden units alive? | Dead (ex,unit) pairs/epoch |
|---|---|---|---|
| persisted (`fleet-router-weights.json`) | 0.2359 → 0.2526 → 0.2529 → 0.2519 | **yes, all 8 in every epoch** | ~60% |
| cold init (`initWeights` seed 0xC0FFEE) | 0.1857 → 0.2457 → 0.2573 → 0.2595 | **yes, all 8 in every epoch** | ~62% |

Findings:
- **All 8 hidden units are alive in ≥1 example every epoch** — no unit is *permanently* dead. The "dead ReLU" hypothesis is **not** the cause of the flat dry-run.
- **~60% of (example,unit) pairs are dead** per epoch — high, which *weakens* the gradient (only ~40% of activations carry signal), but it does not zero it.
- **Error INCREASES over epochs in both runs** (0.236→0.252 persisted; 0.186→0.260 cold). The bare online SGD is **diverging/overfitting**, not stuck flat. The held-out Brier 0.163 is better than the 0.25 random baseline, but it reflects a near-linear forward pass that happens to be weakly calibrated — **not** learned structure. The weights drift (w1 drift 0.15–0.63) but in the wrong direction.

**Implication for τ:** the router today has *fragile* signal, an *uncalibrated* confidence metric, and a learning rule that *degrades* it. Any steering threshold must be set against this honest baseline.

### 3.2 What "confidence" actually is

The router's confidence is computed in `predictRoute` (`fleet-router-mlp.mjs:220-222`):

```js
const confidence = scored.length > 1
  ? clamp01((best.score - scored[1].score) / (Math.abs(best.score) + 1e-6))
  : 0.6;
```

This is a **relative score margin**, not a calibrated probability. It is **not** Brier-comparable. Today it gates only one thing: a timeout-bias on heavy lanes when `confidence > 0.25` (`runSwarm.mjs:152`). It does **not** override dispatch — the router is shadow-only (`README.md:304`).

### 3.3 The asymmetric loss argues for a HIGH τ

The router can only **override a correct declarative affinity with a worse pick**. The declarative affinity matrix (`llm-affinity-matrix.json`) already encodes sound role→substrate logic (cheap-first for bulk, heavy-only for deep roles, native-only for tool/authority roles). A misroute by the router is pure downside. So τ should start **high** and only lower as the router earns trust through measured Brier improvement.

### 3.4 Recommendation: τ₀ = 0.60, bulk-roles only, with a Brier-gated ramp

**Phase 0 (current state — Brier 0.163, N=86, learning diverging):**
- **τ = 0.60** (relative margin). The router may override the declarative affinity **only** when its top pick beats #2 by ≥60% of |best.score|.
- **Scope: bulkRoles only** (`scout, artificer, archivist, chronicler, envoy`). These are cheap to absorb a wrong routing — a misrouted census costs a few cheap calls, not a broken architecture.
- **Mode: shadow-logged, NOT armed.** Continue writing counterfactual rows (`README.md:304`) and compare router picks vs declarative picks on resolved outcomes. Do not arm until the prerequisites below are met.
- **Hard exclusions (never overridable, any τ):** `nativeOnlyRoles` (helmsman/steward/sentinel/calibrator/quartermaster — need tools/authority/determinism) and `heavyRoles` (architect/adjudicator/kernelsmith/deliberator/oracle/synthesist/evolver — deep reasoning needs the strong substrate). The downside of misrouting a sentinel or architect is asymmetric and irreversible in cost.

**Phase 1 (prerequisites met):**
- **τ = 0.50**, bulkRoles **armed**.
- Prerequisites to cross before arming:
  1. **Fix the dry-run artifact** so training error is honest (the flat 0.2793 hides the real — bad — dynamics). The `persist:false` clone path (`fleet-router-mlp.mjs:254`) must report error against *evolving* weights, or the dry run must clearly label itself "snapshot error, not a training pass."
  2. **Fix the diverging SGD** — the ~60% dead-ReLU pairs + the LR schedule (`lr/(1+epoch*0.5)`, `train-fleet-router-from-ledger.mjs:183`) are making weights worse. Candidates: Leaky-ReLU / ELU to revive dead units; He init scaled to the ~60% dead fraction; momentum or Adam instead of bare online SGD; larger hidden layer (8 → 16) for more alive capacity.
  3. **Replace the raw-margin confidence** (`fleet-router-mlp.mjs:220-222`) with a calibrated sigmoid-Brier bucket probability (the held-out Brier machinery already exists, `train-fleet-router-from-ledger.mjs:54-69`).
- Gate: held-out Brier < **0.14** AND N ≥ **150** AND training error monotonically **decreasing** over epochs.

**Phase 2:** Brier < 0.11, N ≥ 300, calibration within ±0.05 per confidence bucket → **τ = 0.42**, add `codeRoles` (engineer/mechanic) armed.

**Phase 3:** Brier < 0.09, N ≥ 600 → **τ = 0.35 floor** (never lower).

**Hard floor: τ ≥ 0.35 always**, and the nativeOnly/heavyRoles exclusions never lift. An uncalibrated margin below 0.35 must never override a declarative rule.

### 3.5 Why these numbers

- **0.60 start:** the router's only honest signal is held-out Brier 0.163 vs 0.25 random — a ~35% relative edge. A 0.60 margin demands the router be *substantially* more sure than the field before it overrides. Below this, the declarative matrix (which already encodes the cheap-first/heavy-only logic) is the safer pick.
- **0.35 floor:** the confidence is a relative margin on an unstable, uncalibrated score. A margin under ~0.35 is indistinguishable from noise given the ~60% dead activations and diverging training. Letting it override would be gambling.
- **Bulk-only initial scope:** a wrong bulk routing is cheap and reversible (re-run a census); a wrong heavy/native routing is expensive and sometimes irreversible (a misrouted sentinel audit, a misrouted architecture decision). The ramp widens scope only as Brier proves the router is calibrated, not just "sometimes right."

---

## 4. Bottom line

1. **Per-role:** the declarative affinity matrix is ~85% right. Three fixes: **scout** (tool-using research needs native, not bulk), **envoy** (intent-decoding is reasoning, needs `glm` not `ollama-flash`), and **ideator** (add it to a group — currently unclassified). Heavy + native roles are correctly pinned; raise reasoning to **max** for adjudicator/deliberator/evolver.
2. **Fan-out:** concurrency (3–12) binds before the 48-call budget at every sensible width. Optimal worker wave = **8–12 wide native (Sonnet/Haiku, high reasoning)** for divergent generation, **3 wide ollama/GLM** for cheap bulk, with **1–2 glm-max** at the merge/defend layer. A full wave ≈ **14 calls**, leaving budget headroom for a refinement round. Flat fan wins for independent+latency-bound; 3-deep tree wins for scout→synthesize→adjudicate refinement.
3. **Steering τ:** start **0.60, bulk-roles only, shadow-logged, not armed**. Ramp to 0.50→0.42→0.35 floor as Brier improves (<0.14 / <0.11 / <0.09) and N grows (150/300/600). **Hard floor 0.35; nativeOnly + heavyRoles never overridable.** Prerequisites before any arming: fix the dry-run persist-clone artifact, fix the diverging SGD (~60% dead ReLUs), and replace the raw-margin confidence with a calibrated sigmoid-Brier bucket.

The single most important finding for the MoE effort: **the router is not "stuck flat from dead ReLUs" — it is *diverging* (error rises with training), and the flat dry-run reading masked that.** Fix the learning rule and the confidence calibration before trusting any τ to steer real dispatch.
