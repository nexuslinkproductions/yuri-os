# Codex Run 037 Results - Deployment Route Map And Server Boot

Date: 2026-05-27
Lane: `R037_DEPLOY_ROUTE_BOOT_GPT55_XHIGH`
Worker: Codex CLI, `gpt-5.5`, `model_reasoning_effort=xhigh`, read-only sandbox
Target clone: `/tmp/yuri-c2moviez-vault-full.b1RopZ/repo`
Target commit: `8103286e1abc63fa9490cb1375ecde4f340aa2bb`
Status: accepted with C-137 validation

## Clone Proof

```text
CLONE_PROOF target="/tmp/yuri-c2moviez-vault-full.b1RopZ/repo" head="8103286e1abc63fa9490cb1375ecde4f340aa2bb" scoped_status="clean" mode="read-only"
BATCH_CLOSE lane=codex-gpt55-xhigh batch=R037 status="closed_with_findings" mutations=0 services_started=0
```

Contamination check:

- `last-message.md` contained no YURI-root reads.
- stderr hits were limited to prompt guard text and target-repo evidence.

## File Coverage

Run 037 directly reread deployment root-control files already covered in earlier runs. It is accepted as deepening/root-cause evidence, but no new unique coverage credit is added.

Primary inspected surfaces:

- `Dashboard-v2/production-server.js`
- `Dashboard-v2/server/index.js`
- `Dashboard-v2/server/express-adapter.js`
- `Dashboard-v2/server/Caddyfile.template`
- `Dashboard-v2/server/deploy.sh`
- `Dashboard-v2/server/ecosystem.config.js`
- `Dashboard-v2/svelte.config.js`
- `Dashboard-v2/package.json`

## Accepted Findings

### R037-F01 - Tracked PM2 API Entrypoint Cannot Boot Cleanly

Severity: critical
Class: availability / deployment integrity

Evidence:

- `Dashboard-v2/server/ecosystem.config.js:16-18` starts `./server/index.js` as `nex-api`.
- `Dashboard-v2/package.json:6` declares `"type": "module"`.
- `Dashboard-v2/server/index.js:4-9` uses CommonJS `require(...)`.
- `server/index.js:9` imports missing `./netlify-adapter`; the tracked adapter file is `Dashboard-v2/server/express-adapter.js`.

Impact:

A fresh tracked checkout can fail before serving `/health` or any function route.

### R037-F02 - Server And Deploy Scripts Expect An Untracked `netlify/functions` Layout

Severity: critical
Class: deployment integrity / architecture drift

Evidence:

- `Dashboard-v2/production-server.js:36-52` loads `netlify/functions`.
- `Dashboard-v2/server/index.js:40-93` maps handlers from `../netlify/functions/<name>`.
- `Dashboard-v2/server/deploy.sh:18` runs `npm install` in `$REMOTE/netlify/functions`.
- The tracked function tree is `Dashboard-v2/functions`; no tracked `Dashboard-v2/netlify/` directory exists.

Impact:

Clean GitHub-obtainable deployment cannot load function handlers unless the server has untracked stale files.

### R037-F03 - Frontend `/api/functions/*` Calls Have No Tracked Proxy Or Rewrite

Severity: high
Class: routing / navigationability

Evidence:

- Frontend files widely call `/api/functions/*`, including `Dashboard-v2/src/routes/+layout.svelte:96`, `:137`, `:206` and `Dashboard-v2/src/routes/login/+page.svelte:45`.
- `Dashboard-v2/server/Caddyfile.template:14-32` only routes `/.netlify/functions/*`, `/_internal/*`, and `/health` to the API process.
- `Dashboard-v2/server/index.js:40-82` registers explicit `/.netlify/functions/*` routes only.
- No tracked `Dashboard-v2/src/routes/api/**` bridge or Vite proxy was found.

Impact:

The frontend's main function dialect falls through to the frontend process under tracked Caddy/PM2 evidence. This is the root cause behind many route-level missing-handler findings.

### R037-F04 - Documented PM2/Caddy Deploy Is Not Reproducible From Tracked Files

Severity: high
Class: deployment reproducibility / false operational truth

Evidence:

- `Dashboard-v2/server/deploy.sh:12-14` rsyncs from an absolute local path on Claudio's machine.
- `deploy.sh:17-28` installs/restarts but does not run `npm run build`.
- `Dashboard-v2/server/ecosystem.config.js:36` expects `./build/index.js`.
- `Dashboard-v2/svelte.config.js:8` writes adapter-node output to `build/`.

Impact:

Tracked source does not describe a clean reproducible deploy. Production may depend on untracked local artifacts, stale remote files, or manual build state.

### R037-F05 - Function Route Coverage Drifts From The Tracked Function Manifest

Severity: high
Class: routing completeness / availability

Evidence:

- `Dashboard-v2/functions` contains 83 tracked `.js` files.
- `Dashboard-v2/server/index.js:40-82` publicly maps only a subset of explicit `/.netlify/functions/*` routes.
- `Dashboard-v2/server/ecosystem.config.js:152-157` schedules `/_internal/scheduled/decision-outcome`, but `server/index.js:85-93` omits that scheduled route.

Impact:

Even after boot blockers are fixed, configured or frontend-referenced functions can still 404/503 because the route table and function manifest are not reconciled.

## Recommended Smoke Tests

- Route-prefix parity: compare frontend `/api/functions/*` calls against Caddy, SvelteKit, and Express route tables.
- Entrypoint boot: start the documented API and assert `/health` responds in a clean clone.
- Function path resolve: fail CI when `server/index.js` or `production-server.js` require missing handler directories.
- Scheduled route parity: compare PM2 cron args with registered internal routes.
- Fresh deploy dry run: require repo-relative paths, build step, and existing PM2 scripts.

## Coverage Update

No unique coverage increment. Run 037 is accepted as root-cause consolidation over previously counted deployment files.
