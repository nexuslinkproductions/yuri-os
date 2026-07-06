# JARVIS Voice Architecture — Review & Refactor-or-Extend Verdict

> Owner ask (2026-06-19): "take a very close look at how it is set up, what can be done, should we refactor it entirely?"
> Scope: the full Yuri voice stack — `bot.py` (Pipecat transport) → `yuri-z-brain.py` (GLM-5.2 brain) → tools → confirm-gate → memory.
> Method: grounded in files read fresh this session (not memory-of-memory). Evidence-anchored.

---

## VERDICT (up front)

**EXTEND. Do not refactor.** The core is structurally correct and owner-verified; the gaps to "closest to Jarvis" are additive, not structural. A refactor would rebuild working machinery (the agent loop, the confirm-gate state machine, the wake-gate) for no gain and real regression risk. The single biggest Jarvis gap — **amnesia across restarts** — was just closed (`jarvis_memory.py`, commit `9d6de847`). What remains is proactive initiation + situational awareness, both of which plug INTO the existing loop.

The rest of this doc is the evidence for that call.

---

## 1. The stack as it stands (end-to-end teardown)

```
 mic → Silero VAD + smart-turn → MLX Whisper STT → WakeGate → CancelFilter → HeardLogger
      → brain :8014 (/v1/chat/completions, OpenAI-compat)
            → _build_system() [persona + MEMORY.md + TOOL_NOTE, built ONCE at startup]
            → + per-turn FTS5 recall block [NEW — jarvis_memory.recall()]
            → Z.ai GLM-5.2 (Anthropic Messages, Bearer, $0 plan) — agent loop, MAX_TOOL_ITERS=50
            → 10 model-chosen tools → confirm-gate (critical ops HOLD) → safety floor
      → Kokoro chunked-synth TTS → speaker   (barge-in on next VAD)
```

**What's genuinely good (don't touch):**

- **Wake-gate is real** (`bot.py:69` `WakeGate`). "Yuri"/"Rick" anywhere in the sentence (start/middle/end), keepalive window for follow-ups, asleep+no-word = dropped. **Always-on hands-free is architecturally REAL**, not aspirational. This is the foundation most "voice assistant" projects never reach.
- **Model-driven tool selection, not intent-routed.** 10 tools (`bash`, `read_file`, `write_file`, `edit_file`, `spawn_worker`, `remember`, `applescript`, `gui_script`, `open_app`, `screenshot`) composed by the model per request. This is the right JARVIS shape — no hardcoded "play music" intent, she figures it out. Honors the give-capabilities doctrine (the model decides, we don't strip its agency with regex).
- **Confirm-gate is a correct state machine** (`yuri-z-brain.py`). Routine ops execute; critical ops (delete/send/git push/overwrite) speak a description + HOLD, persisted to `yuri-pending-action.json`; next turn's affirm/negate resolves it. Two subtle correctness fixes are baked in: stale-pending is **abandoned** on a fresh turn (re-arms the gate, closes a bypass hole), and affirm requires `_AFFIRM and not _NEGATE` (so "actually no" doesn't false-fire). Re-deriving this under a refactor would re-introduce those bugs.
- **Safety floor is deterministic**, not model-prompted: `PROTECTED` paths + `_DESTRUCTIVE` regex refuse at the executor (`_bash_block_reason`), independent of what the model "agrees" to. This is the right layering — the model is persuasive; the executor is not.
- **Staging is clean**: Pipecat transport (real-time audio) and the brain (LLM + tools) are decoupled by an OpenAI-compat HTTP seam. Swap the transport, swap the brain — neither knows the other's guts.
- **Episodic memory now exists** (`jarvis_memory.py`): model-driven `remember` writes, per-turn FTS5 cue-recall, reinforce-on-recall. Cross-restart continuity — closed this session.

**What's merely OK (not broken, not great):**

- Startup `SYSTEM` is frozen for the process lifetime (`yuri-z-brain.py:107` — built once). MEMORY.md edits mid-session don't hot-reload. Acceptable: the per-turn recall block covers the dynamic part; a static persona is fine.
- 12-turn ring buffer (`yuri-z-history.json`) for short-term context. Fine as a working-memory layer; the episodic store is the long-term layer. Two-tier (fast buffer + slow store) matches the NEURO_CORE design.

---

## 2. What "closest to Jarvis" still needs (ranked, honest)

| # | Gap | Why it matters | Effort | Owner-gated? |
|---|-----|----------------|--------|--------------|
| 1 | **Proactive initiation** | JARVIS speaks *first* ("meeting in 10", "the build failed", "you said you'd call Atilla today"). Today she's purely reactive — waits for the wake word. This is the biggest remaining "feels like Jarvis" delta. | Med — a scheduler/event loop (launchd or in-process beat) that checks signals (calendar, git hooks, deadlines in memory) and injects a proactive prompt into the brain → TTS. | **Yes** — speaking unprompted is outward-facing from the assistant's side; owner should arm it deliberately. |
| 2 | **Situational awareness feed** | Proactive init needs inputs: current time, calendar, screen state, "is a build running". She has the *tools* (AppleScript calendar, screenshot) but no passive polling. | Low-Med — wire a periodic `awareness()` summary into the proactive beat. | No (read-only telemetry). |
| 3 | **Active-thread continuity** | Memory stores durable facts, but not "we were mid-task on X, resume here." A `commitment`/`active_thread` memory kind + a "what were we doing?" recall path closes this. | Low — extends `jarvis_memory` (new kind + a `resume_thread()` recall variant). | No. |
| 4 | **STT robustness / TTS persona fit** | MLX Whisper + Kokoro. Not reviewed deeply; likely fine. Out of architecture scope — transport tuning. | — | — |

**Not gaps (already solved):** hands-free wake, full machine control, confirm-gate safety, cross-restart memory, vision (glm-4.6v via `screenshot`).

---

## 3. Refactor-or-extend — the argument

**Case for EXTEND (the winner):**

- The design has **no structural flaw**. An HTTP-staged, OpenAI-compat, model-driven agent loop with a deterministic safety floor and a confirm-gate is exactly how you'd build this if you started fresh. There is nothing to "fix" at the architecture level.
- Every remaining gap (#1–#3) is **additive**: a proactive beat plugs into the existing loop as just another message source; situational awareness is read-only tool polling; active-thread is a memory-kind extension. None require touching the loop, the gate, or the floor.
- The confirm-gate and safety floor encode **hard-won correctness** (the stale-pending bypass fix, the affirm/negate guard, the protected-path executor). A refactor re-derives these and will get one wrong on the first try.

**Case for refactor (rejected), and why it fails:**

- *"It grew organically, 747+ lines, maybe it's a mess."* — It isn't. The brain is one file because it's one cohesive responsibility (serve the voice loop). The functions are named, the safety floor is isolated, the gate is its own section. Length ≠ mess.
- *"Fresh start would be cleaner."* — Cleaner for whom? The cost is real (regression of 64+18 green checks, re-deriving the gate, re-arming the safety floor, re-integrating Pipecat) and the benefit is aesthetic. That's scope intoxication, not engineering.
- *"A different framework (LangGraph/LlamaIndex/etc.) would be better."* — No. The current loop is ~60 lines of straightforward Python. A framework adds abstraction weight and a dependency for a problem already solved. The autonomy doctrine says capability-first; the capability here is already built and verified.

**Refactor would only be justified by:** a structural flaw (none), a scaling wall (not hit — single-user, one machine), or a security hole in the floor (none found; it's deterministic and the model can't talk past it). None hold.

---

## 4. The memory layer (store-choice rationale)

Built `jarvis_memory.py` as a **dedicated SQLite/FTS5 episodic store** rather than reusing the two existing organs. This is capability-first done *honestly* — recall found the organs, close inspection showed neither fits, so the gap is real:

- **`memory-canonical-store.mjs` — REJECTED.** It's a declarative `(subject, predicate, object)` **triple store** for cross-lane operating truth, with a governed `propose→decide→promote` pipeline and a read-path that folds ALL generations + resolves supersede/retract. Wrong on three axes: **shape** (voice episodes aren't declarative triples), **latency** (heavy periodic fold, not per-voice-turn sub-100ms cue-match), **governance** (voice episodes are personal episodic context, not Track-A facts other lanes need promoted).
- **`spreading-activation-memory.mjs` — DEFERRED to V2.** It's a personalized-PageRank **ranker** over a graph built from `.md` files, seeded by node IDs. A recall ranker, not a store; needs a Node subprocess + graph rebuild per turn (too slow for the voice hot-path). Right idea for a **V2 associative layer** on top of `jarvis_memory` (rank recalled episodes by associative activation, not just FTS relevance) — not the V1 ground truth.
- **`jarvis_memory.py` — BUILT.** Python stdlib only (no Node bridge in the hot-path), FTS5 BM25 recall × model-judged weight × reinforcement, reinforce-on-recall (reconsolidation: recall is a WRITE per NEURO_CORE #5). The model is the judge of surprise via the `remember` tool — respects the give-capabilities doctrine.

**V2 roadmap for memory:** (a) spreading-activation associative ranking over episodes; (b) real `write_strength = |ΔU|·precision` — wire the energy-gate's ΔU (currently the brain has no ΔU signal; would need a lightweight surprise scorer per turn); (c) forgetting curve (power-law, not TTL) + the pinned force-keep tier for owner-locked facts.

---

## 5. Residual risk + recommended next moves

**Residual risk (named, not hand-waved):**

1. **The `remember` tool trusts the model's salience judgment.** GLM-5.2 may over-remember (clutter) or under-remember (miss a commitment). Mitigation: the model sets `weight` (0.1–5); a periodic prune (low-weight, never-recalled, old) is a V2. Marcel tests empirically — that's the explicit doctrine.
2. **Proactive initiation, if armed, is a new outward vector** — the assistant speaking unprompted. Must stay owner-gated (it's in the charter: outward-facing = HOLD). Build DISARMED, owner arms.
3. **Recall injection adds tokens per turn** — bounded (top-5 episodes, ~one line each). Verified non-fatal (empty recall = no block). Watch the cap if the store grows.
4. **macOS Automation/Accessibility permissions** — `applescript`/`gui_script` need TCC grants; `_run_osascript` returns a helpful grant-message on failure. Not an architecture issue, but the first real-world JARVIS test will hit it.

**Recommended next moves (in order):**

1. **Empirical memory test** — Marcel runs Yuri, states a few preferences/commitments, restarts, asks a recall question. Validates the model actually calls `remember` and recall surfaces. (This is the "test her out myself" step.)
2. **Active-thread kind** (gap #3) — small `jarvis_memory` extension; closes "what were we doing?"
3. **Proactive beat, DISARMED** (gap #1) — a launchd/in-process scheduler that, when armed, checks calendar + git + memory commitments and injects a proactive prompt. Build behind a flag; owner arms after reviewing what triggers it.
4. **Situational awareness feed** (gap #2) — wire into the proactive beat.

None of these is a refactor. All extend a sound core.

---

## Result label

`09CL_JARVIS_ARCH_REVIEW_EXTEND_NOT_REFACTOR_X_PASS_COMMITTED`

— Claude lane (Opus), 2026-06-19. Grounded in `yuri-z-brain.py`, `bot.py`, `memory-canonical-store.mjs`, `spreading-activation-memory.mjs`, `jarvis_memory.py`, `yuri-voice-brain.md` read fresh this session.
