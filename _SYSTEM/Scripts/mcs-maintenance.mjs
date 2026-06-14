#!/usr/bin/env node
// @capability: mcs-maintenance
// @serves: canonical maintenance cycle | sync drain sweep | launchd target | canonical pipeline beat | self-sustaining canonical store
// @does: ONE canonical-store maintenance beat for the launchd/cron schedule, pure node (no model): (1) sync
//        operator-approved Track-A memory into the store via the bridge (idempotent — re-runs emit nothing),
//        (2) drainOnce (fold shards -> canonical, rotate/compact/unlink), (3) persistenceSweep ONLY when armed
//        (YURI_CANONICAL_BACKUP_ARM=1 or opts.sweep) — OFF by default so a frequent beat never over-snapshots.
//        Every step is independently fail-soft: a thrown step is captured + the cycle continues, so a sync
//        hiccup never blocks the drain (the store's truth path must not depend on the optional writer).
// @use: launchd/cron target -> `node mcs-maintenance.mjs <drainerId>`. This is what keeps the live store
//       self-sustaining: new Track-A promotions flow to canonical on the next beat with no manual step.
// @exports: maintenanceCycle
// @depends: memory-kernel-canonical-bridge.mjs (syncLedgerToCanonical), memory-canonical-store.mjs (drainOnce), mcs-persistence-sweep.mjs (persistenceSweep)

import { syncLedgerToCanonical } from './memory-kernel-canonical-bridge.mjs';
import { drainOnce } from './memory-canonical-store.mjs';
import { persistenceSweep } from './mcs-persistence-sweep.mjs';

/** Run one maintenance beat. opts pass through to every step (e.g. { dir } for test isolation). Never throws. */
export function maintenanceCycle(drainerId, opts = {}) {
  const out = { drainerId };
  try { out.sync = syncLedgerToCanonical(opts); } catch (e) { out.sync = { ok: false, error: String(e?.message || e) }; }
  try { out.drain = drainOnce(drainerId, opts); } catch (e) { out.drain = { ok: false, error: String(e?.message || e) }; }
  if (opts.sweep === true || process.env.YURI_CANONICAL_BACKUP_ARM === '1') {
    try { out.sweep = persistenceSweep({ ...opts, arm: true }); } catch (e) { out.sweep = { ok: false, error: String(e?.message || e) }; }
  }
  return out;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const drainerId = process.argv[2] || `maint-${process.pid}`;
  const r = maintenanceCycle(drainerId);
  const s = r.sync || {}, d = r.drain || {};
  console.log(JSON.stringify({
    at: new Date().toISOString(),
    sync: { selected: s.selected, emitted: s.emitted, already: s.alreadyPresent, skipped: s.skipped },
    drain: { ok: d.ok, folded: d.folded, claims: d.claims, heldBy: d.heldBy },
    sweep: r.sweep ? { wrote: r.sweep.wrote } : 'off',
  }));
}
