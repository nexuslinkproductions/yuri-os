# YURI October × OMP MoE Canvas Workflow

**Date:** 2026-07-16  
**Status:** Operating design; implementation is not yet end-to-end live  
**Scope:** October canvas, persistent Codex and Claude Code terminals, Python coordination, OMP TaskTool, and MURE MoE dispatch

## Ruling

Use six cooperating planes with one owner per transition:

1. **October is the outer workflow and UI plane.** It owns the visible plan, dependency-aware board, terminal lifecycle, queued peer delivery, and operator status.
2. **Codex terminals are persistent implementation/integration workcells.** They own bounded source changes in isolated worktrees and return commit/artifact bundles. One designated Codex terminal owns final integration.
3. **Claude Code terminals are persistent architecture/advisory/review workcells.** They run only as continuous interactive CLI/PTY sessions. They default to read-only planning and independent review; mutation requires an explicitly assigned isolated October worktree and scoped path ownership.
4. **Python is the deterministic coordinator.** It may compile task DAGs, invoke pure planners, validate schemas/parity, observe state, and render status. It does not select models, admit OMP children, decide verifier outcomes, merge code, or impersonate TaskTool.
5. **One parent OMP session is the inner MURE/MoE execution plane.** MURE alone owns risk routing, producer/evidence/fallback/escalation/verifier attempts, TaskTool receipts, pushed results, transcript/model proof, and terminal extraction.
6. **Kagami is the evidence plane.** It mirrors lifecycle observations and cross-session correlation without advancing execution state.

October must not become a second MURE reducer. Python must not become a fake OMP runtime. Codex subagents and Claude Code workcells must not be presented as MURE model-route evidence.

## Ground Truth and Confidence

### CONFIRMED

- `_SYSTEM/mure/sol-moe-company.mjs` produces a governed, manifest-only plan from explicit subtasks.
- `_SYSTEM/mure/sol-moe-router.mjs` classifies R0–R3 and separates primary, evidence, availability-fallback, quality-escalation, and verifier routes.
- `_SYSTEM/mure/sol-moe-native-dispatch.mjs` is a pure reducer/compiler; it never invokes a tool or subprocess.
- `_SYSTEM/mure/sol-moe-parent-adapter.mjs` and `_SYSTEM/mure/omp-task-adapter.mjs` correlate real OMP receipts, task results, and transcript evidence by `jobId`.
- `_SYSTEM/mure/native-dispatch-shadow.mjs` is observer-only and non-persistent.
- The installed runtime is OMP 17.0.1. Its documented TaskTool batch wire is `{context, tasks: [{name?, agent?, task, isolated?}]}` with no top-level agent or wire label.
- The current compiler emits `{i, context, tasks: [{task, name, agent}]}`. The nested item fields match OMP 17, but top-level `i` is undocumented and must be removed or proven by a live schema test.
- There is no production caller of `applyOmpCompletion` and no production constructor of the native shadow. The native MoE loop is a tested parent protocol, not a fully wired runtime controller.
- The committed October fleet protocol and bridge are separate from the native MoE reducer. At committed baseline `0be372f9`, the extension owns only peer identity, lease renewal, join/left evidence, degradation, and shutdown. Reconciliation/injection work is concurrently in progress and is not treated as delivered until committed and verified.
- The fleet protocol is currently a closed two-peer contract: literal `captain` and `worker`. It is not a general N-terminal identity system.
- Targeted pure suites pass, and catalog projection is clean, but those checks do not prove live card/model parity.

### CONFIRMED BLOCKERS

1. `WORKER_BINDINGS` and generated OMP cards are not live-model equivalent for every route. Examples include Opus, Terra, Luna, MiMo, and DeepSeek bindings.
2. The router does not enforce the provider-route registry directly, so a planned route can later be blocked or resolve to a different card/model.
3. The existing green validators do not prove, in one gate, that every binding is adapter-admissible, catalogued, projected, exact-model-resolved, enabled, and backed by a passing latest canary.
4. Raw OMP failure normalization currently makes several reducer fallback classes difficult or impossible to reach from actual TaskTool failure text.
5. The shadow cannot yet faithfully project every valid reducer path, especially unverified R0/R1 completion and verifier-reject → quality-escalation → re-verification.
6. No canonical correlation envelope joins October task/node state to fleet events, MURE entry state, OMP receipt/result/transcript evidence, and the shadow ledger.
7. No supported repo-native Python → October bus adapter exists. `.october/canvas.json` is runtime state, not an API.

### NEEDS VERIFICATION

- One live positive/negative R2 canary must prove the current OMP schema, exact card/model resolution, correlation spine, independent verification, and fail-closed blocked-route behavior.
- OMP RPC mode is a possible Python-hosted automation surface, but it is not admitted for live MURE until project route gates and task settings are proven equivalent to the interactive parent.

## The Five Task Namespaces

Do not collapse local task IDs. Carry one immutable `correlationId`, but preserve each namespace:

| Namespace | Owner | Purpose | Completion authority |
|---|---|---|---|
| `octoberTaskId` | October board | Coarse canvas DAG unit | Atomic October claim/complete plus integrator acceptance |
| `codexTaskId` | One Codex terminal | Worktree-local implementation or audit | Scoped commit/artifact bundle; still advisory until integrated |
| `mureTaskId` / `entryId` | MURE reducer | One governed producer/evidence/verifier attempt chain | `extractTerminalTaskResult(s)` |
| `ompTaskName` / `jobId` | Parent OMP TaskTool | One native child execution | Pushed TaskTool result plus transcript/model proof |
| `fleetTaskId` | OMP fleet bridge | Optional work transfer between two independent OMP TUIs | Fleet task terminal event after downstream acceptance |

The identity spine is:

```text
correlationId
  ├─ October canvasId / plan item / octoberTaskId / nodeId
  ├─ Codex terminal / worktree / branch / codexTaskId
  ├─ fleet traceId / fleetTaskId                 (optional peer bridge)
  └─ MURE mureTaskId / entryId / purpose / attempt
       └─ OMP task name / jobId / agentId
            └─ transcript sessionId / model_change
                 └─ MURE completion event / shadow ticket / terminal result
```

## Current Native MoE Lifecycle

1. **Intake:** A controller supplies explicit `task.subtasks`. The current native runner does not decompose arbitrary free text.
2. **Governance and role cast:** `planSolMoeCompany` calls `planCompany` for roster casting and the six-gate governance hold. Owner-held subtasks never enter executable queues.
3. **Risk and route policy:** `routeTask` deterministically classifies R0–R3 and selects a producer, optional evidence workers, dormant availability fallbacks, dormant quality escalations, and an independent verifier for R2/R3.
4. **Manifest:** `sol-moe-company` emits task-scoped entries and separate queues. Nothing runs.
5. **Reducer initialization:** `createNativeDispatchState` creates `pending`, `owner-held`, or `blocked` task records.
6. **Scheduling:** `reduceNativeDispatch(state, null)` returns one `omp-task-spawn`, `fail-loud`, or `none` action. The parent may expose independent pending tasks concurrently, but state transitions remain serialized through one reducer owner.
7. **Compilation:** `compileOmpSpawn` creates one TaskTool unit. Do not hand-write or batch-rewrite MURE actions until the adapter explicitly supports aggregate receipts.
8. **Execution:** Only the live parent OMP session invokes `task(action.args)`.
9. **Admission:** The TaskTool receipt `{jobId, agent}` is validated and admitted into reducer and shadow together.
10. **Completion:** OMP pushes `{id, agent, status, duration, output}`. A successful result additionally requires a path-confined transcript with one session, one `model_change`, and at least one thinking-level event.
11. **Reduction:** Availability failure selects the next task-scoped fallback; semantic failure fails loud; evidence precedes the producer; R2/R3 producer success schedules the verifier; rejection schedules quality escalation and then re-verification; verifier execution failure fails loud.
12. **Acceptance:** Only `extractTerminalTaskResult(s)` produces the normalized MURE terminal record. The outer workflow may mark accepted/integrated only after this point.

## One Writer per Transition

| Transition | Sole writer | Observers |
|---|---|---|
| Goal bound and final acceptance | Control Codex / owner | October plan, Python status |
| Visible macro plan | Control Codex via October plan tools | All canvas nodes |
| Outer DAG and dependency readiness | October task board | Python coordinator, Control Codex |
| Outer claim/complete | October board authority | Control, Python |
| Worktree mutation and scoped commit | Assigned isolated Codex or Claude Code terminal | Verifier, Control |
| MURE plan and route classification | Sol company/router | Python may validate only |
| Next spawn/fallback/escalation/verifier | Native MURE reducer | Shadow, Python |
| Spawn accepted | Parent adapter from real TaskTool receipt | Shadow, Kagami |
| Child terminal fact | OMP TaskTool push | Parent adapter, Kagami |
| Transcript/model verification | OMP task adapter + parent adapter | Shadow, Python |
| R2/R3 verdict | Independent reducer-selected verifier | Control, Kagami |
| Evidence projection | Kagami correlation adapter | October status surface |
| Merge/integration | One designated Control Codex | Python status, October plan |
| Owner-delivered | Control Codex via October | All nodes |

`wait_for_nodes` and an idle terminal are scheduling evidence, not semantic completion. A plausible result body with status `failed`, `cancelled`, or `timeout` is not success.

## General Canvas Topology

```text
                         ┌─────────────────────────────┐
                         │ Control / Integrator Codex  │
                         │ goal, plan, merge, delivery │
                         └──────────────┬──────────────┘
                                        │ explicit October bus
              ┌─────────────────────────┼──────────────────────────┐
              │                         │                          │
    ┌─────────▼─────────┐    ┌──────────▼──────────┐    ┌──────────▼─────────┐
    │ Python Coordinator │    │ Parent OMP / MURE   │    │ Independent Verify │
    │ DAG/status/gates    │    │ native MoE reducer  │    │ Orion / Claude Code │
    └─────────┬─────────┘    └──────────┬──────────┘    └────────────────────┘
              │                         │ TaskTool
       readiness/status          ephemeral OMP children
              │                 producer/evidence/verifier
    ┌─────────▼─────────┐
    │ Isolated Codex     │  implementation/integration worktree owners
    │ worker terminals   │
    └────────────────────┘

    Claude Code terminals attach beside Control for architecture, advisory,
    and independent review; they do not sit inside the OMP child tree.

                 all accepted observations ──► Kagami evidence
```

Use a star topology through Control. Do not build an all-to-all mesh. Keep ephemeral OMP children rolled up inside the parent OMP node; create a canvas terminal only for persistent, human-steerable, or durable file-owning work.

### Current canvas assignment

- **Atlas:** Control/integrator and final user delivery.
- **Juno:** plain persistent terminal suitable for Python plan/status tooling or the visible parent OMP session, but not both simultaneously.
- **Apollo:** adversarial audit/evidence lane; no implicit merge authority.
- **Orion:** persistent Claude Code architecture, synthesis, and independent-review lane. Its current main-root session is review-only; `needs-input`/paused maps to `WAITING_OWNER`, not failure or reassignment.

Exactly one terminal may integrate against the main tree. Every concurrent mutating Codex or Claude Code workcell uses an isolated October worktree and explicit path ownership.

## Claude Code Terminal Boundary

### Default use

- Architecture decomposition and interface review.
- Adversarial critique, second opinion, and independent verification.
- Long-running contextual collaboration that benefits from a persistent conversation.
- Review of a Codex worktree commit or artifact bundle before Control integrates it.

### Mutation use

A Claude Code terminal may implement a bounded task only when October creates or assigns an isolated worktree, the packet names its owned paths, and Control remains the sole integrator. A Claude Code terminal opened on the main repository is advisory/review-only.

### Required session contract

- Use a continuous interactive `claude` CLI/PTY session.
- Preserve one session across follow-ups; use queued October delivery rather than starting a new prompt process.
- Never use the Claude SDK, `claude -p`, `claude --print`, or another no-session-persistence prompt call.
- A Claude review is peer evidence. It does not replace the reducer-selected MURE verifier when R2/R3 policy requires one.

## Python Boundary

### Allowed now

- Create and validate outer task/DAG JSON.
- Invoke `node _SYSTEM/mure/sol-moe-run.mjs --task-file <file>` to obtain read-only native dispatch intent.
- Run parity, catalog projection, fleet validation, and pure test commands.
- Observe public task/event projections and render a dashboard/status summary.
- Compute readiness and dependency state, then hand recommendations to the Control agent for October connector actions.

### Allowed only after a dedicated admission test

- Host one long-lived `omp --mode rpc` parent, correlate JSONL command IDs, and subscribe to subagent lifecycle events. OMP must still call TaskTool. Do not launch one OMP process per leaf.

### Forbidden

- Reimplement MURE classification, model routing, fallback, escalation, or verifier logic.
- Fabricate TaskTool receipts, results, transcripts, or model evidence.
- Launch `omp -p`, ephemeral `codex exec`, or a fresh paid process per task as a substitute for the parent lifecycle.
- Drive visible October terminals with tmux/send-keys or scrape terminal output.
- Read or mutate `.october/canvas.json` as an integration API.
- Treat Python polling or terminal idleness as completion.

## Typed Handoff Envelope

Cross-plane messages wrap native observations; they never replace native OMP shapes.

```json
{
  "schemaVersion": "yuri.october-work.v1",
  "correlationId": "oct_<short-uuid>",
  "eventId": "evt_<unique>",
  "eventType": "WORK_PACKET|SPAWN_RECEIPT|CHILD_RESULT|TRANSCRIPT_VERIFIED|VERIFY_VERDICT|DELIVERY",
  "actor": { "nodeId": "...", "role": "control|python|omp-parent|codex-worker|claude-reviewer|verifier" },
  "october": { "canvasId": "...", "planItemId": "...", "taskId": "..." },
  "mure": {
    "taskId": "...", "entryId": "...", "purpose": "producer|evidence|verifier",
    "riskClass": "R2", "routeKind": "primary", "attempt": 1, "shadowId": "..."
  },
  "omp": {
    "taskName": "...", "jobId": "...", "agentId": "...",
    "requestedModel": "...", "resolvedModel": "...",
    "resultStatus": "...", "transcriptUri": "history://..."
  },
  "git": { "worktree": "...", "branch": "...", "commit": "...", "paths": [] },
  "acceptance": [],
  "artifactUris": [],
  "occurredAt": "..."
}
```

Required work-packet fields are goal, scope/path ownership, acceptance, risk, authority, dependencies, expected result shape, and correlation ID. Required result fields are exact status, commit/artifact references, tests, caveats, and unresolved questions.

## Operator State Model

```text
QUEUED → READY → CLAIMED → DISPATCH_REQUESTED → SPAWN_ACCEPTED → RUNNING
       → CHILD_TERMINAL → TRANSCRIPT_VERIFIED → VERIFYING → ACCEPTED
       → INTEGRATED → DELIVERED
```

Side states:

```text
WAITING_OWNER | NEEDS_REVIEW | BLOCKED_ROUTE | DEGRADED | FAILED | EVIDENCE_MISMATCH
```

Text must accompany color. An OMP producer completion with a pending R2 verifier remains `VERIFYING`. A paused terminal that needs permission is `WAITING_OWNER`. A correlation mismatch fails closed as `EVIDENCE_MISMATCH`.

## General Runbook

1. Control creates one root `correlationId` and a visible October plan.
2. Python compiles the outer dependency DAG and pure MURE intent. The Control agent posts October board tasks and creates only the isolated terminals that are actually needed.
3. A worker atomically claims an outer task and receives a self-contained typed packet through queued October delivery.
4. Durable multi-file implementation stays in the assigned Codex worktree. Codex-local subagents may help, but their output is not MURE route proof.
5. Architecture synthesis and independent code review may go to a persistent Claude Code terminal such as Orion. It stays read-only on main or receives its own isolated worktree for an explicitly bounded implementation task.
6. MURE research, model-route alternatives, and policy-required verification go to the parent OMP session. It owns all TaskTool calls and reducer state.
7. The implementation workcell returns a scoped commit/artifact bundle. A separate dependent verifier task evaluates it independently.
8. Control integrates only verified commits, runs final repository checks, emits `DELIVERY`, and completes the October plan.

## Implementation Order

1. **Parity gate first.** Add one fixture-driven check spanning `WORKER_BINDINGS`, adapter-accepted IDs, provider registry latest status, catalog projection, exact projected model, and `disabledAgents`. A fake binding and a historically proven but later blocked route must fail.
2. **Reconcile current drift.** Align TaskTool compiler/tests/skills/cards with OMP 17 and align route policy/bindings with executable card IDs.
3. **Correlation contract.** Add a schema/test and a short adapter that wraps October, MURE, and OMP observations without becoming a reducer.
4. **Parent lifecycle adapter.** Wire a real OMP extension or supported host path around TaskTool spawn receipts and async pushed results. Preserve one serialized reducer owner.
5. **Finish fleet bridge Phase 1.** Complete and independently verify reconciliation, fleet tool/commands, recovery, smoke harness, and visible two-terminal acceptance.
6. **Python coordinator.** Add it only against supported October/OMP APIs. It owns readiness, presentation, and validation—not execution truth.
7. **Canvas template.** Register the star topology and operator state surface after the schema and live smoke pass.
8. **Retirement work last.** Census nano execution callers separately. Preserve Kagami evidence even if nano execution paths are later retired.

## R2 Acceptance Smoke

### Positive

- Create one October R2 board task.
- Route to a currently eligible producer and an independent Sonnet 5 verifier.
- Require the same `correlationId` in the October task, wrapped spawn receipt, wrapped child result, transcript evidence, MURE shadow, Kagami event, and final delivery.
- Require exact requested/resolved model equality, verifier pass, and no duplicate delivery.

### Negative

- Select a route with historical success but a later blocking status, such as the current Terra condition.
- Require rejection before TaskTool spawn: no `jobId`, no admission, no child transcript.
- Inject one mismatched correlation ID and require `EVIDENCE_MISMATCH` with no acceptance or integration.

## Evidence Reviewed

- OMP 17.0.1 internal docs: `omp://tools/task.md`, `omp://rpc.md`.
- Native MoE planner/router/reducer/parent adapter/task adapter/shadow modules and focused tests.
- MURE agent catalog, provider-route registry, generated OMP cards/config, sync check, and fleet validator.
- October fleet protocol, bridge baseline, Phase 1 design/plan, and concurrent in-progress extension diff.
- Live October canvas tools and current node topology.

Validation observed during this synthesis:

- 182 focused native/fleet/Kagami/nano tests: pass.
- Expanded MoE/router/adapter/shadow/resolver/registry/projection audit: pass at the pure-contract level.
- `mure-omp-sync.mjs --check`: 127 projected, 76 executable, 51 disabled, no projection drift.
- `mure-fleet-validate.mjs`: GREEN.

These results validate the pure contracts. They do not supersede the parity blockers or constitute a live end-to-end October → OMP → MURE canary.
