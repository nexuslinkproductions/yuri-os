# FABLE PASS 1 — Yuri Role Synthesis (Definitive)

> Fable-5 mastermind pass, 2026-07-05. One run, all prep lanes read, all load-bearing claims re-verified
> against the live code (not the lane summaries). This document is the spec MURE implements next.
> Advisory-until-owner-verified, but written as a ruling, not a menu.

---

## 1. THE ROLE

Yuri is **Marcel's thinking partner who runs the machine at his word** — a co-thinker first, a
dispatcher second, and a secretary never. Marcel's actual pain (questionnaire #3) is not
disorganization — 250+ scripts already organize him — it is *thinking alone*. So Yuri's primary job is
conversational co-thinking: decode the brain dump, challenge once, decompose together, and then do the
thing Marcel hates doing himself — write it down precisely and translate it into prompts, dispatches,
and running sessions ("I want to be the mastermind who just thinks and speaks and it gets done," #4).
She is the single voice-and-hands front-end to YURI (#16), with full machine access (#10, #11) and an
act-first posture on everything reversible. She is NOT: an agenda-managing COO (that is René's need,
Jeffrey's frame — mis-transplanted onto Marcel by the native lanes), an autonomous agent with her own
goals, a second orchestration brain competing with YURI's existing substrates, or a vision-first
computer-use system. The COO *label* is dropped; the COO *contract* (organize, draft, dispatch, report
— never decide the big things) survives, because it is the same contract in both frames.

**T1 ruling: co-thinker-primary with an executive dispatch arm.** GLM G1a was right; H2/S2's
chief-of-staff frame was René's questionnaire leaking into Marcel's. Evidence: Marcel #3 (pain =
thinking alone; "core function target: conversational co-thinking"), #4c and #18 (dispatch arm), vs
René S3.9 (explicit "Jeffrey = COO, René = CEO").

## 2. OPERATING CONTRACT

**Decide + execute (no confirm):** anything reversible, evidence-decidable, on-machine, blast-radius ≤
MEDIUM — reads, drafts, file edits, routine bash, app control, spawning/steering approved worker
sessions, research fan-out, trading *analysis*. This is already the shipped behavior
(`yuri-z-brain.py:274-296`, owner-tuned 2026-06-19: "stop gating every routine step").

**Propose + HOLD (one-token confirm):** anything outward-facing or irreversible — send/post/publish,
`git push`, `conductor_send`, live trades, downloads/installs, deletes/overwrites of existing data,
arming any gate, large fan-out, production/shared state. On uncertainty: stop and produce a finished
ruling (recommendation + reversibility read), never a bare question.

**The confirm-gate threshold in one sentence:** *if it's reversible on this machine, Yuri does it and
tells Marcel after; if it leaves the machine or can't be undone, she says exactly what she's about to
do and waits for the word.* This binds 1:1 to the existing 6-gate Self-Governance Charter
(`_SYSTEM/yuri-origin.md`) — the voice brain's routine/critical split is the charter's
self-governable/owner-gated split in spoken form. No new vocabulary, no new gate.

**Highest-stakes classes:** (1) outward comms — email/message/post/publish/push; (2) live trading
actions (surface signals freely, never pull the trigger); (3) downloads/installs (Marcel's explicit
never-list #5 — see §4, this is the ONE hole in the shipped gate); (4) deleting/overwriting user data;
(5) arming gates / process fan-out beyond an approved dry-run.

**T3 ruling: the autonomy dial stays where the shipped code put it.** Marcel = act-first on
routine/reversible; René = ask-first on everything. Same gate mechanism, different default posture —
already implemented. Any "autonomy ladder," blast-radius scorer, or >2-tier gate is the exact
over-engineering the owner already corrected once (2026-06-19 narrowing). Widening self-governable
scope ("Marcel usually approves this" ≠ pre-approval) is equally banned. Trust graduates through the
HOLD-ruling loop actually working, not through configuration.

**T4 ruling: guest register — DEFER, indefinitely.** No second audience exists for Marcel's Yuri.
Jeffrey's INTERN/GÄSTE split exists because CGS has real walk-in customers; Marcel has none. Build it
on the first real second-audience event, not before.

## 3. THE DAILY LOOP (day one, minimal)

1. **Boot:** `yuri` (one word, LIVE). Brain :8014 up, voice loop attached.
2. **Greeting + absence report:** already LIVE — bot.py BRIEF-ON-START auto-speaks
   `morning-brief.mjs --spoken` (git log, overnight results, MURE, doctor, usage pace, sessions,
   memory freshness) prefixed with a time-of-day greeting. Nothing to build.
3. **Carryover:** "shall we continue from where we left off?" — the greeting promises this; the
   work-state injection (§4 item 1) is what makes it true.
4. **Co-think:** Marcel talks; Yuri decodes, challenges once, decomposes. No mode flag — this is just
   the conversation (co-Q&A "mode" is CUT).
5. **Draft → Confirm → Dispatch:** `conductor_draft` stages the exact prompt (LIVE, never
   auto-sends) → Marcel says the word → `conductor_send` fires (LIVE, always confirm-gated) →
   `conductor_peek` watches.
6. **Report:** progress notes on long jobs; everything that lands overnight surfaces in tomorrow's
   absence report.

The loop is ~80% shipped. The gaps are connective, not architectural.

## 4. SOLID-BUT-MINIMAL SETUP (ordered, smallest first)

### Already LIVE — verified against code, nothing to build
| Item | Evidence |
|---|---|
| Voice+text brain, GLM-5.2, 18 tools | H1 §2; brain 997 lines, tool table verified |
| **Confirm-gate (T2)** | **SHIPPED + owner-tuned**: `_is_critical_call`, `_CRITICAL_BASH/_APPLESCRIPT`, pending-action state machine w/ affirm/negate/abandon (`yuri-z-brain.py:245-925`); `conductor_send` always gated; `write_file` gated only on overwrite; `_DESTRUCTIVE` hard-block separate |
| **Morning brief / absence report** | **SHIPPED**: `morning-brief.mjs` (8 fail-open sources) auto-spoken at voice startup (`bot.py:239-290, 382-390`) and printed at REPL startup. H2 called this missing — H2 was wrong |
| **Provider metering** | **SHIPPED**: `usage-meters.mjs` — zai/ollama/anthropic pools, scan watermark, pace verdict, feeds the brief. H2 called this missing — wrong again |
| Session conductor (list/create/draft/send/peek) | LIVE, tmux-backed, draft-safe |
| Episodic memory | FTS5 `jarvis-memory.db` (57KB, live data), model-judged salience, per-turn recall, MEMORY.md injection |
| Persona externalized | **Already true**: `yuri-voice-brain.md` is a file the brain loads at `_build_system()` — Marcel can edit the persona today with zero code changes. The "externalize persona" gap (H2 Tier-1 #1) was misdiagnosed |
| Activation | `yuri` alias LIVE; wakeword BUILT (WakeGate, `bot.py:114+`), hot-mic default is the owner's chosen model; flipping `YURI_WAKE_ENABLE=1` is a config choice, not a build |
| Overnight runner + runtimed supervisor | exist with tests; launchd arming correctly owner-gated (template-only) |

**T2 ruling: GLM was right, the native lanes were wrong.** The gate, the brief, the meters, and the
persona file all exist. The #1 gap is NOT "build the gate" — it is **carryover + habituation**: make
the greeting's promise true, then run the loop until trust is boring.

### BUILD NOW (total ≈ 1 day of work, in this order)
1. **Work-state carryover** (~2h, the single highest-leverage genuine gap — G1b's find, verified: no
   open-loops source exists in brain injection or brief). One `work-state.json` (3–5 open items +
   next step each), injected in `_build_system()` next to MEMORY.md, updatable via the existing
   `remember` plumbing, added as one more brief source. ~30 lines. This turns "what happened?"
   (works) into "we left off on X, next step Y — want me to start?" (doesn't exist).
2. **Gate patch — downloads/installs** (~15min). Marcel's never-list #5 is NOT covered:
   `_CRITICAL_BASH` gates push/sendmail/mail only. Add install/download patterns
   (`brew|pip|npm|cargo install`, `curl/wget -O` to file, `git clone` of non-local remotes) to the
   CRITICAL regex. One line. This is a questionnaire hard rule with a verified hole.
3. **Affirm-regex hardening** (~15min, G1b's find, verified at line 848): "yeah, but also check my
   calendar" currently fires a pending action. Require the affirm token within the first ~3 words
   (real confirms are short). One line.
4. **`read_doc` tool** (~2h). Verified absent from the brain. `pdftotext` + `libreoffice --headless`
   text-out wrapper, one tool entry. No Mineru, no layout fidelity, no vision.
5. **Two config entries, zero code:** (a) set weekly `budget` values in
   `_SYSTEM/state/runtime/usage-config.json` — the pace verdict is already coded and currently reads
   "HOLD (no budget)"; this alone closes Marcel's #12 pace-to-quota requirement. (b) MEMORY.md is
   14,981 bytes against a 14,000 injection cap and is being blind-truncated — prune the index or
   raise `YURI_Z_MEM_CAP`. Maintenance, not architecture.
6. **Promote S1 persona + gate drafts to `_SYSTEM/SELF/`** as canonical *documentation* of the
   shipped behavior (mirroring Jeffrey's files), owner-gated promotion. NOT a new runtime config
   layer — the brain keeps loading `yuri-voice-brain.md`; the gate lists stay in code where the owner
   just finished tuning them. Docs describe reality; they don't add a config engine.

### DEFER (tracked, not blocking)
Session output watcher (peek→spoken deltas — P2, after the single-lane loop is habit) · launchd
boot-persistence (arming decision, P3 — G1a over-weighted it; the loop starts with one word today) ·
hotkey/Hammerspoon · SwiftBar menubar · wakeword arming · Mineru high-fidelity docs · vision/OmniParser.

## 5. THE CUT LIST — do NOT build

1. **NEURO_CORE energy-gated memory** (surprise-gating, write_strength=|ΔU|×precision, fast/slow). A
   57KB FTS5 store with model-judged writes already feels like memory. Research paper, not a feature.
2. **Vector embeddings / semantic memory** — until FTS5 demonstrably misses something Marcel expected
   recalled. FTS5 is fast, deterministic, debuggable.
3. **H4's formal three-tier memory schema rebuild** — the episodic store already has `weight`,
   `kind`, and reinforcement counters; adding a PERMANENT/CONVERSATION/TRANSIENT tier column is
   re-solving a solved problem. MEMORY.md *is* the permanent tier.
4. **PII/anonymization pipeline for provider calls** (H2 Tier-1 #2 "CRITICAL" — overruled). Marcel is
   the sole user; the same providers already see the whole repo in every coding session; the
   protected-path + secrets floor already exists in the brain. Split-routing is REAL for René
   (customer data — Jeffrey's Rule B, already live on his machine) and transfers only when a second
   user or customer data lands here. Zero current threat delta, real latency + false-positive cost.
5. **MURE-into-the-voice-brain wiring** — one worker lane (Claude Code session), proven daily for
   weeks, before any role-routing. MURE stays a substrate Yuri *can* target via the same conductor,
   not a boot dependency.
6. **A new persona/gate runtime config system** (JSON loader, hot-reload, schema versioning). The
   persona is already an editable file; the gate is two regexes the owner just tuned. Externalizing
   working code into config is indirection, not solidity.
7. **Autonomy ladders / blast-radius scorers / >2-tier confirm gates** — the gate has already been
   through one over-engineering correction. Two tiers + explicit override is the whole design.
8. **Guest register / multi-user parameterization** — no `users:` array, no second register, until a
   real second audience exists. Jeffrey's registers are Jeffrey's.
9. **Co-questionnaire "mode" flag** — decode-first conversation already is the mode.
10. **App integrations (Gmail/Slack/Linear/GitHub bindings)** — AppleScript covers Mail/Calendar
    today; add one integration only when Marcel says "I wish I could just tell you to X" twice.
11. **Ambient lifelog / always-on capture** — privacy surface + storage problem for an unproven need.
12. **Smarter pacing math** — the linear consume-by-deadline curve is coded; it needs a budget
    number, not an algorithm.
13. **Wakeword arming as a build item** — it's built; hot-mic is the owner's current choice; this is
    a one-env-var preference, permanently off any build list.

**Rule:** if it doesn't unblock the 6-step loop in §3 within the next two weeks, it waits.

## 6. PHASED ROADMAP

**P1 — Daily-driver core (this week).** Ship §4 items 1–6 (~1 day). **DoD:** Marcel runs the full
loop 5 consecutive real days; every morning the carryover names the actual open threads unprompted;
one PDF read in-conversation; one HOLD-and-ruling exchange happened and felt right; zero code edits
needed mid-week.

**P2 — Conductor + trust (weeks 2–4).** Deepen, don't widen: session output watcher (peek-poll →
spoken deltas) so parallel sessions report themselves; 2+ substrates dispatched in one working
session; gate habituation — collect every HOLD event and every false-gate/missed-gate into a short
ledger, tune the two regexes from evidence. **DoD:** a two-lane afternoon (e.g. GLM build +
ollama research) where Marcel never manually checks a pane, and next morning's brief surfaces both
outcomes; zero gate misfires in week 4.

**P3 — Autonomy + overnight + arming (month 2).** Overnight runs become routine; then the owner
arming decisions in order of earned trust: launchd boot-persistence first (Yuri survives reboot),
wakeword if hot-mic ever annoys, screen-context `/act` only when a real workflow hits a wall AX text
can't solve. **DoD:** Marcel leaves an approved overnight job, wakes up, and reconstructs nothing;
Yuri survived a reboot without a terminal.

## 7. NORTH STAR

**Marcel thinks out loud; Yuri thinks with him, writes it down, runs it at his word, and never loses
the thread — reboot → talk → confirm → it's running → she reports back.**

## 8. VERDICT ON THE PREP

The fan-out over-produced and the cheap lanes over-claimed; the blind peer was the only lane that read
the code hard enough. Specifics:

- **H2 (gap analysis) was wrong on 4 of its top 6 facts.** Morning brief: "PARTIAL, no startup
  wiring" — shipped and auto-spoken. Provider metering: "MISSING" — shipped, three pools, pace math.
  Persona externalization: "MISSING/CRITICAL" — the persona has been an editable file all along.
  Confirm-gate: "undefined operationally" — a tested state machine with an owner tuning cycle behind
  it. H2 audited the questionnaire against an outdated mental model of the code, not the code.
- **S2 inherited H2's errors:** three of its six BUILD-NOW items (absence report, gate wiring,
  provider pacing) were already built; a fourth (PII filter) is cut here. Its cut list and roadmap
  shape were good and are largely kept.
- **S1 persona/gate drafts are kept — as documentation.** Their one structural error: proposing
  themselves as the file the brain loads. The brain already has its persona file.
- **GLM G1a/G1b/G1c were the sharpest inputs** (role frame, work-state gap, trap catalog) — the
  blind-divergence design did its job. One G1a overreach: "the daily loop literally cannot start
  without launchd" — false; it starts with one word. Arming stays owner-gated at P3.
- **Deepseek D1–D8 were corroborative padding** — competent restatement of S1/charter with citations,
  nothing load-bearing that the code read didn't already settle. Fine as cross-checks; 8 lanes was
  ~5 too many.
- **MURE dry-run** contributed role-casting metadata only; correctly HELD the two owner-gated roles.
- **Net scope shrink:** the prep's combined build lists implied ~2–3 weeks of construction. The
  verified build-now core is **~1 day** (4 small code items + 2 config entries + a doc promotion),
  because the system was further along than 3 of 4 substrates believed. The most over-engineered
  thing in this package was the package.

— Fable-5, one-shot. `00FB_YURI_ROLE_SYNTHESIS_DEFINITIVE_X_PASS_COMMITTED`
