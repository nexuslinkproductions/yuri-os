---
name: cross-domain-transfer-distance-prior-art
description: Prior-art survey + the empirical case for a STRUCTURAL (not surface) cross-domain transfer-distance metric; validates the Mechanism-Bridged Transfer Surprise bridge term from three independent traditions and gives the embedding-free fix ladder.
metadata: { node_type: research-survey, date: 2026-06-06, domain: cross-domain-transfer/analogy/information-distance, status: advisory }
tags: cross_domain_transfer, analogy, structure_mapping, information_distance, transfer_learning, creativity, mdl
---

# Cross-Domain Transfer-DISTANCE — prior-art survey + the structural-distance fix (2026-06-06)

> Captured per SEARCH_COST_PROTOCOL (local corpus was provably insufficient — 38.8k-doc `ai search` returned only tangential persona/brain-dump hits, zero real prior art on structure-mapping / compression-distance / analogical-distance — so this synthesis is the bridge from one-off lookup to compounding corpus). Built by a 4-lane fan-out (DeepSeek=info-distance w/ live web fetch · Kimi=structure-mapping & far-analogy · Codex/gpt-5.5=transfer-learning domain-distance). Advisory until local evidence verifies; every claim cited.

## 0. The trigger — what we found

We forged **Mechanism-Bridged Transfer Surprise (MBTS)** to measure "how far a mechanism is pulled from a source domain A and applied in a target domain B," so the cross-reference engine can rank a FAR-but-holding transfer (the high-value innovation) above a NEAR one. Forged core (3 lanes + the Claude lane):

- `distance(A,B) = 0.6·NCD_gzip(A,B) + 0.4·Jaccard(tok A, tok B)` — embedding-free.
- `bridge(A,M,B) = min(1−NCD(M,A), 1−NCD(M,B))` — the mechanism M must reconstruct from BOTH sides (anti-theater; **min**, not avg).
- `value = gate(distance · bridge · structuralConfidence)` — far × holds × confidence, fail-closed.
- NPMI demoted from distance-core to a novelty discount (co-occurrence in OUR corpus = "what Marcel already connected," circular for an engine whose job is finding NOT-yet-connected things).

**Proved cold against the 36-card math-theory transfer logbook** (a hand-labeled cross-domain-transfer dataset: each card = source-theory → YURI-organ, with split structural/literal confidence + juice), frozen a-priori ordinal labels (NEAR/FAR_HOLDS/FAR_BROKEN) + a-priori gate. **Result: 2/5.** Theater control (synthetic wrong-mechanism collapses the bridge) PASSED; juice-correlation PASSED; the **thesis FAILED**: med-distance NEAR=0.915 vs FAR=0.905 — no separation, all 35 cards cluster 0.89–0.93.

**Root cause:** surface gzip-NCD on short prose measures **register distance** (math-paper-prose vs YURI-code-prose), not conceptual/structural distance. Kalman→salience and Hopfield→memory look equally "far." We had a register meter wearing a domain-distance label.

---

## 1. THE HEADLINE — convergent validation from three independent traditions

The forged **bridge term** (min-reconstruction of M on both sides) is not arbitrary. Three separate literatures derive the same object:

| Tradition | The object | = our bridge because… |
|---|---|---|
| **Cognitive science** (Gentner) | structural alignment / systematicity | a good analogy needs the mechanism's *relational network* present on both sides, not shared attributes |
| **ML transfer-learning** (Ben-David) | the **joint-error term** in the domain-adaptation bound | target-risk ≤ source-risk + divergence + *joint error*; distance alone is insufficient — one hypothesis (mechanism) must explain BOTH domains |
| **Algorithmic info theory** (Vitányi) | **conditional Kolmogorov complexity K(x\|y)** | reconstruction = how well M compresses given each side; CDM/conditional-compression is the principled form of our concatenation-NCD bridge |

And the **value structure** `distance × bridge` is empirically defensible: Uzzi et al. 2013 shows the innovation curve is an **inverted-U** in distance, and that shape emerges from *coherence-gating*, not a distance-penalty — which is exactly `distance × bridge` (far-unsupported → low bridge → low value). The forge was right on value + bridge; only the **distance signal** must change from surface to structural.

---

## 2. Information-distance ladder (DeepSeek lane — cited, web-fetched)

- **[1] Bennett, Gács, Li, Vitányi, Zurek (1998)** "Information Distance", IEEE TIT 44(4):1407-1423 — `E_max(x,y)=max{K(x|y),K(y|x)}` universal metric. Distance is *algorithmic*, not surface-lexical; K(x|y) was relational from the start. https://ieeexplore.ieee.org/document/681318
- **[2] Li, Chen, Li, Ma, Vitányi (2004)** "The similarity metric", arXiv:cs/0111054 — NID `= max{K(x|y),K(y|x)}/max{K(x),K(y)}`; minorizes every computable admissible distance. gzip-NCD is its computable shadow.
- **[3] Cilibrasi, Vitányi (2004)** "Clustering by compression", arXiv:cs/0312044 — the NCD paper. **Compressor choice is structural**: gzip=LZ77 sliding-window (local lexical), bzip2=BWT+MTF (context-grouping), PPMZ=variable-order Markov (statistical dependency). The compressor's *model* determines the structure captured.
- **[4] Cilibrasi, Vitányi (2007)** "The Google Similarity Distance", arXiv:cs/0412098 — NID realized with web page-counts; structural despite lexical freedom.
- **FAILURE MODE [6] Cebrián, Alfonseca, Ortega (2005)** "Common pitfalls using the NCD" — **names our exact bug**: gzip-NCD is near-random below a few hundred bytes (header overhead), and LZ77 *cannot detect structural isomorphism between two descriptions using DIFFERENT vocabulary for the SAME relational pattern*. Two paragraphs ("persistent homology over a filtration with union-find" vs "threshold sweep across weighted edges with connected-component tracking") show high NCD despite identical mechanism.
- **[7] Keogh, Lonardi, Ratanamahatana (2004)** "Towards parameter-free data mining", ACM KDD — **CDM** (Compression-based Dissimilarity): build a model FROM target, measure source's compressibility THROUGH it = conditional compression = direct K(source|target). Structurally richer than concatenation-NCD.
- **[9] Nevill-Manning & Witten (1997)** "Sequitur", JAIR 7:67-82 — infers a context-free GRAMMAR in O(n); isomorphic mechanisms → isomorphic rule-sets. The single most direct "replace gzip" answer.
- **[10] Larsson & Moffat (2000)** "Re-Pair" — grammar compressor; used for source-code clone detection (same mechanism, renamed variables = our exact problem).
- Also: [5] Vitányi NID survey (arXiv:0809.2553); [8] Sculley-Brodley DCC 2006 (NCD ≈ cosine in the compressor's implicit feature space — gzip's features are token-adjacency, a grammar compressor's are production rules); [11] Cohen-Vitányi multiset-NCD (PAMI, arXiv:1212.5711); [13] BWT-based biosequence distance (Ferragina 2005); [14] multi-compressor ensembles.

**DeepSeek top-3 fix:** (1) **grammar-based NCD** (Sequitur/Re-Pair backend) — hierarchical structural invariants; (2) **conditional compression / CDM** (PPM model from target, code source through it — *the natural math upgrade of our bridge*); (3) **bzip2/BWT swap** (1-hour win — context-grouping captures structure gzip misses).

## 3. Cognitive science of analogy (Kimi lane — cited)

- **[Gentner 1983]** Structure-Mapping Theory, Cognitive Science 7(2):155-170 — analogy maps **relations** not **attributes**; **systematicity principle**: best analogies have the deepest *system of interconnected relations*. Higher-order relations (CAUSES(GRAVITY,REVOLVES)) are the strongest signal. https://doi.org/10.1207/s15516709cog0702_3
- **[Falkenhainer, Forbus, Gentner 1989]** Structure-Mapping Engine, Artificial Intelligence 41(1):1-63 — computational impl; scores **structural isomorphism of the predicate graph with NO semantic similarity of predicates** (no embeddings). Coincidental shared names give only a weak identicality bonus; the real score is the shared relational network. https://doi.org/10.1016/0004-3702(89)90077-5
- **[Mitchell & Hofstadter 1990]** Copycat / FARG, Physica D 42:322-334 — "conceptual slippage"; coherence emerges from a parallel-terraced scan; fewer slips = higher score; surface match outcompeted by structural harmony.
- **[Forbus, Gentner, Law 1995]** MAC/FAC, Cognitive Science 19(2):141-205 — two-stage retrieval: cheap relational "structural summary" (counts of relation types) gets the candidate set; full SME structural alignment ranks. Surface-similar-but-relationally-thin candidates are weeded out.

**Kimi's transferable mechanism — Relational-Structure Overlap (RSO) over our circuitry graph** (typed nodes+edges = predicate calculus in disguise): flatten each edge to a triple `edgeType(srcNode,dstNode)`; extract the **multiset of typed 2-edge paths** `srcType→edgeType→dstType`; `structuralSim = Jaccard(2paths_A, 2paths_B)`; + **systematicity bonus** = shared hub-patterns (nodes with high in×out degree). Deterministic, O(E), no embeddings, ignores node identity (surface) entirely.

## 4. ML transfer-learning domain-distance (Codex lane — cited)

- **𝒜-distance / H-divergence** (Ben-David et al. 2010; PAD `d_A=2(1−2ε)` via a domain discriminator). Embedding-free only as a handcrafted symbolic separability probe.
- **Domain-adaptation bound / joint-error** (Ben-David) — **distance alone is insufficient; need low joint error of a shared hypothesis** = our bridge. The theoretical anchor.
- **MMD** (Gretton et al. 2012) — two-sample distance over an RKHS ball; **embedding-free with deterministic kernels over tokens / typed edges / graphlets / paths / motifs**. *Top pick.* Risk: bad kernel repeats the NCD register failure.
- **Wasserstein / OTDD** (Alvarez-Melis & Fusi 2020, arXiv:2002.02923) — optimal transport over structural feature masses; model-agnostic, no training. Honest only if the ground cost is **structural, not textual**.
- **DDTL — Distant-Domain Transfer Learning** (Tan, Zhang, Pan, Yang 2017) — bridge a large gap via **intermediate domains** A→I→B, each hop preserving structure. Suggests scoring an interpretable bridge PATH, not just A→B.
- **Negative-transfer theory** (Pan-Yang; arXiv:2009.00909) — transfer hurts when weakly related → explicit guards (mismatch present, bridge floor) = what we have.
- Also: task2vec (Achille 2019, needs a probe net — NOT embedding-free); discrepancy distance (Mansour 2009).

**Codex top-3:** (1) **structured-kernel MMD** over relational features (best embedding-free fit); (2) **OTDD-style symbolic OT** with a typed-graph ground cost (best "far-but-aligned"); (3) **DDTL multi-hop bridge + Ben-David joint-error floor** (architectural upgrade — keep far monotone but require an interpretable bridge path + shared-mechanism floor so distant theater dies early).

## 5. Far-analogy = innovation? (Kimi/creativity lane — cited)

- **Koestler (1964)** bisociation — creativity = collision of separate "matrices of thought"; far domains → insight.
- **Boden (2004)** exploratory vs transformational creativity — transformational breaks rules = high novelty; far is directionally valuable.
- **Uzzi et al. (2013)** "Atypical Combinations and Scientific Impact", Science 342, 17.9M papers — **atypical journal-pair combinations predict higher citation impact, BUT inverted-U: too atypical fails; high novelty must interact with conventionality (sweet spot).** https://doi.org/10.1126/science.1240474
- **Dahl & Moreau (2002)** — far analogies = higher ceiling, lower floor, only with effortful mapping.
- **Chan & Schunn (2015)** — near analogies → more ideas/less novel; far → fewer/higher avg novelty (distance × a coherence filter).
- **Design-by-analogy** (Linsey, Goel, McAdams) — far analogies carry higher innovation potential but require stronger "mapping support" → maps directly to our `bridge`.

**Verdict:** far-but-coherent = innovation **SUPPORTED**; value-vs-distance is **NOT monotone** — **inverted-U / threshold-gate (HIGH confidence, Uzzi strongest)**. The inverted-U should emerge from the **bridge gate** (`distance × bridge`), not a distance-penalty — our value structure is empirically defensible as written.

---

## 6. IMPLICATIONS for the build (V2) — what changes, what stays

**STAYS (validated):** the triangle (A–M–B); `bridge = min-reconstruction` (= joint-error = K(x|y)); `value = distance·bridge·structuralConf` + fail-closed gate (= empirical inverted-U); NPMI as discount-not-distance.

**CHANGES (the fix): swap the structurally-blind surface-NCD distance core for a STRUCTURAL one.** Build + empirically test these candidates on the logbook (the one that actually separates near from far wins — falsifiable):

1. **bzip2/BWT-NCD swap** — lowest lift, drop-in, context-grouping (DeepSeek #3).
2. **Relational-signature distance (text)** — extract the mechanism's **operator/relation skeleton** (verbs/operators + arity), DROP domain nouns (the register carrier), then NCD/Jaccard over signatures (Gentner relations-not-attributes; Sculley-Brodley feature view).
3. **Grammar-NCD (Sequitur)** — hierarchical structural invariants (DeepSeek #1).
4. **Conditional compression / CDM** — model-from-target, code-source-through-it = principled bridge (DeepSeek #2, Keogh).
5. **RSO / structured-kernel MMD over the live circuitry graph** — for the *internal* lesson↔organ cross-reference where both sides are in the graph (Kimi RSO + Codex MMD).

**Two-surface architecture (clarified by the research):** (a) the **live cross-reference** engine (lessons↔organs, both in our system) → RSO/MMD over graph motifs; (b) the **external mechanism import** scoring (logbook source-theory → organ, source not in graph) → relational-signature / grammar / conditional compression over text. Same bridge + value; different distance extractor per surface.

**The falsifiable V2 proof (carried from Codex):** leave-out 12 cards, no tuning, blind-rank NEAR/FAR_HOLDS/FAR_BROKEN; require ≥8/12 ordinal-bucket agreement or the method is theater and does not ship.

---

## 7. Honest residual risks
- **Self-dealing corpus** (DeepSeek): any co-occurrence signal over our own corpus measures familiarity-with-Marcel. Keep NPMI a discount only; externalize the source side (arXiv/field corpus) as the future fix.
- **Overfit to logbook prose** (Codex): the logbook is both muse and test set; named-mismatch/mechanism-paragraph could become proxies for "good card." Mitigation: the held-out blind-rank test + the synthetic theater control (which can't leak labels).
- **Kernel/compressor = the new ontology** (Codex/DeepSeek): a bad kernel or compressor just relocates the register failure. Must empirically verify each candidate separates near from far on the logbook before trusting it.
- **Graph methods only cover internal transfers**; external-import scoring stays text-based until source domains are represented structurally.
