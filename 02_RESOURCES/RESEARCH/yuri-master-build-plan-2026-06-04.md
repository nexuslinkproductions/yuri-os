# YURI Master Build Plan (2026-06-04)

> The full-system build spec, synthesized from a 14-agent cross-reference sweep of all 9 circuitry layers + 5 cross-cutting seams. **112 improvements + 96 drift findings.** This doc is the ORCHESTRATION layer (waves, clusters, fleet, loadout); the verbose per-item agent scopes + verification live in the appendix `full-system-sweep-detail-2026-06-04.md`. Builds on `yuri-math-engine-and-propagation-roadmap-2026-06-04.md` + `three-seams-shaped-with-prior-art-2026-06-04.md`. Advisory until each item is built + locally verified; owner gates all mutations.
> Item ids are namespaced `<AREA>·<localid>` to deduplicate (agents collided on ENG-*/MEM-*). Area codes: NRG=Energy&Math · MEM=Memory&Subconscious · RET=Retrieval&Knowledge · GOV=Governance&Safety · COG=Cognition&Persona · LRN=Learning&Continuity · SKL=Skills&Orchestration · TOK=Token&Session · HID=Hidden/Meta · XRE=cross-ref-engine-axes · MTH=math-tier-contract · MGV=memory-governance · OFM=offload→xref-migration · PKG=packaging+portability+CAPSTONE.

---

## BUILD STATUS — live log (kept synced each wave; model = reality)
> Orchestrated as Workflow fleets, build→adversarial-verify each, owner gates commits. **COMMITTED + PUSHED:** `e0302fe0` (waves 0 + 1a + lifecycle + memory-dedup + xref + code-bible + docs, 47 files) · `1482d46a` (Wave-1b energy subsystem — beliefWidth→MaxEnt live + Tier-2 advisory + L∞ veto inert) · `601510d1` (conscience red-team fixes — energy/cortex/memory/xref/kernel/paths, 28 files, **302 green**) · `4f71bb76` (circuitry-indexed lane equipping + master-navigation proposals). `ai reindex` still deferred (shared DB + concurrent lanes). Detail: memory `[[wave0-foundations-done-2026-06-04]]` · `[[redteam-conscience-findings-2026-06-04]]`.

**✅ WAVE 0 — DONE (7 built + verified, 1 census).** KERNEL phantom→registry (MATH-01), `yuri-paths.mjs` (PORT-01), provenance gate (XREF-04), drift-detector (XREF-03), deferred-outcome labeler+trace-fix (ENG-07/08), MEMORY mtime-fix+telemetry-exclude (MEM-02/04), offload census (XREF-00). All suites green. Owner decision landed: **route-plan → INTO the cross-ref engine** (recorded §10.2; census corrected 4→**6** consumers).

**✅ WAVE 1a — DONE (6 items).** KERNEL Tier-1 primitives (cards 24/28/27/3 + PC-2 CUSUM/Kalman kit + MATH-04/05, canaries numerically proven), read-only ARCH-ENGINE lens (cards 4/16/17; **empirically falsified the Cheeger≈Forman≈Tarjan triple-equality** — Tarjan bridges are orthogonal; roadmap §3 corrected), MEMORY LLM-free dedup (yuri-mdl + yuri-jaccard, PC-6; caught+fixed a poisoned-`superseded` bypass), MATH-07 cortex↔kernel verification (the 1b de-risker), LIFECYCLE gap-scan (rebuilt to three-seams §SEAM-2 after first build missed it; **+ closed two silent-degrade blind-spots: loud `GAP_UNMAPPED_DOMAIN` + fail-loud config invariant**), XREF-01 unified `ai xref`. 123 tests green; graph read-only throughout.

**✅ WAVE 1b — DONE (3/3 pass, live-safe; 6 suites green: cortex 57, energy 28, kernel 23, breaker 28, hardening 17, advisory 15).** CORTEX: the owner-approved beliefWidth→MaxEnt seam landed LIVE (card-34 distinct-count + card-28 MaxEnt λ-width, retiring the magic Gaussian constant) — `aggregateU 280.71536831 → 280.64846761` (Δ −0.0669, 100% the ε/info-gain term; entropy/KL/staleness byte-identical). card-8 ablation pure/additive; card-36 Jeffrey + UCB1 HEDGE built but **flag-gated OFF** (no live verdict change). card-34's literal UCB formula contradicted its own test → behavioral-spec form shipped (decays as effort grows), owner-confirm pending. TREND + ENERGY Tier-2: **advisory-only, live tick verdict + breaker trip BYTE-IDENTICAL proven** (zeta/Kalman/CUSUM/KKT computed, NOT wired to the live gate — Wave-3 owner-gated).

**🔨 WAVE 2 — IN PROGRESS (2026-06-05).** First item landed: **`propagation-scan.mjs` — the cross-reference engine V1** (OFM·XREF-01 / roadmap §4, the sector-repurpose gate). Read-only ESM CLI: `node propagation-scan.mjs <node-id>` → context-confirmed structural mechanism-siblings + JSONL backlog. Built via a 2-round adversarial cert loop: **round 1 caught a real lexical→structural laundering defect** (gitnexus `query` BM25 hits relabeled `edgeKind:'calls'` → graded 0.97 structural; independent verify caught what self-attack missed); **round 2 fixed it** with a lexical-vs-structural firewall (`query`=recall/nominate, `context`=structural gate via candidate-outgoing; prose/.md/.json/protected hard-excluded; no fabricated edge-kind). 9/9 hermetic tests incl. a falsification negative-fixture (T8) + writes-laundering regression (T9); fail-closed/no-mutation clean; graph byte-identical. **Honest outcome:** the live gitnexus index drops `shintai-dispatch`'s real CALLS edge to `traceDispatchEvent` (both directions, even at HEAD) → shintai surfaces at 0.425 *honest-lexical* with an "index dropped the edge" mismatch, NOT a laundered 0.97. `offload-runner` is the one context-confirmed structural sibling (0.97). **UNCOMMITTED** (2 new files: `_SYSTEM/Scripts/propagation-scan.mjs` + `.test.mjs`) — owner gates commit. Lessons banked: `[[gitnexus-query-is-lexical-context-is-structural]]`. Follow-up: the gitnexus edge-resolution gap is upstream (affects `xref-query`'s structural leg too — shared index).

**⚠️ CONCURRENT ENERGY-CORE LANE (2026-06-04):** a second interactive session (`3d279e0a`, VSCode) is implementing **NRG·ENG-02** (the L∞ `maxSeverityVeto` into `gateProposal`, owner-gated Wave-3) in `yuri-energy.mjs` + `claim-cortex.mjs` — the same files Wave-1b touched. It coexists cleanly (inert: `cap=Infinity` default, no live caller arms it; 28/28 energy green). **COMMIT ENTANGLEMENT:** those 2 files now carry BOTH Wave-1b (beliefWidth/advisory) and the concurrent L∞ work — a scoped commit needs hunk-level care or cross-lane coordination.

**MEMORY subconscious:** seeded — 5 genuinely-superseded session-resume anchors relocated to cold (reversible, `relocated/`); the 2 live 06-04 anchors kept HOT; stale empty `memory-cold.db` deleted. `cold:5`.

**DEFERRED (collision/safety):** the ~30-item DRIFT-SWEEP + ARCH-ENGINE's graph-`size`-field write + circuitry BUILD-MANUAL render rule — unblocked now that the circuitry session has committed, run once it fully settles. Live energy-core/breaker WIRING → owner-gated Wave 3.

---

## 0. How to use this — the PROPORTIONAL agent loadout ([[build-agent-context-loadout]])
Match the context handed to each build agent to its task. **Not every item gets the full loadout** (that was the corrected overkill).
- **LIGHT** (the drift-fixes, single-file mechanical) → the scoped item + its appendix entry + 1-2 pointers. Trust `ai search` for the rest.
- **MEDIUM** (a pure-function transfer in one organ) → item + its Code-Bible card(s) + the transfer card + cross-ref tools + guard contract.
- **FULL 7-part** (multi-organ / shared-contract / high-blast — the propagation clusters, the migration, the enforcing-core, CAPSTONE) → brain+persona + circuitry overview + Code Bible + research + cross-ref tools + guard/continuity + scoped item.
**PREREQ for the loadout to deliver excellence:** the Code Bible (`02_RESOURCES/CODE-BIBLE/`) is currently **viz-only (6 cards)** — expand it to cover math/memory/governance/security mechanisms before relying on it outside the viz layer (see Wave 0, `PREP-CODEBIBLE`).

---

## 1. Inventory at a glance
| Area | improvements | drift |
|---|---|---|
| NRG Energy & Math | 10 | 7 |
| MEM Memory & Subconscious | 10 | 8 |
| RET Retrieval & Knowledge | 8 | 6 |
| GOV Governance & Safety | 7 | 5 |
| COG Cognition & Persona | 7 | 7 |
| LRN Learning & Continuity | 8 | 5 |
| SKL Skills & Orchestration | 8 | 7 |
| TOK Token & Session | 11 | 11 |
| HID Hidden / Meta | 8 | 7 |
| XRE Cross-ref engine axes 1/3/4 | 6 | 8 |
| MTH Tier-1/2 math contract | 7 | 6 |
| MGV Memory governance overhaul | 7 | 8 |
| OFM Offload→xref migration | 7 | 5 |
| PKG Packaging + portability + CAPSTONE | 8 | 6 |

---

## 2. PROPAGATION CLUSTERS — the broad-aware payoff (same fix, multiple organs → build once)
These are where ≥2 agents independently found the same mechanism/fix. Each is ONE build that ripples — the upgrade-propagation doctrine validated empirically by the sweep. **Build these as single full-loadout efforts, not N siloed copies.**

- **PC-1 · Single-source the protected-path truth.** Found in GOV·ENG-07, HID·HID-03, RET·RK-03, GOV·ENG-01 — `bash-security-guard` + `operator-write-guard` + `evidence-contract.mjs` + pre-tool-use each hardcode their own protected-path list; `lane-kernel`/`artifact-registry.isProtectedPath` already owns the canonical one. Collapse all onto the canonical source (fail-closed). Security-load-bearing.
- **PC-2 · CUSUM + scalar-Kalman trend math (cards #1/#2) as a reusable Tier-2 kit.** Wanted by NRG·ENG-04/05 (energy-tick surprise), SKL·ENG-06 (breaker), LRN·ENG-LC-04 (neuron-loop improvement_score). Build the pure functions once in the kernel; apply to 3 organs. The literal "one math wired → siblings get it."
- **PC-3 · mechanismPattern tagging pass.** MTH·MATH-02 + GOV·ENG-02 + SKL·ENG-02 + COG·07 — tag nodes with the v0 verb enum across organs in one schema motion (after MTH·MATH-01 mints the registry).
- **PC-4 · The dead-zeta / evidence-aging chain.** NRG·ENG-01 (Cox aging) + NRG·ENG-07 (deferred-outcome labeler) + the age-axis fix — resurrects the one verified-dead energy term AND unblocks learned-weights/conformal. The roadmap's "shared-prerequisite-unlock" pattern, live.
- **PC-5 · Resolve the cross-domain-transfer-engine PHANTOM, once.** RET·RK-06 + XRE·XREF-06 — CLAUDE.md claims it live; no module. Either the cross-ref engine BECOMES its real implementation (preferred — that's literally what we designed) or strip the claim. One decision, two call-sites.
- **PC-6 · The LLM-free memory dedup (cards 14+30) that fixes the live memory-full.** MGV·MEM-02/03 + MEM·MEM-05/07 — the subconscious is starved (demote=0, rapid-mlx offline); these are the embedding-free dedup that makes it work without the model. Fixes the bloat you're feeling now.

---

## 3. Dependency-ordered build WAVES

### WAVE 0 — Foundations + free drift-fixes (mostly LIGHT loadout, low risk, no deps; do first — they unblock + make the model honest)
**Foundations (depended-on):**
- `MTH·MATH-01` mechanism-pattern-registry + closed-set validator (keystone; MATH-02/03 + PC-3 depend).
- `NRG·ENG-07` deferred-outcome labeler (unblocks learned weights, conformal, Cox-β — PC-4).
- `MEM·MEM-02` content-hash-stable last-touch (unblocks the whole memory family; today demote scores off checkout-fragile mtime).
- `MGV·MEM-01`/`MEM·MEM-01` cold-seed the subconscious (breaks the bootstrap deadlock).
- `XRE·XREF-04` confidence/provenance schema + `XRE·XREF-03` drift-detector (unblock XREF-01).
- `OFM·XREF-00` importer census (load-bearing pre-work for the offload migration).
- `PKG·PORT-01` central path-resolver `yuri-paths.mjs` (unblocks portability).
- `PREP-CODEBIBLE` expand the Code Bible beyond viz (prereq for the loadout's excellence guarantee).
**Free drift-fixes (continuity-law cleanup — model=reality):** NRG·ENG-03 (cortex header), NRG·ENG-08 (trace label drift), MTH·MATH-06 (22-vs-23 count), RET·RK-01 (26k doc count), SKL·ENG-05 (startup-offload→skills-indexer rename), MEM·MEM-04 (telemetry exclusion), LRN·ENG-LC-03/06/07, GOV·ENG-03, COG·COG-01, TOK·ENG-08/09, HID·HID-04, MGV·MEM-04 (MEMORY.md hook-length cap — the overflow at source). *(~30 of the 96 drift findings are this-wave quick wins; the rest fold into their organ's item.)*

### WAVE 1 — Ready-to-wire pure functions + read-only analyzers (MEDIUM loadout, auto, low/med risk)
- **`ARCH-ENGINE` the architecture-graph engine (cards 4→16→17)** — owns node `size`; the structural lens for cross-ref + the propagation engine + node-sizing. Roadmap Wave-1 #1. *Start here — most depends on it.*
- Energy Tier-2: NRG·ENG-01 (Cox/zeta), ENG-04 (Kalman), ENG-05 (CUSUM), ENG-06 (MaxEnt), ENG-09 (KKT prune).
- Cortex Tier-2: COG·COG-03 (Pearl ablation), COG·COG-04 (UCB1 HEDGE). *(gate MTH·MATH-07 first: verify the cortex↔kernel composition.)*
- Memory Tier-2: MEM·MEM-05/06/07, MGV·MEM-02/03 (PC-6, the live-bloat fix).
- Token: TOK·ENG-04 (Information Bottleneck compaction).
- Trend: PC-2 (CUSUM/Kalman kit) → LRN·ENG-LC-04 + SKL·ENG-06.
- Kernel: MTH·MATH-04 (card-author the 2 unbound primitives), MATH-05 (proof-gate provenance harden).
- Loop-closer: `LRN·lifecycle-gap-scan.mjs` (read-only, ships today; derives organ from `domain`, math-sector allowlist).
- Cross-ref: XRE·XREF-01 (unified `ai xref`), XRE·XREF-03 (drift-detector).

### WAVE 2 — Hardening, the cascade families, the cross-ref engine proper (MEDIUM/FULL loadout)
- **PC-1** protected-path single-sourcing (security, fail-closed).
- Governance hardening: GOV·ENG-01 (.env READ fail-open), ENG-04 (worktree canon gap), ENG-05 (tirith fail-open default).
- **`propagation-scan.mjs` (cross-ref engine V1) with the STRUCTURAL signature leg** (GitNexus call-graph, never lexical-only) — XRE·XREF-01 dep; the offload-slot replacement (OFM·XREF-01).
- PC-3 mechanismPattern tagging pass; MTH·MATH-02/03 (node fields + Tier-2 engine skeleton).
- Memory cascade: MEM·MEM-01/03/08 + MGV·MEM-05/06 (FSRS tune + rapid-mlx graceful-degrade).
- Retrieval: RET·RK-02 (research-capture wiring), RK-04 (index-health), RK-05 (FTS5 injection harden).
- Token: TOK·ENG-01 (compaction feeder freshness), ENG-03 (unify 3 token-fullness signals), ENG-05/10 (bound history + stable bus id).
- Hidden: HID·HID-01/02 (excise dead pulse-orchestrator path), HID-07 (hook-order drift canary).
- LRN·ENG-LC-01/02 (yuri-health into the fabric + dream-loop schedule).

### WAVE 3 — Owner-gated / high-blast-radius (FULL loadout, OWNER-gated, sequential)
- **Enforcing core:** NRG·ENG-02 (L∞ veto into the gate), NRG·ENG-10 (Bregman trust-weighted drift). *Owner decision; freeze guard weights.*
- **The offload→cross-ref migration (delicate, staged):** OFM·XREF-00→01→02→03→04→05 (census → build V1 → migrate 4 route-plan consumers preserving the classifier → migrate offload-runner consumers → sector rename in ONE motion → stamp 5/7 MOOT + prune phantoms). HIGH blast (16 importers). + SKL·ENG-08 (rename, LAST).
- **Portability + packaging (MUSUBI ONE):** PKG·PORT-02/03 (migrate write surfaces + install-time config) → PKG·PKG-01/02 (naked-repo boundary + corpus-curation license gate).
- **CAPSTONE red-team:** PKG·CAP-01 (energy-session write-race, CRITICAL), CAP-03 (lock guard-weight barriers), CAP-02 (coordinated red-team on energy math + memory governance + breaker invariants).
- PC-5 phantom resolution (RET·RK-06 / XRE·XREF-06) — fold into the cross-ref engine landing.

---

## 4. The agent FLEET plan (how I orchestrate the build)
Each wave is a Workflow fan-out; loadout tier per the §0 contract.
- **Wave 0 fleet:** ~1 agent per foundation (FULL for MATH-01/XREF-04/PORT-01; MEDIUM for the labeler/cold-seed) + 1 "drift-sweep" agent batching the ~30 LIGHT drift-fixes (pipeline, one commit-group). PREP-CODEBIBLE = 1 FULL agent (it authors excellence cards).
- **Wave 1 fleet:** `ARCH-ENGINE` first (1 FULL agent — everything hangs off it), then a parallel fan-out of MEDIUM agents, one per transfer, each loaded with its transfer card + Code-Bible card + the target organ's node + cross-ref tools. Adversarial-verify each (build→attack→revise per [[feedback-substrate-cert-loop]]) before marking done.
- **Wave 2 fleet:** propagation clusters get FULL agents (cross-organ); single-organ hardening gets MEDIUM. propagation-scan.mjs = FULL (it's the cross-ref engine).
- **Wave 3:** sequential, OWNER-gated, FULL loadout, one careful agent per step with explicit pre/post verification + your approval between steps.
- **Standing discipline every dispatch:** protected paths, local-evidence-before-claims, continuity law (any change → graph + manual + reindex), adversarial self-attack before "done."

---

## 5. Through-line + cross-references
Everything keys on the corrected through-line: **the circuitry-graph node is the unit; structure→size, pattern→color/edges, heat→breath; propagate by verb matched on semantic structure, not lexical tokens.** The drift register (96 findings) IS the continuity-law debt — clearing it makes the circuitry an honest model again, which is the substrate the cross-ref + propagation engines traverse. The propagation clusters (§2) are the broad-aware doctrine proven by the sweep itself: the system told us where one fix ripples. Build order respects it: honest model (Wave 0) → structural lens + Tier-2 math (Wave 1) → cross-ref engine + hardening (Wave 2) → enforce + migrate + package + red-team (Wave 3).

*Evidence: 14-agent full-system sweep (1.79M tokens, 330 tool-uses, 2026-06-04). Full per-item scopes + the 96 drift findings: `full-system-sweep-detail-2026-06-04.md`. Advisory until built + locally verified.*

---

## 6. Cross-session notes — Nemotron-3-Ultra full-package eval (2026-06-04)

Added by a parallel Claude session; claims cross-referenced vs live code. Canonical capture: `02_RESOURCES/RESEARCH/nemotron-3-ultra-550b-eval-2026-06-04.md`. Filed by this plan's own wave discipline.

- **LANDED this session (owner-approved) — heads-up to the MATH-07/cortex (Wave 1b) session:** an L∞ max-severity floor landed in `gateProposal` — new `maxLadderInversionCap` param (default `Infinity` = OFF → byte-identical verdict for all existing callers) + `maxSeverityVeto` result flag, wired through `claim-cortex.gateClaimTransition`. Closes the documented delta-gate equal-magnitude swap (`5→5`) **when armed**. Adds `_SYSTEM/Scripts/math/yuri-energy-max-severity.test.mjs` (10 tests); 327 energy/cortex tests green. **It edits the `gateProposal` structural-floor region + `gateClaimTransition` — coexists with the live `maxEntBelief` MATH-07 seam; do not rewrite over it.**
- **→ WAVE 3 (owner-gated, live wiring):** ARM the L∞ floor live. `maxSeverityVeto` exists in `gateProposal` but is **NOT** in `energy-breaker.isCatastrophic`, so it never trips the breaker or reaches the `energy-enforce` PreToolUse deny — inert in the live enforcing path. Arming = add it to `isCatastrophic` + thread `maxLadderInversion` + a finite cap from config through `energy-tick-core`/`energy-breaker`. (Nemotron F2/FM5 + own-fix residual; **confirmed real**.)
- **→ WAVE 2 hardening (verify first):** possible `verifiedEvidenceCount` (ι) **double-count** across both axes — tool-event (`energy-tick-core.applyTransition` increments on mutating success) AND claim-axis (`claim-ledger.applyClaimTransition`→`claimGateFields`), both merged into `stateAfter` by `tickAndTrace` → evidence credit inflated (log-sat cap masks it at high volume). Adjacent to the existing ε-vs-ζ no-double-count canary. (Nemotron F3, cross-organ-inference; **NEEDS live verification**.)
