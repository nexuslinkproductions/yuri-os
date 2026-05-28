# Claude Run 031 Results - App Shell Navigation

Date: 2026-05-27
Lane: `R031_APP_SHELL_NAVIGATION_OPUS / APP-SHELL-NAVIGATION-031`
Worker: persistent Claude/tmux lane, Opus
Target clone: `/tmp/yuri-c2moviez-vault-full.b1RopZ/repo`
Target commit: `8103286e1abc63fa9490cb1375ecde4f340aa2bb`
Status: accepted with C-137 corrections

## Clone Proof

```text
CLONE_PROOF commit=8103286e1abc63fa9490cb1375ecde4f340aa2bb status_count=0 tracked_files=1505
```

The worker completed inside the persistent Claude lane and was cleared with `/clear`. C-137 validated the repo evidence against the canonical clone before accepting durable findings.

Raw capture retained outside durable reports:

```text
/tmp/yuri-c2v-claude-run-031/pipe/r031-claude-capture-full.txt
```

## File Coverage

```text
FILE_COVERAGE path="Dashboard-v2/src/routes/+layout.svelte" method=full_read status=covered lines=780 words=2826 notes="active app shell, auth verify, sidebar/mobile/palette mounts, profile menu"
FILE_COVERAGE path="Dashboard-v2/src/routes/+layout.ts" method=full_read status=covered lines=4 words=31 notes="layout load shim only"
FILE_COVERAGE path="Dashboard-v2/src/lib/components/Sidebar.svelte" method=full_read status=covered lines=434 words=1353 notes="active sidebar route source"
FILE_COVERAGE path="Dashboard-v2/src/lib/components/TopNav.svelte" method=full_read status=covered lines=333 words=940 notes="not mounted by active +layout.svelte"
FILE_COVERAGE path="Dashboard-v2/src/lib/components/MobileBottomNav.svelte" method=full_read status=covered lines=209 words=731 notes="active mobile bottom navigation and quick action sheet"
FILE_COVERAGE path="Dashboard-v2/src/lib/components/CommandPalette.svelte" method=full_read status=covered lines=457 words=1473 notes="active command palette route/action surface"
FILE_COVERAGE path="Dashboard-v2/src/lib/stores/cmdPalette.svelte.ts" method=full_read status=covered lines=28 words=99 notes="palette open/close state only"
FILE_COVERAGE path="Dashboard-v2/src/lib/stores/quickAction.svelte.ts" method=full_read status=covered lines=29 words=122 notes="quick action modal state only"
FILE_COVERAGE path="Dashboard-v2/src/lib/stores/theme.svelte.ts" method=full_read status=covered lines=36 words=95 notes="theme state/localStorage sync"
BATCH_CLOSE lane=opus batch=R031 files_covered=9 findings=7 suppressions=6 deferred=3 invalidated=0
```

## Accepted Findings

### R031-F01 - Dead Finance Route In Active Sidebar

Severity: medium
Class: navigation / availability

Evidence:

- `Dashboard-v2/src/lib/components/Sidebar.svelte:35` links the active sidebar to `/finance`.
- `git ls-files` finds `Dashboard-v2/src/routes/revenue/+page.svelte` and `Dashboard-v2/src/routes/expenses/+page.svelte`, but no `Dashboard-v2/src/routes/finance/+page.svelte`.

Impact:

Users and LLM agents following the active app navigation hit a missing SvelteKit route. This also pollutes repo navigation because "Finance" appears as a first-class app surface while only revenue/expenses routes exist.

Recommendation:

Create a real `/finance` route that aggregates revenue/expenses, or replace the sidebar link with existing route targets.

### R031-F02 - Admin Shell Links Are Visible Before Permission Context

Severity: low
Class: navigation / security hygiene

Evidence:

- `Dashboard-v2/src/lib/components/Sidebar.svelte:55` renders `/admin` for all shell users.
- `Dashboard-v2/src/routes/+layout.svelte:311` and `Dashboard-v2/src/routes/+layout.svelte:318` render `/admin/members` and `/admin/modules` profile links for all shell users.
- The assigned shell files contain no `user.can`, `isAdmin`, role, or permission checks around those links.

C-137 correction:

The worker's stronger "possible admin access" claim is not accepted as proven. Supporting reads show route-level guards in several admin pages, including `admin/members/+page.svelte:111`, `admin/modules/+page.svelte:47`, `admin/permissions/+page.svelte:36`, `admin/tracker/+page.svelte:89`, `admin/system/+page.svelte:82`, `admin/pitch/+page.svelte:48`, and `admin/design/+page.svelte:27`.

Impact:

This is a shell false-affordance and LLM navigationability issue rather than a proven authorization bypass. Non-admin users can be shown high-authority routes, then rely on downstream page redirects. It increases confusion and makes the permission model harder to infer from the shell.

Recommendation:

Derive shell visibility from the same `user.isAdmin` / `user.can(...)` primitives used by admin pages, while keeping page-level guards as the real enforcement layer.

### R031-F03 - Mobile Quick Actions Contain No-Op Buttons

Severity: low
Class: navigation / wiring

Evidence:

- `Dashboard-v2/src/lib/components/MobileBottomNav.svelte:23` labels a "New Note" action but only runs `sheetOpen = false`.
- `Dashboard-v2/src/lib/components/MobileBottomNav.svelte:24` labels "Push to Telegram" but only runs `sheetOpen = false`.

Impact:

Mobile users see promised action surfaces that do nothing. For an LLM/operator, the repo advertises capabilities that are not wired.

Recommendation:

Implement the actions or remove them until the backend/UI path exists.

### R031-F04 - Navigation Source Of Truth Is Fragmented

Severity: medium
Class: navigation / architecture

Evidence:

- Active sidebar routes live in `Sidebar.svelte:12-58`.
- Active mobile routes/actions live in `MobileBottomNav.svelte:8-25`.
- Active command palette routes live in `CommandPalette.svelte:96-106`.
- `TopNav.svelte:7-21` has another route list, but `+layout.svelte` imports and mounts `Sidebar`, `MobileBottomNav`, and `CommandPalette` only at `+layout.svelte:13-16`, `+layout.svelte:242`, `+layout.svelte:355`, and `+layout.svelte:356`. `TopNav` is not mounted by the active shell.

Impact:

Route truth is split across multiple hardcoded arrays, and one full navigation component appears stale/unmounted. This is a direct navigationability weakness for humans and LLMs: adding, renaming, or auditing a route requires reconciling multiple local truth sources.

Recommendation:

Create one shared route registry with per-surface visibility/filter metadata. Mark stale components as retired or remove them from active code.

### R031-F05 - Profile Identity Is Hardcoded In Active Shell

Severity: info
Class: navigation / data integrity

Evidence:

- `Dashboard-v2/src/routes/+layout.svelte:302` hardcodes avatar initials as `CT`.
- `Dashboard-v2/src/routes/+layout.svelte:303` hardcodes the visible profile name as `Claudio`.

Impact:

The multi-user shell can show the wrong identity even after auth succeeds. This is not a security bypass, but it damages operator trust and makes screenshots/dashboards less reliable as evidence.

Recommendation:

Populate shell identity from the authenticated profile/user store.

### R031-F06 - Client-Side Domain And CEO Constants Are Visible UX Gates

Severity: info
Class: security hygiene

Evidence:

- `Dashboard-v2/src/routes/+layout.svelte:47` hardcodes `ALLOWED_DOMAIN = "@c2moviez.com"`.
- `Dashboard-v2/src/routes/+layout.svelte:48` hardcodes `CEO_EMAIL = "claudio@c2moviez.com"`.
- The same layout later calls `/api/functions/auth` for server verification at `+layout.svelte:96-103` and `+layout.svelte:137-141`.

Impact:

The client-side domain/CEO checks are useful UX gates but are not security boundaries. Real enforcement must remain server-side and RLS-side.

Recommendation:

Keep the server verification path authoritative. Document client-side checks as convenience only.

### R031-F07 - Active Command Palette Covers Only A Subset Of App Routes

Severity: low
Class: navigationability

Evidence:

- `CommandPalette.svelte:96-106` lists only nine navigation targets.
- Active sidebar routes include additional targets such as `/nexogram`, `/tracker`, `/pipeline/customers`, `/nexdoc`, `/files`, `/expenses`, `/ai-monitor`, `/railguard`, `/di-monitor`, and `/admin` at `Sidebar.svelte:16-55`.

Impact:

The command palette is not a complete navigation index. That can be intentional, but the repo provides no shared metadata explaining which routes should be searchable and which should remain hidden.

Recommendation:

Use shared route metadata with `showInPalette`, `showInSidebar`, `requiresPermission`, and `status` fields.

## Suppressions And Corrections

```text
SUPPRESSION path="CommandPalette.svelte:77" hypothesis="missing credentials:'include' will omit same-origin cookies" counterevidence="browser fetch defaults credentials to same-origin for same-origin URLs; /api/functions/nlp-ticket is same-origin from the client path"
SUPPRESSION path="+layout.svelte:120-131" hypothesis="localStorage Supabase-token scan is itself a leak" counterevidence="reads same-origin Supabase auth keys only, uses try/catch, and forwards only to same-origin auth verification"
SUPPRESSION path="+layout.svelte:96-103" hypothesis="fire-and-forget auth verify leaks bearer externally" counterevidence="relative same-origin endpoint and credentials:'include'; no external URL in assigned code"
SUPPRESSION path="theme.svelte.ts:9-15" hypothesis="theme localStorage read breaks SSR" counterevidence="guarded by browser check before localStorage access"
SUPPRESSION path="TopNav.svelte:7-21" hypothesis="all TopNav links are active user navigation" counterevidence="TopNav is not imported or mounted by active +layout.svelte"
SUPPRESSION path="admin routes" hypothesis="shell admin links prove unauthorized admin access" counterevidence="supporting reads show route-level user.isAdmin/user.can guards on major admin pages; remaining server/RLS enforcement stays for later admin/backend shards"
```

## Deferred Follow-Ups

```text
DEFERRED path="Dashboard-v2/src/routes/admin/**" reason="R031 only spot-checked admin guards; full admin route authorization and server/RLS enforcement belongs to admin/backend shards" next="complete admin route and admin function shard"
DEFERRED path="/api/functions/nlp-ticket" reason="server endpoint implementation was not assigned in R031" next="verify endpoint auth, input validation, and route mapping in backend function shard"
DEFERRED path="/api/functions/auth" reason="server auth endpoint implementation was not assigned in R031" next="verify domain restriction, cookie issuance, bearer handling, and session invalidation server-side"
```

## Coverage Update

Before Run 031:

- accepted assigned target coverage: `322 / 1505`
- strict semantic coverage: `320 covered + 2 partial`

After Run 031:

- accepted assigned target coverage: `331 / 1505`
- strict semantic coverage: `329 covered + 2 partial`

The two partials remain:

- `Scripts/telegram-mcp/package-lock.json`
- `Scripts/team-bots/package-lock.json`
