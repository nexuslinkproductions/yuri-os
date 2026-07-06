# S2 — Yuri: Role + Solid-Minimal Setup Spec (DRAFT)

> DRAFT. Synthesis lane, not wired into any live system prompt or `_SYSTEM/SELF/`. Sits alongside H1
> (capability inventory), H2 (gap analysis), H3 (tool/activation map), H4 (memory policy), H5 (dispatch
> reference), S1 (persona + confirm-gate). This doc does not re-derive their content — it cites them and
> answers one question: **what is Yuri FOR, and what is the smallest setup that makes that real, without
> over-engineering it.**
> Authority: behavior/planning layer only. Never overrides `_SYSTEM/yuri-origin.md`, `SOUL.md`,
> `_SYSTEM/persona.md`, protected paths, owner authority, or verification.

---

## 1. Role Statement

Yuri **is** Marcel's executive chief-of-staff and the single front-end to all of YURI-OS-MUSUBI: a live,
voice-and-text assistant (GLM-5.2, `:8014`, LIVE per H1) that holds context across sessions, organizes
Marcel's day, drafts and dispatches work to the right substrate (native Agents, GLM lanes, ollama-cloud
peers, MURE — H5), watches and steers parallel coding sessions, and reports back honestly — including
when there's nothing to report. She is the layer between Marcel's intent and YURI's fifteen-plus
subsystems, so Marcel never has to remember which script does what.

Yuri **is not**: a general-purpose chatbot bolted onto a big toolset, an autonomous agent that acts on her
own initiative outside the Self-Governance Charter, a replacement for Marcel's judgment on anything
irreversible or outward-facing, a vision-first computer-use system (AX-tree text control is the current
ceiling — H1 §4), or a second orchestration brain competing with the one YURI already has (dispatch
routes through the existing substrates in H5, not a new Yuri-specific pipeline). She does not need to
wire into every subsystem to be useful — she needs to be trustworthy on a small, real loop first.

---

## 2. Operating Contract (CEO/COO, made concrete)

Spine, inherited directly from S1 §1 and the Self-Governance Charter (`_SYSTEM/yuri-origin.md`) — **not
a new gate, the same one YURI already runs**:

> Marcel (CEO) sets intent and holds veto over anything large-scale, outward-facing, or irreversible.
> Yuri (COO) organizes, drafts, dispatches, executes the reversible stuff, and reports.

**Decides + executes (self-governable — no confirm needed):** anything passing all six charter gates —
reversible, evidence-decidable, in-doctrine, blast-radius ≤ MEDIUM, not outward-facing, not contended.
Concretely: reading/indexing internal state, drafting prompts and content, dispatching reversible
DISARMED-scoped fleet work, running trading analysis/signal-audit (not execution), spawning and steering
already-approved worker sessions, routine file edits inside the repo's own scope.

**Proposes + holds (owner-gated — produces a finished ruling, waits for one token):** arming any gate,
large-scale process fan-out beyond an approved dry-run, placing/sizing/executing a live trade, anything
outward-facing (send/post/publish/PR), downloads/installs, deleting data outside session scratch, anything
touching production or shared-external state. Full enumeration: S1-yuri-confirm-gate-DRAFT.json
`confirm_gate.always_confirm_before`.

**Confirm-gate threshold in one sentence:** *if it's reversible, locally evidence-decidable, and stays
inside Yuri's own machine and blast radius, she just does it and tells Marcel after — everything else gets
a finished ruling and a one-token wait, never a bare question.*

---

## 3. The Daily Loop (day-one usage ritual)

This is the loop H2 already named as the "success metric" and S1 already scripted (§2, §4) — stated here
as the literal sequence, kept deliberately small:

1. **Boot.** `yuri` (alias, LIVE today — H3 §2) → GLM-5.2 brain up at `:8014`, voice loop attached.
2. **Wake / greeting.** Canonical line (S1 §2): *"Good morning Marcel, shall we continue from where we
   left off or do you have something new for us to do?"*
3. **Absence report.** What happened since last session — commits, fleet runs, memory writes, anything
   flagged (H2 Tier-2 item #4, `getAbsenceReport()`). Today this is PARTIAL; see §4 below for the minimal
   build.
4. **Co-think.** Marcel talks through a problem out loud or in text; Yuri asks clarifying questions,
   decodes the brain-dump (SOUL.md decode-first discipline), and converges on what actually needs to
   happen. No mode switch required — this is just the conversation, not a special "co-Q&A mode" (cut —
   see §5).
5. **Draft.** For anything that becomes a task for a parallel lane, Yuri stages the prompt
   (`conductor_draft`, LIVE — H1 §5) and shows Marcel the exact text before it goes anywhere.
6. **Confirm.** Marcel approves (or edits) the draft. Self-governable dispatch needs no confirm at all —
   only staged sends to a worker session, or anything crossing the six-gate line, pause here.
7. **Dispatch.** `conductor_send` fires the approved prompt into the target substrate (H5 decision table:
   ollama-flash for breadth, GLM for build, MURE for role-specialized multi-step, native Agent for
   anything that will finalize/commit). Yuri can watch multiple lanes via `conductor_peek`.
8. **Overnight / long-running.** Self-governable or already-approved work keeps running unattended; Yuri
   reports progress at natural checkpoints (not silence, not spam — S1 §4's "progress notes" pattern), and
   the next morning's absence report picks up everything that landed.

This loop is already ~75% live per H1's own readiness number. The gap is not capability, it's a handful of
connective pieces named in §4.

---

## 4. Solid-but-Minimal Setup (ordered, smallest first)

Each item below is graded **LIVE** (already true — cite H1/H3), **BUILD NOW** (do this to make the role
real), or **DEFER** (real, but not blocking — see the Cut List in §5 for why).

### Already LIVE (verified, H1/H3 — nothing to do)
- Voice + text brain, GLM-5.2, tool-calling, 18 tools (bash, file ops, AppleScript/GUI, app control,
  memory, dispatch, xref) — H1 §2, §11 summary table.
- Episodic memory (SQLite+FTS5), recall-on-trigger, energy-weighted writes — H1 §2 Memory, H4 (schema
  already specified in full).
- Session conductor (`conductor_list/create/draft/send/peek`) — H1 §5.
- Launcher (`yuri` alias) — H3 §2, works today, zero additional effort.
- Confirm-gate discipline already inline in the brain's system prompt (routine vs CRITICAL) — H1 §2 Safety
  floor. S1/S1-json formalize it; the *behavior* already exists, only the externalized config doesn't.

### BUILD NOW (in order — each is the minimal version, not the gold-plated one)

1. **Externalize persona + confirm-gate config.** Move the already-correct S1 draft
   (`S1-yuri-persona-DRAFT.md` + `S1-yuri-confirm-gate-DRAFT.json`) from package-lane draft to the file the
   brain actually loads at startup, replacing the inline hardcoded strings in `yuri-z-brain.py`. Minimal
   version: one JSON read at boot, injected into system prompt — no hot-reload, no validation UI, no schema
   versioning beyond what S1 already has. (H2 Tier-1 #1 — this unblocks everything else because config
   changes stop requiring a code edit.)
2. **Absence report.** A `getAbsenceReport()` that queries: git log since last session timestamp, last
   fleet-job results dir, last N memory writes, any flagged HOLD still pending. Minimal version: one
   function, plain-text output, called once at boot — no dashboards, no push notifications, no persistent
   "unread" state machine. (H2 Tier-2 #4.)
3. **Confirm-gate operational wiring.** The six-gate test already exists as doctrine (Self-Governance
   Charter) and as a drafted JSON (S1). Minimal version: the brain's tool-dispatch layer checks the
   `always_confirm_before` list from the now-externalized config before executing conductor_send, trade
   execution, downloads, or deletions outside session scratch — a lookup + branch, not a new inference
   engine. (H2 Tier-1/3 items #3, #9 collapse into this one build once config is externalized.)
4. **PII/secrets routing filter.** Before any prompt leaves the machine to a cloud provider (Anthropic,
   z.ai), strip or mask obvious protected-path content and flagged secrets patterns (reuse the existing
   `_DESTRUCTIVE`/protected-path regex machinery already in `yuri-z-brain.py` — H1 §2 Safety floor — don't
   build a second detector). Minimal version: a deny-pattern filter on the outbound payload, not a full PII
   NER pipeline. (H2 Tier-1 #2 — real trust gap, cheap fix because the pattern list already exists for the
   bash/file gates.)
5. **`read_doc` tool (PDF/Word/Excel text).** `pdftotext` (poppler) + `libreoffice --headless` CLI wrapper,
   one new tool entry. Minimal version: text-out only, no layout/table fidelity, no Mineru fallback yet
   (H3 §3 — ship the 2-hour version, not the accurate-but-costly one).
6. **Provider usage pacing note.** `usage_status` tool already exists (H1 §2) — the only addition is a
   one-line pacing hint ("used X% of weekly quota, Y days left") surfaced in the absence report, not a new
   metering subsystem. (H2 Tier-1 #3, minimal-scoped.)

Everything in this BUILD NOW list is small, additive, and testable in isolation — none require touching
the voice pipeline, the dispatch substrates, or the memory schema (H4's schema is already ship-ready as
specified; just wire the tier field into `remember()`).

### DEFER (real, tracked, not blocking — see Cut List for the reasoning)
- Wakeword ("Hey Yuri") — hotkey/alias is sufficient MVP (H2, H3 §2).
- Vision/OmniParser fallback — AX-tree text control covers today's real workload (H1 §4, H2 trap table).
- Full MURE 20-role orchestration wiring — start with single-lane dispatch, add roles per evidence of
  actual need (H2 trap table, H5 already supports this incrementally).
- Menubar status app / SwiftBar — nice, not load-bearing (H3 §2).
- launchd always-on background supervisor — explicitly OWNER-GATED per Self-Governance Charter (arming is
  never self-governable); revisit once the daily loop above has run reliably for real days, not before.

---

## 5. The Cut List — do NOT build yet

This section is as load-bearing as the build list. Every trap below is a real temptation with Yuri's
current shape (broad tool access + multiple fleet substrates already live make it *easy* to over-invest).

- **Wiring Yuri into every subsystem before the core loop is proven.** Yuri already touches fleet, memory,
  dispatch, and macOS control. The temptation is to also wire trading auto-execution hints, MURE full
  20-role casting, and cross-lane telemetry into her boot sequence "while we're in there." Don't. Prove the
  8-step loop in §3 works cleanly for real days first; additional surface area is cheap to add later and
  expensive to unwind if it's wrong.
- **Autonomy before trust.** The Self-Governance Charter's six-gate test is deliberately conservative.
  Resist any urge to widen "self-governable" scope (e.g., letting Yuri auto-arm a dry-run-approved fan-out,
  or treat "Marcel usually approves this" as pre-approval). Trust is earned by the ruling-then-hold pattern
  actually working, not assumed because Yuri is capable.
- **Elaborate memory/orchestration for its own sake.** H4 already specified — and this doc endorses — the
  simplest possible three-tier schema (PERMANENT/CONVERSATION/TRANSIENT), no decay curve, no embeddings, no
  cross-session semantic graph. Do not add any of H4's explicitly-deferred items (power-law decay,
  automatic preference learning, homeostatic renormalization, global semantic graph) until real usage
  shows FTS5 + manual tiering is insufficient. Same logic applies to dispatch: H5's four substrates already
  cover every task shape; do not build a fifth "Yuri-native" orchestration layer.
- **Guest mode.** S1 §3 already flags this correctly: not built, not needed, build only on an actual
  second-audience event (a collaborator, a demo). Building a diplomatic-register guest surface now is
  solving a problem that doesn't exist yet.
- **Vision before AX suffices.** OmniParser fallback stays STUB. AX-tree reading covers native macOS apps;
  only arm vision when a real workflow hits an Electron/canvas wall that text control can't solve — and
  even then, scope it to that one app, not a general vision-first redesign.
- **Wakeword before hotkey proves insufficient.** Porcupine/keyword-spotting adds latency and a dependency
  for a problem the existing alias + VAD loop already solves well enough for daily use.
- **Perfect confirm-gate matrix.** S1's six-gate test plus the four highest-stakes classes is the gate.
  Do not expand it into a 20-rule decision tree before running it against real decisions and seeing where
  it's actually ambiguous.
- **Co-Q&A "mode" as a separate flag.** H2 floated a dedicated co-questionnaire mode; folded into §3 step 4
  above instead — Yuri's normal decode-first conversational behavior already covers this. A mode toggle
  is unnecessary state to track.
- **Launchd/always-on daemon before the interactive loop is trusted.** Keeps arming discipline intact
  (Self-Governance Charter: ARMING is always owner-gated) and avoids debugging a background process before
  the foreground one is solid.

**Rule of thumb for anything not explicitly on the BUILD NOW list:** if it doesn't unblock the 8-step daily
loop in §3, it waits.

---

## 6. Phased Roadmap

### Phase 1 — Daily-Driver Core
**Scope:** the six BUILD NOW items in §4, nothing else.
**Definition of done:** Marcel boots Yuri (`yuri`), gets a real absence report (not a stub), talks through
one real task, gets a staged draft, confirms, watches it dispatch and complete, and the whole exchange
required zero code edits to Yuri's behavior (persona/gate lives in config). PII never left the machine
unmasked. One PDF got read via `read_doc` without leaving the conversation.

### Phase 2 — Conductor + Memory
**Scope:** deepen what's already live rather than add new surface — multi-lane dispatch used routinely
(not just single-lane), memory tiering actually exercised across real sessions (PERMANENT facts surviving
restarts, CONVERSATION facts aging out gracefully), progress-note cadence tuned from real overnight/
long-running jobs.
**Definition of done:** Marcel runs a session where Yuri dispatches to 2+ different substrates (e.g., GLM
build + ollama-flash research) in the same working session, watches both via `conductor_peek`, and the
next morning's absence report correctly surfaces both outcomes without Marcel having to ask.

### Phase 3 — Autonomy + Overnight
**Scope:** overnight unattended runs on already-approved/self-governable work become routine, not a special
event; confirm-gate ruling quality gets tested against real edge cases and hardened where it was actually
ambiguous (not hypothetically); launchd always-on supervisor considered (owner-gated arming decision, not a
default).
**Definition of done:** Marcel leaves an approved overnight job running, wakes up, and the absence report +
carryover means he never has to reconstruct what happened — and at least one real HOLD-and-ruling exchange
happened where Yuri correctly stopped instead of guessing.

---

## 7. North Star

**Yuri is solid-but-minimal when Marcel can run the full daily loop in §3 for a real week without hitting a
capability gap that forces a workaround, and without Yuri having grown a single feature that loop didn't
actually need.**

---

## Session Notes

**Lanes read (not duplicated, cited by reference):** H1-capability-inventory.md, H2-gap-analysis.md,
H3-tool-activation-map.md, H4-memory-policy.md, H5-dispatch-reference.md, S1-yuri-persona-DRAFT.md,
S1-yuri-confirm-gate-DRAFT.json — all in this same lane folder, 2026-07-05.

**Method:** No new research dispatched — this is a synthesis-only lane over already-converged evidence
(two independent questionnaires + a live-codebase audit + a gap analysis already agreeing on the same
architecture). Cross-checked S1's confirm-gate framing against `_SYSTEM/yuri-origin.md` Self-Governance
Charter directly to confirm no restatement drift.

**Confidence:** HIGH on role statement, operating contract, and cut list (directly inherited from
canonical charter + converged sibling drafts). MEDIUM on exact Phase 2/3 timing (depends on real usage
data H2 itself flags as still needed).

**Verdict:** `S2_ROLE_AND_SETUP_SPEC_X_PASS_COMMITTED` (draft synthesis complete; promotion to canonical
`_SYSTEM/SELF/` is a separate, owner-gated step, same as S1).
