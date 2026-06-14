# 00 — SLM RESEARCH BRIEF (the work deck)

> **Ground truth for the "build YURI's own SLM" research mission. Every spawn / lane reads THIS FIRST.**
> Owner directive (2026-06-14): HIGH PRIORITY. "Could we build our own SLM at ~6–12B on here? … deep
> research on how to do that and how we can transform this system into a functional extension as an SLM."
> Also: deep research on ML + Mojo → what can we learn/apply to improve YURI, where/what/how. Capture
> all genuinely-useful cited findings to the corpus (`02_RESOURCES/RESEARCH/slm-build-2026-06-14/` + `ai reindex`).

## 1. MISSION + FRAMING (the organizing principle)

> **TARGET LOCKED (owner 2026-06-14): 7B.** Sweet spot for the 16GB M2 Pro (7B 4-bit serves comfortably; 7B
> is the clean rent-GPU fine-tune target). **STATUS: RESEARCH / PREP ONLY. The BUILD is owner-gated — start
> ONLY on Marcel's explicit "go". "Right now it's not the time yet."** Gather + capture enough to execute on command; do not begin building.

Build **YURI's own SLM** — a **7B**-class small language model that is YURI-specialized, and **transform the
existing YURI deterministic substrate into the control/reasoning/verification layer that wraps it** ("YURI
as a functional extension expressed as an SLM"). The SLM supplies the *language faculty*; YURI supplies the
*deterministic spine* (energy gate, claim cortex, memory, the Rust math kernels, the sim arsenal, constrained
verification). Connects to the investor-deck "non-stochastic SLM" vision + `ASIAN_MOE_STRATEGIES.md`
(distill large MoE → Small MoE).

## 2. HARDWARE REALITY (local evidence, the binding constraint)

- **MacBook Pro · Apple M2 Pro · 16GB unified memory · 19 GPU cores · Metal 4.** (`system_profiler`, 2026-06-14)
- **Verdict (honest):**
  - **Train 6–12B from scratch on this box: NO** (orders of magnitude off — needs cluster-scale FLOPs).
  - **Fine-tune / QLoRA 6–12B on 16GB: NO** (the wall — 7–8B QLoRA is *barely* possible, 12B OOMs).
  - **Inference 6–12B 4-bit on 16GB: YES for 7–8B (comfortable), TIGHT for 12–14B** (MLX / llama.cpp).
  - **Buildable-now path = HYBRID:** fine-tune/distill on **rented cloud GPU** (H100 hours, cheap) →
    **quantize → serve locally on the M2 Pro** + wrap with the YURI spine. Hardware upgrade
    (64–128GB M3/M4 Max) later pulls *training* in-house; it is NOT required to start.
  - The **YURI-as-SLM-extension architecture is prototypable NOW** with a 7–8B served via MLX.

## 3. RESEARCH ANGLES (each → local-first then online, CITED, captured)

- **A · SLM build path on Apple Silicon + hybrid economics** — exact RAM/VRAM needs per method; MLX vs
  unsloth vs llama.cpp vs axolotl; QLoRA/LoRA/full-FT memory math for 7B/8B/12B; 4-bit quant (GGUF/MLX/AWQ/
  GPTQ); context-length limits on 16GB; rent-GPU-then-serve-local cost + tooling (which provider, $/run).
- **B · SLM training methodology 2026** — base-model selection (Llama 3.x, Qwen 3, Gemma 3, Mistral, Phi,
  SmolLM) for a 6–12B YURI build; continued-pretrain vs SFT vs DPO/ORPO/KTO vs **distillation** (teacher→
  student, the ASIAN_MOE Small-MoE route); data curation + synthetic data from a teacher; eval harness; the
  **"non-stochastic" angle** (constrained/grammar-guided decoding, logit biasing, determinism, tool-forced).
- **C · YURI → SLM extension architecture** — how the existing deterministic substrate becomes the SLM's
  scaffolding: tool-use / function-calling, constrained generation (the energy gate / claim cortex as a
  verifier-in-the-loop / reward signal), retrieval over YURI memory, the Rust kernels as fast inference-side
  ops, speculative/guided decoding. What "YURI as an SLM" concretely means architecturally.
- **D · ML → improve EXISTING YURI** — ML techniques to upgrade the current substrate, where/what/how:
  learned + calibrated gate weights (bandits / RL / preference learning vs the current hand-tuned betas),
  embeddings vs the embedding-free matcher, active learning, calibration methods beyond brier/logloss,
  the energy gate as a reward model, learned simulation/prediction. Concrete application points in YURI.
- **E · Mojo → YURI** — where Mojo fits the ML/inference/training lane in 2026: MAX engine, GPU targets
  (does it reach Apple Metal?), maturity, what YURI kernels/serving to port, adoption path, how it serves
  the SLM build specifically. Cross-ref the existing language-consolidation verdict.

## 4. METHOD + CONSTRAINTS (research_pipeline.md — non-negotiable)

- **LOCAL-FIRST:** start in our corpus (`ai search`). Known local hits to read FIRST:
  `02_RESOURCES/RESEARCH/REVERSE_ENGINEERING/ASIAN_MOE_STRATEGIES.md`, the investor-deck SLM vision
  (`02_RESOURCES/INVESTOR-DECK/investor-deck-plan.json` → slm_development), `_SYSTEM/archive/.../mlops/training/unsloth/*`,
  and `language-consolidation-rust-mojo-zig-2026-06-14.md`. Only escalate online when the corpus is insufficient.
- **CITED + BOUNDED:** every online finding carries a source URL; evidence packs ≤80 lines, syntheses ≤120.
  No raw page dumps. raw.githubusercontent.com + api.github.com are free; other domains via WebSearch/WebFetch.
- **CAPTURE:** write synthesized cited findings to `02_RESOURCES/RESEARCH/slm-build-2026-06-14/<angle>.md`,
  then `ai reindex`. This is the bridge from one-off lookup to compounding corpus — skip it and it evaporates.
- **Advisory-until-verified:** peer/model output is advisory; claims separate from evidence.

## 5. SPAWN PROTOCOL

- Read this brief first, then the local hits for your angle, then targeted online.
- Output a structured, cited findings doc for your angle (feasible/not, the concrete HOW, costs, the YURI
  application, sources). Flag what's myth vs buildable-now. Emit a Lane Result Grammar label.

## 6. STATUS LOG

- 2026-06-14 — Brief created. Hardware confirmed (M2 Pro/16GB). Feasibility verdict set (train=no, serve=yes,
  hybrid=the path). Fired peers (mimo/deepseek/glm) + 5-angle research swarm (local-first→online→cited).
- 2026-06-14 — **Owner: TARGET = 7B (locked). BUILD is owner-gated — execute only on explicit "go", not yet.**
  This phase = research + prep + corpus capture, so we're ready to move the moment Marcel says go. NEXT:
  synthesize peers + swarm → cited corpus docs + `ai reindex` → a ready-to-execute 7B build playbook → HOLD.
