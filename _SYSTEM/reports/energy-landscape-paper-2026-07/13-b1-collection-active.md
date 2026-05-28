# B.1 Real-Traffic Collection — ACTIVE

**Started:** 2026-05-28 22:57 CEST
**Target window:** 10–14 days → review gate between **2026-06-07** and **2026-06-11**
**Status:** observability mode ON, passive collection running
**Owner:** Marcel (run YURI normally), Claude (analysis at review gate)

## What's collecting

Every dispatch through the three instrumented surfaces logs one energy-gate trace record:

- `shintai-dispatch.mjs` → `lane: "shintai"` (post-health-preflight assembly)
- `offload-runner.mjs` → `lane: "offload"` (executable dispatch, not dry-run/blocked)
- `claude-codex-final-pass.mjs` → `lane: "codex-final-pass"`

Records land in `_SYSTEM/state/energy-trace/<YYYY-MM-DD>.jsonl` (gitignored).

## Activation mechanism

`export YURI_ENERGY_OBSERVABILITY=1` in `~/.zshrc` (lines 103-108, marked block).

- Every NEW shell / terminal / tmux pane inherits it.
- The `ai` wrapper and dispatch surfaces read `process.env.YURI_ENERGY_OBSERVABILITY`.
- Default-OFF in code; this env var is the only thing turning it ON.
- **Reversible:** delete the marked block in `~/.zshrc` or set to `0`.

## Caveats (honest)

- **Already-running sessions** (the main Claude Code session + the Rick tmux lanes launched before 22:57) do NOT have the env var until restarted. New shells do. The bulk of B.1 data comes from new-shell dispatches + the `ai` wrapper, so this is acceptable — but if maximum capture from the lanes is wanted, restart them to inherit the var.
- **ΔU = 0 for all A.2.a records.** This is intentional and honest — A.2.a captures the *fact* of each dispatch with synthetic identical before/after state. It does not yet measure a real state delta (that requires A.2.b action mode + real state tracking, gated until after this review).
- **Privacy:** every record is schema-limited numeric fields + canonical lane name + runId. Verified clean via live smoke test 2026-05-28 (all records pass `validateRecord`).

## Progress check

```bash
# Count records collected so far, by day and lane
for f in _SYSTEM/state/energy-trace/*.jsonl; do
  echo "$f: $(wc -l < "$f") records"
  node --input-type=module -e "
    import fs from 'node:fs';
    const lines = fs.readFileSync('$f','utf8').trim().split('\n').filter(Boolean);
    const byLane = {};
    for (const l of lines) { const r = JSON.parse(l); byLane[r.lane] = (byLane[r.lane]||0)+1; }
    console.log('  by lane:', JSON.stringify(byLane));
  "
done
```

## Review gate (2026-06-07 to 2026-06-11)

At the review gate, before B.2/action-mode:

1. Run the statistical analysis pipeline (Layer 6) over the collected trace.
2. Produce Figures 1-3 (ΔU distribution, U trajectory, component-contribution stack) — though note ΔU=0 across A.2.a, so Figure 1 will be degenerate until A.2.b. The real value of B.1 in observability mode is **dispatch frequency, lane distribution, and synthetic-U baseline** — establishing the data pipeline works end-to-end on real traffic.
3. Decide whether to proceed to A.2.b (action mode) for real ΔU measurement.

## Parallel work during the window (does NOT wait for B.1)

- **C.1** — paper unification + voice pass (main thread, Opus 4.8)
- **A.3** — experiment runner scaffolding (needed for B.2/B.3/B.4)
- **Insight 1** — retroactive evaluation against existing `_SYSTEM/state/` history via the Layer 7 sanitizer (immediate evidence base, no waiting)

## Workstream A status: COMPLETE

- A.1 telemetry layer — Codex PASS (Privacy Gate v3, 39 tests)
- A.2 dispatch wiring — Codex PASS (error-isolated, 26 bridge tests, surgical 3-surface integration)
- A.2.a observability — ACTIVE (this document)
- A.2.b action mode — gated until B.1 review
