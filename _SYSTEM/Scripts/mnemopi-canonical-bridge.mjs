#!/usr/bin/env node
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { pathToFileURL } from 'node:url';
import Database from 'better-sqlite3';
import { REPO_ROOT } from './memory-kernel.mjs';
import { appendClaim, mintEventId, loadCanonical, shardPath, drainOnce } from './memory-canonical-store.mjs';

// @capability: mnemopi-canonical-bridge
// @serves: mnemopi auto-retain to canonical | mnemopi export seam | omp learnings to canonical truth
// @does: exports Mnemopi working_memory auto-retentions DIRECTLY INTO YURI's canonical store (owner chose
//        bypass 2026-07-07: appendClaim, not proposeMemoryWrite — no propose→decide gate). Loop-guard skips
//        yuri-seed rows (source not in ELIGIBLE_SOURCES) so the seed↔export cycle can't form; the seed's own
//        guard (skip provenance.lane==='mnemopi') is the second break. Idempotent: eventId dedup against
//        canonical + the un-drained shard means re-runs (and the session_shutdown hook) never double-write.
//        After appending, drains the shard so claims fold into canonical + read-view immediately.
// @use: node _SYSTEM/Scripts/mnemopi-canonical-bridge.mjs [--dry-run|plan|--apply]; or programmatically
//       exportMnemopiToCanonical({ apply: true }).
// @exports: exportMnemopiToCanonical, resolveMnemopiBankPath, rowToClaim, ELIGIBLE_SOURCES, BRIDGE_LANE
// @depends: memory-canonical-store.mjs (appendClaim, drainOnce, loadCanonical, mintEventId, shardPath), better-sqlite3

export const ELIGIBLE_SOURCES = new Set(['coding-agent-transcript', 'coding-agent-retain']);
export const BRIDGE_LANE = 'mnemopi';
const MEM_SUBJECT_PREFIX = 'mem:';

// Resolve the Mnemopi project bank dynamically: newest banks/YURI-OS-MUSUBI-<hash>/mnemopi.db,
// else the shared ~/.omp/agent/memories/mnemopi/mnemopi.db fallback.
export function resolveMnemopiBankPath() {
  const banksDir = path.join(homedir(), '.omp', 'agent', 'memories', 'mnemopi', 'banks');
  if (existsSync(banksDir)) {
    const matches = readdirSync(banksDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && entry.name.startsWith('YURI-OS-MUSUBI-'))
      .map((entry) => {
        const dbPath = path.join(banksDir, entry.name, 'mnemopi.db');
        if (!existsSync(dbPath)) return null;
        return { dbPath, mtimeMs: statSync(dbPath).mtimeMs };
      })
      .filter(Boolean)
      .sort((a, b) => b.mtimeMs - a.mtimeMs);
    if (matches.length > 0) return matches[0].dbPath;
  }
  return path.join(homedir(), '.omp', 'agent', 'memories', 'mnemopi', 'mnemopi.db');
}

function contentSha256(text) {
  return crypto.createHash('sha256').update(String(text || '')).digest('hex');
}

function truncate(text, max = 80) {
  const value = String(text || '');
  return value.length <= max ? value : `${value.slice(0, max)}…`;
}

/**
 * Map ONE Mnemopi working_memory row to a canonical claim. subject = content-hash so each distinct
 * retention is its own canonical key (no false contention); provenance.lane='mnemopi' is set by appendClaim
 * and is what the SEED loop-guard filters on. Deterministic → the store's content-hash dedup makes a re-run a no-op.
 */
export function rowToClaim(row) {
  const text = String(row?.embed_text || row?.content || '').trim();
  if (!text) return null;
  const sha = contentSha256(text);
  const mtype = row?.memory_type && row.memory_type !== 'unknown' ? row.memory_type : 'observation';
  return {
    kind: 'assert',
    subject: MEM_SUBJECT_PREFIX + sha,
    predicate: mtype,
    object: { content: text, originLane: BRIDGE_LANE, scope: 'bank', sha, importance: row?.importance ?? null },
    domain: 'memory',
    tier: null,
    lifecycle: 'promoted',
    memory_type: mtype,
  };
}

/**
 * Idempotency seed: eventIds already in canonical OR pending (un-drained) in the mnemopi shard.
 * Without this, every re-sync re-appends to the shard (the drainer dedups at fold time, but the shard bloats).
 */
function buildSeenEventIds(sessionId, opts = {}) {
  const seen = new Set();
  try { for (const c of loadCanonical({ ...opts, includeAdvisory: true })) if (c?.eventId) seen.add(c.eventId); } catch { /* peer-open tolerant */ }
  try {
    const sp = shardPath(BRIDGE_LANE, sessionId, opts);
    if (existsSync(sp)) for (const ln of readFileSync(sp, 'utf8').split('\n')) {
      const t = ln.trim(); if (!t) continue;
      try { const ev = JSON.parse(t); if (ev.eventId) seen.add(ev.eventId); } catch { /* skip */ }
    }
  } catch { /* no shard yet */ }
  return seen;
}

/**
 * Scan Mnemopi working_memory and write eligible auto-retentions DIRECTLY into canonical (appendClaim + drain).
 * Default dry-run — pass apply:true or CLI --apply to write. Loop-guarded + eventId-deduped.
 */
export function exportMnemopiToCanonical(opts = {}) {
  const apply = opts.apply === true;
  const dryRun = !apply;
  const sessionId = opts.sessionId || 'mnemopi-export';
  const bankPath = opts.bankPath || resolveMnemopiBankPath();

  if (!existsSync(bankPath)) {
    return { ok: false, reason: 'no-bank', scanned: 0, eligible: 0, alreadyCanonical: 0, emitted: 0, drained: false, dryRun, bankPath, examples: [] };
  }

  const seen = buildSeenEventIds(sessionId, opts);
  let scanned = 0, eligible = 0, alreadyCanonical = 0, emitted = 0;
  const examples = [];
  const errors = [];

  const db = new Database(bankPath, { readonly: true });
  db.pragma('busy_timeout = 10000');
  const rows = db.prepare('SELECT id, content, embed_text, source, importance, memory_type, timestamp FROM working_memory').all();

  for (const row of rows) {
    scanned += 1;
    if (!ELIGIBLE_SOURCES.has(row.source)) continue; // LOOP GUARD: never re-export yuri-seed / foreign rows
    eligible += 1;
    const claim = rowToClaim(row);
    if (!claim) continue;
    const eventId = mintEventId(claim);
    if (seen.has(eventId)) { alreadyCanonical += 1; continue; }
    if (examples.length < 3) examples.push(truncate(claim.object.content));
    if (dryRun) { emitted += 1; seen.add(eventId); continue; }
    const r = appendClaim(BRIDGE_LANE, sessionId, claim, opts);
    if (r.ok) { emitted += 1; seen.add(eventId); }
    else errors.push({ sha: claim.object.sha, reason: r.reason });
  }
  db.close();

  // Fold the freshly-appended shard into the canonical generation + read-view so the claims are LIVE now,
  // not just queued in the shard. Fail-open: a busy lease is retried on the next run.
  let drained = false;
  if (!dryRun && emitted > 0) {
    try { drained = drainOnce(opts.drainerId || 'mnemopi-bridge', opts).ok === true; } catch { /* fail-open */ }
  }

  return { ok: true, scanned, eligible, alreadyCanonical, emitted, drained, dryRun, bankPath, examples, errors: errors.slice(0, 10) };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const apply = process.argv.includes('--apply');
  console.log(JSON.stringify(exportMnemopiToCanonical({ apply }), null, 2));
}
