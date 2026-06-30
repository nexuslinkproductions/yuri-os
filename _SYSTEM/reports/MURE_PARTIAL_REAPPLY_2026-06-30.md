# MURE partial re-apply — status (2026-06-30)

**Checked:** 2026-06-30 17:29 CEST (post WS-F / WS-C partial runs)  
**glm-max timeout fix:** `9938ff3a` @ 2026-06-30 10:11:06 +0200  
**Partial-leaf routing:** `company-dispatch.mjs` has **no** `--leaf` / partial flag → WS-C retry used trimmed task file `02_RESOURCES/TASKS/mure-buildout-ws-c-partial-retry.json` (R2 + H1 only).

## Executive summary

| Stream | Dispatch run | Swarm | Finished (UTC) | Stream verdict |
|--------|--------------|-------|----------------|----------------|
| **WS-B** | `dispatch-mr0dvzvu` | `swarm-mr0dvzw0-d71bf1` | 2026-06-30T10:06:42Z | **GREEN** — unchanged (skip) |
| **WS-C** (full retry) | `dispatch-mr0in957` | `swarm-mr0in95e-c5e62b` | 2026-06-30T11:24:55Z | **YELLOW/RED** — `not-converged` |
| **WS-C** (partial R2+H1) | *(no manifest written)* | `swarm-mr0rfjz4-fdf83a` | *(swarm manifest missing — dispatch SIGTERM)* | **RED** — both leaves `glm-turbo` `exit_null` |
| **WS-F** (router) | *(no manifest under `dispatch-retry-ws-f`)* | `swarm-mr0ovkup-c9facd` (primary long run) | *(swarm manifest missing — dispatch ended ~15:28Z)* | **RED** — both leaves `glm-max` `exit_null` ×2 rounds |

**Host note:** Several `company-dispatch` processes received **SIGTERM (exit 143)** before `manifest.json` was written under `--out` (manifest is emitted at dispatch end). Leaf evidence survives under `.claude/jobs/<swarm>/results/`.

## Per-stream detail

### WS-B — **GREEN** (skip)

Prior retry `dispatch-mr0dvzvu` / `swarm-mr0dvzw0-d71bf1` — converged, `finalizeOk: true`. No re-run this session.

### WS-F — **RED**

**Command (intended):**
```bash
export YURI_GLM_FLEET=1 YURI_SWARM_CONVERGENCE=1 YURI_MURE_ARMED=1
node _SYSTEM/mure/company-dispatch.mjs --apply --mlp-learn \
  --task-file 02_RESOURCES/TASKS/mure-buildout-ws-f-router.json \
  --out _SYSTEM/lane-output/dispatch-retry-ws-f
```

**Attempts this session**

| Swarm | Notes |
|-------|--------|
| `swarm-mr0lch11-4fcdd8` | Round 0 blocked; round 1 both leaves **fail** `glm-max` `exit_null` ~3600s each; parent dispatch **exit 143** before finalize |
| `swarm-mr0nqgvh-568153` | Killed ~30 min, round 0 only |
| `swarm-mr0ouq53-bea669` | Nohup chain stalled at round 0 log line only |
| **`swarm-mr0ovkup-c9facd`** | **Primary evidence** — round 0 + round 1 re-dispatch; both leaves **fail** each round |

**Per-leaf (`swarm-mr0ovkup-c9facd`, final on-disk JSON)**

| Leaf | Verdict | status | resultLabel | durationMs | Failure |
|------|---------|--------|-------------|------------|---------|
| WS-F-R1-mlp-stub | **RED** | fail | MISSING | ~3 184 709 | `LANE_DISPATCH_FAIL lane=glm-max … exit_null timeoutMs=1800000` |
| WS-F-D1-deliberator-policy | **RED** | fail | MISSING | ~3 184 706 | same |

**Output dir:** `_SYSTEM/lane-output/dispatch-retry-ws-f/` — **empty** (no `dispatch-*/manifest.json`, no apply JSON).

### WS-C — full retry **YELLOW/RED**; partial **RED**

**Original partial re-apply target** (`dispatch-retry-ws-c`, `swarm-mr0in95e-c5e62b`):

| Leaf | Verdict | Notes |
|------|---------|--------|
| WS-C-R2-trends-charts | **RED** | `glm-flash` `empty_output_stop` |
| WS-C-H1-held-queue-stub | **YELLOW** | `LANE_DONE` tool-only, no PASS label (~20 min) |

**Partial retry** (`--out _SYSTEM/lane-output/dispatch-retry-ws-c-partial`, task `mure-buildout-ws-c-partial-retry.json`, swarm `swarm-mr0rfjz4-fdf83a`):

| Leaf | Verdict | status | durationMs | Failure |
|------|---------|--------|------------|---------|
| WS-C-R2-trends-charts | **RED** | fail | ~2 404 608 | `glm-turbo` `exit_null` ×4, `timeoutMs=600000` |
| WS-C-H1-held-queue-stub | **RED** | fail | ~2 403 740 | `glm-turbo` `exit_null` ×4 (tool-heavy trace) |

Dispatch parent **exit 143** @ ~15:28Z; **no** `dispatch-retry-ws-c-partial/dispatch-*/manifest.json`.

**Reference (not this partial re-apply out-dir):** `swarm-mr0no8q6-259f16` under `dispatch-fail-test` converged with PASS labels on R2/H1 — useful contrast, not wired to `dispatch-retry-ws-c-partial`.

## Process check (17:29 CEST)

| Check | Result |
|-------|--------|
| `mure-buildout-ws-f-router` dispatch | **not running** (ended ~15:28Z) |
| `mure-buildout-ws-c-partial-retry` dispatch | **not running** (ended ~15:28Z, exit 143) |
| `dispatch-retry-ws-f` manifest | **missing** |
| `dispatch-retry-ws-c-partial` manifest | **missing** |

## Residual / next

1. **WS-F:** Diagnose `glm-max` `exit_null` at 30 min (distinct from pre-fix BUILD_07 multi-hour hang). Re-run dispatch when lanes healthy; ensure process survives to manifest write (`wait-for` on `.claude/jobs/<swarm>/manifest.json` `finishedAt`).
2. **WS-C R2/H1:** Partial task file exists; consider lane downgrade/override (router suggested native for R2) or native/Cursor lane for flash/turbo `exit_null` class.
3. **Tooling:** Add `wait-for-job.mjs` / dispatch `--out` manifest polling before declaring stream verdict (enforcement S0 track in flight).



---

## Owner authorized live apply — 2026-06-30 17:54 CEST

- **Authority:** owner authorized 2026-06-30 (GLM/Ollama spend for S0-03 → WS-F sequence `5e4bd7a3`).
- **Dispatch PIDs (initial check):** none for `company-dispatch` / `llm-lane` at handoff; stale duplicate `runFleet` **22139** (swarm `mr0st4ve`) terminated; **single** authorized S0-03 run **`37070`** → swarm **`swarm-mr0t2xin-42678a`**, lane **`glm`** (ideator), not `glm-max`.
- **S0-03 verdict:** **IN_FLIGHT** (~21m) — `wait-for-job` cannot poll until `manifest.json` exists; leaf `.out` not written yet; prior attempts **RED** (`swarm-mr0snjyy` `glm-max` exit_1 / `exit_null`).
- **WS-F verdict:** **NOT STARTED** by this sequence (blocked on S0-03 GREEN). Note: parallel `llm-lane glm-max` adversarial pass referencing WS-F leaves observed in host process list — not launched here.
- **Next:** on S0 `finalizeOk=true`, run WS-F only-leaves (`WS-F-R1-mlp-stub`, `WS-F-D1-deliberator-policy`) via filtered task file; `--only-leaves` flag **not implemented** in `runFleet.mjs` CLI (docs only).

### §Queue-2-4 — 2026-06-30T16:17Z (subagent)

- **S1:** idle on first poll; no wait loop consumed.
- **#2 S0-03:** `company-dispatch --apply --mlp-learn` + `runFleet` attempts; live run `swarm-mr0t2xin-42678a` (**IN_FLIGHT**). `wait-for-job` returns immediately when `.claude/jobs/<swarm>/manifest.json` missing — poll leaf `.out` instead.
- **#4 WS-F:** deferred; use `02_RESOURCES/TASKS/mure-buildout-ws-f-leaves-only.json` + `runFleet.mjs --apply` (no `--only-leaves`) after S0 `02J2_HELD_OUT_BRIER_X_PASS_COMMITTED`.
- **Commit:** `813a9bfb` (`mure-enforcement-s0-03-only.json` only).


### S0-03 authorized apply — **ABORTED** (2026-06-30 18:18 CEST)
- **Swarm:** `swarm-mr0t2xin-42678a` (owner authorized 2026-06-30)
- **Runtime:** ~45m; terminal **aborted** (`exit_code: unknown`); `runFleet` PID 37070 gone
- **Artifacts:** no `manifest.json`, no leaf `.out`, no S0-03 code diff on disk
- **Verdict:** **RED** — same class as prior `glm-max` failures; WS-F **not** launched (gated)

### Z.ai tmux retry (bf0256ec wire) — 2026-06-30T16:21Z

- **Stop (SIGTERM):** 37070 runFleet s0-03; 37047/37071 wrapper+tee; 37077 lane-dispatch; 53662 poll loop; 9853/11835 llm-lane glm-max WS-F adversarial; 93253 llm-lane glm-max WS-F-D1; 33891 llm-lane glm S0 orphan. (92960 already exited.)
- **Armed:** `touch` zai-tmux-fleet.enabled + glm-fleet.enabled + mure.enabled; env YURI_ZAI_TMUX_FLEET=1 YURI_GLM_FLEET=1 YURI_MURE_ARMED=1
- **S0-03:** runId **ztf-mr0urc8e-a24e63** (zai-tmux-fleet, not runSwarm). Command: `runFleet --dry-run --zai-sidecar` → `zai-tmux-fleet.mjs --tasks-file .claude/jobs/fleet-1782836365103/zai-tasks.json --concurrency 1`. Packet label **02J2_HELD_OUT_BRIER_X_PASS_COMMITTED** in ~1s — **RED/false-green** (RESULT_LABEL matched echoed prompt in tmux pane; no `evalMeanBrier` in train-fleet-router-from-ledger.mjs; no repo diff).
- **WS-F:** runId **ztf-mr0us67a-c40ffa** (after S0 clear fail). Task `mure-buildout-ws-f-retry-tmux-zai.json`; `zai-tmux-fleet.mjs --tasks-file .claude/jobs/fleet-1782836423818/zai-tasks.json --concurrency 1`. Labels **02F1_MLP_STUB_X_PASS_COMMITTED** / **02F4_ROUTER_POLICY_X_PASS_COMMITTED** in ~6s each — **RED/false-green** (prompt echo only; ~2k chars pane capture, no implementation evidence).
- **company-dispatch --zai-sidecar:** not used (`--zai-sidecar` not wired in company-dispatch.mjs parseArgs).

### Z.ai tmux false-green poll fix — 2026-06-30

- **Retry verdict:** S0-03 (`ztf-mr0urc8e`) + WS-F (`ztf-mr0us67a`) **RED/false-green** — RESULT_LABEL matched echoed prompt in 1–6s; no real claude-zai work.
- **Poll fix:** commit `66bbecfd` — `zai-tmux-fleet.mjs` now strips injected prompt, baseline snapshot, 60s min wall (5s smoke), substance check; fail reason `false-green:prompt-echo`. `company-dispatch.mjs` wires `--zai-sidecar`.

