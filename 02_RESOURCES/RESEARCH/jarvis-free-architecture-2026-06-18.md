# JARVIS (Yuri) — Free, Local, Always-On Voice Architecture

**Date:** 2026-06-18 · **Decision owner:** Marcel · **Synthesized by:** Yuri (Opus) from 4 parallel Sonnet research lanes (local STT · streaming STT · agent framework · TTS) + verification of existing repo assets.

## Hard constraints (locked by owner)
- **NO Claude API / no metered spend** — "no money to spare." Brain = the LIVE Claude Code session (Max subscription), free.
- **All-local** STT + TTS + wake word (cloud STT/TTS also cost per-minute → out).
- **Memory-safe** — a prior always-on PTT process leaked >10GB (MLX Metal cache never cleared; FIXED 2026-06-18 by `mx.clear_cache()` after each transcribe). Always-on design must stay memory-bounded.
- **Doctrine-compliant** — drive the live tmux session (allowed launch shape), never `claude -p` / `--print` / SDK headless.

## The decision that shaped everything: the "Impossible Trinity"
You can't have all three at once: (1) Claude as brain, (2) your real session context, (3) sub-second latency.
- The **paid** path (Pipecat → Claude **API**) buys sub-second but costs metered $ and drops session context → **REJECTED (cost).**
- The **free** path (Pipecat → **live Claude tmux session** via brain-proxy) keeps the brain AND your real session/context for $0 — the tradeoff is **turn-based latency** (seconds, not sub-second), because the session thinks per-turn rather than streaming token-by-token. **CHOSEN.**
- Always-on wake word + streaming TTS + barge-in still make it *feel* like JARVIS despite the turn latency.

## Architecture (all-local, free)
```
"Yuri" (wake word)  → openWakeWord (Apache-2, ONNX, on-device, no key)
   │ trigger
   ▼
Pipecat v1.0 (BSD-2) — LocalAudioTransport (mic→speaker)        [bot.py — EXISTS]
   ├─ Silero VAD + SmartTurn (CoreML, ~65ms EOU)                [in bot.py]
   ▼
STT (local): MLX Whisper now (in bot.py) → WhisperKit (ANE streaming, <100ms partials) upgrade
   ▼
BRAIN (FREE): claude-brain-proxy.py :8011  [EXISTS, verified]
   - OpenAI-shaped /v1/chat/completions for Pipecat
   - injects the turn into the LIVE Claude tmux session (`tmux send-keys`)
   - reads the reply from reply.fifo (written by the Stop hook in bridge mode — voice-tts.mjs)
   - = your real session, your context, $0
   ▼
TTS (local): Marvis/MOSS MLX (:8005, RTF 0.33) now  →  Kokoro+KokoClone for a custom cloned "Yuri" voice
   ▼
Barge-in: 2nd Silero monitors mic during playback → cancel TTS on speech
   ▼
Speaker
```
**Proactivity** (the JARVIS "speaks first"): push a `TTSSpeakFrame` into the Pipecat pipeline on any external event — trading-engine alert, a worker session's Stop, a cron beat. No user prompt needed.

## What ALREADY exists (verified in `_SYSTEM/Scripts/voice/`)
- `bot.py` — Pipecat scaffold: Silero VAD + SmartTurnV2 + MLX Whisper STT + brain-proxy LLM + Marvis TTS. **Wired for the free path already.**
- `claude-brain-proxy.py` — the free brain bridge (tmux live session ↔ FIFO). Verified, doctrine-compliant.
- `voice-mlx-server.py` (MOSS TTS :8005), `marvis_tts.py`, `voice-rick-server.py` — local Yuri-voice TTS.
- `voice-ptt.py` — push-to-talk (leak fixed) — keep as the manual fallback.
- `voice-tts.mjs` — Stop hook with bridge mode (writes reply.fifo) — the return path for the proxy.
- `.venv-stt`, `.venv-tts`, `setup-pipecat.sh` — environments + setup.
- Prior research: `02_RESOURCES/RESEARCH/voice-loop-2026-06-16/05-REALTIME-VOICE-ARCHITECTURE.md`.

## Gaps to build (continuation, not greenfield)
1. **Wake word** — add openWakeWord "Yuri" gate in front of the pipeline (train a custom "Yuri" model; trigger flips the pipeline active, discards audio between triggers → no idle cost).
2. **Solidify the brain loop** — confirm bot.py → brain-proxy :8011 → tmux session → FIFO round-trips reliably; bridge mode armed on the session's Stop hook.
3. **Streaming-TTS chunking** — speak first sentence before the full reply lands (latency win within the turn).
4. **Tune** — VAD thresholds, smart-turn, memory-bounded always-on loop (clear MLX cache per turn — same fix as PTT).
5. **Proactivity hooks** — wire trading/worker events → `TTSSpeakFrame`.

## Component picks (from the 4 lanes; reconciled)
- **Framework: Pipecat v1.0** — Mac-local, BSD-2, pluggable, native STT/TTS adapters, MCP bridge. (Not LiveKit = needs a server; not Moshi/Unmute = Moshi *is* the LLM, can't use Claude; not Vocode = dead.)
- **Wake word: openWakeWord** (Apache-2, no account) over Porcupine (Porcupine = easier custom word but needs a Picovoice account/key; openWakeWord fits the all-free/all-local goal).
- **STT: local only.** MLX Whisper (already in bot.py) to start → **WhisperKit** (Large-v3-Turbo, ANE streaming, <100ms partials, 0.4GB) as the upgrade. (Kyutai STT is architecturally ideal but **NOT Apple-Silicon-ready** — CUDA/GPU only — so it's out for now despite a framework-lane mention. Cloud Soniox/Deepgram excluded on cost.)
- **TTS: local only.** Marvis/MOSS MLX (exists, the current Yuri voice) → **Kokoro (MLX) + KokoClone** for a custom cloned "Yuri" voice (~170ms first-byte, free, voice-clone from a 3–10s sample). (Cartesia/ElevenLabs are faster/cleaner but cost → out.)
- **Brain: the live Claude tmux session via brain-proxy** — free, doctrine-compliant, keeps context.

## Latency expectation (honest)
First-word-in-ear ≈ however long the live Claude session takes to answer the turn (seconds), + ~150–300ms STT + ~170ms TTS first-byte. NOT the sub-second of an API-streamed S2S agent. The always-on wake word, streaming TTS, and barge-in are what deliver the JARVIS *feel* on the free path.

## Phased build (M2 Pro, all free)
- **P0 (done):** PTT memory-leak fix (`mx.clear_cache`). Relaunch `ptt`.
- **P1:** Stand up the existing `bot.py` end-to-end on the brain-proxy — voice → live Claude session → voice. Prove the free loop round-trips.
- **P2:** Add openWakeWord "Yuri" gating (always-on, memory-bounded).
- **P3:** Streaming-TTS chunking + VAD/barge-in tuning for conversational feel.
- **P4:** Proactivity hooks (trading/worker events → spoken).
- **P5 (optional polish):** WhisperKit streaming STT + Kokoro/KokoClone custom Yuri voice.

## Sources
Pipecat v1.0 (github.com/pipecat-ai/pipecat) · kwindla/macos-local-voice-agents (<800ms all-local proof) · mp-web3/jarvis-v3 · openWakeWord (github.com/dscripka/openWakeWord) · WhisperKit (arxiv 2507.10860) · soniqo.audio/benchmarks · Kokoro-MLX + KokoClone · Cartesia/ElevenLabs (cloud, excluded on cost) · prior `05-REALTIME-VOICE-ARCHITECTURE.md`.
