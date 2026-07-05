Now I have the full picture. Here is the survey.

---

## SURVEY: Minimal Proactivity Loop for Yuri

### 1. Morning Brief — ALREADY SHIPPED

**HARD-FACT:** `_SYSTEM/runtime/morning-brief.mjs` is a live compositor joining 7+ read-only sources (git log, overnight results, yuri-doctor, dream queue, memory, usage meters, sessions) into one sectioned brief. Every source is fail-open. Supports `--text`, `--json`, `--spoken` output. Already wired into the GLM-5.2 voice brain as system-prompt injection. (`morning-brief.mjs` lines 1-30, `yuri-runtime-design-2026-07-04.md` §4)

**HARD-FACT:** Marcel's own answer (Q18): "boot computer → wake Yuri → 'what happened while I was gone?' → she reports + surfaces ideas + suggests next moves → conversation/discussion → Yuri launches Claude/Codex/terminal as needed." (`marcel-yuri-questionnaire-2026-07-04.md` Q18)

**HARD-FACT:** The brief already includes: git activity, overnight task outcomes, system health verdict, dream-queue depth, newest memory entries, usage meter one-liners, MURE collective status, and session registry. (`morning-brief.mjs` defaultSources, lines ~200-600)

**HARD-FACT:** What is MISSING from the brief: a "what's next" priority ranker. The design doc explicitly calls this out as a gap (`yuri-runtime-design-2026-07-04.md` §4, "morning-brief has no 'what's next' priority ranker; reactive-only"). The OpenProcess Sum Pool (`skills/organ-openprocess-pool/SKILL.md`) already provides the math layer for this — `whatIsUnfinished()` ranks open processes by OpenMass. The gap is wiring the pool into the brief.

**Assessment:** Morning brief is NOT a build item. It exists. The gap is one wire: brief → OpenProcess pool → ranked "what's next" section.

---

### 2. Absence Reports / "What Happened While I Was Gone"

**HARD-FACT:** This IS the morning brief. The compositor's `@serves` tag explicitly lists: "morning brief | wake-up report | what happened while I was gone | absence report | overnight summary." (`morning-brief.mjs` line 2)

**HARD-FACT:** The brief tracks `lastBriefTime` in `_SYSTEM/state/runtime/brief-state.json` and uses it as the `--since` window for git and other time-bounded sources. (`morning-brief.mjs` loadBriefState/saveBriefState, git source)

**Assessment:** Already built. No additional mechanism needed.

---

### 3. Carryover of Undone Tasks

**HARD-FACT:** The OpenProcess Sum Pool (`_SYSTEM/Scripts/openprocess-pool.mjs`) is the mathematical memory for started-but-unclosed work. It ranks processes by OpenMass = f(status, staleness, dependency centrality, risk, value). Staleness uses hazard-decay: a stale-but-open item RISES back in rank over time — it is not penalized into invisibility. (`skills/organ-openprocess-pool/SKILL.md`)

**HARD-FACT:** The pool is import-only (no CLI), pure read-only ranking math. It does not persist or own storage — the caller supplies process objects. (`organ-openprocess-pool/SKILL.md` "Security boundary")

**HARD-FACT:** The YURI nerve system (`skills/organ-yuri-nerve/SKILL.md`) calls `whatIsUnfinished` to produce an "open-work digest." This is the afferent pipeline that surfaces carryover.

**RECALLED-PATTERN:** The nerve → brief wiring is not yet live. The morning brief compositor does not currently call the OpenProcess pool. This is the single highest-leverage proactivity wire: brief gets a "still open from yesterday" section sourced from the pool.

**Assessment:** The math layer exists. The nerve exists. The brief exists. The wire between them is the gap.

---

### 4. Nudge / Reminder Cadence

**HARD-FACT:** Marcel's answer (Q20): "Reminders and nudges ('you wanted to call X') — welcome or annoying?" → answered in the questionnaire but the answer file (`marcel-yuri-questionnaire-2026-07-04.md`) does not contain a Q20 answer. The questionnaire template asks it but Marcel's answers stop at Q19's distilled config seed. The answer is UNKNOWN from local evidence.

**RECALLED-PATTERN:** Best practice from assistant design: nudges are welcome when they are (a) about something the user explicitly asked to be reminded of, (b) time-sensitive, or (c) about a task the user themselves flagged as important. They are annoying when they are (a) about things the model inferred without confirmation, (b) about low-priority items during deep focus, or (c) repetitive without escalation.

**RECALLED-PATTERN:** The "butler pattern" (`.claude/memory/feedback-butler-confirm-then-announce.md`): confirm-then-announce — ask once "should I remind you about X?", then do it. Never remind about something not confirmed.

**Assessment:** Nudge cadence should be: (1) user-confirmed reminders only, (2) surfaced in the morning brief (batch, not interrupt), (3) escalated to interrupt only for time-critical items the user confirmed. No timer-based nudge engine needed yet.

---

### 5. Notification Fatigue

**HARD-FACT:** The regenerative nexus guard doc (`02_RESOURCES/RESEARCH/regenerative-nexus-guard-2026-06-06.md`) explicitly warns: "Notification fatigue: If every helper becomes a warning, the owner stops reading. Mitigation: severity classification."

**RECALLED-PATTERN:** The fatigue mechanism is well-understood: each notification reduces the marginal attention the next one receives. The curve is steep — 3+ unsolicited interruptions per hour and the user starts ignoring ALL of them, including important ones.

**RECALLED-PATTERN:** The fix is not "fewer notifications" but "higher signal-to-noise ratio per notification." A morning brief that batches everything into one dense artifact has inherently lower fatigue than 12 separate pings throughout the day.

**Assessment:** The morning brief IS the anti-fatigue mechanism. The danger is adding separate notification channels (nudge timers, progress pings, status updates) that bypass the brief. Rule: one batch per wake cycle. Interrupt only for confirmed-urgent items.

---

### 6. Deep Focus Threshold — When to Speak Up Unprompted

**HARD-FACT:** Marcel's answer (Q21): "When you're deep in focused work: what, if anything, justifies an interruption?" → NOT answered in the questionnaire. The answer is UNKNOWN from local evidence.

**HARD-FACT:** Marcel's answer (Q8, unprompted speech): "must be informational and useful; threshold TBD; conversational by design." (`marcel-yuri-questionnaire-2026-07-04.md` Q8)

**HARD-FACT:** The YURI cognitive persona explicitly encodes deep-focus behavior: "Yuri can use deep-focus behavior only with explicit exit checks" and "Monotropism is useful for modeling interest-led depth." (`_SYSTEM/yuri-cognitive-persona-rationale.md`)

**RECALLED-PATTERN:** The standard design pattern for interruption thresholds in assistant systems:
- **CRITICAL** (system failure, security issue, time-sensitive confirmed reminder) → interrupt immediately
- **HIGH** (important result ready, blocking question) → wait for natural break or surface in next brief
- **MEDIUM** (task completed, status update) → batch into brief only
- **LOW** (suggestion, idea, observation) → never interrupt; surface in brief with "I noticed X, worth exploring?"

**RECALLED-PATTERN:** The "conversational by design" answer from Marcel suggests he wants a co-worker who can speak up, not a silent tool. The threshold should be calibrated by observing: does he engage when you speak up, or does he ignore/brush off? That's the signal.

**Assessment:** The threshold is TBD by Marcel. Default to: brief-batch everything except system CRITICAL. Let Marcel escalate the threshold himself by engaging with unprompted observations. No hardcoded silence rule.

---

### 7. The Minimal Proactivity Loop

Synthesizing all evidence into one loop:

```
WAKE (boot / session start)
  → morning-brief compositor runs (already built)
  → brief injected into brain as system context (already built)
  → brain opens with "Good morning Marcel, shall we continue from where we left off or do you have something new for us to do?" (HARD-FACT: Marcel's own greeting, Q7)
  → Marcel responds (conversation)
  → During conversation: Yuri may surface ideas from dream queue, suggest next moves from OpenProcess pool
  → If Marcel dispatches a task: draft-then-hold pattern (HARD-FACT: yuri-z-brain.py already has _save_pending/_AFFIRM confirm-gate, lines ~605-768)
  → Task runs (overnight or parallel session)
  → Next wake: brief includes results

INTERRUPT THRESHOLD (during deep focus):
  CRITICAL → interrupt (system failure, security)
  HIGH → wait for natural break or next brief
  MEDIUM → brief only
  LOW → brief only, marked as observation
```

**What is already built:** morning-brief compositor, OpenProcess pool (math layer), confirm-gate in brain, voice loop, task queue, usage governor.

**What is missing (the ONE wire):** morning-brief → OpenProcess pool → ranked "what's next" section. This is the single highest-leverage proactivity addition.

---

## BUILD LIST

| # | Item | Evidence | Effort |
|---|---|---|---|
| 1 | **Wire OpenProcess pool into morning brief** — add a "still open" section ranked by OpenMass | HARD-FACT: pool exists (`organ-openprocess-pool/SKILL.md`), brief exists (`morning-brief.mjs`), gap called out in design doc (`yuri-runtime-design-2026-07-04.md` §4) | S (one import + one section in renderText/renderSpoken) |
| 2 | **Add "what's next" ranker to brief** — use pool's `whatIsUnfinished()` to suggest next moves | HARD-FACT: `whatIsUnfinished` exists in pool | S (same wire as #1) |
| 3 | **Calibrate interrupt threshold with Marcel** — run a session where he defines CRITICAL/HIGH/MEDIUM/LOW for his actual work | HARD-FACT: Q21 unanswered, Q8 says "threshold TBD" | Conversation, not code |
| 4 | **Add nudge confirmation gate** — when Yuri thinks "remind about X", ask once "should I track this?" before adding to reminder pool | RECALLED-PATTERN: butler pattern from feedback | S (brain prompt change) |

## CUT LIST

| # | Item | Why Cut |
|---|---|---|
| 1 | **Separate notification system** (push notifications, OS alerts, timer-based pings) | The morning brief IS the notification system. Adding a second channel creates fatigue before the first channel is proven. |
| 2 | **Timer-based nudge engine** ("remind me in 2 hours") | Marcel hasn't asked for this. Q20 unanswered. Build only when he says "I need X at Y time." |
| 3 | **Deep-focus detection** (screen state, app focus, calendar, DND status) | Threshold is TBD. Building detection before knowing what to detect is over-engineering. Start with manual: Marcel says "focus" or Yuri asks. |
| 4 | **Proactive idea generation engine** (separate from dream queue) | Dream queue already exists. The brief already surfaces it. A second idea engine is duplication. |
| 5 | **Escalation ladder for ignored nudges** | No nudge cadence exists yet. Building escalation before the base case is premature. |
| 6 | **Per-task notification preferences** | Too granular. Start with one global threshold, let Marcel differentiate by task type if needed. |
| 7 | **Morning brief personalization UI** | The brief is composable by design (injectable sources). A config file is over-engineering until Marcel says "I don't want the git section." |

---

## Summary

The minimal proactivity loop is **one wire away from complete**: connect the OpenProcess Sum Pool to the morning brief compositor. That gives Marcel "what happened + what's still open + what's next" in one artifact, every wake cycle. Everything else (nudge cadence, interrupt threshold, notification fatigue) is handled by batching into the brief and letting Marcel calibrate the threshold through use.

**HARD-FACT:** The morning brief, OpenProcess pool, confirm-gate, voice loop, task queue, and usage governor are all shipped. The gap is the wire between them, not a missing mechanism.

**RECALLED-PATTERN:** The most common failure in assistant proactivity is building more channels before proving one channel works. One brief per wake cycle. One interrupt threshold (CRITICAL only until calibrated). One nudge rule (confirmed reminders only). Prove the loop, then expand.

08DS_PROACTIVITY_SURVEY_MINIMAL_LOOP_X_PASS_COMMITTED