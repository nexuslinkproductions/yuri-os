# Jeffrey conveyor feasibility — Windows / i7-14700K / 32GB / RTX 5060 Ti 16GB

> Deep-research capture 2026-07-04 (Sonnet lane, online-verified ≥2 sources per load-bearing claim).
> Companion to `jeffrey-voice-stack-2026-07-04.md` + `jeffrey-distillation-vs-finetune-2026-07-04.md`.
> Hardware = René's ACTUAL PC (verified via screenshot): Windows 11, i7-14700K, 32GB DDR5-6000, RTX 5060 Ti 16GB, 1.8TB NVMe. No purchase needed.

## THE CONVEYOR PATTERN IS ESTABLISHED PRIOR ART

Marcel's idea (small SLM fronts the voice, heavier workers synthesize in background, small talk bridges latency) is a recognized architecture class — follow, don't invent:
- **ConvFill**: STT feeds a **Talker** (filler generation) + **Reasoner** (real work) concurrently; Talker streams while Reasoner completes. Structurally identical to the conveyor/worker split.
- **"Thinking While Speaking"** (arXiv 2511.07397) + **LTS-VoiceAgent** Listen-Think-Speak (arXiv 2601.19952) — same latency-hiding problem, incremental reasoning + semantic triggering.
- **LiveKit Agents**: built-in "thinking sound" / notify-before-tool-call to cover tool latency.
- **Pipecat**: SmartTurnDetection + SentenceAggregator; 68+ service integrations — candidate integration framework instead of a bare custom loop (YURI's own bot.py is already Pipecat).

## OLLAMA ON WINDOWS

- **Native Windows service** > WSL2 for this build: direct CUDA, autostart-as-service, zero container setup. WSL2 only wins for Linux-only tooling (vLLM) — not needed. (windowsforum, vucense, windowscentral)
- `OLLAMA_MAX_LOADED_MODELS` default 3×GPU; `OLLAMA_NUM_PARALLEL` leave at 1 (single conversational stream — raising multiplies KV VRAM).
- Residency rule: a model stays fully resident only if it wholly fits remaining VRAM; else eviction or partial CPU offload (thrashing — avoid).
- `OLLAMA_KEEP_ALIVE` must be set at the **service environment** level on Windows (setx in a user shell won't reach the service).

## VRAM BUDGET VERDICT

| Component | VRAM (est.) | Resident? |
|---|---|---|
| Conveyor SLM (3-4B Q4, 4k ctx) | ~2.3-2.8 GB | YES — always |
| Worker 12B Q4_K_M, 8k ctx | ~8.5-9.5 GB (≈8-9 w/ KV q8_0) | **on-demand**, keep_alive 30-60s |
| faster-whisper large-v3-turbo INT8 | ~1.5-1.6 GB | YES (preferred over large-v3's 2.5-3GB; German WER near-identical at INT8 [verify empirically]) |
| Piper TTS (Thorsten German) | CPU-only fine | n/a |
| openWakeWord (ONNX) + Silero VAD | CPU | n/a |
| **Best-case concurrent sum** | **~12.3-13.9 GB** | fits 16GB w/ headroom |

**Verdict: conveyor + turbo-STT stay resident; the 12B worker loads on demand.** All-resident is numerically possible (~12-14GB) but leaves <2-3GB against Windows/driver reservation (0.5-1.5GB) + KV growth — thrashing risk. Worker cold-load from NVMe (OS-cached): ~2-5s TTFT — exactly the window the conveyor's small talk masks.

## TOKENS/S + TTFT (RTX 5060 Ti 16GB, 448GB/s GDDR7)

- 14B Q4_K_M: ~31.8-32.9 tok/s generation, ~940-1000 tok/s prompt processing (hardware-corner, smeltcore).
- 8B: ~58-60 tok/s → 12B interpolates ~35-42 tok/s [interpolated, UNVERIFIED direct].
- Context degrades decode (4060 Ti reference: 27.4 t/s @4k → 17.9 @32k) — keep worker ctx ≤8k.
- TTFT: warm ~0.2-0.5s; cold (NVMe) ~2-5s [composite estimate — run a 30-min smoke before committing].

## WINDOWS VOICE STACK

- **STT**: **faster-whisper (CTranslate2 CUDA)** is the Windows pick (unlike Mac where it has no Metal) — smaller VRAM, turnkey Python, distil/turbo support. Note: prior Mac-leaning research said "whisper.cpp large-v3"; ON WINDOWS/CUDA the calculus flips.
- **Wakeword**: openWakeWord works on Windows (ONNX backend only; no tflite, no Speex noise suppression — Linux-only features).
- **VAD**: Silero (bundled in openWakeWord).
- **TTS**: Piper + Thorsten German — but upstream moved: `pip install piper-tts` now = OHF-Voice/piper1-gpl, **GPL-3.0** (old MIT rhasspy/piper archived). Fine for personal use; flag if ever distributed/commercialized.
- **Wyoming/HA satellite**: NO native Windows support (ALSA-bound, deprecated upstream) — **skip it**; call Piper/openWakeWord/faster-whisper directly via Python APIs. Single local box ≠ satellite topology.

## RISKS

1. 12B-specific t/s + TTFT on the 5060 Ti are interpolated [UNVERIFIED] — empirical smoke test first.
2. Ollama eviction under interleaved conveyor/worker requests may not honor intended keep_alive — verify with `ollama ps` during a real dialogue.
3. 3-4B conveyor German conversational quality is the weakest link — test qwen3.5:4b / phi4-mini class in German early; if inadequate, conveyor moves to 8B and worker budget shrinks.
4. Piper GPL-3.0 if shipped beyond family.
5. "Worker always warm" is the risky config; "worker on-demand" is the safe default.

## LOCAL MODEL ASSETS ALREADY ON HAND (Marcel's ollama, transferable)

- `gemma-4-12B-coder-fable5-composer2.5` Q4_K_M (7.4GB) — Fable-5-distilled Gemma-4-12B **coder** tune; chat/German suitability UNVERIFIED — test before casting as Jeffrey's worker.
- `Qwen3.5-9B-GLM5.1-Distill` Q5_K_M (7.4GB) — distilled 9B, strong candidate worker.
- `gemma4:12b-it-qat` (7.2GB) — instruction-tuned, likely best German chat of the three.
- `qwen3.5:4b` (3.4GB), `phi4-mini` (2.5GB) — conveyor candidates.
- `bge-m3` — embeddings for the second-brain RAG.

Sources: docs.ollama.com/faq · windowsforum.com · vucense.com · windowscentral.com · mljourney.com · bestgpuforllm.com · gigagpu.com · runaihome.com · hardware-corner.net · smeltcore.com · modelfit.io · livekit.com/blog/understand-and-improve-agent-latency · channel.tel/blog/pipecat-vs-livekit · arxiv.org/pdf/2511.07397 · arxiv.org/pdf/2601.19952 · github.com/dscripka/openWakeWord · pypi piper-tts · github.com/rhasspy/wyoming-satellite · huggingface.co/primeline/whisper-large-v3-turbo-german
