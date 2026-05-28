# Codex Run 033 Results - File Vault Route

Date: 2026-05-27
Lane: `R033_FILE_VAULT_ROUTE_GPT55_XHIGH / FILE-VAULT-ROUTE-033`
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
/tmp/yuri-c2v-codex-run-033b/last-message.md
/tmp/yuri-c2v-codex-run-033b/stderr.log
```

The first unguarded `R033` launch remains invalidated. This accepted result uses only the guarded `R033b` output.

## File Coverage

```text
FILE_COVERAGE path="Dashboard-v2/src/routes/files/+page.svelte" method=full_read status=covered lines=1443 words=5139 notes="full route read; supporting searches bounded to endpoints, handlers, auth helpers, routing, schema/storage, upload/download flows"
BATCH_CLOSE lane=codex-gpt55-xhigh batch=R033 files_covered=1 findings=6 suppressions=3 deferred=3 invalidated=0
```

## Accepted Findings

### R033-F01 - File Vault Calls Missing File Backend Functions

Severity: high
Class: wiring / availability

Evidence:

- `Dashboard-v2/src/routes/files/+page.svelte:79` calls `/api/functions/nex-files-list`.
- `files/+page.svelte:105` calls `/api/functions/nex-file-download`.
- `files/+page.svelte:172` calls `/api/functions/nex-file-ingest`.
- `files/+page.svelte:177` calls `/api/functions/nex-file-presign`.
- `files/+page.svelte:206` calls `/api/functions/nex-file-confirm`.
- `git ls-files Dashboard-v2/functions/*nex-file* Dashboard-v2/functions/*nex-files*` returned no tracked handlers.

Impact:

The File Vault UI can list, download, inline-upload, presign-upload, and confirm only if out-of-repo handlers exist. Tracked GitHub evidence cannot validate the feature as wired.

Recommendation:

Add tracked list/download/ingest/presign/confirm handlers and route-contract tests, or update callers to implemented endpoints.

### R033-F02 - File Vault Uses The Same Unmapped `/api/functions/*` Dialect

Severity: high
Class: deployment wiring

Evidence:

- `Dashboard-v2/server/Caddyfile.template:14-16` proxies only `/.netlify/functions/*`.
- `Dashboard-v2/production-server.js:118-123` mounts only `/.netlify/functions/:name`.
- `Dashboard-v2/src/routes/files/+page.svelte` calls `/api/functions/*`.
- `git ls-files Dashboard-v2/src/routes/api/**` returned no tracked SvelteKit API routes.

Impact:

Even if Netlify-style handlers existed, the tracked deployment route shape does not map the `/api/functions/*` prefix used by the frontend.

Recommendation:

Standardize on one function dialect and enforce it with static endpoint inventory checks.

### R033-F03 - API Server Wrapper References Missing Adapter And Function Layout

Severity: high
Class: availability / deployment architecture

Evidence:

- `Dashboard-v2/server/index.js:9` requires `./netlify-adapter`.
- The tracked adapter file is `Dashboard-v2/server/express-adapter.js`; no `Dashboard-v2/server/netlify-adapter.js` is tracked.
- `server/index.js:40-82` requires `../netlify/functions/*`.
- `Dashboard-v2/production-server.js:36` also expects `netlify/functions`.
- Tracked functions live under `Dashboard-v2/functions/`; `git ls-files Dashboard-v2/netlify/**` returned no paths.

Impact:

The tracked server wrappers can fail before reaching handler logic, or load from an untracked deployment layout. This compounds the missing File Vault handlers and app-wide function-route drift.

Recommendation:

Align adapter filename, function directory, deploy script, and server route map. Add a boot smoke test that requires every registered handler.

### R033-F04 - Large Upload Presign/Confirm Security Is Unverifiable

Severity: medium
Class: file handling / security

Evidence:

- `files/+page.svelte:177-187` obtains `presign.upload_url`.
- `files/+page.svelte:190-202` PUTs the browser-selected file directly to the presigned URL.
- `files/+page.svelte:206` confirms only `{ file_id: presign.file_id }`.
- No `nex-file-presign` or `nex-file-confirm` handler is tracked.

Impact:

Repository evidence cannot prove the signed URL is short-lived, scoped to a safe object key, MIME/size-bound, user-bound, or verified after upload.

Recommendation:

Implement presign/confirm handlers with authenticated user binding, object-key scoping, short TTL, size/hash validation, and post-upload object verification.

### R033-F05 - File Metadata Is Fully Client-Supplied

Severity: medium
Class: data integrity / authorization

Evidence:

- `files/+page.svelte:162-170` sends `source_module`, `category`, `client_code`, `created_by: 'ceo-upload'`, and `tags`.
- `files/+page.svelte:177-185` repeats these metadata fields for presign.
- No `nex_files` schema, RLS policy, or handler-side validation is tracked.

Impact:

If a backend trusts the payload, users can misattribute files to clients/modules or forge creator metadata.

Recommendation:

Treat all metadata as untrusted. Derive actor server-side and enforce client/module authorization in handler and schema constraints.

### R033-F06 - File Vault Route Is A 1443-Line Mixed-Concern Component

Severity: low
Class: navigationability

Evidence:

- `Dashboard-v2/src/routes/files/+page.svelte` is 1443 lines.
- It combines data calls, filtering, upload protocols, modal state, grid/list rendering, and CSS.

Impact:

Maintenance agents can miss cross-effects between upload, list state, display logic, and styling.

Recommendation:

Extract API client logic, file cards/list rows, upload modal, and style-heavy sections into smaller modules/components.

## Strengths And Suppressions

```text
SUPPRESSION path="Dashboard-v2/src/routes/files/+page.svelte" hypothesis="assigned route hardcodes service credentials or stores vault secrets in browser storage" counterevidence="route uses getAuthed/postAuthed; no localStorage/sessionStorage/SERVICE_ROLE/SECRET/TOKEN matches in assigned file"
SUPPRESSION path="Dashboard-v2/src/routes/files/+page.svelte" hypothesis="route directly queries Supabase tables or storage from the browser" counterevidence="all list/download/ingest/presign/confirm operations go through endpoint helpers"
SUPPRESSION path="Dashboard-v2/src/routes/files/+page.svelte:107-109" hypothesis="download anchor has tabnabbing issue" counterevidence="anchor sets target='_blank' and rel='noopener'"
```

## Deferred Follow-Up

```text
DEFERRED path="/api/functions/nex-file-presign" reason="handler absent from tracked repo; URL TTL, object path scoping, method, MIME/size binding, and credential isolation cannot be verified" next="read deployed handler or add tracked implementation"
DEFERRED path="/api/functions/nex-file-confirm" reason="handler absent from tracked repo; object existence, size/hash validation, and metadata finalization cannot be verified" next="read deployed handler or add tracked implementation"
DEFERRED path="public.nex_files schema/RLS" reason="no tracked table/RLS migration found" next="owner-provided schema export or tracked migration"
```

## Coverage Update

Before Run 033:

- accepted assigned target coverage: `341 / 1505`
- strict semantic coverage: `339 covered + 2 partial`

After Run 033:

- accepted assigned target coverage: `342 / 1505`
- strict semantic coverage: `340 covered + 2 partial`
