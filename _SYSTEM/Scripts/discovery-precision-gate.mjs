#!/usr/bin/env node
/**
 * discovery-precision-gate.mjs — gate a lane claim against its WorkSubstrate scope + discovery footprint,
 * BEFORE the energy gate runs. The energy gate scores a transition's quality; this is the upstream filter that
 * asks "did the lane stay inside the authority it was granted, and how precise was its discovery?".
 *
 * Rides on the primitives already built: yuri-id-bridge (isProtectedPath / normalizePath — the protected veto),
 * yuri-navigate (computeImpactCentrality — the graph.impact_centrality blast-radius of the claim's targets).
 *
 * Verdict is ADVISORY (a pre-filter): a hard scope/protected VETO blocks; precision + impact are reported so the
 * downstream energy/proof gates and the operator can weigh the claim. Deterministic (sorted, no RNG/clock).
 */
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { isProtectedPath, normalizePath } from './yuri-id-bridge.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');

// a path is in scope iff it sits under one of the allowed prefixes (and not under a denied one).
function underPrefix(rel, prefix) {
  // Normalize BOTH sides — a caller passing './_SYSTEM/docs/x.md' must still match prefix '_SYSTEM/docs' (F2).
  const r = normalizePath(rel);
  const n = normalizePath(prefix);
  return r === n || r.startsWith(n.endsWith('/') ? n : n + '/');
}

function inScope(rel, allowed) {
  if (!allowed || !allowed.length) return true; // no scope declared ⇒ unrestricted (caller's choice)
  return allowed.some((a) => underPrefix(rel, a));
}

function isDenied(rel, denied) {
  return denied.some((d) => underPrefix(rel, d));
}

function toRel(value) {
  // Lane-supplied paths are semi-trusted; coerce malformed entries once so the gate fails by verdict, not TypeError.
  return safeRel(value).rel;
}

function safeRel(value) {
  const raw = String(value ?? '');
  if (!raw.trim()) return { rel: '', reason: null };
  const abs = path.isAbsolute(raw) ? path.resolve(raw) : path.resolve(REPO_ROOT, raw);
  const relFromRoot = path.relative(REPO_ROOT, abs);
  if (relFromRoot.startsWith('..') || path.isAbsolute(relFromRoot)) {
    return { rel: normalizePath(raw), reason: 'escapes-repo' };
  }
  return { rel: normalizePath(relFromRoot), reason: null };
}

function uniquePathRecords(values) {
  const out = new Map();
  for (const value of values) {
    const rec = safeRel(value);
    if (!rec.rel) continue;
    const prior = out.get(rec.rel);
    if (!prior || (!prior.reason && rec.reason)) out.set(rec.rel, rec);
  }
  return [...out.values()].sort((a, b) => a.rel.localeCompare(b.rel));
}

const asArray = (value) => (Array.isArray(value) ? value : (value == null ? [] : [value]));

export function discoveryPrecisionGate(claim = {}, substrate = {}, opts = {}) {
  // WorkSubstrate authors often provide one path as a string; normalize shape before mapping.
  const allowedRecords = uniquePathRecords(asArray(substrate.allowedPaths));
  const deniedRecords = uniquePathRecords(asArray(substrate.deniedPaths));
  const allowed = allowedRecords.map((r) => r.rel);
  const denied = deniedRecords.map((r) => r.rel);
  // A '../'-escape in a scope list can never match an in-repo path — it silently becomes a no-op prefix. KEEP it
  // in the matching lists (preserves fail-closed: an allowed-list of only-escapes vetoes everything) but SURFACE
  // the config error as a scopeWarning instead of swallowing it (F3).
  const scopeWarnings = [...allowedRecords, ...deniedRecords].filter((r) => r.reason).map((r) => ({ path: r.rel, reason: r.reason, surface: 'scope-config' }));
  const referencedRecords = uniquePathRecords([...(claim.paths || []), ...(claim.discoveryFootprint || [])]);
  const referenced = referencedRecords.map((r) => r.rel);

  const vetoes = [];
  let inScopeCount = 0;
  for (const rec of referencedRecords) {
    const rel = rec.rel;
    if (rec.reason) { vetoes.push({ path: rel, reason: rec.reason }); continue; }
    if (isProtectedPath(rel)) { vetoes.push({ path: rel, reason: 'protected-path' }); continue; }
    if (isDenied(rel, denied)) { vetoes.push({ path: rel, reason: 'denied-path' }); continue; }
    if (!inScope(rel, allowed)) { vetoes.push({ path: rel, reason: 'out-of-allowed-scope' }); continue; }
    inScopeCount += 1;
  }
  // PRECISION: of the paths the lane actually touched, how many stayed inside the granted authority.
  const footprintRecords = uniquePathRecords(claim.discoveryFootprint || []);
  // Empty footprints used to get a perfect 1.0; fall back to referenced paths so omission cannot game precision.
  const precisionRecords = footprintRecords.length ? footprintRecords : referencedRecords;
  const precisionBasis = footprintRecords.length ? 'discoveryFootprint' : (referencedRecords.length ? 'referenced-paths' : 'none');
  const footIn = precisionRecords.filter(({ rel, reason }) => !reason && !isProtectedPath(rel) && inScope(rel, allowed) && !isDenied(rel, denied));
  const precisionScore = precisionRecords.length ? Number((footIn.length / precisionRecords.length).toFixed(4)) : null;
  const precisionNotes = footprintRecords.length ? [] : ['no-footprint-declared'];

  // IMPACT: the blast radius of the claim's graph targets (advisory — high impact ⇒ surface for review).
  let impact = { available: false, maxImpact: 0, targets: [] };
  const targets = (claim.targets || []).map(String);
  if (targets.length && opts.graph) {
    try {
      const nav = opts.navigate;
      const scored = targets.map((t) => ({ id: t, impact: nav.computeImpactCentrality(opts.graph, t).impactScore })).sort((a, b) => b.impact - a.impact || a.id.localeCompare(b.id));
      impact = { available: true, maxImpact: scored.length ? scored[0].impact : 0, targets: scored };
    } catch { /* graph/nav unavailable — impact stays absent, not faked */ }
  }

  return {
    op: 'discovery_precision_gate',
    pass: vetoes.length === 0,
    vetoes,
    scopeWarnings,
    precisionScore,
    precisionBasis,
    precisionNotes,
    referencedCount: referenced.length,
    inScopeCount,
    impact,
    advisory_only: true,
    local_truth_claim: false,
    verification: { reason: vetoes.length ? 'scope/protected veto — claim blocked before energy gate' : 'in-scope; precision + impact reported for the energy/proof gates' },
  };
}

// convenience: load the nav graph + bind it so callers get the impact term without wiring navigate themselves.
export async function withNavigate(claim, substrate, opts = {}) {
  try {
    const nav = await import('./yuri-navigate.mjs');
    const graph = nav.loadUnifiedGraph();
    return discoveryPrecisionGate(claim, substrate, { ...opts, graph, navigate: nav });
  } catch {
    return discoveryPrecisionGate(claim, substrate, opts);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.stdout.write('discovery-precision-gate: library — import { discoveryPrecisionGate, withNavigate }\n');
}
