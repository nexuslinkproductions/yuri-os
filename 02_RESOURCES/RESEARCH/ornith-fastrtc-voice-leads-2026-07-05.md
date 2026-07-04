# Owner leads verified: Ornith 1.0 + smolagents hf-realtime-voice (2026-07-05)

> Deep-research capture (Sonnet lane, online-verified ≥2 sources). Owner asked whether these power up Jeffrey (local Windows) or Yuri (cloud Mac).

## ORNITH 1.0 — real, impressive, wrong seat

**Identity**: Ornith-1.0 = OSS LLM family by **DeepReinforce AI** (released 2026-06-25), specialized for **agentic coding**. Sizes 9B-Dense / 31B-Dense / 35B-MoE / 397B-MoE, post-trained on Gemma 4 + Qwen 3.5 bases. MIT license. Core trick: "self-scaffolding RL" — learns its own tool-use scaffold during training.
**Ornith-1.0-9B**: 262K ctx; SWE-Bench Verified 69.4%, Terminal-Bench 2.1 43.1% — beats Gemma4-31B and Qwen3.5-35B on agentic coding at a quarter the size. Native tool-calling (Qwen3 XML → OpenAI-style). GGUF works in ollama (`ollama run hf.co/deepreinforce-ai/Ornith-1.0-9B-GGUF`), fits 16GB at Q4/Q5 easily.
**The catch**: German capability = NOT FOUND anywhere (official benches 100% English coding; only third-party non-English eval is Japanese). Specialization is terminal/SWE tool use, not conversation.
**VERDICT — SKIP as Jeffrey's conversational worker; FILE as the coding sub-agent.** When Jeffrey (or Yuri's local tier) gets a "write me a script / automate this" skill, Ornith-1.0-9B is the go-to worker — bench it on the 5060 Ti then. Benchmark numbers are vendor-claimed (one credible skeptic flagged hype patterns) — treat as directional until reproduced.

## HF-REALTIME-VOICE — the Space is a shell; FastRTC is the treasure

**Two things, don't conflate**: (1) `smolagents/hf-realtime-voice` Space = a FastAPI **proxy only** (auth, rate limits, session queue; actual inference on a private HF backend over WebSocket) — architecturally opaque, NOT portable. (2) Its ancestor pattern `burtenshaw/coworking_agent` on **FastRTC** (gradio-app/fastrtc, MIT) = the inspectable, portable architecture.
**FastRTC architecture (verified from app.py)**: `Stream(handler=ReplyOnPause(cb, input_sample_rate=16000), modality="audio", mode="send-receive")` — STT/LLM/TTS as three swappable callables; defaults Moonshine STT (CPU, English-only) + Kokoro TTS; LLM = any OpenAI-compat endpoint (Ollama+FastRTC 100%-local is a demonstrated third-party pattern).
**The adoptable piece**: **`ReplyOnPause` + `AlgoOptions`** (audio_chunk_duration, started_talking_threshold, speech_threshold) + `can_interrupt=True` — a battle-tested, TUNABLE barge-in/turn-taking handler. Known weakness (documented in FastRTC issue #341): TTS keeps speaking briefly after user barge-in; best-practice mitigation = mute output locally via `startup_fn` the instant new speech is detected, before full VAD confirmation.
**Local viability**: (a) Jeffrey/Windows — FastRTC is a legitimate ALTERNATE loop shape (Ollama+FastRTC proven local), but Moonshine is English-only → keep faster-whisper/Piper for German; value = the handler pattern + clean callable separation. (b) Yuri/Mac — the barge-in mitigation pattern maps DIRECTLY onto the known Pipecat gaps (streaming-TTS interleave + barge-in lag): port the mute-on-detected-speech pattern + threshold tuning into bot.py's WakeGate/CancelFilter chain.

## VERDICTS

| Lead | Verdict | Next step |
|---|---|---|
| Ornith-1.0-9B | SKIP (conversational) / FILE (coding sub-agent) | bench via ollama GGUF when the coding skill lands |
| hf-realtime-voice Space | SKIP — infra-bound proxy | none |
| FastRTC ReplyOnPause pattern | **ADAPT** | port mute-on-interrupt + AlgoOptions tuning into Yuri's bot.py; prototype Ollama+FastRTC as alternate Jeffrey loop |

Sources: deep-reinforce.com/ornith_1_0.html · marktechpost.com 2026-06-25 · huggingface.co/deepreinforce-ai/Ornith-1.0-9B · github.com/deepreinforce-ai/Ornith-1 · dev.classmethod.jp (JP eval) · huggingface.co/spaces/smolagents/hf-realtime-voice/tree/main · huggingface.co/posts/burtenshaw/742649076372470 · fastrtc.org/reference/reply_on_pause/ · github.com/gradio-app/fastrtc/issues/341 · mahimairaja.medium.com (Ollama+FastRTC local)
