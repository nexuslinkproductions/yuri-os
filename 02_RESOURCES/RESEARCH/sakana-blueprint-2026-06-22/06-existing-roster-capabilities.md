# YURI Legacy Agent Roster & Capabilities Inventory

**Generated:** 2026-06-22  
**Scope:** Legacy `.claude/agents/*.md` + `_SYSTEM/capabilities.json` + fleet seam  
**Purpose:** Inventory what YURI already has before building Sakana role-engine

---

## Part A: Legacy Agent Roster (12 Archetypes)

| Name | Purpose (1-line) | Model | Core Capability |
|------|------------------|-------|-----------------|
| **ARCHITECT** | System architecture & integration review | deepseek-v4-pro | staged implementation, coherence, blast-radius checks |
| **SECURITY-REVIEWER** | Security boundary & sandbox review | deepseek-v4-pro | permission audit, prompt-injection defense, rollback validation |
| **DOC-CLEANER** | Markdown normalization & doc repair | qwen2.5:7b | heading/table/structure cleanup, preserve intent |
| **MEMORY-CURATOR** | Persistent memory review & promotion gate | deepseek-v4-flash | duplication/contradiction detection, fact extraction, poison-resistance |
| **LOG-SUMMARIZER** | Session log & error trace compression | qwen2.5:7b | error extraction, pattern grouping, unresolved-question capture |
| **FILE-INVENTORY** | Directory structure & ownership mapping | qwen2.5:7b | entrypoint detection, duplicate finding, responsibility assignment |
| **DESIGN-ARTIST** | Visual design execution (HUD/Kagami tokens) | claude-sonnet-4-6 | token namespace routing, component-catalog selection, implementation dispatch |
| **DESIGN-EXTRACTOR** | Component code extraction & catalog building | claude-haiku-4-5-20251001 | shadcn registry fetch, verbatim source, token/motion specs |
| **ARGUS** | Logic scout & reasoning error detector | native_function | deterministic local evaluator, PostToolUse scout findings |
| **OBLITERATUS** | Adversarial QA & promotion gate (red team) | native_function | pre-promotion red-team, blast-radius analysis, exploit-path detection |
| **NOESIS-LINTER** | Contradiction detection & rule consolidation | qwen2.5:7b | semantic scan, redundancy merge, aversion-memory audit |
| **YURI-RISK** | Destructive action & consequence predictor | deepseek-v4-flash | multi-step data-loss patterns, indirect destruction, git-history corruption |

### Notes
- **Native function** agents (ARGUS, OBLITERATUS) are deterministic local evaluators, NOT model-backed.
- **Design agents** read `_SYSTEM/DESIGN.md` v2 + component-catalog-2026 + `design-memory.json`.
- **Memory gate** (MEMORY-CURATOR) feeds into canonical-memory promotion pipeline.
- **Risk scout** (YURI-RISK) is a background checker for destructive/irreversible operations.

---

## Part B: Core Capabilities for Role Engine (~20 Most Relevant)

### Governance & Self-Governance

| ID | Serves | Reuse For |
|----|--------|-----------|
| **energy-gate-scoring** | U composite (entropy, staleness, violations) | role-readiness weighted scoring, constraint weighting |
| **nano-self-refresh** | per-nano self-sync (git HEAD, peer decisions) | role-state rollup, cursor advance after peer input |
| **nano-spawn-governance** | recursive exoskeleton nanoswarm governer | role-spawning recursion, depth/cost bounds |
| **swarm-convergence** | loop-until-converged 3-layer gate + damping | role-ensemble done-check, adversarial red-team |

### Decision & Prediction

| ID | Serves | Reuse For |
|----|--------|-----------|
| **trade-decision-sim** | CVaR-robust sizing, order-optimal sequencing | role-tier decision, priority-ordering, risk allocation |
| **energy-outcome-deriver** | gate-verdict → prediction-ledger | role-outcome recording, Brier calibration |
| **filing-canonical-bridge** | filing decision → canonical-truth claim | role-assignment → persistent audit trail |

### Dispatch & Fleet

| ID | Serves | Reuse For |
|----|--------|-----------|
| **run-swarm-orchestrator** | governed loop (GLM substrate) | role-ensemble orchestration, round-loop control |
| **glm-fleet-dispatch** | parallel GLM fan-out (4-attempt retry) | role-peer parallel dispatch, concurrency-bounded |
| **nano-dispatch-seam** | recursive nanoswarm dispatch | role-recursive spawn, work-item routing |
| **nano-dispatch-async-pool** | concurrent pool-bounded dispatch | role-parallel batch, async collection |

### Scoring & Matching

| ID | Serves | Reuse For |
|----|--------|-----------|
| **afl-factor-scorer** | Brier/entropy/confidence composite | role-capability scorer, factor quality ranking |
| **afl-organ-adapter** | factor → claim-cortex, energy-gate, JTMS | role-model integration, claim lineage, retraction cascades |
| **agent-reach-web** | internet access (Exa search, Jina read) | role-research capability, external fact-finding |

### Ledger & Memory

| ID | Serves | Reuse For |
|----|--------|-----------|
| **claim-cortex** | epistemic claim graph, lineage, retraction | role-justification graph, assumption tracking |
| **memory-canonical-store** | event-sourced canonical truth (peer-open READ) | role-assignment audit log, cross-lane visibility |
| **afl-paper** | paper trading (circuit breaker, P&L tracking) | role-outcome simulation (dry-run role-actions) |

### Verification & Red Team

| ID | Serves | Reuse For |
|----|--------|-----------|
| **contract-conformance** | RESULT_LABEL parsing + obligation-ledger | role-output format validation, pass-type conformance |

### Notes
- **Energy gate** is the canonical composite scorer (apply its sign convention: penalties +, credits -).
- **Swarm convergence** is the loop governor (3-layer floor + adversarial pass + damping).
- **GLM fleet** + **runSwarm** are the orchestration pair (GLM substrate + native Agents separately).
- **Filing/canonical-bridge** links decisions into persistent audit-truth (no duplication).
- **nano-self-refresh** + **nano-dispatch** are the recursive nanoswarm primitives.

---

## Part C: Fleet Seam (3 Entry Points)

### 1. **runSwarm.mjs** (Orchestrator)
```
Exports: runSwarm, newRunId, newTraceId
Does: Governed loop: buildObligationLedger → glmFleet dispatch → 
      aggregatePoolOutputs → runAdversarialPass → converge → finalizeGuard
Authority: ADVISORY (no commits/protected-surface touches)
Armed: YURI_SWARM_CONVERGENCE + YURI_GLM_FLEET (env or flag)
```

### 2. **glm-fleet.mjs** (GLM Substrate)
```
Exports: glmFleet, buildRunDir, extractResultLabel, aggregatePoolOutputs, 
         validatePacket, FLEET_PROTOCOL_PREAMBLE, ARM_ENV
Does: Parallel z.ai GLM lanes at --reasoning high (4-attempt EPIPE/429 retry),
      per-lane text via --out, wrapped into labeled JSON result
Authority: ADVISORY (dry-run DISARMED, real fire if YURI_GLM_FLEET=1)
Resilience: Fresh-process retry (not tee/pipe — EPIPE-safe single writer)
```

### 3. **swarm-convergence.mjs** (Governor)
```
Exports: buildObligationLedger, checkObligationFloor, checkCriticalSignalBlock,
         runAdversarialPass, defaultAdversarialRunner, finalizeGuard, checkDamping, 
         dedupeWork, converge, isArmed, hashFinding, isConformingPass, ADVERSARIAL_PROMPT
Does: 3-layer gate (obligation floor + critical-signal block + adversarial pass) +
      damping (marginal-value cutoff + budget governor + seen-finding dedup)
Authority: ADVISORY (verdicts never mutate source/commits)
Armed: YURI_SWARM_CONVERGENCE=1 (DISARMED-default = passthrough)
```

---

## Summary: What Sakana Role Engine Can Reuse

**Immediate reuse candidates:**
1. **Governance skeleton** → `nano-spawn-governance` + `nano-self-refresh` (role-state recursion)
2. **Scoring** → `energy-gate-scoring` (role-readiness composite)
3. **Orchestration** → `runSwarm` + `glmFleet` (ensemble loop)
4. **Red team** → `swarm-convergence` adversarial pass (role-assignment validation)
5. **Persistence** → `filing-canonical-bridge` + `memory-canonical-store` (audit trail)
6. **Dispatch** → `nano-dispatch-seam` / `nano-dispatch-async-pool` (role-work routing)

**Do NOT rebuild:**
- Composite scoring (energy-gate exists)
- Parallel dispatch (runSwarm + glmFleet exist)
- Convergence checking (swarm-convergence exists)
- Canonical memory (memory-canonical-store exists)

**Bridge to Sakana requirements:**
- Role matching via `energy-gate-scoring` + `afl-factor-scorer` (weighted composite)
- Role assignment → `filing-canonical-bridge` (audit + cross-lane visibility)
- Role-ensemble orchestration → `runSwarm` + modified adversarial-pass prompt
- Role-outcome verification → `contract-conformance` + `energy-outcome-deriver`

