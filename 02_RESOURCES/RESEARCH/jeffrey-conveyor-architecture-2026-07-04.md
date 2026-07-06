# Jeffrey conveyor architecture — v1 design (2026-07-04)

> Target: René's PC (Windows 11, i7-14700K, 32GB DDR5-6000, RTX 5060 Ti 16GB, 1.8TB NVMe).
> Pattern: one small always-resident SLM ("Jeffrey", the voice) + heavier on-demand workers + small-talk latency masking.
> Grounding: `jeffrey-windows-conveyor-feasibility-2026-07-04.md` (VRAM/tok-s/prior-art, cited) · `jeffrey-voice-stack-2026-07-04.md` · `jeffrey-distillation-vs-finetune-2026-07-04.md`. Prior art: ConvFill Talker/Reasoner split, LiveKit "thinking sound", Pipecat.
> Reuse: YURI's voice stack (`_SYSTEM/Scripts/voice/bot.py` Pipecat loop, persona/confirm-gate design, jarvis_memory SQLite+FTS5) ports with a brain-URL swap — Jeffrey is a fork, not a rebuild.

## 1. Roles and model casting (initial — test German quality empirically, swap by env)

| Role | Model (on hand) | VRAM | Residency |
|---|---|---|---|
| **Conveyor** ("Jeffrey" — voice, triage, small talk) | `qwen3.5:4b` Q4 (fallback `phi4-mini`) | ~2.3-2.8GB @4k ctx | always (`keep_alive=-1`) |
| **Worker A** (general reasoning, German chat, drafting) | `gemma4:12b-it-qat` (7.2GB) | ~8.5-9.5GB @8k ctx | on-demand, `keep_alive=60s` |
| **Worker B** (code/technical, optional cross-check) | `gemma-4-12B-coder-fable5-composer2.5` Q4_K_M — the Fable-5 distill (coder tune; German/chat suitability UNVERIFIED — test) or `Qwen3.5-9B-GLM5.1-Distill` Q5_K_M | ~8-9GB | on-demand, mutually exclusive with A |
| STT | faster-whisper large-v3-turbo INT8 (CUDA) | ~1.5-1.6GB | always |
| TTS | Piper + Thorsten German | CPU | always |
| Wakeword/VAD | openWakeWord (ONNX) + Silero | CPU | always |

Resident floor: conveyor + STT ≈ 4-4.5GB → ~10-11GB free for one worker + KV growth + driver reserve. **Never two 12B workers resident**; cross-check mode runs workers sequentially.

## 2. Turn flow (state machine)

```
wake ("hey Jeffrey") → VAD → STT (German)
  → CONVEYOR TRIAGE (one call, structured output):
      { intent, difficulty: DIRECT | DISPATCH, worker: A|B, needs_confirm: bool }
      DIRECT   → conveyor answers itself (greetings, small facts, follow-ups, memory recall)
      DISPATCH → fire worker request async; conveyor immediately speaks an ACK (one short line)
  → WHILE WORKER RUNS (bridge policy, §3)
  → WORKER RETURNS → conveyor RENDERS the answer (verbatim-core + spoken wrapper; §4)
  → TTS → barge-in live at all times (user speech cancels output)
```

## 3. Small-talk bridge policy (the part that makes or breaks it)

- Bridge fires only when worker latency exceeds **T1 = 2.5s** (below that, silence is better).
- First bridge = task-anchored, not generic: "Ich rechne das kurz durch…" / one contextual remark max.
- Second bridge only past **T2 = 10s**, and only a progress note ("dauert noch einen Moment").
- **Hard cap: 2 bridge utterances per dispatch.** Then silence until result. Repetition is the #1 annoyance risk — bridge lines come from a rotating template pool seeded with turn context, never free-generated twice in a row.
- Configurable per user (questionnaire S6): `BRIDGE=chatty|progress|silent`.

## 4. Determinism rule (non-negotiable)

The conveyor **NEVER paraphrases worker facts from memory and NEVER invents worker output**. It renders: `answer_core` (worker text, quoted/condensed by extraction only) + spoken wrapper. If the worker fails/timeouts (45s cap): say so honestly, offer retry. For quote/price/measurement asks (custom-gear critical), optional **two-worker cross-check**: A and B run sequentially, conveyor compares; mismatch → "da bin ich nicht sicher" + present both. Never silent-merge conflicting numbers.

## 5. Windows deployment shape

- ollama native Windows service; `OLLAMA_KEEP_ALIVE` + `OLLAMA_MAX_LOADED_MODELS=2`, `OLLAMA_NUM_PARALLEL=1` set at SERVICE env level.
- One Python orchestrator process (port of YURI `bot.py` Pipecat loop; skip Wyoming — no Windows support): openWakeWord → Silero → faster-whisper (CUDA) → conveyor/worker state machine (ollama HTTP) → Piper.
- Autostart via Task Scheduler; single config file (persona, bridge mode, confirm-gate list — seeded from René's questionnaire answers).
- Second-brain RAG (P3): bge-m3 embeddings + FTS over the ingested wiki; conveyor gets retrieval, workers get retrieved context in-prompt.

## 6. Failure/degradation modes

| Failure | Behavior |
|---|---|
| Worker OOM/eviction thrash | drop worker ctx to 4k, retry once; then honest "das schaffe ich gerade nicht" |
| STT low confidence | conveyor asks to repeat — never guesses a command |
| Conveyor triage wrong (DIRECT on a hard ask) | user says "frag den grossen" → forced dispatch; log for tuning |
| Confirm-gate (send/order/quote/delete) | speak intent + HOLD, exactly like YURI's narrowed gate |
| GPU busy (Blender/CAD running) | conveyor detects >90% VRAM, degrades to conveyor-only + says so |

## 7. Phased build plan (each phase has a measurable gate)

- **P0 — pattern smoke (Marcel's Mac, this week):** text-only conveyor+worker with llama3.2 + qwen3.5:4b stand-ins; measure triage accuracy on 30 scripted asks (gate: ≥80% correct DIRECT/DISPATCH), bridge timing logic unit-tested.
- **P1 — voice loop on the Windows box:** wake→STT→conveyor→TTS German round-trip < 2s for DIRECT answers (gate: 10/10 wake detections, WER spot-check on René's voice/dialect).
- **P2 — workers + bridging + confirm-gate:** dispatch path live; gate: cold-dispatch masked so perceived dead-air ≤ 3s; zero invented worker facts across a 50-turn session (transcript audit).
- **P3 — second brain + tools:** RAG over ingested business corpus + email drafting; gate: 10 real customer-mail drafts René rates ≥ 4/5.

## 8. Honest risks

1. **3-4B German conversational quality** is the weakest link — if qwen3.5:4b German feels dumb, conveyor moves to an 8B (Qwen3.5-9B-distill) and worker budget tightens; still fits (8GB + 1.6GB STT + reserve).
2. Bridge chatter can annoy — hard cap + per-user config is the mitigation, validated in P2 with René live.
3. The Fable-5 distill is a CODER tune — may be wrong for German chat; it's a candidate for Worker B (technical), not the default voice-facing path.
4. 12B tok/s + TTFT numbers are interpolated — P1 opens with a benchmark script before any tuning.
5. René is non-technical: everything must survive reboots unattended (service autostart + watchdog + "Jeffrey neu starten" desktop shortcut).

## 9. v1.1 addendum (2026-07-04, post-research — supersedes §1 worker table where noted)

**Context ceiling resolved** (owner concern "8k is quite low"): 8k was a conservative VRAM default, not a ceiling. Three levers, in order:
1. **KV q4_0** on the dense 12B worker → 16-32k at the same VRAM (free).
2. **MoE worker option**: Qwen3.6-30B-A3B-class MoE with CPU-offloaded experts (`n-cpu-moe`) = **~245-262k ctx at 15.3GB peak, verified on this hardware tier** — René's 32GB DDR5 is the enabler. Some tok/s cost (PCIe expert traffic); cast as the LONG-CONTEXT worker beside the latency-optimal dense 12B. Detail: `deepseek-releases-local-applicability-2026-07-04.md`.
3. **Cloud burst**: Marcel-provisioned ollama API key → `deepseek-v4-flash:cloud` (1M ctx) for the rare monster task. Hybrid, not dogma; daily ops stay local.

DeepSeek V4 itself (the "massive throughput" paper, arXiv:2606.19348) is datacenter-only — nothing to run locally; verdict captured in the same file.

**Computer-control layer** (the actual point — "he just talks"): 3-layer stack per `jeffrey-computer-control-stack-2026-07-04.md` — (1) UIA-first via CursorTouch/Windows-MCP (Ollama-proven, ~zero VRAM), (2) on-demand vision fallback (UI-TARS-2B load/unload; OmniParser with worker unloaded), (3) ARCHITECTURAL confirm-gate (policy engine outside the model: allowlist auto-execute, spoken confirm for destructive). New P-phase: **P2.5 — app control** (launch/type/navigate on René's real app list; gate: 20-command scripted session, zero unconfirmed destructive actions, Electron apps inventoried).
