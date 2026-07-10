---
skill: mure-native-dispatch-loop
description: "Pure-native MURE Sol MoE dispatch loop — plan/compile, allowlisted sessions_spawn from the parent only, receipt admission, pushed-completion adaptation, shadow mirroring, terminal extraction. No polling, no subprocess runtime."
---

Invoke the **mure-native-dispatch-loop** skill. Walk `_SYSTEM/mure/sol-moe-parent-adapter.mjs` (glue), `_SYSTEM/mure/sol-moe-native-dispatch.mjs` (reducer), and `_SYSTEM/mure/native-dispatch-shadow.mjs` (shadow) in order:

1. Plan/compile — `planSolMoeCompany` → `createNativeDispatchState(plan)`.
2. Schedule — `reduceNativeDispatch(state, null)` → act on `sessions_spawn` actions from the parent session only.
3. Admit — `validateAcceptanceReceipt` + `admitNativeAcceptance` (reducer + shadow in lockstep).
4. Adapt pushed completions — `translatePushedCompletion` / `applyPushedCompletion` (never polled).
5. Mirror — `mirrorNativeAction` into the shadow ledger; governance violations warn, never block.
6. Verify — strict `{"verdict":"pass"|"reject"}` contract, independence enforced at spawn time.
7. Extract terminal results — `extractTerminalTaskResult` / `extractTerminalTaskResults`.

Validate with `node --test _SYSTEM/mure/sol-moe-native-dispatch.test.mjs _SYSTEM/mure/native-dispatch-shadow.test.mjs _SYSTEM/mure/sol-moe-parent-adapter.test.mjs _SYSTEM/mure/sol-moe-native-boundary.test.mjs`.
