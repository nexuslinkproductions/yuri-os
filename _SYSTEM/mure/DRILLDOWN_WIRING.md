# MURE Dashboard — Drilldown Wiring

## Status: WIRED ✅

The `_SYSTEM/mure/dashboard.html` is fully wired to backend API endpoints:

### Endpoints

| Endpoint | Purpose | Handler | Drawer Trigger |
|----------|---------|---------|----------------|
| `GET /api/run?id=<run_id>` | Run detail with role outputs and artifacts | `openRun(run)` | Click on run row in convergence stream |
| `GET /api/artifacts?role=<role_id>&limit=N` | Recent artifacts filtered by role | `openRole(role)` | Click on role node in constellation |
| `GET /api/trends?type=<throughput\|convergence\|productivity>` | Trend data for insights panel | `loadTrends()` | Auto-load on tick (every 3s) |
| `GET /api/overview` | Company state, roles count, runs list | `tick()` poll | Auto-refresh every 3s |

### Drawer UI

The detail drawer slides from right (420px, NEXUS LINK style) with:

- **Run drawer**: summary, status, rounds, leaf count, convergence flag, finish time, role tags, role outputs, artifact list
- **Role drawer**: name, archetype, group, substrate/lane, autonomy class, status, activity metrics (runs/artifacts), capabilities list, recent artifacts
- **Job drawer**: title, type, state, owner-gated badge, openmass, priority-score, priority, source, doctrine axes, detail, next action, closure condition, report

Close via: scrim click, `×` button, or `Escape` key.

### Server

The dashboard is served by `_SYSTEM/Scripts/work-dashboard.mjs` (Node stdlib, zero deps):

- Serves dashboard at `http://127.0.0.1:4270` (default port; override with `--port`)
- Serves the GLM-5.2-designed `_SYSTEM/mure/dashboard.html`; falls back to a built-in placeholder if absent
- No-cache headers for fresh data
- Endpoint handlers are in-work (demo data + polling stubs); see `@exports: startServer, DEFAULT_PORT, HTML_PATH`

Run: `node _SYSTEM/Scripts/work-dashboard.mjs --serve [--port 4270] [--html <path>]`

> **Canonical server:** `_SYSTEM/Scripts/work-dashboard.mjs` on `:4270`. A parallel lane is wiring the dashboard endpoints to live MURE runtime data.

### Integration Style

Matches NEXUS LINK patterns from `03_NEXUS-LINK/nexus-app/`:

- Design tokens from `nexus-app/ui/styles.css`
- `fetchJson` helper wrapper with error handling
- Panel elevation via `surf-*` classes
- Drawer transition via `transform: translateX(100%)`
- Mono labels with `letter-spacing` and `text-transform: uppercase`

### Data Flow

```
User clicks run row
  → openRun(run) called
  → fetchJson('/api/run?id=' + run.id)
  → server returns run detail + artifacts
  → showDrawer() renders HTML
  → drawer opens with backdrop blur
```

```
User clicks role node
  → openRole(role) called
  → fetchJson('/api/artifacts?role=' + role.id + '&limit=8')
  → server returns filtered artifacts
  → showDrawer() renders role metadata + artifacts
  → drawer opens
```

```
Auto tick (every 3s)
  → loadTrends(false) calls 3 fetchJson in parallel
  → /api/trends?type=throughput|convergence|productivity
  → renderInsights() updates charts
  → /api/overview updates company state, runs list
  → renderRuns(), renderKpis(), updateStar()
```

## Evidence

- `openRun` at line 675: `/api/run?id=` fetch
- `openRole` at line 703: `/api/artifacts?role=` fetch
- `loadTrends` at line 342: `/api/trends?type=` parallel fetch
- Drawer styles at lines 191-203: scrim, drawer, dnm, darch, dmeta, dsec
- Close handlers at line 744: scrim click, dx click, Escape key
- Tick loop at line 772: `setInterval(tick, 3000)`

## Next Steps

Replace demo data in `work-dashboard.mjs` endpoints with real MURE runtime:

- run detail → query MURE run store (`.claude/jobs/<runId>/results/*.json`)
- artifacts → scan artifact / results directory
- trends → compute from run history
- overview → load run manifest + role outputs

> The `_SYSTEM/mure/server.py` referenced here in earlier drafts does not exist; all dashboard serving is via `work-dashboard.mjs` on `:4270`.

---

## MLP Bandit Contract — Router Learning Loop

**Status: WIRED ✅ (advisory default) · Source: MURE_ENFORCEMENT_MINIMUM §B.2**

The fleet router is a **contextual bandit with partial feedback**: at each dispatch, the MLP scores every candidate substrate, picks the best, and observes the outcome only for the arm it pulled. It never observes counterfactual outcomes for substrates not tried. This is the fundamental learning constraint.

### Mechanism Map

The loop spans four modules. Data flows left-to-right; governance can veto at any point.

```
planCompany (company.mjs)
  │
  ├─ recordMlpPredictions()  ──→  prediction-ledger.jsonl  [features[12] ALWAYS persisted]
  │      fleet-mlp-feedback.mjs       recordPrediction()
  │
  ├─ runFleet() dispatch ────→  swarm pool / native results  [actual substrate chosen]
  │
  ├─ recordMlpOutcomesFromRun()
  │      │
  │      ├─ deriveLeafOutcome(leafId, runResult)
  │      │     │
  │      │     ├─ WS-J-K1 GATE: if resultLabel empty AND text < 16 chars
  │      │     │    → { skipped: true, reason: 'empty-outcome' }
  │      │     │    → do NOT call updateFromOutcome
  │      │     │
  │      │     └─ else → { success, quality, actualSubstrate, resultLabel }
  │      │
  │      ├─ recordOutcome()  ──→  prediction-ledger.jsonl  [if armed + predId exists]
  │      │
  │      └─ router.updateFromOutcome(feats, decision, outcome)
  │             fleet-router-mlp.mjs   [online gradient descent, lr=0.02 default]
  │
  └─ runPostTrainSummary()  ──→  trainFleetRouterFromLedger()
         (armed only)                 batch replay from ledger, multi-epoch

Governance (governance.mjs · 6-gate charter) ALWAYS WINS over MLP routing.
MLP is advisory; hard gates (reversibility, blast radius, contention, doctrine,
protected paths, outward-facing) are evaluated independently and can veto
any routing suggestion regardless of MLP confidence.
```

### The Bandit Contract

| Property | Implementation | Evidence (path:line) |
|---|---|---|
| **Partial feedback** | Only the dispatched substrate's outcome is observed; counterfactual substrates produce no signal. One arm pulled per leaf per dispatch. | `fleet-mlp-feedback.mjs`: `deriveLeafOutcome` reads from `pool[leafId]` or `nativePool[leafId]` — single substrate, never both |
| **Governance wins** | MLP `predictRoute` output is advisory. `evaluateGovernance()` runs the 6-gate charter independently. Any gate failure overrides the router suggestion. | `governance.mjs:75`: "SELF-GOVERNABLE iff (no constitution veto) AND (all six gates pass)"; `fleet-router-mlp.mjs` header: "ADVISORY only … Hard governance … always wins" |
| **Advisory default** | DISARMED unless `YURI_MLP_LEARN=1` or `_SYSTEM/state/mlp-learn.enabled`. Dry-run computes error on a structuredClone — never mutates the singleton weights. | `fleet-mlp-feedback.mjs:shouldPersistMlpLearn()`; `fleet-router-mlp.mjs:updateFromOutcome()`: `persist ? liveWeights : structuredClone(liveWeights)` |
| **Outcome gate (WS-J-K1)** | Empty RESULT_LABEL + substantive text < 16 chars → `{ skipped: true, reason: 'empty-outcome' }`. `updateFromOutcome` is NOT called. Prevents garbage gradients. | `fleet-mlp-feedback.mjs:deriveLeafOutcome()`: `OUTCOME_TEXT_MIN = 16` |
| **Features always persisted** | `features[12]` array stored in prediction-ledger on every `recordPrediction` call, regardless of arm posture. Enables offline replay training even from DISARMED runs. | `fleet-mlp-feedback.mjs:recordMlpPredictions()`: `features: feats` passed to `recordPrediction`; `prediction-ledger.mjs:recordPrediction()`: `features: input.features ?? null` |
| **Skipped outcomes counted** | Each `outcome.skipped` increments `skippedOutcomes` in the feedback summary. Surfaced on manifest as `mlpFeedback.skippedOutcomes`. | `fleet-mlp-feedback.mjs:recordMlpOutcomesFromRun()`: `skippedOutcomes++` |
| **Brier calibration** | Prediction-ledger `scorePrediction` computes mean Brier score over hits/false-alarms/misses. `calibrationReport` aggregates per-confidence-bucket. | `prediction-ledger.mjs:scorePrediction()`: `(p.confidence - matched ? 1 : 0) ** 2` |
| **Held-out eval (P0.3)** | `evalMeanBrier` on manifest — planned companion (WS-J-C1). Ledger supports it via `calibrationReport`; wiring to manifest field is the gap. | `MURE_ENFORCEMENT_MINIMUM §B.2`: "held-out 80/20 Brier eval → `mlpFeedback.evalMeanBrier`"; NOT yet wired in `company-dispatch.mjs` mlpFeedback block |

### MLP Architecture (12→8→1)

| Layer | Size | Activation | Evidence |
|---|---|---|---|
| Input | 12 features | — | `FEATURE_NAMES` array in `fleet-router-mlp.mjs` |
| Hidden | 8 | ReLU | `HIDDEN_SIZE = 8`; `relu(x)` |
| Output | 1 (suitability score) | linear | `forward()`: `out += h[j] * w2[j]` |

Feature vector (`extractFeatures`, indices stable):

| Idx | Feature | Range | Signal |
|---|---|---|---|
| 0 | complexity | 0–1 | SmartRouter or heuristic |
| 1 | blastRadius | 0/0.5/1 | LOW/MEDIUM/HIGH |
| 2 | capabilityMatch | 0–1 | role-registry match |
| 3 | historicalSuccess | 0–1 | rolling (role, substrate) success rate |
| 4 | quotaPressure | 0–1 | higher → prefer cheaper lane |
| 5 | evidenceDecidability | 0–1 | governance pre-filter |
| 6 | expectedToolTurns | 0–1 | prompt length + role archetype |
| 7 | recursionDepth | 0–1 | 0=leaf, 1–5=sub-orchestration |
| 8 | isHeavyReasoning | 0/1 | adjudicator/architect/deliberator/helmsman |
| 9 | isBulkCensus | 0/1 | scout/artificer/bulk |
| 10 | isSecurityAudit | 0/1 | sentinel/security |
| 11 | isNativeOnly | 0/1 | requires MCP/browser/computer-use |

### Update Rule

Online gradient descent (backprop through ReLU, rough):

```
target = success * quality
err    = target - forward(features).score
w2[j] += lr * err * hidden[j]        // output layer
b2    += lr * err
w1[i][j] += lr * err * w2[j] * relu'(hidden[j]) * features[i] * 0.5   // hidden layer
```

- `lr` default = 0.02 (per-leaf online); `0.015` with decay `lr/(1+epoch*0.5)` (batch replay)
- `persist=false` → operates on `structuredClone`, singleton `_weights` untouched
- Batch replay: `train-fleet-router-from-ledger.mjs` re-reads ledger, reconstructs features from `pred.features` (or heuristic fallback), runs N epochs

### DISARMED Behavior (default)

When MLP is DISARMED (no `YURI_MLP_LEARN=1`, no `mlp-learn.enabled` flag):

1. `recordMlpPredictions` — features[12] **still persisted** to ledger (observation cost is zero)
2. `recordMlpOutcomesFromRun` — `updateFromOutcome` called with `persist: false` → clone, compute error, discard
3. Weights file (`fleet-router-weights.json`) **never touched**
4. Manifest reports `mlpFeedback.advisory: true`, `persisted: false`

This means: cold weights are random (Xavier-ish seed `0xC0FFEE`), routing falls back to deterministic math-bridge scoring + role-registry match + substrate heuristic biases. The MLP only becomes load-bearing after the owner arms learning AND enough labeled outcomes accumulate in the ledger.

### What This Is NOT

- **Not a route gate.** MLP never overrides governance, held-rulings, or owner-gated subtasks. `evaluateGovernance` runs independently.
- **Not full feedback.** No counterfactual estimation (no inverse propensity weighting, no doubly-robust). Only the pulled arm generates a gradient.
- **Not exploration.** The router scores-and-picks greedily (`scored.sort((a,b) => b.score - a.score)`). No ε-greedy, no UCB, no Thompson sampling. Cold weights are effectively random, which provides incidental exploration until the owner arms learning.
- **Not a replacement for static routing.** Affinity matrix (`llm-affinity-matrix.json`) and skill-role-bindings are the P0 routing source. MLP override is explicitly P2 (§E DON'T BUILD YET table: "MLP route gate override — Governance bypass risk — P2 + `YURI_MLP_ROUTE_GATE` + steward").

### Current Wiring Gaps (from §B.2/B.3)

| Gap | Status | Evidence |
|---|---|---|
| `evalMeanBrier` on manifest | **NOT wired** — `calibrationReport()` exists in ledger but dispatch doesn't call it | `company-dispatch.mjs:147-150`: mlpFeedback block lacks `evalMeanBrier` field |
| `skippedOutcomes` on manifest | **NOT wired** — `recordMlpOutcomesFromRun` returns it but dispatch doesn't propagate | `fleet-mlp-feedback.mjs:192`: returns `skippedOutcomes`; `company-dispatch.mjs:147-150`: doesn't read it |
| `blockingLeaves` on manifest | **NOT wired** — partial: `finalizeOk`/`finalizeReason`/`forced` present | §B.3: "Still needed: blockingLeaves, skippedOutcomes, fail-closed exit code" |
| Fail-closed exit on `finalizeOk: false` | **NOT wired** — dispatch exits 1 only on `errors.length` | `company-dispatch.mjs`: `process.exit(m.errors.length ? 1 : 0)` |

02C1_DASHBOARD_DRILLDOWN_X_PASS_COMMITTED