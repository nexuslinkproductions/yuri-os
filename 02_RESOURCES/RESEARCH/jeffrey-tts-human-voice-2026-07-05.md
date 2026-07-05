# Jeffrey human voice — local TTS landscape (2026-07-05)

> Online-verified (≥2 sources) research for giving Jeffrey (René's Windows/CUDA local assistant) a
> human-sounding voice. Companion to `jeffrey-voice-stack-2026-07-04.md` (which recommended Piper+Thorsten).
> Constraints: LOCAL (Rule B — spoken text can contain customer names → must stay on-device),
> COMMERCIAL-SAFE (CGS is a business), German + British-English, fit alongside qwen3:14b (~9GB) on 16GB.

## Current state
- **STT: Parakeet-TDT-0.6b-v3** (ONNX/CUDA, EN+DE, ~125x realtime) — GOOD, keep. (macOS Yuri uses faster-whisper; Jeffrey/Windows uses Parakeet.)
- **TTS: Windows SAPI via pyttsx3** — ROBOTIC. This is the gap.
- We HAVE `kokoro_tts.py` + `marvis_tts.py` but they are **MLX (Apple-only)** — do NOT run on René's CUDA box.
- clicky-windows app already ships TTS providers: **edge_tts / elevenlabs / openai** (all cloud).
- venv (parakeet-ptt) has pyttsx3 + onnxruntime + sounddevice; NOT kokoro/piper/coqui/edge-tts.

## Options (2026, verified)

| Engine | Human quality | German | British-EN | License | VRAM | Cloning | Local |
|---|---|---|---|---|---|---|---|
| **Chatterbox (Resemble)** | ★★★★★ (beat ElevenLabs 65% blind) | ✅ (23 langs) | ✅ | **MIT (commercial OK)** | 4–6GB (or CPU near-RT) | ✅ zero-shot | ✅ |
| **Kokoro-82M ONNX** | ★★★★ | via community "Martin" ONNX (kikiri-german-martin, StyleTTS2, DE text-norm) | ✅ bm_* British voices | **Apache-2.0 (commercial OK)** | 2–3GB | ❌ | ✅ |
| XTTS v2 (Coqui) | ★★★★★ | ✅ native 17 langs | ✅ | ❌ **non-commercial (CPML); Coqui defunct → no license to buy** | 4–6GB | ✅ 6s | ✅ |
| F5-TTS | ★★★★ | ✅ | ✅ | ❌ **CC-BY-NC (non-commercial)** | GPU | ✅ ~3s | ✅ |
| Piper (Thorsten DE) | ★★★ | ✅ purpose-built | ✅ | MIT | ~0 (CPU real-time) | ❌ | ✅ |
| Edge TTS | ★★★★★ | ✅ Katja/Conrad | ✅ Ryan/Sonia | free, no key | 0 | ❌ | ❌ **CLOUD → Rule B risk** |
| ElevenLabs / OpenAI TTS | ★★★★★ | ✅ | ✅ | paid | 0 | ✅ | ❌ cloud + $ |

## Verdicts

- **Rule B is decisive for a customer-facing assistant.** Jeffrey's spoken replies can contain customer
  names/orders. Cloud TTS (Edge/ElevenLabs/OpenAI) sends that text to a third party → violates the
  local-only customer-data rule. **→ LOCAL TTS is the compliant choice.** Edge TTS is only OK for
  non-customer chatter (and it's free + already wired in clicky).
- **License is decisive for a business.** XTTS v2 and F5-TTS are the best-known cloners but are
  **non-commercial** — real risk for CGS. **Avoid.** Commercial-safe cloners/voices: Chatterbox (MIT),
  Kokoro (Apache), Piper (MIT).
- **VRAM reality (16GB):** qwen3:14b ~9GB + Parakeet ~1.5GB = ~10.5GB used. Kokoro (2–3GB) fits
  comfortably. Chatterbox (4–6GB) on GPU is TIGHT (~15–16.5GB, OOM risk) → run Chatterbox on the
  i7-14700K CPU (near-real-time per benchmarks) OR drop the LLM to qwen3:8b to free room.

## RECOMMENDATION (for Jeffrey)

1. **Default voice → Kokoro-82M ONNX** (GPU, 2–3GB, Apache-2.0). Best fit: excellent British-male "Sir"
   voices (bm_george/bm_lewis) match the persona greeting; runs on the existing onnxruntime; VRAM-safe
   beside qwen3:14b; commercial-safe; 100% local. German via the community "Martin" ONNX voice.
2. **Max-realism / custom cloned voice → Chatterbox** (MIT). If René wants the most human result or a
   specific cloned butler/German voice: run it on the CPU (keeps the GPU for the LLM). Single-engine
   German+English, blind-test-beat-ElevenLabs quality.
3. **Boring-reliable fallback → Piper + Thorsten** (CPU, zero VRAM, real-time) if latency/resources ever bite.
4. **AVOID for the business:** XTTS v2, F5-TTS (non-commercial). **AVOID for customer data:** cloud TTS.

## Packing into the front-end
The live Jeffrey voice loop is `voice-assistant-win.py` (Parakeet STT → local brain → SAPI TTS). Swap the
`speak()` SAPI call for a pluggable local TTS (Kokoro-ONNX default), mirroring clicky-windows'
`audio/tts/base_tts.py` provider pattern. Env-select the voice; keep SAPI as the zero-dep fallback.

Sources: bentoml.com/blog/exploring-the-world-of-open-source-text-to-speech-models · localaimaster.com/blog/best-local-tts-models · localaimaster.com/blog/kokoro-vs-xtts-vs-chatterbox · findskill.ai/blog/best-open-source-tts-2026 (Chatterbox blind test) · promptquorum.com/power-local-llm/local-tts-voice-cloning-piper-coqui-xtts (licenses) · huggingface.co/Godelaune/Kokoro-82M-ONNX-German-Martin · github.com/thewh1teagle/kokoro-onnx · github.com/CrispStrobe/CrispTTS · github.com/hexgrad/kokoro/issues/290 (no official German)
