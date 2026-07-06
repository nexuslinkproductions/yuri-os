#!/usr/bin/env node
// @capability: claim-conscience-sweep
// @serves: staleness conscience session sweep | SessionStart staleness preflight | EOT closeout sweep | brain staleness block
// @does: S4 entry point of the staleness conscience. One-shot sweep over the extractor ledger: verifyAll
//        + healAll (dry-run by default) + a compact summary for the <yuri-brain> block. Designed to wire
//        as a SessionStart hook (preflight: surface stale claims at boot) and/or an EOT closeout step.
//        DISARMED by default (surfaces only); armed only if YURI_CLAIM_HEAL_ARMED=1.
//        SESSIONSTART CONTRACT: never throws. A broken sweep must NEVER block session startup — every
//        path is wrapped + degrades to {ok:false}. The summary is the brain-inject additionalContext.
// @use: node claim-conscience.mjs             # sweep + print human summary (dry-run)
//        node claim-conscience.mjs --json      # JSON summary (for brain-inject additionalContext)
//        node claim-conscience.mjs --arm       # apply guarded heals (owner-gated arming)
// @exports: sweep, formatSummary

import path from 'node:path';
import { healAll, isHealArmed } from './claim-heal.mjs';
import { DEFAULTS } from './claim-registry.mjs';

// Run one sweep. opts: { ledger, registry, armed, verify, runners, journalPath } — all forwarded to healAll.
// Never throws. Returns {ok, armed, totalClaims, verified, stale, wouldHeal, healed, surfaced, skippedByReason, topStale}.
export async function sweep(opts = {}) {
  const armed = opts.armed ?? isHealArmed(opts);
  try {
    const heal = await healAll(opts);
    const results = Array.isArray(heal.results) ? heal.results : [];
    const total = results.length;
    const verified = results.filter(r => r.match === true).length;            // healthy
    const stale = results.filter(r => r.match === false).length;              // the review set
    const unverified = results.filter(r => r.match === null).length;          // no_evidence
    const wouldHeal = (heal.healed || []).filter(h => h.dryRun).length;
    const healedActual = (heal.healed || []).filter(h => h.healed).length;
    // surfaced = stale-but-NOT-healed (the genuine human-review candidates), NOT all-non-healed
    // (which used to inflate the count with healthy + unverified claims).
    const surfaced = Math.max(0, stale - wouldHeal - healedActual);
    const skippedByReason = {};
    for (const s of (heal.skipped || [])) {
      const key = String(s.reason || 'unknown').split(' ')[0];   // bucket by leading word (floor/pinned/negated/...)
      skippedByReason[key] = (skippedByReason[key] || 0) + 1;
    }
    const topStale = results
      .filter(r => r.match === false)
      .slice(0, 5)
      .map(r => ({ claimId: r.id || r.claimId, verifier: r.verifier, evidence: (r.evidence || [])[0] || '' }));
    return { ok: true, armed, totalClaims: total, healthy: verified, unverified, stale, wouldHeal, healed: healedActual, surfaced, skippedByReason, topStale };
  } catch (e) {
    // SESSIONSTART CONTRACT — degrade, never throw. A broken conscience must not block the session.
    return { ok: false, armed, error: String(e?.message || e).slice(0, 160),
             totalClaims: 0, healthy: 0, unverified: 0, stale: 0, wouldHeal: 0, healed: 0, surfaced: 0, skippedByReason: {}, topStale: [] };
  }
}

// Compact one-liner for the <yuri-brain> block (brain-inject additionalContext).
export function formatSummary(s) {
  if (!s || !s.ok) return `staleness: sweep unavailable${s?.error ? ` (${s.error})` : ''}`;
  const parts = [`staleness: ${s.stale} stale`];
  parts.push(s.armed ? `${s.healed} healed` : `${s.wouldHeal} would-heal`);
  parts.push(`${s.surfaced} need-review`);
  parts.push(`(of ${s.totalClaims})`);
  return parts.join(' / ');
}

// ── CLI ───────────────────────────────────────────────────────────────────────────────────────
const IS_MAIN = process.argv[1] && path.resolve(process.argv[1]) === new URL(import.meta.url).pathname;
if (IS_MAIN) {
  const json = process.argv.includes('--json');
  const brief = process.argv.includes('--brief');
  // armed = the persistent flag (YURI_CLAIM_HEAL_ARMED / claim-heal.enabled) OR a per-invocation --arm.
  // The SessionStart hook runs `--brief` (no --arm) → it heals iff the owner has armed the flag.
  // Consistent with claim-heal.mjs (arm || isHealArmed).
  const armed = process.argv.includes('--arm') || isHealArmed();
  sweep({ armed, ledger: DEFAULTS.ledger, registry: DEFAULTS.registry }).then(s => {
    if (json) console.log(JSON.stringify(s));
    else {
      console.log(formatSummary(s));
      if (s.ok && !brief) for (const t of s.topStale) console.log(`  ✗ ${t.claimId}  by=${t.verifier}  ${t.evidence}`);
    }
  }).catch(e => { console.error(`claim-conscience: fatal — ${e?.message || e}`); process.exit(0); });  // exit 0: never block SessionStart
}
