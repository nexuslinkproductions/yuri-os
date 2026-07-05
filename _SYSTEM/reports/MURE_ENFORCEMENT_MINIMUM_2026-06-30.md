# MURE Enforcement Minimum + GLM/Ollama Orchestration Build Plan

**Date:** 2026-06-30  
**Owner:** Marcel  
**Authority:** Master artifact — Cursor plans/commits; GLM + Ollama execute  
**Task file:** `02_RESOURCES/TASKS/mure-enforcement-build-master.json`

---

## A. Executive summary

### Why this document exists

YURI MURE has **shipped substantial infrastructure** (20-role roster, tri-substrate fleet, company-dispatch, BUILD_07 partial apply) but **honesty and wiring gaps** let manifests claim success while swarms failed (`finalizeOk: false`), MLP trained on empty labels, ollama sidecars were written but not spawned, and orchestrators slept blindly instead of polling job state.

Marcel authorized **one master artifact** that:

1. **Enforces minimum honesty invariants** — fail-closed dispatch, outcome-gated learning, manifest truth, completion polling.
2. **Static routing before smart routing** — affinity matrix, skill bindings, skeleton bind, capability preflight before MLP/MoA fantasies.
3. **Segments the build** into S0–S5 work Marcel or a GLM orchestrator can run sequentially or in safe parallel.
4. **Prescribes quad-substrate execution** — Ollama Cloud for bulk (Marcel wants heavy use), GLM for adjudication/architecture, native for owner cockpit, Cline optional sidecar.

**Division of labor:**

| Lane | Role |
|------|------|
| **Cursor** | Plan, review, commit, owner-gated arming, adversarial verify |
| **GLM fleet** | Implementation leaves (engineer, kernelsmith, mechanic), glm-max for architect/adjudicator only |
| **Ollama fleet** | Bulk scout/synthesist/chronicler/docs — `tier: flash` primary, `tier: minimax` for efficient drafts |
| **Marcel** | `finalize`, arming flags, `governance.mjs`, `git push` |

This doc is the **single routing source** for the enforcement-minimum build. Subtask prompts in `mure-enforcement-build-master.json` point here by section.

---

## B. Honesty invariants (enforce, don't overbuild)

These are **non-negotiable floors**. Implement them before any P2 smart-routing or game UI polish.

### B.1 company-dispatch fail-closed on `finalizeOk` + blocking

**Problem:** BUILD_07 streams marked `status: applied` while swarm `finalizeOk: false` (WS-C retry). Operators and MLP ingest false positives.

**Invariant:**

| Condition | Manifest behavior | Exit code |
|-----------|-------------------|-----------|
| `blockingHeld > 0` and no `--force-held-skip` | Stream `skipped-held`; do not apply | 0 (planned skip) |
| `visualGate.required && !satisfied` | Stream `skipped-visual-gate` | 0 |
| Apply completes but `swarm.finalizeOk === false` | Stream `status: applied-with-failures`; manifest `errors[]` entry; **dispatch exit 1** | 1 |
| `swarm.forced === true` | Record `finalizeReason`; `converged` must be false (swarm-convergence fail-closed) | — |
| Any leaf `blocking` in final roundLog | Surface in manifest `swarm.blockingLeaves[]` | — |

**Implementation target:** `_SYSTEM/mure/company-dispatch.mjs` — after `runFleet`, if `!result.run?.swarm?.finalizeOk`, set `entry.status = 'applied-with-failures'` and push to `manifest.errors`. CLI `process.exit(1)` when any stream has apply-with-failures.

**Test:** `_SYSTEM/mure/company-dispatch.test.mjs` — fixture manifest with `finalizeOk: false` → exit 1.

**Do not:** Auto-retry failed streams without owner packet; do not downgrade `finalizeOk` to advisory.

### B.2 MLP outcome gate (WS-J-K1)

**Problem:** `deriveLeafOutcome` trains on empty `.out` / missing `RESULT_LABEL` → garbage router gradients.

**Invariant:**

```text
IF resultLabel empty AND substantive text < threshold
  → { skipped: true, reason: 'empty-outcome' }
  → do NOT call updateFromOutcome
ALWAYS persist features[12] on recordPrediction
```

**Owner:** kernelsmith (`WS-J-K1-outcome-gate-kernelsmith`)  
**Evidence label:** `02J1_OUTCOME_GATE_X_PASS_COMMITTED`  
**DISARMED-safe:** gate logic runs; persist skipped when `mlp-learn` disarmed.

**Companion (P0.3):** held-out 80/20 Brier eval (`WS-J-C1-held-out-calibrator`) → `mlpFeedback.evalMeanBrier` on manifest.

### B.3 Manifest forced/blocking always recorded

Every dispatch manifest **must** include for each applied stream:

```json
{
  "swarm": {
    "runId": "swarm-…",
    "converged": false,
    "finalizeOk": false,
    "finalizeReason": "obligation-floor",
    "forced": false,
    "blockingLeaves": ["WS-C-R2-trends-charts"]
  },
  "mlpFeedback": {
    "persisted": true,
    "count": 4,
    "advisory": true,
    "evalMeanBrier": 0.18,
    "skippedOutcomes": 1
  }
}
```

**Already partial:** `finalizeOk`, `finalizeReason`, `forced` wired post-health-fix (`9938ff3a` glm-max timeout commit). **Still needed:** `blockingLeaves`, `skippedOutcomes`, fail-closed exit code.

### B.4 `wait-for-job.mjs` replaces blind sleeps

**Problem:** Orchestrators and subagents `sleep 65m` or poll manually; partial re-apply agent blocked on timer while dispatches were idle.

**Ship:** `_SYSTEM/Scripts/wait-for-job.mjs` (WS-H-M0-wait-script)

```bash
# Wait for swarm finish
node _SYSTEM/Scripts/wait-for-job.mjs \
  --run-id swarm-mr0in95e-c5e62b \
  --expect finishedAt \
  --timeout 7200000 \
  --poll-ms 5000

# Wait for specific leaf PASS label
node _SYSTEM/Scripts/wait-for-job.mjs \
  --run-id swarm-mr0in95e-c5e62b \
  --leaf WS-C-R2-trends-charts \
  --expect resultLabel \
  --timeout 1800000

# Wait for convergence honesty
node _SYSTEM/Scripts/wait-for-job.mjs \
  --run-id swarm-mr0in95e-c5e62b \
  --expect finalizeOk \
  --timeout 7200000
```

**Exit codes:** `0` = condition met · `1` = timeout · `2` = run failed (`finishedAt` + `!finalizeOk`)

**Rule:** GLM orchestrator scripts and Cursor terminal wrappers **must** use `wait-for-job.mjs` or Cursor `Await` with manifest poll — **never** fixed `sleep` for dispatch completion.

---

## C. Static routing before smart routing

Smart routing (MLP override, MoA aggregation, auto-evolver) is **P2**. Minimum build wires **declarative tables** first.

### C.1 `llm-affinity-matrix.json` (WS-K)

**Path:** `_SYSTEM/config/llm-affinity-matrix.json`  
**Producer:** `WS-K-P0-A1-affinity-architect` (glm-max, DISARMED config only)

**Schema (per role):**

```json
{
  "version": "2026-06-30",
  "disarmed": true,
  "roles": {
    "scout": {
      "primarySubstrate": "ollama",
      "primaryModel": "deepseek-v4-flash:cloud",
      "primaryTier": "flash",
      "fallbackChain": ["glm-flash", "glm"],
      "reasoningDepth": "shallow",
      "costTier": "bulk",
      "sidecarEligible": ["ollama"]
    },
    "architect": {
      "primarySubstrate": "glm",
      "primaryModel": "glm-5.2",
      "primaryLane": "glm-max",
      "fallbackChain": ["glm-sub-orch", "glm"],
      "reasoningDepth": "deep",
      "costTier": "premium",
      "sidecarEligible": []
    }
  }
}
```

**Consumption (P1+):** `role-registry.mjs` reads matrix in DISARMED advisory mode; `runFleet.mjs` substratePolicy (P2) auto-builds sidecars from `sidecarEligible`.

### C.2 `skill-role-bindings.json` (WS-K P1)

**Path:** `_SYSTEM/config/skill-role-bindings.json`  
**Producer:** `WS-K-P1-A1-skill-bindings-archivist`

```json
{
  "version": "2026-06-30",
  "disarmed": true,
  "bindings": [
    {
      "role": "adjudicator",
      "skills": ["adversarial-verification", "gitnexus-pr-review"],
      "trigger": ["adversarial-verify", "gap-detection"],
      "priority": 1
    },
    {
      "role": "kernelsmith",
      "skills": ["systematic-debugging", "tdd"],
      "trigger": ["implementation", "integration"],
      "priority": 1
    }
  ]
}
```

**Resolver:** `_SYSTEM/Scripts/skill-role-resolver.mjs` (`WS-K-P1-K1`)  
**Wire:** `planCompany` / `buildRolePrompt` advisory footer — skill titles + paths, not full SKILL.md inline unless &lt;2k tokens.

### C.3 `mure-skeleton-bind.json` (WS-I)

**Path:** `_SYSTEM/config/mure-skeleton-bind.json`  
**Producer:** `WS-I-A1-skeleton-bind-architect`

Maps each of 20 MURE roles → YURI layers L1–L14, circuitry node ids, adoption status (`WIRED|PARTIAL|STUB|MISSING`), wiring seams.

**Learning hook (L11):** `learningHook → prediction-ledger | work-ledger | memory-kernel-proposal`  
**Orchestration hook (L7):** `orchestrationHook → skill-role-resolver | llm-affinity-matrix`

WS-J P1 replay **requires** L11 metadata from this file.

### C.4 Capability + skill preflight in `planCompany`

Before casting leaves, `planCompany` should:

1. Run `node _SYSTEM/Scripts/capability-recall.mjs "<need>"` for each subtask `need[]` — log hits on plan JSON.
2. Run `skill-role-resolver.resolveSkillsForRole(role, need, taskClass)` when bindings exist — log `skillsLoaded[]`.
3. Optional: `node _SYSTEM/Scripts/xref-query.mjs "<task summary>"` — advisory log (WS-I-R1 spec); hard gate only when owner arms xref-preflight.

**DISARMED default:** log-only; zero spend; no blocking unless `YURI_XREF_PREFLIGHT_ENFORCE=1` (owner, not in P0).

---

## D. Observability M0 + preflight

### D.1 live-ops-aggregator + SSE :4270

**M0 deliverables (WS-H):**

| Component | Path | Role |
|-----------|------|------|
| Schema | `_SYSTEM/mure/live-ops-schema.json` | LiveSnapshot draft-07 |
| Aggregator | `_SYSTEM/Scripts/live-ops-aggregator.mjs` | `buildLiveSnapshot()`, `watchJobs({debounceMs:200})` |
| Server | `_SYSTEM/Scripts/work-dashboard.mjs` | `GET /api/live`, `GET /api/live/stream` (SSE) |
| UI | `_SYSTEM/mure/dashboard.html` | Lane strip panel (M0); cards M1 |
| Canonical port | **:4270** | `work-dashboard.mjs` — sole server; no split-brain |

**Aggregator inputs:**

- `.claude/jobs/*/manifest.json` + `results/*.json`
- `_SYSTEM/lane-output/**/manifest.json`

**SSE pattern:** Copy `observatory-server.mjs` `_sseClients` + fs.watch debounce + 2s heartbeat.

### D.2 `apply-preflight.mjs` checklist

**Ship:** `_SYSTEM/Scripts/apply-preflight.mjs` — run before any `--apply` dispatch.

| # | Check | Fail action |
|---|-------|-------------|
| 1 | `node _SYSTEM/mure/mure.mjs --validate` → ok | exit 1 |
| 2 | Held rulings: no unresolved blocking on target task file | exit 1 + list held ids |
| 3 | Visual-plan gate satisfied if `requiresVisualPlan` | exit 1 |
| 4 | Arm flags: `mure.enabled` if apply; glm-fleet if glm leaves; ollama if sidecar execute | warn or exit 1 |
| 5 | `pgrep` no stale `company-dispatch` / `runSwarm` on same `outDir` | warn |
| 6 | Disk: `.claude/jobs/` writable | exit 1 |
| 7 | Post-fix: glm-max timeout = 1_800_000 ms (30 min) per `glm-fleet.mjs` | warn if mismatch |
| 8 | MLP: if `--mlp-learn`, `mlp-learn.enabled` present | warn if disarmed |
| 9 | Output dry-run plan JSON valid (optional `--task-file`) | exit 1 |
| 10 | Print recommended `wait-for-job.mjs` command for orchestrator | info |

**Usage:**

```bash
node _SYSTEM/Scripts/apply-preflight.mjs \
  --task-file 02_RESOURCES/TASKS/mure-enforcement-build-master.json

node _SYSTEM/Scripts/apply-preflight.mjs --apply-ready \
  --task-file 02_RESOURCES/TASKS/mure-buildout-ws-f-router.json
```

**Owner-gated:** preflight does **not** arm flags or push git.

---

## E. Explicit DON'T BUILD YET table

| Item | Why defer | Revisit when |
|------|-----------|--------------|
| **MoA / SMoA / RouteMoA** new aggregation rounds | YURI has STAR topology + adjudicator; MoA adds echo-chamber risk | WS-K P2 after affinity + outcome gate GREEN |
| **New MURE roles** (router judge, MoA specialist) | Roster at 20 is doctrine; evolve via substrateProfiles | Persistent gap after P1 bind |
| **Rust / Tauri / egui game UI** | Node dashboard + SSE is M0–M1 path | WS-H M2+ after live feed GREEN |
| **Live evolver auto-execute** | Irreversible; goal-engine DISARMED | P2 + oracle + held ruling |
| **Auto-push / auto-commit** | Owner authority; mutation contract | Never for GLM lanes |
| **MLP route gate override** | Governance bypass risk | P2 + `YURI_MLP_ROUTE_GATE` + steward |
| **Evolutionary weight merge** | Wrong substrate for lane routing | evolver proposal only |
| **Fine-tune / LoRA routers** | Bandit MLP sufficient at current scale | RouterBench eval later |
| **Full MemGPT agent paging** | Track A kernel + propose pipeline exists | P2 archivist tools |
| **server.py promotion** | Fake data demo | Delete or quarantine |
| **Native Agent auto-spawn** | Stub packets today | Separate owner project |
| **DeepSeek as MURE substrate enum** | Advisory via llm-compat only | If affinity matrix names advisory lane |
| **Cline auto-spawn without owner** | Spend + IDE coupling | Manual or explicit `--cline-sidecar` + arm |
| **BUILD_08 public release tail** | Enforcement minimum first | After S4 GREEN |

---

## F. Minimum "done" state checklist (ordered)

Execute in order. Each step has an objective PASS signal.

| # | Step | PASS signal | Segment |
|---|------|-------------|---------|
| 1 | `wait-for-job.mjs` shipped + tests green | `02H5_WAIT_FOR_JOB_X_PASS_COMMITTED` | S0 |
| 2 | Outcome gate in `fleet-mlp-feedback.mjs` | `02J1_OUTCOME_GATE_X_PASS_COMMITTED` | S0 |
| 3 | company-dispatch fail-closed on `!finalizeOk` | test + manifest `applied-with-failures` | S0 |
| 4 | `apply-preflight.mjs` checklist runnable | preflight exits 0 on dry-run-all | S0 |
| 5 | `llm-affinity-matrix.json` validates (20 roles) | `02K1_AFFINITY_MATRIX_X_PASS_COMMITTED` | S1 |
| 6 | `skill-role-bindings.json` + resolver tests | `02K6` + `02K7` labels | S1 |
| 7 | `mure-skeleton-bind.json` oracle GREEN | `02I9_ORACLE_BIND_VERIFY_X_PASS_COMMITTED` | S2 |
| 8 | `live-ops-aggregator.mjs` + SSE wired | `02H2` + `02H3` labels | S3 |
| 9 | Lane strip UI live on :4270 | `02H4` + `02H6` labels | S3 |
| 10 | WS-B retry confirmed GREEN (already done) | `finalizeOk: true` in manifest | S4 |
| 11 | WS-C R2 + H1 re-run GREEN | `02C2` + H1 label present | S4 |
| 12 | WS-F router dispatch complete | `dispatch-retry-ws-f` manifest | S4 |
| 13 | WS-G Cline pass re-run post-timeout-fix | glm-max leaves non-empty text | S4 |
| 14 | Held-out Brier on manifest | `02J2_HELD_OUT_BRIER_X_PASS_COMMITTED` | S5 |
| 15 | planCompany skill/capability preflight logged | `02K8` or SKELETON_BIND_SPEC | S5 |
| 16 | Steward P0 gates documented | `02I7` + `02K5` | S5 |
| 17 | Chronicler operator guide | `02_RESOURCES/GUIDES/mure-enforcement-minimum.md` | S5 |

**Minimum GREEN definition:** Steps 1–4 + 8–9 + 10–12 complete; S1/S2 config files exist DISARMED; no `applied-with-failures` without acknowledged owner ruling.

---

## G. GLM ORCHESTRATION INSTRUCTIONS

**Critical section.** GLM orchestrator (Marcel or helmsman packet) runs segments using **quad-substrate** mix.

### G.0 Substrate reference

#### Ollama Cloud (primary bulk — Marcel wants heavy use)

| tier | Model | Use |
|------|-------|-----|
| `flash` | `deepseek-v4-flash:cloud` | **PRIMARY bulk** — scout, synthesist, audits, docs — blast freely |
| `minimax` | `minimax-m3:cloud` | Efficient generalist — architect drafts, deliberator reads |
| `kimi` | `kimi-k2.7-code:cloud` | Code-heavy scouts |
| `nemotron` | `nemotron-3-ultra:cloud` | Heavy reasoning (sparingly) |

**Arm:**

```bash
export YURI_OLLAMA_FLEET=1
# OR
touch _SYSTEM/state/ollama-fleet.enabled
```

**Entry:**

```bash
node _SYSTEM/Scripts/ollama-fleet.mjs \
  --tasks-file /path/to/ollama-tasks.json \
  --concurrency 3
```

**Orchestrator rule:** When `company-dispatch.mjs --ollama-sidecar` or `runFleet.mjs --ollama-sidecar` writes `ollama-tasks.json`, GLM orchestrator **must spawn** `ollama-fleet.mjs` after write — **not** leave manual.

```bash
# After runFleet / company-dispatch writes sidecar file:
TASKS=".claude/jobs/fleet-${RUN_ID}/ollama-tasks.json"
YURI_OLLAMA_FLEET=1 node _SYSTEM/Scripts/ollama-fleet.mjs \
  --tasks-file "$TASKS" \
  --concurrency 3 &
OLLAMA_PID=$!
# Continue glm runSwarm; wait for sidecar before finalize:
wait $OLLAMA_PID
```

#### GLM lanes (z.ai)

| Lane | Use |
|------|-----|
| `glm-flash` / `glm-turbo` | Fast leaves — scout, mechanic, chronicler |
| `glm` | Workhorse engineer, kernelsmith |
| `glm-max` | **Adjudicator + architect only** — 30 min timeout (`9938ff3a`) |

**Arm:**

```bash
export YURI_GLM_FLEET=1
export YURI_SWARM_CONVERGENCE=1   # when convergence enforcement wanted
# OR
touch _SYSTEM/state/glm-fleet.enabled
touch _SYSTEM/state/swarm-convergence.enabled
```

**Concurrency guidance:**

| Substrate | Concurrency | Notes |
|-----------|-------------|-------|
| ollama flash bulk | **3–4** | Ollama Pro ceiling ≈3; 4 if stable |
| ollama minimax | **2** | Heavier tokens |
| glm-flash / glm | **2–3** | z.ai plan limits |
| glm-max | **1–2** | Never 3 concurrent glm-max on heavy prompts |

### G.1 Example `ollama-tasks.json` shape

```json
[
  {
    "tier": "flash",
    "label": "S1-SYNTH-LATTICE",
    "prompt": "Read _SYSTEM/reports/MURE_ENFORCEMENT_MINIMUM_2026-06-30.md §G.2 Segment S1. Synthesize substrate lattice mermaid. Return 02K3_SUBSTRATE_LATTICE_X_PASS_COMMITTED."
  },
  {
    "tier": "flash",
    "label": "S1-SCOUT-SKILLS",
    "prompt": "Audit .claude/skills vs skills/ mirror drift per WS-K-P1-S1. Return 02K9_SKILL_MIRROR_AUDIT_X_PASS_COMMITTED."
  },
  {
    "tier": "minimax",
    "label": "S2-SKELETON-DRAFT",
    "prompt": "Draft mure-skeleton-bind.json structure from YURI_DIGITAL_COMPANY_SKELETON report. DISARMED config only. Return 02I1_SKELETON_BIND_MAP_X_PASS_COMMITTED."
  }
]
```

```bash
YURI_OLLAMA_FLEET=1 node _SYSTEM/Scripts/ollama-fleet.mjs \
  --tasks-file _SYSTEM/lane-output/segment-s1/ollama-tasks.json \
  --concurrency 3
```

### G.2 Example `company-dispatch` commands

**Dry-run (always first):**

```bash
node _SYSTEM/mure/company-dispatch.mjs \
  --dry-run-all \
  --ollama-sidecar \
  --out _SYSTEM/lane-output/dispatch-dryrun-$(date +%Y%m%d)
```

**Apply single stream (BUILD_07 retry):**

```bash
node _SYSTEM/Scripts/apply-preflight.mjs \
  --apply-ready \
  --task-file 02_RESOURCES/TASKS/mure-buildout-ws-f-router.json

YURI_GLM_FLEET=1 YURI_SWARM_CONVERGENCE=1 \
node _SYSTEM/mure/company-dispatch.mjs \
  --apply \
  --mlp-learn \
  --ollama-sidecar \
  --task-file 02_RESOURCES/TASKS/mure-buildout-ws-f-router.json \
  --out _SYSTEM/lane-output/dispatch-retry-ws-f
```

**Post-dispatch wait (never sleep):**

```bash
RUN_ID=$(jq -r '.streams[0].swarm.runId' \
  _SYSTEM/lane-output/dispatch-retry-ws-f/dispatch-*/manifest.json)

node _SYSTEM/Scripts/wait-for-job.mjs \
  --run-id "$RUN_ID" \
  --expect finalizeOk \
  --timeout 7200000 \
  --poll-ms 5000
echo "exit=$?"   # 0=GREEN 1=timeout 2=failed
```

**Enforcement master segment apply:**

```bash
node _SYSTEM/Scripts/apply-preflight.mjs \
  --task-file 02_RESOURCES/TASKS/mure-enforcement-build-master.json

YURI_GLM_FLEET=1 node _SYSTEM/Scripts/runFleet.mjs \
  --task-file 02_RESOURCES/TASKS/mure-enforcement-build-master.json \
  --segment S0 \
  --dry-run
```

### G.3 Segment S0 — Outcome gate + dispatch fail-closed + wait-for-job

| Field | Value |
|-------|-------|
| **Work** | Honesty floor — no learning on lies, no silent apply failures, no blind waits |
| **Primary substrate** | GLM engineer + kernelsmith |
| **Parallel?** | **Solo first** — sequential subtasks |

**Env exports:**

```bash
export YURI_GLM_FLEET=1
# Do NOT arm mlp-learn until outcome gate merged
unset YURI_OLLAMA_FLEET   # S0 is GLM-only implementation
```

**WS mappings:**

| Master subtask | Source WS | Role |
|----------------|-----------|------|
| MURE-S0-01-wait-for-job | WS-H `WS-H-M0-wait-script` | kernelsmith |
| MURE-S0-02-outcome-gate | WS-J `WS-J-K1-outcome-gate-kernelsmith` | kernelsmith |
| MURE-S0-03-held-out-brier | WS-J `WS-J-C1-held-out-calibrator` | calibrator |
| MURE-S0-04-dispatch-fail-closed | NEW — company-dispatch.mjs | mechanic |
| MURE-S0-05-apply-preflight | NEW — apply-preflight.mjs | engineer |
| MURE-S0-06-bandit-doc | WS-J `WS-J-D1-bandit-policy-deliberator` | deliberator |

**Concurrency:** glm-max **1** (calibrator/deliberator); glm-flash **2** for mechanic tests.

**Exit criteria:** Steps 1–4 in §F checklist GREEN.

---

### G.4 Segment S1 — llm-affinity-matrix + skill-role-bindings (DISARMED docs)

| Field | Value |
|-------|-------|
| **Work** | Static routing tables — config only, no fleet-roles.json mutation |
| **Primary substrate** | Ollama **flash** (scout/synthesist) ∥ GLM **glm-max** (architect) |
| **Parallel?** | **Yes** — flash bulk parallel with single glm-max architect |

**Env exports:**

```bash
export YURI_OLLAMA_FLEET=1
export YURI_GLM_FLEET=1
```

**Parallel launch pattern:**

```bash
# Terminal A — ollama flash bulk (3 concurrent)
YURI_OLLAMA_FLEET=1 node _SYSTEM/Scripts/ollama-fleet.mjs \
  --tasks-file 02_RESOURCES/TASKS/segments/s1-ollama-flash.json \
  --concurrency 3 &

# Terminal B — glm-max architect (solo)
YURI_GLM_FLEET=1 node _SYSTEM/Scripts/runFleet.mjs \
  --task-file 02_RESOURCES/TASKS/segments/s1-glm-architect.json \
  --apply
```

**WS mappings:**

| Master subtask | Source WS |
|----------------|-----------|
| MURE-S1-01-affinity-matrix | WS-K `WS-K-P0-A1-affinity-architect` |
| MURE-S1-02-registry-patch-proposal | WS-K `WS-K-P0-R1-registry-patch-architect` |
| MURE-S1-03-substrate-lattice | WS-K `WS-K-P0-S1-synthesist-lattice` → **ollama flash** |
| MURE-S1-04-moa-adoption-note | WS-K `WS-K-P0-D1-moa-deliberator` → glm-max |
| MURE-S1-05-steward-gate-p0 | WS-K `WS-K-P0-ST1-steward-gate` |
| MURE-S1-06-skill-bindings | WS-K `WS-K-P1-A1-skill-bindings-archivist` → native/flash |
| MURE-S1-07-skill-resolver | WS-K `WS-K-P1-K1-resolver-kernelsmith` |
| MURE-S1-08-skill-mirror-audit | WS-K `WS-K-P1-S1-scout-skill-audit` → **ollama flash** |

**DISARMED:** All JSON outputs tagged `"disarmed": true` until steward gate PASS.

---

### G.5 Segment S2 — skeleton-bind.json

| Field | Value |
|-------|-------|
| **Work** | 14-layer role map + lattice + telos stub |
| **Primary substrate** | Ollama **minimax** (architect draft) → GLM **steward/oracle** review |
| **Parallel?** | **Sequential** — minimax draft then glm review |

**Env exports:**

```bash
export YURI_OLLAMA_FLEET=1
export YURI_GLM_FLEET=1
```

**Flow:**

1. minimax drafts `mure-skeleton-bind.json` + lattice md (WS-I-A1, WS-I-S1)
2. glm-max oracle verifies (WS-I-O1)
3. glm steward gate (WS-I-ST1)

**WS mappings:**

| Master subtask | Source WS | Substrate |
|----------------|-----------|-----------|
| MURE-S2-01-skeleton-bind | WS-I `WS-I-A1-skeleton-bind-architect` | ollama-minimax |
| MURE-S2-02-skeleton-lattice | WS-I `WS-I-S1-synthesist-lattice` | ollama-minimax |
| MURE-S2-03-telos-stub | WS-I `WS-I-E1-envoy-telos-stub` | glm |
| MURE-S2-04-xref-preflight-spec | WS-I `WS-I-R1-scout-xref-preflight` | ollama-flash |
| MURE-S2-05-plan-hook-spec | WS-I `WS-I-K1-kernelsmith-plan-hook` | glm |
| MURE-S2-06-graph-register-proposal | WS-I `WS-I-M1-mechanic-graph-register` | glm |
| MURE-S2-07-steward-gate | WS-I `WS-I-ST1-steward-gate` | glm-max |
| MURE-S2-08-oracle-verify | WS-I `WS-I-O1-oracle-bind-verify` | glm-max |
| MURE-S2-09-adjudicator-gap | WS-I `WS-I-V1-adjudicator-gap-pass` | glm-max |
| MURE-S2-10-chronicler-handoff | WS-I `WS-I-C1-chronicler-handoff` | ollama-flash |

---

### G.6 Segment S3 — live-ops-aggregator M0

| Field | Value |
|-------|-------|
| **Work** | Read-only live feed — aggregator, SSE, lane strip, wait-for-job (if not S0) |
| **Primary substrate** | GLM engineer + mechanic; Ollama flash chronicler docs |
| **Parallel?** | Engineer/mechanic sequential; flash docs parallel after API contract |

**Env exports:**

```bash
export YURI_GLM_FLEET=1
# Dashboard server — no fleet arm needed
node _SYSTEM/Scripts/work-dashboard.mjs --serve &
```

**WS mappings:**

| Master subtask | Source WS | Substrate |
|----------------|-----------|-----------|
| MURE-S3-01-live-ops-contract | WS-H `WS-H-A1-architect-contract` | glm-max |
| MURE-S3-02-aggregator | WS-H `WS-H-M0-aggregator` | glm engineer |
| MURE-S3-03-sse-wire | WS-H `WS-H-M0-sse-wire` | glm mechanic |
| MURE-S3-04-lane-strip-ui | WS-H `WS-H-M0-lane-strip-ui` | glm artificer |
| MURE-S3-05-m0-verify | WS-H `WS-H-M0-scout-verify` | glm scout |

**Verify:**

```bash
curl -s http://localhost:4270/api/live | jq '.runs[0]'
curl -N http://localhost:4270/api/live/stream | head -5
```

---

### G.7 Segment S4 — BUILD_07 re-apply closure

| Field | Value |
|-------|-------|
| **Work** | WS-B done; re-run WS-C failures, WS-F not-started, WS-G post-timeout |
| **Primary substrate** | GLM glm-max + ollama flash for native-eligible scouts |
| **Parallel?** | **Sequential streams** — one company-dispatch per WS file |

**Status (2026-06-30 partial re-apply):**

| Stream | Status | Action |
|--------|--------|--------|
| WS-B | **GREEN** | None |
| WS-C | **YELLOW/RED** | Re-run R2, H1 leaves |
| WS-F | **not-started** | Full dispatch |
| WS-G | forced-stop history | Re-run post `9938ff3a` |

**Env exports:**

```bash
export YURI_GLM_FLEET=1
export YURI_SWARM_CONVERGENCE=1
export YURI_OLLAMA_FLEET=1
touch _SYSTEM/state/mlp-learn.enabled   # only after S0 outcome gate
```

**WS-C partial retry:**

```bash
# Option A: single-leaf retry via runFleet subset
YURI_GLM_FLEET=1 node _SYSTEM/Scripts/runFleet.mjs \
  --task-file 02_RESOURCES/TASKS/mure-buildout-ws-c-visual.json \
  --only-leaves WS-C-R2-trends-charts,WS-C-H1-held-queue-stub \
  --apply --ollama-sidecar

# Option B: full stream re-dispatch
YURI_GLM_FLEET=1 node _SYSTEM/mure/company-dispatch.mjs \
  --apply --mlp-learn --ollama-sidecar \
  --task-file 02_RESOURCES/TASKS/mure-buildout-ws-c-visual.json \
  --out _SYSTEM/lane-output/dispatch-retry-ws-c-2
```

**WS-F launch:**

```bash
node _SYSTEM/Scripts/apply-preflight.mjs --apply-ready \
  --task-file 02_RESOURCES/TASKS/mure-buildout-ws-f-router.json

YURI_GLM_FLEET=1 node _SYSTEM/mure/company-dispatch.mjs \
  --apply --mlp-learn --ollama-sidecar \
  --task-file 02_RESOURCES/TASKS/mure-buildout-ws-f-router.json \
  --out _SYSTEM/lane-output/dispatch-retry-ws-f
```

**Ollama sidecar for WS-F scouts:** After dispatch writes `ollama-tasks.json`, spawn fleet (§G.0 rule).

**WS mappings:** `mure-buildout-ws-c-visual.json`, `mure-buildout-ws-f-router.json`, `mure-buildout-ws-g-cline-pass.json` — full subtask lists in each file.

---

### G.8 Segment S5 — WS-I/J/K remaining P0 subtasks

| Field | Value |
|-------|-------|
| **Work** | Close P0 gaps per affinity matrix — wiring, verification, chronicler |
| **Primary substrate** | Mix per `llm-affinity-matrix.json` |
| **Parallel?** | Per-task-file; use master JSON `substrateHint` |

**WS mappings (P0/P1 not done in S0–S4):**

| WS | Remaining P0 items |
|----|------------------|
| WS-J | K1, C1, D1 (if not S0), A1, K2, C2, S1, A2 |
| WS-K | P1-M1 plan hook, P1-ADJ1 review, P2 items (DISARMED) |
| WS-I | M1 graph proposal, D1 order effect, EV1 evolver proposal |
| WS-H | M1+ (defer M2 game UI per §E) |

**Affinity routing examples:**

| Subtask class | substrateHint |
|---------------|---------------|
| kernelsmith implementation | glm |
| scout audit | ollama-flash |
| architect contract | glm-max |
| synthesist lattice | ollama-flash |
| chronicler docs | ollama-flash |
| adjudicator verify | glm-max |
| steward gate | glm-max |

---

### G.9 GLM orchestrator session template

```bash
#!/usr/bin/env bash
# mure-segment-runner.sh — Marcel/GLM orchestrator helper
set -euo pipefail
cd /Users/marcelspatz/YURI-OS-MUSUBI
SEGMENT="${1:?S0|S1|S2|S3|S4|S5}"

node _SYSTEM/Scripts/apply-preflight.mjs \
  --task-file 02_RESOURCES/TASKS/mure-enforcement-build-master.json

case "$SEGMENT" in
  S0)
    export YURI_GLM_FLEET=1
    YURI_GLM_FLEET=1 node _SYSTEM/Scripts/runFleet.mjs \
      --task-file 02_RESOURCES/TASKS/mure-enforcement-build-master.json \
      --filter-segment S0 --apply
    ;;
  S1)
    export YURI_OLLAMA_FLEET=1 YURI_GLM_FLEET=1
    YURI_OLLAMA_FLEET=1 node _SYSTEM/Scripts/ollama-fleet.mjs \
      --tasks-file _SYSTEM/lane-output/segment-s1/ollama-tasks.json --concurrency 3 &
    YURI_GLM_FLEET=1 node _SYSTEM/Scripts/runFleet.mjs \
      --task-file 02_RESOURCES/TASKS/mure-enforcement-build-master.json \
      --filter-segment S1 --apply
    wait
    ;;
  # S2–S5: see §G.4–G.8
esac
```

**Note:** `--filter-segment` is orchestrator convention; implement in runFleet or filter task JSON before invoke.

---

## H. Cross-reference table

| Report | Path | Feeds segment |
|--------|------|---------------|
| Digital company skeleton | `_SYSTEM/reports/YURI_DIGITAL_COMPANY_SKELETON_2026-06-30.md` | S2 |
| Active learning + memory | `_SYSTEM/reports/YURI_ACTIVE_LEARNING_MEMORY_2026-06-30.md` | S0, S5 |
| Skills + orchestration | `_SYSTEM/reports/YURI_SKILLS_ORCHESTRATION_UPGRADE_2026-06-30.md` | S1 |
| Live ops dashboard | `_SYSTEM/reports/MURE_LIVE_OPS_DASHBOARD_RESEARCH_2026-06-30.md` | S3 |
| Partial re-apply status | `_SYSTEM/reports/MURE_PARTIAL_REAPPLY_2026-06-30.md` | S4 |
| Company health | `_SYSTEM/reports/MURE_COMPANY_HEALTH_2026-06-30.md` | S0, S4 |
| Ollama sidecar wiring | `_SYSTEM/reports/OLLAMA_SIDECAR_WIRING_2026-06-30.md` | S1, S4 |
| GLM-max timeout debug | `_SYSTEM/reports/GLM_MAX_TIMEOUT_DEBUG_2026-06-30.md` | S4 |
| BUILD_07 operational | `_SYSTEM/reports/MURE_COMPANY_BUILD_07_OPERATIONAL.md` | S4 |
| BUILD_02 rewire | `_SYSTEM/reports/MURE_COMPANY_BUILD_02_REWIRE.md` | S1 |

**Task JSON sources:**

| File | WS |
|------|-----|
| `02_RESOURCES/TASKS/yuri-active-learning-ws-j-memory.json` | WS-J |
| `02_RESOURCES/TASKS/yuri-skills-orchestration-ws-k-upgrade.json` | WS-K |
| `02_RESOURCES/TASKS/yuri-skeleton-adoption-ws-i-foundation.json` | WS-I |
| `02_RESOURCES/TASKS/mure-live-ops-dashboard-ws-h-visual.json` | WS-H |
| `02_RESOURCES/TASKS/mure-buildout-ws-{a,b,c,d,f,g}-*.json` | BUILD_07 |
| `02_RESOURCES/TASKS/mure-enforcement-build-master.json` | **This plan** |

---

## I. Owner-gated boundaries (unchanged)

| Action | Who | GLM/Ollama may NOT |
|--------|-----|---------------------|
| `finalize` / held-ruling ratification | Marcel | Auto-ratify held subtasks |
| Arming flags (`*.enabled`) | Marcel | `touch _SYSTEM/state/*.enabled` without packet |
| `governance.mjs` mutations | Marcel | Bypass 6-gate |
| `git push` | Marcel | Push to remote |
| `git commit` | Cursor session with owner auth | `git add .` sweep |
| MURE `--apply` on production streams | Marcel arms `mure.enabled` | Apply when disarmed |
| MLP persist | Marcel arms `mlp-learn.enabled` | Train before outcome gate |
| Evolver execute | Marcel + oracle | Auto goal execute |
| Protected paths | Nobody | Read/write `backend/data`, `.env`, etc. |

**Fail-closed reminder:** When in doubt, DISARMED dry-run + manifest review in Cursor beats armed GLM spend.

---

*End of MURE Enforcement Minimum master artifact.*
