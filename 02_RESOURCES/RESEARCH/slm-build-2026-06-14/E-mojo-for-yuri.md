# E — Mojo for YURI ML/Inference/Training Lane (2026-06-14)

> Angle E of the SLM research mission. Cross-ref: `language-consolidation-rust-mojo-zig-2026-06-14.md` (Mojo already adopted for ML lane). This doc grounds the adoption path with current evidence.

## Bottom line

MAX engine does **not** serve AI models on Apple Silicon GPU today (CPU-only, 3-4x slower than MLX).  
Use **MLX** for local SLM serving on M2 Pro/16GB now.  
Use **Mojo** for custom numerical kernel authoring and cloud-GPU training utilities now.  
Graduate to **MAX serve** on Metal once MAX graphs ship on Apple Silicon (active engineering, no ETA).

---

## 1. Mojo 1.0 maturity (June 2026)

- **1.0-beta shipped May 7 2026** (Modular 26.3). Feature-complete language; library APIs still stabilizing. [1]
- Breaking changes expected before final 1.0. Open-source planned Fall 2026.
- New in 26.3: safe closures, conditional trait conformance, `TileTensor` GPU type, tuned kernels (grouped matmul, layer-norm, sort) — targeting NVIDIA/AMD, not Apple. [1]

## 2. Apple Silicon GPU support — honest status

| Layer | Status (June 2026) |
|---|---|
| Basic GPU puzzles (1-15, M1-M4) | Works — macOS 15+, Xcode 16+ required |
| Metal .metallib generation | Works — LLVM IR → AIR → metallib |
| MAX graphs on Apple Silicon GPU | **NOT YET** — active engineering, no committed date |
| AI model serving via MAX on Metal | **NOT YET** |
| PyTorch interop on Apple GPU | Not yet |

Source: Modular forum, Brad Larson Dec 2025 update, confirmed June 2026. [2]

## 3. MAX serve performance on Apple Silicon (M-class, CPU-only)

Benchmarked on M4 Pro 24GB, Llama-3.1-8B-Instruct Q4_K_M: [3]
- MAX generation throughput: **~10.8 tok/s** (CPU-only, no GPU visible in Activity Monitor)
- Ollama (Metal-accelerated, same task): completed in **44s vs MAX's 3m 13s**
- MAX memory: 4.67GB vs Ollama 1.18GB

**M2 Pro/16GB extrapolation:** expect similar or worse ratio — MAX is purely CPU-bound.

## 4. Correct local serving runtime NOW: MLX

MLX wins on M-class chips: [4]
- 20-40% higher tok/s vs llama.cpp; Ollama switched to MLX backend March 2026
- 7B Q4_K_M on M4 Pro: 60-80 tok/s; **M2 Pro estimate: ~35-55 tok/s**
- Metal is first-class; unified memory bandwidth fully exploited
- 16GB headroom: 7B at Q4 fits comfortably (~4.5GB model weight); 13B tight

## 5. Where Mojo wins NOW: kernel authoring

Mojo as custom kernel language (replacing CUDA C++): [5]
- Custom activation functions, attention variants, quantized matmul, data preprocessing
- Python-like syntax, compiles to native via MLIR, callable from Python
- SC'25 peer-reviewed: competitive with CUDA/HIP for memory-bandwidth-bound kernels [6]
- No native autograd yet — training-loop orchestration stays in Python/PyTorch
- Workflow: Python orchestrates → Mojo function imported as callable → zero-copy tensor (in progress)

On **cloud GPU (H100/A100)**: Mojo GPU kernels are production-ready for NVIDIA. Write custom training utilities (loss, data augmentation, tokenizer ops) in Mojo → portable to Metal later.

## 6. YURI application map

| YURI mechanism | Mojo role | Timing |
|---|---|---|
| Energy gate (computeU) | **Stay JS** — governance, not numerical hot path | Never port |
| FTS5 re-ranker / P_emit scorer | Port numerical inner loop to Mojo (CPU, production-ready) | NOW |
| SLM fine-tune utilities (cloud H100) | Write in Mojo not CUDA C++ | NOW — hybrid path |
| SLM local serving | MLX / Ollama (Metal) — NOT MAX yet | NOW |
| SLM local serving via MAX | Switch when MAX graphs land on Apple GPU | LATER |
| Custom quantization kernels | Mojo (CPU now, GPU when Metal MAX ships) | NOW for CPU |

## 7. Setup (MAX serve — experimental reference)

```bash
pip install modular --extra-index-url https://modular.gateway.scarf.sh/simple/
max serve --model meta-llama/Llama-3.1-8B-Instruct \
  --weight-path=path/to/model-Q4_K_M.gguf
# OpenAI-compatible at localhost:8000; CPU-only on Apple Silicon
```

Monitor Apple GPU progress: https://forum.modular.com/t/apple-silicon-gpu-support-in-mojo/2295

## Sources

[1] https://www.modular.com/blog/modular-26-3-mojo-1-0-beta-max-video-gen-and-more  
[2] https://forum.modular.com/t/apple-silicon-gpu-support-in-mojo/2295  
[3] https://toyboy2.medium.com/modular-max-powered-by-mojo-vs-ollama-a-local-ai-performance-on-m4-review-98f82238da3c  
[4] https://contracollective.com/blog/llama-cpp-vs-mlx-ollama-vllm-apple-silicon-2026  
[5] https://hexshift.medium.com/building-a-hybrid-python-mojo-ml-pipeline-can-mojo-replace-custom-cuda-kernels-a5695fa88c73  
[6] https://dl.acm.org/doi/10.1145/3731599.3767573  
[7] https://www.infoworld.com/article/4173158/first-look-mojo-1-0-mixes-python-and-rust.html  
[8] https://docs.modular.com/mojo/requirements/
