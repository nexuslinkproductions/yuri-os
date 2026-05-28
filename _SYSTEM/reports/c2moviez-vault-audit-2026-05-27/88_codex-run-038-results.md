# Codex Run 038 Results - User RBAC And Admin Guard Truth

Date: 2026-05-27
Lane: `R038_RBAC_ADMIN_GUARDS_GPT55_XHIGH`
Worker: Codex CLI, `gpt-5.5`, `model_reasoning_effort=xhigh`, read-only sandbox
Target clone: `/tmp/yuri-c2moviez-vault-full.b1RopZ/repo`
Target commit: `8103286e1abc63fa9490cb1375ecde4f340aa2bb`
Status: accepted with C-137 validation

## Clone Proof

```text
CLONE_PROOF path="/private/tmp/yuri-c2moviez-vault-full.b1RopZ/repo" head="8103286e1abc63fa9490cb1375ecde4f340aa2bb" worktree="clean"
BATCH_CLOSE lane=codex-gpt55-xhigh batch=R038 status="complete_read_only"
```

Contamination check:

- `last-message.md` contained no YURI-root reads.
- stderr hits were limited to packet guard text and target-repo evidence.

## File Coverage

Run 038 directly inspected RBAC/admin control files. Because several had already been covered as route shards or supporting reads, this result is recorded as deepening evidence pending a later coverage-ledger reconciliation.

Primary surfaces:

- `Dashboard-v2/src/lib/stores/user.svelte.ts`
- `Dashboard-v2/db-migrations/010_user_identity.sql`
- `Dashboard-v2/src/routes/admin/+page.svelte`
- `Dashboard-v2/src/routes/admin/members/+page.svelte`
- `Dashboard-v2/src/routes/admin/modules/+page.svelte`
- `Dashboard-v2/src/routes/admin/permissions/+page.svelte`
- `Dashboard-v2/src/routes/admin/system/+page.svelte`
- `Dashboard-v2/src/routes/admin/tracker/+page.svelte`
- `Dashboard-v2/src/routes/admin/pitch/+page.svelte`
- `Dashboard-v2/src/lib/components/admin/AdminSubNav.svelte`

## Accepted Findings

### R038-F01 - RBAC Has No Single Source Of Truth

Severity: high
Class: authorization architecture / policy drift

Evidence:

- `Dashboard-v2/src/lib/stores/user.svelte.ts:24-32` defines roles including `partner`.
- `user.svelte.ts:32-72` defines module/action `ROLE_DEFAULTS`.
- `user.svelte.ts:221-233` implements `user.can(...)` with CEO/CTO bypass, per-user override, then role defaults.
- `Dashboard-v2/db-migrations/010_user_identity.sql:12` limits SQL roles to `ceo`, `cto`, `marketing_manager`, and `operator`; `partner` is absent.
- `010_user_identity.sql:20-29` defines `role_permissions` as booleans/routes/tools, not module/action rows.
- `010_user_identity.sql:36-51` seeds route lists that do not match the Svelte module/action model.

Impact:

SQL, browser state, and UI pages can authorize different behavior. This makes both human and LLM reasoning about permissions unreliable.

Recommendation:

Collapse RBAC into one canonical schema and generate the browser role map from that source. Add parity tests for every module/action and route.

### R038-F02 - `/admin/permissions` Is Labeled CEO-Only But Allows CTO In Client Code

Severity: high
Class: authorization drift

Evidence:

- `Dashboard-v2/src/routes/admin/permissions/+page.svelte:3-14` describes the page and RPCs as CEO-only.
- `admin/permissions/+page.svelte:34-39` allows access when `user.can("admin.manage_permissions")` or `user.isAdmin`.
- `Dashboard-v2/src/lib/stores/user.svelte.ts:221-223` returns `true` for every `user.can(...)` call when role is `ceo` or `cto`.
- `user.svelte.ts:236-240` maps `isAdmin` to `ceo || cto`.

Impact:

The client gate admits CTO to the permission matrix despite CEO-only wording. Backend RPCs are not present in tracked migrations, so server-side CEO gating cannot be verified from GitHub-obtainable evidence.

Recommendation:

Express CEO-only as an explicit server-enforced predicate and align UI copy, client guard, RPC implementation, and tests.

### R038-F03 - Several High-Authority Admin Backends Are Missing From Tracked Source

Severity: high
Class: wiring / unverifiable authorization

Evidence:

- `Dashboard-v2/src/routes/admin/system/+page.svelte:104` calls `/api/functions/admin-system`, but no matching tracked function exists.
- `Dashboard-v2/src/routes/admin/pitch/+page.svelte:61`, `:77`, and `:114` call `/api/functions/pitch-sso`, but no matching tracked function exists.
- `Dashboard-v2/src/routes/admin/members/+page.svelte:253` calls `/api/functions/member-admin-update`, but no matching tracked function exists.

Impact:

The repo cannot prove backend authorization for system status, pitch magic links, or member identity updates. The pages may fail at runtime or rely on untracked handlers.

### R038-F04 - Admin Guards Are Client-Side UX Gates, Not Security Boundaries

Severity: medium
Class: authorization boundary

Evidence:

- `Dashboard-v2/src/routes/+layout.ts:1-3` disables SSR.
- Admin pages use `onMount` redirects, for example `admin/permissions/+page.svelte:34-39` and `admin/pitch/+page.svelte:45-52`.
- `Dashboard-v2/src/routes/admin/+page.svelte:10-12` redirects to `/admin/members` with no guard of its own.

Impact:

First-paint visibility and client navigation are not security controls. Backend functions and database RLS must enforce the real boundary.

### R038-F05 - High-Authority Route Names Are Visible In Static Navigation

Severity: medium
Class: navigationability / false affordance

Evidence:

- `Dashboard-v2/src/lib/components/Sidebar.svelte:35-37` statically exposes `Finance`, `Revenue`, and `Expenses`.
- `Sidebar.svelte:50-55` statically exposes system/admin-like surfaces including `System`, `AI Monitor`, `RailGuard`, `Deploy Log`, and `Admin`.
- `Dashboard-v2/src/routes/+layout.svelte:240-242` renders the sidebar for all non-bare routes.
- `+layout.svelte:311-318` renders admin profile links without permission filtering.

Impact:

Users and LLM agents see sensitive route names as available controls before authorization context is applied. That increases false-affordance and navigation confusion.

### R038-F06 - Backend RBAC Is Delegated To RPCs Missing From Tracked Migrations

Severity: medium/high
Class: unverifiable server-side authorization

Evidence:

- `Dashboard-v2/functions/tracker-admin-set-fte.js:76` calls `tracker_set_capacity`.
- `tracker-admin-set-working-hours.js:75` calls `tracker_set_working_hours`.
- `tracker-admin-set-rate.js:78` calls `tracker_set_billing_rate`.
- `tracker-absence-decide.js:74` calls `tracker_absence_decide`.
- Repo search found caller references to `has_permission`, `set_user_permission`, and `reset_user_permission`, but no tracked migration definitions for those RPCs.

Impact:

The function layer appears to rely on database RPCs for authorization and mutation, but the audited GitHub source cannot prove those RPC controls exist.

## Deferred Follow-Up

- A read-only applied Supabase schema/policy/function export is needed to close RPC truth.
- Backend auth for missing admin handlers is blocked until their source or deployed function inventory is provided.

## Coverage Update

No unique coverage increment is claimed in this result. The run materially deepens RBAC/admin guard truth and will be reconciled in the full coverage ledger later.
