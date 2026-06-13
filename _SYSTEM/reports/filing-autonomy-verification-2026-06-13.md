# YURI Filing Autonomy — Governed Scheduling Layer · Verification

**Date:** 2026-06-13
**Build:** Deterministic governed-autonomy runner + hermetic tests + launchd schedule artifact, on top of the
already-built filing system (assessor 73 · deps 44 · mutator 40 = 157/157 green).
**Status:** BUILT & TESTED. Ships DRY-RUN ONLY and DISARMED. No file moved in the repo by this work.

---

## What was built

| File | Role |
|---|---|
| `_SYSTEM/Scripts/filing-autonomy.mjs` | deterministic governed runner: enumerate → planBatch → partition (tier predicate) → execute safe tier (iff armed) → reindex → verify zero stale → run-ledger + queued report |
| `_SYSTEM/Scripts/filing-autonomy.test.mjs` | 47 hermetic tests + a 5-assertion env-gated live execute+rollback proof |
| `_SYSTEM/launchd/com.yuri.filing-autonomy.plist` | schedule artifact — DRY-RUN ONLY, `RunAtLoad=false`, daily interval |
| `_SYSTEM/launchd/README.md` | arming + disarming + manual-run docs (new "Filing Autonomy" section) |
| `_SYSTEM/reports/filing-autonomy-latest.md` | runtime output — the queued-for-owner plan (regenerated each run) |
| `_SYSTEM/state/filing-autonomy-ledger.jsonl` | runtime output — append-only run-ledger (separate from filing-ledger.jsonl) |

Nothing in the existing filing system was modified. This is a pure additive layer.

## The hard constraint, resolved with a TIERED boundary (not by removing the gate)

The mutator is dry-run-by-default and owner-gated on purpose. "Autonomous execution" is reconciled with that by a
**pure, tested predicate** `isSafeTier(plan, targetExists)`:

```
AUTO-EXECUTE  ⟺  risk==LOW AND refCount<=3 AND basenameOnlyCount==0 AND protectedRefHosts==0
                 AND not pinned AND not protected (source & target) AND target does not exist
QUEUE         ⟺  everything else — MEDIUM/HIGH/CRITICAL, any basename-only/manual ref, any protected ref-host,
                 every EPHEMERAL purge candidate (NEVER auto-deleted), and auto-tier overflow past budget K
```

Same plan in → same tier decision out. Defense-in-depth: the predicate re-checks pinned/protected itself, so a
malformed plan can never smuggle a pinned/protected file into the auto tier even if `planMove` were bypassed.

## Determinism contract — verified

- **No LLM in the decision or execution path.** The only optional AI touch is the borrowed governance manifest,
  which is OUT of the move path and runs lightweight (no subprocess) on dry-run ticks.
- **Plan hash** = sha256 of the SORTED `source⇥target⇥risk⇥refCount⇥basenameOnly⇥refHosts` lines (blocked plans
  excluded, order-independent). Logged every run.
- **Cross-invocation byte-identical** (real repo, two separate process invocations, real `git grep`):
  `47f82eb1c2da5c13…` == `47f82eb1c2da5c13…` over a bounded 8-file set; the full-repo run hashed
  `98e36dd8b76e1c63…` with 156 candidates → auto 1 → queued 155.
- **Reversible.** `rollbackFrom` = git HEAD before the run; the ledger records the per-move inverse + the
  `<rollbackFrom>..HEAD` revert range; the mutator aborts+restores if any ref can't be safely rewritten.
- **Reindex then HARD-verify.** After moves: `ai reindex` + `npx gitnexus analyze --skip-agents-md`, then
  `git grep -nF` each old path — the run is marked `failed` (exit 1) if any standalone stale ref remains.

## Governance + kill-switch — verified

- **Dual arming** (`armedState`): BOTH `YURI_FILING_AUTONOMY=1` AND `_SYSTEM/state/filing-autonomy.enabled` must
  be present. Stricter AND than energy-enforce's OR — file relocation has a larger blast radius than the
  observe-mostly energy breaker. Absent either ⇒ DRY-RUN ONLY. Committed default DISARMED.
- **`--execute` additionally required**; armed-without-execute still only plans.
- **Branch gate**: refuses to mutate unless on `main`.
- **Budget cap** (default 10): bounds blast radius per tick; overflow queues as budget-deferred.
- **Stages, never commits/pushes.** `git mv` stages each move; owner commit/push authority unchanged.
- **Borrows the YURI governed-autonomy contract** (`yuri-autonomy-runner.mjs`). Decision: BORROW, not ride — that
  module is a pure manifest/validator with **no execution path**, so it cannot be the executor. The runner rides
  its L5_SCHEDULED_AUTOMATION level + decision shape as a per-run governance record (full manifest only on a real
  armed execute; its xref-preflight subprocess never runs on a routine dry-run tick and never gates the decision).

## Checks run (all local evidence — no model inference)

- `filing-assessor.test.mjs` → **73/73** · `filing-deps.test.mjs` → **44/44** · `filing-mutator.test.mjs` →
  **40/40** (base confirmed green before building).
- `filing-autonomy.test.mjs` → **47/47** hermetic (tier predicate truth-table, queue reasons, partition +
  budget cap, plan-hash determinism/order-independence/content-sensitivity, dual-arming fail-safe, enumerate
  pinned/protected/settled exclusion, stale-ref detect+clean, dry-run-mutates-nothing with byte-identical
  `git status`).
- `FILING_AUTONOMY_LIVE_TEST=1 …` → **52/52** (the 5 live assertions: armed+execute moves exactly one safe
  probe → `_SYSTEM/docs/handoffs/`, zero stale refs, then full rollback — `git status` byte-identical
  **440 → 440** lines, zero probe residue).
- Real disarmed `--execute` → `dryRun:true, executed:0`, gate `DISARMED — needs YURI_FILING_AUTONOMY=1 AND the
  flag file`.

### The four adversarial properties (explicitly proven)

| Property | Evidence |
|---|---|
| Moves NOTHING when disarmed | disarmed `--execute` → executed 0; dry-run `git status` 440→440 |
| Moves ONLY the safe tier when armed | live: 1 safe probe moved, nothing else; partition tests gate every non-safe case |
| Byte-identical across two runs | `47f82e…` == `47f82e…` (real, two invocations) |
| Fully rolls back | live: working tree byte-identical before/after, zero residue |

## Residual risk (named honestly)

1. **launchd ticks run OUTSIDE the Claude hook harness.** The PreToolUse energy-enforce / bash-guard / protected-
   path hooks fire on Claude's tool calls, not on a launchd-fired node process. So the runner's OWN guards (dual
   arming + branch gate + the pure predicate + the mutator's hard-refusals) are the governance on the cron path —
   the energy gate is NOT a layer-2 conscience there. This is why the predicate is conservative and the budget is
   small. (When the runner is invoked BY Claude via Bash, it IS under the hooks.) The energy gate scores
   work-dynamics ΔU on claim/work transitions, not file placement, so it was deliberately NOT forced into this
   path — that would be cargo-cult, not governance.
2. **Partial-batch abort leaves earlier moves staged.** Mirrors the mutator's `executeBatch` abort-on-first-
   failure. Each move is individually ref-safe + reversible; the ledger records every executed move's inverse.
   Nothing is committed, so the working tree is fully recoverable.
3. **Reindex is best-effort; stale-ref verify is the hard gate.** A reindex subprocess failure is recorded but
   does not fail the run; an unrewritten stale reference does. Correctness rides on the deterministic git-grep
   verify, not on the index refresh.
4. **The conservative tier is INTENTIONALLY small.** In the current repo state, exactly **1 of 156** misplaced
   candidates qualifies for auto-execute; **155 queue for the owner**. The sweep favors under-acting. Bulk
   relocation stays an owner-reviewed act via the existing `filing-mutator.mjs <path> --execute`.

   **That 1 file was a FALSE POSITIVE — found, then RESOLVED (owner "go" 2026-06-13).** The sole auto-eligible
   candidate was `02_RESOURCES/INVESTOR-DECK/yuri-visual-identity.md → _SYSTEM/BRAND/` — a co-located asset of the
   **active NEXUS LINK investor deck**, flagged only because its name contains "identity" (the BRAND keyword) and
   `02_RESOURCES/INVESTOR-DECK/` was not in the assessor's `SETTLED_PREFIXES`. **Fix applied:** added the three
   curated top-level resource homes `02_RESOURCES/INVESTOR-DECK/`, `02_RESOURCES/CODE-BIBLE/`,
   `02_RESOURCES/References/` to `filing-assessor.mjs` `SETTLED_PREFIXES` (assessor tests 73 → **78**, all green).
   This removed 3 poaches (the 2 investor-deck assets + a design-pack `audit.md`); the RESEARCH root stays a
   designed sweep target (its loose-json→`_data` tidying is intentional, NOT settled). Post-fix sweep: **154
   candidates · auto-tier 0 · nothing moves** even if armed. The investor deck is now protected at the assessor
   layer, not by accidental report-citation.
5. **Runtime artifacts are untracked.** `filing-autonomy-latest.md` + `filing-autonomy-ledger.jsonl` regenerate
   each run; leave untracked (or gitignore) — they are live state, not source.
6. **The filing system's own reports suppress auto-eligibility of the files they name** (FINDING, surfaced not
   silently shipped). The deps scanner counts any exact-path mention as an inbound `markdownRef`, so once a loose
   file is listed in the 06-11 dry-run plan, this queue report, or any audit, its `refCount` rises above 0 and
   its risk goes `LOW → MEDIUM` — knocking it out of the auto tier. That is why only **1 of 156** candidates is
   auto-eligible today (most of the backlog is now cross-referenced by accumulated reports). This is COHERENT,
   not a defect: the mutator rewrites those mentions on move, so nothing goes stale; and "anything cross-linked
   is owner-reviewed" is the conservative-correct posture. Consequence: the auto tier is for genuinely-orphan NEW
   loose files (a fresh scratch doc nothing links yet), **not** a backlog-clearer. Clearing the existing 155 stays
   an owner-reviewed act via `filing-mutator.mjs <path> --execute`. If the owner wants the deps scanner to discount
   descriptive report/audit files as non-dependencies, that is a deliberate change to the already-built
   `filing-deps.mjs` (out of this layer's scope) — flagged for an owner decision, not made unilaterally.

## To ARM the schedule (owner — all three, any one missing ⇒ dry-run)

```bash
touch _SYSTEM/state/filing-autonomy.enabled                     # 1. flag-file half of the kill-switch
# 2. edit com.yuri.filing-autonomy.plist: uncomment the EnvironmentVariables dict (YURI_FILING_AUTONOMY=1)
#    and append <string>--execute</string> to ProgramArguments; set RunAtLoad as desired
cp _SYSTEM/launchd/com.yuri.filing-autonomy.plist ~/Library/LaunchAgents/
launchctl load -w ~/Library/LaunchAgents/com.yuri.filing-autonomy.plist
# disarm instantly: rm -f _SYSTEM/state/filing-autonomy.enabled   (removing either half disarms)
```

*Every count from live `git ls-files` + the deterministic assessor/deps/mutator. No model inference for any path,
count, or tier decision.*
