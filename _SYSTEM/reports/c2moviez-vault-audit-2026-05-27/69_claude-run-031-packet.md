# Claude Run 031 Packet

Date: 2026-05-27
Target clone: `/tmp/yuri-c2moviez-vault-full.b1RopZ/repo`
Target commit: `8103286e1abc63fa9490cb1375ecde4f340aa2bb`
Worker mode: persistent Claude/tmux lane, Opus, read-only

## Mission

Execute one bounded read-only target-repo shard:

`R031_APP_SHELL_NAVIGATION_OPUS / APP-SHELL-NAVIGATION-031`

This shard closes the dashboard shell and navigation surfaces that determine whether an LLM/operator can efficiently navigate the repo and whether app routes line up with actual route files, permission gates, and high-authority UI affordances.

## Non-Negotiable Rules

- Read-only only.
- No writes to Claudio's target repository.
- No writes to YURI report files from the worker lane.
- No target execution, dependency installs, service starts, SQL execution, or live service calls.
- No credential use, validation, replay, provider login, API probing, callback replay, or synthetic request.
- Use only repository evidence from `/tmp/yuri-c2moviez-vault-full.b1RopZ/repo`.
- Do not read YURI protected runtime paths.
- Do not browse `.claude/state`, `.claude/history`, `.claude/file-history`, `.claude/projects`, `.env`, `node_modules`, `.amp`, or `backend/data`.
- C-137 writes durable report files after validation.

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

Inspect every line of each assigned file:

| Path | Lines |
| --- | ---: |
| `Dashboard-v2/src/routes/+layout.svelte` | 780 |
| `Dashboard-v2/src/routes/+layout.ts` | 4 |
| `Dashboard-v2/src/lib/components/Sidebar.svelte` | 434 |
| `Dashboard-v2/src/lib/components/TopNav.svelte` | 333 |
| `Dashboard-v2/src/lib/components/MobileBottomNav.svelte` | 209 |
| `Dashboard-v2/src/lib/components/CommandPalette.svelte` | 457 |
| `Dashboard-v2/src/lib/stores/cmdPalette.svelte.ts` | 28 |
| `Dashboard-v2/src/lib/stores/quickAction.svelte.ts` | 29 |
| `Dashboard-v2/src/lib/stores/theme.svelte.ts` | 36 |

Do not count supporting files as new coverage.

## Required Supporting Evidence

Use bounded supporting reads/searches for:

- Route existence for links/actions emitted by Sidebar, TopNav, MobileBottomNav, and CommandPalette.
- `Dashboard-v2/src/lib/stores/user.svelte.ts` if role/permission behavior is referenced.
- `Dashboard-v2/src/routes/login/+page.svelte` only if shell auth redirects are referenced.
- `git grep` for route hrefs, command ids, quick actions, `user.can`, `isAdmin`, `goto(`, `fetch(`, and endpoint strings discovered in assigned files.

## Output Requirements

Emit rows:

```text
PATH_PROOF path="<path>" command="git ls-files" status=exists
READ_PROOF path="<path>" command="git show HEAD:<path>" first_line="<bounded>" last_line="<bounded>"
FILE_COVERAGE path="<path>" method=full_read status=covered lines=<n> words=<n> notes="<short>"
NAV_ROUTE_MAP source="<file:line>" route_or_action="<href|goto|command|quick-action|slot>" target="<route path|component|store|endpoint|missing>" auth_or_permission="<user.can|isAdmin|role|none|unknown>" status="<covered|reportable|suppressed|deferred|positive>"
SHELL_WIRING_MAP source="<file:line>" dependency="<store|component|route|endpoint|browser API>" behavior="<short>" status="<covered|reportable|suppressed|deferred|positive>"
NAVIGATIONABILITY_MAP surface="<file/component>" issue="<good anchor|hidden dependency|comment drift|permission drift|monolithic|unknown>" evidence="<repo evidence>" llm_impact="<impact>" status="<covered|reportable|positive|deferred>"
FINDING id=R031-F## severity=<critical|high|medium|low|info> path="<path:line>" class=<security|privacy|data-integrity|availability|wiring|navigation|positive> evidence="<repo evidence>" impact="<impact>" recommendation="<fix or next verification>"
SUPPRESSION path="<path>" hypothesis="<risk considered>" counterevidence="<exact counterevidence>"
DEFERRED path="<path-or-surface>" reason="<exact blocker>" next="<next read-only evidence source>"
BATCH_CLOSE lane=opus batch=R031 files_covered=<n> findings=<n> suppressions=<n> deferred=<n> invalidated=0
```

## Seeded Checks

- Do shell/nav surfaces expose routes that do not exist?
- Do admin/high-authority routes appear without clear permission gates?
- Does CommandPalette route users to missing/stale paths or bypass sidebar visibility rules?
- Do shell components call live endpoints or mutate data directly?
- Are route names, component names, and comments coherent enough for LLM navigation?
- Does the app shell hide important architecture behind magic arrays or duplicated nav definitions?

## Current Coverage State

Before Run 031:

- accepted assigned target coverage: `322 / 1505`
- strict semantic coverage: `320 covered + 2 partial`
