# YURI Filing System — Verification & Residual Risk

**Date:** 2026-06-11
**Build:** Assessor (expanded) + Dependency Scanner (new) + Mutator (new) + 2 hooks
**Status:** BUILT & TESTED. Batch execution NOT performed — owner-gated (see the dry-run plan).

---

## What was built

| File | Action | Role |
|---|---|---|
| `_SYSTEM/Scripts/filing-assessor.mjs` | expanded 8 → 26 zone rules | classify artifact → canonical zone; PINNED anchors; SETTLED suppression; `fileType` |
| `_SYSTEM/Scripts/filing-assessor.test.mjs` | expanded 23 → 73 tests | classification, anti-poaching, pinned, settled, fileType |
| `_SYSTEM/Scripts/filing-deps.mjs` | **new** | scan 16 reference layers for a file; risk classification; `exactPathRefs` |
| `_SYSTEM/Scripts/filing-deps.test.mjs` | **new**, 44 tests | layer bucketing, risk, live git-grep smoke |
| `_SYSTEM/Scripts/filing-mutator.mjs` | **new** | plan + execute moves; refs-before-move; conservative token rewrite; rollback |
| `_SYSTEM/Scripts/filing-mutator.test.mjs` | **new**, 40 tests | token safety, plan refusals, dry-run, hard guards |
| `.claude/hooks/filing-gate.mjs` | **new** | PreToolUse advisory (Write\|Edit) — warns on wrong zone, never blocks, fail-open |
| `.claude/hooks/filing-ledger.mjs` | **new** | PostToolUse ledger → `_SYSTEM/state/filing-ledger.jsonl`, fail-open |
| `.claude/settings.json` | registered both hooks | filing-gate in PreToolUse `Write\|Edit`; filing-ledger in PostToolUse `Write\|Edit\|MultiEdit` |
| `_SYSTEM/reports/filing-sweep-dryrun-2026-06-11.md` | **new** | the owner-review relocation plan (148 candidates) |

## Checks run (all from local evidence — no model inference)

- `filing-assessor.test.mjs` → **73 passed, 0 failed**
- `filing-deps.test.mjs` → **44 passed, 0 failed**
- `filing-mutator.test.mjs` → **40 passed, 0 failed**
- **End-to-end execute proof** (self-contained, reversible fixture): **9/10 passed**. The single non-pass is a
  test-fixture artifact, not a defect: the fixture was `git add`ed but never committed, so `git mv` moves the
  staged entry and git reports add-at-new-path rather than a rename. `git mv` (history-preserving for committed
  files) **was** exercised via the `isTracked()` path. The load-bearing properties all passed:
  - references rewritten BEFORE the move (prose mention + markdown link)
  - the conservative token rewrite did NOT corrupt a longer sibling (`<path>.bak` left intact) — on real disk
  - zero stale standalone refs remained after the move
  - `rollbackFrom` commit hash recorded
  - working tree restored exactly (no fixtures left behind)
- Hook smoke tests: advisory fires on misplaced, silent on placed/pinned/non-write/malformed (fail-open);
  ledger appends + advises on misplaced, and does NOT log protected paths (0 leaked).
- `settings.json` re-validated as parseable JSON after both edits.

## Verification method for the owner-gated batch (run after each executed tier)

```bash
# after executing an approved tier of moves:
ai reindex                              # refresh FTS5 over the new paths
npx gitnexus analyze --skip-agents-md   # refresh the code-intelligence index
# zero-stale-ref proof — must print NOTHING for every moved <old/path>:
git grep -nF -- "<old/path>"
# rollback if a tier misbehaves (each executeMove prints rollbackFrom):
git revert <rollbackFrom>..HEAD
```

The mutator already self-verifies inline: it aborts a move (and restores every edited host) if any reference
cannot be safely rewritten, so a move only completes when its host files are stale-ref-free.

---

## Sweep result (dry-run, owner reviews before execution)

148 move candidates · 262 references the mutator would rewrite · **60 LOW · 79 MEDIUM · 6 HIGH · 3 CRITICAL** ·
0 structural-graph-node moves · 0 protected-host writes · 22 plans with basename-only refs (manual review) ·
6 EPHEMERAL purge candidates. Full table: `filing-sweep-dryrun-2026-06-11.md`.

The first scan reported 467 misplaced; **313 were false positives** — keyword/extension rules firing repo-wide
and poaching correctly-placed files (provider shims `.claude/skills/*/SKILL.md`, agent recipes `.agents/`,
slash-command defs `.claude/commands/research.md`, nested research project data, KB bundles, co-located
scripts). The fix added SETTLED suppression (curated homes + any top-level dotdir) and tightened the
ext/keyword `_SYSTEM` rules to fire only on genuinely-loose root files. 1345 files are now correctly recognized
as settled. This is the single most important correction in the build.

---

## Residual risk (named honestly)

1. **Basename-only references are NOT auto-rewritten (22 plans).** Relative imports (`./foo.mjs`) and asset
   `src` attributes reference a file by bare basename, which is not a safe exact-string replacement. The mutator
   flags these (`basenameOnly`) for MANUAL review and refuses to auto-rewrite them. For the 22 affected plans,
   the owner must hand-check relative imports before executing. This is a deliberate safety choice (under-rewrite
   + flag, never corrupt).

2. **git grep sees only tracked + untracked-non-ignored files.** A reference living in a git-ignored file is
   invisible to the scanner and would become stale after a move. Mitigation: the post-move `git grep` verify is
   also tracked-scoped, so this gap is consistent; ignored-file refs are out of scope by design.

3. **History preservation requires a committed source.** `git mv` preserves history only for committed files.
   Untracked loose files (many of the candidates are untracked `??`) fall back to `fs.rename` — the move works
   but there is no prior history to preserve. Flagged, not a defect.

4. **Three graph files, one spine.** Only `02_RESOURCES/RESEARCH/yuri-circuitry-graph.json` carries
   `nodes[].files[]` (the file→node spine, 117/118 nodes). `_SYSTEM/yuri-graph.json` (240 nodes) and
   `yuri-graph-state.json` (126 nodes) key by id/label with ZERO `files[]` — the design's "347 graph refs in
   `_SYSTEM/yuri-graph.json`" was misdirected. The scanner parses the RESEARCH graph structurally and
   text-greps all three; after any graph-referenced move, run the graph projector/reindex.

5. **Conservative token rewrite skips `/`-prefixed and `.`-continued occurrences.** To avoid corrupting longer
   sibling paths, the rewrite only touches a path token delimited by non-path characters. Absolute-path refs
   (`/Users/.../repo/_SYSTEM/x.md`) and `./`-prefixed refs are intentionally left, and the move ABORTS if such a
   standalone ref can't be rewritten. Bias: under-rewrite + abort, never silent corruption.

6. **Lane writes bypass the hooks.** Codex/DeepSeek dispatched agents write files outside Claude's tool harness,
   so the filing-gate advisory and filing-ledger never see those writes. Catching them needs lane-level
   integration (future work). The batch sweep still relocates them once they land.

7. **Reindex latency window.** Between executing moves and running `ai reindex` + `npx gitnexus analyze`, xref
   and structural navigation return stale results. Mitigation: batch all moves in a tier, then reindex once.

8. **SETTLED is a heuristic bias toward NOT moving.** A genuinely-misplaced file nested inside a curated/dotdir
   home will not be flagged (e.g. a real research doc wrongly dropped into `.codex/`). This is the intended
   conservative bias — the sweep targets loose pools and never poaches curated homes. The owner can still move
   such a file manually via `filing-mutator.mjs <path> --zone <ZONE>`.

9. **6 EPHEMERAL `.bak` files are committed scratch.** They have no canonical home (purge candidates). The
   assessor surfaces them; deletion is an owner decision, not an auto-move.

10. **79 MEDIUM moves are sub-zone tidying** (e.g. report → reports/audits, report → reports/waves). These are
    reorganization within an already-correct parent zone — lower urgency than the loose-`_SYSTEM`-root relocations.

## Pinned / protected — what is NEVER moved (verified)

- The 3 @-include boot anchors (`_SYSTEM/yuri-origin.md`, `_SYSTEM/persona.md`, `SOUL.md`), root adapters
  (`CLAUDE.md`, `AGENTS.md`, `.claude/CLAUDE.md`), the graph/INDEX/README/HEARTBEAT files — PINNED, classified
  `kind: pinned`, `zone: null`, never misplaced, hard-refused by the mutator (`blockMove`). 13 pinned files held.
- Protected/secret paths (`.env`, `backend/data/`, `.claude/state/`, `.claude/history/`, `node_modules/`, …) —
  fail-closed veto in the assessor, inherited by the mutator (refuses protected source AND protected target),
  and excluded from ref-host writes by the scanner/mutator. The ledger never records them.

---

*All counts from live `git ls-files` + `git grep` + circuitry-graph parse. No model inference used for any
path, count, or classification.*
