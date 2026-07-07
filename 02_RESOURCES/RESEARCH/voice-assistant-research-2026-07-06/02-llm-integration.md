# LLM-to-Voice Integration Patterns (2026)

> Lane: **L2-LLMIntegration** · Date: 2026-07-07 · Audience: Marcel's voice-assistant rebuild
> Cross-links: `L1-Architectures` (frameworks), `L6-DeepSeek` (v4 economics), `L7-ClaudeCursor` (OMP/Claude/Cursor brain), `L5-STTTTS` / `L8-LocalSTT` / `L9-TTSQuality` (audio legs).

## TL;DR — what actually works reliably

The single most important finding, and the answer to "our tmux approach failed, what do successful assistants do":

**Nobody who ships voice AI drives a live terminal session.** Production voice assistants in 2026 run a **stateless, streaming cascade pipeline** — `STT → LLM (token stream) → sentence-boundary buffer → TTS` — where the LLM is hit over a **normal HTTP/SSE API call per turn**, not by capturing text out of a CLI window. The tmux/capture-pane pattern is a known-fragile dead end with filed production bugs (see §2). The reliable move is to treat the brain as a **stateless API endpoint you call with structured messages**, keep your own conversation state, and stream tokens into TTS at sentence boundaries.

Within "API as brain," there is one golden-rule architectural choice: **stream at every stage**. Waiting for a full LLM response before speaking adds 1–3 s; chunking at sentence boundaries and flushing to TTS immediately saves 200–500 ms per sentence. The whole pipeline must land **under ~700 ms** voice-to-voice to feel human; **under ~1 s** is the floor before callers perceive lag.

**For Marcel specifically:** his subscriptions map unevenly onto the API-as-brain model (see §1.4). The cleanest, cheapest reliable brain today is **DeepSeek v4-flash over a fast inference provider** (OpenAI-compatible, `stream:true`, tool calling), routed through the voice loop with `thinking` disabled on simple turns. Claude is the strongest brain but **Claude Max cannot be used as a direct API brain** (§1.4) — it's a Claude-Code-only OAuth surface.

---

## 1. API-based integration (HTTP calls to an LLM provider)

This is the dominant, reliable pattern. Each conversation turn is one (or a few) HTTP request(s) to a chat-completions-style endpoint. You own the conversation history and send it with every call.

### 1.1 The three provider families Marcel cares about

**DeepSeek API (OpenAI- AND Anthropic-compatible).** This is the key one for Marcel.
- Base URLs: `https://api.deepseek.com` (OpenAI-compatible) and `https://api.deepseek.com/anthropic` (Anthropic Messages-compatible). One key works for both. [[codersera]](https://codersera.com/blog/how-to-use-deepseek-v4-api-developer-guide-2026/) [[deepseek-usa]](https://deepseek-usa.ai/docs/api/)
- `deepseek-v4-flash` and `deepseek-v4-pro` both support 1M context, up to 384K output, JSON mode, tool calls, and thinking/non-thinking modes. [[deepseeksr1]](https://deepseeksr1.com/api-docs/)
- Request/response, streaming (`stream: true` → SSE chunks), tool calling, and JSON mode are **identical to OpenAI** — so any OpenAI-SDK voice loop (Pipecat, LiveKit's OpenAI plugin) works against DeepSeek by swapping the base URL and model name.
- **Critical for voice:** disable `thinking` mode on simple turns. Reasoning mode destroys time-to-first-token (TTFT). [[chat-deep]](https://chat-deep.ai/solutions/deepseek-voice-agent/)
- **Legacy deprecation:** `deepseek-chat` and `deepseek-reasoner` aliases retire after **2026-07-24 15:59 UTC**. Migrate to `deepseek-v4-flash` / `deepseek-v4-pro` now. [[deepseek-usa]](https://deepseek-usa.ai/docs/api/)

**Anthropic API (Messages API, SSE streaming).**
- Streaming uses Server-Sent Events with named event types (`message_start`, `content_block_start`, `content_block_delta`, `content_block_stop`, `message_stop`). [[anthropic-streaming]](https://docs.anthropic.com/en/api/messages-streaming)
- **Tool calls stream as `content_block_delta` events with type `input_json_delta`**, carrying `partial_json` fragments you concatenate in arrival order. The chunks do **not** respect JSON boundaries, and the API does not buffer/validate tool input before streaming it. [[dev.to-streaming-tools]](https://dev.to/gabrielanhaia/streaming-tool-calls-parse-anthropic-sse-without-loading-the-whole-message-2on) [[anthropic-fine-grained]](https://platform.claude.com/docs/en/agents-and-tools/tool-use/fine-grained-tool-streaming)
- **Fine-grained tool streaming** (`eager_input_streaming: true` on a tool definition) streams a large tool argument as Claude generates it, skipping server-side buffering → lower latency to the first fragment of a big parameter. Useful if a tool takes a big JSON payload (e.g. a structured screen-region query).
- Pricing (per MTok, input/output): Haiku 4.5 `$1/$5`, Sonnet 4.6 `$3/$15`, Opus 4.8 `$5/$25`. Always pay-per-token on the API. [[finout]](https://www.finout.io/blog/anthropic-api-pricing)

**OpenAI API (Chat Completions / Responses).** The reference shape everyone else clones. Native function calling, parallel tool calls, streaming. Relevant mostly as the *protocol* Marcel's loop will speak (DeepSeek/GLM/many local models all mimic it).

### 1.2 Streaming vs batch (why streaming is non-negotiable for voice)

- **Batch** = one HTTP request, wait for the full JSON response, then act. Fine for non-realtime agents; **fatal for voice** — adds 1–3 s of dead air before first audio. [[inworld]](https://inworld.ai/resources/best-speech-to-speech-apis)
- **Streaming** (`stream: true`) = the provider emits SSE token deltas as they're generated. Your loop forwards text deltas to TTS immediately (§3). This is the **single highest-impact architectural choice** you can make. [[smallest.ai]](https://smallest.ai/blog/designing-voice-assistants-stt-llm-tts-tools-and-latency-budget)
- The whole pipeline target: **<700 ms** to feel human, **<1 s** floor. [[retell]](https://www.retellai.com/blog/how-real-time-voice-ai-works-stt-llm-tts)

### 1.3 Function calling for tools

All three families support OpenAI-style tool calling: you declare tools (name/description/JSON-schema input), the model decides when to call, emits structured args, you execute, you return the result as a new turn (or `function_call_output` on realtime APIs). DeepSeek v4-pro handles multi-turn and parallel tool calls reliably; flash is fine for single-call tool turns. **How this stays non-blocking in a voice context is covered in §5.**

### 1.4 ⚠️ Marcel's subscriptions → API access (the reality check)

This is the part most likely to break a naive design. Map each subscription to "can it be the API brain":

| Subscription | Usable as a direct voice-loop API brain? | Why / how |
|---|---|---|
| **Claude Max (OAuth)** | ❌ **No** | Max OAuth tokens (`sk-ant-oat01-…`) are **rejected by the Messages API** and valid only for Claude Code. Anthropic's Feb 2026 policy explicitly forbids third-party apps from using OAuth. [[puter]](https://developer.puter.com/tutorials/claude-oauth/) [[code.claude.com]](https://code.claude.com/docs/en/authentication) To use Claude as a brain you need **separate pay-per-token API credits** (Sonnet 4.6 `$3/$15` MTok). |
| **Cursor (Composer 2.5 Fast)** | ❌ **No direct API** | Cursor does not expose its models via a public API. It's an IDE surface. Use it for *building* the assistant, not as its brain. (Cursor-driven agents live inside the editor.) |
| **z.ai GLM Coding Plan ($0)** | ✅ **Yes** (text only) | GLM-4.6 / GLM-5.2 via `https://api.z.ai` (OpenAI-compatible SDK). Strong reasoning + tool use, 200K context. **No native realtime/voice API** — text chat completions + streaming only. [[z.ai docs]](https://docs.z.ai/guides/llm/glm-4.6) So GLM = a *cascade-pipeline* brain, never a realtime brain. Free on Marcel's plan. |
| **Ollama Pro (3 concurrent)** | ✅ **Yes** (local) | Local OpenAI-compatible endpoint. Free, private, but latency/quality bound to what fits M2 Pro 16 GB (see `L8-LocalSTT`/local-LLM lanes). |
| **DeepSeek API** (top-up) | ✅ **Yes** (recommended) | OpenAI-compatible, cheap, fast on flash. Best price/latency brain for the rebuild. Top up credit. |

**Implication:** The two "free" reliable API brains for Marcel are **GLM (text, free on plan)** and **DeepSeek v4-flash (cheap top-up)**. Claude-as-brain costs real API money on top of Max; it cannot ride the subscription. This is the single most important budget constraint for the architecture decision, and it directly contradicts a design that assumes "Claude Max = free Claude brain."

> Cross-link: `L7-ClaudeCursor` resolved the Claude/Cursor/OMP-brain question (see [`07-claude-cursor-brain.md`](./07-claude-cursor-brain.md)). The clean text extractor is the **in-process OMP SDK** (`createAgentSession()` + `session.subscribe(text_delta)`) — pristine UTF-8 spoken text with zero TUI chrome. This is NOT headless Claude (Marcel's rules ban `claude -p`/`--print`/SDK headless) — it's the same in-process session the TUI renders from. Architecture-shaping consequence: the voice orchestrator must be a Bun/Node process that *embeds* OMP (no HTTP router). Full treatment in §2.2.

---

## 2. Session-based integration (driving a live CLI) — why it failed, and what replaces it

This is Marcel's current pain: **tmux injection + capture-pane to scrape a CLI agent's output and pipe it to TTS.** The research verdict is unambiguous: **this is the wrong layer of abstraction for a voice brain.** It is fragile by construction, and the production bugs are filed and public.

### 2.1 Why tmux/capture-pane is fragile (with evidence)

- **Spawn race condition:** `tmux send-keys` fires *before* the new pane's shell (`.bashrc`) has finished initializing → the agent command lands in a half-ready shell and **silently fails to start**. Fix requires polling-based "wait for prompt" hacks and a 200 ms shell-init delay between spawns. [[claude-code #25315]](https://github.com/anthropics/claude-code/issues/25315)
- **Not concurrency-safe:** `tmux split-pane` calls race against each other and produce incorrect layouts; tmux's internal state "is not safe for concurrent modification," forcing serialized pane creation with locks. [[dev.to swarm]](https://dev.to/oldeucryptoboi/how-the-multi-agent-swarm-actually-works-285n)
- **Non-deterministic self-destruction:** LLM-driven cleanup "can non-deterministically issue `tmux kill-pane/kill-session` commands that destroy the host session itself, not just the subagent panes," losing all work. There is **no hard constraint at the tool/sandbox level** preventing the agent from killing its own session. [[claude-code #29787]](https://github.com/anthropics/claude-code/issues/29787)
- **Capture artifacts:** `capture-pane` was built for humans, not agents — it returns terminal escape sequences, wrapped lines, scrollback boundaries, and timing artifacts. Marcel's "terminal capture artifacts" pain is the textbook symptom. [[tmux #1045]](https://github.com/tmux/tmux/issues/1045) [[tmux #1412]](https://github.com/tmux/tmux/issues/1412)

**Root cause:** tmux is a terminal *multiplexer for humans*, repurposed as an IPC bus. Terminal capture is a lossy, timing-dependent, concurrency-hostile interface. Driving a brain through it adds a stochastic layer between "what the model produced" and "what your TTS received."

### 2.2 The reliable replacements (all structured IPC, zero terminal capture)

1. **Plain HTTP/SSE API calls (§1).** The brain is a stateless endpoint. You send messages, you get tokens back. No terminal in the path. This is what 90% of production voice agents do.
2. **MCP (Model Context Protocol) over stdio/HTTP/SSE.** Structured tool protocol — the model calls tools via a typed protocol, not by reading terminal output. OpenAI's Realtime API and LiveKit Agents both now support remote MCP servers natively; you can swap tool sources "with one line of code." [[livekit agents]](https://github.com/livekit/agents) [[guptadeepak]](https://guptadeepak.com/tools/top-10-mcp-frameworks-2026/) Tools-as-MCP is the right place for Marcel's screenshot/bash/computer-use tools — *not* the brain transport.
3. **In-process session subscription (the OMP/Claude-Code brain path).** When the brain *is* a coding-agent harness (OMP, Claude Code), don't scrape its terminal and don't go headless — reach **into** the harness and subscribe to its in-process text stream. For OMP: `createAgentSession()` + `session.subscribe(text_delta)` yields pristine UTF-8 spoken text with zero TUI chrome (the same session the TUI renders from, consumed as a stream). File-drop hooks: `turn_end` / `agent_end` events. MCP config lives in `.omp/mcp.json` / `~/.omp/agent/mcp.json`. Constraint: OMP is in-process-only (no HTTP router), so the orchestrator must be a Bun/Node process that **embeds** it. TTSR gives mid-stream self-correction. This is the structured-IPC answer to the tmux problem for the agent-harness brain specifically. (Details: [`07-claude-cursor-brain.md`](./07-claude-cursor-brain.md).) ⚠️ Headless/SDK mode (`claude -p`/`--print`/`--output-format stream-json`) is **banned by Marcel's launch-shape rule**, and Anthropic's June-2026 billing arc signaled headless moving to a separate pay-per-token pool (paused pre-effect, but the direction is clear) — so the in-process subscription above is the compliant path, not headless. [[digitalapplied]](https://www.digitalapplied.com/blog/anthropic-claude-credit-overhaul-june-15-2026)
4. **Durable agent frameworks (LangGraph, Mastra).** For long-running agentic work, frameworks with checkpointing/durability give you resumable state without terminal hacks. [[guptadeepak]](https://guptadeepak.com/tools/top-10-mcp-frameworks-2026/)

**Bottom line for the rebuild:** the brain should be an **API call** (or, for the agent-harness brain specifically, an **in-process OMP session subscription** — §2.2 #3), and the *tools* (screenshot, bash, computer-use) should be **MCP servers or native function tools** the brain calls through the structured protocol — never text the brain "prints" into a terminal you then try to hear. `L3-MCPMastery` owns the tool-server design; `L7-ClaudeCursor` owns the OMP-SDK subscription specifics ([`07-claude-cursor-brain.md`](./07-claude-cursor-brain.md)). Architecture note: OMP is Bun/Node (`@oh-my-pi/pi-coding-agent`), Pipecat is Python — but they don't have to share a language. Clean split per `L7-ClaudeCursor`: a Node brain process embeds OMP; a Python transport (Pipecat) calls into the Node bridge over a socket. **Only the brain process must be Node.** See §6.

---

## 3. Streaming LLM responses → TTS for low latency

This is the technique that makes a voice assistant feel alive instead of laggy. The reliable, well-documented pattern:

### 3.1 Split the token stream into two parallel buffers

When the LLM streams, it interleaves **text deltas** and **tool-call argument deltas**. Handle them on two separate paths [[assemblyai-stream]](https://www.assemblyai.com/blog/stream-llm-responses-voice-pipeline-tool-calling-structured-outputs-real-time-actions):

- **Text deltas → sentence-boundary buffer → TTS.** Accumulate tokens; when you hit a sentence boundary, flush that sentence to TTS *immediately*. The user hears sentence 1 while the model is still generating sentence 2.
- **Tool-call argument deltas → JSON buffer → execute.** Accumulate `partial_json` fragments; you cannot act on partial args, so buffer until the tool-call JSON is complete (i.e. until `content_block_stop` / the streaming tool-call close), then execute. (§5 covers making this non-blocking.)

### 3.2 Sentence-boundary detection (the critical bridge)

Rules that work in practice [[arxiv-enterprise]](https://arxiv.org/pdf/2603.05413) [[dev.to-guide]](https://dev.to/programmerraja/2025-voice-ai-guide-how-to-make-your-own-real-time-voice-agent-part-3-3ocb):
1. Detect sentence-ending punctuation (`. ! ?`) followed by whitespace.
2. **Exclude false positives:** abbreviations (`Dr.`, `Mr.`, `PM.`) and decimal numbers.
3. Enforce a **minimum sentence length** (~10 chars) so you don't send fragments to TTS.
4. Flush any remaining buffered text when the stream ends.

**Pipecat's concrete recipe** (`BufferedLLMService`, from their `nemotron` reference design) [[pipecat-nemotron]](https://github.com/pipecat-ai/nemotron-january-2026/blob/main/docs/streaming-pipeline-architecture.md):
- **First segment: 24-token cap** → fast time-to-first-chunk (get audio out the door ASAP).
- **Subsequent segments: up to 96 tokens**, waiting for a natural sentence ending (better prosody).
- **TTS adaptive mode:** first segment in streaming mode (~370 ms TTFB); subsequent segments in batch mode (higher quality). First-audio under ~300 ms is achievable.

### 3.3 Why this matters quantitatively

- Waiting for the full LLM response before TTS: **+1–3 s**. [[inworld]](https://inworld.ai/resources/best-speech-to-speech-apis)
- TTS waiting for a full sentence before synthesizing: **+200–500 ms**. [[inworld]](https://inworld.ai/resources/best-speech-to-speech-apis)
- Flushing at the first sentence boundary: **saves 200–500 ms** per flush. [[futureagi-latency]](https://futureagi.com/blog/how-to-optimize-voice-agent-latency-2026/)

### 3.4 Barge-in (interruption) — the case every naive implementation forgets

When the user interrupts mid-sentence, three things must happen atomically [[futureagi-latency]](https://futureagi.com/blog/how-to-optimize-voice-agent-latency-2026/) [[smallest.ai]](https://smallest.ai/blog/designing-voice-assistants-stt-llm-tts-tools-and-latency-budget):
1. **Flush the in-flight TTS** audio buffer (stop speaking).
2. **Cancel the in-flight LLM** stream (abort the HTTP request — don't keep paying for/reading tokens you'll throw away).
3. **Restart STT** on the new user audio *without clipping* the new utterance.

VAD (Silero, <1 ms per chunk) drives this. Poor barge-in either clips the user's speech or keeps playing the old response over the new input — both feel broken. This is a first-class audio-management concern; decide the barge-in strategy **early** because it shapes the entire audio layer.

**Critical latency detail — gate audio-stop on VAD, not on the brain's abort-ack.** The TTS flush and the stream-abort race in parallel; whichever you gate determines perceived barge-in latency. Stop speaking the instant VAD fires — do **not** wait for the abort confirmation before flushing the audio queue. `L7-ClaudeCursor` confirmed the in-process OMP abort is sub-ms (`session.abort()` flips a shared `AbortController`, emission stops before the next event), so the latency leak is never the abort itself — it's the socket round-trip (in a multi-process brain) and the TTS audio queue. Both are sidestepped by draining TTS on VAD *independently* of the abort round-trip. This generalizes: in *any* architecture, the brain-abort and the TTS-flush are parallel; gate the user-facing "stop" on VAD. For "redirect" (user interrupts with a new instruction instead of just stopping), the OMP primitive is `session.steer(text)` (`streamingBehavior:"steer"`, queues the new prompt without discarding the in-flight turn).

> This is almost certainly contributing to Marcel's "echo feedback loops" — if the loop doesn't cleanly cancel TTS + LLM on user speech, the assistant's own output gets picked up by the mic and re-transcribed. Echo cancellation + correct barge-in (cancel-then-restart) are the fix. See `BluetoothAudioFix` / `PyAudioDeviceFix` lanes for the hardware side.

---

## 4. WebSocket / realtime APIs — and which work with Marcel's subs

There are **two fundamentally different architectures**, and this distinction is the crux of the whole rebuild:

### 4.1 Architecture A — Cascade pipeline (STT → LLM → TTS), 90% of production

You pick the best STT, the best LLM (any API brain, including GLM/DeepSeek/Claude), the best TTS, and stream between them. **This is the only architecture that lets Marcel use his free/cheap brains (GLM, DeepSeek-flash).** `L5-STTTTS` / `L8-LocalSTT` / `L9-TTSQuality` own the audio legs; the STT/TTS picks relevant here:

- **Deepgram Nova-3 STT:** sub-300 ms streaming latency (WebSocket), ~5.26% WER internally, **$0.0048/min** streaming. The 2026 default for voice STT. [[deepgram-nova3]](https://deepgram.com/learn/introducing-nova-3-speech-to-text-api) [[futureagi-stt]](https://futureagi.com/blog/speech-to-text-apis-in-2026-benchmarks-pricing-developer-s-decision-guide/)
- **Deepgram Aura-2 TTS:** ~90 ms TTFB steady-state (95th-pct <200 ms), **$0.030 / 1k chars**. [[deepgram-aura2]](https://deepgram.com/learn/aura-2-leads-coval-real-time-tts-benchmarks)
- **Deepgram Voice Agent API:** integrated STT+LLM+TTS orchestration, **$4.50/hr**, eliminates cross-provider latency mismatch. [[deepgram-vaa]](https://deepgram.com/learn/voice-agent-api-generally-available)
- Alternatives in the Pipecat roster: AssemblyAI, Soniox, Gladia, Groq-Whisper, Cartesia, ElevenLabs, Kokoro (82M, fast, streaming, self-hostable). [[pipecat-ai]](https://github.com/pipecat-ai/pipecat)

### 4.2 Architecture B — Native realtime/multimodal API (audio in → audio out, no separate STT/TTS)

A single model ingests audio and emits audio directly. Lowest possible latency (sub-300 ms), most natural speech, but **locks you to that one provider's model** — you cannot swap in GLM/DeepSeek/Claude as the brain.

- **OpenAI Realtime API (`gpt-realtime-2`):** the gold standard. WebRTC (browser/client → UDP, direct peer) or WebSocket (server-to-server). [[openai-realtime-webrtc]](https://developers.openai.com/api/docs/guides/realtime-webrtc) Sub-300 ms response; supports **function tools** (client executes) **and MCP tools** (API connects to a remote MCP server for you) and image inputs (multimodal, May 2026). Session max 60 min. [[openai-realtime-conversations]](https://developers.openai.com/api/docs/guides/realtime-conversations)
- **Cost:** $32/MTok audio in, $64/MTok audio out (cached in $0.40). Audio token = 100 ms user / 50 ms assistant. Real-world: **~$0.05–0.10/min with caching+trimmed tool outputs**, up to **$0.18–0.46/min uncached**. [[callsphere-cost]](https://callsphere.ai/blog/vw2c-openai-realtime-cost-per-minute-math-2026) [[hackernoon-cost]](https://hackernoon.com/openai-realtime-api-pricing-in-2026-real-world-data-from-4000-measured-sessions)
- **Other realtime APIs:** Gemini Live (`BidiGenerateContent`, with `NON_BLOCKING` + `scheduling:"SILENT"`), Deepgram's own realtime surfaces, Inworld/xAI (both follow the OpenAI Realtime event schema — it's becoming a de facto standard). [[gemini forum]](https://discuss.ai.google.dev/t/scheduling-silent-in-non-blocking-function-response-not-preventing-duplicate-audio-generation/114361) [[inworld]](https://inworld.ai/resources/best-realtime-ai-api)

### 4.3 Which realtime APIs work with Marcel's subscriptions?

**Direct answer:** none of his subscriptions grant realtime-API access, because none of his providers *have* a realtime API Marcel can use as a brain:
- **GLM (z.ai):** text chat completions + streaming only. **No realtime/voice API.** [[z.ai docs]](https://docs.z.ai/guides/llm/glm-4.6) → cascade only.
- **Claude:** no native realtime audio API. → cascade only.
- **DeepSeek:** OpenAI-compatible text API. No realtime audio API. → cascade only.
- **OpenAI Realtime:** available, but Marcel has **no OpenAI subscription** — it would be a new pay-per-use cost ($0.05–0.46/min), and it **locks the brain to OpenAI**, defeating Marcel's "switch models" goal.

**Conclusion:** Marcel's "switch models" + cost-effectiveness constraints **rule out Architecture B** as the primary path. The rebuild should be **Architecture A (cascade)** with a model-switchable API brain (GLM free / DeepSeek-flash cheap / Claude-paid / Ollama-local), Deepgram (or local) for STT/TTS. Realtime API is a premium "naturalness" upgrade, not the base layer — and it can't switch brains.

### 4.4 The unified-gateway trick: OpenRouter

For the "switch models" requirement, **OpenRouter** is the pragmatic switchboard: one OpenAI-compatible base URL + key → 400+ models across 60+ providers, with **auto-failover** (if DeepSeek is slow/down, fall back), unified billing, and a routing layer that picks by cost/latency/availability. [[openrouter]](https://openrouter.ai/openrouter) [[truefoundry-or]](https://www.truefoundry.com/blog/openrouter-pricing) First 1M BYOK requests/month free; otherwise 5% surcharge. Notably it can also expose an **Anthropic-compatible base URL** so even Anthropic-SDK loops (and Claude-Code-backend-switching) route through it — but Marcel still pays per-token for Claude; the subscription doesn't apply. [[ofox]](https://ofox.ai/blog/claude-code-switch-tutorial-2026/)

---

## 5. Tool calling in voice context — without blocking the conversation

This is the hardest part of a "Jarvis that can see screens and use the computer." Tools (screenshot, bash, computer-use) are inherently slow (100 ms–seconds). If the assistant goes silent while a tool runs, the conversation feels frozen. Two reliable patterns:

### 5.1 Non-blocking / "fire and keep talking" tools

The assistant **keeps speaking** while the tool executes in the background; the result is injected as a fresh turn when ready. Gemini formalizes this as `NON_BLOCKING` functions with `scheduling:"SILENT"` (tool runs silently, doesn't preempt the spoken response). [[gemini forum]](https://discuss.ai.google.dev/t/scheduling-silent-in-non-blocking-function-response-not-preventing-duplicate-audio-generation/114361) The practical voice pattern:

1. Model emits a tool call mid-response.
2. Your loop **streams the surrounding text to TTS normally** (e.g. "Let me grab a screenshot…") **in parallel** with launching the tool.
3. Tool runs (async). The spoken response continues uninterrupted.
4. On tool completion, push the result back as a new turn → model generates a follow-up → that streams to TTS.

### 5.2 Blocking tools with a filler beat

For tools where the answer *is* the response (e.g. "what's in this screenshot?"), you can't pre-speak the answer. Pattern: emit a short filler ("Checking…") while the tool runs, then deliver the result. Keep the filler <1 s or it feels padded.

### 5.3 Where tools should live: MCP, not the brain transport

Marcel's screenshot/bash/computer-use tools should be **MCP servers or native function tools** consumed by whichever brain is active — **not** wired through terminal capture. OpenAI Realtime and LiveKit Agents both consume remote MCP servers natively; Pipecat lets you drop tool handlers into the pipeline as processors. [[livekit agents]](https://github.com/livekit/agents) [[openai-realtime-mcp]](https://developers.openai.com/api/docs/guides/realtime-mcp) This keeps tools **provider-agnostic**: the same screenshot MCP server serves GLM, DeepSeek, Claude, or Ollama brains. (See `L3-MCPMastery` for the tool-server design.)

### 5.4 The streaming tool-call parsing gotcha

Because tool arguments stream as **partial JSON fragments that don't respect boundaries** (Anthropic `input_json_delta`, OpenAI equivalent), you **cannot** execute on a partial arg and you **must not** feed tool-arg deltas to TTS (they're not speech). Keep the §3.1 two-buffer split strict: text deltas → TTS; tool-arg deltas → JSON buffer → execute on completion. [[dev.to-streaming-tools]](https://dev.to/gabrielanhaia/streaming-tool-calls-parse-anthropic-sse-without-loading-the-whole-message-2on)

---

## 6. Recommendation for Marcel's rebuild

Given: M2 Pro/16 GB, "switch models," cost-effective, Jarvis-like (screen + computer-use), and the hard constraint that **Claude Max ≠ free Claude API brain** and **no realtime API serves his brains**:

1. **Architecture: cascade pipeline (A), not realtime (B) and not session/tmux.** Use Pipecat or LiveKit Agents (Self-hosted; runtime in your service). [[pipecat-ai]](https://github.com/pipecat-ai/pipecat) [[livekit agents]](https://github.com/livekit/agents)
2. **Brain = switchable API via OpenRouter** (or direct): GLM-4.6/5.2 (free on plan) ↔ DeepSeek v4-flash (cheap top-up, `thinking` off on simple turns) ↔ Claude Sonnet 4.6 (pay-per-token when you want depth) ↔ Ollama local (private/offline). All speak the OpenAI streaming+tool-calling protocol, so the loop is brain-agnostic.
3. **STT/TTS: Deepgram Nova-3 + Aura-2** as the reliable hosted default (~$0.005/min STT, ~$0.03/1k chars TTS); local Kokoro/faster-whisper as the offline fallback (the `L8/L9` lanes quantify these).
4. **Stream at every stage**, with a sentence-boundary buffer (Pipecat `BufferedLLMService` recipe: 24-token first segment, 96-token subsequent, TTS adaptive mode). Kill the "wait for full response" habit — that alone likely explains much of the current slowness.
5. **Barge-in: cancel TTS + abort LLM + restart STT** on VAD. This is the echo/feedback-loop fix as much as a UX fix.
6. **Tools as MCP servers** (screenshot/bash/computer-use), consumed natively by whichever brain is active — never via terminal capture. Non-blocking pattern: keep talking while the tool runs, inject the result as a fresh turn.
   - **If the OMP/Claude brain is wanted alongside the API brains:** the "pluggable brain" problem mostly collapses. Per `L7-ClaudeCursor` (OMP `provider-streaming-internals.md`), OMP normalizes every provider (Anthropic, OpenAI, Gemini, Ollama, Cursor, DeepSeek) into ONE `AssistantMessageEvent` (`text_delta` / `thinking_delta` / `toolcall_delta`). So for any brain that lives in the OMP session, switching models = a provider/model-role swap inside `session.subscribe(text_delta)` — the downstream sentence-boundary buffer (§3) is identical, no separate abstraction. A real adapter is only needed for brains that CAN'T live in the OMP process (OpenAI Realtime API's native-audio tool calls, or any Python-only brain) — those normalize their stream into a `text_delta`-equivalent before the buffer. **~90% provider-swap, ~10% adapter.** Language split: brain-side Node embeds OMP; transport-side can stay Python-Pipecat over a socket bridge — only the brain process must be Node.
7. **Kill the tmux/capture-pane path entirely.** It is the documented root of the spawn-race, self-kill, and capture-artifact failures. The brain is an API call; tools are MCP.

### Cost envelope (rough, pay-per-use on top of subscriptions)
- Brain: GLM free; DeepSeek-flash ~$0.20–0.80/MTok (Marcel's top-up); Claude Sonnet $3/$15 MTok (only when warranted). [[hikari]](https://www.hikari-dev.com/en/blog/2026/05/17/deepseek-claude-code/)
- STT/TTS: Deepgram ~$0.005/min + ~$0.03/1k chars; or Deepgram Voice Agent API $4.50/hr all-in. [[deepgram-vaa]](https://deepgram.com/learn/voice-agent-api-generally-available)
- Realtime API (if ever added as premium): $0.05–0.46/min, OpenAI brain only. [[hackernoon-cost]](https://hackernoon.com/openai-realtime-api-pricing-in-2026-real-world-data-from-4000-measured-sessions)

---

## 7. Residual uncertainty / what other lanes will settle

- **Local-LLM quality/latency on M2 Pro 16 GB** (Ollama Pro, 3 concurrent) — `L8-LocalSTT` and the local-LLM lanes will quantify whether Ollama can be a zero-cost offline brain at acceptable latency. If yes, that's the offline tier of the model-switch.
- **DeepSeek-flash real-world voice TTFT through the best inference provider** — `L6-DeepSeek` owns the provider-by-provider economics; my numbers (0.66–1.3 s flash non-reasoning TTFT) are benchmark medians, measure on Marcel's network.
- **Claude/Cursor/OMP-brain integration — FULLY RESOLVED by `L7-ClaudeCursor`** ([`07-claude-cursor-brain.md`](./07-claude-cursor-brain.md)). Three pieces, all closed:
  1. **Text extraction:** in-process OMP SDK (`createAgentSession()` + `session.subscribe(text_delta)`) — pristine UTF-8, zero chrome. NOT headless (banned), NOT tmux-capture (fragile).
  2. **Multi-brain co-existence:** OMP normalizes every provider to one `AssistantMessageEvent` (`text_delta`/`thinking_delta`/`toolcall_delta`), so model-switch = provider swap for ~90% of brains; ~10% adapter for brains that can't live in OMP (OpenAI Realtime API, Python-only). Language split is clean: Node brain embeds OMP, Python transport (Pipecat) over a socket.
  3. **Barge-in abort contract (was the open question):** localhost **Unix socket** (not HTTP/TCP). Node→Python pushes `{type:"text_delta", text}`. Python→Node on VAD: `{type:"barge_in", intent:"stop"|"redirect", text?}`. `stop` → Node calls `session.abort()` (sub-ms synchronous cancel: shared `AbortController` flipped, partial assistant message synthesized, emission stops before the next event). `redirect` → `session.steer(text)` (`streamingBehavior:"steer"`, queues new prompt without discarding in-flight turn). Tool-execution cancel is separate and already handled via `AbortSignal.any([agentSignal, steeringAbortSignal])`. **Latency-leak fix (the key insight):** the abort itself is sub-ms; the leak is the socket round-trip + the TTS queue → **drain TTS on VAD independently of the abort round-trip** (gate audio-stop on VAD, not abort-ack — §3.4). Authoritative: OMP `provider-streaming-internals §Cancellation boundaries` + `sdk.md`.
  → **No remaining open question on the brain side.** The contract is build-ready for `L1-Architectures`.
- **STT/TTS picks** — `L5-STTTTS` / `L9-TTSQuality` own the audio-quality vs latency tradeoff; I scoped only to latency/cost and the integration interface.

## Sources
- Pipecat: [github.com/pipecat-ai/pipecat](https://github.com/pipecat-ai/pipecat), [streaming-pipeline-architecture](https://github.com/pipecat-ai/nemotron-january-2026/blob/main/docs/streaming-pipeline-architecture.md)
- LiveKit Agents: [github.com/livekit/agents](https://github.com/livekit/agents), [voice-agent-architecture blog](https://livekit.com/blog/voice-agent-architecture-stt-llm-tts-pipelines-explained)
- OpenAI Realtime: [realtime-webrtc](https://developers.openai.com/api/docs/guides/realtime-webrtc), [realtime-conversations](https://developers.openai.com/api/docs/guides/realtime-conversations), [realtime-mcp](https://developers.openai.com/api/docs/guides/realtime-mcp), [pricing](https://developers.openai.com/api/docs/pricing)
- DeepSeek: [api-docs](https://api-docs.deepseek.com/), [deepseek-usa guide](https://deepseek-usa.ai/docs/api/), [chat-deep voice-agent](https://chat-deep.ai/solutions/deepseek-voice-agent/)
- Anthropic: [messages-streaming](https://docs.anthropic.com/en/api/messages-streaming), [fine-grained tool streaming](https://platform.claude.com/docs/en/agents-and-tools/tool-use/fine-grained-tool-streaming), [authentication](https://code.claude.com/docs/en/authentication)
- Anthropic billing: [digitalapplied](https://www.digitalapplied.com/blog/anthropic-claude-credit-overhaul-june-15-2026), [finout pricing](https://www.finout.io/blog/anthropic-api-pricing), [puter OAuth](https://developer.puter.com/tutorials/claude-oauth/)
- Deepgram: [nova-3](https://deepgram.com/learn/introducing-nova-3-speech-to-text-api), [aura-2](https://deepgram.com/learn/aura-2-leads-coval-real-time-tts-benchmarks), [voice-agent-api](https://deepgram.com/learn/voice-agent-api-generally-available), [measuring latency](https://developers.deepgram.com/docs/measuring-streaming-latency)
- tmux/agent fragility: [claude-code #25315](https://github.com/anthropics/claude-code/issues/25315), [claude-code #29787](https://github.com/anthropics/claude-code/issues/29787), [dev.to swarm](https://dev.to/oldeucryptoboi/how-the-multi-agent-swarm-actually-works-285n), [tmux #1045](https://github.com/tmux/tmux/issues/1045)
- Streaming→TTS: [inworld s2s](https://inworld.ai/resources/best-speech-to-speech-apis), [assemblyai stream-llm](https://www.assemblyai.com/blog/stream-llm-responses-voice-pipeline-tool-calling-structured-outputs-real-time-actions), [retell how-it-works](https://www.retellai.com/blog/how-real-time-voice-ai-works-stt-llm-tts), [smallest.ai design](https://smallest.ai/blog/designing-voice-assistants-stt-llm-tts-tools-and-latency-budget), [futureagi latency](https://futureagi.com/blog/how-to-optimize-voice-agent-latency-2026/), [arxiv enterprise realtime](https://arxiv.org/pdf/2603.05413)
- DeepSeek latency benchmarks: [artificialanalysis flash](https://artificialanalysis.ai/models/deepseek-v4-flash/providers), [deepinfra pro](https://deepinfra.com/blog/deepseek-v4-pro-max-api-benchmarks-latency-throughput-cost)
- z.ai GLM: [glm-4.6 docs](https://docs.z.ai/guides/llm/glm-4.6)
- OpenRouter: [openrouter](https://openrouter.ai/openrouter), [truefoundry pricing](https://www.truefoundry.com/blog/openrouter-pricing), [ofox claude-code switch](https://ofox.ai/blog/claude-code-switch-tutorial-2026/)
- Cost: [hackernoon realtime pricing](https://hackernoon.com/openai-realtime-api-pricing-in-2026-real-world-data-from-4000-measured-sessions), [callsphere cost](https://callsphere.ai/blog/vw2c-openai-realtime-cost-per-minute-math-2026)
