# Fanout Run 017 Packet

Date: 2026-05-27
Target clone: `/tmp/yuri-c2moviez-vault-full.b1RopZ/repo`
Target commit: `8103286e1abc63fa9490cb1375ecde4f340aa2bb`
Worker mode: single persistent Claude/tmux lane, active cap `1`
Required model lane: Opus worker in the existing persistent session

## Mission

Execute one bounded read-only target-repo shard:

`R017_SUPABASE_RLS_RPC_MIGRATIONS_OPUS / SUPABASE-RLS-RPC-MIGRATIONS-017`

This shard closes Run 016's database-side unknowns and checks whether Supabase migrations actually protect the tables/RPCs that app code treats as safe: `facts`, `assert_fact`, `facts_current`, `fact_contradictions_recent`, `daily_metrics`, auth/session tables, decision/search RPCs, canonical freshness/status tables, and agent health summaries.

## Non-Negotiable Rules

- Read-only only.
- No writes to Claudio's target repository.
- No writes to YURI report files from the worker lane.
- No target execution, no database execution, no psql, no Supabase CLI, no live service calls.
- No credential use, validation, replay, provider login, or API probing.
- Use only repository evidence from `/tmp/yuri-c2moviez-vault-full.b1RopZ/repo`.
- Do not read YURI protected runtime paths.
- Do not browse `.claude/state`, `.claude/history`, `.claude/file-history`, `.claude/projects`, `.env`, `node_modules`, `.amp`, or `backend/data`.
- C-137 writes the durable report after validating your output.

## Required Clone Proof

Emit:

```text
CLONE_PROOF commit=<sha> status_count=<n> tracked_files=<n>
```

Expected:

- commit `8103286e1abc63fa9490cb1375ecde4f340aa2bb`
- status count `0`
- tracked files `1505`

## Assigned Current-Tree Files

Inspect these files directly and completely:

1. `Dashboard-v2/db-migrations/003_security_hardening.sql`
2. `Dashboard-v2/db-migrations/004_n1_auth_hardening.sql`
3. `Dashboard-v2/db-migrations/005_n1_rls_lockdown.sql`
4. `Dashboard-v2/db-migrations/006_nex_language_drift.sql`
5. `Dashboard-v2/db-migrations/007_nex_rag_foundation.sql`
6. `Dashboard-v2/db-migrations/009_nex_search_outcome_boost.sql`
7. `Dashboard-v2/db-migrations/020_nex_decisions_yesterday_rollup.sql`
8. `Dashboard-v2/db-migrations/023_nex_agent_health_summary.sql`
9. `Dashboard-v2/db-migrations/024_nex_canonical_freshness.sql`
10. `Dashboard-v2/db-migrations/026_nex_module_status.sql`

Read every line of every assigned SQL file. Do not mark a file covered from search hits, summaries, or partial reads.

## Required Output Rows

For every assigned existing file:

```text
PATH_PROOF path="<path>" command="git ls-files" status=exists
READ_PROOF path="<path>" command="git show HEAD:<path>" first_line="<bounded>" last_line="<bounded>"
FILE_COVERAGE path="<path>" method=full_read status=covered lines=<n> words=<n> notes="<short>"
```

For each table/view/RPC policy surface:

```text
DB_SURFACE_MAP path="<path>" object="<table|view|function|policy|trigger>:<name>" grants="<anon|authenticated|service_role|public|none|unknown>" rls="<enabled|forced|disabled|not_applicable|unknown>" read_control="<short>" write_control="<short>" status="<covered|reportable|suppressed|deferred>"
```

For each app-code dependency closed or still open:

```text
APP_DEPENDENCY_MAP app_path="<path:line>" db_object="<object>" migration_evidence="<path:line>" conclusion="<safe|unsafe|deployment_dependent|deferred>" reason="<short>"
```

For findings:

```text
FINDING id=R017-F## severity=<critical|high|medium|low|info> path="<path:line>" class=<security|privacy|data-integrity|availability|wiring|positive> evidence="<repo evidence>" impact="<impact>" recommendation="<fix or next verification>"
```

For suppressions:

```text
SUPPRESSION path="<path>" hypothesis="<risk considered>" counterevidence="<exact counterevidence>"
```

For deferred items:

```text
DEFERRED path="<path-or-surface>" reason="<exact blocker>" next="<next read-only evidence source>"
```

Close with:

```text
BATCH_CLOSE lane=opus batch=R017 files_covered=<n> findings=<n> suppressions=<n> deferred=<n> invalidated=0
```

## Audit Questions

Answer from repo evidence only:

- Does `assert_fact` run as `security definer` or `security invoker`, and who can execute it?
- Do `facts`, `facts_current`, and `fact_contradictions_recent` expose sensitive client facts to anon users?
- Are `facts` write controls schema-level/predicate-level or just "function can be called" controls?
- Do migration grants align with `shared-facts.js` using `SUPABASE_ANON_KEY`?
- Do `daily_metrics` policies align with `metrics-snapshot.js`, `deep-learning.js`, `predictive-intel.js`, and browser dashboards?
- Are `decisions`, `nex_reply_outcome`, and `nex_search` protected against anon/browser write or training-signal poisoning?
- Do auth/session hardening migrations match `auth.js` and `auth-check.js` assumptions?
- Are canonical freshness/status/health tables readable or writable by anon users?
- Are there migrations that revoke or later loosen earlier lockdowns?
- Is the migration order coherent, or can a fresh database end up with broken permissions?

## False-Positive Guards

- Do not report anon `select` as a vulnerability by itself; report the specific table/view, row content risk, and whether policies expose sensitive business/client data.
- Do not report service-role bypass in SQL; service-role bypassing RLS is expected. Report if application code unnecessarily uses service-role or if anon/authenticated grants are overbroad.
- Do not assume these migrations were applied in production. If tracked SQL is safe but live state unknown, mark live-state confirmation as deferred.
- Do not execute SQL. Treat SQL text as evidence only.
- Preserve positives such as RLS enablement, revoke/grant discipline, least-privilege policies, immutable/security-definer safeguards, search path hardening, and explicit authenticated-only grants.

## C-137 Current Coverage State

Before Run 017:

- accepted assigned target coverage: `258 / 1505`
- strict semantic coverage: `256 covered + 2 partial`
- partial files: `Scripts/telegram-mcp/package-lock.json`, `Scripts/team-bots/package-lock.json`
