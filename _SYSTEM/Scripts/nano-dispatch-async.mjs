#!/usr/bin/env node
import { pathToFileURL } from 'node:url';
// @capability: nano-dispatch-async-pool
// @serves: concurrent nano dispatch | bounded concurrency pool | parallel fan-out | async spawn pool | pool-bounded child dispatch | non-blocking nano dispatch
// @does: the CONCURRENT (pool-bounded) dispatch option for the recursive nanoswarm — the async sibling of
//   nano-dispatch.dispatchNano's serial/blocking path. makePool(limit) is an in-process bounded-concurrency
//   runner (≤limit tasks in flight, observable peak); dispatchPool fans a batch of granted children through
//   it. Why it exists: serial dispatch (spawnSync, one child at a time) leaves the convergence barrier's core
//   invariant DORMANT — a parent finishes each child before the next, so it never has a live in-flight
//   descendant to block on. Concurrent dispatch is what makes nano-barrier's INV-1 load-bearing (and delivers
//   the sim's ~1.6x/2.2x makespan win). NOT a duplicate of local-concurrency.mjs (that is an FS-mkdir
//   semaphore for cross-PROCESS file leases; this is an in-PROCESS async task pool).
// @use: ARM-TIME ONLY — the arm step injects dispatchPool as spawnNano's batch dispatcher (fire the granted
//   children concurrently; the barrier, not an await, is what waits for them). DISARMED today: ZERO live
//   callers (spawnNano's default dispatch stays serial dispatchNano). Built + hermetically tested standalone;
//   wiring it as the live dispatcher is part of the owner-gated arm. Provenance: 07-ARCHITECTURE.md §15,
//   D1 self-governance ruling (wf_867b6b21).
// @exports: makePool, dispatchPool, DEFAULT_CONCURRENCY

import { dispatchNano } from './nano-dispatch.mjs';

export const DEFAULT_CONCURRENCY = 16; // min(16, cores-2)-class bound; matches the makespan sim's pool size

/**
 * In-process bounded-concurrency pool. run(fn) queues an async thunk; at most `limit` run concurrently.
 * stats() exposes { active, peak, pending } so a test can prove the bound is respected. Pure, dep-free.
 */
export function makePool(limit = DEFAULT_CONCURRENCY) {
  const cap = Math.max(1, Math.floor(limit));
  let active = 0; let peak = 0; const q = [];
  const pump = () => {
    while (active < cap && q.length) {
      const job = q.shift();
      active += 1; if (active > peak) peak = active;
      Promise.resolve().then(job.fn).then(job.res, job.rej).finally(() => { active -= 1; pump(); });
    }
  };
  return {
    run(fn) { return new Promise((res, rej) => { q.push({ fn, res, rej }); pump(); }); },
    stats() { return { active, peak, pending: q.length }; },
  };
}

/**
 * Fan a batch of granted children (from spawnNano's reserve) through a bounded pool, concurrently.
 * mkChildCtx(g) builds each child's tree ctx. opts.dispatch is injectable (tests pass a fake; default is the
 * real dispatchNano). Returns { pool, all } — `all` is the batch promise; the ARM-TIME caller fires WITHOUT
 * awaiting (fire-and-forget) and lets nano-barrier.canFinalize gate completion. `pool` exposes live stats.
 */
export function dispatchPool(granted = [], mkChildCtx, opts = {}) {
  const pool = makePool(opts.concurrency || DEFAULT_CONCURRENCY);
  const dispatch = opts.dispatch || dispatchNano;
  const all = Promise.all((granted || []).map((g) => pool.run(
    () => dispatch({ lane: g.lane, task: g.task, reasoning: g.reasoning }, mkChildCtx(g), opts),
  )));
  return { pool, all };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.stdout.write(`${JSON.stringify({ module: 'nano-dispatch-async', defaultConcurrency: DEFAULT_CONCURRENCY,
    note: 'DISARMED — concurrent dispatch option, ZERO live callers; arm step injects dispatchPool as spawnNano batch dispatcher.' }, null, 2)}\n`);
}
