# Realtime voice control of Claude — deep architecture research — 2026-06-17

Owner ask: "I've seen people speak to the AI on their computer with near-instant feedback, work entirely in VS Code with Claude by voice — an actual assistant that listens, executes, communicates like Jarvis. What we have is an older way with horrible delay. We don't stop till it's snappy."

## The architecture spectrum (measured TTFA = time-to-first-audio)
| Architecture | TTFA | Brain | Notes |
|---|---|---|---|
| **S2S native** (Grok Voice, OpenAI gpt-realtime, Moshi, Gemini Live) | **0.78–1.1s** | their audio-native model | the "instant" demos. NOT Claude. |
| **Streaming cascade** (Unmute-style: streaming STT + text-LLM streaming + streaming TTS) | **<1s–~2.5s** | ANY text LLM incl. Claude | snappy + Claude-capable. The realistic Jarvis-with-Claude. |
| **Turn-end cascade** (our current build: Stop-hook fires TTS at turn-end) | **turn-length + synth** | the real Claude Code session | the "old way" — waits for the WHOLE turn before any audio. |
| human conversational baseline | ~0.2s | — | the bar everyone's chasing |

## Why ours feels slow (root, beyond the bugs already fixed)
The Stop hook fires only when Claude **finishes the entire turn**. So audio can't start until: full STT (VAD-batch) → full Claude turn (incl. any tool calls) → synth. Streaming is impossible in this model. (The cold-start, Bluetooth, EQ, stacking bugs were all real and fixed — but this turn-end structure is the architectural ceiling.)

## The Jarvis unlock (what the snappy setups actually do)
1. **Streaming STT** — partial transcripts + semantic-VAD turn detection (not wait-for-silence-then-batch). Apple-Silicon options: **Kyutai STT** (MLX, streaming, semantic VAD, on-device), **Moonshine** (27M, edge-fast), **Voxtral Realtime** (Mistral, causal encoder, true streaming). vs our Parakeet (batch, good but not partial-streaming).
2. **Stream the LLM's tokens into TTS as they generate** — start speaking at the first sentence, not turn-end. This is THE latency killer.
3. **Streaming TTS** — MOSS (ours, RTF 0.33) or Kyutai TTS; speak chunk-by-chunk.
4. **Full-duplex barge-in** — interrupt the agent by talking; orchestrator handles it.
5. **Framework**: **Pipecat** (v1.0 Apr 2026, open-source, MLX-friendly, own every frame, Anthropic + MCP tools + interruption — ALREADY scaffolded in our `bot.py`) · **Kyutai Unmute** (turnkey "make any text LLM listen+speak," <1s, but Rust/Docker/GPU-oriented) · **LiveKit** (WebRTC, heavier).

## THE HARD CONSTRAINT (confirmed via Claude Code docs, claude-code-guide agent)
- Claude Code interactive (VS Code AND terminal): **NO mid-turn streaming** — no streaming hook, transcript written only at turn-end, no token-level consumption. Stop hook = turn-end only.
- **No programmatic injection** into a running session (VS Code = prefill only, never submits; terminal = OS keystroke / cmux send only).
- **Streaming + tools requires the Claude API / Managed Agents SDK** (`stream:true` / SSE `text_delta`; Managed Agents streams AND auto-executes bash/files/MCP + supports `user.interrupt`). `claude -p` does NOT stream (buffers to turn-end).

## The impossible trinity — you can have any TWO, not all three
1. **Claude as the brain**  2. **Your actual VS Code session** (its context/tools)  3. **Sub-second Jarvis latency**
- Drop #3 → **our current path** (real session, turn-based, now optimized: MOSS + keep-warm + no-EQ + built-in speakers). Snappier than before, never instant.
- Drop #2 → **Pipecat/Managed-Agents voice agent on the Claude API** — streaming, barge-in, MCP tools so it genuinely EXECUTES; ~1.5–2.5s, feels like Jarvis. But it's a SEPARATE Claude brain (API), not your VS Code session.
- Drop #1 → **S2S model** (Grok/OpenAI realtime/Moshi) — 0.8s instant, not Claude at all.

## Recommendation
**Option A — build the Pipecat voice agent on the Claude API/Managed-Agents** (the only path to the Jarvis he's describing). Streaming STT (Kyutai STT MLX or Moonshine) + stream Claude tokens → MOSS TTS + Silero/semantic-turn barge-in. Give it the SAME MCP servers + YURI mechanisms so it executes real work. Realistic feel ~1.5–2.5s (first-token-bound, not turn-bound). Keep the cmux overseer for turn-based fleet control; this is the conversational front-end.

## OWNER RULING NEEDED before building (why this is owner-gated)
1. **Launch-shape conflict**: YURI's contract forbids `claude -p` / SDK / headless for the MAIN coding lane (cache/continuity). A voice agent on the API is a NEW companion lane — needs an explicit carve-out, OR we stay on Option B forever.
2. **Monetary cost**: API/Managed-Agents is metered (not the Max subscription). Owner-configurable blast factor.
3. **Architecture choice**: which trinity-constraint to drop is his call, not mine.

## Sources
- softcery.com/lab/ai-voice-agents-real-time-vs-turn-based-tts-stt-architecture (S2S vs cascade, TTFA numbers)
- github.com/kyutai-labs/unmute + kyutai.org/unmute (wrap any text LLM, <1s) · kyutai.org/stt (MLX streaming STT)
- Pipecat (daily.co, v1.0) · LiveKit voice-agents · inworld.ai Vapi-vs-Pipecat-vs-LiveKit
- mistral Voxtral Realtime (antirez/voxtral.c) · Moonshine (onresonant.com) · mlx-audio Voxtral-Realtime
- Claude docs: API streaming, Managed Agents events-and-streaming, Claude Code hooks/sessions (via claude-code-guide)
