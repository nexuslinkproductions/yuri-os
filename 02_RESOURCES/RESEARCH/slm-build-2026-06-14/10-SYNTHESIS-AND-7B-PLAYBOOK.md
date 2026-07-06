# 10 — SYNTHESIS + 7B BUILD PLAYBOOK (held for "go")

> Folds the 5-angle research swarm (A–E) + 3 cross-family peers (mimo/deepseek/glm). Cross-family
> CONVERGENCE is genuine (all read the live repo + cited online). **STATUS: research/prep. The build is
> owner-gated — execute on Marcel's explicit "go" only.** Reads with `00-SLM-RESEARCH-BRIEF.md`.

## 1. The unified verdict (cross-family convergent)

- **Inference 7–9B local: PROVEN on THIS box.** YURI already ran Qwen3.5-9B Q5_K_M = **6.3GB, 100% GPU,
  22.6 tok/s** (`qwen3.5-9b-glm5.1-distill-local-lane-eval-2026-06-13.md`). 7B Q4 ≈ 4.5GB → effortless;
  12B Q4 ≈ 7.7GB → tight-but-works. 16GB serves a 7B SLM comfortably at ≤8k context.
- **Training a 7B locally: NO** (the wall, unanimous). Adam optimizer states alone = 8 B/param → a 7B needs
  ~48GB just for optimizer state. bitsandbytes 4-bit (HF QLoRA) is **CUDA-only** → doesn't run on MPS.
  mlx-lm's *own* quant-LoRA runs on Metal but is swap-heavy + ~1–2 tok/s for 7–8B → smoke-test only
  (≤1.5B practical local-train ceiling). **A-vs-B contradiction resolved:** "7B QLoRA local" = technically
  runs via mlx-lm, impractical for real training → cloud. Both angles agree serious fine-tune = cloud.
- **The path = HYBRID, buildable now:** smoke-test locally (mlx-lm, free) → fine-tune/distill on **rented
  H100/A100** (Unsloth, **$2–15/run**) → merge → **GGUF Q4_K_M/Q5_K_M** → serve locally via llama.cpp/Ollama
  Metal → wrap with the YURI spine. Hardware upgrade (64–128GB) later pulls training in-house; NOT required.

## 2. Local-first GOLD — YURI is further along than assumed

- `_SYSTEM/training/scripts/run-lora-finetune.sh` — mlx-lm LoRA pipeline (targets Llama-3.2-3B-4bit) +
  `promote-model.sh` → Ollama. **The cloud-train step is the one missing link.**
- `qwen-local` (Qwen3.5-9B) already served via Ollama, benchmarked on this machine.
- `_SYSTEM/tools/needle/needle/model/constrained.py` — a **character-level trie constrained decoder**
  (tool-forcing, masks invalid tokens) — the non-stochastic mechanism already exists.
- The deterministic spine (`computeU/gateProposal`, `claim-cortex.mjs`, `prose-claim-extractor.mjs`,
  xref/FTS5 retrieval, `nexus-rs` Rust kernels, the new 0-ULP distrib/round/ppmi) — every wrapper piece exists.

## 3. The thesis — can a YURI-7B outperform raw 12–40B? (honest)

**Raw 7B vs raw 40B on general benchmarks: NO** — that's the myth; don't chase it. **A 7B WRAPPED in YURI's
deterministic scaffolding vs a raw 12–40B, on YURI's task distribution (dispatch, classification, tool
routing, claim/structured decisions): YES, defensibly.** The win is system-level, not weight-level:

- **Constrained/grammar decoding** (XGrammar/llguidance/`constrained.py`, ~40–50µs/token): the 7B *cannot*
  emit invalid tool syntax or off-schema output → eliminates the class of errors big raw models still make.
- **gateProposal as a verifier-in-the-loop (RLVR):** generate N candidates, `computeU` scores each,
  `deltaU<=threshold` accepts; the protected-path hard veto already applies to SLM output unchanged. A raw
  40B has no deterministic verifier; YURI does. This is the moat.
- **computeU as the GRPO reward function** during training: most SLMs train against a learned reward model;
  YURI trains against a *deterministic* scorer → tighter, cheaper, less reward-hacking.
- **Retrieval over YURI memory + tool-use:** the 7B offloads knowledge/precision to YURI's deterministic
  organs, so it spends parameters on language, not memorization.
- Honest bound: the win is on **bounded-context, verifiable, tool-using, structured** tasks (YURI's actual
  load), not open-ended long-context reasoning (that stays on the Claude lane). Design the SLM for high-
  frequency bounded decisions; that's where 7B-system > 40B-raw is real.

## 4. The 7B BUILD PLAYBOOK (ready to execute on "go" — do NOT start yet)

- **Base model:** **Qwen3-8B-Base** (beats Qwen2.5-14B at 8B, Apache-2.0, proven 72B→8B distillation) or the
  already-wired **Qwen3.5-9B**. Fallbacks: Llama-3.1-8B (ecosystem), Gemma-3-12B (cloud-serve only).
- **Data:** harvest YURI's own structured decisions as (input,output) SFT pairs — dispatch/route/classify,
  claim-cortex outputs, gate verdicts. YURI generates the supervised signal natively.
- **Pipeline (rented H100, ~$6–15):** TRL/Unsloth **QLoRA SFT** → **DPO/SimPO** alignment → *optional*
  **GRPO** with `computeU` as `reward_fn` on verifiable YURI tasks → merge → `convert_hf_to_gguf.py`
  Q4_K_M/Q5_K_M → upload.
- **Serve (M2 Pro):** `ollama create yuri-slm` / `llama-server -ngl 99 --port 8080`; wire the OpenAI-compat
  endpoint into `llm-compat-contract.mjs` exactly like the Mimo/DeepSeek lanes (≈zero integration).
- **Wrap (the moat):** grammar-constrain every YURI-parsed output (claim-cortex schema → JSON grammar);
  route candidates through `gateProposal`; retrieve over memory; keep gate + provers JS (verifier imports
  the verified). 8k context ceiling → bounded-decision tasks only.
- **Smoke-test now-able (free, no build-commitment):** `mlx_lm.lora` on the existing script with a tiny
  sample just validates data format + loss curve — NOT the build. Held until "go" per owner.

## 5. ML upgrades to EXISTING YURI (Angle D — prototypable NOW, zero-GPU)

Map each to a live mechanism; all run on the M2 Pro without GPU:
- **Platt/isotonic calibration** on the 46k-record burn-in trace → `computeU` emits a calibrated `pReject`.
- **Thompson-bandit soft-weight proposals** via the existing `yuri-energy-calibrate.mjs` ladder (SOFT weights
  α,β,γ,δ,ε,ζ,ι,μ only; the η/θ barrier terms stay inviolable hard-excluded).
- **Mondrian conformal** wrapping → the GVF's missing calibrated-coverage layer (`yuri-energy-conformal.mjs` new).
- **Learning-to-rank** for capability recall (empirically +P@1).
- **ECE reliability diagrams** + **uncertainty-sampling** label budget.
- **Honest myth-busts (do NOT do):** IDF-cosine embeddings do **not** beat the deterministic matcher at
  current scale (revisit only at 100+ caps); centrality prior measured **harmful** (−4…−40pt P@1) — rejected.

## 6. Mojo verdict (Angle E — refined)

- **MAX does NOT serve LLMs on Apple GPU today** — CPU-only on M2 for model graphs, ~3–4× slower than
  Ollama+MLX. **For SLM serving NOW: MLX/llama.cpp, not Mojo.**
- **Mojo's right role:** custom numerical kernels (quantized matmul, scoring, attention variants) that target
  Metal **once MAX graphs land on Apple Silicon** (active eng, no committed date). Staged adoption: Mojo for
  the ML-adjacent kernel tier later; the Rust `nexus-rs` tier handles stable-hot kernels now.
- Consistent with the language-consolidation verdict: Mojo = the ML/numerical lane, not the embedded-kernel
  tier, and not the Apple-Silicon SLM-serving runtime yet.

## 7. HOLD

Build is owner-gated. This synthesis + the §4 playbook sit ready. On "go": execute §4 (rent GPU, QLoRA SFT,
GGUF, serve, wrap). Until then: capture-only + the zero-GPU §5 ML upgrades may proceed as normal substrate work.
