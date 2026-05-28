# Fanout Run 012 Packet

Date: 2026-05-27
Target clone: `/tmp/yuri-c2moviez-vault-full.b1RopZ/repo`
Target commit: `8103286e1abc63fa9490cb1375ecde4f340aa2bb`
Worker mode: single persistent Claude/tmux lane, active cap `1`
Required model lane: Opus worker in the existing persistent session

## Mission

Execute one bounded read-only target-repo shard:

`R012_DECISIONS_LINEAGE_OPUS / DECISIONS-LINEAGE-012`

This shard closes the Run 011 deferred question around `public.decisions`: what current code reads/writes it, whether the repo contains a current or historical table creation/RLS source, whether decision data is exposed to browser/anon surfaces, and whether decision reconciliation/write-back can mutate high-value learning data without enough authority checks.

## Non-Negotiable Rules

- Read-only only.
- No writes to Claudio's target repository.
- No writes to YURI report files from the worker lane.
- No target execution, no dependency installs, no service starts.
- No live service calls.
- No credential use, validation, replay, or provider connection.
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

1. `Scripts/lib/decisions-capture.js`
2. `Scripts/lib/decision-recorder.js`
3. `Scripts/reconcile-decisions.js`
4. `Scripts/nex-rvf/reconcile-outcomes.js`
5. `Scripts/nex-rvf/train-week.js`
6. `Scripts/nex-rvf/lib/walker.js`
7. `Scripts/backfill-lora-pairs.js`
8. `Dashboard-v2/functions/decision-outcome.js`
9. `Dashboard-v2/functions/intel-retrieval-stats.js`
10. `Dashboard-v2/db-migrations/020_nex_decisions_yesterday_rollup.sql`
11. `Dashboard-v2/db-migrations/022_nex_weekly_self_review.sql`
12. `Scripts/migrations/2026-04-19-phase-j.sql`

## Required History Check

The current tree references `public.decisions`, but C-137 did not find a current tracked table-creation migration in Run 011.

Run a bounded Git-history check for decision table creation/RLS:

```bash
git -C /tmp/yuri-c2moviez-vault-full.b1RopZ/repo log --all --oneline -S 'create table if not exists public.decisions' -- .
git -C /tmp/yuri-c2moviez-vault-full.b1RopZ/repo log --all --oneline -G 'public\.decisions|/rest/v1/decisions|from\("decisions"\)' -- . | head -n 80
```

If a deleted or historical table-creation artifact is found, inspect the exact historical blob with `git show <commit>:<path>` and emit `HISTORY_COVERAGE`. If no creation source is found, emit `HISTORY_GAP`.

History blobs do not increment current-tree coverage unless they are current tracked files. They may become evidence for a deferred/live-state finding.

## Required Output Rows

For every assigned file:

```text
PATH_PROOF path="<path>" command="git ls-files" status=exists
READ_PROOF path="<path>" command="git show HEAD:<path>" first_line="<bounded>" last_line="<bounded>"
FILE_COVERAGE path="<path>" method=full_read status=covered lines=<n> words=<n> notes="<short>"
```

For history:

```text
HISTORY_GAP query="public.decisions creation" result="not_found" notes="<short>"
```

or:

```text
HISTORY_COVERAGE commit=<sha> path="<path>" method=full_read status=covered lines=<n> notes="<short>"
```

For findings:

```text
FINDING id=R012-F## severity=<critical|high|medium|low|info> path="<path:line>" class=<security|wiring|availability|privacy|llm_nav|positive> evidence="<repo evidence>" impact="<impact>" recommendation="<fix or next verification>"
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
BATCH_CLOSE lane=opus batch=R012 files_covered=<n> findings=<n> suppressions=<n> deferred=<n> invalidated=0
```

## Audit Questions

Answer from repo evidence only:

- Where is `public.decisions` read?
- Where is `public.decisions` written or patched?
- Which callers use service-role credentials, anon credentials, public browser Supabase clients, or unknown credentials?
- Is there a tracked current schema/RLS migration for `public.decisions`?
- If the schema source is missing, what code appears to depend on columns that may drift?
- Can unauthenticated or public browser paths read decision content, recommendation text, CEO context, client code, outcome, or training material?
- Can automated reconciliation mark decisions as `won`, `no_action`, `missed`, `reversed`, `brain_written`, or similar without human confirmation?
- Are there loops/backfills that could explain CPU/RAM pressure through large pulls, repeated patches, or missing locks/backoff?
- Does this shard strengthen or weaken Run 011 `nex_search` / outcome-boost severity?

## False-Positive Guards

- Do not call a decision read public just because a path uses `/rest/v1/decisions`; identify the credential source or browser/client context.
- Do not call a write vulnerable without a reachable caller and credential posture.
- Do not assume live RLS from current GitHub evidence; mark live-state unknowns as deferred.
- Do not treat `exeo_decisions` and `decisions` as the same table. Explicitly separate them.
- Do not print raw secrets or environment values.

## C-137 Current Coverage State

Before Run 012:

- accepted assigned target coverage: `206 / 1505`
- strict semantic coverage: `204 covered + 2 partial`
- partial files: `Scripts/telegram-mcp/package-lock.json`, `Scripts/team-bots/package-lock.json`

