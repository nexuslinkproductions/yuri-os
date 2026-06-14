#!/usr/bin/env node
// @capability: mcs-test-worker
// @serves: fault injection | mcs harness | child process ipc
// @does: Inc 5 — Worker script for multi-process fault-injection harness. IPC actions: append-loop / drain / hold-then-die.
// @exports: (CLI entry) — run with: node mcs-test-worker.mjs <action> <args...>

import { appendClaim, drainOnce, resolveDirs, DRAIN_LEASE_ID } from './memory-canonical-store.mjs';
import { acquireLease, releaseLease } from './nano-lease.mjs';

const { base, shardsDir } = resolveDirs({ dir: process.env.YURI_CANONICAL_DIR });

const [,, action, ...args] = process.argv;

function log(msg) { process.send?.({ type: 'log', msg: `[worker:${process.pid}] ${msg}` }); }

async function appendLoop({ laneId, sessionId, count, delayMs = 0 }) {
  for (let i = 0; i < count; i++) {
    const claim = { kind: 'assert', subject: `key-${laneId}-${i}`, predicate: 'value', object: `val-${i}` };
    appendClaim(laneId, sessionId, claim, { dir: process.env.YURI_CANONICAL_DIR });
    if (delayMs) await new Promise(r => setTimeout(r, delayMs));
  }
  process.send?.({ type: 'done', action: 'append-loop', count });
}

async function drainAction({ drainerId, cycles = 1, intervalMs = 100 }) {
  for (let c = 0; c < cycles; c++) {
    const res = await drainOnce(drainerId, { dir: process.env.YURI_CANONICAL_DIR });
    log(`drain cycle ${c + 1}: ${JSON.stringify(res)}`);
    if (c < cycles - 1) await new Promise(r => setTimeout(r, intervalMs));
  }
  process.send?.({ type: 'done', action: 'drain', cycles });
}

async function holdThenDie({ drainerId, holdMs = 5000 }) {
  const lease = acquireLease(DRAIN_LEASE_ID, drainerId, { ttlMs: 30000 });
  if (!lease.ok) { process.send?.({ type: 'error', msg: `failed to acquire lease: ${JSON.stringify(lease)}` }); process.exit(1); }
  log(`acquired lease, holding for ${holdMs}ms then SIGKILL self`);
  await new Promise(r => setTimeout(r, holdMs));
  log('hold done, exiting (simulating crash)');
  process.exit(0);
}

async function main() {
  try {
    switch (action) {
      case 'append-loop': await appendLoop(JSON.parse(args[0])); break;
      case 'drain': await drainAction(JSON.parse(args[0])); break;
      case 'hold-then-die': await holdThenDie(JSON.parse(args[0])); break;
      default: throw new Error(`unknown action: ${action}`);
    }
  } catch (e) {
    process.send?.({ type: 'error', msg: e.message });
    process.exit(1);
  }
}

main();