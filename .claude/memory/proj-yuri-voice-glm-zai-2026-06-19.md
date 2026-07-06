---
name: proj-yuri-voice-glm-zai-2026-06-19
description: "Yuri voice assistant = GLM-5-Turbo via Z.ai, full worker capabilities + persona + memory (the LIVE architecture)"
metadata: 
  node_type: memory
  type: project
  originSessionId: 51f7834d-cf40-4e99-b14a-c821aacd0189
---

STATE (2026-06-19, SHIPPED + Marcel-confirmed "working very well"): Yuri's always-listening voice assistant runs on a **Z.ai GLM brain** — NOT claude -p, NOT a local SLM. SUPERSEDES [[proj-local-slm-voice-parked-2026-06-18]] (local was parked; Z.ai GLM is the answer: Claude-class + snappy + $0 on the GLM Coding Plan subscription).

ARCHITECTURE:
- Launch: `yuri` (alias → `_SYSTEM/Scripts/voice/yuri.sh`) → Pipecat loop (Whisper-MLX STT → brain :8014 → Kokoro TTS).
- Brain: `yuri-z-brain.py` — OpenAI-compat shim for bot.py → Z.ai Anthropic Messages endpoint (`api.z.ai/api/anthropic`, Bearer, model `glm-5-turbo`, `ZAI_MODEL` overridable). Key self-hydrates from keychain `yuri-zai-api-key`. ~2s on chat, slower on tool turns.
- IDENTITY+MEMORY: `yuri-voice-brain.md` persona (distilled persona.md+SOUL.md) + `.claude/memory/MEMORY.md` loaded as system (bounded `YURI_Z_MEM_CAP`). Real Yuri + recall, not a generic shim. Verified: recalls teal + project detail, pushes back adversarially.
- FULL CAPABILITIES (like a worker): tools `bash`/`read_file`/`write_file`/`edit_file` + `spawn_worker` (delegate heavy jobs to a visible Terminal claude session). Multi-step agent loop (`MAX_TOOL_ITERS`). Safety FLOOR: protected paths + catastrophic commands refused (NOT adversary-proof — Marcel's voice drives it). bash off-switch `YURI_Z_NO_BASH=1`.
- VOICE: Kokoro `bf_isabella`. mlx-audio broadcast_shapes dodged via CHUNKED synth (maxlen 32 → 4-word → 2-word, stitched with ~10ms gaps); NO macOS fallback, NO 'okay' pad, NO silence. Speed 1.15 (`YURI_VOICE_SPEED`). Fallback brains on disk: `claude-p-brain.py` (:8012), `yuri-local-brain.py` (:8013) — switch via the brain block in yuri.sh.

Z.ai LANE (the PLATFORM, distinct from ollama-cloud): `ai llm glm`/`glm-5.2`/`glm-turbo` dispatch + `ai claude-zai` native Claude Code session (mirrors `ai claude-mimo`). 5 lanes in models.json (`z-ai-coding-plan`, anthropic protocol, `auth_header:bearer`, keychain fallback in llm-lane). GLM REMOVED from ollama-cloud (default → minimax-m3:cloud) to kill the `glm-5.2` naming mismatch. Catalog + role map: `02_RESOURCES/RESEARCH/zai-glm-model-catalog-2026-06-19.md`.

OPEN: `capabilities.json` reconciles when the parallel trading session commits its `as-baseline` cap (left uncommitted — do-not-sweep). GitNexus index stale (advisory). SEE [[feedback-slm-not-lesser-give-capabilities]] · [[proj-voice-overseer-jarvis-2026-06-17]]
