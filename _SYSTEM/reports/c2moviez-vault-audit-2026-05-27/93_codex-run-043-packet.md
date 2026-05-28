# Codex Run 043 Packet - Telegram Function Cluster

Target clone: `/tmp/yuri-c2moviez-vault-full.b1RopZ/repo`
Target commit: `8103286e1abc63fa9490cb1375ecde4f340aa2bb`
Repo URL: `https://github.com/c2moviezfpv/c2moviez-vault`
Mode: read-only, no mutation, no installs, no service starts, no live calls, no credential use.

You are a child Codex advisory lane. C-137 verifies all claims before acceptance.

## Sandbox Guard

C-137 already satisfied YURI context duties. Do not read `/Users/marcelspatz/YURI-OS-MUSUBI` or any path outside the target clone except your packet and `/tmp` output. Do not read `.env`, `backend/data`, `.claude/state`, `.claude/history`, `.claude/file-history`, `.claude/projects`, `node_modules`, or `.amp`.

Do not print raw secrets.

## Assigned Scope

Inspect the Telegram function cluster for webhook/callback truth, command routing, side effects, missing handlers, and scheduler pressure:

- `Dashboard-v2/functions/telegram.js`
- `Dashboard-v2/functions/shared-telegram.js`
- `Dashboard-v2/functions/telegram-digest.js`
- `Dashboard-v2/functions/telegram-prebrief.js`
- `Dashboard-v2/functions/telegram-proactive.js`
- `Dashboard-v2/functions/telegram-eod.js`
- `Dashboard-v2/functions/telegram-team-digest.js`
- `Dashboard-v2/functions/telegram-fk-digest.js`
- `Dashboard-v2/functions/telegram-fact-changes.js`
- `Dashboard-v2/functions/telegram-team.js`
- `Dashboard-v2/functions/telegram-weekly.js`
- `Dashboard-v2/functions/telegram-calendar-watch.js`

Supporting files for route/schedule truth:

- `Dashboard-v2/server/index.js`
- `Dashboard-v2/server/ecosystem.config.js`
- `Dashboard-v2/server/cron-runner.js`

## Questions To Close

1. Which Telegram handlers are publicly mapped, scheduled-only, missing, or deployment-dependent?
2. Which commands/callbacks are emitted but not handled?
3. Which functions can send Telegram messages, read/write Supabase, query providers, or trigger AI work?
4. Which auth controls exist: Telegram chat allowlist, secret token, internal HMAC, route secrecy, or none?
5. Which loops/schedulers could explain CPU/RAM/session usage or broken Telegram control?
6. Which findings duplicate earlier callback findings, and which are new root-cause evidence?

## Required Output

Emit:

```text
CLONE_PROOF ...
FILE_COVERAGE path="..." status=covered|partial lines=... notes="..."
TELEGRAM_ROUTE_MAP source="path:line" handler="..." exposure="public|scheduled|unmapped|deployment_dependent" auth="..." side_effects="..."
FINDING id=R043-F.. severity=... title="..." evidence="path:line, path:line" impact="..."
SUPPRESSION source="path:line" hypothesis="..." counterevidence="..."
DEFERRED source="..." reason="..."
BATCH_CLOSE lane=codex-gpt55-xhigh batch=R043 status="complete_read_only"
```
