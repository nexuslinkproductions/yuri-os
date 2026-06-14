# Inc 8 (Subconscious Cold Tier) — Mimo Peer Review Synthesis (2026-06-14)

Mimo (mimo-v2.5-pro, `mimo.mjs`) adversarially reviewed Inc 8 — the subconscious cold-tier classifier
(`mcs-subconscious.mjs`), the `foldCanonical` contested-tracking fix, and the `keyOf` export. Brief:
`inc8-mimo-review-brief.txt`. Raw output: `inc8-mimo.out` (kept local). Peer output is advisory-until-verified —
every finding checked against the code before action.

## Verdicts

| # | Mimo finding | Verified verdict | Resolution |
|---|--------------|------------------|------------|
| 3 | Two-track separation — does `subconsciousView` touch Track-B `.claude/memory`? | **CLEAN** — reads only `loadCanonical`/`readView`/`eventGenAgeIndex`, all under `dir` (canonical store). No `.claude/memory` path. | None — confirms the design question that prompted the owner check: the cold tier lives strictly within canonical. |
| 2b / 4 | **Contested doesn't survive compaction** — compaction rescues only `byKey` winners, so a contested *loser*'s event is dropped → contested silently clears on re-fold. | **REAL BUG** — probe confirmed `contested 1 → 0` after compaction churn. | **FIXED**: `liveEventIds(base)` = winners ∪ contested-backing event IDs; used by `compactGeneration`, `safeUnlinkSealedGens`, `compactionScore`. Accumulator now carries `eventId`. Regression test `T-contested-survives-compaction`. |
| 1 | **Age signal is gen-granular, not per-claim** — `appendDurable` bumps gen mtime (active gen always fresh; same-gen claims share age); restore resets mtimes. | **REAL LIMITATION** (not a correctness bug — Inc 8 is DISARMED/observational). | Documented honestly in the `mcs-subconscious.mjs` header; flagged true per-claim age (durable epoch) as a future increment. Classifier is coarse + conservative-toward-HOT. |
| 2a | Supersede-after-retract: A asserts X, retracts, B asserts Y → not contested. | **NOT A BUG** — a retracted value is no longer active/competing; Y standing alone is correctly uncontested. | None (defensible semantic). |
| 2c | Supersede prunes the "wrong key". | **NOT A BUG** — removal uses `keyOf(old)` (the *superseded* event's own key), which is correct. | None. |
| 2d | Re-assert of a superseded object re-flags contested ("ghost"). | **CANNOT HAPPEN** — re-asserting the same `(kind,subject,predicate,object)` yields the same content-hash eventId → deduped → never re-enters. | None. |

## Result

37 store-family tests green (store 17 · fault-injection 7 · persistence 7 · subconscious 6). The contested feature
is now correct end-to-end: **detected** (persistent accumulator, fixing the original discard bug), **resolved**
on clean supersede, and **preserved** through compaction. `keyOf` is single-source-of-truth (exported), killing the
space-vs-NUL separator mismatch that originally made `subconsciousView` miss contested claims.
