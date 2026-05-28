# Claude Run 040 Packet - Auth/Internal Access Baseline

Target clone: `/tmp/yuri-c2moviez-vault-full.b1RopZ/repo`
Target commit: `8103286e1abc63fa9490cb1375ecde4f340aa2bb`
Repo URL: `https://github.com/c2moviezfpv/c2moviez-vault`
Mode: read-only, no mutation, no installs, no service starts, no live calls, no credential use.

You are an advisory lane. C-137 verifies all claims before acceptance.

## Hard Guard

- Work only from the target clone.
- Do not read YURI root files.
- Do not read `.env`, `backend/data`, `.claude/state`, `.claude/history`, `.claude/file-history`, `.claude/projects`, `node_modules`, or `.amp`.
- Do not print raw secrets. If a credential appears in source, report type/path/line and a redacted fingerprint only.
- Search is allowed only as an index into reading; it does not close coverage.

## Assigned Scope

Read these files directly and line-ground all claims:

- `Dashboard-v2/functions/auth.js`
- `Dashboard-v2/functions/auth-check.js`
- `Dashboard-v2/functions/config-public.js`
- `Dashboard-v2/functions/health.js`
- `Dashboard-v2/functions/shared.js`
- `Dashboard-v2/functions/shared-config.js`
- `Dashboard-v2/src/lib/db.ts` auth helper section only
- `Dashboard-v2/src/routes/login/+page.svelte`
- `Dashboard-v2/src/routes/auth/callback/+page.svelte`
- `Dashboard-v2/src/routes/+layout.svelte` auth/session calls only

Supporting route-map reads are allowed:

- `Dashboard-v2/server/index.js`
- `Dashboard-v2/server/Caddyfile.template`
- `Dashboard-v2/production-server.js`

## Questions To Close

1. What are the real auth mechanisms: cookie, bearer, Supabase session, internal key, HMAC, or unauthenticated?
2. Which handlers set cookies or trust cookies?
3. Which handlers accept internal trust headers?
4. Are CORS/origin/cookie attributes coherent for `ops.c2moviez.com`?
5. Which failures could explain users being logged out, Telegram/Claude control breaking, or dashboards falsely claiming auth health?
6. Are any auth comments stronger than the code?

## Required Output

Emit:

```text
CLONE_PROOF ...
FILE_COVERAGE path="..." status=covered|partial lines=... notes="..."
AUTH_CONTROL_MAP source="path:line" mechanism="..." status="..."
FINDING id=R040-F.. severity=... title="..." evidence="path:line, path:line" impact="..."
SUPPRESSION source="path:line" hypothesis="..." counterevidence="..."
DEFERRED source="..." reason="..."
BATCH_CLOSE lane=claude-opus batch=R040 status="complete_read_only"
```

Prefer `unknown` over guessing. Keep the output concise but evidence-rich.
