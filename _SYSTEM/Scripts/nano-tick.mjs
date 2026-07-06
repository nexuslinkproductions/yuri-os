#!/usr/bin/env node
import { pathToFileURL } from 'node:url';
// @capability: nano-tick-loop
// @serves: nano tick | nano loop | autonomous lane loop | wake refresh act emit | nano swarm driver | one tick of an autonomous lane
// @does: ONE NANO SWARM tick — emit LANE_DISPATCHED, self-refresh (nano-refresh), run the work fn, emit LANE_OUTPUT_DELTA + HANDOFF_RECORDED, return the advanced cursor. The cursor recovers from the nano's OWN last HANDOFF on the Kagami bus, so a fresh per-wake process keeps continuity with no extra state file.
// @use: the per-nano loop body a cron/scheduler invokes each wake. Phase-0 scope: NO lease + NO 500k compact gate yet (those are G1/G2) — this proves the loop + observability stream.
// @exports: tick, runTicks, recoverCursor
//
// nano-tick.mjs — NANO SWARM Phase-0 loop driver. Every tick writes three lifecycle events to the
// guarded kagami-event-bus so the operator + sibling nanos can watch the swarm live. Resilient: a
// throwing work fn is captured into the OUTPUT_DELTA, never crashes the tick — a nano always closes
// with a HANDOFF so its cursor advances and the next wake doesn't re-see this tick's own events.

import { appendKagamiEvent, readKagamiEventsSince } from './kagami-event-bus.mjs';
import { refresh } from './nano-refresh.mjs';
import { acquireLease, releaseLease } from './nano-lease.mjs';
import { decideCompact, DEFAULT_THRESHOLD_TOKENS } from './nano-compact-gate.mjs';

const clip = (v, n = 600) => {
  // TOTAL (never throws): a work fn may return a circular / BigInt / non-serializable value — and the
  // OUTPUT_DELTA + HANDOFF must STILL emit (the always-close invariant). Red-team #2: this used to
  // JSON.stringify outside the work try/catch, so a circular result killed the tick before its handoff.
  let s; try { s = typeof v === 'string' ? v : JSON.stringify(v); } catch { return '[unserializable result]'; }
  return s && s.length > n ? `${s.slice(0, n)}…` : s;
};

// Recover a nano's cursor from its OWN most-recent HANDOFF on the bus (start AFTER that handoff),
// so a fresh per-wake process resumes where it left off with no separate state file. null = first run.
export function recoverCursor(nanoId, root) {
  // Anchor off the nano's LAST event of ANY kind — HANDOFF in the happy path, but DISPATCHED / a lease
  // event if it crashed mid-tick before the handoff. Starting strictly after its last emission stops it
  // re-seeing its OWN orphaned events as "new" next wake (red-team #3 crash self-echo). null = first run.
  const mine = readKagamiEventsSince({ lane: nanoId }, { root });
  const last = mine.length ? mine[mine.length - 1] : null;
  return last ? { afterId: last.id, afterTs: last.ts } : null;
}

/**
 * One tick: refresh -> (claim shard lease) -> dispatch -> (compact-precheck) -> work -> output ->
 * (release lease) -> handoff. work(ctx) receives { nanoId, brain, cursor, goalId, shard } and returns
 * a JSON-able result (default no-op; a real nano's work is a native Agent doing scoped work).
 *
 * opts.shard: a lease id (e.g. 'file:src/x.ts'); when held by another nano this tick YIELDS cleanly
 *   (LEASE_CONTENDED + HANDOFF, no work) — the anti-clobber guarantee.
 * opts.tokenSignal: { tokenCount?, usedPct?, thresholdTokens?, thresholdPct? } — if over the ceiling,
 *   the tick yields to compaction (releases its lease first) instead of working. No signal -> proceed (fail-open).
 * The next cursor is ALWAYS anchored to this tick's terminal HANDOFF (no self-echo on the next wake).
 */
export async function tick(nanoId, { cursor, work, root, worktree, shard = null, tokenSignal = null, armed = false, nowIso = '', goalId = '' } = {}) {
  const startCursor = cursor || recoverCursor(nanoId, root) || {};
  // refresh BEFORE announcing dispatch, so a nano never sees its OWN dispatch as "new" this tick.
  const r = refresh(nanoId, { cursor: startCursor, root, worktree, nowIso });
  // eventExtra goes into the HANDOFF payload (must be JSON-serializable); returnExtra is merged into
  // the return value (may hold the raw work result, which can be circular — it must NEVER reach an
  // event payload, only the clipped copy in OUTPUT_DELTA does).
  const fin = (eventExtra, emitted, returnExtra = eventExtra) => {
    const ho = appendKagamiEvent('HANDOFF_RECORDED', { lane: nanoId, goalId, ...eventExtra }, { root });
    return { brain: r.brain, cursor: { afterId: ho.id, afterTs: ho.ts }, emitted: [...emitted, ho.id], ...returnExtra };
  };

  // CLAIM the work-shard lease (anti-clobber). Held by another nano -> yield cleanly, do no work.
  if (shard) {
    const lease = acquireLease(shard, nanoId);
    if (!lease.ok) {
      const c = appendKagamiEvent('LEASE_CONTENDED', { lane: nanoId, goalId, shard, heldBy: lease.heldBy }, { root });
      return fin({ skipped: true, reason: 'lease-held', heldBy: lease.heldBy, shard }, [c.id]);
    }
    appendKagamiEvent('LEASE_CLAIMED', { lane: nanoId, goalId, shard }, { root });
  }
  const releaseShard = () => { if (shard) { releaseLease(shard, nanoId); appendKagamiEvent('LEASE_RELEASED', { lane: nanoId, goalId, shard }, { root }); } };

  const dispatched = appendKagamiEvent('LANE_DISPATCHED', { lane: nanoId, goalId, shard }, { root });

  // COMPACT-PRECHECK: a supplied token signal over the ceiling -> yield to compaction (release first).
  if (tokenSignal) {
    const verdict = decideCompact({
      tokenCount: tokenSignal.tokenCount ?? null, usedPct: tokenSignal.usedPct ?? null,
      thresholdTokens: tokenSignal.thresholdTokens || DEFAULT_THRESHOLD_TOKENS,
      thresholdPct: tokenSignal.thresholdPct ?? null, isNano: true, armed,
    });
    if (verdict.over) {
      const od = appendKagamiEvent('LANE_OUTPUT_DELTA', { lane: nanoId, goalId, compactNeeded: true, reason: verdict.reason }, { root });
      releaseShard();
      return fin({ compactNeeded: true, verdict }, [dispatched.id, od.id]);
    }
  }

  let result;
  try {
    result = work ? await work({ nanoId, brain: r.brain, cursor: r.cursor, goalId, shard }) : { ok: true, note: 'noop tick (phase-0)' };
  } catch (e) {
    result = { ok: false, error: e?.message || String(e) };
  }

  const delta = appendKagamiEvent('LANE_OUTPUT_DELTA', { lane: nanoId, goalId, result: clip(result) }, { root });
  releaseShard();
  // HANDOFF payload carries only serializable metadata; the raw (maybe circular) result goes to the caller only.
  return fin({ newEvents: r.counts.newEvents }, [dispatched.id, delta.id], { result });
}

/** Run N sequential ticks threading the cursor — proves multi-tick continuity (demo/test). */
export async function runTicks(nanoId, { ticks = 3, work, root, worktree, nowIso = '' } = {}) {
  let cursor = recoverCursor(nanoId, root) || {};
  const out = [];
  for (let i = 0; i < Math.max(1, ticks); i += 1) {
    const r = await tick(nanoId, { cursor, work, root, worktree, nowIso, goalId: `tick-${i}` });
    cursor = r.cursor;
    out.push({ tick: i, emitted: r.emitted, result: r.result });
  }
  return { nanoId, ticks: out, finalCursor: cursor };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const nanoId = process.argv[2] || 'nano-cli';
  tick(nanoId, { nowIso: new Date().toISOString() }).then((r) => {
    process.stdout.write(`${r.brain}\n--- tick emitted: ${r.emitted.join(', ')}\nresult: ${JSON.stringify(r.result)}\n`);
  });
}
