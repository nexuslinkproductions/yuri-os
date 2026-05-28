# Fanout Packets

Date: 2026-05-27
Target repo: `c2moviezfpv/c2moviez-vault`
Target repo URL: `https://github.com/c2moviezfpv/c2moviez-vault`
Target clone origin: `https://github.com/c2moviezfpv/c2moviez-vault.git`
Target commit: `8103286e1abc63fa9490cb1375ecde4f340aa2bb`
Canonical full read-only clone: `/tmp/yuri-c2moviez-vault-full.b1RopZ/repo`
Mode: read-only, surgical, redacted-sensitive, no target mutation

These packets are instructions for persistent Rick lanes. They are advisory lanes only; C-137 remains responsible for verification, arbitration, and final findings.

## Status

Batch 001 is invalidated. It did not meet Marcel's repo-truth grounding standard because the packets gave a clone path and file list but did not force proof that lanes read target files from the Git object database. No Batch 001 lane output counts as coverage.

## Repo Source Contract

Every future target-repo packet must include and obey this contract.

```text
REPO_SOURCE_CONTRACT
repo_name=c2moviezfpv/c2moviez-vault
repo_url=https://github.com/c2moviezfpv/c2moviez-vault
repo_origin=https://github.com/c2moviezfpv/c2moviez-vault.git
canonical_repo_mode=single_shared_full_materialized_clone
canonical_repo_path=/tmp/yuri-c2moviez-vault-full.b1RopZ/repo
commit=8103286e1abc63fa9490cb1375ecde4f340aa2bb
source_of_truth=git_object_database
worktree_materialized=true
tracked_file_count=1505
canonical_clone_command=git clone https://github.com/c2moviezfpv/c2moviez-vault.git /tmp/yuri-c2moviez-vault-full.b1RopZ/repo
repo_origin_command=git -C /tmp/yuri-c2moviez-vault-full.b1RopZ/repo remote get-url origin
repo_commit_command=git -C /tmp/yuri-c2moviez-vault-full.b1RopZ/repo rev-parse HEAD
repo_clean_command=git -C /tmp/yuri-c2moviez-vault-full.b1RopZ/repo status --short
target_file_read_command=git -C /tmp/yuri-c2moviez-vault-full.b1RopZ/repo show HEAD:<path>
target_file_line_command=git -C /tmp/yuri-c2moviez-vault-full.b1RopZ/repo show HEAD:<path> | nl -ba
target_file_presence_command=git -C /tmp/yuri-c2moviez-vault-full.b1RopZ/repo cat-file -e HEAD:<path>
supplemental_worktree_read_allowed_after_read_proof=true
forbidden_for_target_files=Claude_Read_tool_without_REPO_PROOF, unproven_worktree_claim, broad grep as coverage
```

Required first output from every lane:

```text
REPO_PROOF lane=<lane> pwd=<pwd> repo_url=https://github.com/c2moviezfpv/c2moviez-vault repo_origin=<origin-url> canonical_repo_path=/tmp/yuri-c2moviez-vault-full.b1RopZ/repo rev_parse=<40-char sha> clean_status=<clean|dirty> tracked_file_count=1505 status=ok|fail
PATH_PROOF path=<path> command="git -C /tmp/yuri-c2moviez-vault-full.b1RopZ/repo cat-file -e HEAD:<path>" status=exists|missing
READ_PROOF path=<path> command="git -C /tmp/yuri-c2moviez-vault-full.b1RopZ/repo show HEAD:<path> | nl -ba" first_line=<n: redacted/short> last_line=<n: redacted/short>
```

Rules:

- C-137 maintains one canonical full read-only clone from `https://github.com/c2moviezfpv/c2moviez-vault.git`. Do not clone the full target repo repeatedly for every lane.
- Rick lanes inspect the canonical clone directly. File coverage counts only when the lane emits `REPO_PROOF`, `PATH_PROOF`, and `READ_PROOF` from the canonical clone.
- The canonical clone has a materialized working tree and clean status. Lanes may use worktree reads as supplemental inspection after `READ_PROOF`, but final evidence must cite Git-object-backed path/line proof.
- `git pull` is not the standard command during the audit because it can move or merge a branch. If the canonical clone is missing or invalid, C-137 recreates it once with `git clone --no-checkout --filter=blob:none`, logs the new path, and freezes the commit again.
- If `repo_origin` is not `https://github.com/c2moviezfpv/c2moviez-vault.git`, stop.
- If `rev_parse` is not `8103286e1abc63fa9490cb1375ecde4f340aa2bb`, stop.
- If any assigned path is missing from `git cat-file -e HEAD:<path>`, mark it `DEFERRED path=<path> reason=missing_from_commit` and stop for C-137 arbitration.
- A lane may not say a file "does not exist" unless `git cat-file -e HEAD:<path>` fails.
- Target-file coverage is valid only when the lane shows the Git object command it used.
- A target-file `FILE_COVERAGE` row without matching `READ_PROOF` is invalid.

## Global Lane Rules

- Use only the persistent tmux/CLI lane assigned to you.
- Inspect the target repository directly at the frozen commit.
- Do not mutate the target repo, live services, provider accounts, local runtime state, issue trackers, deploys, branches, files, or credentials.
- Do not run install scripts, servers, bots, daemons, webhooks, package lifecycle scripts, tests that call providers, or production automations.
- Do not use discovered credentials or passwords for any API call, login, replay, validation, rotation, or proof.
- Do not print raw secrets, passwords, private keys, tokens, customer payloads, or provider responses into the lane output.
- Work surgically: one bounded batch at a time, no broad repository scans as a substitute for line/word inspection.
- `git ls-tree` may be used for small path manifests. `rg`/`grep` may be used only inside the listed batch files or directories for queueing follow-up rows.
- Every claim must cite exact path and line evidence when available.
- Every file in a batch must produce a `FILE_COVERAGE` row even when there is no finding.

## Retry Canary

Before any full fanout relaunch, run one repo-truth canary lane.

Canary files:

- `CLAUDE.md`
- `Dashboard-v2/package.json`
- `Dashboard-v2/functions/shared.js`

Canary closure:

- lane emits `REPO_PROOF`;
- `REPO_PROOF` includes `repo_url=https://github.com/c2moviezfpv/c2moviez-vault` and `repo_origin=https://github.com/c2moviezfpv/c2moviez-vault.git`;
- lane emits `PATH_PROOF` for all three files;
- lane emits `READ_PROOF` for all three files using Git object commands;
- lane emits `FILE_COVERAGE` for all three files;
- lane emits `BATCH_CLOSE`;
- C-137 independently spot-checks the same three files.

## Required Output Format

```text
BATCH_OPEN lane=<lane> batch=<id> commit=8103286e1abc63fa9490cb1375ecde4f340aa2bb scope=<short scope>
FILE_COVERAGE path=<path> method=<read_method> status=covered|partial|deferred lines=<n|unknown> words=<n|unknown> notes=<short notes>
CANDIDATE id=<lane-temp-id> path=<path:line> class=<risk class> evidence=<short redacted evidence> impact=<plausible impact> needs=<validation needed>
SUPPRESSION path=<path:line|file> hypothesis=<risk considered> counterevidence=<exact reason>
DEFERRED path=<path|surface> reason=<exact blocker> next=<bounded next step>
BATCH_CLOSE lane=<lane> batch=<id> files_covered=<n> candidates=<n> suppressions=<n> deferred=<n>
```

## Secret-Bearing File Rule

Known secret-bearing files are not copied raw into lane output. If a lane must inspect a known secret-bearing file, it must either:

- use a C-137 redacted evidence row already recorded in `01_repo-truth-inventory.md` or `06_security-findings.md`; or
- run a local redaction/fingerprint command that prints only type, line, length, and hash fingerprint.

The first known secret-bearing target is `.obsidian/plugins/obsidian-local-rest-api/data.json`, already represented as `C2V-SEC-001` and `C2V-SEC-002`.

## COP_RICK_OPUS - Batch CRED-001

Purpose: inspect the first local-control/security slice around Obsidian Local REST API without expanding into the whole vault.

Files:

- `.obsidian/plugins/obsidian-local-rest-api/manifest.json`
- `.obsidian/plugins/obsidian-local-rest-api/main.js`
- `.obsidian/plugins/obsidian-local-rest-api/styles.css`
- `Dashboard-v2/functions/auth.js`
- `Dashboard-v2/functions/auth-check.js`

Questions:

- Does the plugin or related local-control surface expose auth, bind, CORS, TLS, or filesystem-write risk?
- Do dashboard auth helpers fail closed on missing secrets or invalid sessions?
- Are credentials logged, echoed, defaulted, or accepted through unsafe fallback?
- Are write/admin routes protected by consistent authorization checks?

Do not read or print raw `.obsidian/plugins/obsidian-local-rest-api/data.json`; use `C2V-SEC-001` and `C2V-SEC-002` as the redacted evidence rows for that file until C-137 provides a redacted extractor.

## MAXIMUMS_RICKIMUS_OPUS - Batch CODE-001

Purpose: inspect the first code-wiring slice for agent/backend data flow and mutation authority.

Files:

- `Dashboard-v2/functions/chat.js`
- `Dashboard-v2/functions/shared.js`
- `Dashboard-v2/functions/shared-data.js`
- `Dashboard-v2/functions/shared-storage.js`
- `Dashboard-v2/functions/mcp-server.js`

Questions:

- What are the request entrypoints, auth checks, tool calls, provider calls, and write sinks?
- Which code paths can trigger model calls, file writes, storage writes, Supabase writes, Telegram sends, or MCP actions?
- Do function boundaries make it easy for a model/dashboard claim to pretend a backend action succeeded?
- Where can untrusted user/client/provider text cross into agent prompts, commands, database writes, or filesystem writes?

## ZETA_ALPHA_RICK_OPUS - Batch DOCS-001

Purpose: inspect the first navigation and claim-truth slice without sampling broad docs.

Files:

- `CLAUDE.md`
- `Dashboard-v2/package.json`
- `Dashboard-v2/functions/package.json`
- `Dashboard-v2/svelte.config.js`
- `Dashboard-v2/vite.config.ts`

Questions:

- What does the repo tell operators or Claude to do?
- Do package scripts, configs, and docs imply runtime actions that are unsafe, stale, or not wired?
- Are there scripts that can mutate provider state, deploy, run daemons, or conceal production assumptions?
- Does the documented command surface match the actual code architecture?

## RIQ_IV_OPUS - Batch EVIDENCE-001

Purpose: inspect YURI evidence discipline before findings spread.

Inputs:

- `00_master-plan.md`
- `01_repo-truth-inventory.md`
- `06_security-findings.md`
- `10_exhaustive-coverage-ledger.md`
- `11_yuri-process-log.md`
- `12_fanout-packets.md`

Questions:

- Are there any unverified claims pretending to be repo truth?
- Are any raw secrets or sensitive values present in the reports?
- Are scope boundaries, live-service rules, and read-only constraints internally consistent?
- Are the Rick packets surgical enough, or still too broad?

RIQ IV does not inspect Claudio's repo for product findings in this batch. It audits the audit process before broader lane output accumulates.
