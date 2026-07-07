# Push-to-Talk + Barge-in UX Patterns — Research Lane 14

**Author:** R4-BargeInUX lane  ·  **Date:** 2026-07-07  ·  **Scope:** Commercial barge-in UX (Alexa/Siri/Google), push-to-talk vs always-on tradeoffs, macOS hotkey binding for Right Command → interrupt signal, turn-taking / end-of-turn detection research, half-duplex vs full-duplex + echo cancellation. All filtered through Marcel's specific setup (HyperX SoloCast USB mic → Sony XM5 Bluetooth headphones, M2 Pro 16GB, Whisper-large-v3-turbo MLX STT, Silero VAD, half-duplex today).

**Hardware baseline:** M2 Pro 16GB · HyperX SoloCast USB (input) · Sony WH-1000XM5 over Bluetooth (output, sealed/closed-back) · Whisper-large-v3-turbo MLX STT · Silero VAD (`stop_secs=2.5` today).

---

## TL;DR — the five load-bearing conclusions

1. **Marcel is conflating two orthogonal problems, and that conflation is steering the fix.** *Barge-in* = interrupt Yuri while Yuri is **talking** (TTS playing, mic is off). *End-of-turn detection* = decide when Marcel is **done talking vs pausing** while Yuri listens (mic is on). **Right Command key solves barge-in perfectly and does nothing for end-of-turn.** The pause-cutoff pain (VAD cutting him mid-thought) is an end-of-turn problem, not a barge-in problem. Build both — don't expect one key to fix both.

2. **Half-duplex is *why* Marcel needs the key at all.** His current loop mutes the mic during TTS, so voice barge-in is **physically impossible** — the key is the only interrupt channel. This is the actual reason a hardware barge-in is mandatory in his current architecture, not a preference.

3. **His headphones let him skip the hard part of full-duplex.** The Sony XM5s are sealed/closed-back → the HyperX mic **cannot acoustically hear the TTS output** → there is **no echo path to cancel**. Full-duplex (mic always-on, even during TTS) is **feasible for Marcel without software AEC**. This unlocks his stated need: "continuous listening while processing." Caveat below — macOS native AEC *breaks* on his exact device combo, so he must use raw capture, not voice-processing mode.

4. **Right Command → interrupt signal: `skhd` is the simplest, one line, external to the voice loop.** `rcmd : curl -s localhost:PORT/interrupt >/dev/null` in `~/.skhdrc`. skhd natively distinguishes left/right modifiers (`rcmd` vs `lcmd`), runs as a launchd daemon (survives loop restarts), and keeps the binding logic out of Python. **Bonus: skhd's tap-vs-hold lets one key serve two modes** — bare tap = barge-in, hold = "I'm speaking, don't cut me off" (PTT that defeats the pause-cutoff). `pynput` is the fallback if he wants it in-process with zero external deps.

5. **For his slow/paused speech, PTT (hold-to-talk) is the accessibility win, not a regression.** Counterintuitive: always-on + VAD is *worse* for disfluent/slow speakers because the system must *guess* when they're done — and it guesses wrong on every cognitive pause. Hold-to-talk makes "release = done" **unambiguous**, so the VAD never has to guess. The industry is quietly moving back toward explicit PTT (Claude Voice Mode, Gemini long-press continuous-listen) precisely because always-on VAD keeps cutting people off. Marcel should have **PTT as an available mode**, not a replacement for always-on.

> **Cross-lane handoff:** VAD tuning and streaming-STT specifics live with R1-VAD and R2-StreamingSTT. This lane owns the **interaction contract** (how the user signals intent: key, voice, or both) and the **turn-state machine** that ties barge-in, PTT, and EoT together.

---

## 1. Commercial barge-in — how Alexa / Siri / Google actually do it

### 1a. The universal pattern: multiple parallel interrupt channels, user's choice

Every mature assistant offers **both** voice and physical interrupt channels simultaneously. None force a single modality. The user picks whichever is least-friction in context.

| Assistant | Voice barge-in (while speaking) | Physical barge-in | Notes |
|---|---|---|---|
| **Alexa** | Wake word, **or** just start speaking | **PTT** (hold mic) and **TTT** (tap mic) | The gold standard. Amazon's own auto spec: *"Customers must be able to interrupt Alexa with all available invocation methods."* |
| **Siri** | Default: any speech interrupts. Optional: wake-word-only via *Settings → Accessibility → Siri → Require Siri for interruptions* | Tap the Siri orb / side button | The accessibility setting exists *because* default voice-barge-in over-triggers (background speech, TV). |
| **Google Assistant / Gemini** | "Stop" works **without** "Hey Google" while Assistant speaks (the famous quiet-stop). Gemini added **long-press mic = continuous-listen** (won't cut you off until you tap stop). | Tap, long-press mic | Gemini's long-press-continuous-listen is the closest commercial analog to what Marcel wants: explicit hold = "I'm not done, keep listening." |

### 1b. The Alexa auto spec — the cleanest statement of the contract

Amazon's Alexa Automotive documentation is the most explicit articulation of barge-in as a product requirement (because cars make it life-safety-relevant):

> *"Customers must be able to interrupt Alexa with all available invocation methods. When interrupted, Alexa will stop speaking and start listening. For example, when Alexa is speaking about the weather, the customer can barge-in with wake word, PTT or TTT and say 'will it rain tomorrow?'"*

Three invocation channels, all valid during TTS, all transition the system to the same listening state. The **mechanism** (how the interrupt is detected) differs per channel; the **effect** (stop TTS → start listening) is identical.

### 1c. What this means for Marcel

- **Marcel should not have to say a wake word to interrupt.** He's at a desk with a keyboard; a single keypress is strictly lower-friction than "Hey Yuri." Alexa, Siri, and Google all agree a physical channel is mandatory.
- **The interrupt effect must be identical regardless of trigger.** Whether Right Command or "stop," the result is: TTS stops, partial context preserved, mic starts listening. Don't build two interrupt code paths — build one `interrupt()` with multiple triggers.
- **Alexa's PTT-vs-TTT distinction matters here.** PTT = hold (release = done). TTT = tap (start listening, VAD decides done). Marcel's Right Command should support **both**, distinguished by tap-duration (see §3e).

### 1d. The failure modes production systems fight (Marcel will hit these)

The dominant production barge-in complaint is **false barge-in** — the agent cuts *itself* off when the user wasn't interrupting. Three causes, ranked by relevance to Marcel:

1. **Background noise triggers VAD** (coffee shop, open office, household). *Fix:* tune energy threshold per environment, or a small noise-classifier. Marcel's HyperX cardioid mic helps a lot here (rejects off-axis).
2. **Side conversations** (talking to someone else). *Fix:* speaker-diarization, or accept some false-barge-in as a deliberate tradeoff. For a single-user desktop assistant this is rarely hit.
3. **Codec artifacts** (compressed telephony codecs look like speech). *Fix:* higher-bitrate codec. Marcel isn't on telephony codecs, so this is irrelevant — **but the Bluetooth XM5 codec is adjacent**: see §5 on Bluetooth.

Production target: **combined false-barge-in rate <2%.** Voice barge-in alone rarely hits this; a deliberate **key interrupt** has a ~0% false-positive rate, which is its single biggest UX advantage over voice barge-in.

**Latency budget for barge-in to feel human:** if interrupt→silence takes **>500ms**, the user perceives the agent as "slow to shut up" and both parties end up speaking (double-talk). Doing it in **<200ms** is what makes the agent feel like a person. **A keypress-to-silence path can trivially hit <50ms** (it's a local signal, no VAD inference); voice barge-in needs VAD inference + AEC on a buffered window and fights to stay under 200ms. This is the second reason a key is better for Marcel than voice barge-in.

Sources: [Amazon Alexa Auto: Invoking Alexa](https://developer.amazon.com/en-US/docs/alexa/alexa-auto/invoking-alexa.html) · [Double Tap: Siri interruption setting](https://doubletaponair.com/michael-babcocks-top-tip-stop-siri-interrupting-itself/) · [ScreenRant: Google "stop" without wake word](https://screenrant.com/how-to-stop-google-assistant/) · [technology.org: Gemini long-press continuous-listen](https://www.technology.org/2025/10/23/googles-gemini-gets-smarter-about-when-youre-actually-done-talking/) · [orga-ai barge-in guide](https://orga-ai.com/blog/blog-barge-in-voice-agents-guide) · [futureagi 2026 barge-in implementation](https://futureagi.com/blog/voice-ai-barge-in-turn-taking-2026/) · [sparkco barge-in detection](https://sparkco.ai/blog/master-voice-agent-barge-in-detection-handling)

---

## 2. Push-to-talk vs always-on — and which one actually helps Marcel

### 2a. The honest pros/cons table

| Dimension | Push-to-talk (hold-to-talk) | Always-on (wake-word or VAD-triggered) |
|---|---|---|
| **Turn detection** | **Unambiguous** — release = done. VAD never guesses. | **Hard** — must infer pause vs done from silence + semantics. The source of all over/under-interruption. |
| **STT quality** | Clean audio (no trail-on, no captured side-conversations). Higher transcription accuracy. | Fragments, trailing fillers, throat-clears captured. STT gets garbage at the edges. |
| **Friction** | High — must remember to engage before each utterance. Breaks flow. | Low — speak naturally. |
| **Hands-free** | No — requires a free hand/finger. | Yes — critical for driving/cooking/hands-full. |
| **Privacy** | Explicit — mic active only when user intends. Trivially auditable. | Always-capturing; privacy-by-policy, not privacy-by-physics. |
| **Battery/compute** | Minimal — mic off when idle. | Continuous VAD/wake-word processing. (Less relevant on a plugged-in Mac.) |
| **Accessibility for slow/disfluent speech** | **Wins** — pauses don't matter, the key holds the turn open. | **Loses** — every cognitive pause risks a false end-of-turn. |

### 2b. The counterintuitive finding: PTT is the accessibility win for Marcel

The conventional wisdom is "always-on is more natural, PTT is for walkie-talkies." **For slow/paused/disfluent speakers this is backwards.** Always-on + VAD forces the system to *guess* end-of-turn on every silence — and Marcel's 1–3s cognitive pauses are indistinguishable from a finished utterance to a silence-timer. PTT removes the guessing entirely: **release is the turn-end signal, and it is never wrong.**

This is why the industry is quietly re-adding explicit PTT on top of always-on:
- **Claude Voice Mode** (2026) added push-to-talk *"a more direct control that reduces the accidental interruptions typical of always-on listening."*
- **Gemini** added **long-press mic = continuous-listen** (won't cut you off until you manually stop) — a direct response to the cut-off bug.
- **Claude Code dictation** (`/voice`) supports both *hold mode* (PTT) and *tap-to-toggle*, explicitly because hold mode gives cleaner audio.

The Ryan Shrott argument (Feb 2026) crystallizes it: *"always-on dictation promises frictionless capture, but the friction just moves. You end up doing little micro-tasks all day: pausing to avoid capturing side conversations, repeating yourself because the model grabbed your throat-clear instead of your sentence."* For knowledge work, *"the best dictation experiences feel closer to a walkie-talkie than a smart speaker. You press, you speak, you release."*

### 2c. How systems switch between modes

Mode selection is **contextual**, not a global toggle:
- **Wake word** → hands-free contexts (cooking, driving, across the room).
- **Tap-to-talk (TTT)** → noisy environments where wake-word false-fires, or when you want to be deliberate.
- **Hold-to-talk (PTT)** → desk work, dictation, accessibility cases, anywhere VAD over-triggers.
- **Keyboard hotkey** → Marcel's context. At a desk with a keyboard, the key is strictly lower-friction than any of the above.

The mature design is **PTT as an available mode layered on always-on**, not a replacement. Marcel gets always-on with VAD patience for his pauses (the R1-VAD / R2-StreamingSTT lanes), **plus** an optional hold-to-talk that he reaches for when he's about to do a long, pause-heavy thought and wants a guaranteed-open turn.

Sources: [Voice AI & Voice Agents primer](https://voiceaiandvoiceagents.com/) · [Claude Voice Mode PTT](https://pasqualepillitteri.it/en/news/5170/claude-voice-mode-18-languages-push-to-talk) · [Ryan Shrott: hold-to-talk is the missing feature](https://medium.com/@ryanshrott/hold-to-talk-is-the-missing-feature-in-modern-dictation-and-why-always-on-fails-b49ed70d5802) · [Leor Grebler: tap vs push-to-talk](https://medium.com/@grebler/tap-and-talk-vs-push-to-talk-3ce14919372b) · [Claude Code voice dictation](https://code.claude.com/docs/en/voice-dictation) · [VUI design guide 2026](https://fuselabcreative.com/voice-user-interface-design-guide-2026/)

---

## 3. Key binding for barge-in — macOS approaches, ranked for Marcel

Marcel wants **Right Command → interrupt signal**. Four tools can do it. Ranked by simplicity for this exact use case.

### 3a. `skhd` — **RECOMMENDED.** One line, external, native left/right-modifier distinction.

`skhd` (koekeishiya) is a minimal hotkey daemon: hotkeys defined in a text DSL in `~/.skhdrc`, each binding an arbitrary shell command. It natively distinguishes **left and right** modifiers (`lcmd`/`rcmd`/`lalt`/`ralt`), which is the entire reason it wins here — Right Command is a first-class key, not a remapped hack.

**The binding (literal one-liner):**
```bash
# ~/.skhdrc
# Bare tap of Right Command → fire interrupt at the voice loop
rcmd : curl -s -X POST localhost:8765/interrupt >/dev/null 2>&1
```

That's the entire configuration. The voice loop exposes a tiny local endpoint (`/interrupt` on `127.0.0.1`) — or a Unix socket, named pipe, or `osascript` call — and `skhd` bridges keypress → signal. **The binding survives voice-loop restarts** (it's a separate launchd daemon) and stays out of Python entirely.

**Why skhd beats the others for this job:**
- **Native `rcmd`.** No remapping, no Karabiner layer, no virtual function key.
- **Zero Python.** No daemon in the voice process, no IPC object-lifecycle bugs, no thread-safety hazards in the audio loop.
- **Survives crashes.** If the voice loop segfaults, skhd still fires; you just get a refused connection. The key never disappears.
- **`.taphold` support** (and the `skhd.zig` fork adds explicit tap-vs-hold) → **one key, two modes** (see §3e).

**Cost:** install (`brew install koekeishiya/formulae/skhd`), grant Accessibility permission once, write the one line. ~5 minutes.

### 3b. Hammerspoon — more powerful, overkill for pure interrupt

Hammerspoon runs Lua scripts against macOS APIs (system events, windows, audio, clipboard). It can do everything skhd does plus complex automation (tap-vs-hold timing logic, conditional bindings, app-context awareness).

**Right Command as a momentary interrupt via Hammerspoon (the common pattern):**
```lua
-- ~/.hammerspoon/init.lua
-- The community usually remaps Right Command -> a virtual F19 via Karabiner
-- first, then binds F19 here. Direct Right Command capture is possible but
-- flag-bit math varies by macOS version.
hs.hotkey.bind({}, 'f19', function()
  hs.http.doRequest("http://127.0.0.1:8765/interrupt", "POST")
end)
```

**When Hammerspoon wins:** if Marcel later wants *contextual* bindings (Right Command does different things in different apps, or fires only when Yuri is actively speaking — needs Hammerspoon's app-state access). **For pure barge-in it's heavier than skhd with no upside.**

### 3c. Karabiner-Elements — the remapping layer, usually unnecessary here

Karabiner-Elements is a kernel-level keyboard customizer. Its strength is **remapping one physical key to another** (e.g., Caps Lock → Esc, or Right Command → F19). The standard "hyper key" recipe is: *Karabiner remaps Right Option → F19, then Hammerspoon/skhd binds F19.*

**Why it's unnecessary for Marcel's case:** skhd already grabs `rcmd` directly — there's nothing to remap. Karabiner becomes necessary only if:
- skhd can't reliably capture Right Command on his keyboard layout (rare; it works on Apple keyboards), **or**
- he wants Right Command to act as a *modifier* for a chord (Right Command + H/J/K/L = window management) *and* a standalone interrupt — that requires remapping to a function key so it can serve both roles.

**Verdict:** skip Karabiner unless skhd proves flaky on his hardware. Add it later if he wants the dual-role modifier pattern.

### 3d. `pynput` — in-process Python listener, the fallback if he wants zero external deps

`pynput` is a Python library that monitors keyboard/mouse events. It runs **inside the voice loop process** as a daemon thread — no separate daemon, no HTTP/socket, the callback can call `interrupt()` directly.

```python
from pynput import keyboard
import threading

class BargeInListener(threading.Thread):
    def __init__(self, voice_loop):
        super().__init__(daemon=True)
        self.voice_loop = voice_loop

    def run(self):
        def on_press(key):
            if key == keyboard.Key.cmd_r:           # Right Command
                self.voice_loop.interrupt()          # direct call, no IPC
        with keyboard.Listener(on_press=on_press) as l:
            l.join()

# Right Command -> pynput Key.cmd_r
```

**Pros:** zero external deps, no IPC serialization, the interrupt call is a direct Python method invocation (lowest possible latency, no socket round-trip). The listener thread is `daemon=True` so it dies cleanly with the process.

**Cons vs skhd:**
- **macOS Accessibility permission required** (System Settings → Privacy & Security → Accessibility). Same as skhd, but pynput is *more* fragile across macOS updates (SIP changes have broken pynput's event-tap repeatedly; skhd's CGEventTap is more battle-hardened).
- **Dies with the voice loop.** If the Python process crashes, the key stops working until restart. skhd survives.
- **Must not block in the callback** — pynput invokes callbacks on an OS thread; long/blocking work freezes input globally. The callback must dispatch to a queue and return immediately. Easy to get wrong.
- `<cmd_r>` bare-press (without a chord) is sometimes filtered by macOS as a bare modifier; pynput's reliability on *bare* Right Command is lower than skhd's.

**Verdict:** use pynput only if Marcel refuses to install a separate daemon. Otherwise skhd's separation of concerns is cleaner and more robust.

### 3e. The killer feature: one key, two modes (tap = barge-in, hold = PTT)

The single most valuable UX insight in this lane: **Right Command can serve both barge-in AND pause-immune listening**, distinguished by tap-duration:

| Action | Semantics | Effect |
|---|---|---|
| **Bare tap** (press-release <250ms) | **Barge-in** | If Yuri is talking → stop TTS, start listening. If already listening → no-op (or: extend the silence timer). |
| **Hold** (press-release >250ms) | **Push-to-talk** | Open a guaranteed turn: mic stays on, VAD end-of-turn is **suspended** until release. Release = hard turn-end. |

The hold mode is the **accessibility escape hatch** for Marcel's pause-heavy thoughts: when he knows he's about to think out loud with long gaps, he holds Right Command and the VAD can't cut him no matter how long he pauses. Release commits the turn.

**skhd supports this** via tap-vs-hold syntax (and `skhd.zig` makes it explicit with `.taphold`). **Hammerspoon** supports it via eventtap timing. **pynput** can implement it with a timer in the callback. This dual semantics is the answer to *"I want barge-in AND I want pause tolerance"* — it's the same key, two intents, disambiguated by how Marcel presses it.

### 3f. Recommendation

**`skhd` with the dual tap/hold config**, voice loop exposing a local `/interrupt` (tap) and `/ptt_start`+`/ptt_end` (hold) endpoint. Karabiner only if skhd can't grab his Right Command. pynput as the in-process fallback. Concrete wiring in §6.

Sources: [skhd (koekeishiya)](https://github.com/koekeishiya/skhd) · [skhd intro (Daniel Corin)](https://www.danielcorin.com/til/skhd/intro/) · [skhd.zig fork — explicit tap/hold](https://github.com/jackielii/skhd.zig) · [Hammerspoon hyper key (kalis.me)](https://kalis.me/setup-hyper-key-hammerspoon-macos/) · [Hammerspoon hyper key (evantravers)](https://evantravers.com/articles/2020/06/08/hammerspoon-a-better-better-hyper-key/) · [Karabiner-Elements](https://karabiner-elements.pqrs.org/) · [Karabiner simple modifications](https://karabiner-elements.pqrs.org/docs/manual/configuration/configure-simple-modifications/) · [pynput keyboard docs](https://pynput.readthedocs.io/en/latest/keyboard.html) · [pynput PyPI](https://pypi.org/project/pynput/)

---

## 4. Turn-taking models — when is the user DONE vs PAUSING?

This is the half of Marcel's problem the key does **not** solve. When Yuri is *listening* and Marcel pauses to think, the system must decide: pause (keep listening) or gap (turn over, respond now). VAD-only gets this wrong on every cognitive pause.

### 4a. The canonical three-state framework

The academic consensus (arXiv 2503.23439, "Speculative End-Turn Detector") formalizes the speaker's state at any time $t$ into exactly three classes:

1. **Speaking Unit (SU)** — the speaker is actively producing speech.
2. **Pause** — silence, but the speaker *intends to continue* (mid-utterance gap, thinking, breathing).
3. **Gap** — silence, and the speaker *has finished* the turn (end-of-turn).

The decision the system must make on every silence is **Pause vs Gap**. SU is trivial (VAD handles it). **Pause-vs-Gap is the entire hard problem.** A pure VAD collapses Pause and Gap into one ("silence > N seconds = done") — which is exactly why it cuts Marcel off.

### 4b. VAD-only endpointing and why it fails Marcel

VAD-only turn detection: once a configurable silence duration elapses, assume the speaker finished and hand over the turn. *Efficient, but blind to conversational context and intent.* It cannot interpret:
- **Hesitation pauses** ("I think we should, um, maybe —" → VAD fires, agent jumps in).
- **Incomplete clauses** ("Hello I have a question about" → VAD fires mid-sentence).
- **Filler-thought hybrids** ("...you know..." used as a turn-holder, not a turn-yield).

Marcel's speech is dense in all three. Raising `stop_secs` from 2.5 to 4–5s trades false-end-of-turn for *stilted* conversation (the agent feels slow to respond). Neither end of the dial is right. **You cannot tune a silence timer out of this problem.** You need a classifier.

### 4c. Semantic / model-based endpointing — the actual fix

A model-based turn detector reads the **partial transcript in real time** and predicts end-of-turn from **semantic completeness**, not just silence:

- *"I went to the store..."* → incomplete (trailing conjunction/ellipsis) → **wait**.
- *"I went to the store and bought some milk."* → complete clause → **respond**.

This can fire **before** the trailing silence even begins, because the model sees the grammar closing. Research benchmark: a transformer-based EoT model **reduces unintentional interruptions by ~85%** vs simple VAD. Semantic analysis adds only **~20ms latency** — imperceptible, dramatically more natural.

### 4d. The two-tier architecture (the pattern that fits Marcel's M2 Pro)

The cost-effective production pattern splits the work across two tiers (arXiv 2503.23439):

```
 ┌── TIER 1: on-device, cheap, always-on ──────────────────────────┐
 │  Lightweight model (Silero VAD class) does BINARY classification:│
 │  is the user in a Speaking Unit (SU) or not?                     │
 │  → cheap, <1ms, high accuracy, runs every frame.                 │
 └──────────────────────────┬───────────────────────────────────────┘
                            │ (fires only when silence begins)
                            ▼
 ┌── TIER 2: triggered, slightly heavier, the real decision ───────┐
 │  Transformer (Wav2Vec 2.0 class OR small LLM on partial text)    │
 │  classifies the silence as PAUSE vs GAP.                         │
 │  → runs once per silence, latency ~tens of ms.                   │
 └──────────────────────────────────────────────────────────────────┘
```

Tier 1 is the gate; Tier 2 only spins up when Tier 1 says "silence started." This is cheap because the expensive classifier runs only at candidate turn-ends, not continuously. **Marcel already has Tier 1 (Silero VAD). What he's missing is Tier 2** — a pause-vs-gap classifier on the partial transcript.

### 4e. Production-ready options for Tier 2

| Option | What it is | Fit for Marcel |
|---|---|---|
| **LiveKit Turn Detector v1-mini** | Open-weights, fuses **acoustic + semantic** (listens to audio directly, not just transcript), **<500 MB RAM, runs on CPU**, 14 languages. The drop-in option. | **Best fit.** Runs local on M2 Pro, <500MB is trivial against his RAM budget, open weights = no API. The full v1 is free on LiveKit Cloud; v1-mini is the self-hostable one. |
| **TEN_Turn_Detection** (HuggingFace) | Open-weights 3-state classifier (speaking / pause / unfinished), designed for the TEN framework's interruption handling. | Good reference model; 3-state output maps directly to SU/Pause/Gap. |
| **Krisp turn-taking** | Audio-only, **6M weights** — tiny. No transcript needed. | Lightest possible Tier 2; trades semantic understanding for size/speed. |
| **Roll-your-own on the partial transcript** | Feed the streaming Whisper partial to a tiny LLM (Qwen3-4B, already in his hybrid plan per Lane 10) with a prompt: *"Is this utterance complete? yes/no."* | Cheapest if he's already running a local LLM router. ~20–50ms per check. |

**For Marcel specifically:** the Whisper partial transcript is already streaming (R2-StreamingSTT lane). Adding a tiny completeness check on it — either LiveKit v1-mini or a prompt to his existing local router — costs near-zero incremental infra. This is the single highest-leverage end-of-turn improvement for his pause-heavy speech.

### 4f. Marcel-specific tuning for the slow-speaker case

- **Asymmetric patience:** the silence threshold before Tier 2 fires should be *short* (300–500ms) so the semantic check runs early and can **veto** a premature gap-call. The *effective* patience becomes "silence + semantic-complete" — long pauses only end the turn if the *content* is also complete.
- **"Hold the floor" markers:** if the partial transcript ends with a known floor-holding token (`um`, `uh`, `like`, `you know`, `and`, `or`, `because`, `so`, `...`), **hard-veto** the end-of-turn regardless of silence length. This single rule catches most of Marcel's mid-thought pauses.
- **Restart detection:** Marcel sometimes restarts/rephrases. If the new speech begins within 1s of a "gap" and overlaps semantically with the prior partial, treat it as a continuation, not a new turn (avoids two fragmented transcriptions).

Sources: [arXiv 2503.23439 Speculative End-Turn Detector](https://arxiv.org/pdf/2503.23439) · [LiveKit: transformer for EoT](https://blog.livekit.io/using-a-transformer-to-improve-end-of-turn-detection) · [LiveKit Turn Detector v1.0](https://livekit.com/blog/solving-end-of-turn-detection) · [LiveKit turn detector docs](https://docs.livekit.io/agents/build/turns/turn-detector/) · [Retell: VAD vs turn-taking endpoints](https://www.retellai.com/blog/vad-vs-turn-taking-end-point-in-conversational-ai) · [AssemblyAI: intelligent endpointing](https://www.assemblyai.com/blog/turn-detection-endpointing-voice-agent) · [Krisp turn-taking (6M weights)](https://krisp.ai/blog/turn-taking-for-voice-ai/) · [TEN_Turn_Detection (HF)](https://huggingface.co/TEN-framework/TEN_Turn_Detection) · [GrowwStacks: semantic turn detection](https://growwstacks.com/blog/fix-ai-voice-interruptions-with-semantic-turn-detection)

---

## 5. Half-duplex vs full-duplex — and why Marcel can have full-duplex for free

### 5a. Definitions and the current state

- **Half-duplex** = only one direction at a time. The mic is **muted during TTS playback**. This is Marcel's current architecture.
- **Full-duplex** = both directions simultaneously. The mic stays **on during TTS playback**. Required for natural voice barge-in (the system must *hear* the user interrupting while it speaks).

**Why Marcel is half-duplex today:** the conventional reason for half-duplex is to prevent echo (the mic picking up the TTS output and feeding it back). Mute-the-mic is the trivial echo solution. **It's also why his barge-in must be a key** — in half-duplex, voice barge-in is *physically impossible* because the mic is off. The key is the only interrupt channel that exists.

### 5b. The headline finding: Marcel's headphones break the echo path → full-duplex is free

Acoustic echo requires an **echo path**: sound from the speaker traveling through air back into the mic. The standard fix is software AEC (acoustic echo cancellation): model the echo path, subtract the known output signal from the mic input.

**Marcel's Sony XM5s are sealed, closed-back headphones worn on-ear.** The TTS audio is contained in the earcups; **the HyperX desktop mic cannot acoustically hear it.** The echo path is physically broken. Therefore:

> **There is no echo to cancel. Full-duplex (mic always-on, even during TTS) is feasible for Marcel without any software AEC.**

This is the single most enabling finding in this lane. It means his stated need — *"continuous listening while processing, don't stop the mic"* — is achievable with the hardware he already owns, by simply **not muting the mic during TTS**. The "echo problem" that forces most assistants into half-duplex does not exist in his physical setup.

This matches the documented guidance: *"wearing headphones is one of the fastest and easiest ways to eliminate echo, since there is no sound coming out of the speakers, so the microphone will not pick it up."* And: *"closed-back headphones isolate mic/speaker paths — echo can't survive in a properly synchronized system."*

### 5c. The catch: macOS native AEC *breaks* on his exact device combo — so don't use it

There's a trap here. macOS exposes a hardware-accelerated AEC path: **AVAudioEngine voice-processing mode** (or the lower-level `AUVoiceProcessingIO` / `kAudioUnitSubType_VoiceProcessingIO`), available since macOS 14 (WWDC23, "What's new in voice processing"). It provides *"best-in-class audio signal processing, including echo cancellation, noise suppression, automatic gain control."*

**But it has a documented hard constraint:** *"Voice processing requires both input and output nodes to be in voice processing mode,"* and in practice it **only works with paired input/output devices** — e.g., MacBook Pro internal mic → MacBook Pro internal speakers. With **mismatched devices it fails with channel-count mismatch errors.** Reported failure case, verbatim from Apple Developer Forums: *"Works: Paired devices (MacBook Pro mic → MacBook Pro speakers). Fails: Mismatched devices (AirPods mic → MacBook Pro speakers)."*

**Marcel's setup is exactly the failing combo:** HyperX SoloCast USB (input) + Sony XM5 Bluetooth (output). **Enabling macOS voice-processing mode will error out or produce broken audio.** The fix is counterintuitive but correct: **do NOT enable voice-processing mode; use raw `AVAudioEngine` capture (or `kAudioUnitSubType_HALOutput`) on both nodes.** Since his headphones eliminate the echo path anyway, he doesn't need the AEC that voice-processing mode provides. Raw capture = full-duplex + no echo + no broken-API risk.

(Note for completeness: if he ever switches to **internal MacBook speakers + internal mic**, that paired combo *would* need AEC — and voice-processing mode would then work correctly. The rule is: voice-processing mode for paired internal devices; raw capture for headphones.)

### 5d. Bluetooth latency — the remaining caveat, and it's minor

The XM5s over Bluetooth add **codec latency (~150–250ms)** to the TTS output path. This does **not** cause echo (headphones still isolate), but it has two minor effects:

1. **TTS-to-ears latency** rises by ~150–250ms. For a voice loop already targeting <800ms total, this eats into the budget but isn't fatal.
2. **Barge-in timing asymmetry:** when Marcel taps Right Command, TTS stops *instantly* (it's a local signal), but the **last ~200ms of already-buffered TTS audio may still play** in his ears (already in the Bluetooth codec pipeline). He may hear a syllable or two of trailing audio after the interrupt fires. This is cosmetic, not functional — the *system* state transitions correctly; only the user's ears lag. Acceptable.

A wired headphone (or wired XM5 via the 3.5mm jack) eliminates both effects. If the Bluetooth latency becomes annoying, the cable is a zero-software-change fix.

### 5e. What full-duplex unlocks (and what it doesn't)

| Capability | Half-duplex (today) | Full-duplex (with headphones) |
|---|---|---|
| **Right Command barge-in** | ✅ (the only channel that works) | ✅ (still works, still instant) |
| **Voice barge-in** ("stop" / just start talking) | ❌ physically impossible (mic off) | ✅ possible (mic on, hears the interrupt) |
| **Continuous listening while Yuri processes** | ❌ mic muted during TTS | ✅ the thing Marcel explicitly asked for |
| **Backchannel interjections** ("ok", "go on") | ❌ can't hear them | ✅ can detect and respond |
| **Echo risk** | none (mic off) | **none** (headphones isolate the path) |
| **AEC compute cost** | n/a | **none** (no echo to cancel) |

**Important nuance:** full-duplex makes voice barge-in *possible*, but for Marcel's slow speech it is **still less reliable than the key** — voice barge-in needs VAD/AEC discipline even with headphones, and his pauses still confuse VAD. **Recommendation: go full-duplex (for continuous listening + the option of voice barge-in), but keep Right Command as the primary, deliberate barge-in.** Best of both: the mic is always listening (so Yuri can catch "stop"), and the key is the guaranteed-fast, zero-false-positive interrupt.

Sources: [WWDC23: What's new in voice processing](https://developer.apple.com/videos/play/wwdc2023/10235/) · [Apple Forums: macOS AEC mismatched devices](https://developer.apple.com/forums/thread/733733) · [Using VoiceProcessingIO on macOS (gist)](https://gist.github.com/d08f98b14328baa5eddbdf98d0ab8b91) · [recall.ai: system audio on macOS](https://recall.ai/blog/how-to-access-to-system-audio) · [Avantree: headphones eliminate echo](https://avantree.com/blogs/knowledge/how-to-fix-echo-problems-in-a-headset-or-headphones) · [Cleer Audio: echo cancellation & headphones](https://cleeraudio.com/how-echo-cancellation-technology-helps-to-reduce-acoustic-echoes-and-provide-better-conversation) · [Switchboard: WebRTC AEC3](https://switchboard.audio/hub/how-webrtc-aec3-works/) · [Spheron: WebRTC LLM streaming](https://www.spheron.network/blog/webrtc-llm-streaming-voice-agent-gpu-cloud/) · [webrtc.ventures: voice AI integration](https://webrtc.ventures/services/voice-ai-integration-comprehensive-resource/) · [getstream: WebRTC bi-directional voice](https://getstream.io/blog/webrtc-ai-voice-video/) · [arXiv: FireRedChat full-duplex pVAD+EoT](https://arxiv.org/pdf/2509.06502)

---

## 6. Concrete recommendations for Marcel's rebuild

Tie the five findings into one interaction contract.

### 6.1 Go full-duplex, raw capture (no macOS voice-processing mode)

- Mic stays **on during TTS**. Use raw `AVAudioEngine` (or `kAudioUnitSubType_HALOutput`) capture on both input and output nodes.
- **Do NOT enable** `setVoiceProcessingEnabled(true)` — it errors on HyperX-USB + XM5-BT mismatched devices, and he doesn't need its AEC because the headphones isolate the path.
- Result: continuous listening (his explicit ask), zero echo, zero AEC compute.

### 6.2 Right Command via `skhd`, dual tap/hold semantics

```bash
# ~/.skhdrc
# Tap Right Command (<250ms) → barge-in: stop TTS, start listening
rcmd : curl -s -X POST localhost:8765/barge_in >/dev/null 2>&1

# Hold Right Command (>250ms) → push-to-talk: open guaranteed turn
# (skhd.zig syntax; vanilla skhd uses .taphold)
rcmd :: curl -s -X POST localhost:8765/ptt_start >/dev/null 2>&1
# release is detected by skhd and fires /ptt_end
```
Voice loop exposes `/barge_in`, `/ptt_start`, `/ptt_end` on `127.0.0.1:8765`. All three call the same internal `interrupt()` / turn-state-machine; only the post-interrupt listening *mode* differs (VAD-managed vs hold-locked).

### 6.3 Add Tier-2 end-of-turn detection on the streaming Whisper partial

- Keep **Silero VAD as Tier 1** (binary SU/non-SU, already running).
- Add **Tier 2** on the streaming partial transcript: **LiveKit Turn Detector v1-mini** (open weights, <500MB, CPU, fuses acoustic+semantic) OR a completeness prompt to his existing local Qwen3-4B router (Lane 10).
- **Hard floor-holding veto:** if the partial ends with `um|uh|like|you know|and|or|because|so|…` → never end the turn on silence alone.
- **Short Tier-1 silence gate (300–500ms)** so Tier 2 runs early and can veto premature gaps. Effective patience = silence ∧ semantic-complete.

### 6.4 Keep Right Command as primary barge-in even in full-duplex

- Full-duplex makes voice barge-in *possible*; it does not make it *better* for Marcel.
- Right Command: <50ms latency, ~0% false-positive, works mid-TTS without any VAD inference.
- Voice barge-in ("stop", talking over Yuri): keep as a **secondary** channel for hands-off moments. Gate it through the same Tier-2 classifier so it doesn't false-fire on background speech.

### 6.5 Single interrupt() function, multiple triggers

Per the Alexa model (§1b): one `interrupt()` effect, many triggers. Do not fork two code paths.
```
triggers:  Right Command tap  |  "stop"/wake-word  |  programmatic
                 │
                 ▼
            interrupt()  →  stop TTS stream
                          →  cancel in-flight LLM/TTS frames
                          →  preserve partial context (do NOT wipe transcript)
                          →  transition to listening state
                          →  (if PTT hold) lock turn until key release
```

### 6.6 Pipecat-specific wiring (Marcel's current framework)

Pipecat already has the frame primitives this needs:
- **`StartInterruptionFrame`** — pushed to interrupt the pipeline, *"e.g., when a user starts speaking to cancel any in-progress bot output."*
- **`UserStoppedSpeakingFrame`** — emitted when the user turn ends; usually coincides with bot turn start.
- **`PipelineParams(allow_interruptions=True)`** — enables barge-in.
- **`_handle_user_interruption`** in `pipecat.transports.base_input` — the override point for custom interrupt logic.
- **System frames bypass queues** (immediate processing); **data frames are cancelled by interruptions.**

Right Command → POST `/barge_in` → the endpoint pushes a `StartInterruptionFrame` into the pipeline. This is the documented, supported path. The known-open issues (#2460, #456, #2791) are mostly about interruption-not-firing over specific transports (FastAPI websockets, websocket-server) and context-not-updating on interrupt — relevant if Marcel's transport is websocket-based; if his loop is local/in-process, these don't apply.

Sources: [Pipecat frames API](https://reference-server.pipecat.ai/en/stable/api/pipecat.frames.frames.html) · [Pipecat pipeline & frame processing](https://docs.pipecat.ai/guides/learn/pipeline) · [Pipecat user turn strategies](https://docs.pipecat.ai/api-reference/server/utilities/turn-management/user-turn-strategies) · [Pipecat base_interruption_strategy](https://reference-server.pipecat.ai/en/latest/api/pipecat.audio.interruptions.base_interruption_strategy.html) · [Issue #2460: interruption over websocket](https://github.com/pipecat-ai/pipecat/issues/2460) · [Issue #456: interruptions with websocket-server](https://github.com/pipecat-ai/pipecat/issues/456) · [Issue #2791: context not updated on interrupt](https://github.com/pipecat-ai/pipecat/issues/2791)

---

## 7. Open questions / residual risk

- **skhd Right Command reliability on Marcel's exact keyboard.** skhd natively supports `rcmd`, but bare-modifier capture (Right Command with no chord) is occasionally filtered by macOS as a "dead" modifier press. **Smoke-test first** — if skhd drops bare `rcmd`, fall back to Karabiner-remap-Right-Command→F19 then bind F19 in skhd (the standard hyper-key recipe). pynput is the in-process fallback.
- **PTT (hold) vs interrupt (tap) disambiguation latency.** The 250ms tap/hold threshold adds up to 250ms of ambiguity before a tap is recognized as a *barge-in*. For a mid-TTS interrupt this is acceptable (the alternative is letting Yuri finish a long response). If Marcel finds tap-barge-in sluggish, **lower the threshold to 150ms** or expose two keys (tap-only Right Command = barge-in; hold-Right-Option = PTT).
- **LiveKit v1-mini local-fit unverified on M2 Pro.** <500MB RAM and CPU inference are the published specs, but exact M2-Pro latency under Marcel's multitasking load (browser + STT + local router) is unverified. **Benchmark before committing** — if it adds >100ms to the endpointing path, the cheaper option is the partial-transcript completeness prompt to his already-running local Qwen3-4B.
- **Bluetooth XM5 trail-audio after interrupt.** ~150–250ms of buffered TTS may still hit his ears after Right Command fires (cosmetic only; system state is correct). If it bothers him, the wired-XM5 cable is a zero-code fix.
- **Full-duplex + voice barge-in false-positive rate.** Enabling voice barge-in (mic on during TTS) reintroduces the false-barge-in risk from §1d — Marcel's own breaths, keyboard typing, or a side comment could trip VAD while Yuri speaks. **Mitigation:** gate voice barge-in behind the Tier-2 classifier AND require a minimum speech duration (~300ms) before honoring it, so a single noisy frame doesn't interrupt. The key remains the reliable path; voice barge-in is a convenience layer.
- **Context preservation on interrupt.** Pipecat issue #2791 ("Context not updated on user interruptions") is a known bug class. When Right Command interrupts, the **partial transcript must be preserved** (not wiped) so Yuri can respond to the *whole* thought, not the fragment captured before the interrupt. Verify the `StartInterruptionFrame` path keeps context warm — this is the "Interrupt-and-Resume preserves partial context" contract from §1.
- **Right Command conflict with other apps.** Some apps (VMware, remote-desktop, IntelliJ) capture Right Command. skhd's global grab usually wins, but if Marcel hits a conflict, scope the binding to "only when Yuri is the active listener" via a state flag in the voice loop (Hammerspoon can do this contextually; skhd cannot).

---

## Sources (consolidated)

**Commercial barge-in:** [Amazon Alexa Auto: Invoking Alexa](https://developer.amazon.com/en-US/docs/alexa/alexa-auto/invoking-alexa.html) · [Double Tap: Siri interruption setting](https://doubletaponair.com/michael-babcocks-top-tip-stop-siri-interrupting-itself/) · [ScreenRant: Google "stop" without wake word](https://screenrant.com/how-to-stop-google-assistant/) · [technology.org: Gemini long-press continuous-listen](https://www.technology.org/2025/10/23/googles-gemini-gets-smarter-about-when-youre-actually-done-talking/) · [orga-ai barge-in guide](https://orga-ai.com/blog/blog-barge-in-voice-agents-guide) · [futureagi 2026 barge-in implementation](https://futureagi.com/blog/voice-ai-barge-in-turn-taking-2026/) · [sparkco barge-in detection](https://sparkco.ai/blog/master-voice-agent-barge-in-detection-handling) · [AI UX Playground: interrupt-and-resume](https://www.aiuxplayground.com/pattern/interrupt-and-resume/) · [LinkedIn (Iyer): handling interruptions](https://www.linkedin.com/pulse/handling-interruptions-ai-voice-assistants-pause-resume-iyer-tznfe)

**PTT vs always-on:** [Voice AI & Voice Agents primer](https://voiceaiandvoiceagents.com/) · [Claude Voice Mode PTT](https://pasqualepillitteri.it/en/news/5170/claude-voice-mode-18-languages-push-to-talk) · [Ryan Shrott: hold-to-talk is the missing feature](https://medium.com/@ryanshrott/hold-to-talk-is-the-missing-feature-in-modern-dictation-and-why-always-on-fails-b49ed70d5802) · [Leor Grebler: tap vs push-to-talk](https://medium.com/@grebler/tap-and-talk-vs-push-to-talk-3ce14919372b) · [Claude Code voice dictation](https://code.claude.com/docs/en/voice-dictation) · [VUI design guide 2026](https://fuselabcreative.com/voice-user-interface-design-guide-2026/) · [Siberoloji: voice assistant privacy](https://www.siberoloji.com/securing-voice-assistants-privacy-concerns-and-best-practices/)

**macOS hotkey binding:** [skhd (koekeishiya)](https://github.com/koekeishiya/skhd) · [skhd intro (Daniel Corin)](https://www.danielcorin.com/til/skhd/intro/) · [skhd global hotkeys (myByways)](https://mybyways.com/blog/global-hotkeys-for-macos-with-skhd) · [skhd.zig fork](https://github.com/jackielii/skhd.zig) · [Hammerspoon hyper key (kalis.me)](https://kalis.me/setup-hyper-key-hammerspoon-macos/) · [Hammerspoon hyper key (evantravers)](https://evantravers.com/articles/2020/06/08/hammerspoon-a-better-better-hyper-key/) · [Hammerspoon home row (mattorb)](https://mattorb.com/level-up-shortcuts-hammerspoon-home-row/) · [Karabiner-Elements](https://karabiner-elements.pqrs.org/) · [Karabiner simple modifications](https://karabiner-elements.pqrs.org/docs/manual/configuration/configure-simple-modifications/) · [Medium: hyper key with Karabiner+Hammerspoon](https://medium.com/macoclock/solve-shortcut-hell-in-macos-building-a-hyper-key-1cb8838bf521) · [pynput keyboard docs](https://pynput.readthedocs.io/en/latest/keyboard.html) · [pynput PyPI](https://pypi.org/project/pynput/) · [pynput issue #297 (macOS modifier quirks)](https://github.com/moses-palmer/pynput/issues/297)

**Turn-taking / EoT detection:** [arXiv 2503.23439 Speculative End-Turn Detector](https://arxiv.org/pdf/2503.23439) · [LiveKit: transformer for EoT](https://blog.livekit.io/using-a-transformer-to-improve-end-of-turn-detection) · [LiveKit Turn Detector v1.0](https://livekit.com/blog/solving-end-of-turn-detection) · [LiveKit turn detector docs](https://docs.livekit.io/agents/build/turns/turn-detector/) · [LiveKit turns overview](https://docs.livekit.io/agents/build/turns/) · [Retell: VAD vs turn-taking endpoints](https://www.retellai.com/blog/vad-vs-turn-taking-end-point-in-conversational-ai) · [AssemblyAI: intelligent endpointing](https://www.assemblyai.com/blog/turn-detection-endpointing-voice-agent) · [LiveKit: turn detection for voice agents](https://livekit.com/blog/turn-detection-voice-agents-vad-endpointing-model-based-detection) · [Krisp turn-taking (6M weights)](https://krisp.ai/blog/turn-taking-for-voice-ai/) · [TEN_Turn_Detection (HF)](https://huggingface.co/TEN-framework/TEN_Turn_Detection) · [GrowwStacks: semantic turn detection](https://growwstacks.com/blog/fix-ai-voice-interruptions-with-semantic-turn-detection) · [Medium (Rajguru): EoT with transformers](https://medium.com/@manoranjan.rajguru/end-of-turn-detection-with-transformers-a-python-implementation-23bd74f621f3) · [comparevoiceai: mastering turn detection](https://comparevoiceai.com/blog/handle-interruption-detection-voice-ai-agent)

**Half/full-duplex & echo:** [WWDC23: What's new in voice processing](https://developer.apple.com/videos/play/wwdc2023/10235/) · [Apple Forums: macOS AEC mismatched devices](https://developer.apple.com/forums/thread/733733) · [Using VoiceProcessingIO on macOS (gist)](https://gist.github.com/d08f98b14328baa5eddbdf98d0ab8b91) · [recall.ai: system audio on macOS](https://recall.ai/blog/how-to-access-to-system-audio) · [Avantree: headphones eliminate echo](https://avantree.com/blogs/knowledge/how-to-fix-echo-problems-in-a-headset-or-headphones) · [Cleer Audio: echo cancellation & headphones](https://cleeraudio.com/how-echo-cancellation-technology-helps-to-reduce-acoustic-echoes-and-provide-better-conversation) · [Switchboard: WebRTC AEC3](https://switchboard.audio/hub/how-webrtc-aec3-works/) · [Spheron: WebRTC LLM streaming](https://www.spheron.network/blog/webrtc-llm-streaming-voice-agent-gpu-cloud/) · [webrtc.ventures: voice AI integration](https://webrtc.ventures/services/voice-ai-integration-comprehensive-resource/) · [getstream: WebRTC bi-directional voice](https://getstream.io/blog/webrtc-ai-voice-video/) · [Plivo: build a voice AI agent](https://www.plivo.com/blog/how-to-build-a-voice-ai-agent-livekit-pipecat-ten-or-native/) · [arXiv: FireRedChat full-duplex pVAD+EoT](https://arxiv.org/pdf/2509.06502) · [arXiv: personalized AEC](https://arxiv.org/pdf/2205.15195)

**Pipecat (Marcel's framework):** [Pipecat frames API](https://reference-server.pipecat.ai/en/stable/api/pipecat.frames.frames.html) · [Pipecat pipeline & frame processing](https://docs.pipecat.ai/guides/learn/pipeline) · [Pipecat user turn strategies](https://docs.pipecat.ai/api-reference/server/utilities/turn-management/user-turn-strategies) · [Pipecat base_interruption_strategy](https://reference-server.pipecat.ai/en/latest/api/pipecat.audio.interruptions.base_interruption_strategy.html) · [Agent Factory: frame-based architecture](https://agentfactory.panaversity.org/docs/Building-Realtime-Voice-Agents/pipecat/frame-pipeline-architecture) · [Issue #2460](https://github.com/pipecat-ai/pipecat/issues/2460) · [Issue #456](https://github.com/pipecat-ai/pipecat/issues/456) · [Issue #2791](https://github.com/pipecat-ai/pipecat/issues/2791) · [Issue #3829](https://github.com/pipecat-ai/pipecat/issues/3829)
