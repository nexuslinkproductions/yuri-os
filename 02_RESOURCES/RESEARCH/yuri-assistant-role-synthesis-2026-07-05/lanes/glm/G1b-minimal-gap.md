I now have a complete, evidence-grounded picture. Let me write the review.

---

# Yuri — Single Missing Piece for "Solid" Daily Use

## EVIDENCE BASE (what I actually read)

```
MATCH file=_SYSTEM/Scripts/voice/yuri-z-brain.py line=122 function="_build_system"
  parts = [yuri-voice-brain.md, MEMORY.md (capped 14KB), canonical-block, TOOL_NOTE]
MATCH file=_SYSTEM/Scripts/voice/yuri-z-brain.py line=55-120 function="TOOL_NOTE"
  INLINE Python string: confirm-gate rules, voice discipline, execution rules, memory behavior
MATCH file=_SYSTEM/Scripts/voice/yuri-z-brain.py line=245-325 function="CONFIRM-GATE"
  _CRITICAL_BASH regex, _CRITICAL_APPLESCRIPT regex, _AFFIRM regex, _NEGATE regex
MATCH file=_SYSTEM/Scripts/voice/yuri-z-brain.py line=842-925 function="run_brain + _run_agent_loop"
  pending → affirm check → execute; negate → cancel; else → abandon + clear
MATCH file=_SYSTEM/Scripts/voice/bot.py line=379-410 function="main() startup"
  greeting + spoken brief auto-queued at startup (BRIEF-ON-START), cancellable by barge-in
MATCH file=_SYSTEM/Scripts/voice/yuri-voice-brain.md line=1-60
  persona + JARVIS role + confirm-gate (mirrors the inline TOOL_NOTE)
MATCH file=_SYSTEM/Scripts/voice/jarvis_memory.py line=104,167
  remember() + recall() — FTS5 BM25 × weight, T2 PPR associative fill
MATCH file=_SYSTEM/runtime/yuri-repl.mjs line=619-626
  text REPL: prints morning brief at startup, then greets
FILE_COUNT file=_SYSTEM/runtime/morning-brief.mjs count=1  (28KB, reads git log + overnight + usage + doctor)
FILE_COUNT file=_SYSTEM/runtime/usage-meters.mjs count=1   (24KB, tracks tokens per provider)
FILE_COUNT file=_SYSTEM/runtime/session-conductor.mjs count=1  (15KB, tmux-backed parallel sessions)
```

## WHAT'S ALREADY SOLID (don't touch these)

The stack is more complete than the H2 gap analysis credits. Concretely:

1. **Confirm-gate is live and externalized in CODE** (`yuri-z-brain.py:245-925`). The H2 "persona+confirm-gate externalized" gap is about *config-file separation*, not functional absence. The gate works: pending JSON, affirm/negate regex, `_is_critical_call` classification, abandon-on-new-turn. This is a real safety state machine, not just prompt instructions.

2. **Morning brief auto-speaks at voice startup** (`bot.py:379-410`). The H2 gap "morning brief not wired to startup" is **already fixed** — `BRIEF-ON-START` fetches `morning-brief.mjs --spoken`, prepends a time-of-day greeting, queues it as `TTSSpeakFrame(append_to_context=True)`. This is live.

3. **Episodic memory is live** — SQLite + FTS5, model-judged salience, per-turn recall injection, energy-seam enrichment (T1), PPR associative recall (T2). Not a gap.

4. **18 tools are live** — bash, file ops, AppleScript, GUI scripting, screenshot, spawn_worker, conductor (list/create/draft/send/peek), morning_brief, usage_status, remember, xref.

5. **Voice loop is live** — Pipecat v1.3.0, Silero VAD, MLX Whisper STT, Kokoro TTS, InstantBargeIn, cleanup trap on exit.

## THE SINGLE MINIMAL MISSING PIECE

### **Routine/Context Injection — the "what was I doing?" bridge between sessions**

**What it is:** A single `yuri-context.json` file (or even a section appended to the existing MEMORY.md) that captures **open work state** — the 3-5 things Marcel is actively working on, their status, and the next step for each. Injected alongside the static MEMORY.md at `_build_system()` time (line 123).

**Why it's the highest-leverage gap:**

The system has episodic memory (what happened) and static MEMORY.md (who Marcel is + standing facts). What it DOESN'T have is a **current-state pointer** — the answer to "where did we leave off?" The morning brief surfaces overnight results and git commits, but those are activity logs, not **intentional work state**. When Marcel says "continue with the Jeffrey thing" or "what's next on Yuri?", the brain has:

- FTS5 recall of past episodes mentioning "Jeffrey" (fuzzy, may miss the latest state)
- Git log (what changed, not what's planned)
- No structured "here's the open loop, here's the next action"

This is the difference between an assistant that answers "what happened?" (already works) and one that says "we left off on X, the next step is Y, want me to start?" (doesn't exist).

**Evidence it's missing:**
```
MATCH file=_SYSTEM/Scripts/voice/yuri-z-brain.py line=123 function="_build_system"
  parts = [persona, MEMORY.md (static 14KB cap), canonical-block, TOOL_NOTE]
  → No "current work state" or "open loops" injection
MATCH file=_SYSTEM/Scripts/voice/jarvis_memory.py line=104 function="remember"
  kind ∈ {fact, preference, commitment, episode}
  → No "open_task" or "in_progress" kind
MATCH file=_SYSTEM/runtime/morning-brief.mjs line=1-100
  Sources: git log, overnight results, MURE, doctor, usage, sessions, dream queue
  → No "open work items" or "next actions" source
```

**Smallest version that ships:**

```python
# In _build_system(), between MEMORY.md and TOOL_NOTE:
WORK_STATE_FILE = os.path.join(os.path.dirname(__file__), "..", "..", "state", "voice", "work-state.json")
# ...
try:
    with open(WORK_STATE_FILE) as f:
        ws = json.load(f)
    if ws.get("open"):
        lines = [f"- {item['title']}: {item['next']}" for item in ws["open"][:5]]
        parts.append("## CURRENT WORK — where we left off\n" + "\n".join(lines))
except Exception:
    pass
```

The `work-state.json` starts as:
```json
{
  "open": [
    {"title": "Jeffrey pilot", "next": "confirm Kokoro voice config + send Modelfile"},
    {"title": "Yuri persona externalization", "next": "move TOOL_NOTE into config file"}
  ]
}
```

The brain's `remember` tool already has the plumbing — add a `work_state` kind that updates this file. The morning brief already composes sources — add `work-state.json` as one more source. **~30 lines of code, ~1 file.**

## RUNNERS-UP (in priority order)

### 2. Confirm-gate context fragility (medium-leverage, low-effort)

**What:** The affirm/negate regex (`_AFFIRM`, `_NEGATE`) runs on the raw user message, but if Marcel says anything that contains an affirm word incidentally ("yeah, but also check my calendar"), the gate fires and the pending action executes. The check at line 848:

```python
if pending and _AFFIRM.search(user_msg) and not _NEGATE.search(user_msg):
```

...has no concept of "the user changed the subject." If there's a pending action and Marcel says "yeah I need to send Atilla an email about that project" — the regex matches "yeah", the gate fires, and whatever was pending executes regardless of context.

**Smallest fix:** After affirm match, check that the pending action's `original_request` is semantically related to `user_msg` — or simpler: require the affirm word to be in the first 3 words of the message (most confirms are short: "yes", "do it", "go ahead"). One line change.

### 3. Static MEMORY.md is 15KB and will grow past the 14KB cap (low-leverage now, becomes critical)

**What:** `MEM_CAP=14000` truncates MEMORY.md (currently 14,981 bytes — already over cap). The truncation at line 128 does a blind `.rsplit("\n", 1)` cut, which could lop off in the middle of a section. As Yuri accumulates behavioral memory, this will silently drop increasingly important context.

**Smallest fix:** Either raise the cap (cheap, doesn't scale) or split MEMORY.md into a "core" section (always injected) + "extended" section (FTS5-recalled per turn). The latter reuses the existing episodic recall mechanism. Not urgent today — the cap works — but it's a ticking clock.

## WHAT LOOKS IMPORTANT BUT IS PREMATURE

| Looks Important | Why It's Premature |
|---|---|
| **Externalize persona/confirm-gate to a config file** | The H2 gap analysis ranked this CRITICAL, but the confirm-gate is already a working code state machine (`_is_critical_call`, pending JSON, affirm/negate). Moving strings to JSON is a **maintainability refactor**, not a functionality gap. It doesn't make Yuri more "solid for daily use" — it makes the code cleaner. Defer until the persona actually needs to change without a code edit. |
| **PII data routing / anonymization** | Important for a multi-user product. Marcel is the sole user on his own MacBook with his own API key. PII routing solves a problem that doesn't exist yet. Build it when a second person (Jeffrey, René) actually connects. |
| **Provider metering + quota pacing** | `usage-meters.mjs` (24KB) already tracks tokens per provider. `usage_status` tool already speaks the pace. The gap analysis missed this — it exists. What's missing is *advisory pacing* ("you have 40% quota left, suggest running X"), which is a nice-to-have, not a daily-use blocker. |
| **Wakeword / hotkey activation** | The voice loop is always-on with barge-in. A wakeword is UX polish. Not a solidity gap. |
| **Computer-use screen-reader arming** | Intentionally DISARMED. The AX-tree reader (:8015) works for text contexts. Vision arming is a scope expansion, not a gap in the current role. |
| **Multi-role MURE orchestration from voice** | The conductor (draft → confirm → send) already wires voice → parallel sessions. Full MURE integration is scope expansion, not a missing piece for daily use. |
| **Memory tier classification (permanent/session/temporary)** | The episodic store already has `weight` (0.1-5.0) + `reinforced` counters. This naturally handles salience. A formal tier system is over-engineering before there's evidence of what gets forgotten. |

## SUMMARY

**Ship #1:** A `work-state.json` that captures 3-5 open work items + next actions, injected at `_build_system()` alongside MEMORY.md, updatable via the existing `remember` tool. ~30 lines. This transforms Yuri from "remembers what happened" to "knows where we are" — the single thing that makes a daily assistant feel like a co-worker rather than a fresh hire every morning.

Everything else is either already built, a refactor masquerading as a gap, or premature scope expansion.

---

06GL_YURI_ROLE_GAP_ANALYSIS_WORKSTATE_BRIDGE_X_PASS_COMMITTED