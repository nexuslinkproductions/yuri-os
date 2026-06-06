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
- **Residual / NEXT:** first-order PPMI + morphology only; true never-co-occurring synonyms need **second-order Reflective Random Indexing** (deterministic, seed-locked) — queued.

### Supporting math primitives
- `math/yuri-jaccard.mjs` — tokenize, jaccard, tfCosine, saturationProbe (Hopfield/AGS).
- `math/yuri-minhash.mjs` — deterministic MinHash + LSH banding + tuneBands.
- `math/yuri-mdl.mjs` — gzip marginal-bits (MDL redundancy; memory demotion).
- `math/math-kernel.mjs` — 23 shipped primitives (the central engine; reuse first).

## Parked / candidate math (not yet built — see math-primitive-candidates-parking.md)
- π · golden ratio (φ) · Fibonacci — golden-section search (derivative-free knob tuning), φ anti-resonance for sequencing, Knuth multiplicative hashing. PARKED.
- Second-order Reflective Random Indexing (token-expand synonym layer). QUEUED.

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
- 2026-06-06 — seeded; registered transfer-distance, matching engine, token-expand.
- 2026-06-06b — 8-attacker red-team + 2nd round (3 Codex + 1 DeepSeek): fixed matchLSH featureFn, MinHash a===MERSENNE, proof→V2 ship-config, SQL identifier whitelist, structuralConf/NaN clamps, fieldClassify spurious-match + tie-break, mechanismFrame unknown-family floor, bakeoff WINNER P1-P4, cooc/threshold guards. Core math proven sound (50k-trial completeness, 3M modAffine, MinHash bias<0.001). Tests: transfer-distance 18/18, corpus-match 27/27, proof 5/5.
