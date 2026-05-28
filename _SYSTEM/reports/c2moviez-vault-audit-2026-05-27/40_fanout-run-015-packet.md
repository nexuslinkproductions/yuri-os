# Fanout Run 015 Packet

Date: 2026-05-27
Target clone: `/tmp/yuri-c2moviez-vault-full.b1RopZ/repo`
Target commit: `8103286e1abc63fa9490cb1375ecde4f340aa2bb`
Worker mode: single persistent Claude/tmux lane, active cap `1`
Required model lane: Opus worker in the existing persistent session

## Mission

Execute one bounded read-only target-repo shard:

`R015_WRAPPER_TELEGRAM_EVENT_SHARED_OPUS / WRAPPER-TELEGRAM-EVENT-SHARED-015`

This shard closes Run 014's key deployment and side-effect unknowns: whether the production wrapper can load functions, whether Caddy/PM2/deploy paths agree, whether Telegram/event-dispatch endpoints have real auth controls, whether Telegram HTML output is escaped, whether internal function calls are authenticated, and how shared storage/data/config helpers handle service-role authority.

## Non-Negotiable Rules

- Read-only only.
- No writes to Claudio's target repository.
- No writes to YURI report files from the worker lane.
- No target execution, no dependency installs, no service starts.
- No live service calls.
- No credential use, validation, replay, provider login, or API probing.
- Use only repository evidence from `/tmp/yuri-c2moviez-vault-full.b1RopZ/repo`.
- Do not read YURI protected runtime paths.
- Do not browse `.claude/state`, `.claude/history`, `.claude/file-history`, `.claude/projects`, `.env`, `node_modules`, `.amp`, or `backend/data`.
- C-137 writes the durable report after validating your output.

## Required Clone Proof

Emit:

```text
CLONE_PROOF commit=<sha> status_count=<n> tracked_files=<n>
```

Expected:

- commit `8103286e1abc63fa9490cb1375ecde4f340aa2bb`
- status count `0`
- tracked files `1505`

## Assigned Current-Tree Files

Inspect these files directly and completely:

1. `Dashboard-v2/production-server.js`
2. `Dashboard-v2/server/express-adapter.js`
3. `Dashboard-v2/server/deploy.sh`
4. `Dashboard-v2/server/Caddyfile.template`
5. `Dashboard-v2/functions/telegram.js`
6. `Dashboard-v2/functions/event-dispatch.js`
7. `Dashboard-v2/functions/shared-data.js`
8. `Dashboard-v2/functions/shared-storage.js`
9. `Dashboard-v2/functions/shared.js`
10. `Dashboard-v2/functions/shared-config.js`

`Dashboard-v2/functions/telegram.js` is large. Read it in chunks and do not mark it covered until all lines are inspected.

## Required Missing-Dependency Check

Run a bounded existence check for:

- `Dashboard-v2/functions/membership.js`
- `Dashboard-v2/server/netlify-adapter.js`
- `Dashboard-v2/netlify/functions`

Emit:

```text
MISSING_PROOF path="<path>" command="git ls-files/test -e" status=<missing|exists> impact="<short>"
```

Missing paths do not increment covered-file counts, but they can support wiring findings.

## Required Output Rows

For every assigned existing file:

```text
PATH_PROOF path="<path>" command="git ls-files" status=exists
READ_PROOF path="<path>" command="git show HEAD:<path>" first_line="<bounded>" last_line="<bounded>"
FILE_COVERAGE path="<path>" method=full_read status=covered lines=<n> words=<n> notes="<short>"
```

For deployment and function wrapper mapping:

```text
DEPLOYMENT_MAP path="<path>" component="<pm2|caddy|deploy|wrapper|adapter|functions-dir>" expected="<repo evidence>" actual_tracked="<repo evidence>" failure_mode="<short>" status="<covered|reportable|suppressed|deferred>"
```

For Telegram/event side effects:

```text
SIDE_EFFECT_MAP path="<path>" entrypoint="<handler/callback/tool>" auth_control="<telegram_secret|allowed_users|checkAuth|internal_hmac|legacy_key|none|unknown>" source="<browser|telegram|internal_function|cron|mcp|unknown>" sink="<telegram|plane|supabase|storage|m365|production_hub|vault_queue>" escaping="<html_escape|none|partial|not_applicable>" failure_mode="<short>" status="<covered|reportable|suppressed|deferred>"
```

For shared helpers:

```text
HELPER_MAP path="<path>" helper="<name>" credential_source="<anon|service_role|plane|anthropic|none|mixed>" reads="<short>" writes="<short>" controls="<short>" failure_mode="<short>" status="<covered|reportable|suppressed|deferred>"
```

For findings:

```text
FINDING id=R015-F## severity=<critical|high|medium|low|info> path="<path:line>" class=<security|wiring|availability|privacy|llm_nav|positive> evidence="<repo evidence>" impact="<impact>" recommendation="<fix or next verification>"
```

For suppressions:

```text
SUPPRESSION path="<path>" hypothesis="<risk considered>" counterevidence="<exact counterevidence>"
```

For deferred items:

```text
DEFERRED path="<path-or-surface>" reason="<exact blocker>" next="<next read-only evidence source>"
```

Close with:

```text
BATCH_CLOSE lane=opus batch=R015 files_covered=<n> findings=<n> suppressions=<n> deferred=<n> invalidated=0
```

## Audit Questions

Answer from repo evidence only:

- Does the tracked PM2/Caddy/deploy wrapper load `Dashboard-v2/functions`, or does it expect missing `netlify/functions` paths?
- Does `server/index.js`'s missing `netlify-adapter.js`/path issue have a supported alternative in `production-server.js`, `express-adapter.js`, or deploy scripts?
- Does Caddy expose `/.netlify/functions/*` publicly while restricting only `/_internal/*`?
- Does `telegram.js` authenticate webhooks by Telegram secret token and restrict user IDs before side effects?
- Does `telegram.js` also accept internal calls from other functions, and if so, are they authenticated?
- Does `event-dispatch.js` use `checkAuth`, HMAC, legacy key, or no auth? Does it HTML-escape event fields before sending Telegram HTML messages?
- Do `chat.js`/`mcp-server.js` side-effect calls identified in Run 014 succeed or fail against these endpoints?
- Does `shared-storage.js` prefer service-role credentials and write arbitrary buckets/keys for callers?
- Does `shared-data.js` expose large storage reads without bounds?
- Does `shared-config.js` include hardcoded IDs/fallbacks that explain navigation or wiring drift?

## False-Positive Guards

- Do not report Telegram webhook unauthenticated if `x-telegram-bot-api-secret-token` is checked and normal Telegram user IDs are allowlisted before actions.
- Do not report public Caddy exposure as a vulnerability by itself; combine it with function-level auth or missing auth.
- Do not report missing `membership.js` as a runtime defect without checking whether the caller treats failure as optional.
- Do not treat service-role storage helper use as bad by itself; report it when callers can write arbitrary bucket/key or when missing auth lets external users reach it.
- Do not print raw secrets or environment values.
- Preserve positives such as Telegram secret-token checks, allowed-user checks, Caddy loopback restriction for `/_internal`, HMAC wrappers, idempotency/dedup keys, and bounded file/HTML escaping if present.

## C-137 Current Coverage State

Before Run 015:

- accepted assigned target coverage: `238 / 1505`
- strict semantic coverage: `236 covered + 2 partial`
- partial files: `Scripts/telegram-mcp/package-lock.json`, `Scripts/team-bots/package-lock.json`
