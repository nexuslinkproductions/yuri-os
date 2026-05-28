# Fanout Run 017 Results

Date: 2026-05-27
Target clone: `/tmp/yuri-c2moviez-vault-full.b1RopZ/repo`
Target commit: `8103286e1abc63fa9490cb1375ecde4f340aa2bb`
Mode: read-only, no mutation, no SQL execution, no target execution, no live service calls, no credential use
Worker mode: single persistent Claude/tmux lane, active cap `1`

## Acceptance Summary

Run 017 is accepted with C-137 corrections.

- `R017_SUPABASE_RLS_RPC_MIGRATIONS_OPUS / SUPABASE-RLS-RPC-MIGRATIONS-017`: worker closed with `files_covered=10 findings=14 suppressions=5 deferred=5 invalidated=0`.
- C-137 accepted the 10 assigned SQL files as covered and used two extra target-repo SQL files as supporting evidence only.

Accepted assigned target surfaces added by Run 017: `10`.

Accepted assigned target coverage total after Run 017: `268 / 1505` tracked files.

Strict semantic caveat carried forward: two lockfiles are currently `partial`: `Scripts/telegram-mcp/package-lock.json` from Run 008 and `Scripts/team-bots/package-lock.json` from Run 010. Full semantic coverage is `266 covered + 2 partial`.

Contamination check: passed. C-137 checked the Run 017 pipe log for protected Claude runtime reads, `Searched memories`, and invalidation markers. The only protected-path strings were from the packet boundary/prompt text; no protected-runtime read was accepted.

Clone proof: C-137 verified the target clone at commit `8103286e1abc63fa9490cb1375ecde4f340aa2bb`, clean status count `0`, and `1505` tracked files.

Source pipe log:

- `/tmp/yuri-c2v-fanout-run-017/pipe/r017-single.pipe.log`

## C-137 Corrections

Lane output remains advisory until verified. C-137 corrected these points before acceptance:

- The worker read `Scripts/migrations/2026-04-27-phase-l-fact-ledger.sql` and `Dashboard-v2/db-migrations/008_nex_rvf_resize_to_384.sql` as dependency evidence. These files are target-repo files and were relevant, but coverage credit remains limited to the 10 assigned Run 017 files.
- The worker's `nex_search` overload finding is suppressed. `007_nex_rag_foundation.sql` creates `nex_search(vector(768))`, but `008_nex_rvf_resize_to_384.sql:42` explicitly drops that signature before creating the `vector(384)` function. `009_nex_search_outcome_boost.sql:16-18` then drops/recreates the `vector(384)` signature. A normal ordered migration path does not leave both overloads.
- `daily_metrics`, `public.decisions`, `nex_reply_outcome`, and `agent_heartbeat` are accepted as high/medium **schema-coverage gaps**, not confirmed live misconfigurations. No tracked SQL DDL/RLS was found for them, so live state remains deferred.
- `scheduled_blocks` anon CRUD is accepted as an intentional single-user/browser design tradeoff, not a high vulnerability by itself.

## Executive Findings

Run 017 found one of the strongest security findings so far: the fact ledger's table-level lockdown and its RPC grants contradict each other across migration sets.

`005_n1_rls_lockdown.sql` says the fact surfaces leaked through anon and locks down `facts`, `facts_current`, and `fact_contradictions_recent`. But the Phase L fact-ledger migration grants anon/authenticated access back to those same surfaces and grants anon/authenticated execute on `SECURITY DEFINER` mutation RPCs. That means the app's `shared-facts.js` anon-key write path is not just "possibly unsafe"; it is supported by tracked SQL that deliberately makes anon fact writes work. For a fact ledger that feeds RAG and decision memory, that is a data-integrity and poisoning risk.

Run 017 also confirms that several critical tables used by the app have no tracked schema/RLS source of truth: `daily_metrics`, `public.decisions`, `nex_reply_outcome`, and `agent_heartbeat`. This is a major repo-navigation and auditability gap: Claudio's code leans on these tables, but the repo cannot prove their security posture.

## Supabase Migration / RLS / RPC Lane

Lane: `R017_SUPABASE_RLS_RPC_MIGRATIONS_OPUS`
Batch: `SUPABASE-RLS-RPC-MIGRATIONS-017`

Files covered:

- `Dashboard-v2/db-migrations/003_security_hardening.sql`
- `Dashboard-v2/db-migrations/004_n1_auth_hardening.sql`
- `Dashboard-v2/db-migrations/005_n1_rls_lockdown.sql`
- `Dashboard-v2/db-migrations/006_nex_language_drift.sql`
- `Dashboard-v2/db-migrations/007_nex_rag_foundation.sql`
- `Dashboard-v2/db-migrations/009_nex_search_outcome_boost.sql`
- `Dashboard-v2/db-migrations/020_nex_decisions_yesterday_rollup.sql`
- `Dashboard-v2/db-migrations/023_nex_agent_health_summary.sql`
- `Dashboard-v2/db-migrations/024_nex_canonical_freshness.sql`
- `Dashboard-v2/db-migrations/026_nex_module_status.sql`

Supporting dependency evidence read, not counted as covered:

- `Scripts/migrations/2026-04-27-phase-l-fact-ledger.sql`
- `Dashboard-v2/db-migrations/008_nex_rvf_resize_to_384.sql`
- bounded `git grep` evidence from app files that consume these DB surfaces.

Accepted findings:

| ID | Severity | Path | Class | Finding |
| --- | --- | --- | --- | --- |
| `R017-F01` | high | `Scripts/migrations/2026-04-27-phase-l-fact-ledger.sql:111-123`, `Scripts/migrations/2026-04-27-phase-l-fact-ledger.sql:195-197`, `Dashboard-v2/functions/shared-facts.js:86-128` | security/data-integrity | `assert_fact` is `SECURITY DEFINER` and is granted to `anon` and `authenticated`. `shared-facts.js` uses `SUPABASE_ANON_KEY` to call it with caller-controlled subject/predicate/value/confidence/source fields. |
| `R017-F02` | high | `Scripts/migrations/2026-04-27-phase-l-fact-ledger.sql:222-253` | security/data-integrity | `retract_fact` is also `SECURITY DEFINER` and granted to `anon` and `authenticated`, allowing anon-key callers to retract facts by id if reachable. |
| `R017-F03` | high | `Dashboard-v2/db-migrations/005_n1_rls_lockdown.sql:4-14`, `Dashboard-v2/db-migrations/005_n1_rls_lockdown.sql:39-117`, `Scripts/migrations/2026-04-27-phase-l-fact-ledger.sql:84-101`, `Scripts/migrations/2026-04-27-phase-l-fact-ledger.sql:279` | security/privacy | Migration sets conflict: `005` documents fact surfaces as anon leaks and revokes/locks them, while Phase L creates anon read policy on `facts` and grants anon SELECT on `facts_current` and `fact_contradictions_recent`. Final safety depends on live migration order. |
| `R017-F04` | high/deferred | `Dashboard-v2/functions/deep-learning.js:60`, `Dashboard-v2/functions/deep-learning.js:373`, `Dashboard-v2/functions/metrics-snapshot.js:230`, `Dashboard-v2/functions/predictive-intel.js:477` | security/privacy | `daily_metrics` has no tracked CREATE/RLS/grant SQL, while multiple functions use `SUPABASE_ANON_KEY` to read/upsert metrics and intelligence findings. If live RLS is absent or permissive, this is operational data exposure and poisoning. |
| `R017-F05` | high/deferred | `Dashboard-v2/src/lib/db.ts:214`, `Dashboard-v2/db-migrations/009_nex_search_outcome_boost.sql:60-73`, `Dashboard-v2/db-migrations/020_nex_decisions_yesterday_rollup.sql:11-28` | security/privacy | `public.decisions` has no tracked CREATE/RLS migration, while browser code reads it with the public anon client and decision rollup/search views depend on it. Live RLS must be proven before treating decision data as protected. |
| `R017-F06` | medium/deferred | `Dashboard-v2/db-migrations/023_nex_agent_health_summary.sql:9-34`, `Dashboard-v2/functions/intel-retrieval-stats.js:159` | wiring/privacy | `nex_agent_health_summary` is a `security_invoker` view over `agent_heartbeat`, but `agent_heartbeat` has no tracked CREATE/RLS migration. The function consuming it can fall back to anon credentials. |
| `R017-F07` | medium | `Dashboard-v2/db-migrations/020_nex_decisions_yesterday_rollup.sql:9-41` | wiring/privacy | Decision rollup/highlight views are `security_invoker` over `public.decisions` and have no explicit grants in the migration. Their safety relies entirely on the missing `decisions` base-table RLS/default grants. |
| `R017-F08` | low | `Dashboard-v2/db-migrations/007_nex_rag_foundation.sql:153-188`, `Dashboard-v2/db-migrations/009_nex_search_outcome_boost.sql:18-87` | hardening | `nex_search` is not `SECURITY DEFINER` and underlying `nex_embeddings` is service-role-only, so anon callers should get no rows. Still, the migration lacks explicit `REVOKE EXECUTE`/`GRANT EXECUTE` discipline for defense in depth. |
| `R017-F09` | info | `Dashboard-v2/db-migrations/003_security_hardening.sql:113-129` | design tradeoff | `scheduled_blocks` grants anon CRUD by design for browser drag/drop scheduling. This is acceptable for single-user assumptions but becomes unsafe for multi-user use. |
| `R017-F10` | info/positive | `Dashboard-v2/db-migrations/004_n1_auth_hardening.sql:123-156` | positive | Auth revocation, attempts, and events tables use RLS, deny-all policies for anon/authenticated, explicit revokes, service-role grants, and service-role-only RPC grants. |
| `R017-F11` | info/positive | `Dashboard-v2/db-migrations/005_n1_rls_lockdown.sql:33-117` | positive | The lockdown migration uses idempotent dynamic blocks that safely handle table/view ambiguity for high-risk leak surfaces. |
| `R017-F12` | info/positive | `Dashboard-v2/db-migrations/006_nex_language_drift.sql`, `Dashboard-v2/db-migrations/007_nex_rag_foundation.sql`, `Dashboard-v2/db-migrations/024_nex_canonical_freshness.sql`, `Dashboard-v2/db-migrations/026_nex_module_status.sql` | positive | These migrations mostly follow consistent service-role-only RLS for new tables. |
| `R017-F13` | info/positive | `Dashboard-v2/db-migrations/024_nex_canonical_freshness.sql:92-102` | positive | `bump_last_verified` is `SECURITY DEFINER`, has a fixed `search_path`, revokes public execute, and grants only to `service_role`. |

Suppressed or narrowed:

- Worker `R017-F06` about `nex_search` overload is suppressed. `008_nex_rvf_resize_to_384.sql:42` explicitly drops the old `vector(768)` signature before the `vector(384)` path.
- `nex_search` subselecting from `public.decisions` is not by itself an RLS bypass because it is not `SECURITY DEFINER`; caller permissions/RLS still apply.
- `nex_canonical_freshness` views are `security_invoker`, so they inherit fact-table permissions. They become exposed only if the fact-table/Phase L grants are live.
- `auth.js`/`auth-check.js` align well with the auth hardening migration because both use service-role credentials.

Deferred:

- `public.decisions`: no tracked CREATE/RLS migration; live schema/policies needed.
- `public.daily_metrics`: no tracked CREATE/RLS migration; live schema/policies needed.
- `public.nex_reply_outcome`: no tracked CREATE/RLS migration; live schema/policies needed.
- `public.agent_heartbeat`: no tracked CREATE/RLS migration; live schema/policies needed.
- Live migration order: repo cannot prove whether `005` lockdown or Phase L fact-ledger grants won in production.

## C-137 Spot Checks

C-137 directly checked these anchors in the canonical clone before accepting:

- `005_n1_rls_lockdown.sql:4-14`, `39-117`, `187-194`: documented leaks, dynamic lockdown, intended final anon denial.
- `Scripts/migrations/2026-04-27-phase-l-fact-ledger.sql:84-101`, `111-123`, `195-197`, `203-215`, `222-253`, `259-279`: anon fact reads/writes and security-definer RPCs.
- `007_nex_rag_foundation.sql:68-76`, `138-145`, `153-188`: service-role-only RLS on RAG tables and search RPC.
- `008_nex_rvf_resize_to_384.sql:42-81`, `009_nex_search_outcome_boost.sql:16-90`: vector signature transition and outcome-boosted search recreation.
- `023_nex_agent_health_summary.sql:9-34`: security-invoker view over missing `agent_heartbeat` DDL/RLS.
- `024_nex_canonical_freshness.sql:23-38`, `84-102`, `105-117`: security-invoker freshness views, service-role-only suspect table, locked bump RPC.
- `026_nex_module_status.sql:8-30`: module status table and service-role-only RLS.
- Repo-wide SQL search for `daily_metrics`, `public.decisions` DDL/RLS, `nex_reply_outcome`, and `agent_heartbeat`: no tracked DDL/RLS found for the first three; only a view dependency found for `agent_heartbeat`.

## Immediate Implications

1. Decide whether the fact ledger is allowed to be anon-readable/anon-writable. If not, revoke anon/authenticated execute on `assert_fact`, `retract_fact`, and `get_known_facts`, and move writes to service-role-only server functions.
2. Create tracked, authoritative DDL/RLS migrations for `daily_metrics`, `public.decisions`, `nex_reply_outcome`, and `agent_heartbeat`.
3. Remove anon fallbacks from sensitive server-side Supabase writers; fail closed if the service key is absent.
4. Add explicit grants/revokes to views and RPCs even when RLS on underlying tables seems protective.
5. Define a single migration order across `Dashboard-v2/db-migrations/` and `Scripts/migrations/`.

## Next Queue

Run 018 should stay single-lane and inspect the Plane/Outlook webhook and scheduling mutation cluster:

1. `Dashboard-v2/functions/plane-webhook.js`
2. `Dashboard-v2/functions/outlook-webhook.js`
3. `Dashboard-v2/functions/outlook-subscribe.js`
4. `Dashboard-v2/functions/outlook-sync.js`
5. `Dashboard-v2/functions/calendar-schedule-event.js`
6. `Dashboard-v2/functions/schedule-list.js`
7. `Dashboard-v2/functions/schedule-plan-ticket.js`
8. `Dashboard-v2/functions/tracker-m365-mirror.js`
9. `Dashboard-v2/functions/tracker-admin-set-working-hours.js`
10. `Dashboard-v2/functions/tracker-pull-plane.js`
