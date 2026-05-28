# Fanout Run 010 Packets

Date: 2026-05-27
Purpose: next sandboxed target-repo fanout after accepted Run 009
Target repo: `https://github.com/c2moviezfpv/c2moviez-vault`
Target clone: `/tmp/yuri-c2moviez-vault-full.b1RopZ/repo`
Target commit: `8103286e1abc63fa9490cb1375ecde4f340aa2bb`
Target tracked files: `1505`
Parallel lane cap: `3`
Mode: read-only, no target mutation, no target execution, no live service calls, no credential use
Worker model: Opus direct under persistent Claude/tmux sessions.

## Universal Repo-Truth Contract

Allowed commands:

- `git -C /tmp/yuri-c2moviez-vault-full.b1RopZ/repo rev-parse HEAD`
- `git -C /tmp/yuri-c2moviez-vault-full.b1RopZ/repo status --short`
- `git -C /tmp/yuri-c2moviez-vault-full.b1RopZ/repo ls-files -- <assigned-path>`
- `git -C /tmp/yuri-c2moviez-vault-full.b1RopZ/repo show HEAD:<assigned-path>`
- bounded `git -C ... grep`/`rg` only for caller/import/link checks tied to assigned files
- `wc`, `sed`, `nl`, `head`, `tail` on command output or assigned report artifacts

Forbidden:

- no writes or edits;
- no execution of target scripts;
- no package install/build/test;
- no live service calls;
- no credential use or validation;
- no raw secret printing;
- no runtime `.claude/projects`, `.claude/state`, `.claude/history`, `.claude/file-history`;
- no target `.env`, `backend/data`, `node_modules`, or `.amp`;
- no mutation of the canonical clone or Claudio's repository.

Coverage rule:

- Broad tree/list commands can orient a lane but cannot close coverage.
- Every covered target file requires `PATH_PROOF`, `READ_PROOF`, and `FILE_COVERAGE`.
- A file is not covered unless the lane inspects the file content semantically.
- Large lock/generated files can be marked `partial`, but only with exact reason.
- `repo_tracked_files`, `assigned_subtree_tracked_files`, and `files_covered` must not be conflated.

Required output rows:

```text
BATCH_OPEN lane=<lane> batch=<batch> scope=<scope>
RUN_PROOF lane=<lane> model=<model> sandbox=os-deny-protected-runtime status=<ok|failed>
REPO_PROOF commit=<sha> clean_status_count=<n> repo_tracked_files=<n>
PATH_PROOF path="<target-path>" command="<command>" status=<exists|missing>
READ_PROOF path="<target-path>" command="<command>" first_line="<summary>" last_line="<summary>"
FILE_COVERAGE path="<target-path>" method=<method> status=<covered|partial|deferred|invalidated> lines=<n|unknown> words=<n|unknown> notes="<short>"
FINDING id=<id> severity=<info|low|medium|high|critical> path="<target-path[:line]>" class=<security|wiring|architecture|llm_nav|stability|cost|positive> evidence="<repo evidence>" impact="<why it matters>" recommendation="<next action>"
SUPPRESSION path="<target-path>" hypothesis="<hypothesis>" counterevidence="<counterevidence>"
DEFERRED path="<target-path>" reason="<reason>" next="<next evidence/action>"
BATCH_CLOSE lane=<lane> batch=<batch> files_covered=<n> findings=<n> suppressions=<n> deferred=<n> invalidated=<0|1>
```

## R010_TEAM_BOTS_OPUS - TEAM-BOTS-010

Scope: team-bot and Fanny bot Telegram surfaces, pollers, outbound notification helper, team chat ID storage, startup wrappers, and local package surface.

Files:

- `Scripts/team-bots/fanny-bot.js`
- `Scripts/team-bots/team-bot.js`
- `Scripts/team-bots/team-poller.js`
- `Scripts/team-bots/notify.js`
- `Scripts/team-bots/team-config.js`
- `Scripts/team-bots/start-pollers.sh`
- `Scripts/team-bots/fanny-daemon-tmux.sh`
- `Scripts/team-bots/fanny-bot-tmux.sh`
- `Scripts/team-bots/chat-ids.json`
- `Scripts/team-bots/package.json`
- `Scripts/team-bots/package-lock.json`

Questions:

- Are inbound Telegram users/chat IDs allowlisted before any local queue, tmux, MCP, dashboard, or AI action?
- Are team chat IDs, bot identities, and target groups hardcoded, env-derived, or unsafe to publish?
- Can team bots trigger AI calls, dashboard functions, provider writes, or Supabase updates without clear authorization?
- Are polling loops bounded for timeout, offset handling, duplicate delivery, memory, and startup races?
- Are tokens retrieved from Keychain/env safely, without logging raw values or exporting unnecessarily?
- Could team/fanny bots explain Telegram control breakage, spam amplification, or hidden CPU/RAM load?

## R010_PRIME_QWEN_HEARTBEAT_OPUS - PRIME-QWEN-HEARTBEAT-010

Scope: prime prompt assembly, qwen fast-path, heartbeat/liveness helpers, CEO correction ingestion, and prompt/liveness false-assurance risks.

Files:

- `Scripts/build-prime.sh`
- `Scripts/qwen-fast.js`
- `Scripts/lib/heartbeat.sh`
- `Scripts/lib/heartbeat.js`
- `Scripts/lib/ceo-correction-detector.js`
- `Scripts/lib/nex-system-prompt.md`
- `Scripts/lib/reasoning-chain.js`
- `Scripts/lib/night-mode.js`

Questions:

- Can Supabase rows, CEO correction records, vault text, or other mutable data inject instructions into prime prompt assembly?
- Does `qwen-fast.js` validate input and output before bypassing the main Claude dispatch?
- Are heartbeat/liveness writes fail-safe, bounded, and truthful enough for command-center health?
- Do prompt/liveness helpers create false health, stale truth, or hidden authority escalation?
- Do helper scripts log secrets or sensitive prompt material?
- Which helpers are strengths that should be preserved?

## R010_SUPABASE_RLS_RPC_OPUS - SUPABASE-RLS-010

Scope: first Supabase schema/RLS/RPC/security migration batch, especially facts, auth hardening, RVF, coherence, local inference, and security invoker.

Files:

- `Dashboard-v2/db-migrations/003_security_hardening.sql`
- `Dashboard-v2/db-migrations/004_n1_auth_hardening.sql`
- `Dashboard-v2/db-migrations/005_n1_rls_lockdown.sql`
- `Dashboard-v2/db-migrations/007_nex_rag_foundation.sql`
- `Dashboard-v2/db-migrations/013_nex_h2_verification.sql`
- `Dashboard-v2/db-migrations/014_nex_coherence.sql`
- `Dashboard-v2/db-migrations/018_nex_local_inference_log.sql`
- `Scripts/migrations/2026-04-24-fix-view-security-invoker.sql`
- `Scripts/migrations/2026-04-27-phase-l-fact-ledger.sql`

Questions:

- Which tables have RLS enabled, which policies exist, and which rely on service-role bypass?
- Do RPC functions such as `assertFact`, `bless_fact`, verification helpers, and coherence hold paths enforce caller identity or assume trusted server-only callers?
- Do views use `security_invoker` where needed?
- Are facts, audit logs, local inference logs, retrieval logs, and storage-adjacent tables exposed to anon/authenticated roles?
- Do migrations contradict function-level assumptions found in Runs 008 and 009?
- Are SQL comments accurate enough for LLM navigation, or do they create false assurance?
