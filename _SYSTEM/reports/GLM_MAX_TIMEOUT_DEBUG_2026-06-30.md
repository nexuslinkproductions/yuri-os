# GLM-Max Timeout Debug — 2026-06-30

## Root cause

WS-G glm-max leaves (`WS-G-A1`, `WS-G-K1`, `WS-G-V1`) failed with empty `text` and `durationMs ≈ 2,400,911` (~40 min). Evidence from `.claude/jobs/swarm-mr065t4p-3f200c/results/` and retry `swarm-mr0a728v-67d3f1`:

1. **No `.out` files** were written — llm-lane never reached `--out` flush before the outer wrapper killed the process.
2. **Duration math matches double-timeout exhaustion**: `runSwarm.mjs` router bias set `timeoutMs = 1,200,000` (20 min) per leaf; `lane-dispatch.mjs` runs **2 attempts** for glm-max (`LANE_DISPATCH_ATTEMPTS_HEAVY` in `glm-fleet.mjs`); total wall ≈ 2 × 20 min = 40 min.
3. **SIGKILL on outer timeout** — `lane-dispatch.mjs` `child.kill('SIGKILL')` after `LANE_DISPATCH_TIMEOUT_MS`; not an empty API body.
4. **Contrast with success**: `WS-A-V1-adjudicator-verify` (same glm-max lane) completed in ~300s with 5KB output — lighter prompt, no concurrent triple glm-max fan-out.

The router's hardcoded 20 min floor was **below** glm-fleet's prior 22 min tier default and insufficient for WS-G's multi-tool architect/kernelsmith/adjudicator work on Cline Pass integration.

## Fixes applied

| File | Change |
|------|--------|
| `_SYSTEM/Scripts/glm-fleet.mjs` | glm-max/sub-orch outer timeout **1,800,000 ms (30 min)**; failure diagnostics in packet `text`/`evidence` when empty |
| `_SYSTEM/Scripts/runSwarm.mjs` | Router timeout bias uses `defaultTimeoutMsForLane()` instead of hardcoded 1,200,000 |
| `_SYSTEM/Scripts/lane-dispatch.mjs` | Write `LANE_DISPATCH_FAIL` diagnostics to `--out` on exhausted retries; log `timeoutMs` on retry |
| `_SYSTEM/mure/company.mjs` | `buildLeaf()` sets glm-max default `timeoutMs` from fleet tier |
| `_SYSTEM/Scripts/glm-fleet-timeout.test.mjs` | Unit tests for tier defaults + buildLeaf wiring |

## Recommended timeout values

| Lane | Outer `LANE_DISPATCH_TIMEOUT_MS` | Attempts | Max wall (both attempts) |
|------|----------------------------------|----------|--------------------------|
| **glm-max** | **1,800,000** (30 min) | 2 | ~60 min |
| glm-sub-orch | 1,800,000 (30 min) | 2 | ~60 min |
| glm | 900,000 (15 min) | 4 | ~60 min |
| glm-flash/turbo | 600,000 (10 min) | 4 | ~40 min |

Per-HTTP-call timeout inside `llm-lane.mjs` for glm-5.2 remains **600,000 ms** (models.json) — tool loops reuse this per turn within the outer budget.

## WS-G re-run recommendation

After deploying these fixes:

```bash
# Re-run WS-G glm leaves only (owner must have fleet armed)
YURI_GLM_FLEET=1 YURI_SWARM_CONVERGENCE=1 node _SYSTEM/mure/company.mjs \
  --task-file <ws-g-task.json> --rounds 2 --concurrency 2
```

- Use **concurrency 2** (not 3) to reduce z.ai API pressure on glm-max.
- Expect **30–45 min per leaf** for heavy integration mapping; total run may approach 60 min if both attempts fire.
- Failed leaves will now surface `[GLM_FLEET_LIKELY_TIMEOUT]` or `LANE_DISPATCH_FAIL` in result JSON instead of blank `text`.
- If architect/kernelsmith remain slow, consider routing advisory-only subtasks to **`glm`** (4.7) lane via subtask override — adjudicator stays on glm-max.

## Test results

```
node --test _SYSTEM/Scripts/glm-fleet-timeout.test.mjs _SYSTEM/mure/company.test.mjs _SYSTEM/Scripts/swarm-convergence.test.mjs
ℹ tests 30 | pass 30 | fail 0
```
