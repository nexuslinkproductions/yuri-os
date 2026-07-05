Good. I now have a grounded picture of the system. Let me produce the audit.

---

# ANTI-OVER-ENGINEERING AUDIT — Yuri Assistant Front-End

## System Context (grounded)

Marcel's YURI-OS: fleet orchestration (MURE 23-role dispatch collective), energy gates (scalar potential U), quantum sims, dual memory tracks (canonical + auto-memory), circuitry graphs, formula foundry, multi-lane swarm dispatch, GitNexus code intelligence, workcell protocols. ~26k docs+code in FTS5 corpus. Multiple provider lanes (Anthropic, z.ai GLM, Ollama-cloud). Voice loop live (mic→Whisper→GLM→Kokoro). Computer-use screen-reader DISARMED. Yuri is intended as the **front-end** to all of this.

Marcel's stated core function: **"conversational co-thinking"** — talk through problems, she writes it down, dispatches, conducts parallel sessions.

**René/Jeffrey pilot signal (REAL USER, hard evidence):** voice quality is non-negotiable, one-word launcher (`jeffrey` / `jeffrey stop`), local FTS5 second-brain built unprompted, safety-scoping by folder emerges organically, persona-from-interview works, auto-reindex required not optional. (source: `rene-jeffrey-pilot-learnings-2026-07-05.md`)

---

## THE TRAPS

### 1. THE FULL-BUS-TO-EVERYTHING TRAP
**Symptom:** Wiring Yuri into fleet dispatch, trading engine, memory kernel, circuitry graph, formula foundry, GitNexus, workcell protocols — all before she can reliably have a 5-minute conversation and write it down.

**Why it's tempting here:** The system EXISTS. Every subsystem has an API, a script, a graph node. The founder's instinct is "she should be able to reach everything I can." The codebase practically invites it — every surface has a bridge, every bridge has a script.

**Minimal alternative:** Yuri talks, listens, writes notes, reads files, launches one Claude/Codex session. **That's month one.** Fleet dispatch is month three. Trading engine is "do you even want this?" Energy gates are never — they're infrastructure, not assistant UX. The bus grows as the operator *asks for the next thing*, not as the architect *sees the next subsystem*.

**Test:** If you remove fleet dispatch from Yuri tomorrow, does she stop being useful? If yes → the core loop isn't solid yet.

---

### 2. AUTONOMY BEFORE TRUST TRAP
**Symptom:** Building elaborate autonomy tiers, reversibility classification, blast-radius scoring, multi-level confirm gates — before the operator and Yuri have done 100 real tasks together and built the *organic* intuition of "she usually gets this right" / "she always messes this up."

**Why it's tempting here:** YURI-OS already HAS energy gates, autonomy runners, Kagami event buses, governed-autonomy sprint plans. The temptation is to wire those directly into the assistant. But those gates were designed for *system-level* mutation (code changes, fleet dispatch). Assistant autonomy is a different domain — it's about *human judgment calibration*, not infrastructure.

**Minimal alternative:** Two rules. (1) Never send, publish, or spend without saying "I'm about to X — confirm?" (2) Everything else: do it, tell me what you did after. That's the whole confirm-gate for month one. Refine tiers after 30 days of real friction data, not before.

**Test:** Can you state the confirm gate in one sentence to a non-technical person? If not, it's over-specified.

---

### 3. MEMORY PALACE BEFORE A WORKING HABIT TRAP
**Symptom:** Building elaborate memory hierarchies (episodic FTS5 + semantic canonical store + behavioral memory + convergence store + episodic extraction + forgetting policies + expiry curves) before the operator has a *daily habit of talking to Yuri about real work*.

**Why it's tempting here:** YURI has dual memory tracks, a canonical convergence store with shard-drain architecture, memory-kernel proposal→decide→ledger pipelines, and auto-reindex beats. It's the founder's most-compounded subsystem. The gravitational pull to make Yuri's memory "as sophisticated" is enormous.

**Minimal alternative:** One FTS5 index. One behavioral-memory markdown file. "Never forget" list = hardcoded facts (names, preferences, the operator's stated never-forgets). Everything else: if it was said in the last N sessions, it's findable via search. That's it. The convergence store, the proposal pipeline, the canonical bridge — those are for YURI-OS memory, not for an assistant remembering that Marcel prefers 7.5/10 on all dials.

**Test:** Does the memory system require a diagram to explain to the operator? If yes → cut until it doesn't.

---

### 4. ORCHESTRATION-FOR-ITS-OWN-SAKE TRAP
**Symptom:** Building Yuri as a "session conductor" that manages parallel Claude/Codex/terminal sessions, routes tasks across lanes, monitors workcell progress, arbitrates lane evidence — before the operator has a single reliable handoff flow.

**Why it's tempting here:** YURI's workcell protocol, lane arbitration, nano-swarm dispatch, and parallel Sonnet sessions are the most impressive machinery in the system. Making Yuri the *conductor* of all of this is the obvious "front-end to everything" move. But conducting 4 parallel sessions requires a working pattern for *one* handoff first.

**Minimal alternative:** "Yuri, draft a prompt for X" → operator reviews → "Send it." That's one handoff. One Claude session. Get that right 50 times. THEN add a second session. The multi-session conductor is a *behavioral pattern* that emerges from repetition, not an *architecture* you install.

**Test:** Has the operator successfully dispatched 10 tasks through Yuri in a single week without manual intervention? If not → don't build the conductor layer.

---

### 5. PERSONA-AS-A-SYSTEM TRAP
**Symptom:** Treating Yuri's personality as an engineering problem — scoring dials, persona-spectrum classifiers, voice-mode routing, formality detectors, humor calibration matrices — instead of as a *style that the operator either vibes with or doesn't*.

**Why it's tempting here:** The questionnaire produced 7.5/10 on all dials. The instinct is to build the machinery that *maintains* those numbers. Lane-persona maps, persona overlays,Rick alias neutralization — the system already has persona infrastructure.

**Minimal alternative:** One system prompt. 200 lines max. Name, voice, dials as plain-text instructions ("be direct, warm, occasional profanity, no filler"). No scoring, no spectrum, no calibration loop. If the operator says "too formal," edit the prompt. If they say "too chatty," edit the prompt. The persona is a *text file*, not a *system*.

**Test:** Can the operator change Yuri's personality by editing one file with no code changes? If not → the persona is over-engineered.

---

### 6. CAPABILITY CREEP VIA "IT'S JUST ONE MORE INTEGRATION" TRAP
**Symptom:** Adding browser control, email reading, calendar management, trading dashboards, code-review pipelines — each justified as "just one more tool" — until the assistant has 40 tools and can't reliably use any of them.

**Why it's tempting here:** Every integration is *technically feasible*. The YURI tool surface already supports file read/write, bash, search, xref. The founder sees each surface as "obviously useful." And each one *is* useful — in isolation.

**Minimal alternative:** Ship with 5 tools: (1) talk/listen (voice), (2) read files, (3) write notes/files, (4) search the corpus, (5) launch one session (Claude/Codex). That's the core loop. Add tools ONE AT A TIME, each triggered by the operator saying "I need to do X, can you help?" — never preemptively. The tool list grows from *demand*, not from *supply*.

**Test:** Count the tools Yuri can invoke. If >8 and she's been live <30 days → cut.

---

### 7. INFRASTRUCTURE-AS-PRODUCT TRAP
**Symptom:** Spending more time on the *system* behind Yuri (reindex beats, stale-watch daemons, propagation scans, health checks, skill registries) than on the *assistant experience* itself. The system runs beautifully; the assistant still can't reliably handle "what happened while I was gone?"

**Why it's tempting here:** This is the founder's zone of genius. The YURI-OS is a compounding research machine. Every hour spent on infrastructure pays dividends across the whole system. But the assistant is a *product*, not infrastructure. Users don't care about reindex cadence — they care about whether the morning report was right.

**Minimal alternative:** The "morning report" is a script that reads the last 24h of git log, calendar, and a notes file. No propagation scan, no circuitry graph, no spectrum analysis. Just: what changed, what's due, what's unfinished. Ship that. Refine the report from *operator feedback*, not from *infrastructure capability*.

**Test:** Time spent this week on assistant UX vs. assistant infrastructure. If infrastructure >60% → the trap is active.

---

### 8. MULTI-USER GENERALIZATION TRAP
**Symptom:** Designing Yuri to serve both Marcel and René from day one — parameterized personas, provider routing tables, per-operator memory scopes, shared-vs-private config layers.

**Why it's tempting here:** Jeffrey exists. The questionnaire was designed for both. The research already includes "René/Jeffrey pilot learnings." The founder wants his dad to have the same system.

**Minimal alternative:** Build Yuri for Marcel. Period. When Jeffrey works for René, *then* extract the commonalities into a shared template. Building for two users before one works is designing for abstraction you haven't earned. René's signal (voice quality, one-word launcher, safety scoping) is *research data*, not *requirements*.

**Test:** Does the config have a `users:` array? If yes → you're building for abstraction too early.

---

### 9. THE "SHE SHOULD KNOW EVERYTHING" TRAP
**Symptom:** Expecting Yuri to have full awareness of the 26k-doc corpus, the circuitry graph, the formula banks, the trading engine state, the memory canonical store, the workcell logs — and to answer questions about any of it. Building retrieval chains that touch every surface before the assistant can answer "what was I working on yesterday?"

**Why it's tempting here:** The information is *right there*. YURI's xref-query touches FTS5 + graph + GitNexus + spectrum + canonical memory. Why wouldn't the assistant use it?

**Minimal alternative:** Yuri searches a *single FTS5 index* of personal notes + recent files. If the answer isn't there, she says "I'd need to dig into X — want me to?" She does NOT run a full xref-query for a casual question about yesterday's work. The deep-retrieval machinery is for *system-level* tasks (code impact analysis, circuitry propagation), not for "what did I call that project?"

**Test:** How many subsystems does a casual question ("what was I working on Tuesday?") touch? If >2 → the retrieval chain is over-built for the use case.

---

### 10. PROACTIVITY WITHOUT PAIN TRAP
**Symptom:** Building elaborate morning briefs, absence reports, nudge engines, notification routing, interruption classifiers — before the operator has experienced even one morning where Yuri *failed* to deliver because the mechanism didn't exist.

**Why it's tempting here:** The "perfect day" scenario starts with "boot computer → wake Yuri → 'what happened while I was gone?' → she reports." That's the crown scenario. Building the *mechanism* for it is the obvious move.

**Minimal alternative:** Yuri's first 30 mornings: she says the greeting. The operator tells her what he cares about. She writes it down. The next morning, she reads what she wrote. No git log parsing, no calendar integration, no event aggregation. Just: "yesterday you mentioned X, Y, Z." After 30 days of real mornings, the operator will *tell you* what's missing from the report.

**Test:** Does the morning brief require >1 data source? If yes → defer until the operator asks "can you also check X?"

---

## DEFINITION OF DONE — SOLID-BUT-MINIMAL YURI

Yuri is done when Marcel boots his computer, says her name, and has a useful working session — voice or text — where she listens, co-thinks, writes things down, reads things back, and occasionally launches a task into another session that he confirmed first. She remembers what he told her last time. She does not send, publish, spend, or install without asking. She does not silently fail — she says what went wrong. She handles the morning greeting and one absence-report mechanism that the operator has actually tested and iterated on for at least two weeks. She has exactly the tools he has asked for, not the tools the system *could* give her. The persona is a single editable file he can modify in 60 seconds. The confirm gate is explainable in one sentence. If you removed every subsystem except FTS5 search, file read/write, and one session launch, she would still be the assistant he reaches for first. Everything beyond that is earned through real usage demand, not architectural ambition.

---

09GL_OVER_ENGINEERING_TRAP_AUDIT_YURI_X_PASS_COMMITTED