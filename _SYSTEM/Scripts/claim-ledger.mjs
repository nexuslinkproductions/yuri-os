#!/usr/bin/env node
/**
 * Claim-Ledger — claim-ledger.mjs
 *
 * The LIVE BRIDGE that finally gives the claim-evidence cortex a consumer. The
 * circuitry map's biggest dark edge: `claim-cortex.mjs` had ZERO live caller, so
 * the four claim-driven energy terms (α entropy, β KL, ε infoGain, ζ staleness)
 * stayed dark — the gate only ever exercised ~5/11 terms from real tool traffic.
 *
 * This module reads the SAME classified tool transitions the energy-tick already
 * processes and maintains a small per-session CLAIM LEDGER from them, so the cortex
 * can light those terms on real work. It is a v1 PROXY: a mutating tool success is
 * read as an implicit claim that the change is correct (claimed runtime_tested),
 * carrying only fixture-grade evidence (the edit itself); a passing Bash command is
 * read as test-grade evidence that promotes recent claims. The richer layer — reading
 * the agent's ACTUAL prose claims — is the v2 ([[claim-evidence-ledger]]); this is the
 * honest first wire that makes the cortex fire.
 *
 * SAFETY: `claimGateFields` returns ONLY the distribution/belief fields that light
 * α/β/ε — it deliberately OMITS promotionLadderInversions and protectedPathViolations,
 * so merging it into a gate state can RAISE U (observability) but can NEVER introduce
 * a structural-floor or protected-path veto. The over-claim→enforcement step (letting a
 * claim inversion actually block) is a separate, owner-gated change. Pure + deterministic
 * (nowMs injected), mirroring claim-cortex / energy-tick-core.
 *
 * Related:
 *   - _SYSTEM/Scripts/claim-cortex.mjs        (the pure claim model this feeds)
 *   - _SYSTEM/Scripts/energy-tick-core.mjs    (the tool-event sensor that drives this)
 */

import { cortexSnapshot, LADDER } from './claim-cortex.mjs';

// Bound the ledger so a long session never grows it unbounded (mirror energy-tick CAP).
const LEDGER_CAP = 40;
// How many of the most-recent file-claims a passing command promotes with test evidence.
const PROMOTE_RECENT = 5;

export function freshLedger() {
  return { claims: [], seq: 0 };
}

function cloneClaims(claims) {
  // Per-element fail-CLOSED: a poisoned ledger element (null/undefined/non-object from a
  // truncated or corrupted persisted snapshot) must be SKIPPED, never throw. The READ
  // side (cortexSnapshot) was hardened this way (claim-cortex.mjs Cluster-D guard); the
  // wire red-team found the WRITE side here unguarded — a null element threw out of
  // tickAndTrace BEFORE the persist/trace/breaker ran, wedging energy observability for
  // the rest of the session (the poison re-reads every tick). Filtering self-heals it.
  return claims
    .filter((c) => c && typeof c === 'object')
    .map((c) => ({ ...c, evidence: Array.isArray(c.evidence) ? c.evidence.map((e) => ({ ...e })) : [] }));
}

/**
 * Apply one classified energy-tick transition (the `t` from classifyTransition) to the
 * ledger. Never mutates the input. `t` shape: { tool, filePath, success, isMutating,
 * isBash, protectedHit }.
 *   - mutating success on a real path -> upsert a file-claim at fixture_ready (a
 *     written-but-untested edit IS honestly at fixture_ready — NOT an over-claim;
 *     modeling it as "it works" would flag every normal edit as ascending and flood
 *     the trace) with fixture evidence (evidenceRank fixture_ready, deltaRank 0).
 *   - bash success -> append test evidence (runtime-grade) to the most-recent
 *     file-claims; the evidence now EXCEEDS the fixture_ready claim, so the verified
 *     distribution shifts up vs claimed -> beta KL drift + an epsilon info-gain credit
 *     light up. This is the honest epistemic signal: claims firming as tests pass.
 *   - protected-path hits and failures add no claim (the tool-event axis already owns
 *     those terms; this bridge only authors the claim/evidence dimension).
 */
export function applyClaimTransition(prevLedger, t, nowMs) {
  const base = (prevLedger && Array.isArray(prevLedger.claims)) ? prevLedger : freshLedger();
  const claims = cloneClaims(base.claims);
  let seq = Number(base.seq) || 0;
  const tr = (t && typeof t === 'object') ? t : {};

  if (tr.protectedHit) return { claims, seq }; // violation, not a claim — tool-event axis owns it

  if (tr.isMutating && tr.success && typeof tr.filePath === 'string' && tr.filePath) {
    const id = tr.filePath;
    const existing = claims.find((c) => c.id === id);
    const fixture = { kind: 'fixture', capturedAt: Number(nowMs) || 0, reference: id };
    if (existing) {
      existing.evidence.push(fixture);
      existing.updatedSeq = seq;
    } else {
      claims.push({ id, claimedStatus: 'fixture_ready', evidence: [fixture], updatedSeq: seq });
    }
    seq += 1;
  } else if (tr.isBash && tr.success) {
    // A passing command is runtime evidence — promote the most-recently-touched claims.
    const recent = [...claims].sort((a, b) => (b.updatedSeq || 0) - (a.updatedSeq || 0)).slice(0, PROMOTE_RECENT);
    const test = { kind: 'test', capturedAt: Number(nowMs) || 0, reference: `bash:${seq}` };
    for (const c of recent) c.evidence.push(test);
    seq += 1;
  }
  // else (reads, failures): no claim authored here.

  // Cap: keep the most-recently-updated claims.
  const capped = claims.length > LEDGER_CAP
    ? [...claims].sort((a, b) => (b.updatedSeq || 0) - (a.updatedSeq || 0)).slice(0, LEDGER_CAP)
    : claims;
  return { claims: capped, seq };
}

// The empty/degenerate gate-field set: nothing to merge (cortex stays dark this tick).
const EMPTY_FIELDS = Object.freeze({});

/**
 * Project the ledger into the SAFE subset of computeU fields — the ones that light
 * α (entropy), β (KL drift), ε (info-gain). Deliberately omits promotionLadderInversions,
 * protectedPathViolations, evidence and verifiedEvidenceCount so merging this can never
 * add a veto path or double-count the tool-event axis's own terms. Fail-open: any error
 * or an empty ledger yields {} (the cortex contributes nothing, current behavior).
 */
export function claimGateFields(ledger, nowMs) {
  try {
    const claims = (ledger && Array.isArray(ledger.claims)) ? ledger.claims : [];
    if (claims.length === 0) return EMPTY_FIELDS;
    const { state } = cortexSnapshot(claims, { nowMs });
    return {
      claimPromotionDistribution: state.claimPromotionDistribution,
      claimedDistribution: state.claimedDistribution,
      verifiedDistribution: state.verifiedDistribution,
      priorState: state.priorState,
      posteriorState: state.posteriorState,
    };
  } catch {
    return EMPTY_FIELDS; // fail-open: never break the tick
  }
}

// Small introspection helper for tests / dashboards.
export function ledgerSummary(ledger) {
  const claims = (ledger && Array.isArray(ledger.claims)) ? ledger.claims : [];
  const byStatus = Object.fromEntries(LADDER.map((s) => [s, 0]));
  for (const c of claims) byStatus[c.claimedStatus] = (byStatus[c.claimedStatus] || 0) + 1;
  return { claimCount: claims.length, byClaimedStatus: byStatus };
}
