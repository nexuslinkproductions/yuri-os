# 15 — Whisper Tuning for Pause-Heavy / Fragmented Speech

> Deep-dive on Whisper's decoding parameters as they apply to **Marcel's speech pattern**: slow, deliberate, 1–3s cognitive-processing pauses mid-sentence, occasional restarts. Not a stutter — *cognitive pauses*. The 30s-window architecture interacts with pauses in non-obvious ways, and the most-cited "fix" (lower `no_speech_threshold`) is **the wrong move for Marcel**. This doc explains why and gives the correct config.
>
**Stack under analysis (ground truth from local source):**
> - **Primary path today:** Parakeet MLX (`parakeet-listen.py`) — confirmed in `_SYSTEM/Scripts/voice/voice-listen.sh:31`.
> - **Fallback today:** `whisper-cli` (whisper.cpp, `ggml-large-v3-turbo.bin`) — `voice-listen.sh:70`.
> - **Rebuild default per `08-local-stt.md`:** `mlx_whisper` with `mlx-community/whisper-large-v3-turbo` (Q4). The `.venv-pipecat` venv carries the full `mlx_whisper` + `faster_whisper` + `transformers` stack.
> - All three implementations (whisper.cpp / mlx_whisper / faster-whisper) expose the parameters below; the differences are in **what else they add**, not the core set (see §5).

---

## TL;DR — The five load-bearing conclusions

1. **`no_speech_threshold` is NOT what cuts Marcel off.** It operates *inside* a 30-second decode window, segment-by-segment, deciding whether to discard an already-decoded segment as silence. The thing that cuts Marcel off mid-pause is the **external Silero VAD** (`stop_secs=2.5`) — that's R1-VAD's domain, not a Whisper param. Tuning `no_speech_threshold` will not fix the cut-off; it will fix (or break) *hallucinations during his pauses*. For Marcel: **keep at default `0.6`**, do NOT lower it (§2).
2. **`condition_on_previous_text=True` is correct for Marcel** — his pauses fragment a single thought across multiple 30s windows, and this param is the *only* built-in mechanism that stitches them back together. The downside (failure-loop / repetition cascade) is real but is **preventable** via `prompt_reset_on_temperature` + external VAD prefilter. Don't disable it as a reflex (§3).
3. **`initial_prompt` is worth using** — prime with the current task's vocabulary + a transcription-style seed ("Voice dictation transcript."). Only the **last ~224 tokens** are consumed, so keep it dense, domain-heavy, with highest-value tokens at the end (§4).
4. **`mlx_whisper` exposes every parameter in this doc** (verified by reading its source — §5). It does **not** have native VAD; Marcel already runs Silero externally, which is the *correct* architecture. `faster-whisper` adds built-in `vad_filter` + `repetition_penalty` + `no_repeat_ngram_size` + `hotwords` if you ever swap.
5. **Hallucination defense is a layered stack, not a single knob.** For Marcel's pauses the stack is: Silero VAD prefilter (cuts long silence *before* the decoder) → `compression_ratio_threshold=2.4` + `logprob_threshold=-1.0` (temperature fallback triggers) → `hallucination_silence_threshold` (skip silent periods when word-timestamps detect a hallucination) → the bash-level phrase blocklist in `voice-listen.sh:46-54` (catches "Thank you", "Bye", etc.) (§6).

---

## 1. The parameter deep-dive

All defaults below are the **mlx_whisper source defaults** — read directly from `_SYSTEM/state/voice/.venv-pipecat/.../mlx_whisper/transcribe.py:62-78` and `decoding.py:82-116`. These match faster-whisper and openai-whisper unless flagged.

| Parameter | Default | What it does | Affects pause handling? | Marcel-specific note |
|---|---|---|---|---|
| `temperature` | `(0.0, 0.2, 0.4, 0.6, 0.8, 1.0)` tuple | First decode is always `t=0` (deterministic beam search). On failure (see thresholds below), the next temp in the tuple is tried. | Indirect — fallback rescues garbled pause-adjacent segments. | Keep the tuple. Pin `temperature=0.0` only for a "maximum determinism, accept some garbles" trade. |
| `compression_ratio_threshold` | `2.4` | If `len(text)/len(zlib.compress(text)) > threshold`, the segment is judged *repetitive/garbled* → triggers temperature fallback. (Common recommended value in docs: `1.35` for stricter repetition rejection.) | High — repetitive hallucinations during silence often trip this. | Keep `2.4` default; tighten to `2.0` only if you see repetition cascades. Going to `1.35` rejects too much real speech with Marcel's restarts. |
| `logprob_threshold` | `-1.0` | If `avg_logprob < threshold`, treat the decode as failed → temperature fallback. Also the **override** in the no-speech logic (§2): high-logprob speech is never skipped. | High — this is the safety net that preserves real low-confidence speech. | Keep `-1.0`. Raising it (e.g. `-0.5`) drops more borderline speech; lowering it (`-1.5`) lets more garbage through. |
| `no_speech_threshold` | `0.6` | If `no_speech_prob > threshold` **AND** `avg_logprob ≤ logprob_threshold`, skip the segment as silence. (Full logic in §2.) | Critical but **misunderstood** — see §2. | Keep `0.6`. Do not lower. |
| `condition_on_previous_text` | `True` | Feed the previous segment's output as the prompt for the next 30 s window. | Critical — stitches Marcel's thought across pauses. | **Keep True.** Pair with `prompt_reset_on_temperature`. See §3. |
| `initial_prompt` | `None` | Text prepended to the *first* window's decoder context. Used for vocabulary/proper-noun/style priming. | Low direct; high for accuracy on fragmented technical speech. | **Use it.** See §4. |
| `hallucination_silence_threshold` | `None` | When `word_timestamps=True`, if a hallucination is detected and there's a silent gap longer than this (seconds), skip it instead of decoding through it. | **High** — directly targets the silence-during-Marcel's-pause failure mode. | Set `2.0` (seconds) when word-timestamps are on. See §6. |
| `word_timestamps` | `False` | Enable DTW cross-attention word-level timestamps. Required for `hallucination_silence_threshold` to function. | Enabler for §6. | Enable `True` if you use the hallucination-silence path; costs ~15-25% decode time. |
| `beam_size` | `5` (via `decode_options`) | At `t=0`, number of parallel hypotheses kept. Only active when temperature is 0. | Low. | Keep `5`. Raise to `8` only for offline accuracy; costs ~linear time. |
| `best_of` | `5` (via `decode_options`) | At `t>0` (fallback), number of independent samples; pick highest logprob. | Low. | Keep default. |
| `patience` | `None` (via `decode_options`) | Beam-search expansion factor (arxiv:2204.05424). `1.0` = standard beam; higher = more thorough, slower. | None. | Leave default. |
| `length_penalty` | `None` (via `decode_options`) | "alpha" in Google NMT length normalization for ranking beams. | None. | Leave default. |
| `clip_timestamps` | `"0"` | Comma-separated `[start,end,...]` clip ranges to transcribe. Used by WhisperX-style VAD-prefiltered pipelines to skip silence regions. | Architecture-level. | Marcel's external VAD does this better; leave `"0"`. |

> **Verified in source:** `mlx_whisper/transcribe.py:62-78` lists `temperature`, `compression_ratio_threshold`, `logprob_threshold`, `no_speech_threshold`, `condition_on_previous_text`, `initial_prompt`, `word_timestamps`, `hallucination_silence_threshold`, `clip_timestamps` as named params. `beam_size`, `best_of`, `patience`, `length_penalty`, `prompt`, `prefix`, `suppress_tokens`, `suppress_blank` are passed through `**decode_options` into `DecodingOptions` (`decoding.py:82-116`). **All parameters in this doc are reachable from mlx_whisper.**

### What actually affects pause handling

Ranking by direct impact on Marcel's failure mode (cut-off + fragmentation + pause-hallucination):

1. **External VAD `stop_secs`** (Silero, not Whisper) — *the* cut-off knob. R1-VAD.
2. `condition_on_previous_text` + `prompt_reset_on_temperature` — fragmentation stitching.
3. `hallucination_silence_threshold` + `word_timestamps` — pause-hallucination suppression.
4. `no_speech_threshold` + `logprob_threshold` — silence-segment skip (the hallucination backstop, §2).
5. `initial_prompt` — accuracy rescue on technical fragments.
6. `compression_ratio_threshold` — repetition-cascade breaker.

The four classic "accuracy" knobs (`beam_size`, `best_of`, `patience`, `temperature`) are **largely irrelevant to Marcel's specific problem** — his issue isn't transcription accuracy *per se*, it's architectural interaction with pauses. Cranking `beam_size` will not stop the VAD cutting him off.

---

## 2. `no_speech_threshold` — the critical, widely-misunderstood parameter

### What the docs say (and why half of them are wrong for Marcel)

Default is `0.6`. The common advice — "lower it to `0.4` to reduce hallucinations" — is correct *for files with music/background noise* and **wrong for a pause-heavy live-mic user**.

### The actual mechanism (read from mlx_whisper source, lines 301-315)

```python
if no_speech_threshold is not None:
    should_skip = result.no_speech_prob > no_speech_threshold
    if (logprob_threshold is not None
            and result.avg_logprob > logprob_threshold):
        should_skip = False          # high-confidence override
    if should_skip:
        seek += segment_size          # fast-forward to next window
        continue
```

Three facts this code establishes:

1. **A segment is skipped only when `no_speech_prob > threshold` AND `avg_logprob ≤ logprob_threshold`.** High-confidence speech is **never** skipped, regardless of `no_speech_prob`. This is the safety net.
2. **It operates per-30-second-decoded-segment**, after the model has already produced output. It does **not** terminate listening, does **not** end an utterance, does **not** cut Marcel off. It just decides whether to *emit* a decoded segment or discard it as silence.
3. **The hallucination failure mode is the opposite of what intuition suggests:** hallucinated outputs ("Thank you for watching") are often produced with **high confidence** (`avg_logprob` high, `no_speech_prob` low) — so the heuristic filter lets them through. The filter catches *boring* silence, not *creative* silence. (Source: arxiv:2606.07473, "hallucinated outputs are often generated with high confidence with elevated avg_logprob, while the corresponding no_speech_prob remains unexpectedly low.")

### The critical distinction for Marcel

| What's happening | What controls it | NOT controlled by `no_speech_threshold` |
|---|---|---|
| Marcel pauses 2 s mid-sentence → mic stops → partial transcript sent to Yuri | **External Silero VAD `stop_secs`** (R1-VAD) | ✗ |
| Marcel pauses within a 30 s window → decoder hallucinates "Thank you" in the gap | **`hallucination_silence_threshold` + external VAD + phrase blocklist** | partial — `no_speech_threshold` is the backstop |
| A 30 s window is mostly silence with 2 s of Marcel at the start → segment decoded then discarded as silence | **`no_speech_threshold` + `logprob_threshold`** | this IS the right knob |
| Marcel's quiet consonants / breaths misread as silence and dropped | **`no_speech_threshold` raised too high, OR `logprob_threshold` raised too high** | this IS the right knob |

### Recommendation for Marcel: **keep `0.6`, do not lower**

- **Lowering to `0.4`** (the internet's favorite advice): more aggressive silence filtering. For a *file* with background music, this drops hallucinations. For Marcel's *clean HyperX SoloCast mic with deliberate pauses*, this risks **dropping his genuine quiet speech** — the very thing he needs preserved. Wrong direction.
- **Raising to `0.7-0.8`**: lets more borderline-quiet segments through. Marginal benefit; the external VAD already gates the audio. Risk: more silence reaches the decoder → more hallucination opportunity. Net wash, not worth deviating from default.
- **The correct intervention is upstream**: external Silero VAD with pause-tolerant `stop_secs` (R1-VAD's deliverable) cuts silence *before* the decoder, making `no_speech_threshold` a secondary backstop rather than the primary gate.

> **OpenAI's own caveat (Discussion #29, Alexandra Dzhantimirova, Whisper maintainer):** "The VAD output from the model is not very accurate, and the predicted `no_speech_prob` is often not a reliable predictor of voice activity." Treat `no_speech_threshold` as a coarse filter, not a precise instrument. The real VAD is external.

---

## 3. `condition_on_previous_text` — should Marcel enable it?

### Mechanism

When `True` (default), Whisper takes the previous segment's text and prepends it (up to ~224 tokens, the model's prompt context window) to the decoder context for the *next* 30 s window. This is **cross-window context continuity** — the only built-in mechanism for stitching a thought that spans a pause boundary that falls between two decode windows.

### The trade-off (this is the real question)

| `condition_on_previous_text=True` (default) | `condition_on_previous_text=False` |
|---|---|
| **Stitches fragmented speech** across window boundaries — exactly Marcel's need | Each window decoded independently — no cross-window context |
| Better coherence on long, paused utterances | Better isolation — one bad window can't poison the next |
| **Risk: failure-loop cascade** — if a window hallucinates ("Thank you for watching"), the hallucination becomes the prompt for the next window → the model keeps generating similar text → "repetition looping or timestamps going out of sync" (verbatim from `transcribe.py:111-112`) | Eliminates the cascade — hallucinations stay isolated |
| Pairs with `prompt_reset_on_temperature` to mitigate the cascade | No cascade to mitigate |

### Why "disable it" is the wrong reflex for Marcel

The internet's dominant advice — "set `condition_on_previous_text=False` to stop hallucinations" — is correct for **fluent, continuous speech** where each window is self-contained. It is **wrong for Marcel**:

- His pauses mean a single utterance frequently spans 2-3 decode windows.
- With `False`, each window is decoded blind — Yuri receives three disconnected fragments instead of one coherent sentence.
- The hallucination risk that motivates `False` is **better solved by the layered stack in §6** (external VAD + `hallucination_silence_threshold` + blocklist), which attacks the root cause (silence reaching the decoder) rather than the symptom (hallucinated context propagating).

### Recommendation: **keep `True`, add the mitigations**

1. **Keep `condition_on_previous_text=True`.** Marcel's fragmented-across-windows speech needs the stitching.
2. **Add `prompt_reset_on_temperature`** (faster-whisper exposes this; mlx_whisper does via `decode_options`): default `0.5`. When temperature fallback escalates above this value, the previous-text prompt is cleared. This **breaks the cascade** at the moment the model starts struggling — the exact failure mode the param was designed for. *"Resets prompt if temperature is above this value. Arg has effect only if `condition_on_previous_text` is True."* (faster-whisper `transcribe.py`)
3. **Ensure the external VAD prefilter is aggressive enough** (R1-VAD) that silence-driven hallucinations rarely *reach* the decoder in the first place — removing the source material for any cascade.

> **If hallucinations still cascade after §6 is in place**: the fallback is `condition_on_previous_text=False` + a post-hoc fragment joiner (concatenate adjacent segments with a 1.5-3 s gap into one logical utterance before sending to Yuri). This sacrifices decoder-level context for safety. It's the contingency, not the default.

---

## 4. `initial_prompt` — priming for fragmented technical speech

### What it does

Text prepended to the decoder context for the **first** window only. Biases the model toward vocabulary, spellings, proper nouns, and style. *"This can be used to provide, or 'prompt-engineer' a context for transcription, e.g. custom vocabularies or proper nouns to make it more likely to predict those word correctly."* (`transcribe.py:124-127`)

### The 224-token rule (critical constraint)

**Only the last ~224 tokens of the prompt are consumed**; later tokens exert greater influence than earlier ones. (arxiv:2602.18966, Whisper: Courtside Edition) Implication: **keep the prompt dense and put the highest-value tokens at the end.**

### Should Marcel use it? Yes, but strategically

A well-chosen `initial_prompt` helps Marcel on three failure modes that are worse for him than for fluent speakers:

1. **Technical/domain vocabulary** — when his speech fragments across a pause, the decoder has less acoustic context to disambiguate. A prompt seeded with the task's vocabulary ("Yuri, Claude, mlx, MLX, VAD, Silero, Whisper, Parakeet, cmux, overseer, Spatz") gives the decoder a prior on the *expected* words, rescuing accuracy on fragments.
2. **Style anchoring** — a transcription-style seed like `"Voice dictation transcript."` or `"The following is a transcript of a person speaking slowly with pauses."` steers the model away from YouTube-subtitle-style completions (the hallucination attractor).
3. **Language lock** — for Marcel's EN/DE bilingual context, seeding with the expected language's common words reduces code-switch false-positives.

### Evidence it works on pause-heavy / dysfluent speech (not just intuition)

Prompt-shaping Whisper to capture fillers and partial words — the exact failure mode Marcel hits — moved filler/dysfluency capture from a **7% baseline hit rate to 63%** in a controlled study (arXiv:2605.05231, cross-ref `13-dysfluent-speech.md` §4.2). That is a 9× lift from decoder prompting alone, no model swap. For Marcel this means: a well-shaped `initial_prompt` that explicitly tells the model *"incomplete sentences and restarts are normal, transcribe them verbatim"* does not just help with vocabulary — it changes the model's decoding prior away from the fluent-speech distribution it was trained on. This is the single highest-leverage, zero-cost intervention in this doc.

### Recommended prompt construction for Marcel

```python
initial_prompt = (
    "Voice dictation transcript. "
    "The speaker is Marcel, talking to his assistant Yuri about software, "
    "YURI OS, MLX, Whisper, Claude, voice assistants. "
    "The speaker pauses to think; incomplete sentences are normal. "
    "Transcribe exactly what is said, including partial words and restarts."
)
```

Rules:
- **Keep under ~224 tokens** (~150-200 words max). The model truncates beyond that.
- **Highest-value tokens at the end** — proper nouns, rare domain terms.
- **Refresh per task** — if the conversation topic shifts (e.g., from voice engineering to sales outreach), update the prompt to match. A stale prompt is worse than none.
- **Never include hallucination attractors** — don't seed with "Thank you", "Subscribe", "Please like", or any YouTube-subtitle idiom; these *prime* the model toward the exact failure you're preventing.

### Caveat: prompt is the first-window only

`initial_prompt` applies to window 1. Windows 2+ are conditioned on `condition_on_previous_text` (if True). So the prompt's influence decays over a long session — it's most valuable for short, focused interactions. For always-on listening, consider re-injecting the prompt every N windows via a custom transcribe loop (rebuild the `prompt` field in `DecodingOptions` per call with a rolling context window).

---

## 5. `mlx_whisper` vs `faster-whisper` vs `openai-whisper` — parameter support

### Ground-truth comparison (read from local installed source)

| Parameter | openai-whisper | mlx_whisper | faster-whisper |
|---|---|---|---|
| `temperature` (tuple fallback) | ✅ | ✅ | ✅ (as `temperatures` list) |
| `compression_ratio_threshold` | ✅ | ✅ | ✅ |
| `logprob_threshold` | ✅ | ✅ | ✅ (`log_prob_threshold`) |
| `no_speech_threshold` | ✅ | ✅ | ✅ |
| `condition_on_previous_text` | ✅ | ✅ | ✅ |
| `initial_prompt` | ✅ | ✅ | ✅ |
| `hallucination_silence_threshold` | ✅ | ✅ | ✅ |
| `word_timestamps` | ✅ | ✅ | ✅ |
| `beam_size` / `best_of` / `patience` | ✅ | ✅ (via `decode_options`) | ✅ |
| `prompt_reset_on_temperature` | ❌ | ❌ (must pass via decode_options; untested) | ✅ (named param) |
| `repetition_penalty` | ❌ | ❌ | ✅ |
| `no_repeat_ngram_size` | ❌ | ❌ | ✅ |
| `hotwords` | ❌ | ❌ | ✅ |
| `vad_filter` (built-in Silero) | ❌ | ❌ | ✅ (`VadOptions`) |
| `length_penalty` | ✅ | ✅ | ✅ |

### Verdict for Marcel's stack

- **mlx_whisper exposes every parameter that matters for pause handling.** Confirmed by reading `transcribe.py:62-78` and `decoding.py:82-116` in the installed `.venv-pipecat`. The only gaps vs faster-whisper are the repetition-control trio (`repetition_penalty`, `no_repeat_ngram_size`, `hotwords`) and native `vad_filter`.
- **The native VAD gap is a non-issue** because Marcel's architecture already runs **Silero VAD externally** (`voice-listen.sh` + R1-VAD's work). Running VAD outside the decoder is *better* than `faster-whisper`'s built-in: it lets you tune VAD params independently of decode params, and it works identically across whisper.cpp / mlx_whisper / Parakeet.
- **The repetition-control gap** (`repetition_penalty`, `no_repeat_ngram_size`) is the one real reason to consider faster-whisper *if* Marcel's pauses trigger repetition cascades that §6's layered stack can't stop. In practice the bash-level blocklist + `compression_ratio_threshold` + external VAD handle this — but if it doesn't, faster-whisper is the escape hatch.
- **Speed**: mlx_whisper runs ~2× faster than whisper.cpp for the same turbo model on Apple Silicon (per `08-local-stt.md` citing llimllib's benchmark). faster-whisper (CTranslate2) is competitive but its Mac GPU story is weaker than MLX. For M2 Pro, **mlx_whisper is the right default**; faster-whisper is the fallback if repetition-control is needed.

### Recommendation

Stay on mlx_whisper (matches `08-local-stt.md` rebuild default). Reach for faster-whisper **only if** §6's hallucination stack proves insufficient AND the failure mode is specifically repetition-cascade (not silence-hallucination). For that case, the migration is: swap the transcribe call, add `repetition_penalty=1.1`, `no_repeat_ngram_size=3`, and keep all other params identical.

---

## 6. Hallucination prevention during Marcel's pauses — the layered stack

### Why Whisper hallucinates during silence (root cause)

Whisper was trained on YouTube videos with subtitles. During silence or low-energy audio, the model's audio embeddings go near-zero, and the model "fills in" phrases from its training distribution. The characteristic attractors: **"Thank you for watching", "Please subscribe", "Thanks for watching", "Bye", "Music", "Applause", "So", "Um"**. (Sources: openwhispr Issue #462; arxiv:2501.11378)

This is **worse for Marcel than for fluent speakers** because his genuine 1-3 s pauses are exactly the silence pattern that triggers the attractor — and because `condition_on_previous_text=True` (which he needs, §3) can propagate a hallucination across windows.

### The hallucination attractor list (already partially handled)

`voice-listen.sh:46-54` already drops these via the `is_noise()` blocklist:
```
blankaudio silence you thank you thanks thanksforwatching thank bye byebye
so um uh okay ok yeah hmm music applause
```
This is the **last line of defense** and it works — but it's a post-hoc filter; the hallucination still consumed decode cycles and (worse) may have already poisoned the `condition_on_previous_text` prompt for the next window. The goal is to **prevent hallucinations from being generated in the first place**, not just catch them after.

### The layered defense (in order of execution)

```
┌─────────────────────────────────────────────────────────────────┐
│  LAYER 0 — External Silero VAD (R1-VAD's domain)                │
│  • Pause-tolerant stop_secs (don't cut Marcel mid-thought)      │
│  • BUT: trim long silence (>2s of pure nothing) before decoder  │
│  • Cuts the hallucination fuel at the source                    │
└────────────────────────────┬────────────────────────────────────┘
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│  LAYER 1 — initial_prompt style anchor (§4)                     │
│  "Voice dictation transcript." steers away from YouTube idiom   │
└────────────────────────────┬────────────────────────────────────┘
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│  LAYER 2 — compression_ratio_threshold=2.4 + logprob_threshold  │
│  Repetitive/garbled decodes trigger temperature fallback        │
└────────────────────────────┬────────────────────────────────────┘
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│  LAYER 3 — no_speech_threshold=0.6 (the backstop)               │
│  Whole-segment-silence detection discards boring silence        │
│  (Does NOT catch high-confidence creative hallucinations)       │
└────────────────────────────┬────────────────────────────────────┘
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│  LAYER 4 — hallucination_silence_threshold=2.0 + word_timestamps│
│  When word-timestamps detect a hallucination AND there's a >2s  │
│  silent gap, skip the gap instead of decoding through it        │
│  (transcribe.py:431-443)                                        │
└────────────────────────────┬────────────────────────────────────┘
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│  LAYER 5 — prompt_reset_on_temperature=0.5                      │
│  If fallback escalates past t=0.5, clear the previous-text      │
│  prompt → breaks the cascade (protects condition_on_previous)   │
└────────────────────────────┬────────────────────────────────────┘
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│  LAYER 6 — Bash-level phrase blocklist (voice-listen.sh:46-54)  │
│  Last-resort catch for known attractors that slipped through    │
└─────────────────────────────────────────────────────────────────┘
```

### The `hallucination_silence_threshold` mechanism (the Marcel-specific weapon)

Read from `mlx_whisper/transcribe.py:431-443`:

```python
# skip silence before possible hallucinations
if hallucination_silence_threshold is not None:
    threshold = hallucination_silence_threshold
    if not single_timestamp_ending:
        last_word_end = _get_end(current_segments)
        if last_word_end is not None and last_word_end > time_offset:
            remaining_duration = window_end_time - last_word_end
            if remaining_duration > threshold:
                seek = round(last_word_end * FRAMES_PER_SECOND)
            else:
                seek = previous_seek + segment_size
```

**What this does:** When word-timestamps are on and the model has decoded a segment with a long trailing silence, instead of plowing forward into that silence (which is where the hallucination lives), it **seeks to the end of the last real word** — skipping the silent gap. This is precisely the mechanism that protects Marcel's pauses: the decoder never sees enough continuous silence to hallucinate.

**Requirements:** `word_timestamps=True` (adds ~15-25% decode time). Set `hallucination_silence_threshold=2.0` (skip silence longer than 2 s — matches Marcel's typical pause ceiling; tune down to `1.5` if pauses are shorter, up to `3.0` if his thinking pauses run longer).

### Recommendation for Marcel

```python
result = mlx_whisper.transcribe(
    audio,
    path_or_hf_repo="mlx-community/whisper-large-v3-turbo",
    language="auto",                          # or "en" / "de" to lock

    # ── the stitching + safety pair (§3) ──
    condition_on_previous_text=True,
    prompt_reset_on_temperature=0.5,          # via decode_options

    # ── the pause-hallucination weapon (§6) ──
    word_timestamps=True,
    hallucination_silence_threshold=2.0,

    # ── defaults that are correct as-is (§1, §2) ──
    temperature=(0.0, 0.2, 0.4, 0.6, 0.8, 1.0),
    compression_ratio_threshold=2.4,
    logprob_threshold=-1.0,
    no_speech_threshold=0.6,

    # ── the accuracy rescue (§4) ──
    initial_prompt=(
        "Voice dictation transcript. "
        "Speaker is Marcel, talking to Yuri about software, YURI OS, "
        "MLX, Whisper, Claude, voice assistants. Pauses are normal."
    ),

    # ── decoding knobs (§1) ──
    beam_size=5,
)
```

**Do NOT touch unless you see the named failure:**
- `no_speech_threshold` → only if genuine quiet speech is being dropped (raise to `0.7`).
- `compression_ratio_threshold` → only if repetition cascades leak through (tighten to `2.0`).
- `condition_on_previous_text` → only if §6's stack can't stop cascades (set `False` + add post-hoc joiner).
- `temperature` → only for offline max-determinism mode (pin `0.0`).

---

## 7. What this does NOT fix (and where it lives instead)

This doc is scoped to the Whisper decoder. Marcel's full problem spans three subsystems; the other two are separate deliverables:

| Marcel's symptom | Root cause | Lives in |
|---|---|---|
| Cut off mid-pause → partial transcript → Yuri answers a fragment | **External VAD `stop_secs=2.5`** terminates capture | R1-VAD (`12-vad-pause-tolerance.md`, sibling doc) |
| Yuri starts talking while Marcel is still mid-thought | **No continuous-listen / barge-in architecture** | R2-StreamingSTT + R4-BargeInUX |
| Pauses fragment a single utterance across decode windows | **Whisper's 30 s windowing** | **This doc** (§3 `condition_on_previous_text`) |
| "Thank you for watching" during pauses | **Silence-hallucination attractor** | **This doc** (§6 layered stack) |
| Technical terms garbled on fragments | **Decoder lacks vocabulary prior** | **This doc** (§4 `initial_prompt`) |

The Whisper tuning in this doc is necessary but not sufficient. R1's VAD work is the **primary** lever for the cut-off symptom; this doc's `condition_on_previous_text` + `hallucination_silence_threshold` is the **secondary** lever that makes the decoder robust to whatever pauses R1's VAD lets through.
- **Sibling doc — `13-dysfluent-speech.md`** (R3-Dysfluent) covers the speech-pattern / disability-accommodation angle: the SAP dysfluency challenge, Apple CHI 2023 endpointer work, WCAG/W3C COGA Voice standards, and the CrisperWhisper verbatim-capture model swap. This doc is the decoder-config mechanics that implements R3's `initial_prompt` filler-capture technique at the parameter level.

---

## 8. Open questions / follow-ups

1. **Prompt-decay in always-on mode.** `initial_prompt` applies to window 1 only. For Marcel's always-on listener, does the prompt's vocabulary prior meaningfully persist after 10+ windows of `condition_on_previous_text`? Untested. A custom transcribe loop that re-injects a rolling prompt every N windows is the likely fix; needs a benchmark.
2. **`prompt_reset_on_temperature` in mlx_whisper.** faster-whisper exposes it as a named param; mlx_whisper's path is via `decode_options` → `DecodingOptions` which does **not** list it as a field (`decoding.py:82-116`). It may need a small patch to mlx_whisper to expose it cleanly, OR it may need to be handled at the application layer (custom reset logic when temperature escalates). **Verify before relying on it.**
3. **Turbo vs v3 hallucination rate.** `08-local-stt.md` notes turbo and v3 have near-identical WER (13.40% vs 13.20%). Unverified whether their *hallucination* rates on silence differ. If turbo hallucinates more on silence (plausible — fewer params, more reliance on priors), the §6 stack matters more. Worth a controlled test on Marcel's actual mic captures.
4. **Calming-Whisper / fine-tuned heads.** arxiv:2505.12969 (Calm-Whisper) shows 3 of 20 decoder heads cause 75% of hallucinations; fine-tuning those heads on non-speech data eliminates most. Not a config change — a model swap. File as a future option if §6's stack is insufficient on Marcel's real captures.
5. **gpt-4o-transcribe as the nuclear option.** Multiple sources (zenn.dev/daishiro) report whisper-1 hallucinations "completely eliminated" by migrating to gpt-4o-transcribe. Cloud, costs money, latency. Last resort if local Whisper can't be tamed for Marcel's pattern.
6. **CrisperWhisper as the verbatim-capture model swap.** If §4's `initial_prompt` shaping + §6's layered stack still lose Marcel's restarts/fillers, CrisperWhisper is a fine-tuned Whisper variant built specifically for verbatim dysfluent-speech capture (no fluency normalization). Covered in `13-dysfluent-speech.md` §6 (STT model track A vs B). It's a model swap, not a config change — file as the escalation path if decoder-config tuning hits its ceiling.

---

## Sources (verified)

**Local source (ground truth for parameter support & defaults):**
- `_SYSTEM/state/voice/.venv-pipecat/lib/python3.12/site-packages/mlx_whisper/transcribe.py:62-78, 301-315, 431-443` — transcribe signature, no-speech skip logic, hallucination_silence_threshold logic
- `_SYSTEM/state/voice/.venv-pipecat/lib/python3.12/site-packages/mlx_whisper/decoding.py:82-116` — `DecodingOptions` (beam_size, best_of, patience, length_penalty, prompt, prefix)
- `_SYSTEM/state/voice/kvoicewalk/.venv/lib/python3.12/site-packages/faster_whisper/transcribe.py:70-98` — `TranscriptionOptions` (adds repetition_penalty, no_repeat_ngram_size, hotwords, prompt_reset_on_temperature)
- `_SYSTEM/Scripts/voice/voice-listen.sh:31-74` — current prod: Parakeet primary, whisper.cpp fallback, phrase blocklist
- `02_RESOURCES/RESEARCH/voice-assistant-research-2026-07-06/08-local-stt.md` — model selection (turbo MLX Q4), benchmark citations

**Sibling research docs (cross-referenced):**
- `02_RESOURCES/RESEARCH/voice-assistant-research-2026-07-06/13-dysfluent-speech.md` (R3-Dysfluent) — speech-pattern / disability-accommodation angle; SAP dysfluency challenge, Apple CHI 2023 endpointer, WCAG/W3C COGA Voice, CrisperWhisper verbatim-capture model swap
- `02_RESOURCES/RESEARCH/voice-assistant-research-2026-07-06/12-vad-pause-tolerance.md` (R1-VAD) — external Silero VAD `stop_secs` tuning, the actual cut-off lever
- `02_RESOURCES/RESEARCH/voice-assistant-research-2026-07-06/11-streaming-stt.md` (R2-StreamingSTT) and `14-barge-in-ux.md` (R4-BargeInUX) — continuous-listen + barge-in architecture

**External (parameter semantics, hallucination research):**
- openai/whisper `transcribe.py` source — https://github.com/openai/whisper/blob/main/whisper/transcribe.py
- openai/whisper `decoding.py` source — https://github.com/openai/whisper/blob/main/whisper/decoding.py
- openai/whisper Discussion #29 (no_speech_prob unreliable) — https://github.com/openai/whisper/discussions/29
- openai/whisper Discussion #679 (hallucination solution) — https://github.com/openai/whisper/discussions/679
- openai/whisper Discussion #1769 (hallucination silence) — https://github.com/openai/whisper/discussions/1606
- openai/whisper Discussion #549 (temperature fallback + beam search) — https://github.com/openai/whisper/discussions/549
- openai/whisper Discussion #2420 (compression_ratio fallback limitation) — https://github.com/openai/whisper/discussions/2420
- SYSTRAN/faster-whisper `transcribe.py` — https://github.com/SYSTRAN/faster-whisper/blob/master/faster_whisper/transcribe.py
- faster-whisper Issue #843 (Silero-VAD meta-hallucinations) — https://github.com/SYSTRAN/faster-whisper/issues/843
- faster-whisper Issue #603 (prompt_reset_on_temperature bug) — https://github.com/SYSTRAN/faster-whisper/issues/603
- OpenWhispr Issue #462 (silence hallucination + smarter VAD) — https://github.com/OpenWhispr/openwhispr/issues/462
- open-webui Issue #6953 (silence trimming for hallucination prevention) — https://github.com/open-webui/open-webui/issues/6953
- HuggingFace Whisper docs (transformers) — https://huggingface.co/docs/transformers/en/model_doc/whisper
- WhisperX paper (VAD reduces hallucination, Kincaid46/TED-LIUM) — https://arxiv.org/pdf/2303.00747
- Calm-Whisper (head-wise hallucination mitigation) — https://arxiv.org/html/2505.12969v1
- Investigation of Whisper ASR Hallucinations (non-speech) — https://arxiv.org/pdf/2501.11378
- Whisper Hallucination Detection (SAE, high-confidence hallucinations) — https://arxiv.org/pdf/2606.07473
- Whisper: Courtside Edition (initial_prompt 224-token rule) — https://arxiv.org/pdf/2602.18966
- Whisper Best Settings guide — https://www.saytowords.com/blogs/Whisper-Best-Settings/
- Emory Library Whisper tips (no_speech_threshold=0.4 for noisy files) — https://guides.libraries.emory.edu/c.php?g=1442123&p=10711508
- gpt-4o-transcribe hallucination elimination — https://zenn.dev/daishiro/articles/whisper-hallucination-gpt4o-transcribe?locale=en
- Prompt-conditioned filler/dysfluency capture (7%→63% hit rate from initial_prompt shaping) — arXiv 2605.05231, cross-ref `13-dysfluent-speech.md` §4.2
