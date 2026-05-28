# Fanout Run 006 Results

Date: 2026-05-27
Target clone: `/tmp/yuri-c2moviez-vault-full.b1RopZ/repo`
Target commit: `8103286e1abc63fa9490cb1375ecde4f340aa2bb`
Mode: read-only, no mutation, no target execution, no live service calls, no credential use
Parallel lane cap: `3`

## Acceptance Summary

Run 006 is accepted.

- `R006_QUANTUM_ARCH_OPUS / RUNTIME-ARCH-006`: accepted, `files_covered=10 findings=10 suppressions=2 deferred=3 invalidated=0`.
- `R006_PRIME_SECURITY_OPUS / TRACKER-WIRING-006`: accepted, `files_covered=11 findings=12 suppressions=3 deferred=2 invalidated=0`.
- `R006_ZETA_LLMNAV_OPUS / LLMNAV-AGENTS-006`: accepted, `files_covered=11 findings=13 suppressions=2 deferred=2 invalidated=0`.

Accepted target-file coverage added by Run 006: `32` assigned files.

Accepted target-file coverage total after Run 006: `82 / 1505` tracked files.

Contamination check: passed. The pipe-log scan found the expected `BATCH_CLOSE` markers and no actual protected Claude runtime reads, no `Searched memories` event, and no invalidated lane output. Target tracked `.claude/agents/*` files were in scope because they were read through `git -C /tmp/yuri-c2moviez-vault-full.b1RopZ/repo`.

Source pipe logs:

- `/tmp/yuri-c2v-fanout-run-006/pipe/r006-arch.pipe.log`
- `/tmp/yuri-c2v-fanout-run-006/pipe/r006-tracker.pipe.log`
- `/tmp/yuri-c2v-fanout-run-006/pipe/r006-nav.pipe.log`

## Executive Findings

Run 006 materially changes the audit picture. This was not only a security sweep; it exposed clean-checkout wiring failures and LLM navigation defects.

Critical runtime conclusion: the tracked Git tree does not appear sufficient to produce the deployed dashboard API cleanly. `Dashboard-v2/server/index.js` imports a missing adapter and points 45 function routes at an untracked `Dashboard-v2/netlify/functions/` tree while the tracked functions live under `Dashboard-v2/functions/`. Production may only survive because deploys use `rsync` without `--delete`, preserving stale remote files.

Security/control conclusion: tracker endpoints consistently verify Supabase bearer identity before human-facing actions, but the functions then execute database RPCs using service-role credentials. That makes Postgres RPC permission checks the true authorization boundary. The code is not necessarily vulnerable by itself, but the blast radius of any missing SQL-side guard is high.

LLM navigation conclusion: `CLAUDE.md` is strong in structure but contains phantom paths and contradictory deployment instructions. `Home.md` points LLMs into dead or archived graph branches. Agent prompts and the Claudian plugin encode unsafe default autonomy patterns: autonomous write/commit behavior, production deploy ability, and default `permissionMode = "yolo"`.

## Runtime Architecture Lane

Lane: `R006_QUANTUM_ARCH_OPUS`
Batch: `RUNTIME-ARCH-006`

Files covered:

- `Dashboard-v2/package.json`
- `Dashboard-v2/svelte.config.js`
- `Dashboard-v2/vite.config.ts`
- `Dashboard-v2/production-server.js`
- `Dashboard-v2/server/index.js`
- `Dashboard-v2/server/express-adapter.js`
- `Dashboard-v2/server/cron-runner.js`
- `Dashboard-v2/server/ecosystem.config.js`
- `Dashboard-v2/src/hooks.client.ts`
- `Dashboard-v2/src/lib/db.ts`

Accepted findings:

| ID | Severity | Path | Class | Finding |
| --- | --- | --- | --- | --- |
| `R006-F01` | critical | `Dashboard-v2/server/index.js:8` | wiring | `server/index.js` requires `./netlify-adapter`, but no tracked `Dashboard-v2/server/netlify-adapter.js` exists. The tracked file is `server/express-adapter.js`, exporting the same adapter symbol. A clean checkout can crash on API startup. |
| `R006-F02` | critical | `Dashboard-v2/server/index.js:45-97` | wiring | `server/index.js` references 45 routes under `../netlify/functions/*`; Git has `0` tracked files under `Dashboard-v2/netlify/` and `87` under `Dashboard-v2/functions/`. Clean deploy or `rsync --delete` can break all function routes. |
| `R006-F03` | high | `Dashboard-v2/production-server.js` | architecture | `production-server.js` describes itself as a production entrypoint and binds `0.0.0.0:3000`, but `ecosystem.config.js` uses `server/index.js:3001` and `build/index.js:3002`. This stale entrypoint can mislead LLMs/operators and create duplicate public runtime paths. |
| `R006-F04` | high | `Dashboard-v2/server/index.js:1-8` | stability | `server/index.js` and `express-adapter.js` are CommonJS, while parent `Dashboard-v2/package.json` declares `"type": "module"`. No tracked `Dashboard-v2/server/package.json` overrides this. A clean Node 20 runtime can throw `require is not defined`. |
| `R006-F05` | medium | `Dashboard-v2/package.json:18` | architecture | `@sveltejs/adapter-netlify` remains in dependencies while `svelte.config.js` imports adapter-node. This is stale Netlify surface and misleads deployment reasoning. |
| `R006-F06` | medium | `Dashboard-v2/src/hooks.client.ts:13-16,24-32` | stability | Chunk import failure handlers hard-reload without retry caps or circuit breaker. A permanently missing chunk can create an infinite reload loop. |
| `R006-F07` | medium | `Dashboard-v2/server/deploy.sh:14` | stability | Deploy uses `rsync -avz` without `--delete` from a local Mac path. This accumulates stale remote files and masks the missing adapter/function-path bugs. |
| `R006-F08` | low | `Dashboard-v2/src/lib/db.ts:38-44` | stability | Missing Supabase env returns a stub client at `https://stub.invalid`; current callers guard with `hasClient()`, but future callers could silently network to the stub. |
| `R006-F09` | info | `Dashboard-v2/server/ecosystem.config.js` | positive | PM2 cron jobs are bounded: `autorestart:false`, dedicated `cron-runner.js`, memory caps, and scheduled HTTP triggers. This does not explain runaway CPU/RAM on its own. |
| `R006-F10` | info | `Dashboard-v2/src/lib/db.ts` | positive | Realtime subscriptions use refcounted singleton patterns and clean unsubscribe behavior. |

Architecture lane suppressions:

- `production-server.js` HMAC scheduled endpoint concern suppressed because that entrypoint is not active according to `ecosystem.config.js`.
- Client-side Supabase write concern suppressed because writes are designed to be gated by Supabase RLS and authed function calls.

Architecture lane deferrals:

- `Dashboard-v2/server/Caddyfile.template`: reverse-proxy config was out of lane scope.
- `Dashboard-v2/src/lib/pusher-realtime.ts`: imported by `db.ts`; needs dedicated realtime lane.
- `Dashboard-v2/server/deploy.sh`: partially read for context; needs full deploy pipeline lane.

## Tracker Wiring Lane

Lane: `R006_PRIME_SECURITY_OPUS`
Batch: `TRACKER-WIRING-006`

Files covered:

- `Dashboard-v2/functions/tracker-start.js`
- `Dashboard-v2/functions/tracker-stop.js`
- `Dashboard-v2/functions/tracker-tick.js`
- `Dashboard-v2/functions/tracker-log.js`
- `Dashboard-v2/functions/tracker-block.js`
- `Dashboard-v2/functions/tracker-plan-submit.js`
- `Dashboard-v2/functions/tracker-plan-decide.js`
- `Dashboard-v2/functions/tracker-pull-plane.js`
- `Dashboard-v2/functions/tracker-push-plane.js`
- `Dashboard-v2/functions/shared-idempotency.js`
- `Dashboard-v2/functions/shared-storage.js`

Accepted findings:

| ID | Severity | Path | Class | Finding |
| --- | --- | --- | --- | --- |
| `TW006-01` | high | `Dashboard-v2/functions/tracker-plan-submit.js:108-109` | wiring | `tracker-plan-submit.js` emits Telegram callback data `tplan_approve:*` and `tplan_reject:*`, but `telegram.js` has zero `tplan_` matches. Telegram approve/reject buttons are dead. |
| `TW006-02` | high | tracker human endpoints | security | Seven human-facing tracker endpoints verify the user's bearer token, then execute RPCs with `Authorization: Bearer ${SUPA_KEY}` service-role credentials. Authorization depends entirely on Postgres RPC guards. |
| `TW006-03` | medium | `Dashboard-v2/functions/tracker-plan-decide.js:91` | security | `target_user` is passed from request body into RPC and PostgREST profile lookup without UUID validation. Function-layer role checks are absent. |
| `TW006-04` | medium | `tracker-stop.js:93`, `tracker-log.js:96` | security | Caller email from auth metadata is written into `m365_event_owner_email` without email-format validation. |
| `TW006-05` | medium | `Dashboard-v2/functions/tracker-pull-plane.js:126-180` | stability | Pull cron serially calls Plane worklogs for up to 40 tickets without rate limiting, delay, or backoff despite a `30 rpm` comment. |
| `TW006-06` | medium | `Dashboard-v2/functions/tracker-push-plane.js:108-140` | stability | Push cron retries pending Plane entries every 2 minutes indefinitely on transient failures; no retry counter, backoff, cooldown, or dead-letter state. |
| `TW006-07` | medium | `Dashboard-v2/functions/shared-storage.js:15` | security | Storage helper silently falls back to `SUPABASE_KEY`, which may be an anon key, if service-role vars are missing. |
| `TW006-08` | low | `Dashboard-v2/functions/tracker-pull-plane.js:160-162` | security | Unknown Plane worklog users are inserted under the CEO fallback user, which can pollute CEO timesheet/billable data. |
| `TW006-09` | low | tracker auth/helper blocks | architecture | `http()`, `verifyBearer()`, and RPC wrappers are duplicated across seven files, increasing drift risk for security fixes. |
| `TW006-10` | info | `Dashboard-v2/functions/shared-idempotency.js` | wiring | Shared daily idempotency helper exists but is unused by tracker crons; tracker uses database-level dedupe instead. |
| `TW006-11` | info | tracker human endpoints | positive | All seven human-facing endpoints enforce bearer verification, POST-only handling, CORS to `ops.c2moviez.com`, and pass `caller.id` as `p_actor`. |
| `TW006-12` | info | tracker cron endpoints | positive | Plane pull/push cron handlers are scheduler-only and guard required env vars before execution. |

Tracker lane suppressions:

- `entry_id` SQL injection hypothesis suppressed because `entry_id` is passed as an RPC JSON parameter, not string-concatenated into SQL.
- `block_id` PostgREST injection hypothesis suppressed because `block_id` is passed as RPC parameter only.
- Heartbeat runaway CPU/RAM hypothesis suppressed because the heartbeat is client-initiated and each server call is a single RPC, not a server-side loop.

Tracker lane deferrals:

- `Dashboard-v2/functions/shared-telegram.js`: verify Telegram token handling and error logs.
- `Dashboard-v2/functions/shared-plane-client.js`: verify Plane rate limiting, API key handling, and error propagation.

## LLM Navigation And Agent Lane

Lane: `R006_ZETA_LLMNAV_OPUS`
Batch: `LLMNAV-AGENTS-006`

Files covered:

- `CLAUDE.md`
- `Home.md`
- `11 - NEX Brain/Operating Contract.md`
- `11 - NEX Brain/Overnight Intelligence.md`
- `11 - NEX Brain/_legacy-prototypes/System-Map.md`
- `.claude/agents/cto.md`
- `.claude/agents/ops-guardian.md`
- `.claude/agents/nexapp-dev.md`
- `.claude/agents/knowledge-curator.md`
- `.obsidian/plugins/claudian/manifest.json`
- `.obsidian/plugins/claudian/main.js`

Accepted findings:

| ID | Severity | Path | Class | Finding |
| --- | --- | --- | --- | --- |
| `LLMNAV-001` | high | `CLAUDE.md` | llm_nav | `CLAUDE.md` references tracked files that do not exist, including `ROADMAP.md`, `.mcp.json`, `11 - NEX Brain/00 - Master Plan.md`, `00 - Roadmap.md`, `00 - Health Dashboard.md`, `_index.json`, and `NEX Brain.md`. |
| `LLMNAV-002` | high | `Home.md` | llm_nav | `Home.md` links to at least seven targets with no tracked file match, including active project and resource links. It also still promotes archived ExeoFlow material. |
| `LLMNAV-003` | medium | `CLAUDE.md:412` | wiring | `CLAUDE.md` says production env vars are set in Netlify, while earlier lines say Netlify was decommissioned and deployment moved to Infomaniak VPS. |
| `LLMNAV-004` | high | `.claude/agents/nexapp-dev.md:25` | wiring | `nexapp-dev.md` uses VPS IP `83.228.224.13`, while `CLAUDE.md` uses `84.234.31.186` for the same VPS. An agent could deploy to the wrong host. |
| `LLMNAV-005` | medium | `11 - NEX Brain/_legacy-prototypes/System-Map.md` | llm_nav | Legacy system map lists stale agents, including `self-healer` and `system-engineer`, while `self-healer` is archived/merged and `system-engineer` has no tracked agent file. |
| `LLMNAV-006` | medium | `11 - NEX Brain/Overnight Intelligence.md` | llm_nav | File still uses `EXEO`/`exeo-brain` while the brand hierarchy says NEX is canonical. |
| `LLMNAV-007` | medium | `.claude/agents/cto.md` | llm_nav | Agent file uses absolute `/Users/ic2m/...` paths, making the instructions non-portable and brittle outside Claudio's machine layout. |
| `LLMNAV-008` | high | `.claude/agents/cto.md` | security | CTO nightly mode allows unattended edit/commit behavior and factual fixes to memory files without CEO approval. |
| `LLMNAV-009` | medium | `.claude/agents/nexapp-dev.md` | security | `nexapp-dev` has direct production deploy authority via rsync and PM2 restart, with no confirmation gate or staging step. |
| `LLMNAV-010` | medium | `.obsidian/plugins/claudian/main.js` | security | Claudian default settings include `permissionMode = "yolo"` and vault-scoped external access defaults. The plugin bundles spawn support and Obsidian filesystem operations. |
| `LLMNAV-011` | low | `.obsidian/plugins/claudian/main.js` | architecture | 73,867-line bundled plugin is tracked as a large opaque blob, making version drift and diff review difficult. |
| `LLMNAV-012` | info | `CLAUDE.md` | positive | `CLAUDE.md` has strong authority framing, brand hierarchy, event bus diagram, and source-of-truth tables. |
| `LLMNAV-013` | info | `11 - NEX Brain/Operating Contract.md` | positive | Operating Contract has high-quality branching logic for MCP/RAG tool outputs and clear never-do lists. |

LLM navigation suppressions:

- Potential `mcp__nex-rag__*` signature drift was not reportable because live tool availability cannot be verified without live service calls.
- `ops-guardian` absolute path issue was suppressed as a duplicate of the broader portability concern already captured in `LLMNAV-007`.

LLM navigation deferrals:

- `.obsidian/plugins/claudian/main.js`: targeted grep was completed, but a true line-by-line audit of a 74k-line bundled JS file needs a dedicated bundle/source-diff lane.
- `Home.md`: dead-link check was limited to tracked Git files. Some links may exist as local-only vault notes outside this GitHub-obtainable audit scope.

## Immediate Implications

Run 006 indicates that Claudio's repo has a serious source-of-truth split:

1. Git-tracked deployment code appears inconsistent with the deployed server state.
2. Stale remote files may be masking clean-checkout failures.
3. Agent/navigation files contain contradictions and phantom paths that can make LLMs hallucinate or operate on the wrong target.
4. Autonomy defaults are too permissive for unattended production or vault-write behavior.

Before any hardening step that adds `rsync --delete` or rebuilds from a fresh checkout, the missing adapter, `netlify/functions` path mismatch, and CJS/ESM boundary must be fixed together. Otherwise the hardening step itself will likely break production.

## Next Queue

Run 007 should stay capped at three active lanes and target the next highest-risk surfaces:

1. `Dashboard-v2/functions/shared-plane-client.js`, `Dashboard-v2/functions/shared-telegram.js`, and Telegram callback routing around `telegram.js`.
2. `Dashboard-v2/functions/auth.js`, `auth-check.js`, and shared config/data helpers to validate auth boundary and service-role use.
3. `Scripts/nex-guardrails/*` and `Scripts/lib/*` imports used by `Scripts/exeo-daemon.js`, focused on control-chain safety and mutation authority.
