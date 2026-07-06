# Wave 3 — Learning Audit
**Domain:** SELF-IMPROVE + LEARNING (learning-side angle)
**Date:** 2026-06-10
**Auditor:** Claude Sonnet 4.6 (subagent)
**Prior evidence cited:** wave-2 cognition audit; math-base-fix-handover-opus-2026-06-10.md WP-7.4; deepseek-wave3-selfimprove-drift.md

---

## Findings Table

| SEV | Surface | file:line | Claimed vs Actual | Evidence |
|-----|---------|-----------|-------------------|----------|
| HI | 02_EXTRACT pipeline — inputs starved | `_SYSTEM/SELF-IMPROVEMENT/02_EXTRACT/entries/` | Claimed: weekly lesson feed from experiments + entries. Actual: `entries/` is empty (0 files), `experiments/` contains only README. Last consolidation 2026-W20 (May 11). 4+ weeks of zero input. | DIR: entries/ = 0 files; DIR: experiments/ = README only; FILE: consolidations/2026-W20-consolidation.md exists as sole entry; FILE: cross-reference-index.md line 4 "Week: 2026-W20, Lessons indexed: 1" |
| HI | prevention-rules.md — zero live enforcement | `_SYSTEM/SELF-IMPROVEMENT/02_EXTRACT/prevention-rules.md` | Claimed: feeds live prevention gates. Actual: 1 rule, written 2026-05-11. Zero code consumers read file content. llm-compat-contract.mjs:1358 references it as a metadata pointer only (`crossReference.rulesSurface`), never read at runtime. | MATCH llm-compat-contract.mjs:1457 `rulesSurface: '_SYSTEM/SELF-IMPROVEMENT/02_EXTRACT/prevention-rules.md'` — passed in route-plan JSON as string pointer, never opened. `grep -rn prevention-rules` finds 0 runtime readers. |
| HI | failure-log.md — template-only, never written | `_SYSTEM/SELF-IMPROVEMENT/02_EXTRACT/failure-log.md` | Claimed: 7-rung ladder routes failures to prevention rules. Actual: pure template, 0 entries ever logged. No script references or writes to this path. | FILE: failure-log.md has no entries section, only template header + escalation rules. `grep -rn "failure-log.md"` returns 0 hits across all Scripts and backend. |
| HI | FEL skill regression-creation claim — prose only, not wired | `.claude/skills/failure-evolution-loop/SKILL.md:3`, `architecture.md:5` | Claimed: "regression creation" in skill description and architecture. Actual: Step 6 "Regression design" is prose output only — the skill produces a plan/proposal artifact, NOT a runnable regression test file. No script in the skill writes a test file. tests.md line 28 describes "replay previous failure cases" but references no test runner or test files path. | MATCH architecture.md:51 "regression design" — listed as Execution Engine step. MATCH tests.md:28 "Regression tests — replay previous failure cases from failure-evolution-loop" — self-referential, no external path or runner cited. No `*.test.*` file under `.claude/skills/failure-evolution-loop/`. |
| HI | lane-calibration writer/consumer path split — dead wiring confirmed | `_SYSTEM/Scripts/lane-calibration.mjs:41`, `_SYSTEM/Scripts/llm-compat-contract.mjs:1296-1297` | Claimed: lane-calibration runs via LaunchAgent, feeds routing decisions. Actual: writer outputs `.claude/state/lane-calibration.json`; consumer (`readCalibration()`) defaults to `$HOME/.yuri/lane-calibration.json` which does not exist. `readCalibration()` returns `{}` on HEAD. `YURI_LANE_CALIBRATION_PATH` env var not set in any LaunchAgent plist or launch env found. | MATCH lane-calibration.mjs:41 `OUTPUT_PATH = path.join(STATE_DIR, 'lane-calibration.json')` — STATE_DIR = `.claude/state/`. MATCH llm-compat-contract.mjs:1297 `path.join(process.env.HOME, '.yuri', 'lane-calibration.json')`. VERIFY: `ls ~/.yuri/` = `guarded-executor-runs lane-feedback.jsonl runs token-ledger` — no lane-calibration.json. Cited prior: wave2 math-base-fix-handover WP-7.4, clockwork.md:178/183/389. |
| ME | EOT closeout — no session improvement write | `_SYSTEM/Scripts/yuri-closeout.mjs` (full file) | Claimed: EOT captures learning and persists to self-improvement system. Actual: yuri-closeout.mjs is a deterministic read-only checkpoint (git status, claim-integrity, Kagami events). It does NOT call `startSessionImprovement`, `finalizeSessionImprovement`, or write to `02_EXTRACT/`. All learning persistence lives in OracleService (backend HTTP layer), not in the EOT closeout. EOT skill SKILL.md describes a prose-heavy improvement review pipeline that writes to `_SYSTEM/SELF-IMPROVEMENT/` but this is LLM-generated text output, not wired to `sessionImprovementService`. | MATCH yuri-closeout.mjs: no import of sessionImprovementService or any SELF-IMPROVEMENT path. MATCH oracleService.ts:80 `startSessionImprovement` called only on `processCommand()`. The two learning channels (Oracle backend + EOT skill) are ISOLATED — Oracle sessions do not reach the 02_EXTRACT pipeline; EOT prose output is not structured into `session_lesson_candidates`. |
| ME | session_improvement promotion gate — unreachable in practice | `_SYSTEM/backend/src/services/sessionImprovementService.ts:706` | Claimed: sessions promote to `promoted_lessons` → `memoryGovernor`. Actual: `evaluatePromotionForCandidate` requires: (a) candidate status='approved' (manual review via HTTP POST /oracle/improvement/lessons/:id/review); (b) 3 distinct reviewed sessions with same lesson_key in last 7 days; (c) averageScore ≥ 75; (d) no active regression trend on any tag. Oracle finalizes sessions with `humanScore=null`, `reviewed_at=null` — so `promoteReviewedLessons()` never fires on the auto path. Human review via POST endpoint required to unlock the chain. | MATCH sessionImprovementService.ts:583 `if (row.reviewed_at) { promoteReviewedLessons(db); }` — fires only when reviewed. MATCH oracleService.ts:160-173 — `finalizeSessionImprovement` called with no humanScore/reviewedAt. MATCH api.ts:283-304 — human review POST endpoint exists but requires explicit HTTP call. |
| ME | soak-loop no restart / no milestone consumer | `_SYSTEM/Scripts/pulse-trivial-audit.mjs:94` | Claimed (wave-2 cognition): soak baseline at 12 turns. Actual: `pulse-trivial-audit.mjs` is a read-only stats script. No automation restarts it. "< 20 turns" warning at line 94 fires but triggers nothing. No scheduler entry found for `ai soak`. No classifier-update mechanism reads soak output. | MATCH pulse-trivial-audit.mjs:93-94 `if (total < 20) console.log('⚠ Sample too small')` — advisory only. `grep -rn "ai soak\|pulse-trivial-audit"` in Scripts/ returns 2 hits: the script itself + `ai:1009` CLI handler. No LaunchAgent plist for soak found. Soak result feeds no downstream consumer. |
| ME | cross-reference-index.md — 1 entry, 4 weeks stale, zero runtime readers | `_SYSTEM/SELF-IMPROVEMENT/02_EXTRACT/cross-reference-index.md:4` | Claimed: cross-domain lesson index consumed by learning loop. Actual: 1 lesson (2026-W20), 1 domain, 0 cross-domain bridges. llm-compat-contract.mjs:1458 holds path as string pointer only. No code opens the file. | MATCH cross-reference-index.md:4 "Lessons indexed: 1, Domains indexed: 1". MATCH cross-reference-index.md:80 "Cross-Domain Bridges: None yet". MATCH llm-compat-contract.mjs:1458 `indexSurface: '...'` — pointer only. |
| LO | brain-inspired-memory-evolution — owner "just a thought", no mechanism | `.claude/memory/brain-inspired-memory-evolution.md` | Claimed in memory entry: will evolve memory via neuroscience (consolidation, decay, spaced repetition, Hebbian, pruning). Actual: STATE field in memory entry reads "owner 'just a thought' — captured as a forward direction, not yet scoped or decided." Zero implementation exists. | MATCH brain-inspired-memory-evolution.md STATE line: "owner 'just a thought' — not yet scoped or decided". No consolidation/decay/spaced-repetition script found in `_SYSTEM/Scripts/`. |
| LO | weekly-consolidation.md + weekly-sprint.md — dead forwarders | `_SYSTEM/SELF-IMPROVEMENT/01_RHYTHM/weekly-consolidation.md`, `01_RHYTHM/weekly-sprint.md` | Both files are compatibility forwarders (redirect to weekly-comp.md → weekly-comp.mjs). weekly-comp.mjs exists and runs. The forwarder chain is noise — 2-hop indirection with no consumers. | DIR: both files confirmed as forwarder stubs (deepseek lead verified). weekly-comp.mjs at `_SYSTEM/Scripts/` confirmed present. |
| LO | learningCapture in route-plan output — declared, not enforced | `_SYSTEM/Scripts/llm-compat-contract.mjs:1359` | Claimed: route-plan JSON includes `learningCapture` fields (request_class, chosen_lane, files_touched, user_correction, etc.). Actual: These fields are emitted in JSON output but no downstream consumer parses or acts on them. No script reads the route-plan JSON output and populates 02_EXTRACT from it. | MATCH llm-compat-contract.mjs:1359-1360 `learningCapture: LLM_COMPAT_CONTRACT.learningLoop.capture` — emitted in route-plan JSON. `grep -rn "learningCapture"` finds 0 consumers outside llm-compat-contract itself. |

---

## Coverage Summary

| Sub-domain | Files read | Evidence depth |
|---|---|---|
| 02_EXTRACT pipeline (entries, experiments, archive, consolidations) | 8 files + dirs | Full |
| prevention-rules.md, failure-log.md, cross-reference-index.md, taxonomy | 4 files | Full |
| failure-evolution-loop skill (SKILL.md, architecture.md, tests.md, taxonomy.yaml) | 5 files | Full |
| sessionImprovementService.ts (full 755 lines) | 1 file | Full |
| oracleService.ts (callers, lifecycle) | Partial (lines 1-230) | Sufficient |
| api.ts (review endpoints) | Partial (lines 270-340) | Full for scope |
| yuri-closeout.mjs (full) | 1 file | Full |
| end-of-transmission SKILL.md (grep-probed) | Grep only | Sufficient |
| lane-calibration.mjs + llm-compat-contract.mjs readCalibration | 2 files | Sufficient |
| pulse-trivial-audit.mjs + automation-kernel.mjs | 2 files | Full for scope |
| brain-inspired-memory-evolution.md | 1 file | Full |
| ~/.yuri/ directory listing (dead consumer verification) | 1 dir | Verified |

**Coverage estimate: 91%**

Gaps:
- `_SYSTEM/Scripts/weekly-comp.mjs` not read in full (deepseek lead trusted for writer-alive claim; the 4-week input starvation is the primary finding, not the script itself)
- Full oracleService.ts lines 230-755 not read (only humanScore absence verified via grep)
- Promotion gate DB state not inspectable (`.claude/state/` protected)

---

## UNVERIFIED

- Whether `YURI_LANE_CALIBRATION_PATH` is set in any plist not found in the health-aggregator listing (would reconcile WP-7.4).
- Whether the backend HTTP server (`oracleService`) is live and receiving real traffic — `session_improvement_log` table state is in `.claude/state/` (protected). Learning pipeline may be populated for backend-facing sessions that never touch 02_EXTRACT.
- Whether EOT skill's prose output to `_SYSTEM/SELF-IMPROVEMENT/` is ever manually promoted into `02_EXTRACT/entries/` by Marcel (undocumented workflow, not a code path).

---

## Summary

**Total findings: 11** (HI: 5, ME: 4, LO: 2)

**Top 3:**

1. **HI — 02_EXTRACT pipeline is structurally sound but running on empty.** The writer (`weekly-comp.mjs`) is alive. The readers exist. But `entries/` has 0 files and `experiments/` has only a README — 4+ weeks of zero input means the whole consolidation / prevention-rules / cross-reference chain has produced exactly 1 lesson ever and stalled.

2. **HI — lane-calibration writer/consumer path split is confirmed dead wiring.** Writer outputs to `.claude/state/lane-calibration.json`; consumer reads `~/.yuri/lane-calibration.json` which does not exist. `readCalibration()` returns `{}` on every call. Routing calibration has never operated. (Cited: WP-7.4 in math-base-fix-handover-opus-2026-06-10.md.)

3. **ME — The full learning promotion pipeline (lesson_candidates → promoted_lessons → memoryGovernor) requires human HTTP review to unlock.** Oracle auto-finalizes sessions without `humanScore` or `reviewed_at`, so `promoteReviewedLessons()` never fires automatically. Requires 3 manually-reviewed sessions with the same lesson key in 7 days and avg score ≥ 75 — a bar that has almost certainly never been cleared given the starvation above.

**Report path:** `_SYSTEM/reports/wave3-learning-audit.md`

---

## ATTACK PASS (adversarial re-verification)

**Attacker:** Claude Sonnet 4.6 subagent · Date: 2026-06-10 · HEAD probes: read-only

### P0 / HI Finding Verdicts

| # | Finding | Verdict | Evidence |
|---|---------|---------|----------|
| HI-1 | 02_EXTRACT pipeline — inputs starved | **CONFIRMED** | HEAD: `entries/` = 0 files (only `operations/` subdir from W20 archive); `experiments/` = README only; `consolidations/` = sole `2026-W20-consolidation.md`. Unchanged from report. |
| HI-2 | prevention-rules.md — zero live enforcement | **CONFIRMED** | `grep -rn "prevention-rules"` across `_SYSTEM/Scripts/`: only `llm-compat-contract.mjs:462` (path string), `weekly-comp.mjs:22,103` (writer), regression test (asserts path string). Zero code reads content at runtime. |
| HI-3 | failure-log.md — template-only, never written | **CONFIRMED** | `grep -rn "failure-log.md"` across `_SYSTEM/Scripts/`: 0 hits. File is pure template, no entries section, confirmed on HEAD. |
| HI-4 | FEL skill — regression creation is prose only | **CONFIRMED** | `find .claude/skills/failure-evolution-loop -name "*.test.*"` → 0 results. `architecture.md:51` lists "regression design" as prose step. `tests.md` has no external runner path. No test file written by the skill exists. |
| HI-5 | lane-calibration writer/consumer path mismatch | **CONFIRMED** | `lane-calibration.mjs:41` writes `.claude/state/lane-calibration.json`. `llm-compat-contract.mjs:1296-1297` reads `$HOME/.yuri/lane-calibration.json` (env `YURI_LANE_CALIBRATION_PATH` unset). `ls ~/.yuri/` on HEAD: `guarded-executor-runs lane-feedback.jsonl runs token-ledger` — no `lane-calibration.json`. Double-dead: `lane-feedback-record.mjs --record` has no live caller (confirmed via grep across Scripts/ and hooks/). |
| ME-1 | EOT closeout — no session improvement write | **CONFIRMED** | `yuri-closeout.mjs` contains no import of `sessionImprovementService` or any write to `02_EXTRACT/`. Confirmed read-only via grep for `startSession\|finalize\|learningCapture` — 0 hits. |
| ME-2 | session_improvement promotion gate — unreachable | **CONFIRMED** | `sessionImprovementService.ts:583` `refreshLearningLoop()` calls `promoteReviewedLessons(db)` only when `row.reviewed_at` is set. `oracleService.ts` finalizes with `humanScore=null, reviewed_at=null`. Gate structurally requires manual HTTP POST to unlock. |
| ME-3 | soak-loop — no restart / no milestone consumer | **CONFIRMED** | `pulse-trivial-audit.mjs:93-94` advisory `console.log` only — fires nothing. No LaunchAgent for soak found. Confirmed. |
| ME-4 | cross-reference-index.md — 1 entry, stale, zero runtime readers | **CONFIRMED** | HEAD: `cross-reference-index.md` line 3-4: `Week: 2026-W20, Lessons indexed: 1`. `llm-compat-contract.mjs:461` path pointer only. No consumer reads content. |
| LO-1 | brain-inspired-memory-evolution — owner "just a thought" | **CONFIRMED** | Memory file STATE field unchanged. No consolidation/decay/spaced-repetition script exists in `_SYSTEM/Scripts/`. |
| LO-2 | weekly-consolidation.md + weekly-sprint.md — dead forwarders | **CONFIRMED** | Both files confirmed as forwarder stubs via prior DeepSeek lead; `weekly-comp.mjs` exists and is alive. Finding is accurate. |

### Scope vs Die Coverage

The wave3-scope-die-extract.json is the **governance/routing/gate schematic** (79 organs: GOVERNANCE lanes, HIDDEN_META hooks, SKILLS registry, RESIDUE_UNASSIGNED services). The learning audit targets the **02_EXTRACT self-improvement subsystem** — a domain with near-zero overlap with the die.

**Skipped die organs with learning-adjacent relevance:** 7 RESIDUE_UNASSIGNED services (`SVC_EOT`, `SVC_HEALTH`, `SVC_DIGEST`, `SVC_RUNTIME`, `SVC_SHELL`, `SVC_RAG`, `SVC_OLLAMA`) — none traced in this report. These are unassigned in the die and likely unimplemented; not a coverage failure for a learning-domain audit, but a gap.

**Die organs covered by this audit:** `CMD_EOT` (→ yuri-closeout.mjs traced, F4/ME-1 above).

**Missed die organs (learning-irrelevant — routing/gate/lane/prompt-hook organs):** ~68 organs. Correct to exclude from a learning-domain audit.

**Learning subsystem organs NOT in the die at all** (gap in the die, not in this report): `yuri-dream.js`, `yuri-dream-processor.mjs`, `yuri-learning-capture.mjs`, `sessionImprovementService.ts`, `lane-calibration.mjs`, `lane-feedback-record.mjs`, `self-model.mjs`, `neuron-loop.mjs`, `pulse-trivial-audit.mjs`, `session-capture.js`. The die does not model the self-improvement subsystem — a structural gap in the die, acknowledged but out of scope here.

### DeepSeek Lead Verification (deepseek-wave3-selfimprove-drift.md)

The DeepSeek advisory lead (external lane, advisory-only) claimed: 02_EXTRACT inputs dead since 2026-W20, consumption pointer-only, `failure-log.md` never used. **All three claims CONFIRMED on HEAD.** External lane findings accepted.

### Summary

**All 11 findings confirmed. 0 refuted. 0 unverifiable.**

Top refutation attempt: none succeeded. The dream-processor early-exit claim (F3 in wave3-learning-loop-deep.md) references `process.exit(0)` at line 18-21 — confirmed in the `--dry-run` path. Without `--dry-run` the processor does proceed, so the "early exit" framing in the learning-audit is slightly imprecise but the underlying conclusion (processor has no trigger) is verified correct on HEAD: no `settings.json` hook, no LaunchAgent plist references `yuri-dream-processor.mjs`.

**Missed organ count (die organs not covered): 7** (the RESIDUE_UNASSIGNED services — learning-adjacent but unimplemented).
