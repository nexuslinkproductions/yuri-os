# October Automatic OMP Fleet Identity

**Date:** 2026-07-16  
**Status:** Approved design

## Goal

An OMP terminal launched normally by October joins the project fleet without requiring a manually prefixed `YURI_FLEET_ID`. The first live October terminal becomes the captain. Later terminals become uniquely addressable workers. Existing explicit identity, lease, delivery, recovery, and non-October behavior remains compatible.

## Scope

This change owns four behaviors:

1. resolve a fleet identity from October's launch environment when no explicit identity exists;
2. elect exactly one captain through the existing atomic peer lease;
3. give every additional October terminal a unique worker peer ID;
4. extend delivery so the logical address `worker` denotes the worker group while exact worker peer IDs remain direct addresses.

## Non-goals

- Modifying the October application or its canvas schema.
- Replacing the Kagami event bus or nano-lease substrate.
- Electing a replacement captain while a live captain still owns its lease.
- Changing task execution, result publication, acknowledgements, or restart recovery beyond the addressing rules required here.
- Automatically inventing identities for OMP sessions launched outside October.

## Identity model

### Peer IDs

Peer IDs identify one live logical participant:

- `captain`
- legacy explicit `worker`
- `worker-<normalized-node>-<hash8>`

The literal destination `worker` is also the closed worker-group address. A local peer is a worker-group member exactly when its validated peer ID is `worker` or begins with `worker-`. This lexical role rule applies equally to explicit and automatic identities, so event authorization and delivery never depend on process-local identity-source metadata.

### Resolution precedence

At `session_start`, the bridge resolves identity in this order:

1. If `YURI_FLEET_ID` is present, validate it and use it exactly. No automatic election or fallback applies.
2. If `YURI_FLEET_ID` is absent and `OCTOBER_BUS_NODE` is present, enter October automatic election.
3. If both are absent, preserve the existing failure: disable the bridge with `Invalid fleet ID` while leaving OMP usable.

An invalid explicit `YURI_FLEET_ID` never falls back to October identity. Explicit operator intent remains authoritative and errors remain visible.

### October node normalization

The automatic worker suffix is derived deterministically from the raw UTF-8 bytes of `OCTOBER_BUS_NODE`:

1. trim surrounding whitespace and reject an empty result;
2. lowercase;
3. replace each run of characters outside `[a-z0-9]` with one hyphen;
4. trim leading and trailing hyphens, using `node` as the readable slug if nothing remains;
5. compute the first eight lowercase hexadecimal characters of SHA-256 over the trimmed, pre-normalized node value;
6. produce `worker-<bounded-slug>-<hash8>`, shortening only the slug as needed to keep the complete peer ID within the existing 48-character limit;
7. pass the final value through the existing fleet-ID validator.

The hash is always present because normalization is lossy: values such as `node_A` and `node-A` must not collapse to the same worker ID. Invalid UTF-8/string input or an empty trimmed node disables the bridge with a specific invalid-October-node diagnostic. Automatic derivation never produces the unqualified peer ID `worker`.

## Race-safe captain election

Automatic election uses the existing exclusive peer lease as the authority. No preflight "is captain free?" check is permitted because it would introduce a time-of-check/time-of-use race.

`acquireLease` gains a closed failure discriminant while preserving holder metadata:

- `reason: live-holder` means the existing holder was positively found alive;
- `reason: reacquire-race` means another claimant won after dead-holder reclamation;
- thrown validation or filesystem errors remain errors, not ordinary contention results.

For an October automatic launch:

1. build the unique process owner ID;
2. atomically attempt to acquire the stable `captain` peer lease;
3. if acquired, activate as `captain`;
4. only when acquisition returns `reason: live-holder`, derive the worker peer ID and atomically acquire that worker's peer lease;
5. if the worker lease is held or loses a reacquisition race, disable the bridge with lease ID, holder owner ID, reason, and acquisition time when available; do not choose another identity;
6. a captain `reacquire-race`, validation failure, filesystem error, or protocol error disables the bridge and surfaces that failure. It never silently downgrades to worker.

This guarantees exactly one captain across simultaneous starts without classifying unstable error strings. Competing terminals that positively lose to a live captain proceed under collision-resistant worker IDs.

## Addressing model

### Address classes

Every fleet event destination is interpreted as one of:

| Destination | Meaning |
|---|---|
| `captain` | Direct delivery to the captain peer |
| `worker` | Group delivery to every local peer satisfying the worker-role predicate |
| `worker-<node>-<hash8>` | Direct delivery to that exact worker peer |

Destination membership is pure and local: `captain` matches only `captain`; `worker` matches peer `worker` and every validated `worker-*` peer; any other destination matches only an identical peer ID. There is no arbitrary prefix matching between direct destinations.

### Presence events

Captain presence announcements addressed to `worker` are visible to every worker-role peer. Worker presence announcements addressed to `captain` remain direct. Worker departure follows the same rule. A degraded peer that has lost its lease releases any leases it can on shutdown but does not publish `fleet.peer.left`; peers converge through lease expiry and reconciliation, preserving the existing safety rule against publishing after identity loss.

### Messages

A message addressed to `worker` is independently deliverable once to every worker-role peer. Folded message state records acknowledgements by `(messageId, recipientPeerId)`. The delivery selector suppresses a message only when the current recipient has acknowledged it; one worker's acknowledgement cannot suppress another worker's delivery.

The bridge's session-local injection guard remains keyed by `messageId` because each OMP process has one peer identity. Protocol acknowledgement state is recipient-aware. Event-ID deduplication remains the reducer's protection against replaying the same bus event.

A message addressed to an exact worker ID is delivered only to that worker. A message addressed to `captain` is delivered only to the captain.

### Task offers

A task offer addressed to `worker` is visible to every worker-role peer, but visibility is not ownership. Eligible workers use this claim sequence:

1. atomically acquire `taskLeaseId(projectId, taskId)` under the local process owner ID;
2. only the lease winner publishes `fleet.task.claimed` with its exact peer ID and records the task in `ownedTaskIds`;
3. losers observe the held task lease and neither publish a claim nor execute;
4. if claim-event append fails after lease acquisition, remove the task from local ownership, release the task lease best-effort, surface the error, and do not execute;
5. the winner renews the task lease while executing and publishes the existing completed/failed lifecycle before releasing ownership.

A task addressed to an exact worker ID is visible only to that worker. Captain-directed tasks remain direct. The group alias therefore provides a shared worker queue, not duplicated task execution.

## Bridge runtime data flow

1. `session_start` resolves explicit or October-automatic identity using undefined-vs-present environment semantics.
2. The bridge acquires exactly one peer lease for the resolved identity.
3. Runtime state records the resolved peer ID and identity source (`explicit` or `october-auto`).
4. Event authorization classifies senders through the closed captain/worker-role predicate, allowing legacy `worker` and validated `worker-*` peers while rejecting other roles for worker-only events.
5. The peer publishes `fleet.peer.joined` using its exact peer ID as `from`.
6. Reconciliation folds validated events, including recipient-aware message acknowledgements.
7. Delivery selectors evaluate exact destinations and the closed `worker` group alias.
8. Message injection remains session-local per receiving peer and message ID.
9. Task claiming acquires the exclusive task lease before publishing a claim or executing.
10. Shutdown publishes `fleet.peer.left` only while identity remains active, then releases task and peer leases best-effort.

## Commands and diagnostics

`/fleet-status` is implemented as part of this change and reports:

- exact peer ID when resolved;
- project ID when resolved;
- identity source: `explicit` or `october-auto`;
- active/degraded/disabled state;
- a bounded latest startup or lease error when disabled/degraded.

Disabled sessions expose only fields already resolved before failure; they never fabricate identity or project values. Startup notifications state the resolved exact peer ID. Automatic workers display values such as `fleet:worker-node-7-a1b2c3d4`, never only `fleet:worker`.

## Failure behavior

| Condition | Required behavior |
|---|---|
| Valid explicit fleet ID | Use exactly; do not auto-elect |
| Invalid explicit fleet ID | Disable with validation error; do not fall back |
| Missing explicit ID and valid October node; captain free | Acquire captain and activate |
| Missing explicit ID and valid October node; captain held live | Derive collision-resistant worker ID, acquire worker lease, activate |
| Captain lease reacquisition race, I/O, validation, or protocol failure | Disable and surface error; do not downgrade |
| Duplicate automatic October node | Second process fails on its worker lease with structured holder evidence |
| Missing both identity variables | Preserve `fleet:disabled`; OMP remains usable |
| Invalid or empty October node | Disable with specific node-normalization diagnostic |
| Group message | Deliver once to each worker-role peer; acknowledge per recipient |
| Group task offer | Multiple workers may observe; exactly one task lease owner claims and executes |
| Claim append failure after lease acquisition | Release task lease best-effort and do not execute |
| Direct dynamic worker destination | Deliver only to exact worker |
| Lease renewal loss | Preserve existing degraded behavior, block new operations, omit unsafe leave publication |

## Compatibility

- Existing `YURI_FLEET_ID=captain` and `YURI_FLEET_ID=worker` continue to work.
- Any validated explicit `worker-*` identity is intentionally classified as a worker role and participates in the worker group.
- Other valid explicit IDs remain valid peer identities but are not granted captain- or worker-only event authorization.
- Explicit duplicate IDs continue to fail closed.
- Existing two-terminal use becomes `captain` plus `worker-<node>-<hash8>`; callers using destination `worker` reach all worker-role peers.
- Event envelopes and the existing `to` field remain unchanged, but sender authorization and folded message acknowledgement state are upgraded for dynamic workers and per-recipient group delivery.
- Task leases remain the single ownership authority; the bridge adds the previously missing atomic claim path.
- OMP outside October remains opt-in through explicit `YURI_FLEET_ID`.

## Affected components

- `.omp/extensions/fleet-bridge.ts`
  - explicit/automatic identity resolution and captain-election control flow;
  - identity-source runtime field, `/fleet-status`, and bounded diagnostics;
  - atomic task claim, claim-failure cleanup, renewal, and release wiring.
- `_SYSTEM/Scripts/omp-fleet-protocol.mjs`
  - collision-resistant October worker-ID derivation;
  - captain/worker-role authorization predicate;
  - pure destination-membership predicate;
  - recipient-aware message acknowledgement reducer and message/task selectors.
- `_SYSTEM/Scripts/nano-lease.mjs`
  - closed acquisition-failure reason discriminant with holder evidence.
- `_SYSTEM/Scripts/omp-fleet-protocol.test.mjs`
  - normalization collisions, authorization, destination membership, acknowledgement isolation, selector, and negative contracts.
- `_SYSTEM/Scripts/nano-lease.test.mjs`
  - live-holder versus reacquisition-race result contracts.
- `_SYSTEM/Scripts/omp-fleet-smoke.mjs`
  - multi-process automatic launch, fan-out, direct delivery, and single-winner task acceptance.

## Acceptance matrix

1. A valid explicit identity overrides `OCTOBER_BUS_NODE`.
2. An invalid explicit identity fails without automatic fallback.
3. One October launch with no explicit identity becomes `captain`.
4. Two simultaneous October launches elect exactly one captain and one unique worker.
5. Three or more launches elect one captain and distinct workers.
6. Reusing the same October node rejects the duplicate worker with holder evidence.
7. Missing both environment variables preserves disabled-but-usable OMP behavior.
8. Invalid October node input fails visibly.
9. Non-collision captain startup errors do not downgrade to worker.
10. A `worker` group message reaches every active worker exactly once.
11. A direct worker message reaches only the named worker.
12. A `worker` group task is observed by eligible workers but executed by exactly one lease winner.
13. A direct worker task is offered only to the named worker.
14. Join and leave events remain visible to the intended captain or worker group.
15. A deterministic multi-process smoke run proves peer discovery, group message fan-out, direct message delivery, single-winner group task claiming, and clean lease release.
