# Local STT Optimization — M2 Pro Voice Assistant

> **Lane 8 / Researcher.** Scope: speech-to-text on an M2 Pro (16GB, 19-core GPU) for an always-on
> Jarvis-style voice assistant. Covers model choice, VAD tuning, echo cancellation, and streaming.
> Grounded in Marcel's actual code (`parakeet-listen.py`, `mic-vad-check.py`, `mic-toggle.sh`) and
> his subscriptions/hardware. All cost claims are free unless flagged.

---

## TL;DR — the decision in one screen

| Dimension | Recommendation | Why |
|---|---|---|
| **Primary STT model (rebuild default)** | **Whisper large-v3-turbo (MLX, Q4)** as the always-on listener | Boring + proven for a from-scratch rebuild: 4 Apple Silicon backends (MLX, whisper.cpp, WhisperKit/CoreML, faster-whisper) = escape hatches when one breaks. Streaming wrappers exist (whisper-streaming). Hallucination is solved engineering (VAD prefilter + temp=0 + compression_ratio). Native EN+DE, 99 languages. 809M, ~1.6GB, fits 16GB trivially. |
| **Experiments / accuracy track** | **Parakeet-MLX `parakeet-tdt-0.6b-v3`** — try it, benchmark in Marcel's room/mic, swap in if it proves more reliable | Better WER (6.32% vs 7.44%), no silence-hallucination, auto-punctuation, ~100× realtime. BUT: single-maintainer MLX port, no stateful streaming, 1 ecosystem path. Best-in-class on paper; treat as the candidate to beat, not the default to depend on. |
| **VAD** | **Replace energy-RMS with Silero VAD** (already in the pipecat venv) | RMS thresholding is mic-gain-dependent and misses quiet speech / false-triggers on HVAC. Silero is purpose-built, ~free CPU cost, Marcel already has it. Pipecat default `confidence=0.7` is too strict for an always-on assistant — tune to **0.5–0.6**. |
| **Echo cancellation (#1 problem)** | **Software AEC via WebRTC** (`aec-audio-processing`) feeding the reference TTS stream — NOT the current `pgrep afplay` half-duplex mute | Half-duplex = no barge-in (can't interrupt Rick while he talks). WebRTC AEC subtracts the known TTS output → enables full-duplex + interruption. Headphones (XM5) make AEC trivial; speakers make it mandatory. |
| **Streaming** | **Add partial transcription** — Parakeet-MLX does NOT support stateful streaming (its `chunk_callback` re-encodes each chunk). For true streaming consider **Moonshine** (245M, 107ms latency, MIT) or a sliding-window re-decode loop. | Lowers perceived latency from "wait for silence + full decode" to "words appear as you speak." Biggest UX win after AEC. |

**Bottom line for the rebuild:** Whisper-turbo-MLX-Q4 (primary, proven) + Silero VAD + WebRTC AEC +
streaming partials. Drop the `pgrep afplay` echo gate entirely — it's the architectural source of the
feedback-loop pain and the reason barge-in doesn't work. Parakeet-MLX is the experiments track: benchmark
it in Marcel's actual room/mic and swap in *only if* it proves more reliable than Whisper — don't make a
from-scratch architecture depend on a single-maintainer port.

---

## 1. Whisper MLX — is LARGE_V3_TURBO_Q4 the best model?

### Where Marcel's current choice stands

`mlx-community/whisper-large-v3-turbo` (809M params, ~1.6GB, Q4 quantized) is **the correct 2026 default**
for Whisper on Apple Silicon. It is not a wrong choice — it's the best Whisper model for the hot loop. The
question is whether Whisper should be the hot loop *at all* (see §2).

**Why turbo is right (if you stay on Whisper):**
- Decoder pruned 32→4 layers vs large-v3: **6× faster**, accuracy within 1–2% WER.
- 809M params (smaller than 1.55B large-v3, slightly larger than 769M medium).
- MLX framework gives **2.0× speedup over whisper.cpp** for the same turbo model on Apple Silicon.
- Fits comfortably in 8GB; trivial on Marcel's 16GB.
- WER 13.40% on YouTube-commons long-form vs large-v3's 13.20% — statistically tied.

Sources: [llimllib MLX benchmark](https://notes.billmill.org/dev_blog/2026/01/updated_my_mlx_whisper_vs._whisper.cpp_benchmark.html) (mlx 2.0× faster than whisper.cpp for turbo) · [Whisper Notes turbo vs v3](https://whispernotes.app/blog/introducing-whisper-large-v3-turbo) (13.40% vs 13.20% WER, 5× faster on Mac) · [promptquorum](https://www.promptquorum.com/local-llms/apple-silicon-whisper-metal-benchmark) (turbo = sweet spot for realtime on Macs).

### Model size ladder on M2 Pro (whisper.cpp + Metal, Marcel's exact chip)

Grounded M2 Pro (19-core GPU) RTF numbers — lower = faster, <1.0 = faster than realtime:

| Model | Params | Disk | RAM | WER (EN clean) | RTF (M2 Pro, Metal) | Verdict |
|---|---|---|---|---|---|---|
| tiny | 39M | 75MB | 200MB | ~8% | ~0.02 | Too inaccurate for an assistant |
| base | 74M | 142MB | 350MB | ~5.5% | ~0.04 | Marginally usable, not recommended |
| small | 244M | 466MB | 900MB | ~3.4% | ~0.05 | Good fallback if RAM-constrained |
| medium | 769M | 1.5GB | 2.5GB | ~2.9% | ~0.20 | Best pure-Whisper accuracy/speed balance |
| **large-v3-turbo** | **809M** | **1.6GB** | **~3GB** | **~2.5–3%** | **~0.20** | **Marcel's current choice — correct** |
| large-v3 | 1.55B | 3GB | 5GB | ~2.5% | ~0.45 | Only if max accuracy matters; slower |

Source: [getspeakup whisper.cpp benchmark](https://getspeakup.app/blog/whisper-cpp-benchmark-mac/) (M2/M2 Pro
RTF per model size, RAM figures). Note: MLX-whisper runs ~2× faster than whisper.cpp for the same model,
so MLX RTF is roughly half these numbers.

### distil-whisper — when it beats turbo

`distil-whisper/distil-large-v3` distills large-v3 to **~50% fewer parameters, ~6× faster, WER within ~1%**
of the original. It is *faster* than turbo and nearly as accurate.

- **Use distil-large-v3** when: you want minimum decode latency on the hot loop and can tolerate marginal
  accuracy loss vs turbo.
- **Use turbo** when: you want the larger OpenAI-supported ecosystem, better multilingual, and the decoder
  isn't your bottleneck (it usually isn't — VAD + AEC + network dominate).

For an always-on assistant where the decode is ~10–50ms either way, the turbo-vs-distil difference is
**not perceptible**. Don't optimize here until VAD and AEC are solved.

Sources: [promptquorum whisper.cpp vs faster-whisper](https://www.promptquorum.com/power-local-llm/local-whisper-stt-comparison-2026) (distil-large-v3 ~50% params, ~6× faster, <1% WER delta) · [distil-whisper paper](https://arxiv.org/pdf/2311.00430).

### Whisper's one real weakness for voice assistants

Whisper **does not support native streaming**. It processes fixed 30-second windows. Every "streaming
Whisper" implementation (whisper_streaming, faster-whisper-server) is a **sliding-window re-decode hack**:
re-run inference on overlapping chunks and emit the stable prefix ("LocalAgreement" policy). This works but
adds 1–3s latency and burns compute re-decoding the same audio. If low-latency streaming is the goal,
Whisper is architecturally the wrong choice — Parakeet-TDT or Moonshine are built for it.

Sources: [Picovoice](https://picovoice.ai/blog/whisper-speech-to-text-for-real-time-transcription/) ("Whisper does not have streaming STT capability") · [Voibe](https://www.getvoibe.com/resources/openai-whisper-alternatives/) ("faster-whisper and whisper.cpp do not support native streaming").

---

## 2. Parakeet MLX — how it compares to Whisper for realtime voice use

### Marcel already has it working

`parakeet-listen.py` runs `mlx-community/parakeet-tdt-0.6b-v3` at float32 and the header claims ~100×
realtime on Apple Silicon. That claim is plausible and I confirmed the package (`parakeet_mlx 0.5.2`) is
installed in `_SYSTEM/state/voice/.venv-stt`. **For a 0.6B model, 100× realtime means a 1-second utterance
decodes in ~10ms** — trivially inside any voice-assistant latency budget.

### Head-to-head: Parakeet-TDT-0.6B-v3 vs Whisper large-v3-turbo

| Metric | Parakeet-TDT 0.6B v3 | Whisper large-v3-turbo | Winner |
|---|---|---|---|
| Params | 600M | 809M | Parakeet (smaller) |
| WER (Open ASR Leaderboard, multi) | **6.32%** | 7.44% | **Parakeet** |
| WER (EN clean, LibriSpeech) | ~2.6% | ~2.1% | Whisper (marginal) |
| WER (accented/noisy EN) | lower | **higher** (hallucinates on noise/silence) | **Parakeet** |
| Languages | 25 (European) | 99+ | Whisper |
| Silence hallucination | **none** (trained on 36k hrs noise/non-speech) | known issue | **Parakeet** |
| Auto punctuation + casing + word timestamps | **yes, out of the box** | partial | **Parakeet** |
| Streaming architecture | **TDT = native streaming-friendly** | no (30s window hack) | **Parakeet** |
| Apple Silicon ecosystem maturity | 1 path (parakeet-mlx) | 4 paths (faster-whisper, WhisperKit/CoreML, MLX, whisper.cpp) | **Whisper** |
| VRAM (full NeMo config) | 16+ GB | 6–10 GB | Whisper |

Sources: [Local AI Master parakeet vs whisper](https://localaimaster.com/blog/parakeet-vs-whisper) (6.32% vs 7.44% WER, ~3333× realtime, no silence hallucination) · [snailtext](https://snailtext.app/blog/whisper-vs-parakeet-tdt/) (clean EN statistically tied; Whisper wins accented/noisy) · [Northflank](https://northflank.com/blog/best-open-source-speech-to-text-stt-model-in-2026-benchmarks) (Parakeet/Distil-Whisper best for low-latency streaming).

### The "Parakeet is bad on Apple Silicon" claim — reconciled

Arun Baby's widely-cited article ([source](https://www.arunbaby.com/speech-tech/0073-whisper-vs-parakeet-asr-decision/))
argues Parakeet is a poor Apple Silicon fit: "16+ GB VRAM," "2.6× slower on MLX than Whisper on CoreML,"
"22GB on M4 Max." **This is half-right and needs nuance for Marcel's case:**

1. **The 16GB+/22GB figures apply to full NeMo/CUDA configs and larger Parakeet variants**, not the
   0.6B MLX port Marcel runs. The 0.6B MLX model is ~2.4GB at float32 and Marcel has 16GB unified — it fits
   with headroom.
2. **"2.6× slower than Whisper-on-CoreML" is a relative-throughput claim about batch processing**, not an
   absolute-feasibility claim. 0.6B on MLX at 100× realtime is *plenty* fast for a single-stream voice
   assistant. The slowness matters for batch transcription farms, not for one listener process.
3. **The ecosystem-maturity argument is real** — if parakeet-mlx breaks, Marcel has one community package
   to fix. Whisper has four production backends. This is the strongest reason to keep Whisper as a fallback.

**Conclusion for Marcel — the from-scratch rebuild flips the default.** Arun Baby is right on the
operational axis and wrong to over-weight raw benchmarks. The 1.1pp WER gap (6.32% vs 7.44%) is **academic**
for voice-assistant command-and-control — reliability, latency-under-load, and "I can ship this and forget
it" dominate at that margin. For a *from-scratch rebuild* whose explicit goal is killing the feedback loop
and enabling barge-in, **default to Whisper-turbo-MLX-Q4**: it has four Apple Silicon escape hatches, mature
streaming wrappers, and the hallucination problem is *solved engineering* (VAD prefilter + `temperature=0`
 `compression_ratio` threshold), not a research risk. Parakeet-MLX stays as the **experiments track** —
benchmark it in Marcel's actual room/mic, and swap it in *only if* it proves more reliable than Whisper in
practice. Don't make a clean architecture depend on a single-maintainer MLX port on day one. The technical
analysis above still stands (Parakeet wins on paper); the *recommendation* changes because "boring and
proven" is the right default for a rebuild you don't want to debug at 2am.

### The streaming limitation Marcel needs to know about

I read the installed `parakeet_mlx/parakeet.py` source. The `generate()` method accepts `chunk_duration`
and `chunk_callback`, but these **split a long file into independently-re-encoded chunks for batch
processing** — they do NOT cache encoder state across chunks. Each call re-runs `get_logmel()` and a fresh
forward pass. **There is no stateful incremental decoding.** So Marcel's current design
(buffer-until-silence → one `generate()` call) is the only mode parakeet-mlx supports today. True
streaming partials require either (a) a sliding-window re-decode loop Marcel writes himself, or
(b) switching to Moonshine (see §5).

---

## 3. VAD tuning — Silero parameters for voice-assistant use

### Marcel's current VAD is energy-RMS, not Silero

`parakeet-listen.py` uses **plain RMS thresholding** (`SILENCE_RMS=0.012`): if the frame's root-mean-square
amplitude exceeds the threshold, it's "speech." This is the wrong tool for an always-on assistant:

- **Mic-gain-dependent.** Change input gain or swap mics and the threshold is stale.
- **Can't distinguish speech from noise.** HVAC, keyboard, mouse clicks, chair creaks, and the TTS bleed all
  exceed 0.012 RMS → false triggers.
- **Misses quiet speech.** Whispered or distant speech falls below 0.012 → dropped utterances.

Marcel **already has Silero VAD** installed (pipecat venv, `mic-vad-check.py` imports
`pipecat.audio.vad.silero.SileroVADAnalyzer`). The check script exists precisely to diagnose "Silero can't
recognize this audio" vs "Pipecat isn't wiring the VAD." **Switch the listener from RMS to Silero.**

### Silero VAD parameters (Pipecat `SileroVADAnalyzer` defaults + tuning)

From the [Pipecat docs](https://docs.pipecat.ai/server/utilities/audio/silero-vad-analyzer) and
[Silero FAQ](https://github.com/snakers4/silero-vad/wiki/FAQ):

| Parameter | Pipecat default | Recommended for always-on assistant | Rationale |
|---|---|---|---|
| `confidence` | **0.7** | **0.5–0.6** | 0.7 is tuned for telephony (clean signal). For a desktop mic in a room, 0.7 misses quiet speech. 0.5 catches whispers; pair with `min_volume` to reject noise. |
| `start_secs` | 0.2 | **0.1–0.15** | How long speech must persist before SPEAKING state. 0.2s adds perceptible delay before capture begins; 0.1s is snappier. |
| `stop_secs` | 0.2 | **0.5–0.8** | Silence required to end an utterance. 0.2s is too aggressive (cuts off natural pauses mid-sentence). Marcel's RMS script already uses 0.8s hang — keep that. |
| `min_volume` | 0.6 | **0.3–0.4** | Secondary gate below the confidence check. 0.6 rejects too much; 0.3 lets quiet speech through while Silero's confidence does the real discrimination. |

**The key insight:** Silero's `confidence` is a *speech-probability* output (0–1), not an amplitude gate.
It's trained to distinguish speech-shaped spectra from noise-shaped spectra. A confident 0.6 on quiet speech
beats a high RMS on a chair creak. This is why it beats RMS thresholding for an assistant.

### Avoiding false triggers without missing quiet speech

The tension: low threshold → false triggers (HVAC, TTS bleed); high threshold → missed whispers. Resolve it
with a **layered gate**, not a single threshold:

1. **Silero confidence ≥ 0.5** (speech-shape detection — rejects HVAC, fans, typing).
2. **min_volume ≥ 0.3** (amplitude floor — rejects very low-level noise Silero occasionally flags).
3. **min_speech_duration ≥ 250ms** (rejects blips: coughs, clicks, door slams).
4. **min_silence_duration ≥ 500ms** before declaring end-of-utterance (avoids fragmenting sentences).
5. **AEC-cleaned signal** (§4) — run VAD on the echo-cancelled stream, not raw mic.

Silero also auto-resets its internal state every 5 seconds (per Pipecat docs) to bound memory — useful for
an always-on process.

### Hysteresis (built into raw Silero, not Pipecat's wrapper)

The raw Silero model uses **0.15 hysteresis**: the end-of-speech threshold is automatically 0.15 below the
start threshold. This prevents rapid speech/silence toggling. Pipecat's wrapper approximates this with
`start_secs`/`stop_secs` timing instead. If Marcel uses raw `silero-vad` (ONNX) rather than Pipecat's
wrapper, set `threshold=0.5` and let the 0.15 hysteresis handle the rest.

Sources: [Pipecat SileroVADAnalyzer docs](https://docs.pipecat.ai/server/utilities/audio/silero-vad-analyzer) · [Silero FAQ](https://github.com/snakers4/silero-vad/wiki/FAQ) · [pyVideoTrans VAD tuning](https://pyvideotrans.com/en/vad) · [LOPs Vad Silero Operator](https://docs.dotsimulate.com/operators/pipelines/vad_silero/).

---

## 4. Echo cancellation — the #1 voice-assistant problem on Mac

### Why Marcel has this problem

Marcel's current echo fix is **half-duplex muting**: `rick_speaking()` checks `pgrep -x afplay` and, if Rick
(TTS) is talking, the listener ignores the mic entirely plus a 0.6s cooldown. This *prevents* the feedback
loop (Rick's voice → mic → STT → "what did you say?") but at a steep cost:

- **No barge-in.** Marcel cannot interrupt Rick mid-sentence. He must wait for TTS to finish + 0.6s.
  This is the single biggest "doesn't feel like Jarvis" defect.
- **Fragile.** `pgrep afplay` assumes TTS plays through `afplay`. If TTS backends change (mlx-audio,
  kokoro, pip), the gate silently breaks.
- **Wastes 0.6s** of dead air after every Rick turn.

### The correct architecture: full-duplex AEC + barge-in

The industry-standard solution is **Acoustic Echo Cancellation**: feed the *known* TTS output waveform as a
"reference signal" to an adaptive filter, which subtracts it from the mic input *before* VAD/STT see it.

```
TTS audio ──┬──────────────────► speaker ──► room ──► mic
            │                                        │
            └──► reference ──► AEC filter ◄──────────┘
                                    │
                                    ▼
                          echo-cancelled mic ──► VAD ──► STT
```

With AEC, VAD runs on a clean signal and **detects Marcel's speech even while Rick is talking** → barge-in
works. This is how every phone speakerphone and smart speaker works.

Source: [FireRedChat barge-in architecture](https://arxiv.org/pdf/2509.06502) · [USPTO 6098043](https://image-ppubs.uspto.gov/dirsearch-public/print/downloadPdf/6098043) (line echo cancellation for barge-in).

### Software AEC options for Python on macOS

| Option | What it is | Fit for Marcel |
|---|---|---|
| **`aec-audio-processing`** (PyPI) | Python bindings to **WebRTC Audio Processing** — AEC + noise suppression + AGC + VAD in one. Battle-tested (Chrome/Meet use the same DSP). | **Recommended.** Integrates with sounddevice; `set_stream_delay()` handles the mic→speaker latency. Free. |
| `webrtc-audio-processing` | Lower-level WebRTC bindings (just the DSP, no Python ergonomics). | If Marcel wants minimal deps. |
| **Speex MDF** | The Speex codec's echo canceller (multidelay block frequency-domain filter). Lightweight. | Viable but older; WebRTC is better-maintained. |
| NLMS/RLS adaptive filters (`adaptfilt`, Python-AEC-Library) | Textbook adaptive filters from scratch. | **Avoid** — reinventing WebRTC's wheel; worse convergence. |

**Critical AEC implementation detail (from the Speex paper):** the reference signal must arrive at the
filter *slightly before* the echo appears in the mic input. The `set_stream_delay()` parameter must be
calibrated to Marcel's actual device latency (mic buffer + speaker buffer + air propagation). Too-short
delay = residual echo; too-long = filter can't track. Calibrate by playing a known tone and measuring
round-trip delay.

Sources: [aec-audio-processing PyPI](https://pypi.org/project/aec-audio-processing/) · [webrtc-audio-processing PyPI](https://pypi.org/project/webrtc-audio-processing/) · [Speex paper (arXiv 1602.08668)](https://arxiv.org/pdf/1602.08668) (delay + tail-length requirements) · [Python-AEC-Library](https://github.com/Keyvanhardani/Python-Acoustic-Echo-Cancellation-Library).

### macOS native AEC (CoreAudio) — why it's hard for a Python app

macOS *does* have a built-in voice processor: `AUVoiceProcessing` / `VoiceProcessingIO` audio unit performs
AEC, AGC, and noise suppression at the OS level (this is what FaceTime/Zoom use). **But**:

1. **Both input AND output nodes must be in voice-processing mode** simultaneously. A Python app using
   `sounddevice` (PortAudio) doesn't get access to the CoreAudio AUVoiceProcessing graph — PortAudio opens
   raw devices.
2. **AUVoiceProcessing reduces mic + speaker gain** (known macOS behavior), which fights Marcel's gain
   tuning.
3. **macOS historically can't route all system audio through one CoreAudio stream** — so OS-level AEC only
   works if *your app* owns both the playback and capture, not if you want to cancel arbitrary system audio.

**Practical path:** if Marcel rebuilds the assistant as a **native Swift app** (or uses `AVAudioEngine`
with `setVoiceProcessingEnabled(true)` on both nodes), he gets OS-level AEC for free. If he stays in Python
(via sounddevice/PortAudio), he must do **software AEC** (`aec-audio-processing`) by feeding the TTS
reference himself. The Python path is more work but keeps the architecture Marcel knows.

Sources: [Apple Developer Forums — AUVoiceProcessing](https://developer.apple.com/forums/thread/733733) (both nodes required, gain reduction) · [AVAudioEngine VoIP thread](https://developer.apple.com/forums/thread/97679) · [mumble issue #1775](https://github.com/mumble-voip/mumble/issues/1775) (macOS can't route all system audio).

### Hardware solutions (Marcel's XM5 headphones)

**Headphones eliminate the acoustic echo path entirely** — if Rick's TTS plays into the XM5s over
Bluetooth, the closed-back cans don't leak into the HyperX mic. In headphone mode, AEC is nearly
unnecessary (residual bleed is minimal). The problem is **speaker mode** (TTS through Mac speakers), where
the feedback loop is wide open.

**Recommendation:**
- **Headphone mode (default):** lightweight AEC or even just the existing mute-gate is fine. The XM5s do
  the acoustic isolation. Keep `min_volume` higher here.
- **Speaker mode:** mandatory software AEC. This is where the rebuild must invest. Detect output device
  and enable AEC only when speakers are active (saves CPU in headphone mode).

The "mute mic during TTS" pattern Marcel uses is a valid *fallback* for speaker mode if AEC proves flaky,
but it must be upgraded to a proper barge-in-capable gate: mute STT *injection* during TTS but keep
capturing, run AEC, and if VAD detects speech mid-TTS, **cut the TTS playback** (kill `afplay` / stop the
audio stream) and process the interrupt. That gives barge-in without full AEC correctness.

---

## 5. Streaming STT — real-time partial transcription

### Why streaming matters for an assistant

Current flow (Marcel's `parakeet-listen.py`): speak → pause 0.8s → VAD fires → decode entire utterance →
inject. **Perceived latency = 0.8s (silence hang) + decode time + injection.** For a 3s utterance that's
~1s of dead air after Marcel stops talking before anything happens.

Streaming flow: speak → partials appear every ~200–500ms → final on silence. **Perceived latency ≈ decode
of the last chunk only.** The assistant can start LLM processing on the partial before the user finishes.
This is the difference between "feels alive" and "feels like a walkie-talkie."

### What supports true streaming (stateful incremental decode)

| Model/Engine | True streaming? | Latency | Notes |
|---|---|---|---|
| **Moonshine** (Useful Sensors) | **Yes — purpose-built** | **107ms on MacBook Pro** | 245M params, 6.65% WER (beats Whisper large-v3), MIT license (EN). Sliding-window Transformer w/ cached encoder state — minimal token revision. **Best streaming option for Apple Silicon.** |
| **Parakeet-TDT** (NVIDIA GPU) | Yes (TDT architecture) | low | Native streaming *on CUDA*. The MLX port (`parakeet_mlx`) does NOT expose stateful streaming — confirmed from source. |
| **sherpa-onnx** (Next-gen Kaldi) | **Yes — OnlineRecognizer** | minimal | Streaming zipformer/transducer models, onnxruntime-only, 2026 model refreshes. Lightweight, resource-constrained-friendly. Good Apple Silicon story via CoreML EP. |
| Whisper (any backend) | **No** — sliding-window hack | 1–3s | `whisper_streaming` / `faster-whisper-server` re-decode overlapping chunks + LocalAgreement. Works, but wasteful. |
| faster-whisper | No (chunked batch) | near-realtime with 1s chunks | Near-zero-latency *on CUDA GPU*; CPU-only on Mac so slower. |

Sources: [onresonant local STT 2026](https://www.onresonant.com/resources/local-stt-models-2026) (Moonshine 245M, 107ms, built for streaming) · [Moonshine GitHub](https://github.com/moonshine-ai/moonshine) (caching for streaming, incremental audio) · [modelslab Moonshine vs Whisper](https://modelslab.com/blog/audio-generation/moonshine-vs-whisper-asr-real-time-2026) (107ms latency, 6.65% WER) · [sherpa-onnx DeepWiki](https://deepwiki.com/k2-fsa/sherpa-onnx/2.1-automatic-speech-recognition-(asr)-engine) (OnlineRecognizer streaming) · [ufal/whisper_streaming](https://github.com/ufal/whisper_streaming) (legacy, replaced by SimulStreaming).

### Recommendation for Marcel

**Option A (lowest effort, stays on Parakeet):** write a **sliding-window re-decode loop** around
`parakeet_mlx.generate()`. Buffer 1.5s windows with 0.5s overlap, decode each, emit the stable prefix
(tokens that didn't change across two consecutive decodes). This is the LocalAgreement pattern. Cost:
redundant compute (~2× decode), but Parakeet is 100× realtime so the waste is affordable. Latency: ~500ms
for a stable partial. **No new dependency.**

**Option B (best streaming UX):** add **Moonshine** (`moonshine-streaming-medium`, 245M, MIT) as the
streaming front-end. It caches encoder state and revises minimally — words appear as spoken. Accuracy
(6.65% WER) is slightly worse than Parakeet (6.32%) but in the same class. Use Moonshine for live partials,
optionally re-decode the final utterance with Parakeet for the cleanest text. **Adds one pip dep.**

**Option C (don't stream yet):** if AEC + VAD + model-choice are the priorities, ship utterance-buffered
Parakeet first (it's working) and add streaming in a later iteration. The 0.8s silence-hang is tolerable;
the feedback loop and false triggers are not. **Prioritize §4 (AEC) over §5 (streaming).**

---

## 6. Alternative local STT — faster-than-realtime options

### faster-whisper (CTranslate2)

CTranslate2 backend gives **4× speedup over stock PyTorch Whisper** with identical accuracy, plus INT8
quantization cuts VRAM ~40% and adds another 3–6×.

**The macOS catch:** faster-whisper has **no Metal/GPU support — it runs CPU-only on Mac.** On an M5 Pro,
faster-whisper large-v3 hits ~3× realtime (CPU int8) vs whisper.cpp's ~10× realtime (Metal). **On Apple
Silicon, whisper.cpp/MLX-whisper beat faster-whisper ~3×.** faster-whisper is the right choice on NVIDIA
GPUs and pure-Python Linux pipelines; it is the *wrong* choice as the primary engine on an M2 Pro.

Marcel already has faster-whisper in the `kvoicewalk` venv (spotted in the file scan). Keep it around for
batch/offline transcription jobs where the Python ecosystem (VAD integration, diarization, word timestamps)
matters more than raw speed. **Do not use it for the hot voice loop on M2 Pro.**

Source: [promptquorum](https://www.promptquorum.com/power-local-llm/local-whisper-stt-comparison-2026) ("faster-whisper has no Metal support… whisper.cpp is 3× faster for the same model").

### whisper.cpp (GGML + Metal)

The fastest Whisper backend on Apple Silicon. M2 Pro hits RTF ~0.05 (small) to ~0.20 (turbo) with Metal.
Pure C/C++, no Python dep, integrates via subprocess or ctypes. **Best choice if Marcel wants raw speed
and doesn't need Python-native tensor manipulation.** Downside: less ergonomic than parakeet-mlx for the
utterance-buffered listener pattern Marcel already wrote.

### mlx_whisper / lightning-whisper-mlx

MLX-framework Whisper. `lightning-whisper-mlx` claims 10× faster than whisper.cpp, 4× faster than stock
mlx-whisper. `mlx_whisper` itself is **2.0× faster than whisper.cpp** for the turbo model specifically.
These are the right Whisper backends on Apple Silicon if Marcel wants to stay in the MLX ecosystem
(same framework as parakeet-mlx → shared venv, shared dtype handling). **Marcel's current Q4-turbo-via-MLX
choice is in this family — correct.**

### sherpa-onnx (Next-gen Kaldi)

ONNX-runtime-only framework with **native streaming** (`OnlineRecognizer`), 2026-fresh streaming zipformer
models, and a clean Apple Silicon story via CoreML execution provider. Lightweight — good if Marcel wants
a streaming option that isn't Moonshine. The streaming zipformer models are less accurate than
Parakeet/Whisper on benchmarks but the latency is minimal. **Best "I want streaming + low resource" option
if Moonshine's license (non-commercial for non-English) is a concern** — sherpa-onnx is Apache-2.0.

### Decision matrix for Marcel's M2 Pro

| Use case | Best engine | Why |
|---|---|---|
| Always-on listener (hot loop) | **mlx_whisper large-v3-turbo Q4** | Proven, 4 escape hatches, streaming wrappers, hallucination solved via VAD+temp=0. Parakeet-mlx 0.6B-v3 = experiments track (better WER, swap in if it wins in practice) |
| Accuracy experiments track | **parakeet-mlx 0.6B-v3** | Better WER (6.32% vs 7.44%), no hallucination, auto-punct — benchmark and swap in if it beats Whisper in Marcel's room |
| True streaming partials | **Moonshine** or sherpa-onnx (or whisper-streaming wrapper) | Parakeet-MLX can't stream natively; Whisper streams via LocalAgreement wrapper but isn't built for it |
| Batch/offline transcription | faster-whisper (already installed) | Python ecosystem (diarization, VAD), CPU-only is fine offline |
| Max raw speed, no Python | whisper.cpp + Metal | Fastest Whisper on Apple Silicon |

---

## Recommended rebuild stack (Marcel-specific)

```
┌─────────────┐    16kHz mono    ┌──────────────────┐
│  HyperX mic │ ───────────────► │  sounddevice     │
└─────────────┘                  │  InputStream     │
                                 └────────┬─────────┘
                                          │ raw frames
                          ┌───────────────┼────────────────┐
                          │               ▼                │
                  TTS ref │      ┌───────────────┐         │
             ┌────────────┴──►   │ WebRTC AEC     │◄─┐      │
             │                   │ (aec-audio-    │  │      │
             ▼                   │  processing)   │  │      │
       ┌──────────┐              └───────┬────────┘  │      │
       │ TTS out  │                      │ clean mic │      │
       │ (mlx-    │                      ▼           │      │
       │  audio/  │              ┌───────────────┐   │      │
       │  kokoro) │              │ Silero VAD    │   │      │
       └──────────┘              │ conf=0.5      │   │      │
            │                    │ stop=0.6s     │   │      │
            │ barge-in kill      └───────┬───────┘   │      │
            ◄────────────────────────────┘ speech?   │      │
            │                              │        │      │
            ▼                              ▼        │      │
       (stop TTS if               ┌───────────────┐ │      │
                                 │ Whisper-turbo │ │      │
                                 │ MLX Q4 (or    │ │      │
                                 │ Moonshine for│ │      │
                                 │ partials)    │ │      │
                                 └───────┬───────┘ │      │
                                         │ text    │      │
                                         ▼         │      │
                                 ┌───────────────┐ │      │
                                 │ → brain/LLM   │─┘      │
                                 └───────────────┘        │
                                                          │
                              (reference signal loop) ────┘
```

**Key architectural changes from current `parakeet-listen.py`:**
1. **Delete `rick_speaking()` / `pgrep afplay` gate.** Replace with WebRTC AEC fed by the actual TTS audio
   buffer (not a process check). This is the load-bearing fix.
2. **Delete RMS VAD.** Replace with Silero (`confidence=0.5, stop_secs=0.6, min_volume=0.3`).
3. **Add barge-in:** when Silero fires *during* TTS playback, signal the TTS layer to stop
   (`stream.stop()` / kill the audio thread) and process the interrupt. Keep capturing continuously —
   don't blank the buffer on TTS start.
4. **Optional streaming:** use `whisper-streaming`/`whisper-live` (mature Whisper streaming wrappers), or
   swap in **Moonshine** (245M, stateful streaming, 107ms) for the partial path. Parakeet-MLX can't stream
   natively — only run it as a batch re-decode if you want its accuracy on finalized utterances.
5. **Detect output device:** skip AEC when headphones (XM5) are active; enable when speakers are.

**Cost: $0.** Every component is free/open-source and already compatible with Marcel's subscriptions.
No DeepSeek/GLM/Claude spend required for the STT layer — that budget belongs to the brain.

---

## Sources

**Whisper MLX / model choice**
- [llimllib — mlx_whisper vs whisper.cpp benchmark (Jan 2026)](https://notes.billmill.org/dev_blog/2026/01/updated_my_mlx_whisper_vs._whisper.cpp_benchmark.html)
- [promptquorum — Whisper STT on Apple Silicon: Metal Benchmarks M1–M5](https://www.promptquorum.com/local-llms/apple-silicon-whisper-metal-benchmark)
- [promptquorum — Whisper.cpp vs faster-whisper 2026](https://www.promptquorum.com/power-local-llm/local-whisper-stt-comparison-2026)
- [Whisper Notes — Large V3 Turbo vs V3 on Mac](https://whispernotes.app/blog/introducing-whisper-large-v3-turbo)
- [getspeakup — whisper.cpp Benchmark M1–M4](https://getspeakup.app/blog/whisper-cpp-benchmark-mac/)
- [distil-whisper paper (arXiv 2311.00430)](https://arxiv.org/pdf/2311.00430)
- [lightning-whisper-mlx (GitHub)](https://github.com/mustafaaljadery/lightning-whisper-mlx)

**Parakeet vs Whisper**
- [Arun Baby — Why I chose Whisper over Parakeet (Apr 2026)](https://www.arunbaby.com/speech-tech/0073-whisper-vs-parakeet-asr-decision/)
- [Local AI Master — Parakeet vs Whisper 2026](https://localaimaster.com/blog/parakeet-vs-whisper)
- [snailtext — Parakeet TDT vs Whisper (2026)](https://snailtext.app/blog/whisper-vs-parakeet-tdt/)
- [Northflank — Best open-source STT 2026](https://northflank.com/blog/best-open-source-speech-to-text-stt-model-in-2026-benchmarks)

**VAD**
- [Pipecat — SileroVADAnalyzer docs](https://docs.pipecat.ai/server/utilities/audio/silero-vad-analyzer)
- [Silero VAD FAQ (GitHub Wiki)](https://github.com/snakers4/silero-vad/wiki/FAQ)
- [pyVideoTrans — VAD Parameter Adjustment](https://pyvideotrans.com/en/vad)
- [LOPs — Vad Silero Operator](https://docs.dotsimulate.com/operators/pipelines/vad_silero/)

**Echo cancellation**
- [aec-audio-processing (PyPI)](https://pypi.org/project/aec-audio-processing/)
- [webrtc-audio-processing (PyPI)](https://pypi.org/project/webrtc-audio-processing/)
- [Speex echo cancellation (arXiv 1602.08668)](https://arxiv.org/pdf/1602.08668)
- [Apple Developer Forums — AUVoiceProcessing](https://developer.apple.com/forums/thread/733733)
- [Apple Developer Forums — AVAudioEngine VoIP](https://developer.apple.com/forums/thread/97679)
- [FireRedChat — full-duplex voice + barge-in (arXiv 2509.06502)](https://arxiv.org/pdf/2509.06502)
- [Python-Acoustic-Echo-Cancellation-Library (GitHub)](https://github.com/Keyvanhardani/Python-Acoustic-Echo-Cancellation-Library)

**Streaming / alternative STT**
- [Moonshine AI (GitHub)](https://github.com/moonshine-ai/moonshine)
- [onresonant — Best Local STT Models 2026](https://www.onresonant.com/resources/local-stt-models-2026)
- [modelslab — Moonshine vs Whisper 2026](https://modelslab.com/blog/audio-generation/moonshine-vs-whisper-asr-real-time-2026)
- [sherpa-onnx ASR engine (DeepWiki)](https://deepwiki.com/k2-fsa/sherpa-onnx/2.1-automatic-speech-recognition-(asr)-engine)
- [ufal/whisper_streaming (GitHub)](https://github.com/ufal/whisper_streaming)
- [faster-whisper (SYSTRAN, GitHub)](https://github.com/SYSTRAN/faster-whisper)

**Marcel's existing code (grounding)**
- `_SYSTEM/Scripts/voice/parakeet-listen.py` — current listener (RMS VAD, pgrep-afplay echo gate)
- `_SYSTEM/Scripts/voice/mic-vad-check.py` — Silero VAD diagnostic (pipecat venv)
- `_SYSTEM/Scripts/voice/mic-toggle.sh` — mic mute flag
- `_SYSTEM/state/voice/.venv-stt/` — parakeet_mlx 0.5.2, mlx 0.31.2
- `parakeet_mlx/parakeet.py` (installed pkg) — confirmed no stateful streaming (chunk_callback = batch split)
