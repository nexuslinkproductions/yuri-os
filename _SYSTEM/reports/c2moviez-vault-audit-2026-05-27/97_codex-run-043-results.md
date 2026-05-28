# Codex Run 043 Results - Telegram Function Cluster

Date: 2026-05-27
Lane: `R043_TELEGRAM_FUNCTION_CLUSTER_GPT55_XHIGH`
Worker: Codex CLI, `gpt-5.5`, `model_reasoning_effort=xhigh`, read-only sandbox
Target clone: `/tmp/yuri-c2moviez-vault-full.b1RopZ/repo`
Target commit: `8103286e1abc63fa9490cb1375ecde4f340aa2bb`
Status: accepted with C-137 validation

## Clone Proof

```text
CLONE_PROOF cwd="/private/tmp/yuri-c2moviez-vault-full.b1RopZ/repo" head="8103286e1abc63fa9490cb1375ecde4f340aa2bb"
BATCH_CLOSE lane=codex-gpt55-xhigh batch=R043 status="complete_read_only"
```

Contamination check: `last-message.md` contained no YURI-root reads. stderr hits were packet guard text or target-repo evidence.

## Accepted Findings

### R043-F01 - Telegram Scheduling Depends On The Same Broken PM2 Function Layout

Severity: critical
Class: deployment integrity / Telegram availability

Evidence:

- `Dashboard-v2/package.json:6` declares `"type": "module"`.
- `Dashboard-v2/server/index.js:4-9` uses CommonJS and imports missing `./netlify-adapter`.
- `Dashboard-v2/server/index.js:85-93` maps scheduled Telegram handlers from `../netlify/functions/*`, while tracked handlers live in `Dashboard-v2/functions/*`.

Impact:

Scheduled Telegram control can fail before handlers load, or return handler-unavailable, unless untracked remote files compensate.

### R043-F02 - Main Telegram Webhook Is Not Mapped By The Tracked PM2 Server

Severity: high
Class: routing / control-plane availability

Evidence:

- `Dashboard-v2/functions/telegram.js:2494-2511` defines a webhook handler.
- `Dashboard-v2/server/index.js:84-93` maps scheduled Telegram routes but no public `telegram` route.
- `server/index.js:95-96` falls through to 404.

Impact:

Telegram webhook control depends on another deployment layer. The tracked PM2 API server does not expose it.

### R043-F03 - Notify And Meeting-Proposal Side Effects Run Before Sender Allowlist

Severity: high
Class: webhook spoofing / side effects

Evidence:

- `Dashboard-v2/functions/telegram.js:2504-2511` only verifies Telegram secret token if `TELEGRAM_WEBHOOK_SECRET_TOKEN` is configured.
- `telegram.js:2519-2527` processes `update.notify` before callback/user allowlist.
- `telegram.js:2529-2558` processes `update.meetingProposal` before callback/user allowlist.
- `telegram.js:2608-2615` applies allowed-user checks only later for callback queries.

Impact:

If the Telegram secret token is unset and the function is routable, forged POSTs can broadcast notifications or seed meeting proposal buttons to allowed users.

### R043-F04 - Review Buttons Create In-Memory Sessions But Message Handling Is Disabled

Severity: high
Class: Telegram control-path breakage

Evidence:

- `Dashboard-v2/functions/telegram.js:392-397` stores review sessions in memory.
- `telegram.js:1965-1970` starts `/review`.
- `telegram.js:2561-2567` ignores incoming text/voice messages because long-polling MCP is supposed to handle them.

Impact:

Buttons can start state in the serverless webhook memory, but follow-up text is ignored by the same function and cannot see that memory from the long-polling MCP path. This directly explains broken Telegram review/control flows.

### R043-F05 - Calendar-Watch Emits Callback Families With No Specific Handler

Severity: high
Class: callback wiring

Evidence:

- `Dashboard-v2/functions/telegram-calendar-watch.js:112-116` emits `calwatch_notes` and `calwatch_ok`.
- `telegram-calendar-watch.js:150-157` emits `commitments_done` and `commitments_reschedule`.
- `Dashboard-v2/functions/telegram.js:2799-2803` falls unknown callback data through to `handleCommand`.
- `telegram.js:2340-2344` treats free text as AI conversation input.

Impact:

Calendar/commitment buttons can become no-ops or unintended AI/tool prompts instead of deterministic handlers.

### R043-F06 - Team Bot Webhook Accepts Low-Secrecy Member Keys

Severity: high
Class: webhook auth / command execution

Evidence:

- `Dashboard-v2/functions/telegram-team.js:193-205` accepts a query token equal to the member key, such as `fanny`, or the actual bot token.
- `telegram-team.js:472-536` handles commands without validating Telegram chat ID against the configured member chat.
- `Dashboard-v2/functions/shared-team-config.js:7-16` shows member keys and bot-token env names.

Impact:

If mapped, a caller with a simple member key can execute team bot commands such as task listing, notes, or done actions, subject to the command handlers.

### R043-F07 - Weekly And Calendar Watch Jobs Are Not In PM2 Schedule Truth

Severity: medium
Class: false assurance / scheduling drift

Evidence:

- `Dashboard-v2/functions/telegram-weekly.js` and `telegram-calendar-watch.js` describe scheduled behavior.
- `Dashboard-v2/server/ecosystem.config.js:53-124` schedules only digest/prebrief/proactive/eod/team-digest/fk-digest/fact-changes in the shown Telegram block.
- `Dashboard-v2/server/index.js:85-93` maps only those internal scheduled routes plus metrics/deep-learning.

Impact:

Operators may expect weekly/calendar-watch behavior that tracked PM2 config does not run.

### R043-F08 - Old Plane Page-Number Pagination Remains In Telegram Paths

Severity: medium
Class: availability / cost / data duplication

Evidence:

- `Dashboard-v2/functions/telegram.js:790-796` uses page-number pagination.
- `Dashboard-v2/functions/telegram-team.js:86-90` has the same pattern.
- `Dashboard-v2/functions/shared-plane.js:39-45` documents that Plane uses cursor pagination and page-number loops duplicate page 1 until safety caps.

Impact:

Telegram commands and scheduled jobs can inflate API calls, duplicate tickets, and increase memory/message size.

### R043-F09 - Digest Cron Still Fires A Disabled Handler

Severity: medium
Class: observability / false assurance

Evidence:

- `Dashboard-v2/server/ecosystem.config.js:55-58` schedules `telegram-digest`.
- `Dashboard-v2/server/index.js:85` maps it.
- `Dashboard-v2/functions/telegram-digest.js:159-163` immediately returns disabled.

Impact:

The cron appears configured but intentionally sends nothing, which can be mistaken for broken Telegram delivery.

## Suppressions

- Fact confirm/rollback callbacks are handled by `telegram.js`.
- Wizard priority callbacks are handled by the wizard step logic despite awkward callback names.
- Slash command handlers exist, but normal messages are intentionally bypassed in this webhook.

## Coverage Update

No unique coverage increment is claimed pending ledger reconciliation. Run 043 materially deepens Telegram control-path truth.
