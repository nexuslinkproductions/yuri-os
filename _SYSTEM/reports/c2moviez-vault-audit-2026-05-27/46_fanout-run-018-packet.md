# Fanout Run 018 Packet

Date: 2026-05-27
Target clone: `/tmp/yuri-c2moviez-vault-full.b1RopZ/repo`
Target commit: `8103286e1abc63fa9490cb1375ecde4f340aa2bb`
Worker mode: single persistent Claude/tmux lane, active cap `1`
Required model lane: Opus worker in the existing persistent session

## Mission

Execute one bounded read-only target-repo shard:

`R018_WEBHOOK_OUTLOOK_SCHEDULING_OPUS / WEBHOOK-OUTLOOK-SCHEDULING-018`

This shard inspects live-service perimeter and scheduling mutation surfaces: Plane webhooks, Outlook/Microsoft webhooks and subscriptions, Outlook sync, calendar event queueing, schedule listing/mutation, M365 mirror writes, working-hours admin writes, and Plane worklog pull/reconcile behavior.

## Non-Negotiable Rules

- Read-only only.
- No writes to Claudio's target repository.
- No writes to YURI report files from the worker lane.
- No target execution, no dependency installs, no service starts.
- No live service calls to Plane, Microsoft, Outlook, Supabase, Telegram, or any provider.
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

1. `Dashboard-v2/functions/plane-webhook.js`
2. `Dashboard-v2/functions/outlook-webhook.js`
3. `Dashboard-v2/functions/outlook-subscribe.js`
4. `Dashboard-v2/functions/outlook-sync.js`
5. `Dashboard-v2/functions/calendar-schedule-event.js`
6. `Dashboard-v2/functions/schedule-list.js`
7. `Dashboard-v2/functions/schedule-plan-ticket.js`
8. `Dashboard-v2/functions/tracker-m365-mirror.js`
9. `Dashboard-v2/functions/tracker-admin-set-working-hours.js`
10. `Dashboard-v2/functions/tracker-pull-plane.js`

Read every line of every assigned file. Do not mark a file covered from search hits, summaries, or partial reads.

## Required Output Rows

For every assigned existing file:

```text
PATH_PROOF path="<path>" command="git ls-files" status=exists
READ_PROOF path="<path>" command="git show HEAD:<path>" first_line="<bounded>" last_line="<bounded>"
FILE_COVERAGE path="<path>" method=full_read status=covered lines=<n> words=<n> notes="<short>"
```

For webhook and HTTP entrypoints:

```text
WEBHOOK_MAP path="<path>" entrypoint="<handler/action>" method_control="<GET|POST|OPTIONS|any>" origin_validation="<signature|validationToken|secret|checkAuth|none|unknown>" replay_control="<idempotency|dedup|none|unknown>" source="<plane|microsoft|browser|cron|internal|unknown>" sink="<event-dispatch|supabase|plane|m365|telegram|none|mixed>" status="<covered|reportable|suppressed|deferred>"
```

For calendar/schedule mutations:

```text
SCHEDULE_MUTATION_MAP path="<path>" action="<create|delete|resolve|list|mirror|pull|admin|unknown>" auth_control="<checkAuth|hmac|legacy_key|secret|none|unknown>" read_scope="<short>" write_scope="<short>" field_controls="<short>" status="<covered|reportable|suppressed|deferred>"
```

For provider helper calls:

```text
PROVIDER_CALL_MAP path="<path>" provider="<plane|m365|supabase|telegram|mixed>" operation="<GET|POST|PATCH|DELETE|subscribe|sync|mirror|unknown>" credential_source="<env category, not value>" bounds="<pagination/rate/time/size controls>" error_behavior="<throw|silent|retry|partial|unknown>" status="<covered|reportable|suppressed|deferred>"
```

For findings:

```text
FINDING id=R018-F## severity=<critical|high|medium|low|info> path="<path:line>" class=<security|privacy|data-integrity|availability|wiring|positive> evidence="<repo evidence>" impact="<impact>" recommendation="<fix or next verification>"
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
BATCH_CLOSE lane=opus batch=R018 files_covered=<n> findings=<n> suppressions=<n> deferred=<n> invalidated=0
```

## Audit Questions

Answer from repo evidence only:

- Does `plane-webhook.js` verify a Plane webhook signature or shared secret before side effects?
- Does `outlook-webhook.js` verify Microsoft `validationToken` correctly without causing state changes, and does it authenticate real notifications after validation?
- Do webhook handlers dedupe/replay-protect events before writing or dispatching?
- Do webhook handlers call `event-dispatch` with HMAC/checkAuth-compatible headers, legacy keys, or no auth?
- Do Outlook subscription and sync functions have auth gates, route controls, and method restrictions?
- Do scheduling functions allow unauthenticated browser mutations to `scheduled_blocks` or M365 calendar data?
- Do schedule mutation functions use service-role, anon, or mixed credentials, and do they validate user-supplied fields?
- Do tracker M365/Plane mirror/pull functions have loop bounds, idempotency, and rate limits?
- Do any files rely on missing or untracked DB tables/policies discovered in Run 017?
- Which controls are good and should be preserved?

## False-Positive Guards

- Do not report webhook validation-token handling as a vulnerability if it correctly returns the token without side effects.
- Do not report public webhooks as vulnerable solely because they are public; report missing origin validation, missing idempotency, or over-broad side effects.
- Do not report schedule listing as sensitive without identifying the fields exposed and expected auth/anon posture.
- Do not treat service-role server use as bad by itself; report over-broad caller reachability or missing field allowlists.
- Preserve positives such as signature checks, checkAuth, HMAC, idempotency keys, method gates, allowlists, field validation, cursor pagination, and explicit timeouts.

## C-137 Current Coverage State

Before Run 018:

- accepted assigned target coverage: `268 / 1505`
- strict semantic coverage: `266 covered + 2 partial`
- partial files: `Scripts/telegram-mcp/package-lock.json`, `Scripts/team-bots/package-lock.json`
