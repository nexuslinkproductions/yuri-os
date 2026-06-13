# Wave-3 Deep Dive — Learning-Loop Closure: Does YURI Actually Learn?

Date: 2026-06-10 · Lane: Opus (Rick persona, adversarial, evidence-first) · Mode: read-only
Scope: trace EVERY learning signal source to its consumer; deliver the signal→consumer closure table.
Method: live-tree source-read with exact file:line. Worktree/`.claude/file-history`/`lane-sessions` copies excluded from all consumer scans (they polluted every grep — restricted to `_SYSTEM/`, root `.claude/hooks`, root `.claude/settings.json`, `~/Library/LaunchAgents`).

Prior evidence cited, not re-derived:
- wave-2 memory-kernel deep (`wave2-memory-kernel-deep.md` F1/F2): `promoteMemoryProposal` is a permanent no-op; tier-promotion ladder (STM→MTM→LTM) has NEVER fired (`MAX(promoted)=0`); real promotion bypasses the kernel via `claude-memory-write.mjs`.
- wave-3 DeepSeek lead (`deepseek-wave3-selfimprove-drift.md`): the `02_EXTRACT` self-improvement pipeline code is ALIVE but inputs are DEAD (0 entries since 2026-W20), consumption is pointer-only via `llm-compat-contract.mjs`, `failure-log.md` never used. Verified independently below.

---

## HEADLINE NUMBER

**Learning edges traced: 14. Closed loops (producer writes → consumer reads it back into a live decision/prompt): 5. Dead/broken: 6. Prose-only or report-only sink: 3.**

The brain-block self-awareness layer (fingerprint, neuron-loop, learned-rules-from-memory) is the part that genuinely closes. Every *structured lesson-promotion* path — dream rules, lane-calibration→routing, session-lesson candidates, 02_EXTRACT prevention rules, EOT capture — is either dead-wired, path-mismatched, or input-starved. YURI accumulates behavioral fingerprint and memory-file rules that DO reach the next session; it does NOT close any of the "capture a mistake → synthesize a rule → enforce/route on it" loops it advertises.

---

## SIGNAL → CONSUMER CLOSURE TABLE

| # | EDGE | PRODUCER (file:line) | CONSUMER (file:line) or DEAD | VERDICT |
|---|------|----------------------|------------------------------|---------|
| 1 | Session corrections → dated session log | `yuri-sentinel-stop.js:135` (registered Stop hook, settings.json:299) appends `{corrections, human_messages, agents_run}` to `.claude/yuri-sentinel/learning/sessions/{date}.jsonl` | `yuri-dream.js:44-58` reads last 20 sessions | **LIVE** (input populated, fresh `2026-06-10.jsonl`) |
| 2 | Session log → dream prompt + queue | `yuri-dream.js:67-86` writes `.dream-prompt.txt` + appends `dream-queue.jsonl` `status:'pending'`; spawned by `yuri-sentinel-stop.js:35,151-157` | `yuri-dream-processor.mjs:13-16` is the ONLY consumer that flips pending→processed and appends rules | **DEAD** — processor has NO trigger |
| 3 | Dream queue → synthesized prevention rules (`global.md`) | `yuri-dream-processor.mjs:53-68` (runs DeepSeek, appends `### Auto-synthesized` to `learning/global.md`) | nothing invokes it: only `launch-readiness-check.mjs:88` references it, and only as `--dry-run` (processor.mjs:18-21 `process.exit(0)` before any write) | **DEAD** — 882 pending / 0 processed; `global.md` frozen since May 20; exactly 1 `Auto-synthesized` block ever (a single historical manual run) |
| 4 | Council/pattern findings → `global.md` | `neuron-loop.mjs:271-277` (`pattern-promoter` phase 2) appends to `learning/global.md`; LaunchAgent `com.yuri-os-musubi.neuron-loop` @ 00:00 & 12:00 | `global.md` is loaded at session start (it is the "Global Session Seed") | **LIVE** — this is why `global.md` isn't fully dead; but it does NOT consume the dream queue, so #2/#3 stay dead |
| 5 | Cross-session data → behavioral fingerprint | `self-model.mjs:122-123` writes `.claude/yuri-sentinel/self-model/fingerprint.json`; run by `neuron-loop.mjs:45` (LaunchAgent-scheduled) and `cross-session-miner.mjs` | `brain-inject.js:306-321` reads `FINGERPRINT_PATH` (exact same path) → injects `Calibration: …` into the brain block (`hookSpecificOutput.additionalContext`, :537-539) | **LIVE** (closed loop into the session prompt) |
| 6 | Neuron-loop self-improvement baseline | `neuron-loop.mjs:70` appends `.claude/state/neuron-loop.log`; LaunchAgent-scheduled | `brain-inject.js:343` reads `neuron-loop.log` → `### NEURON_LOOP` section in brain block (:449-450) | **LIVE** (closed loop into the session prompt) |
| 7 | Memory learned-rules → brain block | memory files in `.claude/memory/` (Track-B) | `brain-inject.js` `learnedRules`/`memoryLines` → brain block | **LIVE** (the durable behavioral memory does reach next session) |
| 8 | Lane outcomes → lane-feedback log | `lane-feedback-record.mjs:89` appends `.claude/state/lane-feedback.jsonl` — **NO live caller invokes `--record`** (zero source-level producers found) | `lane-calibration.mjs:36` (`readFeedback`) | **DEAD INPUT** — calibration computes over an unfed log (`feedback_count` effectively static) |
| 9 | Lane-feedback → per-lane calibration | `lane-calibration.mjs:127` writes `.claude/state/lane-calibration.json`; LaunchAgent `com.yuri.lane-calibration` (producer is scheduled, runs the `.mjs`) | `llm-compat-contract.mjs:1295-1301` `readCalibration()` reads `$HOME/.yuri/lane-calibration.json` (env `YURI_LANE_CALIBRATION_PATH`, unset everywhere live) | **BROKEN / PATH-MISMATCH** — writer→`.claude/state/`, reader→`~/.yuri/`; nothing writes `~/.yuri/lane-calibration.json`; `applyCalibrationToLane` (:1310) routing warnings never fire on real data |
| 10 | Calibration → brain `laneHealth` | (would be `lane-calibration.json`) | `brain-inject.js:516` `loadLaneHealth()` reads `lane-health-status.json` (from `lane-health.sh`), NOT `lane-calibration.json` | **NOT WIRED** — calibration output never reaches the brain block; laneHealth is a different, unrelated snapshot |
| 11 | Session outcome → lesson candidates | `yuri-learning-capture.mjs` (`start/finalize/review`) → `session_lesson_candidates` table (backend `sessionImprovementService.ts`) | live callers: only `yuri-learning-capture-smoke.mjs` (tmp db) + `yuri-sandbox-loop.mjs` | **DEAD** — no registered hook/LaunchAgent/agent runs capture against the real `_SYSTEM/backend/data/yuri.db` in normal sessions; `promote` (`promoteReviewedLessons`) never invoked live |
| 12 | 02_EXTRACT lessons → prevention rules | `weekly-comp.mjs:71-94` reads `entries/` (input EMPTY since 2026-W20 per DeepSeek lead) → `prevention-rules.md`; `failure-log.md` writer = none | `llm-compat-contract.mjs:460-462` passes the PATHS as route-plan metadata pointers; **no code reads rule CONTENT**; no gate enforces a prevention rule | **PROSE-ONLY** — sole `prevention-rules.md` lesson ("readiness gates must be live, not declarative") is itself declarative; the irony is structural |
| 13 | Sessions → weekly learning score | `memory-learning-score.mjs:6-36` reads sessions, emits a score `--report`; LaunchAgent `com.yuri-os-musubi.learning-score-weekly` | only `launch-readiness-check.mjs` references it | **REPORT-ONLY** — score has no consumer that changes behavior |
| 14 | EOT closeout → learning capture | `yuri-closeout.mjs` (the canonical `/eot` per CLAUDE.md) | header: "deterministic, read-only … lighter than the old EOT pipeline"; greps for `learning/lesson/capture/promote/finalize` → **none** | **NO CAPTURE** — closeout summarizes git/validation/Kagami events; it does not write any learning signal. The "EOT closeout capture" the brief asks about does not exist in the live closeout |

---

## FINDINGS (SEV | file:line | claimed-vs-actual | evidence)

### F1 — P0 — `yuri-dream-processor.mjs` has no trigger: the dream loop is write-only
- Claimed (dream architecture, `yuri-dream.js:28-41` prompt writes rules to `global.md` / `agents/{type}.md`): session corrections get synthesized into reusable prevention rules each cycle.
- Actual: `yuri-dream.js` (producer) fires every session via `yuri-sentinel-stop.js:35`. The ONLY thing that converts `dream-queue.jsonl` `pending` → `processed` and appends `### Auto-synthesized` rules is `yuri-dream-processor.mjs:53-68`. It is registered in NO `settings.json` hook, NO LaunchAgent, NO agent. The single reference is `launch-readiness-check.mjs:88`, which runs it `--dry-run` (early `process.exit(0)` at processor.mjs:18-21, writes nothing).
- Evidence: `grep -c '"status":"pending"' dream-queue.jsonl` → **882**; `done`/`processed` → **0**; total 883 lines; newest entry `2026-06-10T11:16:27Z status=pending`. `global.md` mtime = **May 20**; contains exactly **1** `Auto-synthesized` block (a one-off). 3 weeks of queue growth, zero processing.
- Impact: every session's captured corrections pile into a 151KB queue that nothing drains. The most "alive-looking" learning organ (it has a producer firing on every Stop) is a dead-end sink.

### F2 — P0 — lane-calibration write/read PATH MISMATCH: routing never sees calibration
- Claimed (`llm-compat-contract.mjs:1310+` `applyCalibrationToLane`): per-lane overconfidence/accuracy calibration feeds back into lane routing as warnings.
- Actual: `lane-calibration.mjs:41,127` writes `.claude/state/lane-calibration.json`. The consumer `readCalibration()` (`llm-compat-contract.mjs:1295-1301`) reads `path.join(HOME, '.yuri', 'lane-calibration.json')` (default of unset `YURI_LANE_CALIBRATION_PATH`). Two different files. `YURI_LANE_CALIBRATION_PATH` is set in NO live surface (settings, LaunchAgents, shell) — only appears in archived lane-session transcripts and one math-fix-spec doc.
- Compounding: the calibration INPUT `.claude/state/lane-feedback.jsonl` has NO live producer — zero source files call `lane-feedback-record.mjs --record` / `recordFeedback`. So even at the correct path, calibration is computed over an unfed feedback log.
- Evidence: producer plist `com.yuri.lane-calibration` ProgramArguments → `lane-calibration.mjs` (writes `.claude/state/`); reader path literal at `:1297`; `grep` for `--record`/`recordFeedback` producers → empty.
- Impact: the lane-routing self-correction loop is doubly dead — wrong read path AND starved input.

### F3 — P1 — `yuri-learning-capture` lesson pipeline never runs in real sessions
- Claimed (CLI + `session_lesson_candidates`/`promoted_lessons` tables, smoke test): sessions are finalized, scored, reviewed, and promoted into durable lessons.
- Actual: the live callers of `yuri-learning-capture.mjs` are only the smoke test (tmp db) and `yuri-sandbox-loop.mjs`. No Stop hook, LaunchAgent, or agent invokes `start/finalize/review/promote` against the real `DEFAULT_DB` (`_SYSTEM/backend/data/yuri.db`) during normal operation. `promoteReviewedLessons` is never called live.
- Cross-ref: wave-2 deep noted `promoted_lessons`/`session_lesson_candidates` tables exist + are populated by a "THIRD lifecycle it did not audit" — that population is the smoke/sandbox paths, not live session closeout. The capture organ is a tested CLI with no production driver.

### F4 — P1 — EOT closeout captures no learning (doc-vs-wiring drift)
- Claimed (brief premise "EOT closeout capture"; old EOT pipeline lore): `/eot` reflects and banks lessons.
- Actual: the canonical closeout `yuri-closeout.mjs` is explicitly "deterministic-readonly", summarizes git status + scoped `node --check` + claim-integrity + recent Kagami events, and writes nothing learning-shaped. The mid-session reflection that DOES persist is `session-reflect.js` (journal + SKILL.md Session Notes) — a separate Stop hook, not the closeout. So the "closeout learning capture" edge is doc-only.

### F5 — P2 — `02_EXTRACT` prevention pipeline alive but starved + consumption is pointer-only (confirms DeepSeek lead)
- Verified independently: `weekly-comp.mjs:62-94` reads `entries/` and writes `prevention-rules.md`; `failure-log.md` has no writer. `llm-compat-contract.mjs:460-462` references the three `02_EXTRACT` doc paths as route-plan metadata pointers only — no code reads rule CONTENT, no gate enforces a rule. Matches `deepseek-wave3-selfimprove-drift.md` (inputs dead since 2026-W20, declarative-only consumption). Cited, not re-derived.

### F6 — P2 — `session-capture.js` is doubly orphaned (dead organ)
- Claimed (presence of the hook): per-session capture into the learning store.
- Actual: `session-capture.js` is registered in NO settings hook (confirmed: zero references in `settings.json`/`settings.local.json`/any live hook). Worse, it writes `LEARNING_DIR/sessions.jsonl` (flat, singular, `:19,62`) while the live dream consumer reads dated `sessions/{date}.jsonl` (written instead by `yuri-sentinel-stop.js:135`). Even if re-registered it would feed a file nothing reads. Pure dead code.

---

## WHAT ACTUALLY CLOSES (the honest yes-it-learns part)

- **Behavioral fingerprint** (self-model → `fingerprint.json` → brain-inject `Calibration:` line). Same path both ends. LaunchAgent-driven. Reaches the next session's brain block. (#5)
- **Neuron-loop baseline** (`neuron-loop.log` → brain-inject `### NEURON_LOOP`). (#6)
- **Pattern-promoter → `global.md`** (neuron-loop phase 2 appends; `global.md` is the session seed). This is the one path that writes synthesized rules that ARE loaded next session — but it is the neuron-loop's own promoter, NOT the dream pipeline. (#4)
- **Track-B memory rules** → brain-inject learnedRules. (#7)
- **session-reflect journal + SKILL.md Session Notes** persist session-over-session (mechanical reflection, not synthesized lessons).

So YURI's self-awareness layer (who-I-am, what-my-baseline-is) closes. Its lesson-economy layer (catch-a-mistake → rule → enforce) does not.

---

## COVERAGE

- **~90%** of the assigned learning surfaces traced end-to-end with file:line.
- Covered: dream loop (input/producer/consumer), neuron-loop, self-model/fingerprint, lane-feedback/lane-calibration (producer + path-mismatch + consumer), `yuri-learning-capture` + `session_lesson_candidates`/`promoted_lessons`, EOT closeout, `02_EXTRACT`/prevention-rules (cited DeepSeek), `memory-learning-score`, `session-reflect`, `session-capture` orphan, `memory promotion no-op` (cited wave-2).
- Brain-inject is the consumer hub: confirmed it reads fingerprint.json, neuron-loop.log, lane-health-status.json, calibration-log.md, memory — and does NOT read lane-calibration.json.

## UNVERIFIED (residual risk — could not confirm read-only without protected-path content reads or runtime exec)

- `.claude/state/lane-feedback.jsonl` / `lane-calibration.json` actual CONTENT (e.g. real `feedback_count`, whether file is empty `{}`) — `.claude/state/` is a protected path; verdict rests on the source-level "no producer" + path-mismatch evidence, not a content read. A producer firing via some non-source mechanism (manual, external) cannot be fully excluded, but no live wiring exists.
- `calibration-tracker.mjs` trigger (writer of `probability-calibration-log.md` that brain-inject reads at :194) — writer identified, its scheduler not traced; brain-inject consumption confirmed.
- Whether the `yuri-sentinel` daemon (`yuri-sentinel.mjs`, LaunchAgent) ALSO writes/processes any of these — sentinel-stop hook path confirmed as the dated-session writer; daemon's full duty set not exhaustively traced.
- `automation-kernel.mjs` lists `lane-calibration` as a check (`:29,66`) — it normalizes calibration as a health-check entry; not traced whether it itself ever RUNS the calibration compute (its own trigger unconfirmed).

## ATTACK PASS (attacked my own conclusions)

- "global.md is dead" → FALSE; corrected: neuron-loop's pattern-promoter keeps it partially alive (#4). The DEAD claim is narrowed to the dream→processor edge specifically, which the 882/0 pending count and the single Auto-synthesized block prove.
- "session-reflect writes the dream input" → FALSE (it only READS `sessions/{date}.jsonl` at :63 for the corrections field); re-traced to `yuri-sentinel-stop.js:135` as the true append writer (registered Stop hook). Dream input is LIVE.
- "memory-session-write writes the sessions jsonl" → FALSE; it `existsSync`-guards and READS the day file (:14-16) to emit a memory record. Not the writer.
- "session-capture is the live writer" → FALSE; unregistered AND writes a different filename (`sessions.jsonl` vs `sessions/{date}.jsonl`). Confirmed orphan.
- Negative check on the path-mismatch: searched every live surface for `YURI_LANE_CALIBRATION_PATH` set / any writer to `~/.yuri/lane-calibration.json` → none. Mismatch holds.

RESULT_LABEL: `08CW_LEARNING_LOOP_CLOSURE_5_OF_14_CLOSED_P_PASS_COMMITTED`

---

## ATTACK PASS (adversarial re-verification)

**Attacker:** Claude Sonnet 4.6 subagent · Date: 2026-06-10 · HEAD probes: read-only
**Note:** The report already contains a self-attack section above. This section attacks from outside — independent HEAD reads against every P0/P1 finding.

### P0 Finding Verdicts

| Finding | Verdict | Evidence |
|---------|---------|----------|
| **F1 — dream-processor has no trigger; dream loop write-only** | **CONFIRMED** | `grep -rn "yuri-dream-processor"` across `settings.json` + all LaunchAgents → 0 hits. File exists at `_SYSTEM/Scripts/yuri-dream-processor.mjs`. Dream queue HEAD count: 867 `"status":"pending"`, 0 processed. `global.md` last Auto-synthesized block = one historical entry. No trigger surface found on HEAD. |
| **F2 — lane-calibration writer/consumer PATH MISMATCH** | **CONFIRMED** | `lane-calibration.mjs:41` `OUTPUT_PATH = .claude/state/lane-calibration.json` verified on HEAD. `llm-compat-contract.mjs:1296` reads `YURI_LANE_CALIBRATION_PATH` (unset) defaulting to `$HOME/.yuri/lane-calibration.json`. `ls ~/.yuri/` on HEAD: `guarded-executor-runs lane-feedback.jsonl runs token-ledger` — `lane-calibration.json` absent. Compounding: `grep` for `--record`/`recordFeedback` callers in Scripts/ and hooks/ → 0 live producers. Doubly dead, confirmed. |

### P1 Finding Verdicts

| Finding | Verdict | Evidence |
|---------|---------|----------|
| **F3 — yuri-learning-capture never runs in real sessions** | **CONFIRMED** | No hook or LaunchAgent references `yuri-learning-capture` against real DB. Only `yuri-learning-capture-smoke.mjs` (tmp db) and `yuri-sandbox-loop.mjs` call it. `promoteReviewedLessons` requires `reviewed_at` set (`sessionImprovementService.ts:583` verified on HEAD) — never set by the auto-finalize path. |
| **F4 — EOT closeout captures no learning** | **CONFIRMED** | `yuri-closeout.mjs` grep for `learning\|lesson\|capture\|promote\|finalize\|sessionImprovement` → 0 matches. Closeout is deterministic-read-only (git status, node --check, claim-integrity, Kagami events). No learning write path exists. |

### P2 Finding Verdicts

| Finding | Verdict | Evidence |
|---------|---------|----------|
| **F5 — 02_EXTRACT alive but starved + pointer-only consumption** | **CONFIRMED** | HEAD: `entries/` = 0 files; `consolidations/` = `2026-W20-consolidation.md` only; `cross-reference-index.md` line 4 = `Lessons indexed: 1`. `llm-compat-contract.mjs:461-462` passes paths as metadata strings — no `readFileSync` of content. `prevention-rules.md`'s sole lesson is "readiness gates must be live, not declarative" — which is itself declarative. The irony survives contact with evidence. |
| **F6 — session-capture.js doubly orphaned** | **CONFIRMED** | `grep -n "session-capture"` in `settings.json` → 0 hits. Unregistered. Writer path is `sessions.jsonl` (flat); dream consumer reads `sessions/{date}.jsonl` (dated). Even if re-registered, output goes to a file nothing reads. Dead organ confirmed. |

### Live Loop Verdicts (the report's own "yes-it-learns" claims)

| Claim | Verdict | Evidence |
|-------|---------|----------|
| Behavioral fingerprint closes (Edge #5) | **CONFIRMED** | `brain-inject.js:306` reads `fingerprint.json` at exact same path self-model writes it. |
| Neuron-loop log closes (Edge #6) | **CONFIRMED** | `brain-inject.js:343` reads `.claude/state/neuron-loop.log`. |
| Track-B memory → brain block (Edge #7) | **CONFIRMED** | `brain-inject.js` learnedRules/memoryLines path confirmed. |
| pattern-promoter → global.md (Edge #4) | **CONFIRMED** | `neuron-loop.mjs:271-277` appends to `global.md`; `global.md` is session seed. Partially alive. |

### Refinement on F1 (dream-processor early-exit)

The report cites `process.exit(0)` at processor.mjs:18-21 as killing writes. HEAD read shows: line 16 exits when `targets.length === 0`; lines 18-21 exit on `--dry-run`. Without `--dry-run` the processor DOES proceed to the DeepSeek call and write logic. The "early exit" framing is imprecise — but the core finding (no trigger fires the processor without `--dry-run`) is **CONFIRMED**. The queue is write-only for a different reason: no scheduler, no hook, no LaunchAgent invokes it. The 867 pending / 0 processed count is the unambiguous proof.

### Scope vs Die Coverage

The scope die (`wave3-scope-die-extract.json`) models 79 governance/routing/gate organs. The self-improvement subsystem (`yuri-dream.js`, `yuri-learning-capture.mjs`, `sessionImprovementService.ts`, `lane-calibration.mjs`, `neuron-loop.mjs`, `self-model.mjs`, `session-capture.js`, `02_EXTRACT`, `pulse-trivial-audit.mjs`) is **not represented in the die at all** — structural gap in the die schematic, not a coverage failure of this audit.

**Die organs with learning-adjacent relevance not covered by this report:** 7 RESIDUE_UNASSIGNED services (`SVC_EOT`, `SVC_HEALTH`, `SVC_DIGEST`, `SVC_RUNTIME`, `SVC_SHELL`, `SVC_RAG`, `SVC_OLLAMA`) — unassigned in die, likely unimplemented.

**Die organ this report does cover:** `CMD_EOT` → `yuri-closeout.mjs` (Edge #14, F4 above). One die organ covered.

**Missed die organs (learning-irrelevant, correctly excluded):** ~71 routing/lane/gate/hook/skills organs.

### DeepSeek Advisory Lead (deepseek-wave3-selfimprove-drift.md)

The DeepSeek lead (external advisory lane) claimed: 02_EXTRACT inputs dead since W20; consumption pointer-only; `failure-log.md` unused. All three **CONFIRMED on HEAD**. External lane findings accepted — evidence independently verified, not taken on faith.

### Final Attack Summary

**P0 findings: 2 — both CONFIRMED.**
**P1 findings: 2 — both CONFIRMED.**
**P2 findings: 2 — both CONFIRMED.**
**0 refuted. 0 unverifiable.**
**Missed die organs: 7** (RESIDUE_UNASSIGNED services — learning-adjacent but unimplemented and unmodeled).

The self-attack in the original report was accurate. No external attacker corrections needed beyond the F1 early-exit precision note above.
