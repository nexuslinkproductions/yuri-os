# YURI Formula Foundry — Buildable Spec (Arbiter Synthesis)

> Status: **advisory until Marcel approves the build.** No code written by this spec. Synthesized from a 9-lane design wave (3 native streams, Gemma/DS1/DS2 workers, 3 Codex audits, 1 blind control) with every load-bearing claim cross-validated against live files. Date: 2026-06-08. Author lane: Claude/Opus arbiter.

## THE FINDING (what to trust, what to discard)

**Trustworthy signal — the blind control.** Three isolated cold agents (no leakage) independently converged on a **coupled pair of load-bearing cores**:
- **Core A — semantic/dimensional TYPING** of formula symbols (units / dimension / role: input·output·constant). This is the *legal-move generator* — combination is ONLY meaningful as output-type → input-type matching; without it the combiner emits dimensionally-incoherent expressions that still parse and evaluate (silent garbage).
- **Core B — a held-out, deterministic, EXECUTABLE VALIDATION ORACLE.** The only truth source. Runs a candidate on independent ground truth; everything else's correctness is *defined relative to it*.

They split only on ordering (Agent 0: typing primary; Agents 1+2: oracle primary) but agreed on both and that **typing must gate BEFORE testing** (typing collapses the candidate space so a finite test battery is trustworthy; an oracle auditing an infinite garbage stream is the textbook plausible-garbage trap).

**Discarded as confounded.** DS1 and DS2 both cite `schema.type_algebra` in `laneClaims.formulaUse`. This is **SEEDED, not convergence**: `buildFormulaSlate` (yuri-originator.mjs:1761) hard-codes `schema.type_algebra` in its `mandatory` set with a `+2` boost, and the DS1 brief named the card. DISQUALIFIED as independent evidence. (Verified at code: `const mandatory = new Set(['schema.type_algebra', ...])`.)

**Cross-validated against code — both cores already EXIST. The Foundry is ~90% reuse.**
- Core A (typing) lives on disk: `_SYSTEM/data/math/formula-banks/*.json` — bank cards carry `variables[{symbol,meaning,type,constraints}]`, `units{inputs,output}`, `inputConstraints`, `invalidInputs`, `domain` against frozen schema `yuri.math.formula-bank.v0`. Verified: information-theory.v0.json `shannon-entropy` card carries all of these + `implementedBy: math-kernel.mjs#entropy`.
- Core B (oracle) lives at `_SYSTEM/Scripts/math/math-proof-gate.mjs` — `runFormulaProofGate` invokes `FORMULA_IMPLEMENTATIONS[card.id]` (:25) against the real kernel, `validateFormulaCard` (:299) enforces the hard contract, `assertImplementedBySymbolResolves` (:372) **fail-closed refuses any card whose `implementedBy` kernel symbol is not a real exported function**. Verified worked example: `entropy([0.5,0.5],{base:2})` runs live through `math-kernel.mjs:24`.

What is genuinely missing: the **COMBINE/SYNTHESIS verb** and the **real-data BAKEOFF harness**. Everything else is ingest + wrap.

---

## ARCHITECTURE — Two cores, four verbs

The Foundry is a thin orchestration layer over two existing organs:

```
         CORE A: TYPING (legal-move generator)        CORE B: ORACLE (truth source)
         formula-banks/*.json + v0 schema             math-proof-gate.mjs + math-kernel.mjs
                  │                                              │
   ┌──────────────┼──────────────────────────────────────────────┼───────────────┐
   │ CATALOG      │ RETRIEVE          COMBINE (NET-NEW)            │ TEST           │
   │ inspectBank- │ yuri-match RRF +  composition type-algebra →  │ proof-gate +   │
   │ Directory +  │ centrality re-    type-checked operator-graph │ NEW bakeoff    │
   │ field adapter│ weight (reuse)    enumeration (DS1) → draft    │ harness (CX1)  │
   │ (reuse)      │                   research card (DS2)          │                │
   └──────────────┴──────────────────────────────────────────────┴───────────────┘
                            promotion ladder gates every upward move (CX2)
```

**Verb → organ map:**
| Verb | Mechanism | Status |
|---|---|---|
| **catalog** | `inspectFormulaBankDirectory` + new field-mapping adapter to one unified read-view | reuse + thin adapter |
| **retrieve** | `yuri-match` `fuseRecallAll(rrf)` over a registered `formula-cards` corpus + `yuri-navigate` centrality re-weight; **replaces** the substring leg in `buildFormulaSlate` | reuse + thin new module |
| **combine** | composition type-algebra (legal output→input chaining) → bounded RNG-free enumeration → draft `research` card | **NET-NEW (the real work)** |
| **test** | `runFormulaProofGate`/`runFormulaCounterexample` (synthetic + counterexample) + **new** real-data bakeoff harness over search-index / bug-bounty / code | reuse + net-new harness |

Hard invariant: **typing gates before testing.** A candidate that fails composition type-algebra never reaches the oracle. A candidate that passes typing is INERT (`promotionStatus:research`, `advisoryOnly:true`) until it binds a real kernel symbol AND a green worked example.

---

## REUSE MAP (path:why — all verified to exist)

- `_SYSTEM/data/math/formula-banks/*.json` (6 banks) — **the formula DB + Core A typing layer.** Rich v0 cards (notation/variables/units/inputConstraints/workedExamples/counterexamples/proofObligations/implementedBy). No new store.
- `_SYSTEM/config/schemas/yuri.math.formula-bank.v0.schema.json` — frozen card schema. Top-level required `[schema,id,version,promotionStatus,advisoryOnly,formulas]`; the per-card hard contract is enforced **in code** by `validateFormulaCard`, not by the JSON schema's `required`. Extend additively, do not replace.
- `_SYSTEM/Scripts/math/math-proof-gate.mjs` — **Core B oracle.** `:25` `FORMULA_IMPLEMENTATIONS` (id→kernel fn), `:210` `runFormulaProofGate`, `:299` `validateFormulaCard`, `:372` `assertImplementedBySymbolResolves` (fail-closed symbol check), `inspectFormulaBankDirectory` (catalog enumerator), `runFormulaCounterexample`.
- `_SYSTEM/Scripts/math/math-kernel.mjs` — 33 deterministic operator atoms (entropy, klDivergence, informationGain, bayesUpdate, cosineSimilarity, brierScore, dijkstra, astar, cusum, scalarKalman, bregmanDivergence, topologicalSort, …). The executable operator library every composed card binds to.
- `_SYSTEM/Scripts/yuri-originator.mjs` — `:51` `FORMULA_CARDS` (8 slate cards), `:118` `runOriginator` One-Port, `:274` `runFormulaCandidateSeed` (static 2-candidate stub to generalize), `:1759` `buildFormulaSlate` (the weak substring leg — the merge point for static∪synthesized), `:1780` `verifyFormulaUse` (gates LLM citations to the selected slate — unchanged).
- `_SYSTEM/Scripts/yuri-match.mjs` + `yuri-match-fusion.mjs` + `yuri-match-global-space.mjs` — cross-surface RRF recall in one shared feature space ("0.4-in-memory == 0.4-in-code"). Register `formula-cards` as a named corpus; `fuseRecallAll(cue,{fusion:'rrf',k:60})` is the intent→card scorer. Reuse wholesale.
- `_SYSTEM/Scripts/yuri-navigate.mjs` — `computeImpactCentrality`/`aggregateProcessCentrality` deterministic structural relevance (the `graph.impact_centrality` card names this as its hook). Structural re-weight leg.
- `_SYSTEM/Scripts/xref-query.mjs` — unified FTS5/graph/GitNexus retrieval for candidate context.
- `_SYSTEM/Scripts/corpus-match.mjs` — exact/prefix-filter complete matching with `totalMatched`/`totalAboveThreshold`/`scanned` (the **real-total-counts** primitive — kills truncation severity-laundering in the bakeoff).
- `_SYSTEM/Scripts/semantic-state-compiler.mjs` — the hallucination firewall: rejects derived-metric fields (`deltaU`,`entropy`,`riskScore`,…) in executable state containers. Reuse for the `derived_metric_smuggling` guard.
- `_SYSTEM/Scripts/math/yuri-energy.mjs` (`gateProposal`/`computeDeltaU`) — energy-reduction scoring axis + non-offsettable vetoes.
- `_SYSTEM/Scripts/math/yuri-mdl.mjs` — simplicity/MDL axis (prefer shorter operator chains).
- `_SYSTEM/Scripts/math/transfer-distance{,.bakeoff,-cores}.mjs` — A·M·B transfer triangle scoring (V2 `field+mechFrame`) as a **candidate-generation/ranking input, never as truth**; the `.bakeoff` is the **pattern to copy** (frozen P1–P4 obligations + winner selection), not the domain.
- `_SYSTEM/Scripts/math/mechanism-pattern-registry.mjs` — closed mechanism-verb taxonomy for candidate operators.
- `_SYSTEM/Scripts/math/math-health.mjs` — aggregate read-only health gate across banks/proof-gate/adapters.
- `_SYSTEM/OS_KERNEL/search-index.db` (429MB) + `03_NEXUS-LINK/bug-bounty/corpus/bugbounty.db` (4.4MB, 9,487 reports / 643 programs) — the real-data bakeoff corpora (both verified present).

---

## NET-NEW BUILD SURFACE (genuinely new code)

- `_SYSTEM/Scripts/math/formula-foundry.mjs` — the COMBINE/SYNTHESIS engine + verb dispatch. Exports: `catalogFormulas`, `coverageReport`, `composeOperatorSequences`, `synthesizeFormulaCandidates`, `draftFormulaBankCard`, `proofPreflightCandidate`.
- `_SYSTEM/Scripts/yuri-formula-retrieve.mjs` — the retrieve module: `cardsToCorpusItems`, `registerFormulaCorpus`, `retrieveSlate` (RRF + centrality, drop-in superset of `buildFormulaSlate` shape), `decipher`, `hookToAnchor`.
- `_SYSTEM/Scripts/math/formula-foundry-bakeoff.mjs` — read-only real-data bakeoff orchestrator (CX1 stages 1–3 over the corpora; generator≠scorer; deterministic recompute; real total counts).
- `_SYSTEM/config/schemas/yuri.formula-foundry.hypothesis.v0.schema.json` — candidate hypothesis schema (operators/sources/invariants/blockers/proof_plan/promotion_status).
- `_SYSTEM/config/schemas/yuri.formula-foundry.bakeoff.v0.schema.json` — bakeoff report schema (corpus manifest, counts, labels, baseline, scores, failures).
- `_SYSTEM/config/schemas/yuri.formula-foundry.promotion-record.v0.schema.json` — promotion-ledger record (CX2): gate, gate_script, hashes, evidence block, owner block.
- `_SYSTEM/data/math/formula-foundry/fixtures/*.json` + `labels/*.json` — frozen unit/adversarial fixtures and frozen real-data task labels (no labels ⇒ diagnostic-only).
- `_SYSTEM/Scripts/math/formula-foundry.test.mjs` — the adversarial test suite (see BUILD ORDER).
- **Additive schema fields (v0.1, optional, keeps 6 banks valid):** `sourceDomains[]` (existing `domain` is single-string) and `synthesisProvenance[]` (parent card IDs for combined formulas).
- **New op** `synthesize_formula` on `runOriginator` dispatch (advisory-only, guards already upstream at :122–137), and a `buildFormulaSlate` upgrade to merge static∪synthesized cards with `source:'static'|'foundry'`.

---

## COMPOSITION TYPE-ALGEBRA (from DS1 — the legal-move rule)

Operator A may feed operator B (`A ▸ B`) iff **all four** hold (deterministic, embedding-free):
1. **Shape subsumption** — `O_A.outputShape ⊆_struct I_B.expected_input_shape` over the canonical state surface.
2. **Field compatibility** — every field A writes that B reads matches by exact name AND its post-write value type satisfies B's `variables[].constraints`.
3. **No dimensional mismatch** — `O_A.units.output` compatible with `I_B.units.inputs` on the bridging fields (dimensionless→dimensionless; bits↛nats without explicit conversion). **This is the blind-control Core-A check made executable** — it is the line that rejects "length + time" / "probability into an energy slot".
4. **No circular write-read conflict** — `W_A ∩ W_B = ∅` unless B is an explicit idempotent refinement.

**Two typing surfaces, reconciled.** DS1's 8×8 matrix is keyed to the originator slate cards' `executableHook`/`outputShape` (the *canonical state* surface). The blind control means dimensional typing on the *bank cards'* `variables`/`units`. The Foundry must type-check on the **bank-card dimensional layer** (the real units/dimensions), using DS1's structural matrix only as the coarse state-flow DAG. Do not conflate them — the units check (rule 3) is the load-bearing one.

**Early rejection + bounding (DS1):** (a) precompute boolean compat matrix, O(1)/pair; (b) topological-sort enforcement — typing card first (in-degree 0), terminal gate last (out-degree 0); (c) incremental write/read-set conflict check O(k²). **Search collapse:** naive 8! = 40,320 → fixed endpoints → 6! = 720 → type-compat pruning → ~6–12 valid sequences. Cap at `MAX_FORMULA_SLATE_CARDS = 6` (≤4 middle ops). Deterministic tiebreak: fewer ops (Occam) → higher slate score → lexicographic ID. RNG-free, sorted, fully reproducible.

---

## SYNTHESIS VERB (from DS2 — generation kept hypothesis-only)

**Generation = cross-domain mechanism transfer.** Iterate `mechanism-pattern-registry × YURI-organ-surface` to produce transfer triangles (source domain A · shared mechanism M · target organ B), scored `distance·bridge·structuralConf` via `transfer-distance.mjs` (bridge = `min(recon(M,A),recon(M,B)) > 0.35`). Far + bridged = ranked innovation; far + unbridged = anti-theater-killed. **Every leap names all five fields: source / target / mechanism / MISMATCH / confidence** (confidence split structural-vs-literal). A transfer with no statable mismatch is capped at 0.35; a prereq-blocked transfer at 0.11.

**Kept hypothesis-only (the firewall):** a synthesized formula is a **new `promotionStatus:research`, `advisoryOnly:true` card** carrying `synthesisProvenance` (parent IDs). It is **INERT** — it does not enter the live slate, does not influence action — until it (a) binds a real `math-kernel` symbol via `implementedBy`, (b) passes a **green worked example** through `runFormulaProofGate`. The `semantic-state-compiler` is the hallucination firewall: a lane may submit operators/inputs/outputs, **never derived conclusions** (`entropy:0.42`, `deltaU:-0.15`) as executable state — `gateProposal` and the proof-gate compute all metrics themselves. **Creativity is unbounded at the hypothesis stage; only PROMOTION is gated.**

---

## BAKEOFF / VALIDATION ORACLE (from CX1)

**Test stages:**
- **0 — candidate intake:** compile to typed hypothesis card. Fail if prose-only, self-citing as evidence, or derived metrics accepted as inputs.
- **1 — synthetic unit fixtures:** all operators type-check; worked examples pass; invalid inputs fail with the exact expected error; byte-stable trace hashes. (reuses `runFormulaProofGate`.)
- **2 — adversarial counterexamples:** counterexample set **frozen before scoring**; author≠scorer; must-falsify cases include boundary/inversion/truncation/leakage/degenerate; 0 unexpected passes. (reuses `runFormulaCounterexample`.)
- **3 — real-data bakeoff:** run over `search-index.db` / `bugbounty.db` / code against **frozen labels/baselines**; scoring returns `totalMatched`/`totalAboveThreshold`/`scanned` (never top-N); beats incumbent + ablations on a predeclared threshold; holds across ≥2 task families or is scoped to one narrow domain; **all counts reconcile with actual corpus totals** (via `corpus-match.mjs`).

**Validity bar:** held-out frozen labels external to the generator; **generator≠scorer** (Foundry synthesizes, a separate deterministic scorer evaluates; LLM labels advisory unless frozen + independently reviewed); **no RNG/clock/sampling/LLM/top-N inside scoring**; every candidate runs against incumbent + null/random control; report carries corpus total + scanned + above-threshold + returned + omissions.

**What CANNOT be deterministically tested (state honestly):** open-ended future usefulness on unlabeled tasks; owner taste without labels; causal productivity/energy gains without operational-outcome labels; truth of symbolic channels beyond deterministic feature contribution; bug-bounty severity correctness where the disclosed label itself is noisy.

---

## PROMOTION LADDER (from CX2)

`hypothesis → simulated → counterexample-tested → proof-gated → real-data-bakeoff → owner-approved`. No rung skips.

| Rung | Gate | Existing script |
|---|---|---|
| hypothesis | compiles into operators/contracts/invariants/proof_plan; prose is advisory | `yuri-originator.mjs` seeds `hypothesis`; `semantic-state-compiler.mjs` rejects derived metrics |
| simulated | deterministic synthetic fixtures; reproducible record; energy preflight where it touches state; **no lane-supplied deltaU** | `semantic-state-compiler` + `yuri-energy.mjs::gateProposal`; `math-operational-simulation.mjs` is precedent (not full enforcement) |
| counterexample-tested | negative fixtures fail for the expected reason | `math-proof-gate.mjs::runFormulaCounterexample` |
| proof-gated | formula-bank-compatible card, non-advisory, real binding + worked examples + counterexamples + variables + assumptions + invalidInputs + failureModes + proofObligations | `math-proof-gate.mjs::inspectFormulaBankDirectory`; `math-health.mjs` |
| real-data-bakeoff | frozen corpus/labels/thresholds; generator≠scorer; deterministic recompute; result hash | `transfer-distance.bakeoff.mjs` (pattern only) → **net-new harness** |
| owner-approved | separate final gate; binds owner decision to exact formula hash + evidence hashes + scope | `math-adapters.mjs` recognizes `owner-approved` (warns evidence still required); **v0 banks lack this state → use a sidecar promotion ledger, do NOT weaken `verified-baseline`** |

**Promotion mutator:** refuses any status change unless a matching gate record exists (schema `yuri.formula-foundry.promotion-record.v0`).
**Demotion rule:** any promoted formula that later fails proof-gate / health / stale-baseline / real-data bakeoff / hook-resolution / derived-metric guard → demote immediately. Real-data regression → demote to `proof-gated`; broken hook/trace → demote to `hypothesis`. Append a `gate:"demotion"` record, no owner-override path.
**Derived-metric-smuggling guard (formula-specific):** a lane may never submit "this formula improves ranking" / "entropy dropped" / "deltaU is negative" as proof — only executable fields. `semantic-state-compiler.mjs` already rejects `deltaU`/`entropy`/`riskScore`/`componentDeltas`/…; the harness computes all metrics, the lane only proposes the formula.

---

## CANDIDATE-SOURCE CHANNELS (from Gemma — all capped at research)

**Existing catalogued domains** (truth-bearing, kernel-bound): information theory, probability/Bayesian, graph theory, geometry, calculus/optimization, physics/dynamics (Lyapunov/potential descent), control theory, mechanism-transfer. **Symbolic feature channels** (candidate generators, NEVER truth): numerology, alchemy/hermetic vocabulary.

**New deterministic candidate generators** (operator · input→output contract · one falsifiable test — all `research`/advisoryOnly, never promote past it):
- **Music-theory → `HarmonicIntervalCompression`** · in: raw sequential frequencies → out: normalized consonance/dissonance score (0,1) · *falsifiable:* two melodies mapping to identical normalized ratios must exhibit identical recurrence patterns in the graph neighborhood.
- **Frequency → `ResonanceWaveformAlignment`** · in: oscillatory signals (Hz) + system clock rate → out: phase interference delta · *falsifiable:* a frequency shift beyond ±5% of the primary operational frequency must produce a measurable drop in gate-transition stability.
- **Magnetism → `FluxDirectionalOrientation`** · in: vector-field magnitude + orientation indices → out: binary flow-constraint mask · *falsifiable:* an orientation-index change with no magnitude shift must hold the same mask across 100 iterations.

Hard rule: these PROPOSE combinations; they cannot move a card past `research`. They have no `implementedBy` kernel binding until one is written and proof-gated — so they are inert by construction.

---

## BUILD ORDER + TEST PLAN

**Order (typing before testing before synthesis-trust):**
1. **catalog** — field-mapping adapter (`toUnifiedFormulaCard`) over `inspectFormulaBankDirectory` ∪ `FORMULA_CARDS`; `catalogFormulas()` read-only enumerator. Add additive schema fields `sourceDomains`/`synthesisProvenance` (keep 6 banks valid).
2. **coverage cross-ref** — `coverageReport()` diffs `FORMULA_IMPLEMENTATIONS` keys ∪ kernel exports against bank-card IDs → `UNBOUND-PRIMITIVE`/`ORPHAN-CARD` worklist (the author-next list).
3. **retrieve** — `yuri-formula-retrieve.mjs`: register `formula-cards` corpus, `retrieveSlate` (RRF + centrality), drop-in for `buildFormulaSlate`'s substring leg; keep `verifyFormulaUse` unchanged.
4. **composition type-algebra** — the 4-rule `A ▸ B` checker on bank-card units/dimensions; precomputed compat matrix; topological + write/read-set pruning; bounded enumeration.
5. **synthesis** — transfer-triangle generator → mismatch-articulated candidate → `draftFormulaBankCard` (research/advisory + `synthesisProvenance`) → `proofPreflightCandidate` via `runFormulaProofGate`. New `synthesize_formula` op.
6. **bakeoff harness** — `formula-foundry-bakeoff.mjs` (CX1 stages over the real corpora) + promotion ledger + mutator.
7. **Last (per propagation law):** circuitry graph/manual update — only after code exists and verifies.

**Adversarial tests (the suite is the quality bar):**
- **determinism** — same candidate + frozen fixtures + frozen corpus snapshot → byte-identical trace/result hashes across two runs; ties break lexicographically; no `Math.random`/`Date.now`/LLM in scoring.
- **generator≠scorer** — assert the synthesis path and the scoring path share no state; an LLM-proposed label never scores itself.
- **no-promotion-without-green-worked-example** — a synthesized card with no resolving kernel symbol or a red worked example CANNOT leave `research`; assert `advisoryOnly:true` cannot coexist with a promoted state (already enforced at proof-gate.mjs:332-ish — add a Foundry-level regression).
- **dimensional-typing-catches-incoherent-combination** — feed a deliberately unit-mismatched A▸B pair (e.g. bits→length); assert rejection at composition time, before the oracle runs.
- **channels-never-promote** — assert music/frequency/magnetism cards are structurally incapable of exceeding `research` (no `implementedBy`, advisory-only).
- **derived-metric-smuggling** — submit `{entropy:0.42, deltaU:-0.15}` as executable state; assert `semantic-state-compiler` rejects with `derived_metric_smuggling`.
- **truncation/real-counts** — assert the bakeoff report's `totalAboveThreshold`/`scanned` reconcile with actual corpus totals (no top-N severity laundering).

---

## RESIDUAL RISKS + HONEST GAPS

- **Verification limit (this session):** `node` could not execute in this sandbox (every invocation, incl. `node --version`, threw an `AggregateError` at startup — an environment permission interception, not a YURI-code defect). Oracle liveness is grounded on **static code reads** (proof-gate.mjs verified line-by-line) **+ the Codex logs**: CX3 verified `math-health.mjs → ok:true, 6 banks, 42 executable proof traces`; CX2 smoke `math-proof-gate → ok:true, 5 verified-baseline banks`. Re-run `node _SYSTEM/Scripts/math/math-health.mjs` in a normal session before build to re-confirm green.
- **Two typing surfaces could be conflated.** DS1's matrix types the *state-flow* surface (originator slate `outputShape`); the blind-control core means *dimensional* typing (bank-card `units`/`variables`). The build MUST type-check on the bank-card units layer (the load-bearing one) and use DS1's matrix only as the coarse DAG. Conflating them re-opens the silent-garbage hole.
- **`owner-approved` has no home in v0 banks.** Forcing it into the formula-bank schema would weaken the `verified-baseline` meaning. Use a sidecar promotion ledger; do not stuff approval into prose.
- **Real-data validity needs labels.** Corpus *total counts* are not ground truth. Search-index needs frozen labeled query/task sets; bug-bounty severity may encode reporting/platform bias (stratify, don't trust raw). Unlabeled corpora produce **diagnostics, not truth claims**.
- **Overfit risk on frozen fixtures.** Require holdout labels + cross-corpus transfer before broad promotion; the proof-gate proves *executable correctness of a card*, NOT real-world validity — the bakeoff harness must close that gap and is the genuinely-new risk surface.
- **Transfer-distance stays advisory.** Innovation-looking scores never outrank local evidence + bakeoff labels.
- **GitNexus structural leg was stale ~1 commit** during the Codex xref runs (structural search downranked, not load-bearing here). Re-index before relying on structural retrieval evidence in the build.
- **Symbolic channels are inert by construction**, but a future author could write an `implementedBy` binding for one and proof-gate it — at which point it stops being "symbolic" and becomes a real kernel operator. That is allowed; the guard is that promotion still requires a green kernel-bound worked example, never the symbolic provenance alone.
