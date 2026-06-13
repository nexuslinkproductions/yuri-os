# Reconciliation build + legacy retirement — PLAN (2026-06-13)

Read-only planning artifact (no deletions/mutations — owner approves removals first). Grounded in a
7-agent read-only dependency+lifecycle map (runId wf_a8b04bd6-82d). Two intertwined plans:
(A) retire rick-repl + the legacy worker stack; (B) build the genome-contract↔lane-output
reconciliation point on the live path. They intertwine because retiring rick-repl releases the genome,
and the reconciliation's contract source survives that retirement.

---

## PLAN A — RETIREMENT (removal order, owner-gated)

### A1. rick-repl.mjs — LEGACY corpse, LOW risk, safe
- No command/hook/skill/launcher/settings/capability/circuitry references. Already half-retired (commit
  fad88bf6 removed its shintai-dispatch sibling). CLI-entrypoint-only; the live operator lane is the real
  Claude Code session + llm-compat lanes.
- **Mandatory same-change edit:** remove `yuri-supercharge-gate.mjs:75` (`['syntax:rick-repl', --check …]`)
  — a `node --check` on a deleted file flips the release gate to FAIL.
- **Should:** swap the string fixture in `rails.test.mjs:23,33` (`node --check …/rick-repl.mjs`) to another path.
- **Orphans 5 sole-imported siblings:** rick-banner, browser-harness-bridge, rick-route-classifier,
  kagami-user-profile, yuri-input-genome. Decide same-pass vs follow-up.
- Verify after: `node _SYSTEM/Scripts/yuri-supercharge-gate.mjs` green.

### A2. genome (yuri-input-genome.mjs) — KEEPER, RE-ROUTED (not retired) ✅ DONE 2026-06-13
- **Correction (owner): the rick-repl→genome coupling was a WIRING MISTAKE.** The genome is the live
  contract producer, not rick-repl collateral. It has been **re-routed onto the live lane seam**
  (`lane-core-hooks.mjs`): `coreOnDispatch` now compiles the per-task contract via `buildInputGenome` and
  stashes it by `runId`; `coreOnResult` reads it to conformance-SOAK the output against the contract its own
  input declared. rick-repl's genome import + render block are removed (L22 + the L341-359 block) — rick-repl
  is no longer the importer. This **delivers B2 (contract provenance)** — see below.
- The genome stays; only its bad parent (rick-repl) is being retired. `yuri-input-genome.test.mjs` stays.

### A3. legacy worker stack — MIXED, MEDIUM risk, NOT one-shot. Leaf→hub order:
Isolated island (active dispatch surface references none of it), but internal cross-deps + live-ish consumers.
1. **DEAD leaves first:** `yuri-workcell.mjs`(+test), `yuri-workcell-capture.mjs`(+test) — zero code importers.
   Prune `yuri.workcell-*.v0` schemas + artifact-registry + context-registry + docs.
2. **Legacy pair:** `yuri-guarded-executor.mjs`(+policy json+test) together with `deepseek-guarded-handoff.mjs`
   (itself orphaned; tied to the retired deepseek-workhorse tombstone). Confirm both retired together.
3. **De-wire external consumers** of the worker hub: `yuri-connect.mjs`, `claude-architecture-probe.mjs`,
   and the tmux launchers `start-workers.sh` / `yuri-workers-tmux.sh` (+ rick-repl, gone in A1). Decide if those
   cockpit scripts retire wholesale or just lose their worker imports.
4. `worker-bridge.mjs` + `worker-wezterm.mjs` (stub) — after launchers/consumers de-wired; remove the
   `health-aggregator.mjs:373` existsSync probe.
5. `worker-capture-once.mjs` — after workcell-capture gone; clean the `lane-arbitration.mjs:53` string guard.
6. `worker-tmux.mjs` + `worker-tmux-registry.json` **LAST** (the live hub; 3 external static importers until
   A1 + step 3 land).
7. Prune `yuri-supercharge-gate.mjs` target entries (worker-capture-once, worker-tmux, +rick-repl/lane-arbitration
   if they go) + `context-registry.json` in the same pass.

**Retirement risk:** concentrated in worker-tmux (3 live external static importers) + worker-bridge (2 tmux
launchers). The workcell pair + guarded-executor pair are individually safe to delete first.

---

## PLAN B — RECONCILIATION BUILD (live path: ai → llm-lane → coreOnResult)

### The gap (confirmed, all 3 approaches)
`compileOneTransactionContract` has ZERO live importers; the live dispatch carries no per-task contract.
`runId` correlates only within a dispatch; no contract is stored keyed by it. So a produced result cannot be
matched to the contract it should satisfy. Three sub-gaps: (1) **no contract** at the result seam →
generic-fallback only; (2) **invokedPaths empty** at `coreOnResult` (llm-lane never accumulates tool
`args.path`) → the HARD scope-containment check (enforcement's teeth) runs inert; (3) **coverage** —
`coreOnResult` misses native Agent/Workflow fan-out (in-process) + `mimo.mjs` (node-https, bypasses core-hooks).

### The seam (all 3 converge)
`lane-core-hooks.mjs:58 coreOnResult({lane,prompt,output,exitCode,runId})` — single funnel for
llm-lane.mjs:655,671 + ollama-lane.mjs; already error-isolated; already writes JSONL. One edit = all
cloud+local lanes. The conformance gate + `recordConformance` DISARMED soak + arm-flag already exist.

### Phased build (each phase shippable + reversible)

**B1 — Honest soak at the seam (cheap, ~10 lines, do first).**
Wire `recordConformance(output, {contract: CANONICAL_YURI_OUTPUT_CONTRACT, label: runId})` into
`coreOnResult`, **gated on a marker-anchored `RESULT_LABEL:`** (not the trailing-label fallback — avoids
aspirational-label FPs). Tag entries `contractProvenance:'canonical-fallback'`. DISARMED. Wrap the
label predicate in try/catch (inherit coreOnResult's never-throw). Value: starts an honest label-grammar +
soft-schema soak for *formal* lane results; does NOT claim per-task or scope verification. (~1/15 of current
traffic is labelled — soak fills slowly; that's honest, not a bug.)

**B2 — Contract provenance ✅ DONE 2026-06-13 (via the genome re-route).**
`coreOnDispatch` (lane-core-hooks.mjs) compiles the per-task contract from the live input via the re-routed
`buildInputGenome` and stashes `{runId → promptContract}` (in-process Map; dispatch+result are one process per
lane call). `coreOnResult` reads it and calls `recordConformance(output, {contract, enforce:false})` — soaking
the output against the ACTUAL contract its input declared, not a generic fallback. **Impedance handled:** the
lane-path check uses `{...contract, expects_result_label:false}` (lane outputs are advisory free-form) so the
soak isn't flooded with trivial label FAILs. **Safety:** `enforce:false` is hard-wired on the lane path —
even though the global enforce flag is armed, lane dispatch can NEVER be blocked by this soak until the
genome→output contract semantics are validated. Locked by `lane-core-hooks.test.mjs` (3 tests). Verified live:
a dispatch soaks `lane:<lane>:input-genome-<sha>` PARTIAL, enforceBlock=false.

**B3 — Scope teeth (unlocks live enforcement value).**
Instrument `executeTool` (llm-lane.mjs:194) to accumulate touched `args.path` per run → thread to
`coreOnResult` as `invokedPaths`. This makes the HARD scope-containment check (already armed, HARD-only) fire
on the live path against the always-on protected floor — the real enforcement teeth. Mirrors the accepted
closeout precedent (yuri-closeout uses git changed-paths as the scope source).

**B4 — Coverage closure.**
(a) A `SubagentStop` hook (transcript-parse, mirror `yuri-sentinel-stop.js`) for native Agent/Workflow
fan-out. (b) A `mimo.mjs` finalize seam (it bypasses core-hooks). Both feed the same soak.

### Sequencing vs retirement
B1–B4 do not depend on the retirement, but A1/A2 *clarify* B2: the genome (the old, interactive-only contract
producer) is gone, so B2 builds contract-compile-at-dispatch on the surviving prompt-compiler primitive
directly — no genome resurrection. Recommended: land A1+A2 (clean the dead contract producer) → B1 (honest
soak) → B2 (provenance) → B3 (scope teeth) → B4 (coverage). A3 (worker stack) is independent and can run any time.

### Scores (adversarial judge panel)
A (coreOnResult + RESULT_LABEL gate) **68** · B (post-result correlation) **62** · C (finalize hook + SubagentStop) **58**.
All three name the same seam and the same provenance/invokedPaths/coverage gaps. The synthesis above takes A's
seam + B/C's honest sequencing: the capture one-liner is cheap; the *real* work is the producer leg (B2) +
executeTool path collection (B3). Do not present B1 alone as "output verified against its contract."

---

## RESIDUAL / FOLLOW-UPS
- Un-audited alternate runners that may have their own result points: `codex-offload-runner.mjs` (codex-spark),
  `kagami-facade.mjs` — trace before claiming full lane coverage.
- `yuri-sandbox-loop.mjs` keeps `control-plane-schema` alive only via npm test; if a later wave kills sandbox-loop,
  re-confirm prompt-compiler/control-plane-schema liveness before relying on them.
