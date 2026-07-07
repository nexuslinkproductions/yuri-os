# Cost-Effective Cloud & Local STT/TTS — 2026 Voice Assistant Sweep

> Lane: **L5-STTTTS** (researcher). Date: 2026-07-07. Use case: Marcel's always-on
> personal voice assistant, **~100 conversations/day** on **M2 Pro / 16GB RAM**, HyperX
> mic, Sony XM5 (Bluetooth). Brain is cloud-routed (DeepSeek V4-Flash / Claude / GLM).
> Sibling reports: **09-tts-quality.md** (L9, TTS quality depth — deferred to there for the
> quality verdict), and the brain lanes for the LLM side. This report owns the **STT
> comparison + TTS/TTS cost axis + hybrid monthly-cost scenarios + budget recommendation.**
>
> Pricing verified against vendor pages + third-party aggregators, Jan–Jul 2026. All figures
> USD. `[INFERENCE]` tags mark anything I derived rather than sourced.

---

## 0. TL;DR — what Marcel should actually do

| Role | Pick | Why | Recurring cost |
|---|---|---|---|
| **STT (routine)** | **whisper.cpp `medium` or `small`, Metal backend** | Free, RTF ~0.4 on M2 Pro, quality gap to cloud is small and STT is forgiving | **$0** |
| **STT (fallback)** | **Deepgram Nova-3 streaming** | $200 free credit (≈11.5 months at this load), sub-300ms p95, best streaming WER | $0 until credit spent |
| **TTS (routine)** | **Kokoro-82M (MLX)** — *or* MOSS-TTS-Nano if voice-clone matters | Free, Elo 1056 (#1 local, ~150pts below top cloud — the honest ceiling of "free") | **$0** |
| **TTS (quality-critical / demos)** | **Deepgram Aura-2** or **Cartesia Sonic** | Aura-2 $0.030/1K chars, ~90ms TTFB; Sonic ~$0.03/min, 40ms TTFA | pay-per-use |
| **Voice cloning ("a Yuri voice")** | **MOSS-TTS-Nano** (local, free) | Only free option that clones from a reference clip | **$0** |

**Honest monthly cost** at 100 conv/day, depending on how often you fall back to cloud:

| Local success rate | Monthly cloud cost |
|---|---|
| 100% local holds | **~$0/mo** |
| 80% local / 20% cloud | **~$23/mo** |
| 60% local / 40% cloud | **~$47/mo** |
| 0% local / 100% cloud (Aura-2) | **~$116/mo** |

**The one number to internalize:** "near-$0/month" is real **only if your brain LLM stays in the cloud.** If you ever run the brain locally (Ollama), 16GB RAM gets eaten by brain + STT + TTS models together and you'll be forced onto cloud TTS — at which point the *daily-driver* honest cost is **~$80–99/mo** (Aura-2/Sonic for all TTS). See §6 for the stress-test.

---

## 1. STT options — speech-to-text

### 1.1 Pricing matrix (per minute, 2026)

| Option | $/min | $/hour | Model | Streaming? | Free credit runway @ 2250 min/mo |
|---|---|---|---|---|---|
| **whisper.cpp local (Metal)** | **$0.00** | $0 | small/medium | streaming mode ✓ | ∞ |
| AssemblyAI Universal Stream | $0.0025 | $0.15 | Universal | ✓ WebSocket | $50 credit ≈ 8.9 mo |
| OpenAI gpt-4o-mini-transcribe | $0.003 | $0.18 | mini | batch | — |
| OpenAI Whisper / GPT-4o Transcribe | $0.006 | $0.36 | whisper-1 | batch | — |
| **Deepgram Nova-3 stream** | $0.0077 | $0.46 | Nova-3 | ✓ WebSocket | **$200 credit ≈ 11.5 mo** |
| OpenAI gpt-realtime-whisper | $0.017 | $1.02 | realtime | ✓ deltas | — |
| Deepgram + diarization add-on | +$0.0020 | +$0.12 | — | — | — |

> AssemblyAI also sells **Universal-3 Pro Streaming at $0.45/hr ($0.0075/min)** — premium-accuracy realtime. Deepgram bills **per second, no rounding**; AssemblyAI bills on **total session duration** with **no concurrent-stream cap.**

**Monthly cost at Marcel's load (2250 min/mo STT), if 100% cloud:** Deepgram $17.32 · AssemblyAI $5.63 · OpenAI mini $6.75 · OpenAI Whisper $13.50 · gpt-realtime-whisper $38.25 · **whisper.cpp local $0.00.**

### 1.2 Quality (WER — lower is better)

Headline LibriSpeech-clean numbers are compressed; the **real-world noisy** column is what decides it for a mic-in-a-room assistant.

| Model | LibriSpeech clean WER | Real-world/noisy WER | Notes |
|---|---|---|---|
| AssemblyAI Universal-2 | ~2.1% | ~7.9–8.0% | Best on noisy real-world audio |
| Whisper large-v3 | 2.8% | ~8–12% | Best *open-source*; local |
| Deepgram Nova-3 | — | ~8.2% (mixed) / **6.84% median streaming** over 2,703 production files | **Best streaming latency** (~450ms median, <300ms p95) |
| Speechmatics Ursa 3 | — | ~8.0% | Tied best on noisy |

`[INFERENCE]` Independent AA-WER benchmarks put Nova-3 around **18% on adversarial mixed datasets** — the gap between vendor WER and independent WER is the single biggest gotcha in this space. **Always A/B test against your actual HyperX-mic audio.** A clean 5% WER provider can deliver 15–20% on your room.

### 1.3 Local Whisper on M2 Pro — the real numbers

- **whisper.cpp + Metal** is the production choice on Apple Silicon: **~10× real-time on large-v3**, no Python dependency.
- **M2-specific, small model:** RTF ≈ 0.35 CPU-only → **0.08 with Metal** (30s clip: 10.5s CPU → 2.4s GPU). The Metal speedup is the whole game.
- **Large-v3 on M2:** RTF 0.45 (60s audio → 27s). **large-v3-turbo** cuts power/latency with minimal accuracy loss — the right pick for sustained/always-on.
- **Practical latency:** small/medium models land **0.5–2s behind live speech**; `tiny` gets **<0.5s** but worse WER.
- **MLX Whisper** is occasionally faster (one benchmark: 2.0× over whisper.cpp on large-v3-turbo), but it's an outlier; whisper.cpp's Metal maturity wins in production.
- **Footprint:** small ~500MB, medium ~1.5GB, large-v3 ~3GB. All fit comfortably when the brain is cloud.

**Verdict for STT:** **whisper.cpp `medium` (Metal) is the routine pick.** STT quality gap between local `medium`/`large-v3-turbo` and cloud is small, STT is forgiving (the brain corrects), and it's free. Keep **Deepgram Nova-3** wired as the streaming fallback for noisy/quality-critical moments — its $200 free credit alone covers ~11.5 months at your load.

---

## 2. TTS options — text-to-speech

### 2.1 Pricing matrix (per 1000 characters, 2026)

| Option | $/1K chars | Latency (TTFB / inference) | Streaming? | Voices / langs | Local? |
|---|---|---|---|---|---|
| **Kokoro-82M (MLX)** | **$0.00** | RTF ~0.45 CPU, **0.03 GPU**; 30s audio in 379ms (M2 Studio) | ✓ streaming decode | 54 / 8 | ✅ Apache-2.0, <1GB |
| **MOSS-TTS-Nano** | **$0.00** | CPU-first, ~2× efficiency ONNX; single core (M4 Air) | ✓ realtime streaming + **voice clone** | 20 langs | ✅ Apache-2.0, ~100M params |
| OpenAI TTS std | $0.015 | — | ✓ | few | ❌ |
| Deepgram Aura-2 | $0.030 | **~90ms TTFB** (sub-200ms baseline) | ✓ sub-200ms | 40+ EN / 7 langs | ❌ |
| OpenAI TTS-HD | $0.030 | — | ✓ | few | ❌ |
| Cartesia Sonic | ~$0.03/**min** | **40ms TTFA** | ✓ (+ MCP server) | — | ❌ |
| ElevenLabs Flash/Turbo | $0.05 | **~75ms inference** | ✓ SSE + WebSocket | many + clone | ❌ |
| ElevenLabs Multilingual v2/v3 | $0.10 | Turbo v2.5 ~250–300ms | ✓ | many | ❌ |
| OpenAI gpt-4o-mini-tts | ~$0.015/**min** | — | ✓ | — | ❌ |

> Note the two pricing units: most bill **per character**; **Cartesia Sonic and OpenAI mini-tts bill per minute of audio** — usually cheaper at Marcel's load. Aura-2 Growth tier drops to **$0.027/1K**.

**Monthly cost at Marcel's load (3.3M chars/mo TTS), if 100% cloud:** Aura-2 $99 · OpenAI std $49.50 · Cartesia Sonic ~$82.50 (`[INFERENCE]` from ~$0.03/min × 2750 min) · ElevenLabs Flash $165 · ElevenLabs Multilingual $330 · **Kokoro / MOSS local $0.00.**

### 2.2 Quality — TTS Arena Elo (May–Jun 2026)

| Rank | Model | Elo | Price tier |
|---|---|---|---|
| 1 | Gemini 3.1 Flash TTS | 1215 | cloud |
| 2 | Sonic 3.5 | 1209 | cloud |
| 3 | **ElevenLabs v3** | ~1208 | cloud ($0.10/1K) |
| 32 | **Kokoro 82M** | **1056–1059** | **$0 local** / $0.65/1M via API |

- **Kokoro is #1 among models runnable locally / in-browser**, with the **largest sample size** on the board (5,368 appearances, CI ±9 — unusually stable).
- It **beats every commercial model priced below $15/M chars** on value.
- **The honest gap:** Kokoro is ~150 Elo below ElevenLabs v3. ElevenLabs **excels at emotion** (excitement/sadness/anger); Kokoro is "a more even, neutral tone — fine for informational content, not ideal for dramatic narration." `[INFERENCE]` For an assistant you hear **100×/day**, that flatter prosody can become **fatiguing** — this is the single most likely assumption to break the "$0/month" plan (see §6).
- **Deepgram Aura-2** does not appear on the Elo leaderboard but wins the **latency + consistency-under-load** benchmarks (stays <200ms TTFB where competitors stall).

### 2.3 Local TTS on M2 Pro — the real numbers

- **Kokoro-82M (MLX, `gabrimatic/kokoro-mlx`):** no PyTorch dep. **M2 Studio: 30s audio in 379ms.** Community M-series reports **5–14× real-time.** Core ML build (`mattmireles/kokoro-coreml`) splits the pipeline across ANE+GPU+CPU. Footprint: weights <1GB, ~2–3GB at inference.
- **MOSS-TTS-Nano (OpenMOSS, April 2026):** ~100M params, **CPU-first**, ONNX build "runs smoothly on a single core on MacBook Air M4," ~2× efficiency over PyTorch. **The only free option with voice cloning** (reference-clip → custom voice), 20 languages, realtime streaming decode. `pip install moss-tts-nano`. MLX-Audio path exists.
- Both are **genuinely real-time-or-faster on your M2 Pro** with the brain in the cloud. L9's deeper TTS report (**09-tts-quality.md**) keeps Kokoro as default and adds **Chatterbox (MIT)** as a candidate for a consistent "Yuri" voice. **Chatterbox M2-Pro RTF is UNVERIFIED** — the vendor 75ms / 6×-RTF figures are GPU numbers (Resemble.ai + HF card), not Apple-Silicon-CPU measurements; at 0.5B params it fits 16GB but its real-time-factor on M2 Pro is unknown. L9 flags a **30-min local benchmark as the pre-adoption decision gate** (decision-gate #2) — do not assume real-time until it's measured locally.

**Verdict for TTS:** **Kokoro-82M (MLX) routine, Aura-2/Sonic for quality-critical, MOSS-Nano if you want a cloned voice for free.** This is also L9's verdict.

---

## 3. Streaming STT/TTS — real-time pipelines

Streaming is what separates a "voice assistant" from a "transcribe-then-speak bot." The latency budget for natural conversation is **<300ms**感知; anything over ~500ms feels laggy, and Marcel already reports "slow."

### 3.1 Who actually streams

**STT streaming (realtime, partial→final transcripts):**
- **Deepgram Nova-3** — WebSocket, ~450ms median / **<300ms p95**, best-in-class.
- **AssemblyAI Universal / Universal-3 Pro Streaming** — WebSocket, **no concurrent-stream cap**, billed on session duration.
- **OpenAI gpt-realtime-whisper** — delta streaming, but **$0.017/min (2.2× Nova-3)**.
- **whisper.cpp / MLX** — streaming mode exists (sliding-window VAD), latency 0.5–2s. Needs a **VAD** (silero/pyannote) to gate recording; otherwise it transcribes its own TTS output → **the echo loop Marcel already suffers.**

**TTS streaming (chunked synthesis, play-while-generating):**
- **Deepgram Aura-2** — sub-200ms TTFB, ~90ms optimized.
- **Cartesia Sonic** — **40ms TTFA.**
- **ElevenLabs Flash** — ~75ms inference; Turbo v2.5 ~250–300ms; both SSE + WebSocket.
- **Kokoro-82M / MOSS-Nano** — realtime streaming decode. `[INFERENCE]` chunked at clause/sentence boundaries, first-audio ≈ synthesis time for the first ~40–60 chars.

### 3.2 The key architecture decision — *don't wait for full text*

`[INFERENCE]` + L7/L9 coordination: **stream LLM text deltas into TTS at clause/sentence boundaries, never wait for the full reply.** Concretely realized via the **OMP SDK** (L7, **07-claude-cursor-brain.md**): `createAgentSession()` + `session.subscribe('text_delta')` yields clean UTF-8 spoken text with zero TUI chrome — feed those deltas straight into the TTS buffer. (This is NOT headless Claude, which Marcel's rules ban — it's the same in-process session the TUI renders from. The earlier tmux-capture artifacts were from reaching *around* the harness; the fix is reaching *into* it.) Pattern:

```
LLM text delta stream ──► buffer ──► flush at punctuation (. , ! ? ;)
                                        or ~40–60 char threshold
                                        │
                                        ▼
                          TTS chunk (streaming decode)
                                        │
                                        ▼
                  play chunk 1 while chunks 2..N generate
```

Waiting for the full text before TTS costs **1–4s of avoidable latency** on multi-sentence replies. Chunked streaming keeps perceived latency near the **TTS first-audio time** (~75–90ms cloud, ~200–400ms local). This is independent of which TTS engine — it's a pipeline discipline.

### 3.3 Cost implication of streaming

- **Streaming STT is priced identically to batch** at Deepgram/AssemblyAI (per audio-second, no premium for the realtime transport). So streaming itself is **free**; you pay for audio processed.
- **Streaming TTS is the same** — no premium for chunked transport at Aura-2/ElevenLabs.
- **The real cost lever is *how much audio you process***, not whether you stream. VAD-gating (only send speech, not silence) cuts STT minutes materially; Marcel's "100 conversations" are mostly *silence + short utterances*, so a good VAD can cut billed STT minutes **40–70%** vs. always-open mic.

---

## 4. Budget recommendation — cheapest setup that doesn't sacrifice quality

For **~100 conversations/day**, brain in the cloud, M2 Pro / 16GB:

### Recommended stack

```
Wake/VAD:  silero-vad or pyannote (local, free) ─ gates the mic, kills the echo loop
STT:       whisper.cpp medium, Metal backend (local, $0)
            └─ fallback: Deepgram Nova-3 streaming ($0.0077/min, $200 free credit)
TTS:       Kokoro-82M via MLX (local, $0, streaming chunked)
            └─ fallback: Deepgram Aura-2 ($0.030/1K) or Cartesia Sonic (~$0.03/min)
Cloning:   MOSS-TTS-Nano (local, $0) — if you want a custom "Yuri" voice
```

### Why this is the cheapest *non-sacrificing* setup

1. **STT:** local `medium`/`large-v3-turbo` is within a few WER points of cloud, STT errors are self-correcting (the brain infers intent), and it's free. Cloud STT is only worth paying for when you need **streaming with <300ms latency under load** (Deepgram) — keep it as fallback.
2. **TTS:** Kokoro is the **best free voice available** (Elo 1056, #1 local). The quality sacrifice vs. cloud is real (~150 Elo) but acceptable for routine. Aura-2/Sonic as fallback gives you a near-instant quality boost on the moments that matter.
3. **VAD is not optional.** It's the fix for both the **echo feedback loop** and **cost** — it prevents the assistant from transcribing its own TTS and cuts billed cloud minutes. Marcel's existing echo pain is a **pipeline/echo-cancellation problem, not a TTS-engine problem** (credit L9's frame).

### Cost at this load

| Scenario | Monthly cost | When it applies |
|---|---|---|
| Local holds 100% | **~$0** | brain clouded, Kokoro acceptable, good VAD |
| 20% cloud fallback | **~$23** | noisy room / quality-critical moments |
| 40% cloud fallback | **~$47** | Kokoro fatigue sets in / poor mic conditions |
| Daily-driver cloud TTS (Aura-2 all) | **~$99** | if local TTS is abandoned for voice quality |
| Daily-driver cloud TTS (ElevenLabs Flash) | **~$165** | premium-only, not recommended as default |

> **Deepgram's $200 free credit = ~11.5 months of 100%-cloud STT** at this load. That alone effectively zeroes your STT cloud cost for a year even if you never go local. **ElevenLabs' 10K free credits/month = only 0.6% of one month's TTS** — do not plan around it; it's a rounding error at 100 conv/day.

---

## 5. Hybrid local + cloud — when it makes sense

### 5.1 The decision rule

Use **local by default, cloud on signal.** Route to cloud when:

| Signal | Route to cloud | Why |
|---|---|---|
| Background noise / multiple speakers | Deepgram Nova-3 STT | Best noisy-WER + streaming latency |
| Long-form dictation / accuracy-critical | AssemblyAI Universal-2 (batch) | ~7.9% noisy WER, cheapest at $0.0025/min |
| Demos / recorded output / "make it sound great" | ElevenLabs Multilingual v3 | Elo ~1208, emotional range |
| Quick premium reply under load | Aura-2 / Cartesia Sonic | <90ms TTFB, consistent under load |
| Need a custom cloned voice | MOSS-Nano (local, free) | Only free cloning option |
| Brain goes local (RAM pressure) | all-cloud STT+TTS | frees RAM for the brain |

### 5.2 Where hybrid genuinely pays off

- **STT hybrid is nearly always worth it.** Local STT quality is "good enough," cloud is cheap fallback, and the $200 Deepgram credit is essentially free STT for a year. **Recommend: local default, Deepgram fallback.**
- **TTS hybrid is the real cost lever.** Cloud TTS at 100 conv/day is **$50–330/mo** depending on engine — this is where "near $0" lives or dies. **Recommend: Kokoro default, Aura-2/Sonic for quality moments, ElevenLabs for one-off premium output.** If Kokoro's flatter voice fatigues you, promote Aura-2 to daily driver (~$99/mo) — still half of ElevenLabs Flash.

### 5.3 Where hybrid does NOT make sense

- **Don't hybrid if you can't tolerate any latency variance.** Switching engines mid-session adds cold-start + transport-setup jitter. For a *consistent* feel, pick one engine and stay on it.
- **Don't use ElevenLabs as a routine fallback** — at $0.05–0.10/1K chars it's 1.7–3.3× Aura-2 and the quality delta over Aura-2/Sonic is marginal for an assistant voice.

---

## 6. Adversarial stress-test — where "near $0/month" actually breaks

This is the part that earns its keep. The "$0/month local-first" claim has four failure modes; here's each, quantified.

### 6.1 RAM contention (the #1 risk)

M2 Pro **16GB** is the binding constraint, not compute. Resident footprint if everything is local:

| Component | RAM |
|---|---|
| Brain LLM (local, e.g. Ollama 7B Q4) | ~5GB |
| Brain LLM (13B Q4) | ~8GB |
| whisper.cpp medium | ~1.5GB |
| Kokoro-82M (at inference) | ~2–3GB |
| macOS + always-on services | ~4–6GB |
| **Total (7B brain local)** | **~12.5–15.5GB — over budget** |

**→ If the brain is local, you cannot also keep STT + TTS resident without swapping.** Marcel's brain is cloud (DeepSeek/Claude/GLM), which **frees ~5–8GB** and makes local STT+TTS comfortable. **This is why the brain MUST stay cloud for the $0 plan to hold.** The moment you run the brain on Ollama, you're forced onto cloud TTS → **~$80–165/mo.**

### 6.2 The "Kokoro is good enough" assumption — most likely to be wrong

Kokoro Elo 1056 vs ElevenLabs v3 ~1208 is a **~150-point gap** — perceptually large for a voice heard 100×/day. `[INFERENCE]` Realistic failure: Marcel finds Kokoro **fatiguing/flat after ~2 weeks**, promotes cloud TTS to default, and the "$0/mo" plan silently becomes "$99/mo." **Mitigation:** budget for Aura-2 as the realistic daily driver (~$99/mo) and treat Kokoro as the "free baseline I'm trying to tolerate." If Kokoro holds, you save $99; if not, you expected it.

### 6.3 Bluetooth XM5 codec latency — the hidden additive cost

Sony XM5 over Bluetooth A2DP adds **~150–250ms** codec latency, **additive** to STT+brain+TTS. This is **not a cost** but it directly causes Marcel's "slow" complaint and is independent of engine choice. **Mitigation:** XM5 low-latency mode, or wired fallback for voice sessions. No STT/TTS swap fixes this.

### 6.4 Echo feedback + slow model loading — architectural, not cost

Both of Marcel's stated pains are **pipeline problems, not engine problems** (L9's frame, endorsed):
- **Echo loop** → needs **VAD + half-duplex or AEC**, not a different TTS.
- **Slow model loading** → solved by **keeping models resident** (costs RAM, not money), not by faster engines.

A new TTS/STT engine does **not** fix either. Don't let a cost analysis seduce you into an engine swap that leaves the pipeline broken.

### 6.5 Honest monthly cost if local fails 20–40%

At 100 conv/day with STT local ($0) and TTS falling back to Aura-2:
- **20% cloud:** STT $3.46 + TTS $19.80 = **$23.27/mo**
- **40% cloud:** STT $6.93 + TTS $39.60 = **$46.53/mo**

These are the realistic planning numbers. **"Near $0" requires >95% local success**, which in turn requires Kokoro to not fatigue you and the brain to stay clouded.

---

## 7. Free vs paid vs subscription-covered — at a glance

| Resource | Marcel's access | Covers |
|---|---|---|
| whisper.cpp / Kokoro / MOSS-Nano | **Free forever** | Local STT + TTS + voice clone |
| Deepgram $200 credit | **Free, no card, no expiry** | ~11.5 mo of 100%-cloud STT at his load |
| AssemblyAI $50 credit | Free, no card, no expiry | ~8.9 mo STT |
| ElevenLabs 10K credits/mo | Free, resets monthly | Only 0.6% of monthly TTS — negligible |
| DeepSeek V4-Flash (brain) | $0.14/M in, $0.28/M out (cache 98% off) | Text-only brain — **needs this STT/TTS layer** (no native audio) |
| Claude Max / Cursor / GLM plan | Subscription (Marcel's) | Brain side, out of scope here |
| Cloud TTS ongoing (Aura-2 daily driver) | **~$99/mo** | The realistic "good voice always" cost |
| Cloud TTS premium (ElevenLabs Flash) | **~$165/mo** | Not recommended as default |

---

## 8. Final recommendation (grounded)

1. **STT:** `whisper.cpp medium` (Metal) local default + **Deepgram Nova-3** streaming fallback. Cost: **$0 until the $200 credit runs (~11.5 mo)**, then ~$17/mo only if you go 100% cloud.
2. **TTS:** **Kokoro-82M (MLX)** local default + **Deepgram Aura-2 / Cartesia Sonic** for quality-critical. Cost: **$0 if Kokoro holds**, realistically **~$20–47/mo** at 20–40% fallback.
3. **Voice cloning (optional):** **MOSS-TTS-Nano** — free, local, only free cloning option.
4. **Mandatory:** a **VAD** (silero/pyannote) before STT — fixes the echo loop and cuts cloud minutes.
5. **Keep the brain in the cloud.** If it goes local, the $0 plan dies (RAM) and you're at **~$99/mo** minimum.
6. **Budget the realistic number, not the dream number:** plan for **~$25–50/mo** (hybrid) and be pleasantly surprised if it's $0; don't plan for $0 and be blindsided by Kokoro fatigue.

**Bottom line:** The cheapest non-sacrificing setup is **local STT + local TTS with cloud fallbacks**, costing **~$0–50/mo** in practice — *provided* the brain stays clouded and Kokoro's voice is tolerable. The most expensive realistic scenario (all-cloud TTS, brain local) is **~$99–165/mo**, dominated by TTS. STT is never the cost problem.

---

## Sources

**STT pricing & quality:**
- Deepgram pricing — https://deepgram.com/pricing
- Deepgram Nova-3 intro — https://deepgram.com/learn/introducing-nova-3-speech-to-text-api
- Deepgram 2026 pricing breakdown — https://brasstranscripts.com/blog/deepgram-pricing-per-minute-2025-real-time-vs-batch
- AssemblyAI pricing & streaming — https://www.assemblyai.com/pricing · https://www.assemblyai.com/products/streaming-speech-to-text
- STT API pricing comparison (Jun 2026) — https://www.buildmvpfast.com/api-costs/transcription
- OpenAI Whisper/transcribe pricing 2026 — https://diyai.io/ai-tools/speech-to-text/openai-whisper-api-pricing-2026/ · https://costgoat.com/pricing/openai-transcription
- STT 2026 comparison (WER benchmarks) — https://www.codesota.com/guides/speech-recognition · https://futureagi.com/blog/speech-to-text-apis-in-2026-benchmarks-pricing-developer-s-decision-guide/
- Whisper accuracy by condition 2026 — https://vexascribe.com/how-accurate-is-whisper
- whisper.cpp Apple Silicon benchmarks — https://getspeakup.app/blog/whisper-cpp-benchmark-mac/ · https://www.promptquorum.com/power-local-llm/local-whisper-stt-comparison-2026
- MLX vs whisper.cpp — https://notes.billmill.org/dev_blog/2026/01/updated_my_mlx_whisper_vs._whisper.cpp_benchmark.html

**TTS pricing & quality:**
- ElevenLabs pricing & API — https://elevenlabs.io/pricing · https://elevenlabs.io/pricing/api
- ElevenLabs models & latency docs — https://elevenlabs.io/docs/overview/models · https://elevenlabs.io/docs/eleven-api/guides/how-to/best-practices/latency-optimization
- ElevenLabs pricing breakdowns 2026 — https://texttolab.com/blog/elevenlabs-pricing · https://bigvu.tv/blog/elevenlabs-pricing-2026-plans-credits-commercial-rights-api-costs/
- Deepgram Aura-2 intro — https://deepgram.com/learn/introducing-aura-2-enterprise-text-to-speech
- OpenAI TTS pricing — https://costgoat.com/pricing/openai-tts · https://developers.openai.com/api/docs/pricing
- TTS Arena Elo leaderboard 2026 — https://offlinetts.com/blog/tts-arena-leaderboard-2026/ · https://artificialanalysis.ai/text-to-speech/leaderboard/selected-voice
- Kokoro-82M MLX — https://github.com/gabrimatic/kokoro-mlx
- Kokoro Core ML (M2 Studio 379ms) — https://huggingface.co/mattmireles/kokoro-coreml
- Kokoro reviews & benchmarks — https://texttolab.com/blog/kokoro-tts-review · https://heyneo.com/blog/kokoro-tts-vs-supertonic-3-tts
- MOSS-TTS-Nano — https://github.com/OpenMOSS/MOSS-TTS-Nano · https://localclaw.io/tts/moss-tts-nano
- TTS models 2026 (Kokoro efficiency champion) — https://www.codesota.com/guides/tts-models

**Free tiers:**
- Deepgram $200 credit — https://smallest.ai/blog/deepgram-pricing-plans-cost-what-you-get-in-2026
- AssemblyAI $50 credit — https://costbench.com/software/ai-transcription-apis/assemblyai/free-plan/
- ElevenLabs free plan — https://elevenlabsreview.com/free-trial/

**DeepSeek / brain context:**
- DeepSeek V4-Flash text-only + pricing — https://designforonline.com/ai-models/deepseek-deepseek-v4-flash/ · https://devtk.ai/en/models/deepseek-v4-flash/
