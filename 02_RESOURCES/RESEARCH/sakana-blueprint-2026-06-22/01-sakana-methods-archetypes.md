# Sakana AI Methods → Agent Archetype Blueprint

**Date:** 2026-06-22
**Purpose:** Map Sakana.ai's documented research methods to functional agent archetypes for a self-governing ~20-role agentic organization.
**Sources:** Primary — sakana.ai blog, arXiv papers, official GitHub repos. All load-bearing claims cited.

---

## 1. The AI Scientist (v1 + v2)

### What It Does
Fully automated research lifecycle: idea generation → literature search → experiment design/coding → parallelized execution via agentic tree search → LaTeX paper writing → automated peer review. v2 (arXiv:2504.08066) broadened scope beyond templates; produced the first fully AI-authored paper to pass human peer review at ICLR 2025's ICBINB workshop (score 6.33, >55th percentile of human submissions). Published in *Nature* (2024/2025 collaboration: Sakana AI, UBC, Vector Institute, Oxford). [(sakana.ai/ai-scientist-nature)](https://sakana.ai/ai-scientist-nature/)

### Pipeline Stages (primary source)
1. **Idea Generation** — novel concept synthesis within a research domain
2. **Literature Review** — autonomous search + reading of relevant papers
3. **Experiment Design** — programming and designing computational experiments
4. **Execution** — parallelized agentic tree search across experimental paths
5. **Writing** — full LaTeX paper with LLM-generated figure feedback
6. **Automated Review** — structured peer-review evaluation metric

v2 delta: replaces fixed "template" with parallelized tree search allowing broader exploration. [(arXiv:2504.08066)](https://arxiv.org/abs/2504.08066)

### Agent Archetypes Implied

| Archetype | Capabilities | Mechanism Demonstrated |
|-----------|-------------|----------------------|
| **Ideator** | hypothesis-generation, literature-synthesis, novelty-scoring | Searches prior work, proposes unexplored directions |
| **Experimenter** | experiment-design, code-generation, parallel-execution, metric-collection | Tree search over experimental variations |
| **Writer/Synthesizer** | technical-writing, figure-generation, LaTeX-production | Full paper from raw results |
| **Peer-Reviewer** | adversarial-critique, structured-rubric-scoring, accept/reject | Automated Reviewer metric; scores completeness, novelty, rigor |

### Self-Governance Mechanism
**Parallelized agentic tree search** as the exploration strategy: multiple experimental branches run concurrently; the system selects promising paths via scoring. Automated Reviewer closes the loop — the system evaluates its own output before surfacing it. This is a closed-loop quality gate without human checkpoints.

---

## 2. Evolutionary Model Merge

### What It Does
Uses evolutionary algorithms to automatically discover optimal combinations of existing open-source models in both parameter space (weight mixing ratios) and data-flow space (layer recombination). No gradient-based training required. Produced EvoLLM-JP (SOTA Japanese math LLM) and EvoVLM-JP. Accepted in *Nature Machine Intelligence*. [(arXiv:2403.13187)](https://arxiv.org/abs/2403.13187) [(sakana.ai/evolutionary-model-merge)](https://sakana.ai/evolutionary-model-merge/)

### Core Mechanism
- **Parameter Space**: evolves weight-mixing ratios across layers of multiple models
- **Data-Flow Space**: discovers which layers to combine and in what sequence
- **Fitness evaluation**: benchmark performance on desired capability
- **Selection pressure**: top performers reproduce; weak candidates are discarded
- "Collective intelligence of 500,000+ open-source models" — ecosystem as gene pool

### Agent Archetypes Implied

| Archetype | Capabilities | Mechanism Demonstrated |
|-----------|-------------|----------------------|
| **Composer/Integrator** | capability-synthesis, specialization-routing, component-assembly | Merges specialist sub-agents/modules into task-fit configurations |
| **Fitness Evaluator** | benchmark-execution, performance-scoring, selection-pressure | Evaluates candidate compositions on real tasks |
| **Population Manager** | archive-maintenance, diversity-preservation, generation-cycling | Maintains and evolves a population of agent variants |

### Self-Governance Mechanism
**Evolutionary selection loop**: the organization continuously tests new role combinations, scores them on real tasks, and promotes high-performing configurations. No human needed to decide which capability bundle wins — the benchmark is the authority.

---

## 3. Transformer² (Self-Adaptive LLMs)

### What It Does
A self-adaptation framework that adjusts LLM behavior at inference time by dynamically mixing pre-trained "expert vectors" (SVF: Singular Value Fine-tuning of weight matrices). Two-pass mechanism: first pass observes task properties; second pass mixes expert vectors to produce weights tailored to the incoming task. Accepted at ICLR 2025. [(arXiv:2501.06252)](https://arxiv.org/abs/2501.06252)

### Core Mechanism
- **Training**: singular value scales of weight matrices are tuned to produce task-specialized expert vectors
- **Inference pass 1**: dispatch system identifies task type from test-time behavior
- **Inference pass 2**: expert vectors mixed via RL-trained mixing policy → targeted behavior
- Result: outperforms LoRA with fewer parameters; composable across tasks

### Agent Archetypes Implied

| Archetype | Capabilities | Mechanism Demonstrated |
|-----------|-------------|----------------------|
| **Dispatcher/Router** | task-classification, intent-recognition, agent-selection | First-pass dispatch identifies what kind of expert is needed |
| **Adaptive Specialist** | dynamic-skill-loading, context-sensitive-behavior, expert-composition | Second-pass blends specialist capabilities per task |

### Self-Governance Mechanism
**Runtime task-type detection + dynamic capability assembly**: agents need not be pre-wired to fixed roles. A Dispatcher identifies what the task requires; an Adaptive Specialist assembles the right capability mix on-the-fly. Implies a self-configuring organization that auto-routes work to the right specialist blend without manual assignment.

---

## 4. AB-MCTS / TreeQuest (Adaptive Branching Monte Carlo Tree Search)

### What It Does
Inference-time scaling algorithm that generalizes repeated sampling with principled exploration/exploitation via tree search. At each node, adaptively decides whether to "go wider" (generate new candidate responses) or "go deeper" (refine existing ones) using external feedback signals. Multi-LLM variant adds a third dimension: dynamic selection of which frontier model to use at each node. Published arXiv:2503.04412. Achieves strong ARC-AGI-2 results (o4-mini + Gemini-2.5-Pro + R1-0528 ensemble). [(sakana.ai/ab-mcts)](https://sakana.ai/ab-mcts/)

### Collective Intelligence Framing (direct quote)
> "By pooling their intelligence, AI systems can solve problems that are insurmountable for any single model." — Sakana AI blog

The researchers describe frontier models as "precious resources for creating collective intelligence" and the ensemble as "a dream team of diverse human experts." [(sakana.ai/ab-mcts)](https://sakana.ai/ab-mcts/)

### Agent Archetypes Implied

| Archetype | Capabilities | Mechanism Demonstrated |
|-----------|-------------|----------------------|
| **Tree Orchestrator** | search-tree-management, node-expansion-decisions, exploitation-vs-exploration | AB-MCTS algorithm itself; manages depth vs. breadth |
| **Multi-Model Ensemble** | cross-model-collaboration, specialization-routing, synergy-detection | Multi-LLM AB-MCTS; different models solve different node types |
| **Verifier/Critic** | correctness-checking, feedback-signal-generation, solution-scoring | External feedback loop that drives tree expansion decisions |

### Self-Governance Mechanism
**Thompson Sampling over exploration/exploitation**: the organization autonomously decides when to generate new approaches vs. refine existing ones, using real performance feedback. This is the core "try-and-refine vs. try-new" decision loop made self-governing via probabilistic model of each path's potential.

---

## 5. The AI CUDA Engineer

### What It Does
Agentic system for automated CUDA kernel discovery, optimization, and composition. Uses LLM inference inside feedback loops to iteratively generate, test, and refine GPU kernels. Four-stage pipeline. Only publicly available large-scale CUDA kernel archive (~30,000 kernels, evaluated on KernelBench with H100 results). Published as Sakana AI technical report, 2025. [(pub.sakana.ai/static/paper.pdf)](https://pub.sakana.ai/static/paper.pdf)

### Pipeline Stages
1. **Convert** — natural language problem spec → executable CUDA template
2. **Translate** — language-level transformations, baseline optimization
3. **Optimize** — memory access patterns, thread configuration, computational efficiency (iterative LLM+feedback)
4. **Compose** — integrate optimized components into final kernel

### Agent Archetypes Implied

| Archetype | Capabilities | Mechanism Demonstrated |
|-----------|-------------|----------------------|
| **Domain Engineer** | domain-specific-codegen, hardware-aware-reasoning, iterative-refinement | LLM generates CUDA with awareness of GPU architecture constraints |
| **Benchmark Oracle** | correctness-testing, performance-profiling, metric-collection | Runs kernels, captures compile errors + timing, feeds back to engineer |
| **Knowledge Archivist** | artifact-storage, retrieval, deduplication, corpus-maintenance | 30k kernel archive; enables future lookup and composition |

### Self-Governance Mechanism
**Closed-loop compile-test-refine**: the agent receives compiler errors and performance metrics and autonomously adjusts its optimization strategy. Failure is data, not a stop condition. The system learns which GPU-specific tactics work without human intervention between iterations.

---

## 6. Darwin Gödel Machine (DGM)

### What It Does
Self-improving agent system that autonomously rewrites its own Python codebase, validates changes on coding benchmarks, and maintains an evolving archive of agent variants. Combines Gödel machine self-modification with Darwinian open-ended evolution. Published arXiv:2505.22954 (May 2025, Sakana AI + UBC). Demonstrated 30 percentage point absolute improvement on SWE-bench. [(sakana.ai/dgm)](https://sakana.ai/dgm/)

### Core Mechanisms
- **Self-rewriting**: agent reads and modifies its own Python source code
- **Empirical validation**: changes accepted only if they improve coding benchmark scores (no formal proofs)
- **Evolving archive**: maintains all generated agent variants, not just the best — "diverse stepping stones"
- **Non-greedy sampling**: seeds new modifications from across the archive, including "less-performant ancestors" that enabled breakthroughs in descendants
- Practical improvements discovered: patch validation, better file viewing, multi-solution generation with ranking, failure history injection

### Agent Archetypes Implied

| Archetype | Capabilities | Mechanism Demonstrated |
|-----------|-------------|----------------------|
| **Self-Modifier** | codebase-reading, targeted-patching, capability-extension | Reads + rewrites own tooling; proposes self-improvements |
| **Validator** | benchmark-execution, regression-testing, accept/reject-gating | Empirical fitness check before any change is kept |
| **Archive Curator** | variant-storage, lineage-tracking, diversity-maintenance | Maintains all agent variants; non-greedy ancestor sampling |
| **Failure Analyst** | error-pattern-extraction, lesson-encoding, history-injection | Injects "why it failed" into next modification attempt |

### Self-Governance Mechanism
**Open-ended self-improvement loop**: the organization does not hill-climb to a single best configuration — it maintains a branching, growing archive of diverse variants. Ancestor stepping stones preserve optionality. The system improves its own capacity to improve (meta-level capability growth), not just its task performance.

---

## 7. Continuous Thought Machines (CTM)

### What It Does
Neural architecture with internal recurrence completely decoupled from data dimensions, neuron-level temporal models (each neuron has unique weights processing incoming signal histories), and neural synchronization as the latent representation. Accepted at NeurIPS 2025. [(arXiv:2505.05522)](https://arxiv.org/abs/2505.05522)

### Core Innovations
1. **Internal recurrence** — enables a "thought" dimension independent of input sequence
2. **Neuron-Level Models (NLMs)** — each neuron processes its own incoming history; replaces static activation functions
3. **Neural synchronization** — pairwise neuron synchrony over time is the actual representation used for prediction/action
4. Emergent capabilities: navigates 2D mazes by forming internal maps without positional encodings; adaptive computation time (stops early on easy tasks, continues on hard ones)

### Agent Archetypes Implied

| Archetype | Capabilities | Mechanism Demonstrated |
|-----------|-------------|----------------------|
| **Deliberator** | depth-adaptive-reasoning, sequential-problem-solving, internal-state-accumulation | Internal recurrence = "thinking longer" on hard problems |
| **Adaptive Compute Allocator** | task-difficulty-detection, resource-allocation, early-stopping | Halts computation when confident; allocates more cycles when uncertain |

### Self-Governance Mechanism
**Adaptive computation budget**: agents allocate processing time proportional to problem difficulty — a direct model of cognitive resource self-management. No external scheduler needed; the agent knows when it has "thought enough."

---

## 8. Nature-Inspired / Collective Intelligence Philosophy

### What It Is
The foundational philosophy of Sakana AI. The name "Sakana" (魚 = fish) directly invokes the school-of-fish model: coherent collective behavior from simple rules applied by diverse individuals. David Ha's framing: human intelligence is fundamentally collective, not individual. [(sakana.ai/seed-round)](https://sakana.ai/seed-round/)

Core principles:
- **Emergence over monolith**: individual agents with local rules → global intelligence
- **Diversity as strength**: heterogeneous agents outperform homogeneous scaling
- **Evolution over design**: search the space of possible configurations rather than hand-engineering them
- **Sample efficiency over brute force**: elegant algorithms, not GPU-scaling
- **Open-endedness**: systems that keep discovering rather than converging on fixed optima

### RSI Lab (2026) — Operationalized Philosophy
Sakana's Recursive Self-Improvement Lab formalizes this into a research program: redesigning AI development with AI. Programs include LLM-Squared (discovers training improvements), ShinkaEvolve (efficient algorithm discovery), ALE-Agent (learns from its own failure history), Digital Red Queen (adversarial coevolution). [(sakana.ai/rsi-lab)](https://sakana.ai/rsi-lab/)

### Agent Archetypes Implied
The school-of-fish model directly implies that the organization IS the archetype: a **flat-ish swarm of diverse specialists** that achieves emergent coherence through shared evaluation criteria (benchmarks), not hierarchical command. The "red fish swimming away" in the logo = the agent that breaks from consensus when it has evidence to.

---

## Master Method → Archetype Mapping Table

| Sakana Method | Primary Archetype(s) | Key Capability Tags | Self-Governance Mechanism |
|---------------|---------------------|--------------------|-----------------------------|
| AI Scientist v1/v2 | Ideator, Experimenter, Writer/Synthesizer, Peer-Reviewer | idea-gen, experiment-execution, paper-writing, adversarial-critique | Automated Reviewer closes loop; parallelized tree search explores |
| Evolutionary Model Merge | Composer/Integrator, Fitness Evaluator, Population Manager | capability-synthesis, benchmark-scoring, archive-evolution | Evolutionary selection — benchmarks replace human judgment |
| Transformer² | Dispatcher/Router, Adaptive Specialist | task-classification, expert-composition, runtime-adaptation | Two-pass self-dispatch; RL-trained mixing policy |
| AB-MCTS | Tree Orchestrator, Multi-Model Ensemble, Verifier/Critic | search-management, cross-model-collab, feedback-scoring | Thompson Sampling over explore/exploit; multi-LLM routing |
| AI CUDA Engineer | Domain Engineer, Benchmark Oracle, Knowledge Archivist | domain-codegen, perf-profiling, artifact-corpus | Compile-test-refine loop; failure = data |
| Darwin Gödel Machine | Self-Modifier, Validator, Archive Curator, Failure Analyst | self-rewriting, regression-gating, lineage-tracking, failure-injection | Open-ended archive evolution; meta-level self-improvement |
| Continuous Thought Machines | Deliberator, Adaptive Compute Allocator | deep-sequential-reasoning, compute-self-allocation, difficulty-sensing | Adaptive computation time — internal halting criterion |
| Nature / Collective Intel | (organizational shape, not single archetype) | emergence, diversity, open-endedness | School-of-fish: local rules → global coherence |

---

## Recommended 10 Archetypes for a ~20-Role Roster

Distilled from all Sakana methods. Each archetype maps to 2 roles in a 20-role org (one senior, one junior or parallel variant).

| # | Archetype | Capability Tags | Source Methods |
|---|-----------|----------------|----------------|
| 1 | **Ideator** | hypothesis-generation, novelty-scoring, literature-synthesis, prior-art-search, divergent-scan | AI Scientist, Nature philosophy |
| 2 | **Experimenter** | experiment-design, parallel-execution, metric-collection, code-generation, tree-search | AI Scientist (agentic tree search) |
| 3 | **Peer-Reviewer / Adversarial Critic** | rubric-evaluation, flaw-detection, structured-rejection, quality-gating | AI Scientist Automated Reviewer, AB-MCTS Verifier |
| 4 | **Dispatcher / Router** | task-classification, intent-recognition, capability-routing, dynamic-assignment | Transformer² dispatch, AB-MCTS model-selection |
| 5 | **Domain Engineer** | domain-specific-codegen, iterative-refinement, hardware-awareness, artifact-generation | AI CUDA Engineer |
| 6 | **Composer / Integrator** | capability-synthesis, module-assembly, cross-domain-merging, configuration-search | Evolutionary Model Merge |
| 7 | **Self-Modifier / Evolver** | codebase-reading, targeted-patching, capability-extension, improvement-proposal | Darwin Gödel Machine |
| 8 | **Archive Curator / Population Manager** | variant-storage, lineage-tracking, diversity-maintenance, stepping-stone-preservation | DGM archive, Evolutionary Model Merge population |
| 9 | **Deliberator / Deep Reasoner** | depth-adaptive-reasoning, sequential-problem-solving, internal-state-accumulation, compute-self-allocation | Continuous Thought Machines |
| 10 | **Benchmark Oracle / Fitness Evaluator** | correctness-testing, performance-profiling, accept-reject-gating, objective-scoring | AI CUDA Engineer oracle, Evolutionary fitness, DGM validator |

### Notes on Roster Scaling to ~20 Roles
- Each archetype above covers 2 roles: one **orchestrator variant** (plans, decomposes, judges) and one **executor variant** (runs, measures, produces artifacts)
- The **Dispatcher/Router** is the zero-th role — it should always exist and be the first to activate on any task
- The **Archive Curator** is the organizational memory — without it, the school-of-fish loses its accumulated stepping stones
- **Self-Modifier** is the highest-risk role; gate with Validator before any modification propagates
- **Peer-Reviewer** should be structurally independent from Ideator/Experimenter to prevent echo chambers (mirrors Sakana's Automated Reviewer design)

---

## Citations

- AI Scientist v2: [arXiv:2504.08066](https://arxiv.org/abs/2504.08066)
- AI Scientist in Nature: [sakana.ai/ai-scientist-nature](https://sakana.ai/ai-scientist-nature/)
- Evolutionary Model Merge: [arXiv:2403.13187](https://arxiv.org/abs/2403.13187) | [sakana.ai/evolutionary-model-merge](https://sakana.ai/evolutionary-model-merge/)
- Transformer²: [arXiv:2501.06252](https://arxiv.org/abs/2501.06252) | [github.com/SakanaAI/self-adaptive-llms](https://github.com/SakanaAI/self-adaptive-llms)
- AB-MCTS / TreeQuest: [arXiv:2503.04412](https://arxiv.org/abs/2503.04412) | [sakana.ai/ab-mcts](https://sakana.ai/ab-mcts/) | [github.com/SakanaAI/treequest](https://github.com/SakanaAI/treequest)
- AI CUDA Engineer: [pub.sakana.ai/static/paper.pdf](https://pub.sakana.ai/static/paper.pdf)
- Darwin Gödel Machine: [arXiv:2505.22954](https://arxiv.org/abs/2505.22954) | [sakana.ai/dgm](https://sakana.ai/dgm/) | [github.com/jennyzzt/dgm](https://github.com/jennyzzt/dgm)
- Continuous Thought Machines: [arXiv:2505.05522](https://arxiv.org/abs/2505.05522) | [github.com/SakanaAI/continuous-thought-machines](https://github.com/SakanaAI/continuous-thought-machines)
- RSI Lab: [sakana.ai/rsi-lab](https://sakana.ai/rsi-lab/)
- Nature/Collective Intelligence philosophy: [sakana.ai/seed-round](https://sakana.ai/seed-round/)
