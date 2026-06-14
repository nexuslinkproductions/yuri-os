#!/usr/bin/env node
// @capability: mcs-drain-daemon
// @serves: canonical truth | drainer daemon | lease per cycle | signal-safe shutdown | abortable sleep
// @does: Inc 4 — drainDaemon(drainerId,{intervalMs}) -> {stop()}. Lease acquired/released PER CYCLE inside drainOnce (not held across sleep; TTL fallback). SIGTERM/SIGINT releaseLease immediately + abort. AbortSignal-aware sleep(ms,signal).
// @exports: drainDaemon
// @depends: memory-canonical-store.mjs (drainOnce, DRAIN_LEASE_ID), nano-lease.mjs (releaseLease)

import { drainOnce, DRAIN_LEASE_ID } from './memory-canonical-store.mjs';
import { releaseLease } from './nano-lease.mjs';

function sleepAbortable(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) { reject(new DOMException('Aborted', 'AbortError')); return; }
    let onAbort;
    const timer = setTimeout(() => { if (onAbort) signal?.removeEventListener('abort', onAbort); resolve(); }, ms);
    onAbort = () => { clearTimeout(timer); reject(new DOMException('Aborted', 'AbortError')); };
    signal?.addEventListener('abort', onAbort, { once: true });   // {once} + explicit remove-on-resolve = no listener leak across cycles
  });
}

/**
 * @param {string} drainerId — unique drainer identity (e.g. 'drainer-1', process.pid)
 * @param {object} opts — { intervalMs?: number, signal?: AbortSignal }
 * @returns {{ stop: () => Promise<void> }}
 */
export function drainDaemon(drainerId, opts = {}) {
  if (!drainerId) throw new Error('drainerId required');
  const intervalMs = Number(opts.intervalMs ?? 5000);
  const drainOpts = opts.drainOpts || {};          // passthrough to drainOnce (e.g. { dir } for test isolation — never touch the live store)
  const externalSignal = opts.signal;
  const controller = new AbortController();
  const signal = externalSignal ? AbortSignal.any([externalSignal, controller.signal]) : controller.signal;
  let stopping = false;

  const handlers = ['SIGTERM', 'SIGINT'].map((sig) => {
    const h = () => {
      if (stopping) return;
      stopping = true;
      controller.abort();
    };
    process.on(sig, h);
    return { sig, handler: h };
  });

  async function loop() {
    while (!signal.aborted) {
      try {
        // drainOnce acquires/releases its own lease per cycle; we do NOT hold across sleep.
        await drainOnce(drainerId, drainOpts);
      } catch (e) {
        if (signal.aborted) break;
        // Transient drain failures are logged; daemon keeps running.
        process.stderr.write(`[mcs-drain-daemon] drainOnce error: ${e?.message ?? e}\n`);
      }
      if (signal.aborted) break;
      try {
        await sleepAbortable(intervalMs, signal);
      } catch (e) {
        if (e?.name === 'AbortError') break;
        throw e;
      }
    }

    // Graceful lease release on shutdown (best-effort; drainOnce already released on success path).
    try {
      await releaseLease(DRAIN_LEASE_ID, drainerId);
    } catch { /* ignore */ }

    for (const { sig, handler } of handlers) process.off(sig, handler);
  }

  const promise = loop();

  return {
    done: promise,                                 // resolves when the loop exits (signal or stop) — the CLI awaits this
    async stop() {
      if (!stopping) { stopping = true; controller.abort(); }
      await promise;                               // always await a clean shutdown, even if a signal already set `stopping`
    },
  };
}

// CLI for manual run: `node _SYSTEM/Scripts/mcs-drain-daemon.mjs <drainerId> [intervalMs]`
if (import.meta.url === `file://${process.argv[1]}`) {
  const [, , drainerId, intervalMs] = process.argv;
  if (!drainerId) {
    console.error('Usage: node mcs-drain-daemon.mjs <drainerId> [intervalMs]');
    process.exit(1);
  }
  const ms = Number(intervalMs) || 5000;
  const daemon = drainDaemon(drainerId, { intervalMs: ms });
  console.log(`[mcs-drain-daemon] started: ${drainerId} (interval ${ms}ms) — SIGTERM/SIGINT to stop`);
  await daemon.done;                               // run until a signal aborts the loop (handlers live inside drainDaemon)
  console.log(`[mcs-drain-daemon] stopped: ${drainerId}`);
}