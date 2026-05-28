# Fanout Run 013 Packet

Date: 2026-05-27
Target clone: `/tmp/yuri-c2moviez-vault-full.b1RopZ/repo`
Target commit: `8103286e1abc63fa9490cb1375ecde4f340aa2bb`
Worker mode: single persistent Claude/tmux lane, active cap `1`
Required model lane: Opus worker in the existing persistent session

## Mission

Execute one bounded read-only target-repo shard:

`R013_DASHBOARD_DECISION_EXPOSURE_OPUS / DASHBOARD-DECISION-EXPOSURE-013`

This shard follows Run 012's `public.decisions` lineage into the user-facing dashboard, local dashboard server, and staged LaunchAgent wiring. The goal is to answer whether decision data is exposed through browser-side Supabase calls, whether dashboard routes make internal functions reachable, whether UI auth state can mislead operators, and whether scheduled/runtime wiring can mutate decision outcomes or training data in ways that explain false assurance, CPU/RAM pressure, or broken navigation.

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

1. `Dashboard-v2/src/lib/db.ts`
2. `Dashboard-v2/src/lib/components/ClientDrawer.svelte`
3. `Dashboard-v2/src/routes/+page.svelte`
4. `Dashboard-v2/src/routes/ai-monitor/+page.svelte`
5. `Dashboard-v2/src/routes/learning/+page.svelte`
6. `Dashboard-v2/server/index.js`
7. `Dashboard-v2/server/ecosystem.config.js`
8. `Scripts/launchagents-staged/com.c2moviez.nex-outcome-reconcile.plist`
9. `Scripts/launchagents-staged/com.c2moviez.nex-decision-recorder.plist`
10. `Scripts/launchagents-staged/com.c2moviez.nex-lora-train-week.plist`

Large Svelte/TypeScript files still require complete inspection. Use chunked `git show HEAD:<path> | sed -n '<start>,<end>p'` reads if necessary, but do not mark the file covered until the full line range has been read.

## Required Output Rows

For every assigned file:

```text
PATH_PROOF path="<path>" command="git ls-files" status=exists
READ_PROOF path="<path>" command="git show HEAD:<path>" first_line="<bounded>" last_line="<bounded>"
FILE_COVERAGE path="<path>" method=full_read status=covered lines=<n> words=<n> notes="<short>"
```

For wiring:

```text
WIRING_MAP path="<path>" entrypoint="<route/component/job>" auth_control="<observed>" internal_call="<observed-or-none>" trust_boundary="<browser|local-server|launchagent|supabase|unknown>" sink="<read/write/network/process>" observability="<logs/status/ui>" failure_mode="<short>" status="<covered|deferred|suppressed|reportable>"
```

For findings:

```text
FINDING id=R013-F## severity=<critical|high|medium|low|info> path="<path:line>" class=<security|wiring|availability|privacy|llm_nav|positive> evidence="<repo evidence>" impact="<impact>" recommendation="<fix or next verification>"
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
BATCH_CLOSE lane=opus batch=R013 files_covered=<n> findings=<n> suppressions=<n> deferred=<n> invalidated=0
```

## Audit Questions

Answer from repo evidence only:

- Which browser-side components read `public.decisions` directly through the Supabase client?
- Which browser-side components update `public.decisions`, especially decision outcomes, without going through a server-side authorization boundary?
- Do browser-side reads expose decision text, rationale, outcome, client code, recommendations, or learning material?
- Which functions are reachable through `Dashboard-v2/server/index.js`, and does the server preserve or bypass the intended Netlify/internal auth assumptions?
- Does `Dashboard-v2/src/routes/ai-monitor/+page.svelte` create an auth illusion by setting `authorized` after only checking for a Supabase user?
- Can dashboard UI state imply that monitoring, learning, or reconciliation is healthier than the backend evidence supports?
- Do the staged LaunchAgents line up with current code behavior, or do comments/names/scripts drift from what they actually execute?
- Do LaunchAgents use locks, backoff, PID guards, log rotation, bounded schedules, or single-flight controls?
- Does any job path plausibly contribute to CPU/RAM pressure through large pulls, repeated polling, retries, overlapping schedules, or unbounded training/indexing?
- Does this shard strengthen or weaken Run 012's `public.decisions` schema/RLS and mixed-credential concerns?

## False-Positive Guards

- Do not call a browser-side decision read public unless the file proves browser/client execution; if live Supabase RLS is unknown, mark exploitability as RLS-dependent.
- Do not call a write vulnerable unless the write is reachable from a browser, local server route, LaunchAgent, or other entrypoint.
- Do not assume local Express development server is internet-exposed unless deployment evidence shows it; separate local-dev reachability from production Netlify reachability.
- Do not treat comments in plist files as current truth when the invoked script has different behavior.
- Do not print raw secrets or environment values.
- Preserve positives when they survive evidence, such as auth checks, scheduled-only local routes, clear logs, or explicit local-only binding.

## C-137 Current Coverage State

Before Run 013:

- accepted assigned target coverage: `218 / 1505`
- strict semantic coverage: `216 covered + 2 partial`
- partial files: `Scripts/telegram-mcp/package-lock.json`, `Scripts/team-bots/package-lock.json`
