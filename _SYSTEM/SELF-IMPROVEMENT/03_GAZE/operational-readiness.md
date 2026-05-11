# Yuri Operational Readiness Board

Status date: 2026-05-11
Timezone: Europe/Vienna
Audit source: `_SYSTEM/SELF-IMPROVEMENT/03_GAZE/yuri-council-audit-2026-05-11.md`
Execution owner: Codex main session

## Executive State

Yuri is in observe-mode hardening. The recovery target is not "all services exist"; it is a verifiable operating baseline where memory, routing, model-review, skill registry, build, and promotion paths can prove their own state with repeatable commands.

Current decision: observe-mode recovery gates are green. Promotion remains lane-gated because the wider worktree has 152 dirty/untracked entries that are not one safe review unit.

## Operating Principles

- Local deterministic evidence outranks advisory model output.
- Raw model output is never canonical until verified against files, commands, tests, or database state.
- Large/deep plans require Claude Sonnet xhigh advisory review before finalization.
- DeepSeek remains in the review/workhorse lane through 2026-05-31, then its role must be re-evaluated because the active budget reduction expires on 2026-05-31.
- GitNexus remains the code-impact source of truth. If the published `npx gitnexus` path fails, use the local indexed CLI path and document the fallback.
- No commits, staging, or destructive git operations without explicit user instruction.

## Evidence Baseline

| Area | Current State | Evidence | Required Next State |
| --- | --- | --- | --- |
| TypeScript build | Green after restoring root config files | `npm run build` passed on 2026-05-11; repeated during `npm run yuri:health` | Keep as required health gate |
| Root TS configs | Restored and hashed | `tsconfig.json` sha256 `973919425565808fba7e753ce1eb48c9c3ec503f0db0d02cbcfee90e64ad4d9e`; `tsconfig.node.json` sha256 `c40d0614fda5b8a746a1ba2e3be8e2370140c0167851ac77881cd53bb5647cdd` | Keep tracked and unchanged unless config changes are intentional |
| GitNexus | Usable through local CLI fallback | `node NEURAL-NETWORK/GitNexus/gitnexus/dist/cli/index.js status` reports index current at commit `778bcab` | Published `npx gitnexus status` should be repaired or pinned to working RC; local index does not cover dirty entries |
| Memory DB | Healthy after schema repair and lesson promotion | `_SYSTEM/OS_KERNEL/memory_governor.py health`: total `916`, stale `0`, conflicts `0`; `swarm_messages.sender_agent_id` and `receiver_agent_id` now reference `agents.agent_id` as `TEXT` | Keep health gate and retain backups until verified in normal use |
| Memory backup | Present | `_SYSTEM/OS_KERNEL/memory.db.backup-20260511-071602`; `_SYSTEM/OS_KERNEL/memory.db.backup-20260511-lesson-promotion` | Retain until next clean weekly consolidation |
| Lifecycle routing | Observe mode available and verified | `node Scripts/yuri-lifecycle-controller.mjs observe "restore Yuri operational readiness after council audit"` emits route, advisory lanes, artifact requirements, verification commands, and memory promotion rules | Decide later whether to add enforce mode |
| Skill registry | Green | `node Scripts/yuri-skill-loader.mjs --validate --json`: ok `39`, drift `0`, missing `0`, unregistered `0`, collisions `false` | Keep in `npm run yuri:health` |
| Session runtime | Running | `node Scripts/yuri-session-launchd.mjs status`: `com.nudimmud.yuri-session-runtime` state `running`, pid present | Keep launchd status in health gate |
| Weekly promotion | Complete | Dry-run selected one operations lesson; live weekly consolidation wrote 2026-W20 outputs; `session_lesson_candidates=1`, `promoted_lessons=1` | Keep promotion metric above zero when systemic failures produce durable lessons |
| Model review | Complete | Claude Sonnet xhigh and DeepSeek returned bounded reviews; accepted findings were checked against current local command evidence | Preserve local deterministic evidence as final authority |
| Worktree partition | Complete as review ledger | `git status --short | wc -l` returned `152`; lane ledger written to `_SYSTEM/SELF-IMPROVEMENT/03_GAZE/worktree-partition-2026-05-11.md` | Do not promote dirty tree as a single unit |

## Live Action Board

| ID | Workstream | State | Owner | Exit Criteria |
| --- | --- | --- | --- | --- |
| A1 | Build baseline | Done | Codex | `npm run build` passes |
| A2 | GitNexus safety path | Done with fallback | Codex | Local CLI status confirms current committed index; dirty-tree limitation documented |
| A3 | Memory schema and health | Done | Codex | Health command passes with zero stale and zero conflicts |
| A4 | Skill registry drift | Done | Codex | `node Scripts/yuri-skill-loader.mjs --validate --json` returns drift `0`, missing `0`, collisions `false` |
| A5 | Lifecycle observe surface | Done | Codex | Observe command returns route, artifact requirements, verification commands, and promotion rules |
| A6 | Session runtime | Done | Codex | LaunchAgent status works and service is running |
| A7 | Weekly promotion | Done | Codex | Dry-run selected one expected lesson; live consolidation completed; promoted lesson count is `1` |
| A8 | Model advisory review | Done | Codex + Claude + DeepSeek | Claude Sonnet xhigh and DeepSeek review outputs are checked against local evidence |
| A9 | Worktree partition | Done | Codex | Dirty tree split into lane review ledger; no staging performed |
| A10 | Final verification | Done | Codex | `npm test`, `npm run build`, `npm run yuri:health`, GitNexus status, memory health all run and outcomes recorded |

## Required Task List

1. Freeze deterministic baseline.
   - Build must pass.
   - Memory health must pass.
   - GitNexus must report usable current index through at least one documented path.

2. Close registry drift.
   - Treat disk skill files as canonical for this recovery pass.
   - Rewrite `_SYSTEM/skill-hash-registry.json` from disk using `node Scripts/yuri-skill-loader.mjs --write-manifest`.
   - Re-run validation and require zero drift, zero missing entries, and zero collisions.

3. Install or defer session runtime.
   - Check `node Scripts/yuri-session-launchd.mjs status`.
   - If missing and macOS launchd is available, run install.
   - Re-run status.
   - If install fails, record exact launchctl failure and keep observe mode.

4. Execute self-improvement promotion.
   - Run weekly consolidation dry-run first.
   - Confirm selected lesson list is non-destructive and expected.
   - Run live weekly consolidation only if dry-run selection is coherent.
   - Re-run cross-reference outputs where available.

5. Complete mandatory model review.
   - Send this board to Claude Sonnet xhigh for bounded risk review.
   - Send this board to DeepSeek review/workhorse lane while active.
   - Accept only findings backed by local evidence or concrete file/command references.
   - Reject advisory claims that contradict deterministic local evidence.

6. Partition dirty worktree.
   - Count dirty entries.
   - Split into lane review groups with owner, risk, and promotion rule.
   - Do not stage or commit anything from this ledger without explicit user instruction.

7. Run final gates.
   - `npm test`
   - `npm run build`
   - `npm run yuri:health`
   - `python3 _SYSTEM/OS_KERNEL/memory_governor.py health`
   - `node NEURAL-NETWORK/GitNexus/gitnexus/dist/cli/index.js status`

8. Publish final state.
   - List changed files.
   - List database mutation and backup path.
   - List green gates.
   - List blocked gates with exact reason.
   - Do not claim full production readiness if launchd, model review, registry validation, or health gates remain red.

## Promotion Policy

Only these artifacts may be promoted to durable memory or operating rules:

- Verified command outcomes.
- Verified file paths and config diffs.
- Human-authored or operator-approved decisions.
- Advisory model recommendations after local evidence check.

These artifacts must not be promoted directly:

- Raw Claude output.
- Raw DeepSeek output.
- Unverified assumptions about service state.
- Any recommendation requiring secrets, broad staging, destructive git operations, or protected-path mutation without explicit approval.

## Exit Definition

This recovery is complete when:

- Build and tests pass.
- Memory health passes.
- GitNexus has a working status path.
- Skill registry drift is zero.
- Lifecycle observe mode emits a complete route and verification contract.
- Session runtime is installed or explicitly deferred with an operator-grade reason.
- Weekly promotion is executed with at least one expected lesson when a systemic recovery lesson exists.
- Claude Sonnet xhigh review has been run against this concrete board.
- DeepSeek review has either returned and been synthesized, or timed out with the timeout recorded.
- Dirty worktree is partitioned into lane review groups before any promotion decision.
