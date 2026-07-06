---
name: proj-local-slm-voice-parked-2026-06-18
description: Local-SLM voice brain PARKED until hardware upgrade; claude -p (yuri) is the active voice brain
metadata: 
  node_type: memory
  type: project
  originSessionId: 51f7834d-cf40-4e99-b14a-c821aacd0189
---

DECISION (Marcel 2026-06-18): the local-SLM voice brain is PARKED until a hardware upgrade. `yuri` (the `claude -p` brain on :8012, Max subscription, with `--resume` session memory) is THE active voice brain. The 15-30s spawn lag is the accepted tradeoff for real intelligence + persistent memory.

WHY (tested two local models as Yuri's brain, empirically, on the M2 Pro):
- **llama3.2:latest — WORKED**: 0.5s warm, conversational, memory across turns AND restarts, emitted `spawn_worker` tool_calls correctly. But too limited in capability for him.
- **VibeThinker-3B (reasoning model) — UNUSABLE for voice**: it speaks its `<think>` chain-of-thought ALOUD the whole time before acting (its leaked reasoning slipped past `_strip_think`), and it's slow (cold-load probe >60s). Reasoning/CoT models are architecturally wrong for a snappy voice companion — they narrate their thinking.

FUTURE (post-hardware): run a LARGER **non-reasoning instruct** model (NOT a CoT/reasoning model) with enough RAM to keep it fast. Don't re-try reasoning models for voice.

WHAT'S BUILT (dormant, ready to revive): `_SYSTEM/Scripts/voice/yuri-local-brain.py` (OpenAI-compat shim → Ollama native `/api/chat`, persisted rolling-transcript memory = the local stand-in for `--resume`, model-driven tool-calling via `TOOLS`/`_exec_tool`, `<think>` strip, num_ctx capped 4096) + launcher `yuri-local.sh` + alias `yuri-local` + capability `spawn_worker` (→ `yuri-spawn-worker.sh`). Defaulted back to llama3.2.

ALSO this thread: `kokoro_tts.py` macOS `say` fallback is HARD-BLOCKED (owner) — one voice only; on Kokoro's broadcast_shapes crash it retries in Yuri's voice (`_synth_robust`) then stays silent, never switches voices. Applies to BOTH `yuri` and `yuri-local`. Commits 1bc98351 → ee59dd7e.

SEE [[feedback-slm-not-lesser-give-capabilities]] · [[proj-voice-overseer-jarvis-2026-06-17]]
