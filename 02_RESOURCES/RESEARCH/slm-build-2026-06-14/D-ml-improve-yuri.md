# D — ML Techniques to Improve Existing YURI (2026-06-14)
> Angle D, SLM research mission. LOCAL-FIRST + online. Cited, bounded.

## 1. Energy Gate Weights: Platt Calibration + Thompson Bandit
**Problem:** `yuri-energy.mjs:23` — weights hand-tuned, not learned. Calibration toolchain BUILT but DISARMED.
**Technique 1a — Platt calibration (buildable-now, 50 labels, 0 GPU):**
Fit `σ(a·U+b)` on 46k burn-in trace. Outputs real `pReject` probability — the GVF §4 C-layer requirement.
**Technique 1b — Thompson bandit soft weights (≥200 labels):**
Per soft weight (α,β,γ,δ,ε,ζ,ι,μ): Beta(α_w,β_w) posterior over correct-verdict rate. Sample θ_w → propose weight vector → gate through `yuri-energy-twosided.mjs`. η,θ barrier terms: hard-excluded, inviolable.
**Wire:** extend `yuri-energy-propose.mjs` with `thompsonSample(ledger)`; promotion ladder is the admission gate.
Source: [arXiv 2604.14961](https://arxiv.org/html/2604.14961v1) · [arXiv 2601.19944](https://arxiv.org/pdf/2601.19944)

## 2. GVF Calibration Layer C: Mondrian Conformal Prediction
**Problem:** GVF §1 marks energy C as **MISSING**. Raw U scores are not probabilities.
**Technique:** Nonconformity score `s_i = |U_i−ŷ_i|`; per-stratum quantile q̂_{1−α}. Coverage guarantee P(overclaim)≤α, distribution-free, 500+ records sufficient, 0 GPU.
**Wire:** new `yuri-energy-conformal.mjs` — reads trace JSONL, emits `{pReject, coverageGuarantee, stratum}` shadow-only.
Source: [arXiv 2504.09310](https://arxiv.org/pdf/2504.09310) · [arXiv 2508.06885](https://arxiv.org/pdf/2508.06885)

## 3. Energy Gate as PRM / RLVR Corpus
**Insight:** computeU already emits `(state, action, U_delta, verdict)` — exactly the PRM training format. 46,854 trace records = ready RLVR corpus. Distill a 1-3B verifier → deploy via MLX on M2 Pro.
**Wire:** `yuri-energy-trace.mjs export --format rlvr` → TRL RewardTrainer on rented H100 → quantize → MLX serve.
Source: [AgentPRM arXiv 2511.08325](https://arxiv.org/abs/2511.08325) · [VAGEN arXiv 2602.00575](https://arxiv.org/html/2602.00575v1)

## 4. Capability Matcher: Online LTR + Thompson Per-Cap
**Evidence (16M-eval sim):** LTR winner: P@1 0.728→0.933 at ≥6 labels. IDF-cosine = baseline at 8 caps. Centrality prior harmful (−4 to −40pt).
**Technique:** Feature vector φ=[cosine,idf_cos,centrality,serves_jaccard]. Online SGD on used? signal. Per-cap Beta posteriors. Usage proxy: gitnexus_detect_changes (was cap imported post-query?).
**Wire:** extend `capability-recall.mjs` with `updateRanker(query, capId, used)`. ~150 lines JS, 0 GPU.
Source: [local capability-first-math-extensions-2026-06-13.md]

## 5. Active Learning: Uncertainty-Sampling Label Budget
**Technique:** Query trace records where |U−threshold|<ε first — maximum calibration information per label.
**Wire:** `yuri-energy-calibrate.mjs suggest-labels --budget 50`. Uncertainty Herding shows this beats random at all budget sizes.
Source: [OpenReview UgPoHhYQ2U](https://openreview.net/forum?id=UgPoHhYQ2U)

## 6. ECE Reliability Diagrams
**Wire:** `yuri-energy-analyze.mjs --ece`. Bin trace by predicted confidence, compute ECE=Σ|Bm|/N·|acc−conf|. Zero blast-radius analysis pass. Makes calibration gap visible before any weight changes.

## Myth vs Real
| Claim | Reality |
|---|---|
| IDF-cosine beats deterministic matching | NO — empirically disproven at small corpus scale |
| Centrality prior improves recall | NO — measured harmful at −4 to −40pt |
| Train reward model on M2 Pro 16GB | NO — needs cloud GPU; distillation is cloud-gated |
| DPO/GRPO applies to current YURI | NO — applies to SLM training (Angle B/C scope) |
| Thompson bandit can tune η,θ barriers | NEVER — inviolable safety floors |
| Platt calibration on burn-in trace | YES — 50 labels, CPU, ~30 lines |
| Mondrian conformal wrapping | YES — 500 records, 0 GPU, distribution-free guarantee |
| Online LTR for capability matcher | YES — empirically proven, ~150 lines JS |

## Build Order
1. ECE + suggest-labels (0 blast-radius, 1 day)
2. Platt calibration shadow layer (50 labels, 1 day)
3. LTR capability matcher (closes proven P@1 gap, ~150 lines)
4. Mondrian conformal wrapper (GVF keystone, shadow-first)
5. Thompson soft-weight proposer (deferred, ≥200 labels)
6. RLVR trace export → cloud distillation (Angle B scope)