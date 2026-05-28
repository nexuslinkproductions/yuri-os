# Fanout Run 011 Packet

Date: 2026-05-27
Purpose: single-lane follow-up after accepted Run 010, focused on Supabase/RAG/storage/fact-ledger wiring left open by Run 010
Target repo: `https://github.com/c2moviezfpv/c2moviez-vault`
Target clone: `/tmp/yuri-c2moviez-vault-full.b1RopZ/repo`
Target commit: `8103286e1abc63fa9490cb1375ecde4f340aa2bb`
Target tracked files: `1505`
Active lane cap: `1`
Mode: read-only, no target mutation, no target execution, no live service calls, no credential use
Worker model: one persistent Claude/tmux lane. Reuse this lane for future runs with `/clear` between bounded packets.

## Universal Repo-Truth Contract

Allowed commands:

- `git -C /tmp/yuri-c2moviez-vault-full.b1RopZ/repo rev-parse HEAD`
- `git -C /tmp/yuri-c2moviez-vault-full.b1RopZ/repo status --short`
- `git -C /tmp/yuri-c2moviez-vault-full.b1RopZ/repo ls-files -- <assigned-path>`
- `git -C /tmp/yuri-c2moviez-vault-full.b1RopZ/repo show HEAD:<assigned-path>`
- bounded `git -C ... grep` or `rg` only for caller/import/link checks tied to assigned files
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

- Broad tree/list commands can orient the lane but cannot close coverage.
- Every covered target file requires `PATH_PROOF`, `READ_PROOF`, and `FILE_COVERAGE`.
- A file is not covered unless the lane inspects the file content semantically.
- Large generated/lock files can be marked `partial`, but only with exact reason.
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

## R011_SUPABASE_RAG_FACT_STORAGE_OPUS - SUPABASE-RAG-FACT-STORAGE-011

Scope: remaining Supabase/RAG/fact-ledger/storage bridge around Run 010's open critical candidates. Inspect how public/browser anon keys, fact RPCs, RAG search functions, storage helpers, and RVF PostgREST clients connect.

Files:

- `Dashboard-v2/db-migrations/008_nex_rvf_resize_to_384.sql`
- `Dashboard-v2/db-migrations/009_nex_search_outcome_boost.sql`
- `Dashboard-v2/db-migrations/015_nex_memory_physics.sql`
- `Dashboard-v2/db-migrations/016_nex_knowledge_gaps.sql`
- `Dashboard-v2/db-migrations/019_nex_embeddings_bge_m3.sql`
- `Dashboard-v2/functions/shared-facts.js`
- `Dashboard-v2/functions/shared-storage.js`
- `Dashboard-v2/functions/nex-rag-query.js`
- `Dashboard-v2/functions/telegram-fact-changes.js`
- `Dashboard-v2/functions/mcp-server.js`
- `Scripts/migrations/2026-04-22-phase-k.sql`
- `Scripts/nex-rvf/lib/pgmirror.js`

Questions:

- Do later RAG migrations repair, preserve, or worsen the early `nex_search` public-execute posture?
- Do fact-ledger helpers assume anon-read/anon-execute access after Run 010's lockdown evidence says facts should be service-role-only?
- Does `shared-facts.js` write through anon-facing RPCs or service-role-only paths?
- Does `shared-storage.js` expose client storage paths or bucket assumptions that need policy verification?
- Does `nex-rag-query.js` create an unauthenticated or weakly authenticated retrieval endpoint over embeddings/client knowledge?
- Does `telegram-fact-changes.js` leak sensitive fact changes to Telegram without proper auth/recipient controls?
- Does `mcp-server.js` expose fact/RAG/storage surfaces to MCP callers, and what auth boundary is visible in code?
- Does `pgmirror.js` call `nex_search`, `nex_search_v2`, `assert_fact`, `bless_fact`, or other RPCs with service-role, anon, or ambiguous credentials?
- Do comments contradict migration reality in ways that would mislead an LLM navigating the repo?

Priority validation targets:

1. `nex_search` versus `nex_search_v2` grants and caller expectations.
2. `facts_current`, `assert_fact`, `retract_fact`, `get_known_facts`, `record_reasoning_chain`, and dashboard/RVF callers.
3. Storage bucket/path assumptions and whether code implies public reads, signed URLs, or service-role access.
4. Any unauthenticated dashboard function that can read RAG/facts/storage or notify Telegram.

Expected close:

- If all 12 files are fully inspected, close with `files_covered=12`.
- If `mcp-server.js` is too large for one bounded pass, inspect the fact/RAG/storage relevant ranges and mark it `partial` with exact line ranges covered.
- Do not widen into unrelated dashboard endpoints except for bounded caller/import evidence.
