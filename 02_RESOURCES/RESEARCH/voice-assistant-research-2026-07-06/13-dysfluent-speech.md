# Dysfluent Speech Accommodation in Voice UIs

> **Lane 13 / Researcher.** Scope: how voice interfaces accommodate non-fluent speakers — slow,
> paused, restarting, filler-heavy speech. Built specifically around Marcel's pattern (deliberate,
> 1–3s cognitive-processing pauses, mid-sentence rephrasing — *not* a stutter) and his stack
> (Whisper-large-v3-turbo MLX, Silero VAD, `stop_secs=2.5`, HyperX SoloCast, M2 Pro). Covers the
> academic state of the art (2024–2026), commercial approaches (Alexa/Siri/Google/Dragon), the
> accessibility standards landscape, filler-word handling, and restart/repair detection. Every
> numeric claim is cited.

---

## TL;DR — the decision in one screen

| Dimension | Recommendation | Why |
|---|---|---|
| **The real failure mode for Marcel** | It is **endpointing**, not recognition. The endpointer (VAD silence timeout) fires mid-thought and commits a fragment. Apple proved this is the single highest-leverage fix. | Apple's CHI 2023 study: tuning the endpointer alone cut "cut-off" instances **79.1%**; raising the silence threshold to the "moderate" level pushed truncation for PWS below the **3%** target. ASR-decoder tuning is the smaller, second lever. |
| **Marcel's `stop_secs=2.5`** | **Already in the right zone — but it's a fixed threshold, which is the wrong shape.** The research direction is *adaptive / model-based* endpointing. | Marcel's pauses (1–3s) straddle 2.5s. A fixed threshold either cuts him off (too low) or adds 2.5s dead air to every fluent turn (too high). 2.5s is generous but still creates false endpoints on a 3s thinking pause. |
| **Decouple listening from processing** | **Keep the mic open continuously; buffer audio across the endpoint.** Don't stop capture when a candidate endpoint fires — run a "patience window" that merges post-pause speech back into the same utterance. | This is what "continuous listening while processing" means in practice. Half-duplex (mic off during response) is the architectural enemy; the master doc already flags it (L8/L10). |
| **STT model for verbatim capture** | **CrisperWhisper (nyrahealth)** as the verbatim/dysfluency-aware track, OR keep Whisper-turbo and add a **post-ASR disfluency-cleanup pass** (LLM or rule-based). | CrisperWhisper: **8.72% WER on AMI vs Whisper-large-v3's 16.01% (−47% rel.)**, preserves fillers/false-starts/repetitions with word-level timestamps, INTERSPEECH 2024. Whisper-turbo *smooths away* dysfluencies (designed for readability, not verbatim) → silent fragments. |
| **Filler handling** | **Detect, then *decide per-use-case* — don't blanket-remove.** Marcel's "um" before a thought is signal, not noise; the LLM brain should see it. | Whisper omits ~93% of fillers by default (7% → 63% hit-rate only with explicit prompting/tokenizer mods). For a *thinking* assistant, fillers carry turn-state information. |
| **Restart/repair detection** | **Use the reparandum/interregnum/repair (RIR) structure** as the canonical model. Strip the reparandum before the LLM sees the text, OR let the LLM see it and self-correct. | Speech repairs have a 40-year literature with a clean four-part annotation (reparandum → interruption point → interregnum → repair). Modern LLMs do this near-perfectly from text; no need for a separate detector in Marcel's single-speaker case. |
| **Accessibility posture** | Adopt the **W3C COGA Voice** "extend/disable timeout as a user setting" principle as a first-class user preference, not a hardcoded constant. | WCAG itself says nothing about speech-pattern accommodation, but W3C NAUR + COGA Voice modules explicitly require it. Marcel's case is the textbook motivation. |

**Bottom line:** Marcel's problem is the textbook "impatient endpointer." The fix is architectural —
adaptive endpointing + continuous-listen buffer + verbatim STT — not a parameter tweak. `stop_secs=2.5`
is treating the symptom; the cure is to stop letting the endpointer *commit* a turn at all. The
research converges hard on this, and Marcel's pauses (cognitive, not stuttered) are the *easy* case
relative to what the literature is trying to solve.

---

## 1. Academic research (2024–2026)

### 1.1 The field's center of gravity: the Speech Accessibility Project (SAP)

The single most important 2024–2026 development is the **Speech Accessibility Project** at UIUC
Beckman Institute — an industry consortium (Apple, Amazon, Google, Microsoft, Meta) that has
collected **400+ hours of speech from 500+ speakers with diverse speech disabilities**, now
~2,000 participants as of late 2025.

- **The Interspeech 2025 SAP Challenge** (arXiv 2507.22047): the first large-scale
  speaker-independent impaired-speech recognition challenge. Top team: **WER 8.11%, SemScore 88.44%**.
  ([Apple ML Research](https://machinelearning.apple.com/research/accessibility-project-challenge),
  [arXiv 2507.22047](https://arxiv.org/abs/2507.22047))
- **Microsoft reported 18–60% accuracy gains** from training on SAP data.
  ([SAP project page](https://speechaccessibilityproject.beckman.illinois.edu/))
- **Community-supported shared infrastructure** paper, *JSLHR* 2024, documents the dataset
  infrastructure. ([pubs.asha.org](https://pubs.asha.org/doi/10.1044/2024_JSLHR-24-00122))

**Why it matters for Marcel:** the dataset gap is the root cause of every commercial system's
poor pause/dysfluency handling. SAP is closing it. For a *local* assistant, the implication is
that fine-tuning data for non-fluent speech now exists publicly.

### 1.2 The foundational tuning study (Apple, CHI 2023) — read this one

Lea et al., *"From User Perceptions to Technical Improvement: Enabling People Who Stutter to Better
Use Speech Recognition"* (CHI 2023) is **the** load-bearing paper. It is the empirical proof that
endpointing is the problem.

Three interventions, measured independently:

1. **Endpointer threshold tuning** — raising the silence-to-turn threshold. The **mild** raised
   threshold cut truncation to a **per-participant average of 4.8%** (SD=6.4, median=1.5); the
   **moderate** threshold hit the **<3% target**.
2. **ASR decoder tuning** — fine-tuning on dysfluent speech.
3. **Dysfluency refinement in the transcript** — cleaning the output.

Combined result: **cut-off instances reduced 79.1%, WER reduced from 25.4% → 9.9%**.
([ACM DL](https://dl.acm.org/doi/10.1145/3544548.3581224),
[Apple ML Research](https://machinelearning.apple.com/research/speech-recognition),
[arXiv 2106.11759](https://arxiv.org/pdf/2106.11759))

**The key user-stat from the same paper:** of 59 participants familiar with VAs, **61.0%** said
"cut off before finishing" and **57.6%** said "doesn't understand my speech well enough" were the
top barriers to use. Endpointing is the dominant complaint.

### 1.3 "Impatient ASR" — the 2025–2026 scoping review

*Aligning Stuttered-Speech Research with End-User Needs: Scoping Review, Survey, and Guidelines*
(arXiv 2604.20535) coins the term **"Impatient ASR"**: the recurring failure where VAs stop
listening during blocks, repetitions, or extended pauses.

- **42% of people who stutter (PWS) don't use voice AI tools at all.**
- Mainstream systems (Siri called out by name) rated "not at all accessible" or "not very
  accessible."
- Technical failure → frustration + anxiety → avoidance. A self-reinforcing exclusion loop.
  ([arXiv 2604.20535](https://arxiv.org/pdf/2604.20535))

### 1.4 Whisper's documented dysfluency bias (directly relevant — Marcel runs Whisper)

This is the most stack-relevant finding in the lane. Multiple 2024–2025 studies quantify how badly
Whisper handles non-fluent speech:

| Study | Finding |
|---|---|
| *Lost in Transcription* (arXiv 2405.06150) | Whisper WER: **3.1% fluent → 19.8% disfluent** (6.4× degradation). |
| *J-j-j-just Stutter*, Interspeech 2025 | Whisper's WER on stuttered speech is **3–4× fluent**; **sound repetitions trigger hallucinations >20% of the time**. |
| Frontiers in Psychology, 2024 | Whisper average **WER 24.65%** on UCLASS stuttered corpus. |
| *Augmenting ASR with Disfluency Detection* (arXiv 2409.10177) | On conversational data, **only 56% of disfluencies are correctly transcribed**; **73.77% of untranscribed words *are* disfluencies**. |
| StutterGPT, 2025 | Whisper "adept at removing filler words, but struggled with sentence-end punctuation, causing run-on sentences." |

**The mechanism:** Whisper is trained for *readability* (intended/semantic transcription), not
*verbatim* capture. It "smooths out" stuttered and paused speech — which is *exactly* the wrong
behavior when the smoothing erases the boundary between "I want to…" [pause] "…actually, can you…"
and the assistant responds to "I want to."
([aimpower.org](https://aimpower.org/2024/11/07/disparities-in-whispers-automatic-speech-recognition-performance-on-disfluent-speech/))

### 1.5 Fine-tuning recovers most of the loss

- *Fine-Tuning ASR for Stuttered Speech* (Interspeech 2025): fine-tuning Whisper-Small on
  FluencyBank cut WER **36.1% → 4%**. ([arXiv 2506.00853](https://arxiv.org/html/2506.00853))
- *StutterZero/StutterFormer* (arXiv 2510.18938): end-to-end conversion pipeline.
- **Detect-and-Pass** (arXiv 2202.05396): detect the stutter event, pass clean audio to ASR —
  works with limited data.

### 1.6 The Indian-stammering perspective (IIITH-TISA corpus, 2024)

*Typical vs. Atypical Disfluency Classification* (arXiv 2411.17149) — built with The Indian
Stammering Association — re-emphasizes that **premature endpointer interruption is the top
self-reported frustration**. Reinforces that endpointing is the universal pain point, not a
Western-system quirk.

### 1.7 Other 2024–2026 threads

- **HeardAI** (NSF Convergence Accelerator, $5M phase-2, 2024): WMU + MSU building a stuttered-speech
  **"test bed"** for other developers + **accessibility standards** for voice AI.
  ([WMU news](https://wmich.edu/news/2024/02/74666))
- **Google Project Relate**: personalized model trained on one user's voice, **+37% recognition
  accuracy** in early trials. The personalization direction.
- **DRIVE** (arXiv 2507.19867, 2025): disfluency-rich synthetic dialog data for in-car voice —
  automotive is the commercial pressure point driving this research.
- **GPT-4o "Stuttering Detection"** (arXiv 2502.09940): GPT-4o voice mode outperforms Whisper+LLaMA
  on disfluency identification. The frontier is multimodal LLMs doing ASR *and* disfluency
  understanding jointly.

---

## 2. Commercial approaches — "patience modes"

### 2.1 Apple / Siri

| Feature | What it does | Limitation |
|---|---|---|
| **Hold-to-talk** | Hold the side button (iOS/Apple Watch) to *force* Siri to keep listening; release when done. | Manual. Requires Marcel to hold a button — defeats a hands-free assistant. |
| **Type to Siri** | Keyboard fallback. | Not voice. |
| **Endpointer tuning** (from §1.2) | Apple shipped the CHI 2023 endpointer + decoder improvements into production Siri. | Aggregate improvement; no user-facing "patience slider." |
| **Sound Recognition / accessibility** | Accessibility settings exist but target *sound* events, not speech-pause accommodation. | Gap. |

**Verdict:** Apple has done the most *research* but exposes the least *user control*. No explicit
"patience mode" toggle exists. The hold-to-talk gesture is the closest thing, and it's exactly the
manual-disambiguation pattern the research is trying to eliminate.
([Forbes](https://www.forbes.com/sites/stevenaquino/2021/10/05/exclusive-amazon-adds-new-speech-setting-to-alexa-app-to-help-stutterers-finish-commands-queries/))

### 2.2 Amazon / Alexa

- **"Sound Adjustment" accessibility setting** (2023): the closest thing to a commercial "patience
  mode." Available in the Alexa app → Device Settings. Designed for people who stutter so the device
  "waits longer for them to finish." ([Forbes exclusive, 2023](https://www.forbes.com/sites/stevenaquino/2021/10/05/exclusive-amazon-adds-new-speech-setting-to-alexa-app-to-help-stutterers-finish-commands-queries/))
- This is a **per-device** setting (must be enabled per Echo), not global.
- It is **the only major-assistant explicit dysfluency toggle.** Amazon publicly leads on the
  *user-facing* control; Apple leads on the *research*.

### 2.3 Google Assistant / Project Relate

- **Project Relate** is the flagship: a *personalized* ASR app (not the main Assistant) that trains
  on one user's atypical speech. Targets cerebral palsy, dysarthria, ALS, stroke, stuttering.
  **+37%** accuracy in early trials. Relays text into Google Assistant for actions.
- **Main Google Assistant: no public patience/pause setting.**
- Google is a SAP consortium member and trains on the UIUC corpus.

### 2.4 Dragon NaturallySpeaking (the dictation baseline)

Dragon is the instructive *counter-example* — it's the most mature speech product and it handles
dysfluency the **worst**:

- **Explicitly anti-disfluent:** user guidance says "avoid filler words like 'um' and 'uh' which can
  confuse the recognition engine" and "Dragon will understand 'natural' speech but not
  'conversational' speech — pretend you are a broadcast journalist reading the news."
  ([Dragon review](https://sozai.app/dragon-naturally-speaking-review/))
- **Pause is a *command delimiter*, not a thinking space:** "you have to pause between commands to
  have Dragon recognize them as two separate commands." ([Dragon v11 guide](https://carleton-wp-production.s3.amazonaws.com/uploads/sites/319/2020/04/Dragon_11_User_Guide.pdf))
- **Adjustable:** "Pause Between Phrases" slider on the Miscellaneous tab of Options.
  ([M-Tech tips](https://www.m-techlaptops.com/ShopOnline/pc/Tips-for-Dragon-NaturallySpeaking-d16.htm))
- **Learns from corrections** — adaptive per-user, but the burden is on the user to correct.

**Takeaway:** Dragon treats speech as a *command grammar* where pauses = structure. Modern voice
assistants treat pauses = end-of-turn. Neither treats pauses = *thinking*, which is Marcel's actual
case. The dictation paradigm's "broadcast journalist" instruction is precisely the fluent-speaker
norm the whole field is trying to escape.

### 2.5 No one has "continuous listening while processing"

The "keep the mic open, transcribe continuously, decide turn-completion on content not silence"
pattern is **not yet shipped by any major assistant**. It's the live research frontier:
- TurnGPT, Voice Activity Projection (arXiv 2506.21191): model-based turn-taking prediction.
- LiveKit/Retell/Deepgram: telephony-voice-agent vendors shipping model-based end-of-turn
  detection (~600ms latency). These are the closest production instances.
- The smart-speaker "always-on mic" is *only* for the wake word; the assistant goes half-duplex
  (mic muted) once it starts responding. Patents (USPTO 12424240 "dynamically adjusting a listening
  time," 12518756 "persistence across devices") describe the problem but the shipped behavior is
  still wake → listen → mute-while-talking → wake.

---

## 3. Accessibility guidelines & standards

### 3.1 What WCAG actually says about speech

**Directly: almost nothing.** WCAG 2.1/2.2 has no Success Criterion targeting speech-*pattern*
accommodation. The relevant material is in **W3C working-group notes** (informative, not normative):

| Document | Status | Relevant requirement |
|---|---|---|
| **[W3C NAUR](https://www.w3.org/TR/naur/)** (Natural Language Interface Accessibility User Requirements, 2022) | Working Group Note | Identifies VUI user needs; flags speech-recognition failure for atypical speech as a gap. |
| **[W3C COGA Voice](https://www.w3.org/TR/coga-voice/)** (Cognitive Accessibility Research Modules — Voice Systems & Conversational Interfaces) | Research module | The clearest requirements: *"Train and test speech recognition for users with non-typical speech patterns… **Include contingencies for pauses, use of incorrect terms, and mistakes**, and ensure alternative access for users whose speech is not recognized."* Also: *"the user should be able to **extend or disable timeout** as a system default on their device."* |
| **[W3C WAI — Speech abilities/barriers](https://www.w3.org/WAI/people-use-web/abilities/barriers/speech/)** | Reference | Defines the disability categories: speech sound disorder, **stuttering** ("influent speech, repetition… and **misplacement or prolongation of pauses**"), and "difficulty producing speech that is recognizable by… speech recognition software." |
| **WCAG 3.0** (draft) | Draft | Frames itself as a "living framework" that *will* need new patterns for voice interfaces — but the speech-accommodation criteria are not yet specified. |
| **ETSI 202 076** | Standard | Voice-command standard referenced for multi-language consistency. Not pause-specific. |

### 3.2 The concrete, adoptable principles for Marcel

Distilled from COGA Voice + NAUR, these are the standards-track requirements that map directly onto
Marcel's situation:

1. **Pause contingency is a named requirement.** COGA Voice explicitly lists "contingencies for
   pauses" as a recognition-system requirement — not an optional accessibility nicety.
2. **Timeout must be user-extensible / disable-able.** "The user should be able to extend or disable
   timeout as a system default on their device." This is the standards basis for making
   `stop_secs` a **user preference**, not a hardcoded `2.5`.
3. **Multi-modal fallback.** When speech isn't recognized, offer another channel (text). For Marcel,
   a typed-input fallback to the same brain is the safety net.
4. **Train/test with diverse speech.** Standards push toward evaluating on non-typical speech. The
   SAP challenge (§1.1) is the dataset that makes this testable.

**Gap:** no standard yet mandates *adaptive* (vs fixed) endpointing. That's ahead of the standards
curve — so Marcel's assistant would be doing something the standards bodies haven't caught up to.

---

## 4. Filler-word handling ("um," "uh," "like," "you know")

### 4.1 The two-strategy split

| Strategy | What it does | When it's right |
|---|---|---|
| **Transcript-based** | ASR transcribes fillers; a downstream model detects/removes them. | When you want a *clean* transcript for the LLM brain. |
| **Audio-based** | Detect fillers directly from the waveform (VAD + classifier), before/alongside ASR. | When ASR can't be trusted to capture them (Whisper's case). |

### 4.2 Whisper's filler problem (stack-relevant)

- **Whisper omits ~93% of fillers by default.** Root cause: text-standardization in training strips
  "uh/um," and the tokenizer can't emit them reliably. ([HF discussion](https://huggingface.co/spaces/openai/whisper/discussions/30))
- **WhisperD** (Interspeech 2025): modified the tokenizer to include "uh"/"um"; filler hit-rate
  jumped. ([WhisperD](https://arxiv.org/html/2505.21551v1))
- **Prompting helps:** an `initial_prompt` like *"Umm, let me think like, hmm… Okay, here's what I'm,
  like, thinking."* raised top-7 filler recognition **7% → 63%**. ([arXiv 2605.05231](https://arxiv.org/pdf/2605.05231))

### 4.3 CrisperWhisper — the verbatim alternative

[CrisperWhisper](https://huggingface.co/nyrahealth/CrisperWhisper) (nyrahealth, INTERSPEECH 2024):
- Fine-tuned Whisper for **verbatim** transcription — preserves fillers, false starts, repetitions.
- Tokenizer adjustment + Dynamic Time Warping for accurate word-level timestamps around
  disfluencies/pauses.
- **8.72% WER on AMI vs Whisper-large-v3's 16.01% (−47% relative)** — because it doesn't smooth.
- Segments disfluency types: repetitions, false starts, partial words; differentiates `[UH]` vs
  `[UM]`; pause detection aligned with clinical protocols.
- **`faster_CrisperWhisper`** variant exists for lower-latency inference.

**For Marcel:** this is the *transcription* side of the fix. If the STT preserves pauses and
restarts verbatim, the endpointer and the LLM brain both get honest signal to work with.

### 4.4 Detection datasets

- **PodcastFillers** (Interspeech 2022): 35K annotated fillers + 50K other sounds (breaths,
  laughter, word repetitions). The benchmark.
  ([arXiv 2203.15135](https://arxiv.org/pdf/2203.15135))

### 4.5 The decision Marcel actually faces: detect *and keep*, or detect *and strip*?

The literature defaults to **stripping** fillers (readability, downstream NLP cleanliness). For a
*thinking assistant*, that's the wrong default:

- A filler before a turn-hold ("um… let me think…") is a **turn-continuation signal**. Stripping it
  hides the fact the user is still thinking.
- "You know" / "like" often mark *repair-onsets* — they precede a rephrasing (§5).
- The LLM brain is robust to fillers in text; modern LLMs ignore or interpret them fine.

**Recommendation:** capture verbatim (CrisperWhisper or prompted Whisper), pass the *raw* transcript
to the LLM, and let the LLM's own disfluency-understanding handle it (§5). Strip only if feeding a
brittle downstream parser. Whisper's default smoothing is the worst of both worlds: it strips
*information* but doesn't strip it *cleanly* (it mistranscribes the word *after* the filler).

---

## 5. Restart / rephrasing detection

### 5.1 The canonical model: reparandum–interregnum–repair (RIR)

Speech-disfluency research (Shriberg 1994 onward) uses a **four-part structure** — this is the
shared vocabulary across every detection system:

```
"I want to [go to]    +    {uh}    I mean [the store]"
   reparandum (RM)  interrupt  interregnum  repair (RP)
                    point (IP)     (IM)
```

- **Reparandum (RM):** the words the speaker intends to discard.
- **Interruption point (IP/+):** where the reparandum ends (often a cut-off word, a pause, or a
  filled pause).
- **Interregnum (IM):** edit terms — "uh," "I mean," "actually," "sorry."
- **Repair (RP):** the corrected continuation.

Three disfluency *classes* (LARD taxonomy, arXiv 2201.05041):
- **Repetitions** — RM and RP are identical. Most common, easiest to detect.
- **Replacements** — RM is swapped for RP ("I want the r- the red one").
- **Restarts** — speaker abandons the utterance entirely and restarts. No real repair; this is
  Marcel's "I want to… actually, can you…" case. ([arXiv 2201.05041](https://arxiv.org/pdf/2201.05041))

### 5.2 How systems decide to "wait for the complete thought"

There are three deployed/prototyped mechanisms — in rough order of maturity:

1. **Endpointer tolerance (negative control).** The dumbest but most reliable: just *don't fire* the
   endpoint for N seconds after any speech. This is what `stop_secs=2.5` does. It can't distinguish
   "complete thought + trailing silence" from "mid-thought pause," so it either over-waits or
   under-waits.

2. **Disfluency-detection models on the transcript.** Tag RM/IM/RP spans, strip RM before downstream
   processing. Models:
   - **ACNN** (Auto-Correlational NN, arXiv 1808.09092): CNN + auto-correlation operator to capture
     "rough-copy" dependencies (repetitions). [ACL Anthology](https://aclanthology.org/D18-1490/)
   - **BiLSTM taggers** (arXiv 1604.03209), **auxiliary-task labeling** (arXiv 2011.04512).
   - **STIR** (Strongly Incremental Repair detection): detects repairs *incrementally* with minimal
     latency — the right shape for a live assistant.
   - **LLM-based disfluency removal** (ResearchGate 385938586, 2024): a modern LLM cleans the
     transcript post-ASR. Cheaper than training a detector; the LLM already "knows" RIR structure.

3. **End-to-end ASR + disfluency understanding** (arXiv 2009.10298): joint model that transcribes
   *and* removes disfluencies in one pass, using paralinguistic features a pipeline can't see. The
   frontier; avoids the ASR→detector latency tax.

4. **Model-based turn-taking (the smart-endpointing frontier).** Instead of "silence for N ms = turn
   end," a model predicts end-of-turn from prosody + content + context. TurnGPT, Voice Activity
   Projection (arXiv 2506.21191). This is what lets the system hold through a 3s thinking pause
   *because the model knows the thought isn't complete*.

### 5.3 Detection from untranscribed audio

*Automatic Disfluency Detection from Untranscribed Speech* (arXiv 2311.00867, 2023) — detects
disfluencies *before* full transcription, useful for early endpointer decisions. This is the
technically interesting path: a lightweight disfluency flag feeds the endpointer in real time, so
the endpointer can say "that pause is *inside* a repair, hold the turn."

### 5.4 What's right for Marcel's single-speaker case

Marcel doesn't need a research-grade RIR tagger. His rephrasings ("I want to… actually, can you…")
are **restarts with explicit interregnum cues** ("actually," "wait," "I mean," "no"). Two cheap,
effective options:

1. **Let the LLM brain see the verbatim transcript and self-correct.** A modern LLM reads
   "I want to… actually can you check the calendar" as "check the calendar" with near-perfect
   accuracy. No separate detector needed — *provided* STT preserved the restart verbatim (CrisperWhisper,
   §4.3). Whisper-turbo's smoothing *destroys* the restart cue, which is why Marcel currently gets
   fragments.

2. **Rule-based interregnum + pause detection as an endpointer veto.** If the transcript-so-far ends
   with a repair cue ("actually," "wait," "I mean," "no," "sorry," "let me…") OR a mid-sentence
   pause >1s with no terminal prosody, *veto the endpoint* and keep listening. Cheap, deterministic,
   handles Marcel's exact pattern.

Option 1 + 2 together cost ~zero extra latency and directly address the "respond to a fragment"
failure mode.

---

## 6. Concrete recommendation for Marcel's stack

Synthesizing against the master architecture (L00) and the local-STT lane (L08):

| Layer | Current | Recommended change | Evidence |
|---|---|---|---|
| **Endpointer** | Fixed `stop_secs=2.5` | Add an **interregnum/repair veto**: don't commit a turn if the running transcript ends on a repair cue or a pause without terminal prosody. Make `stop_secs` a **user preference** (COGA Voice requirement), not a constant. | §1.2 (Apple 79% reduction from endpointer work), §3.2 (timeout must be user-extensible) |
| **Mic / listening** | Half-duplex (mic muted during response) → no barge-in | **Continuous-listen buffer**: keep capturing across candidate endpoints; merge post-pause speech into the same utterance until a *content-confirmed* turn-end. | §2.5, master doc L8/L10 |
| **STT model** | Whisper-large-v3-turbo (smooths dysfluencies) | **Track A (cheap):** keep turbo, add `initial_prompt` for filler capture (7%→63%) + post-ASR LLM cleanup. **Track B (better):** swap to **CrisperWhisper** / `faster_CrisperWhisper** for verbatim capture. Benchmark both in Marcel's room/mic. | §1.4 (Whisper bias), §4.2–4.3 (CrisperWhisper −47% WER) |
| **Disfluency handling** | None — fragments go straight to brain | Pass verbatim transcript to the LLM; let it self-correct restarts (it can). Optionally strip fillers only for brittle downstream tools. | §4.5, §5.4 |
| **Turn decision** | Silence timeout | Move toward **model-based end-of-turn** (prosody + content) as the V2 — the research frontier that lets the system hold through a 3s thinking pause *because the thought isn't complete*. | §5.2 item 4, §2.5 |
| **Fallback** | None | Add a **typed-input path** to the same brain (COGA Voice multi-modal requirement). | §3.2 item 3 |

**The one-line takeaway for the rebuild:** Marcel's dysfluency is the *easy* end of the research
spectrum (cognitive pauses + explicit restart cues, not blocks/prolongations). The fix is almost
entirely on the **endpointing + listening architecture**, not on exotic STT. Verbatim STT
(CrisperWhisper) is the high-leverage model swap; the rest is decoupling the turn-commit from the
silence timer.

---

## Sources

**Foundational / SAP**
- [The Interspeech 2025 Speech Accessibility Project Challenge](https://arxiv.org/abs/2507.22047) · [Apple ML Research mirror](https://machinelearning.apple.com/research/accessibility-project-challenge)
- [Speech Accessibility Project — UIUC Beckman](https://speechaccessibilityproject.beckman.illinois.edu/)
- [Community-Supported Shared Infrastructure in Support of Speech Accessibility, *JSLHR* 2024](https://pubs.asha.org/doi/10.1044/2024_JSLHR-24-00122)

**Endpointer & tuning (the load-bearing papers)**
- Lea et al., [From User Perceptions to Technical Improvement: Enabling People Who Stutter to Better Use Speech Recognition, CHI 2023](https://dl.acm.org/doi/10.1145/3544548.3581224) · [Apple ML Research summary](https://machinelearning.apple.com/research/speech-recognition) · [arXiv 2106.11759](https://arxiv.org/pdf/2106.11759)
- [Aligning Stuttered-Speech Research with End-User Needs (scoping review), arXiv 2604.20535](https://arxiv.org/pdf/2604.20535)
- [Typical vs. Atypical Disfluency Classification (IIITH-TISA), arXiv 2411.17149](https://arxiv.org/html/2411.17149)

**Whisper dysfluency bias (stack-relevant)**
- [Lost in Transcription: ASR Accuracy Biases Against Disfluent Speech, arXiv 2405.06150](https://arxiv.org/pdf/2405.06150)
- [J-j-j-just Stutter: Benchmarking Whisper's Performance Disparities, Interspeech 2025](https://www.isca-archive.org/interspeech_2025/sridhar25_interspeech.pdf)
- [Augmenting ASR Models with Disfluency Detection, arXiv 2409.10177](https://arxiv.org/html/2409.10177v2)
- [Disparities in Whisper's ASR Performance on Disfluent Speech](https://aimpower.org/2024/11/07/disparities-in-whispers-automatic-speech-recognition-performance-on-disfluent-speech/)
- [Comparison of ASR performance for stutters, *Frontiers in Psychology* 2024](https://www.frontiersin.org/journals/psychology/articles/10.3389/fpsyg.2024.1155285/full)
- [StutterGPT: Evaluating AI Speech Models with Stuttering, McDermott 2025](https://jackrmcdermott.medium.com/stuttergpt-evaluating-ai-speech-models-with-stuttering-4b6524849233)

**Fine-tuning / conversion**
- [Fine-Tuning ASR for Stuttered Speech: Personalized vs. Generalized, Interspeech 2025, arXiv 2506.00853](https://arxiv.org/html/2506.00853)
- [StutterZero and StutterFormer, arXiv 2510.18938](https://arxiv.org/html/2510.18938v1)
- [Enhancing ASR for Stuttered Speech with Limited Data (Detect-and-Pass), arXiv 2202.05396](https://arxiv.org/pdf/2202.05396)
- [GPT-4o Voice Mode — Stuttering Detection, arXiv 2502.09940](https://arxiv.org/html/2502.09940v1)

**Commercial / patience modes**
- [Amazon Adds Speech Setting to Alexa for Stutterers, Forbes 2023](https://www.forbes.com/sites/stevenaquino/2021/10/05/exclusive-amazon-adds-new-speech-setting-to-alexa-app-to-help-stutterers-finish-commands-queries/)
- [Voice recognition devices struggle to understand stutterers, Built In 2019](https://builtin.com/articles/voice-recognition-devices-struggle-understand-stutterers)
- [Stuttering in the Age of Alexa, Medium 2020](https://medium.com/swlh/stuttering-in-the-age-of-alexa-b2d32661c36d)
- [Dragon NaturallySpeaking Review 2026](https://sozai.app/dragon-naturally-speaking-review/) · [Dragon v11 User Guide](https://carleton-wp-production.s3.amazonaws.com/uploads/sites/319/2020/04/Dragon_11_User_Guide.pdf) · [Dragon tips (Pause Between Phrases slider)](https://www.m-techlaptops.com/ShopOnline/pc/Tips-for-Dragon-NaturallySpeaking-d16.htm)
- [Moving into the next phase for voice-activated technology accessibility (HeardAI / NSF), WMU 2024](https://wmich.edu/news/2024/02/74666)

**Standards**
- [W3C NAUR — Natural Language Interface Accessibility User Requirements](https://www.w3.org/TR/naur/)
- [W3C COGA Voice — Cognitive Accessibility Research Modules: Voice Systems & Conversational Interfaces](https://www.w3.org/TR/coga-voice/)
- [W3C WAI — Speech abilities and barriers](https://www.w3.org/WAI/people-use-web/abilities/barriers/speech/)
- [W3C WAI — Let Users Avoid Navigating Voice Menus](https://www.w3.org/WAI/WCAG2/supplemental/patterns/o6p04-voice-menus/)
- [WCAG 3.0 draft](https://www.w3.org/TR/wcag-3.0/)

**Filler-word handling**
- [CrisperWhisper — nyrahealth, HF](https://huggingface.co/nyrahealth/CrisperWhisper) · [GitHub](https://github.com/nyrahealth/CrisperWhisper) · [paper arXiv 2408.16589](https://arxiv.org/pdf/2408.16589) · [faster_CrisperWhisper](https://huggingface.co/nyrahealth/faster_CrisperWhisper)
- [WhisperD: Dementia Speech Recognition and Filler Word Detection, Interspeech 2025](https://arxiv.org/html/2505.21551v1)
- [Filler Word Detection and Classification (PodcastFillers), arXiv 2203.15135](https://arxiv.org/pdf/2203.15135)
- [OpenAI Whisper — filler-word detection discussion](https://huggingface.co/spaces/openai/whisper/discussions/30)
- [Prompting Whisper for Joint Transcription (filler prompt 7%→63%), arXiv 2605.05231](https://arxiv.org/pdf/2605.05231)
- [End-to-End Speech Recognition and Disfluency Removal, arXiv 2009.10298](https://arxiv.org/pdf/2009.10298)
- [Disfluency Detection and Removal via LLMs, 2024](https://www.researchgate.net/publication/385938586_Disfluency_Detection_and_Removal_in_Speech_Transcriptions_via_Large_Language_Models)

**Restart / repair detection**
- [LARD: Large-scale Artificial Disfluency Generation, arXiv 2201.05041](https://arxiv.org/pdf/2201.05041)
- [Disfluency Detection using Auto-Correlational Neural Networks, arXiv 1808.09092](https://aclanthology.org/D18-1490/)
- [Disfluency Detection using a Bidirectional LSTM, arXiv 1604.03209](https://arxiv.org/pdf/1604.03209)
- [Auxiliary Sequence Labeling Tasks for Disfluency Detection, arXiv 2011.04512](https://arxiv.org/pdf/2011.04512)
- [Automatic Disfluency Detection from Untranscribed Speech, arXiv 2311.00867](https://arxiv.org/abs/2311.00867)
- [Strongly Incremental Repair Detection (STIR)](https://www.academia.edu/17540525/Strongly_Incremental_Repair_Detection)

**Endpointing / turn-taking engineering**
- [Turn Detection for Voice Agents: VAD, Endpointing, Model-Based, LiveKit 2026](https://livekit.com/blog/turn-detection-voice-agents-vad-endpointing-model-based-detection)
- [Core Latency in AI Voice Agents, Twilio](https://www.twilio.com/en-us/blog/developers/best-practices/guide-core-latency-ai-voice-agents)
- [Implementing VAD and Turn-Taking for Natural Voice AI Flow, DEV 2025](https://dev.to/callstacktech/implementing-vad-and-turn-taking-for-natural-voice-ai-flow-my-experience-1bdf)
- [Streaming Endpointer using Neural Audio Codecs, arXiv 2506.07081](https://arxiv.org/html/2506.07081)
- [Prompt-Guided Turn-Taking Prediction (TurnGPT / Voice Activity Projection), arXiv 2506.21191](https://arxiv.org/pdf/2506.21191)

*Researched 2026-07-07. Lane 13 of the voice-assistant rebuild research set — see
`00-MASTER-RECOMMENDATION.md` for synthesized architecture and `08-local-stt.md` for the STT-model
detail this builds on.*
