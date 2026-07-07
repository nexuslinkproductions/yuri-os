# Voice Assistant Architectures — 2026 State of the Art

> **Lane:** L1-Architectures · **Date:** 2026-07-07 · **Scope:** Framework/platform survey for Marcel's always-on **desktop** Jarvis rebuild.
> **Method:** Broad web research across 5 areas, then MoE synthesis (Haiku → tables, Sonnet → architecture analysis, Opus → adversarial review). Marcel's constraints ground every verdict.

---

## TL;DR — The shape of the problem determines the answer

Marcel's constraints describe a **single-user, always-on, tool-using, computer-controlling desktop assistant** that reuses his subscriptions and switches models. That is a *very specific* shape, and it rules out most of the 2026 voice-AI market by category:

- **Hosted telephony platforms (Vapi / Retell / Bland)** are built for inbound/outbound *phone* agents at scale. Wrong shape. They exist to move PSTN minutes, not to sit on a desktop 24/7. ❌
- **Speech-to-speech models (Moshi / Realtime / Nova Sonic)** win on conversational latency (~200ms) but have **no tool-calling surface and no model switching** — fatal for a computer-controlling Jarvis. ❌ as default; maybe as a "chat mode" later.
- **LiveKit Agents** is excellent transport, but its WebRTC SFU/multi-participant architecture is **overkill for a process talking to itself on one machine** (~80-150ms of needless media-pipeline tax). ❌ for this use case.
- **Pipecat** (his current tool) is sound at the core — the breakage is in his **tmux/OMP/MCP wiring around it**, not the frame pipeline. Refactorable, but the framework abstraction tax (~15-25ms per frame hop) buys telephony plumbing he doesn't use.

The convergent recommendation from the MoE synthesis (Sonnet + Opus independently arrived here): **a streaming STT→LLM→TTS loop is the right architecture; a ~300-400 line custom asyncio glue layer is the right implementation for *his* shape.** Keep the models (his MoE roster), delete the framework, write the glue. Details in §7-8.

---

## 0. Marcel's constraints (the decision input)

| Axis | Value | Architectural consequence |
|---|---|---|
| Hardware | M2 Pro, 16GB unified RAM, HyperX USB mic, Sony XM5 (Bluetooth) | Local inference is viable; unified memory fits a small MoE residency; Bluetooth output adds a known latency/AEC wrinkle |
| Claude Max | OAuth consumer subscription (not a standard API key) | Needs an OAuth→API proxy; not a drop-in `base_url` |
| Cursor Composer 2.5 Fast | Coding tool, **not** an inference endpoint | Dev-time only; not a runtime voice-loop model |
| z.ai GLM Coding Plan | Free, 1M context, GLM-5.2/5.1 | OpenAI-compatible endpoint → any framework; long-context memory role |
| Ollama Pro | 3 concurrent models, local | Ultra-low-latency local tier; MoE residency home |
| DeepSeek API | Willing to top up for v4-flash | Cheap-fast cloud tier; OpenAI-compatible → any framework |
| Budget | Cost-effective | Self-hosted desktop loop ≈ $0 platform fee |
| Pain | echo loops, slow model loading, terminal-capture artifacts, MCP/tmux overengineering | Echo = VAD/monitoring bug; slow load = no model residency; **artifacts = tmux capture — FIX FOUND (L7): subscribe to OMP `text_delta`, not tmux**; overengineering = too many abstraction layers |

---

## 1. Comparison table — frameworks & platforms

| Framework / Platform | Type | Open-source | Cost model | Typical latency | Custom LLM | MCP | Desktop always-on fit | Best for |
|---|---|---|---|---|---|---|---|---|
| **Pipecat** | Framework | Yes (Apache 2.0) | Free; pay only STT/LLM/TTS | 300–600ms (documented); <800ms local M-series | ✅ any API (provider-neutral, 60+ svcs) | ✅ native | **Good** (his current) | Self-hosted MCP-integrated loops; max control |
| **LiveKit Agents** | Framework + platform | Yes (Apache 2.0) | Cloud $0.01/min/agent + components; self-host free | 200–500ms achievable | ✅ any API + 250+ via plugins | ✅ native (1-line) | Fair (overkill transport) | WebRTC multi-participant; cloud + self-host |
| **Vapi** | Platform (SaaS) | No | $0.05/min orchestration + pass-throughs | 500–800ms | ✅ any OpenAI-compatible endpoint | ❌ | **Poor** (telephony-first) | Rapid phone/web deploy; bring-your-own-models |
| **Retell AI** | Platform (SaaS) | No | $0.07/min voice + components | 400–700ms | ⚠️ limited | ❌ | **Poor** (telephony-first) | Phone-first; SOC2/HIPAA in base |
| **Bland AI** | Platform (SaaS) | No | $0.09/min all-in bundled | 600–1000ms | ⚠️ opinionated/limited | ❌ | **Poor** (telephony-first) | Bulk outbound; enterprise compliance |
| **Custom STT→LLM→TTS** (bare) | DIY | n/a | Component fees only | **150–300ms** achievable | ✅ full | ✅ manual | **Excellent** | Max control; M2 Pro capable; minimal moving parts |
| **Speech-to-speech** (Moshi/Realtime/Nova) | Model | Varied | API or local | 100–250ms (chat) | n/a (monolithic) | n/a | Fair for chat only | Ultra-low-latency companionship; **not tool-use** |

## 2. Cost table — per-minute economics

*Desktop always-on assumption: no telephony, mixed local + API models.*

| Platform | Platform fee | +STT | +LLM | +TTS | All-in / min | Notes |
|---|---|---|---|---|---|---|
| **Vapi** | $0.05 | $0.01 | $0.02–0.20 | $0.04 | **$0.13–0.31** | Orchestration fee only; multi-vendor; HIPAA +$1000/mo |
| **Retell AI** | $0.07 | incl. | $0.06 (e.g. Claude) | $0.07 (ElevenLabs) | **$0.13–0.31** | STT/numbers included; HIPAA in base |
| **Bland AI** | $0.09 | incl. | incl. | incl. | **$0.09** (all-in) | Bundled; tiered Dec 2025; least customizable |
| **LiveKit Cloud** | $0.01 | $0.003 | $0.01–0.06 | $0.005 | **$0.03–0.14** | Per concurrent agent session; self-host = $0 |
| **Pipecat self-host** | $0 | $0.003–0.02 | $0.01–0.06 | $0.005–0.02 | **$0.02–0.10** | M2 Pro runs free; pay only model/STT/TTS APIs |
| **Custom self-host** | $0 | $0 (Whisper.cpp local) | $0 (Ollama local) | $0 (Piper local) | **≈ $0 + API top-ups** | All-local = free; DeepSeek/Claude API = usage only |

**Bottom line on cost:** For an always-on *desktop* loop, the platform fee column is the whole story. Vapi/Retell/Bland charge per *connected minute* — an always-on assistant is connected 24/7, so per-minute pricing is ruinous here ($0.13/min × 43,800 min/mo ≈ **$5,700/mo**). **Self-hosted (Pipecat or bare) is the only sane cost model for always-on.** This alone disqualifies the three hosted platforms.

## 3. Marcel's subscription → architecture fit matrix

| Subscription | Pipecat? | LiveKit? | Bare loop? | How | Cost to Marcel | Best role in a voice loop |
|---|---|---|---|---|---|---|
| **Claude Max (OAuth)** | ⚠️ via proxy | ⚠️ via proxy | ⚠️ via proxy | OAuth→API-token proxy (Max is consumer OAuth, not a raw API key); Anthropic plugin exists but expects API key | $100–200/mo (already paid) | Cloud reasoning tier; explicit-trigger only |
| **Cursor Composer 2.5 Fast** | ❌ runtime | ❌ runtime | ❌ runtime | Not an inference endpoint — it's a coding IDE | $20/mo (already paid) | **Dev-time only**: scaffolds the voice-loop code |
| **z.ai GLM-5.2 / 5.1** | ✅ | ✅ | ✅ | OpenAI-compatible endpoint | $0 (plan) | Long-context memory/docs; adversarial analysis tier |
| **Ollama Pro (3 concurrent)** | ✅ | ✅ | ✅ | `localhost:11434` (OpenAI-compat) / unix socket | $0–20/mo | **Local ultra-low-latency tier**; MoE residency home |
| **DeepSeek API (v4-flash)** | ✅ | ✅ | ✅ | OpenAI-compatible endpoint | ~$3–8/mo (light use) | Cheap-fast cloud tier; reasoning fallback |

> **Key insight:** GLM, Ollama, and DeepSeek all speak OpenAI-compatible HTTP, so they slot into *any* of the three local paths identically. The only friction is Claude Max's OAuth (consumer) vs API-key (developer) divide — that needs a proxy and is a known snag (defer to L7-ClaudeCursor's lane).

---

## 4. Deep dive — Pipecat (current framework)

**What it is:** Open-source Python framework from Daily.co. A **frame-based streaming pipeline**: audio chunks, transcription text, LLM tokens, control signals are all typed `Frame` objects flowing through `FrameProcessor` workers. ~12k GitHub stars, 130+ contributors, reached **v1.0 in April 2026**. [[pipecat-ai/pipecat](https://github.com/pipecat-ai/pipecat)]

**Architecture:**
```
[Mic/WebRTC] → [Transport] → [VAD: Silero] → [STT: Deepgram/Whisper]
                                                      ↓ (partial transcripts)
                                              [LLM: OpenAI/Anthropic/GLM]
                                                      ↓ (token stream)
                        [TTS: Cartesia/ElevenLabs/Piper] ← sentence chunks
                                                      ↓
                                              [Transport] → [Speaker]
            interruption/barge-in frames propagate upstream to cancel TTS
```

**2025-26 evolution (relevant to Marcel):**
- **Multi-agent framework** (`pipecat.workers`): every pipeline worker is a peer on a shared message bus — LLM handoff, parallel debate, sidecar code assistants, distributed over Redis/PGMQ. [[releases](https://github.com/pipecat-ai/pipecat/releases)]
- **UIWorker** (`pipecat.workers.ui`): drives a web UI over RTVI, reads accessibility snapshots, executes `scroll_to`/`click`/`set_input_value`, answers **screen-grounded questions**. This is the "see screens" capability Marcel wants, already built.
- **SmartTurn v3**: purpose-built turn-detection model analyzing audio context during silence — fixes the VAD-misses-short-utterances problem.
- **Speculative text** (Nova Sonic): transcripts arrive synced with audio, not delayed.
- **Whisker** (real-time debugger) + **Tail** (terminal dashboard).

**Pros:** provider-neutral (swap any leg = one line); Python-native; no per-minute fee; multi-agent + UI-aware built-in; self-hosted; strong MCP story; 60+ service integrations.

**Cons (the documented production pain):**
- 26+ real production issues cataloged: VAD misses short utterances ("OK"/"Yes"), 2-5s latency reports, context committed too early after multi-sentence TTS ([#4111](https://github.com/pipecat-ai/pipecat/issues/4111)), GIL prevents parallel sessions in one process, ~400MB/session memory with LiveKit, providers fail-on-init *without* emitting `ErrorFrame`, SmartTurn v3 **silently breaks** if `audio_in_sample_rate=8000`. [[Luong Hong Thuan guide](https://luonghongthuan.com/en/blog/pipecat-voice-agent-production-scalable-guide/)]
- Client/server architecture, mobile-hostile (irrelevant to Marcel but signals design center ≠ desktop). [[Thom Leigh](https://medium.com/@thom.leigh/pipecat-the-hardest-way-to-deploy-voice-and-multimodal-conversational-ai-0706ae7a21cd)]
- Fast-moving → frequent breaking changes.
- **You run all the infrastructure** — transport, audio routing, the works.

**Works with Marcel's subscriptions?** ✅ Yes — GLM/Ollama/DeepSeek via OpenAI-compat; Claude via Anthropic plugin or OAuth proxy; Whisper/Piper local. Native MCP.

**Verdict for Marcel:** Salvageable. The core frame abstraction is sound. His breakage (echo, slow load, tmux artifacts) is in the *wiring around* Pipecat, not Pipecat. But the framework abstraction tax (~15-25ms per frame hop × 6-8 hops) buys telephony transport he doesn't use.

---

## 5. Deep dive — LiveKit Agents

**What it is:** Open-source WebRTC-native framework. **v1.0 April 2025**, Python 1.5.x by April 2026. Two agent types: **VoicePipelineAgent** (STT-LLM-TTS, full control) and **MultimodalAgent** (OpenAI Realtime API, native audio-in/audio-out). [[livekit/agents](https://github.com/livekit/agents)]

**Architecture (streaming overlap — the key innovation):**
```
[Mic] → [WebRTC room] → [VAD + turn-detector model]
                               ↓ partial transcripts (while user still speaking)
                       [LLM: Claude/GPT/GLM/Ollama]
                               ↓ token stream (before full response)
                       [TTS: Cartesia/ElevenLabs/Piper]
                               ↓ audio chunks (before all tokens)
                       [WebRTC room] → [Speaker]
   all four stages run concurrently → first syllable in 200-500ms
```

**Built-in (out of the box):** turn detection (custom open-weights VAD+context model), noise cancellation, background filtering, **native MCP tool support (1 line)**, telephony (native SIP 2025, no Twilio bridge). Self-hostable fully (LiveKit server + Whisper.cpp + Ollama + Piper). LiveKit Inference = 50+ models with no API keys.

**Pros:** WebRTC transport is "a solved problem from day 1"; cleanest API per multiple reviews; MCP native; self-hostable; multi-participant rooms; fast time-to-production; native SIP.

**Cons:** Python SDK has deeper coverage than JS/TS (parity gaps); LiveKit Cloud $0.01/min/agent + component fees; **architecturally a server accepting remote WebRTC clients** — for a single-user desktop assistant you're running a TURN/SFU media server to talk to a process on the *same machine*.

**Works with Marcel's subscriptions?** ✅ Yes — identical to Pipecat (OpenAI-compat endpoints everywhere).

**Verdict for Marcel:** Wrong shape. ~80-150ms of needless media-pipeline latency for a local single-user loop, plus infra (Redis, room state) designed for 50-participant video calls. **Only reconsider if he later wants mobile remote access to the assistant.**

---

## 6. Deep dive — Hosted platforms (Vapi / Retell / Bland)

All three are **telephony-first phone-agent platforms**, not desktop always-on assistants. Covered for completeness; **all are disqualified for Marcel's use case** by the per-minute-cost argument alone (see §2).

**Vapi** — $0.05/min orchestration fee; all-in ~$0.13-0.31/min once STT/LLM/TTS/telephony pass-throughs stack. **Full custom-LLM support** via any OpenAI-compatible endpoint (OpenRouter/own server). Max flexibility, multi-vendor complexity. HIPAA = +$1000/mo. [[Vapi FAQ](https://docs.vapi.ai/faq)] [[Cloudtalk pricing](https://www.cloudtalk.io/blog/vapi-ai-pricing/)]

**Retell AI** — $0.07/min voice, $0.002/msg chat; STT/numbers/branded calls included; all-in ~$0.13-0.31/min. SOC2/HIPAA-ready in base (not gated). Simpler than Vapi, less custom-LLM flexible. [[Retell pricing](https://www.retellai.com/pricing)]

**Bland AI** — $0.09/min **all-in bundled** (LLM+STT+TTS+telephony in one number, tiered Dec 2025). Most opinionated; custom-LLM limited. SOC2/HIPAA/PCI/GDPR; self-hosted/on-prem options. [[Bland pricing](https://www.bland.ai/pricing)]

**Custom LLM backend support:** Vapi = ✅ full (OpenAI-compat); Retell = ⚠️ limited; Bland = ⚠️ opinionated. None support MCP natively. None fit a 24/7 desktop loop.

---

## 7. Deep dive — Custom STT→LLM→TTS architectures

**The two patterns:**
- **Cascading (sequential):** STT 500ms → LLM 1s → TTS 400ms = **1.9s**. Simple, sluggish.
- **Streaming (concurrent):** STT emits partials *while user speaks* → LLM starts on enough context → TTS synthesizes each token chunk as it arrives. **First word in ~300ms** while the rest generates. This is the **production default for voice agents in 2025-26**. [[rtcleague](https://rtcleague.com/blogs/pipeline-vs-realtime-voice-agent-architecture)] [[AssemblyAI](https://www.assemblyai.com/blog/voice-agent-architecture)]

**The 300ms rule:** <300ms feels human, 300-600ms acceptable, >600ms bad, >1.5s users hang up. [[Forasoft](https://www.forasoft.com/blog/article/livekit-ai-agents-guide)]

**Where latency ACTUALLY hides** (counterintuitive): not in STT/TTS — in **turn-taking decisions + LLM time-to-first-token**. Traced real example: 280ms STT, **600ms waiting for LLM to start**, 320ms first audio, 200ms transport. [[Chanl](https://www.channel.tel/blog/voice-ai-pipeline-stt-tts-latency-budget)] [[Retell](https://www.retellai.com/blog/how-real-time-voice-ai-works-stt-llm-tts)]

**Latency budget (Dec 2025 components):** Deepgram STT 150ms, ElevenLabs TTS 75ms — yet most agents take 800ms-2s from **stack compounding**. [[Introl](https://introl.com/blog/voice-ai-infrastructure-real-time-speech-agents-asr-tts-guide-2025)]

**Frame-based streaming** (Pipecat's model): audio = 20ms PCM frames, text = transcription frames, tokens = LLM frames. Enables async processing, backpressure handling, clear dataflow.

**Optimizations that matter:**
- **PredGen** — speculative generation while the user is still speaking. [[arXiv 2506.15556](https://arxiv.org/html/2506.15556)]
- **4-bit quantization** — 95%+ performance, ~60× compute cut. [[arXiv 2508.04721](https://arxiv.org/html/2508.04721v1)]
- **Sentence-sized LLM→TTS chunks** so audio plays while model still generates.
- **Pre-warm WebSockets**; edge routing; **fast models for the hot path** (Claude Haiku).
- **Colocate components** (same machine/datacenter) → inter-service <10ms vs 30-70ms per regional hop.

**For Marcel specifically:** a fully-local stack (Whisper.cpp STT + Ollama LLM + Piper TTS) on M2 Pro hits **<800ms voice-to-voice with strong models**, all-local = ~$0 marginal cost. [[kwindla/macos-local-voice-agents](https://github.com/kwindla/macos-local-voice-agents)]

---

## 8. Deep dive — MoE / multi-model routing

**The pattern:** a **router** sends each turn to the right model — fast "smart" model for low-latancy chat, deep "thinking" model for reasoning. GPT-5's architecture is the canonical example (fast channel + thinking channel + learning router). [[SmythOS GPT-5](https://smythos.com/developers/ai-models/gpt-5-did-openai-rebuild-intelligence-with-routing-and-reasoning/)]

**Task-based routing:** summarization / code-gen / extraction each → the most appropriate model; routing a single model to everything inflates cost or underwhelms. [[TrueFoundry](https://www.truefoundry.com/blog/multi-model-routing)]

**MoE at the model level:** Mellum2 (12B, 2.5B active, 8/64 experts — Instruct=fast, Thinking=reasoning), Gemma4 26B A4B (4B active), GPT-OSS 120B/20B (top-4 of 128), Qwen3 (top-8 of 128). [[MarkTechPost Mellum2](https://www.marktechpost.com/2026/06/02/jetbrains-releases-mellum2-a-12b-moe-model-for-fast-specialized-tasks-in-multi-model-ai-pipelines/)]

**Edge reasoning pattern (highly relevant to M2 Pro):** LoRA-tuned base LLM + a lightweight **Switcher classifier** that routes to fast model OR reasoning adapters based on complexity. [[arXiv 2603.16867](https://arxiv.org/pdf/2603.16867)]

**The catch for voice (Opus's adversarial point):** every routing decision is a **serial latency tax** — a classifier takes 50-200ms before the real LLM call. If the router needs its own LLM call, that's worse. **Pragmatic move for always-on desktop:** one default model + **explicit spoken override** ("hey, use Claude for this") = zero latency on the default path. A 20-line intent classifier (regex + keyword + length) beats a learned router for the first iteration.

**Marcel's roster IS a MoE** — the right mapping (Sonnet synthesis, adapted to his actual subscriptions):

| Turn type | Model (Marcel's roster) | Why |
|---|---|---|
| Quick chat / acknowledgement | **Ollama local** (e.g. small fast model, resident) | 90-150ms first-token; handles ~80% of turns; $0 |
| Tool-use / OS control | **DeepSeek v4-flash** (cheap-fast cloud) | Native function-calling JSON; OpenAI-compat; ~$3-8/mo |
| Hard reasoning / long-context | **GLM-5.2** (free, 1M ctx) or **Claude Sonnet** via proxy | Depth; explicit trigger ("think hard about…") |
| Adversarial / different perspective | **GLM-5.2** | Different training lineage; free |

---

## 9. Speech-to-speech models — why they're the wrong default (but worth knowing)

| Model | Latency | Open-source | Architecture |
|---|---|---|---|
| **Moshi** (Kyutai) | ~160ms theor. / 200ms practical | ✅ | Full-duplex S2S, unifies ASR+LLM+TTS, 7B Temporal Transformer + Mimi codec; listens+speaks simultaneously |
| **OpenAI Realtime API** | ~500ms TTFB; reality 2.2-5.6s end-to-end | ❌ | Single model processes/generates audio directly |
| **Gemini Live** (2.5 Flash) | not disclosed | ❌ | Bidirectional streaming, built-in audio, affective dialogue |
| **Nova Sonic / Nova 2** | not disclosed (TTFA metric) | ❌ | Unified S2S; Pipecat delivers its transcripts via speculative text |

**Why wrong for Marcel's Jarvis:** S2S models are end-to-end neural — **no intermediate representation where you inject a `tool_use` frame**. No model switching (his MoE roster becomes irrelevant). Worse reasoning depth (traded for voice-native latency). Subscription reuse impossible (Gemini Realtime ≠ Gemini Pro API). They're right for *companionship chatbots*, wrong for *computer-control agents*. [[papercodex Moshi](https://www.papercodex.com/moshi-a-real-time-full-duplex-speech-to-speech-foundation-model-for-natural-human-like-dialogue/)] [[OpenAI Realtime](https://openai.com/index/introducing-gpt-realtime/)]

---

## 10. The three viable paths for Marcel (Sonnet synthesis)

### Path A — Pipecat refactor: *salvageable but heavy*
Pain (echo loops, terminal-capture artifacts) stems from **how Pipecat is wired to tmux/OMP**, not Pipecat. Refactor = drop tmux capture entirely, route tool calls through a typed `ToolFrame` dispatcher, use VAD (not silence thresholds) to kill echo. **Keep if** you want WebSocket streaming to multiple frontends; **drop if** single-machine only.
```
[Mic] → [VAD] → [STT: Whisper.cpp] → [LLM: MoE-router]
                                         ↓
                             [Tool dispatcher] → [OS actions]
                                         ↓
                             [TTS: Piper] → [Speakers]
```

### Path B — LiveKit switch: *wrong shape*
Built for multi-participant real-time rooms. On a desktop, alone, you pay ~40-80ms SFU routing overhead for zero benefit. **Only consider if you later want mobile remote access.**
```
[Mic] → [LiveKit SFU] → [Agent worker] → [LiveKit SFU] → [Speakers]
              ↕                    ↕
        needless hop       needless serialization
```

### Path C — Custom thin glue: ***best fit***
~300-400 lines of Python. One async loop, three `asyncio.Queue`s (audio_in, llm, audio_out), direct OpenAI-compatible HTTP calls, Whisper.cpp bindings, Piper TTS. No framework fighting you. Fix failure modes **by deletion, not configuration**. Tool-use = a function registry the LLM emits JSON against. Model switching = one `model=` kwarg.
```
[Mic: sounddevice]
    → [VAD: silero] → [STT: whisper.cpp tiny.en]
                          ↓
                [Router: intent → model]   (20-line classifier / spoken override)
                          ↓
        ┌─────────────────┼─────────────────┐
        ↓                 ↓                 ↓
   [Ollama local]   [DeepSeek v4-flash]   [GLM-5.2 / Claude]
    fast chat        tool calls           hard reasoning
        └─────────────────┼─────────────────┘
                          ↓
                [TTS: Piper en_US]
                          ↓
                    [Speakers]
```

> **⚠️ Runtime constraint (cross-lane, from L7-ClaudeCursor — `07-claude-cursor-brain.md`):** The brain choice determines the orchestrator's runtime. If the brain is **OMP / Claude Code** — the clean text-extraction path that *fixes* Marcel's terminal-capture artifacts (`createAgentSession()` + `session.subscribe(text_delta)` returns pristine UTF-8 spoken text, zero TUI chrome; the tmux-capture failure was reaching *around* the harness, the fix is reaching *into* it; this is **not** headless Claude, it's the in-process session the TUI renders from) — then the orchestrator **must be a Bun/Node process**: OMP is in-process-only with no HTTP router, so the voice loop embeds OMP directly. If the brain is **pure OpenAI-compat API models** (GLM / DeepSeek / Ollama), the orchestrator can be Python *or* Bun/Node (the "asyncio + sounddevice" sketch above). The cleanest single-runtime answer is **Bun/Node end-to-end** — it embeds the OMP brain *and* speaks HTTP to GLM/DeepSeek/Ollama, avoiding an IPC bridge between a Python voice loop and a Node brain. This **refines, not overturns, Path C**: keep the thin-glue shape (~300-400 lines, three queues, delete the framework), just pick the runtime to match the brain. File-drop hooks: `turn_end` / `agent_end`; MCP config in `.omp/mcp.json` / `~/.omp/agent/mcp.json`; TTSR gives mid-stream self-correction.

### TOP RECOMMENDATION: **Path C**

His constraints form a specific shape that makes the framework abstraction a net cost: desktop (not telephony) → no transport abstraction needed; tool-using computer-controller → tight function-call loops, not frame pipelines; MoE roster → trivial `model=` switching, not pipeline reconfiguration; cost-sensitive → every framework layer is compute paid twice. Path C targets **~120ms p50 total latency** vs ~280-350ms in the current Pipecat setup, by deleting frame serialization, the transport layer, and the MCP intermediary.

---

## 11. Adversarial review (Opus, heaviest reasoning)

> Convergent and sharpening: Opus independently arrives at "bare asyncio + sounddevice" and adds four cautions the Sonnet pass soft-pedaled.

**1. The case against Pipecat (it's not Pipecat that's broken).** Pipecat's frame abstraction is sound. When people say "Pipecat is broken" they almost always mean *their integration code around it*. The brutal question: if you couldn't debug a Pipecat `DailyTransport` failure, why believe you'll debug a LiveKit `RoomAgent` failure faster? Refactoring to **replace `DailyTransport` with a local `sounddevice` transport inside Pipecat's existing frame pipeline** is a middle path worth one weekend before a full rebuild.

**2. The case against LiveKit (you're building a phone call to yourself).** LiveKit Agents is a server accepting WebRTC connections from remote clients — for a desktop assistant that means encoding Opus, packetizing RTP, negotiating ICE candidates *to talk to a process on the same machine*. On M2 Pro you read raw PCM from Core Audio in <5ms. You'd spend days configuring infrastructure for problems you don't have.

**3. The hidden option nobody lists.** **Bare `asyncio` + `sounddevice` + a ~150-line state machine.** Three coroutines — `listen()` (mic→VAD→STT buffer), `think()` (transcript→LLM streaming), `speak()` (tokens→TTS→speaker) — wired by two `asyncio.Queue`s. Barge-in = set an `asyncio.Event`, cancel `speak()`, drain buffer. **The actual complexity of a voice assistant is NOT the plumbing — it's model integration, prompt engineering, tool use.** Frameworks sell plumbing solutions to a plumbing problem you may not have.
- **Vocode is effectively dead** (unmaintained since mid-2024). **TEN Framework** (Agora) is interesting but tightly coupled to Agora's cloud transport — same WebRTC-overkill problem.

**4. Where the multi-model router kills you.** Every routing decision is a serial latency tax (50-200ms before the real call). In practice, router error rate (wrong-model dispatch) causes more frustration than the savings justify. **Pragmatic move: one default model + explicit spoken override** ("hey, use Claude for this"). Zero latency on the default path.

**5. Contrarian minimum viable assistant.** `whisper.cpp` (local, M2-accelerated) → single LLM API → Kokoro/Piper TTS (local). A `sounddevice` callback writes to a ring buffer; Silero VAD triggers `whisper.cpp` (~300ms for 5s audio on M2 Pro); transcript → one API; TTS streams back locally. **~800ms first-token-of-speech latency. One Python file. Runs for months because there's almost nothing to crash.**

---

## 12. The 3 latency killers & fixes (M2 Pro-specific)

| Killer | Cost | Fix |
|---|---|---|
| **VAD misfiring** (Marcel's echo loops) | +150-400ms per false start, cascading | Silero VAD + 300ms hangover; **hardware loopback monitoring** (BlackHole) so the assistant never hears itself; **delete tmux audio capture entirely** |
| **Model cold-load** (Marcel's "slow model loading") | +800-2000ms first turn per model | **Keep models resident** in Ollama (`OLLAMA_KEEP_ALIVE=-1`); 3 concurrent on Ollama Pro fits M2 Pro's 16GB unified for small models; cold load once per session |
| **STT choice** | Whisper-small = 400ms+; tiny.en = ~90ms | `whisper.cpp tiny.en` for commands; route a second medium pass only when the intent classifier fails |

Bonus: Piper TTS is ~40ms on Apple Silicon — don't overthink TTS.

### Design primitive — one `interrupt_audio()` for three edge cases (from L7-ClaudeCursor, OMP internals)
Barge-in (VAD), TTSR self-correction (`ttsr_triggered`), and tool-cancel should all call **one `interrupt_audio()` primitive** that (a) flushes the TTS audio queue, (b) signals the orchestrator. This collapses three edge cases into one path. Critically: TTSR **cannot un-speak** sentences already played — it aborts the in-flight stream (`session.abort()`) and regenerates, but flushed TTS is gone. So flushing the queue on `ttsr_triggered` is mandatory, identical to barge-in; speak nothing until the regenerated `text_delta` resumes.

**Tool-call dead-air** (the gap during function execution): prefer **model-narrated bridging** — the brain emits `text_delta` ("let me check that…") *then* the `tool_call`, flowing through the same pipe as part of the reply (driven by system-prompt guidance, not a bolt-on). If injecting filler instead: pre-cache a small clip set (zero TTS latency), trigger on the `toolcall_start` event, and **gate on predicted tool latency** — only fire for >400ms tools (screenshot-via-MCP, network fetch, bash); filler on a 50ms `read`/`glob` sounds broken.

---

## 13. Bonus — always-on / wake-word layer (for the 24/7 part)

An always-on assistant needs a **wake-word gatekeeper** so it isn't streaming every sound to the cloud. Local options:

- **openWakeWord** (dscripka) — open-source, Google audio-embedding model + Piper-generated training, 20+ languages, works with Home Assistant/Rhasspy/OpenVoiceOS/custom. Train a custom "Jarvis" wake word with no ML expertise. [[openwakeword.com](https://openwakeword.com/)]
- **microWakeWord** — lighter (Google Inception), ESP32-class for dedicated hardware (overkill for desktop).
- **Local 2026 stack:** Whisper (STT) + Piper (TTS) + Ollama (LLM) via Wyoming protocol — each at 8.9% of Home Assistant installs. [[DEV.to guide](https://dev.to/kunal_d6a8fea2309e1571ee7/local-ai-voice-assistant-stack-2026-whisper-piper-ollama-wired-together-572l)]
- **Pipecat + openWakeWord** is a proven local combo; `kwindla/macos-local-voice-agents` shows <800ms on M-series Macs.

> On a desktop the sub-1mW always-on power constraint vanishes — openWakeWord runs trivially as a background process gating the STT→LLM→TTS loop.

---

## 14. Cross-lane coordination notes

- **L7-ClaudeCursor** ✅ deliverable landed (`07-claude-cursor-brain.md`). Load-bearing finding for this architecture: the clean voice-brain text extractor is the **OMP SDK** — `createAgentSession()` + `session.subscribe(text_delta)` gives pristine UTF-8 spoken text with zero TUI chrome. The tmux-capture failure was reaching *around* the harness; the fix is reaching *into* it (NOT headless Claude — it's the in-process session the TUI renders from). File-drop hooks: `turn_end` / `agent_end`. MCP config in `.omp/mcp.json` / `~/.omp/agent/mcp.json`. TTSR gives mid-stream self-correction. **OMP is in-process-only (no HTTP router) → the voice orchestrator must be a Bun/Node process embedding OMP.** This is the single biggest runtime constraint on Path C above.
- **L6-DeepSeek** owns DeepSeek API specifics (endpoint shape, TTFT vs Claude). My finding: DeepSeek is OpenAI-compatible → plugs into Pipecat / LiveKit / bare-loop identically (HTTP, runtime-agnostic).
- **L7-ClaudeCursor follow-up** — resolved both open Qs (see §12 design primitive): (1) tool-call dead-air → prefer model-narrated bridging (`text_delta` *then* `tool_call`); injected filler must be pre-cached, `toolcall_start`-triggered, latency-gated (>400ms only). (2) TTSR cannot un-speak already-played audio → flush TTS queue on `ttsr_triggered` like barge-in. **Unifying insight: barge-in / TTSR-trigger / tool-cancel all route through one `interrupt_audio()` primitive.** On the Bun/Node-end-to-end rec: **affirmed** as the right default — it sidesteps the cross-process cancel-latency path entirely (no Node↔Python abort round-trip); LiveKit Agents has a Node SDK so end-to-end-Node is viable for transport too. Add Python only if a specific transport feature demands it.

---

## 15. Sources

**Pipecat:** [pipecat-ai/pipecat](https://github.com/pipecat-ai/pipecat) · [Pipecat docs](https://docs.pipecat.ai/overview/introduction) · [Production issues guide (Luong Hong Thuan)](https://luonghongthuan.com/en/blog/pipecat-voice-agent-production-scalable-guide/) · [#4111 context-committed-early](https://github.com/pipecat-ai/pipecat/issues/4111) · [#984 VAD short utterances](https://github.com/pipecat-ai/pipecat/issues/984) · [Thom Leigh "hardest way"](https://medium.com/@thom.leigh/pipecat-the-hardest-way-to-deploy-voice-and-multimodal-conversational-ai-0706ae7a21cd) · [FutureAGI observability](https://futureagi.com/blog/voice-ai-observability-pipecat-2026/) · [Modal 1s latency](https://modal.com/blog/low-latency-voice-bot)

**LiveKit:** [livekit/agents](https://github.com/livekit/agents) · [LiveKit docs](https://docs.livekit.io/agents/) · [Forasoft 2026 playbook](https://www.forasoft.com/blog/article/livekit-ai-agents-guide) · [CelloIP self-hosted](https://celloip.com/blog/livekit-voice-agents-guide/) · [AssemblyAI + LiveKit](https://www.assemblyai.com/blog/build-and-deploy-real-time-ai-voice-agents-using-livekit-and-assemblyai)

**Hosted platforms:** [Vapi FAQ](https://docs.vapi.ai/faq) · [Vapi custom LLM](https://docs.vapi.ai/customization/custom-llm/fine-tuned-openai-models) · [Cloudtalk Vapi pricing](https://www.cloudtalk.io/blog/vapi-ai-pricing/) · [Retell pricing](https://www.retellai.com/pricing) · [Bland pricing](https://www.bland.ai/pricing) · [Whitespacesolutions compliance comparison](https://www.whitespacesolutions.ai/content/bland-ai-vs-vapi-vs-retell-comparison) · [Famulor Retell vs Vapi](https://www.famulor.io/blog/retell-ai-vs-vapi-2026-which-platform-is-actually-better)

**Custom architectures:** [Pipeline vs Realtime (rtcleague)](https://rtcleague.com/blogs/pipeline-vs-realtime-voice-agent-architecture) · [AssemblyAI voice-agent architecture](https://www.assemblyai.com/blog/voice-agent-architecture) · [LiveKit STT-LLM-TTS explained](https://livekit.com/blog/voice-agent-architecture-stt-llm-tts-pipelines-explained) · [Chanl 300ms budget](https://www.channel.tel/blog/voice-ai-pipeline-stt-tts-latency-budget) · [Introl infrastructure](https://introl.com/blog/voice-ai-infrastructure-real-time-speech-agents-asr-tts-guide-2025) · [Retell how it works](https://www.retellai.com/blog/how-real-time-voice-ai-works-stt-llm-tts) · [PredGen arXiv](https://arxiv.org/html/2506.15556) · [Quantized LLM voice arXiv](https://arxiv.org/html/2508.04721v1)

**Speech-to-speech:** [Moshi papercodex](https://www.papercodex.com/moshi-a-real-time-full-duplex-speech-to-speech-foundation-model-for-natural-human-like-dialogue/) · [OpenAI Realtime](https://openai.com/index/introducing-gpt-realtime/) · [Smallest.ai Realtime breakdown](https://smallest.ai/blog/openai-real-time-api-complete-breakdown) · [Nova 2 Sonic](https://aws.amazon.com/blogs/aws/introducing-amazon-nova-2-sonic-next-generation-speech-to-speech-model-for-conversational-ai/)

**MoE / routing:** [SmythOS GPT-5 router](https://smythos.com/developers/ai-models/gpt-5-did-openai-rebuild-intelligence-with-routing-and-reasoning/) · [TrueFoundry multi-model routing](https://www.truefoundry.com/blog/multi-model-routing) · [MarkTechPost Mellum2](https://www.marktechpost.com/2026/06/02/jetbrains-releases-mellum2-a-12b-moe-model-for-fast-specialized-tasks-in-multi-model-ai-pipelines/) · [Friendli MoE comparison](https://friendli.ai/blog/moe-models-comparison) · [Edge reasoning arXiv](https://arxiv.org/pdf/2603.16867)

**Always-on / wake-word:** [openwakeword.com](https://openwakeword.com/) · [HA wake words](https://www.home-assistant.io/voice_control/about_wake_word/) · [DEV.to local stack 2026](https://dev.to/kunal_d6a8fea2309e1571ee7/local-ai-voice-assistant-stack-2026-whisper-piper-ollama-wired-together-572l) · [kwindla/macos-local-voice-agents](https://github.com/kwindla/macos-local-voice-agents)

---

## Method note (MoE synthesis)

Per Marcel's directive, this report used a deliberate mixture-of-experts at the orchestration layer:
- **Broad web research** — this lane (L1) gathered raw facts via web search across 5 areas.
- **Haiku (`smol`)** — generated the three comparison/cost/subscription tables (fast tabular work).
- **Sonnet (`default`)** — architecture analysis + the three-paths recommendation (deep synthesis).
- **Opus (`slow`)** — adversarial review + contrarian minimum (heaviest reasoning, independent convergence check).
- *(GLM-5.2 was targeted for the adversarial pass but `completion()` is restricted to Anthropic tiers; Opus substituted. GLM-5.2 remains Marcel's recommended adversarial model in his roster and should run the next review pass.)*

Notable: Sonnet and Opus **independently converged** on the same contrarian verdict (delete the framework, write ~300-400 lines of bare asyncio glue), which materially raises confidence in Path C as the recommendation.
