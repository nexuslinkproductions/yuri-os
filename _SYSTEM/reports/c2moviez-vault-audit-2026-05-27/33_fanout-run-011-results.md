# Fanout Run 011 Results

Date: 2026-05-27
Target clone: `/tmp/yuri-c2moviez-vault-full.b1RopZ/repo`
Target commit: `8103286e1abc63fa9490cb1375ecde4f340aa2bb`
Mode: read-only, no mutation, no target execution, no live service calls, no credential use
Worker mode: single persistent Claude/tmux lane, active cap `1`

## Acceptance Summary

Run 011 is accepted.

- `R011_SUPABASE_RAG_FACT_STORAGE_OPUS / SUPABASE-RAG-FACT-STORAGE-011`: accepted, `files_covered=12 findings=13 suppressions=4 deferred=2 invalidated=0`.

Accepted assigned target surfaces added by Run 011: `12`.

Accepted assigned target coverage total after Run 011: `206 / 1505` tracked files.

Strict semantic caveat carried forward: two lockfiles are currently `partial`: `Scripts/telegram-mcp/package-lock.json` from Run 008 and `Scripts/team-bots/package-lock.json` from Run 010. Full semantic coverage is `204 covered + 2 partial`.

Contamination check: passed. C-137 checked the Run 011 pipe log for protected Claude runtime path strings, `Searched memories`, and invalidation markers; no protected-runtime contamination was accepted.

Clone proof: C-137 verified the target clone at commit `8103286e1abc63fa9490cb1375ecde4f340aa2bb`, clean status count `0`, and `1505` tracked files.

Source pipe log:

- `/tmp/yuri-c2v-fanout-run-011/pipe/r011-single.pipe.log`

## C-137 Severity Adjustments

Lane severities remain advisory. C-137 adjusted or qualified these before acceptance:

- `R011-F01`: accepted as high RPC hardening / deployment-order risk, not proven live critical from GitHub evidence alone. The `nex_search` function is not `SECURITY DEFINER`, and `nex_embeddings` has service-role-only RLS in `007_nex_rag_foundation.sql:68-76`; actual exploitability depends on live grants, function privileges, and RLS behavior.
- `R011-F02`: accepted as a critical deployment-order candidate already seeded by Run 010. Phase L explicitly says `NOT YET APPLIED`, but its `assert_fact` design grants anon/authenticated execution on a `SECURITY DEFINER` write RPC. If this migration is live after or outside the later lockdown, the risk is critical.
- `R011-F03`: accepted as high deployment-order/data-integrity risk, with the same live-state caveat. Phase K says `NOT YET APPLIED`, but its reasoning-chain RPC grants anon/authenticated execution and writes reasoning graph rows.
- `R011-F06`: accepted as medium wiring risk. `mcp-server.js` does have `checkAuth(event)` at handler entry, so the issue is not unauthenticated MCP access; the issue is that fact tools depend on anon-key fact RPC/read posture.
- `R011-F07`: kept deferred/medium until the active `public.decisions` schema and RLS source is closed. The repository references `public.decisions` heavily, but the current tracked tree did not reveal the table creation migration in this run.

## Executive Findings

Run 011 closes the first single-lane usage-conservation shard and sharpens the Supabase/RAG picture.

The clearest new high-risk code issue is `nex-rag-query.js`: it is a POST endpoint with no visible auth check, reads client context, tickets, decisions, and audit rows from Supabase, and forwards the assembled context into the internal chat function with only an `X-Internal-Source` marker. If deployed externally, this is an unauthenticated client-intelligence read/generation endpoint.

The Supabase story remains split between good lockdown patterns and dangerous older or pending migration patterns. `nex_search_v2` and memory/knowledge-gap migrations show the preferred service-role-only pattern, while old `nex_search`, Phase K reasoning, and Phase L fact-ledger paths show broad/default execution hazards unless the live DB has the later lockdown state.

Run 011 also reinforces a navigation risk: several helper comments and code paths assume anon-readable/executable fact-ledger behavior, while lockdown migrations later say those surfaces should be service-role-only. That mismatch is exactly the kind of repo ambiguity that can make an LLM or operator believe the system is wired differently than it really is.

## Supabase/RAG/Fact/Storage Lane

Lane: `R011_SUPABASE_RAG_FACT_STORAGE_OPUS`
Batch: `SUPABASE-RAG-FACT-STORAGE-011`

Files covered:

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

Accepted findings:

| ID | Severity | Path | Class | Finding |
| --- | --- | --- | --- | --- |
| `R011-F01` | high candidate | `Dashboard-v2/db-migrations/008_nex_rvf_resize_to_384.sql:44-78`, `Dashboard-v2/db-migrations/009_nex_search_outcome_boost.sql:18-87` | RPC hardening | `public.nex_search` is recreated as `language sql stable` without explicit `REVOKE`/service-role-only `GRANT`. Later `nex_search_v2` shows the better pattern. |
| `R011-F02` | critical candidate | `Scripts/migrations/2026-04-27-phase-l-fact-ledger.sql:111-197` | data integrity | Phase L `assert_fact(...)` is `SECURITY DEFINER` and granted to `anon, authenticated`, allowing fact insertion/supersession if live in that state. |
| `R011-F03` | high candidate | `Scripts/migrations/2026-04-22-phase-k.sql:86-145` | data integrity | Phase K `record_reasoning_chain(...)` is `SECURITY DEFINER`, inserts thoughts/edges, and is granted to `anon, authenticated`. |
| `R011-F04` | high | `Dashboard-v2/functions/nex-rag-query.js:14-40`, `Dashboard-v2/functions/nex-rag-query.js:49-115`, `Dashboard-v2/functions/nex-rag-query.js:121-140` | auth/data exposure | RAG query handler has no visible auth gate, reads Supabase client/ticket/decision/audit context, and forwards it to chat with only `X-Internal-Source`. |
| `R011-F05` | high wiring | `Dashboard-v2/functions/shared-facts.js:15-22`, `Dashboard-v2/functions/shared-facts.js:86-128` | fact-ledger trust | Shared fact helper explicitly depends on anon-readable/executable fact ledger behavior and calls `assert_fact` with the anon key. |
| `R011-F06` | medium | `Dashboard-v2/functions/mcp-server.js:41-45`, `Dashboard-v2/functions/mcp-server.js:69-77`, `Dashboard-v2/functions/mcp-server.js:500-543`, `Dashboard-v2/functions/mcp-server.js:554-556` | wiring | MCP fact tools are protected by the MCP handler auth gate, but the downstream fact read/write helpers use the Supabase anon key and therefore depend on unsafe or inconsistent fact-ledger grants. |
| `R011-F07` | medium/deferred | `Dashboard-v2/db-migrations/009_nex_search_outcome_boost.sql:56-76`, `Dashboard-v2/db-migrations/019_nex_embeddings_bge_m3.sql:72-86` | data privacy | RAG scoring reads `public.decisions` for outcome boosts; the active `public.decisions` table creation/RLS source was not closed in this run. |
| `R011-F08` | medium | `Dashboard-v2/functions/nex-rag-query.js:11-12`, `Dashboard-v2/functions/nex-rag-query.js:44-46` | wiring | `nex-rag-query` falls back from service-role to anon/public anon keys, so missing deployment secrets can silently downgrade data access behavior instead of failing closed. |
| `R011-F09` | low | `Dashboard-v2/db-migrations/008_nex_rvf_resize_to_384.sql:80-81`, `Dashboard-v2/db-migrations/009_nex_search_outcome_boost.sql:16-18` | LLM navigation | Migration 008 says outcome weighting "wraps" the function, while migration 009 drops and replaces it. This is small but real documentation drift for LLM navigation. |
| `R011-F10` | info | `Dashboard-v2/db-migrations/019_nex_embeddings_bge_m3.sql:29-100`, `Dashboard-v2/db-migrations/019_nex_embeddings_bge_m3.sql:110-137` | positive | `nex_search_v2` and `nex_bulk_set_embedding_v2` use `SECURITY DEFINER`, pinned `search_path`, explicit public revoke, and service-role-only execute grants. |
| `R011-F11` | info | `Dashboard-v2/functions/shared-storage.js:14-16`, `Dashboard-v2/functions/shared-storage.js:71-128` | positive | Storage helper prefers service-role keys and does not generate signed/public URLs in the inspected code. |
| `R011-F12` | info | `Dashboard-v2/functions/telegram-fact-changes.js:22-24`, `Dashboard-v2/functions/telegram-fact-changes.js:49-57`, `Dashboard-v2/functions/telegram-fact-changes.js:106-110` | positive | Fact-change Telegram digest uses configured recipient IDs and idempotency before sending. |
| `R011-F13` | info | `Scripts/migrations/2026-04-22-phase-k.sql:1-7` | architecture | Phase K header clearly marks the migration as not yet applied and documents the intended manual apply path. |

Suppressions:

- `Dashboard-v2/functions/telegram-fact-changes.js`: broad recipient leak suppressed for this lane because sends loop only over `TELEGRAM_ALLOWED_USERS`.
- `Dashboard-v2/functions/shared-storage.js`: public/signed URL exposure suppressed; inspected helper uses authenticated object REST paths and does not create public URLs.
- `Dashboard-v2/db-migrations/015_nex_memory_physics.sql`: anon-executable memory-physics RPC hypothesis suppressed; both RPCs revoke public and grant service-role only.
- `Dashboard-v2/db-migrations/016_nex_knowledge_gaps.sql`: anon-readable table hypothesis suppressed; RLS policy grants all operations only to `service_role`.

Deferred:

- `public.decisions` active schema/RLS posture remains open. This affects RAG outcome-boost severity and multiple scripts/functions that read or patch `decisions`.
- Live Supabase migration order remains open. GitHub evidence cannot prove whether Phase K/L or lockdown migrations are live, applied, skipped, reordered, or manually altered.

## C-137 Spot Checks

C-137 directly checked these anchors in the canonical clone before accepting:

- `007_nex_rag_foundation.sql:68-76`: `nex_embeddings` RLS is service-role-only.
- `008_nex_rvf_resize_to_384.sql:44-78` and `009_nex_search_outcome_boost.sql:18-87`: old `nex_search` definitions lack explicit revoke/grant closure.
- `019_nex_embeddings_bge_m3.sql:29-100`, `110-137`: v2 search and bulk update have explicit revoke/grant to service-role.
- `015_nex_memory_physics.sql:49-67`, `72-113`: memory RPCs are security definer but service-role-only.
- `016_nex_knowledge_gaps.sql:39-46`: knowledge gaps table has service-role-only RLS policy.
- `shared-facts.js:15-22`, `86-128`: anon-key fact read/write assumption and `assert_fact` RPC call.
- `nex-rag-query.js:14-40`, `49-115`, `121-140`: no auth gate, Supabase context reads, chat forwarding.
- `mcp-server.js:41-45`, `69-77`, `500-543`, `554-556`: anon-key fact helpers behind an authenticated MCP handler.
- `2026-04-22-phase-k.sql:1-7`, `64-72`, `86-145`: not-yet-applied header, anon read policies, and anon-executable reasoning RPC.
- `2026-04-27-phase-l-fact-ledger.sql:1-5`, `84-101`, `111-197`, `222-253`, `279`: not-yet-applied header, anon fact read/write grants, and contradiction view grant.
- `005_n1_rls_lockdown.sql:33-117`, `187-193`: later lockdown intent contradicts older/pending broad grants.
- Repository search for `public.decisions` table creation returned no current tracked creation migration in this run, so that surface remains open.

## Immediate Implications

1. Treat `nex-rag-query.js` as an urgent deployed-surface review item: either put it behind the same auth model as the rest of the internal functions or remove deployment exposure.
2. Standardize fact-ledger access: service-role-only for writes, explicit authenticated internal callers, and no anon-executable `SECURITY DEFINER` fact mutation.
3. Close live Supabase migration order before relying on dashboard truth, fact ledger, or RAG security claims.
4. Decide whether old `nex_search` should be revoked or retired if `nex_search_v2` is the intended safe path.
5. Run the next bounded shard against the active `decisions` table lineage, decision recorder/reconciler scripts, and Phase J/decision-related functions.

## Next Queue

Run 012 should stay single-lane and target the `public.decisions` lineage and decision write/read surfaces:

1. `Scripts/lib/decisions-capture.js`
2. `Scripts/reconcile-decisions.js`
3. `Scripts/nex-rvf/reconcile-outcomes.js`
4. `Dashboard-v2/functions/decision-outcome.js`
5. `Dashboard-v2/functions/intel-retrieval-stats.js`
6. `Dashboard-v2/db-migrations/020_nex_decisions_yesterday_rollup.sql`
7. `Dashboard-v2/db-migrations/022_nex_weekly_self_review.sql`
8. `Scripts/migrations/2026-04-19-phase-j.sql`

