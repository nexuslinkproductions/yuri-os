# MURE Company Health — 2026-06-30

**Operator:** Marcel company-ops package  
**Commands run this session:**

```bash
node _SYSTEM/mure/mure.mjs --status
node _SYSTEM/mure/mure.mjs --validate
node _SYSTEM/mure/company-dispatch.mjs --dry-run-all
node --test _SYSTEM/mure/*.test.mjs          # 142 pass
node --test _SYSTEM/Scripts/swarm-convergence.test.mjs \
             _SYSTEM/Scripts/ollama-fleet.test.mjs \
             _SYSTEM/Scripts/cline-fleet.test.mjs   # 29 pass
# flag probe: ls _SYSTEM/state/{mure,glm-fleet,cline-fleet,evolver,mlp-learn,swarm-convergence}.enabled
```

---

## RED / YELLOW / GREEN matrix

| Area | Verdict | Evidence |
|------|---------|----------|
| MURE registry + validate | **GREEN** | `--validate` ok, 20 roles |
| MURE test suite | **GREEN** | 142/142 pass |
| Fleet/convergence unit tests | **GREEN** | 29/29 pass (incl. post-fix) |
| company-dispatch dry-run | **GREEN** | 6 streams planned, 0 errors, 0 skipped |
| Flag arm posture | **GREEN** | mure, glm-fleet, cline-fleet, evolver, mlp-learn, swarm-convergence all ARMED |
| GLM resultLabel extraction | **YELLOW→GREEN*** | *Fix applied this session; live BUILD_07 artifacts used old regex |
| Swarm convergence honesty | **YELLOW→GREEN*** | *Forced-stop now `converged:false`; company-dispatch records `finalizeOk` |
| Live apply leaf quality | **RED** | glm-max leaves with empty text (timeouts) e.g. WS-G-A1 ~40min, status fail |
| Cline sidecar execution | **YELLOW** | Armed + tasks file written; not auto-spawned; manual/tmux required |
| Native spawn loop | **YELLOW** | Stub packets only (`native-spawn-loop.mjs`); no live Agent spawn |
| MLP router quality | **YELLOW** | 50-example train pass; no held-out validation |
| Dashboard | **YELLOW** | `server.py` + `dashboard.html` wired; server not started this check |
| Uncommitted arm lift | **YELLOW** | evolver-arm + held-rulings + company.mjs local; not committed |

\*Pending re-apply or spot re-run to confirm on live GLM lanes.

---

## Blockers

| Priority | Blocker | Impact |
|----------|---------|--------|
| P1 | **glm-max empty outputs** on long orchestration leaves (WS-G-A1, similar) | Obligation-floor non-conforming even with label fix |
| P2 | **BUILD_07 marked applied** while swarms had `finalizeOk:false` | Manifest overstates quality until re-run with fixes |
| P3 | **Cline sidecar manual** | WS-G scout research task not executed unless owner spawns cline-fleet |
| P4 | **Native substrate stub** | nativeSpecs write placeholder packets, not real Agent work |

---

## Flag file states

| Flag | Path | State |
|------|------|-------|
| MURE | `_SYSTEM/state/mure.enabled` | ARMED |
| GLM fleet | `_SYSTEM/state/glm-fleet.enabled` | ARMED |
| Cline fleet | `_SYSTEM/state/cline-fleet.enabled` | ARMED |
| Evolver | `_SYSTEM/state/evolver.enabled` | ARMED |
| MLP learn | `_SYSTEM/state/mlp-learn.enabled` | ARMED |
| Swarm convergence | `_SYSTEM/state/swarm-convergence.enabled` | ARMED |

---

## Fixes applied this session (uncommitted)

| File | Change |
|------|--------|
| `_SYSTEM/Scripts/glm-fleet.mjs` | Align `extractResultLabel` with contract-conformance; pool re-extract fallback |
| `_SYSTEM/Scripts/ollama-fleet.mjs` | Same regex alignment (cline sidecar import path) |
| `_SYSTEM/Scripts/swarm-convergence.mjs` | Forced-stop → `converged:false` (fail-closed honesty) |
| `_SYSTEM/Scripts/swarm-convergence.test.mjs` | Updated marginal-cutoff expectation |
| `_SYSTEM/Scripts/ollama-fleet.test.mjs` | Cases for `02B1_`, `02R1_` labels |
| `_SYSTEM/mure/company-dispatch.mjs` | Manifest swarm entry includes `finalizeOk`, `finalizeReason`, `forced` |

**Verification:** Live artifact re-parse confirms WS-B-R1 and WS-A-R2 now conforming with fixed extractor.

---

## Recommended next actions

1. **Spot re-run** one failed swarm leaf (e.g. WS-B-R1 only) or full WS-B dry-run apply to confirm label + convergence fixes.
2. **Spawn Cline sidecar** for WS-G research task (see tmux pattern in parent summary).
3. **Investigate glm-max timeouts** — empty `.out` after ~22–40min; consider dedicated retry on empty output or shorter prompts for architect-map leaves.
4. **Commit arm lift + GLM fixes** with explicit pathspec when Marcel approves.
5. **Start dashboard** for ops visibility: `node _SYSTEM/Scripts/work-dashboard.mjs` → http://127.0.0.1:4270

---

## Dashboard

- **UI:** `_SYSTEM/mure/dashboard.html`
- **Server:** `_SYSTEM/Scripts/work-dashboard.mjs` (default port 4270)
- **Status:** Not running during this health check; wiring documented in `_SYSTEM/mure/RUNBOOK.md`

---

## Related artifacts

| Report | Path |
|--------|------|
| Live apply (BUILD_07) | `_SYSTEM/reports/MURE_COMPANY_BUILD_07_LIVE_APPLY.md` |
| Uncommitted arm visual recap | `_SYSTEM/reports/MURE_UNCOMMITTED_ARM_VISUAL_RECAP.md` |
| Dispatch manifest (live) | `_SYSTEM/lane-output/dispatch-live-full/dispatch-mqzx904o/manifest.json` |

---

## Wiring gaps (2026-06-30)

### Wired end-to-end today

- **Plan → cast → GLM swarm:** `company-dispatch.mjs` → `runCompany` → `runSwarm` → `glm-fleet` / `llm-lane` with governance (`held-rulings`, `decisionFor`, owner lock).
- **Convergence + honesty (post-fix):** `swarm-convergence.mjs` fail-closed on forced-stop; manifest records `finalizeOk` / `finalizeReason` / `forced`.
- **MLP learn path:** dispatch `--mlp-learn` persists feedback; `train-fleet-router-from-ledger.mjs` updates weights (advisory routing only).
- **Visual gate:** WS-C requires visual-plan slug before apply; satisfied on BUILD_07.
- **Flags + CLI status:** `mure.mjs --status` surfaces MURE / Cline / Evolver arm posture.

### Top 5 integration gaps

1. **Sidecars are plan-only, not orchestrated spawn** — ollama-fleet and cline-fleet write tasks files; `company-dispatch` does not auto-spawn parallel bulk lanes (manual/tmux). Scout research (WS-G-R1) stays stub/native placeholder.
2. **Native substrate is a seam stub** — `native-spawn-loop.mjs` emits `[STUB: Native Agent…]` packets; no live Agent/tool spawn from dispatch.
3. **Observability split-brain** — `dashboard.html` + `server.py` exist but are not started by dispatch; work-ledger / Kagami do not stream live swarm leaf progress into one ops surface.
4. **Manifest vs quality** — BUILD_07 `status: applied` + old `converged: true` masked empty glm-max leaves; fixes committed but live artifacts need partial re-run (see re-run matrix below).
5. **MLP loop is thin** — router trains on ledger rows without held-out eval; suggestions do not gate dispatch; Cline 4th substrate bit designed but not live in router encode.

### Easy to forget

- **Uncommitted code vs committed manifest** — lane-output reflects pre-fix convergence semantics and empty `.out` files.
- **Long-lived `company-dispatch --apply`** (PID ~96989 since 02:30) may still be attached to shell; separate **WS-G re-run** (`swarm-mr0a728v`) already has active `llm-lane glm-max` children — do not start another full live apply until those finish or are intentionally killed.
- **Stale adversarial `llm-lane` zombies** — many glm-max adversarial prompts from prior swarms still in process list; they burn attention but are not the active dispatch driver.

### Three prioritized wiring steps (feel “orchestrated”)

1. **Single ops cockpit** — start `server.py` + wire manifest path + per-leaf status from latest `swarm-*/results/*.json` (one URL after dispatch).
2. **Auto sidecar hook (disarmed-safe)** — after apply, if `--ollama-sidecar` / `--cline-sidecar` and armed flags set, spawn fleet in tmux with tasks file path logged to manifest (still no spend when disarmed).
3. **Partial re-run API** — `company-dispatch.mjs --retry-leaves <ids>` or per-workstream apply that reuses owner lock and only re-dispatches failed leaf IDs (WS-B×3, WS-C×2, WS-F×1, WS-G×3).

### Re-run matrix (BUILD_07 `dispatch-mqzx904o`)

| Workstream | Recommendation | Failed / empty leaves |
|------------|----------------|------------------------|
| WS-A | **Skip** (2/2 ok with fixed label parse) | — |
| WS-D | **Skip** (3/3 ok) | — |
| WS-B | **Partial re-run** | WS-B-D1, WS-B-R3, WS-B-V1 (empty) |
| WS-C | **Partial re-run** | WS-C-H1 (text, no label), WS-C-R2 (empty) |
| WS-F | **Partial re-run** | WS-F-R1 (empty) |
| WS-G | **Wait then partial** | All 3 glm leaves empty; **active** `swarm-mr0a728v` lanes running — wait for completion, then retry any still empty |

**Decision:** **WAIT** on WS-G (active glm-max). **PARTIAL** re-run for WS-B, WS-C, WS-F after WS-G session settles. **Do not** start new full `--apply` while PID 96989 / sibling dispatch still running.

```bash
# After active WS-G lanes finish — verify plans only (safe now):
node _SYSTEM/mure/company-dispatch.mjs --dry-run-all

# Spot-check one workstream (example WS-B) when no conflicting live apply:
# node _SYSTEM/mure/company-dispatch.mjs --apply --task 02_RESOURCES/TASKS/mure-buildout-ws-b-fleet.json --out _SYSTEM/lane-output/dispatch-retry-ws-b
```

