#!/usr/bin/env node
/**
 * filing-assessor.mjs — deterministic, READ-ONLY placement assessor for YURI artifacts.
 *
 * YURI is reaching sizes where generated artifacts (research docs, /tmp scratch, memories, reports, lane outputs,
 * telemetry) get thrown into pools that aren't clean enough. This is the ASSESSMENT half of the filing system:
 * a deterministic placement function (classify an artifact → its canonical zone), a hazard-decay STALENESS score
 * for purge candidates, and a dedup hook. It is strictly READ-ONLY — it RECOMMENDS, it never moves/deletes a file.
 * (The mutation half — actually relocating/purging — is owner-gated; this report is what the owner acts on.)
 *
 * Deterministic: closed-set zone rules, sorted output, no RNG. Staleness reuses math-kernel confidenceDecay.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { confidenceDecay } from './math/math-kernel.mjs';
import { normalizePath } from './yuri-id-bridge.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(__dirname, '..', '..');

// the canonical zones + the ORDERED rules that place an artifact. First match wins (deterministic).
export const ZONE_RULES = [
  { zone: 'EPHEMERAL', kind: 'scratch', test: (p, name, ext) => p.startsWith('/tmp/') || /\.(bak|tmp|scratch|swp)$/.test(name) || /\.bak-/.test(name), note: 'temporary scratch — purge candidate, should not persist in the repo' },
  { zone: '_SYSTEM/config/schemas', kind: 'schema', test: (p, name) => /\.schema\.json$/.test(name) || (name.endsWith('.json') && /schema/.test(p)) },
  { zone: '_SYSTEM/docs', kind: 'handoff/doc', test: (p, name) => name.endsWith('.md') && (/handoff|HANDOFF/.test(name) || p.includes('_SYSTEM/docs')) },
  { zone: '02_RESOURCES/RESEARCH', kind: 'research', test: (p, name) => name.endsWith('.md') && (p.includes('02_RESOURCES') || /research|spec|synthesis|audit|brief|channels/i.test(name)) },
  { zone: '_SYSTEM/reports', kind: 'report', test: (p, name) => (name.endsWith('.html') || name.endsWith('.md')) && (p.includes('_SYSTEM/reports') || /report|audit|dashboard/i.test(name)) },
  { zone: '_SYSTEM/Scripts/math', kind: 'math-module', test: (p, name, ext) => /\.(mjs|js|cjs)$/.test(name) && (p.includes('_SYSTEM/Scripts/math') || /^(math-|yuri-(energy|jaccard|mdl|minhash|phi)|formula-|nexus-numerology)/.test(name)) },
  { zone: '_SYSTEM/Scripts', kind: 'script', test: (p, name) => /\.(mjs|js|cjs|sh)$/.test(name) && p.includes('_SYSTEM/Scripts') },
  { zone: '_SYSTEM/state', kind: 'state/telemetry', test: (p, name) => name.endsWith('.jsonl') || (name.endsWith('.json') && p.includes('_SYSTEM/state')) },
];

export function classifyArtifact(filePath) {
  const rel = normalizePath(filePath);
  const p = filePath.startsWith('/') ? filePath : '/' + rel; // keep /tmp absolute detectable
  const name = path.basename(filePath);
  const ext = path.extname(name).toLowerCase();
  for (const rule of ZONE_RULES) {
    if (rule.test(p, name, ext)) return { kind: rule.kind, zone: rule.zone, reason: rule.note || `matched ${rule.kind} rule`, note: rule.note };
  }
  return { kind: 'unclassified', zone: null, reason: 'no zone rule matched — needs owner placement decision' };
}

// which top-level zone a path CURRENTLY lives in (for the misplaced check).
function currentZoneOf(filePath) {
  const rel = normalizePath(filePath);
  if (filePath.startsWith('/tmp/')) return 'EPHEMERAL';
  const known = ['_SYSTEM/config/schemas', '_SYSTEM/docs', '02_RESOURCES/RESEARCH', '_SYSTEM/reports', '_SYSTEM/Scripts/math', '_SYSTEM/Scripts', '_SYSTEM/state'];
  return known.find((z) => rel.startsWith(z + '/') || rel === z) || (rel.split('/')[0] || 'root');
}

export function assess(filePath) {
  const c = classifyArtifact(filePath);
  const current = currentZoneOf(filePath);
  const misplaced = c.zone !== null && c.zone !== current && !(c.zone === 'EPHEMERAL' && current === 'EPHEMERAL');
  return { path: normalizePath(filePath), kind: c.kind, currentZone: current, recommendedZone: c.zone, misplaced, reason: c.reason };
}

// hazard-decay staleness for a purge candidate: older ⇒ higher purge pressure (1 − freshness).
export function stalenessScore(ageHours, halfLifeHours = 168) {
  if (!Number.isFinite(ageHours) || ageHours < 0) return 0;
  const hl = Number.isFinite(halfLifeHours) && halfLifeHours > 0 ? halfLifeHours : 168;
  return Number((1 - confidenceDecay({ base: 1, age: ageHours, halfLife: hl })).toFixed(4));
}

// assess a list of paths → a report (sorted, deterministic). Read-only; recommendations only.
export function assessAll(paths, opts = {}) {
  const rows = (Array.isArray(paths) ? paths : []).map((p) => {
    const a = assess(p);
    if (typeof opts.ageHoursOf === 'function' && a.recommendedZone === 'EPHEMERAL') a.purgePressure = stalenessScore(opts.ageHoursOf(p), opts.halfLifeHours);
    return a;
  }).sort((x, y) => x.path.localeCompare(y.path));
  return {
    op: 'filing_assess',
    total: rows.length,
    misplaced: rows.filter((r) => r.misplaced).map((r) => ({ path: r.path, currentZone: r.currentZone, recommendedZone: r.recommendedZone })),
    unclassified: rows.filter((r) => r.kind === 'unclassified').map((r) => r.path),
    ephemeralInRepo: rows.filter((r) => r.recommendedZone === 'EPHEMERAL' && r.currentZone !== 'EPHEMERAL').map((r) => r.path),
    rows,
    advisory_only: true,
    note: 'READ-ONLY assessment. Relocation/purge is owner-gated — this report is what the owner acts on.',
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2).filter((a) => !a.startsWith('--'));
  const json = process.argv.includes('--json');
  if (!args.length) { process.stdout.write('usage: filing-assessor.mjs <path...> [--json]\n'); process.exitCode = 1; }
  else {
    const r = assessAll(args);
    process.stdout.write(json ? JSON.stringify(r, null, 2) + '\n'
      : `filing assess: ${r.total} artifacts · ${r.misplaced.length} misplaced · ${r.unclassified.length} unclassified · ${r.ephemeralInRepo.length} ephemeral-in-repo\n`
        + r.rows.map((x) => `  ${x.misplaced ? '⚠' : ' '} ${x.path.padEnd(48)} [${x.kind}] -> ${x.recommendedZone || '(owner decision)'}`).join('\n') + '\n');
  }
}
