---
name: math-science-manual
description: LIVING dock-on guide to every math/science method translated into YURI — what it does, the math, the code, the sources, the proof, the status. Any LLM reads this to understand the math substrate. Parallel-develops as methods are built; peer to the llm-compat contract + circuitry BUILD-MANUAL. Update on every new method.
metadata: { node_type: manual, started: 2026-06-06, status: living }
tags: math_manual, science_manual, dock_on_guide, retrieval, distance, methods_registry
---

# YURI Math/Science Manual — the dock-on guide

> **What this is.** The single guide any LLM reads to understand YURI's math/science substrate so the work persists and compounds instead of evaporating. Peer to the llm-compat contract (`_SYSTEM/Scripts/llm-compat-contract.mjs`) and the circuitry `BUILD-MANUAL.md`. **Living doc — append a registry row whenever a math method is built or changed** ([[circuitry-change-propagation-continuity]]).
>
> **The three companion stores it indexes:** the **math logbook** (`math-theory-transfer-catalog-2026-06-03.md`, theory→organ transfers) · the **science-source ledger** (`sources/science-source-ledger.md`, cited papers in the DB) · the **Code Bible** (`02_RESOURCES/CODE-BIBLE/`, code mechanisms). This manual is the *map over all three* + the live method registry.

## Operating principles (the house law for all math here)
1. **Embedding-free, deterministic, CPU.** No trained models, no GPU, no RNG-at-query. FTS5/BM25 stats, set-similarity (Jaccard/MinHash/SimHash), compression/MDL, information theory, graph structure. (If a dense modality is ever needed, it is an owner-gated decision, kept as a *separate* modality.)
2. **Complete, not truncated.** Return all results above a threshold + the true count; never a silent top-N ([[completeness-cert-needs-total-counts]]).
3. **Prove on real data, cold.** Every method ships with a proof harness + a-priori frozen labels/thresholds; the proof can FAIL (and that failure is the finding). Adversarially verify before "done".
4. **Math to IMPROVE, not complicate.** Prefer the simplest mechanism that closes the gap. Reuse before reinvent.
5. **Reuse the kernel.** `_SYSTEM/Scripts/math/math-kernel.mjs` ships 23 primitives (entropy, klDivergence, crossEntropy, cosineSimilarity, dijkstra, softmax, brierScore, …). Reach for it first.

## How to dock on (LLM quickstart)
- Need to measure **how far two domains are** → transfer-distance engine (row 1).
- Need to **find all matches for a task in a corpus** → matching engine (row 2).
- Synonym/paraphrase misses in matching → token-expand collapse fix (row 3).
- A new mechanism to harden an organ → check the **math logbook** for a transfer card; if novel, add one (with smallest-experiment + adversarial verification), then register it here.
- A paper you pulled → add it to the **science-source ledger** + `ai reindex`.

## METHOD REGISTRY (living)

### 1. Transfer-distance engine — "how far is A pulled from B"
- **Does:** scores a cross-domain transfer (source domain A · mechanism M · target organ B); ranks far-but-holding transfers (innovation) above near or broken ones.
- **Math:** `distance` = field-taxonomy distance (source academic field → software/systems); `bridge` = min-reconstruction of M on both sides (= Ben-David joint-error floor = Vitányi K(x|y)); `value = distance·bridge·structuralConf`, fail-closed gate. **CORRECTION (red-team):** value is **monotone in distance×bridge** with a fail-closed floor — the gate only *caps* the broken-far tail, it does NOT literally invert the slope. Uzzi's empirical inverted-U pattern emerges because far-but-incoherent transfers have low bridge → low value; the score function itself is monotone, not an inverted-U.
- **Code:** `_SYSTEM/Scripts/math/transfer-distance.mjs` (engine, pluggable distFn/reconFn) · `transfer-distance-cores.mjs` (`fieldDistance`, `mechanismFrameDistance`, `scoreTransferV2`, `V2_CONFIG`) · `.proof`/`.bakeoff`/`.v2demo`/`.test`.
- **Proof:** P1=0.28 field separation; P1/P2/P3/P4 pass; 15/15 unit; 11/11 field-classify. Ship API `scoreTransferV2(t)`.
- **Sources:** gentner-1983-smt · bendavid-2010-domains · bennett-1998-infodist · uzzi-2013-atypical (ledger).
- **Residual:** mechanism-frame families partly logbook-seeded; prerequisite-blockers (MPC/VCG) need a separate gate.

### 2. Matching engine — "find ALL matches for a task in a corpus" (deterministic, complete, cheap)
- **Does:** given a query, returns the COMPLETE set of corpus items above a similarity threshold + true count; faster/cheaper than BM25; corpus-agnostic ({id,text}).
- **Math:** Jaccard set-similarity; **prefix-filter exact join** (Bayardo AllPairs / Xiao PPJoin) = complete + sublinear (sort tokens by rarity; any pair ≥ t shares a prefix token); MinHash+LSH (Broder/Indyk-Motwani) = optional approximate accelerator (recall reported, never claims complete); exact O(N) scan = ground truth.
- **Code:** `_SYSTEM/Scripts/corpus-match.mjs` (engine: matchExact · matchPrefixFilter · matchLSH · ftsQuery comparator · loadFtsCorpus adapter) · `math/yuri-minhash.mjs` · reuses `math/yuri-jaccard.mjs` · `corpus-match.test.mjs`.
- **Proof:** on 9,487 bug-bounty reports — prefix-filter 100% recall vs exact, 1.47ms (beats FTS5 top-10), 26/26 unit. Generalizes to memory/code/any corpus.
- **Sources:** broder-1997-minhash · indyk-motwani-1998-lsh · bayardo-2007-allpairs · xiao-2008-ppjoin · lemire-2016-roaring (ledger).
- **Residual:** LSH path probabilistic (use prefix-filter for completeness); tokenization collapse → row 3.

### 3. Token-expand — kill the tokenization collapse (embedding-free semantic bridge)
- **Does:** bridges synonym/paraphrase/morphology so the matcher stops scoring semantic duplicates with disjoint vocabulary as 0.
- **Math:** **Expanded Feature Jaccard** — change the unit to a namespaced feature set: `tok:` (raw) + `c4:` (char-4-grams: morphology) + `sem:a~b` (symmetric PPMI co-occurrence concept-edges). Used identically in index+query+scoring → the prefix-filter stays COMPLETE. Precision via PPMI floor + top-N + minCooc + recalibrated (lower) feature-space threshold.
- **Code:** `_SYSTEM/Scripts/math/yuri-token-expand.mjs` (`features`, `makeFeatureFn`, `buildCooccurrence`, `ppmi`, `buildExpansionMap`, `charShingles`) → plugs into corpus-match `buildIndex({featureFn})`. Proof: `corpus-match.collapse.mjs`.
- **Proof:** disjoint-vocab pair (Jaccard 0) bridged at 0.108 via sem: edges; complete (pf==exact); precise (no distractors).
- **Sources:** church-hanks PMI · levy-goldberg 2014 (PPMI≈word2vec) · kanerva/sahlgren RRI · jimenez soft-cardinality (ledger, session 2026-06-06).
- **Second-order synonym bridge — BUILT (2026-06-06c):** `buildSecondOrderMap`/`buildPpmiProfiles`/`sparseCosine` add `sem2:a~b` edges — terms with similar PPMI co-occurrence PROFILES are substitutable even when they NEVER co-occur (login≈signin, cosine 1.0). Chosen over RRI (Codex C7): deterministic, no seed/RNG/projection, fixed `Map<term,[syn]>` → symmetric keys keep the prefix-filter COMPLETE. Precision knobs: minProfilePpmi/minProfileDims/secondOrderFloor(0.75)/secondOrderTopN(3)/excludeFirstOrder. OPT-IN via `makeFeatureFn({secondOrder:true})` (default off — shipped feature space unchanged). yuri-token-expand.test 62/62; mutation-tested. Sources: levy-goldberg 2014 (PPMI-vector cosine ≈ word2vec).

### 4. π / φ / Fibonacci applied primitives — efficient comparisons, intervals & time-phases
- **What:** the breakthrough is NOT "φ is magic" — φ/Fibonacci are the efficient way to spend COMPARISONS, INTERVALS, or TIME-PHASES when the structure is already 1-D, ordered, or resonance-prone (owner directive 2026-06-06: build these INTO NEXUS CORE, not park them).
- **Math:** `goldenSectionSearch` (φ-ratio derivative-free unimodal minimization, one eval/step — Kiefer 1953) · `fibonacciSearchMin` (discrete unimodal argmin, φ-bracket + exact residual scan = EXACT argmin in sublinear evals) · `phiPoint`/`phiSequence` (additive recurrence frac(x0+n/φ); three-distance theorem → ≤3 gap sizes = optimally-even anti-resonant cadence, no RNG) · `goldenAngle`/`goldenAnglePoints` (phyllotaxis θ=π(3−√5)·n — fuses π and φ for even 2-D/angular spread) · `fib`/`fibBig` (Fibonacci generator; BigInt path is the watermark seed source).
- **Code:** `_SYSTEM/Scripts/math/yuri-phi.mjs` · `math/yuri-phi.test.mjs` (42/42 — cold proofs + brute-force-verified Fibonacci search + three-distance check, all 3 core mutants killed).
- **YURI targets:** golden-section → scalar-knob tuning (energy weights/thresholds β/η/θ, saturation thresholds) without gradients/labeler once an objective is frozen · φ-cadence → polling/backoff jitter + sampling that must not phase-lock · Fibonacci search → discrete threshold-band locating · golden-angle → even node/hue layout in the circuitry-die viz ([[circuitry-auto-registration-regen-vision]]).
- **Right sequencing:** golden-section first (one scalar); Fibonacci search for finite ordered thresholds; φ-cadence before adding daemons; π/Fourier only after stable traces exist.
- **Sources:** Kiefer 1953 (sequential minimax) · Roberts quasirandom · Schretter/Kobbelt golden-ratio low-discrepancy · three-distance theorem (ledger, session 2026-06-06).

### 5. Math adapter contract — keep external math engines fenced
- **Does:** validates math adapter manifests and the lab harness manifest so external engines (Python/labs/proofs/accelerators/research) remain declared, capability-scoped, and unable to write runtime truth.
- **Math:** no numerical method; this is a fail-closed contract validator. It enforces closed sets for schema, runMode (`core|lab|proof|accelerator|research`), promotionStatus (`research|fixture|verified-baseline|owner-approved|blocked`), non-empty capabilities, and `writesRuntimeTruth:false`.
- **Code:** `_SYSTEM/Scripts/math/math-adapters.mjs` exports `validateMathAdapterManifest(adapter)` and `validateMathLabManifest(manifest)`; reads no files itself. The lab manifest consumer is `_SYSTEM/labs/math/lab-manifest.json`.
- **Proof:** `math-adapters.test.mjs` checks a valid adapter, rejects runtime-truth / empty-capability cases, and asserts every on-disk lab adapter is non-runtime and `writesRuntimeTruth:false`.
- **Residual:** validator-only; owner-approved adapters still emit a warning and still need separate artifact-registry / release-gate evidence before trust.

### 6. Math health — aggregate diagnostic over archive, adapters, formula banks, and core fixtures
- **Does:** runs a read-only health report for the math substrate: archive completeness, source-registry counts, lab-adapter manifest validity, formula-bank structure, proof-gate execution traces, and core primitive smoke fixtures.
- **Math:** composes existing certified primitives (`dijkstra`, `astar`, `brierScore`, `logLoss`, `bayesUpdate`, `weightedMean`, `dotProduct`, `softmax`) as smoke checks; it does not introduce new math.
- **Code:** `_SYSTEM/Scripts/math/math-health.mjs` exports `runMathHealth()` and also works as a CLI (`node _SYSTEM/Scripts/math/math-health.mjs`) returning schema `yuri.math-health.v0`.
- **Proof:** `math-health.test.mjs` asserts `ok:true`, 86 source-registry URLs, ≥3 formula banks, proof-gate ok with executable traces, adapter manifest ok, and A* matching Dijkstra on the pathfinding fixture.
- **Residual:** diagnostic/read-only; a passing health report proves the checked surfaces are coherent, not that every downstream math consumer is wired live.

### 7. Mechanism-pattern registry — closed v0 propagation verb taxonomy
- **Does:** owns the closed set of 5 mechanism-pattern verbs used by propagation/cross-reference surfaces, and validates the on-disk registry file for schema, semver version, promotionStatus, advisoryOnly, required fields, duplicate verbs, and witness shape.
- **Math:** no numerical method; this is a taxonomy integrity gate. The exported verb surface is immutable/read-only, and validation rebuilds a private Set each call so an importer cannot widen the closed enum.
- **Code:** `_SYSTEM/Scripts/math/mechanism-pattern-registry.mjs` exports `MECHANISM_PATTERN_VERBS`, `MIN_WITNESSES`, `validateMechanismPatternRegistry(registry)`, and `validateRegistryFile(registryPath)`; default CLI validates `_SYSTEM/data/math/mechanism-pattern-registry.json`.
- **Proof:** `mechanism-pattern-registry.test.mjs` checks the on-disk registry has exactly 5 verbs, rejects unknown 6th verbs, <2 witnesses, malformed witnesses, wrong schema, duplicates, missing fields, empty verb arrays, whitespace-padded witnesses, non-string witnesses, and exported-surface mutation attempts.
- **Residual:** advisory/read-only taxonomy; a new verb requires owner promotion plus ≥2 real `path:line` witnesses. Witnesses are shape-validated by this module, not existence-verified at runtime.

### 8. Energy trace deferred outcomes — append-only labels joined to gate decisions
- **Does:** adds a second append-only outcome stream for energy gate decisions, keyed by `runId`, then left-joins decision traces to the latest outcome per runId for replay/learning.
- **Math:** closed-set binary outcome label `{0,1}` plus deterministic latest-label reduction by `resolvedAtMs`; unresolved decisions remain visible (`outcome:null`) unless the caller requests `resolvedOnly`.
- **Code:** `_SYSTEM/Scripts/math/yuri-energy-trace-outcomes.mjs` exports `OUTCOME_VALUES`, `buildOutcomeRecord({runId,outcome,resolvedAt})`, `resolveOutcome(args, options)`, and `readJoinedDecisions(options)`; CLI prints a read-only join summary. It reuses `appendOutcome` / trace Privacy Gate from `yuri-energy-trace.mjs` and `readTraces` from `yuri-action-mode-study.mjs`.
- **Proof:** `yuri-energy-trace-outcomes.test.mjs` checks gate-passing record shape, strict outcome/runId/date validation, Privacy Gate canaries for secret/toJSON smuggling, append-only outcome writes, left-join semantics, resolved-only filtering, `0` versus unresolved `null`, orphan-outcome rejection, latest outcome wins, empty dirs, and torn-line tolerance.
- **Residual:** pure-additive observability; it does not change the live gate, breaker, or decision trace. Outcome truth is local/advisory until a separate process writes trustworthy labels.

### 9. Operational math simulation — deterministic advisory report over synthetic YURI workflows
- **Does:** builds a non-invasive report showing how existing math-kernel primitives could score memory ranking, context routing, RAG distribution shift, tool routing, release readiness, and creative scheduling.
- **Math:** composes `confidenceDecay`, `cosineSimilarity`, `weightedMean`, `weightedVariance`, `dijkstra`, `topologicalSort`, `klDivergence`, `crossEntropy`, `expectedValue`, and `softmax` over owned synthetic fixtures; the report carries a stable SHA-256 hash over sorted JSON sections.
- **Code:** `_SYSTEM/Scripts/math/math-operational-simulation.mjs` exports `buildOperationalSimulationReport()` and has a CLI that writes `_SYSTEM/reports/math-operational-simulation-2026-05-25.json` by default or prints with `--stdout`; registered in `_SYSTEM/labs/math/lab-manifest.json` as `operational-math-simulation-report`.
- **Proof:** `math-formula-card-professionalization.test.mjs` asserts deterministic hash stability, `advisoryOnly:true`, `localTruthClaim:false`, `writesRuntimeTruth:false`, context-route cost 5, RAG status `review_distribution_shift`, and the expected creative dependency order.
- **Residual:** synthetic/report-only; useful for demonstrating integration shape, not for promoting live routing/release decisions without real labelled data.

### 10. NEXUS numerology encoding channels — principles, not mysticism
- **Does:** adds opt-in deterministic feature channels for matcher recall: `num:` gematria bucket, `dr:` digital-root bucket, and `harm:` harmonic-ratio bucket. These augment the existing feature set only when requested; they are not a standalone metric and assign no meaning to numbers.
- **Math:** `gematria(text)` = bounded 32-bit symbol hash over normalized code points (collisions inevitable and expected); `digitalRoot(n)` = mod-9 ring homomorphism bucket in `1..9` with `0` as no-signal; `harmonicSignature(text)` = small adjacent-token ratio vector snapped to low-order rational buckets; `numerologyFeatures(text)` = namespaced feature Set.
- **Code:** `_SYSTEM/Scripts/math/nexus-numerology.mjs` · `_SYSTEM/Scripts/math/nexus-numerology.test.mjs`; `yuri-token-expand.mjs` wires the opt-in via `features(text, { numerology:true })` and `makeFeatureFn(items, { numerology:true })` (default off).
- **Proof:** test covers deterministic repeatability, digital-root mod-9 property, basic collision sanity/order sensitivity, bounded finite harmonic signatures, clean namespace merge, and default-off/opt-in feature wiring.
- **Residual:** refute-by-default on recall value; buckets may add false-positive candidates and need corpus-level bakeoff before promotion into any default matcher profile.

### Supporting math primitives
- `math/yuri-jaccard.mjs` — tokenize, jaccard, tfCosine, saturationProbe (Hopfield/AGS).
- `math/yuri-minhash.mjs` — deterministic MinHash + LSH banding + tuneBands.
- `math/yuri-mdl.mjs` — gzip marginal-bits (MDL redundancy; memory demotion).
- `math/math-kernel.mjs` — 23 shipped primitives (the central engine; reuse first).
- `math/yuri-phi.mjs` — π/φ/Fibonacci: goldenSectionSearch, fibonacciSearchMin, phiSequence, goldenAnglePoints, fib/fibBig (see registry #4).
- `math/nexus-numerology.mjs` — deterministic numerology encoding channels: gematria hash, digital-root bucket, harmonic-ratio buckets (see registry #10).

## Parked / candidate math (not yet built — see math-primitive-candidates-parking.md)
- π · golden ratio (φ) · Fibonacci — **READY tier BUILT** (registry #4: golden-section search, Fibonacci search, φ low-discrepancy cadence, golden-angle, Fibonacci generator). STILL PARKED: Knuth/Fibonacci multiplicative hashing (no measured bucket-skew), Fibonacci heap (no profiled graph hot-path), π/FFT spectral probe (needs stable sanitized traces).
- Second-order synonym layer — BUILT as PPMI-profile cosine (`buildSecondOrderMap`, sem2: edges); RRI was the alternative, PPMI-cosine chosen (deterministic, no seed). See registry #3.

## ⚠️ ADVISORY-ONLY (transfer-distance) — read before trusting a score
**The transfer-distance metric is an ADVISORY ranking aid, NOT a promotion gate.** It scores structural transfer-VALUE; defer real go/no-go to local evidence + owner judgment.
- **Implementation-viability (prerequisite) gate — BUILT (r2):** a transfer whose MISMATCH text names a hard unbuilt prerequisite (MPC card 22, VCG card 35) is routed to a **BLOCKED tier** (`detectPrereqBlocked` → `CAP_PREREQ_BLOCKED`), so it no longer reads INNOVATION. Proof assertion **F** enforces it (no FAR_BROKEN is INNOVATION). It's a deterministic *text* signal — it catches prerequisites that are STATED; a silently-missing one still won't be caught.
- **Residual:** the proof validates **median** separation; non-prerequisite instance inversions remain possible (a NEAR card can outrank a far card classified into a CS-adjacent field). Field-distance is a 1-D curated heuristic. Tier/value = sort hint, not a verdict.

## Known limitations (red-team verified, 2026-06-06 — 8-attacker fleet + 2nd round)
- **Tokenizer is ASCII-only** (`[^a-z0-9]`): accented/CJK/emoji tokens are dropped (café→caf, 日本語→∅). By design (embedding-free); cross-vocabulary non-Latin duplicates are invisible until an NFKD-normalize pass is added.
- **Transfer-distance proof power:** field-distance is a curated lookup and the same author set the scale AND the NEAR/FAR labels → P1 is partly intra-rater agreement; field-distance dominates P2–P4, so the bridge terms are weakly tested by the logbook (5 NEAR / 6 FAR_HOLDS — statistically thin). The theater control + collapse proof test the bridge more directly. Treat the proof as validating the field-distance *ranking*, not as an independent bridge validation.
- **mechanismFrame is logbook-seeded:** MECH_FAMILIES is a curated taxonomy; a genuine mechanism outside the families falls back to coverage/operator-overlap, which conflates *different words* with *different structure* (queued fix: apply the token-expand feature-expansion to the bridge recon).
- **LSH is approximate** (false negatives by design): use exact / prefix-filter for completeness; LSH is the scale accelerator with reported recall.
- **Field-distance distances** (e.g. consensus_dist 0.42, survival 0.58) are a-priori judgments justified in the build plan, not yet calibrated from an external field-adjacency source.

## Changelog
- 2026-06-06e — NEXUS Rust kernel BUILT (`_SYSTEM/nexus-rs`, crate `nexus`): minhash/jaccard/phi/corpus_match ported BIT-EXACT from the JS reference; napi + wasm bindings both proven (cargo 19/19, napi 72/72, wasm 60/60 conformance — Node calls Rust, asserts exact). u128 mod_affine removed the JS f64 hi/lo hack. The JS modules remain the reference; the Rust kernel is the fast/portable delivery. Renamed from nexus-core to disambiguate from the nexus-engine billing crate. + circuitry-auto-register.mjs (matcher over the code+test corpus). Regenerative Nexus Guard designed (NG1).
- 2026-06-07 — NEXUS numerology encoding channels BUILT (`nexus-numerology.mjs`): gematria hash, digital-root mod-9 bucket, harmonic-ratio buckets, opt-in `makeFeatureFn({numerology:true})`; graph-node proposal added, default matcher behavior unchanged.
- 2026-06-06d — second-order synonym bridge BUILT (PPMI-profile cosine: buildSecondOrderMap/buildPpmiProfiles/sparseCosine + sem2: edges; login≈signin; opt-in, prefix-filter-complete; token-expand 62/62, mutation-tested). Circuitry math-board environment design (C9, recursive-phyllotaxis-v1 on yuri-phi, extends existing die) → design-queue.
- 2026-06-06c — test-coverage hardening + π/φ/Fib BUILT. New suites: yuri-minhash (47), yuri-token-expand (45), corpus-match.sqlsec (75, real-temp-DB ident() injection), transfer-distance.prereq (24). Replaced brittle PREREQ_BLOCKER_RE with a structured clause+proximity detector (r3, evades-resistant, no over-fire; proof F intact 6/6). Folded mutation survivors M6/M12/M13/M14/M16/M18 + C8 cold-vector pins. **Registered #4: yuri-phi.mjs** (π/φ/Fibonacci primitives, 42/42, owner directive to build-in not park). Suite green; mutation-tested (break→red→revert).
- 2026-06-06 — seeded; registered transfer-distance, matching engine, token-expand.
- 2026-06-06b — 8-attacker red-team + 2nd round (3 Codex + 1 DeepSeek): fixed matchLSH featureFn, MinHash a===MERSENNE, proof→V2 ship-config, SQL identifier whitelist, structuralConf/NaN clamps, fieldClassify spurious-match + tie-break, mechanismFrame unknown-family floor, bakeoff WINNER P1-P4, cooc/threshold guards. Core math proven sound (50k-trial completeness, 3M modAffine, MinHash bias<0.001). Tests: transfer-distance 18/18, corpus-match 27/27, proof 5/5.
