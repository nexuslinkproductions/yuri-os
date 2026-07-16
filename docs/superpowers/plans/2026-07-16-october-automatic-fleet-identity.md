# October Automatic Fleet Identity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every OMP terminal launched normally by October join the same project fleet automatically, with one atomically elected captain, collision-resistant workers, worker-group delivery, and single-winner task claims.

**Architecture:** Pure identity, authorization, addressing, and reducer behavior lives in `omp-fleet-protocol.mjs`; generic contention reasons remain in `nano-lease.mjs`; `.omp/extensions/fleet-bridge.ts` owns environment resolution and lifecycle side effects. October-auto sessions reserve a node lease before role election. The existing Kagami event envelope stays unchanged while recipient-aware message acknowledgement and worker-group selection extend folded protocol state.

**Tech Stack:** TypeScript OMP extension API, Node.js ESM, `node:test`, filesystem-backed nano leases, Kagami JSONL event bus.

---

## File map

| File | Responsibility |
|---|---|
| `_SYSTEM/Scripts/omp-fleet-protocol.mjs` | Pure worker-ID/node-lease derivation, role authorization, destination membership, recipient-aware acknowledgements, selectors |
| `_SYSTEM/Scripts/omp-fleet-protocol.test.mjs` | Observable protocol contracts and negative cases |
| `_SYSTEM/Scripts/nano-lease.mjs` | Discriminated atomic lease-contention results |
| `_SYSTEM/Scripts/nano-lease.test.mjs` | Live-holder and reacquisition-race contracts |
| `.omp/extensions/fleet-bridge.ts` | Automatic startup election, node/peer/task lease lifecycle, status and commands |
| `_SYSTEM/Scripts/omp-fleet-smoke.mjs` | Deterministic multi-process October acceptance |

### Task 1: Pure automatic identity and addressing contracts

**Files:**
- Modify: `_SYSTEM/Scripts/omp-fleet-protocol.test.mjs`
- Modify: `_SYSTEM/Scripts/omp-fleet-protocol.mjs`

- [ ] **Step 1: Add failing worker identity tests**

Add imports and contracts for:

```js
import {
  deriveOctoberWorkerId,
  octoberNodeLeaseId,
  isWorkerPeerId,
  destinationMatchesPeer,
} from './omp-fleet-protocol.mjs';

assert.equal(deriveOctoberWorkerId('Node_A'), 'worker-node-a-<expected-hash8>');
assert.notEqual(deriveOctoberWorkerId('node_A'), deriveOctoberWorkerId('node-A'));
assert.match(deriveOctoberWorkerId('x'.repeat(100)), /^worker-[a-z0-9-]+-[0-9a-f]{8}$/);
assert.ok(deriveOctoberWorkerId('x'.repeat(100)).length <= 48);
assert.throws(() => deriveOctoberWorkerId('   '), /Invalid October node/);
assert.equal(octoberNodeLeaseId('project-a', 'Node_A'), octoberNodeLeaseId('project-a', 'Node_A'));
assert.notEqual(octoberNodeLeaseId('project-a', 'Node_A'), octoberNodeLeaseId('project-a', 'node-a'));
assert.equal(isWorkerPeerId('worker'), true);
assert.equal(isWorkerPeerId(deriveOctoberWorkerId('Node_A')), true);
assert.equal(isWorkerPeerId('captain'), false);
assert.equal(destinationMatchesPeer('worker', deriveOctoberWorkerId('Node_A')), true);
assert.equal(destinationMatchesPeer(deriveOctoberWorkerId('Node_A'), deriveOctoberWorkerId('Node_A')), true);
assert.equal(destinationMatchesPeer('worker-a-deadbeef', 'worker-ab-deadbeef'), false);
```

Compute the expected hash inside the test with `crypto.createHash('sha256').update('Node_A').digest('hex').slice(0, 8)` rather than hard-coding an unverified digest.

- [ ] **Step 2: Run the focused protocol tests and observe RED**

Run:

```bash
node --test _SYSTEM/Scripts/omp-fleet-protocol.test.mjs
```

Expected: FAIL because the four new exports do not exist.

- [ ] **Step 3: Implement the pure helpers**

In `omp-fleet-protocol.mjs`, add:

```js
export function deriveOctoberWorkerId(rawNode) {
  if (typeof rawNode !== 'string' || rawNode.trim().length === 0) {
    throw new Error('Invalid October node');
  }
  const trimmed = rawNode.trim();
  const hash8 = crypto.createHash('sha256').update(trimmed).digest('hex').slice(0, 8);
  const normalized = trimmed
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'node';
  const fixedChars = 'worker--'.length + hash8.length;
  const slug = normalized.slice(0, MAX_FLEET_ID_CHARS - fixedChars).replace(/-+$/g, '') || 'node';
  return validateFleetId(`worker-${slug}-${hash8}`);
}

export function octoberNodeLeaseId(projectId, rawNode) {
  if (typeof projectId !== 'string' || projectId.length === 0) throw new Error('Invalid project ID');
  if (typeof rawNode !== 'string' || rawNode.trim().length === 0) throw new Error('Invalid October node');
  const digest = crypto.createHash('sha256').update(rawNode.trim()).digest('hex');
  return `fleet-node:${projectId}:${digest}`;
}

export function isWorkerPeerId(peerId) {
  return typeof peerId === 'string' && (peerId === 'worker' || /^worker-[a-z0-9]+(?:-[a-z0-9]+)*$/.test(peerId));
}

export function destinationMatchesPeer(destination, peerId) {
  if (destination === 'worker') return isWorkerPeerId(peerId);
  return destination === peerId;
}
```

- [ ] **Step 4: Run the focused protocol tests and observe GREEN**

Run the same `node --test` command. Expected: PASS.

- [ ] **Step 5: Commit Task 1**

```bash
git add _SYSTEM/Scripts/omp-fleet-protocol.mjs _SYSTEM/Scripts/omp-fleet-protocol.test.mjs
git commit -m "feat: derive October fleet identities" -- _SYSTEM/Scripts/omp-fleet-protocol.mjs _SYSTEM/Scripts/omp-fleet-protocol.test.mjs
```

### Task 2: Discriminated lease contention

**Files:**
- Modify: `_SYSTEM/Scripts/nano-lease.test.mjs`
- Modify: `_SYSTEM/Scripts/nano-lease.mjs`

- [ ] **Step 1: Add failing lease-result tests**

Extend existing acquisition tests to assert:

```js
assert.deepEqual(secondAttempt.ok, false);
assert.equal(secondAttempt.reason, 'live-holder');
assert.equal(secondAttempt.heldBy, firstOwner);
assert.ok(secondAttempt.since);
```

Add a child-process race test with two contenders blocked on the same stale lease directory. Release both contenders together after the stale holder is made non-live; assert exactly one contender returns `ok: true` and the loser returns:

```js
assert.equal(loser.ok, false);
assert.equal(loser.reason, 'reacquire-race');
```

The child barrier and temporary lease root make the race repeatable without changing the production lease API.
Do not assert unstable error strings.

- [ ] **Step 2: Run lease tests and observe RED**

```bash
node --test _SYSTEM/Scripts/nano-lease.test.mjs
```

Expected: FAIL because unsuccessful results lack `reason`.

- [ ] **Step 3: Return closed reasons from `acquireLease`**

Change only unsuccessful result construction:

```js
return { ok: false, reason: 'live-holder', heldBy: cur.nanoId, since: cur.acquiredAt };
```

and both post-reclamation losing branches:

```js
return { ok: false, reason: 'reacquire-race', heldBy: next?.nanoId ?? 'unknown', since: next?.acquiredAt };
```

Filesystem and validation failures continue throwing.

- [ ] **Step 4: Run lease tests and observe GREEN**

Run the focused lease test command. Expected: PASS.

- [ ] **Step 5: Commit Task 2**

```bash
git add _SYSTEM/Scripts/nano-lease.mjs _SYSTEM/Scripts/nano-lease.test.mjs
git commit -m "feat: classify lease contention" -- _SYSTEM/Scripts/nano-lease.mjs _SYSTEM/Scripts/nano-lease.test.mjs
```

### Task 3: Dynamic-worker authorization and recipient-aware delivery

**Files:**
- Modify: `_SYSTEM/Scripts/omp-fleet-protocol.test.mjs`
- Modify: `_SYSTEM/Scripts/omp-fleet-protocol.mjs`

- [ ] **Step 1: Add failing authorization and group-delivery tests**

Add contracts proving:

```js
assert.doesNotThrow(() => authorizeFleetOperation('fleet.peer.joined', dynamicWorker, { to: 'captain' }));
assert.throws(() => authorizeFleetOperation('fleet.task.offered', dynamicWorker, {}), /Unauthorized/);
```

Fold one group message and acknowledgements from two workers. Assert the message remains pending for worker B after worker A acknowledges, and disappears only after B acknowledges:

```js
const pendingA = selectPendingDeliveries(state, workerA);
const pendingB = selectPendingDeliveries(state, workerB);
assert.equal(pendingA.length, 1);
assert.equal(pendingB.length, 1);
reduceFleetEvent(state, ackEvent({ messageId, recipient: workerA, from: workerA }));
assert.equal(selectPendingDeliveries(state, workerA).length, 0);
assert.equal(selectPendingDeliveries(state, workerB).length, 1);
```

Add task selector assertions for `to: worker`, exact dynamic worker, and near-prefix mismatch.

- [ ] **Step 2: Run protocol tests and observe RED**

```bash
node --test _SYSTEM/Scripts/omp-fleet-protocol.test.mjs
```

Expected: FAIL on exact-string authorization, exact destination matching, and global acknowledgement state.

- [ ] **Step 3: Implement role authorization and per-recipient acknowledgements**

Replace exact worker sender checks with `isWorkerPeerId(from)`. Preserve captain-only offering/acceptance authority.

Represent folded acknowledgements as a `Set` or serializable array on each message row:

```js
acknowledgedBy: new Set(),
```

On `fleet.message.acknowledged`, require and record `payload.recipient`:

```js
message.acknowledgedBy.add(event.payload.recipient);
```

Update selectors:

```js
return destinationMatchesPeer(message.to, peer) && !message.acknowledgedBy.has(peer);
```

and:

```js
return destinationMatchesPeer(task.to, peer) && task.status === 'offered';
```

Ensure snapshot/render code converts `Set` values to arrays rather than emitting `{}`.

- [ ] **Step 4: Run protocol tests and observe GREEN**

Expected: all protocol tests pass, including legacy `captain`/`worker` cases.

- [ ] **Step 5: Commit Task 3**

```bash
git add _SYSTEM/Scripts/omp-fleet-protocol.mjs _SYSTEM/Scripts/omp-fleet-protocol.test.mjs
git commit -m "feat: route October worker groups" -- _SYSTEM/Scripts/omp-fleet-protocol.mjs _SYSTEM/Scripts/omp-fleet-protocol.test.mjs
```

### Task 4: Automatic node reservation and captain election

**Files:**
- Modify: `.omp/extensions/fleet-bridge.ts`
- Test: `_SYSTEM/Scripts/omp-fleet-smoke.mjs`

- [ ] **Step 1: Extend the smoke harness with failing startup scenarios**

Add subprocess scenarios using isolated temporary lease/event roots:

```text
A: OCTOBER_BUS_NODE=node-a, no YURI_FLEET_ID -> captain
B: OCTOBER_BUS_NODE=node-b, no YURI_FLEET_ID -> worker-node-b-<hash8>
C: OCTOBER_BUS_NODE=node-a, no YURI_FLEET_ID -> disabled duplicate-node
D: explicit YURI_FLEET_ID=worker overrides OCTOBER_BUS_NODE
E: neither variable -> disabled but process remains usable
```

Require machine-readable child output containing `active`, `fleetId`, `identitySource`, and `error`.

- [ ] **Step 2: Run the smoke harness and observe RED**

```bash
node _SYSTEM/Scripts/omp-fleet-smoke.mjs
```

Expected: FAIL because startup still requires `YURI_FLEET_ID`.

- [ ] **Step 3: Extend runtime state and startup rollback**

Add:

```ts
type IdentitySource = 'explicit' | 'october-auto';
// Runtime fields
identitySource?: IdentitySource;
nodeLeaseId?: string;
```

Resolve explicit presence with `process.env.YURI_FLEET_ID !== undefined`, not truthiness. For October-auto:

```ts
const rawNode = process.env.OCTOBER_BUS_NODE;
if (rawNode === undefined) throw new Error('Invalid fleet ID');
const nodeLease = octoberNodeLeaseId(projectId, rawNode);
const nodeResult = acquireLease(nodeLease, ownerId, { ttlMs: FLEET_LIMITS.peerLeaseTtlMs });
if (!nodeResult.ok) throw new Error(formatLeaseConflict(nodeLease, nodeResult));
```

Then attempt `captain`. Only `reason === 'live-holder'` proceeds to `deriveOctoberWorkerId(rawNode)` and its peer lease. Every other failure releases the acquired node lease best-effort and fails.

- [ ] **Step 4: Renew and release the node lease**

Renew the automatic node lease in the same interval as the peer lease. Treat failure as identity degradation. In startup catch and shutdown, release node and peer leases independently and exception-safely.

- [ ] **Step 5: Run startup smoke scenarios and observe GREEN**

Run the smoke harness. Expected: A-E pass, including duplicate rejection when A is captain.

- [ ] **Step 6: Commit Task 4**

```bash
git add .omp/extensions/fleet-bridge.ts _SYSTEM/Scripts/omp-fleet-smoke.mjs
git commit -m "feat: auto-elect October fleet peers" -- .omp/extensions/fleet-bridge.ts _SYSTEM/Scripts/omp-fleet-smoke.mjs
```

### Task 5: Atomic worker task claims

**Files:**
- Modify: `.omp/extensions/fleet-bridge.ts`
- Modify: `_SYSTEM/Scripts/omp-fleet-smoke.mjs`

- [ ] **Step 1: Add failing multi-worker claim scenarios**

Launch captain plus two workers. Publish one `fleet.task.offered` to `worker`. Assert both workers can observe the offer, but captured output contains exactly one `fleet.task.claimed`, exactly one execution/result, and one winner peer ID.

Add an injected Kagami append failure after task-lease acquisition. Assert no execution occurs and the task lease can immediately be acquired by another owner.

- [ ] **Step 2: Run smoke harness and observe RED**

Expected: FAIL because the extension does not acquire task leases or publish claims.

- [ ] **Step 3: Implement the closed claim sequence**

For each pending task delivery:

```ts
const leaseId = taskLeaseId(projectId, task.id);
const claim = acquireLease(leaseId, ownerId, { ttlMs: FLEET_LIMITS.peerLeaseTtlMs });
if (!claim.ok) return;
ownedTaskIds.add(task.id);
try {
  publish('fleet.task.claimed', {
    traceId: task.traceId,
    to: 'captain',
    payload: { taskId: task.id, attempt: task.attempt, worker: fleetId },
  });
} catch (error) {
  ownedTaskIds.delete(task.id);
  releaseLease(leaseId, ownerId);
  throw error;
}
```

Only inject/execute the task after claim publication succeeds. Preserve task-lease renewal and completion/failure release.

- [ ] **Step 4: Run smoke harness and observe GREEN**

Expected: exactly one winner executes; append failure releases ownership and executes nothing.

- [ ] **Step 5: Commit Task 5**

```bash
git add .omp/extensions/fleet-bridge.ts _SYSTEM/Scripts/omp-fleet-smoke.mjs
git commit -m "feat: claim fleet tasks atomically" -- .omp/extensions/fleet-bridge.ts _SYSTEM/Scripts/omp-fleet-smoke.mjs
```

### Task 6: Status, direct/group message acceptance, and restart cleanup

**Files:**
- Modify: `.omp/extensions/fleet-bridge.ts`
- Modify: `_SYSTEM/Scripts/omp-fleet-smoke.mjs`

- [ ] **Step 1: Add failing status and messaging scenarios**

Assert `/fleet-status` exposes exact ID, project ID, identity source, state, and bounded latest error. Add group message fan-out to two workers, direct message to one worker, group acknowledgement isolation, degraded shutdown without unsafe leave, and clean node/peer/task lease release after normal shutdown.

- [ ] **Step 2: Run smoke harness and observe RED**

Expected: FAIL for missing identity source/status fields or incomplete group acceptance.

- [ ] **Step 3: Implement status and bounded diagnostics**

Register or extend `/fleet-status` to render:

```ts
{
  fleetId: runtime.fleetId,
  projectId: runtime.projectId,
  identitySource: runtime.identitySource,
  state: runtime.active ? 'active' : runtime.ownerId ? 'degraded' : 'disabled',
  error: runtime.errors.at(-1)?.slice(0, 512),
}
```

Do not fabricate unresolved fields. Keep join/left publication conditional on active identity; always release owned leases best-effort.

- [ ] **Step 4: Run all focused verification**

```bash
node --test _SYSTEM/Scripts/omp-fleet-protocol.test.mjs
node --test _SYSTEM/Scripts/nano-lease.test.mjs
node _SYSTEM/Scripts/omp-fleet-smoke.mjs
```

Expected: all commands exit 0; smoke output proves captain + two workers, duplicate-node rejection, group fan-out, direct delivery, one task winner, and clean leases.
- [ ] **Step 5: Verify extension compilation through the smoke loader**

The smoke harness must import and register `.omp/extensions/fleet-bridge.ts` through the same OMP extension loader used by its child sessions. Run:

```bash
node _SYSTEM/Scripts/omp-fleet-smoke.mjs
```

Expected: the extension loads without TypeScript/transpilation diagnostics and every scenario passes. Do not install dependencies or introduce a second compiler configuration.

- [ ] **Step 6: Commit Task 6**

```bash
git add .omp/extensions/fleet-bridge.ts _SYSTEM/Scripts/omp-fleet-smoke.mjs
git commit -m "feat: expose October fleet status" -- .omp/extensions/fleet-bridge.ts _SYSTEM/Scripts/omp-fleet-smoke.mjs
```

### Task 7: Adversarial final verification

**Files:**
- Verify only: all five implementation/test files

- [ ] **Step 1: Run negative mismatch checks**

Prove invalid explicit ID does not auto-fallback, captain reacquisition race does not downgrade, near-prefix worker IDs do not direct-match, one worker acknowledgement does not suppress another, duplicate node is rejected even when first holder is captain, and claim append failure executes nothing.

- [ ] **Step 2: Run GitNexus change detection**

Run the repository GitNexus changed-flow detector over the uncommitted or task commits. Inspect affected flows and verify every reported protocol/lease/extension consumer is either updated or demonstrably compatible.

- [ ] **Step 3: Run the complete focused gate once**

```bash
node --test _SYSTEM/Scripts/omp-fleet-protocol.test.mjs _SYSTEM/Scripts/nano-lease.test.mjs
node _SYSTEM/Scripts/omp-fleet-smoke.mjs
```

Expected: zero failures and deterministic smoke success.

- [ ] **Step 4: Verify commit scope**

```bash
git show --stat --oneline HEAD
```

Expected: only the intended bridge, protocol, lease, and focused test/smoke files in implementation commits.
