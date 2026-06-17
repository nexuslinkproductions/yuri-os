# Streaming clone-TTS research — beat Chatterbox's ~5s/sentence — 2026-06-17

Problem: Chatterbox-Turbo is ~5s/sentence on MPS with no streaming API (measured: 14-word line synth 3.7-5.5s, even with conditioning cached). That's the wall between us and a Jarvis-smooth overseer. Need: streaming (first-audio <500ms) + voice cloning (Rick) + Apple-Silicon-native. Owner directive: "go further than Orpheus, faster and more responsive the better."

## Landscape scanned (cloning + Apple Silicon)
| Engine | Arch | Stream? | Clone? | Apple Silicon | Verdict |
|---|---|---|---|---|---|
| Chatterbox-Turbo (current) | flow-matching | ✗ | ✓ | PyTorch/MPS | ~5s/sent, the wall |
| F5-TTS-MLX | diffusion DiT | ✗ | ✓ | MLX | ~11s — diffusion is slow, ruled out |
| Orpheus-TTS | 3B Llama AR + SNAC | ✓ token-stream | ✓ | MLX/llama.cpp | viable but 3B heavy |
| NeuTTS-Air | 0.5B Qwen + NeuCodec | ✓ | ✓ instant | GGUF/llama.cpp Metal | on-device real-time, strong |
| **mlx-audio (framework)** | many | ✓ `--stream` | ✓ | **MLX-native** | **WINNER — see below** |
| Realtime S2S (Moshi/Unmute, OpenAI Realtime) | speech-to-speech | ✓ | ~ | cloud/heavy | fluid but no Claude-overseer/Rick |

## Decision: mlx-audio (Blaizzy/mlx-audio)
The right call isn't a single engine — it's the **MLX-native TTS framework** that hosts many of them:
- **OpenAI-compatible REST server** → near drop-in for our `/v1/audio/speech`.
- **Streaming** (`--stream`) — first-audio as tokens generate.
- **MLX-native** — same reason Parakeet crushed whisper (~20× MPS).
- **Quantization** 3-8 bit, **voice cloning** via `ref_audio`.
- Roster of clone-capable models to A/B empirically:
  - **CSM-1b** (Sesame-style, EN, conversational) — lead QUALITY pick. `--model mlx-community/csm-1b --ref_audio rick-ref.wav`.
  - **Ming-omni-tts-0.5B** (dense, cloning) — lead SPEED pick (0.5B).
  - **OmniVoice** (zero-shot clone, Qwen3 backbone, needs ref_text).
  - **Higgs Audio v2** 3B q6/q8 (real-time cloning).
  - **MOSS-TTS-Nano-100M** (tiny clone — fastest).
  - Kokoro (fast, NO clone — fallback "Rick-ish preset" only).

## Method (empirical — local execution = ground truth, not blog RTF)
Install mlx-audio → load each candidate → synth the SAME line with the Rick ref → measure synth time + first-audio + save a sample clip. Pick by measured latency; leave samples for Marcel to judge Rick-quality (the subjective call he owns). Then wire the winner as a streaming `/v1/audio/speech` server, engine-selectable (VOICE_TTS_ENGINE), Chatterbox kept as fallback.

## Sources
- https://github.com/Blaizzy/mlx-audio (framework, model roster, OpenAI server, --stream)
- https://blaizzy.github.io/mlx-audio/ (docs)
- https://neutts.org/installation (NeuTTS-Air on-device clone, GGUF)
- huggingface.co/lucasnewman/f5-tts-mlx (F5 ~11s, ruled out)
- mlx-community/csm-1b, OpenMOSS-Team/MOSS-TTS, bosonai/higgs-audio-v2

## Bake-off RESULTS (measured on this M-series, Rick 10s ref + ref_text, steady-state)
| Model | params | first-audio | RTF | intelligible? | verdict |
|---|---|---|---|---|---|
| **MOSS-TTS-Nano-100M** | 100M | **1.33s** | **0.33** | ✓ word-perfect | **WINNER — 4× faster than Chatterbox** |
| CSM-1b (Sesame) | 1B | 11.1s (stream first-chunk 1.6s) | 2.58 | ✓ | too slow (RTF>1 can't sustain realtime) |
| Ming-omni-0.5B | 0.5B | — | — | — | repo 401/gated, skipped |
| Chatterbox (baseline) | — | ~5s | ~1+ | ✓ | the wall we're beating |

MOSS-TTS-Nano-100M: served via the new server in **1.2s/line** (3 runs 1.18-1.73s), output 48kHz stereo (server mono-ifies), Parakeet re-transcribes it word-perfect. ~4× faster than Chatterbox; with sentence-chunking the first short sentence lands ~0.5s. Only open question = Rick-likeness of a 100M model (Marcel's subjective call — A/B samples saved at `_SYSTEM/state/voice/ab-samples/`).

## Built (autonomous, 2026-06-17, owner asleep)
- `voice-mlx-server.py` — OpenAI-compatible :8005 server, MOSS-Nano default, Rick ref+ref_text cloned, warmed.
- `voice-speak.sh` — engine chain MOSS(:8005) → Chatterbox(:8004) → say; force with `VOICE_TTS_ENGINE`.
- `overseer.sh` — starts MOSS by default; `VOICE_TTS_ENGINE=chatterbox overseer` reverts.
- A/B samples (MOSS / Chatterbox / CSM, same line) for the morning quality call.
- NOT swapped as irreversible: Chatterbox stays fully intact as the one-flag fallback until Marcel approves MOSS's voice.
