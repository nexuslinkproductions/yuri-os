# VAD Design for Non-Fluent / Paused Speech — Marcel's Voice Pattern

> **Lane 11 / Researcher (R1-VAD).** Scope: how to tune Voice Activity Detection so the assistant
> stops cutting off a slow, thoughtful speaker who pauses 1–3s mid-sentence to think. Covers Silero
> parameter mechanics, adaptive endpointing, two-stage VAD, filler-word continuation signals, and the
> WebRTC-vs-Silero-vs-neural comparison. Grounded in Marcel's actual code (`bot.py`, `stt-bridge.py`,
> `voice-mcp-server.py`, `mic-vad-check.py`) and the pipecat Silero/SmartTurn source in his venv.
> Hardware: HyperX SoloCast → Silero VAD → Whisper-large-v3-turbo MLX, M2 Pro 16GB.
> Cross-references: **L8** (local STT, echo/AEC) · **L12** (streaming STT / continuous-listen mic
> buffering — R2 owns the transcription-across-gaps side) · **L4** (R4, barge-in UX).

---

## TL;DR — the decision in one screen

| Dimension | Recommendation | Why |
|---|---|---|
| **The single highest-leverage fix** | **Wire the `LocalSmartTurnAnalyzerV3` that's already imported in `bot.py:16` into the pipeline.** It's imported and never used — the pipeline only gets `VADProcessor(SileroVADAnalyzer(...))` at `bot.py:384`. SmartTurn IS the two-stage adaptive turn detector this whole research lane is about. | It's installed, MIT-licensed, and purpose-built for exactly Marcel's failure mode: it runs an ML model *during* the post-VAD silence window to decide "thinking pause" vs "real turn-end," then force-commits at 3s. Replaces hand-tuning `stop_secs` with learned context. |
| **Unify the three conflicting VAD configs** | Marcel has **3 different configs that disagree**: `bot.py` (conf 0.6 / start 0.3 / **stop 2.0**), `stt-bridge.py` (conf 0.5 / start 0.15 / **stop 2.5**), `voice-mcp-server.py` (conf 0.6 / start 0.3 / **stop 2.0**). Pick ONE, env-driven, all entry points read it. | Inconsistency means "Yuri cuts me off" is irreproducible — the behavior depends on which script is running. `stt-bridge.py` is the most forgiving; `bot.py`/`voice-mcp` are 500ms more aggressive. |
| **`stop_secs` floor for single-stage Silero** | **≈2.0s is the practical floor** for a thoughtful speaker without a second stage. Below that you cut breath/thought pauses. | Convergent evidence: faster-whisper ships `min_silence_duration_ms=2000` as the production default; Marcel independently landed on 2.0–2.5s; pipecat's own 0.2s default is for fluent telephony, not cognition-paced speech. |
| **`min_volume=0.0` is correct — keep it** | All three of Marcel's scripts already set `min_volume=0.0`. Right call. | Pipecat's default `VAD_MIN_VOLUME=0.6` is EBU-R128 loudness on a 32ms block, which real speech (~0.1–0.3) never reaches → the AND-gate would suppress ALL frames and VAD never fires. `stt-bridge.py:75-78` documents this. |
| **`confidence` (threshold)** | **0.5–0.6.** Marcel's 0.6 is fine; 0.5 (stt-bridge) is marginally more forgiving. Don't go lower. | Silero scores clean speech at ~0.99; 0.5 is the official "lazy good-enough" default. Below ~0.4 you admit HVAC/keyboard noise as speech. |
| **Add Silero hysteresis (`neg_threshold`)** | The pipecat wrapper is **missing the hysteresis** that official Silero and faster-whisper both ship (`neg_threshold = threshold − 0.15`). A single threshold for both enter/exit causes flicker at boundaries. Patch or fork. | Grounded in source diff: `faster_whisper/vad.py:37-38,95` vs pipecat's single `confidence` gate in `vad_analyzer.py:206`. Hysteresis is the cheapest robustness win available. |
| **Two-stage VAD** | **Yes, and it's solved.** Pattern: short VAD `stop_secs` (~0.5–0.8s) fires a *candidate* turn-end → ML confirmation window (SmartTurn / Krisp TT / Next-Turn / Gradium) decides → hard force at a ceiling (3s). | Krisp, Pipecat SmartTurn, Huawei Next-Turn, and Gradium all ship this exact architecture. SmartTurn is already in the venv. |
| **Adaptive `stop_secs`** | **Yes, shipping at scale (patented).** AWS/Alexa adapts EOS threshold from a rolling window of the speaker's inter-word pause times. | US11817117 (speaker-adaptive EOS), US9311932 (predict future threshold from past behavior), US10339918 (adaptive endpoint detector). All describe the same mechanism Marcel needs. |
| **Filler-word detection as continuation** | **Weak signal alone, strong as one feature.** Fillers hold the turn (p<0.001) but the effect is "not as strong as expected" because prosody/syntax carry redundant cues. | Jiang, Ekstedt & Skantze 2023 (arXiv:2305.02101). Don't build a standalone "um-detector"; feed it into the ML turn model where it's one input among many. |
| **WebRTC vs Silero vs neural** | **Silero for the acoustic gate; a neural turn model on top.** WebRTC is worse at detecting *speech* (high false-speech rate) — bad for a speaker whose quiet pauses already look like silence. | Picovoice 2026 benchmark; pyannote issue #604 ("WebRTC much better at detecting silence than speech"). For *pause tolerance specifically*, the model matters less than the endpointing logic layered above it. |

**Bottom line:** Marcel's VAD problem is not a Silero-tuning problem — it's an **endpointing problem being solved at the wrong layer**. He's asking a 32ms acoustic classifier ("is there a voice right now?") to answer a discourse question ("is the user done talking?"). Those are different questions. The fix is to stop tuning `stop_secs` against the wall and run a turn-taking model in the confirmation window — one that's already installed (`LocalSmartTurnAnalyzerV3`) and imported but never wired.

---

## 0. The core confusion: VAD ≠ endpointing ≠ turn-taking

These three get conflated and the conflation is the source of Marcel's pain. Pin them down:

| Layer | Question it answers | Timescale | Marcel's current component |
|---|---|---|---|
| **Acoustic VAD** | "Is there a human voice in this 20–32ms frame?" | milliseconds | Silero ONNX, `voice_confidence()` per 512-sample (32ms) frame |
| **Endpointing (EPD)** | "Has the silence after speech lasted long enough to call it a turn boundary?" | 0.2–3s | Pipecat `VADState` state machine (`stop_secs` hangover) |
| **Turn-taking / Semantic EPD** | "Is the user *meaningfully* done, or just thinking?" | discourse-level | **None — this is the missing layer** (SmartTurn is imported, not wired) |

The Gradium team states the distinction crisply: *"Acoustic VAD answers 'is there a voice right now?' Semantic VAD answers 'is the user done talking?' A 400ms pause mid-sentence is acoustically identical to a 400ms pause at the end of a turn."* ([Gradium, "Semantic VAD"](https://gradium.ai/blog/semantic-vad), 2026-06-02). An energy/Silero detector that fires after 500ms of silence will interrupt the first case and feel sluggish on the second. That is precisely Marcel's bug.

Marcel is currently solving turn-taking at the VAD layer by inflating `stop_secs` to 2.0–2.5s. It works — mostly — but it's a blunt instrument: it makes *every* completed turn wait 2.0–2.5s of dead air before Yuri responds, turning a 200ms conversational gap into a 2500ms one. The two-stage architecture (§5) is how you decouple "don't cut off" from "respond fast."

---

## 1. Silero VAD parameters — what each does, how they interact, the floor

### 1.1 The three naming schemes (read this before any tuning)

Silero's parameters have **three different names** depending on which wrapper you're in. This alone causes half the confusion:

| Concept | Official `snakers4/silero-vad` (`utils_vad.py`) | `faster-whisper` (`vad.py`) | **Pipecat** (Marcel's stack) |
|---|---|---|---|
| Speech probability cutoff | `threshold` (0.5) | `threshold` (0.5) | `confidence` (0.7 default, Marcel: 0.6) |
| Exit/hysteresis threshold | `neg_threshold` (0.35) | `neg_threshold` (0.35) | **— (absent)** |
| Trailing silence before split | `min_silence_duration_ms` (100) | `min_silence_duration_ms` (2000) | `stop_secs` (0.2 default, Marcel: 2.0) |
| Lead-in silence before speech | `min_silence_duration_ms` (start side) | — | `start_secs` (0.2 default, Marcel: 0.3) |
| Min speech to count | `min_speech_duration_ms` (0) | `min_speech_duration_ms` (0) | (implicit: `start_secs` counter) |
| Edge padding | `speech_pad_ms` (30) | `speech_pad_ms` (400) | — |
| Energy gate (post-VAD) | — | — | `min_volume` (0.6 default, Marcel: 0.0) |

Note the **wild divergence in defaults**: official Silero wants only **100ms** of trailing silence; faster-whisper wants **2000ms**; pipecat wants **200ms**. These reflect different use cases (offline chunking vs. real-time telephony vs. streaming ASR gating). Marcel's stack is pipecat, so `stop_secs` is the lever — but the fact that faster-whisper (the most "production transcription" default) ships 2000ms is strong evidence that ~2s is the right neighborhood for speech-not-telephony.

### 1.2 What each pipecat parameter does — the state machine

Pipecat's VAD is a **4-state machine** (`vad_analyzer.py:30-44`), not a single threshold. Understanding the transitions is the whole game:

```
         speaking frame            start_secs worth          stop_secs worth
            (see below)            of speaking frames         of silent frames
   QUIET ──────────────► STARTING ──────────────────► SPEAKING ──────────────► STOPPING ──► QUIET
     ▲                   │                            ▲                        │              │
     │   1 silent frame  │     1 silent frame          │   1 speaking frame     │              │
     └───────────────────┘   resets STARTING→QUIET     └────────────────────────┘              │
         (reject blip)        (reject blip)                 (pause recovered!)                  │
                                                                                                  │
                       turn END fires here ◄────────────────────────────────────────────────────┘
```

A "speaking frame" is defined at `vad_analyzer.py:206` as:

```python
speaking = confidence >= self._params.confidence AND volume >= self._params.min_volume
```

Both must hold. The four parameters control the *durations* in each transition:

- **`confidence`** — the per-frame speech-probability cutoff from the Silero ONNX model. Each 512-sample (32ms @16kHz) audio window gets a score 0.0–1.0; ≥ `confidence` counts as a speaking frame. Silero outputs raw, **unsmoothed** probabilities — there's no temporal smoothing in pipecat, so a single 32ms dip mid-syllable immediately starts the STOPPING counter.
- **`start_secs`** — how many *consecutive* speaking frames are required to promote QUIET→SPEAKING. It's a **one-strike-and-reset** counter: any single non-speaking frame during STARTING drops you back to QUIET (`vad_analyzer.py:220-222`). This is the blip-rejector. Marcel's 0.3s = ~9 consecutive frames — rejects a door-slam but accepts real speech onset.
- **`stop_secs`** — how many *consecutive* silent frames are required to demote SPEAKING→QUIET (the actual turn-end signal). **This is the parameter Marcel is fighting.** Any speaking frame during STOPPING resets the counter and returns to SPEAKING (`vad_analyzer.py:215-217`) — so a recovery within `stop_secs` saves the turn. 2.0s = ~62 consecutive silent frames.
- **`min_volume`** — an **AND-gate** with confidence, using EBU-R128-normalized loudness with exponential smoothing (factor 0.2). It's a *secondary* gate: a frame must pass BOTH the neural confidence AND an energy threshold to count as speech.

### 1.3 The critical parameter interactions (what tuning guides miss)

1. **`confidence` × `min_volume` are AND-ed, not OR-ed.** This is non-obvious and dangerous. If you raise `min_volume` to suppress background noise, you also suppress *quiet speech* — for a slow, low-energy speaker this is fatal. Marcel's `min_volume=0.0` is correct precisely because it removes the energy gate entirely, leaving confidence as the sole arbiter. (The default 0.6 would block all frames; `stt-bridge.py:75-78` documents this.)

2. **`start_secs` and `stop_secs` are asymmetric in reset behavior.** Both are consecutive-frame counters, but `start_secs` resets on ANY silence (one-strike), while `stop_secs` resets on ANY speech. This asymmetry means VAD is *eager to reject* (good for false-start suppression) and *reluctant to end* (good for pause tolerance). The asymmetry already works in Marcel's favor — he just needs `stop_secs` high enough.

3. **No hysteresis = boundary flicker.** Because pipecat uses a single `confidence` for both the SPEECH→SILENCE and SILENCE→SPEECH decision, a frame hovering at exactly 0.6 will flicker STOPPING↔SPEAKING. Official Silero and faster-whisper fix this with `neg_threshold = threshold − 0.15`: a frame needs ≥0.5 to *enter* speech but must drop below 0.35 to *exit* it (`faster_whisper/vad.py:94-95`). The gap (0.35–0.50) is a "stay in current state" band. **Pipecat's wrapper lacks this** (`silero.py:198-225` confirms only `confidence` is consulted). This is the cheapest robustness patch available: add a `neg_confidence` param to the analyzer. Without it, mid-pause confidence jitter can prematurely start the STOPPING clock.

4. **`stop_secs` granularity is 32ms, not continuous.** At 16kHz/512 samples, the counter ticks every 32ms. So `stop_secs=2.0` is really "62 silent frames." You cannot meaningfully tune below ~32ms resolution, and sub-100ms changes are noise.

### 1.4 The theoretical minimum `stop_secs` before cutting off a thoughtful speaker

This is the question Marcel actually asked. Reasoning from the data:

- **Human conversational turn-gap is ~200ms** (Stivers et al. 2009, *PNAS*, 42 languages — median inter-turn silence 194ms). So pipecat's **0.2s default is tuned to the turn-boundary timescale** — it assumes "if it's been quiet 200ms, the other person is about to speak, so I can too." That's *correct for fluent telephony* and *catastrophic for cognition-paced speech*.
- **A breath pause is 200–500ms.** A `stop_secs` below ~0.5s will cut a speaker mid-breath.
- **A "let me think" cognitive pause is 1–3s** (Marcel's reported range). These are not disfluencies — they're working memory load.
- **The empirical convergence:** faster-whisper (the most transcription-fluent default) ships `min_silence_duration_ms=2000`. Marcel independently landed on 2.0–2.5s. These agree.

**Conclusion:** for single-stage Silero VAD on thoughtful speech, **~2.0s is the practical floor.** Below ~1.5s you start cutting breath/thought pauses; below 0.5s you cut mid-breath. But — and this is the key — you **cannot solve the problem by raising `stop_secs` indefinitely**, because every *completed* turn then pays that same 2s as latency. A 2.5s `stop_secs` means Yuri waits 2.5s after Marcel finishes before responding. That's why §5 (two-stage) exists: it lets you keep a *short* acoustic `stop_secs` (fast response on clear turn-ends) while a confirmation layer absorbs the think-pauses.

| `stop_secs` | Effect on thoughtful speech | Effect on responsiveness | Verdict for Marcel |
|---|---|---|---|
| 0.2 (pipecat default) | Cuts every breath/thought pause | Snappy | ❌ unusable |
| 0.5 | Cuts most thought pauses | Snappy | ❌ unusable |
| 1.0 | Cuts long thought pauses | 1s dead air/turn | ⚠️ marginal |
| 1.5–2.0 | Rarely cuts (breath-safe) | 1.5–2s dead air/turn | ✅ **floor for single-stage** |
| 2.5 (stt-bridge) | Almost never cuts | 2.5s dead air/turn | ✅ if no two-stage layer |
| 3.0+ | Never cuts | Sluggish | ⚠️ only with two-stage (force-ceiling) |

---

## 2. Adaptive VAD — implementations that adjust `stop_secs` to the speaker

**Yes, this exists and ships at scale.** The mechanism is well-documented in patents from the major voice platforms, all describing the same idea: measure the speaker's inter-word pause distribution, then set the end-of-speech (EOS) threshold relative to it.

### 2.1 The speaker-adaptive EOS mechanism (AWS/Alexa-scale)

The clearest description is **US11817117, "Speaker adaptive end of speech detection for conversational AI applications"** ([USPTO](https://image-ppubs.uspto.gov/dirsearch-public/print/downloadPdf/11817117)):

1. Capture a **warmup sample** of the speaker's pauses — the patent uses ~25 inter-word silence intervals before the threshold kicks in.
2. Compute a **rate-of-speech** statistic from those intervals: mean, max, min, variance, or a combination.
3. **Adapt the EOS threshold** (the `stop_secs` equivalent) as a function of that statistic.
4. Optionally **persist** the per-speaker threshold across sessions ("a future appropriate pause duration threshold can be predicted based on past behavior").

Companion patents cover the same ground from different angles: **US9311932** ("Adaptive pause detection in speech recognition" — predicts the future threshold from stored past pause durations), **US10339918** ("Adaptive speech endpoint detector" — adjusts the time threshold from the measured distribution of pause durations), and **US7881927** ("Adaptive sidetone and adaptive VAD threshold" — adapts the VAD energy threshold to long-term noise level).

**What this means for Marcel:** a lightweight version is buildable in an afternoon. Log every inter-word silence Marcel produces during a session, keep a rolling window (e.g., last 50 pauses), and set `stop_secs = percentile(95) + 0.3s` margin. If Marcel's 95th-percentile pause is 1.8s, the threshold becomes ~2.1s. If he speeds up, it tightens. No ML required — it's statistics on a time series. This is the **pragmatic adaptive layer** if he doesn't want to run a neural turn model.

### 2.2 The neural adaptive approach (state of the art)

The strongest published 2026 result is **Next-Turn (Huawei + CUHK + NTU)** — *"Duration-Aware Streaming Endpoint Detection via Time-to-Next-Speech-Onset Prediction"* ([arXiv:2606.18094](https://arxiv.org/html/2606.18094v1), 2026-06-16). Instead of classifying "is this an endpoint," it **regresses the time until the next speech onset** — a continuous signal that naturally distinguishes a 400ms think-pause (predicted next-onset soon) from a true turn-end (predicted next-onset → ∞).

- Architecture: Whisper-large-v3 encoder + LoRA (rank 8), mean-pooled, with a binary head and/or a duration head.
- The duration target τ(t): **0 during speech**, **(next-onset − now) during a mid-utterance pause**, **τ_max=2.0s in post-utterance silence.** The 2.0s horizon is itself the answer to "what timescale matters" — it's the cognitive-pause window.
- Duration is discretized into bins that reveal where pauses cluster: `[0,60), [60,120), [120,480), [480,640), [640,800), [800,∞) ms`. The large `[120,480)` bucket confirms most functional pauses live in the 0.1–0.5s range; the meaningful think-pauses push into `[480,800)`.
- Result: **+25.9% absolute accuracy within 320ms** over the strongest baseline, with gains that *increase monotonically as pauses get longer* — i.e., it helps exactly the speakers Silero hurts most.

The framing is the insight: **endpointing is a duration-prediction problem, not a classification problem.** "How long until this person talks again?" subsumes "are they done?" because a thinking speaker has a short predicted-onset and a finished speaker has a long one.

### 2.3 The simplest adaptive heuristic Marcel can ship today

Before reaching for Next-Turn, there's a dead-simple adaptive rule that captures most of the benefit:

```
Track rolling distribution of Marcel's pause durations (the STOPPING→SPEAKING
recovery intervals the state machine already observes — see vad_analyzer.py:215-217).
stop_secs_adaptive = clip( p95(rolling_pauses) + 0.3 , min=1.5, max=3.0 )
```

The state machine *already sees* every pause (it's the count of frames spent in STOPPING before a recovery). Logging those recoveries gives you the speaker's pause distribution for free. This is the patent mechanism (§2.1) in ~30 lines. It won't beat Next-Turn, but it costs nothing and removes the "one global `stop_secs` fits all sessions" assumption.

---

## 3. Two-stage VAD — short stop for barge-in + longer confirmation before ending

**Yes, this is the dominant 2026 architecture, and Marcel already has a reference implementation installed.** Every serious turn-taking system ships a variant of the same three-tier structure:

```
Tier 1 (acoustic):  Silero confidence gate → "is there speech right now?" (32ms frames)
Tier 2 (candidate): short stop_secs (~0.2–0.8s) → "speech probably ended" (fires ML eval)
Tier 3 (confirm):   ML turn model → "is this REALLY the end?" → COMPLETE / INCOMPLETE
                    └─ hard ceiling (3s) forces COMPLETE if model is uncertain too long
```

### 3.1 SmartTurn (already in Marcel's venv, imported, NOT wired)

This is the headline finding. Marcel's `bot.py`:

```python
# bot.py:16 — imported
from pipecat.audio.turn.smart_turn.local_smart_turn_v3 import LocalSmartTurnAnalyzerV3
...
# bot.py:384-385 — but the pipeline only gets Silero, not SmartTurn
vad = VADProcessor(vad_analyzer=SileroVADAnalyzer(
    params=VADParams(confidence=0.6, start_secs=0.3, stop_secs=stop_secs, min_volume=0.0)))
```

`LocalSmartTurnAnalyzerV3` is imported and **never instantiated or passed to a processor.** The mechanism, from `base_smart_turn.py`, is exactly the two-stage pattern:

- **Stage 1:** VAD provides `is_speech` per frame. SmartTurn accumulates `_silence_ms` only while `_speech_triggered` is True (`base_smart_turn.py:121-137`).
- **Stage 2 (confirmation):** When silence is detected, it runs `analyze_end_of_turn()` → `_process_speech_segment()` extracts the recent audio window (including `pre_speech_ms=500ms` of lead-in plus the VAD start_secs) and runs the ML model to predict COMPLETE vs INCOMPLETE.
- **Stage 3 (force ceiling):** If `_silence_ms >= stop_ms` (default **3000ms**, `SmartTurnParams.stop_secs=3`), it force-commits COMPLETE regardless of model output — so the system can never hang forever on an uncertain pause.
- Model sizes: **v1 = 581M params (2.3GB, GPU)**, **v2 = 95M (360MB, GPU)** ([Krisp benchmark](https://krisp.ai/blog/turn-taking-for-voice-ai/)). Marcel's M2 Pro has a 19-core Metal GPU; v2 (95M) is plausibly runnable, v1 (2.3GB) is heavy but possible. This is the one cost to verify before wiring.

**The actionable:** wire `turn_analyzer=LocalSmartTurnAnalyzerV3(...)` (or its v2 variant) into the pipeline alongside the VAD. Then drop Silero's `stop_secs` back to ~0.5–0.8s (the candidate-trigger window) and let SmartTurn's 3s ceiling + ML confirmation own the "is Marcel done?" decision. This is the documented fix for the exact problem.

### 3.2 Krisp Turn-Taking (the benchmark leader, 2025)

Krisp's open benchmark ([krisp.ai/blog/turn-taking-for-voice-ai](https://krisp.ai/blog/turn-taking-for-voice-ai/), 2025-08) describes the same architecture and benchmarks it against SmartTurn and plain Silero-VAD:

- **6.1M params, 65MB, runs on CPU** — the only model in the comparison that doesn't need a GPU. 100ms frames, outputs a 0–1 shift-confidence per frame.
- Mechanism: a **maximum hold duration (default 5s)** during which, if silence persists, the confidence ramps up and hits 1.0 exactly at the end of the hold — so it *never* hangs and *never* fires prematurely.
- Their comparison table (Marcel-relevant rows):

| Model | Params | Size | Execution | Accuracy | Pause handling |
|---|---|---|---|---|---|
| Krisp TT | 6.1M | 65MB | **CPU** | Good | learned, + 5s hold ceiling |
| SmartTurn v1 | 581M | 2.3GB | GPU | Good | 200ms VAD → ML → 3s force |
| SmartTurn v2 | 95M | 360MB | GPU | Good | (same two-stage) |
| Silero-VAD (1s window) | 260k | 2.3MB | CPU | **Poor** | pure silence timer |

Krisp's framing of the failure modes is Marcel's bug list verbatim: *"In natural dialogue, speakers often take a pause using fillers like 'um' or 'you know' without intending to give up their turn... A turn-taking system must distinguish hesitation from completion, or risk interrupting too early."*

### 3.3 Gradium's multi-horizon variant (the tunable one)

Gradium ([gradium.ai/blog/semantic-vad](https://gradium.ai/blog/semantic-vad)) emits **inactivity probabilities at four future horizons (0.5/1/2/3s) every 80ms** from the same forward pass that produces transcripts — no second model in the loop. The agent picks which horizon + threshold + debounce count matches its "feel." Their published tuning table is the most directly useful reference for Marcel's profile:

| Use case | delay_in_frames | Horizon | Threshold | Consecutive high steps |
|---|---|---|---|---|
| Snappy assistant, clean audio | 10 (800ms) | vad[2] | 0.30 | 1 |
| Default conversational | 10 | vad[2] | 0.50 | 1–2 |
| **Conversational agent, lots of thinking pauses** | 10 | **vad[3]** | 0.50 | 1–2 |
| Phone IVR / noisy | 16 (1.28s) | vad[3] | 0.60 | 3 |
| **Long-form dictation, slow speakers** | **24 (1.92s)** | **vad[3]** | **0.70** | **5+** |

Marcel's profile sits between the last two rows. (Gradium is a hosted API, not local — listed for the tuning methodology, not as a deploy target, since Marcel's stack is local-first per L8.)

### 3.4 The pattern's three independent knobs

Across SmartTurn / Krisp / Next-Turn / Gradium, the two-stage architecture always exposes the same three tunables, and tuning them is how you trade off responsiveness vs. not-cutting-off:

1. **Candidate trigger** (Tier 1→2 handoff): the short VAD `stop_secs` that says "speech *probably* ended, ask the model." ~0.2–0.8s. Lower = faster model invocation = lower latency on clear turn-ends.
2. **Commit policy**: the threshold + debounce on the model's end-of-turn score. Higher threshold / more consecutive high-frames = fewer false barge-ins, more latency.
3. **Force ceiling**: the hard upper bound (SmartTurn 3s, Krisp 5s) that commits COMPLETE no matter what, so the system can never hang. This is the safety net that lets you *lower* the candidate trigger aggressively.

Marcel's current single-stage config collapses all three into one `stop_secs`. That's why tuning it feels like a lose-lose.

---

## 4. Filler words ('um', 'uh', 'like') as VAD-continuation signals

### 4.1 Do fillers actually hold the turn? Yes, but weaker than you'd think

The definitive recent study is **Jiang, Ekstedt & Skantze (KTH), "What makes a good pause? Investigating the turn-holding effects of fillers"** ([arXiv:2305.02101](https://arxiv.org/pdf/2305.02101), Interspeech 2023). They use the **Voice Activity Projection (VAP)** model — a self-supervised turn-taking model that predicts the next 2s of *both* speakers' activity as 256 discrete labels — to compute a turn-hold probability (THP), then systematically insert/remove fillers and measure the effect.

Key findings (all grounded in the paper):

- **Fillers DO hold the turn** — removing them shortens the predicted hold, inserting them lengthens it. Both effects significant (log-rank p<0.001).
- **But the effect is "not as strong as expected"** — because prosody, syntax, and prior context carry *redundant* turn-holding signal. A filler is one cue among many.
- **Position matters:** utterance-initial fillers hold longer than mid-utterance ones (26.4% effect).
- **Prosody matters more than lexical form:** higher pitch (+51.6% per 0.5 SD), higher intensity (+12.1%), longer duration (+11.2%) all extend the hold.
- **"uh" vs "um" makes NO significant difference** — contradicting Clark & Fox Tree (2002), who argued "um" signals a longer upcoming delay. The difference people perceive is actually a *pitch* difference ("uh" is higher-pitched), not a lexical one. The phonetic realization carries the signal, not the word.

**Implication for Marcel:** a standalone "detect 'um' → extend stop_secs" rule is weak sauce. The filler's *prosody* (pitch, intensity, duration) is what the listener's brain keys on, and a neural turn model captures all of that implicitly from the audio — it doesn't need the word transcribed first. This is an argument *for* the two-stage neural approach (§3) and *against* a hand-built filler-keyword detector. If Marcel insists on a keyword approach, detect German + English fillers (`äh`, `ähm`, `oh`, `also`, `naja`, `so`, `um`, `uh`, `like`, `you know`) and use them to *boost* the adaptive `stop_secs` (§2.3), not as the sole signal.

### 4.2 The legal/production angle (why everyone filters fillers)

Production voice systems treat fillers as a **dual signal**: (a) at the VAD/turn layer, a filler is a turn-holding cue → don't end; (b) at the NLU/LLM layer, fillers are noise → strip before the brain sees them. The guidance from the enterprise side: *"Filter filler words before NLU processing, while preserving corrections and abandoned values as structural signals"* ([stablekernel, "Speech Variability Challenges in Voice AI"](https://stablekernel.com/blogs/blog-speech-variability-challenges-voice-ai)). And US11289085 ("Automatic turn delineation in multi-turn dialogue") explicitly teaches **context-dependent silence duration** keyed off filler detection: a trailing "hmmm" grants a longer allowed silence than a clean stop. This is the patent form of §2.3's heuristic.

### 4.3 The VAP model as the academic reference architecture

Ekstedt & Skantze's **VAP** ([Interspeech 2022](https://arxiv.org/abs/2206.00591)) is the academic backbone of all the §3 production systems. It predicts the next 2s of dialog as a 256-class distribution over both speakers' future activity bins (4 bins × 2 speakers = 2⁸). From that distribution you derive a turn-hold probability. VAP is the open-source ancestor of Gradium's multi-horizon output and Next-Turn's duration head. If Marcel wants to roll his own neural layer (rather than use SmartTurn), VAP is the model to fork — it's stereo, self-supervised, and ~small.

---

## 5. WebRTC VAD vs Silero vs neural — which handles pauses best?

### 5.1 The acoustic-layer comparison (VAD only)

At the *acoustic* layer (Tier 1), the comparison is settled:

| | **WebRTC VAD** | **Silero VAD** | **Pyannote.audio** |
|---|---|---|---|
| Approach | GMM on hand-crafted features (energy, spectral, zero-crossing, pitch) | DNN (ONNX, <2MB) | DNN, speaker-diarization-aware |
| Footprint | 158KB | ~2MB | larger |
| Speed | exceptional | <1ms / 30ms chunk on CPU | slower |
| Speech-detection accuracy | **Poor** — "much better at detecting silence than detecting speech" | **>95%**, de facto open-source standard | comparable to Silero, better on overlapping speech |
| Noise robustness | low (false-positives on speech) | high | high |
| Pause handling | worst — admits noise as speech, misses quiet speech | good — accurate per-frame | good |

Sources: [Picovoice, "Choosing the Best VAD in 2026"](https://picovoice.ai/blog/best-voice-activity-detection-vad/) · [pyannote issue #604](https://github.com/pyannote/pyannote-audio/issues/604) ("WebRTC is actually much better in detecting silence than detecting speech... a lot of false positives when detecting speech") · [arXiv:2601.17270, "Window Size Versus Accuracy in VADs"](https://arxiv.org/html/2601.17270v1) ("For a typical 100ms window setting, Silero performed significantly better than WebRTC").

**For Marcel specifically:** WebRTC is the *wrong* choice precisely because his failure mode is quiet speech being treated as silence. WebRTC's known weakness (false-positives on speech) compounds his problem. Silero is correct. The only reason to touch WebRTC is its bundled **AEC** (acoustic echo cancellation) for the barge-in feedback loop — and that's a separate concern owned by L8, not a VAD swap.

### 5.2 The layer that actually matters for pauses (turn-taking)

Here's the counterintuitive part: **for pause tolerance, the choice of acoustic VAD matters less than the endpointing logic above it.** The Picovoice/Krisp/pyannote benchmarks all rank *acoustic* accuracy, but Marcel's bug isn't "Silero misclassifies my speech as silence" — Silero scores his speech at ~0.99 (`bot.py:380` comment, confirmed by `mic-vad-check.py`). His bug is "2.0s after my speech ends, the system assumes I'm done." That's a turn-taking decision, and no acoustic VAD answers it.

The relevant comparison for Marcel is therefore not WebRTC-vs-Silero but **single-stage-silence-timer vs two-stage-neural-turn-model** (§3). On that axis, the Krisp benchmark is unambiguous: plain Silero-VAD (1s window) scores **Poor** on turn accuracy; SmartTurn and Krisp TT score **Good.** The win comes from the second stage, not from swapping the first.

### 5.3 Recommendation

Keep **Silero** as the Tier-1 acoustic gate (it's what Marcel has, it's correct, it's cheap). **Do not** downgrade to WebRTC for VAD (use WebRTC only for its AEC if the barge-in echo problem returns). Put the effort into **Tier 2/3** — wire SmartTurn (already imported) or, if v1/v2 are too heavy on the M2 Pro GPU, build the §2.3 adaptive heuristic as a bridge.

---

## 6. Concrete recommendation for Marcel's stack

Ordered by effort-to-payoff. Each is independently shippable.

1. **[1 grep, 1 line] Confirm and unify the three VAD configs.** `bot.py`, `stt-bridge.py`, `voice-mcp-server.py` disagree on confidence (0.5 vs 0.6), start_secs (0.15 vs 0.3), and stop_secs (2.0 vs 2.5). Drive all from `YURI_*` env vars (already partially done in `voice-mcp-server.py:48-50`) and read the same source. Make the behavior reproducible before tuning it.
2. **[~30 lines] Add the adaptive `stop_secs` heuristic (§2.3).** Log STOPPING→SPEAKING recovery durations (the state machine already observes them), keep a rolling p95, set `stop_secs = clip(p95 + 0.3, 1.5, 3.0)`. This is the patent mechanism and costs nothing. Bridges to the neural layer.
3. **[fork or patch] Add Silero hysteresis (`neg_threshold`).** Pipecat's single-threshold design causes boundary flicker; adding a 0.15 exit-gap (matching official Silero + faster-whisper) removes spurious STOPPING-clock starts. The change is localized to `vad_analyzer.py:201-243` (one extra threshold field + a state-conditional comparison).
4. **[the real fix] Wire `LocalSmartTurnAnalyzerV3`.** It's imported (`bot.py:16`) and unused. Drop Silero `stop_secs` to ~0.6s (candidate trigger), let SmartTurn's ML confirmation + 3s ceiling own the turn-end decision. Verify M2 Pro can run v2 (95M, 360MB) on the Metal GPU first; if not, v1 (2.3GB) or fall back to #2. **This is the change that turns "Yuri cuts me off when I think" from a tuning problem into a solved one.**
5. **[only if #4 is too heavy] Evaluate Krisp TT or VAP.** Krisp TT (6M, CPU) is the only production turn model that doesn't need a GPU — relevant if the M2 Pro GPU budget is tight. VAP is the open-source academic reference if Marcel wants to fork rather than depend on a vendor SDK.

### Residual risk / what this research did NOT verify
- **SmartTurn GPU cost on M2 Pro 19-core Metal** — not benchmarked here. v1 (2.3GB) may be too heavy for a 16GB machine also running Whisper-turbo MLX + Kokoro + the LLM proxy. **Verify before wiring** (this is an engineer-lane task, not research). Cross-ref L8 (local STT resource budget) and L12 (streaming STT).
- **The 3s SmartTurn force-ceiling vs Marcel's longest natural pauses.** If Marcel sometimes pauses 4–5s to genuinely think, even SmartTurn's 3s ceiling will cut him. The ceiling is configurable (`SmartTurnParams.stop_secs`) — raise it, but watch the responsiveness tradeoff.
- **Hot-mic mode interaction.** `bot.py:387-388` notes a wake-word/keepalive/hot-mic mode. Two-stage turn detection changes the barge-in timing; cross-ref R4 (L4, barge-in UX) before shipping, since the barge-in *to Yuri's TTS* is a separate turn-shift decision from Marcel's end-of-turn.

---

## 7. Sources

**Code (Marcel's repo, grounded):**
- `_SYSTEM/Scripts/voice/bot.py` — VAD config (lines 380-385), SmartTurn import (line 16, unused in pipeline), stop_secs env (line 362)
- `_SYSTEM/Scripts/voice/stt-bridge.py` — VAD factory (lines 75-82): confidence 0.5 / start 0.15 / stop 2.5
- `_SYSTEM/Scripts/voice/voice-mcp-server.py` — VAD env-driven config (lines 47-50, 400-407)
- `_SYSTEM/Scripts/voice/mic-vad-check.py` — diagnostic, confidence 0.3
- `_SYSTEM/state/voice/.venv-pipecat/.../pipecat/audio/vad/silero.py` — Silero analyzer (voice_confidence, no hysteresis)
- `_SYSTEM/state/voice/.venv-pipecat/.../pipecat/audio/vad/vad_analyzer.py` — state machine, VADParams defaults, the AND-gate at line 206
- `_SYSTEM/state/voice/.venv-pipecat/.../pipecat/audio/turn/smart_turn/base_smart_turn.py` — SmartTurn two-stage logic, STOP_SECS=3 default
- `_SYSTEM/state/voice/kvoicewalk/.venv/.../faster_whisper/vad.py` — Silero w/ hysteresis + min_silence 2000ms default (the divergence reference)

**Academic:**
- Tsoi et al., "Next-Turn: Duration-Aware Streaming Endpoint Detection via Time-to-Next-Speech-Onset Prediction," [arXiv:2606.18094](https://arxiv.org/html/2606.18094v1) (Huawei/CUHK/NTU, 2026-06) — +25.9% abs ACC₃₂₀, duration bins, τ_max=2.0s
- Jiang, Ekstedt & Skantze, "What makes a good pause? Investigating the turn-holding effects of fillers," [arXiv:2305.02101](https://arxiv.org/pdf/2305.02101) (KTH, Interspeech 2023) — filler prosody > lexical form
- Ekstedt & Skantze, "Voice Activity Projection" (VAP), Interspeech 2022 — the open-source turn-taking reference model
- "End-Point Detection with State Transition Model based on Chunk-Wise Classification," [arXiv:1912.10442](https://arxiv.org/pdf/1912.10442) — the STM pipecat implements
- Liu et al., "Accurate endpointing with expected pause duration," [ISCA Interspeech 2015](https://www.isca-archive.org/interspeech_2015/liu15d_interspeech.html) — predictive pause-duration EPD
- "Window Size Versus Accuracy Experiments in Voice Activity Detectors," [arXiv:2601.17270](https://arxiv.org/html/2601.17270v1) (2026-01) — Silero ≫ WebRTC at 100ms

**Industry / production:**
- Krisp, "Audio-only, 6M weights Turn-Taking model for Voice AI Agents," [krisp.ai/blog/turn-taking-for-voice-ai](https://krisp.ai/blog/turn-taking-for-voice-ai/) (2025-08) — SmartTurn comparison, 6M CPU model
- Gradium, "Semantic VAD: turn detection that uses meaning, not silence," [gradium.ai/blog/semantic-vad](https://gradium.ai/blog/semantic-vad) (2026-06) — multi-horizon tuning table
- Picovoice, "Choosing the Best Voice Activity Detection in 2026: Cobra vs Silero vs WebRTC VAD," [picovoice.ai/blog/best-voice-activity-detection-vad](https://picovoice.ai/blog/best-voice-activity-detection-vad/) (2026-01)
- Deepgram, "Voice Activity Detection: An Overview for Production Voice Applications" + "Endpointing" docs
- AlterSquare, "Why VAD End-of-Speech Detection Is the Hardest Problem in Production Voice Agents," [altersquare.io](https://altersquare.io/vad-end-of-speech-detection-hardest-problem-production-voice-agents/) (2026-04)
- stablekernel, "Speech Variability Challenges In Voice AI" — filler-filtering guidance

**Patents (adaptive endpointing, all describe the §2.1 mechanism):**
- [US11817117](https://image-ppubs.uspto.gov/dirsearch-public/print/downloadPdf/11817117) — Speaker adaptive end-of-speech detection (AWS)
- [US9311932](https://image-ppubs.uspto.gov/dirsearch-public/print/downloadPdf/9311932) — Adaptive pause detection (predict threshold from past behavior)
- [US10339918](https://image-ppubs.uspto.gov/dirsearch-public/print/downloadPdf/10339918) — Adaptive speech endpoint detector
- [US7881927](https://patents.google.com/patent/US7881927B1/en) — Adaptive VAD threshold from long-term noise level
- [US11289085](https://image-ppubs.uspto.gov/dirsearch-public/print/downloadPdf/11289085) — Automatic turn delineation (filler-keyed context-dependent silence)
- [US11245646](https://image-ppubs.uspto.gov/dirsearch-public/print/downloadPdf/11245646) / [US11704900](https://image-ppubs.uspto.gov/dirsearch-public/print/downloadPdf/11704900) — Predictive injection of conversation fillers

**Official Silero:**
- [snakers4/silero-vad](https://github.com/snakers4/silero-vad) — `threshold` 0.5, `min_silence_duration_ms` 100, `speech_pad_ms` 30, `neg_threshold` hysteresis ([utils_vad.py](https://github.com/snakers4/silero-vad/blob/master/src/silero_vad/utils_vad.py))

---

*Researched 2026-07-07 by R1-VAD. Sibling lanes: R2-StreamingSTT owns the continuous-transcription-across-gaps side (deliverable 12); R4-BargeInUX owns the barge-in-to-TTS turn-shift UX (deliverable L4). Numbers in §1.4 and §3 are the cross-reference points for those lanes.*
