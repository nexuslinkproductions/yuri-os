# LOOPS.md — the agentic loop system (spec v1, 2026-07-29)

Every stage of the content platform is a closed loop: capture → digest →
score → learn → adjust. Loops hand artifacts to the next loop. Everything
is scored; scores drive autonomous, logged, reversible adjustments. This is
the engineered workflow that runs "always, on any platform, and gets better
on its own."

## The loop engine

`_SYSTEM/content-engine/loops/loop-runner.mjs` (zero-dep node)

- A loop is a module exporting `{ name, every, steps, adjust }`.
- `loop-runner.mjs <name>` executes the steps in order; each step emits
  artifacts into the store and scores into the ledger.
- **Loop ledger** `_SYSTEM/content-engine/loops/loop-ledger.jsonl`:
  `{ts, loop, artifact, metric, value, scorer, note}` — the single source
  of truth for "how good is everything we produce."
- **Adjustment journal** `adjustments.jsonl`:
  `{ts, loop, change, before, after, reason, revert}` — every autonomous
  change is logged and reversible by construction.

## The loops (handoff chain)

### L1 sweep (per platform: x, threads, ig, reddit, github, youtube)
- capture: platform-specific collector (browser bridge / public harvest /
  radar channels) → items into the store as `capture` objects
- score: per item = engagement percentile within its source cohort
  (likes/plays vs that account's 30-day median), recency-weighted
- learn: per account = yield rate (items above 70th percentile / items
  captured) over rolling 30 days
- adjust (auto): accounts with yield < 0.1 for 3 consecutive sweeps get
  demoted in the watchlist (comment `# yield-demoted` + reason); accounts
  discovered via high-scoring items get proposed as additions
- hands to: L2

### L2 synthesize
- reads new captures → updates the SYNTHESIS pattern files (skeleton,
  hook taxonomy, transferable/refused) via the drafting lane
- score: pattern usage rate = % of approved drafts in the window that used
  each named pattern (from draft meta)
- learn: patterns with usage < 10% over 20 drafts get marked stale
- adjust (auto): hook taxonomy re-sorted by scored effectiveness; stale
  patterns annotated, never silently deleted
- hands to: L3

### L3 produce (dive → brief → draft → verdict)
- dive assembles context → Hermes drafts → quality gate scores → Marcel
  verdicts (approve / edit / disapprove+note)
- score: per draft = gate score + verdict outcome (approve=1, edit=0.5,
  reject=0); per brief = mean of its drafts
- learn: brief template + pattern combination vs verdict rate
- adjust (auto): brief templates under 40% approval after 10 uses get a
  `# underperforming` annotation and the dive stops using them; winning
  combinations get weighted up
- hands to: L4

### L4 publish
- approved → posted (browser/API lane) → engagement snapshots at 1h, 24h,
  72h into `engagement.jsonl`
- score: per post = engagement vs own-account 90-day baseline (percentile)
- learn: pattern × platform vs engagement percentile
- adjust (auto): feeds L2's pattern weights with REAL outcome data (closes
  the meta-loop: patterns stop being style guesses and become measured)
- hands to: L5

### L5 meta (weekly)
- reads all four ledgers → produces the loop report (yield per loop,
  adjustments taken, reversals) into the app's Loops view
- adjust (auto, bounded): proposes engine-level changes (sweep cadence,
  score thresholds, new watchlist verticals). Anything above the risk
  threshold lands as a proposal card for Marcel, never auto-applies.

## Autonomy bounds (locked)

1. Auto-adjustments only on: watchlist demotion/promotion, pattern weights,
   brief template weights, cadence. All logged + reversible.
2. Never auto: posting, deleting content, changing voice rules, touching
   protected surfaces, external writes of any kind.
3. Every score is reproducible: scorer version recorded in the ledger.

## App surface

Loops view in the dashboard: per-loop health (last run, items, mean score,
yield), the adjustment journal (what changed, why, revert button), and the
weekly meta report. M3 milestone in NEXUS-BUILD.md.
