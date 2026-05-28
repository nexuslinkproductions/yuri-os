# Fanout Run 002 Packets

Date: 2026-05-27
Purpose: corrected repo-truth fanout after C-137 solo V1 security frontier pass
Target repo: `c2moviezfpv/c2moviez-vault`
Repo URL: `https://github.com/c2moviezfpv/c2moviez-vault`
Canonical clone: `/tmp/yuri-c2moviez-vault-full.b1RopZ/repo`
Commit: `8103286e1abc63fa9490cb1375ecde4f340aa2bb`
Tracked files: `1505`
Mode: read-only, no target mutation, no live-service calls, no credential use

## Universal Repo-Truth Contract

Every lane must start with:

```text
REPO_PROOF lane=<lane> repo_url=https://github.com/c2moviezfpv/c2moviez-vault repo_origin=<origin-url> canonical_repo_path=/tmp/yuri-c2moviez-vault-full.b1RopZ/repo rev_parse=<sha> clean_status=<clean|dirty> tracked_file_count=1505 status=ok|fail
```

For every assigned file:

```text
PATH_PROOF path=<path> command="git -C /tmp/yuri-c2moviez-vault-full.b1RopZ/repo cat-file -e HEAD:<path>" status=exists|missing
READ_PROOF path=<path> command="git -C /tmp/yuri-c2moviez-vault-full.b1RopZ/repo show HEAD:<path> | nl -ba" first_line=<short> last_line=<short>
FILE_COVERAGE path=<path> method=git_object_show status=covered|partial|deferred lines=<n> words=<n> notes=<short>
```

Rules:

- Do not clone the repo again.
- Do not mutate the repo, providers, branches, files, issues, PRs, deployments, databases, Telegram, Supabase, Plane, Bexio, Outlook, Infomaniak, or Netlify.
- Do not use credentials, secrets, passwords, keys, tokens, or private material.
- Do not print raw secrets. Use fingerprints or refer to existing redacted findings only.
- Broad tree/list commands may create a queue, but they do not close coverage.
- Direct line/word inspection of assigned files is required.
- Output must be concise but evidence-bearing.

## Required Output Schema

```text
BATCH_OPEN lane=<lane> batch=<id> scope=<short>
REPO_PROOF ...
PATH_PROOF ...
READ_PROOF ...
FILE_COVERAGE ...
ARCH_MAP item=<component> path=<path:line> role=<role> connects_to=<other> confidence=<high|medium|low>
WIRING_FINDING id=<temp> path=<path:line> class=<broken|unclear|duplicated|stale|unsafe|strong> evidence=<short> impact=<short>
LLM_NAV_FINDING id=<temp> path=<path:line|dir> class=<good|bad|missing|stale|ambiguous> evidence=<short> impact_for_llm=<short>
SECURITY_CANDIDATE id=<temp> path=<path:line> class=<risk> evidence=<redacted> impact=<short> needs=<validation>
SUPPRESSION path=<path:line|file> hypothesis=<risk_or_wiring_issue> counterevidence=<exact>
DEFERRED path=<path|surface> reason=<blocker> next=<bounded_next>
BATCH_CLOSE lane=<lane> batch=<id> files_covered=<n> candidates=<n> suppressions=<n> deferred=<n>
```

## QUANTUM_RICK_OPUS - ARCH-001

Scope: first architecture and operator-entry map.

Files:

- `CLAUDE.md`
- `Home.md`
- `Dashboard-v2/package.json`
- `Dashboard-v2/svelte.config.js`
- `Dashboard-v2/vite.config.ts`
- `Dashboard-v2/src/routes/+layout.svelte`

Questions:

- What does the repo tell humans/LLMs this system is?
- Which runtime/deploy/build entrypoints are actually declared here?
- Does the operator-facing architecture match the code and package config?
- What would an LLM need to navigate this repo safely and efficiently?
- What navigation docs are stale, missing, or misleading?

## PRIME_RICK_OPUS - CYBER-ARCH-001

Scope: Telegram/Claude/MCP control chain and security architecture.

Files:

- `Scripts/telegram-mcp/poller.js`
- `Scripts/exeo-daemon.js`
- `Scripts/ai`
- `Scripts/lib/nex-system-prompt.md`
- `Scripts/telegram-mcp/server.js`

Questions:

- Is the end-to-end control path wired safely from Telegram input to Claude/tool output?
- Where are trust boundaries enforced versus merely described?
- Which links in the chain are brittle, over-privileged, or likely to hallucinate state?
- How should this be redesigned as a secure control plane?

## MAXIMUMS_RICKIMUS_OPUS - WIRING-001

Scope: dashboard backend shared wiring and internal authority.

Files:

- `Dashboard-v2/functions/shared.js`
- `Dashboard-v2/functions/shared-config.js`
- `Dashboard-v2/functions/shared-data.js`
- `Dashboard-v2/functions/shared-storage.js`
- `Dashboard-v2/functions/auth-check.js`
- `Dashboard-v2/functions/event-dispatch.js`

Questions:

- What shared helpers connect routes to auth, CORS, provider state, database state, and storage?
- Are shared helpers consistent or fragmented?
- Which assumptions make downstream functions look wired while actually failing, skipping, or drifting?
- What reusable architecture should be preserved?

## ZETA_ALPHA_RICK_OPUS - NAV-001

Scope: folder architecture, indexing, and LLM navigationability.

Files:

- `CLAUDE.md`
- `Home.md`
- `.gitignore`
- `.obsidian/app.json`
- `.obsidian/community-plugins.json`
- `Dashboard-v2/src/lib/db.ts`

Questions:

- Can an LLM quickly infer repo boundaries, active code, docs, client materials, generated artifacts, and dangerous surfaces?
- Are folder names, duplicate quoted folders, Obsidian config, and top-level docs helping or hurting navigation?
- Is the repo structured for safe agent use, or does it invite accidental reads/writes and context pollution?
- What index/navigation files are missing?

## RIQ_IV_OPUS - PROCESS-002

Scope: audit-process QA after V1 solo-run correction.

Files:

- `_SYSTEM/reports/c2moviez-vault-audit-2026-05-27/00_master-plan.md`
- `_SYSTEM/reports/c2moviez-vault-audit-2026-05-27/11_yuri-process-log.md`
- `_SYSTEM/reports/c2moviez-vault-audit-2026-05-27/12_fanout-packets.md`
- `_SYSTEM/reports/c2moviez-vault-audit-2026-05-27/13_final-master-audit.md`
- `_SYSTEM/reports/c2moviez-vault-audit-2026-05-27/14_fanout-run-002-packets.md`

Questions:

- Did C-137 clearly correct the previous solo-run/final-label error?
- Are the run-002 packets strict enough to prevent fake coverage?
- Are process claims clearly separated from target-repo evidence?
- What should be changed before the next larger batch?
