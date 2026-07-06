#!/usr/bin/env node
// ===========================================================================
// CLAUDE CONTROL PACKET
//   goal:        Give the SWAP-IMMUNE per-claim identity veto (gateClaimTransition)
//                its first LIVE runtime caller — in OBSERVE mode. Candidate E of the
//                substrate-frontier-grade mission; the keystone "no enforcement
//                reader" gap (confirmed on HEAD by 2 lanes).
//   target:      NEW module + an advisory call in the (already live) prose-claim
//                extract hook. NEVER blocks; caps stay disabled (observe-only).
//   constraints: advisory only; fail-OPEN (observability must not break a session);
//                no settings.json change (prose-claim-extract is already registered);
//                does NOT arm any veto; fully reversible.
//   acceptance:  observer FIRES on a real swap/untracked attack pair, stays quiet on
//                a clean pair, and a thrown gate never propagates (fail-open).
//   test cmd:    node --test _SYSTEM/Scripts/claim-transition-observer.test.mjs
//   rollback:    rm this file + its .test.mjs; revert the ~8-line hook block.
// ===========================================================================
//
// @capability: claim-transition-observer
// @serves: observe the per-claim identity veto on live claim transitions | wire gateClaimTransition advisory | swap-immune claim gate observability | runtime caller for the identity veto
// @does: advisory observe-mode adapter for gateClaimTransition — computes the non-offsettable identity-veto verdict over a before/after claim pair with the enforcing caps DISABLED, appends an advisory JSONL trace, and NEVER blocks or throws into the caller
// @use: from the prose-claim-extract advisory hook (or any live claim source) to record whether a transition WOULD trip the identity veto — the runtime observability the keystone gate lacked; arming the block stays a separate owner step
// @exports: observeClaimTransition, emitObservation, observeTracePath, shouldObserve
//
// WHY OBSERVE FAILS-OPEN while the gate fails-CLOSED: gateClaimTransition vetoes an
// untrackable RETRACT (fail-closed) because, when ENFORCING, an unprovable over-claim
// must be refused. Here we only WATCH; a watcher that throws/blocks would break the
// session it is measuring. So the adapter swallows faults and records them — the
// fail-closed enforcing stance is intact for the day the owner arms the block.

import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { gateClaimTransition } from './claim-cortex.mjs';

const _HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(_HERE, '..', '..');

function stateDir() {
  return process.env.YURI_STATE_DIR
    ? process.env.YURI_STATE_DIR
    : path.join(REPO_ROOT, '_SYSTEM', 'state');
}
export function observeTracePath() {
  return path.join(stateDir(), 'claim-transition-trace.jsonl');
}

// Run the identity veto in OBSERVE mode (caps left at Infinity = enforcing floors
// DISABLED — we read the per-claim identity signal, not the armed L∞/mass floors).
// Returns a flat advisory record; never throws.
export function observeClaimTransition(claimsBefore, claimsAfter, opts = {}) {
  try {
    const v = gateClaimTransition(claimsBefore, claimsAfter, { ...opts });
    return {
      ok: true,
      wouldAccept: v.accept,
      identityVeto: v.identityVeto,
      worsenedCount: Array.isArray(v.worsened) ? v.worsened.length : 0,
      worsened: Array.isArray(v.worsened) ? v.worsened.slice(0, 5) : [],
      untrackedRetract: v.untrackedRetract || 0,
      addedUnsupportedMass: v.addedUnsupportedMass || 0,
      reason: v.reason,
    };
  } catch (err) {
    // observe-mode fails OPEN: record the fault, never break the caller.
    return { ok: false, observeError: String((err && err.message) || err), identityVeto: false, wouldAccept: true };
  }
}

// Cheap PRE-FILTER for the prose-claim-extract hook: run the O(ledger) double cortex-snapshot
// observer ONLY when a transition could actually trip the per-claim identity veto. The veto fires on
//   (a) a RETRACT verdict,
//   (b) a content-hash SWAP of an existing anchor (same id, changed hash) — the worked example's exact
//       case, which carries NO RETRACT verdict, so the original RETRACT-only guard MISSED it, and
//   (c) a ladder inversion.
// measureClaims' live metrics map onto these: `churnedAnchors` is the swap proxy (b), `inversions` is
// (c), `retracts` / `byVerdict.RETRACT` is (a). This predicate is a strict SUPERSET of the old
// `byVerdict.RETRACT>0` guard — it never observes LESS, only catches the swap/inversion transitions the
// narrow guard hid. Observe-only; the observer it gates never blocks. Defensive against missing/garbage
// metric fields (defaults to 0 ⇒ no observe) so it cannot throw in the fail-open hot path.
export function shouldObserve(metrics) {
  if (!metrics || typeof metrics !== 'object') return false;
  const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
  const retracts = num(metrics.retracts ?? metrics.byVerdict?.RETRACT);
  const inversions = num(metrics.inversions);
  const churned = num(metrics.churnedAnchors);
  return retracts > 0 || inversions > 0 || churned > 0;
}

// Append one advisory record to the observe trace (JSONL). Never throws.
export function emitObservation(obs, meta = {}) {
  try {
    const rec = { ts: meta.nowIso || null, source: meta.source || null, ...meta, ...obs };
    const p = observeTracePath();
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.appendFileSync(p, JSON.stringify(rec) + '\n');
    return true;
  } catch {
    return false; // a trace-write fault must never affect the session
  }
}

// CLI smoke: prove it fires on a swap attack and stays quiet on a clean pair.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const NOW = 1_700_000_000_000;
  const clean = [{ id: 'a', claimedStatus: 'trusted', evidence: [], contentHash: 'x' }];
  const swapBefore = [{ id: 'k', claimedStatus: 'trusted', evidence: [], contentHash: 'aaa' }];
  const swapAfter = [{ id: 'k', claimedStatus: 'trusted', evidence: [], contentHash: 'bbb' }];
  const cleanObs = observeClaimTransition(clean, clean, { nowMs: NOW });
  const swapObs = observeClaimTransition(swapBefore, swapAfter, { nowMs: NOW });
  console.log('clean :', JSON.stringify(cleanObs));
  console.log('swap  :', JSON.stringify(swapObs));
  console.log(cleanObs.identityVeto === false && swapObs.identityVeto === true ? 'OK: observer fires on swap, quiet on clean' : 'FAILURE');
  process.exit(cleanObs.identityVeto === false && swapObs.identityVeto === true ? 0 : 1);
}
