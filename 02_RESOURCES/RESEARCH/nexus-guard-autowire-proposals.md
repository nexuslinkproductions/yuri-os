---
name: nexus-guard-autowire-proposals
description: Dry-run proposals emitted by nexus-guard-autowire.mjs; canonical manual/graph writes remain owner-gated.
---

# Nexus Guard Autowire Proposals

Generated: 2026-06-06T17:41:48.764Z
Detector phase: 1-read-only-detector
Detector findings: 37

## Summary

- Command shims: 0
- Math registry stubs: 0
- Graph node stubs: 10

## Command Shim Proposals

_None._

## Math Manual Registry Stubs

_None._

## Circuitry Graph Node Stubs

### transfer-distance-cores

```json
{
  "id": "transfer-distance-cores",
  "label": "Transfer Distance Cores (registry stub)",
  "layer": "Energy & Math",
  "files": [
    "_SYSTEM/Scripts/math/transfer-distance-cores.mjs"
  ],
  "triggeredBy": "proposal-only — owner must classify import/CLI/hook trigger before graph merge",
  "description": "transfer-distance-cores.mjs was flagged by nexus-guard class G as built-but-unwired. Header: transfer-distance-cores.mjs — candidate STRUCTURAL distance metrics for the V2 bake-off. Each candidate implements the pluggable metric contract from transfer-distance.mjs: metric(x, y, opts) -> { d, lowQuality } (d ∈ [0,1], pure, deterministic, embedding-free) and is swapped in as opts.distFn. The bake-off (transfer-distance.bakeoff.mjs) runs each over the 36-card logbook and keeps whatever actually SEPARATES near from far (P1 ≥ 0.05), where the V1 surface-gzip blend failed (register-dominated, margin −0.01). Candidates (provenance): C2 operatorSkeletonDistance — Claude lane (Kimi's draft derailed). Gentner relations-not- attributes operationalized: keep a STRUCTURAL lexicon (operators + math primitives), DROP domain register nouns, distance over the skeletons. [gentner-1983-smt] C3 grammarNcd — Codex/gpt-5.5 lane. Re-Pair grammar compression + operator normalization; isomorphic mechanism → isomorphic rules → low d. [nevillmanning-1997-sequitur][larsson-2000-repair] C1 brotliNcd / C4 cdmDistance — DeepSeek lane (info-distance). [cilibrasi-2004-ncd][keogh-2004-cdm] Detected exports: CANDIDATES, FIELD_LEXICONS, FIELD_TO_SYSTEMS, V2_CONFIG, brotliNcd, cdmDistance, fieldClassify, fieldDistance, grammarNcd, mechanismFrameDistance, operatorSkeletonDistance, scoreTransferV2. Add-only graph stub; review trigger, edges, and description before canonical merge."
}
```

### transfer-distance

```json
{
  "id": "transfer-distance",
  "label": "Transfer Distance (registry stub)",
  "layer": "Energy & Math",
  "files": [
    "_SYSTEM/Scripts/math/transfer-distance.mjs"
  ],
  "triggeredBy": "proposal-only — owner must classify import/CLI/hook trigger before graph merge",
  "description": "transfer-distance.mjs was flagged by nexus-guard class G as built-but-unwired. Header: transfer-distance.mjs — Mechanism-Bridged Transfer Surprise (MBTS). Quantifies a CROSS-DOMAIN TRANSFER as a TRIANGLE, not a dyad: A (source domain) B (target domain) \\ / \\____ M (mechanism) ___/ Marcel's ask: \"the degree of how far something is pulled from a different domain and applied.\" The high-value innovation is NOT the nearest transfer and NOT the most alien one — it is the FARTHEST leap whose mechanism still HOLDS on both sides. This module measures exactly that and is the degree-layer the cross-reference engine's previously- BINARY bridge detector (`bucket.domains.length > 1`) was missing. ── THE FORGE (why this is new, not a re-skin of the three lane proposals) ───────────── Three independent designs (DeepSeek/math, Kimi/wiring, Codex/adversarial) + this lane converged on the triangle. The genuinely new commitments, each a deliberate rule-break: 1. DISTANCE IS NOT TAMED — IT IS GATED ON RECONSTRUCTION. The conventional move (Codex's inverted-U 4·d(1−d); DeepSeek's monotone-decreasing value) PENALISES far transfers because \"absurdly far is usually broken.\" That fights the thesis: a far transfer that HOLDS is the whole point. We do not penalise distance. We require the mechanism M to RECONSTRUCT against BOTH sides (the bridge term); a far-but-broken transfer dies at the bridge/gate, never at the distance. So far+holding ranks TOP. 2. CO-OCCURRENCE (NPMI) IS DEMOTED FROM DISTANCE-CORE TO A NOVELTY DISCOUNT. DeepSeek's knife: NPMI over OUR corpus measures \"what Marcel already wrote about connecting,\" not structural domain-distance — and it is circular, because the engine's job is to surface NOT-yet-connected things. Using \"not yet co-occurring\" as distance is measuring the answer with the question. So the structural distance core is MDL (gzip compression), which is corpus-independent; NPMI, if used at all, only DISCOUNTS already-known links (optional layer, off by default, externalise the source side to break the self-dealing loop — not implemented here, documented as the upgrade path). 3. THE BRIDGE IS THE MIN OF TWO RECONSTRUCTIONS, NOT AN AVERAGE. M must compress against the WEAKER side. A mechanism that explains the source but not the target (or vice-versa) is vocabulary theater — the min kills it; an average would launder it. ── THE METRIC ───────────────────────────────────────────────────────────────────────── distance(A,B) = 0.6·NCD(A,B) + 0.4·jaccardDistance(tok A, tok B) ∈ [0,1] recon(M,X) = 1 − NCD(M,X) ∈ [0,1] bridge(A,M,B) = min( recon(M,A), recon(M,B) ) ∈ [0,1] valueRaw = distance · bridge · structuralConf ∈ [0,1] value = antiTheaterGate(valueRaw, signals) ∈ [0,1] value is monotone-increasing in BOTH distance and bridge: far AND holding ⇒ high. near (low distance) ⇒ low. far-but-unbridged (theater) ⇒ killed by min-bridge + gate. NCD (Normalized Compression Distance, Cilibrasi-Vitányi 2005) is the computable, embedding-free Kolmogorov-distance proxy — honours the no-RAG/FTS5-only house law. Built on the same gzip primitive as the memory MDL axis ([[yuri-mdl]] / catalog card 14); Jaccard is catalog card 30's set-overlap. The distance engine is itself assembled from logbook transfers and is validated ON the logbook — recursive and self-consistent. Pure + injectable: node:zlib only, no I/O, no clock, no config read. Mirrors the house style of yuri-mdl.mjs / yuri-fsrs.mjs so it is unit-testable in isolation. Deterministic (gzip level pinned). Advisory only — a ranking/retrieval aid, never a sole promotion gate. Detected exports: DISTANCE_WEIGHTS, GATE, MIN_CHARS, TIER, antiTheaterGate, bridge, detectPrereqBlocked, distance, jaccardDistance, ncd, recon, tierOf, tokenize, transferScore, v1BlendMetric. Add-only graph stub; review trigger, edges, and description before canonical merge."
}
```

### yuri-jaccard

```json
{
  "id": "yuri-jaccard",
  "label": "Yuri Jaccard (registry stub)",
  "layer": "Energy & Math",
  "files": [
    "_SYSTEM/Scripts/math/yuri-jaccard.mjs"
  ],
  "triggeredBy": "proposal-only — owner must classify import/CLI/hook trigger before graph merge",
  "description": "yuri-jaccard.mjs was flagged by nexus-guard class G as built-but-unwired. Header: yuri-jaccard.mjs — embedding-free hot-tier saturation probe for the memory consolidator. SOURCE THEORY — Hopfield associative-memory capacity (Amit-Gutfreund-Sompolinsky): past an interference threshold, mutual crosstalk between stored patterns degrades recall super-linearly. Saturation is governed by INTERFERENCE, not just per-item decay. THE TRANSFER — a deterministic hot-tier saturation probe over MEMORY.md hot entries: (1) token-set vectorize each entry (embedding-free — no shared coordinate space); (2) pairwise Jaccard (or tf-cosine) overlap; (3) load = (count of pairs above an overlap threshold) / N; (4) flag \"over-capacity → consolidate/dedup before recall degrades\" when load crosses an EMPIRICALLY-CALIBRATED threshold, and surface the most-overlapping pairs as DETERMINISTIC merge candidates. This DOWNGRADES the LLM-eyeball dedup in kagami-memory-consolidator.mjs from primary detector to tie-breaker — dedup signal now exists whether or not rapid-mlx is up. MISMATCH / RISK (per catalog card 30): do NOT hard-code the 0.138 AGS constant — it is cited only as structural justification for super-linear degradation; the load/overlap thresholds are TUNED knobs (sourced from energy-weights.json). The Hopfield pattern- completion / recall mechanism is PARKED (blocked by the embedding-free constraint). Pure + injectable: no I/O, no clock, no config read. Mirrors yuri-fsrs.mjs house style. Detected exports: jaccard, saturationProbe, tfCosine, tokenFreq, tokenize. Add-only graph stub; review trigger, edges, and description before canonical merge."
}
```

### yuri-mdl

```json
{
  "id": "yuri-mdl",
  "label": "Yuri Mdl (registry stub)",
  "layer": "Energy & Math",
  "files": [
    "_SYSTEM/Scripts/math/yuri-mdl.mjs"
  ],
  "triggeredBy": "proposal-only — owner must classify import/CLI/hook trigger before graph merge",
  "description": "yuri-mdl.mjs was flagged by nexus-guard class G as built-but-unwired. Header: yuri-mdl.mjs — Minimum Description Length redundancy axis for the memory loop. SOURCE THEORY — MDL (Rissanen two-part / crude code): keep item m iff L(m) < L(m | rest-of-store). An item's worth is its IRREDUCIBLE description length GIVEN everything else. A redundant restatement compresses to ~nothing against the rest of the store; a unique insight does not. THE TRANSFER — a real, computable, embedding-free L(m|rest) proxy via gzip distance: marginalBits(m, rest) ≈ len(gzip(rest + m)) − len(gzip(rest)) normalized by len(gzip(m)). NOT BM25 (that is relevance, not reconstruction). A near-duplicate of the rest adds almost no compressed bytes → low marginalBits → REDUNDANT. A lexically novel body does not compress against the rest → high marginalBits → IRREDUCIBLE. Used by memory-relocator.planRelocations as a SECOND, orthogonal demotion axis: demote iff (R < rFloor AND marginalBits < redundancyFloor) — keep if EITHER retrievable OR irreducible-given-the-rest. This protects the stale-but-UNIQUE insight and demotes the fresh-but-REDUNDANT restatement. Pure + injectable: node:zlib only, no I/O, no clock, no config read. Mirrors the house style of yuri-fsrs.mjs so it is unit-testable in isolation. Embedding-free (pure compression arithmetic) — honors the no-RAG / FTS5-only constraint. GUARDS (per catalog card 14): (1) callers keep force_keep/feedback/user EXEMPT (enforced upstream in the relocator, not here); (2) marginalBits may only PROTECT-from-demote or FLAG-redundant, never sole-delete (the relocator ANDs it with low-R); (3) a content-quality/length floor (qualityFloor here) means a near-empty / garbled body cannot false-protect itself as \"novel\". Detected exports: DEFAULT_QUALITY_FLOOR_CHARS, marginalBits, redundancyVerdict. Add-only graph stub; review trigger, edges, and description before canonical merge."
}
```

### yuri-minhash

```json
{
  "id": "yuri-minhash",
  "label": "Yuri Minhash (registry stub)",
  "layer": "Energy & Math",
  "files": [
    "_SYSTEM/Scripts/math/yuri-minhash.mjs"
  ],
  "triggeredBy": "proposal-only — owner must classify import/CLI/hook trigger before graph merge",
  "description": "yuri-minhash.mjs was flagged by nexus-guard class G as built-but-unwired. Header: yuri-minhash.mjs — deterministic MinHash + LSH banding (pure math, embedding-free). THE PROBLEM IT SOLVES — the corpus matcher needs to find, for a task query, the COMPLETE set of candidate corpus items similar to it, deterministically and in a fraction of the compute of a full O(N) Jaccard scan or a BM25 re-rank-and-truncate. MinHash gives an unbiased estimator of Jaccard set-similarity from a fixed-length signature; LSH banding turns \"find all items with Jaccard ≥ t\" into O(1)-ish bucket lookups instead of N pairwise comparisons. SOURCE THEORY: - MinHash (Broder 1997): for a random permutation π of the universe, P[min π(A) = min π(B)] = Jaccard(A,B). Average over k permutations → an unbiased Jaccard estimate with stderr ~1/√k. - LSH banding (Indyk-Motwani 1998 / Leskovec-Rajaraman-Ullman MMDS ch.3): split the k-length signature into b bands of r rows (k=b·r); two sets collide in ≥1 band with probability 1−(1−s^r)^b — an S-curve with threshold ≈ (1/b)^(1/r). Tune (b,r) to the desired t. DETERMINISM: the k permutations are generated from a FIXED seed via an LCG, and token hashing is FNV-1a — same input → same signature on every machine/run. No clock, no RNG, no I/O. Honors the no-embedding / FTS5-only house law (this is set-similarity over tokens, not vector search). Universal-hashing permutation family: h_i(x) = ((a_i · x + b_i) mod p), p = 2^31−1 (Mersenne prime), a_i odd. min over tokens of h_i(hash(token)) = the i-th MinHash coordinate. Detected exports: estimateJaccard, fnv1a, lshBands, makeHashes, minhashSignature, tuneBands. Add-only graph stub; review trigger, edges, and description before canonical merge."
}
```

### yuri-phi

```json
{
  "id": "yuri-phi",
  "label": "Yuri Phi (registry stub)",
  "layer": "Energy & Math",
  "files": [
    "_SYSTEM/Scripts/math/yuri-phi.mjs"
  ],
  "triggeredBy": "proposal-only — owner must classify import/CLI/hook trigger before graph merge",
  "description": "yuri-phi.mjs was flagged by nexus-guard class G as built-but-unwired. Header: yuri-phi.mjs — NEXUS CORE: π / golden-ratio (φ) / Fibonacci applied primitives (pure, deterministic, embedding-free). Owner directive (Marcel 2026-06-06): these are not a research curiosity — they are first-class NEXUS CORE math functions. The breakthrough is NOT \"φ is magic\"; it is that φ/Fibonacci are the efficient way to spend COMPARISONS, INTERVALS, or TIME-PHASES when the structure is already one-dimensional, ordered, or resonance-prone (E1 deep-dive, 2026-06-06). WHAT'S HERE (the READY tier — each maps to a real YURI organ; numerology killed): 1. goldenSectionSearch — derivative-free 1-D minimization of a unimodal objective by φ-ratio bracket reduction (one new eval per step). → tune scalar knobs (energy weights, thresholds β/η/θ, saturation thresholds) WITHOUT gradients or a labeler once an objective is frozen. (Kiefer 1953.) 2. fibonacciSearchMin — discrete unimodal minimization over an ordered finite index range, sublinear evals. → locate a threshold band over an expensive-to-evaluate discrete candidate set. 3. phiPoint / phiSequence — additive-recurrence low-discrepancy sequence x_n = frac(x0 + n/φ). φ is the \"most irrational\" → maximally de-correlated, anti-resonant SEQUENCING with NO RNG. → polling/ backoff jitter, sampling cadence, candidate rotation that must not phase-lock. (Three-distance theorem: at most 3 distinct gap sizes — the signature of an optimally-even 1-D spread.) 4. goldenAngle / goldenAnglePoints — the phyllotaxis spiral θ = i·(π(3−√5)). Fuses π AND φ for an even, non-clustering 2-D point/angle distribution. → even node/hue placement in the circuitry-die viz (cross-links the circuitry self-model) and any \"spread N things evenly on a disk/circle\" need. 5. fib / fibBig — the Fibonacci generator (Number-exact ≤ F(78); BigInt for unbounded, e.g. the OSS authorship-watermark generator — see D1). PARKED (do NOT build until a target organ pulls them, per the discipline): π/FFT spectral probe (needs stable sanitized traces), Knuth/Fibonacci multiplicative hashing (no measured bucket-skew), Fibonacci heap (no profiled graph hot-path). See math-primitive-candidates-parking.md. Pure + injectable: no I/O, no clock, no RNG. Mirrors yuri-jaccard / yuri-fsrs house style. Detected exports: GOLDEN_ANGLE, INV_PHI, INV_PHI_SQ, PHI, fib, fibBig, fibSequence, fibonacciSearchMin, goldenAnglePoint, goldenAnglePoints, goldenSectionSearch, phiPoint, phiSequence. Add-only graph stub; review trigger, edges, and description before canonical merge."
}
```

### yuri-token-expand

```json
{
  "id": "yuri-token-expand",
  "label": "Yuri Token Expand (registry stub)",
  "layer": "Energy & Math",
  "files": [
    "_SYSTEM/Scripts/math/yuri-token-expand.mjs"
  ],
  "triggeredBy": "proposal-only — owner must classify import/CLI/hook trigger before graph merge",
  "description": "yuri-token-expand.mjs was flagged by nexus-guard class G as built-but-unwired. Header: yuri-token-expand.mjs — embedding-free semantic bridging to kill TOKENIZATION COLLAPSE. THE PROBLEM — Jaccard over raw token sets returns 0 for semantic duplicates with DISJOINT vocabulary (\"login bypass\" vs \"authentication circumvention\"). Synonyms + morphology + spelling variants are invisible. Fix it WITHOUT neural embeddings (house law: deterministic, CPU, no trained model, no GPU, no RNG-at-query). The corpus itself supplies the semantics. THREE COMPOSABLE BRIDGES (each a deliberate, bounded layer): 1. CHAR-N-GRAM shingles — morphology + spelling variants (script≈scripting≈scripts). Pure, corpus-free. Two tokens are \"near\" if their char-3-gram Jaccard ≥ τ. 2. FIRST-ORDER PPMI expansion — SYNTAGMATIC association: terms that co-occur in documents (login↔password↔credential). PPMI(a,b)=max(0, log2 [p(a,b)/(p(a)p(b))]). Expand a token to its top-N PPMI neighbors above a threshold. Corpus-derived, deterministic. 3. SECOND-ORDER distributional similarity (slot below) — PARADIGMATIC/synonym bridge: terms with similar PPMI co-occurrence PROFILES are synonyms even if they never co-occur (login≈signin). Levy-Goldberg 2014: PPMI-vector cosine ≈ word2vec. Method (PPMI-vector cosine vs Random Indexing, Kanerva 2000) chosen per the Phase-A research, then wired here. PRECISION CONTROL (expansion adds recall but risks false matches — bound it): - minCooc: ignore term pairs co-occurring < this (kills spurious rare pairs). - ppmiFloor: only neighbors with PPMI ≥ floor. - topN: cap neighbors per term. - expansion tokens are TAGGED (prefix '~') so a weighted-Jaccard can down-weight them vs original tokens — recall without letting expansion dominate the score. Pure + injectable: no I/O, no clock, no RNG. Mirrors yuri-jaccard / yuri-fsrs house style. Detected exports: buildCooccurrence, buildExpansionMap, buildPpmiProfiles, buildSecondOrderMap, charShingles, expandTokenSet, features, makeFeatureFn, plainFeatureFn, ppmi, sparseCosine, tokenCharSim, weightedJaccard. Add-only graph stub; review trigger, edges, and description before canonical merge."
}
```

### cross-reference

```json
{
  "id": "cross-reference",
  "label": "Cross Reference (registry stub)",
  "layer": "Energy & Math",
  "files": [
    "_SYSTEM/Scripts/self-improvement/cross-reference.mjs"
  ],
  "triggeredBy": "proposal-only — owner must classify import/CLI/hook trigger before graph merge",
  "description": "cross-reference.mjs was flagged by nexus-guard class G as built-but-unwired. No module header doc-comment found. Detected exports: CANONICAL_TAGS, TAXONOMY, buildCrossReferenceIndex, buildSimilarityCrossReference, classifyLesson, dedupeTags, deriveLessonDomain, extractLessonQuestions, extractLessonTitle, normalizeToken, parseLessonMetadata, renderCrossReferenceMarkdown, renderPreventionRulesMarkdown, resolveCanonicalTag, summarizeLesson, walkMarkdownFiles. Add-only graph stub; review trigger, edges, and description before canonical merge."
}
```

### weekly-comp

```json
{
  "id": "weekly-comp",
  "label": "Weekly Comp (registry stub)",
  "layer": "Energy & Math",
  "files": [
    "_SYSTEM/Scripts/self-improvement/weekly-comp.mjs"
  ],
  "triggeredBy": "proposal-only — owner must classify import/CLI/hook trigger before graph merge",
  "description": "weekly-comp.mjs was flagged by nexus-guard class G as built-but-unwired. No module header doc-comment found. Detected exports: main. Add-only graph stub; review trigger, edges, and description before canonical merge."
}
```

### weekly-consolidation

```json
{
  "id": "weekly-consolidation",
  "label": "Weekly Consolidation (registry stub)",
  "layer": "Energy & Math",
  "files": [
    "_SYSTEM/Scripts/self-improvement/weekly-consolidation.mjs"
  ],
  "triggeredBy": "proposal-only — owner must classify import/CLI/hook trigger before graph merge",
  "description": "weekly-consolidation.mjs was flagged by nexus-guard class G as built-but-unwired. No module header doc-comment found. No exports detected. Add-only graph stub; review trigger, edges, and description before canonical merge."
}
```

## Owner Gate

- This dry run did not write canonical manual or graph surfaces.
- Command shims are written only with `--apply-shims` and only when the target file is absent.
