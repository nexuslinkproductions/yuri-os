#!/usr/bin/env node
/**
 * YURI user-data collector — gitignored raw energy-trace → gate-safe export
 * records for a single user's data branch. Allow-list projection (fail-closed):
 * only recognized gate-safe fields survive, everything else is dropped, and the
 * result is re-validated through the Privacy Gate as a canary.
 *
 * Pure logic here (projection + day collection). The git worktree write +
 * scoped commit live in the deploy path (added when the user-data branch is
 * initialised). See `_SYSTEM/docs/user-data-methodology.md`.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateRecord } from './math/yuri-energy-trace.mjs';

const _HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(_HERE, '..', '..');

function num(v) { const n = Number(v); return Number.isFinite(n) ? n : 0; }

/** Keep only numeric values from a contributions-style map (gate-safe). */
function numericMap(raw) {
  const out = {};
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    for (const [k, v] of Object.entries(raw)) {
      const n = Number(v);
      if (Number.isFinite(n)) out[k] = n;
    }
  }
  return out;
}

/**
 * Allow-list projection of a raw trace record → compact export record.
 * Keeps only gate-safe fields; drops everything unrecognized (fail-closed).
 * Re-validated through the Privacy Gate; throws if anything forbidden survived.
 */
export function projectTraceForExport(rec) {
  const src = rec && typeof rec === 'object' ? rec : {};
  const out = {
    timestamp: typeof src.timestamp === 'string' && src.timestamp.includes('T') ? src.timestamp : '',
    user: typeof src.user === 'string' ? src.user : '',
    regime: src.regime === 'action' ? 'action' : 'observability',
    event: typeof src.event === 'string' ? src.event : '',
    lane: typeof src.lane === 'string' ? src.lane : '',
    decision: src.decision === 'accept' || src.decision === 'reject' ? src.decision : '',
    dominantTerm: typeof src.dominantTerm === 'string' ? src.dominantTerm : null,
    U_before: num(src.U_before),
    U_after: num(src.U_after),
    deltaU: num(src.deltaU),
    componentContributions: numericMap(src.componentContributions),
  };
  validateRecord(out); // canary — throws if a forbidden field smuggled through
  return out;
}

/** Resolve the raw trace dir (honors YURI_STATE_DIR like the trace module). */
export function resolveTraceDir() {
  const stateDir = process.env.YURI_STATE_DIR;
  return stateDir
    ? path.join(stateDir, 'energy-trace')
    : path.join(REPO_ROOT, '_SYSTEM', 'state', 'energy-trace');
}

/**
 * Read one raw trace day, keep records for `user`, return projected export
 * records. Records that fail the gate projection are dropped, not thrown.
 * @param {{traceDir?:string, day:string, user:string}} opts
 */
export function collectDay({ traceDir, day, user } = {}) {
  const dir = traceDir ?? resolveTraceDir();
  const file = path.join(dir, `${day}.jsonl`);
  if (!fs.existsSync(file)) return [];
  const out = [];
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    if (!line.trim()) continue;
    let rec;
    try { rec = JSON.parse(line); } catch { continue; }
    if (typeof rec.user === 'string' && rec.user === user) {
      try { out.push(projectTraceForExport(rec)); } catch { /* drop gate-failing record */ }
    }
  }
  return out;
}
