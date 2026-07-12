---
name: omp-moe-dispatch
description: Route substantial YURI/MURE work through the OMP TaskTool using allowlisted `compileOmpSpawn` payloads and explicit configured agent IDs with model overrides. Use for multi-step work, parallel research, implementation, architecture, verification, adjudication, or any request where Sol should orchestrate OMP-native workers. Never substitute CLI `task` subprocesses, Codex `spawn_agent`, or a runtime-bypass adapter for this workflow.
---

# OMP MoE Dispatch

Use Sol/Yuri as the parent control plane. Delegate worker leaves through the OMP `task` tool, dispatching the exact `compileOmpSpawn(...)` arguments produced by `_SYSTEM/mure/sol-moe-native-dispatch.mjs`.

## Build the route

1. Preserve the user's goal spine in the parent session.
2. Decompose substantial work into independent subtasks. `compileOmpSpawn` compiles exactly one manifest entry and always emits exactly one `tasks[0]`; every dispatched unit therefore uses a separate TaskTool call, even when consecutive units use the same agent. Independent calls may run concurrently under the parent.
3. Build the governed manifest with `_SYSTEM/mure/sol-moe-company.mjs` and `_SYSTEM/config/sol-moe-routing-policy.json`.
4. Compile each ready manifest entry with `compileOmpSpawn(entry, context)` from `_SYSTEM/mure/sol-moe-native-dispatch.mjs`. The returned `agent` is top-level and `tasks[]` contains exactly one dispatched unit. Execute only the returned whitelist-only payload — never hand-write TaskTool arguments.
5. Apply runtime availability masks before spawning. Treat a provider quota/timeout/auth failure as unavailable for the current run.
6. Keep hard policy above learned ranking:
   - R0 may use cheap semantic producers.
   - R1 uses a frontier producer by default.
   - R2 requires an independent frontier verifier.
   - R3 requires Opus 4.8 verification and never uses Opus as its own producer.

## Spawn native children via OMP TaskTool

For every immediate producer or selected evidence entry the reducer emits a `compileOmpSpawn` payload of the shape:

```js
{
  i: `MURE ${purpose} ${taskId}`,
  context: '...goal/constraints/contract...',
  agent: '<manifest agentId>',            // top-level; TaskTool binds this card
  tasks: [                               // exactly one dispatched unit
    {
      id: '<deterministicOmpTaskId>',
      assignment: '<built task prompt>',
      description: '<purpose>: <taskId> (<role>)',
      role: '<role>',
    },
  ],
}
```

Every `compileOmpSpawn` payload contains one task and produces one TaskTool call. Separate calls are required for all additional units, whether they target the same or different named agents; the parent may still dispatch independent calls concurrently.

Track the `{jobId, agent}` receipt returned by the OMP `task` tool. Job/transcript correlation is always by `jobId` plus task/agent/model evidence (`deterministicOmpTaskId`, `agent`, transcript `model_change.model`), never by guessed status.

Nested orchestration is bounded by `.omp/config.yml` `task.maxRecursionDepth: 2`. At depth 2, workers are leaves and must not spawn further children; OMP has no `maxChildrenPerAgent` setting in this contract.

Before native admission, replace `shadow` with `mirrorOmpSpawnAction(shadow, action)`, then call `admitOmpSpawn(state, shadow, action, rawReceipt)` from `_SYSTEM/mure/sol-moe-parent-adapter.mjs` with the reducer's `omp-task-spawn` action and the OMP receipt. `admitOmpSpawn` calls `recordNativeSpawnAccepted` (reducer) and `observeNativeAdmission` (shadow) in lockstep — there is no path where one is admitted and the other is not. The reducer fails the task loud (`MODEL_MISMATCH`) if the resolved model from the transcript `model_change` line does not match the requested model; admission itself only records the requested model. Feed only pushed `<task-result>` blocks (plus the path-confined JSONL transcript under `artifactsDir/<jobId>.jsonl`) into `applyOmpCompletion(state, shadow, result, jobId, transcriptJsonl, opts)` or `applyOmpCompletionFromDisk(state, shadow, result, jobId, artifactsDir, opts)`. Duplicate events are idempotent.

Do not use:

- the OMP CLI / subprocess runtime pretending to be the TaskTool path;
- Codex `spawn_agent` for MURE model/role dispatch;
- a model override without an `agent` whose card id appears in `WORKER_BINDINGS`;
- hand-written TaskTool arguments when a `compileOmpSpawn` payload is available.

## Model roles

| Work | Native child |
|---|---|
| Parent orchestration and final synthesis | `mure-yuri` · `anthropic/claude-opus-4-8` (parent control plane — never compiled as a worker; Sol remains disabled) |
| Delegated orchestration and frontier-volume production | `mure-synthesist` · `minimax-portal/MiniMax-M3` · thinking `adaptive` |
| Implementation and refactor | deterministic 85% `mure-synthesist` · `MiniMax-M3`; 15% specialist sample / escalation `mure-engineer` · `gpt-5.6-terra` |
| Adjudication and red-team | deterministic 65% `mure-synthesist` · `MiniMax-M3`; 35% cross-provider specialist `mure-adjudicator` · `gpt-5.6-luna` |
| Deterministic R2 gate | `mure-calibrator` · `anthropic/claude-sonnet-5` |
| Security/governance R3 gate | `mure-sentinel` · `anthropic/claude-opus-4-8` |
| Mechanical breadth | `deepseek-flash` · `deepseek/deepseek-v4-flash` |
| Cheap overflow/evidence | `mure-artificer` · `opencode-go/mimo-v2.5`, only after a completed OMP canary |
| Long-context architecture | `mure-architect` · `zai/glm-5.2`, only when runtime availability is proven |

Worker allocation excludes the Sol parent seat and is measured first by accepted OMP TaskTool dispatch count; token share is observed separately. While GLM and MiMo are masked, target a 50-task rolling mix of 40–60% MiniMax, 20–35% Anthropic (including verification), 12–25% DeepSeek, and no more than 12% OpenAI workers. OpenAI worker models are selective specialists and quality escalations, not the volume default. When GLM and MiMo recover, shift 10–20% to Z.ai and 5–15% to MiMo without weakening the R2/R3 floors.

The native reducer records every accepted child admission, including evidence, producer, availability fallback, quality escalation, and verifier attempts. Feed its prior `providerCalibration.history` into the next `createNativeDispatchState(..., { providerHistory })` call to preserve the rolling window. When a selected OpenAI worker would exceed the 12% ceiling, the reducer emits an eligible non-OpenAI peer with route kind `calibration-rebalance`; if none remains, it fails loud (`PROVIDER_CALIBRATION_CEILING`). Sol itself is never a worker candidate (`SOL_PARENT_WORKER_FORBIDDEN`).

## Process completions

1. Treat child output as advisory until verified.
2. On transport, quota, timeout, or auth failure, spawn only the task's next availability fallback.
3. On producer success for R2/R3, the reducer itself spawns the declared verifier after the producer finishes. The verifier contract is strict: return exactly `{"verdict":"pass"}` or `{"verdict":"reject"}`, no markdown or prose.
4. On verifier rejection, the reducer spawns only the quality-escalation candidate, then re-runs the verifier.
5. On verifier transport/auth/timeout failure, fail loud (`VERIFIER_EXECUTION_FAILURE`); changing the producer cannot repair a dead verifier.
6. Fail loud when compliant candidates are exhausted. Never drop to a cheap semantic worker (`PRODUCER_MISSING` / `AVAILABILITY_FALLBACK_EXHAUSTED` / `QUALITY_ESCALATION_EXHAUSTED`).
7. Keep final acceptance, owner gates, and user-facing synthesis in the Sol parent.

## Current availability override

When Marcel or a live failure establishes that GLM 5.2 is unavailable, mask `zai/glm-5.2` for the run and begin its declared fallback chain at MiniMax M3. Do not probe GLM repeatedly. Remove the mask only after a successful bounded OMP canary or explicit availability evidence.

Apply the same fail-closed rule to any child provider whose profile was just seeded but is not visible to the running runtime. Keep it masked until a fresh OMP child completes; admission alone is not sufficient.

A boolean availability override cannot unmask a default-masked model. Supply proof sourced from the OMP transcript for that exact model with `source: 'omp-task-result'`, `status: 'completed-omp-canary'`, `ok: true`, an exact `model_change.model`, plus its `jobId`; otherwise the router keeps it unavailable (`MODEL_AVAILABILITY_UNPROVEN`).

## Evidence contract

Record for each child: task ID, role, agent ID, requested model, resolved model (`model_change.model` from transcript), `jobId`, route kind, result status, verifier verdict, and whether fallback or escalation was used. Admission (`recordNativeSpawnAccepted` succeeded) is not execution proof; require a `<task-result>` completion event from the resolved child model and a transcript whose `model_change.model` matches the requested entry.
