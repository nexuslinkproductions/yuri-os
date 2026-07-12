# MURE — Operator Manual

**群れ** (mure) — a flock / school / swarm. After Sakana (魚, fish): intelligence is collective, not monolithic.

## 1. What MURE is

MURE is YURI's ~20-role self-governing agent collective built on the live `runSwarm` / **tri-substrate** foundation (OMP `task()` subagents + z.ai GLM fleet + Ollama Cloud peer fleet). It models the Sakana.ai operating principle: ideas and specialisation over raw compute, flat hierarchy with deep autonomy inside a capability envelope, and collective intelligence that governs the swarm rather than inflating a super-agent. Each of the 20 roles is a **functional archetype** — never an impersonation of an individual — paired with a declared capability set, a default dispatch lane, a math-hook list, and an autonomy class (self-governable or owner-gated) that determines whether the role decides-and-executes or produces a finished ruling and holds for a one-token owner confirm. MURE is DISARMED by default (`_SYSTEM/state/mure.enabled` absent) — dry-run only until the owner arms it.

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
[helmsman]  decompose → sub-tasks → capability-match roles → build runSwarm leaves + native specs
  │                              │
  │                     [steward]  6-gate each decision
  │                              ├─ SELF-GOVERNABLE → execute
  │                              └─ OWNER-GATED     → finished ruling + hold packet
  ▼
DISPATCH (tri-substrate, unified blackboard)
  ├─ OMP task() → explore/task/tester/reviewer → .claude/jobs/<run>/results/native-*.json
  ├─ glm lanes   → runSwarm → glmFleet → .claude/jobs/<run>/results/*.json
  └─ ollama-cloud → ollamaFleet → .claude/jobs/olf-<id>/results/*.json
  │
  ▼  typed result packets (shared schema) → .claude/jobs/<run>/results/*.json   (BLACKBOARD)
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
  └─ finalize = orchestrator / owner only (never autonomous)
```

Substrates (canonical map: `_SYSTEM/config/cloud-fleet-models.json`):
- **OMP task()** — orchestrator `task()` subagents (`explore` / `task` / `tester` / `reviewer` / …). Native MCP/browser. Bills Claude/Cursor OAuth when available.
- **glm** — z.ai GLM lanes via `runSwarm`/`glmFleet` (glm-max=glm-5.2 / glm=glm-5.1 / glm-flash=glm-5-turbo). Bills z.ai plan. Breadth, 1M ctx, adversarial passes.
- **ollama-cloud** — Ollama Pro `:cloud` tiers via `ollama-fleet.mjs` (flash/minimax/kimi/nemotron/deepseek-pro/gemma). Bills Ollama Pro. Default bulk substrate.
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

### 6.1 The CEO path (start here)

The owner operates as **CEO** through a single entry point: `_SYSTEM/mure/ceo.mjs`. It takes free-text intent, builds a task spec, casts roles, and (when MURE is armed) dispatches the fleet. Any model or platform can run it — it's a plain Node script with zero non-Node dependencies. **DISARMED by default: `--dry-run` (or an unarmed repo) prints the plan with zero spend.**

```bash
# the one command — free text in, governed plan + (optionally) live dispatch out
node _SYSTEM/mure/ceo.mjs "Build a caching module with tests and document it"

# plan only (zero spend) — also the automatic behavior when MURE is disarmed
node _SYSTEM/mure/ceo.mjs --dry-run "Research prior art for a CLI tool"

# after a live dispatch, poll .claude/jobs/<runId>/ every 3s for progress
node _SYSTEM/mure/ceo.mjs --watch "Build the feature"   # (live; needs MURE armed)

# end-of-run report: RESULT_LABELs, convergence verdict, artifact paths, CEO summary
node _SYSTEM/mure/ceo.mjs --report "Ship the release candidate"

# machine-readable JSON output
node _SYSTEM/mure/ceo.mjs --json --dry-run "Audit the auth module for security issues"

# full task spec from JSON instead of free text
node _SYSTEM/mure/ceo.mjs --task-file my-task.json --dry-run
```

**Flags:**

| flag | effect |
|---|---|
| `--dry-run` | Plan only — zero spend. **Automatic when MURE is disarmed.** Prints: roles cast, substrates, held rulings. |
| `--watch` | After a live dispatch, poll `.claude/jobs/<runId>/status.json` + `spawns.jsonl` + `results/*.json` every 3s and print one-line progress. Degrades gracefully when artifacts are absent. |
| `--report` | At end, print all RESULT_LABELs, convergence verdict, artifact paths, and a plain-language CEO summary. |
| `--json` | Emit machine-readable JSON instead of human text. |
| `--task-file F` | Load a full task spec from JSON instead of building from free text. |

**What ceo.mjs does internally:**
1. Builds a task spec from free text (`summary` = the text; subtasks via heuristic decomposition into intake → research → build → verify → doc).
2. Infers capability needs: feature-detects `deriveNeeds` from `company.mjs` (dynamic-import try/catch); if absent, uses an inline keyword→capability fallback map.
3. Delegates to `planCompany` (plan) / `runCompany` (dispatch) from `company.mjs`.
4. **Never arms anything itself.** `--dry-run` forces `armed:false`; live mode passes `armed:undefined` so `isMureArmed()` (env or flag) is the sole arming authority.

**Arm semantics (unchanged):** ceo.mjs NEVER writes a flag file or sets an env. To go live:

```bash
touch _SYSTEM/state/mure.enabled      # arm (owner-gated — persistent)
# or
YURI_MURE_ARMED=1 node _SYSTEM/mure/ceo.mjs "task"   # arm for this session only
```

### 6.2 When to use which entry point (decision tree)

MURE has several entry points. **Use ceo.mjs unless you need a specific lower-level capability.**

```
Do you have free-text operator intent?
├─ YES → node _SYSTEM/mure/ceo.mjs "<task>" [--dry-run] [--watch] [--report]
│         (the CEO path — default for the owner)
│
└─ NO — you need a specific tool. Pick by purpose:
   │
   ├─ Inspect / validate the roster
   │  ├─ node _SYSTEM/mure/mure.mjs --roster       (list all 20 roles grouped)
   │  ├─ node _SYSTEM/mure/mure.mjs --validate     (strict fleet-roles.json schema check)
   │  ├─ node _SYSTEM/mure/mure.mjs --status       (MURE / Cline / Evolver arm state)
   │  └─ node _SYSTEM/mure/mure.mjs --demo         (DISARMED end-to-end plan of a sample task)
   │
   ├─ Run ONE task from a JSON spec (plan or dispatch)
   │  ├─ node _SYSTEM/mure/company.mjs --task-file t.json --dry-run   (plan only, zero spend)
   │  └─ node _SYSTEM/mure/company.mjs --task-file t.json             (dispatch if MURE armed)
   │
   ├─ Run the ordered company-ops workstream suite (WS-A → WS-B → WS-F → WS-C → WS-D → WS-G)
   │  ├─ node _SYSTEM/mure/company-dispatch.mjs --dry-run-all         (plan all streams)
   │  ├─ node _SYSTEM/mure/company-dispatch.mjs --dry-run-all --include-release
   │  └─ node _SYSTEM/mure/company-dispatch.mjs --apply --mlp-learn --ollama-sidecar --cline-sidecar --zai-sidecar
   │      (live armed dispatch with all sidecars + MLP learning)
   │
   ├─ Helmsman packet runner (Phase 3+: dry-run all WS files + optional GLM/Ollama parallel lanes)
   │  └─ node _SYSTEM/mure/helmsman-run.mjs --dry-run-all --ollama-sidecar --out _SYSTEM/lane-output/phase3
   │
   ├─ Low-level GLM fleet (leaf-level dispatch, bypassing the company orchestrator)
   │  └─ node _SYSTEM/Scripts/glm-fleet.mjs --tasks '[{"lane":"glm","label":"R1","prompt":"..."}]'
   │
   └─ Low-level swarm convergence loop (runSwarm over a leaves array)
      └─ node _SYSTEM/Scripts/runSwarm.mjs --leaves-file leaves.json [--rounds 3] [--concurrency 3]
```

**Parallel sidecar fleets** — `runFleet.mjs --apply` with sidecar flags **self-spawns** armed sidecars in-run (P7 ollama mirrors P6 zai; no manual second command):

| entry point | purpose | arm flag | auto-spawn |
|---|---|---|---|
| `node _SYSTEM/Scripts/runFleet.mjs --apply --ollama-sidecar --task-file t.json` | Ollama Cloud bulk (scout/artificer/archivist) — **live self-spawn** when armed | `_SYSTEM/state/ollama-fleet.enabled` | **yes** (P7): spawns `ollama-fleet.mjs`, merges `skipLeafIds`, writes `olf-*` packets |
| `node _SYSTEM/Scripts/ollama-fleet.mjs --tasks-file <t.json>` | Manual ollama sidecar (same bulk roles) | `_SYSTEM/state/ollama-fleet.enabled` | manual only |
| `node _SYSTEM/Scripts/runFleet.mjs --apply --zai-sidecar --task-file t.json` | GLM heavy tmux sidecar (architect/adjudicator/kernelsmith) | `_SYSTEM/state/zai-tmux-fleet.enabled` | **yes**: spawns `zai-tmux-fleet.mjs` |
| `node _SYSTEM/Scripts/cline-fleet.mjs --dry-run --tasks-file <t.json>` | ClinePass CLI peer sidecar (scout/artificer/engineer) | `_SYSTEM/state/cline-fleet.enabled` | tasks file only (manual spawn) |

Pass `--ollama-sidecar` / `--cline-sidecar` / `--zai-sidecar` to `runFleet` or `company-dispatch --apply`.

**P7 ollama live path (verified 2026-07-02):**
1. Armed `runFleet --apply --ollama-sidecar` writes `.claude/jobs/<runId>/ollama-tasks.json`
2. Self-spawns `node _SYSTEM/Scripts/ollama-fleet.mjs --tasks-file …` with `YURI_OLLAMA_FLEET=1`
3. Ollama runId is `olf-*`; result packets land in `.claude/jobs/olf-<id>/results/*.json` + `spawns.jsonl`
4. Handled leaf IDs merge into `skipLeafIds` so GLM swarm does not double-dispatch
5. Disarmed (`ollama-fleet.enabled` absent): `ollamaSidecar.skipped=true`, `skipReason` set — no spawn, no spend
6. **Tier propagation:** subtask `tier` (flash/minimax/kimi) + affinity matrix flow into `ollama-tasks.json` — not hardcoded flash

**Multi-arm substrate table (independent quotas — run in parallel):**

| substrate | entry | arm | concurrent | tier examples |
|---|---|---|---|---|
| native Claude | Opus `Agent` tool | (session) | ~12 parallel Agents | sonnet, haiku |
| z.ai GLM | `glm-fleet.mjs` / `runSwarm` | `glm-fleet.enabled` | plan-dependent | glm-max, glm, glm-flash |
| ollama-cloud | `ollama-fleet.mjs` / `--ollama-sidecar` | `ollama-fleet.enabled` | 3 (Pro plan) | flash, minimax, kimi |
| z.ai tmux | `zai-tmux-fleet.mjs` / `--zai-sidecar` | `zai-tmux-fleet.enabled` | tmux sessions | glm-max heavy roles |

**Cross-process cloud slots (multi-machine):** set `YURI_CLOUD_SLOTS_DIR` to a shared directory so `cloud-concurrency.mjs` admission is consistent across hosts (default: `_SYSTEM/state/cloud-slots`). Optional hermetic test: `_SYSTEM/Scripts/cloud-concurrency.test.mjs`.

**P8.4 budgetCap (quartermaster):** `runCompany` → `runSwarm` threads a finite default `budgetCap` of **48** lane-calls (~16 leaves × 3 rounds). Override: `task.budgetCap`, `YURI_MURE_BUDGET=<n>`, or `YURI_MURE_BUDGET_UNLIMITED=1` for legacy unbounded behavior. Force-stop fires via `swarm-convergence` damping when budget exhausts.

**P9 MLP shadow (no active routing):** arm with `YURI_MLP_SHADOW=1` or `touch _SYSTEM/state/mlp-shadow.enabled`. Writes counterfactual rows to `_SYSTEM/state/fleet-router-counterfactual-shadow.jsonl` at plan time (`planCompany`) and apply time (`runCompany` / `runSwarm`). Does **not** change dispatch.

**RESULT_LABEL interpretation:**

| suffix | meaning | example |
|---|---|---|
| `_X_PASS_` | executed + verified locally | `15OL_SMOKE_SCOUT_X_PASS_COMMITTED` |
| `_P_PASS_` | partial / provisional pass | planning-only or incomplete verify |
| `_F_PASS_` | failed but recorded (honest fail) | adversarial find, not a silent skip |
| missing + text < 16 chars | **empty-outcome** — MLP training skipped | sidecar timeout with no label |

Grammar: `NNXX_DESCRIPTION_(X|P|F)_PASS_COMMITTED` — validated by `contract-conformance.mjs` (D-3).

**`mure.mjs --run` (Cursor / VS Code terminal):**

```bash
# Plan only (zero spend) — safe default in any IDE terminal
node _SYSTEM/mure/mure.mjs --run --task-file 02_RESOURCES/TASKS/mure-finish-wave-master.json --dry-run

# Live dispatch (needs mure.enabled + glm-fleet.enabled; sidecars need their flags)
node _SYSTEM/mure/mure.mjs --run --task-file 02_RESOURCES/TASKS/mure-finish-wave-master.json

# Equivalent lower-level entry
node _SYSTEM/Scripts/runFleet.mjs --task-file 02_RESOURCES/TASKS/mure-finish-wave-master.json --apply --ollama-sidecar
```

**OpenAPI:** `_SYSTEM/docs/work-dashboard.openapi.yaml` — work-dashboard :4270 including `/api/processes`.

### 6.3 The four arm flags (dependency table)

MURE dispatch is gated by four independent arm flags. They compose: a live end-to-end GLM run needs MURE + GLM + convergence armed. Missing flags degrade safely (plan-only or disarmed packets), never crash.

| flag / env | file | what it gates | when missing |
|---|---|---|---|
| `YURI_MURE_ARMED=1` | `_SYSTEM/state/mure.enabled` | The master MURE arm. `runCompany` dispatches GLM leaves only when armed; otherwise returns the plan (zero spend). ceo.mjs passes `armed:undefined` in live mode so this flag is the sole authority. | **DISARMED**: `runCompany` returns plan-only (`dryRun:true`). ceo.mjs prints the plan with "ZERO SPEND". |
| `YURI_GLM_FLEET=1` | `_SYSTEM/state/glm-fleet.enabled` | GLM lane dispatch (`glmFleet` → `lane-dispatch` → z.ai). The actual API spend gate. | `glmFleet` returns a plan + dry-run stubs; no API calls, zero spend. |
| `YURI_SWARM_CONVERGENCE=1` | `_SYSTEM/state/swarm-convergence.enabled` | The `converge()` 3-layer gate + `finalizeGuard` over the swarm pool. Without it, `runSwarm` runs rounds but finalization is advisory. | Swarm rounds run; `finalizeOk` is advisory/forced; the owner reads result packets directly. |
| `YURI_OLLAMA_FLEET=1` | `_SYSTEM/state/ollama-fleet.enabled` | Ollama Cloud sidecar execution (bulk roles). With `--ollama-sidecar --apply`, runFleet **self-spawns** ollama-fleet in-run (P7). | Sidecar writes tasks file only; `skipped:true` + explicit `skipReason`; no `olf-*` packets. |

Additional arms (role-specific, higher-blast):
- `evolver` self-modification: additionally gated behind `_SYSTEM/state/evolver-arm.enabled` / `YURI_EVOLVER_ARMED`. The highest-blast role; owner-gated even when the six governance gates pass.
- `cline-fleet` / `zai-tmux-fleet` sidecars: gated by their own `.enabled` flags (see §6.2 table).

**Arming is always owner-gated** (arming = constitution hard-stop). `rm` the flag to disarm. The flags are gitignored (`_SYSTEM/state/*.enabled`).

### 6.4 Artifact schemas

Every run writes to `.claude/jobs/<runId>/`. The runId is generated by `runSwarm.newRunId()` / `glmFleet` and surfaced in the `runCompany` result as `result.swarm.runId`.

```
.claude/jobs/<runId>/
├── results/           # per-leaf result packets (GLM + native, same schema)
│   ├── <label>.json   # one packet per leaf
│   └── native-*.json  # native-spawn-loop stubs (or real Agent results written by Opus)
├── status.json        # run-level status (parallel lane — may be absent; watch degrades)
└── spawns.jsonl       # per-spawn telemetry, one JSON object per line (parallel lane — may be absent)
```

**Result packet** (`results/<label>.json`) — validated by `glm-fleet.mjs::validatePacket`:
```jsonc
{
  "laneId": "glm",           // required, non-empty string
  "role": "engineer",        // required, non-empty string (the leafId)
  "status": "ok",            // required: ok | malformed | error | timeout
  "resultLabel": "01EN_FEATURE_X_PASS_COMMITTED",  // required (may be "" until the lane emits one)
  "text": "...full lane output..."   // the lane's text output (RESULT_LABEL parsed from here)
}
```

**`status.json`** (parallel lane — schema when present):
```jsonc
{
  "runId": "fleet-abc123",
  "state": "running",         // running | finished | converged | failed | aborted
  "startedAt": "2026-07-02T...",
  "finishedAt": null,         // ISO string when terminal
  "leafCount": 5,
  "converged": false,
  "finalizeOk": null
}
```

**`spawns.jsonl`** (parallel lane — one JSON object per line):
```jsonc
{"laneId":"glm","role":"engineer","pid":12345,"startedAt":"...","label":"01EN"}
```

**Manifest** (company-dispatch only — `_SYSTEM/lane-output/dispatch/<runId>/manifest.json`):
```jsonc
{
  "runId": "dispatch-xyz",
  "dryRun": true,
  "ratifiedAt": "2026-07-02T...",
  "heldRulings": "...source path...",
  "mureArmed": false,
  "streams": [{ "taskFile": "...", "status": "planned", "held": 0, "glm": 3, "native": 2 }],
  "skipped": [],
  "errors": []
}
```

**`task` shape** (for `--task-file` / programmatic `planCompany`/`runCompany`):
```jsonc
{
  "summary": "Build a feature module with tests.",
  "tags": ["build", "feature"],
  "subtasks": [
    { "id": "build", "need": ["code-generation", "implementation"], "prompt": "Implement the module.", "blastRadius": "MEDIUM" }
  ]
}
```

### 6.5 Hung-lane recovery playbook

**Where logs live:**
- Per-leaf packets: `.claude/jobs/<runId>/results/<label>.json` — read these first.
- Lane dispatch stdout: `.claude/jobs/<runId>/results/<label>.out` (raw, before packet parsing).
- Detached dispatch log: `_SYSTEM/lane-output/dispatch/run.log` (company-dispatch `--detach`).
- runSwarm round log: in-memory (`result.swarm.roundLog`); surfaced by `--report`.

**When to intervene:**
- A leaf has `status: "timeout"` or no `resultLabel` after the round ceiling (default 3 rounds): the lane hung or produced no conforming output. Re-dispatch that leaf.
- `finalizeOk: false` with `blockingLeaves`: the convergence gate blocked finalization on specific leaves. Address those leaves (re-prompt, fix the failing subtask), then re-run.
- `converged: false` after max rounds: the swarm did not reach a 3-layer consensus. Read `roundLog` for which leaves blocked.

**How to re-dispatch a single leaf:**
```bash
# 1. Identify the blocking leaf from results/ or the swarm roundLog.
# 2. Re-run just that leaf via the low-level GLM fleet:
node _SYSTEM/Scripts/glm-fleet.mjs --tasks '[{"lane":"glm","label":"01EN","prompt":"...revised prompt..."}]'
# 3. The new packet overwrites results/01EN.json; re-run convergence or read it directly.
```

**How to re-dispatch a full task:**
```bash
# Via CEO (re-runs the whole cast + dispatch):
node _SYSTEM/mure/ceo.mjs "the same task"   # (live, needs MURE armed)

# Via company.mjs with the original task file:
node _SYSTEM/mure/company.mjs --task-file original-task.json
```

**Stall detection (ceo.mjs --watch):** if no new result packets appear for 10 minutes, `--watch` reports a stall and stops polling (the run continues independently). Check `run.log` or the detached PID.

### 6.6 Programmatic API

```js
import { runCompany, planCompany, isMureArmed, MURE_NAME }
  from './_SYSTEM/mure/company.mjs';
import { buildTaskSpec, dispatchAsCeo, watchRun, renderReport }
  from './_SYSTEM/mure/ceo.mjs';

// CEO path in code: free text → spec → dispatch
const { task } = await buildTaskSpec('Build a feature module with tests.');
const result = await dispatchAsCeo(task, { dryRun: true });   // zero spend
// const result = await dispatchAsCeo(task, { dryRun: false }); // live (needs MURE armed)

// Lower-level: plan or dispatch directly
const plan = await planCompany(task);       // always safe (zero spend)
// const live = await runCompany(task);     // dispatches if MURE armed
```

### 6.7 Tests

```bash
# all MURE tests
node --test _SYSTEM/mure/*.test.mjs

# CEO-specific (hermetic, zero spend)
node --test _SYSTEM/mure/ceo.test.mjs

# DISARMED demo
node _SYSTEM/mure/mure.mjs --demo
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
