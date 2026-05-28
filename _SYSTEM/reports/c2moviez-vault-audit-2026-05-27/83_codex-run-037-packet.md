# Codex Run 037 Packet - Deployment Route Map And Server Boot

Lane: `R037_DEPLOYMENT_ROUTE_MAP_GPT55_XHIGH`
Target clone: `/tmp/yuri-c2moviez-vault-full.b1RopZ/repo`
Target commit: `8103286e1abc63fa9490cb1375ecde4f340aa2bb`
Repository URL: `https://github.com/c2moviezfpv/c2moviez-vault`

## Non-Negotiables

- READ ONLY. Do not mutate, install, execute target services, call live endpoints, or use credentials.
- Work only from `/tmp/yuri-c2moviez-vault-full.b1RopZ/repo`, this packet, and your `/tmp` output.
- Do not read `.env`, `.claude/state`, `.claude/history`, `.claude/file-history`, `.claude/projects`, `backend/data`, `node_modules`, or `.amp`.
- Do not treat previous reports as proof; directly inspect assigned files.

## Assigned Scope

Primary files:

- `Dashboard-v2/production-server.js`
- `Dashboard-v2/server/index.js`
- `Dashboard-v2/server/express-adapter.js`
- `Dashboard-v2/server/Caddyfile.template`
- `Dashboard-v2/server/deploy.sh`
- `Dashboard-v2/server/ecosystem.config.cjs`
- `Dashboard-v2/svelte.config.js`
- `Dashboard-v2/package.json`

Supporting reads:

- `Dashboard-v2/functions/` manifest only, not every function body.
- `Dashboard-v2/src/routes/+layout.svelte`
- `Dashboard-v2/src/routes/login/+page.svelte`

## Questions To Answer

1. What exact route prefixes are mapped to the API server?
2. Does the server load the tracked function directory or an untracked layout?
3. Do frontend `/api/functions/*` calls have a tracked proxy/rewrite?
4. Can the documented PM2/Caddy deployment boot from the tracked files?
5. What smoke tests would catch this class of drift?

## Required Output

Emit proof, coverage, route maps, findings, suppressions, deferred rows, and `BATCH_CLOSE`:

```text
CLONE_PROOF ...
FILE_COVERAGE ...
DEPLOY_ROUTE_MAP source="<file:line>" route="<route/prefix>" target="<handler/process/path>" status="<mapped|missing|drift|deferred|positive>"
SERVER_BOOT_MAP source="<file:line>" dependency="<module/path/env>" status="<present|missing|drift|deferred|positive>"
FINDING id=R037-F## ...
SUPPRESSION ...
DEFERRED ...
BATCH_CLOSE lane=codex-gpt55-xhigh batch=R037 ...
```
