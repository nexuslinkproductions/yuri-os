# Codex Run 039 Packet - NEXdoc Document Surface

Lane: `R039_NEXDOC_DOCUMENT_SURFACE_GPT55_XHIGH`
Target clone: `/tmp/yuri-c2moviez-vault-full.b1RopZ/repo`
Target commit: `8103286e1abc63fa9490cb1375ecde4f340aa2bb`
Repository URL: `https://github.com/c2moviezfpv/c2moviez-vault`

## Non-Negotiables

- READ ONLY. Do not mutate, execute target services, call live services, scan production, or use credentials.
- Inspect only the target clone, this packet, and your `/tmp` output.
- Do not read `.env`, `.claude/state`, `.claude/history`, `.claude/file-history`, `.claude/projects`, `backend/data`, `node_modules`, or `.amp`.
- Direct file evidence required.

## Assigned Scope

Primary file:

- `Dashboard-v2/src/routes/nexdoc/+page.svelte`

Supporting files:

- `Dashboard-v2/src/routes/files/+page.svelte`
- `Dashboard-v2/src/routes/expenses/+page.svelte`
- `Dashboard-v2/functions/` manifest only for `nexdoc-*`, `nex-file-*`, and document handlers
- `Dashboard-v2/server/Caddyfile.template`
- `Dashboard-v2/production-server.js`

## Questions To Answer

1. Which NEXdoc endpoints are called and are they tracked/mapped?
2. Does the page handle deep links from expenses/files, or only list/drawer state?
3. What document metadata can be edited from the browser?
4. Are auth/permission checks discoverable in the route?
5. Does the route make claims about scanning/OCR/status that repo wiring cannot support?

## Required Output

```text
CLONE_PROOF ...
FILE_COVERAGE path="Dashboard-v2/src/routes/nexdoc/+page.svelte" ...
NEXDOC_ACTION_MAP source="<file:line>" action="<list|scan|update|download|edit|status>" target="<endpoint/table/UI>" control="<frontend|backend|missing|unknown>" status="<covered|reportable|positive|deferred>"
NEXDOC_WIRING_MAP source="<file:line>" endpoint_or_dependency="<endpoint>" backend_or_handler="<path|missing>" route_mapping="<mapped|missing|deferred>" status="<covered|reportable|positive|deferred>"
NAVIGATIONABILITY_MAP ...
FINDING id=R039-F## ...
SUPPRESSION ...
DEFERRED ...
BATCH_CLOSE lane=codex-gpt55-xhigh batch=R039 ...
```
