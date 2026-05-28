# C-137 Schema And Data-Contract Results

Date: 2026-05-27  
Target clone: `/tmp/yuri-c2moviez-vault-full.b1RopZ/repo`  
Target HEAD: `8103286e1abc63fa9490cb1375ecde4f340aa2bb`  
Mode: read-only source inspection and static extraction. No target source files mutated. No database or live service calls.

## Scope

This shard compares code data usage against tracked SQL truth:

```text
browser Supabase calls / function REST calls / scripts / storage buckets / RPC calls
  -> tracked Dashboard-v2/db-migrations and Scripts/migrations definitions
  -> table/view/RPC coverage
  -> RLS and storage-policy reconstructability
  -> architecture wiring confidence
```

The conclusion is critical: the code references many more tables, views, storage buckets, and RPCs than the GitHub clone defines. Static extraction found 85 table/view/storage references and 27 RPC references in code, while tracked migrations define only a subset. Forty-nine table/view/storage names and eleven RPC names referenced by code did not have matching tracked definitions in this pass. This does not prove the live Supabase database is missing them; it proves the GitHub clone is not a complete backend source of truth.

## Findings

### R116-F01 - Code/Data Contract Is Not Reconstructable From Tracked Migrations

Severity: Critical repo-truth and stability risk  
Status: `C137_VERIFIED_STATIC_EXTRACTION`

Evidence:

- Static extraction across `Dashboard-v2` and `Scripts` found 85 referenced table/view/storage names.
- Static extraction across `Dashboard-v2/db-migrations` and `Scripts/migrations` found 48 defined table/view names.
- The same extraction found 49 referenced names without matching tracked definitions.
- It found 27 referenced RPC names and 24 tracked RPC definitions, with 11 referenced RPC names not matched by tracked definitions.
- Tracked migration inventory is limited to `Dashboard-v2/db-migrations/001` through `026` plus four `Scripts/migrations/2026-04-*` files.

Impact:

An operator cannot rebuild the database contract from GitHub. A clean deploy or clone can have working frontend and functions while still failing at runtime because required tables, views, RPCs, storage buckets, policies, or grants live only in Claudio's live Supabase project or local notes.

Required remediation direction:

- Generate a schema manifest from code references.
- Export the live Supabase schema/RLS/RPC state into tracked migrations or a read-only audit snapshot.
- Add a CI check that every `supabase().from(...)`, REST `/rest/v1/...`, `storage.from(...)`, and `/rpc/...` reference maps to tracked SQL.

### R116-F02 - CRM, Revenue, And Business Tables Are Referenced But Not Defined In Tracked SQL

Severity: Critical business-layer wiring risk  
Status: `C137_VERIFIED`

Evidence:

- Missing tracked definitions include `customer_master`, `customer_master_safe`, `customer_activities`, `offers`, `daily_metrics`, and `marketing_docs`.
- Example references:
  - `Dashboard-v2/src/lib/db.ts:465` reads `customer_master_safe`.
  - `Dashboard-v2/src/lib/db.ts:482` reads `customer_master`.
  - `Dashboard-v2/src/lib/db.ts:539` reads `customer_activities`.
  - `Dashboard-v2/src/routes/pipeline/customers/+page.svelte:555-564` uses `customer_master` and `customer_activities`.
  - `Dashboard-v2/src/routes/pipeline/customers/+page.svelte:599` and `720` call `crm_set_lifecycle`, which was not found in tracked RPC definitions.
  - `Scripts/process-offer.js:114` references `offers`.
  - `Scripts/team-bots/fanny-bot.js:290` and `308` reference `marketing_docs`.

Impact:

The most business-critical parts of the dashboard rely on untracked data contracts. This can make CRM, revenue, offers, and marketing document workflows appear present in UI/source while their real authority is an undocumented live schema.

Required remediation direction:

- Add migrations for CRM/revenue/offer/marketing document tables and views.
- Add RLS tests for every browser-visible business table.
- Treat these features as deployment-dependent until schema truth is tracked.

### R116-F03 - Tracker, HR, And Scheduling Data Contracts Are Largely Live-Only

Severity: Critical tracker/operations wiring risk  
Status: `C137_VERIFIED`

Evidence:

- Missing tracked definitions include `time_entries`, `team_capacity`, `absences`, `working_hours`, `billing_rates`, `holidays`, and `client_tasks`.
- `Dashboard-v2/src/routes/admin/tracker/+page.svelte:121-130` reads active profiles, capacity, working hours, absences, billing rates, and holidays.
- `Dashboard-v2/src/lib/components/tracker/TeamTimeView.svelte:68-82` reads profiles, team capacity, and time entries.
- `Dashboard-v2/functions/tracker-push-plane.js:51-76` reads and updates `time_entries`, then calls `tracker_mark_plane_synced`; that RPC was not found in tracked definitions.
- `Dashboard-v2/src/routes/tracker/+page.svelte:343` calls `tracker_plan_revert`; that RPC was not found in tracked definitions.
- Tracker UI components reference `client_tasks`, but no matching tracked table definition was found.

Impact:

CHRONEX/tracker cannot be accepted as repo-reconstructable. This is especially important because tracker data touches billable time, capacity, absences, Plane worklogs, Microsoft 365 mirroring, and team visibility.

Required remediation direction:

- Export tracker schema/RLS/RPC definitions into tracked migrations.
- Add permission tests for team/HR/billing data.
- Treat Plane/M365 sync functions as blocked until their DB contract is tracked.

### R116-F04 - Permission UI Uses A Different Authorization Schema Than The Tracked Migration Defines

Severity: High authorization drift risk  
Status: `C137_VERIFIED`

Evidence:

- `Dashboard-v2/db-migrations/010_user_identity.sql:8-17` defines `user_profiles`.
- `Dashboard-v2/db-migrations/010_user_identity.sql:20-29` defines `role_permissions`.
- `Dashboard-v2/db-migrations/010_user_identity.sql:54-67` enables RLS and makes `role_permissions` public-readable.
- `Dashboard-v2/src/routes/admin/permissions/+page.svelte:47-53` reads `user_profiles` and `user_module_permissions`.
- `Dashboard-v2/src/routes/admin/permissions/+page.svelte:89-117` calls `set_user_permission` and `reset_user_permission`.
- Static extraction did not find tracked definitions for `user_module_permissions`, `set_user_permission`, or `reset_user_permission`.

Impact:

The permission admin UI is operating against a newer or different authorization model than the tracked migration baseline. This can create a dangerous split where the UI looks like it manages per-user permissions while the repo cannot prove the backing table, RPC security definer guards, or RLS policies.

Required remediation direction:

- Add the `user_module_permissions` schema and permission RPC definitions.
- Include role/default/override precedence in a tracked policy manifest.
- Add direct RPC tests proving non-admin callers cannot mutate permissions.

### R116-F05 - NEX/RVF Telemetry And Cognition Tables Are Partially Untracked

Severity: High monitoring and AI-control-plane truth risk  
Status: `C137_VERIFIED`

Evidence:

- Missing tracked definitions include `nex_agent_liveness`, `nex_agent_registry`, `nex_agent_registry_coverage`, `nex_eval_golden`, `nex_eval_runs`, `nex_lora_pairs`, `nex_mcp_calls`, `nex_pending_clarifications`, `nex_reply_outcome`, `nex_retrieval_thresholds_active`, `nex_rule_audits`, `nex_turn_feedback`, `nex_turn_latency`, `nex_turn_latency_recent`, and `nex_turn_latency_summary`.
- `Scripts/nex-watch.js` references many of these tables and views as health/intelligence surfaces.
- `Dashboard-v2/src/routes/ai-monitor/+page.svelte` and `Dashboard-v2/src/routes/+page.svelte` read NEX/RVF telemetry and adapter state.
- `Scripts/nex-rvf/registry-scan.js:320` calls `nex_heartbeat_upsert`; that RPC was not found in tracked definitions.
- `Scripts/lib/ceo-correction-detector.js:312` and `342` call `nex_signal_record`; that RPC was not found in tracked definitions.

Impact:

The AI monitoring layer can show sophisticated health/intelligence state, but the clone does not define enough of its database substrate. This makes dashboard health and "NEX learning loop" claims live-state-dependent rather than repo-truth-grounded.

Required remediation direction:

- Add migrations for NEX telemetry, registry, evaluation, LORA, latency, and clarification tables.
- Add a generated NEX/RVF schema coverage report.
- Treat health dashboards as false-assurance-prone until every displayed table/view is source-tracked.

### R116-F06 - Existing Migrations Include Broad Anon Policies On Sensitive Tables/Buckets

Severity: High RLS/privacy risk  
Status: `C137_VERIFIED`

Evidence:

- `Dashboard-v2/db-migrations/001_scheduled_blocks.sql:21-24` enables RLS on `scheduled_blocks` but allows all operations to `anon` and `authenticated`.
- `Dashboard-v2/db-migrations/001_scheduled_blocks.sql:42-44` enables RLS on `meetings` but allows all operations to `anon` and `authenticated`.
- `Dashboard-v2/db-migrations/002_meetings_storage.sql:4-11` creates a public `meetings` storage bucket.
- `Dashboard-v2/db-migrations/002_meetings_storage.sql:14-25` allows anon select and anon insert for the `meetings` bucket.
- Earlier migrations also grant broad anon/authenticated read or execute on some cognition tables/functions before later hardening attempts.

Impact:

Some broad policies may have been temporary bootstrapping, but tracked migration order and final effective policy are not represented as a single tested truth. For privacy-sensitive meeting audio/transcripts and schedule data, broad anon access is a serious default unless later migrations demonstrably close it.

Required remediation direction:

- Add final effective policy snapshots, not just migration fragments.
- Add RLS tests for anon/authenticated/service-role behavior.
- Move meeting audio to authenticated/private access unless there is a deliberate public-sharing use case.

### R116-F07 - Storage Buckets Are Referenced Without Complete Tracked Policy Coverage

Severity: Medium-high storage privacy risk  
Status: `C137_VERIFIED`

Evidence:

- `Dashboard-v2/src/lib/stores/user.svelte.ts:169` and `185` use the `avatars` storage bucket.
- Static SQL extraction found tracked policy setup for the `meetings` bucket but no matching tracked setup for an `avatars` bucket.
- The `meetings` bucket setup is explicitly public and anon-insertable.

Impact:

Avatar and meeting storage behavior depends on live Supabase storage state. The repo cannot prove file privacy, upload limits, MIME controls, or delete/update permissions for every bucket the browser uses.

Required remediation direction:

- Track all storage bucket definitions and policies.
- Add bucket-level access tests.
- Use signed URLs or authenticated buckets for sensitive media.

## Positive Controls Observed

- The repo does contain migrations for some important foundations: auth revocations/events, `scheduled_blocks`, `meetings`, `facts`, RAG embeddings, drift/coherence tables, local inference logs, and basic user profiles.
- Later hardening migrations show the right intent by revoking access and moving several functions to service-role-only.
- The static extraction approach produced actionable coverage rows that can be turned into an automated CI gate.

## Coverage Boundary

This is a static source-to-migration comparison. It does not inspect Claudio's live Supabase schema, and it does not prove missing live tables. It proves that the GitHub clone cannot reconstruct the full database/RPC/storage contract that the code expects.
