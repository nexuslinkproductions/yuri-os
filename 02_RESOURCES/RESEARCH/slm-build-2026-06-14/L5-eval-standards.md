# L5 — Eval Standards (2026) for YURI-7B Tool/Agent/Verifier Model

**Angle:** How to evaluate a 7B SLM specialized for tool-routing, structured decisions, and verifier-in-the-loop quality.
**Date:** 2026-06-14 | **Prior context:** 10-SYNTHESIS, 11-ARXIV-BIBLIOGRAPHY in this dir.

---

## Layer 1 — Tool Routing & Function Calling

### BFCL V4 (Berkeley Function Calling Leaderboard)
- **URL:** https://gorilla.cs.berkeley.edu/leaderboard.html | ICML 2025 paper: https://proceedings.mlr.press/v267/patil25a.html
- **What's new:** V4 (leaderboard updated Apr 12 2026) adds holistic agentic evaluation on top of V3's multi-turn stateful scenarios. PyPI: `bfcl-eval==2025.12.17`.
- **Categories to run:** single-turn, parallel, relevance/abstention, multi-turn stateful.
- **YURI fit:** Primary correctness gate. Abstention category directly tests the routing-vs-refusal decision.

### LLMRouterBench
- **URL:** https://arxiv.org/abs/2601.07206 (Jan 2026)
- **Scale:** 400K+ instances, 21 datasets, 33 models, 10 routing baselines.
- **Key finding:** Model-recall failures are the primary gap; commercial routers often fail to beat simple baselines.
- **YURI fit:** Benchmark to prove the routing bet. Run performance-vs-cost frontier.

### AgentFloor
- **URL:** https://arxiv.org/abs/2605.00334 (May 2026)
- **Design:** 30 tasks on a six-tier ladder (instruction follow → tool use → multi-step → long-horizon). 16 models 0.27B–32B, 16,542 runs.
- **Finding:** Mid-sized models sufficient for short-horizon structured tool use; gaps emerge only at tier 5-6.
- **YURI fit:** 7B sits in the "sufficient" tier for YURI's target tasks. Use tier 1-3 as the pass threshold.

---

## Layer 2 — Agentic End-to-End Reliability

### tau-bench
- **URL:** https://arxiv.org/abs/2406.12045
- **What:** Tool-Agent-User interaction. 115 retail + 50 airline + 114 telecom (TAU2) tasks. Checks DB state, not just syntax. `pass^k` metric.
- **Critical caveat:** Empty responses counted as success in some configs — validate against ABC checklist before trusting scores.
- **YURI fit:** End-to-end loop eval. pass^k is the right reliability metric for a verifier-gated system.

### Agentic Benchmark Checklist (ABC)
- **URL:** https://arxiv.org/abs/2507.02825 (2025)
- **Finding:** Benchmark flaws can cause 100% relative overestimation. ABC reduces overestimation by 33%.
- **YURI fit:** Run every tau-bench / agentic eval setup through ABC before reporting numbers.

---

## Layer 3 — Structured Output Correctness

### JSONSchemaBench
- **URL:** https://github.com/guidance-ai/jsonschemabench | HF: `epfl-dlab/JSONSchemaBench`
- **Scale:** 9,558 real-world JSON schemas; 10 datasets including GitHub-Hard and Kubernetes.
- **Tests:** Guidance, Outlines, LlamaCpp, XGrammar, OpenAI, Gemini.
- **YURI fit:** Stress-test the constrained-decoding backend. GitHub-Hard and Kubernetes splits are the failure-surface.

### SOB — Structured Output Benchmark
- **URL:** https://arxiv.org/abs/2604.25359 (Apr 28 2026 — NeurIPS 2026 submission)
- **Finding:** Near-perfect schema compliance but only 83% value accuracy on text. Schema validity ≠ semantic correctness.
- **YURI fit:** Calibration check that YURI-7B's structured decisions are semantically correct, not just syntactically valid.

---

## Layer 4 — Verifier & Reward Model Evaluation

### FC-RewardBench + ToolRM
- **URL:** https://arxiv.org/abs/2509.11963 (Sep 2025, rev Jan 2026)
- **FC-RewardBench:** 1500 data points from BFCL-v3; correct vs incorrect tool-call pairs; first benchmark for reward models on tool-calling.
- **ToolRM:** 1.7B–14B reward models; up to 25% best-of-N improvement over general baselines.
- **YURI fit:** Compare YURI's deterministic gate against ToolRM-1.7B on FC-RewardBench. If deterministic gate loses, verifier design needs revision before RLVR training.

### RewardBench 2
- **URL:** https://arxiv.org/abs/2506.01937 (ICLR 2026)
- **Finding:** Models score ~20pts lower than RewardBench 1. Human-sourced prompts. Multi-skill: IF, reasoning, safety.
- **YURI fit:** 2026 standard if YURI-7B or its verifier is used as a preference/reward model. RewardBench 1 scores do not transfer.

### VerifyBench
- **URL:** https://arxiv.org/abs/2507.09884 (Jul 2025)
- **Design:** 4000 expert questions (math, physics, chemistry, biology). Specialized vs general verifiers.
- **Finding:** Input-structure sensitivity is high; cross-domain generalization is the failure surface.
- **YURI fit:** Test the energy-gate verifier with both structured and free-form inputs, not just canonical format.

---

## Layer 5 — Instruction Following & Regression

### IFEval
- **URL:** https://huggingface.co/datasets/google/IFEval | integrated in lm-eval-harness
- **Design:** 541 prompts, 25 verifiable constraint types. Automated scoring.
- **YURI fit:** Cheap regression gate after every fine-tuning step. Confirms tool-routing SFT has not broken general instruction following.

---

## Baselines & Size Calibration

| Source | Key number | Interpretation |
|--------|-----------|----------------|
| TinyLLM (arXiv:2511.22138) | 65.74% BFCL (1-3B, hybrid optim) | YURI-7B floor to beat |
| AgentFloor | 7B = tier 1-3 sufficient | Realistic scope |
| ToolRM-1.7B | +25% best-of-N vs general RM | Verifier comparison target |
| SOB text split | 83% value accuracy ceiling (21 models) | Correctness target |

---

## Eval Stack Summary

```
1. BFCL V4 (abstention + multi-turn)  ← primary tool-routing gate
2. tau-bench pass^k + ABC checklist   ← agent reliability
3. LLMRouterBench cost-perf frontier  ← routing justification
4. JSONSchemaBench GitHub-Hard        ← constrained decoding
5. SOB text split                     ← semantic correctness
6. FC-RewardBench vs ToolRM-1.7B      ← verifier quality comparison
7. IFEval                             ← regression gate (every FT step)
```
