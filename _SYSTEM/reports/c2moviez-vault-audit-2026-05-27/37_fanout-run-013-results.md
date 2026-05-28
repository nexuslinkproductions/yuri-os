# Fanout Run 013 Results

Date: 2026-05-27
Target clone: `/tmp/yuri-c2moviez-vault-full.b1RopZ/repo`
Target commit: `8103286e1abc63fa9490cb1375ecde4f340aa2bb`
Mode: read-only, no mutation, no target execution, no live service calls, no credential use
Worker mode: single persistent Claude/tmux lane, active cap `1`

## Acceptance Summary

Run 013 is accepted with C-137 corrections.

- `R013_DASHBOARD_DECISION_EXPOSURE_OPUS / DASHBOARD-DECISION-EXPOSURE-013`: worker closed with `files_covered=10 findings=11 suppressions=4 deferred=4 invalidated=0`.
- C-137 accepted the 10 assigned files as covered and added one verified wiring finding around the dead `cron-decision-outcome` route.

Accepted assigned target surfaces added by Run 013: `10`.

Accepted assigned target coverage total after Run 013: `228 / 1505` tracked files.

Strict semantic caveat carried forward: two lockfiles are currently `partial`: `Scripts/telegram-mcp/package-lock.json` from Run 008 and `Scripts/team-bots/package-lock.json` from Run 010. Full semantic coverage is `226 covered + 2 partial`.

Contamination check: passed. C-137 checked the Run 013 pipe log for protected Claude runtime reads, `Searched memories`, and invalidation markers. The log contains protected-path strings only from the packet/prompt boundary text; no protected-runtime read was accepted.

Clone proof: C-137 verified the target clone at commit `8103286e1abc63fa9490cb1375ecde4f340aa2bb`, clean status count `0`, and `1505` tracked files.

Source pipe log:

- `/tmp/yuri-c2v-fanout-run-013/pipe/r013-single.pipe.log`

## C-137 Corrections

Lane output remains advisory until verified. C-137 corrected these points before acceptance:

- `R013-F03` line anchor corrected from the worker's loose `80-86` reference to `Dashboard-v2/src/routes/ai-monitor/+page.svelte:169-184`.
- `R013-F04` narrowed: the local Express layer does expose several unauthenticated internal scheduled routes, but `decision-outcome` is **not** among them in `server/index.js`.
- `R013-F06` narrowed: `train-week.js` does have `MAX_PAIRS=1000`, `batch-size=1`, and a `90 * 60 * 1000` `spawnSync` timeout. The accepted risk is no LaunchAgent-level memory/PID guard around a local Qwen LoRA training job, not a totally unbounded script.
- `R013-F11` as written by the worker is suppressed for current evidence because the PM2 decision-outcome route is missing. The real finding is `R013-F12`: PM2 is configured to call a nonexistent internal route, so hourly decision-outcome reconciliation likely fails with 404 from this server.
- Worker-deferred scripts `reconcile-outcomes.js`, `decision-recorder.js`, and `train-week.js` were not assigned to Run 013, but were already covered in Run 012. Their Run 012 evidence is used only as supporting context here, not as new coverage.

## Executive Findings

Run 013 turns the Run 012 `public.decisions` problem into a concrete dashboard exposure and integrity chain.

The dashboard browser bundle uses the public Supabase anon client from `$env/dynamic/public` and reads `public.decisions` from multiple pages. The most severe path is `+page.svelte`: a browser-side `voteDecision()` function directly updates `decisions.outcome` and inserts a row into `nex_reply_outcome`. That means the learning signal can be modified from the browser if live RLS permits it. Because the tracked repo still lacks canonical `public.decisions` and `nex_reply_outcome` RLS truth, this is a high-severity, RLS-dependent integrity candidate.

The LLM navigation and false-assurance issue is also clearer now. `/learning` has no page-level auth guard and displays decision metrics from `recentDecisions(90, 1000)` with no freshness marker. `/ai-monitor` has a client-side email redirect, but the underlying data access still depends on RLS, not the Svelte variable `authorized`. In other words: the UI looks like an operator control plane, but the real authority boundary is hidden in live Supabase policies that are not represented in the repo.

The runtime wiring has one sharp bug: `ecosystem.config.js` schedules `cron-decision-outcome` hourly at `:15`, but `server/index.js` does not register `/_internal/scheduled/decision-outcome`. The local cron runner exits nonzero for HTTP status `>=400`, so the tracked server evidence says this cron likely 404s every hour unless an untracked deployment layer supplies the route.

## Dashboard Decision Exposure Lane

Lane: `R013_DASHBOARD_DECISION_EXPOSURE_OPUS`
Batch: `DASHBOARD-DECISION-EXPOSURE-013`

Files covered:

- `Dashboard-v2/src/lib/db.ts`
- `Dashboard-v2/src/lib/components/ClientDrawer.svelte`
- `Dashboard-v2/src/routes/+page.svelte`
- `Dashboard-v2/src/routes/ai-monitor/+page.svelte`
- `Dashboard-v2/src/routes/learning/+page.svelte`
- `Dashboard-v2/server/index.js`
- `Dashboard-v2/server/ecosystem.config.js`
- `Scripts/launchagents-staged/com.c2moviez.nex-outcome-reconcile.plist`
- `Scripts/launchagents-staged/com.c2moviez.nex-decision-recorder.plist`
- `Scripts/launchagents-staged/com.c2moviez.nex-lora-train-week.plist`

Accepted findings:

| ID | Severity | Path | Class | Finding |
| --- | --- | --- | --- | --- |
| `R013-F01` | high candidate | `Dashboard-v2/src/lib/db.ts:24-25`, `Dashboard-v2/src/lib/db.ts:186-220` | privacy/security | `recentDecisions()` uses the public browser Supabase anon client and performs `select("*")` from `public.decisions`, whose typed shape includes rationale, client code, recommendations, confidence, and target fields. Exploitability depends on live RLS. |
| `R013-F02` | high candidate | `Dashboard-v2/src/routes/+page.svelte:581-604` | security/data integrity | Browser-side `voteDecision()` directly updates `decisions.outcome`/`outcome_at` and inserts into `nex_reply_outcome`, with no server-side role gate in the code path. Exploitability depends on live RLS for both tables. |
| `R013-F03` | medium | `Dashboard-v2/src/routes/ai-monitor/+page.svelte:169-184`, `Dashboard-v2/src/routes/ai-monitor/+page.svelte:223-270` | security/false assurance | AI monitor access control is a client-side email redirect before browser-side Supabase reads. It is useful UX but not a durable authorization boundary; real protection depends on Supabase RLS. |
| `R013-F04` | medium | `Dashboard-v2/server/index.js:84-93`, `Dashboard-v2/server/index.js:98-100` | local trust boundary | Local Express server binds to `127.0.0.1`, but registered `/_internal/scheduled/*` routes have no Express-layer auth. Any local process or SSRF-capable co-hosted service could trigger the registered scheduled functions. |
| `R013-F05` | medium | `Scripts/launchagents-staged/com.c2moviez.nex-decision-recorder.plist:18-22`, `Scripts/lib/decision-recorder.js:46-53`, `Scripts/lib/decision-recorder.js:198-200` | availability/wiring | The staged decision-recorder LaunchAgent runs every 300 seconds with no plist-level PID/flock guard. The script has state dedupe, but overlapping runs under slow I/O or Supabase timeouts remain possible. |
| `R013-F06` | medium | `Scripts/launchagents-staged/com.c2moviez.nex-lora-train-week.plist:21-33`, `Scripts/nex-rvf/train-week.js:35-40`, `Scripts/nex-rvf/train-week.js:257-268` | availability | Weekly local Qwen LoRA training has script-level pair and timeout bounds, but no LaunchAgent-level PID guard, memory cap, or OS-level resource containment. A Qwen 7B LoRA process can still explain local CPU/RAM pressure if training starts during other automations. |
| `R013-F07` | medium | `Scripts/launchagents-staged/com.c2moviez.nex-outcome-reconcile.plist:23-45`, `Scripts/nex-rvf/reconcile-outcomes.js:31-33`, `Scripts/nex-rvf/reconcile-outcomes.js:195-218` | privileged job | Staged outcome reconciliation retrieves a Supabase service-role key from Keychain and runs a job that patches decision outcomes with RLS-bypassing authority. This should remain a tightly bounded local job with a restricted DB function if possible. |
| `R013-F08` | info | `Dashboard-v2/server/index.js:98-100` | positive | The local Express server binds to `127.0.0.1`, not `0.0.0.0`, reducing direct internet exposure for the local API surface. |
| `R013-F09` | medium candidate | `Dashboard-v2/src/routes/learning/+page.svelte:12-14`, `Dashboard-v2/src/routes/learning/+page.svelte:272-292` | llm_nav/privacy | `/learning` has no page-level auth guard and displays recent decision text, recommendations, client code, chosen action, outcome, and confidence via `recentDecisions(90, 1000)`. Access still depends on live Supabase RLS. |
| `R013-F10` | high candidate | `Dashboard-v2/src/routes/+page.svelte:581-604`, `Scripts/nex-rvf/train-week.js:138-164`, `Scripts/nex-rvf/train-week.js:232-268` | security/data poisoning | A browser upvote writes `nex_reply_outcome` with `corrected=false`; `train-week.js` later consumes `nex_reply_outcome` rows where `corrected=false` as supplementary LoRA pairs if they are not placeholder-prefixed. This forms an RLS-dependent browser-to-training-signal poisoning path. |
| `R013-F11` | low | `Scripts/launchagents-staged/com.c2moviez.nex-outcome-reconcile.plist:33-37`, `Dashboard-v2/server/ecosystem.config.js:152-157` | wiring | If the missing PM2 decision-outcome internal route is later added, the PM2 hourly schedule and LaunchAgent daily schedule both target minute `:15`, creating a potential double-reconciliation window. Current evidence instead shows the PM2 route is absent. |
| `R013-F12` | high | `Dashboard-v2/server/ecosystem.config.js:152-157`, `Dashboard-v2/server/index.js:84-93`, `Dashboard-v2/server/cron-runner.js:20-32` | wiring/availability | `cron-decision-outcome` calls `/_internal/scheduled/decision-outcome`, but `server/index.js` registers no such route. `cron-runner.js` exits failure for HTTP `>=400`. From tracked server evidence, hourly decision-outcome reconciliation likely 404s, causing stale outcomes and false dashboard confidence. |

Suppressions:

- `Dashboard-v2/server/index.js`: direct internet exposure of the Express server is suppressed for current evidence because it binds to `127.0.0.1`.
- `Dashboard-v2/src/lib/db.ts`: browser service-role exposure is suppressed. The dashboard uses `PUBLIC_SUPABASE_ANON`, not the service-role key.
- `Dashboard-v2/src/routes/ai-monitor/+page.svelte`: direct decision outcome writes are suppressed; this page reads but does not mutate `decisions`.
- `Dashboard-v2/src/lib/components/ClientDrawer.svelte`: direct decision writes are suppressed; it reads decision rows and sends client updates through `/api/functions/client-update`.
- Original worker `R013-F11` collision claim is suppressed as a current-state claim because the PM2 route is missing; it remains only a future collision risk if someone adds the missing route without changing schedules.

Deferred:

- Live `public.decisions` and `nex_reply_outcome` RLS/policies: required to decide whether the browser read/write candidates are exploitable or blocked.
- Live deployment posture for `Dashboard-v2/server/index.js`: tracked evidence shows localhost binding, but reverse-proxy and process-manager state are outside this GitHub-only trial.
- Installed LaunchAgent state on Claudio's machine: staged plists do not prove they are actually loaded.
- Provider/runtime logs: needed to confirm whether `cron-decision-outcome` is currently failing with 404 and whether LoRA/recorder jobs overlap in practice.

## C-137 Spot Checks

C-137 directly checked these anchors in the canonical clone before accepting:

- `db.ts:24-25`, `186-220`, `345-362`, `718-758`: public anon client, decision `select("*")`, browser writes to scheduled blocks, and cookie-primary helper semantics.
- `ClientDrawer.svelte:192-205`, `226-245`: client-scoped decision read and Ask NEX RAG query.
- `+page.svelte:132-139`, `225-236`, `581-604`: decision reads and browser-side decision outcome/training-signal writes.
- `ai-monitor/+page.svelte:169-184`, `223-270`, `336-365`: client-side email guard and browser-side reads of decisions/embeddings/logs/LoRA/retrieval surfaces.
- `learning/+page.svelte:12-14`, `272-292`: `recentDecisions(90, 1000)` and displayed decision text/metadata.
- `server/index.js:84-93`, `98-100`: registered internal scheduled routes and localhost binding.
- `ecosystem.config.js:152-157` plus `cron-runner.js:20-32`: `cron-decision-outcome` target and HTTP failure behavior.
- `com.c2moviez.nex-outcome-reconcile.plist:23-45`, `com.c2moviez.nex-decision-recorder.plist:18-22`, `com.c2moviez.nex-lora-train-week.plist:21-33`: staged job schedules, credential posture, and log paths.
- Supporting Run 012-covered files: `reconcile-outcomes.js`, `decision-recorder.js`, and `train-week.js`.

## Immediate Implications

1. Add tracked canonical schema/RLS evidence for `public.decisions` and `nex_reply_outcome`; these browser findings cannot be safely closed from GitHub alone.
2. Move `voteDecision()` behind a server-side endpoint with explicit Claudio/CEO role enforcement, and remove browser-direct writes to training-signal tables.
3. Fix `cron-decision-outcome`: either add the missing `/_internal/scheduled/decision-outcome` route with internal auth, or change the PM2 args to the actual reachable route and required auth header.
4. Add freshness metadata to `/learning` and `/ai-monitor` so dashboards cannot look healthy while reconciliation is stale.
5. Add single-flight guards to the staged LaunchAgents and keep the LoRA job resource-contained.

## Next Queue

Run 014 should stay single-lane and move from dashboard decision wiring into the next high-risk public/auth surface cluster:

1. `Dashboard-v2/functions/auth.js`
2. `Dashboard-v2/functions/auth-check.js`
3. `Dashboard-v2/functions/config-public.js`
4. `Dashboard-v2/functions/client-update.js`
5. `Dashboard-v2/functions/chat.js`
6. `Dashboard-v2/functions/context-engine.js`
7. `Dashboard-v2/functions/plan.js`
8. `Dashboard-v2/functions/predictive-intel.js`
9. `Dashboard-v2/functions/nex-rag-query.js`
10. `Dashboard-v2/functions/mcp-server.js`
