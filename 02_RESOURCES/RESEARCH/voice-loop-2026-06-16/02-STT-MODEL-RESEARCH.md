# STT model research — better than whisper.cpp large-v3-turbo? — 2026-06-17

Question (Marcel): is there a better speech-to-text model than whisper large-v3-turbo for the always-on local overseer mic on Apple Silicon (English, low latency, accuracy matters)?

Answer: **yes — basically everything modern beats whisper.cpp large-v3-turbo on speed, and several beat it on accuracy too.** whisper.cpp turbo runs at ~1× real-time (the slowest of the field); the MLX/CoreML-native engines run 12×–117× real-time.

## Benchmarks (Apple Silicon M-series, WER% = lower better, RTF = lower faster, xRT = higher faster)
Source A — Soniqo M-series benchmark (https://soniqo.audio/benchmarks):
| Engine | Quant | WER% | RTF | xRT | Peak RAM |
|---|---|---|---|---|---|
| Qwen3-ASR 1.7B MLX | 8-bit | **1.52** | 0.033 | 30× | 2.7 GB |
| WhisperKit Large-v3 Turbo | FP16 | 1.71 | 0.084 | 12× | **0.4 GB** |
| Qwen3-ASR 0.6B MLX | 8-bit | 1.82 | 0.015 | 66× | 1.3 GB |
| Parakeet TDT v3 | INT8 | 2.37 | 0.009 | **117×** | 0.9 GB |
| Omnilingual CTC 300M MLX | 4-bit | 4.26 | 0.005 | 222× | 0.4 GB |

Source B — anvanvan/mac-whisper-speedtest (https://github.com/anvanvan/mac-whisper-speedtest), RTF lower=faster:
- parakeet-tdt-0.6b-v2 **coreml** (FluidAudio Swift): 0.19
- parakeet-tdt-0.6b-v2 **mlx**: 0.50
- mlx-whisper large-v3-turbo: 1.02  ← MLX whisper is already ~2× our path
- insanely-fast-whisper large-v3-turbo (mps, 4bit): 1.13
- **our current path = whisper.cpp large-v3-turbo via whisper-cli ≈ ~1× real-time, the slow end.**

Both sources agree: Parakeet is the fastest; whisper-turbo variants are the slow end.

## Real-time mic tooling (verified, primary)
- `parakeet-mlx` (pip) — Apple-Silicon MLX Parakeet, ships a CLI + streaming API. Install: `pip install mlx parakeet-mlx sounddevice numpy`.
- `PierreVannier/parakeet-transcript` (https://github.com/PierreVannier/parakeet-transcript) — real-time mic transcription on Parakeet MLX: continuous chunking, word timestamps, device selection. Confirms a mature always-on mic path exists (not just file transcription).
- WhisperKit (argmax) — CoreML, Swift, streaming, 0.4 GB; best if we want a native Swift binary instead of a Python venv.
- Qwen3-ASR (MLX, Alibaba) — newest, best accuracy/speed frontier; tooling younger than parakeet-mlx.

## Verdict for the overseer
- **Top pick: Parakeet TDT v3 (or v2) via `parakeet-mlx`.** 100×+ real-time → effectively zero latency (the "alive, just-talk" feel Marcel wants), competitive accuracy, mature continuous-streaming mic tooling, 0.9 GB, English-native. Biggest win: replaces our clunky fixed-window ffmpeg loop with TRUE continuous streaming.
- **Accuracy-max alternative: Qwen3-ASR 0.6B MLX 8-bit** — best WER of the fast options (1.82%), still 66× real-time; newer tooling.
- **Zero-new-deps fallback: keep whisper.cpp large-v3-turbo** (model already downloaded, no venv) — but slowest + fixed-window clunk.

Tradeoff: parakeet-mlx / Qwen3 need a Python+MLX venv + `pip install` (dependency install → owner-gated). whisper.cpp is already working with zero deps. For short spoken commands the WER gap (2.37 vs 1.82 vs 1.52) is negligible; speed + streaming-tooling maturity favor **Parakeet**.

## Sources
- https://soniqo.audio/benchmarks (M-series WER/RTF table)
- https://github.com/anvanvan/mac-whisper-speedtest (8-impl Apple Silicon speed comparison)
- https://github.com/PierreVannier/parakeet-transcript (real-time Parakeet MLX mic)
- parakeet-mlx (pip package), WhisperKit (argmax), Qwen3-ASR (Alibaba, MLX)
