# Voice Assistant Rebuild — Master Architecture Recommendation

**Synthesized from 10 research lanes** (9 delivered + L7's MCP finding). Every lane independently converged on the same architecture. This is the blueprint.

---

## 0. The one-paragraph answer

Kill the tmux/OMP-bridge/capture-pane/voice-call.py stack entirely. Build a **~300-line custom streaming cascade loop** (STT → LLM token stream → sentence-boundary buffer → TTS) with no framework overhead. Brain = either **OMP SDK** (`createAgentSession()` + `subscribe(text_delta)` for clean text, uses Max subscription, requires Bun/Node orchestrator) OR **DeepSeek v4-flash API** ($0.30/mo, 1.11s TTFT, Python-friendly). STT/TTS stay local (Whisper-MLX + Kokoro, $0). Fix the echo with Silero VAD + half-duplex mic gating. Target <700ms voice-to-voice.

---

## 1. Why the current setup failed

| Component | Failure mode | Source |
|---|---|---|
| tmux capture-pane | Grabs TUI chrome (borders, status bars, model names) → TTS reads it aloud | L1, L2, L7, L10 |
| voice-call.py one-shot | Spawns new Python process per call → reloads Whisper+Kokoro each time (~15s) | Session debug |
| OMP MCP voice tools | Never connected (server loaded models before `initialize` handshake → OMP timeout) | Session debug |
| GLM-4.6V vision | Hallucinated screen content ("John Doe", fake app lists) | L4, session debug |
| Barge-in echo loop | TTS output fed back into mic → VAD triggered → TTS interrupted → cycle | L8, L10, session debug |
| Pipecat framework tax | ~280-350ms latency overhead for telephony plumbing Marcel doesn't use | L1 |

**Root cause across all lanes:** Nobody who ships voice AI drives a live terminal session. The reliable 2026 pattern is a stateless streaming cascade pipeline where the brain is a normal API/SDK call, not captured CLI text. (L2, confirmed by L1, L7, L10)

---

## 2. Recommended architecture

```
┌─────────────────────────────────────────────────────────┐
│              Custom Thin-Glue Voice Loop                 │
│                  (~300 lines, no framework)              │
│                                                         │
│  Mic (HyperX) → Silero VAD → Whisper-MLX STT           │
│  ↓ transcription                                        │
│  Brain (OMP SDK subscribe OR DeepSeek API stream)       │
│  ↓ token stream                                         │
│  Sentence-boundary buffer (flush at ".", "!", "?")      │
│  ↓ sentence chunks                                      │
│  Kokoro-82M TTS → Speaker (XM5)                        │
│  ↑ barge-in: VAD fires → cancel TTS + abort LLM        │
│                                                         │
│  Tools: screenshot (CGWindowList), bash, screen-OCR     │
│  Vision: Claude Haiku API or local Ollama MiniCPM-V     │
└─────────────────────────────────────────────────────────┘
```

**Key properties:**
- Single process, single runtime (Python for DeepSeek path, Bun/Node for OMP path)
- Streaming at every stage — start TTS before LLM finishes
- Sentence-boundary flushing saves 200-500ms vs waiting for full response
- Target: ~120ms p50 STT→first-word, <700ms total voice-to-voice

---

## 3. Brain selection — two paths

### Path A: OMP SDK (recommended if Marcel wants model switching + Max value)

| Aspect | Detail |
|---|---|
| Mechanism | `createAgentSession()` + `session.subscribe("text_delta")` |
| Output | Pristine UTF-8 text stream — zero TUI chrome |
| Models | All OMP roles: Composer 2.5 Fast (default), Claude Sonnet, GLM-5.2, DeepSeek |
| Cost | $0 marginal (uses Max subscription in-process) |
| Vision | Native (Composer/Claude have vision) |
| Constraint | OMP is in-process only → orchestrator must be Bun/Node |
| MCP tools | Register in `.omp/mcp.json` (NOT config.yml/agent.db) |
| Hooks | `turn_end` / `agent_end` events for file-drop |
| Source | L7-ClaudeCursor (load-bearing finding) |

### Path B: DeepSeek v4-flash API (recommended for simplicity + reliability)

| Aspect | Detail |
|---|---|
| Mechanism | HTTP API call to `api.deepseek.com` (OpenAI-compatible) |
| Pricing | $0.14/M input, $0.28/M output → ~$0.30/month at 150 turns/day |
| Latency | 1.11s TTFT, 83 tok/s |
| Vision | **NONE** — text-only brain (L4 verified against official docs) |
| Function calling | Supported (128 parallel) but weakest dimension (81.5% vs Qwen 96.5%) |
| Reliability | No RPM cap, 2500 concurrency — vastly better than GLM's ~50% fail rate |
| Model switching | Via OpenRouter (one base URL → 400+ models, auto-failover) |
| Source | L6-DeepSeek |

### Recommendation

**Start with Path B (DeepSeek API)** — simpler plumbing, Python-friendly, $0.30/mo, proven reliable. Add Path A (OMP SDK) as an upgrade once the basic loop works. The thin-glue architecture supports both — the brain is a pluggable module.

**Critical DeepSeek gotcha (L4):** DeepSeek v4-flash has NO vision. Screen awareness routes to a separate vision call:
- **Cheapest:** macOS OCR `VNRecognizeTextRequest` (131ms, free, on-device) — best for text extraction
- **Free vision:** Local Ollama MiniCPM-V or Qwen2-VL (heavy on 16GB)
- **Best quality/cost:** Claude Haiku 4.5 API (~$0.001/screenshot) or Gemini 2.5 Flash (~$0.59/mo)

---

## 4. Component selections (research-backed)

| Component | Pick | Cost | Latency | Source |
|---|---|---|---|---|
| **STT** | Whisper-turbo-MLX-Q4 | $0 | ~90ms | L8 (Parakeet flipped — no streaming, single-maintainer) |
| **VAD** | Silero (confidence 0.5, stop_secs 0.5-0.8) | $0 | ~20ms | L8 (replace current RMS thresholding) |
| **Echo fix** | Half-duplex: mute mic during TTS (HyperX+XM5 split trivializes this) | $0 | 0ms | L8 (WebRTC AEC for speaker setups; XM5 makes it moot) |
| **Brain** | DeepSeek v4-flash API (Path B start) | $0.30/mo | 1.11s TTFT | L6 |
| **Streaming** | Sentence-boundary buffer (24-token first, 96-token subsequent) | $0 | saves 200-500ms | L2 |
| **TTS** | Kokoro-82M MLX | $0 | ~0.5s | L9 (NOT the bottleneck — pipeline is) |
| **Vision** | macOS OCR (text) + Claude Haiku API (scene) | ~$0.001/shot | 131ms (OCR) | L4 |
| **Screen context** | AX tree (macapptappree) — $0, ms-latency, event-driven | $0 | <1ms | L4 |
| **Framework** | NONE — custom thin-glue loop (~300 lines) | $0 | saves 150-200ms | L1 |

---

## 5. Cost model

| Component | Monthly cost | Notes |
|---|---|---|
| STT (Whisper local) | $0 | |
| TTS (Kokoro local) | $0 | |
| Brain (DeepSeek v4-flash) | $0.30 | 150 turns/day × 1000 in / 80 out tokens |
| Vision (Claude Haiku, 50 screenshots/day) | ~$1.50 | Only when screen queries needed |
| **Total** | **~$2/mo** | Effectively free |

vs. current GLM ($0 but ~50% fail rate) or Claude API ($3.47/mo at 50/day).

---

## 6. Kill list — delete from current setup

- ❌ `omp-brain-proxy.py` (tmux capture — reads terminal chrome)
- ❌ `voice-call.py` one-shot wrapper (spawns new process per call)
- ❌ `voice-serve.py` daemon (unnecessary if brain is a direct API call)
- ❌ `voice-mcp-server.py` (MCP voice tools — never connected to OMP properly)
- ❌ tmux session for brain (the entire capture-pane approach)
- ❌ Pipecat `bot.py` framework overhead (replace with thin loop)
- ❌ GLM-4.6V vision calls (hallucinated)
- ❌ Barge-in VAD monitor during TTS (caused echo loop)

**Keep:**
- ✅ Kokoro TTS engine (`kokoro_tts.py` — reuse the synth logic)
- ✅ Whisper MLX STT (reuse the transcription logic)
- ✅ `window-list.swift` (CGWindowList helper — works correctly)
- ✅ `frontmost.swift` (frontmost app detection)
- ✅ PyAudio device selection (HyperX input, XM5 output)
- ✅ Silero VAD (replace RMS thresholding)

---

## 7. Build plan

### Phase 1: Thin-glue voice loop (~300 lines, Python)
- Custom event loop: mic → VAD → STT → brain API → sentence buffer → TTS → speaker
- DeepSeek v4-flash API with streaming (`stream=True`)
- Half-duplex mic gating (mute during TTS, unmute after)
- Silero VAD (confidence 0.5, start_secs 0.15, stop_secs 0.8)
- Target: functional voice conversation in <700ms

### Phase 2: Screen awareness
- macOS OCR (`VNRecognizeTextRequest`) for text extraction (free, 131ms)
- Claude Haiku API for scene understanding (when OCR isn't enough)
- CGWindowList for window targeting (reuse `window-list.swift`)
- AX tree for frontmost app tracking (reuse `frontmost.swift`)

### Phase 3: Model switching
- OpenRouter integration (one URL → 400+ models)
- Preset switching: "fast" → DeepSeek flash, "smart" → Claude Sonnet, "heavy" → GLM-5.2
- Automatic fallback on provider errors

### Phase 4 (optional): OMP SDK integration
- Bun/Node orchestrator embedding OMP
- `createAgentSession()` + `subscribe("text_delta")` for clean text
- MCP tools in `.omp/mcp.json`
- Full model role switching (Composer/Claude/GLM/DeepSeek)

---

## 8. Key findings per lane (summary)

| Lane | Key finding |
|---|---|
| L1 Architectures | Path C: custom thin-glue loop over any framework. Hosted platforms (Vapi/Retell) disqualified — per-min pricing ruinous. |
| L2 LLM Integration | Nobody drives terminal sessions for voice. Streaming cascade is THE pattern. Claude Max OAuth ≠ free API. |
| L3 MCP Mastery | (Report lost in crash. L7 found config at `.omp/mcp.json`. MCP SDK docs available for rebuild.) |
| L4 Screen Vision | DeepSeek v4-flash has NO vision. GLM-4.6V hallucinated. Use OCR (free) + Claude Haiku (cheap). AX tree for context. |
| L5 STT/TTS Costs | Local stack = $0/mo. Cloud fallback = $23-47/mo. Echo+latency = pipeline problems, not engine. |
| L6 DeepSeek API | $0.30/mo for voice brain. 1.11s TTFT. Dual API surface (OpenAI + Anthropic-compatible). GLM had 50% fail rate. |
| L7 Claude/Cursor | OMP SDK `createAgentSession()` + `subscribe(text_delta)` = clean text. MCP config at `.omp/mcp.json`. Max ≠ API. |
| L8 Local STT | Whisper-turbo-MLX is correct (Parakeet flipped). Silero VAD replaces RMS. WebRTC AEC or half-duplex for echo. |
| L9 TTS Quality | Kokoro is fine — NOT the bottleneck. Chatterbox for voice identity (MIT, beat ElevenLabs blind). ElevenLabs = cost trap. |
| L10 Open Source | Ornith = coding model, NO-GO for voice. Local LLM not competitive for brain. Hybrid: local STT+TTS, cloud brain. Never scrape terminal. |

---

## 9. The echo problem — solved

The #1 pain (Yuri hears herself → interrupts → feedback loop) has a simple fix now that HyperX is the input and XM5 is the output:

**Half-duplex gating:** When TTS plays → close the mic stream. When TTS finishes → open the mic stream. Since input (HyperX USB) and output (XM5 Bluetooth) are DIFFERENT devices, there's no acoustic coupling. The echo only happened because the old barge-in monitor kept the mic active during TTS.

This is $0, 5 lines of code, and eliminates the entire echo class. (L8 confirmed: "XM5 headphones trivialize AEC.")

---

*Synthesized 2026-07-07 from 10 parallel research lanes. Reports at `02_RESOURCES/RESEARCH/voice-assistant-research-2026-07-06/`.*
