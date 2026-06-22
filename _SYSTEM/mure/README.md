# MURE — Operator Manual

**群れ** (mure) — a flock / school / swarm. After Sakana (魚, fish): intelligence is collective, not monolithic.

## 1. What MURE is

MURE is YURI's ~20-role self-governing agent collective built on the live `runSwarm` / dual-substrate foundation (native Anthropic Agents + z.ai GLM lanes). It models the Sakana.ai operating principle: ideas and specialisation over raw compute, flat hierarchy with deep autonomy inside a capability envelope, and collective intelligence that governs the swarm rather than inflating a super-agent. Each of the 20 roles is a **functional archetype** — never an impersonation of an individual — paired with a declared capability set, a default dispatch lane, a math-hook list, and an autonomy class (self-governable or owner-gated) that determines whether the role decides-and-executes or produces a finished ruling and holds for a one-token owner confirm. MURE is DISARMED by default: every run produces a governed plan with zero spend until the owner arms it.

---

## 2. The 20 roles

Source: `_SYSTEM/config/fleet-roles.json` (canonical; do not edit by hand).

### Orchestration

| id | archetype | substrate / lane | autonomy |
|---|---|---|---|
| `helmsman` | dispatcher/router + research-vision lead | native / opus (fallback: glm-max) | owner-gated |
| `architect` | CTO + composer/integrator | either / glm-max (fallback: sonnet) | self-governable |
| `steward` | COO + governance officer | native / native | owner-gated |

### Research

| id | archetype | substrate / lane | autonomy |
|---|---|---|---|
| `ideator` | divergent hypothesis generator | glm / glm (fallback: sonnet) | self-governable |
| `scout` | local-first + online researcher | native / sonnet (fallback: glm) | self-governable |
| `synthesist` | collective-intelligence / cross-domain transfer | glm / glm-max (fallback: opus) | self-governable |
| `evolver` | evolutionary-methods + self-modifier | glm / glm-max (fallback: opus) | **owner-gated** |
| `deliberator` | deep reasoner / depth-adaptive | glm / glm-max (fallback: opus) | self-governable |

### Engineering

| id | archetype | substrate / lane | autonomy |
|---|---|---|---|
| `engineer` | core domain code-gen / implementation | either / glm (fallback: sonnet) | self-governable |
| `mechanic` | integration / refactor / wiring | either / glm (fallback: sonnet) | self-governable |
| `artificer` | fast scaffolding / mechanical edits | either / haiku (fallback: glm-flash) | self-governable |
| `sentinel` | cybersecurity + security-reviewer | native / sonnet (fallback: glm) | self-governable (audit) / owner-gated (arm) |
| `kernelsmith` | perf / hot-path / language-consolidation | either / glm-max (fallback: sonnet) | self-governable |

### Verification (independent off-loop critics)

| id | archetype | substrate / lane | autonomy |
|---|---|---|---|
| `adjudicator` | adversarial critic (refute-by-default) | glm / glm-max (fallback: opus) | self-governable |
| `oracle` | benchmark / fitness evaluator | native / native (fallback: glm-flash) | self-governable |
| `calibrator` | calibration + honesty audit | native / native | self-governable |

### Knowledge

| id | archetype | substrate / lane | autonomy |
|---|---|---|---|
| `archivist` | archive curator + memory / skill-library | native / native (fallback: haiku) | self-governable |
| `chronicler` | science-writer / doc-generator | either / sonnet (fallback: glm) | self-governable |

### Operations

| id | archetype | substrate / lane | autonomy |
|---|---|---|---|
| `quartermaster` | token-budget + cost governance | native / native | self-governable |
| `envoy` | task intake / requirement decoder | native / sonnet (fallback: glm) | self-governable |

Verification roles (`adjudicator`, `oracle`) are structurally independent of the executor roles they review — no echo chamber (Voyager rule). `evolver` is gated behind `oracle` and is the highest-blast role in the roster.

---

## 3. Architecture

STAR topology + shared blackboard. Workers do not mesh-chat; they write typed result packets to `.claude/jobs/<run>/results/*.json` that the orchestrator and critics read. Coordination patterns: MetaGPT typed pub-sub (packets), Voyager independent Critic (adjudicator/oracle off-loop), AG2 OnContextCondition deterministic routing (the governance gate is code, never LLM-judged), Generative-Agents memory stream (archivist).

```
owner input
  │
  ▼
[envoy]   decode brain-dump → spec / goal tree (Haki: rank intents, surface hidden constraint)
  │
  ▼
[helmsman]  decompose → sub-tasks → capability-match roles → build runSwarm leaves
  │                              │
  │                     [steward]  6-gate each decision
  │                              ├─ SELF-GOVERNABLE → execute
  │                              └─ OWNER-GATED     → finished ruling + hold packet
  ▼
DISPATCH (dual substrate)
  ├─ native lanes → Opus orchestrates Agent(sonnet/haiku)  [writes, tools, commit discipline]
  └─ glm lanes   → runSwarm → glmFleet (z.ai)              [breadth, 1M ctx, zero-Anthropic-spend]
  │
  ▼  typed result packets → .claude/jobs/<run>/results/*.json   (BLACKBOARD)
  │
  ▼
[adjudicator]  adversarial critic — independent of ideator/engineer/mechanic/synthesist
[oracle]       red/grey/green tests; accept/reject; gates evolver
  │
  ▼
[calibrator]   record prediction→outcome (Brier)
[archivist]    capture skill/memory/lineage
[chronicler]   owner summary + RESULT_LABELs
  │
  ▼
converge() 3-layer gate + damping → finalizeGuard
  └─ finalize = Opus / owner only (never autonomous)
```

Substrates:
- **native** — Anthropic Agents (`Agent` tool, opus/sonnet/haiku). Bills Claude weekly pool. Writes, native tools, commit discipline.
- **glm** — z.ai GLM lanes via `runSwarm`/`glmFleet` (glm-max / glm / glm-flash / glm-sub-orch). Bills z.ai plan. Breadth, 1 M context, zero Anthropic spend for adversarial passes.

---

## 4. The self-governance loop

Source: `_SYSTEM/mure/governance.mjs` (the gate), `_SYSTEM/mure/goal-engine.mjs` (the loop).

Every role, every decision: **PROPOSE → SCORE → GATE → EXECUTE → LEARN**

### PROPOSE
Generate a candidate goal at the capability frontier (Voyager: not beyond proven capability). Two hard pre-filters run first — discarding before scoring, never after:
- **constitution hard-stop** (`preFilter` in `goal-engine.mjs`): protected-path file, arming a gate, outward-facing action, secrets, gate-self-modification (`mure/governance.mjs` is inviolable), scope-violation, or intent-drift → **DISCARD**.

### SCORE
Five weighted dimensions → composite; `≥ 0.75` (`ADVANCE_THRESHOLD`) advances:

| dimension | weight | notes |
|---|---|---|
| `capabilityFit` | 0.25 | does the role's declared capabilities cover the goal? |
| `reversibility` | 0.25 | git-revert / unset env / delete file |
| `blast` | 0.20 | LOW=1.0 · MEDIUM=0.6 · HIGH=0.2 · CRITICAL=0.0 |
| `evidenceDecidability` | 0.20 | settled by local evidence / calc / simulation |
| `doctrineFit` | 0.10 | DISARMED-first · capability-first · Mutation Contract · Protected Surfaces · adversarial verification · no-downgrade |

Scoring is backed by `scoreOptions` in `math-bridge.mjs` → `decision-sim.robustScore` (0.5 · mean + 0.5 · CVaR tail) + `minimaxRegret`. A high composite never overrides a constitution veto.

### GATE
The 6-gate charter (`evaluateGovernance` in `governance.mjs`), checked sequentially — ALL must pass for self-governable:

1. **reversible** — git-revert / unset / delete; arming is never reversible here
2. **evidence-decidable** — settled by local evidence, not preference
3. **in-doctrine** — matches `DOCTRINE_NOTE` in `governance.mjs`
4. **blast ≤ MEDIUM** — does not arm a gate, fan out processes, or touch production / shared-external state
5. **not-outward** — no email / post / PR / publish
6. **not-contended** — does not sweep another session's uncommitted work

ANY failure → **OWNER-GATED**: produce a finished ruling (calc + sim + recommendation + reversibility + blast assessment) and HOLD for a one-token owner confirm.

Cross-checked by `governanceVeto` → `energy.verdictFromStates` + `isCatastrophic` (hard veto on protected paths).

Owner-gated roles (`helmsman`, `steward`, `evolver`) keep their decisions owner-gated even when the six gates would pass — the role's `autonomyClass` is a floor.

### EXECUTE
Hard caps (enforced by the orchestrator in `company.mjs`):
- iteration ceiling: `MAX_CYCLES = 4` then mandatory escalation
- scope-lock: final diff ⊆ proposed scope
- intent-drift xref: goal tags must overlap context tags
- circuit-breaker: catastrophic ΔU (`isCatastrophic`) trips and blocks

### LEARN
Record `{goal, score, gate, outcome}` → prediction-ledger Brier (`calibrate` in `math-bridge.mjs`). Capture capability / memory. `calibrator` role owns the honesty audit over time.

---

## 5. Math layer cross-reference

Source: `_SYSTEM/mure/math-bridge.mjs` (@exports: `scoreOptions`, `bestOption`, `orderEffect`, `robustnessRadius`, `governanceVeto`, `breakerVerdict`, `calibrate`, `normalizeOptions`, `MATH_HOOKS`).

MURE imports the existing live math modules — it does not re-implement them (capability-first).

| math-bridge call | wraps | governs |
|---|---|---|
| `scoreOptions(options)` | `decision-sim.robustScore` + `minimaxRegret` | goal-scoring; role path-choice (ideator, synthesist, deliberator, kernelsmith, quartermaster) |
| `bestOption(problem, configs)` | `decision-sim.crossEntropyOptimize` / `izanagiRuling` | role-selection; architecture decision (helmsman, architect) |
| `orderEffect(hypotheses, evidenceSeqs)` | `quantum.hypothesisPosteriors` + `qqEquality` | does step ORDER change the outcome? (helmsman route ordering, deliberator sub-problem sequencing) |
| `robustnessRadius(problem, config)` | `decision-sim.pgdWitness` / `infoGapHorizon` | how far before a choice flips (adjudicator gap-detection, oracle accept/reject, kernelsmith perf tradeoff) |
| `governanceVeto(transition)` | `energy.verdictFromStates` + `isCatastrophic` | steward hard-veto; sentinel protected-path audit |
| `breakerVerdict(states)` | `energy.verdictFromStates` + `isCatastrophic` | circuit-breaker in EXECUTE phase |
| `salienceTier(transition)` | `energy.salience` | skip low-signal decisions; quartermaster routing |
| `calibrate()` | `prediction-ledger.calibrationReport` | calibrator honesty / Brier; evolver proposal weighting |

All scoring functions are pure and deterministic (seeded RNG). `calibrate()` reads the ledger. `breakerVerdict` / `governanceVeto` need energy state objects. Advisory scoring: these numbers inform the gate, they never bypass the constitution hard-stop or owner-gating.

---

## 6. How to run

### CLI

```bash
# list all roles grouped by group
node _SYSTEM/mure/mure.mjs --roster

# strict schema validation of fleet-roles.json
node _SYSTEM/mure/mure.mjs --validate

# DISARMED end-to-end demo (plan only, zero spend)
node _SYSTEM/mure/mure.mjs --demo

# check arm state
node _SYSTEM/mure/mure.mjs --status
```

### Programmatic

```js
import { runCompany, planCompany, loadRoster, evaluateGovernance, runGoalCycle, MATH_HOOKS }
  from './_SYSTEM/mure/mure.mjs';

// DISARMED plan (dry-run, zero spend — always safe)
const plan = await planCompany(task);

// armed dispatch (requires MURE armed — owner-gated)
const result = await runCompany(task);
```

`task` shape: `{ summary, subtasks: [{ id, need: [caps], prompt, blastRadius?, reversible?, ... }], tags? }`.

### Arming (owner-gated)

MURE is DISARMED by default. `planCompany` / `--demo` always runs safely. Dispatch is blocked until armed.

Arm via env (session-scoped, no file written):
```bash
YURI_MURE_ARMED=1 node _SYSTEM/mure/mure.mjs --demo
```

Arm via flag file (persistent until removed):
```bash
touch _SYSTEM/state/mure.enabled   # arm
rm _SYSTEM/state/mure.enabled      # disarm
```

Both are checked by `isMureArmed()` in `company.mjs` (`ARM_ENV` + `ARM_FLAG`). Creating the flag is owner-gated (arming = constitution hard-stop). The `evolver` self-modification path is the highest-blast arm in the roster and is additionally gated behind `oracle`.

### Tests

```bash
node --test _SYSTEM/mure/*.test.mjs
node _SYSTEM/mure/mure.mjs --demo --dry-run
```

Rollback: delete `_SYSTEM/mure/` + `_SYSTEM/config/fleet-roles.json`; git-revert SKILL.md / MEMORY.md / `capabilities.json` edits. No durable external state (DISARMED = no spend).

---

## 7. Legacy roster mapping

The 12 files in `.claude/agents/` remain on disk. `_SYSTEM/config/fleet-roles.json` is now the canonical roster. The legacy agents are absorbed by the MURE roles below (re-design, not deletion).

| legacy file | MURE successor role | notes |
|---|---|---|
| `architect.md` | `architect` | direct identity; system/method design + capability composition |
| `security-reviewer.md` | `sentinel` | cybersecurity + protected-path audit + safety red-team |
| `memory-curator.md` | `archivist` | memory / skill-library / lineage / capability-registry upkeep |
| `doc-cleaner.md` | `chronicler` | distill to docs + owner summaries + RESULT_LABELs |
| `log-summarizer.md` | `chronicler` | same chronicler lane; log summarisation = summary-distillation capability |
| `yuri-risk.md` | `steward` | governance officer + blast-radius + constitution gate |
| `yuri-gate.md` | `oracle` | benchmark / fitness evaluator + accept/reject + evolver gate |
| `yuri-logic.md` | `adjudicator` | adversarial critic + refute-by-default + gap-detection |
| `file-inventory.md` | `scout` | local-first search + census-scan |
| `design-artist.md` | `mechanic` | domain-specialist variant: visual/design wiring + productize |
| `design-extractor.md` | `mechanic` | domain-specialist variant: extraction + integration seam |
| `yuri-linter.md` | `oracle` / `sentinel` | acceptance-check (oracle) + safety-audit (sentinel) |

---

*Source of truth: `_SYSTEM/config/fleet-roles.json` (roles) · `_SYSTEM/mure/*.mjs` (implementation) · `02_RESOURCES/RESEARCH/sakana-blueprint-2026-06-22/00-MURE-BLUEPRINT.md` (design rationale).*
