// @capability: mure-held-rulings
// @serves: owner held clearance | steward gate unblock | helmsman finalize ruling
// @does: load owner-approved rulings that clear owner-gated subtasks for cast/dispatch. finalize:true and arming:true are NEVER cleared.
// @exports: loadHeldRulings, isSubtaskClearedByOwner, HELD_RULINGS_PATHS

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '../..');

export const HELD_RULINGS_PATHS = Object.freeze({
  state: path.join(REPO_ROOT, '_SYSTEM', 'state', 'held-rulings.json'),
  ownerLock: path.join(REPO_ROOT, '02_RESOURCES', 'TASKS', 'mure-held-rulings-owner-lock.json'),
});

/** Load rulings — state override wins, then committed owner-lock file. */
export function loadHeldRulings() {
  for (const abs of [HELD_RULINGS_PATHS.state, HELD_RULINGS_PATHS.ownerLock]) {
    try {
      if (!fs.existsSync(abs)) continue;
      const raw = JSON.parse(fs.readFileSync(abs, 'utf8'));
      const map = new Map();
      for (const r of raw.rulings || []) {
        if (r?.subtaskId && r.approved === true) map.set(r.subtaskId, r);
      }
      return {
        source: path.relative(REPO_ROOT, abs),
        map,
        rulings: raw.rulings || [],
        ratifiedAt: raw.ratifiedAt || null,
        note: raw.note || null,
      };
    } catch { /* try next */ }
  }
  return { source: null, map: new Map(), rulings: [], ratifiedAt: null, note: null };
}

/**
 * Owner ruling clears an owner-gated subtask for cast (not finalize/publish execution).
 * Hard vetoes: finalize:true, arming:true, evolver without explicit ruling id.
 */
export function isSubtaskClearedByOwner(subtaskId, subtask = {}, bundle = null) {
  if (subtask.finalize === true) return false;
  if (subtask.arming === true) return false;
  const b = bundle || loadHeldRulings();
  const ruling = b.map.get(subtaskId);
  if (!ruling || ruling.approved !== true) return false;
  if (ruling.scope === 'evolver-only' && subtask.role !== 'evolver') return true;
  return true;
}
