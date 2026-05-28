# Sandbox Repair Run 005 Packets

Date: 2026-05-27
Purpose: restart from the first invalidated process lane under OS-enforced sandboxing
Mode: read-only, process-artifact-only, no target mutation, no live service calls, no credential use

## Numbering Note

Run 005 is **not** a normal target-repo fanout.

Run 005 is a repair wrapper whose job is to rerun contaminated process lanes from earlier runs under an OS sandbox:

- `PROCESS-003-RERUN` repairs the invalidated Run 003 process lane.
- `FINDINGS-004-RERUN` repairs the invalidated Run 004 findings lane.
- `PLAN-004-RERUN` repairs the invalidated Run 004 plan lane.

Therefore the packet is named Run 005, while its lane batch names intentionally reference Runs 003 and 004. The next target-repo fanout after this repair is Run 006.

## Why This Exists

Run 003 invalidated `PROCESS-003` because a lane read protected `.claude/projects/...` material.

Run 004 proved the same failure mode can recur even when prompts explicitly forbid it. The fix for Run 005 is mechanical containment:

- launch repair lanes through `sandbox-exec`;
- deny file read/write access to real Claude runtime transcript/memory surfaces:
  - `/Users/marcelspatz/.claude/projects`
  - `/Users/marcelspatz/.claude/state`
  - `/Users/marcelspatz/.claude/history`
  - `/Users/marcelspatz/.claude/file-history`
  - `/Users/marcelspatz/YURI-OS-MUSUBI/.claude/projects`
  - `/Users/marcelspatz/YURI-OS-MUSUBI/.claude/state`
  - `/Users/marcelspatz/YURI-OS-MUSUBI/.claude/history`
  - `/Users/marcelspatz/YURI-OS-MUSUBI/.claude/file-history`
- keep Bash-only operation;
- disable edit tools;
- accept no lane output if the transcript shows protected-path access or sandbox denial bypass.

## Universal Contract

Allowed:

- read only the explicitly assigned report artifacts;
- use `sed`, `rg`, `wc`, `head`, `tail`, `nl`, `git -C /tmp/yuri-c2moviez-vault-full.b1RopZ/repo ...` clone-proof commands when assigned;
- output structured evidence rows.

Forbidden:

- no reads from `.claude/`, `.env`, `backend/data/`, `node_modules/`, or `.amp`;
- no memory search;
- no `cat` against protected runtime/cache paths;
- no writes;
- no use of any discovered credential;
- no live service calls.

Required output rows:

```text
BATCH_OPEN lane=<lane> batch=<batch> scope=<scope>
RUN_PROOF lane=<lane> model=<model> sandbox=os-deny-protected-runtime status=<ok|failed>
PATH_PROOF path="<path>" command="<command>" status=<exists|missing>
READ_PROOF path="<path>" command="<command>" first_line="<redacted/summary>" last_line="<redacted/summary>"
FILE_COVERAGE path="<path>" method=<method> status=<covered|partial|deferred|invalidated> lines=<n|unknown> words=<n|unknown> notes="<short>"
PROCESS_FINDING id=<id> path="<path>" class=<good|gap|risk|correction_needed> evidence="<local evidence>" impact="<why it matters>"
SUPPRESSION path="<path>" hypothesis="<hypothesis>" counterevidence="<counterevidence>"
DEFERRED path="<path>" reason="<reason>" next="<next evidence/action>"
BATCH_CLOSE lane=<lane> batch=<batch> files_covered=<n> findings=<n> suppressions=<n> deferred=<n> invalidated=<0|1>
```

## R005_RIQ_PROCESS_OPUS - PROCESS-003-RERUN

Scope: rerun the first invalidated process lane from Run 003.

Files:

- `_SYSTEM/reports/c2moviez-vault-audit-2026-05-27/01_repo-truth-inventory.md`
- `_SYSTEM/reports/c2moviez-vault-audit-2026-05-27/06_security-findings.md`
- `_SYSTEM/reports/c2moviez-vault-audit-2026-05-27/10_exhaustive-coverage-ledger.md`
- `_SYSTEM/reports/c2moviez-vault-audit-2026-05-27/15_fanout-run-002-results.md`
- `_SYSTEM/reports/c2moviez-vault-audit-2026-05-27/16_fanout-run-003-packets.md`

Questions:

- Does the inventory align with the canonical clone and Run 002/003 findings?
- Are security findings lifecycle-tagged and redacted correctly?
- Does the exhaustive coverage ledger actually support micro-batch burn-down?
- What must be fixed before Run 003 results are integrated?

## R005_FINDINGS_PROCESS_OPUS - FINDINGS-004-RERUN

Scope: rerun the invalidated Run 004 findings lifecycle lane.

Files:

- `_SYSTEM/reports/c2moviez-vault-audit-2026-05-27/06_security-findings.md`
- `_SYSTEM/reports/c2moviez-vault-audit-2026-05-27/13_final-master-audit.md`
- `_SYSTEM/reports/c2moviez-vault-audit-2026-05-27/15_fanout-run-002-results.md`
- `_SYSTEM/reports/c2moviez-vault-audit-2026-05-27/17_fanout-run-003-results.md`
- `_SYSTEM/reports/c2moviez-vault-audit-2026-05-27/19_process-fanout-run-004-results.md`

Questions:

- Which accepted Run 002/003 security candidates are missing from `06_security-findings.md`?
- Are lifecycle states clear enough: `CANDIDATE`, `VALIDATED`, `SUPPRESSED`, `DEFERRED`, `REPORTABLE`?
- Are raw secrets avoided and `use_status=NOT_USED` preserved?
- Did Run 004 correctly invalidate contaminated lane output?

## R005_PLAN_PROCESS_OPUS - PLAN-004-RERUN

Scope: rerun the invalidated Run 004 master-plan/process-log alignment lane.

Files:

- `_SYSTEM/reports/c2moviez-vault-audit-2026-05-27/00_master-plan.md`
- `_SYSTEM/reports/c2moviez-vault-audit-2026-05-27/11_yuri-process-log.md`
- `_SYSTEM/reports/c2moviez-vault-audit-2026-05-27/14_fanout-run-002-packets.md`
- `_SYSTEM/reports/c2moviez-vault-audit-2026-05-27/16_fanout-run-003-packets.md`
- `_SYSTEM/reports/c2moviez-vault-audit-2026-05-27/18_process-fanout-run-004-packets.md`
- `_SYSTEM/reports/c2moviez-vault-audit-2026-05-27/19_process-fanout-run-004-results.md`

Questions:

- Does the master plan accurately describe actual execution after Runs 002, 003, and 004?
- Does the process log record failures, invalidations, and the sandbox repair honestly?
- Do packet contracts prevent shallow/fake coverage?
- What packet/launcher constraints are required before the next target fanout?
