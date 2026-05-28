# C-137 Runtime, Scheduler, And Resource-Pressure Results

Date: 2026-05-27  
Target clone: `/tmp/yuri-c2moviez-vault-full.b1RopZ/repo`  
Target HEAD: `8103286e1abc63fa9490cb1375ecde4f340aa2bb`  
Mode: read-only source inspection. No target scripts executed. No installs. No dev server. No live Telegram, Supabase, Plane, Outlook, Bexio, Infomaniak, or credential calls.

## Scope

This shard inspects whether the tracked repository can explain the reported CPU/RAM instability and whether runtime wiring is reconstructable from source:

```text
LaunchAgents / PM2 cron / local model service / Telegram pollers
  -> long-running loops
  -> restart behavior
  -> schedule ownership
  -> missing tracked supervisors
  -> resource caps and false-assurance controls
```

The repo contains several useful stability controls, but the source-truth runtime map is incomplete. The tracked code can plausibly explain high CPU/RAM pressure without needing a single exotic bug: model residency, long-poll receivers, watchdogs, self-healing, scheduled sync jobs, and Claude respawn behavior can overlap without a central process budget.

## Findings

### R111-F01 - Runtime Process Truth Is Not Reconstructable From The Tracked LaunchAgent Inventory

Severity: Critical repo-truth and operations risk  
Status: `C137_VERIFIED`

Evidence:

- `Scripts/launchagents-staged/` contains 20 staged plist files, including `com.c2moviez.nex-local-models`, `com.c2moviez.nex-self-healer`, `com.c2moviez.nex-registry-scan`, `com.c2moviez.nex-embed-refresh`, and `com.c2moviez.ceo-correction-detector`.
- The staged inventory does not include tracked plists for `telegram-poller`, `exeo-daemon`, `exeo-wake`, `obsidian-queue`, `fanny-bot`, `fanny-daemon`, or a financial/Bexio sync agent.
- `Scripts/nex-self-healer.js:38-50` maps several of those missing labels as restartable runtime agents.
- `Scripts/nex-self-healer.js:127-143` tries to kickstart non-green mapped agents from live liveness rows.

Impact:

The repo cannot answer the basic incident question "what processes are meant to be running?" without local machine state. A dashboard can show liveness for agents whose install definitions are absent from tracked source, and a self-healer can attempt restarts for labels that are not reproducible from GitHub.

Required remediation direction:

- Add a runtime manifest that lists every live process, owner, install source, expected cadence, memory budget, log path, heartbeat name, restart policy, and deployment host.
- Generate LaunchAgent/PM2 definitions from the manifest or export installed definitions into a redacted source-tracked baseline.
- Mark every dashboard liveness row as `source-tracked`, `local-only`, `retired`, or `unknown`.

### R111-F02 - Local Model Service Has A Documented Multi-GB Footprint But No Real Memory Cap

Severity: High resource-pressure risk  
Status: `C137_VERIFIED`

Evidence:

- `Scripts/launchagents-staged/com.c2moviez.nex-local-models.plist:17-20` documents expected memory: BGE-m3 plus Qwen 7B at about 7-8 GB RSS, idle BGE-m3 at about 1.5 GB.
- `Scripts/launchagents-staged/com.c2moviez.nex-local-models.plist:67-75` comments that the service is capped at 8 GB resident, but the `SoftResourceLimits` block only sets `NumberOfFiles`.
- `Scripts/nex-rvf/local-models/serve.sh:31-37` sets `PYTORCH_MPS_HIGH_WATERMARK_RATIO=0.0`, explicitly disabling the hard MPS upper limit.
- `Scripts/nex-rvf/local-models/serve.py:12-19` says BGE stays resident and Qwen/DeepSeek 7B are mutually exclusive.
- `Scripts/nex-rvf/local-models/serve.py:45-48` keeps global resident model state.
- `Scripts/nex-rvf/local-models/serve.py:86-143` loads BGE and the active 7B role lazily, unloads only the prior MLX role, and uses `gc.collect()`.

Impact:

The local model service alone can account for a large share of RAM. The tracked "cap at 8 GB" is only a comment, not an enforced limit, and the MPS hard watermark is disabled. This is a plausible contributor to the reported 30 GB-plus memory pressure when combined with Claude, Node processes, Whisper, browser/dashboard, and scheduled jobs.

Required remediation direction:

- Replace the comment with an actual memory budget control or watchdog policy.
- Add `/health` memory thresholds and dashboard alerts that distinguish BGE-only, one-7B-loaded, swap-heavy, and degraded states.
- Document whether Qwen/DeepSeek/BGE are allowed to coexist with Whisper transcription and Claude sessions on the same Mac.

### R111-F03 - Claude Persistent Launcher Respawns Every 3 Seconds With Broad Bypass Tool Authority

Severity: High cost, stability, and security risk  
Status: `C137_VERIFIED`

Evidence:

- `Scripts/ai:72-83` launches `claude` in an infinite loop and respawns after 3 seconds on every exit.
- `Scripts/ai:74-79` passes `--permission-mode bypassPermissions` and allows Telegram, Plane, database/Supabase, Obsidian, file-read/search, and Bash tools.
- `Scripts/ai:54-57` truncates and pipes the tmux pane to `/tmp/nex-ai-session.log` on launch.
- `Scripts/ai:14-18` hard-codes the app, MCP config, prompt file, and log paths to the local machine layout.

Impact:

If the Claude CLI exits repeatedly because of auth, MCP, prompt, path, or terminal state problems, this loop can churn CPU, logs, and paid session usage. Because the tool profile is broad and bypasses prompts, recovery behavior is also a security boundary, not only an availability boundary.

Required remediation direction:

- Add exponential backoff and a circuit breaker after repeated exits.
- Split Claude tool profiles by task: Telegram read-only triage, CEO-admin, scheduled internal jobs, and write-capable maintenance should not share one broad authority profile.
- Persist explicit launch state and last-exit reason so the dashboard can show crash-loop versus healthy idle.

### R111-F04 - Telegram Poller Performs Heavy Media And Whisper Work Inside The Receiver Loop

Severity: High resource-pressure and ingress-risk amplifier  
Status: `C137_VERIFIED`

Evidence:

- `Scripts/telegram-mcp/poller.js:424-426` deletes any Telegram webhook and starts long polling.
- `Scripts/telegram-mcp/poller.js:433-584` runs an infinite `getUpdates` receiver loop.
- `Scripts/telegram-mcp/poller.js:260-270` converts voice audio with `ffmpeg` and runs `whisper-cli` with a 60-second timeout.
- `Scripts/telegram-mcp/poller.js:337-365` handles meeting recordings, converts audio, and runs Whisper medium with a 30-minute timeout.
- `Scripts/telegram-mcp/poller.js:454-574` downloads photos, documents, audio, and voice messages, writes local temp files, appends inbox entries, and wakes EXEO.

Impact:

The receiver path is not just message polling. It can download files, transcode audio, run local Whisper, write temporary media, and wake the AI command chain. When combined with the earlier finding that inbound sender authorization is not the first operation, this makes Telegram ingress both a security boundary and a resource-pressure boundary.

Required remediation direction:

- Enforce sender allowlisting before any file download, audio conversion, meeting command handling, inbox append, or AI wake.
- Put media transcription behind a bounded worker queue with file-size, duration, concurrency, and disk quotas.
- Keep the receiver loop thin: accept, authorize, enqueue, acknowledge.

### R111-F05 - Multiple Long-Running Loops And Periodic Jobs Overlap Without A Source-Tracked Process Budget

Severity: High stability and navigationability risk  
Status: `C137_VERIFIED`

Evidence:

- `Scripts/lib/ceo-correction-detector.js:22-28` watches `/tmp/telegram-inbox.jsonl` every 5 seconds.
- `Scripts/lib/ceo-correction-detector.js:436-453` runs an infinite loop and heartbeats every 60 seconds.
- `Scripts/team-bots/team-bot.js:500-536` deletes each team bot webhook and runs a long-poll loop.
- `Scripts/launchagents-staged/com.c2moviez.nex-registry-scan.plist:18-30` runs every 5 minutes and also watches LaunchAgents, `.claude/agents`, `.mcp.json`, and team-bots.
- `Scripts/launchagents-staged/com.c2moviez.nex-self-healer.plist:19-21` runs every 5 minutes at load with a 30-second throttle.
- `Scripts/launchagents-staged/com.c2moviez.nex-embed-refresh.plist:30-43` runs every 30 minutes at load.
- `Dashboard-v2/server/ecosystem.config.js:53-160` defines a PM2 cron suite for Telegram, metrics, deep-learning, and decision-outcome jobs.

Impact:

There is no tracked budget saying which long-running processes may run together, what their expected CPU/RAM is, which host owns them, and which ones should be paused during model inference or transcription. This is a direct navigationability failure for an LLM operator: it can see many "important" loops but cannot rank or coordinate them.

Required remediation direction:

- Add a process budget table with expected idle/active CPU, expected RSS, max RSS, cadence, and host.
- Add mutual-exclusion groups for model inference, Whisper, large sync jobs, and Claude maintenance turns.
- Add one runtime status command that reconciles PM2, LaunchAgents, tmux, local ports, and heartbeat rows into one truth table.

### R111-F06 - PM2 Cron Configuration References A Scheduled Route The Tracked Server Does Not Expose

Severity: Medium-high scheduler false-assurance risk  
Status: `C137_VERIFIED`

Evidence:

- `Dashboard-v2/server/ecosystem.config.js:152-160` defines `cron-decision-outcome` calling `/_internal/scheduled/decision-outcome`.
- `Dashboard-v2/server/index.js:84-93` exposes scheduled internal routes for Telegram digests, metrics snapshot, and deep-learning, but not decision-outcome.
- `Dashboard-v2/server/cron-runner.js:20-31` POSTs `{}` to the local route and exits nonzero on HTTP errors.
- `Dashboard-v2/server/Caddyfile.template:18-23` blocks external access to `/_internal/*` and proxies loopback requests.

Impact:

The external boundary control is a positive control, but the route table and scheduler disagree. In production this job can silently fail on every scheduled run unless another untracked route exists. That increases log noise and undermines trust in "scheduled functions replaced Netlify" claims.

Required remediation direction:

- Generate PM2 cron entries from the same route manifest used by `server/index.js`.
- Fail CI if a scheduled route exists in PM2 but not in the server route table, or vice versa.
- Add job-level auth tokens anyway; loopback-only routing is not a substitute for handler-level intent checks.

### R111-F07 - Tracker Scheduled Functions Keep Netlify Schedule Metadata But The Repo Has No Tracked Netlify Config

Severity: High scheduler truth and sync reliability risk  
Status: `C137_VERIFIED`

Evidence:

- `Dashboard-v2/functions/tracker-m365-mirror.js:150-152` declares a `*/1 * * * *` schedule.
- `Dashboard-v2/functions/tracker-push-plane.js:145-148` declares a `*/2 * * * *` schedule.
- `Dashboard-v2/functions/tracker-pull-plane.js:196-199` declares a `*/15 * * * *` schedule.
- A source inventory for `netlify.toml` returned no tracked file.
- `Dashboard-v2/server/ecosystem.config.js:53-160` contains PM2 cron entries, but does not schedule the tracker sync functions.
- `Dashboard-v2/server/index.js:84-93` does not expose tracker scheduled routes under `/_internal/scheduled/*`.

Impact:

The source has two scheduler dialects: PM2 cron for some old scheduled functions and Netlify `exports.config` metadata for tracker syncs. The repo does not prove which scheduler actually owns tracker sync. This directly affects the claim that CHRONEX, M365, and Plane syncing are working.

Required remediation direction:

- Choose one scheduler owner per function and source-track it.
- For Netlify-owned jobs, track `netlify.toml` and deployment settings or mark them as deployment-export required.
- For PM2-owned jobs, add internal routes and PM2 cron entries for tracker sync with in-handler guards.

### R111-F08 - Self-Healer Can Create False Recovery Confidence For Missing Or Untracked Agents

Severity: Medium-high false-assurance risk  
Status: `C137_VERIFIED`

Evidence:

- `Scripts/nex-self-healer.js:79-87` reads all liveness rows from `nex_agent_liveness`.
- `Scripts/nex-self-healer.js:135-143` attempts restart actions for every non-green row with an expected interval and mapped label.
- `Scripts/nex-self-healer.js:148-156` records changelog and escalation output after failed restart attempts.
- Several mapped labels are absent from the tracked staged LaunchAgent inventory.

Impact:

The self-healer can look sophisticated while hiding a source-truth gap: if the live machine has labels not represented in GitHub, GitHub cannot reconstruct or review the recovery behavior. If the live machine does not have those labels, the self-healer can generate repeated failed kickstarts and escalations without fixing the root issue.

Required remediation direction:

- Before kickstart, verify the installed LaunchAgent exists and matches the tracked manifest hash.
- Mark liveness rows for unknown or untracked labels as `registry_error`, not just red/yellow runtime failure.
- Separate "process not installed", "process installed but dead", and "process running but stale heartbeat" in the dashboard.

### R111-F09 - Team Bot Plane Pagination Uses A Pattern Already Flagged Elsewhere As Drift-Prone

Severity: Medium data-consistency and loop-noise risk  
Status: `C137_VERIFIED`

Evidence:

- `Scripts/team-bots/team-bot.js:138-156` loops Plane issue pages using `page` and `next_page_results`, with a hard cap at page 10.
- `Dashboard-v2/functions/shared-plane.js` was separately verified as a positive-control helper that avoids cursor/page drift with bounded dedupe.
- `Scripts/team-bots/team-bot.js:515-536` keeps long polling team Telegram bots and calls the issue fetch path from message handling.

Impact:

This is not the highest-risk bug, but it is another example of duplicated integration logic. If Plane pagination behavior differs from the assumption, team bots can produce stale or duplicated task lists. The page cap prevents infinite pagination, but not wrong results.

Required remediation direction:

- Reuse the shared Plane pagination helper across dashboard functions and team bots.
- Add duplicate-id metrics and a sync warning if Plane returns repeated pages.

## Positive Controls

- `Dashboard-v2/server/ecosystem.config.js:21-23` and `35-42` disable PM2 watch mode and set memory restarts for the API and frontend.
- `Dashboard-v2/server/Caddyfile.template:18-23` blocks external access to `/_internal/*`.
- `Scripts/nex-rvf/refresh.sh` uses a single-instance lock and peer-lock detection before running MiniLM/BGE backfills.
- `Scripts/nex-rvf/local-models/serve.py:122-143` tries to unload the prior MLX role before loading another 7B role.
- `Scripts/nex-rvf/registry-scan.js:14-19` documents cadence-only fill and source scanning, which is the right direction for runtime registry truth.

## Coverage Closure

This shard closes the first source-only runtime/scheduler/resource-pressure pass for tracked code. It does not prove the live root cause of Claudio's current CPU/RAM spike because installed LaunchAgents, PM2 process state, tmux panes, Keychain values, local model files, live logs, and macOS Activity Monitor samples are outside GitHub scope.

For the GitHub-only audit, the conclusion is still strong: the repo does not contain enough source-tracked runtime truth to let an LLM operator safely answer "what is running, what should be running, and what is allowed to consume the machine."
