# Codex Run 034 Results - Expenses Route

Date: 2026-05-27
Lane: `R034_EXPENSES_ROUTE_GPT55_XHIGH / EXPENSES-ROUTE-034`
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
/tmp/yuri-c2v-codex-run-034b/last-message.md
/tmp/yuri-c2v-codex-run-034b/stderr.log
```

## File Coverage

```text
FILE_COVERAGE path="Dashboard-v2/src/routes/expenses/+page.svelte" method=full_read status=covered lines=1568 words=4928 notes="full assigned route read from HEAD in six contiguous chunks"
BATCH_CLOSE lane=codex-gpt55-xhigh batch=R034 files_covered=1 findings=5 suppressions=3 deferred=2 invalidated=0
```

## Accepted Findings

### R034-F01 - Expenses Calls Missing Backend Functions

Severity: high
Class: wiring / availability

Evidence:

- `Dashboard-v2/src/routes/expenses/+page.svelte:242` calls `/api/functions/expenses-list`.
- `expenses/+page.svelte:280` calls `/api/functions/expenses-create`.
- `expenses/+page.svelte:324` calls `/api/functions/expenses-update`.
- `expenses/+page.svelte:397-399` calls `/api/functions/nexdoc-list?type=invoice&status=accepted&limit=20`.
- `git ls-files Dashboard-v2/functions/*expenses* Dashboard-v2/functions/*nexdoc*` returned no tracked handlers.
- Caddy and production server evidence still map only `/.netlify/functions/*`.

Impact:

Expenses cannot load, create, update, mark paid, or import NEXdoc invoices from tracked source evidence.

Recommendation:

Add tracked `expenses-list`, `expenses-create`, `expenses-update`, and `nexdoc-list` handlers, or update the route to implemented endpoints with tests.

### R034-F02 - Expenses Surface Lacks Route-Local Permission Gate

Severity: high
Class: privacy / authorization

Evidence:

- `expenses/+page.svelte:680-681` displays net and gross financial fields.
- `expenses/+page.svelte` imports no user store and contains no `user.can`, `isAdmin`, or `can_view_financials` check.
- `Dashboard-v2/src/lib/components/Sidebar.svelte:37` exposes `/expenses` in the active sidebar.
- `Dashboard-v2/db-migrations/010_user_identity.sql:44-51` seeds `marketing_manager` and `operator` with `can_view_financials=false` and no `/expenses` allowed route.

C-137 correction:

This is accepted as a high-risk authorization design gap, not a proven live leak, because the actual expenses handlers are missing from tracked source. Server-side enforcement may exist out of repo.

Impact:

If the missing handlers are deployed without equivalent permission checks, non-finance users can request AP/vendor financial data.

Recommendation:

Gate `/expenses` route visibility and every expenses/NEXdoc handler with a finance permission. Mask totals and row amounts for unauthorized roles.

### R034-F03 - Expense Amounts Are Client-Derived

Severity: medium
Class: financial data integrity

Evidence:

- `expenses/+page.svelte:280-292` sends `amount_net`, `vat_rate`, and `vat_amount` from client state during create.
- `expenses/+page.svelte:435-441` derives net from NEXdoc gross/VAT or assumes `8.1%` VAT when only gross exists.
- Update flow sends client patch bodies through `expenses/+page.svelte:324-330`.

Impact:

Financial amounts can become stale, invented, or non-auditable if persisted from the client payload without server-side recomputation and audit.

Recommendation:

Derive net/VAT/gross server-side, persist source values and calculation basis, and audit each financial mutation.

### R034-F04 - Expense-To-NEXdoc Scan Link Is Not Deep-Linked

Severity: medium
Class: navigationability / auditability

Evidence:

- `expenses/+page.svelte:692-693` renders a `Scan` link as `href="/nexdoc"` when `e.scanned_doc_id` exists.
- `Dashboard-v2/src/routes/nexdoc/+page.svelte` has `selectedDoc` drawer state and `openDrawer(doc)`, but no query/deep-link handling for a document id.

Impact:

Users and LLM agents cannot navigate directly from an expense row to the supporting invoice scan, weakening AP auditability.

Recommendation:

Pass `scanned_doc_id` in the URL and make `/nexdoc` open or focus that document.

### R034-F05 - Update Uses Bearer-Only Auth While Other Helpers Are Cookie-Primary

Severity: medium
Class: auth consistency / availability

Evidence:

- `expenses/+page.svelte:323-344` hand-builds `fetch("/api/functions/expenses-update")` and requires `getAccessToken()` from Supabase session.
- Shared `Dashboard-v2/src/lib/db.ts:718-759` uses cookie-primary `postAuthed/getAuthed` with optional Bearer.

Impact:

Users authenticated by the custom `exeo_token` cookie but lacking a current Supabase session may load/create through helpers but fail update/mark-paid.

Recommendation:

Use a shared `patchAuthed` helper with `credentials:'include'` and optional Bearer.

## Strengths And Suppressions

```text
SUPPRESSION path="Dashboard-v2/src/routes/expenses/+page.svelte" hypothesis="route directly mutates Supabase expense tables from browser" counterevidence="no .from() calls in the route; only Supabase auth session retrieval appears"
SUPPRESSION path="Dashboard-v2/src/routes/expenses/+page.svelte" hypothesis="route stores AP financial data in localStorage" counterevidence="no localStorage/sessionStorage references in the route"
SUPPRESSION path="Dashboard-v2/src/routes/expenses/+page.svelte" hypothesis="unguarded delete mutation is exposed" counterevidence="no delete UI, delete endpoint, or delete fetch in the assigned file"
```

## Deferred Follow-Up

```text
DEFERRED path="Dashboard-v2/functions/expenses-*.js" reason="matching tracked handlers are absent, so server-side role/scope/audit enforcement cannot be inspected" next="read tracked handler implementations or deployment artifact if supplied"
DEFERRED path="Supabase expenses/NEXdoc schema" reason="current tracked migrations contain no expense or scanned_doc table definitions for this surface" next="read schema migrations or SQL dump defining AP ledger and NEXdoc tables"
```

## Coverage Update

Before Run 034:

- accepted assigned target coverage: `342 / 1505`
- strict semantic coverage: `340 covered + 2 partial`

After Run 034:

- accepted assigned target coverage: `343 / 1505`
- strict semantic coverage: `341 covered + 2 partial`
