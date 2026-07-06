# AFL Session Handoff — 2026-06-13

## What happened this session

Marcel asked for quant trading research. A 7-agent nano-swarm (5 research + 1 Opus synthesis + 1 Opus validation) designed a complete **Alpha Factor Library (AFL) organ** for YURI, validated it with quantum simulations, and adversarially attacked the design.

**All 5 validation tests PASS. Two CRITICAL gaps identified and documented.**

## What was produced

| Artifact | Path | Status |
|----------|------|--------|
| Quant trading research synthesis | `02_RESOURCES/RESEARCH/quant-trading-research-2026-06-13.md` | DONE |
| AFL organ design (full 8-section spec) | `02_RESOURCES/RESEARCH/afl-organ-design-2026-06-13.md` | DONE |
| Quantum validation report (5 tests + adversarial) | `02_RESOURCES/RESEARCH/afl-quantum-validation-2026-06-13.md` | DONE |
| Session handoff (this file) | `02_RESOURCES/RESEARCH/afl-session-handoff-2026-06-13.md` | DONE |
| Track A memory | `~/.claude/memory/proj-alpha-factor-library-2026-06-13.md` | DONE |

## What to do next — Phase 0 Build

**Phase 0 is safe. No trading, no risk, pure infrastructure.**

### Step 1: Read the design doc
```
read 02_RESOURCES/RESEARCH/afl-organ-design-2026-06-13.md
```

### Step 2: Read the validation report (especially the 5 failure modes)
```
read 02_RESOURCES/RESEARCH/afl-quantum-validation-2026-06-13.md
```

### Step 3: Build Phase 0 (dispatch through native Agent workflow)

Phase 0 deliverables:
1. `_SYSTEM/OS_KERNEL/alpha-factors-schema.sql` — SQLite DDL (factors table + FTS5 virtual table + performance_log + lineage)
2. `_SYSTEM/OS_KERNEL/alpha-factors.db` — created by running the DDL
3. `_SYSTEM/Scripts/alpha-factor-library/` — organ directory with:
   - `alpha-factor-store.mjs` — CRUD operations (getFactor, listFactors, searchFactors, upsertFactor, recordPerformance, getLineage, getAncestors)
   - `seed-corpus.mjs` — script to insert all 60 factors from the taxonomy in the design doc
4. `@capability: alpha-factor-library` annotation on the store module
5. Run `node _SYSTEM/Scripts/capability-scan.mjs` to regenerate capabilities.json
6. Add xref integration: `passAlphaFactors()` function in xref-query.mjs

### Step 4: Verify
- FTS5 search returns relevant factors for "momentum reversal crypto"
- Lineage CTE traversal works for multi-level derivation chains
- Performance log append + query round-trips
- xref-query surfaces alpha factors alongside code hits

### Step 5: Commit gate
- No commit without explicit owner approval
- Working tree chronically dirty — reconcile drift before committing

## Key design decisions (locked)

1. **AFL is a YURI organ**, not a standalone library. It wires into: cross-domain transfer engine, energy gate, claim-evidence ledger, quantum hypothesis simulation, phi-sequence, decision simulation, swarm orchestration.
2. **Quantum sequencing is the moat.** 1.1M× best/worst ordering ratio. Only 11% of factor pairs commute. This is real.
3. **Advisory mode until Phase 4.** Phases 0-3 produce signals and recommendations, never execute trades.
4. **Phase 4 is owner-gated.** Requires `YURI_LIVE_TRADING=1`, owner approval per trade, 30-day paper trading soak.
5. **Two CRITICAL gaps must be fixed before Phase 3:** data quality validation layer + regime shift detector.
6. **Coinbase (Base) API viable.** Polymarket viable but geo-blocked for US persons.

## What NOT to do

- Do NOT start Phase 3 (venue adapters) before fixing the two CRITICAL gaps
- Do NOT build live execution (Phase 4) without 30-day paper trading soak
- Do NOT skip the quantum sequencing engine (Phase 2) — it's the whole point
- Do NOT dispatch through raw `mimo.mjs` — use llm-compat or native Agent workflow
- Do NOT commit without explicit owner approval

## Related memories

- [[ref-simulation-arsenal]] — quantum sim + decision-sim primitives used in validation
- [[fb-max-reasoning-fleet-override]] — "max reasoning" = pin fleet to Opus
- [[feedback-all-dispatch-through-llm-compat]] — ALL dispatch routes through llm-compat
- [[proj-nano-swarm-fabric-2026-06-13]] — nano-swarm architecture (Phase 0-2 built)
- [[feedback-affine-objective-enumerate-corners]] — corner-law guard for factor combinations

## RESULT_LABEL

`AFL_SESSION_HANDOFF_2026-06-13_X_PASS`
