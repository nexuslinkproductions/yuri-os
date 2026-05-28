# Fanout Run 016 Packet

Date: 2026-05-27
Target clone: `/tmp/yuri-c2moviez-vault-full.b1RopZ/repo`
Target commit: `8103286e1abc63fa9490cb1375ecde4f340aa2bb`
Worker mode: single persistent Claude/tmux lane, active cap `1`
Required model lane: Opus worker in the existing persistent session

## Mission

Execute one bounded read-only target-repo shard:

`R016_SHARED_PLANE_PRODUCTION_HUB_OPUS / SHARED-PLANE-PRODUCTION-HUB-016`

This shard closes Run 015's shared-helper and production-side-effect dependencies: Plane pagination/bounds and write helpers, duplicated Plane client drift, shared Telegram HTML/recipient behavior, fact-ledger authority, idempotency controls, `production-hub` auth posture, token/metrics/health exposure, and deep-learning automation cost/loop risks.

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

1. `Dashboard-v2/functions/shared-plane.js`
2. `Dashboard-v2/functions/shared-plane-client.js`
3. `Dashboard-v2/functions/shared-telegram.js`
4. `Dashboard-v2/functions/shared-facts.js`
5. `Dashboard-v2/functions/shared-idempotency.js`
6. `Dashboard-v2/functions/production-hub.js`
7. `Dashboard-v2/functions/token-usage.js`
8. `Dashboard-v2/functions/health.js`
9. `Dashboard-v2/functions/metrics-snapshot.js`
10. `Dashboard-v2/functions/deep-learning.js`

Read every line of every assigned file. Do not mark a file covered from a summary, search hit, or partial read.

## Required Output Rows

For every assigned existing file:

```text
PATH_PROOF path="<path>" command="git ls-files" status=exists
READ_PROOF path="<path>" command="git show HEAD:<path>" first_line="<bounded>" last_line="<bounded>"
FILE_COVERAGE path="<path>" method=full_read status=covered lines=<n> words=<n> notes="<short>"
```

For shared Plane and provider helpers:

```text
PROVIDER_HELPER_MAP path="<path>" helper="<name>" provider="<plane|telegram|supabase|anthropic|mixed|none>" credential_source="<env name category, not value>" reads="<short>" writes="<short>" bounds="<pagination/rate/size/time controls>" error_behavior="<throw|fallback|silent|retry>" status="<covered|reportable|suppressed|deferred>"
```

For production-side-effect endpoints:

```text
ENDPOINT_MAP path="<path>" entrypoint="<handler/action>" method_control="<GET|POST|any|unknown>" auth_control="<checkAuth|hmac|legacy_key|cookie|none|unknown>" source="<browser|telegram|cron|internal_function|mcp|unknown>" sink="<plane|supabase|telegram|storage|llm|none|mixed>" failure_mode="<short>" status="<covered|reportable|suppressed|deferred>"
```

For health, metrics, and token endpoints:

```text
OBSERVABILITY_MAP path="<path>" entrypoint="<handler/helper>" exposed_data="<env_status|counts|costs|tokens|client_data|none|mixed>" auth_control="<checkAuth|hmac|legacy_key|none|unknown>" freshness="<live|cached|static|unknown>" false_assurance_risk="<short>" status="<covered|reportable|suppressed|deferred>"
```

For automation/cost loops:

```text
AUTOMATION_MAP path="<path>" trigger="<cron|http|manual|imported|unknown>" auth_control="<checkAuth|hmac|legacy_key|none|unknown>" loop_bounds="<count/time/token/memory controls>" writes="<supabase|plane|telegram|storage|none|mixed>" cost_risk="<short>" status="<covered|reportable|suppressed|deferred>"
```

For findings:

```text
FINDING id=R016-F## severity=<critical|high|medium|low|info> path="<path:line>" class=<security|wiring|availability|privacy|llm_nav|cost|positive> evidence="<repo evidence>" impact="<impact>" recommendation="<fix or next verification>"
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
BATCH_CLOSE lane=opus batch=R016 files_covered=<n> findings=<n> suppressions=<n> deferred=<n> invalidated=0
```

## Audit Questions

Answer from repo evidence only:

- Does `shared-plane.js` bound pagination, result count, retries, request time, or memory use for issue/project/member queries?
- Does `shared-plane.js` expose write helpers, and if so do callers control arbitrary Plane fields or IDs?
- Does `shared-plane-client.js` duplicate config/request behavior from `shared-plane.js`, and can the two drift in auth, pagination, or base URL behavior?
- Does `shared-telegram.js` HTML-escape outbound messages, restrict recipients, and handle Telegram errors safely?
- Does `shared-facts.js` use anon or service-role credentials, and where are predicate/value/schema controls enforced?
- Does `shared-idempotency.js` actually prevent repeat side effects under concurrent calls, or is it only a local/non-atomic helper?
- Does `production-hub.js` use `checkAuth`, legacy cookies/keys, or no auth, especially for the Telegram paths identified in Run 015?
- Does `production-hub.js` allow writes to Plane/Supabase/storage or trigger LLM/Telegram side effects?
- Do `token-usage.js`, `health.js`, and `metrics-snapshot.js` expose sensitive data or false health/usage confidence without auth?
- Does `deep-learning.js` have hard bounds for loops, model/API calls, writes, and failure modes, or can it plausibly contribute to runaway CPU/RAM/cost?

## False-Positive Guards

- Do not report provider env var names as secrets.
- Do not report server-side Plane/Supabase/Telegram helpers as vulnerable solely because they use privileged credentials; report when entrypoints/callers can reach over-broad reads/writes or when helper boundaries lack allowlists.
- Do not report `health.js` as exposed only because it returns status; report specific sensitive fields, misleading green checks, or missing auth where that matters.
- Do not assume a function is publicly reachable until deployment wiring supports it. If the body is dangerous but reachability depends on the already-known broken wrapper, mark it as a deployment-dependent candidate.
- Preserve positives such as bounded pagination, idempotency keys, checkAuth, HMAC, output escaping, recipient allowlists, explicit timeouts, and fail-closed missing configuration.

## C-137 Current Coverage State

Before Run 016:

- accepted assigned target coverage: `248 / 1505`
- strict semantic coverage: `246 covered + 2 partial`
- partial files: `Scripts/telegram-mcp/package-lock.json`, `Scripts/team-bots/package-lock.json`
