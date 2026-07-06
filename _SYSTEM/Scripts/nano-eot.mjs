#!/usr/bin/env node
import { pathToFileURL } from 'node:url';
// @capability: nano-eot-closeout
// @serves: nano eot | spawned agent closeout | end of transmission for a nano | write canonical claims on finish | release in-flight lease | eot as canonical writer | recursive swarm convergence write
// @does: the per-nano END-OF-TRANSMISSION closeout (Move 1b RULE 3, 07-ARCHITECTURE.md §6). Every spawned
//   nano closes with this so the whole tree converges into ONE canonical truth. STRICT ORDERING (the
//   sim-load-bearing fix): (1) write the nano's work claims to its OWN canonical shard, (2) only on full
//   success write the EOT MARKER claim (subject=nanoId, predicate='eot') + the manifest completion marker —
//   the marker IS the proof of a clean close, so a PARTIAL closeout (a claim failed) deliberately leaves NO
//   marker → the parent's barrier sees an orphan → CRITICAL (H2), never a silent drop. (3) release the
//   in-flight lease LAST, AFTER claims are durable — release-before-write reopens the exact race the barrier
//   closes. EOT-as-canonical-writer is sound IFF the barrier (INV-1/INV-2) holds, which it does.
// @use: closeNano({ rootRunId, myPath, resultLabel, claims:[{subject,predicate,object,...}] }) at the end of
//   a nano's work fn. The lease owner is the nano's own nanoId (the parent registered it under that id at spawn).
// @exports: closeNano, EOT_PREDICATE
// @depends: memory-canonical-store (appendClaim), nano-tree (recordComplete, nanoIdOf, inflightLeaseId),
//   nano-lease (releaseLease), nano-barrier (EOT_PREDICATE). All injectable via opts.deps for hermetic tests.

import { appendClaim } from './memory-canonical-store.mjs';
import { recordComplete, nanoIdOf, inflightLeaseId } from './nano-tree.mjs';
import { releaseLease } from './nano-lease.mjs';
import { EOT_PREDICATE } from './nano-barrier.mjs';

export { EOT_PREDICATE };

/**
 * Close a nano. Returns { ok, nanoId, label, claimsWritten, failures, marker, completed, released }.
 * ok === false (a work claim failed) → NO eot marker, NO manifest complete → the node surfaces as an
 * orphan/incomplete at the parent barrier (intended: incomplete work is flagged, never silently lost).
 * The lease is ALWAYS released last so the parent is never blocked forever by a dead/partial child.
 */
export function closeNano({ rootRunId, myPath, resultLabel = null, claims = [], opts = {} } = {}) {
  if (!rootRunId || !myPath) return { ok: false, reason: 'rootRunId and myPath required' };
  const D = { appendClaim, recordComplete, releaseLease, ...(opts.deps || {}) };
  const nanoId = nanoIdOf(rootRunId, myPath);

  // (1) work claims → the nano's own shard (one writer per shard → no interleave; sha256 dedup at fold).
  const failures = [];
  let claimsWritten = 0;
  for (const c of claims) {
    if (!c || c.subject == null || c.predicate == null) { failures.push({ claim: c, reason: 'missing subject/predicate' }); continue; }
    let r; try { r = D.appendClaim(nanoId, rootRunId, c); } catch (e) { r = { ok: false, reason: String(e?.message || e) }; }
    if (r && r.ok) claimsWritten += 1; else failures.push({ claim: c, reason: (r && r.reason) || 'append-failed' });
  }

  let marker = false;
  let completed = false;
  if (failures.length === 0) {
    // (2) EOT marker claim — the clean-close proof the barrier's hasEotClaim() looks for. Carries the label.
    let mr; try {
      mr = D.appendClaim(nanoId, rootRunId, { subject: nanoId, predicate: EOT_PREDICATE, object: { status: 'complete', label: resultLabel || null } });
    } catch (e) { mr = { ok: false, reason: String(e?.message || e) }; }
    marker = Boolean(mr && mr.ok);
    if (marker) { try { D.recordComplete(rootRunId, myPath); completed = true; } catch { /* manifest append best-effort; eot claim is the durable proof */ } }
    else failures.push({ claim: 'eot-marker', reason: (mr && mr.reason) || 'marker-failed' });
  }

  // (3) release the in-flight lease LAST — AFTER claims are durable. Owner = the nano's own id.
  let released = false;
  try { released = D.releaseLease(inflightLeaseId(rootRunId, myPath), nanoId); } catch { released = false; }

  return { ok: failures.length === 0, nanoId, label: resultLabel || null, claimsWritten, failures, marker, completed, released };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.stdout.write(`${JSON.stringify({ module: 'nano-eot', eotPredicate: EOT_PREDICATE,
    ordering: ['1 work claims -> shard', '2 eot marker + manifest complete (full-success only)', '3 release lease LAST'],
    note: 'partial closeout leaves no marker -> parent barrier flags orphan (H2), never silent.' }, null, 2)}\n`);
}
