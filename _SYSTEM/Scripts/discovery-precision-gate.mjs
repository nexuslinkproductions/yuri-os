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
import { fileURLToPath } from 'node:url';
import { isProtectedPath, normalizePath } from './yuri-id-bridge.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// a path is in scope iff it sits under one of the allowed prefixes (and not under a denied one).
function inScope(rel, allowed) {
  if (!allowed || !allowed.length) return true; // no scope declared ⇒ unrestricted (caller's choice)
  return allowed.some((a) => { const n = normalizePath(a); return rel === n || rel.startsWith(n.endsWith('/') ? n : n + '/') || rel.startsWith(n); });
}

export function discoveryPrecisionGate(claim = {}, substrate = {}, opts = {}) {
  const allowed = (substrate.allowedPaths || []).map(normalizePath);
  const denied = (substrate.deniedPaths || []).map(normalizePath);
  const referenced = [...new Set([...(claim.paths || []), ...(claim.discoveryFootprint || [])].map(normalizePath))].sort();

  const vetoes = [];
  let inScopeCount = 0;
  for (const rel of referenced) {
    if (isProtectedPath(rel)) { vetoes.push({ path: rel, reason: 'protected-path' }); continue; }
    if (denied.some((d) => rel === d || rel.startsWith(d))) { vetoes.push({ path: rel, reason: 'denied-path' }); continue; }
    if (!inScope(rel, allowed)) { vetoes.push({ path: rel, reason: 'out-of-allowed-scope' }); continue; }
    inScopeCount += 1;
  }
  // PRECISION: of the paths the lane actually touched, how many stayed inside the granted authority.
  const footprint = [...new Set((claim.discoveryFootprint || []).map(normalizePath))];
  const footIn = footprint.filter((rel) => !isProtectedPath(rel) && inScope(rel, allowed) && !denied.some((d) => rel.startsWith(d)));
  const precisionScore = footprint.length ? Number((footIn.length / footprint.length).toFixed(4)) : 1;

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
    precisionScore,
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

if (import.meta.url === `file://${process.argv[1]}`) {
  process.stdout.write('discovery-precision-gate: library — import { discoveryPrecisionGate, withNavigate }\n');
}
