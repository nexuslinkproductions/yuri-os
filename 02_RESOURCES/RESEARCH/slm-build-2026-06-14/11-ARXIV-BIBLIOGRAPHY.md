# 11 — arXiv BIBLIOGRAPHY for YURI-7B (verified)

> 46 papers, 5 areas, gathered by a 5-agent arXiv swarm + 3 cross-family peers (mimo/deepseek/glm).
> **Verification: foundational IDs cross-corroborated by ≥3 independent peers + known-real; every recent
> 2025–2026 ID checked against the live arXiv API (titles matched exactly) — 0 hallucinations.** Per-area
> annotated docs: `P1-…` (memory/ZO) · `P2-…` (verifier/RLVR) · `P3-…` (constrained decoding) ·
> `P4-…` (distillation/small-strong) · `P5-…` (neurosymbolic control). Reads with `10-SYNTHESIS-AND-7B-PLAYBOOK.md`.

## The core reading path (the load-bearing 14 for YURI-7B)

### The novel direction — verifier-guided zeroth-order on-device training
1. **MeZO — Fine-Tuning Language Models with Just Forward Passes** · [2305.17333](https://arxiv.org/abs/2305.17333) ·
   forward-only SPSA gradient, ~12× memory cut, **explicitly supports non-differentiable objectives** →
   `computeU`/`gateProposal` can BE the training objective. The substrate of the whole on-device idea.
2. **Sparse MeZO** · [2402.15751](https://arxiv.org/abs/2402.15751) · ZO updates on a parameter subset →
   +9% acc, 3.5× faster. Maps to YURI's verifier-selected high-signal weights.
3. **On-Device Fine-Tuning via Backprop-Free ZO** · [2511.11362](https://arxiv.org/abs/2511.11362) ·
   quantifies how much larger a model ZO trains vs backprop at a fixed device-memory budget → direct M2 Pro/16GB planning.
4. **Generative Verifiers: Reward Modeling as Next-Token Prediction** · [2408.15240](https://arxiv.org/abs/2408.15240) ·
   the verifier as an LLM-native objective — bridges YURI's deterministic gate to a learnable reward.

### Verifier / RLVR — the reward-from-a-verifier evidence (YURI has the verifier for free)
5. **DeepSeekMath / GRPO** · [2402.03300](https://arxiv.org/abs/2402.03300) · the RL optimizer that takes a
   scalar reward (no value net) → `computeU` slots in as `reward_fn`.
6. **DeepSeek-R1** · [2501.12948](https://arxiv.org/abs/2501.12948) · RLVR at scale + distillation to small dense models.
7. **Let's Verify Step by Step (PRM)** · [2305.20050](https://arxiv.org/abs/2305.20050) · process > outcome reward.
8. **rStar-Math** · [2501.04519](https://arxiv.org/abs/2501.04519) · **the existence proof: a small LLM beats
   far larger models on math via self-evolution + a verifier.** This IS the YURI-7B thesis, demonstrated.
9. **RLVR Implicitly Incentivizes Correct Reasoning in Base LLMs** · [2506.14245](https://arxiv.org/abs/2506.14245) ·
   why verifiable-reward RL works even from a base model.

### 7B-punches-above-weight — data quality + distillation
10. **Textbooks Are All You Need (Phi)** · [2306.11644](https://arxiv.org/abs/2306.11644) + **Phi-4** ·
    [2412.08905](https://arxiv.org/abs/2412.08905) · curated/synthetic data > raw scale at small sizes.
11. **Weak-to-Strong Generalization** · [2312.09390](https://arxiv.org/abs/2312.09390) · a weaker supervisor
    (or verifier) eliciting stronger capability — the training-signal direction YURI uses.

### Non-stochastic decoding — the moat at inference
12. **XGrammar** · [2411.15100](https://arxiv.org/abs/2411.15100) + **XGrammar-2** ·
    [2601.04426](https://arxiv.org/abs/2601.04426) · fast grammar-constrained generation → claim-cortex-schema-as-grammar.
13. **Pre³ — Deterministic Pushdown Automata for Structured Generation** · [2506.03887](https://arxiv.org/abs/2506.03887) ·
    deterministic structured decoding (pairs with `needle/constrained.py`).

### YURI-as-controller — neurosymbolic / verifier-in-the-loop architecture
14. **Small Language Models Need Strong Verifiers to Self-Correct** · [2404.17140](https://arxiv.org/abs/2404.17140) ·
    direct: a small model + a strong external verifier (YURI) > the small model alone. Plus **VERGE**
    [2601.20055](https://arxiv.org/abs/2601.20055) and **VeriCoT** [2511.04662](https://arxiv.org/abs/2511.04662)
    for formal/logical CoT validation — the deterministic-spine-wraps-SLM pattern, formalized.

## Memory-efficient training (the cloud/scale leg)
- **QLoRA** [2305.14314](https://arxiv.org/abs/2305.14314) · **GaLore** [2403.03507](https://arxiv.org/abs/2403.03507)
  (full-param at low-rank-optimizer memory) · **LOMO** [2306.09782](https://arxiv.org/abs/2306.09782) +
  **AdaLomo** [2310.10195](https://arxiv.org/abs/2310.10195) · **ReLoRA** [2307.05695](https://arxiv.org/abs/2307.05695) ·
  **Lion** [2302.06675](https://arxiv.org/abs/2302.06675) · **8-bit Optimizers** [2110.02861](https://arxiv.org/abs/2110.02861).

## More verifier/RLVR + distillation + decoding (full set in the P-docs)
- RLVR/verifier: **DAPO** [2503.14476](https://arxiv.org/abs/2503.14476) · **Rewarding Progress** [2410.08146](https://arxiv.org/abs/2410.08146) ·
  **Med-RLVR (3B)** [2502.19655](https://arxiv.org/abs/2502.19655) · **Search-Verify-Feedback** [2411.11504](https://arxiv.org/abs/2411.11504) ·
  **RLVR hidden costs (position)** [2509.21882](https://arxiv.org/abs/2509.21882) · GSM8K verifiers [2110.14168](https://arxiv.org/abs/2110.14168).
- Distillation: **MiniLLM** [2306.08543](https://arxiv.org/abs/2306.08543) · **DistiLLM** [2402.03898](https://arxiv.org/abs/2402.03898) ·
  **MoE-distill** [2502.12947](https://arxiv.org/abs/2502.12947).
- Decoding: **Outlines** [2307.09702](https://arxiv.org/abs/2307.09702) · **Grammar-Aligned Decoding** [2405.21047](https://arxiv.org/abs/2405.21047) ·
  **GCD (non-invasive)** [2403.06988](https://arxiv.org/abs/2403.06988) · **Synchromesh** [2201.11227](https://arxiv.org/abs/2201.11227) ·
  **JSONSchemaBench** [2501.10868](https://arxiv.org/abs/2501.10868) · **The Constraint Tax** [2605.26128](https://arxiv.org/abs/2605.26128) ·
  **Thinking Before Constraining** [2601.07525](https://arxiv.org/abs/2601.07525) · **Flexible GCD** [2502.05111](https://arxiv.org/abs/2502.05111).
- Tool-use/controller: **Toolformer** [2302.04761](https://arxiv.org/abs/2302.04761) · **ReAct** [2210.03629](https://arxiv.org/abs/2210.03629) ·
  **Neuro-Symbolic Verification of Instruction-Following** [2601.17789](https://arxiv.org/abs/2601.17789) ·
  **Stable Agentic Control** [2605.03034](https://arxiv.org/abs/2605.03034).
- Foundations: **LoRA** [2106.09685](https://arxiv.org/abs/2106.09685) · **InstructGPT/RLHF** [2203.02155](https://arxiv.org/abs/2203.02155).

## What this changes for the build
The literature **confirms the YURI-native direction is real, not speculative**: (a) ZO training with a
non-differentiable verifier objective is published + extended (MeZO → Sparse MeZO → On-Device ZO); (b)
small-model-beats-large via verifier + self-evolution is demonstrated (rStar-Math, R1-distill); (c)
deterministic structured decoding is mature (XGrammar-2, Pre³); (d) neurosymbolic verifier-in-the-loop
architectures are an active 2026 frontier (VERGE, VeriCoT) — exactly where YURI already sits. The gap nobody
else has: **a deterministic, already-built verifier (`computeU`) to plug in as the ZO/RLVR objective.** That's
the unfair advantage the training-method simulator should exploit.

## Verification note
Cross-source: 15 foundational IDs cited independently by all 3 peers. Recent (2025–2026): 20 IDs checked
against `export.arxiv.org/api` — every title returned matched the claimed title. No fabricated IDs found.
