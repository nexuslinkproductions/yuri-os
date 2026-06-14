#!/usr/bin/env node
// @capability: nano-convergence-barrier
// @serves: convergence barrier | dont finalize over in-flight children | tree-scoped done check | drain before converge | orphan critical signal | late contradiction H2 | recursive swarm soundness
// @does: the SOUNDNESS barrier for the recursive nanoswarm (Move 1b, 07-ARCHITECTURE.md §5). Wraps the
//   Move-1 converge() with two sim-proven invariants so an ancestor never declares "done" over an in-flight
//   or contradicted subtree: INV-1 tree-scoped in-flight enumeration (no terminal verdict while ANY
//   descendant lease is alive — via nano-tree.inflightDescendants) and INV-2 forced drainOnce() before
//   reading contested state (the read-view must be fold-fresh; waiting for the write is NOT enough — sim:
//   direct-child-without-drain = 1.000 false-completion). Orphans (spawned-but-gone, no EOT claim) and
//   in-subtree contested claims become CRITICAL signals → the tree converges to "done-with-known-gap" (H2),
//   never a silent false-completion (H3). The SAFETY block is independent of the convergence arm (recursion
//   soundness is structural); the QUALITY layers stay inside Move-1 converge() and respect YURI_SWARM_CONVERGENCE.
// @use: canFinalize({ rootRunId, myPath, ledger, poolOutputs, signals, adversarialResult, damping, round, opts })
//   on each child-completion event (re-evaluated per wake — non-blocking; a not-converged node just re-ticks).
// @exports: canFinalize, subtreeContested, hasEotClaim, contestedFromView, EOT_PREDICATE
// @depends: nano-tree (inflightDescendants, manifestOrphans, nanoIdOf, isAncestor), memory-canonical-store
//   (drainOnce, readView), swarm-convergence (converge). All deps injectable via opts.deps for hermetic tests.

import { inflightDescendants, manifestOrphans, nanoIdOf, isAncestor } from './nano-tree.mjs';
import { drainOnce, readView } from './memory-canonical-store.mjs';
import { converge } from './swarm-convergence.mjs';

/** The marker predicate a nano's EOT writes (subject = its nanoId) so the barrier can prove completion. */
export const EOT_PREDICATE = 'eot';

/** read-view contested map → [{key, competing:[{lane,object,eventId}]}]. */
export function contestedFromView(view = {}) {
  return Object.entries(view.contested || {}).map(([key, v]) => ({ key, competing: (v && v.competing) || [] }));
}

/** Has child `p` landed its EOT marker claim in the (fresh) read-view? key = `${nanoId} eot`. */
export function hasEotClaim(view = {}, rootRunId, p) {
  const claims = view.claims || {};
  return Boolean(claims[`${nanoIdOf(rootRunId, p)} ${EOT_PREDICATE}`]);
}

/**
 * Contested claims whose competing provenance lies in MY subtree (me or a descendant). A nano's EOT writes
 * under lane `${rootRunId}/${path}`, so the subtree test is a lane-prefix decode. A mid-tree node ignores
 * disagreements outside its subtree; the root (myPath='r') sees all of its tree's contradictions.
 */
export function subtreeContested(rootRunId, myPath, contestedList = []) {
  const prefix = `${rootRunId}/`;
  return contestedList.filter((c) => (c.competing || []).some((comp) => {
    const lane = String(comp.lane || '');
    if (!lane.startsWith(prefix)) return false;
    const p = lane.slice(prefix.length);
    return p === myPath || isAncestor(myPath, p);
  }));
}

/**
 * The barrier. Returns the converge()-shaped verdict, but never finalizes over an in-flight / orphaned /
 * contradicted subtree. Re-call per child-completion (non-blocking; node re-ticks until clear).
 */
export function canFinalize({
  rootRunId, myPath, ledger, poolOutputs = {}, signals = [], adversarialResult = null,
  damping = {}, round = 0, opts = {},
} = {}) {
  const D = {
    inflightDescendants, drainOnce, readView, manifestOrphans, converge,
    ...(opts.deps || {}),
  };

  // INV-1 — whole-subtree liveness. A live descendant is still writing; block immediately, do NOT drain yet.
  const live = D.inflightDescendants(rootRunId, myPath) || [];
  if (live.length) {
    return {
      converged: false, reason: 'descendants-in-flight',
      blocking: live.map((l) => ({ layer: 'barrier-inflight', leaseId: l.leaseId })),
      nextRoundWork: [], damping,
    };
  }

  // INV-2 — force a fresh fold so the read-view reflects every landed shard BEFORE reading contested state.
  // Contended drain (another drainer folding now) → don't finalize on a possibly-stale view; re-tick.
  let dr;
  try { dr = D.drainOnce(nanoIdOf(rootRunId, myPath)); } catch (e) { dr = { ok: false, reason: 'drain-threw', error: String(e?.message || e) }; }
  if (dr && dr.ok === false) {
    return {
      converged: false, reason: `drain-not-fresh:${dr.reason || 'unknown'}`,
      blocking: [{ layer: 'barrier-drain', detail: dr.reason || null, heldBy: dr.heldBy || null }],
      nextRoundWork: [], damping,
    };
  }

  const view = D.readView() || {};

  // Orphans: spawned-but-gone children with NO EOT claim in the fresh view (a lost 'complete' marker but a
  // present EOT claim is NOT an orphan). 47%-likely per run (calc C4) → first-class, never silent.
  const orphans = (D.manifestOrphans(rootRunId, myPath) || []).filter((p) => !hasEotClaim(view, rootRunId, p));
  // Late contradiction in my subtree → flagged H2.
  const contested = subtreeContested(rootRunId, myPath, contestedFromView(view));

  const safety = [
    ...orphans.map((p) => ({ id: `orphan:${p}`, severity: 'CRITICAL', resolved: false, layer: 'barrier-orphan', path: p })),
    ...contested.map((c) => ({ id: `contested:${c.key}`, severity: 'CRITICAL', resolved: false, layer: 'barrier-contested', key: c.key })),
  ];

  // QUALITY layers — Move-1 converge() (respects YURI_SWARM_CONVERGENCE / opts.armed). Merge safety signals so
  // an ARMED gate also blocks on them via its Layer-2.
  const cv = D.converge({ ledger, poolOutputs, signals: [...signals, ...safety], adversarialResult, damping, round, opts });

  // SAFETY BLOCK — independent of the convergence arm: recursion soundness is structural, not a quality knob.
  // Even a DISARMED (passthrough) converge must not let the tree finalize over an orphan/contradiction.
  if (safety.length) {
    return {
      ...cv, converged: false, reason: 'barrier-critical',
      blocking: [...(cv.blocking || []), ...safety], barrierSafety: safety,
    };
  }
  return cv; // subtree clear → the convergence gate verdict stands.
}

if (import.meta.url === `file://${process.argv[1]}`) {
  process.stdout.write(`${JSON.stringify({ module: 'nano-barrier', eotPredicate: EOT_PREDICATE,
    invariants: ['INV-1 tree-scoped in-flight enumeration', 'INV-2 forced drain before finalize'],
    note: 'wraps Move-1 converge() with recursion-soundness barrier. Deps injectable via opts.deps.' }, null, 2)}\n`);
}
