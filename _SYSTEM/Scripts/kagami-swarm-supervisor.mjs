#!/usr/bin/env node
// @capability: nano-swarm-supervisor
// @serves: swarm supervisor | reap stale leases | reaper | rotate event log | nano liveness | who is alive | swarm janitor | nano crashed | supervise the swarm
// @does: the NANO SWARM supervisor — one cron-driven cycle that (1) reaps dead/stale leases and records each as a LEASE_EXPIRED audit event attributed to its owning nano, (2) rotates the event log when it exceeds threshold (only the singleton supervisor rotates), (3) computes per-nano liveness from the bus tail, (4) emits a SWARM_SUPERVISION_CYCLE summary for the board. Holds a task:supervisor singleton lease so two overlapping cron firings can't double-reap/double-rotate.
// @use: invoke once per native-cron firing (`kagami-swarm-supervisor.mjs once`); it self-gates via the singleton lease. NOT a loop — cron is the scheduler (locked decision), this is the janitor+monitor.
// @exports: superviseOnce, planReap, computeLiveness, SUPERVISOR_LEASE_ID, DEFAULT_SILENT_MS
//
// Separation of concerns: a reaped nano's death is recorded as a LEASE_EXPIRED event on the Kagami bus
// (the swarm's own audit trail), NOT in kagami-overseer's model-lane health ledger — that ledger's
// quarantine semantics are for model lanes (mimo/codex); folding nano crashes into it would wrongly flip
// model-lane health to "degraded". Swarm health lives on the bus; model-lane health lives in the overseer.
//
// Reclaim-vs-renew ORDER EFFECT (resolved in nano-lease, relied on here): a nano may renew() its lease
// concurrently with the supervisor's reclaim. The two do not commute — renew-then-reclaim keeps the lease
// (holderAlive reads fresh) while reclaim-then-renew destroys it (renew then fails: owner gone -> the nano
// must re-acquire). This cycle is robust to BOTH orders: attribution is taken from a pre-reclaim inspect,
// but a LEASE_EXPIRED is emitted ONLY for a lease reclaimLeases ACTUALLY destroyed — so a lease that
// renewed in the race is never falsely reported dead.

import {
  acquireLease, releaseLease, reclaimLeases, inspectLeases,
} from './nano-lease.mjs';
import {
  appendKagamiEvent, readKagamiEvents, rotateEventLog,
} from './kagami-event-bus.mjs';

export const SUPERVISOR_LEASE_ID = 'task:supervisor';
export const DEFAULT_SILENT_MS = 10 * 60 * 1000; // a nano silent >10min is flagged (advisory)

/**
 * PURE: from a non-mutating lease snapshot, the leases to reap (dead/stale, excluding the supervisor's
 * own lease). Ownerless dirs (leaseId null) are excluded from ATTRIBUTION (reclaimLeases still destroys
 * them; we just can't name a nano for the audit event).
 */
export function planReap(snapshot) {
  return snapshot
    .filter((l) => !l.alive && l.leaseId && l.leaseId !== SUPERVISOR_LEASE_ID)
    .map((l) => ({ leaseId: l.leaseId, nanoId: l.nanoId || null }));
}

/**
 * PURE: per-lane liveness from a list of bus events. Each lane's MOST RECENT event ts decides silence.
 * A lane silent longer than silentMs is flagged (advisory — the hard death signal is lease expiry).
 */
export function computeLiveness(events, now = Date.now(), silentMs = DEFAULT_SILENT_MS, excludeLane = null) {
  const byLane = new Map();
  for (const e of events) {
    if (!e || !e.lane || e.lane === excludeLane) continue;
    const ms = Date.parse(e.ts);
    const cur = byLane.get(e.lane);
    if (!cur || (Number.isFinite(ms) && ms > cur.lastSeenMs)) {
      byLane.set(e.lane, { lane: e.lane, lastSeenTs: e.ts, lastSeenMs: Number.isFinite(ms) ? ms : 0, lastKind: e.kind });
    }
  }
  const out = [];
  for (const v of byLane.values()) {
    const silentForMs = now - v.lastSeenMs;
    out.push({ ...v, silentForMs, silent: silentForMs > silentMs });
  }
  out.sort((a, b) => b.lastSeenMs - a.lastSeenMs);
  return out;
}

/**
 * One supervision cycle. Singleton-gated by the task:supervisor lease — if another supervisor holds it,
 * this firing is a clean no-op ({ ok:false, reason:'not-singleton' }). Always releases the self-lease.
 */
export async function superviseOnce({
  root, supervisorId = 'supervisor-main', now = Date.now(),
  silentMs = DEFAULT_SILENT_MS, rotate = true, livenessLimit = 500,
} = {}) {
  const self = acquireLease(SUPERVISOR_LEASE_ID, supervisorId);
  if (!self.ok) return { ok: false, reason: 'not-singleton', heldBy: self.heldBy };
  try {
    // 1. attribute BEFORE destroying — read owners while they still exist.
    const snapshot = inspectLeases(now);
    const planned = planReap(snapshot);
    // 2. reclaim dead/stale (re-checks holderAlive, so a lease that renewed since the inspect survives,
    //    and my own fresh self-lease is never touched).
    const reclaimed = new Set(reclaimLeases(now));
    // 3. emit a LEASE_EXPIRED only for a lease ACTUALLY destroyed (no false death for a raced renew).
    const expired = [];
    for (const { leaseId, nanoId } of planned) {
      if (!reclaimed.has(leaseId)) continue;
      appendKagamiEvent('LEASE_EXPIRED', { lane: nanoId || 'unknown', leaseId, by: supervisorId }, { root });
      expired.push({ leaseId, nanoId });
    }
    // 4. rotate the log if it is over threshold (only the singleton supervisor ever rotates).
    let rotated = null;
    if (rotate) { const r = rotateEventLog({ root }); if (r.rotated) rotated = { name: r.name, count: r.count }; }
    // 5. liveness from a BOUNDED bus tail (rotation keeps this cheap).
    const liveness = computeLiveness(readKagamiEvents({ root, limit: livenessLimit }), now, silentMs, supervisorId);
    const silent = liveness.filter((l) => l.silent).map((l) => l.lane);
    // 6. cycle summary -> the swarm board.
    const cycle = appendKagamiEvent('SWARM_SUPERVISION_CYCLE', {
      lane: supervisorId,
      expiredCount: expired.length,
      rotated: Boolean(rotated),
      rotatedTo: rotated?.name || null,
      silentLanes: silent,
      leaseCount: snapshot.length,
    }, { root });
    return { ok: true, supervisorId, expired, rotated, liveness, silent, cycleEventId: cycle.id };
  } finally {
    releaseLease(SUPERVISOR_LEASE_ID, supervisorId);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const cmd = process.argv[2] || 'once';
  if (cmd === 'once') {
    const supervisorId = process.argv[3] || `supervisor-${process.pid}`;
    superviseOnce({ supervisorId }).then((r) => {
      process.stdout.write(`${JSON.stringify(r, null, 2)}\n`);
      if (!r.ok) process.exitCode = 0; // not-singleton is a normal skip, not a failure
    });
  } else {
    process.stdout.write('usage: kagami-swarm-supervisor.mjs once [supervisorId]\n');
  }
}
