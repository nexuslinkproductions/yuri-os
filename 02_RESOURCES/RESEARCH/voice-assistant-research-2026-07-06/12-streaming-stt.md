# Streaming & Continuous STT Architectures — Zero-Gap Listening for Non-Fluent Speech

> **Lane 12 / Researcher (R2-StreamingSTT).** Scope: how to keep the microphone listening **continuously**
> while transcription runs, so Marcel's follow-up words are never dropped into the silence gap between
> utterances. Covers streaming Whisper (LocalAgreement / whisper.cpp / faster-whisper), chunked + overlapping
> transcription, double-buffering, Moonshine (the streaming-native model), and how commercial streaming STT
> (Deepgram / AssemblyAI / Google) achieves continuous transcription. Grounded in Marcel's hardware
> (HyperX SoloCast USB → M2 Pro 16GB, Whisper-large-v3-turbo MLX, Silero VAD) and his speech pattern
> (slow, deliberate, 1–3s mid-sentence cognitive pauses, restarts/rephrases).
> **Cross-lane:** VAD endpointing / pause-tolerance belongs to **L11-VAD-Nonfluent** (`11-vad-nonfluent.md`,
> R1-VAD) — that lane owns *when* to cut; this lane owns *how to transcribe across the cut without gaps*.
> Model-choice and AEC depth live in **L8** (`08-local-stt.md`); architecture in **L1**
> (`01-architectures.md`).

---

## TL;DR — the decision in one screen

| Dimension | Recommendation | Why |
|---|---|---|
| **The actual bug (Marcel's real problem)** | **Decouple mic-capture from decode via a ring buffer / `queue.Queue`.** Capture runs in its own thread and *never* stops; decode pulls from the queue whenever it is free. | Marcel's lost-follow-up is **not** a Whisper limitation — it is the stop→transcribe→return→listen-again loop. The mic physically stops capturing during decode. A sounddevice `InputStream` callback writing into a bounded `queue.Queue` (capture thread) consumed by a separate transcriber thread is the standard fix and drops **zero audio** regardless of decode time. This is the load-bearing architectural change; everything below is optimization on top of it. |
| **Primary continuous-listen model (rebuild default)** | **Moonshine v2 (streaming variant)** as the always-on front-end, OR a Whisper sliding-window re-decode loop if you refuse a new dependency | Moonshine is the only model in Marcel's reach that was *designed* for streaming: sliding-window encoder attention keeps TTFT **constant regardless of audio length**, it caches encoder + decoder-LSTM state across chunks, and v2-Medium hits **258ms** live latency on an M3 (v2-Tiny: 50ms). Whisper can stream only via a re-decode hack that grows TTFT linearly with buffer length. |
| **Streaming Whisper (if staying on Whisper)** | **`ufal/whisper_streaming`** with the **LocalAgreement-2** policy, `MinChunkSize≈0.5–1.0s`, faster-whisper backend | The only peer-reviewed (IWSLT) Whisper-streaming method. Commits the stable prefix only when 2 consecutive decodes agree → low flicker. ~3.3s computational-aware latency on English. Wasteful (~2× re-decode) but Whisper-turbo-MLX is ~100× realtime so the waste is affordable on M2 Pro. |
| **Chunked / overlapping transcription** | **VAD-segmented chunks with 2–3s overlap + carried-over decoder prompt context** | Whisper's receptive field is 30s; the two long-form algorithms (sequential sliding-window vs chunked-split) both rely on overlap + previous-text context to stitch boundaries. VAD-fronted chunking (faster-whisper `BatchedInferencePipeline`, Silero) is **12.5× faster** than naive OpenAI Whisper on long audio. |
| **Double-buffering pattern** | **Active-Audio-Buffer + consensus engine + commit-and-trim** (WhisperPipe, arXiv 2604.25611, April 2026) — the state-of-the-art reference architecture | WhisperPipe achieves **89ms median latency** with **zero memory growth over 150 minutes** by (a) appending all incoming audio to a sliding Active Audio Buffer, (b) decoding at fixed intervals Δ, (c) promoting the stable prefix via a consensus engine into a Committed Text Buffer, (d) trimming the active buffer at the last committed word's end-timestamp. This *is* the double-buffer pattern, formalized and benchmarked. |
| **Commercial streaming patterns to copy** | **Partial→final result split + VAD event signals** (Deepgram model: `interim_results` + `endpointing` + `utterance_end_ms`); concatenate `is_final:true` transcripts until `speech_final:true` | Deepgram / AssemblyAI / Google all use the same primitive set: streaming 100–200ms audio frames, **immutable/committed word-level results** + a separate **endpoint signal**. The endpoint is decoupled from the transcription — copy this. |
| **For Marcel's paused speech specifically** | **Continuous partial results + a lenient/semantic endpointer** (not silence-only). Treat his 1–3s pauses as *mid-utterance*, not *end-of-turn*. | Silence alone is an unreliable end-of-utterance signal: "in natural speech, pauses frequently occur mid-thought due to hesitations, disfluencies, or planning" (Next-Turn, arXiv 2606.18094). With continuous partials, a pause **does not drop audio** — the stream keeps appending; only the endpointer decides when to ship the buffer to the brain. This is why decoupling capture (this lane) from endpointing (L11) is the whole game. |

**Bottom line:** Marcel's "lost follow-up words" is a **pipeline-architecture bug, not a model bug.** The mic
must never stop; decode must never block capture; the endpointer (not the decoder) decides when an utterance
is done. Implement that as: `sounddevice.InputStream` callback → `queue.Queue` (bounded, drop-oldest on
overflow) → transcriber thread pulling a sliding window with LocalAgreement (Whisper) or incremental-add
(Moonshine). Ship the committed prefix to the brain on the endpointer's signal, not on decode completion.

---

## 0. Marcel's problem, precisely

Marcel's current STT loop (`parakeet-listen.py`, confirmed in L8):

```
[speak] → [pause 0.8s] → [VAD: end-of-speech] → [STOP capturing]
       → [decode entire utterance] → [inject to brain] → [resume capturing]
```

The defect is the **STOP capturing** step. While the decoder runs (even if it's "only" ~50–200ms for a short
utterance, or longer under load), the microphone is not being read. Any words Marcel says during that window
are **acoustically lost** — PortAudio's input buffer overflows and the frames are discarded. For a *fluent*
speaker this is invisible (they pause naturally between utterances). For Marcel — who pauses mid-sentence to
think, then continues — the decoder fires on the first pause, and the continuation is dropped.

This manifests as the symptom he reports: *partial transcription → Yuri responds to a fragment.* The fragment
isn't a decoding error; it's the first clause, and the second clause was never recorded.

**The fix is architectural, and it is the central thesis of this lane:**

> **The capture thread and the decode thread must be independent. Capture never stops. Decode pulls from a
> buffer. The only thing that ever stops is the *decision to ship a completed utterance to the brain* — and
> that decision is made by the endpointer (L11), not by the decoder's start/stop.**

Everything else in this doc — streaming Whisper, chunking, double-buffering, Moonshine, commercial patterns —
is a strategy for *what the decode thread does with the buffer.* The capture independence is the prerequisite.

---

## 1. The capture-decode decoupling pattern (foundational, model-agnostic)

This is the single most important implementation detail in the entire streaming-STT stack, and it is not a
research finding — it is a standard real-time-audio engineering pattern. Marcel's current code violates it.

### Why a queue, not a single buffer

PortAudio (which `sounddevice` wraps) delivers audio in a **real-time callback thread** with a hard deadline:
if the callback doesn't return before the next hardware interrupt, frames are dropped. This means **no
blocking work** — not VAD, not decoding, not even a blocking `queue.put()` — may happen inside the callback.
The callback's only job is `queue.put_nowait(indata.copy())`.

The recommended inter-thread primitive in Python is `queue.Queue`, *not* a ring buffer:

> "PortAudio's single-reader single-writer lock-free ring buffer … is not appropriate for passing data from
> one Python thread to another Python thread—the `queue.Queue` class from the standard library should be used
> instead." — [python-rtmixer docs](https://python-rtmixer.readthedocs.io/en/0.1.1/)

### The pattern

```
┌──────────────────────────────────────────────────────────────┐
│  CAPTURE THREAD (sounddevice InputStream callback)            │
│  ─ never stops, never blocks ─                                │
│      indata.copy()  →  queue.put_nowait()  (drop-oldest if Full)│
└────────────────────────┬─────────────────────────────────────┘
                         │  bounded queue.Queue(maxsize≈100 frames)
                         ▼
┌──────────────────────────────────────────────────────────────┐
│  BUFFER/SEGMENT THREAD (pulls frames, runs Silero VAD)        │
│      append frames to rolling speech-buffer                    │
│      on endpoint signal → hand buffer to decoder, keep pulling│
└────────────────────────┬─────────────────────────────────────┘
                         │  utterance audio (or sliding window)
                         ▼
┌──────────────────────────────────────────────────────────────┐
│  DECODER THREAD (Whisper / Moonshine / faster-whisper)        │
│      runs for as long as it takes — capture thread unaffected │
│      emits committed text → brain                              │
└──────────────────────────────────────────────────────────────┘
```

**Key correctness properties:**

1. **Capture never blocks on decode — and must survive the endpoint force-ceiling.** The queue depth has a
   hard lower bound from the endpointer (L11): the two-stage turn models have a *force-ceiling* —
   **SmartTurn `stop_secs=3.0s`** (default, `pre_speech_ms=500`, `max_duration_secs=8`) and **Krisp
   Turn-Taking `max-hold=5.0s`** — during which capture must keep absorbing audio without dropping a frame.
   **Size the queue to hold ≥5s** to be safe across both turn-model options (L11 §3.4). At 100ms frames that's
   ≥50 frames; ~100 frames (~10s) gives margin. With drop-oldest-on-overflow, the *newest* audio is always
   preserved — for a voice assistant you want the live end of the stream, never the stale head.
2. **The queue decouples latency.** Decode time does not gate capture. The only gating is the endpointer.
3. **`indata.copy()` is mandatory** — PortAudio reuses the buffer after the callback returns; an uncopied
   reference is overwritten by the next frame. This is a classic silent-corruption bug.
4. **Overflow policy = drop oldest, not drop newest.** For streaming, you always want the most recent audio;
   the stale head of the queue is the right thing to sacrifice under backpressure.

Sources: [Real-Time Voice Streaming and Stateful Buffering (Cook, Feb 2026)](https://www.probableodyssey.blog/tech/real-time-voice-streaming-and-stateful-buffering/) · [python-sounddevice issue #76](https://github.com/spatialaudio/python-sounddevice/issues/76) · [python-rtmixer](https://python-rtmixer.readthedocs.io/en/0.1.1/) · [Baseten Whisper V3 streaming tutorial](https://www.baseten.co/blog/zero-to-real-time-transcription-the-complete-whisper-v3-websockets-tutorial/).

### Frame sizing

- **100ms frames** is the sweet spot for streaming STT (AssemblyAI SDK default; Google guidance). Too small
  → network/queue overhead; too large → added latency before VAD/decoder sees the frame.
- **16kHz mono int16 / float32.** Higher sample rates add bandwidth without improving ASR accuracy (every
  streaming vendor and Whisper itself resample to 16kHz internally). Marcel's HyperX is fine at 16kHz.
- **Queue depth: ≥50 frames (≥5s) — load-bearing, not arbitrary.** This is the endpointer force-ceiling
  constraint (L11 §3.4): SmartTurn holds ≤3s, Krisp TT holds ≤5s before forcing a turn-end, and the capture
  queue must outlast both without dropping audio. ~100 frames (~10s) is the safe default with margin for any
  decode stall on M2 Pro. Below 50 frames you risk losing Marcel's follow-up words during a long endpoint hold.

---

## 2. Can Whisper transcribe continuously? (No — every "streaming Whisper" is a re-decode hack)

### Whisper's architectural reality

Whisper is an **encoder-decoder transformer with a fixed 30-second receptive field**. It is not designed for
streaming — it is designed to ingest a ≤30s window containing roughly one sentence and emit the full
transcript in one decoder pass. From the model card:

> "Whisper has a receptive field of 30-seconds. To transcribe audios longer than this, one of two long-form
> algorithms are required: Sequential (sliding 30s windows) or Chunked (split with overlap, stitch at
> boundaries)." — [openai/whisper-large-v3 card](https://huggingface.co/openai/whisper-large-v3)

Picovoice states it bluntly: **"Whisper does not have streaming STT capability"** ([source](https://picovoice.ai/blog/whisper-speech-to-text-for-real-time-transcription/)).
Voibe confirms: "faster-whisper and whisper.cpp do not support native streaming" ([source](https://www.getvoibe.com/resources/openai-whisper-alternatives/)).

Therefore every tool called "streaming Whisper" is, under the hood, **one of two re-decode strategies** built
on top of a batch model:

| Strategy | How it works | Cost | Latency |
|---|---|---|---|
| **Sliding-window re-decode** (whisper-streaming, WhisperPipe) | Append new audio to a growing buffer; re-run Whisper on the whole buffer each tick; emit the stable prefix. | ~2× redundant compute | 0.5–3.3s to first committed word |
| **Chunked-split + overlap** (faster-whisper BatchedInferencePipeline) | Split at VAD boundaries; transcribe each ≤30s chunk independently; stitch with 2–3s overlap + carried prompt. | minimal redundancy | near-realtime per chunk, but per-*utterance* not per-word |

### whisper-streaming (ufal) — the LocalAgreement-2 policy

The canonical academic reference is **"Turning Whisper into Real-Time Transcription System"**
(Macháček, Dabre, Bojar; arXiv [2307.14743](https://arxiv.org/html/2307.14743), demoed at IWSLT). Its core
mechanism is the **LocalAgreement-n policy**:

> "If n consecutive updates, each with a newly available audio stream chunk, agree on a prefix transcript, it
> is confirmed. … We consecutively process new audio chunks, emit the transcripts that are confirmed by 2
> iterations, and scroll the audio processing buffer on a timestamp of a confirmed complete sentence."

The system components (verbatim from the paper): *the update loop, the audio buffer, skipping the confirmed
output in the audio buffer, trimming the buffer, joining for inter-sentence context, and optional VAD.* The
parameter `MinChunkSize` controls the latency/quality tradeoff — it is the minimum audio duration processed
per iteration.

**n = 2 won** on the IWSLT 2022 simultaneous-translation shared task, so **LocalAgreement-2** is the default.
Reported result: **3.3s average computational-aware latency** on the English ESIC corpus. That is the honest
floor for Whisper-based streaming — it is *not* sub-second.

```
tick 1: buffer="Hey Yuri can you"          →  decode →  candidate "Hey Yuri can you"
tick 2: buffer="Hey Yuri can you look up"  →  decode →  candidate "Hey Yuri can you look up"
                        └── prefix "Hey Yuri can you" agrees with tick 1 → COMMIT "Hey Yuri can you"
        trim buffer to start of "look up"; keep "look up" + new audio
```

**For Marcel on M2 Pro:** `faster-whisper` is the recommended backend per the ufal README, **but faster-whisper
has no Metal/GPU support on macOS — it runs CPU-only** (L8 §6). On Apple Silicon, **mlx-whisper or
whisper.cpp** are ~2–3× faster than faster-whisper for the same model (L8). So Marcel would either (a) wrap
`mlx_whisper.transcribe()` in the LocalAgreement loop himself (~150 lines), or (b) accept the CPU-only
faster-whisper penalty for the privilege of using the ready-made ufal wrapper. Given Whisper-turbo-MLX is
~100× realtime, the ~2× re-decode waste is affordable either way.

Sources: [ufal/whisper_streaming](https://github.com/ufal/whisper_streaming) · [arXiv 2307.14743](https://arxiv.org/html/2307.14743) · [RealtimeVoiceKIT explainer](https://realtimevoicekit.com/en/blog/real-time-whisper-transcription-online).

### whisper.cpp streaming (the `stream` example + `audio_ctx`)

whisper.cpp ships a **`whisper-stream` example** that "samples the audio every half a second and runs the
transcription continuously" ([examples/stream/README.md](https://github.com/ggml-org/whisper.cpp/blob/master/examples/stream/README.md)):
`./build/bin/whisper-stream -m ./models/ggml-base.en.bin -t 8 --step 500 --length 5000`.

Two parameters matter for streaming:
- **`audio_ctx`** — the encoder audio context size. Default 1500 (= 30s). **Setting `audio_ctx=768` makes the
  encoder ~2× faster, processing a ~15s window instead of 30s** ([discussion #297](https://github.com/ggml-org/whisper.cpp/discussions/297)). This is the lever to trade accuracy for decode speed on the hot loop.
- **`no_context=false`** — the `whisper_context` **retains the decoder prompt between `whisper_full()` calls**,
  carrying the previous utterance's tokens forward as conditioning ([discussion #206](https://github.com/ggml-org/whisper.cpp/discussions/206)). This is *context propagation* — critical for coherent multi-sentence transcription.

There is also a `WhisperStreamConfig { step_ms: 3000, .. }` API (Rust `whisper-cpp-plus`) that exposes
`stream.feed_audio(&chunk)` + `stream.process()` — the cleanest incremental-feed surface for a voice loop
if Marcel will tolerate a Rust dependency.

**Honest caveat (ggml-org maintainers):** "Whisper is an encoder-decoder model that performs best on complete
audio segments (30s) — it was designed for batch transcription, not sub-second streaming. The VAD +
short-chunk workaround helps, but you're essentially fighting the architecture."

### faster-whisper streaming reality

faster-whisper is **not** streaming-native. From the authoritative guide:

> "Faster-Whisper itself is not designed for streaming — it expects complete audio. For streaming use,
> `whisper_streaming` (community) polls Faster-Whisper on a sliding window with VAD-aware re-segmentation."
> — [Local AI Master](https://localaimaster.com/blog/faster-whisper-guide)

What faster-whisper *does* offer is the **`BatchedInferencePipeline`** (formerly `WhisperTranscriber`,
inspired by Whisper-X): it front-ends Silero VAD, aggregates voiced segments into <30s chunks, and runs
batched inference — **12.5× faster than OpenAI's reference Whisper**, up to 380× realtime on 3-hour files
([mobiusml blog](https://mobiusml.github.io/batched_whisper_blog/)). This is the right tool for *offline*
and *utterance-buffered* transcription, not for sub-second partials.

**Known quality trap:** `use_vad_model=False` on `BatchedInferencePipeline` gives *better* transcription
quality than the VAD-default ([faster-whisper issue #954](https://github.com/SYSTRAN/faster-whisper/issues/954)).
VAD-fronted chunking can clip word boundaries; for accuracy-critical paths, disable it and chunk on the
endpointer (L11) instead.

**Bottom line on Whisper streaming:** it works, it is what most "real-time Whisper" products use, but it is
fundamentally a re-decode loop with 1–3s committed-word latency. If Marcel wants true word-as-spoken
partial transcription, **Moonshine (§5) is architecturally the right tool**. Whisper streaming is the
fallback when he wants to stay on one model and one framework.

---

## 3. Chunked + overlapping transcription (the long-form algorithms)

When the decoder *does* run (per-utterance or per-window), how it chunks long audio determines both accuracy
at boundaries and how cleanly the pipeline can be parallelized. This matters for Marcel because his
utterances — with mid-sentence thinking pauses — are effectively *multi-segment*, and naive chunking at the
wrong boundary corrupts them.

### The two long-form algorithms (OpenAI's own taxonomy)

| Algorithm | Mechanism | Redundancy | Use case |
|---|---|---|---|
| **Sequential (sliding 30s)** | Transcribe 30s slice → advance window → transcribe next 30s → … | none | Continuous audio, no known boundaries |
| **Chunked (split + overlap)** | Split at VAD/silence boundaries; transcribe each segment independently with **2–3s overlap** into neighbors; stitch at boundaries by detecting the carried-over text. | ~2–3s per boundary | Audio with detectable segments; parallelizable |

### Why overlap is mandatory

> "2–3 seconds overlap is highly recommended … long-form transcription picks up on the signal of open segments
> and starts the next audio slice from the start of the open segment. In effect, overlapping the transcription
> such that the overflowing speech part has a chance to be captured in full." —
> [saytowords](https://www.saytowords.com/blogs/Whisper-Audio-Chunking/) · [Yoad Snapir, Medium](https://medium.com/@yoad/whisper-long-form-transcription-1924c94a9b86)

Without overlap, a word split across a chunk boundary (e.g. "transcri|ption") is transcribed as two
fragments, each hallucinated into a complete word. Overlap gives both chunks the full word, and the stitcher
detects the duplicate and keeps one copy.

### Context propagation (the secret sauce)

> "An important aspect of long-form transcription is the 'previous text context' provided to an audio slice
> transcription when a previous audio slice exists. … the tokens (up to half the max token generation size)
> are kept as supplied to the decoder to condition on." — [Snapir](https://medium.com/@yoad/whisper-long-form-transcription-1924c94a9b86)

This is **whisper.cpp's `no_context=false` behavior** (§2) and **whisper-streaming's "joining for
inter-sentence context."** Each chunk's decode is *conditioned on the previous chunk's committed tokens*.
For Marcel this is doubly important: it is what makes "Hey Yuri… [3s pause] … look up X" transcribe as one
coherent utterance rather than two disconnected fragments. The carried prompt tells the decoder "we are
mid-sentence; don't restart."

### Parallel chunked transcription (the double-buffering payoff)

Chunked-split is **trivially parallelizable** — each ≤30s segment is independent. With the capture-decode
decoupling of §1, Marcel can run a small pool of decoder workers:

```
queue.Queue ──► segmenter (VAD-split into ≤30s chunks w/ 2–3s overlap)
                    │
                    ├──► decoder-worker-1  ─┐
                    ├──► decoder-worker-2  ─┼──► ordered merge (by chunk timestamp) ──► brain
                    └──► decoder-worker-3  ─┘
```

On M2 Pro (16GB unified, 19-core GPU), one mlx-whisper turbo decode is ~100× realtime — a single worker
suffices for one human speaker. **Parallel workers matter only if decode ever stalls** (long utterance,
GIL contention, background load). The architecture should *support* parallelism without *requiring* it: a
pool size of 1 is the default; bump to 2–3 only if queue depth grows.

**The double-buffering guarantee:** because capture is on its own thread (§1), even if *all* decoder workers
are busy, the queue keeps absorbing Marcel's audio. Nothing is dropped. This is the answer to his literal
request: *"keep listening while you process."*

---

## 4. Double-buffering — the WhisperPipe reference architecture (arXiv 2604.25611)

The single most directly-relevant 2026 paper for Marcel's problem is **"WhisperPipe: A Resource-Efficient
Streaming Architecture for Real-Time Automatic Speech Recognition"** (April 2026,
[arXiv 2604.25611](https://arxiv.org/abs/2604.25611)). It formalizes exactly the pattern Marcel needs.

### Why it matters

> "Existing streaming approaches either sacrifice accuracy through aggressive chunking or incur prohibitive
> memory costs through unbounded context accumulation."

WhisperPipe's contribution is **bounded memory + maintained accuracy** over indefinite sessions — the exact
"always-on, runs for hours" property a desktop Jarvis needs.

### The three-buffer architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│  Active Audio Buffer (A)  ── sliding window of uncommitted audio     │
│  ── ALL incoming mic audio appends here; never drops (§1 capture)    │
└───────────────────────────┬─────────────────────────────────────────┘
                            │  at fixed interval Δ, invoke Whisper → candidate hypothesis y_t
                            │     (with word-level timestamps)
                            ▼
                  ┌─────────────────────────┐
                  │  Consensus Engine        │  compares y_t against recent hypothesis history
                  │  → stable prefix p_t⊆y_t │  (suppresses drift / flicker)
                  └────────────┬─────────────┘
                               │  commit stable prefix
                               ▼
                  ┌─────────────────────────┐
                  │  Committed Text Buffer  │  → shipped to brain
                  └────────────┬─────────────┘
                               │  TRIM Active Audio Buffer at end-timestamp of last committed word
                               ▼
                  (window stays bounded; no memory growth over hours)
```

**The commit-and-trim is the key insight.** After the consensus engine promotes a stable prefix into the
committed buffer, the active audio buffer is *trimmed to the end-timestamp of the last committed word*. This
keeps the decoding window bounded — without it, the buffer would grow unboundedly over a long session,
slowing every subsequent decode. WhisperPipe reports **zero memory growth over 150 minutes of continuous
operation.**

### Performance

- **89ms median end-to-end latency** (90th percentile: 142ms)
- **48% less peak GPU memory** vs baseline Whisper streaming
- **80.9% lower average GPU utilization**
- **WER within 2% of offline Whisper**
- **3–5× lower latency** than existing streaming solutions

The hybrid VAD (Silero + energy-based) reduces false activations by 34% — relevant to Marcel's false-trigger
problem, though that tuning belongs to L11.

**Caveat for Marcel:** WhisperPipe is benchmarked on GPU. On M2 Pro (unified memory, no CUDA), the absolute
numbers will differ, but the *architecture* (Active Buffer + consensus + commit-and-trim) is
backend-agnostic and is the correct design regardless of decoder. Marcel can implement the same three-buffer
shape with mlx-whisper as the decoder.

### Relationship to §1 and whisper-streaming

WhisperPipe is essentially **LocalAgreement-2 (whisper-streaming) + the commit-and-trim bound +
a bounded-memory guarantee + a formal benchmark.** It is the same idea, hardened. If Marcel reads one paper,
read this one.

Sources: [arXiv 2604.25611](https://arxiv.org/abs/2604.25611) · [arXiv PDF](https://arxiv.org/pdf/2604.25611) · [CatalyzeX](https://www.catalyzex.com/paper/whisperpipe-a-resource-efficient-streaming) · [audio-paper-digest](https://nanless.github.io/audio-paper-digest-blog/posts/2026-04-29-whisperpipe-a-resource-efficient-streaming/).

---

## 5. Moonshine — the streaming-native STT (the right tool for continuous listening)

L8 introduced Moonshine briefly as "best streaming option for Apple Silicon." This section goes deeper,
because Moonshine is the one model in Marcel's reach that was **designed from scratch for streaming** — and
that distinction is load-bearing for his use case.

### v1 → v2: the architecture that matters

**Moonshine v1** (Useful Sensors, MIT): 245M params, **107ms** live latency on MacBook Pro, **6.65% WER**
(beats Whisper-large-v3). Full-attention encoder. The streaming trick: **cache the input encoding and part of
the decoder's state** so incremental audio reuses prior compute rather than starting over.

> "Our models now support incremental addition of audio over time, and they cache the input encoding and part
> of the decoder's state so that we're able to skip even more of the compute, driving latency down
> dramatically." — [moonshine-ai/moonshine](https://github.com/moonshine-ai/moonshine)

**Moonshine v2** ("Ergodic Streaming Encoder ASR for Latency-Critical Speech Applications,"
[arXiv 2602.12241](https://arxiv.org/abs/2602.12241), Feb 2026) is the architecturally important upgrade.
The encoder switches from full-attention to **sliding-window self-attention**:

> "The original Moonshine models use a full-attention encoder, which results in TTFT [time-to-first-token]
> latency that grows with input audio duration. Sliding window attention in the Moonshine v2 encoder results
> in a fixed encoding latency, meaning the TTFT of Moonshine v2 models remains **constant regardless of audio
> duration**, unlike full-attention models where TTFT grows linearly."

**This is the decisive property for an always-on listener.** Whisper's TTFT grows linearly with buffer length
(every re-decode of a growing buffer costs more); Moonshine v2's stays flat no matter how long the session
has been running. An always-on assistant that runs for hours *needs* flat TTFT — otherwise the 10,000th
utterance is slower than the 1st.

The encoder maintains **rolling cache tensors across chunks** for channel and temporal context; the decoder
preserves **LSTM hidden and cell states** between decoding steps ([arXiv 2604.14493](https://arxiv.org/html/2604.14493v1)).

### Apple Silicon latency (the headline numbers)

Live-transcription latency on MacBook M3 (end-of-utterance → returned transcript), from the v2 paper:

| Model | Latency | Speedup vs comparable Whisper |
|---|---|---|
| **Moonshine v2 Tiny** | **50ms** | 5.8× faster than Whisper Tiny |
| **Moonshine v2 Small** | **148ms** | 13.1× faster than Whisper Small |
| **Moonshine v2 Medium** | **258ms** | 43.7× faster than Whisper-large-v3 |

These are *commit* latencies, not partial-stream latencies — and they're already sub-300ms. On M2 Pro expect
comparable order of magnitude (v2-Medium likely ~300ms; v2-Tiny well under 150ms).

### Deployment specifics for Marcel

- **Format:** ONNX, converted to the memory-mappable `.ort` flatbuffer encoding. Loads fast, low memory
  overhead.
- **Runtime:** ONNX Runtime, which has **native Apple Silicon support via the CoreML Execution Provider**
  (recommended with Apple Neural Engine for optimal performance). Prebuilt arm64/CoreML wheels exist
  ([xaviviro/onnxruntime-coreml](https://github.com/xaviviro/onnxruntime-coreml),
  [cansik/onnxruntime-silicon](https://github.com/cansik/onnxruntime-silicon)).
- **Cross-platform C++ core** → Python/Swift/Java/C++ bindings. If Marcel ever rewrites the assistant as a
  native Swift app (which L8 flagged as the cleanest AEC path via `AVAudioEngine` +
  `setVoiceProcessingEnabled(true)`), Moonshine ports directly.
- **License:** **MIT** (code; models MIT for English). Fully commercial-deployable. Non-English models have a
  non-commercial restriction — irrelevant for Marcel (EN+DE; use Whisper for DE).
- **Languages:** English, Spanish, Chinese (Mandarin), Japanese, Korean, Vietnamese, Ukrainian, Arabic.
  **No German** → keep Whisper as the DE fallback (or use Whisper's 99-language coverage for non-EN).

### Moonshine vs Whisper-turbo for Marcel's streaming hot-loop

| Axis | Moonshine v2 | Whisper-turbo-MLX |
|---|---|---|
| Designed for streaming? | **Yes — flat TTFT, cached state** | No — re-decode hack |
| Commit latency (Apple Silicon) | **50–258ms** | 500ms–3.3s (LocalAgreement) |
| Partial (word-as-spoken) UX | **Native** | Emulated via re-decode |
| WER (English) | ~6.65% (v1); competitive (v2) | ~2.5–3% (turbo) |
| Languages | EN (+ 7 others, no DE) | 99 (incl. DE) |
| Ecosystem maturity | 1 vendor (Useful Sensors, ex-TensorFlow team) | 4 backends on Apple Silicon |
| Memory growth over hours | **Flat (bounded by sliding window)** | Linear unless commit-and-trim |
| Best role | **Always-on streaming front-end** | Final/accuracy pass; DE; batch |

**Recommendation:** Use **Moonshine v2-Tiny or Small for live partials** (word-as-spoken, the "feels alive"
UX Marcel wants), and **optionally re-decode the finalized utterance with Whisper-turbo-MLX for the cleanest
text shipped to the brain** (Moonshine's WER is slightly worse; Whisper is the accuracy anchor). This is the
"Option B" from L8 §5, sharpened: Moonshine is viable and is the streaming-native choice.

Sources: [moonshine-ai/moonshine](https://github.com/moonshine-ai/moonshine) · [Moonshine v2 paper](https://arxiv.org/abs/2602.12241) · [Moonshine v2 HTML](https://arxiv.org/html/2602.12241v1) · [Pushing the Limits of On-Device Streaming ASR (arXiv 2604.14493)](https://arxiv.org/html/2604.14493v1) · [Moonshine Streaming (HF docs)](https://huggingface.co/docs/transformers/en/model_doc/moonshine_streaming) · [modelslab benchmark](https://modelslab.com/blog/audio-generation/moonshine-vs-whisper-asr-real-time-2026) · [onresonant](https://www.onresonant.com/resources/local-stt-models-2026) · [ONNX Runtime CoreML EP](https://onnxruntime.ai/docs/execution-providers/CoreML-ExecutionProvider.html).

---

## 6. How commercial streaming STT achieves continuous transcription

Deepgram, AssemblyAI, and Google Cloud STT all solve the same problem Marcel has — *transcribe continuously
without dropping audio, ship utterances to the consumer on a clean endpoint signal* — at cloud scale. Their
primitives are the template Marcel should copy locally.

### The universal streaming contract (all three converge on this)

```
client ──stream 100–200ms audio frames──► server
client ◄──partial results (is_final:false)── server   (as you speak)
client ◄──final result (is_final:true)───── server   (at max-accuracy point)
client ◄──endpoint signal────────────────── server   (speaker stopped)
```

The **decoupling that matters**: the **endpoint signal is separate from the transcript result.** The consumer
concatenates `is_final:true` transcripts until the endpoint fires, then flushes the accumulated utterance to
the brain. This is *exactly* the capture/endpoint decoupling of §1, expressed as a protocol.

### Deepgram — interim results + endpointing + utterance_end

- **Frame size:** streams audio in **100–200ms chunks**, processes immediately without batching,
  **sub-300ms latency**, first-word latency ~150ms ([Deepgram streaming](https://deepgram.com/learn/streaming-speech-recognition-api)).
- **`interim_results=true`** — emits `is_final:false` guesses as you speak; when accuracy maxes for a segment,
  emits `is_final:true` (definitive; prefer over interim) ([Interim Results docs](https://developers.deepgram.com/docs/interim-results)).
- **`endpointing`** (audio-VAD based) — when speech→silence transition exceeds the configured ms, chunks the
  audio and returns `speech_final:true` ([Endpointing docs](https://developers.deepgram.com/docs/endpointing)).
- **`utterance_end_ms`** — *semantic* end-of-speech: looks at **word timings** (not just volume) to detect a
  sufficiently long gap, **ignoring non-speech audio** (door knock, phone ring, street noise). Requires
  `interim_results=true`. Configurable gap; e.g. `utterance_end_ms=1000` waits 1000ms between transcribed
  words ([End-of-Speech docs](https://developers.deepgram.com/docs/understanding-end-of-speech-detection)).
- **Using both together (the canonical pattern):**
  > "Trigger when a transcript with `speech_final=true` is received (which may be followed by an UtteranceEnd
  > message which can be ignored), OR trigger if you receive an UtteranceEnd message with no preceding
  > `speech_final=true` message and send the last-received transcript for further processing." Concatenate
  > finalized transcripts to build complete utterances; clear the buffer on `speech_final:true`.
- **Known limitation:** utterance_end only analyzes gaps *after finalized words* — gaps contained entirely
  within a single final result aren't detected. Relevant to Marcel: if his mid-sentence pause falls *inside*
  a single final segment, neither signal fires — which is *correct* behavior (it's mid-utterance).

### AssemblyAI — Universal-Streaming (immutable transcripts + intelligent endpointing)

- **Frame size:** WebSocket to `wss://streaming.assemblyai.com/v3/ws`; push frames as recorded; **~300ms P50**
  ([Universal-Streaming](https://www.assemblyai.com/universal-streaming)).
- **Immutable transcripts** — unlike most streaming STT (which overwrite partials), AssemblyAI's text is
  *append-only and never revised*. Each `Word` has `word_is_final` (true except possibly the last word).
  This eliminates the "flicker" problem entirely at the cost of occasionally appending a word that should
  have been revised ([Streaming docs](https://www.assemblyai.com/docs/streaming)).
- **Intelligent endpointing** — "combines **acoustic and semantic features** with traditional silence-based
  methods for more effective and accurate end-of-turn detection with built-in fallback reliability."
  This is the *semantic* endpointer — it uses *what was said* (is the sentence complete?) not just *whether
  there's silence*. **This is exactly the kind of endpointer Marcel needs for his paused speech** (L11 deep).
- **`end_of_turn`** message when the turn is detected complete; optional `turn_is_formatted` if formatting
  enabled.
- **Pricing:** $0.15/hr (Universal), $0.45/hr (Universal-3 Pro), billed on session duration.

### Google Cloud Speech-to-Text — VAD events + single-utterance vs continuous

- **Voice Activity Events** (gRPC only): `SPEECH_ACTIVITY_START` / `SPEECH_ACTIVITY_END`, returned in
  real-time *before* the transcription results for that segment. Enable with
  `enable_voice_activity_events=true` ([VAD events docs](https://docs.cloud.google.com/speech-to-text/docs/voice-activity-events)).
- **`voice_activity_timeout`** — independent speech-begin and speech-end timeouts, each **500ms–60s**
  configurable. This is the *direct knob* for Marcel's pause tolerance: set `speech_end_timeout` high
  (e.g. 2.5–3s) so his thinking pauses don't trigger a false endpoint.
- **Single-utterance mode** (`latest_short` model): stream closes automatically after one utterance —
  *this is the anti-pattern Marcel is stuck in*. `END_OF_SINGLE_UTTERANCE` event + stream close = exactly the
  "stop listening after one utterance" behavior that drops his follow-up words.
- **Continuous mode** (default, `single_utterance` unset): "the stream will continue to listen and process
  audio until either the stream is closed directly, or the stream's limit length has been exceeded. … may
  return multiple final results and continues listening indefinitely." **This is the mode Marcel needs.**

### What to copy locally

Marcel's local loop should reproduce this contract:

| Commercial primitive | Local equivalent for Marcel |
|---|---|
| Stream 100–200ms frames | `sounddevice.InputStream` callback → `queue.Queue` (§1) |
| `is_final:false` partials | Moonshine incremental output / Whisper LocalAgreement committed prefix |
| `is_final:true` finals | Committed Text Buffer entries (WhisperPipe §4) |
| `endpointing` (audio VAD) | Silero VAD `stop_secs` (L11) |
| `utterance_end_ms` / intelligent endpointing | Two-stage / semantic endpointer (L11) |
| `speech_final:true` → flush utterance to brain | Endpoint signal → ship committed buffer → clear |

The commercial systems prove the contract; the local build implements it without the per-minute bill.

Sources: [Deepgram streaming](https://deepgram.com/learn/streaming-speech-recognition-api) · [Deepgram interim results](https://developers.deepgram.com/docs/interim-results) · [Deepgram endpointing](https://developers.deepgram.com/docs/endpointing) · [Deepgram end-of-speech](https://developers.deepgram.com/docs/understanding-end-of-speech-detection) · [Deepgram utterance end](https://developers.deepgram.com/docs/utterance-end) · [AssemblyAI Universal-Streaming](https://www.assemblyai.com/universal-streaming) · [AssemblyAI streaming docs](https://www.assemblyai.com/docs/streaming) · [AssemblyAI real-time guide](https://www.assemblyai.com/blog/real-time-speech-to-text) · [Google VAD events](https://docs.cloud.google.com/speech-to-text/docs/voice-activity-events) · [Google single-utterance](https://cloud.google.com/speech-to-text/v2/docs/single-utterance) · [Google streaming recognize](https://docs.cloud.google.com/speech-to-text/docs/streaming-recognize).

---

## 7. Why streaming + decoupled capture fixes Marcel's paused speech (the synthesis)

Marcel's speech pattern — slow, deliberate, 1–3s mid-sentence thinking pauses, restarts/rephrases — is, in
the ASR literature, a textbook case of **disfluent speech with within-utterance pauses.** The research is
unequivocal that silence alone is the wrong endpoint signal for this:

> "Reliably determining the endpoint of an utterance is challenging because speakers often pause
> mid-utterance due to hesitations and disfluencies. In natural speech, pauses frequently occur mid-thought
> due to hesitations, disfluencies, or planning, and thus silence alone is an unreliable indicator."
> — [Next-Turn, arXiv 2606.18094](https://arxiv.org/html/2606.18094v1)

> "It is critical to discriminate disfluencies and end of query to allow the user to hold the floor for
> disfluencies while having the system respond as quickly as possible when the user has finished speaking."
> — [Grid-LSTM endpoint detection](https://www.researchgate.net/publication/319184999)

Two research threads directly address Marcel:

1. **Two-pass endpoint detection** ([arXiv 2401.08916](https://arxiv.org/html/2401.08916v1)) — an
   "EP Arbitrator" *delays* endpoint decisions for utterances that have longer pauses, hesitations, or are
   semantically incomplete. This is precisely what Marcel needs: don't cut on the first 1s pause; wait and
   check whether the utterance is semantically complete. (Endpoint logic → L11.)
2. **Joint streaming ASR + disfluency detection** ([arXiv 2211.08726](https://arxiv.org/abs/2211.08726)) —
   Transformer encoder-decoders that simultaneously transcribe *and* tag disfluencies (filled pauses,
   restarts) in a streaming manner, robust to recognition errors because they use acoustic cues. A
   future-proofing direction: tag Marcel's "um… [pause] …restart" so the brain can reconstruct intent.

### The streaming answer to Marcel's specific complaint

Marcel said: *"the VAD cuts him off when he pauses → partial transcription → Yuri responds to a fragment."*

With the architecture in this lane, that failure mode is eliminated at **two independent layers**:

1. **Capture layer (§1):** the mic never stops. Even if a premature endpoint fires, the audio Marcel produces
   *during and after* the endpoint is still in the queue / Active Audio Buffer. The follow-up words are
   acoustically preserved — not lost — so a corrected endpoint decision can include them. **The fragment is
   never truly partial; only the shipping decision was early.**
2. **Endpoint layer (L11):** a lenient / two-pass / semantic endpointer holds the floor through Marcel's
   1–3s pauses, cutting only on true end-of-turn. Combined with continuous partials, Marcel sees his words
   appear as he speaks (Moonshine) and the utterance ships only when he's actually done.

The capture layer is the *guarantee*; the endpoint layer is the *judgment.* Together they convert "walkie-
talkie that cuts you off" into "continuous listener that waits for you to finish." **This is the core
deliverable of Marcel's request — "keep listening while processing" — and it is an architecture property,
not a model property.**

---

## 8. Recommended implementation for Marcel (synthesized architecture)

Combining §1–7 with L8's model/AEC guidance and L1's thin-glue-loop recommendation:

```
┌──────────────────────────────────────────────────────────────────────────┐
│  CAPTURE THREAD (never stops, never blocks)                                │
│   sounddevice.InputStream(16k, mono, float32, callback)                   │
│     → indata.copy() → queue.put_nowait()  [drop-oldest on Full]           │
└─────────────────────────────────┬────────────────────────────────────────┘
                                  │ queue.Queue(maxsize≈100, ~100ms frames)
                                  ▼
┌──────────────────────────────────────────────────────────────────────────┐
│  VAD/SEGMENT THREAD  (Silero conf≈0.5; stop_secs 2.0s floor, two-stage per L11) │
│   append frames → rolling speech buffer                                    │
│   continuous partial decode via Moonshine v2 (incremental add)            │
│   on endpoint signal → emit committed utterance → KEEP APPENDING          │
└─────────────────────────────────┬────────────────────────────────────────┘
                                  │ utterance audio (committed prefix)
                                  ▼
┌──────────────────────────────────────────────────────────────────────────┐
│  DECODER (one of):                                                         │
│   (A) Moonshine v2-Tiny/Small  ── live partials, flat TTFT                │
│   (B) mlx_whisper turbo + LocalAgreement-2 ── re-decode loop              │
│   (C) WhisperPipe-shape: Active Buffer + consensus + commit-and-trim      │
│   optional: re-decode finalized utterance with Whisper-turbo for accuracy │
│   optional: parallel worker pool (size 1 default, bump if queue grows)    │
└─────────────────────────────────┬────────────────────────────────────────┘
                                  │ committed text
                                  ▼
                            [brain / LLM]
```

### Phased rollout (matches L1's build plan)

- **Phase 1 (the bug fix):** Implement §1 — capture thread + `queue.Queue` + a single decoder worker pulling
  utterance buffers. Use existing Whisper-turbo-MLX. **This alone fixes the lost-follow-up symptom**, because
  capture no longer stops during decode. Ship utterance to brain on Silero endpoint. ~1 day.
- **Phase 2 (streaming partials):** Add Moonshine v2-Small for word-as-spoken output; keep Whisper-turbo as
  the final-utterance accuracy pass. ~2 days (ONNX Runtime CoreML setup + incremental-add wiring).
- **Phase 3 (hardened streaming):** If Phase 2's re-decode redundancy matters, implement the WhisperPipe
  three-buffer shape (Active Buffer + consensus + commit-and-trim) for bounded-memory long sessions. ~2 days.
- **Phase 4 (parallelism, if needed):** Decoder worker pool if queue depth grows under load. Likely
  unnecessary for a single speaker on M2 Pro.

### What this does NOT solve (correctly deferred to other lanes)

- **Echo / AEC** → L8 §4 (WebRTC AEC; half-duplex when headphones active).
- **VAD tuning / pause tolerance / two-stage endpoint** → L11 (R1-VAD, `11-vad-nonfluent.md`). This lane
  consumes L11's endpoint numbers as the trigger and does not set them: single-stage **Silero `stop_secs`
  floor ≈ 2.0s** for cognition-paced speech (convergent across Marcel's scripts + faster-whisper production
  default `min_silence_duration_ms=2000`); two-stage **stage-1 candidate `stop_secs` 0.5–0.8s** (fires ML
  eval), **force-ceiling 3.0s SmartTurn / 5.0s Krisp TT**. The 5.0s ceiling is the hard lower bound on this
  lane's capture-queue depth (§1). Note: `LocalSmartTurnAnalyzerV3` is already imported in `bot.py:16` but
  not wired into the pipeline — the single highest-leverage endpoint fix (L11).
- **Brain / LLM streaming** → L2.
- **Model choice (Whisper vs Parakeet vs Moonshine as primary)** → L8. This lane treats the decoder as
  pluggable; the capture/decouple architecture is model-agnostic.

---

## 9. Comparison — streaming approaches at a glance

| Approach | Continuous capture? | Word-as-spoken partials? | Commit latency (M2 Pro est.) | Memory over hours | New deps | Best for |
|---|---|---|---|---|---|---|
| **Current (stop→decode→listen)** | ❌ (the bug) | ❌ | decode time | flat | none | nothing — replace |
| **§1 decouple + utterance-buffered Whisper** | ✅ | ❌ | ~50–200ms/utterance | flat | none | Phase 1 bug fix |
| **whisper-streaming LocalAgreement-2** | ✅ (if decoupled) | ✅ (emulated) | ~500ms–3.3s | flat w/ commit-trim | `mlx_whisper` wrap | stay on Whisper, sub-3s partials |
| **WhisperPipe (3-buffer)** | ✅ | ✅ | ~89ms (GPU) / est. ~200–400ms M2 | **flat, zero growth 150min** | custom impl | hardened always-on |
| **Moonshine v2 (incremental add)** | ✅ (if decoupled) | ✅ **native** | **50–258ms** | **flat (sliding-window)** | `onnxruntime` + CoreML | best streaming UX, EN |
| **faster-whisper BatchedInferencePipeline** | ✅ (if decoupled) | ❌ (batch) | per-chunk | flat | already installed | offline / utterance batches |
| **Deepgram/AssemblyAI cloud** | ✅ | ✅ | ~150–300ms | n/a (cloud) | API + $/hr | reference architecture; not local |

---

## Sources

**Capture / decoupling / zero-drop audio**
- [Real-Time Voice Streaming and Stateful Buffering — Blake Cook (Feb 2026)](https://www.probableodyssey.blog/tech/real-time-voice-streaming-and-stateful-buffering/)
- [python-rtmixer (PortAudio ring buffer vs queue.Queue)](https://python-rtmixer.readthedocs.io/en/0.1.1/)
- [python-sounddevice issue #76 — concurrent record/process](https://github.com/spatialaudio/python-sounddevice/issues/76)
- [Baseten — Zero to real-time transcription (Whisper V3 streaming)](https://www.baseten.co/blog/zero-to-real-time-transcription-the-complete-whisper-v3-websockets-tutorial/)
- [USPTO 7349844 — dual-access buffering for speech recognition](https://image-ppubs.uspto.gov/dirsearch-public/print/downloadPdf/7349844)

**Streaming Whisper (LocalAgreement / whisper-streaming)**
- [ufal/whisper_streaming (GitHub)](https://github.com/ufal/whisper_streaming)
- [Turning Whisper into Real-Time Transcription System (arXiv 2307.14743)](https://arxiv.org/html/2307.14743)
- [RealtimeVoiceKIT — Real-Time Whisper Transcription](https://realtimevoicekit.com/en/blog/real-time-whisper-transcription-online)
- [Picovoice — Whisper for real-time (no streaming capability)](https://picovoice.ai/blog/whisper-speech-to-text-for-real-time-transcription/)
- [Voibe — Whisper alternatives (no native streaming)](https://www.getvoibe.com/resources/openai-whisper-alternatives/)

**whisper.cpp streaming**
- [whisper.cpp stream example](https://github.com/ggml-org/whisper.cpp/blob/master/examples/stream/README.md)
- [whisper.cpp discussion #3314 — efficient streaming](https://github.com/ggml-org/whisper.cpp/discussions/3314)
- [whisper.cpp discussion #297 — audio_ctx](https://github.com/ggml-org/whisper.cpp/discussions/297)
- [whisper.cpp discussion #206 — chunking + context retention](https://github.com/ggml-org/whisper.cpp/discussions/206)

**faster-whisper / chunking**
- [SYSTRAN/faster-whisper (GitHub)](https://github.com/SYSTRAN/faster-whisper)
- [Speeding up Whisper — mobiusml (BatchedInferencePipeline, 12.5×)](https://mobiusml.github.io/batched_whisper_blog/)
- [Local AI Master — faster-whisper guide (no streaming)](https://localaimaster.com/blog/faster-whisper-guide)
- [faster-whisper issue #954 — use_vad_model quality](https://github.com/SYSTRAN/faster-whisper/issues/954)
- [openai/whisper-large-v3 card — 30s receptive field](https://huggingface.co/openai/whisper-large-v3)
- [saytowords — Whisper audio chunking (2–3s overlap)](https://www.saytowords.com/blogs/Whisper-Audio-Chunking/)
- [Yoad Snapir — Whisper long-form transcription](https://medium.com/@yoad/whisper-long-form-transcription-1924c94a9b86)

**WhisperPipe (the double-buffer reference architecture)**
- [WhisperPipe (arXiv 2604.25611, April 2026)](https://arxiv.org/abs/2604.25611)
- [WhisperPipe PDF](https://arxiv.org/pdf/2604.25611)
- [CatalyzeX — WhisperPipe](https://www.catalyzex.com/paper/whisperpipe-a-resource-efficient-streaming)
- [audio-paper-digest — WhisperPipe summary](https://nanless.github.io/audio-paper-digest-blog/posts/2026-04-29-whisperpipe-a-resource-efficient-streaming/)

**Moonshine (streaming-native STT)**
- [moonshine-ai/moonshine (GitHub)](https://github.com/moonshine-ai/moonshine)
- [Moonshine v2 paper (arXiv 2602.12241)](https://arxiv.org/abs/2602.12241) · [HTML](https://arxiv.org/html/2602.12241v1)
- [Pushing the Limits of On-Device Streaming ASR (arXiv 2604.14493)](https://arxiv.org/html/2604.14493v1)
- [Moonshine Streaming — HuggingFace docs](https://huggingface.co/docs/transformers/en/model_doc/moonshine_streaming)
- [modelslab — Moonshine vs Whisper benchmark](https://modelslab.com/blog/audio-generation/moonshine-vs-whisper-asr-real-time-2026)
- [onresonant — Best Local STT 2026](https://www.onresonant.com/resources/local-stt-models-2026)
- [YUV.AI — Moonshine 5× faster for edge](https://yuv.ai/blog/moonshine)
- [ONNX Runtime CoreML Execution Provider](https://onnxruntime.ai/docs/execution-providers/CoreML-ExecutionProvider.html)
- [xaviviro/onnxruntime-coreml](https://github.com/xaviviro/onnxruntime-coreml) · [cansik/onnxruntime-silicon](https://github.com/cansik/onnxruntime-silicon)

**Commercial streaming STT (reference architectures)**
- [Deepgram — Streaming Speech Recognition API](https://deepgram.com/learn/streaming-speech-recognition-api)
- [Deepgram — Interim Results](https://developers.deepgram.com/docs/interim-results)
- [Deepgram — Endpointing](https://developers.deepgram.com/docs/endpointing)
- [Deepgram — End-of-Speech detection](https://developers.deepgram.com/docs/understanding-end-of-speech-detection)
- [Deepgram — Utterance End](https://developers.deepgram.com/docs/utterance-end)
- [AssemblyAI — Universal-Streaming](https://www.assemblyai.com/universal-streaming)
- [AssemblyAI — Streaming docs](https://www.assemblyai.com/docs/streaming)
- [AssemblyAI — Real-Time Speech-to-Text guide](https://www.assemblyai.com/blog/real-time-speech-to-text)
- [Google Cloud STT — Voice activity events](https://docs.cloud.google.com/speech-to-text/docs/voice-activity-events)
- [Google Cloud STT — Single utterance](https://cloud.google.com/speech-to-text/v2/docs/single-utterance)
- [Google Cloud STT — Streaming recognize](https://docs.cloud.google.com/speech-to-text/docs/streaming-recognize)
- [AssemblyAI — Best APIs/models for real-time STT 2026](https://www.assemblyai.com/blog/best-api-models-for-real-time-speech-recognition-and-transcription)

**Disfluent / paused speech + endpointing research**
- [Next-Turn — duration-aware streaming endpoint detection (arXiv 2606.18094)](https://arxiv.org/html/2606.18094v1)
- [Two-pass endpoint detection for speech recognition (arXiv 2401.08916)](https://arxiv.org/html/2401.08916v1)
- [Streaming Joint Speech Recognition and Disfluency Detection (arXiv 2211.08726)](https://arxiv.org/abs/2211.08726)
- [Grid-LSTM endpoint detection for streaming ASR](https://www.researchgate.net/publication/319184999_Endpoint_Detection_Using_Grid_Long_Short-Term_Memory_Networks_for_Streaming_Speech_Recognition)
- [Turn-Taking Prediction for Natural Conversational Speech (arXiv 2208.13321)](https://arxiv.org/pdf/2208.13321)
- [Picovoice — Latency in speech recognition](https://picovoice.ai/blog/latency-in-speech-recognition/)

**Cross-lane (sibling deliverables)**
- `08-local-stt.md` — model choice (Whisper-turbo-MLX primary), AEC, Moonshine intro, Parakeet no-streaming
- `11-vad-nonfluent.md` — VAD endpointing, pause tolerance, Silero params, two-stage endpoint (R1-VAD)
- `01-architectures.md` — thin-glue-loop architecture, streaming cascade pipeline
- `00-MASTER-RECOMMENDATION.md` — synthesized blueprint (this lane refines the STT-streaming leg)

**Marcel's existing code (grounding, via L8)**
- `_SYSTEM/Scripts/voice/parakeet-listen.py` — current stop→decode→listen loop (the bug this lane fixes)
- `_SYSTEM/state/voice/.venv-stt/` — parakeet_mlx, mlx; add `onnxruntime` (+ CoreML EP) for Moonshine
- HyperX SoloCast (input) + Sony XM5 (output) — split devices trivialize half-duplex; AEC optional
