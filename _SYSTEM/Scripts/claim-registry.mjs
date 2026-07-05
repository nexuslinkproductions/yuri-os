#!/usr/bin/env node
// @capability: claim-registry
// @serves: staleness conscience | stale-claim registry | doc-truth verification store | claim ledger join
// @does: the canonical registry for the staleness conscience. Joins prose-claim-extractor's
//        shadow-ledger claims (id=target:claimType, claimedStatus, _source file:line) with a
//        verification overlay (verifiedStatus, match, evidence[], confidence, proposedFix, pinned,
//        healAppliedMs). This is the organ the verifier (claim-verify.mjs) writes into, the healer
//        (claim-heal.mjs) reads from, and brain-inject/yuri-closeout surface. Atomic save
//        (O_EXCL tmp -> rename), sha256 dedup, DISARMED by default (YURI_CLAIM_REGISTRY_ARMED=1).
//        The loop prose-claim-extractor left open (evidence:[] forever empty) closes here.
// @use: import { loadClaims, loadRegistry, joinRegistry, upsertVerification, getStale, saveRegistry, isRegistryArmed }
//        CLI: node claim-registry.mjs stale | stats | join [--arm]
// @exports: loadClaims, loadRegistry, saveRegistry, joinRegistry, upsertVerification, getStale, setPinned, isPinned, sha256, isRegistryArmed, DEFAULTS

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { isArmed, REPO_ROOT } from '../lib/arming.mjs';

export const DEFAULTS = {
  ledger: path.join(REPO_ROOT, '_SYSTEM/state/claim-extractor/shadow-ledger.json'),
  registry: path.join(REPO_ROOT, '_SYSTEM/state/claim-registry.json'),
  armEnv: 'YURI_CLAIM_REGISTRY_ARMED',
  armFlag: '_SYSTEM/state/claim-registry.enabled',
  schema: 'yuri.claim-registry.v1',
};

export function isRegistryArmed({ armEnv = DEFAULTS.armEnv, armFlag = DEFAULTS.armFlag } = {}) {
  return isArmed({ env: armEnv, flag: armFlag });
}

export function sha256(s) {
  return crypto.createHash('sha256').update(String(s ?? '')).digest('hex');
}

// ── read the extractor's claims (READ-ONLY — we never write the ledger) ───────────────────────
export function loadClaims({ ledger = DEFAULTS.ledger } = {}) {
  try {
    const j = JSON.parse(fs.readFileSync(ledger, 'utf8'));
    return Array.isArray(j?.claims) ? j.claims : [];
  } catch { return []; }
}

// ── the verification overlay ──────────────────────────────────────────────────────────────────
export function loadRegistry({ registry = DEFAULTS.registry } = {}) {
  try {
    const j = JSON.parse(fs.readFileSync(registry, 'utf8'));
    if (j && j.schema === DEFAULTS.schema && j.claims && typeof j.claims === 'object') return j;
  } catch { /* absent/corrupt → empty */ }
  return { schema: DEFAULTS.schema, updatedMs: null, claims: {} };
}

// Atomic save (O_EXCL tmp -> rename). DISARMED = dry-run (no write); returns what it would do.
export function saveRegistry(reg, { registry = DEFAULTS.registry, armed } = {}) {
  const next = { schema: DEFAULTS.schema, updatedMs: Date.now(), claims: reg?.claims || {} };
  if (armed === undefined) armed = isRegistryArmed({ registry });
  if (!armed) {
    const bytes = Buffer.byteLength(JSON.stringify(next), 'utf8');
    return { wrote: false, wouldWrite: true, path: registry, bytes, staleCount: countStale(next) };
  }
  fs.mkdirSync(path.dirname(registry), { recursive: true });
  const tmp = `${registry}.tmp-${process.pid}`;
  // O_EXCL: fail if another process already owns the tmp slot (POSIX FS concurrency floor).
  const fd = fs.openSync(tmp, 'wx');
  fs.writeSync(fd, JSON.stringify(next, null, 2));
  fs.closeSync(fd);
  fs.renameSync(tmp, registry);   // atomic publish
  return { wrote: true, path: registry, staleCount: countStale(next) };
}

function countStale(reg) {
  return Object.values(reg?.claims || {}).filter(c => c?.match === false).length;
}

// ── join: ledger claim + overlay → the unified registry view (cortex-compatible) ──────────────
export function joinRegistry({ ledger = DEFAULTS.ledger, registry = DEFAULTS.registry } = {}) {
  const claims = loadClaims({ ledger });
  const overlay = loadRegistry({ registry });
  const byId = overlay.claims || {};
  return claims.map(c => {
    const o = byId[c.id] || {};
    return {
      id: c.id,
      target: c.target,
      claimType: c.claimType,
      claimedStatus: c.claimedStatus,
      contentHash: c.contentHash,
      source: c._source || null,
      seenMs: c._seenMs || null,
      // overlay fields (null/undefined = unverified)
      verifiedStatus: o.verifiedStatus ?? null,
      match: o.match ?? null,
      lastVerifiedMs: o.lastVerifiedMs ?? null,
      verifiedBy: o.verifiedBy ?? null,
      evidence: o.evidence || [],
      confidence: o.confidence ?? null,
      proposedFix: o.proposedFix ?? null,
      pinned: o.pinned === true,
      healAppliedMs: o.healAppliedMs ?? null,
    };
  });
}

// Idempotent upsert of a verification result into the overlay. Returns a NEW registry object.
export function upsertVerification(reg, id, patch) {
  const next = { schema: reg?.schema || DEFAULTS.schema, updatedMs: Date.now(),
                 claims: { ...(reg?.claims || {}) } };
  next.claims[id] = { ...(next.claims[id] || {}), ...patch };
  return next;
}

export function setPinned(reg, id, pinned) {
  return upsertVerification(reg, id, { pinned: pinned === true });
}

export function isPinned(reg, id) {
  return reg?.claims?.[id]?.pinned === true;
}

// Stale = verified mismatch (match===false). includeUnverified also surfaces never-checked claims.
export function getStale({ includeUnverified = false, ledger, registry } = {}) {
  const joined = joinRegistry({ ledger, registry });
  return joined.filter(c => c.match === false || (includeUnverified && c.match === null));
}

// ── CLI (guarded — only runs when this module is the ENTRY, not when imported by a sibling) ─────
// Without this guard, importing claim-registry from claim-verify/claim-heal/claim-conscience makes
// the CLI fire on the IMPORTER's argv (e.g. 'claim-conscience.mjs --brief' printed this help).
const cmd = (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  ? process.argv[2] : null;
if (cmd === 'stale') {
  const stale = getStale();
  const unverified = getStale({ includeUnverified: true }).length - stale.length;
  console.log(`claim-registry: ${stale.length} stale (mismatch), ${unverified} unverified, ${loadClaims().length} total claims`);
  for (const c of stale.slice(0, 40)) {
    const loc = c.source?.filePath ? ` ${path.relative(REPO_ROOT, c.source.filePath)}:${c.source.statement ? '' : ''}` : '';
    console.log(`  ✗ ${c.id}  claimed=${c.claimedStatus} → verified=${c.verifiedStatus}  by=${c.verifiedBy}${loc}`);
  }
  if (!stale.length) console.log('  (no verified mismatches — run claim-verify.mjs to populate)');
} else if (cmd === 'stats') {
  const joined = joinRegistry();
  const verified = joined.filter(c => c.match !== null).length;
  const stale = joined.filter(c => c.match === false).length;
  const pinned = joined.filter(c => c.pinned).length;
  console.log(JSON.stringify({ total: joined.length, verified, stale, unverified: joined.length - verified, pinned }, null, 2));
} else if (cmd === 'join') {
  console.log(JSON.stringify(joinRegistry(), null, 2));
} else if (cmd) {
  console.log(`claim-registry — the staleness-conscience registry (overlay on prose-claim-extractor's ledger)
  node claim-registry.mjs stale                # verified mismatches (the live staleness)
  node claim-registry.mjs stats                # total / verified / stale / unverified / pinned
  node claim-registry.mjs join                 # the full joined registry (JSON)
  (writes happen via claim-verify/heal; YURI_CLAIM_REGISTRY_ARMED=1 to persist)`);
}
