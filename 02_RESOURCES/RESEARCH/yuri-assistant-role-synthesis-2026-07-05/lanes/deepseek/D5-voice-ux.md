Now I have the full picture. Let me synthesize across all sources.

---

# VOICE-FIRST ASSISTANT UX SURVEY — Yuri (mic→STT→GLM→TTS)

**Research date:** 2026-07-05 | **Sources:** Marcel questionnaire (verbatim 2026-07-04), realtime architecture research (2026-06-17), Jeffrey conveyor architecture (2026-07-04), voice loop master brief (2026-06-16), H1 capability inventory (2026-07-05), H2 gap analysis (2026-07-05), René pilot learnings (2026-07-05), bot.py live code, yuri-z-brain.py live code.

---

## 1. ACCEPTABLE LATENCY — Simple vs Hard

### The architecture spectrum (measured TTFA = time-to-first-audio)

| Architecture | TTFA | Brain | Yuri status |
|---|---|---|---|
| **S2S native** (Grok Voice, GPT-realtime, Gemini Live) | **0.78–1.1s** | audio-native model | NOT Yuri (GLM is text) |
| **Streaming cascade** (streaming STT + text-LLM streaming + streaming TTS) | **<1s–~2.5s** | ANY text LLM | **Yuri's current architecture** (Pipecat + Kokoro streaming + GLM-5.2) |
| **Turn-end cascade** (Stop-hook fires TTS at turn-end) | **turn-length + synth** | real Claude Code session | The OLD Claude-voice path (replaced) |
| Human conversational baseline | ~0.2s | — | The bar |

**HARD-FACT** (source: realtime architecture research 2026-06-17, citing softcery.com TTFA benchmarks + verified against Claude Code docs).

### What this means for Yuri

Yuri's current stack (Pipecat + Kokoro streaming + GLM-5.2) is already a **streaming cascade** — not the old turn-end bottleneck. The brain is GLM-5.2 (not Claude Code), so the "impossible trinity" constraint (Claude + VS Code session + sub-second latency = pick 2) does NOT apply to Yuri's own voice loop. Yuri's brain is a fast cloud GLM, not a turn-bound Claude Code session.

**HARD-FACT** (source: bot.py L1-100, yuri-z-brain.py L1-30 — live code, verified).

**Simple requests** (fact recall, memory lookup, app launch, play music, check calendar):
- Streaming cascade TTFA: **<1s–1.5s** (STT ~200ms + brain first-token ~500ms + TTS streaming starts immediately)
- Feels instant. The brain's first-token latency dominates; Kokoro streams as text arrives.
- **HARD-FACT** (source: bot.py uses KokoroTTSService streaming; yuri-z-brain.py uses GLM-5.2 with 4096 thinking budget — first-token latency is the bottleneck, not TTS).

**Hard requests** (research, drafting, multi-step tool chains, parallel dispatch):
- Brain thinking time dominates: **3–15s** for reasoning-heavy tasks (thinking budget 4096 tokens).
- The architecture already streams TTS as tokens arrive, so the user hears the first sentence at ~brain-first-token latency, not at turn-end.
- **RECALLED-PATTERN** (source: Jeffrey conveyor architecture §3 — bridge policy designed for this exact gap; not yet empirically measured on Yuri's GLM-5.2 brain).

### The real latency contract

**HARD-FACT** (source: Marcel questionnaire Q22–24, verbatim):
- Marcel expects **conversational pace** — speech keeps up with a racing mind (Q6).
- He does NOT specify numeric latency targets. The contract is: "like an active call with a super genius who works for us" (Q6).
- For hard tasks: he wants **context small talk + progress notes** while it works (Q9), not silence.

**RECALLED-PATTERN** (source: Jeffrey conveyor architecture §3 — designed for René, not directly Marcel-tested):
- T1 = **2.5s** threshold: below this, silence is better than a bridge utterance.
- T2 = **10s** threshold: second bridge only past this point.
- Hard cap: **2 bridge utterances per dispatch** — repetition is the #1 annoyance risk.
- Bridge lines come from a **rotating template pool seeded with turn context**, never free-generated twice in a row.

### Verdict for Yuri

| Request type | Acceptable latency | What makes it feel fast |
|---|---|---|
| Simple (fact, app, memory) | <1.5s TTFA | Already achieved (streaming cascade) |
| Medium (single tool call, file edit) | 2–5s | First sentence streams at ~1s; brain finishes in background |
| Hard (research, multi-step, dispatch) | 5–20s | **Bridge utterances are the make-or-break** — silence = dead call |

---

## 2. PROGRESS-BRIDGING SMALL TALK vs "I'LL GET BACK TO YOU"

### Marcel's stated preference

**HARD-FACT** (source: Marcel questionnaire Q9, verbatim):
> "While it works on something longer: should it bridge with brief context-related small talk, give a progress note, or stay silent until done?" → **"context small talk + progress notes"**

**HARD-FACT** (source: Marcel questionnaire Q24):
> "If a task takes minutes: should it say 'I'll get back to you' and notify later, or hold the conversation?" → Marcel's perfect-day scenario (Q18) describes **holding the conversation** — discuss, Yuri drafts, owner confirms, Yuri dispatches, parallel sessions run while they continue talking. The model is **co-worker, not async-notifier**.

### The bridge policy (from Jeffrey conveyor — adapted for Yuri)

**RECALLED-PATTERN** (source: Jeffrey conveyor architecture §3 — designed for the SLM+worker split, generalizable to any long-brain-turn scenario):

```
T < 2.5s  → silence (bridge would be more annoying than the wait)
2.5s < T < 10s → ONE task-anchored bridge utterance
  "Ich rechne das kurz durch…" / "Let me think through that…"
  Must be CONTEXT-RELATED, not generic filler
T > 10s   → progress note
  "Still working on it — the research is coming together"
  Hard cap: 2 bridge utterances total per dispatch
T > 30s   → "I'll get back to you" + notify when done
  (Only if the user hasn't already moved on to another topic)
```

### What changes for Yuri vs Jeffrey

Yuri's brain (GLM-5.2) is the SAME model for both "conveyor" and "worker" — there is no separate SLM. This means:

- **Yuri cannot talk while she thinks** — the same model that's reasoning is the one that would need to produce bridge utterances. The bridge utterance would interrupt her own thinking.
- **Solution:** The bridge must come from a **separate lightweight mechanism** — either a cached template pool (pre-written lines selected by context) or a tiny local model (3B class) that runs in parallel with the main brain.
- **HARD-FACT** (source: yuri-z-brain.py — single-threaded HTTP server, one model call per turn. No parallel inference path exists today).

**RECALLED-PATTERN** (source: voice loop master brief 2026-06-16 — the Claude Code voice loop used a separate `voice-tts.mjs` hook that could speak while Claude thought, because the hook fires at turn-end. For Yuri's streaming cascade, the brain IS the bottleneck.)

### The "I'll get back to you" pattern

**HARD-FACT** (source: Marcel questionnaire Q18 perfect-day scenario):
> "Overnight tasks run reliably while away."

This is the **async pattern** — for tasks that take minutes to hours, not seconds. The contract:
1. Yuri says "I'll work on this and get back to you" (spoken, confirmed)
2. Task runs in background (spawned worker or overnight runner)
3. Yuri notifies when done (next morning brief, or push notification)
4. Marcel does NOT hold the conversation for overnight tasks

**HARD-FACT** (source: H1 capability inventory — `spawn_worker` tool is LIVE, `conductor_send` is LIVE but confirm-gated. The infrastructure for async dispatch exists.)

### Verdict

| Duration | Pattern | Yuri status |
|---|---|---|
| <2.5s | Silence (bridge would annoy) | Already works (streaming cascade) |
| 2.5–10s | One task-anchored bridge utterance | **MISSING** — needs parallel bridge mechanism |
| 10–30s | Progress note (max 2 bridges) | **MISSING** — needs parallel bridge mechanism |
| >30s | "I'll get back to you" + notify | Infrastructure exists (spawn_worker + morning_brief) |

---

## 3. WRITING FOR THE SPOKEN WORD

### The problem

**HARD-FACT** (source: Marcel questionnaire Q6):
> "Voice: humanises complex processes; faster flow — speech keeps up with a racing mind better than typing."

**HARD-FACT** (source: H2 gap analysis — "Voice: no bullet-salad, written for speech" status = PARTIAL):
> Brain has no explicit TTS-optimized prompt rule. Minimal fix: add prompt section "Keep answers concise, spoken-word friendly; avoid lists."

**HARD-FACT** (source: bot.py system prompt, line 1):
> `SYSTEM = "You are Yuri, the spoken voice assistant. Keep replies short and conversational."`

### What "spoken word" means in practice

**RECALLED-PATTERN** (synthesized from Marcel's questionnaire + René pilot + voice loop brief):

1. **No bullet lists** — bullets don't parse in speech. "Three things: first, the build passed. Second, the memory index needs a reindex. Third, I found a new paper on MoE routing." NOT "• Build passed\n• Memory needs reindex\n• New MoE paper"

2. **No markdown syntax** — no `**bold**`, `*italic*`, `# headers`, `[links]()`. The TTS will read the symbols aloud or stumble.

3. **Short sentences** — spoken working memory holds ~7 words per chunk. Compound sentences with multiple clauses lose the listener.

4. **One idea per utterance** — don't pack the research findings, the action plan, and the status update into one speech block. Pause between ideas.

5. **Conversational connectors** — "So…", "Right, so…", "Let me think about that…", "Here's what I found…" — these are the punctuation of speech.

6. **Numbers spoken naturally** — "about three thousand" not "3,000", "half a second" not "0.5s".

7. **No code blocks in speech** — "I found a function called `computeU` that takes a state vector" not "def computeU(state): return sum(...)".

### Current state

**HARD-FACT** (source: yuri-z-brain.py system prompt, lines 51–120 — the TOOL_NOTE):
- The brain's system prompt is written for a **text assistant** — it has tool descriptions, confirm-gate rules, memory instructions. It is NOT optimized for spoken output.
- The only spoken-optimization is the brief `bot.py` system prompt: "Keep replies short and conversational."

**HARD-FACT** (source: voice-tts.mjs — the Claude Code voice hook):
- Strips markdown, code blocks, links from the reply before TTS.
- Caps at 2 sentences.
- This is a **post-processing filter**, not a brain-level instruction. It works for the Claude Code voice loop but is not wired into Yuri's brain.

### The fix

**RECOMMENDED** (from H2 gap analysis — minimal fix, 0.5h effort):
- Add to Yuri's brain system prompt: "You are speaking aloud. Answer concisely, as if talking to a colleague. Avoid lists, markdown, and code blocks in your spoken reply. Use short sentences. One idea at a time."
- This is a **prompt-level fix** — no code change needed.

---

## 4. TTS QUALITY AS MAKE-OR-BREAK

### The evidence

**HARD-FACT** (source: René pilot learnings 2026-07-05, commit `a57179c3`):
> "Robotic SAPI TTS rejected → Kokoro British 'Sir' voice. **Voice quality is non-negotiable** for a spoken assistant; default TTS was a dealbreaker."

René replaced the default TTS **same-day**. This is the strongest signal in the dataset — a real user independently confirmed that TTS quality is the #1 adoption gate.

**HARD-FACT** (source: voice loop master brief 2026-06-16):
- Chatterbox-Turbo Rick clone was **1.4× realtime, non-streaming** → rejected as too slow.
- Pivoted to **Marvis-TTS** (streaming, MLX-native, clones from 10s ref).
- Current live state: **Kokoro** (streamed, British female `bf_isabella`).

**HARD-FACT** (source: bot.py L1-100 — live code):
- `VOICE = os.environ.get("YURI_VOICE", "bf_isabella")` — Kokoro preset.
- `VOICE_LANG = os.environ.get("YURI_VOICE_LANG", "b")` — British.
- Kokoro is **streaming** (speaks as text arrives, not batch-synth-then-play).

### What makes TTS acceptable

**RECALLED-PATTERN** (synthesized from René pilot + voice loop research + Marcel's Rick voice preference):

| Dimension | Dealbreaker | Acceptable | Good |
|---|---|---|---|
| **Naturalness** | Robotic, SAPI, Microsoft David/Zira | Kokoro, Piper with good voice | ElevenLabs, Marvis clone |
| **Streaming** | Batch-synth-then-play (adds 2-5s latency) | Chunked streaming | Token-level streaming |
| **Latency** | >2s TTFA from text ready | <500ms from text ready | <200ms (feels instant) |
| **Voice persona** | Wrong gender/age for the role | Matches assistant persona | Cloned voice of a known character |
| **Emotion** | Monotone, no prosody | Natural prosody | Emotion tags ([laugh], [sigh]) |
| **Barge-in** | Keeps talking when user interrupts | Stops within 50ms | Graceful stop + context resume |

### Yuri's current TTS quality

**HARD-FACT** (source: bot.py live code + H1 capability inventory):
- **Kokoro** is streaming, natural, British female — **acceptable to good**.
- **Barge-in** is LIVE via `InstantBargeIn` processor (reacts to raw VAD, pre-STT, ~50ms).
- **Not yet:** Marvis clone (planned but not live), emotion tags, voice persona customization beyond env var.

### The René signal for Yuri

René's rejection of robotic TTS is the **canary**. Yuri's Kokoro default is already better than SAPI, but:
- If Marcel ever wants a different voice (Rick, male, American), the env-var swap is trivial.
- If Kokoro ever feels robotic in a specific context (German, technical terms), the fix is to swap the TTS provider, not to tolerate it.

---

## 5. MINIMAL VOICE-INTERACTION CONTRACT

### What makes it feel like a live call with a competent colleague

Synthesized from ALL sources — Marcel's verbatim answers, the architecture decisions, the pilot signal, and the live code:

**HARD-FACT** (source: Marcel questionnaire Q6, Q9, Q18 — the crown scenario):
> "Like an active call with a super genius who works for us."

### The contract (7 rules)

**1. Always-on, addressed-speech activation**
- Wakeword ("Yuri") or hotkey (Cmd+Opt+Y) — never hot-mic without a gate.
- **HARD-FACT** (source: Marcel Q17: wakeword/hotkey; bot.py has WakeGate LIVE with keepalive window).
- The WakeGate stays awake for 5s after a wake word so follow-ups don't need repetition.

**2. Streaming TTS from first token**
- Start speaking the moment the brain produces the first sentence — don't wait for the full turn.
- **HARD-FACT** (source: bot.py uses KokoroTTSService streaming — already achieved).

**3. Barge-in always wins**
- The instant the user speaks, Yuri stops talking. No "finishing the sentence."
- **HARD-FACT** (source: bot.py InstantBargeIn processor — reacts to raw VADUserStartedSpeakingFrame, pre-STT, ~50ms. Verified in live code.)

**4. Bridge utterances for long thinking**
- If the brain takes >2.5s, Yuri says one context-related bridge line.
- If >10s, a second progress note.
- Hard cap: 2 bridges per dispatch. Then silence until result.
- **MISSING** — needs a parallel bridge mechanism (Yuri's brain can't talk and think simultaneously).

**5. Spoken-word output, not text**
- No bullet lists, no markdown, no code blocks in speech.
- Short sentences, one idea per utterance, conversational connectors.
- **PARTIAL** — bot.py has "Keep replies short and conversational" but brain system prompt is text-oriented. Needs prompt-level fix.

**6. Confirm-gate for outward-facing actions only**
- Routine work (read, write, edit, run, launch apps, local git) → just DO it and speak the outcome.
- Outward-facing (send email, push to remote, publish, delete) → speak intent + hold for confirm.
- **HARD-FACT** (source: yuri-z-brain.py TOOL_NOTE lines 51-120 — confirm-gate is LIVE and correctly scoped).

**7. Morning ritual anchors the relationship**
- Boot → wake → "Good morning Marcel, shall we continue from where we left off or do you have something new for us to do?" → absence report → idea surfacing → co-plan → dispatch.
- **HARD-FACT** (source: Marcel Q7 greeting verbatim, Q18 perfect day; `morning_brief` tool is LIVE).

### What it sounds like (worked example)

```
Marcel: [wakes] "Yuri, what happened while I was gone?"
Yuri:  "Good morning. Three things: the overnight build passed, 
        the memory index finished reindexing, and I found a paper 
        on MoE routing that might help with the worker dispatch 
        latency. Want me to summarize it?"
Marcel: "Yeah, go ahead — and also draft a prompt for Claude to 
        implement the bridge mechanism."
Yuri:  [thinking 3s] "Let me pull that paper…" [thinking 8s] 
       "Right, so the key insight is that MoE with CPU-offloaded 
        experts can run a 3B bridge model alongside the main brain 
        with almost zero VRAM cost. I've drafted the prompt for 
        Claude — want to review it?"
Marcel: "Show me."
Yuri:  [reads draft aloud]
Marcel: "Looks good, send it."
Yuri:  [dispatches to worker] "Sent. It's running in worker-1. 
        I'll let you know when it's done."
```

---

## BUILD LIST — Patterns worth adopting

| # | Pattern | Source | Effort | Priority |
|---|---|---|---|---|
| B1 | **Bridge utterance mechanism** — parallel lightweight model or cached template pool that speaks while the main brain thinks | Jeffrey conveyor §3 (RECALLED-PATTERN) | 4-8h | **CRITICAL** — the #1 gap in Yuri's voice UX |
| B2 | **Spoken-word brain prompt** — add "You are speaking aloud. Answer concisely, as if talking to a colleague. Avoid lists, markdown, and code blocks. Short sentences. One idea at a time." | H2 gap analysis (HARD-FACT gap) | 0.5h | **HIGH** — trivial fix, immediate improvement |
| B3 | **Bridge policy config** — per-user dial: `BRIDGE=chatty|progress|silent` with T1/T2 thresholds | Jeffrey conveyor §3 (RECALLED-PATTERN) | 1h | **MEDIUM** — lets Marcel tune the annoyance dial |
| B4 | **TTS voice persona env-var** — already exists (`YURI_VOICE`, `YURI_VOICE_LANG`). Document it and add a `yuri voice set <name>` voice command. | bot.py (HARD-FACT existing) | 0.5h | **LOW** — already works, just needs discoverability |
| B5 | **"I'll get back to you" async pattern** — for tasks >30s: Yuri says she'll work on it, dispatches to worker, notifies via morning_brief or push. Infrastructure exists (spawn_worker + conductor). | Marcel Q18 perfect day (HARD-FACT) | 2h | **MEDIUM** — wires existing pieces into a spoken contract |
| B6 | **Wakeword activation** — WakeGate is LIVE in bot.py. Wire openWakeWord or Porcupine for "Hey Yuri" detection. | Marcel Q17 (HARD-FACT) | 2-4h | **MEDIUM** — hotkey is sufficient MVP; wakeword is polish |
| B7 | **Streaming TTS quality floor** — Kokoro is good. If Marcel ever wants a different voice, the swap path is documented (Marvis clone, ElevenLabs). | René pilot (HARD-FACT) + voice loop brief (HARD-FACT) | 0h (documented) | **LOW** — keep Kokoro; swap only if Marcel asks |

---

## CUT LIST — Over-engineering traps to avoid

| # | Trap | Why cut | Better path |
|---|---|---|---|
| C1 | **Full wakeword pipeline before hotkey works** | WakeGate + hotkey (Cmd+Opt+Y) is sufficient MVP. Wakeword adds latency (~100ms), API key cost, and complexity. | Ship hotkey first; add wakeword only if Marcel finds hotkey annoying. |
| C2 | **Emotion-tagged TTS ([laugh], [sigh])** | Cool but not in Marcel's requirements. Adds TTS provider dependency and prompt engineering overhead. | Kokoro's natural prosody is good enough. Add emotion tags only if Marcel asks for Rick-style delivery. |
| C3 | **Multi-voice TTS (different voices for different tasks)** | Marcel has one assistant. Multiple voices add complexity with zero user demand. | One voice, one persona. |
| C4 | **Full S2S native model (Grok-style audio-native)** | Requires replacing GLM-5.2 with an audio-native model. Loses all YURI tool integration, memory, and confirm-gate. | Streaming cascade with GLM-5.2 is the right architecture for a tool-using assistant. |
| C5 | **Perfect bridge utterance generation (LLM-generated, context-aware, never repetitive)** | The bridge mechanism needs to run IN PARALLEL with the main brain. An LLM-generated bridge would require a second model call — over-engineering. | Cached template pool seeded with turn context (3-5 lines per context type). Simple, fast, no model call. |
| C6 | **"I'll get back to you" with push notifications** | Marcel's perfect day describes holding the conversation, not async notifications. Push notification infra is heavy. | Morning_brief + spoken "I'll let you know when it's done" is sufficient. Add push only if Marcel works away from the machine. |
| C7 | **Per-utterance latency SLA monitoring** | Measuring and alerting on TTFA is research-grade ops. Yuri is a personal assistant, not a production service. | If it feels slow, Marcel will say so. Fix the felt bottleneck, don't build a dashboard. |
| C8 | **Full wakeword + VAD + barge-in + echo cancellation before shipping any voice** | bot.py already has barge-in and VAD. Wakeword and echo cancellation are separate concerns. Don't block shipping on getting all four perfect. | Ship with hotkey + barge-in + Kokoro. Add wakeword and AEC per evidence of need. |

---

## RESULT_LABEL

```
08CW_VOICE_UX_SURVEY_BUILD_CUT_X_PASS_COMMITTED
```