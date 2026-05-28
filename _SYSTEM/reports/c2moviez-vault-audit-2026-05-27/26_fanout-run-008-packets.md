# Fanout Run 008 Packets

Date: 2026-05-27
Purpose: next sandboxed target-repo fanout after accepted Run 007
Target clone: `/tmp/yuri-c2moviez-vault-full.b1RopZ/repo`
Target commit: `8103286e1abc63fa9490cb1375ecde4f340aa2bb`
Parallel lane cap: `3`
Mode: read-only, no target mutation, no target execution, no live service calls, no credential use
Worker model: Opus direct under persistent Claude/tmux sessions. Run 007 showed that fresh isolated Sonnet workers may reject authorized packets when they cannot see the parent authorization transcript.

## Launch Rule

Run 008 lanes must be launched as persistent Claude/tmux sessions:

1. Start each lane as a persistent Opus Claude CLI session.
2. Use the OS sandbox profile that denies protected Claude runtime paths.
3. Send only the scoped packet prompt for the assigned lane.
4. Keep active lanes capped at `3`.

All Run 008 lanes must run under the OS sandbox profile that denies protected Claude runtime paths:

- `/Users/marcelspatz/.claude/projects`
- `/Users/marcelspatz/.claude/state`
- `/Users/marcelspatz/.claude/history`
- `/Users/marcelspatz/.claude/file-history`
- YURI-local `.claude/projects`, `.claude/state`, `.claude/history`, `.claude/file-history`

The target repository's tracked `.claude/agents` files are in scope only when explicitly assigned and accessed through the canonical clone with `git -C`. They are not assigned in Run 008.

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
- no target `.env`, `backend/data`, `node_modules`, or `.amp`.

Coverage rule:

- Broad tree/list commands can orient a lane but cannot close coverage.
- Every covered target file requires `PATH_PROOF`, `READ_PROOF`, and `FILE_COVERAGE`.
- A file is not covered unless the lane inspects the file content semantically.
- Large files can use full `git show` plus targeted cross-reference commands, but must disclose if any section was only sampled.

Required output rows:

```text
BATCH_OPEN lane=<lane> batch=<batch> scope=<scope>
RUN_PROOF lane=<lane> model=<model> sandbox=os-deny-protected-runtime status=<ok|failed>
REPO_PROOF commit=<sha> clean_status_count=<n> tracked_files=<n>
PATH_PROOF path="<target-path>" command="<command>" status=<exists|missing>
READ_PROOF path="<target-path>" command="<command>" first_line="<summary>" last_line="<summary>"
FILE_COVERAGE path="<target-path>" method=<method> status=<covered|partial|deferred|invalidated> lines=<n|unknown> words=<n|unknown> notes="<short>"
FINDING id=<id> severity=<info|low|medium|high|critical> path="<target-path[:line]>" class=<security|wiring|architecture|llm_nav|stability|cost|positive> evidence="<repo evidence>" impact="<why it matters>" recommendation="<next action>"
SUPPRESSION path="<target-path>" hypothesis="<hypothesis>" counterevidence="<counterevidence>"
DEFERRED path="<target-path>" reason="<reason>" next="<next evidence/action>"
BATCH_CLOSE lane=<lane> batch=<batch> files_covered=<n> findings=<n> suppressions=<n> deferred=<n> invalidated=<0|1>
```

## R008_EXTERNAL_FUNCTIONS_OPUS - EXTERNAL-FUNCTIONS-008

Scope: public/external-facing dashboard functions, provider callbacks, service-role fallback, internal-key consistency, and provider secret/log hygiene.

Files:

- `Dashboard-v2/functions/outlook-subscribe.js`
- `Dashboard-v2/functions/outlook-webhook.js`
- `Dashboard-v2/functions/outlook-sync.js`
- `Dashboard-v2/functions/plane-webhook.js`
- `Dashboard-v2/functions/event-dispatch.js`
- `Dashboard-v2/functions/offer-create.js`
- `Dashboard-v2/functions/offer-accept.js`
- `Dashboard-v2/functions/fanny-ai.js`
- `Dashboard-v2/functions/marketing-studio.js`
- `Dashboard-v2/functions/nexbox-fleet.js`
- `Dashboard-v2/functions/health.js`

Questions:

- Which endpoints are externally callable, scheduler callable, webhook callable, or dashboard-session callable?
- Are `checkAuth`, HMAC internal auth, legacy `X-Internal-Key`, provider webhook secrets, and raw custom auth applied consistently?
- Do any functions silently downgrade from service-role to anon credentials, or operate with overbroad service-role authority?
- Do provider callbacks validate origin, state/clientState, method, body shape, and replay/idempotency?
- Are tokens, provider responses, or sensitive payloads logged or reflected in responses?
- Could these functions explain false dashboard health, broken provider sync, duplicated notifications, or high CPU/RAM?

## R008_TELEGRAM_MCP_OPUS - TELEGRAM-MCP-008

Scope: Telegram MCP server/pollers, inbox write path, tmux/daemon bridge, startup scripts, auth/rate bounds, and prompt-injection controls.

Files:

- `Scripts/telegram-mcp/server.js`
- `Scripts/telegram-mcp/poller.js`
- `Scripts/telegram-mcp/silas-poller.js`
- `Scripts/telegram-mcp/package.json`
- `Scripts/telegram-mcp/package-lock.json`
- `Scripts/start-claude-telegram.sh`
- `Scripts/start-diagnostics.sh`

Questions:

- How do Telegram messages enter `/tmp/telegram-inbox.jsonl` and wake the EXEO/NEX daemon?
- Are sender/chat allowlists enforced before inbox append, before tmux wake, and before MCP tool side effects?
- Can MCP tools send arbitrary Telegram messages, clear inboxes, or expose messages without strong authorization?
- Are poll loops bounded for rate, memory, retry, stale offset, and duplicate delivery?
- Are startup scripts safe, portable, and consistent with the documented command-center architecture?
- Could this side of the chain explain Claudio's Telegram command-system breakage or runaway resource use?

## R008_RVF_WRITE_AUTHORITY_OPUS - RVF-WRITE-008

Scope: RVF/RAG vault indexing and write-back authority, path boundaries, stale index risk, local-model/resource bounds, and LLM navigability.

Files:

- `Scripts/nex-rvf/server.js`
- `Scripts/nex-rvf/loop-b.js`
- `Scripts/nex-rvf/promote.js`
- `Scripts/nex-rvf/bless-vault-frontmatter.js`
- `Scripts/nex-rvf/package.json`
- `Scripts/nex-rvf/lib/vault-apply.js`
- `Scripts/nex-rvf/lib/vault-frontmatter-edit.js`
- `Scripts/nex-rvf/lib/vault-lookup.js`
- `Scripts/nex-rvf/lib/walker.js`
- `Scripts/nex-rvf/lib/state.js`
- `Scripts/nex-rvf/lib/memory.js`
- `Scripts/nex-rvf/lib/pgmirror.js`

Questions:

- What code paths can write, edit frontmatter, promote memory, or mirror into database/storage?
- Are path traversal, symlink traversal, stale lookup, and allowed-prefix checks sufficient in tracked code?
- Are vault walks, indexing, embeddings, local model calls, and mirror jobs bounded by size, time, concurrency, and memory?
- Are write actions gated by confirmation, dry-run, review, confidence, or coherence controls?
- Do file and function names match docs closely enough for LLM navigation, or will agents call wrong/stale surfaces?
- Could RVF loops, backfills, local model calls, or mirror jobs plausibly contribute to CPU/RAM spikes?
