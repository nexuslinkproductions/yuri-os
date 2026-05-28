# Run 003/004 Sandbox Repair Results

Date: 2026-05-27
Repair wrapper: Run 005 sandboxed process fanout
Scope: repair invalidated Run 003 and Run 004 process lanes
Mode: read-only, sandboxed, no target mutation, no live service calls, no credential use

## Numbering Note

Run 005 was a sandboxed repair wrapper, not a new target-repo fanout. Its batch names intentionally reference the earlier invalidated lanes they repaired:

- `PROCESS-003-RERUN` repaired Run 003.
- `FINDINGS-004-RERUN` repaired Run 004.
- `PLAN-004-RERUN` repaired Run 004.

The next normal target-repo fanout is Run 006.

## Verdict

The invalidated process material from Runs 003 and 004 has been rerun under an OS-enforced sandbox and accepted.

Accepted repaired lanes:

- Run 003 repair: `R005_RIQ_PROCESS_OPUS` / `PROCESS-003-RERUN`
- Run 004 repair: `R005_FINDINGS_PROCESS_OPUS` / `FINDINGS-004-RERUN`
- Run 004 repair: `R005_PLAN_PROCESS_OPUS` / `PLAN-004-RERUN`

All three repaired lanes closed with `invalidated=0`.

Verifier note: C-137 scanned the Run 005 v2 pipe logs for actual protected runtime access patterns, including `.claude/projects/.../tool-results`, `Searched memories`, and protected-path shell commands. No actual protected runtime read was accepted in the repaired lanes.

## Sandbox Correction

The first Run 005 launcher attempt was too narrow: `Bash`-only lanes could not read the assigned packet file and self-invalidated. That was a launcher calibration failure, not an audit finding.

The accepted Run 005 v2 launcher used:

- Claude persistent tmux sessions;
- Sonnet profile load, then Opus escalation;
- `sandbox-exec` OS denial for real Claude runtime paths:
  - `/Users/marcelspatz/.claude/projects`
  - `/Users/marcelspatz/.claude/state`
  - `/Users/marcelspatz/.claude/history`
  - `/Users/marcelspatz/.claude/file-history`
  - YURI-local `.claude/projects`, `.claude/state`, `.claude/history`, `.claude/file-history`
- `Read,Bash` tools only;
- edit tools disabled;
- protected target/runtime paths still forbidden.

This is the current required launcher shape for process lanes.

## Repaired Run 003: PROCESS-003-RERUN

Lane: `R005_RIQ_PROCESS_OPUS`

Closed:

```text
BATCH_CLOSE lane=R005_RIQ_PROCESS_OPUS batch=PROCESS-003-RERUN files_covered=5 findings=14 suppressions=2 deferred=1 invalidated=0
```

Key accepted findings:

- Inventory and ledger directory counts disagree for `02-Clients` and `Scripts`; a recount against `git ls-files` is required before burn-down math is trusted.
- The coverage ledger has 1505 rows, but all target rows still lack usable line/word counts and no file has transitioned to `covered`.
- The ledger lacks `batch_id`, `covered_by_run`, `covering_lane`, and transition timestamp fields.
- Run 003 introduced `QUANTUM_RICK_OPUS` and `PRIME_RICK_OPUS` lanes, but the ledger still only carries the older shard lane names.
- `06_security-findings.md` is correctly redacted for its two existing credential findings, but it has not ingested accepted Run 002 security candidates.
- Current findings lifecycle labels are inconsistent and need a canonical enum such as `CANDIDATE`, `VALIDATED`, `SUPPRESSED`, `DEFERRED`, `REPORTABLE`.

## Repaired Run 004: FINDINGS-004-RERUN

Lane: `R005_FINDINGS_PROCESS_OPUS`

Closed:

```text
BATCH_CLOSE lane=r005-findings batch=FINDINGS-004-RERUN files_covered=5 findings=10 suppressions=1 deferred=1 invalidated=0
```

Key accepted findings:

- `06_security-findings.md` only contains `C2V-SEC-001` and `C2V-SEC-002`; later accepted candidates are not promoted into the canonical findings file.
- The V1 risk register contains `C2V-SEC-003` through `C2V-SEC-016`, and Run 003 adds further accepted lane candidates that are not canonicalized.
- Findings lifecycle states are not implemented as a state machine. Existing artifacts use incompatible vocabularies.
- Credential hygiene remains good in the inspected findings artifacts: fingerprint-only, no raw values, and `NOT_USED` preserved.
- Run 004 correctly invalidated contaminated `FINDINGS-004` and `PLAN-004` output; the remaining gap is that exact offending transcript lines should be preserved in durable results.

## Repaired Run 004: PLAN-004-RERUN

Lane: `R005_PLAN_PROCESS_OPUS`

Closed:

```text
BATCH_CLOSE lane=R005_PLAN_PROCESS_OPUS batch=PLAN-004-RERUN files_covered=6 findings=22 suppressions=2 deferred=2 invalidated=0
```

Key accepted findings:

- The master plan Run Status now correctly references Runs 002, 003, and 004.
- Stale sections remain in the master plan: the old “Immediate Next Step” and the burn-down section’s `Current Run 002 status` do not reflect later runs.
- The process log honestly records Batch 001 invalidation, Run 003 process invalidation, Run 004 bare-mode failure, Run 004 protected-path invalidations, and lane self-report override.
- The process log needs a Run 005 sandbox repair entry.
- Run 002/003 target-lane packet contracts are strong against fake coverage because they require per-file proof.
- Run 004 process-lane contracts had sound schemas but failed because enforcement was prompt-only.
- Run 005’s OS-level sandbox is the required correction before further process fanout.

## Remaining Blockers Before More Broad Fanout

1. Add a Run 005 entry to the process log.
2. Reconcile inventory vs. ledger path-count drift using the canonical clone.
3. Extend the coverage ledger schema so accepted files can be marked by run, batch, lane, and timestamp.
4. Promote accepted Run 002 and Run 003 security candidates into `06_security-findings.md` as lifecycle rows.
5. Add a live artifact index for the report directory.
6. Update stale master-plan sections that still describe pre-Run-002 state.
7. Preserve exact offending transcript snippets for future invalidations so re-verification does not depend on ephemeral tmux logs.

## Coverage Status

Run 003/004 sandbox repair adds process-truth coverage, not new target-repo file coverage.

Accepted target-repo coverage remains `50 / 1505` tracked files from Runs 002 and 003.

The audit remains open.
