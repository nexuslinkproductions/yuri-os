# Codex Run 035 Results - Revenue Route

Date: 2026-05-27
Lane: `R035_REVENUE_ROUTE_GPT55_XHIGH / REVENUE-ROUTE-035`
Worker: Codex CLI, `gpt-5.5`, `model_reasoning_effort=xhigh`, read-only sandbox
Target clone: `/tmp/yuri-c2moviez-vault-full.b1RopZ/repo`
Target commit: `8103286e1abc63fa9490cb1375ecde4f340aa2bb`
Status: accepted with C-137 validation

## Clone Proof

```text
CLONE_PROOF commit=8103286e1abc63fa9490cb1375ecde4f340aa2bb status_count=0 tracked_files=1505
```

Guarded relaunch output:

```text
/tmp/yuri-c2v-codex-run-035b/last-message.md
/tmp/yuri-c2v-codex-run-035b/stderr.log
```

## File Coverage

```text
FILE_COVERAGE path="Dashboard-v2/src/routes/revenue/+page.svelte" method=full_read status=covered lines=1091 words=3471 notes="full assigned route read from HEAD in five chunks"
BATCH_CLOSE lane=codex-gpt55-xhigh batch=R035 files_covered=1 findings=5 suppressions=3 deferred=2 invalidated=0
```

## Accepted Findings

### R035-F01 - Revenue Reads Financial State Directly From Browser Supabase

Severity: high
Class: privacy / authorization

Evidence:

- `Dashboard-v2/src/routes/revenue/+page.svelte:39-41` reads `client` and `client_finance` via `listEntityState`.
- `revenue/+page.svelte:58-60` reads `bexio_overview`.
- `Dashboard-v2/src/lib/db.ts:24-25` uses public Supabase URL and anon key in the browser.
- `db.ts:77-84` queries `entity_state` directly from the browser.
- `Dashboard-v2/db-migrations/005_n1_rls_lockdown.sql:188-189` states anon can read `entity_state`.
- The revenue route contains no `user.can`, `isAdmin`, or route-local permission check.

C-137 correction:

Actual live Supabase policy state is not verified. This is accepted as high risk because tracked source shows browser-side reads of finance-bearing `entity_state`, no route-local permission gate, and migration comments stating anonymous readability.

Impact:

Financial data can be exposed to any browser that can use the public Supabase client if deployed RLS matches the tracked policy intent.

Recommendation:

Move revenue reads behind an authenticated server endpoint or enforce RLS by role and `entity_type`. Bind page visibility to `user.can('clients.view_revenue')`, `user.can('crm.view_revenue')`, or `user.isAdmin`.

### R035-F02 - Client And Client-Finance State Can Drift

Severity: medium
Class: data integrity

Evidence:

- `revenue/+page.svelte:48-50` merges `state: { ...finMap[c.entity_id], ...c.state }`, so `client.state` overrides duplicate `client_finance` fields.
- `revenue/+page.svelte:53-56` subscribes only to `client`.
- `revenue/+page.svelte:70-72` subscribes to `bexio_overview`.
- `Scripts/sync-financial-to-supabase.js:286-310` writes `client_finance` rows.

Impact:

MRR/ARR and per-client revenue displays can use stale or overridden values until reload, and realtime updates to `client_finance` are missed.

Recommendation:

Define one financial source of truth, make precedence explicit, subscribe to `client_finance`, and recompute merged client rows on update.

### R035-F03 - Auth And Function Routing Remain Deployment-Dependent

Severity: high
Class: wiring / availability

Evidence:

- `Dashboard-v2/src/routes/+layout.svelte:96` and `:137` call `/api/functions/auth`.
- `Dashboard-v2/src/routes/login/+page.svelte:45` calls `/api/functions/auth`.
- `Dashboard-v2/production-server.js:118-123` maps `/.netlify/functions/:name`.
- `Dashboard-v2/server/Caddyfile.template:14-16` proxies only `/.netlify/functions/*`.
- `Dashboard-v2/production-server.js:36` expects `netlify/functions`, while tracked handlers live under `Dashboard-v2/functions`.

Impact:

Auth verify/login/logout and other function calls are deployment-dependent or missing under repo-defined routing. This can break revenue access and complicates all route-level security reasoning.

Recommendation:

Standardize the function dialect and deploy layout, then add a boot/runtime endpoint inventory check.

### R035-F04 - Finance Navigation Still Points To A Missing Route

Severity: medium
Class: navigationability

Evidence:

- `Dashboard-v2/src/lib/components/Sidebar.svelte:35` links `/finance`.
- `Dashboard-v2/src/routes/+page.svelte:659`, `admin/modules/+page.svelte:30`, `nexdoc/+page.svelte:284`, and `focus/+page.svelte:792` also reference `/finance`.
- `git ls-files Dashboard-v2/src/routes/finance/**` returned no tracked route.

Impact:

The money/revenue navigation graph advertises an active finance surface that dead-links, confusing users and LLM route reasoning.

Recommendation:

Implement `/finance`, add a redirect to existing money routes, or remove/rename active `/finance` anchors.

### R035-F05 - Revenue Claims Bexio Is Live Despite Repo Evidence Of Disabled Sync

Severity: medium
Class: false assurance / financial freshness

Evidence:

- `revenue/+page.svelte:58` comments that Bexio is pushed hourly.
- `revenue/+page.svelte:64` says sync runs hourly when no snapshot exists.
- `revenue/+page.svelte:226` displays `Bexio live`.
- `11 - NEX Brain/NEX-Architecture-Interactive-2026-05-15.html:660-661` states the Bexio sync is disabled pending a JWKS bug fix.

Impact:

Financial visibility can present stale Bexio snapshots as live data, affecting YTD gross, outstanding AR, aging, and top-customer decisions.

Recommendation:

Show `fetched_at` age and stale/error state. Remove hourly/live copy unless scheduler evidence exists.

## Strengths And Suppressions

```text
SUPPRESSION path="Dashboard-v2/src/routes/revenue/+page.svelte" hypothesis="Revenue route performs financial writes or provider calls from the browser" counterevidence="route uses listEntityState/subscribeEntityState reads only; no POST/PUT/PATCH/DELETE/fetch/localStorage in assigned file"
SUPPRESSION path="Dashboard-v2/src/routes/revenue/+page.svelte" hypothesis="Revenue page exposes Bexio credentials or calls Bexio API directly" counterevidence="Bexio API usage is in Scripts/sync-financial-to-supabase.js; revenue page only reads entity_state"
SUPPRESSION path="Dashboard-v2/src/routes/revenue/+page.svelte:372" hypothesis="Client drilldown is unmapped" counterevidence="link points to /clients?open={entity_id}, and Dashboard-v2/src/routes/clients/+page.svelte is tracked"
```

## Deferred Follow-Up

```text
DEFERRED path="deployed routing /api/functions" reason="repo evidence shows missing /api/functions mapping, but live Caddy/PM2 config could differ; live probing is not part of this accepted result" next="read deployed Caddy/PM2 artifacts or add tracked route map"
DEFERRED path="Supabase runtime RLS grants" reason="actual database policy state cannot be verified from tracked GitHub source alone" next="read-only schema/policy export or migration-applied manifest"
```

## Coverage Update

Before Run 035:

- accepted assigned target coverage: `343 / 1505`
- strict semantic coverage: `341 covered + 2 partial`

After Run 035:

- accepted assigned target coverage: `344 / 1505`
- strict semantic coverage: `342 covered + 2 partial`
