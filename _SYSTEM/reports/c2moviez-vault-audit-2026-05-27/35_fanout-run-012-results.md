# Fanout Run 012 Results

Date: 2026-05-27
Target clone: `/tmp/yuri-c2moviez-vault-full.b1RopZ/repo`
Target commit: `8103286e1abc63fa9490cb1375ecde4f340aa2bb`
Mode: read-only, no mutation, no target execution, no live service calls, no credential use
Worker mode: single persistent Claude/tmux lane, active cap `1`

## Acceptance Summary

Run 012 is accepted.

- `R012_DECISIONS_LINEAGE_OPUS / DECISIONS-LINEAGE-012`: accepted, `files_covered=12 findings=13 suppressions=4 deferred=3 invalidated=0`.

Accepted assigned target surfaces added by Run 012: `12`.

Accepted assigned target coverage total after Run 012: `218 / 1505` tracked files.

Strict semantic caveat carried forward: two lockfiles are currently `partial`: `Scripts/telegram-mcp/package-lock.json` from Run 008 and `Scripts/team-bots/package-lock.json` from Run 010. Full semantic coverage is `216 covered + 2 partial`.

Contamination check: passed. C-137 checked the Run 012 pipe log for protected Claude runtime path strings, `Searched memories`, and invalidation markers; no protected-runtime contamination was accepted.

Clone proof: C-137 verified the target clone at commit `8103286e1abc63fa9490cb1375ecde4f340aa2bb`, clean status count `0`, and `1505` tracked files.

Source pipe log:

- `/tmp/yuri-c2v-fanout-run-012/pipe/r012-single.pipe.log`

## C-137 Severity Adjustments

Lane severities remain advisory. C-137 adjusted or qualified these before acceptance:

- `R012-F02`: downgraded from critical to high deployment-order/privacy candidate. Phase J grants anon select on `exeo_decisions`, `commitments`, `agent_cooldowns`, `exeo_night_mode`, and `exeo_decisions_rollup`, but this is not `public.decisions`, and later `005_n1_rls_lockdown.sql` explicitly locks down several of these surfaces. Live migration order remains the deciding evidence.
- `R012-F01`, `R012-F03`, `R012-F06`: accepted as key-fallback risks, not confirmed anon-write vulnerabilities. If anon is blocked by live RLS, the failure mode is silent broken automation. If anon writes are allowed, severity rises.
- `R012-F04`: accepted as high because the code fails open when `INTERNAL_SERVICE_KEY` is absent.
- `R012-F05`: accepted as high deployed-surface privacy candidate. Repo evidence shows no auth gate; deployment and route reachability remain deferred.
- `R012-F08` and `R012-F12`: accepted as high data-integrity risks because they can corrupt decision outcome truth even without an external attacker.
- `HISTORY_GAP`: accepted. Current tree and bounded history search did not reveal a tracked `CREATE TABLE public.decisions` migration.

## Executive Findings

Run 012 explains why Run 011's `public.decisions` question matters: the table is central, heavily consumed, and not schema-truth-bound in the repository.

The repo contains many current readers and writers of `public.decisions`, but no tracked current-tree or bounded-history DDL/RLS source for the table. `decisions-capture.js` even names a migration, `nex_brain_phase2_decisions_schema`, that is not present as a tracked SQL artifact. This means an LLM or operator can see the call sites but cannot prove table columns, policies, grants, or deployment order from GitHub evidence alone.

The most serious code wiring issue is the presence of three separate reconcilers that can all patch `decisions.outcome` with different taxonomies and no atomic `outcome IS NULL` write guard. That can explain false confidence, confusing dashboards, and broken learning loops even without any attacker.

The cleanest external-surface risk is `intel-retrieval-stats.js`: it has no visible auth gate and returns decision previews, client codes, targets, outcomes, and recommendation text if deployed as a public Netlify function.

## Decisions Lineage Lane

Lane: `R012_DECISIONS_LINEAGE_OPUS`
Batch: `DECISIONS-LINEAGE-012`

Files covered:

- `Scripts/lib/decisions-capture.js`
- `Scripts/lib/decision-recorder.js`
- `Scripts/reconcile-decisions.js`
- `Scripts/nex-rvf/reconcile-outcomes.js`
- `Scripts/nex-rvf/train-week.js`
- `Scripts/nex-rvf/lib/walker.js`
- `Scripts/backfill-lora-pairs.js`
- `Dashboard-v2/functions/decision-outcome.js`
- `Dashboard-v2/functions/intel-retrieval-stats.js`
- `Dashboard-v2/db-migrations/020_nex_decisions_yesterday_rollup.sql`
- `Dashboard-v2/db-migrations/022_nex_weekly_self_review.sql`
- `Scripts/migrations/2026-04-19-phase-j.sql`

History check:

- `HISTORY_GAP`: no tracked `CREATE TABLE public.decisions` source found in current tree or bounded history search. Phase J creates `public.exeo_decisions`, not `public.decisions`.

Accepted findings:

| ID | Severity | Path | Class | Finding |
| --- | --- | --- | --- | --- |
| `R012-F01` | high | `Scripts/lib/decisions-capture.js:40-45`, `Scripts/lib/decisions-capture.js:210`, `Scripts/lib/decisions-capture.js:237-253` | security/wiring | Primary decision insert/patch helper prefers service-role credentials but falls through to anon key sources. Write paths should fail closed if service-role is unavailable. |
| `R012-F02` | high candidate | `Scripts/migrations/2026-04-19-phase-j.sql:104-121`, `Dashboard-v2/db-migrations/005_n1_rls_lockdown.sql:33-117`, `Dashboard-v2/db-migrations/005_n1_rls_lockdown.sql:187-193` | deployment-order/privacy | Phase J grants anon select on several sensitive EXEO learning/control tables; later lockdown mitigates some of them if live after Phase J. |
| `R012-F03` | high | `Dashboard-v2/functions/decision-outcome.js:29-31`, `Dashboard-v2/functions/decision-outcome.js:136-189` | security/wiring | Decision outcome Netlify function reads and patches `public.decisions` but falls back from service key to anon key. |
| `R012-F04` | high | `Dashboard-v2/functions/decision-outcome.js:238-245` | auth | `decision-outcome.js` only checks `X-Internal-Key` if `INTERNAL_SERVICE_KEY` is configured; if the env var is absent, the endpoint runs unauthenticated. |
| `R012-F05` | high | `Dashboard-v2/functions/intel-retrieval-stats.js:17-23`, `Dashboard-v2/functions/intel-retrieval-stats.js:43-50`, `Dashboard-v2/functions/intel-retrieval-stats.js:154`, `Dashboard-v2/functions/intel-retrieval-stats.js:258-274` | privacy | Retrieval stats function has no visible auth gate and returns current decision activity, including recommendation preview, client code, target, outcome, and timestamp. |
| `R012-F06` | medium | `Scripts/reconcile-decisions.js:51-55`, `Scripts/reconcile-decisions.js:190-195` | security/wiring | Legacy reconciler can fall back to a Keychain anon key while patching decision outcomes. |
| `R012-F07` | medium | `Scripts/nex-rvf/reconcile-outcomes.js:196-218` | auditability | `reconcile-outcomes.js` patches decision outcomes and then writes audit rows fire-and-forget; audit failure is swallowed. |
| `R012-F08` | high | `Scripts/nex-rvf/reconcile-outcomes.js:220-266` | data integrity | Reversal pass marks every null-outcome decision within a +/-2 hour window of a correction-like CEO message as reversed, without matching agent, target, or entity. |
| `R012-F09` | medium | `Scripts/nex-rvf/lib/walker.js:130-159` | privacy/RAG | `walkDecisions()` embeds decision context, rationale, outcome, client code, and recommendation text into the RAG corpus. This is safe only if embeddings/search are locked down. |
| `R012-F10` | medium | `Scripts/nex-rvf/train-week.js:108-113`, `Scripts/lib/decision-recorder.js:165-189` | wiring | `train-week.js` expects `source=decision-recorder.js` rows in `public.decisions`, but `decision-recorder.js` now writes autonomous turns to `nex_actions` instead. Training pair flow can starve. |
| `R012-F11` | info | `Scripts/lib/decision-recorder.js:165-189` | positive | Moving autonomous turns from `public.decisions` to `public.nex_actions` is a good architectural separation that reduces noise in decision learning data. |
| `R012-F12` | high | `Scripts/reconcile-decisions.js`, `Scripts/nex-rvf/reconcile-outcomes.js`, `Dashboard-v2/functions/decision-outcome.js` | wiring/data integrity | Three independent reconcilers can patch `decisions.outcome` with different taxonomies and no atomic stale-row guard. |
| `R012-F13` | medium | `Dashboard-v2/functions/decision-outcome.js:127-131` | false assurance | `decision-outcome.js` auto-classifies decisions as `followed` after two hours with no reversal signal, which can inflate success metrics. |

Suppressions:

- `020_nex_decisions_yesterday_rollup.sql`: view-level public exposure suppressed for this lane because both views use `security_invoker=true`; actual access depends on the underlying `public.decisions` RLS.
- `022_nex_weekly_self_review.sql`: same suppression; the views are security invoker.
- `Scripts/nex-rvf/train-week.js`: direct training-data poisoning via this script is suppressed because it reads with service-role and filters a narrow source. The stale-source bug remains reportable as wiring.
- `Scripts/backfill-lora-pairs.js`: direct corruption is suppressed because it writes `quality=NULL` pairs for review; however, it still depends on the same drying `decisions` source.

Deferred:

- `public.decisions` schema/RLS: no tracked DDL/RLS source was found. Need read-only live DB metadata or owner export of schema/policies.
- `Dashboard-v2/functions/intel-retrieval-stats.js` deployment reachability: repo evidence shows no auth gate, but live route/public exposure remains unverified.
- `009_nex_search_outcome_boost.sql` live severity: this run strengthens the concern because `public.decisions` lacks repo schema/RLS truth, but live DB metadata is still required.

## C-137 Spot Checks

C-137 directly checked these anchors in the canonical clone before accepting:

- `decisions-capture.js:9-16`, `40-45`, `210`, `237-253`: schema comment, credential fallback, insert, and patch.
- `decision-recorder.js:27-39`, `145-189`: local `/tmp` message provenance and current write to `nex_actions` instead of `decisions`.
- `reconcile-decisions.js:51-55`, `95-103`, `185-197`, `199-230`: anon fallback, pending decision fetch, patch, and daily sweep.
- `reconcile-outcomes.js:31-33`, `95-107`, `196-218`, `220-266`, `282-304`: service-role posture, patch/audit behavior, broad reversal pass, and main loop.
- `decision-outcome.js:29-31`, `136-189`, `208-235`, `238-245`: anon fallback, decision patch loop, weekly rollup, and fail-open internal auth.
- `intel-retrieval-stats.js:17-23`, `43-50`, `149-165`, `258-274`: no auth gate and returned decision payload.
- `walker.js:130-159`: decision context embedding into RAG.
- `train-week.js:108-113`, `backfill-lora-pairs.js:157-163`: old `decision-recorder.js` source dependency.
- `020` and `022` decision views: `security_invoker=true`.
- `2026-04-19-phase-j.sql:29-47`, `104-121`, `197-200`: `exeo_decisions`, anon read policies, and anon-executable helper RPCs.
- Git current tree and bounded history search did not surface tracked `CREATE TABLE public.decisions` DDL.

## Immediate Implications

1. Establish a tracked canonical `public.decisions` schema/RLS migration or schema snapshot before any LLM/operator claims the decision layer is understood.
2. Pick one canonical outcome reconciler. Disable or retire the other two, or add atomic `WHERE outcome IS NULL` writes plus a shared taxonomy.
3. Make every decision write path service-role-only and fail closed if only anon credentials are present.
4. Lock `decision-outcome.js` behind mandatory internal auth; missing `INTERNAL_SERVICE_KEY` should be a hard failure.
5. Gate or remove public exposure for `intel-retrieval-stats.js`.
6. Update LoRA training flow to the current `nex_actions` source, or explicitly stop claiming it is fed by current Telegram turns.

## Next Queue

Run 013 should stay single-lane and close the public browser/dashboard decision consumers that were outside this shard:

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

