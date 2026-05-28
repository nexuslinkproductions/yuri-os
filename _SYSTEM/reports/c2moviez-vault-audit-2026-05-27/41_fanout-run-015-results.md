# Fanout Run 015 Results

Date: 2026-05-27
Target clone: `/tmp/yuri-c2moviez-vault-full.b1RopZ/repo`
Target commit: `8103286e1abc63fa9490cb1375ecde4f340aa2bb`
Mode: read-only, no mutation, no target execution, no live service calls, no credential use
Worker mode: single persistent Claude/tmux lane, active cap `1`

## Acceptance Summary

Run 015 is accepted with C-137 corrections.

- `R015_WRAPPER_TELEGRAM_EVENT_SHARED_OPUS / WRAPPER-TELEGRAM-EVENT-SHARED-015`: worker closed with `files_covered=10 findings=14 suppressions=5 deferred=3 invalidated=0`.
- C-137 accepted the 10 assigned files as covered and narrowed the Telegram auth findings into a configuration-fork issue.

Accepted assigned target surfaces added by Run 015: `10`.

Accepted assigned target coverage total after Run 015: `248 / 1505` tracked files.

Strict semantic caveat carried forward: two lockfiles are currently `partial`: `Scripts/telegram-mcp/package-lock.json` from Run 008 and `Scripts/team-bots/package-lock.json` from Run 010. Full semantic coverage is `246 covered + 2 partial`.

Contamination check: passed. C-137 checked the Run 015 pipe log for protected Claude runtime reads, `Searched memories`, and invalidation markers. No protected-runtime read was accepted.

Clone proof: C-137 verified the target clone at commit `8103286e1abc63fa9490cb1375ecde4f340aa2bb`, clean status count `0`, and `1505` tracked files.

Source pipe log:

- `/tmp/yuri-c2v-fanout-run-015/pipe/r015-single.pipe.log`

## C-137 Corrections

Lane output remains advisory until verified. C-137 corrected these points before acceptance:

- Telegram `notify` and `meetingProposal` branches are not always "zero auth" because `TELEGRAM_WEBHOOK_SECRET_TOKEN`, if configured, is checked before those branches. The accepted finding is a fail-open/fail-broken fork: unset secret makes the branches spoofable; set secret likely breaks current internal callers that do not send the secret/HMAC.
- `production-server.js` is an alternate wrapper in tracked evidence; `server/ecosystem.config.js` starts `server/index.js` for the current documented PM2 API process. The production-server missing-directory issue is accepted as wrapper/deploy inconsistency, while the active PM2 wrapper defect remains `R014-F17`.
- `auth-check.js` was already covered in Run 014, so the worker's auth-check deferred row is not accepted as an open coverage gap.
- `shared-data.js` issue pagination bounds depend on `shared-plane.js`, so memory-pressure claims remain deferred until that helper is covered.

## Executive Findings

Run 015 confirms that Claudio's function layer is split between at least three incompatible truths: `Dashboard-v2/functions/*` exists in Git, `production-server.js` and `deploy.sh` expect `netlify/functions`, and `server/index.js` expects both a missing `netlify-adapter.js` and missing `../netlify/functions/*`. This is now a central architecture/navigation finding, not a side note.

Telegram is not simply "open" or "closed." The main webhook has a good security intention: it can check Telegram's official secret token and it allowlists Telegram users for real message/callback flows. But it also multiplexes internal push payloads (`notify`, `meetingProposal`) through the same endpoint. Those internal callers do not use `checkAuth`/HMAC and, from Run 014, at least `chat.js` calls `/telegram` without auth headers. If the Telegram secret env var is unset, those branches are externally spoofable. If the secret is set, internal notification paths likely fail unless they send the header. This pattern can explain broken Telegram behavior after "doing something weird" with env/webhook configuration.

`event-dispatch.js` is better gated: it uses `checkAuth`. Its main remaining issue is Telegram HTML interpolation without escaping, especially ticket names, client names, reasoning, and link fields.

## Wrapper, Telegram, Event, Shared Lane

Lane: `R015_WRAPPER_TELEGRAM_EVENT_SHARED_OPUS`
Batch: `WRAPPER-TELEGRAM-EVENT-SHARED-015`

Files covered:

- `Dashboard-v2/production-server.js`
- `Dashboard-v2/server/express-adapter.js`
- `Dashboard-v2/server/deploy.sh`
- `Dashboard-v2/server/Caddyfile.template`
- `Dashboard-v2/functions/telegram.js`
- `Dashboard-v2/functions/event-dispatch.js`
- `Dashboard-v2/functions/shared-data.js`
- `Dashboard-v2/functions/shared-storage.js`
- `Dashboard-v2/functions/shared.js`
- `Dashboard-v2/functions/shared-config.js`

Missing/dependency proofs:

- `Dashboard-v2/functions/membership.js`: missing from tracked tree.
- `Dashboard-v2/server/netlify-adapter.js`: missing from tracked tree.
- `Dashboard-v2/netlify/functions`: missing from tracked tree.

Accepted findings:

| ID | Severity | Path | Class | Finding |
| --- | --- | --- | --- | --- |
| `R015-F01` | high | `Dashboard-v2/production-server.js:35-41`, `Dashboard-v2/server/deploy.sh:16-18` | architecture/availability | `production-server.js` and `deploy.sh` expect `Dashboard-v2/netlify/functions`, but the tracked repo has `Dashboard-v2/functions` and no `netlify/functions` directory. This alternate wrapper fails on a fresh GitHub checkout unless an untracked deploy step creates the directory. |
| `R015-F02` | high | `Dashboard-v2/functions/telegram.js:2498-2527`, `Dashboard-v2/functions/chat.js:270-291` | security/wiring | Telegram `notify` payloads are behind only the optional global Telegram secret check. If `TELEGRAM_WEBHOOK_SECRET_TOKEN` is unset, any POST can send text/buttons to all allowed users; if set, internal callers like `chat.js` that omit the secret likely break. |
| `R015-F03` | high | `Dashboard-v2/functions/telegram.js:2498-2558`, `Dashboard-v2/functions/telegram.js:2605-2620` | security/wiring | `meetingProposal` payloads share the same fork: unset secret allows spoofed proposal injection, while callback handlers can later create real Plane tickets after an allowed user clicks. If the secret is set, unauthenticated internal meeting proposal calls likely fail. |
| `R015-F04` | high | `Dashboard-v2/functions/telegram.js:2504-2511` | security/config | `TELEGRAM_WEBHOOK_SECRET_TOKEN` is optional. When absent, the official Telegram webhook origin proof is disabled and forged Telegram-shaped POSTs can reach subsequent handler logic. |
| `R015-F05` | medium | `Dashboard-v2/functions/telegram.js:35-41`, `Dashboard-v2/functions/telegram.js:489-495`, `Dashboard-v2/functions/telegram.js:552-553`, `Dashboard-v2/functions/telegram.js:2533-2555` | security | Telegram messages use `parse_mode: 'HTML'` and interpolate ticket names, notes, client/proposal text, and AI-derived text without a visible HTML escaping layer. |
| `R015-F06` | medium | `Dashboard-v2/functions/event-dispatch.js:107-125`, `Dashboard-v2/functions/event-dispatch.js:127-169` | security | `event-dispatch.js` is auth-gated, but its Telegram notification templates interpolate event fields into HTML without escaping, including names and link URLs. |
| `R015-F07` | medium | `Dashboard-v2/functions/shared-storage.js:14-15`, `Dashboard-v2/functions/shared-storage.js:72-98`, `Dashboard-v2/functions/shared-storage.js:100-126` | privileged helper | `shared-storage.js` prefers service-role credentials and exposes caller-controlled bucket/key reads, writes, and deletes. This is powerful and should be constrained by an allowlist at the helper boundary. |
| `R015-F08` | medium | `Dashboard-v2/server/Caddyfile.template:7-23`, `Dashboard-v2/production-server.js:171-178`, `Dashboard-v2/server/deploy.sh:31-33` | architecture/wiring | Caddy/deploy documentation describes a two-process architecture on ports 3001 and 3002, while `production-server.js` bundles functions and SvelteKit on one port. The actual deployment model is ambiguous in tracked evidence. |
| `R015-F09` | medium | `Dashboard-v2/server/deploy.sh:16-18` | deployment | Fresh deploy can fail at `cd $REMOTE/netlify/functions && npm install` unless a missing/untracked `netlify/functions` artifact exists on the server. |
| `R015-F10` | low | `Dashboard-v2/functions/telegram.js:367-377` | wiring/security | One Telegram lead-wizard path calls `production-hub` using a cookie named `auth_token` carrying `INTERNAL_SERVICE_KEY`, which is a legacy/nonstandard auth shape relative to `auth-check.js`. |
| `R015-F11` | low | `Dashboard-v2/functions/telegram.js:2180-2188` | wiring | Another Telegram AI tool calls `production-hub` without any auth headers, so it either fails silently if protected or indicates another unprotected internal route. |
| `R015-F12` | info | `Dashboard-v2/functions/shared-config.js:27-41`, `Dashboard-v2/functions/shared-config.js:60-90` | wiring | Shared config hardcodes Plane project/team fallback UUIDs but provides env overrides and runtime team sync. Preserve the override pattern; document the UUID source. |
| `R015-F13` | info | `Dashboard-v2/functions/event-dispatch.js:23-24`, `Dashboard-v2/functions/event-dispatch.js:38-90` | wiring | `event-dispatch.js` uses anon Supabase for audit/entity writes, so it is RLS-dependent rather than service-role-bypassing. |
| `R015-F14` | info | `Dashboard-v2/functions/telegram.js:2561-2567` | positive | Incoming Telegram message handling is disabled in this webhook and delegated to long-polling/MCP, reducing the webhook's direct command-execution surface. |

Suppressions:

- Telegram webhook is not completely unauthenticated: secret-token verification exists when `TELEGRAM_WEBHOOK_SECRET_TOKEN` is set, and allowed-user checks protect message/callback flows.
- Public Caddy exposure of `/.netlify/functions/*` is not itself a vulnerability; function-level auth decides safety.
- Service-role use in `shared-storage.js` is not inherently wrong for server code; the reportable issue is unconstrained caller-controlled bucket/key operations.
- Empty `ALLOWED_USERS` behavior is not promoted as a finding from GitHub alone; production env state is unknown.
- `shared-data.js` broad issue fetch memory pressure remains deferred pending `shared-plane.js` pagination verification.

Deferred:

- `Dashboard-v2/server/ecosystem.config.cjs`: generated in deploy and not tracked. Needed to confirm live PM2 process layout.
- `Dashboard-v2/functions/shared-plane.js`: needed to close exact pagination bounds and Plane API error/backoff behavior.
- Live Telegram env/webhook state: needed to determine which side of the `TELEGRAM_WEBHOOK_SECRET_TOKEN` fork is currently active.

## C-137 Spot Checks

C-137 directly checked these anchors in the canonical clone before accepting:

- `production-server.js:35-41`, `118-164`, `171-178`: function directory, public function route, startup order.
- `deploy.sh:16-18`, `27-33`: missing `netlify/functions` install and PM2 health checks.
- `Caddyfile.template:12-23`: public function proxy and loopback-restricted internal routes.
- `telegram.js:35-41`, `367-377`, `489-495`, `552-553`, `2178-2188`, `2493-2558`, `2561-2620`: Telegram send/HTML behavior, internal calls, webhook secret, notify/proposal branches, and allowlist branches.
- `event-dispatch.js:38-90`, `107-125`, `127-179`, `232-248`: anon-key writes, Telegram HTML send, templates, auth gate, and notification execution.
- `shared-storage.js:14-15`, `18-45`, `72-98`, `100-126`: service-role preference and bucket/key operations.
- `shared-data.js:8-10`, `22-39`: shared Plane/storage data assembly.
- `shared-config.js:27-41`, `60-90`: hardcoded fallback IDs and team sync.

## Immediate Implications

1. Fix the deployment model first. The repo must have exactly one documented function path and wrapper: either `Dashboard-v2/functions` or `Dashboard-v2/netlify/functions`, not both by implication.
2. Split Telegram webhook traffic from internal app notifications, or require HMAC/secret headers for internal `notify` and `meetingProposal` calls.
3. Make `TELEGRAM_WEBHOOK_SECRET_TOKEN` mandatory in production and fail closed if unset.
4. Add a shared `escapeHtml()` helper and use it before every Telegram `parse_mode: 'HTML'` interpolation.
5. Add bucket/key allowlists to `shared-storage.js`.

## Next Queue

Run 016 should stay single-lane and close shared helper plus production side-effect dependencies:

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
