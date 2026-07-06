# GLM-flash replacement — 2026-06-30

## Root cause

**Incident:** `WS-C-R2-trends-charts` in swarm `swarm-mr0in95e-c5e62b` failed with `glm-flash empty_output_stop` after ~13 s (142 B diagnostic, no `RESULT_LABEL`).

**Routing chain:**

1. Leaf `WS-C-R2-trends-charts` → role `artificer` (`mure-buildout-ws-c-visual.json`).
2. `planCompany` / `castRole` → `resolveLane(artificer, { preferSubstrate: 'glm' })`.
3. Artificer is `substrate: either`, `lane: haiku` (native). With GLM cost-default, `haiku` ∉ `GLM_LANES` → **`fallbackLane: glm-flash`**.
4. `glm-flash` alias in `llm-lane.mjs` resolved to **`glm-4.7-flash`** (z.ai free tier).
5. `lane-dispatch.mjs` retried 4×; all attempts returned `empty_output_stop` — not transport (no AggregateError), model-side empty completion.

**Same class:** `WS-C-H1-held-queue-stub` (also `artificer`) ran glm-flash but produced non-conforming output (no PASS label) — likely same unstable lane under load.

**Evidence:** `_SYSTEM/reports/MURE_PARTIAL_REAPPLY_2026-06-30.md` § WS-C leaf table.

## Change made (option 3 — deprecate alias, minimal)

| Layer | File | Change |
|-------|------|--------|
| Model alias | `_SYSTEM/Scripts/llm-lane.mjs` | `glm-flash` lane name → **`glm-5-turbo`** (was `glm-4.7-flash`). `glm-4.7-flash` / `glm-free` kept for explicit 4.7-flash if needed. |
| Role fallbacks | `_SYSTEM/config/fleet-roles.json` | `artificer.fallbackLane` and `oracle.fallbackLane`: **`glm-flash` → `glm-turbo`** |
| Fleet docs | `_SYSTEM/Scripts/glm-fleet.mjs` | `--list` / preamble comment updated |

**Not changed:** `lane-dispatch.mjs` retry logic, `runSwarm.mjs`, `role-registry.mjs` enum (`glm-flash` remains a valid lane *name* for compat; execution routes to turbo).

**Rationale:** `glm-5-turbo` was live-verified 2026-06-22 alongside core GLM roster; `glm-4.7-flash` now intermittently returns empty completions on bulk build leaves. Single alias swap fixes all `glm-flash` call sites (roster fallbacks, task JSON `"lane":"glm-flash"`, glm-fleet smoke) without per-leaf reroute or retry-downgrade machinery.

## Affected lanes / roles

| Role | Old fallback | New fallback | Typical leaves |
|------|--------------|--------------|----------------|
| `artificer` | glm-flash → 4.7-flash | glm-turbo → 5-turbo | WS-C-R2, WS-C-H1, scaffolding, census |
| `oracle` | glm-flash → 4.7-flash | glm-turbo → 5-turbo | native-oracle GLM fallback for test runs |

Any direct `lane: glm-flash` in task JSON or `glmFleet` tasks now executes **glm-5-turbo** via alias.

**Unaffected:** `glm`, `glm-max`, `glm-sub-orch`, `glm-flashx`, ollama `tier: flash` sidecar (separate substrate).

## Recommended WS-C R2 retry

After fleet contention clears (WS-F / S0):

```bash
export YURI_GLM_FLEET=1
export YURI_SWARM_CONVERGENCE=1

YURI_GLM_FLEET=1 node _SYSTEM/Scripts/runFleet.mjs \
  --task-file 02_RESOURCES/TASKS/mure-buildout-ws-c-visual.json \
  --only-leaves WS-C-R2-trends-charts,WS-C-H1-held-queue-stub \
  --apply --ollama-sidecar
```

Or full stream:

```bash
YURI_GLM_FLEET=1 node _SYSTEM/mure/company-dispatch.mjs \
  --apply --mlp-learn --ollama-sidecar \
  --task-file 02_RESOURCES/TASKS/mure-buildout-ws-c-visual.json \
  --out _SYSTEM/lane-output/dispatch-retry-ws-c-2
```

Use `wait-for-job.mjs` / manifest `finishedAt` — not blind sleep.

## Verification

```bash
node _SYSTEM/mure/role-registry.mjs --validate
node --test _SYSTEM/mure/role-registry.test.mjs
node --test _SYSTEM/mure/company.test.mjs
node _SYSTEM/Scripts/glm-fleet.mjs --list
```

Manual: `resolveLane(getRole(loadRoster(), 'artificer'))` → `lane: glm-turbo`.

## Residual risk

- `glm-4.7-flash` still reachable via explicit `glm-4.7-flash` alias — do not use on bulk leaves until z.ai stabilizes.
- `glm-flashx` unchanged (separate paid tier; was already UNVERIFIED in live-probe).
- Cost: turbo is paid vs free 4.7-flash; acceptable trade for completion reliability on obligation-floor leaves.
