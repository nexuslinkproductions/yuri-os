# Codex Run 039 Results - NEXdoc Document Surface

Date: 2026-05-27
Lane: `R039_NEXDOC_DOCUMENT_SURFACE_GPT55_XHIGH`
Worker: Codex CLI, `gpt-5.5`, `model_reasoning_effort=xhigh`, read-only sandbox
Target clone: `/tmp/yuri-c2moviez-vault-full.b1RopZ/repo`
Target commit: `8103286e1abc63fa9490cb1375ecde4f340aa2bb`
Status: accepted with C-137 validation

## Clone Proof

```text
CLONE_PROOF target_clone="/tmp/yuri-c2moviez-vault-full.b1RopZ/repo" head="8103286e1abc63fa9490cb1375ecde4f340aa2bb" read_only="true"
BATCH_CLOSE lane=codex-gpt55-xhigh batch=R039 status="complete" mutation="none"
```

Contamination check:

- `last-message.md` contained no YURI-root reads.
- stderr hits were limited to packet guard text and target-repo evidence.

## File Coverage

`Dashboard-v2/src/routes/nexdoc/+page.svelte` was already accepted in Run 020. Run 039 is accepted as a deeper document-workflow pass and adds no unique coverage credit.

Supporting verification:

- `Dashboard-v2/src/routes/expenses/+page.svelte`
- `Dashboard-v2/src/routes/files/+page.svelte`
- `Dashboard-v2/production-server.js`
- `Dashboard-v2/server/Caddyfile.template`
- `Dashboard-v2/functions` manifest

## Accepted Findings

### R039-F01 - NEXdoc Calls Missing Or Unmapped Backend Handlers

Severity: high
Class: wiring / availability / unverifiable authorization

Evidence:

- `Dashboard-v2/src/routes/nexdoc/+page.svelte:97` calls `/api/functions/nexdoc-list`.
- `nexdoc/+page.svelte:135` calls `/api/functions/nexdoc-scan`.
- `nexdoc/+page.svelte:185` and `:218` call `/api/functions/nexdoc-update`.
- The tracked function manifest contains `Dashboard-v2/functions/document-generate.js`, but no `nexdoc-list`, `nexdoc-scan`, or `nexdoc-update` handlers.
- `Dashboard-v2/production-server.js:118-123` maps `/.netlify/functions/:name`.
- `Dashboard-v2/server/Caddyfile.template:14-16` proxies `/.netlify/functions/*`, not `/api/functions/*`.

Impact:

Document list, upload scan, metadata save, and quick status changes depend on missing/unmapped backend wiring unless an untracked deployment layer exists.

### R039-F02 - Expense Rows Cannot Deep-Link To Their Scanned Document

Severity: medium
Class: navigationability / workflow integrity

Evidence:

- `Dashboard-v2/src/routes/expenses/+page.svelte:692-693` renders a `Scan` link to bare `/nexdoc` when `scanned_doc_id` exists.
- `Dashboard-v2/src/routes/nexdoc/+page.svelte:270` only runs `loadDocs()` on mount; it does not parse a query parameter or open a document drawer.

Impact:

Users cannot navigate from an expense row to the exact source document, which weakens auditability and makes the repo harder for an LLM agent to operate reliably.

### R039-F03 - NEXdoc UI Claims Claude/AI Extraction That Repo Wiring Cannot Support

Severity: medium
Class: false assurance / availability

Evidence:

- `Dashboard-v2/src/routes/nexdoc/+page.svelte:3-4` says PDF/image upload is extracted by Claude and stored in Supabase.
- `nexdoc/+page.svelte:134-135` sends uploads to `/api/functions/nexdoc-scan`.
- `nexdoc/+page.svelte:282-283` and `:312-316` display AI/Claude extraction copy.
- No tracked `nexdoc-scan` function was found.

Impact:

The UI advertises a working extraction workflow that the GitHub-obtainable source cannot execute.

### R039-F04 - NEXdoc Route Delegates Auth But Has No Route-Local Role Guard

Severity: low
Class: authorization review gap

Evidence:

- `Dashboard-v2/src/routes/nexdoc/+page.svelte:7` imports `getAuthed` and `postAuthed`.
- Endpoint calls at `:97`, `:135`, `:185`, and `:218` use those helpers.
- No route-local `user.can(...)`, `user.isAdmin`, or role check was found.

Impact:

Authorization depends entirely on missing/unmapped backend handlers and deployed RLS. This is not by itself proof of exposure, but it leaves the route unclosed from repo truth.

## Suppressions

- Editable metadata is real and bounded to the drawer fields at `nexdoc/+page.svelte:468-620`; raw extraction JSON and confidence are display-only.
- No literal OCR claim was found in the route; the unsupported claim is Claude/AI extraction/scanning.

## Coverage Update

No unique coverage increment. Run 039 deepens the already counted NEXdoc route and links it to expenses/files navigation evidence.
