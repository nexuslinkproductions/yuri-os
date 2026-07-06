# The Yuri Runtime — Design Doc

Owner quote (goal): "all we have right now is a solid folder structure as yuri with a bunch of scripts and
mechanisms but i want to turn her into a program or something that actually runs and functions." Crown
scenario (Q18): wake-up brief → discuss → Yuri drafts prompts → owner confirms → Yuri dispatches
Claude/Codex/terminal sessions, scaled to several in parallel → overnight reliability → "a digital co-worker."

Constraints honored: design-only, no code; capability-first — every component is a REUSE of an existing organ
(exact path cited) unless marked **NEW**; Mac M2 Pro 16GB → cloud-only (Anthropic, z.ai GLM, ollama-cloud).
**Section list:** 1. What "a program" means here · 2. Architecture diagram · 3. Session conductor · 4. Morning
ritual · 5. Overnight runner · 6. Usage governor · 7. Conversational co-thinking · 8. Phased build P0→P3 ·
9. Jeffrey symmetry (René/Windows port)

---

## 1. What "a program" means here

Today YURI is a **body without a spine**: ~250+ scripts under `_SYSTEM/Scripts/`, a voice stack, launchd beats,
a mure org — all independently invocable, none of them a standing *process* the owner experiences as "Yuri is
awake." The gap is not missing mechanisms (there are more organs already built than the task brief assumed —
see §2) but missing **orchestration continuity**: nothing keeps a session identity alive across a boot,
watches a task queue unattended, or paces provider usage across a week.

**The Yuri Runtime = one supervisor process**, launchd-managed (`RunAtLoad`+`KeepAlive`, the exact pattern
already proven by `_SYSTEM/Scripts/yuri-session-launchd.mjs`, label `com.yuri-os-musubi.yuri-session-runtime`),
owning five responsibilities as sub-loops, not five new programs: voice front, session conductor, overnight
runner, usage governor, morning brief. The reuse map is §2's diagram — not repeated here.

The folder stays the **body**; the runtime is the **always-on nervous system** that keeps a persistent
identity, watches queues, paces spend, and greets the owner — the distinction `_SYSTEM/persona.md` already
draws between brain (stable identity) and memory (episodic organ), except today NOTHING keeps either alive
*between turns*: voice brain and CLI sessions are each stateless-per-invocation once the terminal closes.

**What is genuinely new** (confirmed via `xref-query.mjs` + reading `usage-governor.mjs`, `task-queue.mjs`,
`yuri-z-brain.py` in full): a **session registry** tracking live Claude/Codex/terminal tmux panes (today:
fire-and-forget into one hardcoded pane, `yuri-worker:0.0`); a **morning-brief compositor** joining existing
sources into one artifact; a **wake trigger/hotkey** (`bot.py` needs manual start today); **cost meters for
z.ai and ollama-cloud** (`usage-governor.mjs` is Anthropic-only by construction — §6).

---

## 2. Architecture Diagram

```
              com.yuri-os-musubi.yuri-runtime (NEW launchd, RunAtLoad+KeepAlive,
                        pattern = yuri-session-launchd.mjs)
                                    │ supervises (spawn + restart)
      ┌─────────────┬──────────────┼──────────────┬───────────────┐
      ▼             ▼              ▼              ▼               ▼
 VOICE FRONT   SESSION         OVERNIGHT       USAGE          MORNING BRIEF
 (existing)    CONDUCTOR       RUNNER          GOVERNOR       COMPOSITOR (NEW)
      │        (NEW, extends   (extends        (extends       (NEW, pure join
      ▼        dispatch)       task-queue.mjs) usage-governor  of read-only
 jarvis_memory/     │                │         .mjs)          --json sources)
 jarvis_xref         ▼                ▼               │               │
 (episodic +   yuri-worker.sh/  FIFO+mutex+     paceSignal per   spoken via
 canonical)    send-keys        staleness       pool; NEW: z.ai/ bot.py Kokoro
               (yuri-z-brain    (NEW: retry+    ollama meters    or written
               .py ~444-460)    contract-verify)                 brief file
```
Box labels name the exact file each component reuses; §3-§6 below cite line numbers and exports for each.
Everything left of "(NEW)" is a wiring/extension on a proven mechanism, not a fresh build — the biggest
finding of this pass: **YURI already has a task queue with a mutex+staleness check, and an Anthropic usage
governor with pacing math** — §5/§6 are 60-70% already shipped, invisible only because nothing joins them.

---

## 3. Session Conductor

**Goal (Q18):** manage several parallel Claude/Codex/terminal sessions; Yuri drafts prompts during
discussion; owner confirms (voice); dispatch; watch output; report status ("session 2 finished the
refactor").

**Existing dispatch mode:** `_SYSTEM/Scripts/voice/yuri-z-brain.py` already does single-target dispatch. With
`YURI_DISPATCH=1` the brain extracts `DISPATCH:` lines (`_extract_dispatch_lines`, ~line 444) and injects each
via `tmux send-keys -t WORKER_TARGET -l <task>` + `Enter` (~line 459-460, deterministic, no focus war).
`WORKER_TARGET` defaults to the one hardcoded pane `yuri-worker:0.0` via `yuri-worker.sh` (creates/reattaches
a tmux session running `ai claude-zai`); `yuri-spawn-worker.sh` is the sibling launcher for more sessions.

**Gap:** one worker target, no registry, no per-session task label, no output watcher, no confirm-then-
dispatch two-step (today dispatch fires the instant `DISPATCH:` lines appear — no "wait for owner's yes").

**Design — extend, don't replace:**

1. **Session registry** (NEW, small state file `_SYSTEM/state/session-registry.json`): array of `{id,
   kind:"claude"|"codex"|"terminal", tmuxTarget, task, dispatchedAt, status:"drafting"|"held"|"running"|
   "done"|"failed", lastOutputTail}`. `tmuxTarget` values generalize `yuri-worker.sh`'s naming
   (`yuri-worker-1`, `yuri-worker-2`, …) — same tmux pattern, parameterized session name.
2. **Draft-then-hold:** during discussion (§7), Yuri composes the prompt and tags it `status:"drafting"` —
   NOT yet sent. Reuses the exact `_save_pending`/`_AFFIRM` confirm-gate already in `yuri-z-brain.py` (~line
   605-768, the `spawn_worker` pending-action HOLD pattern), extended to also hold a drafted dispatch prompt.
3. **Confirm → dispatch:** voice affirmation (`_AFFIRM` regex) flips `status:"held"→"running"` and fires the
   existing `tmux send-keys` at the session's `tmuxTarget`, using `worker-fidelity-pack.mjs` to build the
   canonical context preamble (identity, protected paths, evidence grammar, RESULT_LABEL contract — the same
   shared builder `glm-fleet`/`llm-lane`/`company.mjs` already call).
4. **Output watching** (NEW, small): a poll loop reads each pane via `tmux capture-pane -p` (read-only),
   diffing against `lastOutputTail`; idle-N-seconds + shell-prompt OR an explicit RESULT_LABEL line (per
   `Lane Result Grammar` in `yuri-origin.md`) flips `status→"done"`.
5. **Status reporting:** the brain's next turn (or §4) reads the registry and speaks deltas — "session 2
   finished the refactor" is `registry.filter(s => s.status==='done' && !s.reported)`.

**Effort:** registry + generalized launch = S. Draft-then-hold = S. Output watcher = M. Dispatch
generalization = S.

---

## 4. Morning Ritual

**Goal (Q18):** on wake, absence report (what happened while I was gone) + idea surfacing + next-move
suggestions, leading into a discussion.

| Element | Existing artifact that feeds it |
|---|---|
| Git activity since last session | `git log --since=<lastSessionTs>` (`lastSessionTs` from registry, NEW small state) |
| Lane / overnight task outcomes | `_SYSTEM/Scripts/task-queue.mjs status` (queue summary: pending/running/done/failed/stale) |
| System health verdict | `_SYSTEM/Scripts/yuri-doctor.mjs --json` (sectioned findings, exit 0/1, CRITICAL flag) |
| Staleness state | `_SYSTEM/Scripts/yuri-freshness.mjs --json` (per-surface fresh/stale/unknown) |
| Idea surfacing | `.claude/yuri-sentinel/learning/dream-queue.jsonl` via `yuri-dream-processor.mjs` (manual-fallback; live nightly drain is a native Claude cron SONNET agent per the script's header) + `neuron-loop.mjs`/`neuron-loop-trend.mjs` |
| Durable truth deltas | canonical memory read (`loadCanonical`/`readView`/`recallCanonical`, `memory-canonical-store.mjs`) diffed vs last snapshot |
| Next-move suggestion | the GLM-5-Turbo brain (`yuri-z-brain.py`) synthesizes from the joined pack as system-prompt injection (parallel to `jarvis_xref.py`'s startup injection) — not a new mechanism |

**Design:** a **morning-brief compositor** (NEW, pure aggregation — no new data sources, only a join) runs once
per wake-cycle: calls the above CLIs with `--json`, assembles one brief object, hands it to the voice brain as
an injected system-prompt block (same pattern `jarvis_xref.py` uses), and the brain opens the conversation
with it — spoken via Kokoro TTS (`bot.py`) or printed if voice isn't active yet (P0, §8).

**Effort:** S — the highest-leverage/lowest-effort win in the whole design; every input source already exists
and already emits `--json`.

---

## 5. Overnight Runner

**Goal:** reliable unattended execution of tasks handed to Yuri before the owner leaves, so work is DONE, not
just attempted, by morning.

**Already built** (`_SYSTEM/Scripts/task-queue.mjs`, read in full): FIFO-within-priority queue
(`enqueue`/`list`/`run-next`/`drain`/`clear-done`/`status` CLI); Invariant 1 single-task mutex (`currentTask`,
no double-execution); Invariant 2 staleness check (verifies git HEAD vs recorded `stateHash`, mismatches mark
STALE and skip rather than run against drifted state — exactly the correctness guard "reliability" needs,
already solved); `TASK_TIMEOUT_MS = 10*60*1000` per-task ceiling routing to `llm-compat.sh` or
`codex-offload-runner.mjs`; a `com.yuri-os-musubi.task-queue-runner.plist` launchd beat already exists
(confirmed in `~/Library/LaunchAgents/`).

**What "reliability" additionally requires (honest gaps):**
1. **Retry with backoff** — a failed task today is marked `failed`/`stale`, queue advances, no auto-retry.
   NEW: bounded exponential backoff (e.g. 2 retries, 5min/20min), config-gated against infinite looping.
2. **Watchdog** — `KeepAlive` restarts the *process*; nothing verifies the *queue* is progressing between
   tasks. NEW: fold a queue-runner heartbeat into `yuri-doctor.mjs`'s existing beat-window detector.
3. **Result verification** — `contract-conformance.mjs`/`contract-conformance-trace.mjs` already verify an
   artifact against an expected contract; wire as the runner's post-task check before marking `done` (today
   exit-code-only — a known anti-pattern per `.claude/memory/feedback-background-exit-code-masking.md`).
4. **Failure escalation** — trivial once (2)+(3) exist: the compositor (§4) already reads `task-queue.mjs
   status`; failed/stale entries surface there for free.
5. **Cost-aware lane choice** — default overnight tasks to GLM/ollama-cloud (cheaper, keeps Anthropic weekly
   headroom for daytime work) via the queue's existing `--lane` flag, not new code.

**Effort:** retry/backoff = S. Watchdog fold-in = S. contract-conformance wiring = M (needs a per-task-type
contract shape). Escalation = trivial.

---

## 6. Usage Governor

**Goal:** per-provider meters (Anthropic weekly, z.ai plan, ollama Pro), no hard cap, pace so weekly quota is
consumed by period end.

**Already built, in full, for the Anthropic side** — `_SYSTEM/Scripts/usage-governor.mjs`: reads
`~/.claude/projects/**/*.jsonl` READ-ONLY; pools `main` (every Anthropic model except Sonnet, shared weekly+5h
limit per MAX 20× plan shape), `sonnet` (its OWN separate weekly pool, matches
`.claude/memory/feedback-sonnet-separate-weekly-quota.md`), `other` (non-Anthropic, not quota);
`weightedTokens()` counts input+output+cacheCreate 1:1, cacheRead discounted 0.1× (matches Anthropic's actual
pricing shape); `weeklyUsage()` returns BOTH windows (rolling 7-day AND 5-hour) per pool; `paceSignal` gives
`<70%→up`, `70-90%→hold`, `>90%→down` — this IS the "consume by period end" algorithm the task asked for,
already implemented, just needs a calibrated `_SYSTEM/config/usage-budget.json` (defaults `null` = hold);
CLI: `node _SYSTEM/Scripts/usage-governor.mjs [--json]`.

**Honest gap:** Anthropic exposes no API for "% of MAX plan consumed this week" — `usage-governor.mjs`
approximates from LOCAL transcript token counts against a MANUALLY CALIBRATED ceiling, not a ground-truth read
of Anthropic's billing. Good proxy, but the owner must calibrate once and drift (e.g. a plan change) is silent
until recalibrated.

**z.ai (GLM) and ollama-cloud have NO equivalent meter today** (confirmed by search — `glm-fleet.mjs`/
`ollama-fleet.mjs` dispatch but don't locally count consumption). z.ai runs through
`_SYSTEM/Scripts/llm-compat.sh`/`zai-tmux-fleet.mjs`; GLM responses are OpenAI/Anthropic-shaped and DO carry
`usage` blocks, so a sibling scanner over z.ai lane logs (if `llm-lane.mjs` persists request/response pairs —
needs a one-time check) could extend `usage-governor.mjs`'s `POOLS`/`aggregateRows` shape rather than reinvent
it; if no local log exists this needs z.ai's own dashboard/API — **owner-input required**, not a pure
engineering gap. ollama-cloud is billed per-plan (Pro), not obviously per-token client-side, and may lack
usage metadata entirely — the weakest link of the three, needing either an unverified ollama account API
(would need online verification per `research_pipeline.md`) or a manual/periodic owner check-in.

**Pacing design (extending the PROVEN `paceSignal` shape to all three lanes):** target spend-rate =
`remaining_budget / hours_left_in_period`; compare actual recent-window rate against target; emit the same
`up|hold|down` advisory — **advisory only, feeds the session conductor's default lane choice** (§3, §5), never
a hard block, matching "no hard cap" and the Charter's "monetary cost is an owner-configurable blast factor."

**Effort:** Anthropic side = **already done**, calibration only (S). z.ai meter = M (verify log availability
first). ollama-cloud meter = L or **not fully buildable** without owner-supplied external API access.

---

## 7. Conversational Co-Thinking

**Goal:** the discuss-then-act loop — e.g. co-answering a questionnaire: Yuri asks, listens, drafts, reads
back, refines, writes the file.

**What exists today:** `yuri-z-brain.py`'s tool loop supports read/write/edit + a spoken confirm-gate for
CRITICAL actions (`_AFFIRM` regex, `_save_pending`/pending-action HOLD, ~line 605-768). Multi-turn state
persists via `jarvis_memory.py` (episodic SQLite+FTS5) across turns AND restarts — covers "listens, drafts,
refines" for a SINGLE in-flight action.

**The known gap (named in the task brief, confirmed true by reading the brain in full):** no task-stack /
resume-after-barge-in. `bot.py`'s barge-in cancels the in-flight response + speech, but if the owner
interrupts mid-draft to correct one field of a questionnaire, there is no "3 of 7 questions in, resume from
there" state — today it relies entirely on `jarvis_memory` FTS5 recall, which is recall, not a structured
resume point.

**Design (the one net-new mechanism this section needs):** a **task-stack** alongside the existing
pending-action state (`_save_pending`'s JSON file, extended not replaced):
`{taskId, kind:"questionnaire"|"draft"|"discussion", steps:[...], currentStepIdx, partialAnswers:{...}}`. On
barge-in, the brain peeks the stack and re-opens at `currentStepIdx` instead of restarting — generalizing the
same pending-action mechanism from depth-1 (one action) to depth-N (a stack of in-progress dialogues).

**Effort:** M — persistence and confirm-gate plumbing exist; new work is the stack shape + barge-in peek.

---

## 8. Phased Build P0 → P3

Self-governability per the Self-Governance Charter (`yuri-origin.md`): BUILD-behind-a-DISARMED-flag is
self-governable; ARMING (new launchd plist, live wakeword hook, live dispatch-without-confirm) is
owner-gated.

### P0 — Session conductor + morning-brief CLI (voice optional; terminal-run, no launchd yet)
| Component | Effort | Governability |
|---|---|---|
| Session registry (state file + schema) | S | self-governable |
| Generalize `yuri-worker.sh` to N named sessions | S | self-governable |
| Draft-then-hold dispatch (extend confirm-gate) | S | self-governable — still text-confirmed, no new arm |
| Output watcher (tmux capture-pane poll) | M | self-governable — read-only polling |
| Morning-brief compositor (CLI, prints to terminal) | S | self-governable — aggregation only |

### P1 — Wakeword/hotkey + ritual by voice
| Component | Effort | Governability |
|---|---|---|
| Global hotkey or wake-trigger for `bot.py` | M | **owner-gated** — new always-listening surface |
| Wire compositor into voice brain's session-open injection | S | self-governable; **owner-gated** to enable at boot |
| New launchd plist supervising bot.py + brain | S | **owner-gated** — arming is always owner-gated regardless of blast radius |

### P2 — Overnight runner + usage governor
| Component | Effort | Governability |
|---|---|---|
| Retry/backoff on task-queue.mjs | S | self-governable — bounded, reversible |
| Watchdog fold into yuri-doctor.mjs | S | self-governable |
| contract-conformance wiring into task completion | M | **owner-gated** — lets overnight tasks mutate repo unattended |
| Calibrate `usage-budget.json` (Anthropic) | S | self-governable — config fill-in |
| z.ai usage meter (contingent on log availability) | M | self-governable if local data exists; else owner-input required |
| ollama-cloud usage meter | L | likely **owner-input required** — external account API, unverified |

### P3 — Streaming TTS + screen-awareness
| Component | Effort | Governability |
|---|---|---|
| Streaming TTS interleave (Kokoro latency) | M | self-governable |
| Screen-awareness loop (periodic screenshot + context) | L | **owner-gated** — privacy-sensitive per SOUL.md's "access to someone's life" guardrail |
| Task-stack / resume-after-barge-in (§7) | M | self-governable — extends existing pending-action persistence |

---

## 9. Jeffrey Symmetry (René / Windows port)

The **shapes** ship unchanged to René's Windows box: session conductor → app conductor (same registry +
draft-then-hold + confirm + dispatch pattern, tmux swapped for Windows Terminal/ConPTY or subprocess-per-
session); the morning ritual is provider-agnostic aggregation and ports as-is; the overnight runner's
queue/mutex/staleness/retry contract is pure logic, zero macOS dependency. What does NOT port unchanged: the
usage governor's Anthropic pool math matters only if René also runs Claude Code — if his stack is
local-model-only (his hardware differs from Marcel's M2 Pro 16GB cloud-only constraint), the governor shrinks
to "local VRAM/context budget," and the voice front swaps cloud-tier STT/TTS for whatever fits his box.
CONDUCTOR/RITUAL/RUNNER/GOVERNOR shapes are the reusable IP; the model/provider bindings underneath are the
only per-owner part.

---

## Top-5 Design Decisions

1. **This is 60-70% an integration problem, not a build problem.** `task-queue.mjs` (FIFO mutex + staleness
   check) and `usage-governor.mjs` (per-pool pacing, Anthropic side) are already fully built and were
   invisible to the original brief. The runtime's job is SUPERVISING and JOINING these organs, not rebuilding.
2. **The session conductor generalizes an existing single-target mechanism**, not new infrastructure:
   `yuri-z-brain.py`'s `YURI_DISPATCH=1`/`tmux send-keys` path proves the pattern at N=1; P0 adds registry +
   N-target parameterization + an output watcher — new but small.
3. **Draft-then-hold reuses the confirm-gate state machine built for destructive bash**, generalized from one
   pending action to a stack of pending dialogues (§7's task-stack) — one generalization closes both the Q18
   confirm-before-dispatch requirement AND the barge-in/resume gap.
4. **The usage governor's gap is provider asymmetry, not laziness:** Anthropic is solved (real token metadata
   locally readable); z.ai is plausible pending a one-time log-availability check; ollama-cloud is the weakest
   link, may need owner-supplied external API access or manual check-ins — flagged honestly, not papered over.
5. **Every new launchd arm and always-on listening surface is owner-gated by the Self-Governance Charter**
   regardless of code size — arming is categorically gated, building behind a disarmed flag is not. P0 builds
   and tests from a terminal with zero new arms; P1 is where the first owner-gate actually appears.
