---
skill: mure-native-dispatch-loop
description: "Pure-native MURE Sol MoE dispatch loop — plan/compile, allowlisted OMP TaskTool spawns from the parent only, receipt admission, <task-result> adaptation with transcript evidence, shadow mirroring, terminal extraction. No polling, no subprocess runtime."
---

Invoke the **mure-native-dispatch-loop** skill. Walk `_SYSTEM/mure/sol-moe-parent-adapter.mjs` (glue), `_SYSTEM/mure/sol-moe-native-dispatch.mjs` (reducer + `compileOmpSpawn` compiler), `_SYSTEM/mure/omp-task-adapter.mjs` (receipt / result / transcript parser), and `_SYSTEM/mure/native-dispatch-shadow.mjs` (shadow observer) in order:

1. Plan/compile — `planSolMoeCompany` → `createNativeDispatchState(plan)`.
2. Schedule — `reduceNativeDispatch(state, null)` → act on `omp-task-spawn` actions by invoking the OMP `task` tool with `action.args` from the parent session only. Different named agents require separate `task` calls; tasks sharing one agent may be batched into one `tasks[]` array.
3. Admit — `parseOmpSpawnReceipt` + `admitOmpSpawn` (reducer + shadow in lockstep); the receipt is `{ jobId, agent }`.
4. Adapt pushed completions — `applyOmpCompletion(state, shadow, result, jobId, transcriptJsonl, opts)` (or `applyOmpCompletionFromDisk(state, shadow, result, jobId, artifactsDir, opts)`). Correlation is by `jobId` plus task/agent/model evidence (`action.args.tasks[0].id`, `action.args.agent`, transcript `model_change.model`); never guessed status. Never polled.
5. Mirror — `mirrorOmpSpawnAction` into the shadow ledger; governance violations warn, never block.
6. Verify — strict `{"verdict":"pass"|"reject"}` contract, independence enforced at spawn time.
7. Extract terminal results — `extractTerminalTaskResult` / `extractTerminalTaskResults`.

Validate with `node --test _SYSTEM/mure/sol-moe-native-dispatch.test.mjs _SYSTEM/mure/native-dispatch-shadow.test.mjs _SYSTEM/mure/sol-moe-parent-adapter.test.mjs _SYSTEM/mure/sol-moe-native-boundary.test.mjs _SYSTEM/mure/omp-task-adapter.test.mjs`.
