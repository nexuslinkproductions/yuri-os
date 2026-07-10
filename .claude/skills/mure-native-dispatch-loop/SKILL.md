---
name: mure-native-dispatch-loop
description: "Run the pure-native MURE Sol MoE dispatch loop — plan/compile a manifest, admit only allowlisted native sessions_spawn from the parent OpenClaw session, adapt pushed child-completion events, mirror the lifecycle into the shadow ledger, and extract terminal results. No polling, no subprocess/CLI runtime, no fabricated telemetry. Use whenever you are wiring, debugging, or walking through _SYSTEM/mure/sol-moe-parent-adapter.mjs, sol-moe-native-dispatch.mjs, or native-dispatch-shadow.mjs."
---

# MURE Native Dispatch Loop

Pure-native MURE dispatch: a manifest is planned and compiled to whitelist-only `sessions_spawn` arguments, the **parent OpenClaw session** is the only actor that ever calls `sessions_spawn`, every admission and pushed completion is validated before it is trusted, and the reducer's lifecycle is mirrored into a shadow ledger for audit. Three pure modules own this — `_SYSTEM/mure/sol-moe-native-dispatch.mjs` (reducer), `_SYSTEM/mure/native-dispatch-shadow.mjs` (shadow observer), `_SYSTEM/mure/sol-moe-parent-adapter.mjs` (the glue the parent session calls). None of the three calls `sessions_spawn`, spawns a subprocess, or persists anything — see each file's `@does` header.

## When this fires

Wiring a new caller onto `sol-moe-parent-adapter.mjs`; debugging a stuck/misrouted native dispatch task; reviewing a PR that touches `sol-moe-native-dispatch.mjs`, `native-dispatch-shadow.mjs`, or the parent adapter; explaining the loop to another lane before it dispatches live MURE work.

## Before editing any of the three modules

1. `node _SYSTEM/Scripts/capability-recall.mjs "native sessions_spawn dispatch reducer"` — confirm you are extending this loop, not rebuilding it (`.claude/rules/capability_first.md`).
2. `gitnexus_impact` on the symbol you intend to change (owner-warn on HIGH/CRITICAL) — these three modules are load-bearing for every live MURE producer/verifier cycle.
3. Read the matching `*.test.mjs` next to the file you're touching (`sol-moe-native-dispatch.test.mjs`, `sol-moe-parent-adapter.test.mjs`, `sol-moe-native-boundary.test.mjs`) before changing behavior — they encode the invariants below.

## The loop, in order

### 1. Plan / compile

`planSolMoeCompany` (`_SYSTEM/mure/sol-moe-company.mjs`) produces a governed manifest: `plan.routes` (one entry per taskId, each carrying `route.classification.riskClass` and verifier requirements) and `plan.queues` (`producers`, `verifiers`, `availabilityFallbacks`, `qualityEscalations`, optional `evidence`, `calibrationAlternatives`).

`createNativeDispatchState(plan, options)` (`sol-moe-native-dispatch.mjs`) turns that manifest into serializable reducer state — one task record per route, `status: 'pending' | 'owner-held' | 'blocked'` to start, plus a `providerCalibration` window seeded from `options.providerHistory`.

`compileNativeSpawn(entry, context)` is the pure compiler from one manifest entry to the **complete, whitelist-only** `sessions_spawn` payload (`agentId`, `model`, `thinking`, `cwd`, `runtime: 'subagent'`, deterministic `taskName`, native `label`). It is called internally by the reducer's `spawn()` step — you never call it standalone in normal flow.

### 2. Native allowlisted `sessions_spawn` only from the parent

The reducer never executes anything. `reduceNativeDispatch(state, event, options)` returns an **action** — `{type: 'sessions_spawn', ...}`, `{type: 'fail-loud', ...}`, or `{type: 'none', ...}` — and the parent OpenClaw session is the only caller allowed to act on a `sessions_spawn` action by actually invoking the `sessions_spawn` tool. `entry.model` is checked against a hardcoded `WORKER_BINDINGS` allowlist (`sol-moe-native-dispatch.mjs`); an unlisted model or a mismatched `agentId` throws before compilation. Sol/Yuri (`agentId: 'mure-yuri'` or `model: 'openai/gpt-5.6-sol'`) is rejected everywhere — the parent control plane can never be compiled as a child worker (`SOL_PARENT_WORKER_FORBIDDEN`).

Call `reduceNativeDispatch(state, null)` to get the next scheduling tick (first pending task, or the next queue entry for an in-flight task). Only branch on `action.type === 'sessions_spawn'` to actually spawn; `'fail-loud'` and `'none'` are terminal-for-now — do not retry them yourself, the reducer already decided.

### 3. Receipt validation / admission

Once the parent's `sessions_spawn` call returns a receipt, validate it before trusting it anywhere:

```js
const receipt = validateAcceptanceReceipt(rawReceipt); // throws on malformed/non-'accepted' receipt
```

`validateAcceptanceReceipt` enforces `status === 'accepted'`, non-empty `runId`/`resolvedModel`, and a `childSessionKey` matching `^agent:[...]+:subagent:[...]+$` — never a bare label. Then admit it into **both** the reducer state and the shadow in lockstep with one call:

```js
const { state, action, shadow } = admitNativeAcceptance(state, shadow, scheduledAction, rawReceipt);
```

`admitNativeAcceptance` calls `recordNativeSpawnAccepted` (reducer) and `observeNativeAdmission` (shadow) together — there is no path where one is admitted and the other is not. If OpenClaw resolved a different model than requested, the reducer fails the task loud (`RESOLVED_MODEL_MISMATCH`) instead of silently accepting drift.

### 4. Pushed-completion adaptation (never polled)

OpenClaw pushes a completion payload — it is never fetched by polling `sessions_list`/`sessions_history` in a loop (see the subagent runtime contract: auto-announce is push-based). The payload only carries what OpenClaw actually knows: `childSessionKey`, `ok`, and `output`/`error`. `translatePushedCompletion(state, payload)` resolves `taskId`/`entryId`/`purpose` by finding the **one** task whose accepted admission matches `payload.childSessionKey` — these are never guessed or supplied by the caller, and a `runId` mismatch throws rather than silently rebinding.

```js
const { state, action, event, shadow } = applyPushedCompletion(state, shadow, payload, { evidence, cwd });
```

`applyPushedCompletion` = `translatePushedCompletion` + `reduceNativeDispatch(state, event)` + `observeNativeCompletion(shadow, event, reduction, evidence)`, done as one pure step so state and shadow never drift apart.

### 5. Shadow mirroring

`native-dispatch-shadow.mjs` never selects routes, executes `sessions_spawn`, or alters reducer behavior — it is a shadow-only projection into the delegation ledger (`delegation-ledger.mjs`) for audit. `mirrorNativeAction(shadow, action)` forwards a reducer action into the shadow (tolerates non-`sessions_spawn` actions without throwing). Every action is also passed through `validateDispatchGovernance` (`dispatch-governance.mjs`); a governance violation is **recorded as a warning observation**, not a block — the shadow is advisory, the reducer's allowlist checks are the real gate.

### 6. Reducer action loop

Drive the loop by re-entering `reduceNativeDispatch`/`applyPushedCompletion` on every pushed event until the task reaches a terminal status. Internally the reducer already chains: producer success with `requiresVerifier(task)` true → spawns the verifier; verifier `reject` → spawns the next `qualityEscalation`; availability failure kind (`AVAILABILITY_FAILURES` set) → spawns the next `availabilityFallback`; anything else on failure → `fail-loud`. You do not re-implement any of this branching — you just keep feeding pushed events in.

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

- **No polling.** The only way state advances is a pushed completion payload or an explicit scheduling tick (`reduceNativeDispatch(state, null)`). Never loop on `sessions_list`/`sessions_history`/sleep to discover completion.
- **No fake subprocess runtime.** `sol-moe-native-boundary.test.mjs` asserts every `sol-moe-*.mjs` production module contains zero CLI/subprocess agent-dispatch path — there is no `child_process`/`exec` fallback anywhere in this loop. The only execution path is the parent's real `sessions_spawn` tool call.
- **Real-event-only telemetry.** `createProviderCalibrationReport` and `recordAcceptedProviderDispatch` summarize only **accepted native child dispatches** that actually happened (post-admission), never planned queue entries — see the `@does` header on `sol-moe-native-dispatch.mjs`. Do not synthesize calibration history from a plan; it must come from real `recordNativeSpawnAccepted` calls.

## Dry fixture walkthrough (no live spawn)

This mirrors `sol-moe-parent-adapter.test.mjs` exactly — read-only reasoning over the pure functions, nothing dispatched.

```js
import { createNativeDispatchState, reduceNativeDispatch } from './sol-moe-native-dispatch.mjs';
import { createNativeDispatchShadow } from './native-dispatch-shadow.mjs';
import {
  admitNativeAcceptance, applyPushedCompletion, extractTerminalTaskResult, mirrorNativeAction,
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
const ticket = { id: 'task-a', from: 'control', to: 'worker',
  actors: { issuer: 'sol-parent', assignee: 'worker-a' }, scope: ['_SYSTEM/mure/'],
  expectedOutcome: 'bounded evidence', constraints: ['read-only'],
  evidenceRequirements: ['TERM_COUNT', 'FILE_COUNT'], escalationRule: 'return to control on ambiguity', writeSet: [] };

let state = createNativeDispatchState(plan);
let shadow = createNativeDispatchShadow(ticket);

// 2. schedule → action.type === 'sessions_spawn', purpose 'producer'
let { state: s1, action: a1 } = reduceNativeDispatch(state, null);
shadow = mirrorNativeAction(shadow, a1);                        // 5. shadow mirrors the action
// >>> parent session calls sessions_spawn(a1.args) here — this walkthrough stops short of that <<<

// 3. admit the (simulated) receipt
const receipt1 = { status: 'accepted', childSessionKey: `agent:${a1.args.agentId}:subagent:a`,
  runId: 'run-a', resolvedModel: a1.args.model };
let { state: s2, shadow: sh2 } = admitNativeAcceptance(s1, shadow, a1, receipt1);

// 4. pushed producer completion → reducer chains straight into the verifier spawn
let producerApplied = applyPushedCompletion(s2, sh2,
  { childSessionKey: receipt1.childSessionKey, ok: true, output: '{"summary":"ok"}' },
  { evidence: { TERM_COUNT: '4', FILE_COUNT: '1' } });
// producerApplied.action.type === 'sessions_spawn', purpose === 'verifier'

// 3'. admit the verifier receipt, 4'. push its strict verdict
const receipt2 = { status: 'accepted', childSessionKey: `agent:${producerApplied.action.args.agentId}:subagent:v`,
  runId: 'run-v', resolvedModel: producerApplied.action.args.model };
let verifierAdmitted = admitNativeAcceptance(producerApplied.state, producerApplied.shadow, producerApplied.action, receipt2);
let finalApplied = applyPushedCompletion(verifierAdmitted.state, verifierAdmitted.shadow,
  { childSessionKey: receipt2.childSessionKey, ok: true, verdict: 'pass' });

// 8. terminal extraction
finalApplied.state.tasks['task-a'].status; // 'passed'
extractTerminalTaskResult(finalApplied.state, 'task-a'); // { status: 'passed', producer: {...}, ... }
```

Run the real version of this walkthrough with `node --test _SYSTEM/mure/sol-moe-parent-adapter.test.mjs` — it is the executable form of the fixture above and requires no live dispatch.

## Anti-patterns (never)

- Calling `sessions_spawn` from anywhere other than the parent OpenClaw session in response to a reducer `sessions_spawn` action.
- Fabricating or guessing `taskId`/`entryId`/`purpose` for a pushed completion instead of letting `translatePushedCompletion` resolve it from state.
- Polling for completion instead of waiting for the push.
- Treating a governance warning from the shadow as a hard block, or treating the shadow's ledger as authoritative over the reducer's task status.
- Seeding `providerCalibration` history from planned queue entries instead of actual accepted admissions.
- Compiling `mure-yuri` / `openai/gpt-5.6-sol` as a child worker, or letting a verifier share the producer's `agentId`/`model`.

## Validation

```bash
node --test _SYSTEM/mure/sol-moe-native-dispatch.test.mjs _SYSTEM/mure/native-dispatch-shadow.test.mjs \
  _SYSTEM/mure/sol-moe-parent-adapter.test.mjs _SYSTEM/mure/sol-moe-native-boundary.test.mjs
```

All four suites are pure unit tests over frozen state objects — no live `sessions_spawn`, no network, no owner gate required to run them.

## Session Notes

### 2026-07-10
- session: 1m | peak ctx: 0% | compacts: 0
- tools: Bash×4, Read×3
- corrections: none
- errors: none

### 2026-07-11
- session: subagent (parent-loop-skill-build) | tools: Read, Bash, Write
- created SKILL.md + `/mure-native-loop` command alias by reading `sol-moe-parent-adapter.mjs`, `sol-moe-native-dispatch.mjs`, `native-dispatch-shadow.mjs`, and `sol-moe-parent-adapter.test.mjs` verbatim (no invented API surface)
- validated: `node --test` on all four suites green; grepped `@exports` headers against every function named in this doc; confirmed `commands/mure-native-loop.md` exists for the primary trigger
- corrections: none yet — first pass
- errors: none
