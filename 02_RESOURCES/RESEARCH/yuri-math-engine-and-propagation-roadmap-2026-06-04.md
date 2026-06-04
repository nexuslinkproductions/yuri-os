# YURI Two-Tier Math Engine + Broad-Aware Upgrade — Roadmap (2026-06-04)

> Single systematic overview of: the two-tier math-engine architecture, the verified wiring plan for the 36-card math-transfer catalog, the broad-aware upgrade / cross-reference / propagation engine that keeps it all coherent, and the guard discipline that propagates with every change.
> Grounding: every "live state" claim below was verified against live code by an 8-cluster seam-verification workflow (2026-06-04), not taken from the catalog. The catalog (`math-theory-transfer-catalog-2026-06-03.md`) is a ~1-day-old hypothesis set; drift is flagged inline.
> Authority: advisory plan. Owner gates builds; nothing here touches the enforcing energy core without explicit approval. Obeys [[circuitry-change-propagation-continuity]] + [[hold-big-picture-breadth-and-depth]].

---

## 1. The architecture (Marcel's vision, decoded 2026-06-04)

A **two-tier math substrate** with a connective engine, under one meta-law:

- **Tier 1 — the ONE large math engine.** Maths *digested, indexed (FTS5, not RAG), implemented* — a central mathematical substrate YURI reaches for system-wide. Live home: `_SYSTEM/Scripts/math/math-kernel.mjs`.
- **Tier 2 — per-organ tailored math engines.** Each organ (energy gate, claim cortex, salience, memory, consensus, architecture-graph) gets its own bespoke math, hardening *that* organ, complementing the whole. Sourced from the catalog transfers.
- **Connective tissue — the Broad-Aware Upgrade / Cross-Reference / Propagation engine.** One mechanism upgraded → every sibling site sharing its pattern is detected, cross-referenced, and queued (gated). Keeps both tiers coherent + cutting-edge. ([[upgrade-propagation-engine]] · [[cross-reference-engine]])
- **Meta-law — [[hold-big-picture-breadth-and-depth]].** Hold absolute breadth + depth at once; cross-reference every increment against the whole system so it adds up seamlessly. Execute narrow, think wide. The cross-reference engine is the *mechanism* of this law.

These are not four projects — they are one spine. Wiring a transfer **is** the detect-event the propagation engine fires on; the catalog's pattern-clusters **are** the sibling-site map it cross-references; the cross-reference engine **is** how breadth is held while going deep.

---

## 2. Current reality — verified live 2026-06-04 (not a phantom)

### Tier 1 (central engine) — EXISTS, needs growing + the index leg corrected
- `math-kernel.mjs` — **23 live primitives**, tested, imported by claim-cortex, yuri-energy, yuri-workcell, supercharge-gate, math-proof-gate: `normalizeDistribution, entropy, klDivergence, crossEntropy, informationGain, confidenceDecay, dotProduct, pNorm, cosineSimilarity, weightedMean/Variance/StdDev, brierScore, logLoss, bayesUpdate, softmax, expectedValue, logScale, makeMathResult, dijkstra, astar, topologicalSort`. = the catalog's "already in substrate" list, real and wired.
- Supporting family: `math-proof-gate.mjs` (proof obligations), `math-adapters.mjs`, `math-health.mjs`, `math-formula-card-professionalization.test.mjs`, `yuri-fsrs.mjs`, the `yuri-energy*` cluster.
- Design archive: `_SYSTEM/research-archive/yuri-math-engine-2026-05/` (14 docs) — operating-substrate blueprint, formula-card schema, operationalization loop, polyglot stack, integration plan.
- **"digest / index / implement" status:** *implement* = kernel exists. *index* = FTS5 corpus (`ai search`, 38.7k docs) — the archive IS indexed; the old `RAG NOT_INGESTED` label was stale and is corrected (2026-06-04). *digest* = ongoing (the 36 transfers are the growth). The legacy RAG/hybrid layer (`semantic_memory`/`knowledge_nodes`) is abandoned — see `_SYSTEM/MEMORY_ARCHITECTURE.md`.

### Tier 2 (per-organ engines) — PARTIAL/IMPLICIT, not yet formalized
- `yuri-energy.mjs` is effectively the energy organ's math engine; the cortex composes kernel primitives. But they're not *formalized* as per-organ engines, and the bespoke catalog-hardening (the 36 transfers) is largely unbuilt.

### Honest gap
The cathedral is half-built. Tier 1 needs growth + the index-leg relabel (done). Tier 2 needs the per-organ engines stood up from the catalog. The connective propagation engine is designed (below) but unbuilt.

---

## 3. The wiring plan — 36 transfers triaged by VERIFIED state

### WAVE 1 — READY-TO-WIRE NOW (pure functions, zero/low risk, no prerequisite)

**Tier-1 central-kernel growth** (`math-kernel.mjs` additions, each with a regression canary):
- **card 24 Bregman divergence** — `bregmanDivergence(p,q,ψ)`; negEntropy ψ MUST reproduce `klDivergence` to the digit (canary). *Check first:* per-rung `w.beta` scaling may get 80% at 10% the code.
- **card 28 MaxEnt belief prior** — `maxEntBelief(meanRank, support)` via 1-D Newton; retires the `beliefWidth = LADDER_N/(2(n+1))` magic constant. Canary: `entropy(maxEnt) ≥ entropy(current)`.
- **card 27 LMSR increment** — `lmsrIncrement(pBefore,pAfter,b)` next to brierScore/logLoss; proper-scoring + `b·ln(N)` bound tests.
- **card 3 e-value merge** — `mergeLaneEvidence(eValues,weights,dependence)` on `weightedMean`; exposes redundant-council theater.

**Tier-2 organ engines:**
- **Architecture-graph organ (NEW engine, read-only, HIGHEST evidence-per-token)** — build these three as ONE composable analyzer over `_SYSTEM/yuri-graph-state.json` (124n/273e, giant=113):
  - **card 4 spectral clustering** — the TQL2 eigensolver is **ALREADY built + 7/7-verified** in `02_RESOURCES/RESEARCH/circuitry/laplacian.mjs`. ⚠️ **CRITICAL CORRECTION (verified):** `laplacian.mjs` is a *visual-layout* engine over the 83-node circuitry-graph; card 4's deliverable (architecture second-opinion clustering with an AGREE/DISAGREE diff table) must run over **`yuri-graph-state.json`** (124n, has the `sector` field), NOT the circuitry-graph (no sector field). Reuse the eigensolver *mechanism*; point it at the right file; build `Lsym` normalized (current code builds unnormalized L for layout).
  - **card 16 Tarjan articulation/bridges** — pure, no eigensolver; reuse the loader + type-weight map.
  - **card 17 Forman-Ricci edge curvature** — pure; synthesize edge weights from `type` (verified: only 1/273 edges has a real `strength`).
  - These three share one loader + type-weight map and **cross-validate** each other (Cheeger bottleneck ≈ most-negative Forman edges ≈ Tarjan bridges).
- **Claim-cortex organ** (cortex is now LIVE-wired via `claim-ledger.mjs` → energy-tick-core, so the catalog's "zero live caller" framing is stale):
  - **card 8 do-operator ablation** — pure loop over existing `assessClaim`; surfaces load-bearing vs decorative evidence + single-point-of-failure. Drops into the green 46-test harness.
  - **card 34 UCB1 HEDGE tiebreaker** — inside `decideVerdict`'s ASSERT branch; carries the genuine `beliefWidth` raw-count→distinct-count bug fix.
  - **card 36 Jeffrey reliability-weighted update** — pure swap at `assessClaim` recenter (touches the hot belief path — test hard).
- **Energy-gate organ** (read-only / equivalence, no core mutation):
  - **card 32 Lagrangian legibility + dead-term prune** — read-only over the existing trace (`componentContributions` already serialized); renders every reject as ranked binding-constraints + flags ~0-contribution terms. ~80 lines.
  - **card 33 Free Energy unification** — scratch refactor; prove it *reproduces* patched-gate decisions on every fixture (equivalence, not improvement).
- **Memory organ:**
  - **card 14 MDL redundancy demotion** — `marginalBits` via gzip-distance (Node zlib); AND-condition into `planRelocations`. force_keep/feedback/user already exempt. Needs a content-quality floor guard.
  - **card 29 Half-1 renewal-rate stability** — `freq·log1p(r·SCALE)`, `r=useCount/elapsedDays`; ship Half-1 only (Half-2 inspection-paradox debias is blocked + risky).

### WAVE 2 — UNLOCK-THEN-CASCADE (build ONE prerequisite → a whole family lights up)
*This is the broad-aware upgrade made literal: one substrate build ripples to N transfers.*
- **Build the resolved-outcome / deferred-label log ONCE** → unlocks **cards 11 (OCO), 12 (conformal), 18 (learnable-β), 19 (burn-in), 27 (LMSR resolution)**. The single highest-leverage unblock in the catalog. ⚠️ Non-trivial: the energy-trace is write-once + date-partitioned (`_SYSTEM/state/energy-trace/<date>.jsonl`), and `ALLOWED_STRING_PATHS` would reject a new outcome field — needs a *second* runId/claimId-keyed log, not a schema mutation. Each consumer MUST inherit its non-stationarity guard (conformal→weighted/adaptive; OCO→dynamic-regret; Cox→enough event pairs).
- **Add cortex schema fields ONCE** (evidence-polarity `supports|refutes`, `createdAtMs`, per-source lane id) → unlocks **cards 21 (Dempster-Shafer), 24-DS CONTESTED, 20 (BFT quorum), 26 (peer prediction), 10 (sensor fusion), 19 (burn-in)**. ⚠️ polarity is blocked by `yuri.promotion-ladder.v0.schema.json` `additionalProperties:false`.
- **Build the calibrated-per-lane-verdict schema ONCE** → unlocks the **consensus family (3, 6, 10, 20, 26, 27)**. Must carry a shared-base-model/correlation tag or all of them silently revert to treating correlated lanes as independent witnesses.

### WAVE 3 — GATED / OWNER-DECISION
- **card 22 MPC plan feasibility** — needs a graph-plan-state transition function that does not exist (genuine new build).
- **Enforcing-core touches (owner-gated):** card 9 firing a real `computeU` penalty; card 25 redefining the over-claim floor input. The swap residual is already closed cortex-side ([[delta-gate-severity-laundering]]) so no L∞ core change is needed — but wiring θ into the breaker veto IS the gated decision.

### MOOT — DO NOT BUILD (caught by cross-referencing against the migration plan)
- **cards 5 (Thompson) + 7 (Erlang-B)** — every seam they name is live and accurate, BUT they wire onto `offload-contract` / `offload-queue` / `token-ledger`, which are **explicitly queued for native-only Phase-4 deletion** (`native-only-control-plane-plan.md:84`; token-ledger owner-directed for deletion 2026-06-02; the Architecture Codex independently flags offload as moot). Building here = investing in subsystems the owner is killing. **Confirm with owner before any routing work.**
- **card 9 (credal/IDM)** — distinct contribution is narrow; overlaps shipped `beliefWidth` + `inversionPenalty(depth²)` + identity veto. Low marginal value.

---

## 4. The propagation engine (connective tissue) — judged design

**Winner: Design B (corpus-retrieval-inward)** — the only design whose V1 runs against live graph fields (`description`+`triggeredBy` tokens, `layer`, edges) + FTS5 + GitNexus, instead of a per-node `tags` field that does NOT exist (verified `HAS_TAGS_FIELD:false`).

**Synthesized engine (B core + grafts):**
- **DETECT** — build a bounded signature from the touched node's own `description`+`triggeredBy` tokens + GitNexus `detect_changes` symbols.
- **CROSS-REFERENCE** — three deduped passes (FTS5/BM25 on signature; graph-local same-layer/1-hop; GitNexus upstream impact); each candidate scored as a transfer tuple with a **mandatory human-read `mismatch` field**.
- **Grafts:** (A) **exclude `writes` edges** from sibling discovery (data-flow ≠ shared mechanism; verified kinds calls:77/reads:31/writes:45) and filter on edge `kind` generally; (A) emit **`matched=N, surfaced=K`** so over-broad signatures are visible not silently truncated; (C) durable append-only JSONL backlog (`proposed→accepted/rejected/stale`, owner-only transitions) + per-pattern 24h cooldown.
- **CASCADE BOUND — the safety is RECURSION-DEPTH, not a hard count (corrected 2026-06-04 per owner challenge "why cap at 5? too harsh"):**
  - The genuine guard against context-explosion: (a) **depth = 1 structural leaf** — a queued proposal can NEVER auto-trigger another DETECT scan (re-entry is manual owner action only), so there is NO chain reaction however many siblings one upgrade has; (b) **per-pattern 24h cooldown** — a pattern can't re-fire; (c) **confidence floor ≥ 0.55** over `kind∈{calls,reads}` edges, hop-radius ≤ 2 — only real-enough siblings surface. These three bound the blast radius. The *number of proposals does not* — depth=1 already kills the "one tweak → 20 cascading rewrites" failure regardless of count.
  - **The hard top-5 was WRONG** — it's silent truncation (the "no silent caps" anti-pattern: a pattern that legitimately hits 9 sites would drop 4, reading as "covered everything"). Proposal-count is *review-ergonomics*, not safety.
  - **FIX:** surface ALL candidates above the confidence floor, **tiered** (high → auto-queue · medium → review · low → suppressed sub-log) and **paged with explicit `matched=N, surfaced=K, (N−K) more above floor` visibility** — never a silent drop. The shown-batch size is a tunable neuro-knob (default ~5 *shown at once*, the rest paged), not a ceiling on what's found. **Recursion stays zero; coverage stays honest.**
- **V1 = one read-only `propagation-scan.mjs`:** node id → ranked top-5 to stdout + JSONL append. Math-catalog fuel read through a service, never the protected `backend/data/` file directly.
- **Sharpest risk:** *mechanism-fit theater* — lexical overlap surfacing vocabulary-twins not mechanism-twins, flooding the queue until trust dies. **Containing gate:** the mandatory `mismatch` field — any proposal whose specific shared mechanism can't be named is auto-suppressed to a low-confidence sub-log, never the main backlog.

---

## 5. The 5 propagation patterns (the fuel map) — each is a ripple trigger

1. **Replace a hand-tuned magic constant with a principled/learnable curve.** cards 18,28,11,9,24,29,36,33. Sites: `DEFAULT_WEIGHTS` (yuri-energy:51), `evalStaleness`/`confidenceDecay` halfLife, KL drift `w.beta`, `beliefWidth`, surprise K. **Ripple: HIGH** (edits the live conscience). Cascade 18→{11,28,36}. *Guard: regression canary + frozen guard weights MUST propagate with the pattern.*
2. **Read the sample-count-aware LOWER BOUND, not the point estimate.** cards 9,25,19,34. Site: the SAME `decideVerdict` ASSERT/HEDGE boundary. **Ripple: MED-HIGH** (they interact multiplicatively — stack all four ungated → permanent HEDGE, starving DELIVER-DONT-DEFER). Cascade 25→{34,19,9}. *Guard: the RANK_RESEARCH exemption MUST propagate or EXPLORE gets vetoed; the de-duped distinct-count is a single shared point of failure.*
3. **Gate on per-source IDENTITY/dependence, not a conserved aggregate or raw count.** cards 3,6,10,20,26,27. Site: `shintai-dispatch.mjs` (the real orchestrator) + `lane-calibration`. **Ripple: MED.** One shared build (calibrated-per-lane-verdict schema) unlocks all six. *Guard: the correlation/shared-base-model tag MUST be a mandatory field or the whole family treats correlated lanes as independent witnesses.*
4. **A shared resolved-outcome log unblocks a whole family.** cards 11,12,27,18,19. **Ripple: LOW to build (additive), HIGH if shipped on a biased log.** Cascade [build log]→{11,12,27,18,19}. *Guard: each sibling inherits its drift correction.*
5. **Composable read-only architecture-graph analyzers.** cards 4,16,17. Site: `yuri-graph-state.json` + visual-introspection. **Ripple: LOW** (read-only, 124² trivial) — the safe-to-cascade family. Cascade 4→{16,17}, mutually validating. *Guard: card 16's structural-VETO must whitelist intentional hub-and-spoke chokes before it gates merges.*

---

## 6. Cross-reference engine improvements (built alongside — same keystone)

5 axes ([[cross-reference-engine]]): (1) unify the surfaces; (2) **mechanism-signatures not lexical** — *the lever*, and the SAME per-node pattern-tagging the propagation engine needs for precision; (3) live-verification/drift-detection baked in (mechanizes the continuity law); (4) confidence + provenance per hit; (5) continuous + externalized (the circuitry instrument as its live face). **Axis 2 is shared with §4's precision layer — build once, upgrade both organs.**

---

## 7. Recommended sequencing

1. **Wave-1 architecture-graph engine (card 4 → 16 → 17).** Read-only, zero risk, ships today, highest evidence-per-token, AND it is the propagation engine's structural lens + the cross-ref engine's structural surface. One build, three payoffs.
2. **Wave-1 Tier-1 kernel primitives (24, 28, 27, 3)** — grow the central engine, each behind its regression canary.
3. **Mechanism-signature tagging** (cross-ref axis 2 + propagation precision) — the keystone unlock for everything downstream.
4. **Wave-1 cortex/energy/memory pure-function organ hardening (8, 32, 14, 29-H1, 33, 34, 36)** — bespoke per-organ engines, advisory-first.
5. **Wave-2 resolved-outcome log** — the family unlock (5 cards).
6. **Propagation engine V1** (`propagation-scan.mjs`, read-only) — once signatures exist.

---

## 8. Open moat threads held (don't lose — breadth)

- **T3 MUSUBI ONE packaging** (was parked until "the math research lands" — it has now; this roadmap is the input). [[moat-activation-4track-2026-06-03]]
- **CAPSTONE: deep red-team on the YURI CODE** (logic flaws, invariants, races, the energy math, memory governance, the breaker).
- **OpenClaw install-time write-path portability** (T3 sub-requirement).

---

## 9. Guard discipline (propagates WITH every transfer — non-negotiable)

- **Regression canaries** on every kernel change (`negEntropy===klDivergence` to the digit; `entropy(maxEnt) ≥ current`; "reproduces patched decisions on every fixture").
- **FREEZE the guard weights** `{η=100 protected-path, θ=10 ladder-floor, λ=50 fail-closed, κ=5}` — barrier terms, never tradeable.
- **Advisory-first / owner-gated** for anything touching the enforcing energy core or the verdict ladder that gates real mutations.
- **RANK_RESEARCH exemption** on every cortex veto — never punish legitimate EXPLORE divergence.
- **Continuity law** ([[circuitry-change-propagation-continuity]]): every change → update graph + viz/engine + manual + re-verify + `ai reindex`, in one motion.
- **Verify vs LIVE code, not the catalog** — catalog line-numbers drifted ~1 day; mechanisms survive but pointers don't.

---

## 10. Owner directives — 2026-06-04 (decoded, captured)

### 10.1 Circuitry wiring + VARIABLE node sizing (note)
Everything built here must be wired into the circuitry per [[circuitry-change-propagation-continuity]] — but only as it goes LIVE (no phantom nodes for unbuilt engines; the graph models reality, not plans). **New render principle:** the circuitry is NOT one-size-for-all — a node's visual mass (die-block / pin / diode size) scales with **how much that node does** (weight, throughput, fan-out, centrality). Heavy organ → big; tiny helper → small. **Principled, not hand-set:** the architecture-graph engine (§3 Wave-1: card 4 degree/spectral-centrality, card 16 betweenness/articulation, card 17 Forman-curvature) computes exactly the metrics that drive node size. So `nodeSize = f(structural-analysis)` — the sizing IS a readout of the analysis. Add a `size`/`weight` field to the graph schema (currently absent: nodes carry only id/label/layer/files/triggeredBy/description) sourced from the engine. Home for the render rule: circuitry BUILD-MANUAL.

### 10.2 Offload organ → CROSS-REFERENCE ENGINE (repurpose + rename) — DELICATE, STAGED
Owner clarification (2026-06-04): the offload deletion order was about the **outdated CONTENTS**, NOT killing the organ slot. New plan: **delete the outdated offload guts, install the cross-reference engine in that slot, then RENAME the sector.** The sector = the `Skills & Orchestration` layer nodes (`offload-contract`, `offload-runner`, `startup-offload`-misnomer, `shintai-dispatch`, `scout-orchestrator`). This does NOT revive cards 5/7 — the dispatch CONTENTS (lane bandits, token-ledger) still go; the SLOT is reborn as cross-ref.
- **Why staged, not now:** offload-contract has ~16 live importers; the cross-reference engine does not exist yet. Ripping it out before the replacement is built = reckless (owner said "be very delicate"). The continuity law forbids a false graph rename (claiming cross-ref where offload still lives = a lie).
- **Careful build order:** (1) build the cross-reference engine (V1 = `propagation-scan.mjs`, §4) + the architecture-graph engine (§3 Wave-1); (2) migrate the ~16 importers off the offload husks (the native-only Phase-4 work — HIGH blast radius, LAST); (3) delete the outdated offload contents; (4) install cross-ref in the slot; (5) RENAME the sector (graph node ids/labels + `Skills & Orchestration` layer → e.g. `Cross-Reference & Orchestration`) across the graph + registries + docs in ONE motion; (6) re-verify + `ai reindex`. Each step owner-gated.

### 10.3 Subconscious / memory-getting-full (diagnosed 2026-06-04)
The subconscious consolidator (`kagami-memory-consolidator.mjs`) IS healthy and correctly targets the Claude memory dir (line 23) including `MEMORY.md`. Live log (2026-06-04 04:00 + 10:00, `execute=true`): `demote-candidates=0 → demoted=0`, and `rapid-mlx not available — skip`. Root cause of the bloat: (a) FSRS demote threshold too lax — never retires even clearly-superseded session-resume anchors; (b) the smart LLM redundancy/dedup pass is DOWN (local Qwen `rapid-mlx` server offline) so overlaps never merge; (c) MEMORY.md index entries are verbose (>200 char limit). **Fix = the roadmap eating its own cooking:** cards **14 (MDL/gzip redundancy)** + **30 (Jaccard saturation)** are embedding-free, LLM-free dedup — wiring them makes the subconscious work WITHOUT depending on the offline model. Plus: tune the FSRS demote threshold to retire superseded session anchors; restart `rapid-mlx` (or drop the dependency); keep MEMORY.md entries terse. Immediate relief done: stale session-resume index entries trimmed.

## 11b. Shaped seams + prior art (2026-06-04) — companion doc
The 3 architectural seams (mechanismPattern taxonomy · lifecycle loop · node-size-as-living-activity) are shaped, adversarially critiqued, and grounded in a competitive study (Semgrep/OpenRewrite/CodeQL · Rosie/Renovate/Sourcegraph/Refaster · CodeScene/CodeCity/Gource/Kiali/d3-collide) in `02_RESOURCES/research/three-seams-shaped-with-prior-art-2026-06-04.md`. **Key correction landed there:** the unifying UNIT is the circuitry-graph NODE, not the formula-card (mechanismPattern tags cross-organ code mechanisms, which are mostly NOT formula cards). Three render channels, one owner each: structure→size · pattern→color/edges · heat→breath. Propagation must match on SEMANTIC STRUCTURE (GitNexus call-graph), not lexical tokens — the #1 prior-art transfer, killing mechanism-fit theater before propagation-scan ships.

## 11. Cap-correction note (2026-06-04)
§4's cascade bound was corrected after owner challenge ("why cap at 5? too harsh"): the safety is recursion-depth=1 + cooldown, NOT a proposal count; surface all above the confidence floor, tiered + paged with visible `(N−K) more` — never silent truncation. See §4.

---

*Evidence base: 8-cluster seam-verification workflow + propagation pattern-map + 3-design judge (2026-06-04) + live subconscious-log + circuitry-graph inspection. Full structured result in the session transcript. This roadmap is the synthesis; it is advisory until each step is built + locally verified.*
