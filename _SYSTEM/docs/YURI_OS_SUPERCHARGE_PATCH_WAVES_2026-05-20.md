# YURI OS Supercharge Patch Waves

Date: 2026-05-20
Mode: staged implementation after forensic audit

## Orchestration Rule

No large YURI supercharge phase is solo-Codex work.

Every non-trivial phase below must run as a Codex/main + Shintai collaboration:

1. Codex/main opens Gate 0 and loads the evidence bundle.
2. Codex/main assembles the Shintai council from current lane health and task fit.
3. Shintai members produce advisory outputs with findings, proposed edits, risks, tests, and contradictions.
4. Codex/main synthesizes, arbitrates, rejects weak advice, and decides the implementation path.
5. Codex/main implements bounded patches.
6. Codex/main verifies and records evidence.
7. Follow-up Shintai checks re-audit critical phases before the phase is considered sealed.

Small local fixes may be done directly only when they are narrow, reversible, and do not alter architecture, memory, routing, guardrails, automation, design-system policy, lane policy, or release gates.

Critical phases require the same style as the prior successful supercharge sprint: multiple capable lanes, no silent weak replacements, long enough processing windows for large models, written member notes, contradiction handling, and final Codex arbitration.

## Ground Truth Inputs

- Goal: `_SYSTEM/docs/YURI_OS_FORENSIC_SUPERCHARGE_GOAL_2026-05-20.md`
- NeMo matrix: `_SYSTEM/docs/YURI_OS_NEMO_GUARDRAIL_MATRIX_2026-05-20.md`
- NeMo source repo progress: `_SYSTEM/docs/YURI_OS_NEMO_GUARDRAILS_SOURCE_REPO_PROGRESS_2026-05-20.md`
- NeMo source repo checkout: `_SYSTEM/tools/nemo-guardrails` at `c98f7dfec98af0707983060d73b5fc465ffe4ff5`
- Shintai advisory: `_SYSTEM/state/shintai-advisory/shintai-2026-05-20T16-39-04-302Z.md`
- Forensic inventory: `_SYSTEM/state/shintai-advisory/yuri-forensic-inventory-2026-05-20T16-39-18-911Z.md`

Codex/main arbitration note: the Shintai advisory is useful but not authoritative. It contains stale lane assumptions where live probes later proved `nvidia-gpt-oss-120b`, `nvidia-kimi`, `nvidia-qwen-397b`, and `nvidia-nemotron-nano-30b` are viable. Committed lane kernel and offload contract are the current lane truth.

## Wave 0 - Evidence Gate

Purpose: prevent another guessed Shintai run.

Shintai collaboration: mandatory. Use Shintai to challenge the evidence set and identify missing proof before implementation.

Implement:

- Add a control-plane preflight command that loads the active roster, lane kernel, offload contract, goal doc, and relevant memory docs before any Shintai packet.
- Load upstream NeMo source repo excerpts when `_SYSTEM/tools/nemo-guardrails` exists.
- Fail closed if required evidence is missing.
- Record the exact evidence bundle into `_SYSTEM/state/`.

Verify:

- Missing roster aborts.
- Missing NeMo matrix warns but does not invent rails.
- No protected paths are read.

## Wave 1 - Lane Kernel Consolidation

Purpose: stop lane truth from fragmenting across shell, runner, registry, tests, and roster.

Shintai collaboration: mandatory. Use DeepSeek/NIM code-reasoning lanes to challenge lane truth, dead-lane status, and tool-mode assumptions.

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

Shintai collaboration: mandatory. Use NeMo-aware lanes and adversarial security reasoning before patches.

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

Shintai collaboration: mandatory. This phase must dogfood the Shintai process itself and record meta-audit failures.

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

Shintai collaboration: mandatory. Use long-context audit plus code/retrieval specialists before changing memory ownership.

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

Shintai collaboration: mandatory. Use automation, reliability, and adversarial lanes to challenge repair flows before implementation.

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

Shintai collaboration: mandatory for renderer architecture, PTY regressions, and long-run status behavior. Narrow syntax fixes may be local.

Implement:

- Keep fixed-bottom renderer, serialized terminal writer, and 16ms batching.
- Add status events for first-token wait, health preflight, fan-out, critique, and synthesis.
- Add `/goal` or equivalent command to show the current goal artifact.

Verify:

- PTY test covers two turns, resize, SIGINT restore, and no output inside status bar.
- Long Shintai runs keep visible status and do not blank the chat.

## Wave 7 - Documentation And Release Gate

Purpose: shipping preparation, not just code cleanup.

Shintai collaboration: mandatory for final audit, unresolved risk review, release-gate confidence, and phase 0/1/2 recheck.

Implement:

- Keep goal, NeMo matrix, patch waves, and final audit report under `_SYSTEM/docs/`.
- Generate a final supercharge report from evidence artifacts.
- Add a single release gate command that runs syntax, lane tests, Rick PTY tests, browser-harness health, and guardrail tests.

Verify:

- Release gate passes from `main`.
- Git status excludes protected runtime noise.
- Final report lists all unresolved risks and next patches.

## Wave 8 - Self-Improvement, Memory/RAG, And Skill-Recall Shintai Run

Purpose: move YURI from patched control-plane functionality into a more symbiotic operating system that recalls, routes, retrieves, and learns without repeated manual correction.

Shintai collaboration: mandatory by definition. No solo Codex architecture proposal is accepted as final guidance for this wave.

Ground truth:

- `_SYSTEM/docs/YURI_OS_SELF_IMPROVEMENT_MEMORY_RAG_SHINTAI_GOAL_2026-05-21.md`

Implement after the Kagami HTML presentation pass is reviewed:

- Run a critical-tier Shintai advisory council over memory/RAG, skill recall, session orchestration, and neurodivergency activation.
- Clone `https://github.com/EverMind-AI/MSA` into `_SYSTEM/tools/MSA` as an ignored external checkout.
- Use browser-harness and web research to collect current memory-agent/RAG work from serious OSS and leading AI providers.
- Locate the YURI neurodivergency document through allowed repo search and turn it into an active persona/interaction rail.
- Produce a source-backed research artifact, Shintai member notes, contradictions, Codex arbitration, and patch waves before implementation.

Verify:

- No advisory lane reads protected paths.
- Shintai Gate 0 loads the goal doc, memory surfaces, skill surfaces, lane kernel, and roster before dispatch.
- Research artifacts cite local paths and URLs.
- Skill recall explains selected skills, evidence triggers, and skipped skills.
- Neurodivergency rail activates mechanically in a test or prompt injection path.
- MSA remains an ignored external checkout and does not become vendored application code.
