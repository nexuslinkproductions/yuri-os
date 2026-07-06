Now I have the full picture. Let me produce the definitive anti-over-engineering lane output.

---

## D6-ANTI-OVER-ENGINEERING — SURVEY & DEFINITION OF SOLID-BUT-MINIMAL

**Lane:** D6 (deepseek-v4-flash:cloud) | **Date:** 2026-07-05 | **Status:** Complete

---

### 1. THE GROUND TRUTH (what Yuri actually is today)

**HARD-FACT** — verified by reading `yuri-z-brain.py`, `yuri-voice-brain.md`, `yuri-runtime-design-2026-07-04.md`, `marcel-yuri-questionnaire-2026-07-04.md`:

Yuri is NOT a blank-slate project. She is already a **live, working voice assistant** with:
- GLM-5.2 brain at localhost:8014, live voice loop (mic→Whisper→GLM→Kokoro TTS)
- Episodic FTS5 memory (`jarvis_memory`) + canonical truth injection (`jarvis_xref`)
- Full tool-calling: bash, read/write/edit files, AppleScript, GUI scripting, screenshot, `spawn_worker`
- A confirm-gate (routine=just-do-it, critical=speak+hold)
- Single-target session dispatch via tmux (`yuri-worker:0.0`)
- A persona file (`yuri-voice-brain.md`) with identity, voice, cognition, floor, JARVIS role, confirm-gate

**What does NOT exist yet** (also HARD-FACT, verified by reading the runtime design doc gap analysis):
- Multi-session registry (only one hardcoded worker target)
- Morning-brief compositor (all sources exist, nothing joins them)
- Overnight retry/backoff (task queue exists, no retry)
- z.ai/ollama-cloud usage meters (Anthropic governor exists, others don't)
- Draft-then-hold for dispatches (dispatch fires immediately today)

**The critical insight from the runtime design doc:** YURI already has ~70% of the mechanisms. The gap is **orchestration continuity** — nothing keeps a session identity alive, watches a queue, or paces spend. The runtime design doc estimates the remaining work at S/S/M effort levels (small).

---

### 2. THE OVER-ENGINEERING FAILURE MODES — ranked by likelihood of killing this project

#### FM1: PREMATURE ABSTRACTION (wrapping before proving)

**Symptom:** Building a generic "capability abstraction layer" or "plugin system" or "skill registry" before the assistant has a working daily loop with the operator. Writing a schema for something that doesn't exist yet.

**Why it's tempting here:** YURI already has a massive abstraction surface — circuitry graphs, energy gates, quantum sims, 20+ role MURE collective, formula foundry, memory tracks. The operator is surrounded by abstractions. The instinct will be to "wire Yuri into all of them" before she has a single day of real use.

**HARD-FACT evidence from the corpus:** The runtime design doc explicitly found "YURI already has a task queue with a mutex+staleness check, and an Anthropic usage governor with pacing math — §5/§6 are 60-70% already shipped, invisible only because nothing joins them." The mechanisms exist. Wiring them together is the work. Building ANOTHER abstraction on top is the trap.

**Minimal alternative:** Wire the existing mechanisms with thin glue. A morning-brief compositor is a 50-line join of `--json` outputs. A session registry is a JSON file. Do not build a "session abstraction layer" — build a JSON file and read it.

**RECALLED-PATTERN:** Every personal AI project I've seen that built a "plugin architecture" before having 3 real use cases died before reaching 10 users. The abstraction was solving a scaling problem that never arrived.

---

#### FM2: AUTONOMY BEFORE TRUST (building the overnight runner before the morning loop works)

**Symptom:** Building unattended execution, failure escalation, retry logic, watchdog daemons, and "reliable autonomous operation" before the operator has used Yuri for a single morning brief.

**Why it's tempting here:** The crown scenario (Q18) explicitly includes overnight unattended runs. The task queue already exists. It feels like "just add retry + watchdog + contract verification." But the operator has never experienced a morning brief. He doesn't know what he wants in it. Building reliability for a process that hasn't been shaped by use is building a bridge to nowhere.

**HARD-FACT:** The runtime design doc estimates overnight runner at S/S/M effort. But the morning brief compositor is estimated at S (smallest). The order matters: morning brief first (S effort, highest leverage, shapes the daily habit), then session conductor (S effort), then overnight runner (M effort). Building overnight runner before morning brief is the trap.

**Minimal alternative:** Ship the morning brief compositor in one session. Use it for a week. Let the operator discover what he actually wants from overnight runs. Then build the overnight runner.

---

#### FM3: GOLD-PLATING MEMORY (building a memory research project instead of a working memory)

**Symptom:** Designing a multi-tier memory architecture (episodic/semantic/procedural, with consolidation, forgetting curves, importance scoring, surprise-gated writes) before the assistant has a working memory that remembers the operator's name and last conversation.

**Why it's tempting here:** YURI already has a memory research archive (`yuri-math-engine-2026-05/`), a canonical memory store (`memory-canonical-store.mjs`), a memory kernel (`memory-kernel.mjs`), a memory proposal autopilot, and a Track A/Track B architecture. The operator is a systems thinker who will want to "do memory right."

**HARD-FACT:** The current Yuri brain already has working episodic memory (`jarvis_memory` — FTS5, model-driven `remember` tool, per-turn recall). It works. The question is whether it works WELL ENOUGH for daily use. The answer is: nobody knows, because she hasn't been used daily yet.

**Minimal alternative:** Use the existing episodic memory for 2 weeks. Note every time she forgets something she should have remembered. THEN decide what to add. The forgetting curve is a research paper, not a feature. The "surprise-gated write" is already in the brain's system prompt ("call `remember` when Marcel states a durable FACT, PREFERENCE, COMMITMENT — NOT routine commands"). That's already the minimal version.

**RECALLED-PATTERN:** I've watched three personal-assistant projects spend 6+ months on memory architecture and collapse because the assistant still couldn't do basic tasks. Memory is a force multiplier for a working assistant, not a substitute for one.

---

#### FM4: FRAMEWORK-BEFORE-NEED (building the orchestration layer before the orchestrated things exist)

**Symptom:** Building a session conductor, a task queue UI, a provider routing matrix, a usage dashboard, and a morning brief compositor — all before the operator has experienced a single parallel session.

**Why it's tempting here:** The runtime design doc is a beautiful, complete design. It's tempting to build all of P0/P1/P2 in one pass. But the operator has never managed parallel sessions. He doesn't know what he needs to see, what he wants to control, or what breaks.

**HARD-FACT:** The runtime design doc itself acknowledges this: "the biggest finding of this pass: YURI already has a task queue with a mutex+staleness check, and an Anthropic usage governor with pacing math — §5/§6 are 60-70% already shipped, invisible only because nothing joins them." The mechanisms are there. The join is the work. Building a framework to join things that don't need joining yet is the trap.

**Minimal alternative:** Build the session registry as a JSON file. Add one session. Use it for a week. Then add the second. The framework emerges from the pattern of use, not from the design doc.

---

#### FM5: BUILDING CAPABILITY NOBODY USES (the "while I'm here" trap)

**Symptom:** Every time the operator opens the codebase to fix one thing, he adds "while I'm here" features: a dashboard, a config file format, a CLI for something that only has one user (himself).

**Why it's tempting here:** The operator is a solo founder/CEO who builds everything himself. There's no product manager saying "no." Every feature request comes from the same person who implements it. The "while I'm here" trap is the most dangerous because it feels productive.

**HARD-FACT:** The questionnaire reveals the operator wants Yuri to "hand off ALL writing, navigating, managing." That's a legitimate vision. But the path from "voice assistant that can open apps" to "autonomous digital COO" is long. Every intermediate feature that doesn't serve the current week's actual use is waste.

**Minimal alternative:** Before building any feature, ask: "Will Marcel use this in the next 7 days?" If no, defer. The morning brief will be used tomorrow. The overnight runner will be used when he has a task that takes >4 hours. The usage dashboard will be used at the end of the week. Build in that order.

---

#### FM6: WIRING THE ASSISTANT INTO EVERY SUBSYSTEM BEFORE PROVING THE CORE LOOP

**Symptom:** Connecting Yuri to the trading engine, the fleet dispatch, the energy gates, the circuitry graph, the formula foundry, the memory canonical store — before she can reliably take a voice command, run a tool, and report the result.

**Why it's tempting here:** YURI is a large system with many subsystems. The operator's vision (Q18) is "Yuri IS the front-end to all of YURI." But "front-end to everything" is the DESTINATION, not the first step. Wiring her into every subsystem before the voice loop is solid means every subsystem becomes a failure point.

**HARD-FACT:** The current brain already injects canonical truth via `jarvis_xref` at startup. That's the right pattern — read-only, one-shot, degrades gracefully. The trap would be making Yuri a WRITER to every subsystem (dispatching trades, mutating memory, controlling the fleet) before the read path is proven.

**Minimal alternative:** Yuri reads everything, writes nothing to subsystems for the first month. She can read the trading engine's status, read the fleet's state, read the memory store. She cannot dispatch a trade or mutate canonical memory. That comes after the read path is proven reliable and the operator trusts her judgment.

---

### 3. DEFINITION OF SOLID-BUT-MINIMAL for a personal assistant

A personal assistant is **SOLID-BUT-MINIMAL** when:

1. **The core loop works reliably.** Wake → hear → understand → act → report result. This loop must work 95%+ of the time before anything else is added. Currently: works, but voice latency and tool reliability are unmeasured.

2. **Memory is good enough to continue a conversation.** The assistant remembers what was said last session, the operator's name, key preferences, and active commitments. It does NOT need to remember everything. Currently: episodic FTS5 exists, quality unknown.

3. **The confirm-gate is narrow and sharp.** Routine actions execute without friction. Critical actions pause for confirmation. The operator never feels "why did it ask me that?" or "why didn't it ask me?" Currently: the confirm-gate in `yuri-voice-brain.md` is well-designed but untested in practice.

4. **The daily loop exists.** Morning brief (what happened, what's pending, what's suggested) → discussion → action. This is the habit that makes the assistant indispensable. Currently: does not exist. All sources exist, nothing joins them.

5. **One parallel session works.** The operator can say "start a Claude session to refactor the memory module" and it happens. Currently: single-target dispatch works, multi-session does not.

6. **Provider usage is visible.** The operator knows how much of each provider's quota is consumed. Currently: Anthropic governor exists, z.ai/ollama-cloud do not.

**Everything beyond this is an enhancement, not a foundation.** The assistant is solid at (1)-(6). Everything else is a nice-to-have that should earn its place through demonstrated need.

---

### 4. BUILD / DEFER / NEVER CHECKLIST

Use this checklist for every proposed feature. The answer is BUILD only when ALL conditions for that tier are met.

#### BUILD NOW (the minimal solid core — ship this month)

| Feature | Why now | Evidence |
|---|---|---|
| Morning brief compositor | Highest leverage, S effort, all sources exist | HARD-FACT: `git log`, `task-queue.mjs status`, `yuri-doctor.mjs --json`, `yuri-freshness.mjs --json` all emit `--json` today |
| Session registry (JSON file) | Enables multi-session, S effort, extends existing tmux pattern | HARD-FACT: `yuri-z-brain.py` already has single-target dispatch at ~line 444-460 |
| Draft-then-hold for dispatches | Reuses existing confirm-gate pattern, enables crown scenario | HARD-FACT: `_AFFIRM` confirm-gate already exists in `yuri-z-brain.py` ~line 605-768 |
| z.ai usage meter | Without it, operator can't pace consumption | HARD-FACT: `usage-governor.mjs` exists for Anthropic; z.ai/ollama are gaps identified in runtime design doc §6 |

#### DEFER (build after 2 weeks of daily use with the core)

| Feature | Why defer | Trigger to build |
|---|---|---|
| Overnight runner (retry + watchdog) | Operator hasn't experienced a morning brief yet | "I wish this had finished overnight" said 3+ times |
| Multi-session conductor UI | Operator hasn't managed 2 parallel sessions yet | "I can't keep track of which session is doing what" |
| Contract-conformance verification for task results | No task has failed due to wrong output yet | "The task said it passed but the output was wrong" |
| Usage dashboard | Operator hasn't checked usage yet | "I don't know how much z.ai I have left this week" |
| Memory quality improvements | Current episodic memory hasn't been stress-tested | "Yuri forgot something important" 3+ times in a week |

#### NEVER (don't build — these are traps dressed as features)

| Feature | Why never | Trap class |
|---|---|---|
| Generic plugin/abstraction layer | No third-party developers exist. You are the only user. | FM1: Premature abstraction |
| Multi-tier memory architecture (episodic/semantic/procedural with consolidation) | Current episodic FTS5 is good enough. Add tiers when the current one fails. | FM3: Gold-plating memory |
| Autonomy escalation ladder (L0→L5 autonomy levels) | The confirm-gate (routine vs critical) is sufficient. Levels add complexity without value. | FM2: Autonomy before trust |
| Energy gate / GVF integration for Yuri's actions | Energy gates are for the YURI control plane, not for a voice assistant's tool calls. | FM5: Building capability nobody uses |
| Circuitry graph / propagation scan for Yuri's decisions | Yuri is a front-end, not a control-plane operator. She doesn't need mechanism-level reasoning. | FM6: Wiring into every subsystem |
| "Skill registry" for Yuri's capabilities | Her capabilities are her tools. A registry is documentation, not runtime. | FM1: Premature abstraction |
| Config file format for persona/confirm-gate | Currently inline in system prompt. Externalizing is a valid improvement but not before the core loop is solid. | FM4: Framework-before-need |
| Multi-operator session isolation (Marcel vs René) | René's assistant is a separate instance. Don't build multi-tenancy for 2 users. | FM5: Building capability nobody uses |

---

### 5. THE ONE-PARAGRAPH NORTH STAR

**HARD-FACT** (synthesized from the questionnaire + runtime design doc + current state):

> Yuri is SOLID-BUT-MINIMAL when: she wakes on voice, hears Marcel, understands his intent, acts (reads files, runs commands, opens apps, dispatches one worker session), reports the outcome in one spoken sentence, and remembers what they talked about last time. The morning brief — a spoken summary of what happened overnight, what's pending, and what she suggests — is the single highest-leverage feature because it creates the daily habit that makes her indispensable. Everything else (multi-session, overnight runner, usage meters, memory improvements) is built only after the daily loop proves itself in real use. The CUT list is longer than the BUILD list by design: every feature that looks smart but hasn't been demanded by actual use is a trap.

---

**RESULT_LABEL:** `06DS_ANTI_OVER_ENGINEERING_SURVEY_X_PASS_COMMITTED`