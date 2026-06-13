---
name: proj-alpha-factor-library-2026-06-13
description: Alpha Factor Library organ — design+validation done; PHASE 0 + PHASE 1 BUILT, RED-TEAMED & VERIFIED (FTS5 store + 60-factor corpus + backtest/scorer/organ-adapter); Phase 2 (quantum sequencing) next
metadata: 
  node_type: memory
  type: project
  tier: hard
  scope: afl-organ
  trig: "quant trading, alpha factor, factor library, AFL, factor circuit, quantum sequencing"
  refs: 
    - afl-organ-design-2026-06-13.md
    - afl-quantum-validation-2026-06-13.md
    - quant-trading-research-2026-06-13.md
  originSessionId: 7ce507aa-0657-4c74-8e6b-9cf4489ff64c
---

# Alpha Factor Library (AFL) — Organ Design Complete

GOAL: Build a persistent alpha factor library organ for YURI, wired into FTS5, with quantum-inspired factor sequencing optimization. Personal trading use (Coinbase Base + Polymarket). Treat as nano-swarm dispatch work.

WHO: Marcel (owner), Rick/Claude (lane), 7-agent nano-swarm (5 research + 1 Opus synthesis + 1 Opus validation)

WHEN: 2026-06-13 — design + validation complete, Phase 0 build pending

WHERE: Design docs in `02_RESOURCES/RESEARCH/afl-organ-design-2026-06-13.md` + `afl-quantum-validation-2026-06-13.md`; research in `quant-trading-research-2026-06-13.md`

STATE: PHASE 0 BUILT & INDEPENDENTLY VERIFIED 2026-06-13 (UNCOMMITTED). Storage layer live: `_SYSTEM/OS_KERNEL/alpha-factors-schema.sql` (6 tables, FTS5 external-content + porter, AFTER I/U/D triggers, updated_at touch, FK CASCADE, WAL) → `_SYSTEM/OS_KERNEL/alpha-factors.db` seeded with 60 factors (cats 12/10/8/8/6/5/5/4/2; crypto=49, polymarket=15; integrity_check ok). Organ dir `_SYSTEM/Scripts/alpha-factor-library/`: `alpha-factor-store.mjs` (10 exports: openDb/getFactor/listFactors/searchFactors/upsertFactor/recordPerformance/getPerformance/addLineage/getLineage/getAncestors — prepared stmts, injection-safe, bm25 2.0/1.5/1.0, depth<64 cycle guard, falsy-0 preserved), `seed-corpus.mjs` (idempotent upsert seeder), `factor-seed-data.json` (60 factors, fidelity-audited vs taxonomy = 0 mismatches). xref-query.mjs `passAlphaFactors` (PASS 1b, fail-soft) wired → 28 factors surface for "momentum reversal crypto factor". capability-scan.mjs DIRS extended to scan the organ subdir; registry 39→43 (2 mine: alpha-factor-library + alpha-factor-library-seeder; +2 pre-existing stale: nano-doc-assembler/nano-swarm-supervisor). All 4 design tests PASS (FTS search, lineage CTE, perf round-trip, xref surfacing). Regression: xref-query 1/1, xref-provenance 31/31, xref-drift-scan 34/34, loopback-capability 2/2 green; xref-navigation 1 RED = PRE-EXISTING gitnexus-index-behind-HEAD staleness (not mine). Build dispatched via native Workflow (wf_289176fc-8f8): 2 builder agents + 3 adversarial auditors (seed-fidelity/store-correctness/seeder-safety all PASS). Two CRITICAL gaps STILL OPEN (data quality poisoning, regime shift) — Phase-3 blockers, untouched.

STATE (Phase 0 red-team + Phase 1) 2026-06-13, UNCOMMITTED: A recon nano-swarm (wf_cf70c4ec, 7 agents) red-teamed Phase 0, ground it in fresh online+local research (3 docs in 02_RESOURCES/research/afl-grounding-*; reindexed), and VERIFIED every organ signature Phase 1 imports. Red-team fixes SHIPPED to the store/schema: schema CHECK constraints (status/category/0-1 flags/sharpe_tier) + DB rebuilt&reseeded; `updateFactor(id,patch)` partial-patch (the full-upsert data-loss trap); lineage CTE UNION+MIN(depth) (diamond-DAG explosion); unicode tokenizer; strict 0/1 bool coercion; xref dedicated 📈 ALPHA FACTORS lane (alpha hits were drowned in the global top-N). 19/19 fix checks + xref regression green.
  CRITICAL compat finding: the AFL DESIGN DOC's organ signatures were WRONG — Phase 1 built against the VERIFIED ones instead: gateProposal needs {stateBefore,stateAfter} (design's {before,after} throws), accept at .result.accept; assessClaim needs {nowMs}+claim{claimedStatus,evidence:[{kind,capturedAt}]} (design shape self-RETRACTS); confidenceDecay takes ONE object not 3 positional; sequentialDecide needs array/genfn not scalar; yuri-fsrs export is `retrievability` not the design's phantom `fsrsRetrievability`; and prediction-ledger DEFAULTS to _SYSTEM/state/prediction-ledger.jsonl which yuri-homeostat reads as YURI's self-model → Phase 1 MUST pass {file: AFL_LEDGER} every call.
  PHASE 1 SHIPPED (built via wf_c02d3080, against verified sigs): `afl-organ-adapter.mjs` (factor↔claim-cortex/energy/prediction-ledger/truth-maintenance; status→real ladder rung map avoiding self-RETRACT; promotes via gateClaimTransition; AFL_LEDGER homeostat-isolation hardcoded — default ledger sha256 byte-identical, proven non-vacuous), `factor-evaluator.mjs` (backtestFactor annualize√365, temporalSplit=chronological NOT random-shuffle/leakage, deflatedSharpe=Bailey&LdP False-Strategy-Theorem, benjaminiHochberg FDR fleet gate, factorPromotionGate), `factor-scorer.mjs` (factorQualityScore composite 0.35sharpe+0.25(1-brier)+0.20retrievability+0.20diversification). afl-phase1.test.mjs 9/9 green; 3 adversarial audits PASS (signatures/homeostat-isolation/math); organ deps green on HEAD (claim-cortex 67, pred-ledger 6, eval 11, energy 31, tms 10). registry 50 (5 AFL caps). AFL ledger cleaned to 0 rows. Research key facts: eval-processing had NO family-wise error control (FM-4) → DSR+BH added; heldOutSplit random-shuffle = look-ahead leakage → temporalSplit; the 2 CRITICAL gaps buildable from existing cusum/scalarKalman/pearson primitives.

PHASE 2 SHIPPED (the MOAT) 2026-06-13, MULTI-LANE peer-reviewed (Claude+Mimo+DeepSeek): `factor-circuit.mjs` (18 exports) — factorVector (deterministic metadata embedding, N=16; Phase-3 swaps in real return vectors), commutatorNorm (Frobenius ‖AB−BA‖), buildCommutativityMatrix (+ allCommute degenerate guard), lehmerDecode (+NaN guard), sampleOrderings (phi/Lehmer, single-stream), robustOptimalOrdering (CE over ordering×ψ-angle), buildCircuitDAG (acyclic, parallel-commuting), cornerGuard (dense periodic worst-case scan), flipConditions, schmidtCoupling (honest joint-state rank), circuitQuality (ratio 16.16× via meanOrderingScore baseline), recordCircuitEnergy (tickAndTrace ΔU), optimizeFactorCircuit (degenerate short-circuit per validation FM-1). afl-phase2.test 17/17; built via wf_621728ee. Claude swarm caught+fixed 3 bugs (circuitQuality incommensurable baseline; schmidtCoupling hardcoded-diagonal→always-entangled; cornerGuard periodic-vertex-vacuous→dense-scan). Mimo+DeepSeek PEER review (the new multilane methodology, see [[feedback-multilane-peer-swarms]]) independently CONFIRMED all 3 fixes + found 6 more: DeepSeek MEDIUM (nullValue used orderings[0] not explicit identity — FIXED) + Mimo 5 LOW (lehmerDecode NaN guard FIXED, sampleOrderings single-stream FIXED + at-most-min contract doc; meanProjectorScore diagnostic + degenerate quantumScore=classical ratio-exactly-1 ACCEPTED-documented). registry 51 (quantum-factor-sequencing). DeepSeek=deepseek-v4-pro, Mimo=MiMo-v2.5-pro both verified live peers.

CRITICAL GAPS SHIPPED (Phase-3 prereq #1 DONE) 2026-06-13, MULTI-LANE peer-reviewed (Claude+Mimo+DeepSeek, 2 rounds): `data-quality-gate.mjs` (FM-3: validateBar/validateSeries/dataQualityGate — deterministic hard-rejects incl non-positive-price, robust MAD-scale Kalman-NIS outlier flags, fail-CLOSED incl Kalman-error veto) + `regime-detector.mjs` (FM-5: detectChangePoint TWO-SIDED + volatilitySignal first-diff + correlationDrift sign-flip+L∞ + commutativityRegimeShift dim-change-forces-recompute + detectRegimeShift composite). Composes existing primitives (scalarKalman/cusum/pearson/median — capability-first, none rebuilt). afl-critical-gaps.test 35/35 (incl 8 RED-GREEN safety regressions); built wf_8e572932. SAFETY bugs caught+fixed: Claude swarm 1 CRITICAL (one-sided cusum blind to crashes)→two-sided; then peer round found 2 HIGH (Kalman r self-masking→MAD; fail-OPEN crash→try-catch fail-closed) + my-own-fix bug (volatilitySignal raw-stddev was level-not-change→first-diff, Mimo caught) + dim-mismatch + non-positive-price + NaN-inoperative. registry 53. Full AFL suite green: phase1 9 + phase2 17 + gaps 35 = 61.

NEXT: Phase 3 = venue adapters (coinbase-adapter.mjs + polymarket-adapter.mjs + portfolio-abstract.mjs + data-ingest.mjs + signal-generator.mjs), ADVISORY ONLY. Prereq #1 (2 critical gaps) DONE. Prereq #2 REMAINS — apply venue-API corrections before adapters: Coinbase Ed25519 + portal.cdp.coinbase.com + dynamic rate limit; Polymarket py-clob-client ARCHIVED 2026-05-11 + fees≠0% tiered≤1.75% + neg-risk market type. WIRING TODO (gaps built but not yet wired into the pipeline): data-quality-gate gates ingested bars BEFORE factor computation; regime-detector runs each window post-circuit → recommendation RECOMPUTE_CIRCUIT. blockchain-query app-extension = onchain-data candidate (app-side, not CLI-wireable). Phase 4 = live owner-gated 30-day soak. Phase-1 gotchas still open: sharpeToStrength uncalibrated; gateClaimTransition L∞ caps at defaults.

SEE: [[ref-simulation-arsenal]] for quantum sim + decision-sim primitives used; [[fb-max-reasoning-fleet-override]] for "max reasoning" dispatch; [[feedback-all-dispatch-through-llm-compat]] for lane routing

## Key Findings (from quantum validation)

- **1,134,061× best/worst ordering ratio** — quantum sequencing is REAL and MASSIVE
- **Only 11% of factor pairs commute** — quantum engine active for ~89% of pairs
- **Phi-sequence sampling beats random** (rank 6 vs 7 with 25% search space)
- **Cross-entropy optimizer** finds top-10 orderings in 5 iterations
- **CRITICAL gap 1:** No data quality validation layer — one corrupted bar poisons everything
- **CRITICAL gap 2:** Regime shift detection missing — drawdown breaker misses correlation shifts
- **5 failure modes attacked and documented** in validation report

## Build Phases (nano-swarm dispatches)

| Phase | What | Swarm lane | Blocker |
|-------|------|-----------|---------|
| 0 | Seed corpus + FTS5 storage | Native Agent | None |
| 1 | Factor evaluation + backtesting | Native Agent + decision-sim | Phase 0 |
| 2 | Quantum sequencing engine | Native Agent + quantum-sim | Phase 1 |
| 3 | Venue adapters (advisory only) | llm-compat/mimo | Phase 2 + data quality gate |
| 4 | Live execution (paper→live) | llm-compat + owner gate | Phase 3 + 30-day soak |

## Trading Venues

- **Coinbase (Base):** API connection confirmed viable. Advanced Trade API — REST + WebSocket, 30 req/s rate limit, sandbox available.
- **Polymarket:** CLOB API, 0% trading fee, Polygon chain. Geo-blocked for US persons (hard constraint). Read-only public data accessible without auth.

## YURI Integration Points

- Cross-domain transfer engine = alpha factor discovery
- Energy gate + L∞ veto = drawdown circuit breaker (same Lyapunov math)
- Golden section / Fibonacci search = strategy parameter tuning
- Swarm orchestration = parallel backtesting + ensemble strategies
- Claim-evidence ledger = P&L attribution
- Decision simulation = scenario analysis under market uncertainty
- Quantum hypothesis simulation = factor commutativity analysis (NON-COMMUTING OPERATORS)
- Phi-sequence = anti-correlated sampling of factor combination space

## Phase 3 — on-chain data options (owner directive 2026-06-13: "keep it in mind")

- `blockchain-query` Claude **app extension** (desktop/web, NOT the CLI surface — invisible to Claude Code sessions; confirmed via ToolSearch). Enabled but tool-permission = **Blocked** (37 read-only tools, inert until flipped to Ask/Allow). Read-only on-chain query surface (wallet balances, token holdings, txns, contract reads, multi-chain) — the right shape for AFL's value/quality CRYPTO SUBSTITUTES (TVL/MCap, fee revenue, staking yield, holder distribution, funding rate, whale flow). CANNOT be wired into the AFL organ code (app-side, different surface); for the CLI organ, on-chain data must come via Phase-3 venue adapters or a YURI-native ingest. Candidate reference only.
- Venue-API research corrections (afl-grounding-venue-apis doc) supersede design §5: Coinbase auth = Ed25519 (EC/ES256 deprecation-warns), key portal moved to portal.cdp.coinbase.com, rate limit dynamic not fixed-30/s; Polymarket py-clob-client ARCHIVED 2026-05-11, fee model NOT 0% (tiered up to ~1.75% crypto), neg-risk market type new. Fix these before Phase 3 adapters.
