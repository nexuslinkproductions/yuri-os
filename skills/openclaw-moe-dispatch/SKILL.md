---
name: openclaw-moe-dispatch
description: Route substantial YURI/MURE work through native OpenClaw child sessions using sessions_spawn with explicit configured agent IDs and model overrides. Use for multi-step work, parallel research, implementation, architecture, verification, adjudication, or any request where Sol should orchestrate OpenClaw agents/subagents. Never substitute `openclaw agent` subprocess turns or Codex-native subagents for this workflow.
---

# OpenClaw MoE Dispatch

Use Sol/Yuri as the parent control plane. Delegate worker leaves through the native OpenClaw `sessions_spawn` tool (`openclaw__sessions_spawn` on the Codex bridge).

## Build the route

1. Preserve the user’s goal spine in the parent session.
2. Decompose substantial work into independent subtasks.
3. Build the governed manifest with `_SYSTEM/mure/sol-moe-company.mjs` and `_SYSTEM/config/sol-moe-routing-policy.json`.
4. Compile each ready manifest entry with `_SYSTEM/mure/sol-moe-native-dispatch.mjs`. Execute only the returned whitelist-only `sessions_spawn` arguments.
5. Apply runtime availability masks before spawning. Treat a provider quota/timeout/auth failure as unavailable for the current run.
6. Keep hard policy above learned ranking:
   - R0 may use cheap semantic producers.
   - R1 uses a frontier producer by default.
   - R2 requires an independent frontier verifier.
   - R3 requires Opus 4.8 verification and never uses Opus as its own producer.

## Spawn native children

For every immediate producer or selected evidence entry, call native `sessions_spawn` with:

```text
runtime: subagent
mode: run
context: isolated
cleanup: keep
cwd: /Users/marcelspatz/YURI-OS-MUSUBI
agentId: <manifest agentId>
model: <manifest model>
thinking: <manifest thinking>
task: <bounded role contract + task>
```

Use one child per independent leaf. Spawn independent leaves concurrently. Track the returned child session keys and rely on push completion events; do not poll with `sessions_list`, `sessions_history`, sleeps, or shell loops.

Nested Sol orchestration requires `agents.defaults.subagents.maxSpawnDepth: 2`; cap each orchestrator at `maxChildrenPerAgent: 3`. These gateway settings require a restart before a depth-1 Sol child receives `sessions_spawn`. At depth 2, workers are leaves and must not spawn further children.

After native admission, call `recordNativeSpawnAccepted(...)` with `childSessionKey`, `runId`, and `resolvedModel`. Admission is rejected if the resolved model differs from the requested model. Feed only pushed terminal events into `reduceNativeDispatch(...)`; duplicate events are idempotent.

Do not use:

- `openclaw agent` for delegated MoE work;
- any Node/CLI adapter pretending to be the native subagent path;
- Codex `spawn_agent` for MURE model/role dispatch;
- a model override without a configured OpenClaw `agentId`.

## Model roles

| Work | Native child |
|---|---|
| Parent orchestration and final synthesis | `mure-yuri` · `openai/gpt-5.6-sol` |
| Delegated orchestration and frontier-volume production | `mure-synthesist` · `minimax-portal/MiniMax-M3` · thinking `adaptive` |
| Implementation and refactor | deterministic 85% `mure-synthesist` · `MiniMax-M3`; 15% specialist sample / escalation `mure-engineer` · `gpt-5.6-terra` |
| Adjudication and red-team | deterministic 65% `mure-synthesist` · `MiniMax-M3`; 35% cross-provider specialist `mure-adjudicator` · `gpt-5.6-luna` |
| Deterministic R2 gate | `mure-calibrator` · `anthropic/claude-sonnet-5` |
| Security/governance R3 gate | `mure-sentinel` · `anthropic/claude-opus-4-8` |
| Mechanical breadth | `deepseek-flash` · `deepseek/deepseek-v4-flash` |
| Cheap overflow/evidence | `mure-artificer` · `opencode-go/mimo-v2.5`, only after a completed native auth canary |
| Long-context architecture | `mure-architect` · `zai/glm-5.2`, only when runtime availability is proven |

Worker allocation excludes the Sol parent seat and is measured first by native child dispatch count; token share is observed separately. While GLM and MiMo are masked, target a 50-task rolling mix of 40–60% MiniMax, 20–35% Anthropic (including verification), 12–25% DeepSeek, and no more than 12% OpenAI workers. OpenAI worker models are selective specialists and quality escalations, not the volume default. When GLM and MiMo recover, shift 10–20% to Z.ai and 5–15% to MiMo without weakening the R2/R3 floors.

The native reducer records every accepted child admission, including evidence, producer, availability fallback, quality escalation, and verifier attempts. Feed its prior `providerCalibration.history` into the next `createNativeDispatchState(..., { providerHistory })` call to preserve the rolling window. When a selected OpenAI worker would exceed the 12% ceiling, the reducer emits an eligible non-OpenAI peer with route kind `calibration-rebalance`; if none remains, it fails loud. Sol itself is never a worker candidate.

## Process completions

1. Treat child output as advisory until verified.
2. On transport, quota, timeout, or auth failure, spawn only the task’s next availability fallback.
3. On producer success for R2/R3, spawn the declared verifier after the producer finishes. Include the producer output and evidence; demand exactly `{"verdict":"pass"}` or `{"verdict":"reject"}`.
4. On verifier rejection, spawn only the quality-escalation candidate, then re-run the verifier.
5. On verifier transport/auth/timeout failure, fail loud; changing the producer cannot repair a dead verifier.
6. Fail loud when compliant candidates are exhausted. Never drop to a cheap semantic worker.
7. Keep final acceptance, owner gates, and user-facing synthesis in the Sol parent.

## Current availability override

When Marcel or a live failure establishes that GLM 5.2 is unavailable, mask `zai/glm-5.2` for the run and begin its declared fallback chain at MiniMax M3. Do not probe GLM repeatedly. Remove the mask only after a successful bounded native canary or explicit availability evidence.

Apply the same fail-closed rule to any child provider whose profile was just seeded but is not visible to the running gateway. Keep it masked until a fresh native child completes; admission alone is not sufficient.

A boolean availability override cannot unmask a default-masked model. Supply proof sourced from the pushed terminal event for that exact model with `source: "native-completion-event"`, `status: "completed-native-canary"`, `ok: true`, an exact `resolvedModel`, plus its native `childSessionKey` and `runId`; otherwise the router keeps it unavailable.

## Evidence contract

Record for each child: task ID, role, agent ID, requested model, resolved model, child session key, route kind, result status, verifier verdict, and whether fallback or escalation was used. Admission (`modelApplied: true`) is not execution proof; require a completion event from the resolved child model.
