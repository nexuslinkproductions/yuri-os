#!/usr/bin/env node
// @capability: filing-canonical-bridge
// @serves: filing decision to canonical claim | filing memory seam | placement history | filing provenance | memory filing integration
// @does: the FILING<->MEMORY seam (P2 Inc 6). Turns a filing-assessor placement decision into a canonical-truth claim (provenance.lane='filing') so every lane sees placement history, recall can facet on filing.zone, and restores replay decisions. TRANSITION-ONLY emission with hard flood guards: per-run cap, closed-enum zone, re-verified protected/pinned veto at emit. Filing claims are ADVISORY — loadCanonical excludes them unless the caller opts in.
// @use: emitFilingClaim(sessionId, decision) after a filing-assessor assess() recommends a placement (only on a real transition). Reuses memory-canonical-store.appendClaim (sha256 dedup), filing-assessor.assess/isPinned/CANONICAL_ZONES, yuri-id-bridge.isProtectedPath.
// @exports: emitFilingClaim, MAX_PER_RUN, ALLOWED_ZONES, _resetRun
//
// DESIGN: minimax-m3 (peer lane) S1 seam; Claude-verified + corrected on integration:
//   (1) isProtectedPath is re-exported from yuri-id-bridge.mjs, NOT filing-assessor (lane assumed the wrong source).
//   (2) the bridge writes a SHARD via appendClaim; it only appears in canonical after a drainOnce fold.
// Flood guards (all MUST ship with the seam — minimax's biggest-risk mitigation): per-run cap; closed-enum
// zone or reject; re-verify isProtectedPath/isPinned at emit (drop at source); provenance.lane='filing' is an
// advisory tag that loadCanonical callers opt into (off by default).

import { appendClaim } from './memory-canonical-store.mjs';
import { assess, isPinned, CANONICAL_ZONES } from './filing-assessor.mjs';
import { isProtectedPath } from './yuri-id-bridge.mjs';

export const MAX_PER_RUN = 50;
export const ALLOWED_ZONES = new Set([...CANONICAL_ZONES, 'EPHEMERAL', 'unclassified']);
const _runCount = new Map();                                  // sessionId -> emitted count (per drain run)

/**
 * Emit a filing placement decision as a canonical claim — TRANSITION-ONLY (caller emits only when a
 * placement actually changed). Returns { ok, eventId } or { ok:false, reason }.
 * decision: { subject: <relPath>, object: { zone, ... } }
 */
export function emitFilingClaim(sessionId, decision, opts = {}) {
  if (!sessionId) return { ok: false, reason: 'sessionId required' };
  const fp = String(decision?.subject || '');
  const zone = decision?.object?.zone;
  if (!fp) return { ok: false, reason: 'subject (path) required' };
  if (zone == null) return { ok: false, reason: 'object.zone required' };
  if (!ALLOWED_ZONES.has(zone))
    return { ok: false, reason: `zone "${zone}" not in closed enum`, allowed: [...ALLOWED_ZONES] };
  // re-verify at emit (never trust a caller-side pre-check; state may have shifted since)
  if (isProtectedPath(fp)) return { ok: false, reason: 'protected — veto' };
  if (isPinned(fp)) return { ok: false, reason: 'pinned — veto' };
  try { const a = assess(fp); if (a && (a.protected || a.pinned)) return { ok: false, reason: 'assessor veto at emit' }; }
  catch { /* assessor is best-effort defense-in-depth; the explicit vetoes above are the real guard */ }
  const n = _runCount.get(sessionId) || 0;
  if (n >= MAX_PER_RUN) return { ok: false, reason: `per-run cap ${MAX_PER_RUN} reached` };
  _runCount.set(sessionId, n + 1);
  return appendClaim('filing', sessionId, {
    kind: 'filing-decision',
    subject: fp,
    predicate: 'recommended-zone',
    object: { zone, ...decision.object },
    domain: 'filing', tier: 'advisory', lifecycle: 'transition', memory_type: 'filing-decision',
  }, opts);
}

/** Reset the per-run emission counter for a session (call at the start of each filing run). */
export function _resetRun(sessionId) { _runCount.delete(sessionId); }
