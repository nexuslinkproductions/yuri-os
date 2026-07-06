# P5 — Neurosymbolic / LLM-as-Controller / Verifier-in-the-Loop

> Annotated bibliography for YURI-7B build (area: neurosymbolic + verifier-guided architecture).
> Agent: Claude Sonnet 4.6 subagent. Date: 2026-06-14.
> All 8 papers verified by fetching arxiv.org/abs/<id> directly.

---

## Top Pick

**Small Language Models Need Strong Verifiers to Self-Correct Reasoning** (2404.17140)
is the most load-bearing paper for YURI-7B. It proves empirically that a sub-13B model
gains meaningful self-correction ONLY when paired with a strong external verifier — precisely
the YURI architecture where `computeU`/`gateProposal` acts as the deterministic verifier
wrapping the 7B language faculty. The weak-verifier failure mode it names is the exact risk
YURI sidesteps by using a deterministic energy-gate instead of a second LLM.

---

## Papers

### 1. Small Language Models Need Strong Verifiers to Self-Correct Reasoning
**arXiv:** [2404.17140](https://arxiv.org/abs/2404.17140) · 2024 · Zhang, Khalifa, Logeswaran et al.
SLMs (≤13B) cannot self-correct without a strong external verifier — gains appear when the
verifier is genuinely separate from the generator.
_YURI mechanism: computeU verifier + gateProposal outer correction loop._

### 2. Search, Verify and Feedback: Towards Next Generation Post-training Paradigm via Verifier Engineering
**arXiv:** [2411.11504](https://arxiv.org/abs/2411.11504) · 2024 · Guan, Liu, Lu, Cao, He, Han, Sun et al.
Frames search→verify→feedback as the canonical post-training loop; treats the verifier as
the primary training signal, maps to YURI-7B's generate→computeU→feedback cycle.
_YURI mechanism: zeroth-order training loop design; verifier-as-objective._

### 3. Generative Verifiers: Reward Modeling as Next-Token Prediction
**arXiv:** [2408.15240](https://arxiv.org/abs/2408.15240) · 2024 · Zhang, Hosseini, Bansal, Kazemi, Kumar, Agarwal
GenRM verifiers trained as next-token predictors outperform discriminative reward models;
informs encoding `computeU` feedback as token-level supervision rather than a scalar.
_YURI mechanism: claim-cortex grammar; verifier signal encoding for MLX training._

### 4. On-Device Fine-Tuning via Backprop-Free Zeroth-Order Optimization
**arXiv:** [2511.11362](https://arxiv.org/abs/2511.11362) · 2025 · Katti, Sifaou, Park, Rajendran, Simeone
MeZO-style ZO gradient estimation via forward passes only — no intermediate activations
stored, no CUDA required. Directly enables on-device 7B fine-tuning on 16GB M2 Pro Metal.
_YURI mechanism: MLX training path; backprop-free ZO objective driven by computeU reward._

### 5. VERGE: Formal Refinement and Guidance Engine for Verifiable LLM Reasoning
**arXiv:** [2601.20055](https://arxiv.org/abs/2601.20055) · 2026 · Singh, Cassel, Weir, Feng, Bayless
SMT-solver verifier decomposes LLM output into logical claims, verifies consistency,
returns error-localized feedback (+18.7% accuracy). Blueprint for YURI's deterministic
spine providing structured feedback into the 7B generation layer.
_YURI mechanism: claim-cortex grammar; computeU verifier feedback loop._

### 6. Neuro-Symbolic Verification on Instruction Following of LLMs (NSVIF)
**arXiv:** [2601.17789](https://arxiv.org/abs/2601.17789) · 2026 · Su, Xu, Gao, Yang, Li, Yang, Xu
Treats instruction-following verification as constraint satisfaction via first-order logic
and generated checker code; informs claim-cortex grammar as a constraint layer over 7B output.
_YURI mechanism: claim-cortex grammar; instruction-constraint checking._

### 7. VeriCoT: Neuro-Symbolic Chain-of-Thought Validation via Logical Consistency Checks
**arXiv:** [2511.04662](https://arxiv.org/abs/2511.04662) · 2025 · Feng, Weir, Bostrom, Bayless, Cassel et al.
Converts CoT steps into formal logic for automated solver verification, feeds back to
self-reflection and fine-tuning; shows step-level gating of 7B chain-of-thought.
_YURI mechanism: claim-cortex grammar; step-level computeU gating of CoT._

### 8. Stable Agentic Control: Tool-Mediated LLM Architecture for Autonomous Cyber Defense
**arXiv:** [2605.03034](https://arxiv.org/abs/2605.03034) · 2026 · Prinos, Brush, Denton, Wang et al.
LLM wrapped by deterministic tool catalog + finite action space + Lean 4 formal guarantees;
59% reduction in attacker payoff. Direct structural analog for YURI-7B as language faculty
inside a deterministic spine with protected-path enforcement.
_YURI mechanism: LLM-as-controller bounded by deterministic spine; protected-path gate._

---

## Cross-Cutting Synthesis

Three convergent lines across the 8 papers:

**Line 1 — Verifier must be external.** Papers 1, 2, 3, 5 show a 7B self-corrects poorly as its
own verifier; gains are large with a genuinely external (deterministic or stronger) verifier.
YURI's `computeU`/`gateProposal` is that external gate — not a second LLM.

**Line 2 — Formal claim decomposition as the interface.** Papers 5, 6, 7 each decompose LLM
outputs into logical claims before verification. Isomorphic to YURI's `claim-cortex` grammar +
`prose-claim-extractor.mjs` — YURI already has this interface; the 7B slots in as the generator.

**Line 3 — Backprop-free ZO training is viable on-device.** Paper 4 confirms MeZO on-device ZO
is memory-safe. Combined with paper 2's verifier-as-objective framing, `computeU` energy signal
is a valid ZO training objective on the M2 Pro — the YURI-7B training hypothesis has published
support.

---

_Result: 05NS_NEUROSYMBOLIC_CONTROLLER_LITERATURE_X_PASS_COMMITTED_