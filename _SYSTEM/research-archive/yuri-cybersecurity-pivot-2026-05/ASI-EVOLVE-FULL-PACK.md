# ASI-EVOLVE — FULL INTELLIGENCE PACK
### Codex-Ready Research Audit · NUDIMMUD/YURI-OS
**Compiled:** 2026-05-21 | **Source:** SJTU GAIR-NLP | **Clearance:** Open (Apache 2.0)

---

## TABLE OF CONTENTS

1. [IDENTITY](#1-identity)
2. [LINEAGE — ASI-Arch Predecessor](#2-lineage--asi-arch-predecessor)
3. [THEORETICAL FRAMEWORK — Scientific Task Length](#3-theoretical-framework--scientific-task-length)
4. [SYSTEM ARCHITECTURE — Full Component Map](#4-system-architecture--full-component-map)
5. [THE EVOLUTION LOOP — Formal Description](#5-the-evolution-loop--formal-description)
6. [EXPERIMENTAL DOMAINS](#6-experimental-domains)
7. [EMPIRICAL ANALYSIS](#7-empirical-analysis)
8. [BENCHMARK TABLES (Raw Data)](#8-benchmark-tables-raw-data)
9. [DISCOVERED ARCHITECTURES — Top 5](#9-discovered-architectures--top-5)
10. [DISCOVERED RL MECHANISMS](#10-discovered-rl-mechanisms)
11. [INSTALLATION & SETUP (ASI-Evolve)](#11-installation--setup-asi-evolve)
12. [INSTALLATION & SETUP (ASI-Arch)](#12-installation--setup-asi-arch)
13. [CODE ENTRY POINT — main.py](#13-code-entry-point--mainpy)
14. [REPOSITORY STRUCTURE](#14-repository-structure)
15. [RELATED WORK LANDSCAPE](#15-related-work-landscape)
16. [LIMITATIONS & KNOWN GAPS](#16-limitations--known-gaps)
17. [CODEX INTEGRATION NOTES](#17-codex-integration-notes)
18. [CITATION & PROVENANCE](#18-citation--provenance)

---

## 1. IDENTITY

| Field | Value |
|---|---|
| **Project Name** | ASI-Evolve |
| **Full Title** | "ASI-Evolve: AI Accelerates AI" |
| **arXiv ID** | 2603.29640 |
| **arXiv URL** | https://arxiv.org/abs/2603.29640 |
| **Paper HTML** | https://arxiv.org/html/2603.29640v1 |
| **Submitted** | 31 March 2026 |
| **Institution** | Shanghai Jiao Tong University (SJTU) + GAIR Lab (SII-GAIR) |
| **GitHub** | https://github.com/GAIR-NLP/ASI-Evolve |
| **License** | Apache 2.0 |
| **Paper PDF (GitHub mirror)** | https://github.com/GAIR-NLP/ASI-Evolve/blob/main/assets/paper.pdf |
| **Type** | Agentic Framework (NOT a model; NOT a dataset) |
| **Primary Claim** | First unified framework to demonstrate AI-driven discovery across all three foundational pillars of AI development: data, architectures, and learning algorithms |

**Authors:**
- Weixian Xu ‡ (Leading Author)
- Tiantian Mi * (Core Contributor)
- Yixiu Liu * (Core Contributor)
- Yang Nan * (Core Contributor)
- Zhimeng Zhou * (Core Contributor)
- Lyumanshan Ye
- Lin Zhang
- Yu Qiao
- Pengfei Liu † (Corresponding Author)

---

## 2. LINEAGE — ASI-Arch Predecessor

ASI-Evolve is the **generalized successor** to ASI-Arch (architecture-search only).

| Aspect | ASI-Arch | ASI-Evolve |
|---|---|---|
| **arXiv** | 2507.18074 | 2603.29640 |
| **GitHub** | https://github.com/GAIR-NLP/ASI-Arch | https://github.com/GAIR-NLP/ASI-Evolve |
| **Scope** | Linear attention architecture search only | Architecture + Data Curation + RL Algorithm Design |
| **Architectures discovered** | 106 | 105 (architecture scenario only) |
| **Database** | MongoDB + FastAPI REST API | Same pattern, generalized |
| **Cognition Base** | OpenSearch vector store (RAG via Flask API) | Embedding-based semantic search |
| **GPU hours** | 20,000+ autonomous | Not stated explicitly |
| **Stars (approx. May 2026)** | 1.1k | Not stated |
| **Contributors** | yxliu0903, HZxCzar, Sirius518 | Larger team |

**ASI-Arch "Scaling Law for Scientific Discovery":** Cumulative count of discovered SOTA architectures rises in an approximately linear curve with compute time. Architectural innovation is predictably scalable — more compute → more discoveries, consistently.

---

## 3. THEORETICAL FRAMEWORK — Scientific Task Length

The paper introduces a formal taxonomy for autonomous research complexity:

```
L_task = <C_exec, S_space, D_feedback>
```

| Dimension | Symbol | What it measures |
|---|---|---|
| **Execution Cost** | C_exec | GPU hours + engineering complexity per trial; cost of modifying large interdependent codebases |
| **Search Space Complexity** | S_space | Openness of hypothesis space; whether exploration boundaries are predefined or must be discovered |
| **Feedback Complexity** | D_feedback | Difficulty extracting actionable signal: loss dynamics, benchmark distributions, efficiency traces |

### Task Taxonomy by L_task

| Task Class | C_exec | S_space | D_feedback | Examples |
|---|---|---|---|---|
| Scientific Question Answering | Low | Low | Low | GPQA, HLE, SciMaster |
| Structured Task Execution | Moderate | Moderate | Moderate | MLE-bench, SWE-bench, AIDE |
| Lightweight Discovery | High | High | Low | AlphaEvolve, FunSearch, OpenEvolve |
| **Large-Scale Exploration** | **Very High** | **Very High** | **Very High** | **ASI-Evolve targets this zone only** |

**Critical distinction:** AlphaEvolve/FunSearch keep D_feedback LOW by operating on small functions with immediate scalar feedback (e.g. "did the circle pack?"). ASI-Evolve operates in a regime where a single experiment takes hours, spans large codebases, and produces multi-dimensional feedback that must be causally interpreted before the next hypothesis can be meaningful.

---

## 4. SYSTEM ARCHITECTURE — Full Component Map

### Pipeline Diagram

```
+------------------------------------------------------------------+
|                      ASI-EVOLVE PIPELINE                         |
|                                                                  |
|  +------------------+     +-----------------------------------+  |
|  |  COGNITION BASE  |     |          DATABASE (D)             |  |
|  |  (Human Priors)  |     |  Node schema per round:           |  |
|  |  ~150 papers     |     |  - motivation (string)            |  |
|  |  Embedding RAG   |     |  - code (string)                  |  |
|  +-------+----------+     |  - results (metrics JSON)         |  |
|          |                |  - analysis (compact report)      |  |
|          | retrieve R_t   |  - score (float)                  |  |
|          |                |  - metadata (runtime, flags)      |  |
|          |                |  Sampling: UCB1/Greedy/MAP-Elites |  |
|          |                +----------------+------------------+  |
|          |                                 | sample S_t         |
|          +------------------+--------------+                     |
|                             v                                    |
|                 +-----------------------+                        |
|                 |    RESEARCHER AGENT   |                        |
|                 |  LLM generates p_t   |                        |
|                 |  + motivation m_t    |                        |
|                 |  Modes: full-code    |                        |
|                 |         or diff/edit |                        |
|                 +---------+------------+                        |
|                           | candidate program p_t               |
|                           v                                     |
|                 +-----------------------+                        |
|                 |    ENGINEER AGENT     |                        |
|                 |  Runs experiment E2E  |                        |
|                 |  Wall-clock limits    |                        |
|                 |  Quick-reject filter  |                        |
|                 |  Optional LLM judge   |                        |
|                 +---------+------------+                        |
|                           | results + raw logs + metrics        |
|                           v                                     |
|                 +-----------------------+                        |
|                 |    ANALYZER AGENT     |                        |
|                 |  Full log access      |                        |
|                 |  Causal distillation  |                        |
|                 |  Compact report -> DB |                        |
|                 +-----------+----------+                        |
|                             | node appended to D               |
|                             +-----------> REPEAT               |
+------------------------------------------------------------------+
```

### Formal Update Rule

```
S_t  ~ Sample(D, policy)          # sample n context nodes
R_t  = Retrieve(C; S_t)           # semantic search over cognition
p_t  ~ P(p | S_t, R_t)            # LLM candidate generation
score, metrics, logs = Eval(p_t)  # Engineer runs experiment
report = Analyze(p_t, metrics, logs)  # Analyzer distills
node = {m_t, p_t, metrics, report, score, metadata}
D <- D union {node}
```

---

### 4.1 Researcher Agent

**Role:** Hypothesis generation — produce the next candidate program.

**Inputs:**
- Task description (fixed per scenario)
- n sampled context nodes from Database
- Small set of cognition items (retrieved via semantic search on sampled nodes' analyses)

**Outputs:**
- Candidate program p_t (complete runnable code)
- Natural-language motivation m_t (stored with node; used as future retrieval target)

**Modes:**
- `full-code`: writes entire program from scratch — used for early rounds or when parent is too different
- `diff-based editing`: proposes localized modifications over a parent program — preferred for large codebases in late rounds

**Context window management:** DB node analyses (compact Analyzer reports) + cognition snippets. Raw logs never enter Researcher context.

---

### 4.2 Engineer Agent

**Role:** Empirical validation — execute experiment, return quantitative signal.

**Inputs:** Candidate program p_t

**Outputs:** score (scalar fitness), metrics (structured dict), logs (raw, verbose)

**Efficiency mechanisms:**
| Mechanism | Description |
|---|---|
| Wall-clock limits | Configurable timeout; kills runaway experiments |
| Quick-test / early rejection | Lightweight checks (syntax, shape, complexity) before expensive GPU run |
| LLM-based judge | Scores aspects not captured by benchmarks (complexity, efficiency, innovativeness); blended with primary metric |
| Static check agent | Architecture task only: verifies sub-quadratic complexity bounds, chunk-wise structure, causal mask correctness |
| Debug agent | Architecture task only: inspects runtime errors, attempts automated fix before discarding candidate |
| Novelty deduplicator | Architecture task only: filters re-proposals via motivation embedding similarity |

**Multi-stage evaluation (Architecture scenario):**

| Phase | Params | Training | Benchmark scope |
|---|---|---|---|
| Exploration | ~20M (8L, d=256) | 2K steps / 1B tokens | 10 core benchmarks, 500 samples each |
| Verification | ~340M (24L, d=1024) | 1B tokens | Confirm scaling stability |
| Large-scale | ~1.3B (24L, d=2048) | 100B tokens | 16 benchmarks + 6 OOD held-out |

**Composite fitness (Architecture):**
```
fitness = sigmoid(benchmark_score_normalized) + lambda * LLM_judge_score
# Both dimensions must exceed baseline to advance to verification phase
```

---

### 4.3 Analyzer Agent

**Role:** Causal distillation — transform verbose experimental output into compact, reusable insights.

**Key design principle:** The Analyzer has FULL access to raw logs, training dynamics, all benchmark breakdowns, efficiency traces. Its output is a compact (<300 token) causal report that answers: "WHY did this result occur, and what does it imply for the next design?"

**Why this is critical:**
- Without the Analyzer, raw logs are too large to feed into Researcher context
- Without the Analyzer, the system cannot accumulate causal understanding — only scores
- Reports persist in DB and are retrieved as semantic search targets in future rounds

**Ablation (no Analyzer):** System starts strong (cognition provides cold-start), but hits a hard plateau after ~200 rounds. Scores stop improving because future Researchers have no causal attribution to build on — only raw metrics.

---

### 4.4 Cognition Base

**Role:** Human prior injection — structured domain knowledge from literature.

**Contents by scenario:**
| Scenario | Papers | Entries | Topics |
|---|---|---|---|
| Architecture | ~100 papers | ~150 entries | Linear attention, SSMs, efficient transformers |
| RL Algorithm | 10 papers | ~10 entries | Variance reduction, KL-penalty modifications (post-GRPO) |
| Data Curation | Data samples | Per-category quality issues | HTML artifacts, formatting, domain-specific noise |

**Retrieval mechanism:**
1. After sampling S_t from DB, use S_t.analysis or S_t.motivation as query
2. Embedding-based semantic search over C
3. Top-k matches injected into Researcher's context prompt

**Ablation (no Cognition):** Delayed cold-start. System rediscovers known failure modes from scratch. Eventually achieves similar performance, but takes significantly more rounds. Cognition accelerates the climb; doesn't set the ceiling.

**Source provenance of discovered architectures:**
| Population | From Cognition | From DB Experience | Novel |
|---|---|---|---|
| All 1773 architectures | 51.7% | 38.2% | 10.1% |
| 105 SOTA architectures | ~44.6% | **44.8%** | 6.6% |

→ Human priors dominate early exploration. System's own accumulated experience dominates SOTA discovery.

---

### 4.5 Database

**Role:** Persistent memory across all rounds.

**Node schema (per round):**
```json
{
  "id": "int",
  "motivation": "string — LLM-generated rationale for this candidate",
  "code": "string — full candidate program",
  "results": {
    "primary_score": "float",
    "metrics": {"benchmark_1": float, "benchmark_2": float, "...": "..."},
    "raw_logs_ref": "optional path or blob"
  },
  "analysis": "string — Analyzer compact causal report",
  "metadata": {
    "runtime_seconds": "int",
    "success_flag": "bool",
    "parent_node_id": "int or null",
    "generation": "int",
    "round": "int"
  }
}
```

**Sampling policies:**

| Policy | Formula / Method | Tuning | Best for |
|---|---|---|---|
| **UCB1** | score_i + C * sqrt(ln(N) / n_i) | C = exploration constant | General purpose; balanced exploitation/exploration |
| **Greedy** | argmax(score) | k = top candidates | Fast convergence; risk of premature plateau |
| **Random** | uniform(D) | — | Exploration baseline |
| **MAP-Elites** | Island algorithm; behavioral space partition | Behavioral dimensions | Long runs; diversity preservation |

**Critical finding from ablations:** Sampling policy is the PRIMARY long-run tuning lever. Unlike Cognition (cold-start) or Analyzer (sustained capability), sampling policy determines evolution *trajectory* after round 500+.

**Architecture task DB config:**
- Candidate pool: Top 50 highest-scoring nodes, periodically refreshed
- Root sampling: Top 10 nodes
- Context sampling: Broader Top 50

---

## 5. THE EVOLUTION LOOP — Formal Description

```
INITIALIZE:
  D <- {} (empty database)
  C <- {literature, heuristics, known pitfalls} (pre-seeded cognition)

FOR t = 1, 2, 3, ... N_rounds DO:

  # --- LEARN ---
  S_t <- Sample(D, policy=UCB1|MAP-Elites|Greedy|Random, n=k)
  R_t <- Retrieve(C, query=concat(S_t.analyses), k=m)

  # --- DESIGN ---
  (p_t, m_t) <- LLM(task_description=T, context=S_t, cognition=R_t)
  # Optional: diff-mode edits over best parent in S_t

  # --- [PRE-CHECKS: static check, novelty filter, debug] ---

  # --- EXPERIMENT ---
  (score_t, metrics_t, logs_t) <- Engineer.run(p_t, timeout=wall_clock_limit)
  # Optional: blend LLM judge score into score_t

  # --- ANALYZE ---
  report_t <- Analyzer.distill(
    code=p_t,
    metrics=metrics_t,
    logs=logs_t,
    baseline=best_score_so_far
  )

  # --- PERSIST ---
  node_t <- {
    motivation: m_t,
    code: p_t,
    results: metrics_t,
    analysis: report_t,
    score: score_t,
    metadata: {runtime, success, parent_id, generation, round: t}
  }
  D <- D union {node_t}

END FOR

OUTPUT: Top-k nodes from D sorted by score
```

---

## 6. EXPERIMENTAL DOMAINS

### 6.1 Scenario 1: Neural Architecture Design

**Baseline:** DeltaNet (human-designed linear attention, O(N) complexity)

**Task constraints:**
- Must use sub-quadratic (O(N)) complexity
- Must use chunk-wise computation patterns (for efficient parallel training)
- Must integrate into existing large DeltaNet codebase
- Must pass causality test (attention mask cannot leak future tokens)

**Cognition init:** ~150 entries from ~100 papers on linear attention, SSMs, efficient transformers

**Results summary:**
| Metric | Value |
|---|---|
| Total exploration rounds | 1,773 |
| Candidate programs generated | 1,350 |
| Architectures surpassing DeltaNet (verification) | 105 |
| Best model gain over DeltaNet | +0.97 points (overall avg) |
| Best human gain (Mamba2 over DeltaNet) | +0.34 points |
| Ratio: AI gain / human gain | ~2.85× (~3×) |
| SOTA architectures from DB experience | 44.8% |
| High-performing archs built on pre-round-900 designs | 78% |

**Discovered architectural principle:** Adaptive multi-scale routing — dynamically adjust computational budget based on input content. Fixed allocation schemes (DeltaNet's core approach) are the bottleneck.

**Known limitation:** No CUDA kernel optimization. Wall-clock efficiency of discovered architectures not guaranteed to match hardware-optimized human implementations.

---

### 6.2 Scenario 2: Pretraining Data Curation

**Corpus:** Nemotron-CC (672B tokens, STEM academic content at two quality levels)
**Task:** Design category-specific curation strategies without any prescriptive guidance on operations

**Cognition init:** Data samples from each category; identified quality issues stored as cognition entries
**Discovery feedback loop:** New quality issues found during evaluation are added BACK to cognition base (dynamic cognition update)

**Engineer:** Applies strategy to 500 sampled docs per category
**Analyzer:** Evaluates 50 (original, cleaned) pairs on 1-10 scale + coverage + executability scores

**Output:** Nemotron-CC_ASI+ (504B tokens after strategy application)
**Training:** 3B parameter models from scratch on 500B tokens, 18 benchmarks

**Key results (Nemotron-CC_ASI+ vs baselines):**

| Benchmark | FineWeb-Edu | Ultra-FineWeb | DCLM | Nemotron-CC (raw) | ASI+ |
|---|---|---|---|---|---|
| MMLU | 28.38 | 25.53 | 28.54 | 27.49 | **46.13 (+18.64)** |
| CSQA | 19.54 | 19.90 | 20.16 | 20.31 | **39.12 (+18.81)** |
| MedQA | 26.36 | 24.84 | 24.88 | 26.77 | **40.25 (+13.48)** |
| MedMCQA | 25.80 | 24.92 | 28.15 | 28.86 | **40.97** |
| ARC-C | 43.45 | 43.77 | 45.02 | 43.52 | **49.32** |
| ARC-E | 73.39 | 73.96 | 75.13 | 74.94 | **78.59** |
| GPQA | 24.51 | 23.04 | 25.67 | 24.37 | 27.10 |
| PubMedQA | 67.04 | 64.44 | 66.56 | 67.68 | 67.68 |
| **Average (18 benchmarks)** | 36.52 | 36.29 | 42.42 | 40.17 | **44.13 (+3.96)** |

**Discovered strategy pattern (emerged without prescriptive instructions):**
1. Targeted noise removal (HTML artifacts, duplicates, PII stripping)
2. Format normalization (whitespace, punctuation standardization)
3. Domain-aware preservation rules (prevent over-aggressive filtering of domain-specific syntax)

Gap between optimized and suboptimal discovered strategies: 2.93 points — confirms iterative refinement value beyond one-shot generation.

---

### 6.3 Scenario 3: RL Algorithm Design

**Baseline:** GRPO (Group Relative Policy Optimization)
**Task:** Redesign advantage allocation + gradient computation mechanisms
**Evaluation:** Mathematical reasoning benchmarks

**Cognition init:** 10 high-quality papers published after GRPO (variance reduction + KL-penalty modifications)

**Two-stage validation:**
- Exploration phase: small model, multiple candidate algorithms, quick runs
- Verification phase: larger model, longer training, confirm statistical significance

**Key requirement:** System must distinguish stochastic training noise from genuine algorithmic improvement.

**Results (best discovered algorithms vs GRPO):**

| Benchmark | GRPO (baseline) | Best Algo 1 | Delta |
|---|---|---|---|
| AMC32 | baseline | baseline + 12.5 | **+12.5** |
| AIME24 | baseline | baseline + 11.67 | **+11.67** |
| OlympiadBench | baseline | baseline + 5.04 | **+5.04** |
| Gaokao | baseline | — | varies |
| MATH500 | baseline | — | varies |

---

## 7. EMPIRICAL ANALYSIS

### 7.1 Circle Packing Benchmark

Shared standard benchmark across evolutionary frameworks.

| Framework | Rounds to SOTA | Relative efficiency |
|---|---|---|
| **ASI-Evolve** | **17** | **27× faster than OpenEvolve** |
| OpenEvolve | 460 | 1× (baseline) |
| GEPA | Not stated | Slower than ASI-Evolve |

---

### 7.2 Framework Comparison Matrix

| System | Arch | Data | Algorithms | L_task regime | Key gap |
|---|---|---|---|---|---|
| **ASI-Evolve** | YES | YES | YES | Large-scale | — |
| AlphaEvolve | Narrow | NO | Partial | Lightweight | D_feedback low; no cognition base |
| FunSearch | Partial | NO | NO | Lightweight | Single function; no cognition |
| OpenEvolve | Partial | NO | NO | Lightweight | 27× slower to SOTA |
| AIDE | NO | NO | Partial | Structured | Fixed targets only |
| AI Scientist | NO | NO | NO | Structured | Outputs papers, not improvements |
| SciMaster | NO | NO | NO | QA | No experimental execution |
| ASI-Arch | YES (arch only) | NO | NO | Large-scale | Architecture domain only |

---

### 7.3 Ablation Study — Component Effectiveness

| Condition | Cold-start | Sustained improvement | Interpretation |
|---|---|---|---|
| **Full (Cognition + Analyzer)** | Fast | YES — steady climb | Optimal |
| **No Analyzer** | Fast | NO — hard plateau ~round 200 | Cognition alone insufficient for compounding |
| **No Cognition** | Slow | YES — eventually catches up | Analyzer alone sufficient for ceiling; cognition is speed |

**Sampling policy ablation (separate):**
- UCB1, MAP-Elites, Greedy, Random produce clearly distinct evolution trajectories
- Effect visible primarily after round 500
- Sampling policy is the key production tuning variable

---

### 7.4 Drug-Target Interaction (DTI) Transfer

**Domain:** Biomedical — predict drug-protein binding affinity
**Baseline:** DrugBAN
**Test condition:** Cold-start generalization (unseen drug-protein pairs)
**Result:** ASI-evolved architecture → **+6.94 AUROC** improvement

**Significance:** Demonstrates the Researcher→Engineer→Analyzer loop is domain-agnostic. The same framework used for attention layer design can redesign biomedical GNN architectures.

---

## 8. BENCHMARK TABLES (Raw Data)

### Table 1: Architecture Task — Full Benchmark Comparison

**Model key:** DeltaNet (DN), Gated-DeltaNet (GDN), Mamba2 (M2), PathGate-FusionNet (PG), Content-SharpRouter (C), FusionGated-FIRNet (FG), Hier-GateNet (H), AdaMulti-PathGateNet (AM)
**Scale:** 1.3B params, 100B tokens training

#### Development Benchmarks

| Benchmark | DeltaNet | GDN | Mamba2 | PG | C | FG | H | AM |
|---|---|---|---|---|---|---|---|---|
| Wiki ppl (lower=better) | 17.00 | 16.84 | 16.66 | 16.18 | 16.05 | **15.77** | 16.65 | 16.26 |
| LMB ppl (lower=better) | 13.63 | 13.31 | 13.33 | **12.62** | 13.45 | 12.34 | 13.06 | 13.75 |
| LMB acc | 45.47 | 46.26 | 46.24 | **47.60** | 46.13 | 47.53 | 46.56 | 45.04 |
| PIQA | 73.12 | 74.10 | 73.78 | 72.91 | **74.37** | 72.91 | **74.37** | 74.10 |
| HellaSwag | 56.29 | 57.55 | **58.58** | 56.99 | 57.00 | 58.47 | 56.85 | 57.17 |
| WinoGrande | 55.88 | 58.01 | 58.48 | 57.22 | 57.85 | **60.14** | 57.38 | 57.62 |
| ARC-easy | 73.40 | 72.14 | 72.98 | 73.06 | 72.05 | **74.28** | 73.11 | **74.28** |
| ARC-challenge | **40.61** | 36.95 | 39.33 | 40.36 | 39.76 | 40.02 | 39.33 | 39.33 |
| SIQA | 40.74 | 41.71 | 41.81 | 42.37 | 41.81 | **42.78** | 42.07 | 42.07 |
| BoolQ | 60.58 | 53.98 | 60.52 | 62.45 | 62.51 | 62.11 | **63.03** | 56.27 |
| **Dev. Avg** | 55.76 | 55.09 | 56.47 | 56.62 | 56.44 | **57.28** | 56.59 | 55.74 |

#### Generalization Benchmarks (OOD held-out)

| Benchmark | DeltaNet | GDN | Mamba2 | PG | C | FG | H | AM |
|---|---|---|---|---|---|---|---|---|
| RACE | 34.45 | 33.78 | 32.15 | 35.22 | 34.55 | 35.60 | 35.22 | 35.02 |
| BBQ | 29.53 | 29.75 | 29.43 | 29.95 | 30.55 | **31.46** | 30.88 | 30.27 |
| MetaBench | 26.97 | 28.67 | 27.70 | 25.64 | **29.55** | 26.79 | 29.38 | 28.98 |
| QA4MRE | 40.00 | 35.00 | 39.17 | 39.17 | 39.17 | 38.33 | 38.33 | 38.33 |
| SCIQ | 89.80 | 90.30 | 90.30 | 89.60 | 89.50 | 89.20 | **90.40** | 89.20 |
| SWAG | 47.69 | 48.17 | **48.88** | 48.22 | 47.80 | 48.57 | 48.18 | 47.80 |
| **Gen. Avg** | 44.74 | 44.28 | 44.61 | 44.63 | 45.19 | 44.99 | **45.40** | 44.93 |

| **Overall Avg** | 51.04 | 50.46 | 51.38 | 51.48 | 51.61 | **52.01** | 51.79 | 51.11 |

**Best overall: FusionGated-FIRNet (FG) — 52.01 overall avg**
**Best generalization: Hier-GateNet (H) — 45.40 gen avg**

---

## 9. DISCOVERED ARCHITECTURES — Top 5

All five share a common insight: **adaptive, multi-scale routing over fixed allocation schemes**.

### 9.1 PathGate-FusionNet (PG)
**Core:** Hierarchical two-stage routing
- Stage 1 gate: allocates budget between local processing and contextual processing
- Stage 2 gate: distributes contextual budget across three paths:
  - Short-range processing
  - Long-range processing
  - Delta-rule update path (memory)
- Delta-rule path ensures long-range dependency preservation even under aggressive budget allocation

### 9.2 Content-SharpRouter (C)
**Core:** Content-aware routing with learnable temperatures
- Per-dimension learnable temperature parameters
- Higher temperature = sharper, more committed routing
- System learns to be "uncertain" (soft routing) vs "certain" (sharp routing) based on input type
- Prevents premature commitment to single pathways
- Prevents entropy collapse in late training

### 9.3 FusionGated-FIRNet (FG) ← BEST OVERALL
**Core:** Independent sigmoid gating (key innovation: replaces softmax)
- Replaces softmax routing (which enforces sum-to-one constraint — mutual exclusivity)
- Uses independent sigmoid gates: each gate activates independently
- Allows SIMULTANEOUS activation of local and global paths (not either/or)
- Per-head retention parameters for delta-rule memory path (different heads can have different memory decay)
- FIR (Finite Impulse Response) components for local pattern capture
- Result: richest feature set; best overall performance

### 9.4 Hier-GateNet (H) ← BEST GENERALIZATION
**Core:** Two-stage gating with dynamic learnable floor values
- Floor constraint: each path has a minimum activation level
- Delta-path (long-range reasoning) is protected — cannot be fully suppressed
- Two-stage hierarchy maintains both local and global context simultaneously
- Prevents critical paths from collapsing under aggressive pruning pressure
- Result: most robust OOD generalization

### 9.5 AdaMulti-PathGateNet (AM)
**Core:** Token-level adaptive control via BalancedSparseGate
- BalancedSparseGate combines three logit sources:
  - Global logits (sequence-level signal)
  - Per-head logits (head-level specialization)
  - Per-token logits (token-level fine-grain control)
- Entropy penalties prevent mode collapse at token level
- Most fine-grained allocation of the five
- Highest theoretical expressivity; moderate empirical performance

---

## 10. DISCOVERED RL MECHANISMS

### Baseline: GRPO (Group Relative Policy Optimization)
- Computes advantage as group-relative normalization: normalize each response's reward by the mean and std of its group
- Standard PPO-derived update with KL penalty
- Known issues: variance in advantage estimates; sensitivity to noisy rewards

### Mechanism 1: Pairwise Advantage Estimation with Asymmetric Clipping
**What changed:** Instead of group-relative normalization, compare sequence PAIRS

**Formula concept:**
```
advantage(i) = f(reward_i - reward_j) for all pairs (i, j) in group
# Asymmetric clipping:
# Positive advantages clipped at c_pos
# Negative advantages clipped at c_neg (c_pos != c_neg)
```

**Effect:** Reduces variance in advantage estimates by anchoring to relative comparisons. Asymmetric clipping allows larger positive updates (reward good behavior strongly) while bounding negative updates (prevent overcorrection).

**Discovery context:** Autonomously invented — no human paper described this exact formulation prior to ASI-Evolve's discovery.

### Mechanism 2: Budget-Constrained Dynamic Radius
**What changed:** Explicit budget for policy update magnitude, dynamically adjusted

**Formula concept:**
```
|theta_new - theta_ref| <= radius(t)
# radius(t) adapts during training based on gradient landscape
# Budget constraint prevents deviation beyond defined margin
```

**Effect:** Stabilizes training on noisy reward signals. Prevents the model from deviating too far from its original behavior — critical for math reasoning where reward signals are sparse and noisy.

**Inspired by:** Trust region methods (TRPO) but with dynamic radius rather than fixed KL constraint.

**Combined result:** Both mechanisms together achieved +12.5 AMC32, +11.67 AIME24, +5.04 OlympiadBench over GRPO.

---

## 11. INSTALLATION & SETUP (ASI-Evolve)

### Clone

```bash
git clone https://github.com/GAIR-NLP/ASI-Evolve.git
cd ASI-Evolve
```

### Dependencies

From `requirements.txt` (GitHub confirmed):
```
openai>=1.0.0
# + standard ML Python stack
```

**Compatible LLM backends (via OpenAI-compatible API):**
| Backend | How to use |
|---|---|
| OpenAI | Standard OPENAI_API_KEY |
| Anthropic Claude | Via anthropic proxy or compatible wrapper |
| DeepSeek | DeepSeek API is OpenAI-compatible |
| Local (vLLM) | Set OPENAI_BASE_URL=http://localhost:8000/v1 |
| Local (Ollama) | Set OPENAI_BASE_URL=http://localhost:11434/v1 |
| OpenRouter | Set OPENAI_BASE_URL=https://openrouter.ai/api/v1 |

### Environment Variables

```bash
export OPENAI_API_KEY="your-key"
export OPENAI_BASE_URL="https://api.openai.com/v1"  # or alternative
```

### Run

```bash
python main.py [--task <task_name>] [--policy <ucb1|greedy|random|mape>] [--rounds <N>]
```

---

## 12. INSTALLATION & SETUP (ASI-Arch)

**System requirements:**
```
Python 3.8+
MongoDB 4.4+
Docker & Docker Compose
CUDA GPU (recommended)
RAM: 16GB minimum, 32GB recommended
```

```bash
# 1. Clone
git clone https://github.com/GAIR-NLP/ASI-Arch.git
cd ASI-Arch

# 2. Conda environment
conda create -n asi-arch python=3.10
conda activate asi-arch

# 3. Dependencies
pip install -r requirements.txt
pip3 install torch==2.4.0 --index-url https://download.pytorch.org/whl/cu124
pip install -r database/requirements.txt
pip install -r cognition_base/requirements.txt

# --- Start services ---

# Terminal 1: Database
cd database
docker-compose up -d
./start_api.sh

# Terminal 2: Cognition Base (RAG)
cd cognition_base
docker-compose up -d
python rag_api.py

# Terminal 3: Pipeline
conda activate asi-arch
cd pipeline
python pipeline.py
```

---

## 13. CODE ENTRY POINT — main.py

From GitHub snippet (commit 2026-03-26):

```python
import argparse
from Evolve.pipeline import Pipeline

def main():
    parser = argparse.ArgumentParser(
        description="Evolve Framework - Automated Experiment Evolution"
    )
    # Expected arguments (inferred from paper + snippet):
    # --task: task specification (architecture / data / rl / custom)
    # --policy: sampling policy for DB (ucb1 / greedy / random / mape)
    # --rounds: total evolution rounds
    # --timeout: wall-clock limit per experiment (seconds)
    # --cognition: path to cognition base
    # --model: LLM model name for Researcher/Analyzer

    args = parser.parse_args()

    pipeline = Pipeline(args)
    pipeline.run()

if __name__ == "__main__":
    main()
```

**Pipeline.run() executes the full loop:**
1. Init Database (D) and Cognition Base (C)
2. For each round t: Sample → Retrieve → Researcher → [Pre-checks] → Engineer → Analyzer → DB write
3. Return top-k nodes by score

---

## 14. REPOSITORY STRUCTURE

### ASI-Evolve (Inferred from GitHub structure + paper)

```
ASI-Evolve/
├── main.py                        # Entry point — CLI -> Pipeline
├── requirements.txt               # openai>=1.0.0 + ML stack
├── .gitignore
├── assets/
│   └── paper.pdf                  # Full paper PDF mirror
└── Evolve/
    ├── pipeline.py                # Main orchestration: learn-design-experiment-analyze loop
    ├── researcher.py              # Researcher agent (LLM call, full-code + diff modes)
    ├── engineer.py                # Experiment runner: wall-clock limits, quick-reject
    ├── analyzer.py                # Log distillation -> compact causal report
    ├── cognition.py               # Cognition base retrieval (embedding search)
    └── database.py                # Persistent node storage + UCB1/Greedy/Random/MAP-Elites
```

### ASI-Arch (Confirmed from README)

```
ASI-Arch/
├── pipeline/
│   └── pipeline.py                # Core evolution loop
├── database/
│   ├── mongodb_database.py        # High-level MongoDB client (DataElement schema)
│   ├── candidate_manager.py       # Top-k candidate set management
│   ├── faiss_manager.py           # FAISS vector search for novelty deduplication
│   ├── evaluate_agent/            # LLM-based Model Judger (score + complexity + innovativeness)
│   ├── mongodb_api.py             # FastAPI REST server (database/<port>)
│   ├── requirements.txt
│   ├── docker-compose.yml         # MongoDB container
│   └── start_api.sh               # Launch MongoDB + FastAPI
├── cognition_base/
│   ├── cognition/                 # JSON files (one per paper; processed chunks)
│   ├── rag_service.py             # Core RAG: embeddings + OpenSearch vector store
│   ├── rag_api.py                 # Flask API: /query endpoint for agents
│   ├── requirements.txt
│   └── docker-compose.yml         # OpenSearch container
└── requirements.txt
```

---

## 15. RELATED WORK LANDSCAPE

### Predecessor / Competitor Systems

| System | Org | Year | Architecture | Data | RL/Algo | D_feedback | Cognition Base |
|---|---|---|---|---|---|---|---|
| **ASI-Evolve** | SJTU/GAIR | 2026 | YES | YES | YES | VERY HIGH | YES (structured) |
| **ASI-Arch** | SJTU/GAIR | 2025 | YES (arch only) | NO | NO | HIGH | YES (MongoDB/RAG) |
| AlphaEvolve | Google DeepMind | 2025 | Narrow | NO | Partial | LOW | NO |
| FunSearch | Google DeepMind | 2023 | Partial | NO | NO | LOW | NO |
| OpenEvolve | Sharma | 2025 | Partial | NO | NO | LOW | NO |
| GEPA | Agrawal et al. | 2026 | Partial | NO | NO | LOW | NO |
| ShinkaEvolve | Lange et al. | 2025 | Partial | NO | NO | LOW | NO |
| AdaEvolve | Cemri et al. | 2026 | Partial | NO | NO | LOW | NO |
| AIDE | Jiang et al. | 2025 | NO | NO | Partial | MODERATE | NO |
| AI Scientist | Lu et al. | 2024 | NO | NO | NO | MODERATE | NO |
| AgentLab | Schmidgall et al. | 2025 | NO | NO | NO | LOW | NO |
| SciMaster | Chai et al. | 2025 | NO | NO | NO | LOW | NO |

### What makes ASI-Evolve structurally unique

1. **Cognition Base:** No prior evolutionary agent pre-seeded human literature into exploration. All others start from scratch or from thin descriptions.
2. **Dedicated Analyzer:** No prior system separated log distillation from hypothesis generation as a distinct agent role.
3. **All three pillars unified:** Architecture + Data + RL Algorithm simultaneously in a single framework.
4. **Evolves cognition, not just solutions:** The system's capacity to reason about WHERE to search next improves over time via accumulated Analyzer reports.
5. **Large-scale L_task regime:** Only system to demonstrate success where C_exec, S_space, AND D_feedback are all simultaneously maxed.

---

## 16. LIMITATIONS & KNOWN GAPS

### Stated by Authors

| Limitation | Details |
|---|---|
| **No CUDA kernel optimization** | System designs at attention mechanism level, not hardware level. Discovered architectures may not match wall-clock efficiency of hardware-optimized human baselines (e.g. Mamba2's CUDA kernels). LLM judge penalizes expensive designs but cannot guarantee hardware efficiency. |
| **Scalar fitness bottleneck** | Primary selection signal is a single float. Multi-objective trade-offs (accuracy vs efficiency vs generalization vs safety) require careful human-designed fitness function. |
| **Human-specified search space** | Depends on: human-chosen baselines, human-specified evaluation procedures, human-curated cognition base initialization. Not fully autonomous end-to-end science from problem formulation. |
| **Compute cost** | Each architecture trial = hours of GPU training. Early-rejection filters help, but the regime is expensive. Not accessible without substantial GPU infrastructure. |
| **Transfer generalization is preliminary** | DTI experiment is proof-of-concept only. Not a production-grade tool for any domain outside AI. |

### Inferred Gaps (Not stated)

| Gap | Impact |
|---|---|
| No multi-task simultaneous optimization | Each scenario runs in isolation; no cross-pillar joint optimization |
| Cognition base quality dependency | Garbage-in, garbage-out — poorly seeded cognition = poor cold-start |
| No stated DB pruning strategy | Database grows unboundedly; potential context inflation in very long runs |
| MAP-Elites behavioral space is manual | Human must define behavioral dimensions for island algorithm; not self-discovered |
| No adversarial robustness evaluation | Discovered architectures not stress-tested against adversarial inputs |
| No energy/carbon accounting | GPU hours reported anecdotally; no formal compute budget accounting |

---

## 17. CODEX INTEGRATION NOTES

### Minimum Viable Implementation

```python
# Core loop skeleton for any domain adaptation

class ASIEvolveLoop:
    def __init__(self, task, llm_client, eval_fn, cognition_docs, db):
        self.task = task
        self.llm = llm_client          # OpenAI-compatible
        self.eval = eval_fn            # Your domain evaluator
        self.cognition = CognitionBase(cognition_docs)  # Embed + index
        self.db = Database(db)         # SQLite or MongoDB

    def run(self, n_rounds, policy="ucb1"):
        for t in range(n_rounds):
            # LEARN
            context_nodes = self.db.sample(policy=policy, n=5)
            cognition_items = self.cognition.retrieve(
                query="
".join([n.analysis for n in context_nodes]),
                k=3
            )

            # DESIGN
            program, motivation = self.researcher(context_nodes, cognition_items)

            # EXPERIMENT
            score, metrics, logs = self.eval(program)

            # ANALYZE
            report = self.analyzer(program, metrics, logs)

            # PERSIST
            self.db.add_node(motivation, program, score, metrics, report)

        return self.db.top_k(k=5)
```

### Researcher Prompt Template

```python
RESEARCHER_PROMPT = """
You are an expert researcher in {domain}.
Your task: {task_description}

=== DOMAIN KNOWLEDGE (from literature) ===
{cognition_items}

=== PRIOR EXPERIMENTS (sampled from database) ===
{db_nodes_formatted}

=== INSTRUCTIONS ===
Generate the next candidate. First explain your motivation (what you're changing and why),
then provide the complete implementation.

Respond in this exact format:
MOTIVATION: <your reasoning, 2-4 sentences>
CODE:
```python
<complete candidate program>
```
"""
```

### Analyzer Prompt Template

```python
ANALYZER_PROMPT = """
You are an expert analyzer. Distill the following experiment into a compact causal report
that will guide future hypothesis generation.

Focus on: WHY did this result occur? What does it imply for next designs?
DO NOT just describe what happened — explain the mechanism.

Candidate code:
{code_excerpt}

Metrics:
{metrics_json}

Training log excerpt:
{log_excerpt}

Previous best score: {best_score}
This candidate's score: {current_score}

Produce a causal analysis report in ≤200 tokens. Be precise. Be actionable.
"""
```

### UCB1 Sampling Implementation

```python
import math

def ucb1_sample(nodes, C=1.4):
    """
    C: exploration constant (tune per task; higher = more exploration)
    """
    N = sum(n.visit_count for n in nodes)
    scores = [
        n.score + C * math.sqrt(math.log(N) / n.visit_count)
        for n in nodes
    ]
    return nodes[scores.index(max(scores))]
```

### Adaptation Guide for YURI-OS

| ASI-Evolve Component | YURI-OS Implementation |
|---|---|
| Cognition Base | Obsidian vault + NUDIMMUD docs → embed with nomic-embed or text-embedding-3-small → FAISS index |
| Database | SQLite with `aioqlite` for async; or local Postgres |
| Researcher LLM | Claude Sonnet via Anthropic API or DeepSeek via OpenRouter |
| Engineer | subprocess.run() wrapper around your eval script |
| Analyzer | Separate Claude call with 200-token output constraint |
| Sampling | Start with UCB1 (C=1.4); tune C up for exploration-heavy tasks |
| Diff mode | Use for large codebases — send only changed functions, not full file |

### What NOT to copy verbatim

- Multi-phase evaluation (20M → 340M → 1.3B) is architecture-task-specific. For non-ML tasks, design appropriate validation stages.
- Static check agent, debug agent, novelty deduplicator are architecture-task-specific.
- LLM-as-Judge fitness blending requires per-task calibration weight tuning.
- Nemotron-CC curation strategy is corpus-specific and not generalizable as-is.

---

## 18. CITATION & PROVENANCE

### Primary Citation (BibTeX)

```bibtex
@misc{xu2026asievolve,
  title={ASI-Evolve: AI Accelerates AI},
  author={Weixian Xu and Tiantian Mi and Yixiu Liu and Yang Nan and
          Zhimeng Zhou and Lyumanshan Ye and Lin Zhang and Yu Qiao and Pengfei Liu},
  year={2026},
  eprint={2603.29640},
  archivePrefix={arXiv},
  primaryClass={cs.AI},
  url={https://arxiv.org/abs/2603.29640}
}
```

### ASI-Arch Citation (BibTeX)

```bibtex
@misc{liu2025alphagomomentmodelarchitecture,
  title={AlphaGo Moment for Model Architecture Discovery},
  author={Yixiu Liu and Yang Nan and Weixian Xu and Xiangkun Hu and
          Lyumanshan Ye and Zhen Qin and Pengfei Liu},
  year={2025},
  eprint={2507.18074},
  archivePrefix={arXiv},
  primaryClass={cs.AI},
  url={https://arxiv.org/abs/2507.18074}
}
```

### All Key URLs

| Resource | URL |
|---|---|
| arXiv Abstract | https://arxiv.org/abs/2603.29640 |
| arXiv HTML (full paper) | https://arxiv.org/html/2603.29640v1 |
| GitHub ASI-Evolve | https://github.com/GAIR-NLP/ASI-Evolve |
| GitHub main.py | https://github.com/GAIR-NLP/ASI-Evolve/blob/main/main.py |
| GitHub requirements.txt | https://github.com/GAIR-NLP/ASI-Evolve/blob/main/requirements.txt |
| Paper PDF (GitHub) | https://github.com/GAIR-NLP/ASI-Evolve/blob/main/assets/paper.pdf |
| ASI-Arch GitHub | https://github.com/GAIR-NLP/ASI-Arch |
| ASI-Arch arXiv | https://arxiv.org/abs/2507.18074 |
| GAIR Lab GitHub | https://github.com/gair-nlp |
| HuggingFace Paper | https://huggingface.co/papers/2603.29640 |
| VentureBeat coverage | https://venturebeat.com/orchestration/new-ai-framework-autonomously-optimizes-training-data-architectures-and-algorithms-outperforms-human-researchers/ |
| Deep Learning Monitor | https://deeplearn.org/arxiv/725740/asi-evolve:-ai-accelerates-ai |
| Rustman wiki | https://rustman.org/wiki/asi-evolve-ai-research-agents/ |

---

*Pack compiled by NUDIMMUD — 2026-05-21*
*Sources: arXiv 2603.29640 (full HTML), GitHub GAIR-NLP/ASI-Evolve, GitHub GAIR-NLP/ASI-Arch, VentureBeat, ArXivIQ, Rustman wiki, Reddit r/accelerate, LinkedIn AlphaSignal, clauday.com*
*For YURI-OS / Codex ingestion — NUDIMMUD/YURI-OS clearance*
