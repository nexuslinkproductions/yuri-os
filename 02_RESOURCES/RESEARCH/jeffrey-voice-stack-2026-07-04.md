# Jeffrey Voice Stack — Hey Clicky verdict + fully-local German voice pipeline

> Deep-research capture 2026-07-04 (Sonnet research lane, online-verified).
> Companion to `jeffrey-distillation-vs-finetune-2026-07-04.md`.

## HEY CLICKY VERDICT

"Hey Clicky" is real and shipping — a macOS voice-controlled desktop AI agent by Farza Majeed (built in 8 weeks, went viral June 2026). Sits next to the cursor, watches the screen, talk-through tasks (DaVinci Resolve, Figma). Architecture: layered CLOUD model routing (GPT Realtime routes/tool-calls, Claude 4 pixel-understanding, GPT-4.5 agentic; spawns a bundled Codex subprocess). **NOT local** — $20/mo, capped 150 interactions (agentic actions cost up to $0.25/action at API level). Push-button screenshot capture (not always-listening).

→ Steal the interaction MODEL (ambient voice + screen-aware agent), not the architecture. Closest fully-local analogs:
- **LocalClicky** — Mac menubar, MIT, fully on-device STT/LLM/VAD/TTS, openWakeWord, "Computer" wake word, chainable commands. Closest open-source match to Jeffrey.
- **Fazm** — push-to-talk, no API keys, no cloud roundtrip.
- **mac-echo** — 100% local, MLX-optimized Apple Silicon, sub-second, multilingual + VAD.
- RightHand / TypeWhisper are hybrid/cloud — not a fit.

None are German-first out of the box → swap their STT/TTS for the stack below. Jeffrey is a real integration project, not an off-the-shelf install.

## VOICE PIPELINE (per component)

| Component | Recommendation | German | Local |
|---|---|---|---|
| Wakeword | **openWakeWord** (free, ONNX, HA-integrated); microWakeWord if ever embedded; Porcupine = accuracy leader but commercial licensing | phrase training language-agnostic | Yes |
| STT | **whisper.cpp large-v3 (NOT turbo) for German** — turbo's decoder pruning (32→4 layers) degrades non-English more than English; whisper.cpp has Metal+CoreML ANE path; faster-whisper has NO Metal (CPU-only on Mac). distil-large-v3 = middle ground if latency bites | large-v3 explicitly recommended over turbo | Yes |
| TTS | **Piper + Thorsten German voices** (CC0, purpose-built German: neutral/emotional/dialect, 22.05kHz). **Kokoro does NOT natively support German** — 2026 reviews confirm EN/FR/JA/ZH/ES/IT/PT list; German claims = SEO noise. ~15M param ONNX, runs on a Pi 4 | purpose-built | Yes |
| VAD/turn-taking | **Silero VAD** (RTF 0.004, ~0.43% CPU, Wyoming/HA/Pipecat default). Add semantic endpointing (Pipecat SmartTurn / LiveKit turn-detector) only if raw pauses feel wrong | language-agnostic | Yes |

## ORCHESTRATION HARNESS

**Home Assistant Assist pipeline + Wyoming protocol + Ollama** = the most mature local harness 2026 (faster-whisper + Piper + Ollama glued over Wyoming; every stage swappable). Native Ollama integration since HA 2024.4. Caveats:
- HA Speech-to-Phrase fast-path is closed-vocabulary, NO LLM fallback → René's free-form German needs the Whisper+LLM path (higher latency).
- `prefer_local_intents: true` short-circuits simple commands past the LLM.
- Keep exposed entities/tools low — 30 entities ≈ 1,300 tokens of context on a 10-16B budget.

**LLM behind the voice: Qwen3 14B or 8B** — repeatedly cited best local tool-callers in class (Qwen3 14B ≈0.971 BFCL-style vs GPT-4 0.974; the 8B often outperforms larger dense models on tool-calling). Capability cliff below ~7-9B (Qwen3.5 9B: 66.1% BFCL V4 vs 4B: 50.3%) → Jeffrey's floor is ~8B. Gemma 4 12B credible alternative. Avoid reasoning/think-mode models for voice (too slow for turns; matches PROJ:LOCAL-SLM lesson — VibeThinker spoke its CoT aloud).

OVOS/Neon = maintained but weaker fit (default STT/TTS lean online; German status unverified-good).

## COMPUTER-CONTROL OPTIONS (voice-driven click/type/open-app, local)

LocalClicky (MIT, chainable sessions) > Fazm (push-to-talk) > mac-echo (MLX). Biggest build gap: local computer-control agents exist, German-voice-native ones don't.

## HARDWARE TIERS (14B Q4 class)

| Tier | Price | Tok/s (14B Q4) | Notes |
|---|---|---|---|
| Mac Mini M4 16GB | ~$599-799 | ~10-16 | workable floor, no headroom |
| **Mac Mini M4 Pro 24GB** | ~$1,399 | ~10-16 stable | sweet-spot minimum for smooth 14B; 273GB/s bandwidth is the bottleneck (bandwidth > chip gen) |
| Mac Mini M4 Pro 48GB | ~$1,799-1,999 | headroom to 32B+ | future-proof pick |
| RTX 4060 Ti 16GB PC | ~$300 used / $424 new | ~21-34 | fits 14B Q4 in VRAM |
| **RTX 5060 Ti 16GB PC** | ~$430-459 | ~31-33 measured (Qwen3 14B Q4_K, 16k ctx) | 448GB/s GDDR7, best $/tok-s |

Bottom line: RTX 5060 Ti 16GB = best raw $/tok-s; **Mac Mini M4 Pro 24GB = better pick for a non-technical craftsman's workshop** — silent, 30-40W (vs 350W+), unattended-friendly. For voice (not coding), 10-16 tok/s ≈ TTS reading speed = fine.

## SOURCES

- https://www.tbpndigest.com/story/2026-06-10/hey-clicky-founder-farza-majeed-built-a-voice-controlled-ai-desktop-agent-in-8-weeks-now-using-claude-4-by-default
- https://www.everydev.ai/tools/hey-clicky
- https://www.home-assistant.io/voice_control/about_wake_word/
- https://github.com/dscripka/openWakeWord
- https://picovoice.ai/blog/complete-guide-to-wake-word/
- https://livekit.com/blog/livekit-wakeword
- https://www.promptquorum.com/power-local-llm/local-whisper-stt-comparison-2026
- https://northflank.com/blog/best-open-source-speech-to-text-stt-model-in-2026-benchmarks
- https://github.com/SYSTRAN/faster-whisper
- https://reviewnexa.com/kokoro-tts-review/
- https://github.com/rhasspy/piper · https://rhasspy.github.io/piper-samples/
- https://localaimaster.com/blog/best-ollama-models-tool-calling
- https://botmonster.com/smart-home/build-private-local-ai-voice-assistant-2026/
- https://www.home-assistant.io/voice_control/voice_remote_local_assistant/
- https://fazm.ai/blog/llm-powered-desktop-agent-voice-local
- https://www.producthunt.com/products/localclicky
- https://github.com/realtime-ai/mac-echo
- https://localaimaster.com/blog/apple-silicon-ai-buying-guide
- https://modelfit.io/gpu/rtx-4060-ti/ · https://modelfit.io/gpu/rtx-5060-ti/
- https://craftrigs.com/articles/rtx-5060-ti-16gb-budget-local-llm/
- https://aiadoptionagency.com/silero-vad-voice-activity-detection/
- https://livekit.com/blog/turn-detection-voice-agents-vad-endpointing-model-based-detection

[UNVERIFIED]: Kokoro German marketing claims (flagged as SEO noise); RTX 5060 Ti "51 t/s" figure (looks like an 8-9B number misattributed); Hey Clicky pricing may have moved since June 2026.
