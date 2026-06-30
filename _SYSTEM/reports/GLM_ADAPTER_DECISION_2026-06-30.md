# GLM Adapter Decision — 2026-06-30

**Authority:** Marcel authorized stack (`1c54cb42` bakeoff + wiring audit `e3145e7e`)  
**Inputs merged:**

- `_SYSTEM/reports/GLM_SUBSTRATE_OPTIONS_BAKEOFF_2026-06-30.md`
- `_SYSTEM/reports/GLM_DISPATCH_VS_CLAUDE_ZAI_DEBUG_2026-06-30.md`
- `_SYSTEM/reports/GLM_MECHANICAL_WIRING_AUDIT_2026-06-30.md`
- `02_RESOURCES/TASKS/glm-substrate-bakeoff-ws-l.json`, `glm-dispatch-rework-ws-l.json`

---

## Decision (one line)

**Primary GLM heavy execution → `zai-tmux-fleet` (implement WS-L L1); bulk cross-family → `ollama-fleet` flash; headless `llm-lane`/`glm-fleet` for no-tools advisory only; pre-dispatch → `decision-sim` + `math-bridge.scoreOptions` (advisory, not quantum-hypothesis).**

---

## What the audits prove

| Claim | Verdict | Source |
|-------|---------|--------|
| `glm-max` hits wrong model (`glm-4.7`) | **No** — alias chain `glm-max` → `glm-5.2` @ `api.z.ai` is GREEN | Wiring audit §Executive |
| Fleet failures = dead API | **No** — single-shot smokes pass; failures = outer SIGKILL (`exit_null`) on tool-heavy headless loops | Debug report smokes A–E |
| `glm` lane → `glm-4.7` is a bug | **No** — intentional Sonnet-tier roster slot; `ZAI_MODEL=glm-5.2` only affects `ai claude-zai` | Wiring audit hop 6 |
| `substrateHint` steers dispatch | **No** — dead metadata; only `role` + roster `resolveLane` matter | Wiring audit W-P1-1 |
| Adversarial 120s cap killed glm-max reviews | **Yes (P0, fixed)** | `swarm-convergence.mjs` now uses `defaultTimeoutMsForLane('glm-max')` |

**Mechanical headline:** Wiring is sound for `glm-max`; **runtime path** (headless HTTP vs interactive Claude Code) is the gap — not model misroute.

---

## Ranked execution stack

| Rank | Substrate | When | Armed by |
|------|-----------|------|----------|
| **1** | **zai-tmux-fleet** (proposed) | GLM Opus-tier: multi-tool builds, MURE deliberator/kernelsmith leaves, Marcel-visible work | `YURI_ZAI_TMUX_FLEET=1` + Terminal/tmux |
| **2** | **glm-fleet → lane-dispatch → llm-lane** | Parallel census, `--no-tools` advisory, DISARMED dry-run planning | `YURI_GLM_FLEET=1` |
| **3** | **ollama-fleet flash** | Cross-family bulk scout/synthesist; MURE enforcement minimum bulk lane | `YURI_OLLAMA_FLEET=1` |
| — | **ai claude-zai** (manual) | Marcel baseline; proven path until L1 adapter ships | Keychain |

**Do not** route tool-heavy `glm-max` MURE leaves through headless fleet until L3 measured bakeoff proves parity or tmux adapter is live.

---

## Pre-dispatch gate (advisory)

Use before any armed dispatch:

```javascript
// substrate-pre-dispatch.mjs (WS-L L2 — not yet implemented)
import { scoreOptions } from '_SYSTEM/mure/math-bridge.mjs';

const substrates = [
  { id: 'tmux-zai',     mean: 0.92, sd: 0.05 },
  { id: 'glm-fleet',    mean: 0.65, sd: 0.25 },
  { id: 'ollama-flash', mean: 0.78, sd: 0.12 },
];
const { best } = scoreOptions(substrates, { draws: 128, seed: 42 });
// best.id → advisory; governance.mjs + owner arming always win
```

| Instrument | Use for substrate pick? |
|------------|-------------------------|
| `decision-sim.robustScore` + `math-bridge.scoreOptions` | **YES** |
| `quantum-hypothesis-tracker` | **NO** (order-independent traits) |
| `fleet-router-mlp` | **Defer** until WS-J outcome gate warm |

---

## WS-L L0 smoke results (2026-06-30, DISARMED)

Fleet idle (`pgrep company-dispatch|runFleet` = none). S0-03 swarm `mr0t2xin` not blocking.

| Test | Command | Exit | Latency | Notes |
|------|---------|------|---------|-------|
| **H1** | `llm-lane.mjs glm-5.2 "SMOKE" --no-tools` | **0** | **6s** | Output: "Systems nominal. Fire when ready." |
| **H2** | `lane-dispatch.mjs glm "SMOKE" --no-tools` | **0** | **16s** | Full stack engaged; identifies as glm-4.7 node |
| **H3** | `glm-fleet.mjs --dry-run` (lane glm) | **0** | **<1s** | DISARMED stub packet OK |
| **H4** | `ollama-fleet.mjs --dry-run` (tier flash) | **0** | **<1s** | DISARMED stub → `deepseek-v4-flash:cloud` |
| **H5** | tmux `ai claude-zai` one-shot | **SKIP** | — | Requires interactive Terminal + Marcel; document-only per WS-L L0-baseline-tmux-zai |

**L0 verdict:** Headless + dry-run substrates **GREEN**. Tmux baseline deferred to Marcel manual step.

---

## S0-03 status (`swarm-mr0t2xin-42678a`)

| Signal | State |
|--------|-------|
| `runFleet` / `llm-lane` PIDs | **None** (idle) |
| `manifest.json` | **Absent** |
| `.claude/jobs/swarm-mr0t2xin-42678a/results/` | **Empty** |
| Leaf `MURE-S0-03-held-out-brier.out` | **Not created** |

**Verdict: RED / ABORTED** — job dir created 17:32 CEST; no manifest, no leaf output, no active processes. Hung >60m with empty results.

**Recommendation (note only — do not kill):** Abort is implicit (process gone). **Retry S0-03 via tmux-zai path** once `zai-tmux-fleet.mjs` L1 exists, or rerun with `glm` + `--no-tools` + `--light` on calibrator role to avoid headless tool-loop SIGKILL. WS-F remains blocked on S0-03 GREEN.

---

## P0 fix shipped (wiring audit)

| File | Change |
|------|--------|
| `swarm-convergence.mjs` | Adversarial `spawnSync` timeout aligned to `defaultTimeoutMsForLane('glm-max')` |
| `llm-lane.test.mjs` | Regression: `glm-max` → `glm-5.2`, `glm` → `glm-4.7` |

**Not shipped (await Marcel "ship"):** `zai-tmux-fleet.mjs` full adapter (WS-L L1), `substrate-pre-dispatch.mjs` (WS-L L2).

---

## Marcel — next 3 commands

Review together before arming:

```bash
# 1. Read decision + wiring audit (5 min)
open _SYSTEM/reports/GLM_ADAPTER_DECISION_2026-06-30.md \
     _SYSTEM/reports/GLM_MECHANICAL_WIRING_AUDIT_2026-06-30.md

# 2. Manual tmux baseline (proves Marcel path; append latency to bakeoff §J)
bash _SYSTEM/Scripts/voice/yuri-spawn-worker.sh ws-l-baseline "Reply OK only"

# 3. When ready to ship L1 — DISARMED spec dry-run only (no tmux spawn until armed)
node _SYSTEM/Scripts/runFleet.mjs --tasks-file 02_RESOURCES/TASKS/glm-dispatch-rework-ws-l.json --dry-run
```

If Marcel approves L1 implementation next session: authorize `WS-L-R1/R2` in `glm-dispatch-rework-ws-l.json` with `YURI_ZAI_TMUX_FLEET=1`.

---

## Residual risk

- Headless `glm-max` at fleet concurrency may still `exit_null` @ 30min — tmux adapter is the real fix.
- `substrateHint` dead — task authors may mis-specify intent until wired.
- S0-03 held-out Brier still open — blocks MURE §F full GREEN.
- L3 10-prompt measured bakeoff not run — pre-dispatch `mean/sd` are priors, not measured.

---

**Checks run:** L0 smokes H1–H4 live; wiring audit tests (`llm-lane.test.mjs`, `swarm-convergence.test.mjs`); fleet idle gate; S0-03 artifact scan.  
**Codex second opinion:** skipped.

**RESULT_LABEL:** `02W2_GLM_ADAPTER_DECISION_X_PASS_COMMITTED`
