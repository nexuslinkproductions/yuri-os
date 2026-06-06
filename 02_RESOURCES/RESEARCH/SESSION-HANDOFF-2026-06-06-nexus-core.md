---
name: session-handoff-2026-06-06-nexus-core
description: NEW-SESSION HANDOFF — the NEXUS CORE math substrate (transfer-distance + matching engine + collapse fix) is built, 2-round red-teamed, committed+pushed. Read this FIRST to continue at pace. Contains read-order, current state, verify commands, queued work, residuals.
metadata: { node_type: handoff, date: 2026-06-06, status: active, commit: a2cf794e+ }
tags: handoff, nexus_core, math_engine, continue_here
---

# SESSION HANDOFF — 2026-06-06 → next session (NEXUS CORE math substrate)

> Marcel's directive: heavy building continues in a NEW session at this pace. This is the single entry point. The math/science substrate is the most crucial core in YURI; Marcel wants it renamed **NEXUS CORE** (ties to Nexus Link) — see queued work.

## ⚡ READ-ORDER (read these first, in order — the read-hints)
1. **THIS handoff** — current state + what's next.
2. `02_RESOURCES/RESEARCH/MATH-SCIENCE-MANUAL.md` — the LIVING dock-on guide to every math method (registry + principles + advisory limits). **The map of the substrate.**
3. `02_RESOURCES/RESEARCH/transfer-distance-engine-v2-build-plan-2026-06-06.md` — the build plan + BUILD STATUS log.
4. `02_RESOURCES/RESEARCH/sources/science-source-ledger.md` — cited papers (indexed, `ai search`-able).
5. `02_RESOURCES/RESEARCH/math-primitive-candidates-parking.md` — PARKED future work (π/φ/Fib, NEXUS CORE rename, the OSS watermark).
6. The code (all in `_SYSTEM/Scripts/`): `math/transfer-distance{,-cores}.mjs`, `math/yuri-{minhash,token-expand,jaccard}.mjs`, `corpus-match.mjs`.

## WHAT'S BUILT + COMMITTED (commit a2cf794e on main, pushed; re-fire follow-up committed after)
Two engines forming the cross-reference spine, both research-grounded + 2-round red-teamed (0 criticals):
- **Transfer-distance** (distance BETWEEN domains): `scoreTransferV2(t)` — field-distance × mechanism-frame bridge × structuralConf, fail-closed gate, + **implementation-viability (prerequisite→BLOCKED) gate**. Proof 6/6 ship-config.
- **Matching engine** (complete candidates WITHIN a corpus): `corpus-match.mjs` — MinHash/LSH + **prefix-filter exact join (complete + sublinear, 100% recall)**, beats FTS5 top-N. Corpus-agnostic. Proven on 9,487 bug-bounty reports.
- **Tokenization-collapse fix**: `yuri-token-expand.mjs` — Expanded Feature Jaccard (tok+c4+PPMI-sem), embedding-free, keeps prefix-filter complete.

## VERIFY (run from repo root — all should be green)
```
node _SYSTEM/Scripts/math/transfer-distance.test.mjs       # 21/21
node _SYSTEM/Scripts/corpus-match.test.mjs                 # 27/27
node _SYSTEM/Scripts/math/transfer-distance.proof.mjs      # 6/6 (A-F, ship config)
node _SYSTEM/Scripts/math/transfer-distance.bakeoff.mjs    # WINNER V2.1-field+mechFrame
node _SYSTEM/Scripts/corpus-match.collapse.mjs             # COLLAPSE FIXED
# truth-set regen: node _SYSTEM/Scripts/math/extract-logbook-truth.mjs > _SYSTEM/Scripts/math/logbook-truth.json
```

## RED-TEAM RESULT (2 rounds + a test-attack round)
- Round 1: 8-attacker fleet → ~18 findings fixed. Round 2: 3 Codex + 1 DeepSeek → fieldClassify cluster + NaN/cap guards + the viability gate. Test-attack round (mutation testing): IN FLIGHT at handoff time — **check `/tmp/ta-*.out` + agent results; fold any surviving-mutant / vacuous-assertion findings.**
- Core math independently re-confirmed sound: prefix-filter completeness (2400/2400 prefix==exact), MinHash unbiased + a∈[1,p−1], PPMI correct, no FTS5-query injection / ReDoS.
- **Advisory limit (documented, do not over-trust):** transfer-distance scores structural-similarity; the prerequisite gate catches STATED blockers; non-prereq instance inversions remain (median-validated). See manual's ADVISORY section.

## QUEUED (next-session work, priority order)
1. **Close the test-coverage gaps (test-attack round, DeepSeek + Codex + 2 mutation agents).** This session HARDENED the weak/vacuous assertions found (corpus `<=N`→`<N`+complete; LSH count→subset; wrong-mechanism `>=`→`>`; proof F now load-bearing on the viability gate; +3 prereq unit tests). **STILL TO ADD (DeepSeek top-5):** (a) `yuri-minhash.test.mjs` — all 5 exports + determinism + modAffine edge (a=2^31−2, x=2^32−1); (b) `yuri-token-expand.test.mjs` — all 9 exports (charShingles morphology, PPMI, features namespacing); (c) SQL `ident()` injection test via `loadFtsCorpus` malicious idCol/table; (d) `PREREQ_BLOCKER_RE` barrage — one hit + one negative-control per branch incl. over-fire ("does not exist in a vacuum", "trust must be built first"); (e) `MAX_TOKENIZE_CHARS` oversized-input truncation test. ALSO fold the 2 mutation agents' surviving-mutants. The mutation-test method (break impl → confirm test goes red) is the standing way to find false-negative tests.
   - **Math-engine mutation agent: 13 surviving mutants found.** FIXED this session (added unit guards): M5 (invert gate `apply` → silent no-op), M3 (BRIDGE_FLOOR→0), M1 (bridge min→max), M8 (wrong-mechanism recon leak, abs floor), M2 (clamp assertions were vacuous → now assert `valueRaw`), M28 (CAP_PREREQ value → proof F now asserts value≤0.12). STILL TO ADD: M6 (`tierOf` exact-boundary), M12 (fieldClassify tie — pin cards 12/29/34 to their fields), M13/M14/M16/M18 (yuri-jaccard `load`/threshold/tokenize-length boundary asserts), M23/M25 (`ppmi(a,a)===0`, `makeHashes(0)` throws — in the new minhash/token-expand test files), M26 (prereq regex misses 4 phrasings: "needs an unbuilt X before"/"we have not created"/"cannot be implemented until"/"blocked by the lack of" — decide block-vs-pass).
   - **corpus-match mutation** could NOT run in scratch (needs `better-sqlite3` from protected node_modules) — run it IN-PLACE (git-stash-restore) next session.
2. **NEXUS CORE rename** (owner directive) — rename `_SYSTEM/Scripts/math/` surface → NEXUS CORE; separate the math engine from the research DB; staged + continuity-law (graph/registries/docs in one motion). See parking 2a.
3. **Steganographic OSS watermark** (owner directive) — deep research; Fibonacci-encoded "Marcel Spatz · Nexus Link" provenance across the code. See parking 2b for grounding.
4. **2nd-order synonym (Reflective Random Indexing)** — the true never-co-occur synonym bridge for token-expand (1st-order PPMI + morphology shipped).
5. **Wire transfer-distance into `cross-reference.mjs`** — OWNER-GATED (live self-improvement code).
6. **The math/science improvement lineup** — prioritized YURI nodes/mechanisms improvable via math/science (π/φ/Fib parked).
7. **Generalize the matcher** onto memory/code/the main corpus via the `{id,text}` adapter.

## HOUSEKEEPING / GOTCHAS
- **GitNexus index is STALE** (last c44a54e) — run `npx gitnexus analyze --skip-agents-md` early.
- Lanes are LIVE + equipped: `node _SYSTEM/Scripts/llm-lane.mjs <deepseek|kimi|nemotron> "..." --context <files>` · Codex via `codex-offload-runner.mjs ... --sandbox read-only`. Kimi is loop/429-prone for code — keep its tasks tightly scoped. NEVER wrap a lane in shell `timeout`.
- Release target: **YURI OSS on GitHub in ~1.5–2 weeks**. The compounding math/science corpus is the moat — keep capturing sources to the ledger + `ai reindex`.

## THE METHOD (Marcel, standing) — keep this pace
Tight feedback loop: build → adversarial red-team (fleet) → fix → re-test → improve, each pass sharpening the input. "Work that takes 33 years can be cut to months." Fast iterations + improvements + testing. Every paper/source → the ledger + reindex so it compounds.
