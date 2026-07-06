# Voice Loop — Master Brief (2026-06-16)

GOAL: always-on, hands-free, natural spoken conversation between Marcel and the Claude lane, with a cloned **Rick Sanchez** reply voice. No push-to-talk. English-only (owner confirmed). macOS Apple Silicon, VS Code extension / tmux-backed `claude` CLI.

Forged via 5 Sonnet peer spawns (max reasoning) + online verification. This doc is the ground-truth brief; every build phase traces back here.

## Architecture decision (the fork that was resolved)

- **REJECTED:** Claude as the "LLM stage" of a voice framework via an OpenAI-compat proxy → that means headless/SDK driving, which the YURI launch-shape contract forbids for the main lane.
- **TAKEN:** keep the **real interactive Claude Code session as the brain, untouched.** A local audio daemon bolts onto its sides: speech IN via PTY injection (`tmux send-keys`), reply OUT via the `Stop` hook → TTS. The session can't tell voice from keyboard.

## What makes it natural (not dictation)

1. **Addressed-speech intelligence** — always listening, only *acts* on speech aimed at the lane (think-aloud / phone calls are ignored). Conversational wake ("Rick" / an imperative), not a robotic wake-word.
2. **Voice = commentary track, not screen-reader** — screen keeps the full diffs/code; the spoken reply is ≤2–3 plain sentences. A `UserPromptSubmit` hook flips the lane into spoken-Rick register.
3. **Barge-in as conversation** — start talking and the TTS dies in ~50ms + generation halts (`Esc`). Interrupt the rant like you'd interrupt a person.

## Converged stack (English-only, Apple Silicon)

| Layer | Pick | Notes |
|---|---|---|
| Orchestration | **Pipecat** (BSD-2) local daemon | replace only the brain stage |
| VAD | **Silero VAD v5** (MLX) | ~0.4% CPU on M-series |
| Turn-taking | **Pipecat Smart Turn v3** (~12–18ms, 8MB ONNX) | the "natural" make-or-break |
| Echo cancel | **Apple VoiceProcessingIO** (Pipecat LocalMacTransport) | hardware AEC; headphones = free fallback; #1 open-mic failure |
| STT | **Parakeet TDT 0.6B v3** (local, ~80ms, CoreML/MLX) | English-only → clean & free |
| TTS (Rick) | **Chatterbox-Turbo** (local, MPS, 5s clone clip) | `[laugh]`/`[sigh]`/`[gasp]` + emotion knob; ElevenLabs Flash v2.5 = cloud quality ceiling |
| Brain | **live interactive Claude Code session** | untouched, no headless |
| IN bridge | daemon → endpointed text → `tmux send-keys` | only documented external input path |
| OUT bridge | `Stop` hook → Rick TTS | + `UserPromptSubmit` spoken-register inject |

## Verified hook contract (code.claude.com/docs/en/hooks, 2026-06-16)

- Stop stdin: `session_id, transcript_path, cwd, permission_mode, hook_event_name:"Stop", effort:{level}, agent_id?, agent_type?`.
- Stop hooks **do NOT honor `async`** → detach the TTS process (`say &`) so the session never blocks.
- transcript = **JSONL**; assistant entries: `role:"assistant"`, `content[]` text blocks. macOS: use `tail -r`, not `tac`.
- Context-injection field is **`hookSpecificOutput.additionalContext`** (NOT `additionalSystemPrompt`).

## Rick voice (private, local, fan-use)

Rip 10–15 clean Rick clips from owned media (`yt-dlp`+`ffmpeg`) → Demucs vocal isolate + Silero trim + loudnorm → 24kHz mono → Chatterbox-Turbo zero-shot clone (`exaggeration≈0.8` rant mode). **Boundary:** local only; never ship the model, never publish its output, never impersonate to third parties. Matches persona.md `privateUseOnly` scoping of the Rick overlay.

## Build phases (DISARMED, reversible)

- **P0 done:** `/voice` collision neutralized (oracle-voice description rename; full removal pending owner ok).
- **P1 (THIS):** prove the seam — `tmux send-keys` IN + `Stop` hook → `say` OUT. Files: `.claude/hooks/voice-tts.mjs`, `_SYSTEM/Scripts/voice-seam.sh`.
- **P2:** Pipecat + Silero + Smart Turn v3 + Parakeet + Apple VPIO. Always-on + barge-in.
- **P3:** Chatterbox-Turbo Rick clone replaces `say` (set `$VOICE_TTS_CMD`).
- **P4:** addressed-speech gate + spoken-register `UserPromptSubmit` hook.

## Phase-1 runbook (prove the seam)

```sh
# 0. deps (one-time)
brew install tmux jq ffmpeg whisper-cpp        # tmux/jq/ffmpeg/whisper-cli/say/node all verified present
# NOTE: no ggml model found on disk — for `listen`, point VOICE_WHISPER_MODEL at your model file.
# `inject` (the core seam test) needs NO model.

# 1. check the seam tooling + mic index
bash _SYSTEM/Scripts/voice-seam.sh status
ffmpeg -f avfoundation -list_devices true -i ""   # find your mic index, e.g. ":0"

# 2. run claude INSIDE tmux (the canonical launch shape), ARMED for voice-out
tmux new -s claude
export VOICE_AGENT_ACTIVE=1                      # arms the Stop-hook TTS (owner action)
claude                                            # native /voice optional; not needed for the loop

# 3. wire the OUT hook — add to .claude/settings.json Stop array (see snippet below), then restart claude

# 4. from a SECOND terminal, drive the IN half
export VOICE_TMUX_TARGET=claude:0.0
bash _SYSTEM/Scripts/voice-seam.sh inject "what files did the last commit touch"
bash _SYSTEM/Scripts/voice-seam.sh listen 6      # speak; it transcribes + injects

# loop closes: speak -> injected -> claude answers -> Stop hook speaks the reply
```

settings.json Stop-array snippet (append inside the existing Stop `hooks` array):
```json
{ "type": "command", "command": "node \"$CLAUDE_PROJECT_DIR/.claude/hooks/voice-tts.mjs\"" }
```

Tuning env: `VOICE_SAY_VOICE` (e.g. Daniel), `VOICE_SAY_RATE` (210), `VOICE_MAX_CHARS` (320), `VOICE_TTS_CMD` (Phase 3 override).

## Risks (make-or-break)

1. **PTY-inject + interrupt seam** — no official "speak into Claude Code" API; `send-keys` is the path; barge-in `Esc` halt needs wiring (P2). Proven first, on purpose.
2. **Echo cancellation** — without AEC the lane transcribes its own Rick voice → infinite loop. Apple VPIO (P2) or headphones (now).
3. **Addressed-speech accuracy** — acting when not addressed is the worst UX; prefix/imperative heuristic first (P4).
4. **VS Code extension surface** — the extension input box is not a tmux pane; the loop targets a tmux-backed `claude` CLI (the canonical YURI launch shape).

## Status log

- 2026-06-16: P0 collision fix shipped (description rename, both roots; match dropped 16.9→7.86, name still matches — full removal offered). P1 seam files written + hook contract verified online.
- 2026-06-16: voice-tts.mjs UNIT-VERIFIED — armed→clean spoken summary (markdown/code/links stripped, 2-sentence cap), disarmed→silent, subagent-stop→silent. Fixed a detached-child stdin flush race (temp-file fd) + inline-code/orphan-punct polish. Tooling present except whisper model (listen needs VOICE_WHISPER_MODEL). REMAINING: live end-to-end (tmux send-keys into a running claude pane + Stop hook firing in the real session) — owner's test, can't be driven from here.
- 2026-06-16: LIVE — owner confirmed hearing `say` replies in the VS Code extension (Stop hook fires there). P3 Rick voice BUILT: voice-speak.sh (engine-agnostic OpenAI-compat TTS client + say fallback), voice-rick-server.py (Chatterbox-Turbo on MPS w/ CPU fallback, /v1/audio/speech), setup-rick-voice.sh (venv + chatterbox-tts install + on-device smoke test). Engine = Chatterbox-Turbo (owner pick over F5; new evidence had favored F5 for Mac). Hook now resolves TTS: $VOICE_TTS_CMD → voice-speak.sh → say. BLOCKERS: owner supplies ≥10s Rick ref clip at _SYSTEM/state/voice/rick-ref.wav + runs setup (dependency install) + starts the server. Turbo needs ≥10s ref + supports [laugh]/[cough]/[chuckle] tags.

## PIVOT — Full Pipecat Rebuild (owner chose 2026-06-16; Chatterbox cascade too slow)

WHY: Chatterbox-Turbo on MPS is ~1.4× realtime, non-streaming, and Turbo ignores `exaggeration` (log-confirmed). The bash chunk pipeline fired concurrent synths at a single GPU model → only chunk 1 played. Naive cascade. Research (agent-reach → native web): the good local Mac setups use Pipecat with a STREAMING MLX-native TTS.

KEY UNLOCK: **Marvis-TTS** (Marvis-AI/marvis-tts-250m, mlx-audio) — clones a voice from 10s ref, streams audio as text is processed, MLX-native on Apple Silicon, Sesame-CSM architecture. Fast + clones Rick + local. Resolves the fast-vs-clone tradeoff that Chatterbox/Kokoro couldn't.

ARCHITECTURE (grounds on kwindla/macos-local-voice-agents):
- Pipecat: SmallWebRTC or LocalAudio transport, Silero VAD (stop_secs=0.2), MLX Whisper STT (LARGE_V3_TURBO_Q4), LocalSmartTurnAnalyzerV2 (turn detection), Marvis TTS (Rick ref) — always-on + barge-in.
- BRAIN = live Claude Code session. Replace their `OpenAILLMService(base_url=LM-Studio)` with `claude-brain-proxy.py`: an OpenAI-shaped `/v1/chat/completions` that injects the user turn via `tmux send-keys` into the REAL interactive session and returns the reply the Stop hook writes to a FIFO. NO headless/SDK.
- Stop hook (voice-tts.mjs) gains BRIDGE MODE: when `_SYSTEM/state/voice/bridge.enabled` exists, it writes the conversational line to `reply.fifo` (non-blocking) instead of playing TTS — Pipecat owns the TTS.

HONEST LATENCY: STT+TTS become sub-second (MLX + streaming Marvis). Claude's thinking time is unchanged — voice-to-voice = Claude's response time + ~sub-second STT/TTS. NOT the <800ms chatbot figure (that assumes a small local LLM brain).

FILES: setup-pipecat.sh (venv + stack install), claude-brain-proxy.py (brain seam, :8011), voice-tts.mjs bridge branch, bot.py (TODO — Pipecat pipeline). ROLLBACK: all under _SYSTEM/Scripts/voice + a separate .venv-pipecat; delete venv + `bridge.enabled` to revert to the Chatterbox/say path.

PHASES: R1 brain-proxy+bridge (BUILT, untested — needs a tmux `claude` + install) · R2 install pipecat stack (RUNNING) · R3 bot.py (Pipecat + Marvis Rick) · R4 always-on/barge-in/Esc-interrupt · R5 tune. REQUIRES: Claude running in a tmux session (canonical launch shape), not the VS Code extension, for send-keys.

## Sources

Claude Code voice + hooks: code.claude.com/docs/en/voice-dictation · code.claude.com/docs/en/hooks
STT: northflank.com/blog/best-open-source-speech-to-text-stt-model-in-2026-benchmarks · huggingface.co/nvidia/parakeet-tdt-0.6b-v3 · github.com/senstella/parakeet-mlx
TTS/clone: resemble.ai/chatterbox-turbo · github.com/resemble-ai/chatterbox · elevenlabs.io/docs/overview/models
Turn-taking/framework: daily.co/blog/announcing-smart-turn-v3-with-cpu-inference-in-just-12ms · huggingface.co/pipecat-ai/smart-turn-v3 · github.com/pipecat-ai/pipecat · github.com/kwindla/macos-local-voice-agents
