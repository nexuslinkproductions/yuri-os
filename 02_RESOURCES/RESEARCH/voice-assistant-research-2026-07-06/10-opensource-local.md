# Open-Source Voice Projects + Local Models — Research Lane 10

**Author:** L10-OpenSource lane  ·  **Date:** 2026-07-07  ·  **Scope:** OSS voice stacks, Ornith/local-model feasibility, M2 Pro 16GB limits, optimal hybrid split, community lessons.

**Hardware baseline:** M2 Pro, 16 GB unified RAM, ~200 GB/s memory bandwidth (note: faster per-token than M3 Pro's 150 GB/s — the M2 Pro is *not* a handicap, the 16 GB ceiling is).

---

## TL;DR — the five load-bearing conclusions

1. **Steal the pipeline, not the product.** The 2026 OSS consensus is a **modular pipeline glued by a socket protocol**: STT → brain → TTS, each stage a swappable service. Home Assistant's **Assist/Wyoming** and **OVOS** both use this shape. This is exactly the *simplicity* Marcel's current Pipecat+tmux+OMP+MCP pile lacks. Borrow the pattern; you do not need to install Home Assistant.
2. **Ornith 1.0 is real, but it's the wrong tool.** Released 2026-06-25 by DeepReinforce AI (9B / 31B / 35B-MoE / 397B-MoE, MIT). It's an **agentic coding** model post-trained on Gemma 4 / Qwen 3.5. As a *voice brain* it's a **NO-GO** — coding-tuned token distribution spits markdown/brackets, which is poison for spoken output. The 9B fits in 16 GB; that doesn't make it suitable.
3. **16 GB is a hard ceiling for the brain.** Realistic budget after macOS (~4.5 GB) + STT (~1–2 GB) + TTS (~0.5 GB): **~8–10 GB for the LLM**. Ceiling = **8B dense at Q4** (Llama-3.1-8B, Gemma-3-12B) or a **~3B-active MoE** (Qwen3.5-35B-A3B) that overcommits into swap. Full-local dies the moment you open a browser — weights page to SSD and 40 tok/s collapses to ~2.
4. **Local is not competitive with cloud for the *brain*.** An 8B local model can't match DeepSeek v4-flash or Claude Haiku 4.5 in tool-routing, entity tracking, or reasoning — and those cloud models already hit TTFT <600 ms. **Reasoning/thinking models (DeepSeek R1, qwen3 think-mode) are voice disasters** (one build narrated its own thoughts for 5 minutes straight).
5. **Optimal split for Marcel: local ears + local router, cloud brain, local mouth.** `local STT (whisper.cpp/SenseVoice) → local triage (Qwen3-4B via MLX) → cloud cognition (DeepSeek v4-flash primary / Claude Haiku via Max) → local TTS (Kokoro-82M MLX)`. ~9.7 GB local RAM, zero swap, sub-500 ms for the 80% of trivial commands, cloud for the 20% that needs Jarvis-grade intelligence.

> **Cross-lane handoff:** cloud-brain TTFT/streaming/tool-call specifics live with L7-ClaudeCursor (Claude/Cursor/OMP) and L6-DeepSeek. This lane owns the **local** half.

---

## 1. Open-source voice assistants — architecture patterns that work

### 1a. Home Assistant "Year of Voice" — the modular-pipeline gold standard

The most mature fully-local voice stack in 2026. Five stages wired over **Wyoming protocol** (a small socket standard from the Rhasspy project), each a separate service:

```
openWakeWord  →  STT (faster-whisper / Speech-to-Phrase)
   →  Assist intent engine  →  Ollama (optional local LLM)
   →  Piper / Kokoro TTS
```

**Why this pattern wins for Marcel:**
- **Each stage is independently swappable.** Upgrade STT next year without touching the brain. Move the LLM to a bigger box later. This is the *anti-Pipecat* property: no monolithic framework, no tmux plumbing.
- **Wyoming = thin socket glue.** Services plug together over localhost sockets. A voice loop can speak Wyoming natively without the Home Assistant orchestrator at all.
- **Two STT tiers:** *Speech-to-Phrase* (close-ended, sub-second even on a Pi 4) for command vocabularies; *Whisper* (open-ended) for free-form speech. **This two-tier idea is directly borrowable** — route "next track / mute mic" through a closed vocabulary fast path and free-form speech through Whisper.
- **Wake word on-host, not on-device.** Satellites stream audio; the host runs openWakeWord. Means any mic (HyperX) becomes a satellite without onboard wake hardware.

**The 2026 reference stack cited everywhere:** `faster-whisper + Piper + Ollama, glued by Assist`. Sub-second on modest hardware; 8.9% of all HA installs use the Whisper/Piper/Wyoming integrations — real installed base.

**Honest caveat:** Home Assistant is a *smart-home* orchestrator. Marcel wants a *desktop Jarvis*, not a HA install. **Borrow the Wyoming pipeline shape; do not adopt HA as the orchestrator.**

Sources: [developers.home-assistant.io/docs/voice/pipelines](https://developers.home-assistant.io/docs/voice/pipelines/) · [botmonster.com 2026 guide](https://botmonster.com/smart-home/build-private-local-ai-voice-assistant-2026/) · [dev.to Whisper+Piper+Ollama](https://dev.to/kunal_d6a8fea2309e1571ee7/local-ai-voice-assistant-stack-2026-whisper-piper-ollama-wired-together-572l) · [home-assistant.io/about_wake_word](https://www.home-assistant.io/voice_control/about_wake_word/)

### 1b. OVOS (Open Voice OS) — Mycroft's modular successor

Mycroft AI died in 2023 (proprietary cloud lock-in, refused community local-first patches). The community rebuilt it as **OVOS** — fully modular, plugin-based, actively developed (last `ovos-core` release 2026-06-06).

**Component split (directly relevant as an architecture reference):**
| Component | Role |
|---|---|
| `ovos-core` | Brain — handles skills, Mycroft-skill compatible |
| `ovos-listener` | Mic + wake word + STT (fully plugin-driven) |
| `ovos-audio` | Speaker + TTS (on-device / on-prem / online, your choice) |
| `ovos-phal` | Platform/Hardware Abstraction Layer |
| `ovos-gui` | UI |
| **HiveMind** | **Splits the stack across devices** — beefy server runs the brain, low-resource satellites run only listener+audio. *This is the multi-device pattern Marcel's "switch models / use the computer" goal implies.* |

**Lesson to borrow:** OVOS replaced every closed/brittle Mycroft part with a plugin seam. **The lesson for Marcel's rebuild: make every stage a plugin seam, not a hard-coded hop.** His current pain (tmux capture artifacts, brittle MCP plumbing) is the Mycroft disease — monolithic where it should be socket-glued.

OVOS also ships dedicated **Wyoming bridges**, so OVOS TTS/STT/wake plugins can serve a Home Assistant pipeline — the two ecosystems interop.

Sources: [openvoiceos.org](https://www.openvoiceos.org/) · [ovos technical manual](https://openvoiceos.github.io/ovos-technical-manual/) · [OVOS+HA dream team](https://blog.openvoiceos.org/posts/2025-09-17-ovos_ha_dream_team) · [cnx-software OVOS Foundation](https://www.cnx-software.com/2025/02/24/the-openvoiceos-foundation-aims-to-enable-open-source-privacy-and-customization-for-voice-assistants/)

### 1c. LLaMA-Omni — the low-latency end-to-end pattern

Built on Llama 3.1 8B Instruct; **speech in → text + speech out, latency as low as 226 ms.** This is the academic proof that a speech-to-speech loop can hit human-conversation speed on an 8B model. The pattern: skip the separate TTS-after-full-text step — interleave generation. Relevant if Marcel ever wants a pure-local fallback brain, though 226 ms is best-case and tool-calling isn't its strength.

### 1d. Other referenceable projects
- **Pipecat** (`pipecat-ai/pipecat`) — the framework Marcel is *currently* on. It *is* the modular-pipeline idea, but his deployment (tmux + OMP bridge + MCP servers) has buried it under plumbing. The fix is likely "simplify the Pipecat wiring," not "flee Pipecat" — but the HA/OVOS socket-glue pattern is simpler and worth mirroring.
- **Rhasspy** — the offline private voice assistant whose Wyoming protocol HA adopted. Mature, quiet.
- **llama-assistant** (`nrl-ai/llama-assistant`) — offline desktop assistant, Llama 3.2, local RAG. Good reference for a *desktop* (not smart-home) voice loop.
- **Natasha** (`shamilkeheliya/Natasha-VoiceAssistant`) — small educational project, not production-relevant. Listed because the assignment named it; **not worth borrowing.**

Sources: [venturebeat LLaMA-Omni](https://venturebeat.com/ai/llama-omni-the-open-source-ai-thats-giving-siri-and-alexa-a-run-for-their-money) · [github nrl-ai/llama-assistant](https://github.com/nrl-ai/llama-assistant) · [github rhasspy](https://github.com/rhasspy/rhasspy) · [github pipecat-ai](https://github.com/pipecat-ai/pipecat)

---

## 2. Ornith 1.0 — Marcel's specific question, answered

**Marcel asked:** "could Ornith 1.0 run locally on my M2 Pro or is it too heavy?"

**What it is:** A family of open-weight LLMs from **DeepReinforce AI**, released **2026-06-25**, MIT license, no regional restrictions. Four variants, all post-trained for **agentic coding** (the flagship innovation is "self-scaffolding RL" — the model learns its own task-planning/tool-launching scaffold during training):

| Variant | Base | Best bench | Q4 footprint (approx) | Runs on 16 GB M2 Pro? |
|---|---|---|---|---|
| 9B Dense | Qwen 3.5 | — | ~5.5 GB | ✅ Yes (fits like any 8B) |
| 31B Dense | Gemma 4 | — | ~19 GB | ❌ No (heavy swap, TTFT >1.5 s) |
| 35B MoE (~3B active) | Qwen 3.5 | Terminal-Bench 2.1 = 64.2 | ~17.5 GB weights | ⚠️ Overcommits into swap |
| 397B MoE | Qwen 3.5 | SWE-Bench Verified = 82.4 | ~250 GB | ❌ Impossible |

**Footprint math (M2 Pro, 16 GB):** Only the **9B Dense** fits comfortably. The 35B MoE *can* be coaxed to load (MoE means only ~3B params active per token → ~130 tok/s decode *if* resident), but its 17.5 GB of weights force SSD paging under any multitasking load. Reliable only as a dedicated single-purpose box.

### Verdict: **NO-GO as a voice brain** — for two independent reasons

1. **It's the wrong tool.** Ornith is post-trained on agentic-coding corpora. Coding-tuned models emit structured markdown, JSON, code fences, and bracket-nested step-by-step logic. That token distribution is **poison for spoken output** — a TTS engine reading ` ```json\n{` aloud is exactly the kind of broken-experience bug Marcel is trying to escape. A voice brain needs a model post-trained for **short, natural spoken dialogue**.
2. **Even the 9B that fits is outclassed for voice.** If you're going to spend 8B-local RAM, Llama-3.1-8B-Instruct or Qwen3-8B (chat-tuned) serve the conversational role better than Ornith-9B at the same size. Ornith only wins at *coding agents* — which is a Cursor/Composer job, not a voice-loop job.

**Where Ornith *does* belong in Marcel's world:** as a **local coding agent** (the Ollama/LM Studio/vLLM run guides exist), competing with GLM-5.2/Cursor for code work — *not* in the voice loop. If Marcel wants a local coding lane, Ornith-9B is a fine 16 GB choice. Keep it out of the ears-and-mouth path.

Sources: [ornith.site](https://ornith.site/) · [marktechpost release](https://www.marktechpost.com/2026/06/25/deepreinforce-releases-ornith-1-0-an-open-source-coding-model-family-that-learns-its-own-rl-scaffolds/) · [aitooldiscovery Ollama guide](https://www.aitooldiscovery.com/how-to/ornith-ollama) · [huggingface deepreinforce-ai/Ornith-1.0-9B](https://huggingface.co/deepreinforce-ai/Ornith-1.0-9B)

---

## 3. Local LLM feasibility on M2 Pro 16 GB — the hard numbers

### 3a. Memory budget walkthrough (the binding constraint)

```
16,384 MB total unified memory
 - 4,500 MB  macOS core + WindowServer
 - 1,000 MB  STT (whisper.cpp base / SenseVoice)
 -   500 MB  TTS (Kokoro-82M MLX)
 ──────────
 ≈10,300 MB  HARD CEILING for LLM weights + KV cache
```

Open a browser (Chrome/Safari easily eats 2–3 GB) and you're at ~15.5 GB. **macOS starts swapping.** If LLM weights page to SSD, your 200 GB/s memory bandwidth collapses to ~3 GB/s SSD speed, and generation drops from ~40 tok/s to ~2 tok/s. **Full-local voice dies under multitasking load on 16 GB.** This is the single most important hardware fact for Marcel's rebuild.

### 3b. Largest practical local models

| Model | Quant | Footprint (weights + KV@4k) | tok/s (M2 Pro, MLX) | TTFT | Voice verdict |
|---|---|---|---|---|---|
| **Llama-3.2-3B-Instruct** | Q4_K_M | ~2.5 GB | ~70–90 | ~100 ms | Fast, shallow — good *router* |
| **Qwen3-4B-Instruct** | Q4_K_M | ~3.0 GB | ~60–80 | ~100–150 ms | Best small voice brain |
| **Gemma-3-4B** | Q4 | ~3.0 GB | ~60–80 | ~150 ms | Solid alternative |
| **Llama-3.1-8B-Instruct** | Q4_K_M | ~6.3 GB | ~40 | ~100–150 ms | Best *dense* quality that fits |
| **Gemma-3-12B** | Q4_K_M | ~8 GB | ~25–30 | ~250 ms | Quality push, slower |
| **Qwen3.5-35B-A3B (MoE)** | Q4_K_M | ~17.5 GB weights (3B active) | ~130 (if resident) | ~300–400 ms | Overcommits → swap death under load |
| Llama 3.3 70B | Q4 | ~43 GB | — | — | ❌ Not feasible on 16 GB |

**Speed math (decode):** `footprint_touched_per_token / 200 GB/s`. Dense 8B Q4 touches 4.8 GB/token → ~24 ms/token → ~42 tok/s. MoE 3B-active touches ~1.5 GB/token → ~7.5 ms/token → ~130 tok/s. This is why MoE is tempting — but the *weights must be resident* to realize the speed, and 17.5 GB won't stay resident on 16 GB.

**Runtime ranking on Apple Silicon (supported small models):** MLX (~230 tok/s) > MLC-LLM (~190) > llama.cpp (~150). **Use MLX for the local path.** Ollama wraps llama.cpp (convenient, ~10–20% slower than raw MLX) — fine for the router brain, not optimal for the main brain.

Sources: [arxiv MLX/MLC-LLM/Ollama/llama.cpp comparison 2511.05502](https://arxiv.org/pdf/2511.05502) · [branch8 MLX optimization tutorial](https://branch8.com/posts/apple-silicon-mlx-llm-inference-optimization-tutorial) · [apxml best local LLM on Apple Silicon](https://apxml.com/posts/best-local-llm-apple-silicon-mac) · [modelpiper benchmarks](https://modelpiper.com/blog/local-llm-benchmarks-apple-silicon)

### 3c. Can a local model be the brain? Quality vs latency

**Latency budget for natural voice** (the target that matters):
- **<800 ms total** = feels natural/human.
- **800–1200 ms** = acceptable.
- **>1500 ms** = user notices they're talking to a machine.
- **>2000 ms** = broken.

**Breakdown:** STT 0.2–0.5 s + **LLM TTFT 0.5–1.5 s** + TTS 0.1–0.3 s. **The LLM time-to-first-token is the bottleneck** — not STT, not TTS. (Industry consensus: "usually it is not STT or TTS but turn detection and the LLM's TTFT that causes latency bottlenecks.")

**Local ceiling for <800 ms total:** LLM TTFT must be <400 ms → only the 3B–4B class qualifies on M2 Pro. Those models hallucinate tool parameters and fail complex logic. Push to 8B+ for quality and decode drops below 30 tok/s, pushing total latency past the 1.5 s "feels like a machine" line.

**Is local competitive with cloud for the brain? No.** DeepSeek v4-flash and Claude Haiku 4.5 deliver TTFT <600 ms on medium prompts *with 10× the conversational and tool-routing competence of a 4B local model*. The local 8B can't match them on tool-routing accuracy, entity tracking, or reasoning depth.

**The thinking-model trap (critical):** Reasoning/thinking models — DeepSeek R1, qwen3 think-mode, o1-class — are **voice nightmares.** A widely-cited Home Assistant build watched "a reasoning model narrate its own thoughts for five minutes" over a light command; another's qwen3 experiment "ended with the LLM narrating its own thought process for five minutes straight." For voice, **pick non-thinking, instant-response models.** DeepSeek *v4-flash* and Haiku are explicitly non-reasoning — ideal.

Sources: [famulor voice-agent latency](https://www.famulor.io/blog/ai-voice-agent-latency-how-fast-your-phone-bot-must-reply) · [promptquorum local voice 2026](https://www.promptquorum.com/power-local-llm/build-local-voice-assistant-2026) · [IBM TTFT](https://www.ibm.com/think/topics/time-to-first-token) · [arxiv ChipChat MLX](https://arxiv.org/html/2509.00078v1) · [kunalganglani LLM API latency 2026](https://www.kunalganglani.com/blog/llm-api-latency-benchmarks-2026)

---

## 4. Hybrid architecture — the optimal split for Marcel

The community verdict, confirmed by deep analysis: **don't go full-local on 16 GB, and don't go full-cloud either (privacy + latency floor + the always-on requirement).** Run a **triage / split-brain** architecture.

```
        ┌─────────────── LOCAL (M2 Pro, ~9.7 GB RAM) ───────────────┐
 mic ──▶│ STT: whisper.cpp base.en / SenseVoice      (~1.0 GB)      │
        │ Triage brain: Qwen3-4B-Instruct Q4 (MLX)   (~3.5 GB)      │
        │   ├─ trivial cmd?  → execute locally (TTFT <150 ms)        │
        │   └─ needs brain?  → fire API call ─────────┐             │
        │ TTS: Kokoro-82M MLX                          (~0.5 GB)     │◀── speech out
        └──────────────────────────────────────────────┼─────────────┘
                                                       │
        ┌─────────────── CLOUD (subscription-covered) ─▼─────────────┐
        │ Cognitive brain:                                            │
        │   Primary: DeepSeek v4-flash   (cheap, fast, non-reasoning) │
        │   Backup:  Claude Haiku 4.5     (via Claude Max OAuth)      │
        │   Heavy:   GLM-5.2              (free on plan, 1M ctx)      │
        └────────────────────────────────────────────────────────────┘
```

### Why this wins for Marcel specifically
- **~9.7 GB local RAM** → leaves 6+ GB for macOS + browser. **Zero swap, zero stutter** — the #1 thing full-local breaks on.
- **80% of interactions are trivial** ("mute mic," "next track," "what time is it," "close Spotify"). The local Qwen3-4B router answers these in <500 ms with no network hop.
- **20% need Jarvis-grade intelligence** (calendar, email parsing, screen-vision reasoning, multi-step tool use). Those go to DeepSeek v4-flash (cheapest/fastest) or Claude Haiku (already paid via Max). Network latency is hidden behind the perceived complexity of the task.
- **Fits his subscriptions exactly:** Claude Max (Haiku covered), DeepSeek (willing to top up — flash is cheap), GLM-5.2 ($0 on plan). No new spend required for the brain; local models are free.
- **Privacy floor:** raw audio + transcripts never leave the machine. Only the *routed* cognitive queries hit an API.

### Two-tier STT (borrowed from Home Assistant) — recommended
- **Closed-vocabulary fast path** (Speech-to-Phrase-class, sub-second): "next track / mute / volume up / switch model / take screenshot." Zero LLM involvement.
- **Open-vocabulary path** (whisper.cpp / SenseVoice): free-form speech → triage brain → maybe cloud.

This kills the "slow model loading" pain — the fast path is instant and always-warm; the heavy path only spins up on real speech.

Sources: [daily.co advice on building voice AI](https://www.daily.co/blog/advice-on-building-voice-ai-in-june-2025/) · [cresta real-time voice latency](https://cresta.com/blog/engineering-for-real-time-voice-agent-latency) · [promptquorum](https://www.promptquorum.com/power-local-llm/build-local-voice-assistant-2026)

---

## 5. Community solutions — what worked, what failed

### What worked (2026 consensus)
- **Stack:** `faster-whisper + Kokoro + Ollama/MLX, socket-glued`. (Piper was the old default — see below.)
- **Model class for voice:** small, fast, **non-thinking** models with tool-calling support — `qwen3:4b`, `llama3.2:3b`, `gemma3:4b`. Reasoning models explicitly avoided.
- **Orchestration via Home Assistant's Assist** is "the most practical approach rather than building from scratch" — *for smart-home*. For desktop, the Wyoming/OVOS plugin-seam pattern is the takeaway, not HA itself.
- **Two-tier intent:** native HA voice intents for device control + LLM only when reasoning is actually needed. "No universally right answer" but this combination filled the gap left by small fast models.

### What failed (the failure modes Marcel is hitting right now)
- **Thinking models.** DeepSeek R1's visible thinking delay "ruins the conversational aspect"; qwen3 think-mode → 5-minute thought narration. **Direct hit on Marcel's "slow model loading" pain** — it's likely a reasoning model streaming thoughts, not a loading delay.
- **Echo feedback loops.** When latency is high, "the user hears their own voice reflected back with a 1–2 second delay." This is *exactly* Marcel's reported echo problem. **Root cause is high latency + missing echo cancellation**, not the mic. Fix = lower TTFT (hybrid split) + proper AEC (the macOS `AVAudioEngine` voice-processing IO / `AVSpeechSynthesizer` paths, or WebRTC-style AEC) — Bluetooth XM5 headphones make this worse (see Bluetooth lane).
- **Context bloat.** 30 exposed entities already eat ~1,300 tokens; long histories confuse small models. **Keep message history to 3–5 turns.** Marcel's "switch models / see screens" goal implies large contexts — route those to the cloud brain, not the local router.
- **Prompt discipline > model size.** "Model choice alone did not make the system good; prompt design and tool routing mattered more." Each tool (weather, search, music, window-control) needs an explicit prompt section + output examples + stripping emoji/chatter from spoken answers.
- **Terminal capture artifacts.** (Marcel's pain.) The community pattern that avoids this: **never scrape the terminal.** Use structured IPC (socket/WebSocket/JSON event stream), file-drop, or hook redirection. The OMP bridge scraping tmux is the anti-pattern — L7-ClaudeCursor is investigating clean-output extraction.
- **Real-time voice is a *systems* problem, not a model problem.** "Turn detection, streaming timing, prompt discipline, interruption/cancellation, event contracts between client and server, and coordinating multiple inference systems with different latency profiles." Pipecat handles the transport/turn-detection half — the bug is the bespoke plumbing on top of it, not Pipecat itself.

### TTS: Piper is dead, Kokoro is the 2026 default
**Piper was archived 2025-10-06 (read-only on GitHub).** It still works as a HA Wyoming add-on, but for new builds the community moved on. The replacement:

**Kokoro-82M** — Apache 2.0, 82 M params, ~327 MB, 54 voices across 8 languages, 24 kHz (48 kHz via MLX upsampling).
- **Speed:** consistently <0.3 s inference across all text lengths. "Clear winner for speed."
- **Quality:** "clear quality upgrade from Piper," approaches cloud TTS quality for en-US/en-GB.
- **Apple Silicon:** dedicated MLX implementation (`gabrimatic/kokoro-mlx`) — no PyTorch/transformers dependency, on-device, no network during inference, gapless streaming over a persistent audio stream.
- **Honest limits:** no voice cloning (fixed voice set). If Marcel wants a *custom* Jarvis voice, Kokoro won't clone it — look at XTTS/F5-TTS for cloning (heavier).
- **Turn-key options:** `mlx-tts-studio` (Kokoro + Qwen3-TTS + Dia in one UI), `mlx-audio` (TTS+STT+STS library), MimikaStudio.

Sources: [dev.to Whisper+Ollama+Kokoro on Apple Silicon](https://dev.to/xadenai/building-a-local-voice-ai-stack-whisper-ollama-kokoro-tts-on-apple-silicon-eo0) · [github kokoro-mlx](https://github.com/gabrimatic/kokoro-mlx) · [github mlx-audio](https://github.com/Blaizzy/mlx-audio) · [murmurtts Kokoro Mac guide](https://www.murmurtts.com/blog/kokoro-tts-mac-guide) · [insights.marvin-42 HN llama.cpp voice stack](https://insights.marvin-42.com/articles/hacker-news-resurfaces-a-fully-local-home-assistant-voice-stack-built-around-llamacpp) · [joekarlsson local HA voice w/ GPU](https://www.joekarlsson.com/blog/local-voice-ai-home-assistant-gpu/) · [HN: best local LLM for hardware](https://news.ycombinator.com/item?id=48146369)

---

## 6. Cost map — free vs paid vs subscription-covered (Marcel-specific)

| Component | Recommendation | Cost to Marcel |
|---|---|---|
| STT (local) | whisper.cpp base.en / SenseVoice | **Free** |
| TTS (local) | Kokoro-82M MLX | **Free** |
| Wake word | openWakeWord | **Free** |
| Local router brain | Qwen3-4B-Instruct Q4 (MLX) | **Free** |
| Local coding agent (optional) | Ornith-9B / GLM-5.1 | **Free** |
| Cloud brain (primary) | DeepSeek v4-flash | **Top-up (cheap)** — flash tier |
| Cloud brain (backup) | Claude Haiku 4.5 | **Covered** — Claude Max OAuth |
| Cloud brain (heavy/1M ctx) | GLM-5.2 | **Free** — z.ai plan |
| Orchestration | Borrowed Wyoming pattern on Pipecat (simplified) | **Free** |

**Net:** the entire local half is free. The brain costs are already covered by existing subscriptions except DeepSeek flash top-ups (small, pay-per-token, cheap). No new subscriptions required.

---

## 7. Concrete recommendations for Marcel's rebuild

1. **Adopt the modular socket-pipeline shape** (Wyoming/OVOS pattern), not a monolithic framework. Every stage (STT, triage, brain, TTS) = a separate localhost service. This directly dissolves the "overcomplicated MCP/tmux plumbing" pain.
2. **Local STT:** `whisper.cpp` (base.en) for free-form + a closed-vocab fast path for command words. Two-tier.
3. **Local router brain:** `Qwen3-4B-Instruct` Q4 via **MLX** (not Ollama — MLX is faster on Apple Silicon). Non-thinking. Handles the 80% trivial commands in <500 ms.
4. **Cloud cognitive brain:** DeepSeek v4-flash primary, Claude Haiku (Max) backup, GLM-5.2 for long-context/screen-vision. **Never a thinking model in the voice path.**
5. **Local TTS:** `Kokoro-82M` MLX (`kokoro-mlx`). Do **not** start a new build on Piper (archived).
6. **Echo fix:** the echo loop is a latency + AEC problem, not a mic problem. The hybrid split lowers TTFT (kills the 1–2 s reflection delay); add macOS voice-processing IO / WebRTC AEC, especially over Bluetooth XM5s (coordinate with the Bluetooth-audio lane).
7. **No terminal scraping.** Replace OMP-tmux capture with structured IPC (socket/JSON event stream). (L7-ClaudeCursor owns the clean-output-extraction design.)
8. **Keep context short** on the local router (3–5 turns); push long-context needs to the cloud brain.
9. **Keep Ornith out of the voice loop.** It's a coding model — fine as a local coding lane alongside Cursor/GLM, poison as a voice brain.
10. **Keep MLX, not Ollama, for the latency-critical local path.** Ollama is convenient but ~10–20% slower than raw MLX on Apple Silicon.

---

## 8. Open questions / residual risk

- **MLX vs Ollama for the router:** MLX is faster but Ollama is what every community guide assumes. If Marcel wants maximum copy-paste-from-guides speed, Ollama is easier; if he wants the last 10–20% latency, MLX. Recommend MLX given the always-on latency budget.
- **Bluetooth AEC on XM5:** the echo problem is amplified over Bluetooth (codec latency + no native AEC path). Needs the Bluetooth-audio lane's findings before the hybrid split alone fully solves echo.
- **Screen-vision routing:** "see screens" implies vision input. Local vision models are heavy on 16 GB — almost certainly must route to the cloud brain (GLM-5.2 1M-ctx or Claude). Out of scope for this lane; flagged for the screen-vision lane.
- **MoE-on-16GB claim unverified locally:** Qwen3.5-35B-A3B "runs on 16 GB" per community report but deep analysis says it swap-pages under load. Treat as **not reliable for always-on**; the dense 4–8B + cloud hybrid is the safe call.

---

## Sources (consolidated)

**Open-source stacks:** [HA Assist pipelines](https://developers.home-assistant.io/docs/voice/pipelines/) · [HA wake words](https://www.home-assistant.io/voice_control/about_wake_word/) · [OVOS](https://www.openvoiceos.org/) · [OVOS tech manual](https://openvoiceos.github.io/ovos-technical-manual/) · [OVOS+HA](https://blog.openvoiceos.org/posts/2025-09-17-ovos_ha_dream_team) · [LLaMA-Omni (VentureBeat)](https://venturebeat.com/ai/llama-omni-the-open-source-ai-thats-giving-siri-and-alexa-a-run-for-their-money) · [Pipecat](https://github.com/pipecat-ai/pipecat) · [Rhasspy](https://github.com/rhasspy/rhasspy) · [nrl-ai/llama-assistant](https://github.com/nrl-ai/llama-assistant)

**Ornith:** [ornith.site](https://ornith.site/) · [MarkTechPost](https://www.marktechpost.com/2026/06/25/deepreinforce-releases-ornith-1-0-an-open-source-coding-model-family-that-learns-its-own-rl-scaffolds/) · [HF Ornith-1.0-9B](https://huggingface.co/deepreinforce-ai/Ornith-1.0-9B) · [Ollama guide](https://www.aitooldiscovery.com/how-to/ornith-ollama)

**Local LLM / MLX:** [arxiv MLX comparison](https://arxiv.org/pdf/2511.05502) · [branch8 MLX tutorial](https://branch8.com/posts/apple-silicon-mlx-llm-inference-optimization-tutorial) · [apxml](https://apxml.com/posts/best-local-llm-apple-silicon-mac) · [modelpiper](https://modelpiper.com/blog/local-llm-benchmarks-apple-silicon) · [localaimaster Apple Silicon guide](https://localaimaster.com/blog/apple-silicon-ai-buying-guide) · [ChipChat MLX (arxiv)](https://arxiv.org/html/2509.00078v1)

**Latency:** [famulor](https://www.famulor.io/blog/ai-voice-agent-latency-how-fast-your-phone-bot-must-reply) · [IBM TTFT](https://www.ibm.com/think/topics/time-to-first-token) · [cresta](https://cresta.com/blog/engineering-for-real-time-voice-agent-latency) · [kunalganglani API latency](https://www.kunalganglani.com/blog/llm-api-latency-benchmarks-2026) · [promptquorum](https://www.promptquorum.com/power-local-llm/build-local-voice-assistant-2026)

**TTS (Kokoro/Piper):** [kokoro-mlx](https://github.com/gabrimatic/kokoro-mlx) · [mlx-audio](https://github.com/Blaizzy/mlx-audio) · [murmurtts Kokoro](https://www.murmurtts.com/blog/kokoro-tts-mac-guide) · [dev.to Whisper+Ollama+Kokoro](https://dev.to/xadenai/building-a-local-voice-ai-stack-whisper-ollama-kokoro-tts-on-apple-silicon-eo0)

**Community / lessons:** [insights.marvin-42 HN llama.cpp stack](https://insights.marvin-42.com/articles/hacker-news-resurfaces-a-fully-local-home-assistant-voice-stack-built-around-llamacpp) · [joekarlsson local HA voice](https://www.joekarlsson.com/blog/local-voice-ai-home-assistant-gpu/) · [HN best local LLM for hardware](https://news.ycombinator.com/item?id=48146369) · [HN speech-to-speech setup](https://news.ycombinator.com/item?id=46731068) · [openHAB community 2026](https://community.openhab.org/t/revisiting-local-llm-powered-voice-assistants-in-2026/168251) · [botmonster 2026](https://botmonster.com/smart-home/build-private-local-ai-voice-assistant-2026/)
