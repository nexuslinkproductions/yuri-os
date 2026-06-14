#!/usr/bin/env node
// @capability: mcs-fold-mutation-sweep
// @serves: grey-zone catcher canonical store | mutation testing fold | find verification gaps | survivor report | are the store invariants vacuous | RED grey tests for memory-canonical
// @does: P2 grey-zone sweep for the canonical store fold (adopts the energy lane's B5 methodology, applied to
//        memory-canonical-store). A single fold(envelopes,{mutation}) mirrors foldCanonical with an INJECTABLE
//        rule-break (FWW / IGNORE_SUPERSEDE / IGNORE_RETRACT / NEVER_CONTESTED / ALWAYS_CONTESTED /
//        NO_SUPERSEDE_REMOVAL). Each mutant runs over a probe corpus through independent invariant ORACLES
//        (LWW, supersede-dead, retract, contested-detect, contested-precise). A mutant that violates >=1
//        invariant on >=1 probe is KILLED; one that passes everything is a SURVIVOR (a grey gap — an unpinned
//        rule) or EQUIVALENT. The reference fold (mutation=null) MUST pass all invariants. Anti-drift: the test
//        cross-checks this reference fold against the REAL store (appendClaim+drainOnce) on every probe.
// @use: node mcs-fold-mutation-sweep.mjs  (prints score + survivors). After changing foldCanonical, run to
//       measure what the invariant oracles DON'T pin; each non-equivalent survivor should become a permanent
//       store test. Honest scope: this sweeps FOLD-level rules (byKey/contested); log-level exactly-once +
//       multi-process reclaim are covered by mcs-fault-injection.test.
// @exports: fold, INVARIANTS, MUTATIONS, PROBES, makeEnvelope, runSweep
// @depends: memory-canonical-store.mjs (mintEventId, keyOf)

import { mintEventId, keyOf } from './memory-canonical-store.mjs';

// Build the minimal fold-relevant envelope from a claim (mirrors appendClaim's identity fields).
export function makeEnvelope(claim, lane) {
  return {
    eventId: mintEventId(claim),
    kind: claim.kind || 'assert',
    subject: claim.subject,
    predicate: claim.predicate,
    object: claim.object ?? null,
    supersedes: claim.supersedes || null,
    provenance: { lane: String(lane) },
  };
}

export const MUTATIONS = [null, 'FWW', 'IGNORE_SUPERSEDE', 'IGNORE_RETRACT', 'NEVER_CONTESTED', 'ALWAYS_CONTESTED', 'NO_SUPERSEDE_REMOVAL'];

/**
 * Pure fold mirroring foldCanonical's rules over an ordered envelope array, with ONE injectable rule-break.
 * mutation=null is the faithful reference. Returns { byKey: Map(key->envelope), contested: Set(key) }.
 */
export function fold(envelopes, { mutation = null } = {}) {
  const byKey = new Map();
  const byEvent = new Map();
  const contested = new Map();        // OUTPUT flag: key -> objsMap (set only when >1 distinct object competes)
  const objsByKey = new Map();        // PERSISTENT accumulator: key -> Map(lane|objJSON -> {lane,object}) — survives across events (mirrors the real foldCanonical)
  const seen = new Set();
  const superseded = new Set();
  const refresh = (k) => {
    if (mutation === 'NEVER_CONTESTED') { contested.delete(k); return; }
    if (mutation === 'ALWAYS_CONTESTED') { contested.set(k, objsByKey.get(k) || new Map()); return; }
    const m = objsByKey.get(k);
    const distinct = m ? new Set([...m.values()].map((v) => JSON.stringify(v.object))) : new Set();
    if (distinct.size > 1) contested.set(k, m); else contested.delete(k);
  };
  for (const e of envelopes) {
    if (!e || !e.eventId || seen.has(e.eventId)) continue;     // dedup (log-level exactly-once tested elsewhere)
    seen.add(e.eventId);
    // dead-marking for supersede AND retract (retract-by-content), order-independent — MIRRORS foldCanonical.
    // grey-sweep rule-breaks preserved: IGNORE_SUPERSEDE / IGNORE_RETRACT / NO_SUPERSEDE_REMOVAL.
    let deadTarget = null;
    if (e.kind === 'retract') {
      if (mutation !== 'IGNORE_RETRACT') deadTarget = e.supersedes || (e.object != null ? mintEventId({ kind: 'assert', subject: e.subject, predicate: e.predicate, object: e.object }) : null);
    } else if (e.supersedes && mutation !== 'IGNORE_SUPERSEDE') {
      deadTarget = e.supersedes;
    }
    if (deadTarget) {
      superseded.add(deadTarget);
      const old = byEvent.get(deadTarget);
      if (old) {
        const ok = keyOf(old);
        const wasWinner = byKey.get(ok)?.eventId === old.eventId;
        if (mutation === 'NO_SUPERSEDE_REMOVAL') {
          if (wasWinner) byKey.delete(ok);   // mutant: delete winner, DON'T clean the competing set or re-elect
        } else {
          const om = objsByKey.get(ok);
          if (om) om.delete(`${old.provenance?.lane}|${JSON.stringify(old.object)}`);
          if (wasWinner) {   // re-elect a deterministic survivor (smallest eventId, order-independent) — mirrors foldCanonical
            const survivors = om ? [...om.values()].filter((v) => v.eventId).sort((a, b) => String(a.eventId).localeCompare(String(b.eventId))) : [];
            if (survivors.length) byKey.set(ok, byEvent.get(survivors[0].eventId)); else byKey.delete(ok);
          }
          if (om) refresh(ok);
        }
      }
    }
    const k = keyOf(e);
    byEvent.set(e.eventId, e);
    if (e.kind === 'retract') continue;                // retract adds NO active claim; target dead-marked above (unless IGNORE_RETRACT)
    if (superseded.has(e.eventId)) continue;
    if (mutation === 'FWW') { if (!byKey.has(k)) byKey.set(k, e); }   // first-write-wins (break LWW)
    else byKey.set(k, e);
    const m = objsByKey.get(k) || new Map();
    m.set(`${e.provenance?.lane}|${JSON.stringify(e.object)}`, { lane: e.provenance?.lane, object: e.object, eventId: e.eventId });   // eventId: re-election needs it (mirrors foldCanonical)
    objsByKey.set(k, m);
    refresh(k);
  }
  return { byKey, contested };
}

// ── independent invariant ORACLES (computed from the envelope sequence, NOT from the fold) ──────────────
// expected winner per key: replay in order, supersede removes the target from contention, retract clears, a
// later assert re-sets. This is a SIMPLER oracle than the fold (no contested), so a bug in it makes the
// reference fold FAIL its own invariant -> caught by the "reference passes all" assertion.
function oracle(envelopes) {
  // dead set = supersede targets + retract targets (content-hash), PRECOMPUTED -> order-independent.
  const superseded = new Set();
  for (const e of envelopes) {
    if (e.supersedes) superseded.add(e.supersedes);
    if (e.kind === 'retract' && e.object != null) superseded.add(mintEventId({ kind: 'assert', subject: e.subject, predicate: e.predicate, object: e.object }));
  }
  const winner = new Map();         // key -> expected winning envelope (or absent)
  const objsActive = new Map();     // key -> Set(JSON(object)) among non-dead active asserts
  const seen = new Set();
  for (const e of envelopes) {
    if (seen.has(e.eventId)) continue; seen.add(e.eventId);
    if (e.kind === 'retract') continue;            // retract adds no claim
    if (superseded.has(e.eventId)) continue;       // superseded or retracted -> never active
    const k = keyOf(e);
    winner.set(k, e);
    const s = objsActive.get(k) || new Set(); s.add(JSON.stringify(e.object)); objsActive.set(k, s);
  }
  return { superseded, winner, objsActive };
}

export const INVARIANTS = [
  { name: 'LWW', check(envs, { byKey }) {
    const { winner } = oracle(envs);
    for (const [k, e] of winner) if (byKey.get(k)?.eventId !== e.eventId) return false;
    for (const k of byKey.keys()) if (!winner.has(k)) return false;     // a key active in fold must be a real winner
    return true;
  } },
  { name: 'SUPERSEDE_DEAD', check(envs, { byKey }) {
    const { superseded } = oracle(envs);
    for (const e of byKey.values()) if (superseded.has(e.eventId)) return false;
    return true;
  } },
  { name: 'RETRACT', check(envs, { byKey }) {
    const { winner } = oracle(envs);
    for (const k of byKey.keys()) if (!winner.has(k)) return false;     // retracted-and-not-reasserted keys must be gone
    return true;
  } },
  { name: 'CONTESTED_DETECT', check(envs, { contested }) {
    const { objsActive } = oracle(envs);
    for (const [k, objs] of objsActive) if (objs.size > 1 && !contested.has(k)) return false;
    return true;
  } },
  { name: 'CONTESTED_PRECISE', check(envs, { contested }) {
    const { objsActive } = oracle(envs);
    for (const k of contested.keys()) if ((objsActive.get(k)?.size ?? 0) <= 1) return false;
    return true;
  } },
];

// ── probe corpus — each sequence exercises specific rules so mutants diverge + oracles fire ─────────────
const ev = (lane, claim) => makeEnvelope(claim, lane);
export const PROBES = [
  { name: 'lww', events: [ev('A', { subject: 's', predicate: 'p', object: 1 }), ev('A', { subject: 's', predicate: 'p', object: 2 })] },
  { name: 'supersede', events: (() => { const a = ev('A', { subject: 's', predicate: 'p', object: 1 }); const b = ev('A', { subject: 's', predicate: 'p', object: 2, supersedes: a.eventId }); return [a, b]; })() },
  { name: 'retract', events: [ev('A', { subject: 's', predicate: 'p', object: 1 }), ev('A', { kind: 'retract', subject: 's', predicate: 'p', object: 1 })] },
  { name: 'retract-then-reassert', events: [ev('A', { subject: 's', predicate: 'p', object: 1 }), ev('A', { kind: 'retract', subject: 's', predicate: 'p', object: 1 }), ev('B', { subject: 's', predicate: 'p', object: 9 })] },
  { name: 'conflict', events: [ev('A', { subject: 's', predicate: 'p', object: 1 }), ev('B', { subject: 's', predicate: 'p', object: 2 })] },
  { name: 'solo', events: [ev('A', { subject: 's', predicate: 'p', object: 1 })] },
  { name: 'self-supersede-value-change', events: (() => { const a = ev('A', { subject: 's', predicate: 'p', object: 'v1' }); const b = ev('A', { subject: 's', predicate: 'p', object: 'v2', supersedes: a.eventId }); return [a, b]; })() },
  { name: 'dup', events: (() => { const a = ev('A', { subject: 's', predicate: 'p', object: 1 }); return [a, a]; })() },
];

/** Run the sweep: reference must pass all invariants; classify each mutation KILLED / SURVIVED / EQUIVALENT. */
export function runSweep() {
  const refResults = PROBES.map((pr) => fold(pr.events));
  const referencePasses = PROBES.every((pr, i) => INVARIANTS.every((inv) => inv.check(pr.events, refResults[i])));
  const rows = [];
  for (const mutation of MUTATIONS) {
    if (mutation === null) continue;
    let killed = false, differs = false;
    const failedInvs = new Set();
    for (let i = 0; i < PROBES.length; i++) {
      const res = fold(PROBES[i].events, { mutation });
      // EQUIVALENT detection: same winners + same contested key set as reference
      const sameWinners = JSON.stringify([...res.byKey].map(([k, e]) => [k, e.eventId]).sort()) === JSON.stringify([...refResults[i].byKey].map(([k, e]) => [k, e.eventId]).sort());
      const sameContested = JSON.stringify([...res.contested.keys()].sort()) === JSON.stringify([...refResults[i].contested.keys()].sort());
      if (!sameWinners || !sameContested) differs = true;
      for (const inv of INVARIANTS) if (!inv.check(PROBES[i].events, res)) { killed = true; failedInvs.add(inv.name); }
    }
    rows.push({ mutation, verdict: killed ? 'KILLED' : (differs ? 'SURVIVED' : 'EQUIVALENT'), caughtBy: [...failedInvs] });
  }
  const killedN = rows.filter((r) => r.verdict === 'KILLED').length;
  const survivors = rows.filter((r) => r.verdict === 'SURVIVED');
  return { referencePasses, total: rows.length, killed: killedN, score: rows.length ? killedN / rows.length : 0, survivors, rows };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const r = runSweep();
  console.log(`mcs-fold-mutation-sweep — reference passes all invariants: ${r.referencePasses}`);
  console.log(`mutation score: ${(r.score * 100).toFixed(1)}% (${r.killed}/${r.total} killed)`);
  for (const row of r.rows) console.log(`  ${row.verdict.padEnd(10)} ${row.mutation}${row.caughtBy.length ? ' — caught by: ' + row.caughtBy.join(',') : ''}`);
  if (r.survivors.length) console.log(`SURVIVORS (grey gaps -> add a permanent invariant): ${r.survivors.map((s) => s.mutation).join(', ')}`);
}
