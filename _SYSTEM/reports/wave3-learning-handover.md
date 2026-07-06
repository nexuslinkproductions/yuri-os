# YURI Wave-3 Learning Domain — Handover Instruction for Opus 4.8

> **Operator note (Marcel):** paste this file's path into the Opus session as the task packet root. Resolve owner decisions D-L1 through D-L3 (§6) before or at session start; D-L1 (dream-processor trigger) is the highest-leverage call and blocks WP-L.1. Status: **PACKAGES READY — Codex addendum blocked until Jun 11 credits reset; re-dispatch `_SYSTEM/reports/wave3-codex-spec-saved.md` after reset.**

---

## 0 · Mission

You are fixing the YURI learning domain so that: the dream-processor has a live trigger (882 pending / 0 processed is a structural failure), the lane-calibration path mismatch is closed (routing has never seen calibration), and the 02_EXTRACT pipeline either receives real input or is honestly declared dormant. A completed audit + deep dive (all 11 findings CONFIRMED, 0 refuted, 0 unverifiable; 14 learning edges traced, 5 closed / 6 dead / 3 prose-only) found: **YURI's self-awareness layer (fingerprint, neuron-loop, Track-B memory) genuinely closes; its lesson-economy layer (dream→synthesize→enforce) is entirely dead-wired.**

Non-negotiable framing: building a learning loop that never completes one cycle is not "aspirational architecture" — it is false advertising. The dream queue has 882 pending items and 0 processed after 3 weeks. Fix the trigger first. Lane-calibration has never fed routing. Fix the path. Then either make the 02_EXTRACT pipeline real or declare it dormant honestly.

**Completeness contract:** every attack-confirmed finding in the audit ledger appears exactly once below as a workpackage or an explicit PARKED entry.

**What actually closes (do NOT touch these — they work):**
- Edge #5: behavioral fingerprint → `self-model.mjs` → `fingerprint.json` → `brain-inject.js` (LaunchAgent-driven, closed)
- Edge #6: neuron-loop log → `brain-inject.js` `### NEURON_LOOP` section (LaunchAgent-driven, closed)
- Edge #7: Track-B memory files → brain-inject `learnedRules`/`memoryLines` (closed)
- Edge #4: pattern-promoter → `global.md` → session seed (neuron-loop phase 2, partially alive)

**Document map:**
- `_SYSTEM/reports/wave3-learning-audit.md` — primary audit + ATTACK PASS. 11/11 CONFIRMED.
- `_SYSTEM/reports/wave3-learning-loop-deep.md` — deep dive: 14-edge signal→consumer closure table. All 6 P0/P1/P2 findings CONFIRMED. 5/14 edges close.
- `_SYSTEM/lane-output/deepseek-wave3-selfimprove-drift.md` — DS advisory: 02_EXTRACT inputs dead since W20, consumption pointer-only, failure-log.md unused. All three CONFIRMED on HEAD. [DS-verified]
- This file — the work program.

---

## 1 · Context loadout

1. `CLAUDE.md` (repo root)
2. `_SYSTEM/reports/wave3-learning-audit.md` — read FINDINGS + ATTACK PASS fully
3. `_SYSTEM/reports/wave3-learning-loop-deep.md` — read closure table (§ SIGNAL → CONSUMER) + all FINDINGS
4. This file, fully
5. Per phase: target files listed in each phase's workpackages — read each fully before editing

Run `node _SYSTEM/Scripts/xref-query.mjs "dream processor learning lane calibration 02_EXTRACT"` once at session start.

---

## 2 · Hard rules

- **No commit, no push.** Marcel holds commit authority.
- **Protected paths untouchable**: `backend/data/`, `.claude/state/`, `.claude/history/`, `.env`, `node_modules/`, `.amp/`.
- **No dependency installs. No destructive commands. Never `claude -p`/`--print`/SDK.**
- **Scope discipline:** edit ONLY files named in the workpackage you are executing.
- **Evidence discipline:** every fix ends with its acceptance command run and output captured.
- **Owner-decision boxes** (marked `🔶 OWNER`): implement recommended default ONLY if Marcel pre-approved in the packet.
- **LaunchAgent edits**: any change to `~/Library/LaunchAgents/*.plist` is a system-level change. Confirm the plist is well-formed XML before reloading: `plutil -lint ~/Library/LaunchAgents/<file>.plist`. Reload with `launchctl unload && launchctl load`. Do NOT use `launchctl start` on a plist that is already loaded.
- **Dream queue**: `.claude/yuri-sentinel/learning/dream-queue.jsonl` has 882 pending entries. Do NOT truncate or wipe it — the fix triggers the processor to drain it. A processor run without `--dry-run` will consume these entries via DeepSeek call. If the DeepSeek call is expensive/risky, Marcel should run the processor manually first to validate before arming the trigger permanently.
- **lane-calibration.json is in `.claude/state/`** (protected for writes). The fix for WP-L.2 moves the READER path, not the writer path. Do NOT touch `lane-calibration.mjs` writer. Only fix `llm-compat-contract.mjs:1296-1297` reader.

---

## 3 · Working agreement

- **One phase per work block.**
- **DS advisory verdicts:** all three DS claims (02_EXTRACT dead since W20, consumption pointer-only, failure-log.md unused) CONFIRMED on HEAD. [DS-verified]
- **Dream-processor early-exit clarification (from deep-dive attack pass):** `process.exit(0)` at processor.mjs:18-21 fires ONLY on `--dry-run`. Without `--dry-run`, the processor proceeds to the DeepSeek call and write logic. The queue is write-only because no trigger ever fires the processor WITHOUT `--dry-run`. This is the bug WP-L.1 fixes.
- **session-capture.js is doubly orphaned:** not registered in settings.json AND writes to the wrong filename (`sessions.jsonl` flat vs `sessions/{date}.jsonl` dated). Do NOT re-register session-capture.js — it would feed a file nothing reads. WP-L.5 handles cleanup.
- **End of session report:** changed files, every command run with pass/fail, owner-decision items left open.

---

## 4 · Fix phases

### Phase 0 — Baseline freeze

```bash
# Confirm dream queue state
wc -l .claude/yuri-sentinel/learning/dream-queue.jsonl
grep -c '"status":"pending"' .claude/yuri-sentinel/learning/dream-queue.jsonl
# Confirm lane-calibration path mismatch
grep -n "lane-calibration" _SYSTEM/Scripts/llm-compat-contract.mjs | head -5
ls ~/.yuri/ 2>/dev/null  # confirm lane-calibration.json absent
# Confirm 02_EXTRACT starvation
ls _SYSTEM/SELF-IMPROVEMENT/02_EXTRACT/entries/ | wc -l  # expect 0
```
Any unexpected failure before you start → stop, report, wait.

---

### Phase 1 — Dream-processor trigger: arm the drain (highest-leverage fix)

**WP-L.1** [HIGH] [CONFIRMED: learning-loop-deep F1, learning-audit HI-1 partial] 🔶 D-L1 `yuri-dream-processor.mjs` has no trigger — dream loop is write-only; 882 pending / 0 processed

- **Files:** LaunchAgent plist for dream-processor (create new OR add to existing automation-kernel), OR `.claude/settings.json` Stop hooks array, OR `_SYSTEM/Scripts/yuri-dream.js` (add inline processor call)
- **Evidence:** [learning-loop-deep F1, CONFIRMED]. `yuri-dream.js` fires every session via `yuri-sentinel-stop.js:35` — writes to `dream-queue.jsonl`. `yuri-dream-processor.mjs:53-68` is the ONLY consumer that flips pending→processed and appends `### Auto-synthesized` rules to `global.md`. It is registered in NO settings.json hook, NO LaunchAgent, NO agent. Reference in `launch-readiness-check.mjs:88` is `--dry-run` only (writes nothing). 882 pending items, 0 processed, newest entry 2026-06-10T11:16:27Z.
- **Three trigger options (owner resolves via D-L1):**
  - **Option A (LaunchAgent scheduled — recommended):** Create `~/Library/LaunchAgents/com.yuri-os-musubi.dream-processor.plist`. Schedule to run `node _SYSTEM/Scripts/yuri-dream-processor.mjs` daily (e.g. 02:00 local time) with the repo as the working directory. ProgramArguments must NOT include `--dry-run`. This matches the neuron-loop and lane-calibration patterns already present.
  - **Option B (Stop hook — inline after dream.js):** Add `yuri-dream-processor.mjs` to the `settings.json` Stop hooks array after `yuri-sentinel-stop.js`. Make it async (`"async": true`) so it does not block session end. Add `--batch-size 10` or similar to limit DeepSeek API calls per session (if the processor supports a batch-size argument — verify). This runs the processor at session end automatically.
  - **Option C (inline call in yuri-dream.js):** At the end of `yuri-dream.js`'s main flow, add `execSync('node _SYSTEM/Scripts/yuri-dream-processor.mjs --max-items 5 2>/dev/null')` (or the equivalent). Inline and sequential. Simplest but blocks the Stop hook's completion until the processor + DeepSeek call finishes.
- **Pre-trigger validation (REQUIRED before arming):** Run `node _SYSTEM/Scripts/yuri-dream-processor.mjs` (without `--dry-run`) ONCE manually and confirm: (1) it reads from `dream-queue.jsonl`, (2) it makes a DeepSeek call that completes, (3) it writes an `### Auto-synthesized` block to `global.md`, (4) it updates `dream-queue.jsonl` entries from `pending` to `processed`. If any step fails, do NOT arm the trigger and report the failure.
- **Acceptance:** `grep -c '"status":"processed"' .claude/yuri-sentinel/learning/dream-queue.jsonl` > 0 after first trigger run. `grep "Auto-synthesized" .claude/yuri-sentinel/learning/global.md | wc -l` > 1 (new block added).
- **Regression:** `global.md` is the session seed loaded by brain-inject. The processor appends `### Auto-synthesized` blocks — these are additive. Verify the global.md format is preserved (no duplicate heading collisions, no JSON corruption).

---

### Phase 2 — Lane-calibration path mismatch: fix the read path

**WP-L.2** [HIGH] [CONFIRMED: learning-loop-deep F2, learning-audit HI-5] Lane-calibration writer outputs to `.claude/state/lane-calibration.json`; consumer reads `~/.yuri/lane-calibration.json` — routing has never seen calibration

- **Files:** `_SYSTEM/Scripts/llm-compat-contract.mjs:1295-1301` (`readCalibration()` function)
- **Evidence:** [learning-loop-deep F2, CONFIRMED]. Writer `lane-calibration.mjs:41,127` writes `.claude/state/lane-calibration.json`. Reader `llm-compat-contract.mjs:1296` reads `path.join(HOME, '.yuri', 'lane-calibration.json')` (default of unset `YURI_LANE_CALIBRATION_PATH`). `ls ~/.yuri/` on HEAD: `guarded-executor-runs lane-feedback.jsonl runs token-ledger` — no `lane-calibration.json`. `readCalibration()` returns `{}` on every call. `applyCalibrationToLane` routing warnings never fire.
- **Direction:** Fix `readCalibration()` to use the correct path. Change the default in `llm-compat-contract.mjs:1296-1297` from `path.join(process.env.HOME, '.yuri', 'lane-calibration.json')` to `path.join(repoRoot, '.claude', 'state', 'lane-calibration.json')`. Set `YURI_LANE_CALIBRATION_PATH` to this corrected default. Alternatively: set `YURI_LANE_CALIBRATION_PATH` in the LaunchAgent plist for `com.yuri.lane-calibration` so both processes agree. The simplest fix is correcting the default path in `readCalibration()` directly.
- **Note:** `.claude/state/` is a protected path for WRITES. This fix changes the READER path in `llm-compat-contract.mjs` to point to a file the writer already creates. Reading `.claude/state/lane-calibration.json` is not blocked by the deny-list (only Write/Edit are denied for state files, not Read). Confirm with `grep "lane-calibration" .claude/settings.json` that there is no Read deny on this specific file.
- **Acceptance:** `node -e "import('_SYSTEM/Scripts/llm-compat-contract.mjs').then(m => m.readCalibration().then(c => console.log('calibration:', JSON.stringify(c))))" 2>&1` — after the lane-calibration LaunchAgent has run once (or manually run `node _SYSTEM/Scripts/lane-calibration.mjs`), should return a non-empty calibration object instead of `{}`.
- **Compound fix note:** The calibration INPUT (`.claude/state/lane-feedback.jsonl`) has NO live producer — `lane-feedback-record.mjs --record` is never called. Even with the path fixed, calibration is computed over an empty feedback log. This means `applyCalibrationToLane` will produce default (neutral) calibration. This is still better than the current state (crash on every call returning `{}`), but full calibration value requires WP-L.4 (wire the feedback producer).
- **Regression:** `readCalibration()` currently returns `{}` on every call. Changing the path to a file that may not exist yet should also return `{}` (with the same `catch → {}` behavior). No routing change until the calibration file is populated.

---

### Phase 3 — 02_EXTRACT pipeline starvation: honest status declaration

**WP-L.3** [HIGH] [CONFIRMED: learning-audit HI-1, DS-verified] 🔶 D-L2 02_EXTRACT pipeline is structurally sound but running on empty — 0 entries since 2026-W20; honest declaration required

- **Files:** `_SYSTEM/SELF-IMPROVEMENT/02_EXTRACT/entries/` (input directory), `_SYSTEM/SELF-IMPROVEMENT/02_EXTRACT/prevention-rules.md`, `_SYSTEM/SELF-IMPROVEMENT/02_EXTRACT/failure-log.md`
- **Evidence:** [learning-audit HI-1/HI-2/HI-3, DS-verified, CONFIRMED]. `entries/` = 0 files. `experiments/` = README only. `consolidations/` = sole `2026-W20-consolidation.md`. `prevention-rules.md` = 1 rule from May 11, zero live enforcement. `failure-log.md` = pure template, 0 entries ever logged.
- **Two branches (owner resolves via D-L2):**
  - **Option A (wire real input — recommended if Marcel intends to use it):** The `weekly-comp.mjs` writer is alive. The gap is that nothing feeds `entries/`. The EOT skill prose output is the intended source — but `yuri-closeout.mjs` does NOT write to `02_EXTRACT/entries/` (confirmed in learning-loop-deep F4). Wire the EOT skill: when `/eot` runs and produces a reflection, have it write a structured entry to `02_EXTRACT/entries/<date>-eot.md`. This makes the pipeline real. `weekly-comp.mjs` will then find and process it.
  - **Option B (declare dormant honestly):** Add a `STATUS: DORMANT — last entry 2026-W20; no automatic feeder wired` header to `02_EXTRACT/` README (create if absent). Update `prevention-rules.md` to add: `STATUS: UNVERIFIED — this rule was generated from a single consolidation cycle in May 2026; the pipeline has received no input since; treat as advisory only.` This is honest and low-cost.
- **Regardless of A/B:** Fix `failure-log.md` to add a `STATUS: TEMPLATE-ONLY — no failures have been logged; no script writes to this path` note at the top. The current template looks like it has been used when it has not.
- **Acceptance (Option B):** `grep "DORMANT\|no automatic feeder" _SYSTEM/SELF-IMPROVEMENT/02_EXTRACT/README.md` returns the status header (create README.md if absent). `grep "UNVERIFIED\|advisory only" _SYSTEM/SELF-IMPROVEMENT/02_EXTRACT/prevention-rules.md` returns the status note. `grep "TEMPLATE-ONLY\|no failures.*logged" _SYSTEM/SELF-IMPROVEMENT/02_EXTRACT/failure-log.md` returns the note.

---

### Phase 4 — FEL skill regression claim: correction

**WP-L.4** [HIGH] [CONFIRMED: learning-audit HI-4] `failure-evolution-loop` skill claims "regression creation" but produces prose output only — no test file is written

- **Files:** `.claude/skills/failure-evolution-loop/SKILL.md:3`, `.claude/skills/failure-evolution-loop/architecture.md:51`, `.claude/skills/failure-evolution-loop/tests.md:28`
- **Evidence:** [learning-audit HI-4, CONFIRMED]. `architecture.md:51` lists "regression design" as an Execution Engine step. `tests.md:28` describes "replay previous failure cases" with no test runner or test files path. No `*.test.*` file under `.claude/skills/failure-evolution-loop/`. The skill produces a plan/proposal artifact, NOT a runnable test file.
- **Direction:** Update the skill's claims to match reality. (1) `SKILL.md:3` description — change "regression creation" to "regression design (outputs a runnable-test specification; does not write test files directly)" or similar. (2) `architecture.md:51` — change "Execution Engine → regression design" to "Execution Engine → regression specification (prose/JSON plan for human or Codex to implement)". (3) `tests.md:28` — add a note: "CLARIFICATION: this skill outputs a regression test specification, not a test file. The specification must be implemented by a coding pass (Opus or Codex) before it is runnable."
- **Acceptance:** `grep "prose\|specification\|not a.*test file" .claude/skills/failure-evolution-loop/SKILL.md .claude/skills/failure-evolution-loop/architecture.md .claude/skills/failure-evolution-loop/tests.md | wc -l` returns ≥2.
- **Regression:** documentation only. No skill behavior changes.

---

### Phase 5 — session-capture.js dead organ cleanup and lane-feedback wiring audit

**WP-L.5** [HIGH] [CONFIRMED: learning-loop-deep F6] `session-capture.js` is doubly orphaned — unregistered AND writes wrong filename

- **Files:** `.claude/hooks/session-capture.js` (confirm file exists and is indeed unregistered)
- **Evidence:** [learning-loop-deep F6, CONFIRMED]. Unregistered in `settings.json` (zero references). Writes `LEARNING_DIR/sessions.jsonl` (flat, singular). Dream consumer reads `sessions/{date}.jsonl` (dated, written by `yuri-sentinel-stop.js:135`). Even if re-registered, output goes to a file nothing reads.
- **Direction:** Add a header comment to `session-capture.js`: `// ORPHANED — not registered in settings.json. Even if registered, this script writes sessions.jsonl (flat) while the live consumer reads sessions/{date}.jsonl (dated per yuri-sentinel-stop.js:135). Do NOT re-register without fixing the filename mismatch first. Retained for historical reference only.` Do NOT delete the file (Marcel may want to revive it). Do NOT register it.
- **Acceptance:** `grep "ORPHANED\|Do NOT re-register" .claude/hooks/session-capture.js` returns the comment. `grep "session-capture" .claude/settings.json | wc -l` returns 0 (still unregistered).
- **Regression:** none (already unregistered).

**WP-L.5b** [HIGH] [CONFIRMED: learning-loop-deep Edge #8] `lane-feedback-record.mjs --record` has no live caller — calibration INPUT is starved

- **Files:** `_SYSTEM/Scripts/lane-feedback-record.mjs`, `_SYSTEM/Scripts/llm-compat-contract.mjs` (route-plan consumer), `_SYSTEM/Scripts/ai` (route-plan dispatch)
- **Evidence:** [learning-loop-deep Edge #8, CONFIRMED]. `lane-calibration.mjs:36` reads `lane-feedback.jsonl`. Writer `lane-feedback-record.mjs:89` appends entries. Zero source files call `lane-feedback-record.mjs --record` or `recordFeedback`. Calibration computes over an unfed log.
- **Direction:** 🔶 D-L3 (owner decision). Two options: (a) Wire the feedback recorder into `_SYSTEM/Scripts/ai` at the point where a route-plan lane is executed and completes — record `{lane, success, duration, taskId}` via `lane-feedback-record.mjs --record`. This arms the calibration input. (b) Leave starved, add a comment to `lane-calibration.mjs:36`: `// NOTE: lane-feedback.jsonl has no live producer as of 2026-06-10. readFeedback() reads a permanently-empty log. Calibration returns neutral values until --record is wired to a route-plan consumer.` Option B is the minimum-fix documentation. Option A requires verifying that the `ai` script's dispatch path is the right caller (confirm `run_kagami_or_fallback` completion vs lane-specific completion signals).
- **Acceptance (Option B):** `grep "no live producer\|permanently-empty" _SYSTEM/Scripts/lane-calibration.mjs` returns the comment.

---

### Phase 6 — Dead forwarder cleanup and learningCapture documentation

**WP-L.6** [LOW] [CONFIRMED: learning-audit LO-2] `weekly-consolidation.md` and `weekly-sprint.md` are dead 2-hop forwarders to `weekly-comp.mjs`

- **Files:** `_SYSTEM/SELF-IMPROVEMENT/01_RHYTHM/weekly-consolidation.md`, `_SYSTEM/SELF-IMPROVEMENT/01_RHYTHM/weekly-sprint.md`
- **Evidence:** [learning-audit LO-2, CONFIRMED]. Both are compatibility forwarders that redirect to `weekly-comp.md` → `weekly-comp.mjs`. `weekly-comp.mjs` exists and runs. The forwarder chain is 2-hop noise with no active consumers.
- **Direction:** Replace the forwarder content with a one-line pointer: `# Weekly Consolidation — see _SYSTEM/Scripts/weekly-comp.mjs (run via LaunchAgent com.yuri-os-musubi.weekly-comp or manually: node _SYSTEM/Scripts/weekly-comp.mjs)` and a `STATUS: FORWARDER — retained for compatibility; no active consumers.` Add a `RETIRED:` header to both files.
- **Acceptance:** `grep "FORWARDER\|weekly-comp.mjs" _SYSTEM/SELF-IMPROVEMENT/01_RHYTHM/weekly-consolidation.md _SYSTEM/SELF-IMPROVEMENT/01_RHYTHM/weekly-sprint.md` returns the pointer in both.

**WP-L.7** [LOW] [CONFIRMED: learning-audit LO documentation] `learningCapture` in route-plan output — declared fields, no downstream consumer

- **Files:** `_SYSTEM/Scripts/llm-compat-contract.mjs:1359`
- **Evidence:** [learning-audit LO confirmed via learning-loop-deep]. `learningCapture` fields are emitted in route-plan JSON but no script reads them or populates `02_EXTRACT`. `grep -rn "learningCapture"` finds 0 consumers outside llm-compat-contract.
- **Direction:** Add a comment at `llm-compat-contract.mjs:1359`: `// learningCapture: declared in route-plan JSON output but no downstream consumer reads this field as of 2026-06-10. // To wire: a route-plan consumer (e.g. in 'ai' script after lane execution) should read learningCapture and write // an entry to _SYSTEM/SELF-IMPROVEMENT/02_EXTRACT/entries/ -- see WP-L.3 (Option A) for the 02_EXTRACT wire plan.`
- **Acceptance:** `grep "no downstream consumer.*2026" _SYSTEM/Scripts/llm-compat-contract.mjs` returns the comment.

---

## 5 · PARKED entries

| ID | Finding | Reason parked |
|---|---|---|
| PARKED-L.A | `brain-inspired-memory-evolution.md` — owner "just a thought", no mechanism | STATE field confirmed: "owner 'just a thought' — not yet scoped or decided." No consolidation/decay/spaced-repetition script exists. Remains aspirational. Not a fixable defect — it is an un-started idea. Parked until Marcel decides to build or kill it. [DS-verified: consistent with learning-audit LO-1] |
| PARKED-L.B | EOT closeout learning capture — `yuri-closeout.mjs` writes no learning signal | `yuri-closeout.mjs` is explicitly "deterministic-readonly". The "EOT closeout capture" is doc-only (learning-loop-deep F4 confirmed). The actual learning capture is `session-reflect.js` (journal + SKILL.md Session Notes) — a separate Stop hook. WP-L.3 Option A would wire the EOT SKILL output to 02_EXTRACT. If Marcel chooses Option B (declare dormant), this parked entry stays. |
| PARKED-L.C | Session improvement promotion gate unreachable — Oracle auto-finalizes without humanScore | `sessionImprovementService.ts:583` `promoteReviewedLessons` requires `reviewed_at` set. `oracleService.ts` finalizes with `humanScore=null, reviewed_at=null`. Gate requires manual HTTP POST to unlock. This is a backend design decision — requires Marcel to either: (a) build an auto-review path that evaluates sessions above a score threshold automatically, or (b) commit to periodic manual HTTP review of session candidates. Parked as a backend design call outside the scope of this wave. |
| PARKED-L.D | soak-loop no restart / no milestone consumer | `pulse-trivial-audit.mjs:93-94` advisory only. No scheduler. No downstream consumer reads soak output. Parked — requires LaunchAgent creation and a consumer wiring decision. Deferred to learning build sprint. |
| PARKED-L.E | cross-reference-index.md — 1 entry, 4 weeks stale, zero runtime readers | 1 lesson (2026-W20), 0 cross-domain bridges. `llm-compat-contract.mjs:1458` path pointer only. Fix: same as WP-L.3 — wire real entries into 02_EXTRACT so `weekly-comp.mjs` populates this index. Blocked on D-L2 decision. Parked. |
| PARKED-L.F | DS advisory: all three claims (02_EXTRACT dead since W20, consumption pointer-only, failure-log unused) | All three CONFIRMED. Addressed by WP-L.3. DS advisory accepted — no separate parked action. [DS-verified] |
| PARKED-L.G | 7 RESIDUE_UNASSIGNED services (SVC_EOT, SVC_HEALTH, SVC_DIGEST, SVC_RUNTIME, SVC_SHELL, SVC_RAG, SVC_OLLAMA) | Not in scope die for this audit domain. Likely unimplemented. Deferred to wave-4 or services build sprint. |

---

## 6 · Owner decisions

| ID | Decision | Recommendation | Tradeoffs | Phase gated |
|---|---|---|---|---|
| **D-L1** | Dream-processor trigger: LaunchAgent scheduled (Option A) vs Stop hook async (Option B) vs inline in yuri-dream.js (Option C) | **Option A (LaunchAgent)** — consistent with the neuron-loop and lane-calibration scheduler patterns already present. Runs nightly, caps DeepSeek API calls to a predictable schedule. Option B (Stop hook) runs on every session end — could be expensive if the queue is large per session. Option C (inline) blocks session-end completion. Pre-trigger validation run REQUIRED before arming any option. | Option A: scheduled, predictable, consistent with existing patterns, nightly ~1 DeepSeek call. Option B: per-session, immediate synthesis, higher API costs. Option C: simplest code, synchronous, blocks session end. | Phase 1 (blocking WP-L.1) |
| **D-L2** | 02_EXTRACT pipeline starvation: wire real EOT input (Option A) vs declare dormant (Option B) | **Option B** if Marcel has not been manually feeding the pipeline and does not plan to build the EOT wire immediately. Option A is the right long-term fix but requires wiring the EOT skill's prose output into a structured disk writer — a separate build task. Declaring dormant is honest and costs nothing. | Option A: real learning pipeline, ~20-50 lines to wire EOT→entries/. Option B: honest status declaration, 5 min of file edits, zero structural change. | Phase 3 (WP-L.3) |
| **D-L3** | Lane-feedback wiring: add `--record` call to `ai` script dispatch (Option A) vs document starved (Option B) | **Option B** for now — even with WP-L.2 fixing the reader path, calibration will return neutral defaults until feedback data exists. Wiring `--record` requires verifying what constitutes "lane success" in the `ai` script dispatch path (not trivial). Document the starvation now; wire the feedback when the lane-calibration signal is validated as useful. | Option A: armed calibration loop with real feedback. Option B: honest starvation note, neutral calibration (which is the current behavior anyway). | Phase 5 (WP-L.5b) |

---

## 7 · Coverage gaps — follow-up AUDIT workpackages

**WP-L.AUDIT-1** — `yuri-sentinel.mjs` daemon duty set: the sentinel daemon's full duty set was not exhaustively traced. Specifically: does it write to `.claude/yuri-sentinel/learning/sessions/{date}.jsonl` (the dream producer)? Or is `yuri-sentinel-stop.js:135` the ONLY writer? Verify to confirm the dream producer is exclusively the Stop hook.

**WP-L.AUDIT-2** — `calibration-tracker.mjs` trigger: writes `probability-calibration-log.md` that `brain-inject.js:194` reads. Writer identified; its scheduler was not traced. Verify: `ls ~/Library/LaunchAgents/ | grep calibration` and read the plist if present. If no LaunchAgent, calibration-log.md may be stale — add to the staleness-guard scope of WP-H.3.

**WP-L.AUDIT-3** — `automation-kernel.mjs` lane-calibration role: `automation-kernel.mjs:29,66` lists `lane-calibration` as a health check. Confirm whether automation-kernel.mjs also RUNS the calibration compute (invokes `lane-calibration.mjs`) or only checks the file's existence. If it runs it, the LaunchAgent plist for `com.yuri.lane-calibration` may be redundant or conflicting.

**WP-L.AUDIT-4** — `oracleService` live traffic: is the backend HTTP server (`oracleService`) receiving real session improvement traffic? The `session_improvement_log` table is in `.claude/state/` (protected). If Oracle is live, the session_lesson_candidates table may be populated for backend-facing sessions. This would change the PARKED-L.C assessment.

---

## 8 · Final acceptance gate

Ordered; each step gates the next.

1. **Baseline captured:** `grep -c '"status":"pending"' .claude/yuri-sentinel/learning/dream-queue.jsonl` matches Phase 0 baseline (pre-fix state documented).
2. **Dream-processor trigger armed (D-L1 resolved):** depending on option: (A) `ls ~/Library/LaunchAgents/com.yuri-os-musubi.dream-processor.plist` exists; OR (B) `grep "yuri-dream-processor" .claude/settings.json` returns Stop hook entry; OR (C) `grep "yuri-dream-processor\|execSync.*processor" _SYSTEM/Scripts/yuri-dream.js` returns call.
3. **Pre-trigger validation run:** `grep -c '"status":"processed"' .claude/yuri-sentinel/learning/dream-queue.jsonl` > 0 after first manual run. `grep "Auto-synthesized" .claude/yuri-sentinel/learning/global.md | wc -l` > 1.
4. **Lane-calibration path fixed:** `grep "\.yuri/lane-calibration\|\.claude/state/lane-calibration" _SYSTEM/Scripts/llm-compat-contract.mjs` returns only `.claude/state/` path (no `~/.yuri/` default).
5. **02_EXTRACT status declared (D-L2):** depending on option: (A) `ls _SYSTEM/SELF-IMPROVEMENT/02_EXTRACT/entries/ | wc -l` > 0 (real entries added via EOT wire); OR (B) `grep "DORMANT\|no automatic feeder" _SYSTEM/SELF-IMPROVEMENT/02_EXTRACT/README.md` returns status note.
6. **FEL skill regression claim corrected:** `grep "prose\|specification\|not a.*test file" .claude/skills/failure-evolution-loop/SKILL.md` returns clarification.
7. **session-capture.js documented as orphaned:** `grep "ORPHANED\|Do NOT re-register" .claude/hooks/session-capture.js` returns comment.
8. **Lane-feedback starvation documented (D-L3 Option B):** `grep "no live producer\|permanently-empty" _SYSTEM/Scripts/lane-calibration.mjs` returns comment.
9. **Owner decisions D-L1 through D-L3 recorded** in session report with Marcel's choice for each.

Wave is DONE when all 9 are green AND §5's completeness contract holds. Write the wave report as `wave3-learning-fix-wave-report-<date>.md` next to this file.
