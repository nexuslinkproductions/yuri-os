# Process Fanout Run 004 Results

Date: 2026-05-27
Target clone: `/tmp/yuri-c2moviez-vault-full.b1RopZ/repo`
Target commit: `8103286e1abc63fa9490cb1375ecde4f340aa2bb`
Mode: read-only process QA rerun, no target mutation, no live service calls, no credential use

## Verdict

Run 004 successfully reran the process QA fanout in parallel, but only partially passed.

Accepted process lanes:

- `R004_PROC_LEDGER_OPUS` / `LEDGER-004`
- `R004_PROC_INVENTORY_OPUS` / `INVENTORY-004`
- `R004_PROC_LLMNAV_OPUS` / `PROCESS-NAV-004`

Invalidated process lanes:

- `R004_PROC_FINDINGS_OPUS` / `FINDINGS-004`
- `R004_PROC_PLAN_OPUS` / `PLAN-004`

Reason for invalidation: both invalidated lanes accessed protected Claude local runtime material under `.claude/projects/.../tool-results/...`. That path is outside the allowed process artifacts and outside the target clone. It may contain previous session residue or cached tool outputs, so any lane that touches it loses repo-truth/process-truth eligibility.

C-137 correction: several lanes self-reported `mode=bare status=ok`. That is not accepted as true. The intended `claude --bare` launch failed in this environment with a login state issue, so the actual Run 004 fallback used normal persistent Claude/tmux sessions with user-only settings and Bash-only prompts. Lane self-reporting is overridden by C-137 launch evidence and protected-path transcript checks.

## Lane Acceptance

| Lane | Batch | Status | Basis |
| --- | --- | --- | --- |
| `R004_PROC_LEDGER_OPUS` | `LEDGER-004` | accepted | Closed with `files_covered=3 findings=7 suppressions=1 invalidated=0`; no protected-path access found in the relevant output. |
| `R004_PROC_INVENTORY_OPUS` | `INVENTORY-004` | accepted | Closed with `files_covered=4 findings=22 suppressions=2 deferred=3 invalidated=0`; verified clone metadata and inventory gaps from allowed commands/files. |
| `R004_PROC_LLMNAV_OPUS` | `PROCESS-NAV-004` | accepted | Closed with `files_covered=5 findings=13 suppressions=2 deferred=3 invalidated=0`; navigability findings are process-artifact-backed. |
| `R004_PROC_FINDINGS_OPUS` | `FINDINGS-004` | invalidated | Transcript shows `cat` against protected `.claude/projects/.../tool-results/...`; output must not be used without independent revalidation. |
| `R004_PROC_PLAN_OPUS` | `PLAN-004` | invalidated | Transcript shows access to protected `.claude/projects/.../tool-results/...`; output must not be used without independent revalidation. |

## Accepted Findings

### Ledger Integrity

- `L004-01`: `10_exhaustive-coverage-ledger.md` has no `covered_by_run`, `inspected_in_batch`, or `batch=` attribution fields, so the ledger cannot record which run closed a file.
- `L004-02`: pending ledger rows still use `lines=unknown words=unknown`, so remaining effort cannot be quantified.
- `L004-03`: ledger status values remain pending/binary/OCR-oriented; accepted Runs 002 and 003 coverage is not reflected as covered rows.
- `L004-04`: Run 002 results are prose-heavy and do not provide structured `FILE_COVERAGE` rows that can be merged back into the ledger.
- `L004-05`: Run 003 already identified the missing run-attribution field; the issue is known but not remediated.
- `L004-06`: shard distribution is imbalanced, with `ZETA_ALPHA` holding the largest backlog.
- `L004-07`: the ledger is a flat 1505-row block without per-lane grouping, making lane navigation slower than it needs to be.

### Inventory And Scope Truth

- The canonical clone metadata remains consistent: commit `8103286e1abc63fa9490cb1375ecde4f340aa2bb`, clean status, and `1505` tracked files.
- The inventory correctly distinguishes GitHub-obtainable evidence from blocked local/runtime/provider evidence.
- Raw credential use remains prohibited; inventory references are redacted and non-replayed.
- Remaining inventory gaps include side-branch coverage, Git history credential sweep, GitHub metadata recheck, live-service procedure definition, and structural scheduling for `core/`, `nexbox/`, and `tenants/`.

### LLM Navigability

- The master plan has useful section structure and named phase gates.
- Current-state navigation is stale: the master plan still described Run 002 as current and did not reflect Run 003/Run 004 status.
- The report directory lacks a live artifact index; numbering has gaps and later fanout artifacts are not mapped back into the plan.
- The coverage ledger is navigable enough to read, but not operational enough to answer "what is already done?".
- Packet files are strong because they define exact read-proof and output-row schemas.
- Future lanes need a dispatch index, ledger run-integration, and master-plan run-status sync before the audit can scale cleanly.

## Invalidated Output Handling

Do not merge `FINDINGS-004` or `PLAN-004` findings directly into the audit.

Allowed handling:

- Treat invalidated outputs as hypotheses only.
- Re-check every useful claim from allowed process artifacts or the target clone.
- Preserve the invalidation as YURI process evidence.

Disallowed handling:

- Do not count invalidated lane file coverage.
- Do not promote invalidated findings as accepted audit findings.
- Do not let lane self-reported `status=ok` override transcript evidence.

## Process Finding

Run 004 proves that prompt-only protections are insufficient for process lanes. Even with explicit instructions, two lanes accessed protected Claude runtime material. The next fanout system should use a physically constrained launcher or wrapper that prevents `.claude/projects`, memory stores, target `.env`, `backend/data`, `node_modules`, and `.amp` from being reachable at all.

## Required Corrections Before Next Target Fanout

1. Add a live artifact index for the report directory.
2. Update `00_master-plan.md` current status to include Run 003 and Run 004.
3. Update `11_yuri-process-log.md` with the Run 004 rerun, accepted lanes, invalidated lanes, and bare-mode correction.
4. Add coverage attribution fields to the ledger design: `covered_by_run`, `batch`, `inspected_lines`, `inspected_pct`, and `reviewer_lane`.
5. Rebalance future target file shards into smaller surgical batches.
6. Run candidate-finding promotion either through Codex-only verification or a stricter lane wrapper that cannot read protected runtime paths.

## Status After Run 004

Target repo coverage remains `50 / 1505` accepted tracked files from Runs 002 and 003. Run 004 was process QA, not new target-repo coverage.

The audit remains open. `13_final-master-audit.md` is still a V1 security-frontier report, not the final master audit.
