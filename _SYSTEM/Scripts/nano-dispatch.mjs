#!/usr/bin/env node
import { pathToFileURL } from 'node:url';
// @capability: nano-dispatch-seam
// @serves: dispatch nano | spawn child lane | tree ctx across process | nano ctx from env | run spawned nano | wire spawn_nano to externalNanoWork
// @does: the DISPATCH seam for the recursive nanoswarm (Move 1b INC-6, 07-ARCHITECTURE.md §9). Wires the
//   governed spawn_nano handler to the equipped lane loop: builds externalNanoWork for the child and runs it
//   through nano-tick, threading the tree ctx (rootRunId/path/depth/reservationId) across the PROCESS boundary
//   via YURI_NANO_* env so the child's own spawn_nano + EOT know their position. nanoCtxFromEnv() is the
//   reciprocal a child reads at boot. Default runner is the real llm-lane spawn; tests inject runLane.
// @use: as nano-spawn's dispatch dep: spawnNano({ opts:{ deps:{ dispatch: dispatchNano } } }). A child process
//   calls nanoCtxFromEnv() to recover its ctx. NOTE: production async execution model (spawn vs spawnSync /
//   nano-tick scheduling) is an ARM-time decision; this seam is the wiring + ctx contract, DISARMED-safe.
// @exports: dispatchNano, nanoCtxFromEnv, ctxEnv, CTX_ENV, seedRootTree

import { externalNanoWork } from './nano-external.mjs';
import { nanoIdOf, inflightLeaseId, initTree } from './nano-tree.mjs';
import { tick } from './nano-tick.mjs';
import { closeNano } from './nano-eot.mjs';
import { renewLease, releaseLease, acquireLease } from './nano-lease.mjs';
import { recordVoid } from './nano-tree.mjs';

export const CTX_ENV = {
  root: 'YURI_NANO_ROOT_RUN_ID', path: 'YURI_NANO_PATH', depth: 'YURI_NANO_DEPTH', res: 'YURI_NANO_RESERVATION_ID',
};

/** A spawned child reads its tree position from env at boot. null → not a spawned nano (top-level session). */
export function nanoCtxFromEnv(env = process.env) {
  const rootRunId = env[CTX_ENV.root];
  const myPath = env[CTX_ENV.path];
  if (!rootRunId || !myPath) return null;
  return { rootRunId, myPath, depth: Number(env[CTX_ENV.depth] || 0), reservationId: env[CTX_ENV.res] || null };
}

/** Build the env that carries a child's tree ctx across the process boundary. */
export function ctxEnv(childCtx = {}) {
  const e = {
    [CTX_ENV.root]: String(childCtx.rootRunId), [CTX_ENV.path]: String(childCtx.myPath),
    [CTX_ENV.depth]: String(childCtx.depth ?? 0),
  };
  if (childCtx.reservationId) e[CTX_ENV.res] = String(childCtx.reservationId);
  return e;
}

/**
 * Seed a root tree + acquire the root in-flight lease, returning the env block the owner sets at arm time.
 * DISARMED-safe pure compositor: initTree writes the tree meta (no spawn), acquireLease registers the root
 * node's in-flight slot (INV-1 for the root). Seeding a tree does NOT itself spawn children; the spawn GATE
 * (spawnArmed) is the separate owner-gated arm. Returns the YURI_NANO_* env vars + rootNanoId.
 */
export function seedRootTree(runId, opts = {}) {
  initTree(runId, opts);
  acquireLease(inflightLeaseId(runId, 'r'), nanoIdOf(runId, 'r'));
  return {
    YURI_NANO_ROOT_RUN_ID: String(runId),
    YURI_NANO_PATH: 'r',
    YURI_NANO_DEPTH: '0',
    rootNanoId: nanoIdOf(runId, 'r'),
  };
}

/**
 * Dispatch one granted child. externalNanoWork equips it with the full YURI exoskeleton routed through
 * llm-lane; nano-tick runs the loop body + emits lifecycle events. The child inherits its tree ctx via env.
 * opts.runLane (test) / opts.root (test bus dir) / opts.tickOpts override. Returns { ok, childNanoId, tick, eot }.
 */
export async function dispatchNano(spec = {}, childCtx = {}, opts = {}) {
  const childNanoId = nanoIdOf(childCtx.rootRunId, childCtx.myPath);
  const inflightId = inflightLeaseId(childCtx.rootRunId, childCtx.myPath);
  const work = externalNanoWork({
    lane: spec.lane, task: spec.task, reasoning: spec.reasoning || 'xhigh',
    env: ctxEnv(childCtx), runLane: opts.runLane, model: spec.model || null,
  });

  // H1 lease heartbeat: a slow >5min child gets its in-flight lease reaped (TTL=5min) → false orphan CRITICAL.
  // Renew the lease every TTL/3 while tick() is running. Parent holds the lease (INV-1), so parent renews.
  const DEFAULT_TTL_MS = 5 * 60 * 1000;
  const heartbeatInterval = Math.floor(DEFAULT_TTL_MS / 3);
  let heartbeatTimer = null;
  let ok = false;
  let r = null;
  try {
    heartbeatTimer = setInterval(() => {
      try {
        renewLease(inflightId, childNanoId);
      } catch { /* best-effort heartbeat; if it fails, the lease may go stale but that's handled by reclaim */ }
    }, heartbeatInterval);

    r = await tick(childNanoId, {
      work, goalId: String(childCtx.rootRunId), root: opts.root, nowIso: opts.nowIso || '', ...(opts.tickOpts || {}),
    });
    ok = r?.result?.ok !== false;
  } finally {
    if (heartbeatTimer) clearInterval(heartbeatTimer);
  }
  // CLOSE THE CHILD OUT so the parent barrier can converge. In the blocking dispatch model the child runs as a
  // subprocess (an ollama lane can't call closeNano itself); the parent closes it after the subprocess returns:
  // write its result as a canonical claim → stamp the EOT marker → release the in-flight lease (acquired at
  // spawn, INV-1). WITHOUT this the lease leaks → the child shows as a perpetual in-flight descendant →
  // orphan→CRITICAL, never convergence.
  //
  // H2 failed-child lease release: closeNano only runs on ok===true → a failed child's lease leaks "in-flight".
  // On fail/timeout, release the in-flight lease + recordVoid so the barrier doesn't flag it as a false orphan.
  let eot = null;
  if (ok && childCtx.rootRunId && childCtx.myPath) {
    let summary;
    try { summary = JSON.stringify(r.result).slice(0, 2000); } catch { summary = '[unserializable result]'; }
    try {
      eot = closeNano({
        rootRunId: childCtx.rootRunId, myPath: childCtx.myPath, resultLabel: spec.resultLabel || null,
        claims: [{ subject: childNanoId, predicate: 'nano.result', object: { summary } }],
      });
    } catch (e) { eot = { ok: false, error: String(e?.message || e) }; }
  } else if (!ok && childCtx.rootRunId && childCtx.myPath) {
    // Failed child: release its in-flight lease and recordVoid so it's not a false orphan
    try {
      releaseLease(inflightId, childNanoId);
    } catch { /* best-effort release */ }
    try {
      recordVoid(childCtx.rootRunId, childCtx.myPath, 'dispatch-failed');
    } catch { /* best-effort void record */ }
  }
  return { ok, childNanoId, tick: r, eot };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.stdout.write(`${JSON.stringify({ module: 'nano-dispatch', ctxEnvKeys: CTX_ENV, bootCtx: nanoCtxFromEnv() }, null, 2)}\n`);
}
