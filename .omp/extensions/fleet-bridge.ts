import crypto from 'node:crypto';
import fs, { type FSWatcher } from 'node:fs';
import type { ExtensionAPI, ExtensionContext } from '@oh-my-pi/pi-coding-agent';
import { Container, Text } from '@oh-my-pi/pi-tui';

import {
  FLEET_LIMITS,
  authorizeFleetOperation,
  buildFleetEvent,
  buildProcessOwnerId,
  canonicalProjectId,
  createFleetState,
  deriveRecoveryActions,
  foldFleetEvents,
  peerLeaseId,
  reduceFleetEvent,
  selectPendingDeliveries,
  selectPendingTaskDeliveries,
  taskLeaseId,
  validateFleetId,
} from '../../_SYSTEM/Scripts/omp-fleet-protocol.mjs';
import {
  appendKagamiEvent,
  kagamiEventFile,
  readKagamiEventsSince,
  resolveKagamiEventRoot,
} from '../../_SYSTEM/Scripts/kagami-event-bus.mjs';
import {
  acquireLease,
  inspectLeases,
  reclaimLeases,
  releaseLease,
  renewLease,
} from '../../_SYSTEM/Scripts/nano-lease.mjs';

// ── protocol-shaped local types ─────────────────────────────────────────
//
// omp-fleet-protocol.mjs is plain JS (no .d.ts) — these name the exact
// object shapes its functions build/return, so the rest of this file
// never couples to `ReturnType<typeof ...>` on an implementation helper.

/** Shape returned by createFleetState / mutated in place by reduceFleetEvent. */
type FleetState = {
  projectId: string;
  peers: Map<string, unknown>;
  messages: Map<string, unknown>;
  tasks: Map<string, unknown>;
  recentEventIds: string[];
  recentEventIdSet: Set<string>;
  cursor: { afterId?: string; afterTs?: string };
  errors: string[];
};

/** Shape returned by buildFleetEvent (the validated inner fleet event). */
type FleetEvent = {
  id: string;
  ts: string;
  schemaVersion: string;
  kind: string;
  projectId: string;
  traceId: string;
  from: string;
  to: string;
  payload: Record<string, unknown>;
};

// ── runtime state ────────────────────────────────────────────────────────
//
// Typed exactly sufficient for this bootstrap task and the reconciliation /
// tool / recovery tasks that follow in the same file. Fields not yet used
// by the current session_start/session_shutdown wiring (watcher,
// renewTimer/reconcileTimer distinctions, reconciling) are declared here so
// later steps only ADD registrations, never widen this shape.

type Runtime = {
  active: boolean;
  fleetId?: string;
  projectId?: string;
  ownerId?: string;
  context?: ExtensionContext;
  state?: FleetState;
  readCursor: { afterId?: string; afterTs?: string };
  ownedTaskIds: Set<string>;
  injectedMessageIds: Set<string>;
  injectedTaskAttemptIds: Set<string>;
  watcher?: FSWatcher;
  renewTimer?: ReturnType<typeof setInterval>;
  reconcileTimer?: ReturnType<typeof setInterval>;
  reconciling: boolean;
  errors: string[];
};

/** Identity tuple returned once the bridge is confirmed live. */
type ActiveFleetIdentity = {
  fleetId: string;
  projectId: string;
  ownerId: string;
  state: FleetState;
};

export default function fleetBridge(pi: ExtensionAPI) {
  const runtime: Runtime = {
    active: false,
    reconciling: false,
    readCursor: {},
    ownedTaskIds: new Set(),
    injectedMessageIds: new Set(),
    injectedTaskAttemptIds: new Set(),
    errors: [],
  };
  pi.setLabel('OMP Fleet Bridge');

  // ── shared guards/helpers ────────────────────────────────────────────
  //
  // requireActive() is the single source of truth later tasks (delivery,
  // tools, recovery) use to pull a live fleetId/projectId/ownerId/state
  // tuple — it throws rather than returning partial identity so a caller
  // can never silently operate against a disabled bridge.

  function requireActive(): ActiveFleetIdentity {
    if (!runtime.active || !runtime.fleetId || !runtime.projectId || !runtime.ownerId || !runtime.state) {
      throw new Error('Fleet bridge is not active');
    }
    return {
      fleetId: runtime.fleetId,
      projectId: runtime.projectId,
      ownerId: runtime.ownerId,
      state: runtime.state,
    };
  }

  // publish() is the single write path onto the shared Kagami event bus:
  // build + validate the inner fleet event first (buildFleetEvent throws
  // on any structural/authorization violation before anything is
  // appended), wrap it with allowUnknownKind (Kagami's own closed
  // KAGAMI_EVENT_KINDS set does not know about fleet.* kinds — the fleet
  // protocol validator above is the real gate), force the WRAPPER's id/ts
  // to exactly match the inner event's id/ts (one identity, not two
  // independently-generated ones), sign it as this peer, then fold ONLY
  // the validated inner event into local state — never the Kagami
  // wrapper, whose own `payload` field is that inner event, not fleet
  // state shape.
  function publish(kind: string, fields: { traceId: string; to: string; payload: Record<string, unknown> }): FleetEvent {
    const { fleetId, projectId, state } = requireActive();
    const event: FleetEvent = buildFleetEvent(kind, {
      projectId,
      traceId: fields.traceId,
      from: fleetId,
      to: fields.to,
      payload: fields.payload,
    });
    appendKagamiEvent(event.kind, event, {
      allowUnknownKind: true,
      id: event.id,
      ts: event.ts,
      signedBy: `omp-fleet:${fleetId}`,
    });
    reduceFleetEvent(state, event);
    return event;
  }

  // ── session_start: validate identity, acquire the exclusive peer lease,
  // restore live-session delivery idempotency sets, announce presence ──

  pi.on('session_start', async (_event, ctx) => {
    runtime.context = ctx;
    let acquiredLeaseId: string | undefined;
    let acquiredOwnerId: string | undefined;
    try {
      const fleetId = validateFleetId(process.env.YURI_FLEET_ID);
      const projectId = canonicalProjectId(ctx.cwd);
      const processUuid = crypto.randomUUID();
      const sessionId = pi.getSessionName() || '';
      const ownerId = buildProcessOwnerId({ fleetId, pid: process.pid, processUuid, sessionId });
      const leaseId = peerLeaseId(projectId, fleetId);
      const acquired = acquireLease(leaseId, ownerId, { ttlMs: FLEET_LIMITS.peerLeaseTtlMs });
      if (!acquired.ok) throw new Error(`Fleet identity ${fleetId} is held by ${acquired.heldBy}`);
      // Identity is now live on disk — from this point on, any failure below
      // must release it best-effort in the catch block so a broken startup
      // never strands an exclusive lease under a process that reports itself
      // inactive.
      acquiredLeaseId = leaseId;
      acquiredOwnerId = ownerId;

      runtime.active = true;
      runtime.fleetId = fleetId;
      runtime.projectId = projectId;
      runtime.ownerId = ownerId;
      runtime.state = createFleetState(projectId);
      for (const entry of ctx.sessionManager.getBranch()) {
        if (entry.type !== 'custom' || entry.customType !== 'omp-fleet-state') continue;
        const data = entry.data || {};
        if (data.projectId !== projectId || data.fleetId !== fleetId) continue;
        runtime.injectedMessageIds = new Set(data.injectedMessageIds || []);
        runtime.injectedTaskAttemptIds = new Set(data.injectedTaskAttemptIds || []);
      }

      publish('fleet.peer.joined', {
        traceId: `peer-${fleetId}`,
        to: fleetId === 'captain' ? 'worker' : 'captain',
        payload: { ownerId },
      });
      ctx.ui.setStatus('omp-fleet', `fleet:${fleetId}`);
      ctx.ui.notify(`Fleet bridge active as ${fleetId}`, 'info');

      // Renew timer starts only after the full startup sequence above
      // succeeded — a partially-initialized runtime never gets a heartbeat.
      runtime.renewTimer = setInterval(() => {
        if (!runtime.active || !runtime.projectId || !runtime.fleetId || !runtime.ownerId) return;
        const peerRenewed = renewLease(peerLeaseId(runtime.projectId, runtime.fleetId), runtime.ownerId, {
          ttlMs: FLEET_LIMITS.peerLeaseTtlMs,
        });
        const failedTasks = [...runtime.ownedTaskIds].filter(
          (taskId) =>
            !renewLease(taskLeaseId(runtime.projectId!, taskId), runtime.ownerId!, {
              ttlMs: FLEET_LIMITS.peerLeaseTtlMs,
            }),
        );
        if (!peerRenewed || failedTasks.length > 0) {
          runtime.active = false;
          runtime.errors.push(`Lease renewal failed: ${failedTasks.join(', ') || 'peer'}`);
          runtime.context?.ui.setStatus('omp-fleet', 'fleet:degraded');
          runtime.context?.ui.notify('Fleet lease lost; new fleet operations are blocked', 'error');
        }
      }, FLEET_LIMITS.leaseRenewEveryMs);
      runtime.renewTimer.unref?.();
    } catch (error) {
      runtime.errors.push(String(error));
      runtime.active = false;
      if (acquiredLeaseId && acquiredOwnerId) {
        try {
          releaseLease(acquiredLeaseId, acquiredOwnerId);
        } catch (releaseError) {
          runtime.errors.push(String(releaseError));
        }
      }
      ctx.ui.setStatus('omp-fleet', 'fleet:disabled');
      ctx.ui.notify(`Fleet bridge disabled: ${String(error)}`, 'warning');
    }
  });

  // ── session_shutdown: exception-safe teardown. Every side-effecting
  // step is individually guarded so a failure in one (a closed watcher, a
  // failed peer.left publish, an already-reclaimed lease) can never skip
  // the steps after it. Lease releases are gated on IDENTITY being known
  // (projectId/fleetId/ownerId), not on `runtime.active` — a session that
  // degraded (lease-renewal loss set active=false) while still holding
  // task/peer leases must still release them on shutdown; only the
  // peer.left announcement itself requires genuine `active` state, since
  // publish() (via requireActive()) refuses to run otherwise.

  pi.on('session_shutdown', async () => {
    clearInterval(runtime.renewTimer);
    clearInterval(runtime.reconcileTimer);
    try {
      runtime.watcher?.close();
    } catch (error) {
      runtime.errors.push(String(error));
    }

    const { projectId, fleetId, ownerId } = runtime;

    if (runtime.active && projectId && fleetId && ownerId) {
      try {
        publish('fleet.peer.left', {
          traceId: `peer-${fleetId}`,
          to: fleetId === 'captain' ? 'worker' : 'captain',
          payload: { ownerId },
        });
      } catch (error) {
        runtime.errors.push(String(error));
      }
    }

    if (projectId && ownerId) {
      for (const taskId of runtime.ownedTaskIds) {
        try {
          releaseLease(taskLeaseId(projectId, taskId), ownerId);
        } catch (error) {
          runtime.errors.push(String(error));
        }
      }
    }
    runtime.ownedTaskIds.clear();

    if (projectId && fleetId && ownerId) {
      try {
        releaseLease(peerLeaseId(projectId, fleetId), ownerId);
      } catch (error) {
        runtime.errors.push(String(error));
      }
    }

    runtime.active = false;
  });

  // registrations for reconciliation/delivery (Task 6), the model-callable
  // fleet tool + slash commands (Task 7), and recovery (Task 8) are added
  // by those tasks — none of that scope is wired here.
}
