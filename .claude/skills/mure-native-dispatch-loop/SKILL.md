---
name: mure-native-dispatch-loop
description: "Run the pure-native MURE Sol MoE dispatch loop — plan/compile a manifest, admit only allowlisted OMP TaskTool spawns from the parent session, adapt pushed <task-result> completions (with transcript evidence), mirror the lifecycle into the shadow ledger, and extract terminal results. No polling, no subprocess/CLI runtime, no fabricated telemetry. Use whenever you are wiring, debugging, or walking through _SYSTEM/mure/sol-moe-parent-adapter.mjs, sol-moe-native-dispatch.mjs, or native-dispatch-shadow.mjs."
---

# MURE Native Dispatch Loop

Pure-native MURE dispatch: a manifest is planned and compiled to whitelist-only OMP `task` payloads by `compileOmpSpawn`, the **parent OMP session** is the only actor that ever invokes the `task` tool, every spawn receipt and pushed completion is validated before it is trusted, and the reducer's lifecycle is mirrored into a shadow ledger for audit. Three pure modules own this — `_SYSTEM/mure/sol-moe-native-dispatch.mjs` (reducer + compiler), `_SYSTEM/mure/native-dispatch-shadow.mjs` (shadow observer), `_SYSTEM/mure/sol-moe-parent-adapter.mjs` (the glue the parent session calls, with `_SYSTEM/mure/omp-task-adapter.mjs` providing receipt/result/transcript parsing). None of the three calls the `task` tool, spawns a subprocess, or persists anything — see each file's `@does` header.

## When this fires

Wiring a new caller onto `sol-moe-parent-adapter.mjs`; debugging a stuck/misrouted OMP dispatch task; reviewing a PR that touches `sol-moe-native-dispatch.mjs`, `native-dispatch-shadow.mjs`, `omp-task-adapter.mjs`, or the parent adapter; explaining the loop to another lane before it dispatches live MURE work.

## Before editing any of the four modules

1. `node _SYSTEM/Scripts/capability-recall.mjs "omp task adapter parent adapter"` — confirm you are extending this loop, not rebuilding it (`.claude/rules/capability_first.md`).
2. `gitnexus_impact` on the symbol you intend to change (owner-warn on HIGH/CRITICAL) — these modules are load-bearing for every live MURE producer/verifier cycle.
3. Read the matching `*.test.mjs` next to the file you're touching (`sol-moe-native-dispatch.test.mjs`, `sol-moe-parent-adapter.test.mjs`, `sol-moe-native-boundary.test.mjs`, `omp-task-adapter.test.mjs`) before changing behavior — they encode the invariants below.

## The loop, in order

### 1. Plan / compile

`planSolMoeCompany` (`_SYSTEM/mure/sol-moe-company.mjs`) produces a governed manifest: `plan.routes` (one entry per taskId, each carrying `route.classification.riskClass` and verifier requirements) and `plan.queues` (`producers`, `verifiers`, `availabilityFallbacks`, `qualityEscalations`, optional `evidence`, `calibrationAlternatives`).

`createNativeDispatchState(plan, options)` (`sol-moe-native-dispatch.mjs`) turns that manifest into serializable reducer state — one task record per route, `status: 'pending' | 'owner-held' | 'blocked'` to start, plus a `providerCalibration` window seeded from `options.providerHistory`.

`compileOmpSpawn(entry, context)` is the pure compiler from one manifest entry to the **complete, whitelist-only** OMP TaskTool payload `{ i, context, agent, tasks: [{ id, assignment, description, role }] }`. `agent` is top-level and `tasks[]` always contains exactly one dispatched unit. It is called internally by the reducer's `spawn()` step — you never call it standalone in normal flow.

### 2. OMP `task` only from the parent

The reducer never executes anything. `reduceNativeDispatch(state, event, options)` returns an **action** — `{type: 'omp-task-spawn', taskId, purpose, routeKind, attempt, entryId, args}`, `{type: 'fail-loud', taskId, code, message}`, or `{type: 'none', reason}` — and the parent OMP session is the only caller allowed to act on an `omp-task-spawn` action by actually invoking the OMP `task` tool with `action.args`. `entry.model` is checked against a hardcoded `WORKER_BINDINGS` allowlist (`sol-moe-native-dispatch.mjs`); an unlisted model or a mismatched `agentId` throws before compilation. Sol/Yuri (`agentId: 'mure-yuri'` or `model: 'openai/gpt-5.6-sol'`) is rejected everywhere — the parent control plane can never be compiled as a child worker (`SOL_PARENT_WORKER_FORBIDDEN`).

Call `reduceNativeDispatch(state, null)` to get the next scheduling tick (first pending task, or the next queue entry for an in-flight task). Only branch on `action.type === 'omp-task-spawn'` to actually spawn; `'fail-loud'` and `'none'` are terminal-for-now — do not retry them yourself, the reducer already decided.

Every compiled unit requires its own TaskTool call, including consecutive units addressed to the same agent. The parent may run independent calls concurrently, but `compileOmpSpawn` never emits a multi-task batch. Nested orchestration follows `.omp/config.yml` `task.maxRecursionDepth: 2`; depth-2 workers are leaves, and this contract defines no `maxChildrenPerAgent` setting.

### 3. Receipt validation / admission

Once the parent's `task` call returns a receipt, validate it before trusting it anywhere:

```js
const receipt = parseOmpSpawnReceipt(rawReceipt); // throws on malformed receipt
// receipt = { jobId, agent }
```

`parseOmpSpawnReceipt` (in `omp-task-adapter.mjs`) enforces a non-empty `jobId` matching `^[a-zA-Z0-9][a-zA-Z0-9._-]{0,63}$` and a `agent` drawn from the known card-id set (`VALID_AGENT_IDS`). Then admit it into **both** the reducer state and the shadow in lockstep with one call:

```js
shadow = mirrorOmpSpawnAction(shadow, scheduledAction);
const { state, action, shadow: admittedShadow, receipt } = admitOmpSpawn(state, shadow, scheduledAction, rawReceipt);
```

The parent must mirror the scheduled action before admission. `admitOmpSpawn` then calls `recordNativeSpawnAccepted` (reducer) and `observeNativeAdmission` (shadow) together — there is no path where one is admitted and the other is not. Admission stores `{ jobId, agent }` against the awaiting task; the resolved model is checked later from the transcript's `model_change` line, not from the receipt. Drift between requested and resolved model fails the task loud (`MODEL_MISMATCH`) at completion time.

### 4. Pushed-completion adaptation (never polled)

OMP pushes a `<task-result>` block. The parent never polls. The completion payload carries `{ id, agent, status, duration, output }`; `parseOmpTaskResult` validates the shape and produces the normalized terminal record. Correlation is by `jobId` plus the awaiting task's recorded `agent` and emitted `deterministicOmpTaskId` — never by guessed status. A successful completion additionally requires a transcript under `artifactsDir/<jobId>.jsonl` containing exactly one `session`, exactly one `model_change`, and at least one `thinking_level_change` event; `loadOmpTranscript` enforces the path-confinement guard.

```js
const { state, action, event, shadow } = applyOmpCompletion(state, shadow, rawResult, jobId, transcriptJsonl, { evidence, cwd });
// or, loading transcript from disk:
const applied = applyOmpCompletionFromDisk(state, shadow, rawResult, jobId, artifactsDir, { evidence, cwd });
```

`applyOmpCompletion` is one pure step: parse the result, translate the completion against the awaiting admission (`translateOmpCompletion` inside the parent adapter — resolves `taskId`/`entryId`/`purpose` from the **one** task whose `awaiting.accepted.jobId` matches the result's `jobId`; a mismatch throws rather than silently rebinding), reduce through `reduceNativeDispatch`, and mirror into the shadow. State and shadow never drift apart.

### 5. Shadow mirroring

`native-dispatch-shadow.mjs` never selects routes, executes `task`, or alters reducer behavior — it is a shadow-only projection into the delegation ledger (`delegation-ledger.mjs`) for audit. `mirrorOmpSpawnAction(shadow, action)` forwards a reducer action into the shadow (tolerates non-`omp-task-spawn` actions without throwing). Every action is also passed through `validateDispatchGovernance` (`dispatch-governance.mjs`); a governance violation is **recorded as a warning observation**, not a block — the shadow is advisory, the reducer's allowlist checks are the real gate.

### 6. Reducer action loop

Drive the loop by re-entering `reduceNativeDispatch` / `applyOmpCompletion` on every pushed event until the task reaches a terminal status. Internally the reducer already chains: producer success with `requiresVerifier(task)` true → spawns the verifier; verifier `reject` → spawns the next `qualityEscalation`; availability failure kind (`AVAILABILITY_FAILURES` set: `availability`, `transport`, `quota`, `rate-limit`, `timeout`, `auth`) → spawns the next `availabilityFallback`; anything else on failure → `fail-loud`. You do not re-implement any of this branching — you just keep feeding pushed events in.

### 7. Verifier handling

A task requires a verifier when `riskClass` is `R2`/`R3`, or the route explicitly sets `classification.requiresVerifier` / `verifier.required`. The verifier prompt (`buildTask` in `sol-moe-native-dispatch.mjs`) forces a strict contract: return exactly one JSON object, `{"verdict":"pass"}` or `{"verdict":"reject"}`, no markdown or prose. `reduceVerifierSuccess` rejects anything else as `SEMANTIC_FAILURE`. Independence is enforced at spawn time: a verifier sharing the producer's `agentId` or `model` is rejected (`VERIFIER_NOT_INDEPENDENT`); for `R3`, the verifier must additionally differ in provider family, and cheap-family models (`deepseek`/`mimo`/`ollama`/`cline`/`cursor`) can never be the verifier at all (`CHEAP_VERIFIER_FORBIDDEN`).

### 8. Terminal extraction

```js
extractTerminalTaskResult(state, taskId)   // null while in flight; throws on unknown taskId
extractTerminalTaskResults(state)          // only tasks currently in a terminal status
```

Terminal statuses: `passed`, `fail-loud`, `owner-held`, `blocked`. The extracted record carries `producer`, `evidence`, `priorVerifier`, and `failure` (null unless `fail-loud`) — this is what the parent session reports back, never the raw reducer task object.

### Live canary floor

Use an `R2` task for any live canary intended to prove both reducer completion and shadow-ledger acceptance: the shadow ledger accepts a producer only after an independent verifier passes. An `R1` producer can reach reducer `passed`, but it cannot prove a shadow `accepted` lifecycle. Pass proof to producer completion as exact evidence keys, e.g. `{ evidence: { result_label: '<label>' } }` for an `evidenceRequirements: ['RESULT_LABEL']` ticket; `checked` is verifier-verdict metadata, not producer evidence.

### No polling, no fake subprocess runtime, real-event-only telemetry

- **No polling.** The only way state advances is a pushed `<task-result>` plus its transcript, or an explicit scheduling tick (`reduceNativeDispatch(state, null)`). Never loop on `task` listing / `await` / sleeps to discover completion.
- **No fake subprocess runtime.** `sol-moe-native-boundary.test.mjs` asserts every `sol-moe-*.mjs` and `omp-task-adapter.mjs` production module contains zero CLI/subprocess agent-dispatch path — there is no `child_process`/`exec` fallback anywhere in this loop. The only execution path is the parent's real OMP `task` tool call.
- **Real-event-only telemetry.** `createProviderCalibrationReport` and `recordAcceptedProviderDispatch` summarize only **accepted OMP child dispatches** that actually happened (post-admission), never planned queue entries — see the `@does` header on `sol-moe-native-dispatch.mjs`. Do not synthesize calibration history from a plan; it must come from real `recordNativeSpawnAccepted` calls.

## Dry fixture walkthrough (no live spawn)

This mirrors `sol-moe-parent-adapter.test.mjs` exactly — read-only reasoning over the pure functions, nothing dispatched.

```js
import { createNativeDispatchState, reduceNativeDispatch, compileOmpSpawn } from './sol-moe-native-dispatch.mjs';
import { createNativeDispatchShadow } from './native-dispatch-shadow.mjs';
import {
  admitOmpSpawn, applyOmpCompletion, applyOmpCompletionFromDisk,
  extractTerminalTaskResult, mirrorOmpSpawnAction,
} from './sol-moe-parent-adapter.mjs';

// 1. plan/compile — one R2 task requiring a verifier
const plan = {
  routes: [{ taskId: 'task-a', held: false, route: {
    selection: 'primary', classification: { riskClass: 'R2', requiresVerifier: true }, verifier: { required: true },
  } }],
  queues: {
    producers: [{ id: 'task-a:producer', taskId: 'task-a', purpose: 'producer', agentId: 'mure-synthesist',
      model: 'minimax-portal/MiniMax-M3', thinking: 'high', prompt: 'Complete only task-a.' }],
    verifiers: [{ id: 'task-a:verifier', taskId: 'task-a', purpose: 'verifier', agentId: 'mure-calibrator',
      model: 'anthropic/claude-sonnet-5', thinking: 'high', prompt: 'Complete only task-a.' }],
    availabilityFallbacks: [], qualityEscalations: [], calibrationAlternatives: [],
  },
  blocked: [], providerCalibration: null,
};

let state = createNativeDispatchState(plan);
let shadow = createNativeDispatchShadow({ id: 'task-a' });

// 2. schedule → action.type === 'omp-task-spawn', purpose 'producer'
let { state: s1, action: a1 } = reduceNativeDispatch(state, null);
shadow = mirrorOmpSpawnAction(shadow, a1);                       // 5. shadow mirrors the action
// a1.args === compileOmpSpawn(<producer entry>, { cwd, attempt, taskId, upstream })
// a1.args.agent === 'mure-synthesist'; a1.args.tasks[0].id === <deterministicOmpTaskId>
// >>> parent session calls OMP task(a1.args) here — this walkthrough stops short of that <<<

// 3. admit the (simulated) OMP receipt
const receipt1 = { jobId: 'run-a', agent: 'mure-synthesist' };
let { state: s2, shadow: sh2 } = admitOmpSpawn(s1, shadow, a1, receipt1);

// 4. pushed producer completion → reducer chains straight into the verifier spawn
const transcriptJsonl = [
  JSON.stringify({ type: 'session', sessionId: 's-a' }),
  JSON.stringify({ type: 'model_change', model: 'minimax-portal/MiniMax-M3' }),
  JSON.stringify({ type: 'thinking_level_change', level: 'high' }),
  '',
].join('\n');
const result1 = { id: a1.args.tasks[0].id, agent: 'mure-synthesist', status: 'completed', duration: 1200, output: '{"summary":"ok"}' };
let producerApplied = applyOmpCompletion(s2, sh2, result1, receipt1.jobId, transcriptJsonl,
  { evidence: { TERM_COUNT: '4', FILE_COUNT: '1' } });
// producerApplied.action.type === 'omp-task-spawn', purpose === 'verifier'

// 3'. admit the verifier receipt, 4'. push its strict verdict
const verifierShadow = mirrorOmpSpawnAction(producerApplied.shadow, producerApplied.action);
const receipt2 = { jobId: 'run-v', agent: producerApplied.action.args.agent };
const transcriptJsonl2 = [
  JSON.stringify({ type: 'session', sessionId: 's-v' }),
  JSON.stringify({ type: 'model_change', model: plan.queues.verifiers[0].model }),
  JSON.stringify({ type: 'thinking_level_change', level: 'high' }),
  '',
].join('\n');
let verifierAdmitted = admitOmpSpawn(producerApplied.state, verifierShadow, producerApplied.action, receipt2);
const verdictResult = { id: producerApplied.action.args.tasks[0].id, agent: receipt2.agent, status: 'completed', duration: 800, output: '{"verdict":"pass"}' };
let finalApplied = applyOmpCompletion(verifierAdmitted.state, verifierAdmitted.shadow, verdictResult, receipt2.jobId, transcriptJsonl2);

// 8. terminal extraction
finalApplied.state.tasks['task-a'].status; // 'passed'
extractTerminalTaskResult(finalApplied.state, 'task-a'); // { status: 'passed', producer: {...}, ... }
```

Run the real version of this walkthrough with `node --test _SYSTEM/mure/sol-moe-parent-adapter.test.mjs` — it is the executable form of the fixture above and requires no live dispatch.

## Anti-patterns (never)

- Calling the OMP `task` tool from anywhere other than the parent OMP session in response to a reducer `omp-task-spawn` action.
- Hand-writing a `task` payload when `compileOmpSpawn` is available — the compiler is the only allowlisted source of TaskTool arguments.
- Fabricating or guessing `taskId`/`entryId`/`purpose` for a pushed completion instead of letting `applyOmpCompletion` resolve it from state via `jobId`.
- Treating a `<task-result>` whose `status` is not `completed` as success, or trusting `output` without a transcript whose `model_change.model` matches the requested entry.
- Polling for completion instead of waiting for the push.
- Treating a governance warning from the shadow as a hard block, or treating the shadow's ledger as authoritative over the reducer's task status.
- Seeding `providerCalibration` history from planned queue entries instead of actual accepted admissions.
- Compiling `mure-yuri` / `openai/gpt-5.6-sol` as a child worker, or letting a verifier share the producer's `agentId`/`model`.
- Batching tasks from different named agents into one `task` call — OMP `task` is single-agent per invocation.

## Validation

```bash
node --test _SYSTEM/mure/sol-moe-native-dispatch.test.mjs _SYSTEM/mure/native-dispatch-shadow.test.mjs \
  _SYSTEM/mure/sol-moe-parent-adapter.test.mjs _SYSTEM/mure/sol-moe-native-boundary.test.mjs \
  _SYSTEM/mure/omp-task-adapter.test.mjs
```

All five suites are pure unit tests over frozen state objects — no live `task` tool, no network, no owner gate required to run them.
