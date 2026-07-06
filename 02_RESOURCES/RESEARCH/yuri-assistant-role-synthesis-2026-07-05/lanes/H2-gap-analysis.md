# H2 Gap Analysis: Yuri Assistant Role—Requirements vs Current State

**Research date:** 2026-07-05 | **Scope:** Marcel (Yuri) + René (Jeffrey, role-adapted) | **Source:** questionnaire answers + ground-state audit

---

## Gap Table: Requirement | Source | Current | Status | Minimal Fix

| Requirement | Source | Current State | Status | Minimal Fix | Leverage |
|---|---|---|---|---|---|
| **PERSONA + CONFIRM-GATE EXTERNALIZED** | Both | Inline in brain system-prompt only; no separate config file | MISSING | Move persona + rules to `yuri-persona-config.json`; brain reads at startup | **CRITICAL** |
| **Morning brief / absence report** | Marcel (perfect-day scenario) | Voice loop LIVE, but no scheduled morning briefing logic | PARTIAL | Wire `getAbsenceReport()` loop to startup (run every boot); surface: tasks due, overnight results, event flags | **HIGH** |
| **Conversational co-thinking flow** | Marcel (pain point 3) | Brain responds; no explicit "talk-through-&-I-write" mode | PARTIAL | Add prompt template for co-Q&A mode; Yuri asks clarifying Qs, synthesizes, writes answers | **HIGH** |
| **Parallel session conductor (draft→confirm→send)** | Marcel (perfect day: "Claude/Codex dispatches") | MURE 23-role collective exists; Yuri brain does not wire into it yet | MISSING | Add `yuri-orchestrator` controller: draft prompt → show Marcel → confirm gate → dispatch to lane | **HIGH** |
| **Wakeword / hotkey activation** | Marcel (#17) | Voice loop LIVE; no wakeword/hotkey integration yet | MISSING | Wire openWakeWord (or local equivalent) + macOS hotkey listener → mic-on signal | **MEDIUM** |
| **Provider metering + pacing** | Marcel (#12) | Brain knows providers; no per-provider quota meter or pace-to-deadline logic | MISSING | Implement usage tracker (token counts per provider per period) + decay pacer (use remaining quota by period end) | **HIGH** |
| **Full app control surface** | Marcel (#10, #9) | Screen-context reader (:8015 AX-reader) LIVE; actions DISARMED; vision stub | PARTIAL | Arm `/act` with safe guardrails (test on 3 safe workflows first); keep vision disarmed until proof-of-concept | **MEDIUM** |
| **Downloads/installs gated confirm** | Marcel (never-list) | Brain respects this; no explicit pre-download pause or listing for approval | PARTIAL | Add `confirmDownload()` gate: list source + size + purpose → wait for OK → proceed | **LOW-MEDIUM** |
| **Never fail / try-harder rule** | Marcel (never-list: "never accept failure as final") | Documented; not systematically wired | PARTIAL | Add retry + fallback loop to task execution; escalate to Marcel with options if truly stuck | **MEDIUM** |
| **Memory: org/safety/security + quirks permanent** | Marcel (#13) | MEMORY.md exists; behavioral memory working; no explicit "permanent" vs "expiring" classification | PARTIAL | Tag memory entries with `tier: [permanent | session | temporary]`; surface permanent-tier on every boot | **MEDIUM** |
| **Data routing: PII local, thinking→provider** | Both (René P4, Marcel implicit) | No split-routing logic; all prompts go to provider currently | MISSING | Implement `anonymizeForProvider()` function; keep names/numbers/secrets out of cloud calls | **CRITICAL** |
| **Voice: no bullet-salad, written for speech** | Marcel (#6) | Brain has no explicit TTS-optimized prompt rule | PARTIAL | Add prompt section: "Keep answers concise, spoken-word friendly; avoid lists" | **MEDIUM** |
| **Confirm-gate threshold: "large-scale operations"** | Marcel (#14) | Brain respects this; undefined operationally | PARTIAL | Define explicitly: fleet dispatch ≥3 parallel sessions / overnight runs / downloads / config changes / all require confirm before execute | **MEDIUM** |
| **Morning greeting (exact phrase)** | Marcel (#7) | Not yet integrated | MISSING | Wire exact greeting phrase into voice startup; tie to `getAbsenceReport()` | **LOW** |
| **Co-questionnaire mode (talk through Qs, she writes)** | Marcel (pain-point 3) | Not a mode | MISSING | Add prompt: "Co-Q&A mode: ask me each Q, discuss, I synthesize + write detailed answer" | **MEDIUM** |

---

## Ranking by Leverage (Highest First)

### TIER 1 — UNLOCK THE CORE ROLE

1. **PERSONA + CONFIRM-GATE EXTERNALIZED** (MISSING)
   - Why: Brain is now hardcoded; adding config layers later becomes tangled.
   - Minimal version: `yuri-persona-config.json` with `{name, greeting, dials, rules: []}` + simple brain loader.
   - Effort: 2-3 hours (read config, replace inline strings, test startup).
   - Unblocks: morning brief, co-thinking, session conductor all require persona to be configurable.

2. **DATA ROUTING: PII LOCAL, THINKING→PROVIDER** (MISSING)
   - Why: Both questionnaires imply trust-critical split. Currently violates consent.
   - Minimal version: Mark PII-containing input regions (names, emails, numbers, secrets); filter before sending to provider; keep filtered version locally.
   - Effort: 4-6 hours (detect PII, anonymize, test on real workflows).
   - Unblocks: Yuri can be trusted with full machine access; René's local Jeffrey avoids provider calls entirely on sensitive ops.

3. **PROVIDER METERING + PACING** (MISSING)
   - Why: Marcel wants to "fully use" quota each week; no current mechanism.
   - Minimal version: Track token count per provider per day; calculate remaining budget; suggest tasks to fit remaining budget by week-end.
   - Effort: 3-4 hours (add token logging, simple decay math, advisory hints).
   - Unblocks: Budget control; prevents over/under-use of paid resources.

### TIER 2 — ACTIVATE THE ASSISTANT LOOP

4. **MORNING BRIEF + ABSENCE REPORT** (PARTIAL)
   - Why: Marcel's perfect-day #1 action; requires structured daily surfacing.
   - Minimal version: `getAbsenceReport()` = recent task results + calendar deltas + open issues + flags. Show at boot, tie to voice greeting.
   - Effort: 2-3 hours (query memory DB + task logs + flags; format for speech).
   - Unblocks: Yuri becomes a daily ritual.

5. **WAKEWORD / HOTKEY ACTIVATION** (MISSING)
   - Why: Marcel uses voice-first; current always-on is not the intended UX.
   - Minimal version: Global hotkey (Cmd+Y) or openWakeWord on input stream; toggles mic + prompt context.
   - Effort: 2-3 hours (wire hotkey listener + mic gating).
   - Unblocks: Voice assistant feels "real" (push-to-talk or wake-on-keyword).

6. **CONVERSATIONAL CO-THINKING MODE** (PARTIAL)
   - Why: Marcel's core pain-point = wanting to "talk through" with Yuri.
   - Minimal version: Add prompt variant: "We're working through a question together. Ask me each part, discuss, then write detailed answer."
   - Effort: 1-2 hours (new prompt template, mode flag in conversation).
   - Unblocks: Yuri moves from "executor" to "thinking partner."

### TIER 3 — EXTEND SCOPE CAREFULLY

7. **PARALLEL SESSION CONDUCTOR (DRAFT→CONFIRM→SEND)** (MISSING)
   - Why: Marcel's perfect-day scenario; requires wiring into MURE collective.
   - Minimal version: `draftPrompt()` → show → confirm → send to selected lane (Claude/Codex/DeepSeek).
   - Effort: 4-5 hours (add lane routing, confirmation gate, result aggregation).
   - Unblocks: Yuri becomes the "dispatcher" for multi-session work.

8. **FULL APP CONTROL (SAFE ARM)** (PARTIAL)
   - Why: Marcel wants "full" control; currently vision is DISARMED.
   - Minimal version: Test `/act` on 3 safe workflows (calendar view, file list, email read) BEFORE arming vision. Move vision arm to conditional (text ops safe; visual parse needs review).
   - Effort: 3-4 hours (smoke test, gating rules, approval flow).
   - Unblocks: Yuri can actually control apps (not just read).

9. **CONFIRM-GATE OPERATIONALIZATION** (PARTIAL)
   - Why: Marcel says "always confirm large-scale operations" but what's "large"?
   - Minimal version: Define: `isLargeOperation = (fleetDispatch ≥3 sessions OR overnight run OR download OR config change OR deletion)`. Require confirm before execute.
   - Effort: 1-2 hours (define thresholds, add gate checks).
   - Unblocks: Clarity on when to ask vs act; reduces second-guessing.

### TIER 4 — POLISH & DETAIL

10. **MEMORY: TIER CLASSIFICATION (PERMANENT vs SESSION)** (PARTIAL)
    - Why: Marcel's never-list = "never forget org/safety/security"; operationally unclear.
    - Minimal version: Tag memory entries `tier: [permanent | session]`. Surface permanent tier at startup.
    - Effort: 1 hour (retroactive tagging + display logic).
    - Unblocks: Brain doesn't forget what matters.

11. **VOICE TTS OPTIMIZATION (SPOKEN-WORD FRIENDLY)** (PARTIAL)
    - Why: Marcel's #6 = voice is faster flow; bullet-salad doesn't speak well.
    - Minimal version: Add brain prompt: "Answer concisely, as if speaking. Avoid lists."
    - Effort: 0.5 hours (prompt tweak).
    - Unblocks: TTS quality improves; speech feels more natural.

12. **CO-QUESTIONNAIRE MODE** (MISSING)
    - Why: Marcel's pain-point 3 = wants to co-develop answers.
    - Minimal version: Mode flag + template: ask Q, discuss, I write detailed answer into doc.
    - Effort: 1-2 hours (template, mode switching, output routing).
    - Unblocks: Questionnaires become collaborative, not burdensome.

---

## Over-Engineering Traps to AVOID

| Trap | Symptom | Better Path |
|---|---|---|
| **Elaborate memory system before daily habit** | Build a 10-KB memory schema before Yuri has run 10 days | Iterate memory after seeing what actually gets remembered |
| **Orchestration for its own sake** | Wire session conductor into all 23 MURE roles before testing 1 lane | Start with Claude dispatch only; add lanes per evidence of value |
| **Vision before text** | Push computer-use vision early even though AX-reader works | Disarm vision; only arm when text-based control hits a hard wall |
| **"Never forget" perfection** | Build a bulletproof eternal-memory DB before testing retention | Simple tagged entries + periodic recall; iterate on what gets forgotten |
| **Multi-provider pacing before single-provider proves itself** | Meter all three providers equally; build decay logic upfront | Track one provider first; add others when Marcel actually juggles budgets |
| **Perfect confirm-gate before any confirm-gate** | Design a 50-rule gate matrix before testing a simple one | Implement one threshold (e.g., "anything fleet-size gets confirm"); refine from there |
| **Wakeword + voice interface before voice works** | Wait for wakeword before testing voice loop | Voice loop LIVE already; hotkey activation sufficient for MVP |

---

## SOLID-BUT-MINIMAL DEFINITION FOR YURI (next 2 weeks)

**Core loop (REQUIRED):**
1. Boot → persona config loads → voice greeting + absence report → listen for input.
2. Receive task → check if large-scale (needs confirm) → execute or present for approval.
3. Respond (voice or text) → log to memory + task result → loop.

**Must have:**
- [ ] Persona config file (externalizes name/dials/greeting/rules).
- [ ] Data-routing filter (no PII to provider).
- [ ] Provider meter (track usage; suggest tasks to pace quota).
- [ ] Morning brief (structured absence report at boot).
- [ ] Confirm gate (defined thresholds for "needs approval").
- [ ] Memory: permanent tier (never forgotten).

**Can defer without breaking the role:**
- Wakeword (hotkey sufficient for now).
- Vision arm (text-only AX-reader is enough).
- Full MURE orchestration (Claude dispatch first; others later).
- Conversation-mode prompts (can iterate after day 1).
- Co-questionnaire mode (nice-to-have; not blocking daily use).

**Success metric:** Marcel boots Yuri → gets morning brief → gives one task → Yuri confirms (if large) → executes → logs + summarizes → feels like a "digital co-worker," not a tool.

---

## Session Notes

**Lanes queried:** deepseek-tasks.json (D1–D8 research prompts) + glm-tasks.json (G1a–c independent synthesis + gap finder).

**Queries run:** xref-query on "yuri assistant role," "confirm gate design," "autonomy thresholds," "memory policy."

**Evidence:** Marcel questionnaire (verbatim 2026-07-04) + Jeffrey questionnaire template + current Yuri brain state (inline persona; voice LIVE; MURE dispatch available; screen-context reader `:8015`; memory.md LIVE).

**Verdict:** Yuri is ~60% operationally ready; main gaps are *configuration* (persona externalizing) and *trust* (data routing) rather than *capability* (brain works; voice loop works). Fix these two + simple confirms + morning brief = ready for daily use. Remaining items are valuable but not blockers.

**Confidence:** HIGH on TIER 1–2. MEDIUM on TIER 3 (requires MURE integration testing). LOW on wakeword/vision (not essential; hotkey sufficient MVP).

---

**End H2 gap analysis** | `CLAUDE_LANE_H2_ASSESSMENT_COMPLETE`
