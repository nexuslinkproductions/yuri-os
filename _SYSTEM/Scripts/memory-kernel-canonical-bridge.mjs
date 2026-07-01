#!/usr/bin/env node
import { pathToFileURL } from 'node:url';
// @capability: memory-kernel-canonical-bridge
// @serves: track-a to canonical | promote approved memory to canonical truth | yuri-memory convergence | ledger to canonical claim | shared truth from operator-approved memory | first real canonical writer
// @does: the TRACK-A <-> CANONICAL seam (P2 arming, 2026-06-14). Reads the operator-approved memory ledger
//        (memory-kernel MEMORY_LEDGER_LOG) and emits ONLY genuine promoted memory entries as canonical claims
//        (provenance.lane='yuri-memory'). The ledger is a MIXED log: ~99% is `lane_output` execution-audit
//        noise; only type in {rule,feedback,contract,evidence,task} + scope in {project,permanent} is real
//        operator-approved truth. Those are the ONLY entries bridged. READ-ONLY on the ledger — never touches
//        the governed propose->decide->promote pipeline. Idempotent: a fact already in canonical OR pending in
//        the bridge shard is skipped (no shard bloat across scheduled re-syncs), and the store's content-hash
//        dedup is the second line of defense at drain time.
// @use: syncLedgerToCanonical({ dryRun }) on the drain schedule or on-demand; dryRun:true plans (selects, emits
//       nothing). The drainer folds the emitted shard into canonical. ledgerEntryToClaim(e) for the pure mapping.
// @exports: syncLedgerToCanonical, ledgerEntryToClaim, CANONICAL_MEMORY_TYPES, CANONICAL_SCOPES, MEM_SUBJECT_PREFIX, BRIDGE_LANE
// @depends: memory-canonical-store.mjs (appendClaim, mintEventId, loadCanonical, shardPath), memory-kernel.mjs (MEMORY_LEDGER_LOG, MEMORY_ENTRY_TYPES)

import { existsSync, readFileSync } from 'node:fs';
import { appendClaim, mintEventId, loadCanonical, shardPath } from './memory-canonical-store.mjs';
import { MEMORY_LEDGER_LOG, MEMORY_ENTRY_TYPES } from './memory-kernel.mjs';

export const BRIDGE_LANE = 'yuri-memory';
export const CANONICAL_MEMORY_TYPES = new Set(MEMORY_ENTRY_TYPES);   // rule/feedback/contract/evidence/task — the genuine promoted types
export const CANONICAL_SCOPES = new Set(['project', 'permanent']);   // session scope = ephemeral, never canonical
export const MEM_SUBJECT_PREFIX = 'mem:';

/**
 * Map ONE memory-ledger entry to a canonical claim, or null if it is not canonical-worthy. The flood guard:
 * rejects lane_output audit noise (type not in the enum), session-scoped + contentless entries. subject =
 * content-hash => each distinct fact is its own canonical key (no false contention), and the mapping is fully
 * deterministic => the store's content-hash dedup makes a re-sync a no-op.
 */
export function ledgerEntryToClaim(e) {
  if (!e || !CANONICAL_MEMORY_TYPES.has(e.type)) return null;        // excludes lane_output + any non-memory type
  if (e.scope && !CANONICAL_SCOPES.has(e.scope)) return null;        // excludes session scope
  if (!e.content || !e.contentSha256) return null;                   // need a fact + its identity
  return {
    kind: 'assert',
    subject: MEM_SUBJECT_PREFIX + e.contentSha256,
    predicate: e.type,
    object: { content: e.content, scope: e.scope || null, originLane: e.originLane || null, sha: e.contentSha256, promotedAt: e.timestamp || null },
    domain: 'memory',
    tier: e.scope || null,
    lifecycle: 'promoted',
    memory_type: e.type,
  };
}

/**
 * Sync operator-approved Track-A memory into the canonical store. READ-ONLY on the ledger; appends new claims
 * to the bridge's own shard (the drainer folds them). Idempotent — facts already canonical or pending in the
 * shard are skipped. Returns a compact report; never throws on a single bad entry.
 */
export function syncLedgerToCanonical(opts = {}) {
  const sessionId = opts.sessionId || 'track-a-bridge';
  const dryRun = opts.dryRun === true;
  const ledgerPath = opts.ledgerPath || MEMORY_LEDGER_LOG;
  if (!existsSync(ledgerPath)) return { ok: false, reason: 'no-ledger', ledgerPath };

  // idempotency seed: eventIds already in canonical OR pending (un-drained) in our shard. Without this, every
  // scheduled re-sync re-appends all selected facts to the shard (the drainer dedups them, but the SHARD bloats).
  const seen = new Set(loadCanonical({ ...opts, includeAdvisory: true }).map((c) => c.eventId));
  const sp = shardPath(BRIDGE_LANE, sessionId, opts);
  if (existsSync(sp)) for (const ln of readFileSync(sp, 'utf8').split('\n')) {
    const t = ln.trim(); if (!t) continue;
    try { const ev = JSON.parse(t); if (ev.eventId) seen.add(ev.eventId); } catch { /* skip */ }
  }

  let scanned = 0, selected = 0, emitted = 0, alreadyPresent = 0, skipped = 0, tooLarge = 0;
  const errors = [];
  for (const ln of readFileSync(ledgerPath, 'utf8').split('\n')) {
    const t = ln.trim(); if (!t) continue;
    let e; try { e = JSON.parse(t); } catch { continue; }
    scanned += 1;
    const claim = ledgerEntryToClaim(e);
    if (!claim) { skipped += 1; continue; }
    selected += 1;
    const eventId = mintEventId(claim);
    if (seen.has(eventId)) { alreadyPresent += 1; continue; }        // already canonical or pending => idempotent
    if (dryRun) continue;
    const r = appendClaim(BRIDGE_LANE, sessionId, claim, opts);
    if (r.ok) { emitted += 1; seen.add(eventId); }
    else if (r.reason === 'event-too-large') { tooLarge += 1; errors.push({ sha: e.contentSha256, reason: r.reason, bytes: r.bytes }); }
    else errors.push({ sha: e.contentSha256, reason: r.reason });
  }
  return { ok: true, ledgerPath, scanned, selected, emitted, alreadyPresent, skipped, tooLarge, dryRun, errors: errors.slice(0, 10) };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const dryRun = process.argv.includes('--dry-run') || process.argv.includes('plan');
  console.log(JSON.stringify(syncLedgerToCanonical({ dryRun }), null, 2));
}
