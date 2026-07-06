# MURE — the YURI agentic collective (blueprint + control packet)

> **MURE** (群れ — *a flock / school / swarm*). Sakana = 魚 (fish); David Ha's thesis is that intelligence is *collective* — a school of fish, not one big fish. MURE is YURI's ~20-role self-governing agent collective built on the live `runSwarm` / dual-substrate foundation. Name is a single constant (`MURE_NAME`) — swap to **SHOAL** / **MURMURATION** on owner call.

Synthesis of the 6 research lanes (`01`–`06` in this folder). Modeled on how a small Tokyo lab (Sakana.ai) operates at high capacity. Roles = **functional archetypes**, never impersonations of individuals.

---

## 1. The thesis we adopt from Sakana

| Sakana principle | MURE encoding |
|---|---|
| **Ideas over compute** (OP-1) | roles scored on reasoning quality + novelty, not token volume; cheap lanes (haiku/glm-flash) do mechanical work, premium lanes (opus/glm-max) reserved for judgment |
| **Understanding over implementation** (OP-2) | every role emits a reasoning trace + a `RESULT_LABEL`; an unexplained output is not trusted |
| **Collective intelligence > monolithic scale** (OP-3) | govern the *swarm*, not a super-agent; specialization contracts per role |
| **Flat hierarchy, deep autonomy** (OP-4) | the governance layer sets scope + safety rails then steps back; roles self-govern inside a capability envelope |
| **Domain-native + globally legible** (OP-5) | each role has deep capability tags AND a uniform result-packet surface any lane can consume |
| **Evolutionary self-improvement, gated** (OP-6) | the `evolver` role can propose improvements to MURE itself; *arming* any such change is owner-gated |

Method → capability lineage (lane 01): The AI Scientist → ideator/oracle/adjudicator; Evolutionary Merge → evolver/synthesist; Transformer²+AB-MCTS → helmsman dispatch; AI CUDA Engineer → engineer/kernelsmith; Darwin Gödel Machine → evolver (gated behind oracle); Continuous Thought Machines → deliberator (compute self-allocation).

---

## 2. The roster — 20 roles, 6 groups

Each role: `id · archetype · capabilities · default substrate/lane · autonomy class · math hooks`. Autonomy class is the *default* decision posture; the governance gate re-decides per actual decision. **Critic roles are structurally independent of the executor roles they review** (Voyager rule — no echo chamber).

### Orchestration (3)
| id | archetype | default lane | autonomy | math hooks |
|---|---|---|---|---|
| `helmsman` | dispatcher/router + research-vision lead — decompose, route, hold goal spine, escalate | native opus/sonnet | owner-gated (finalize) | decision-sim (path choice), quantum (order-effect of step ordering) |
| `architect` | CTO + composer/integrator — system & method design, quality bar | glm-max / sonnet | self-governable (design behind flags) | izanagi (corner-law design audit) |
| `steward` | COO + governance officer — runs the 6-gate, blast/contention checks, owner-hold packets | native | owner-gated (it IS the gate) | energy (isCatastrophic, salience) |

### Research (5)
| id | archetype | lane | autonomy | math hooks |
|---|---|---|---|---|
| `ideator` | divergent hypothesis generator (novelty-scoring, divergent-scan) | glm / sonnet | self-governable | quantum (hypothesisPosteriors) |
| `scout` | local-first + online researcher (citation, synthesis, agent-reach-web) | sonnet (WebSearch) / glm | self-governable | calibration (source weighting) |
| `synthesist` | collective-intelligence / cross-domain transfer + lattice merge (1M ctx) | glm-max | self-governable | decision-sim (robustScore over options) |
| `evolver` | evolutionary-methods + self-modifier — proposes MURE/process improvements | glm-max | **owner-gated** (highest risk; behind `oracle`) | decision-sim, prediction-ledger |
| `deliberator` | deep reasoner / CTM — depth-adaptive hard sub-problems, compute self-allocation | glm-max / opus | self-governable | quantum (order-effect), decision-sim |

### Engineering (5)
| id | archetype | lane | autonomy | math hooks |
|---|---|---|---|---|
| `engineer` | core domain code-gen / implementation | glm / sonnet | self-governable (build behind flags) | — |
| `mechanic` | integration / refactor / wiring / productize | glm / sonnet | self-governable | — |
| `artificer` | fast scaffolding / mechanical edits / test-runs | glm-flash / haiku | self-governable | — |
| `sentinel` | cybersecurity + security-review + protected-path/safety audit | sonnet / glm | self-governable (audit) / owner-gated (any arm) | energy (isCatastrophic) |
| `kernelsmith` | perf / hot-path / language-consolidation (Rust·Mojo candidates) | glm-max / sonnet | self-governable | decision-sim (perf tradeoff) |

### Verification (3) — independent off-loop critics
| id | archetype | lane | autonomy | math hooks |
|---|---|---|---|---|
| `adjudicator` | adversarial critic ("what's missing", refute-by-default) — independent of ideator/engineer | glm-max | self-governable | quantum (qqEquality, schmidt) |
| `oracle` | benchmark/fitness evaluator — runs red/grey/green tests, accept/reject, gates `evolver` | native (Bash) / glm-flash | self-governable | decision-sim (pgdWitness, infoGapHorizon) |
| `calibrator` | calibration + honesty audit (Brier, advisor-weighting) | native | self-governable | prediction-ledger, calibration-tracker |

### Knowledge (2)
| id | archetype | lane | autonomy | math hooks |
|---|---|---|---|---|
| `archivist` | archive curator + memory/skill-library + capability-registry upkeep | native | self-governable | — |
| `chronicler` | science-writer — distill to docs/blueprints/owner summaries, RESULT_LABELs | sonnet / glm | self-governable | — |

### Operations (2)
| id | archetype | lane | autonomy | math hooks |
|---|---|---|---|---|
| `quartermaster` | token-budget accounting, quota routing (native↔glm), cost governance, budgetCap | native | self-governable | token-ledger, decision-sim |
| `envoy` | task intake — decode owner brain-dump (Haki), turn input into a spec/goal tree | sonnet | self-governable | — |

**Legacy-roster mapping (re-design, not deletion):** `.claude/agents/architect→architect`, `security-reviewer→sentinel`, `memory-curator→archivist`, `doc-cleaner/log-summarizer→chronicler`, `yuri-risk→steward`, `yuri-gate→oracle`, `yuri-logic→adjudicator`, `file-inventory→scout`, `design-artist/design-extractor→` (domain-specialist variants of `mechanic`). Legacy files remain on disk; MURE's `fleet-roles.json` is the new canonical roster.

---

## 3. Architecture

```
owner input
   │
   ▼
[envoy]  decode brain-dump → goal tree (Haki: rank intents, surface hidden constraint)
   │
   ▼
[helmsman]  decompose → sub-tasks → capability-match to roles → build runSwarm leaves
   │                                   │
   │                          [steward] 6-gate each decision: self-governable → execute · else → owner-HOLD packet
   ▼
DISPATCH (dual substrate)
   ├─ native lanes  → Opus spawns Agent(sonnet/haiku)   (writes, native tools, commit discipline)
   └─ glm lanes     → runSwarm → glmFleet (z.ai)         (breadth, 1M ctx, zero-Anthropic-spend adversarial)
   │
   ▼  workers write typed result packets → .claude/jobs/<run>/results/*.json  (BLACKBOARD)
   │
   ▼
[adjudicator] + [oracle]  independent verify (adversarial + tests) — off the executor loop
   │
   ▼
[calibrator] record prediction→outcome (Brier)   [archivist] capture skill/memory   [chronicler] owner summary
   │
   ▼
converge() 3-layer gate + damping → finalizeGuard → (finalize = Opus/owner only)
```

**Topology = STAR + shared blackboard** (honest V1): workers don't mesh-chat; they "work together" by writing typed packets to the shared per-run dir that the orchestrator + critics read. Coordination patterns adopted: MetaGPT typed pub-sub (packets), Voyager independent Critic (adjudicator/oracle off-loop), AG2 OnContextCondition deterministic routing (the gate is *code*, never LLM-judged), Generative-Agents memory stream (archivist).

**Self-governance loop (per role, per decision)** — PROPOSE → SCORE → GATE → EXECUTE → LEARN:
1. **propose** a goal at the *capability frontier* (Voyager: not beyond proven capability); 2 hard pre-filters first (constitution hard-stop: protected-path / arm-a-gate / outward → discard; contention → owner-gate).
2. **score** 5 weighted dims → composite (capability-fit .25, reversibility .25, blast .20, evidence-decidability .20, doctrine .10); ≥0.75 advances; backed by `decision-sim.robustScore` (0.5·mean + 0.5·CVaR tail).
3. **gate** the 6-gate charter sequentially (reversible → evidence-decidable → in-doctrine → blast≤MEDIUM → not-outward → not-contended); ALL pass → self-execute, ANY fail → finished ruling + owner-HOLD. Cross-checked by `energy.isCatastrophic`.
4. **execute** with hard caps: iteration ≤4 then escalate; scope-lock (final diff ⊆ proposed scope); intent-drift xref; circuit-breaker on catastrophic ΔU.
5. **learn**: record `{goal,score,gate,outcome}` → prediction-ledger Brier; capture capability/memory.

---

## 4. Math layer cross-reference (the directive's core demand)

`_SYSTEM/mure/math-bridge.mjs` wraps the live math layer into clean role-facing calls (all pure, inline-safe):

| MURE call (actual signature) | wraps | governs |
|---|---|---|
| `scoreOptions(options, opts)` | `decision-sim.robustScore` (0.5·mean+0.5·CVaR) + `minimaxRegret` | goal-scoring, role path-choice |
| `bestOption(options, opts)` | `scoreOptions(...).best` (robustScore+minimaxRegret head) | role-selection, top-ranked option |
| `orderEffect(spec)` | `quantum.measureSequential` + `qqEquality` (non-commutativity) | does step ORDER change the outcome? (helmsman/deliberator) |
| `robustnessRadius(option, opts)` | `decision-sim.pgdWitness` + `infoGapHorizon` (bounded paramSpace) | adjudicator/oracle: margin + how far before a choice flips |
| `governanceVeto(transition)` | `energy.isProtectedPath` + `salience` (pure light path) | steward gate hard-veto (protected-path) |
| `breakerVerdict(prev, next)` | `energy.verdictFromStates` + `isCatastrophic` | full breaker verdict (live integration, needs energy states) |
| `salienceTier(transition)` | `energy.salience` | skip low-signal decisions |
| `calibrate(opts)` | `prediction-ledger.calibrationReport` (lazy) | calibrator honesty/Brier |

This is **cross-reference, not rebuild** — MURE imports the existing modules (lane 06: do not re-implement composite scoring / convergence / dispatch).

---

## 5. CONTROL PACKET

- **Goal:** ship MURE — a ~20-role self-governable, self-goal-setting, capability-based agent collective on the live `runSwarm`/dual-substrate foundation, with the math layer cross-referenced into governance, full red/grey/green tests, DISARMED by default.
- **Target files (new):** `_SYSTEM/config/fleet-roles.json` (roster); `_SYSTEM/mure/{role-registry,governance,goal-engine,math-bridge,company,mure}.mjs`; `_SYSTEM/mure/*.test.mjs` (red/grey/green); `_SYSTEM/mure/mure-blueprint.html` (viz); `_SYSTEM/mure/README.md`; `_SYSTEM/capabilities.json` (regen). Edit: `skills/opus-fleet/SKILL.md` (roles section), `MEMORY.md`.
- **Language:** JavaScript (Node ESM) — concise + correct: MURE is orchestration/governance glue that must import the all-JS fleet substrate + math layer directly (no IPC). Rust/Mojo are reserved for hot compute kernels (`kernelsmith`'s future candidates), not orchestration.
- **Constraints:** DISARMED-first; arming owner-gated (charter); protected paths off-limits; pathspec-only commit, never sweep parallel-session files; roles = archetypes not impersonations; reuse not rebuild (runSwarm/glmFleet/swarm-convergence/decision-sim/energy/quantum/prediction); finalize = Opus/owner only.
- **Acceptance:** registry loads + validates 20 roles; governance gate green-passes a safe decision AND owner-gates an irreversible/outward/high-blast/contended one; goal-engine ranks + caps; math-bridge returns live values from the real modules; company maps a task → roles → runSwarm leaves DISARMED (dry-run, zero spend); red/grey/green suites pass; capability registered; GLM-5.2 architectural red-team clean.
- **Test command:** `node --test _SYSTEM/mure/*.test.mjs` + `node _SYSTEM/mure/mure.mjs --demo --dry-run`.
- **Rollback boundary:** delete `_SYSTEM/mure/` + `_SYSTEM/config/fleet-roles.json`; git-revert the SKILL.md/MEMORY.md/capabilities.json edits. No durable external state (DISARMED = no spend); arming flags never created in this build.

**Build sequence:** spine (Opus: blueprint→roster→core modules) → fan-out (tests ×2 native, viz GLM-max, docs native) → verify (run tests + native red-team + GLM-5.2 final gate) → capability-scan + reindex + DISARMED commit → present + owner arm-gate.

**Residual risk:** roster lane-pins are defaults (re-tunable); self-goal-setting is BUILT but stays DISARMED (no role auto-proposes-and-executes until owner arms); the `evolver` self-modify path is the highest blast — owner-gated + behind `oracle` by construction.
