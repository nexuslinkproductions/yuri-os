# Process Fanout Run 004 Packets

Date: 2026-05-27
Purpose: clean rerun of invalidated Run 003 process QA, split into parallel process lanes
Mode: read-only, YURI report/process files only, no target repo mutation, no live-service calls, no credential use

## Why This Exists

Run 003 process QA was invalidated because the RIQ lane accessed protected `.claude/projects/...` material. Run 004 reruns process QA under `claude --bare`, which disables project hooks, memory, and auto-discovered project context.

## Hard Boundary

Forbidden paths:

- `.claude/`
- `.env`
- `backend/data/`
- `node_modules/`
- `.amp/`
- target repo working tree except for `git -C /tmp/yuri-c2moviez-vault-full.b1RopZ/repo status --short` and `git -C ... rev-parse HEAD` if clone state proof is needed

Forbidden actions:

- no writes;
- no edits;
- no live services;
- no provider calls;
- no package scripts;
- no memory search;
- no Claude project/tool-result reads;
- no credentials or secrets.

Allowed commands:

- `sed`, `nl`, `wc`, `rg`, `git status --short`, `git rev-parse`, `git ls-files`, `awk` for line counting;
- only against the explicitly assigned files or the canonical clone proof commands.

Every lane must emit:

```text
BATCH_OPEN lane=<lane> batch=<id> scope=<short>
RUN_PROOF lane=<lane> model=<model-status> mode=bare status=<ok|fail>
PATH_PROOF path=<path> command=<command> status=<exists|missing>
READ_PROOF path=<path> command=<command> first_line=<short> last_line=<short>
FILE_COVERAGE path=<path> method=<method> status=<covered|partial|deferred> lines=<n> words=<n> notes=<short>
PROCESS_FINDING id=<id> path=<path:line|file> class=<good|gap|risk|correction_needed|invalidated> evidence=<short> impact=<short>
SUPPRESSION path=<path:line|file> hypothesis=<issue> counterevidence=<exact>
DEFERRED path=<path|surface> reason=<blocker> next=<bounded_next>
BATCH_CLOSE lane=<lane> batch=<id> files_covered=<n> findings=<n> suppressions=<n> deferred=<n> invalidated=<n>
```

## R004_PROC_LEDGER_OPUS - LEDGER-004

Scope: coverage ledger integrity and burn-down usability.

Files:

- `_SYSTEM/reports/c2moviez-vault-audit-2026-05-27/10_exhaustive-coverage-ledger.md`
- `_SYSTEM/reports/c2moviez-vault-audit-2026-05-27/15_fanout-run-002-results.md`
- `_SYSTEM/reports/c2moviez-vault-audit-2026-05-27/17_fanout-run-003-results.md`

Questions:

- Does the coverage ledger record Run 002 and Run 003 accepted file coverage?
- Does it have enough fields to support burn-down (`covered_by_run`, `batch`, `status`, `line_count`, `word_count`, `lane`)?
- Is the ledger navigable for LLM lanes or too large/flat?

## R004_PROC_FINDINGS_OPUS - FINDINGS-004

Scope: findings lifecycle and promotion gate.

Files:

- `_SYSTEM/reports/c2moviez-vault-audit-2026-05-27/06_security-findings.md`
- `_SYSTEM/reports/c2moviez-vault-audit-2026-05-27/13_final-master-audit.md`
- `_SYSTEM/reports/c2moviez-vault-audit-2026-05-27/15_fanout-run-002-results.md`
- `_SYSTEM/reports/c2moviez-vault-audit-2026-05-27/17_fanout-run-003-results.md`

Questions:

- Which accepted Run 002/003 security candidates are missing from `06_security-findings.md`?
- Are lifecycle states clear enough: `CANDIDATE`, `VALIDATED`, `SUPPRESSED`, `DEFERRED`, `REPORTABLE`?
- Are raw secrets avoided and `use_status=NOT_USED` preserved?

## R004_PROC_PLAN_OPUS - PLAN-004

Scope: master plan and process log alignment.

Files:

- `_SYSTEM/reports/c2moviez-vault-audit-2026-05-27/00_master-plan.md`
- `_SYSTEM/reports/c2moviez-vault-audit-2026-05-27/11_yuri-process-log.md`
- `_SYSTEM/reports/c2moviez-vault-audit-2026-05-27/14_fanout-run-002-packets.md`
- `_SYSTEM/reports/c2moviez-vault-audit-2026-05-27/16_fanout-run-003-packets.md`
- `_SYSTEM/reports/c2moviez-vault-audit-2026-05-27/18_process-fanout-run-004-packets.md`

Questions:

- Does the master plan accurately describe actual execution after Runs 002/003?
- Does the process log record failures and invalidations honestly?
- Do packet contracts prevent shallow/fake coverage?

## R004_PROC_INVENTORY_OPUS - INVENTORY-004

Scope: repo truth inventory, source availability, and scope boundaries.

Files:

- `_SYSTEM/reports/c2moviez-vault-audit-2026-05-27/01_repo-truth-inventory.md`
- `_SYSTEM/reports/c2moviez-vault-audit-2026-05-27/00_master-plan.md`
- `_SYSTEM/reports/c2moviez-vault-audit-2026-05-27/15_fanout-run-002-results.md`
- `_SYSTEM/reports/c2moviez-vault-audit-2026-05-27/17_fanout-run-003-results.md`

Questions:

- Is source availability truthfully represented: GitHub-obtainable, blocked local state, provider/live state?
- Are untracked files, runtime state, provider dashboards, and local secrets clearly out of current evidence?
- Does the inventory still match clone SHA, tracked count, and branch scope?

## R004_PROC_LLMNAV_OPUS - PROCESS-NAV-004

Scope: process artifact navigationability for future lanes and final reporting.

Files:

- `_SYSTEM/reports/c2moviez-vault-audit-2026-05-27/00_master-plan.md`
- `_SYSTEM/reports/c2moviez-vault-audit-2026-05-27/10_exhaustive-coverage-ledger.md`
- `_SYSTEM/reports/c2moviez-vault-audit-2026-05-27/15_fanout-run-002-results.md`
- `_SYSTEM/reports/c2moviez-vault-audit-2026-05-27/16_fanout-run-003-packets.md`
- `_SYSTEM/reports/c2moviez-vault-audit-2026-05-27/17_fanout-run-003-results.md`

Questions:

- Can a future Rick lane locate its assigned work quickly?
- Are process artifacts split clearly or scattered?
- What index/table is missing for next-batch execution?
