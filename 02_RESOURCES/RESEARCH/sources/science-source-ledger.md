---
name: science-source-ledger
description: Compounding science-paper library for YURI — distilled, cited source cards (mechanism + YURI-relevance) from research sessions, indexed into FTS5 so prior art is recallable via `ai search`. Treated as first-class corpus, equal to the math logbook + Code Bible. Append per research session.
metadata: { node_type: source-ledger, started: 2026-06-06, status: living, citation_trust: lane-sourced-advisory }
tags: science_sources, bibliography, prior_art, research_corpus
---

# YURI Science-Source Ledger — compounding prior-art library

Standing method (Marcel 2026-06-06): *any valuable source pulled must land in our database and be indexed — science papers are as valuable as our maths.* This ledger is the compounding home for distilled, cited source cards. One card per paper: full citation + URL + the mechanism in one line + why YURI cares + which build it fed. Reindex (`ai reindex`) after every append so `ai search "<concept>"` surfaces the paper, not just a passing mention.

**Trust note:** citations are lane-sourced and ADVISORY (pulled by DeepSeek/Kimi/Codex lanes, partly web-fetched). Author/year/venue are reliable for the well-known works; verify exact DOI/URL before any external/formal citation. `local_truth_claim=false`.

---

## Session 2026-06-06 — Cross-domain transfer-DISTANCE (structural, embedding-free)

Fed: [[cross-domain-transfer-distance-prior-art]] + the `transfer-distance.mjs` (MBTS) build. Question: how to measure STRUCTURAL (not surface) cross-domain distance, embedding-free, and is far-but-coherent analogy = innovation.

### A. Algorithmic information distance / compression

| key | citation | url | mechanism (1-line) | YURI relevance |
|---|---|---|---|---|
| bennett-1998-infodist | Bennett, Gács, Li, Vitányi, Zurek (1998). Information Distance. IEEE Trans. Info. Theory 44(4):1407-1423 | ieeexplore.ieee.org/document/681318 | `E_max(x,y)=max{K(x\|y),K(y\|x)}` universal algorithmic metric | the root: distance is algorithmic/relational, not surface-lexical; K(x\|y) is the bridge term |
| li-2004-nid | Li, Chen, Li, Ma, Vitányi (2004). The similarity metric. arXiv:cs/0111054 | arxiv.org/abs/cs/0111054 | NID `=max{K(x\|y),K(y\|x)}/max{K(x),K(y)}`; minorizes all admissible distances | gzip-NCD is its computable shadow; theoretical ceiling for our distance |
| cilibrasi-2004-ncd | Cilibrasi, Vitányi (2004). Clustering by compression. arXiv:cs/0312044 | arxiv.org/abs/cs/0312044 | NCD `(C(xy)−min)/max`; normal-compressor axioms; gzip vs bzip2 vs PPMZ capture different structure | compressor choice IS the structure model — bzip2/grammar swap is principled |
| cilibrasi-2007-ngd | Cilibrasi, Vitányi (2007). The Google Similarity Distance. arXiv:cs/0412098 | arxiv.org/abs/cs/0412098 | NID via web page-counts; structural despite lexical freedom | the "compressor's model determines structure captured" lesson |
| vitanyi-2008-nid | Vitányi, Balbach, Cilibrasi, Li (2008). Normalized Information Distance. arXiv:0809.2553 | arxiv.org/abs/0809.2553 | definitive NID/NCD/NGD survey | reference chapter for the whole distance family |
| cebrian-2005-pitfalls | Cebrián, Alfonseca, Ortega (2005). Common pitfalls using the NCD. Proc. IADIS AC, 245-252 | (IADIS) | gzip-NCD near-random < few hundred bytes; LZ77 can't detect isomorphism across different vocabulary | **names our exact failure** — the citation for "surface gzip = register meter" |
| keogh-2004-cdm | Keogh, Lonardi, Ratanamahatana (2004). Towards parameter-free data mining. ACM KDD, 206-215 | (ACM KDD) | CDM: model-from-target, compress source through it = conditional K(source\|target) | the principled upgrade of our reconstruction/bridge term |
| sculley-2006-compml | Sculley, Brodley (2006). Compression and machine learning. IEEE DCC, 332-341 | (IEEE DCC) | NCD ≈ cosine in the compressor's implicit feature space; gzip features = token-adjacency | grammar compressor → production-rule (structural) features |
| nevillmanning-1997-sequitur | Nevill-Manning, Witten (1997). Identifying hierarchical structure in sequences. JAIR 7:67-82 | jair.org/index.php/jair/article/view/10193 | Sequitur: infers context-free grammar in O(n); rules = structure | most direct "replace gzip": grammar-NCD for same-mechanism-different-words |
| larsson-2000-repair | Larsson, Moffat (2000). Off-line dictionary-based compression (Re-Pair). Proc. IEEE 88(11):1722-1732 | (Proc IEEE) | grammar compressor; basis for code-clone detection (renamed vars) | structural distance backbone for "same mechanism, different surface" |
| cohen-2012-multiset-ncd | Cohen, Vitányi (2012). NCD of multisets. IEEE PAMI 37(8); arXiv:1212.5711 | arxiv.org/abs/1212.5711 | NCD over a SET; redundancy across instances reveals invariant structure | stronger structural detector than pairwise NCD |
| ferragina-2005-bwt | Ferragina, Giancarlo, Greco, Manzini, Valiente (2005). Compression-based classification of biological sequences. WABI, LNCS 3692 | (Springer) | BWT groups similar contexts → contextual structural similarity | the bzip2 quick-win has biosequence precedent |

### B. Cognitive science of analogy (structure-mapping)

| key | citation | url | mechanism | YURI relevance |
|---|---|---|---|---|
| gentner-1983-smt | Gentner (1983). Structure-mapping: a theoretical framework for analogy. Cognitive Science 7(2):155-170 | doi.org/10.1207/s15516709cog0702_3 | analogy maps RELATIONS not ATTRIBUTES; systematicity = depth of interconnected relations | the theory behind "match relational structure, drop surface vocab" |
| falkenhainer-1989-sme | Falkenhainer, Forbus, Gentner (1989). The Structure-Mapping Engine. Artificial Intelligence 41(1):1-63 | doi.org/10.1016/0004-3702(89)90077-5 | scores structural isomorphism of predicate graph with NO predicate semantics/embeddings | embedding-free structural-alignment scoring; our RSO blueprint |
| mitchell-1990-copycat | Mitchell, Hofstadter (1990). The emergence of understanding... (Copycat). Physica D 42:322-334 | doi.org/10.1016/0167-2789(90)90108-H | conceptual slippage; coherence from parallel-terraced scan; fewer slips = higher score | bridge-as-coherence; surface match outcompeted by structural harmony |
| forbus-1995-macfac | Forbus, Gentner, Law (1995). MAC/FAC: a model of similarity-based retrieval. Cognitive Science 19(2):141-205 | doi.org/10.1207/s15516709cog1902_1 | 2-stage: cheap relational summary retrieves; full structural alignment ranks | architecture for the cross-reference retrieve→rank pipeline |

### C. ML transfer-learning domain distance

| key | citation | url | mechanism | YURI relevance |
|---|---|---|---|---|
| bendavid-2010-domains | Ben-David, Blitzer, Crammer, Kulesza, Pereira, Vaughan (2010). A theory of learning from different domains. Machine Learning 79 | jmlr.csail.mit.edu/papers/volume17/15-239/15-239.pdf (via Ganin 2016) | target-risk ≤ source-risk + H-divergence + **joint error**; 𝒜-distance `d_A=2(1−2ε)` | **validates the bridge = joint-error floor**; distance alone insufficient |
| gretton-2012-mmd | Gretton, Borgwardt, Rasch, Schölkopf, Smola (2012). A kernel two-sample test (MMD). JMLR; arXiv:0805.2368 | arxiv.org/abs/0805.2368 | max mean discrepancy over RKHS ball; works on vectors/strings/graphs via kernels | embedding-free structural distance via deterministic relational kernels (top pick) |
| borgwardt-2006-graphkernel | Borgwardt, Gretton, Rasch, Kriegel, Schölkopf, Smola (2006). Integrating structured biological data by kernel MMD. Bioinformatics 22(14):e49 | academic.oup.com/bioinformatics/article/22/14/e49/228383 | structured-kernel MMD over graphs/schemas | typed-edge / motif kernels over the circuitry graph |
| alvarezmelis-2020-otdd | Alvarez-Melis, Fusi (2020). Geometric Dataset Distances via Optimal Transport (OTDD). arXiv:2002.02923 | arxiv.org/abs/2002.02923 | OT dataset distance, model-agnostic, no training, disjoint labels | far-but-aligned scoring IF ground cost is structural not textual |
| tan-2017-ddtl | Tan, Zhang, Pan, Yang (2017). Distant Domain Transfer Learning. AAAI | ojs.aaai.org/index.php/AAAI/article/view/10826 | bridge a large gap via intermediate domains A→I→B, each hop structure-preserving | score an interpretable bridge PATH, not just A→B |
| achille-2019-task2vec | Achille et al. (2019). Task2Vec: task embedding for meta-learning. ICCV | openaccess.thecvf.com/.../Achille_Task2Vec_..._ICCV_2019_paper.html | task = Fisher-information signature of a probe net | meta-idea only — NOT embedding-free (needs probe net); rejected for core |
| mansour-2009-discrepancy | Mansour, Mohri, Rostamizadeh (2009). Domain adaptation: learning bounds and algorithms (discrepancy distance). arXiv:0902.3430 | arxiv.org/abs/0902.3430 | divergence generalized to arbitrary loss | symbolic loss over mechanism-maps instead of prose similarity |
| panyang-negtransfer | Zhang, Deng, Jia, Zuo et al. (2020). A survey on negative transfer. arXiv:2009.00909 | arxiv.org/abs/2009.00909 | transfer hurts when source/target weakly related | the guards: mismatch-present + bridge-floor |

### D. Far-analogy / atypical-combination = innovation

| key | citation | url | mechanism | YURI relevance |
|---|---|---|---|---|
| koestler-1964-bisociation | Koestler (1964). The Act of Creation | en.wikipedia.org/wiki/Arthur_Koestler | bisociation: collision of separate thought-matrices → insight | far-domain collision is generative (directional support) |
| boden-2004-creativemind | Boden (2004). The Creative Mind: Myths and Mechanisms | en.wikipedia.org/wiki/Margaret_Boden | exploratory vs transformational creativity | transformational (rule-breaking) = high novelty |
| uzzi-2013-atypical | Uzzi, Mukherjee, Stringer, Jones (2013). Atypical Combinations and Scientific Impact. Science 342:468-472 | doi.org/10.1126/science.1240474 | 17.9M papers: atypical combos predict high impact, BUT **inverted-U** (too atypical fails; novelty × conventionality) | **the empirical proof the value curve is inverted-U via coherence-gating** |
| dahl-2002-analogical | Dahl, Moreau (2002). The influence and value of analogical thinking in new product ideation. J. Marketing Research 39(1) | doi.org/10.1509/jmkr.39.1.47.18930 | far analogies = higher ceiling/lower floor, need effortful mapping | far needs the bridge or it's noise |
| chan-2015-analogies | Chan, Schunn (2015). The impact of analogies on creative concept generation | (verify DOI — lane-provided id looked mismatched) | near → more/less-novel ideas; far → fewer/more-novel | distance × coherence-filter pattern |
| designbyanalogy-linsey-goel | Linsey, Goel, McAdams et al. — Design-by-analogy surveys (J. Mechanical Design) | (verify) | far analogies = higher innovation, require mapping support | maps directly to the bridge term |

## Session 2026-06-06b — Mathematical MATCHING engine (deterministic, COMPLETE, cheap retrieval)

Fed: `yuri-minhash.mjs` + `corpus-match.mjs` build. Question: deterministically return the COMPLETE set of corpus matches for a task, faster/cheaper than BM25/FTS5, embedding-free. **Verdict from the research: LSH can't be complete (structural false negatives); the complete+sublinear path is the prefix-filtered exact set-similarity join (ADOPTED + proven: 100% recall, 1.47ms over 9,487).**

| key | citation | url | mechanism | YURI relevance |
|---|---|---|---|---|
| broder-1997-minhash | Broder (1997). On the resemblance and containment of documents. SEQUENCES | cs.princeton.edu/courses/archive/spr05/cos598E/bib/broder97resemblance.pdf | P[min π(A)=min π(B)] = Jaccard(A,B); k perms → unbiased estimate, stderr ~1/√k | `yuri-minhash.mjs` base primitive |
| indyk-motwani-1998-lsh | Indyk, Motwani (1998). Approximate nearest neighbors. STOC | (STOC 1998) | (d₁,d₂,p₁,p₂)-sensitive hash families; AND-OR amplification | LSH banding — demoted to optional accelerator (probabilistic) |
| mmds-ch3-banding | Leskovec, Rajaraman, Ullman. Mining of Massive Datasets ch.3 (2014) | mmds.org | banding S-curve P=1−(1−s^r)^b; crossover ≈ (1/b)^(1/r), ~37% missed AT threshold | proves LSH ≠ complete; the false-negative bound |
| bayardo-2007-allpairs | Bayardo, Ma, Srikant (2007). Scaling up all-pairs similarity search. WWW | bayardo.org/ps/www2007.pdf | prefix filter + length filter + exact verify → ALL pairs ≥ t, no approximation | **ADOPTED — the complete+sublinear matcher spine (matchPrefixFilter)** |
| xiao-2008-ppjoin | Xiao, Wang, Lin, Yu (2008). Efficient similarity joins for near-duplicate detection. WWW | (WWW 2008) | PPJoin: positional + suffix filters on top of prefix filter | the filter-verify discipline; further pruning |
| lv-2007-multiprobe | Lv, Josephson, Wang, Charikar, Li (2007). Multi-probe LSH. VLDB | (VLDB 2007) | probe nearby buckets by perturbation likelihood → higher recall, fewer tables | LSH recall-hardening path if LSH is used at scale |
| li-konig-2010-bbit | Li, König (2010). b-bit minwise hashing. WWW | (WWW 2010) | truncate each MinHash coord to b bits → ~64× storage cut | signature compression for huge corpora |
| li-2012-oneperm | Li, Owen, Zhang (2012). One-permutation hashing. NIPS; arXiv:1208.1259 | arxiv.org/abs/1208.1259 | one permutation split into k bins → 1/k preprocessing | cheaper signature build |
| ioffe-2010-cws | Ioffe (2010). Improved consistent sampling, weighted minhash. NIPS | (NIPS 2010) | MinHash for WEIGHTED sets (tf/idf), not just binary | enables tf-weighted matching (yuri-jaccard tfCosine path) |
| shrivastava-li-2014 | Shrivastava, Li (2014). In defense of MinHash over SimHash. arXiv:1407.4416 | arxiv.org/abs/1407.4416 | proof: MinHash dominates SimHash for binary data (S²≤R≤S/(2−S)) | confirms MinHash is the right base for binary-token Jaccard |
| charikar-2002-simhash | Charikar (2002). Similarity estimation techniques (SimHash). STOC | cs.princeton.edu/courses/archive/spr05/cos598E/bib/p380-charikar.pdf | random-hyperplane hashing for cosine/angular similarity | alt fingerprint; worse than MinHash for Jaccard thresholds |
| lemire-2016-roaring | Lemire, Ssi-Yan-Kai, Kaser (2016). Consistently faster, smaller compressed bitmaps (Roaring). arXiv:1603.06549 | arxiv.org/abs/1603.06549 | compressed integer-set union/intersect/cardinality | fast complete set ops for postings/length-buckets (scale path) |
| lemire-2018-croaring | Lemire et al. (2018). Roaring bitmaps: implementation of an optimized software library. arXiv:1709.07821 | arxiv.org/abs/1709.07821 | SIMD-optimized roaring (Elasticsearch/Spark/Druid) | the cheap CPU substrate for complete counts at scale |
| bloom-1970 | Bloom (1970). Space/time trade-offs in hash coding with allowable errors. CACM | (CACM 13(7)) | membership prefilter, no false negatives | reject impossible candidates before exact lookup |
| robertson-zaragoza-2009 | Robertson, Zaragoza (2009). The Probabilistic Relevance Framework: BM25 and beyond. FnTIR | (FnTIR 3(4)) | BM25 lexical ranking | the baseline we beat on completeness (ranking ≠ complete set) |
| manning-2008-irbook | Manning, Raghavan, Schütze (2008). Introduction to Information Retrieval | nlp.stanford.edu/IR-book | inverted index + skip-list set intersection | the inverted-index substrate for prefix-filter |
| broder-2003-wand | Broder, Carmel, Herscovici, Soffer, Zien (2003). Efficient query evaluation (WAND). CIKM | (CIKM 2003) | top-k dynamic pruning | REJECTED for us — top-k is structurally opposed to completeness |
| ding-suel-2011-bmw | Ding, Suel (2011). Faster top-k document retrieval (Block-Max WAND). SIGIR | research.engineering.nyu.edu/~suel/papers/bmw.pdf | block-level upper bounds for top-k | REJECTED — same top-k-not-complete reason |

## Session 2026-06-06c — Tokenization-collapse fix (embedding-free semantic bridging)

Fed: `yuri-token-expand.mjs` (Expanded Feature Jaccard). Question: bridge synonym/paraphrase/morphology so Jaccard stops scoring disjoint-vocab semantic duplicates as 0, embedding-free, keeping the prefix-filter complete.

| key | citation | url | mechanism | YURI relevance |
|---|---|---|---|---|
| church-hanks-1990-pmi | Church, Hanks (1990). Word association norms, mutual information, and lexicography. Computational Linguistics 16(1) | aclanthology.org/J90-1003 | PMI = log₂ p(a,b)/(p(a)p(b)) term association from co-occurrence | the `sem:` PPMI concept-edge bridge |
| levy-goldberg-2014-ppmi | Levy, Goldberg (2014). Linguistic regularities in sparse and explicit word representations. NeurIPS/CoNLL | proceedings.neurips.cc/paper/2014/hash/feab05aa91085b7a8012516bc3533958-Abstract.html | PPMI(+truncated SVD) ≈ word2vec SGNS; SVD droppable for top-N expansion | justifies PPMI top-N as the embedding-free synonym bridge (drop SVD) |
| kanerva-2000-ri | Kanerva, Kristoferson, Holst (2000). Random Indexing of text samples for LSA. CogSci | (CogSci 2000) | fixed sparse random term vectors, summed over context → distributed semantics, no training | second-order synonym bridge (QUEUED) — deterministic, seed-locked, streaming |
| sahlgren-2005-rri | Sahlgren (2005). An introduction to random indexing. SICS | diva-portal.org/smash/record.jsf?pid=diva2:1041170 | Reflective RI: feed context vectors back → higher-order co-occurrence captures synonyms that never co-occur | the true never-co-occur synonym fix (next layer) |
| gabrilovich-2007-esa | Gabrilovich, Markovitch (2007). Computing semantic relatedness using Wikipedia-based ESA. IJCAI | ijcai.org/Proceedings/07/Papers/259.pdf | term → TF-IDF vector over Wikipedia concepts (explicit, corpus-agnostic) | corpus-agnostic bridge when source/target vocabularies differ (needs Wikipedia — external) |
| jimenez-2010-softcard | Jiménez, Becerra, Gelbukh (2010). Soft cardinality. (SemEval/CICLing) | (CICLing 2010) | generalize set cardinality with fuzzy token membership via a token-similarity fn | soft-Jaccard scoring wrapper / reranker after complete candidate gen |
