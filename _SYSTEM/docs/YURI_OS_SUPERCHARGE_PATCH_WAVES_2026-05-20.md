# YURI OS Supercharge Patch Waves

Date: 2026-05-20
Mode: staged implementation after forensic audit

## Ground Truth Inputs

- Goal: `_SYSTEM/docs/YURI_OS_FORENSIC_SUPERCHARGE_GOAL_2026-05-20.md`
- NeMo matrix: `_SYSTEM/docs/YURI_OS_NEMO_GUARDRAIL_MATRIX_2026-05-20.md`
- Shintai advisory: `_SYSTEM/state/shintai-advisory/shintai-2026-05-20T16-39-04-302Z.md`
- Forensic inventory: `_SYSTEM/state/shintai-advisory/yuri-forensic-inventory-2026-05-20T16-39-18-911Z.md`

Codex/main arbitration note: the Shintai advisory is useful but not authoritative. It contains stale lane assumptions where live probes later proved `nvidia-gpt-oss-120b`, `nvidia-kimi`, `nvidia-qwen-397b`, and `nvidia-nemotron-nano-30b` are viable. Committed lane kernel and offload contract are the current lane truth.

## Wave 0 - Evidence Gate

Purpose: prevent another guessed Shintai run.

Implement:

- Add a control-plane preflight command that loads the active roster, lane kernel, offload contract, goal doc, and relevant memory docs before any Shintai packet.
- Fail closed if required evidence is missing.
- Record the exact evidence bundle into `_SYSTEM/state/`.

Verify:

- Missing roster aborts.
- Missing NeMo matrix warns but does not invent rails.
- No protected paths are read.

## Wave 1 - Lane Kernel Consolidation

Purpose: stop lane truth from fragmenting across shell, runner, registry, tests, and roster.

Implement:

- Make `lane-kernel.mjs` the canonical active/dead lane source.
- Generate or validate offload contract dispatch tokens from lane kernel.
- Add live lane probe cache under YURI-owned runtime state.
- Keep `offload.sh` as a thin CLI resolver.

Verify:

- `offload-contract-dispatch-check.mjs` has no drift.
- Every active NIM lane dry-runs to the expected model slug.
- Dead lane probes record exact 404 or timeout cause.

## Wave 2 - Guardrail Kernel

Purpose: make NeMo-style rails deterministic local code, not prompt vibes.

Implement:

- Add `_SYSTEM/Scripts/rails.mjs`.
- Implement input, retrieval, execution, output, tool-input, tool-output, and health rails.
- Move protected-surface logic into one shared module.
- Write guardrail violations to `_SYSTEM/state/guardrail-violations.jsonl`.

Verify:

- Protected path read/write attempts are blocked.
- Shell commands that commit, push, reset, clean, or mutate protected paths are blocked.
- NIM tool mode stays available, but dangerous tool inputs fail rails.

## Wave 3 - Shintai Control Plane

Purpose: Shintai becomes a YURI advisory operation assembled by Codex/main, not a Rick-owned subsystem.

Implement:

- Add `_SYSTEM/Scripts/yuri-control-plane.mjs`.
- Gate sequence: evidence -> classification -> team assembly -> health -> fan-out -> critique -> synthesis -> Codex arbitration.
- Update `shintai-dispatch.mjs` to consume gates and rails instead of duplicating probe/call policy.
- Add artifact supersession metadata so failed runs do not look final.

Verify:

- Critical task never selects Spark.
- Kimi only dispatches if explicitly selected and healthy.
- Failed advisory artifacts contain failure cause and superseded-by pointer when rerun.

## Wave 4 - Universal Memory Kernel

Purpose: migrate ownership from Claude-coupled memory assumptions to YURI-owned memory contracts.

Implement:

- Map all current memory surfaces: `_SYSTEM/memory`, OS kernel memory code, backend memory services, lane sessions, token ledger, RAG services, and Claude-managed memory references.
- Add `MemoryKernel` interfaces for recall, write proposal, promotion, eviction, and audit.
- Route Rick/Shintai recall through YURI memory before lane dispatch.
- Keep Claude memory as importable context, not owner.

Verify:

- Recall happens before Shintai fan-out.
- Memory writes require YURI policy and audit record.
- No writes to Claude state/history.

## Wave 5 - Automation Kernel

Purpose: make health, launch, tmux workers, calibration, and monitoring one spine.

Implement:

- Define `AutomationKernel` over tmux workers, PONG probes, health aggregator, launchd plists, lane calibration, and task queue.
- Normalize health states: ok, degraded, missing_key, model_404, timeout, crashed, stale_daemon.
- Add repair commands that are explicit and non-destructive.

Verify:

- Worker health command reports all active lanes.
- Model 404 is distinct from timeout.
- Browser-harness daemon health is included but cloud profile sync remains optional.

## Wave 6 - Rick Harness Hardening

Purpose: keep terminal UX stable during long control-plane runs.

Implement:

- Keep fixed-bottom renderer, serialized terminal writer, and 16ms batching.
- Add status events for first-token wait, health preflight, fan-out, critique, and synthesis.
- Add `/goal` or equivalent command to show the current goal artifact.

Verify:

- PTY test covers two turns, resize, SIGINT restore, and no output inside status bar.
- Long Shintai runs keep visible status and do not blank the chat.

## Wave 7 - Documentation And Release Gate

Purpose: shipping preparation, not just code cleanup.

Implement:

- Keep goal, NeMo matrix, patch waves, and final audit report under `_SYSTEM/docs/`.
- Generate a final supercharge report from evidence artifacts.
- Add a single release gate command that runs syntax, lane tests, Rick PTY tests, browser-harness health, and guardrail tests.

Verify:

- Release gate passes from `main`.
- Git status excludes protected runtime noise.
- Final report lists all unresolved risks and next patches.

