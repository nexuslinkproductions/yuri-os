# P3 — Constrained / Grammar-Guided / Structured Decoding
## Annotated Bibliography for YURI-7B

> Area: Grammar-constrained / structured decoding for the YURI-7B SLM pipeline.
> Scope: token-masking engines, FSM/CFG/PDA theory, schema-as-grammar enforcement,
> tool-call forcing, validity/correctness tradeoffs.
> Status: 11 papers verified (abs pages fetched). Date: 2026-06-14.

---

### [1] XGrammar (2024) — `2411.15100`
**Yixin Dong et al. — "XGrammar: Flexible and Efficient Structured Generation Engine for Large Language Models"**
https://arxiv.org/abs/2411.15100

Context-free grammar execution split into precomputable (context-independent) and runtime
(context-dependent) vocabulary partitions. Up to **100x per-token latency reduction**; integrated
into vLLM / llama-server serving Llama-3.1 with 80x end-to-end throughput gain.

**YURI-7B mechanism:** Primary runtime engine for grammar-constraining claim-cortex schema outputs;
the production backend the playbook already names by name.

---

### [2] XGrammar-2 (2026) — `2601.04426`
**Linzhang Li et al. — "XGrammar-2: Efficient Dynamic Structured Generation Engine for Agentic LLMs"**
https://arxiv.org/abs/2601.04426

Extends XGrammar with TagDispatch (per-turn schema switching) and Cross-Grammar Cache
(substructure-level reuse across requests). Over 6x faster compilation than prior engines, near-zero
end-to-end overhead. ACM CAIS 2026.

**YURI-7B mechanism:** Dynamic tool-call grammar switching in llm-compat-contract; per-task
claim-cortex schema variation across yuri-slm dispatch calls.

---

### [3] Outlines / Efficient Guided Generation (2023) — `2307.09702`
**Brandon T. Willard, Rémi Louf — "Efficient Guided Generation for Large Language Models"**
https://arxiv.org/abs/2307.09702

Foundational FSM formulation: generation = transitions between FSM states; precomputed vocabulary
index per schema. Model-agnostic, guarantees structural compliance. The architecture that
`constrained.py` and most production backends descend from.

**YURI-7B mechanism:** Theoretical foundation for the existing `constrained.py` trie decoder;
FSM masking model underlying claim-cortex grammar enforcement.

---

### [4] Grammar-Aligned Decoding / GAD (2024) — `2405.21047`
**Kanghee Park et al. — "Grammar-Aligned Decoding"**
https://arxiv.org/abs/2405.21047 — NeurIPS 2024

Standard GCD distorts the LLM's probability distribution; ASAp algorithm guarantees grammaticality
while provably preserving conditional probability proportional to the model's own distribution.
Higher-likelihood outputs than greedy masking on code generation and structured NLP.

**YURI-7B mechanism:** gateProposal / computeU verifier integrity: grammar masking must not
introduce distribution artifacts that mislead the energy gate; GRPO reward-signal quality.

---

### [5] GREATGRAMMA (2025) — `2502.05111`
**Kanghee Park, Timothy Zhou, Loris D'Antoni — "Flexible and Efficient Grammar-Constrained Decoding"**
https://arxiv.org/abs/2502.05111 — ICML 2025

17.71x faster offline CFG preprocessing using simple parsing-library primitives in 800 lines of
Python. Competitive online token-mask overhead.

**YURI-7B mechanism:** On-device grammar precompilation for claim-cortex and tool-call schemas on
the M2 Pro where preprocessing latency matters; candidate replacement for the offline phase of the
existing trie construction.

---

### [6] Pre³ / DPDA (2025) — `2506.03887`
**Junyi Chen et al. — "Pre³: Enabling Deterministic Pushdown Automata for Faster Structured LLM Generation"**
https://arxiv.org/abs/2506.03887 — ACL 2025

Transforms LR(1) grammars into DPDAs with precomputed edges; eliminates runtime path exploration.
Up to 40% reduction in time-per-output-token, 36% throughput increase. Seamless integration into
existing inference frameworks.

**YURI-7B mechanism:** Runtime token-masking kernel efficiency for yuri-slm serving; DPDA aligns
with YURI's deterministic-first philosophy for the constrained decoding layer.

---

### [7] Synchromesh / CSD (2022) — `2201.11227`
**Gabriel Poesia et al. — "Synchromesh: Reliable code generation from pre-trained language models"**
https://arxiv.org/abs/2201.11227 — ICLR 2022

Constrained Semantic Decoding: dynamically constructs regex/grammar constraints from typing, scoping,
and domain rules on-the-fly without retraining. Tested on GPT-3/Codex across SQL, Vega-Lite,
SMCalFlow.

**YURI-7B mechanism:** Conceptual ancestor of YURI's tool-call forcing and claim-cortex
schema-as-grammar: encodes YURI dispatch schemas as dynamic constraints during SLM inference.

---

### [8] DOMINO (2024) — `2403.06988`
**Luca Beurer-Kellner, Marc Fischer, Martin Vechev — "Guiding LLMs The Right Way: Fast, Non-Invasive Constrained Generation"**
https://arxiv.org/abs/2403.06988

Fully subword-aligned constraint enforcement via precomputed prefix trees (subterminal trees).
Near-zero overhead; in some cases ~2x speedup over unconstrained decoding via speculative decoding.

**YURI-7B mechanism:** Latency-zero constrained decoding for yuri-slm on-device; subword alignment
strategy to avoid vocabulary mismatch artifacts in claim-cortex grammar.

---

### [9] Thinking Before Constraining (2026) — `2601.07525` ★ TOP PICK
**Nguyen et al. — "Thinking Before Constraining: A Unified Decoding Framework for Large Language Models"**
https://arxiv.org/abs/2601.07525

In-Writing: free unconstrained reasoning until a trigger token, then structured decoding activates.
Eliminates premature constraint interruption of reasoning. Up to **27% accuracy gain** over pure
constrained generation on classification and reasoning tasks.

**YURI-7B mechanism:** Inference architecture: free CoT tokens before trigger, claim-cortex grammar
enforced for the structured output region only; gateProposal scores the constrained tail.

---

### [10] The Constraint Tax (2026) — `2605.26128`
**Jaideep Ray — "The Constraint Tax: Measuring Validity-Correctness Tradeoffs in Structured Outputs for Small Language Models"**
https://arxiv.org/abs/2605.26128

Hard schema constraints on sub-3B SLMs: validity reaches 100% but answer accuracy drops from 19.7%
to 11.0% in worst cases; wrong-but-valid outputs balloon from 49.5% to 88.9%. Tool-call executable
accuracy dropped from 91.5% to 48.0% under enforced schema on a calendar task.

**YURI-7B mechanism:** Size/schema selection evidence favoring 7B over smaller; validates
gateProposal as a mandatory correctness layer on top of grammar-valid outputs; informs training data
strategy to close the constraint tax.

---

### [11] JSONSchemaBench (2025) — `2501.10868`
**Saibo Geng et al. — "JSONSchemaBench: A Rigorous Benchmark of Structured Outputs for Language Models"**
https://arxiv.org/abs/2501.10868

10K real-world JSON schemas; six frameworks benchmarked (Guidance, Outlines, XGrammar, Llamacpp,
OpenAI, Gemini) across efficiency, coverage, quality. XGrammar and Guidance lead; complex schema
types expose coverage gaps in all frameworks.

**YURI-7B mechanism:** Backend selection basis for claim-cortex schemas; schema complexity design
guidance to stay within efficiently decodable classes; regression test set template.

---

## TOP PICK

**`2601.07525` — Thinking Before Constraining** resolves the core YURI-7B architectural question:
when does the claim-cortex grammar activate? Free CoT first, trigger-then-constrain is the answer
— and it delivers 27% accuracy gains on the exact task class (bounded structured decisions) that
YURI-7B is built for.

## RESULT LABEL
`03CD_CONSTRAINED_GRAMMAR_DECODING_SURVEY_X_PASS_COMMITTED`
