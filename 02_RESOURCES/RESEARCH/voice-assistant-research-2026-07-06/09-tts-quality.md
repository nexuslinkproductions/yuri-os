# TTS Quality + Latency — Engine Decision for the Voice Assistant Rebuild

**Date:** 2026-07-07 · **Author:** L9-TTSQuality (research lane) · **Status:** Primary-source-corroborated; one local-benchmark gap flagged
**Audience:** Marcel (decision) · Architecture/build lanes (TTS-layer spec)
**Adjudicates:** Which TTS engine gives Yuri a *natural, consistent, low-latency* voice on an M2 Pro / 16GB / always-on setup, without bleeding money.

**One-line verdict:** Keep **Kokoro-82M as the local default** (it is not your bottleneck — your audio I/O plumbing is), adopt **Chatterbox (MIT) for the consistent "Yuri" voice identity** once you verify its M2 Pro CPU speed, and hold **Cartesia Sonic** as a $0.03/min cloud fallback for the rare premium/emotional utterance. **ElevenLabs is a trap for always-on use** — it is the best voice on the market and the most expensive per minute at your volume. Do not change TTS engines until the echo-feedback and model-loading problems are fixed at the pipeline layer; a new TTS will not fix either.

---

## 0. The frame Marcel needs before reading anything below

Three of your stated pains — **echo feedback loops, slow model loading, terminal-capture artifacts** — are *not* TTS-engine problems. They are pipeline problems (audio routing/AEC, cold-start orchestration, and capture plumbing respectively). The single most important finding in this report is negative: **no TTS engine on the market fixes echo.** Echo is solved by (a) headphone grounding (you have XM5s over Bluetooth — see the Bluetooth-audio lane), (b) echo cancellation / AEC in the capture path, or (c) half-duplex gating. If you swap Kokoro for Cartesia and the echo is still there, you will have spent money to keep the same bug. Fix the audio path first; the TTS rec below assumes a clean audio path.

With that frame: the TTS layer has three real levers — **latency (TTFA), naturalness/consistency, and cost.** The 2026 market has collapsed latency at the top (sub-100ms TTFA is table stakes for cloud), so the real fight is naturalness-vs-cost, and for an *always-on* assistant cost dominates in a way that surprises people.

---

## 1. Decision Matrix

| Engine | Type | TTFA (measured) | Naturalness | Voice identity / clone | Cost @ ~1.35M chars/mo¹ | License | Role |
|---|---|---|---|---|---|---|---|
| **Kokoro-82M** | Local | ~75ms inf; **250–290ms end-to-end** (CPU, M2 Pro CoreML ~12–79× RTF) | 4.5 MOS, clean/neutral, slightly monotone | 54 fixed presets, **no cloning** | **$0** | Apache 2.0 | **DEFAULT spine — $0, fast, clean** |
| **Kokoro-Conversational** (fine-tune) | Local | same architecture, +chunker overhead | higher expressiveness than base Kokoro | fixed voices | $0 | Apache 2.0 | **Monotone fix for the default** |
| **MOSS-TTS-Nano-100M** | Local (CPU-first) | CPU-only by design, no GPU needed | multilingual, stereo 48kHz | **zero-shot clone from short ref** | $0 | (check repo) | Clone-capable CPU fallback (20 langs) |
| **Chatterbox / Turbo** (Resemble AI) | Local | **~75ms (GPU); M2 Pro CPU = UNVERIFIED** | **beat ElevenLabs blind (63.75%)** | **zero-shot clone from 5s + emotion control + paralinguistics** | $0 | **MIT** | **"Yuri" voice identity — the clone pick IF CPU-fast enough** |
| **F5-TTS** | Local | ~6× RTF on M5 Pro CPU (no Metal) | ~4.1 MOS, English/Chinese | zero-shot clone from 3s | $0 | **CC-BY-NC (non-commercial)** | Clone quality good, **license blocks commercial** |
| **XTTS v2** (Coqui) | Local | ~8× RTF on M5 Pro CPU, **2s first-audio** | best local multilingual clone (17 langs) | clone from 6s (15–30s ideal) | $0 | **CPML (non-commercial)** | Multilingual clone — **license blocks commercial** |
| **Piper** | Local | real-time on Pi 5 CPU; ~10× RTF desktop | audibly synthetic next to Kokoro | 904 fixed voices, no clone | $0 | MIT | Lowest-resource fallback only |
| **Cartesia Sonic 4 (Turbo)** | Cloud | **~40ms TTFA (fastest commercial)** | top-tier, emotion blending | voice cloning (Pro = paid training) | **~$41/mo PAYG** ($0.03/min); free 20K credits | proprietary | **Cloud fallback — premium moments** |
| **Deepgram Aura-2** | Cloud | ~90ms optimized; P50 313ms | solid, WER 5.67% (higher halluc) | fixed enterprise voices | ~$41/mo ($0.030/1K chars) | proprietary | Enterprise/on-prem option |
| **OpenAI tts-1** | Cloud | ~0.5s; no first-class streaming | good, 6 preset voices | no cloning | ~$20/mo ($15/1M chars) | proprietary | Cheap-ish cloud, no streaming |
| **OpenAI gpt-4o-mini-tts** | Cloud | **<100ms streaming delay** | good + steerable instructions | 13 voices, no clone | ~$20/mo (~$15/1M equiv) | proprietary | Best OpenAI option — steerable tone |
| **OpenAI tts-1-hd** | Cloud | ~0.5s | higher fidelity | no cloning | ~$41/mo ($30/1M) | proprietary | Skip — Cartesia beats it at same price |
| **ElevenLabs v3 / Flash v2.5** | Cloud | 75–288ms (Flash faster) | **98.2% human-believability, #1 naturalness** | **instant clone from 10s (Starter $5)** | **~$99–299/mo at your volume** | proprietary | **Best voice, worst value for always-on** |

¹ Volume model: always-on assistant actively talking ~1h/day @ ~150 wpm ≈ **1.35M chars/month.** This is the number that kills most cloud options. See §7.

---

## 2. Kokoro-82M (current) — honest assessment

### Why it's #1 on TTS Arena and why that's real
Kokoro is a **StyleTTS 2–based, 82M-param** model. It topped the TTS Arena leaderboard at release and still scores **4.5 MOS / 17% CER** — the highest quality score of any open model in 2026 testing. On your exact hardware it is **not slow:** CoreML builds on Apple Silicon hit **12–79× realtime** (the M2 Studio synthesizes 30s of audio in **379ms**; your M2 Pro sits in that band). MLX builds exist too, PyTorch-free. Weights are **~350MB, Apache 2.0 (full commercial use).** [HF:FluidInference/kokoro-82m-coreml; HF:mattmireles/kokoro-coreml; LocalAI Master 2026]

### Known issues — and which are fixable
- **Slightly monotone / neutral tone.** *Real, but contextual.* Kokoro is "fine for informational content, not ideal for character dialogue or dramatic narration." [TextToLab 2026] For a *functional* assistant this is acceptable; for a *Jarvis-like presence* it's the thing to fix. **Fixable** via (a) voice-preset selection (some presets are livelier), (b) the **Kokoro-Conversational** fine-tune which adds a TextChunker for prosody + LLM-stream chunking [HF:asif00/Kokoro-Conversational], (c) the `speed` parameter (`speed<1.0` slower, `>1.0` faster) and SSML-style tuning.
- **Long-form artifacts at paragraph boundaries (10+ min).** *Minor and implementation-dependent* — one 45-day test saw none. Not a blocker for short conversational turns. [Reviewnexa 2026]
- **Short-utterance weakness.** Voices perform best in a "goldilocks range" of 100–200 tokens (~5–15 words); worse at extremes, especially <10–20 tokens. This **matters for a voice assistant** because confirmations ("Done.", "Right.") are exactly the short-utterance regime. **Fixable** by padding short replies or choosing a voice that handles the extremes. [HF README]
- **No voice cloning.** Fixed 54 presets only. This is the structural limitation if you want a *consistent custom* "Yuri" voice — see §5.
- **Weak non-English.** G2P is English-tuned; other languages thin. Not your problem (you want English/German).

### Tuning knobs you actually have
`speed` (0.5–2.0), voice preset (54 options, `af_heart`/`am_adam`/etc.), the Conversational fine-tune, and the sentence-streaming TextChunker. On Mac, set `PYTORCH_ENABLE_MPS_FALLBACK=1` for PyTorch builds; prefer **CoreML or MLX** builds for native Metal. [aimodels.fyi]

**Verdict on Kokoro:** your current engine is *not the problem.* It is free, fast on your hardware, commercially clean, and its one real weakness (monotone) has a documented fix path. Demoting it would be solving the wrong layer.

---

## 3. MOSS-TTS-Nano-100M (the clone-voice candidate you named)

MOSS-TTS-Nano is **100M params, CPU-first, torch-free ONNX/GGUF path, stereo 48kHz, 20 languages, and zero-shot voice cloning from a short reference clip.** It is positioned exactly opposite Kokoro: where Kokoro owns "82M Western-English fixed-voice," MOSS owns "100M CPU multilingual clone." [Clore.ai; CodeSOTA 2026]

### Clone fidelity vs Kokoro
They are not directly comparable — Kokoro *cannot clone*, so "fidelity" is Kokoro's preset quality vs MOSS's cloned quality. MOSS cloning follows the XTTS playbook: **3–10s clean reference** (no music, no reverb), match reference/target language, normalize/trim silence. At those conditions it produces a recognizable clone on CPU with no GPU. [Clore.ai] Quality is *serviceable for an assistant voice*, not ElevenLabs-grade.

### Speed comparison
Both are CPU-friendly tiny models. Kokoro wins raw RTF (RTF 0.03 on GPU = 10s audio in 0.3s). MOSS is *designed to not need a GPU at all* — it prioritizes "deploy TTS without paying for a GPU." On your M2 Pro both are well under realtime. **Net: similar speed class; MOSS adds cloning, Kokoro adds polish.**

**Verdict on MOSS-Nano:** a legitimate clone-capable local fallback, especially if you want multilingual. But for pure English clone quality + a permissive license, **Chatterbox (§5) beats it** on every axis that matters for your use case. Keep MOSS in mind only if Chatterbox proves too slow on M2 Pro CPU.

---

## 4. Cloud TTS — the cost trap

### Quality ranking (corroborated, 2026)
Independent Elo/MOS panels rotate **ElevenLabs v3, Cartesia Sonic-3.5/4, and Inworld Realtime** at the top. ElevenLabs holds **98.2% "human believability"** and the lowest WER (2.83% vs Deepgram's 5.67%). [CallMissed 2026; Gradium WER 2026] Latency at the top has collapsed: **Cartesia Sonic 4 Turbo ≈ 40ms TTFA** (fastest commercial), ElevenLabs Flash v2.5 ≈ 75ms, Deepgram Aura-2 ≈ 90ms optimized. [FutureAGI 2026] **Sub-100ms TTFA is the new baseline** for voice agents — latency is no longer the differentiator; the fight moved to emotion/prosody/multilingual/cost. [Coval 2026]

### The cost reality at always-on volume (the part that decides this)
Model ~1h/day active speech ≈ **1.35M chars/month.** Cloud monthly cost at that volume:

| Provider | Rate | Cost/mo @ 1.35M chars | Notes |
|---|---|---|---|
| OpenAI tts-1 / gpt-4o-mini-tts | $15/1M chars | **~$20** | Cheapest credible cloud; gpt-4o-mini-tts streams + steer-instruct |
| Deepgram Aura-2 | $0.030/1K chars | **~$41** | On-prem option, higher WER |
| OpenAI tts-1-hd | $30/1M chars | ~$41 | Cartesia beats it at this price |
| Cartesia Sonic (PAYG) | $50/1M chars (~$0.03/min) | **~$41 (PAYG)** or **$39 Startup annual** for 1.25M credits | Best latency; free 20K-credit tier for prototyping |
| ElevenLabs (Flash 0.5 cr/char → 675K cr) | credit-based | **~$99–299/mo** (needs Scale for volume) | Best voice, **3–4× Cartesia's cost** |
| ElevenLabs (Multilingual v2, 1 cr/char) | 1.35M credits | **~$299+** | Runaway cost for always-on |

**The decisive math:** at always-on volume, ElevenLabs costs **$1,200–3,600/year** and Kokoro costs **$0** for *comparable functional quality.* The naturalness gap (real, ~15–25% in blind tests) does not justify 4–5 orders of magnitude cost delta for an assistant that talks all day. Cloud wins only for **short, high-stakes utterances** where "wow" matters.

### Which cloud gives most-natural-for-least-cost
**Cartesia Sonic** is the Pareto winner: top-3 naturalness, **fastest TTFA (~40ms)**, ~$0.03/min, free tier for prototyping, an official **MCP server** (drop-in for Cursor/Claude/OAI clients), and WebSocket streaming of raw PCM (no transcode overhead). [GitHub:cartesia-ai/cartesia-mcp; Cartesia docs] It is the only cloud TTS worth wiring as a fallback. **OpenAI gpt-4o-mini-tts** is the budget-cloud pick if you want steerable tone ("speak warmly") at ~$20/mo. **ElevenLabs** is the quality pick — justify it only if Yuri's voice is a *brand asset*, not a utility.

**Streaming-specific latency targets (so the brain lane can do its arithmetic):** conversational feels <300ms TTFA; excellent <200ms; "waiting" >400ms. [Gradium 2026] Kokoro local end-to-end sits ~250–290ms; Cartesia ~40ms. The brain-layer TTFT + network must fit inside the remainder.

---

## 5. Voice cloning on a budget — the "consistent Yuri voice" question

You want Yuri to have *one consistent voice.* Four real options, ranked for your constraints:

### 5a. Kokoro preset lock (cheapest, no clone) — **recommended starting point**
Pick **one** of the 54 presets (e.g. `am_...` for a male Jarvis-ish timbre), lock it, tune `speed`. Zero cost, zero license risk, instant. The "consistency" is perfect (it's deterministic). The trade-off is you get Kokoro's neutral tone and *no custom identity*. **This is the right v1** — establish the pipeline with a locked preset, then upgrade to a clone only if the preset feels too generic.

### 5b. Chatterbox (Resemble AI, MIT) — **the clone pick, IF M2 Pro CPU is fast enough**
This is the find of the research. **MIT-licensed, zero-shot clone from 5s of audio, emotion-exaggeration control (first open model with it), paralinguistic tags (`[laugh]`, `[cough]`, `[chuckle]`), and it beat ElevenLabs in a blind Podonos eval (63.75% preferred).** 0.5B params; Turbo variant claims ~75ms latency / 6× RTF **on a modern GPU.** [resemble.ai/chatterbox; HF:ResembleAI/chatterbox]

**Why it fits you:** MIT means full commercial use with no royalty/cap — the only top-tier clone engine that does. Emotion control + paralinguistics are *exactly* what closes Kokoro's monotone gap and gives Yuri personality. The blind-test win says the clone quality is genuinely ElevenLabs-competitive.

**The one flag (honest):** the 75ms / 6× RTF numbers are **GPU numbers, not M2 Pro CPU.** Your M2 Pro has unified memory and a GPU, but Apple Silicon GPU acceleration for Chatterbox is **unverified** in the sources. At 0.5B params it will run on your 16GB, but real-time-factor on M2 Pro needs a **local benchmark before you commit.** If it's <1× RTF on M2 Pro CPU, it's still usable for non-streaming (pre-generate) but not as the live voice.

### 5c. ElevenLabs instant clone ($5/mo Starter) — premium, recurring cost
Instant clone from a **10-second** recording, included at the $5/mo Starter tier. Professional Voice Cloning (30+ min ref, near-indistinguishable) needs Creator ($22/mo). [elevenlabs.io/voice-cloning] Best clone quality on the market. **But** the credits (30K/mo Starter) cover ~30 min of speech — *nothing* for always-on. You'd clone in ElevenLabs then immediately hit the wall. Only viable if you clone once and use the voice sparingly.

### 5d. XTTS v2 / F5-TTS (local clone) — **license blocks commercial use**
Both are strong local cloners (XTTS = 17 langs from 6–30s ref; F5 = English/Chinese from 3s, avoids autoregressive drift). **Both are non-commercial** (CPML / CC-BY-NC). [Promptquorum 2026] Fine for personal experimentation; **do not ship in anything commercial.** Chatterbox's MIT license is the reason to prefer it here.

**Clone recommendation:** Start with a **locked Kokoro preset (5a)** for v1. For the "real Yuri" voice, benchmark **Chatterbox on your M2 Pro (5b)** — if RTF ≥ ~2× realtime on CPU, adopt it as the identity voice with emotion control. Fall back to **Kokoro** for any utterance where Chatterbox is too slow. ElevenLabs only if Yuri's voice becomes a public brand asset.

---

## 6. Streaming TTS — mandatory, not optional

Synthesizing in chunks (start speaking before the full LLM response lands) is the single biggest perceived-latency win available, and it's free. Without it, you wait for the *entire* response before the first phoneme — easily 2–4s. With sentence-level streaming, first audio plays as soon as the first chunk is ready.

### Who supports it
- **Kokoro:** yes, via sentence-level chunking. `kokoro-js` streams sentence-by-sentence by default; the Kokoro-Conversational `TextChunker` splits LLM text streams on sentence/semantic breaks and emits audio chunks before the full text processes. [ryanwelch.co.uk; HF:asif00/Kokoro-Conversational] This is what gets Kokoro from "feels slow" to conversational.
- **Cartesia:** first-class — WebSocket + SSE endpoints stream **raw PCM** (no transcode tax), purpose-built for "streaming transcripts from an LLM for latency-sensitive voice agents." [Cartesia docs] This is the gold-standard streaming TTS.
- **OpenAI gpt-4o-mini-tts:** dedicated streaming endpoint, <100ms streaming delay. [AIMLAPI] (tts-1/tts-1-hd do *not* stream first-class.)
- **ElevenLabs Flash/Turbo:** streaming-capable, 75ms+ TTFA.
- **Chatterbox Turbo:** designed for streaming voice assistants (~75ms claimed).
- **XTTS v2:** ~2s first-audio — **too slow for live streaming**, batch only.

### The pattern that matters
Stream **LLM token deltas → text chunker (sentence/semantic boundary) → TTS chunk → audio queue → playback**, with the playback starting on the *first* chunk. The chunker is the load-bearing piece — splitting on every token causes unnatural prosody; splitting only on full response kills latency. Sentence + conjunction-boundary chunking (the Kokoro-Conversational approach) is the documented sweet spot.

**Latency improvement:** full-response synthesis = 2–4s to first audio; chunked streaming = first-sentence TTFA (Kokoro ~250–290ms end-to-end, Cartesia ~40ms). That is a **~10× perceived-latency reduction** for free.

---

## 7. Recommendation — grounded in Marcel's constraints

### Constraints re-stated
M2 Pro / 16GB / HyperX mic / XM5 Bluetooth · Claude Max + Cursor + GLM plan + Ollama Pro subscriptions · cost-sensitive · wants Jarvis-like always-on presence · current pain = echo + slow loads + capture artifacts.

### The tiered TTS architecture
```
LAYER                 ENGINE                        COST         WHY
─────────────────────────────────────────────────────────────────────────────
DEFAULT (95% of speech)  Kokoro-82M (CoreML/MLX)    $0           12-79× RTF on M2 Pro, 4.5 MOS, Apache 2.0,
                                                          sentence-streams, fixes the "slow" feeling for free
VOICE IDENTITY        Chatterbox (MIT) — IF M2 Pro   $0           MIT clone from 5s + emotion control +
(premium/personality)  CPU benchmarks ≥2× RTF                   paralinguistics; beat ElevenLabs blind
CLOUD FALLBACK        Cartesia Sonic (Turbo)         ~$0.03/min  40ms TTFA, MCP server, WS PCM stream;
(rare premium moment)  free 20K credits to start                  use only when local is saturated or for "wow"
SHORT-REPLY PAD       Kokoro preset tuned for        $0           Kokoro is weak <10-20 tokens; pick a voice
                      short utterances                           that survives "Done." / "Right."
```

### What this costs you
- **Recurring: $0** for the default path. Cartesia free tier (20K credits ≈ 20K chars ≈ ~2h of speech) covers months of prototyping before you ever pay.
- **One-time:** a local benchmark of Chatterbox on the M2 Pro (~30 min of your time) to decide if it's the live voice or a pre-generate-only voice.
- **Optional premium:** if you later want Yuri's voice as a brand asset, ElevenLabs instant-clone ($5/mo) to *create* the voice, then evaluate — but don't run it always-on.

### The adversarial correction to "just use cloud TTS"
The instinct when local feels flat is to reach for ElevenLabs/Cartesia. **Resist it for the default layer.** At always-on volume, cloud is $240–3,600/yr for a naturalness gain that streaming-Kokoro + a better voice preset + Chatterbox emotion-control already captures most of. Cloud's real value is **sub-100ms TTFA for the moments that matter** — use it surgically, not as the spine. The spine is local, free, and fast enough.

### What this does NOT solve (so you don't expect it to)
- **Echo feedback** — audio-path/AEC problem, not TTS. Fix in capture/playback routing (Bluetooth lane).
- **Slow model loading** — cold-start orchestration problem, not TTS. Warm-pool Kokoro; it's 350MB.
- **Terminal-capture artifacts** — capture-plumbing problem, not TTS. Replace terminal scraping with a real IPC path.

If you change TTS before fixing those three, you will have a nicer-sounding assistant that still echoes, still loads slow, and still glitches on capture.

### Decision needed from Marcel
1. **Approve Kokoro-82M (CoreML) as the default spine** with sentence streaming — or do you want to audition presets first?
2. **Greenlight a 30-min Chatterbox M2 Pro benchmark** to decide the identity-voice layer? (I can hand the bench spec to a build lane.)
3. **Cartesia free-tier fallback** — wire it now (MCP server, $0) or defer until the local path is proven?

---

## Sources

**Kokoro-82M** — HF:hexgrad/Kokoro-82M (README) · TextToLab "Kokoro TTS Review 2026" · Reviewnexa (45-day test) · HF:FluidInference/kokoro-82m-coreml · HF:mattmireles/kokoro-coreml · HF:asif00/Kokoro-Conversational · github:gabrimatic/kokoro-mlx · aimodels.fyi · Clore.ai Kokoro guide · Soniqo voice codes · ryanwelch.co.uk (kokoro-js streaming) · localaimaster.com Kokoro setup · Trelis Research (MOS/CER)

**MOSS-TTS-Nano** — Clore.ai MOSS guide · CodeSOTA "Best TTS Models 2026" · arXiv:2603.18090 (MOSS-TTS tech report)

**Chatterbox** — resemble.ai/chatterbox · resemble.ai/chatterbox-turbo · HF:ResembleAI/chatterbox · github:resemble-ai/chatterbox · Clore.ai Chatterbox guide · localaimaster.com "Best Local TTS 2026"

**F5-TTS / XTTS** — github:SWivid/F5-TTS · HF:coqui/XTTS-v2 · docs.coqui.ai · promptquorum.com (license comparison 2026) · spheron.network (self-host clone guide) · localaimaster.com F5/Coqui guides

**Cloud TTS** — CallMissed "TTS Showdown 2026" · Coval "Best TTS Providers 2026" · Gradium latency/WER benchmarks 2026 · FutureAGI 2026 · deepgram.com Aura-2 intro + alternatives · cartesia.ai/pricing · cartesia.ai/sonic · docs.cartesia.ai · github:cartesia-ai/cartesia-mcp · texttolab.com OpenAI/ElevenLabs pricing · costgoat.com OpenAI calc · awesomeagents.ai pricing · elevenlabs.io/pricing · elevenlabs.io/voice-cloning · bigvu.tv / magichour.ai / cekura.ai (ElevenLabs 2026 pricing) · aimlapi.com (gpt-4o-mini-tts)

**Piper / comparison** — localaimaster.com Piper guide · offlinetts.com Kokoro/Piper/Kitten · inferless.com 12-model comparison · medium LiveKit+Piper (M. Asif) · thoughtasylum.com Piper on macOS

**Streaming** — forasoft.com "Streaming TTS — Kokoro/Elevenlabs/Cartesia/OpenAI" · bentoml.com open-source TTS 2026 · spheron.network deploy guide

---

*Evidence discipline: latency figures cite their measurement context (GPU vs CPU, P50 vs inference-only); the Chatterbox-on-Apple-Silicon number is explicitly flagged UNVERIFIED and must be locally benchmarked before adoption as the live voice. License claims (Apache 2.0 / MIT / CPML / CC-BY-NC) are vendor-stated and corroborated across ≥2 sources. Cost model assumes ~1.35M chars/mo from 1h/day active speech — re-scale if actual usage differs. This lane (L9) owns TTS only; echo/loading/capture pains are out of scope here and belong to the audio-routing and brain/pipeline lanes.*
