# P7 correction + P4 barrel import-safety audit

**Date:** 2026-07-08 · **Commits:** `fe811c83` (P7 corpus), P4 barrels were `a04ca512`

## P7 — the plan premise was WRONG

02-DECISION.md P7 said: *"Move clean clusters — corpus/ (8 modules, 0 external static consumers)."*

**That is false.** `corpus-match.mjs` is load-bearing match infrastructure with **10 external static consumers**:

| Consumer | imports |
|---|---|
| `circuitry-auto-register.mjs` | buildIndex, matchPrefixFilter |
| `gpd-confirm-matcher.mjs` | loadFtsCorpus, buildIndex, matchPrefixFilter, matchLSH |
| `memory-match.mjs` | buildIndex, matchPrefixFilter |
| `yuri-match-adapters.mjs` | loadFtsCorpus |
| `yuri-match-global-space.mjs` (+ .test) | buildIndex, matchExact, matchPrefixFilter |
| `yuri-match.mjs` | buildIndex, matchPrefixFilter |
| `self-improvement/cross-reference.mjs` | buildIndex, matchPrefixFilter |
| `nexus-rs/conformance.test.mjs`, `nexus-rs/wasm-conformance.test.mjs` | buildIndex, matchExact, matchPrefixFilter |

Moving `corpus-match.mjs` would rewire the whole match subsystem (xref/BM25, memory, circuitry, GPD, nexus-rs conformance) — exactly the import-rewiring blast the refactor was designed to avoid.

**Resolution:** corpus is **barreled-only, not moved** — the same call `fleet` got. Added `_SYSTEM/Scripts/corpus/index.mjs` re-exporting the 3 API modules (`match`, `security-scan`, `threat-taxonomy`) **in place, zero moves, zero consumers touched.** The 5 export-less CLI tools/demos (absorb, categorize, merge-candidates, mine, match.collapse) are not barreled — discover them via `ls _SYSTEM/Scripts/corpus-*.mjs`.

**Also fixed** (surfaced by the barrel import test):
- `corpus-absorb`, `corpus-mine`, `corpus-security-scan` ran `main()` on import (no guard) → added the repo-standard `pathToFileURL(process.argv[1])` guard. CLI behavior preserved.
- Stale `corpus-absorb.test` assertion (expected old `.claude/skills/ →` display; module now prints `skills/ ->` per the SoT rename). Now 3/3.

## The bigger finding — ALL 13 P4 barrels break on import

P4 (`a04ca512`) created 13 cluster barrels but verified them with `node --check` (syntax) **only** — never an actual import. Import-testing all 13 (`import('./<cluster>/index.mjs')`):

| Barrel | On import |
|---|---|
| memory | runs a SCAN + `[DRY] keep` demo |
| nano | imports but **runs a .test suite** (INV-1/INV-2 assertions) |
| lanes | prints `Usage: lane-dispatch …` (CLI runs) |
| kagami | prints `Usage: kagami …` (CLI runs) |
| energy | prints a JSON trace summary (runs) |
| claims | runs a .test suite (sweep dry-run/armed) |
| filing | **runs 3 full test suites** (78+44+40 passed) |
| llm | prints `No NEW drift rows` (runs) |
| tokens | **FAILS** — native module (better-sqlite3) load + test |
| skills | runs a .test suite (GREEN/FAIL grades) |
| mcs | **FAILS** — needs env var; fault-injection harness runs |
| workers | runs a .test suite |
| fleet | runs benchmarks + mcp checks |

**Root cause:** the P4 barrels re-export `.test.mjs` files and export-less CLI/demo modules that execute on import. **They are decorative navigation indexes, not functional import surfaces** — no code can `import` a P4 barrel without triggering a cascade of side effects (tests running, CLIs printing, benchmarks executing, native-module crashes).

## Recommended follow-up phase (owner decision)

Apply the corpus pattern to all 13 P4 barrels:
1. Barrel **API-exporting library modules only** — exclude `.test.mjs` and export-less CLI/demo modules.
2. Add the `pathToFileURL` guard to any library module that runs `main()`/demo on import.
3. Verify each barrel with an **actual import**, not just `node --check`.

This is a real, bounded phase (~13 barrels). Not started — flagged for sign-off, because it retroactively reworks a committed phase and expands scope beyond the original 8.
