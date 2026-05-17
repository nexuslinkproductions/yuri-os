# NOESIS REINSTATEMENT PLAN
*Produced by YURI · 2026-04-18*
*Cowork session reset wiped the running context. This plan reinstates all four engines.*

---

## The Gap

NOESIS was designed as "always-on / autonomous / no intervals" — but it was never running autonomously. It was running in-session (seeded during April 17 with data and a schedule). The Cowork session reset broke continuity. Nothing was actually scheduled in Cowork's task system.

This plan translates NOESIS design intent into what Cowork's scheduled task system can actually execute.

---

## Architecture Decision: Scheduled vs. Contextual

**The honest read of NOESIS against Cowork's capabilities:**

Cowork runs scheduled tasks as YURI prompts fired on a cadence. They don't run continuously — they run when triggered. "Always-on" must be reframed as "runs when triggered; between triggers, signals accumulate in the intake log for the next run."

| Engine | Mode | Reason |
|--------|------|--------|
| Engine 1: Research | **Scheduled** | Batch research digest on cadence; real-time capture happens IN sessions |
| Engine 2: Skill Refinery | **Contextual** | Pattern detection requires project context; runs post-session |
| Engine 3: Self-Observer | **Scheduled** | Monthly baseline is the designed cadence |
| Engine 4: Vision Synthesis | **Scheduled** | Quarterly synthesis is the designed cadence |

**Key architectural reframe**: Between scheduled runs, Marcel and YURI capture signals in noesis-intake.md during live sessions. The scheduled tasks synthesize accumulated signals — they don't replace real-time capture.

---

## SCHEDULED TASKS

### TASK 1: RESEARCH DIGEST (Engine 1)
**Cadence**: Every 2 weeks  
**Next run**: 2026-05-01  
**Reads**: noesis-intake.md (Engine 1 section) + any new signals from the prior 2 weeks  
**Writes**: A new dated signal block appended to `noesis-intake.md` under Engine 1  
**Purpose**: Ensure research domains stay fresh; don't let intake log go stale

**Prompt template:**
```
You are YURI running Engine 1 (Research Organism) of the NOESIS Protocol.


Your task:
1. Review all existing Engine 1 signals. Note which have moved to ACT, which remain WATCH, which are stale.
2. Update status on any signals that have changed (ACT → DONE if implemented; WATCH → ACT if threshold crossed).
3. Check for new developments in the tracked domains:
   - Post-production innovation (AI tools, DaVinci Resolve, color science)
   - Asian AI frontier (DeepSeek, Qwen, Kling, Wan 2.5, Manus AI)
   - Client pipeline signals (C2MovieZ, planzerfilms, MACL-ONE)
   - Business psychology (decision-making, energy allocation)
   - Esoteric/philosophical developments relevant to YURI framework
   - Japan AI adoption (creative industries)
4. Add any new signals in the format already established in the file.
5. Write a 3-sentence summary: what changed, what demands immediate attention, what is building slowly.

Do not produce a new document. Append to the existing noesis-intake.md.
```

---

### TASK 2: MONTHLY SELF-OBSERVER (Engine 3)
**Cadence**: Monthly — 1st of each month  
**Next run**: 2026-05-01  
**Reads**: enki_state.md + session_log.md (prior month entries) + noesis-intake.md (Engine 3 section)  
**Writes**: New entry in noesis-intake.md (Engine 3 section) + flags if enki_state.md needs updating  
**Purpose**: Capture capacity baseline; detect drift before it becomes a problem

**Prompt template:**
```
You are YURI running Engine 3 (Self-Observer) of the NOESIS Protocol.

Read in sequence:

Your task:
1. Compare current enki_state.md against observed patterns from session_log.md entries.
2. Assess: Has capacity shifted? Have new constraints appeared? Has energy allocation changed?
3. Identify: Any new resistance patterns? New decision bottlenecks?
4. Note: Which active projects are gaining momentum vs. stalling?
5. Append a new dated baseline entry to noesis-intake.md under Engine 3.
6. If enki_state.md is stale in any section, list exactly what needs updating (do not write directly — flag for Marcel confirmation).
7. Close with: one sentence on the actual operating state right now.

This is not a performance review. It is a calibration instrument.
```

---

### TASK 3: QUARTERLY VISION SYNTHESIS (Engine 4)
**Cadence**: Quarterly — end of Q2 (2026-06-30), Q3 (2026-09-30), Q4 (2026-12-31)  
**Next run**: 2026-06-30  
**Reads**: All four engines' noesis-intake.md sections + enki_state.md + session_log.md (prior quarter) + identity.md  
**Writes**: New Vision entry in noesis-intake.md (Engine 4 section) + one-page synthesis document  
**Purpose**: Quarterly recalibration of direction; integrate all engines into a realistic 3-6mo narrative

**Prompt template:**
```
You are YURI running Engine 4 (Vision Synthesis) of the NOESIS Protocol.
This is the Q[X] [YEAR] quarterly synthesis.

Read in sequence:

Your task:
1. Synthesize all Engine 1-3 signals from the past quarter.
2. Assess trajectory: where is Marcel actually moving (not intended — actual)?
3. Identify the 1-2 most significant shifts since the last quarterly synthesis.
4. Produce a 3-6mo narrative: where is this heading, what are the risks, what is the opportunity.
5. Name one clear decision that needs to be made.
6. Output: append to noesis-intake.md (Engine 4 section) AND write a standalone synthesis to:

This is a theurgic practice. It integrates scattered sparks. Take the time it requires.
```

---

## CONTEXTUAL TASKS (Run per-session, not scheduled)

### Skill Refinery (Engine 2)
Not schedulable as a standalone task — it requires project context.

**When to invoke**: At close of any project or session where Marcel reports a workflow that worked well or a friction point that appeared again.

**Per-session protocol:**
```
You are YURI running Engine 2 (Skill Refinery) of the NOESIS Protocol.


Context provided by Marcel: [what worked / what created friction in this session/project]

Your task:
1. Has this pattern appeared before in the Engine 2 log? If yes: it has now hit threshold — document as skill candidate.
2. If new: add to Engine 2 section as first-execution pattern.
4. Append summary to noesis-intake.md.
```

**Research intake (real-time during sessions)**
When YURI encounters a relevant signal during any session, it appends immediately to noesis-intake.md. This is not a scheduled task — it is a reflexive habit during every session.

---


|----------------|---------|-------|
| All engine intake | `/YURI/.claude/noesis/noesis-intake.md` | Primary intake document; all engines write here |
| Monthly baseline template | `/YURI/.claude/noesis/monthly-reflection-template.md` | Template for Engine 3 runs |
| Feedback loop map | `/YURI/.claude/noesis/feedback-loops.md` | Architecture reference |
| Vision synthesis outputs | `/YURI/06_KNOWLEDGE-BASE/04_SYNTHESIS/` | Quarterly documents land here |
| Skill candidates | `/YURI/02_AREAS/skills/` | Engine 2 outputs |
| Research signals (in-session) | `/YURI/02_AREAS/research-intake/[domain]/` | Real-time filing per NOESIS-CORE spec |
| enki_state.md | `/YURI/enki_state.md` | Monthly update trigger; truth source for operating state |

---

## WHAT EACH TASK READS AND WRITES

| Task | Reads | Writes |
|------|-------|--------|
| Research Digest (bi-weekly) | noesis-intake.md Engine 1 | noesis-intake.md Engine 1 (updated signal statuses + new signals) |
| Self-Observer (monthly) | enki_state.md, session_log.md, noesis-intake.md Engine 3, monthly-reflection-template.md | noesis-intake.md Engine 3 (new baseline) + enki_state.md update flag |
| Vision Synthesis (quarterly) | noesis-intake.md all sections, enki_state.md, session_log.md, identity.md | noesis-intake.md Engine 4 + vision_[YYYY-Q#].md in 04_SYNTHESIS/ |
| Skill Refinery (contextual) | noesis-intake.md Engine 2 | noesis-intake.md Engine 2 + skill stub in 02_AREAS/skills/ |

---

## NEXT ACTIONS TO REINSTATE

In order:

1. **Read this document.** Confirm the scheduled task cadences match your actual needs.
2. **Decide on Research Digest cadence** — bi-weekly is the recommendation; weekly is also viable given the Asian AI track velocity.
3. **Use the Cowork `schedule` skill** to create three scheduled tasks: Research Digest, Self-Observer, Vision Synthesis — using the prompt templates above.
4. **The Skill Refinery** does not need scheduling — add the per-session protocol to your session start checklist.
5. **Verify noesis-intake.md** still holds the April 17 seeds (confirmed — it does). The research signals are not stale yet; first scheduled research digest at 2026-05-01 is appropriate.

---

## ON THE MYTH OF "ALWAYS-ON"

NOESIS-CORE.md says "no intervals — continuous." That was designed for a persistent process, not a session-based system. What is actually continuous is the *intent*: every time Marcel works, YURI is observing. Every signal gets filed. The scheduled tasks are not the organism — they are the organism's *digestive events*. Intake is continuous; synthesis is periodic.

This is also the correct Kabbalistic read: the Lightning Flash is not one continuous event. It is a series of emanations, each complete, each seeding the next. The organism doesn't fail because it has rhythm. It fails if the rhythm stops entirely.

Keep the rhythm.

---

*Status: PLAN COMPLETE — Awaiting Marcel confirmation to create Cowork scheduled tasks*
