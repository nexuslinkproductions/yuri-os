#!/usr/bin/env node
// @capability: artifact-placement-staleness
// @serves: filing | placement | where does this go | classify artifact | zone | routing by content | staleness purge | hazard decay age | cleanup candidate
// @does: Deterministic, read-only placement (artifact -> canonical zone) via ZONE_RULES + hazard-decay staleness score (older => higher purge pressure, half-life configurable).
// @use: Reach for this before building any artifact classification, placement, or staleness/purge scoring.
// @exports: assess, stalenessScore, ZONE_RULES, CANONICAL_ZONES
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
import { fileURLToPath, pathToFileURL } from 'node:url';
import { confidenceDecay } from './math/math-kernel.mjs';
import { normalizePath, isProtectedPath } from './yuri-id-bridge.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(__dirname, '..', '..');

function inZone(rel, zone) {
  return rel === zone || rel.startsWith(zone + '/');
}

const isEphemeralName = (name) => /\.(bak|tmp|scratch|swp)$/.test(name);

// CANONICAL ANCHORS — pinned, NEVER auto-relocated. Moving any of these breaks the system, so they are
// checked BEFORE the zone rules and short-circuit misplaced detection (like the protected veto below):
//  - the 3 @-include files boot the session (yuri-origin.md, persona.md, SOUL.md) — moving them kills session boot
//  - root adapters (CLAUDE.md, AGENTS.md, .claude/CLAUDE.md) are the provider entrypoints
//  - the graph + INDEX/README/HEARTBEAT files are referenced by thousands of points
// This directly enforces the build's critical rule "NEVER move the 3 @-include files" at the classification
// layer, and the mutator + hooks inherit it (they consult isPinned()).
export const PINNED_ANCHORS = new Set([
  '_SYSTEM/yuri-origin.md', '_SYSTEM/persona.md', 'SOUL.md',          // @-include boot anchors — CRITICAL
  'CLAUDE.md', 'AGENTS.md', '.claude/CLAUDE.md',                       // provider adapters
  '_SYSTEM/INDEX.md', '_SYSTEM/HEARTBEAT.md', '_SYSTEM/README.md', 'README.md',
  '_SYSTEM/yuri-graph.json', '_SYSTEM/yuri-graph-state.json', '02_RESOURCES/RESEARCH/yuri-circuitry-graph.json',
]);
export function isPinned(filePath) {
  return PINNED_ANCHORS.has(normalizePath(String(filePath || '')));
}

// SETTLED dirs — curated homes whose CONTENTS are correctly placed by virtue of location, even when a
// filename/extension keyword would otherwise match a content zone. Without this, the sweep poaches things
// that belong exactly where they are: provider shims (.claude/skills/*/SKILL.md), agent recipes (.agents/),
// Codex skills (.codex/), slash-command defs (.claude/commands/research.md is a COMMAND, not a research doc),
// nested research project folders (02_RESOURCES/RESEARCH/<project>/data.json), KB bundles, and co-located
// scripts (_SYSTEM/OS_KERNEL/*.sh). The filing sweep targets genuinely-loose pools (the _SYSTEM/ root, the
// 02_RESOURCES/RESEARCH/ root) — NOT files already nested inside a curated directory. Conservative by design:
// when a file lives in a recognized home, the assessor declines to call it misplaced (owner can still move it).
export const SETTLED_PREFIXES = [
  '.claude/', '.codex/', '.agents/', '.cursor/', '.obsidian/', '.amp/', '.github/', '.git/', '.smart-env/',
  '01_PROJECTS/', '00_COMMAND-CENTER/', '03_NEXUS-LINK/', '04_ARCHIVE/', 'backend/',
  '_SYSTEM/OS_KERNEL/', '_SYSTEM/tools/', '_SYSTEM/labs/', '_SYSTEM/archive/', '_SYSTEM/research-archive/',
  '_SYSTEM/nexus-rs/', '_SYSTEM/mcp-servers/', '_SYSTEM/corpus-output/', '02_RESOURCES/KNOWLEDGE-BASE/',
  // curated top-level RESOURCE project homes — contents are co-located on purpose (an investor-deck asset named
  // "…identity.md" is NOT a BRAND doc; a design-pack "audit.md" is NOT a _SYSTEM report). The RESEARCH ROOT is
  // deliberately NOT here: its loose-json→_data tidying (depth-3 root files) is a designed sweep, not a poach.
  '02_RESOURCES/INVESTOR-DECK/', '02_RESOURCES/CODE-BIBLE/', '02_RESOURCES/References/',
];
// A file is settled if it sits under a settled prefix, OR it is nested in a research PROJECT subfolder
// (02_RESOURCES/RESEARCH/<project>/… — depth ≥ 4) where its surrounding folder is the curation. Loose files
// directly in the research root (depth 3) stay sweep-eligible.
export function isSettled(filePath) {
  const rel = normalizePath(String(filePath || ''));
  if (!rel) return false;
  // Anything under a top-level DOTDIR (.claude/, .codex/, .gstack/, .smart-env/, …) is a tool/provider home —
  // its contents are correctly placed by location. This generalizes the explicit list and is future-proof.
  if (/^\.[^/]+\//.test(rel)) return true;
  if (SETTLED_PREFIXES.some((pre) => rel === pre.replace(/\/$/, '') || rel.startsWith(pre))) return true;
  // research PROJECT subfolders are curated (loose files at the research ROOT, depth 3, stay sweep-eligible)
  if (rel.startsWith('02_RESOURCES/RESEARCH/') && rel.split('/').length >= 4) return true;
  return false;
}

// extension → coarse file type, so the dependency scanner knows which reference layers apply to an artifact.
export function fileTypeOf(name) {
  const n = String(name || '').toLowerCase();
  if (/\.(mjs|js|cjs|ts|tsx|jsx|py)$/.test(n)) return 'code';
  if (n.endsWith('.md')) return 'markdown';
  if (n.endsWith('.jsonl')) return 'data';
  if (n.endsWith('.json')) return 'json';
  if (n.endsWith('.html') || n.endsWith('.htm')) return 'html';
  if (n.endsWith('.css')) return 'style';
  if (n.endsWith('.sh') || n.endsWith('.zsh')) return 'shell';
  if (n.endsWith('.plist')) return 'plist';
  if (n.endsWith('.skill')) return 'skill';
  if (n.endsWith('.pdf') || n.endsWith('.docx')) return 'binary-doc';
  return 'other';
}

// name-pattern helpers for doc/report sub-zone routing (case-insensitive)
const reReport = /report|audit|dashboard/i;
const reHandoff = /handoff/i;
const reToken = /token/i;
const reCognition = /cognition|neural|neuro|forge/i;
const reWave = /wave|fix-?queue|coverage-map/i;
const rePaper = /paper|whitepaper|landscape-paper/i;
const reAudit = /audit/i;
const reBrand = /brand|design-language|musubi-brand|identity/i;
const reResearch = /research|synthesis|brief|channels|spec/i;          // 'spec' stays a research signal (loose spec docs → RESEARCH)
const reConfigJson = /registry|registries|guides|hash|catalog|manifest|index|memory/i;
const reMathPrefix = /^(math-|yuri-(energy|jaccard|mdl|minhash|phi)|formula-|nexus-numerology)/;
const CODE_EXT = /\.(mjs|js|cjs|ts|tsx|jsx|py|sh)$/;                    // .sh routes to Scripts when in-zone, else to bin

// the canonical zones + the ORDERED rules that place an artifact. First match wins (deterministic).
// Ordering law: most-specific path / pattern first; every sub-zone strictly BEFORE its parent; and every
// by-zone (already-resident) rule BEFORE the by-keyword rules, so a file already living correctly is never
// poached into a sibling zone by a name match. The fake-substring tests lock the segment-anchored membership.
export const ZONE_RULES = [
  { zone: 'EPHEMERAL', kind: 'scratch', test: (p, name) => p.startsWith('/tmp/') || isEphemeralName(name), note: 'temporary scratch — purge candidate, should not persist in the repo' },

  // --- config schemas (before registries and before research-data json) ---
  { zone: '_SYSTEM/config/schemas', kind: 'schema', test: (p, name) => /\.schema\.json$/.test(name) || (name.endsWith('.json') && /schema/.test(p)) },

  // --- 02_RESOURCES residents: lock by-zone first so keyword rules below never poach a correctly-placed file ---
  { zone: '02_RESOURCES/RESEARCH/_data', kind: 'research-data', test: (p, name, ext, rel) => name.endsWith('.json') && inZone(rel, '02_RESOURCES/RESEARCH') && rel.split('/').length === 3, note: 'loose json at the research-vault ROOT (nested project data stays put)' },
  { zone: '02_RESOURCES/KNOWLEDGE-BASE', kind: 'knowledge', test: (p, name, ext, rel) => name.endsWith('.md') && inZone(rel, '02_RESOURCES/KNOWLEDGE-BASE') },
  { zone: '02_RESOURCES/RESEARCH', kind: 'research', test: (p, name, ext, rel) => name.endsWith('.md') && inZone(rel, '02_RESOURCES/RESEARCH') },
  // skill-library residents lock by-zone BEFORE the content-keyword rules, so a skill-internal doc named
  // "spec-…"/"…-brief" is never poached into RESEARCH (it belongs with its skill).
  { zone: 'skills', kind: 'skill', test: (p, name, ext, rel) => inZone(rel, 'skills') },

  // --- _SYSTEM/docs sub-zones (strictly before the base docs rule) ---
  { zone: '_SYSTEM/docs/handoffs', kind: 'handoff', test: (p, name, ext, rel) => name.endsWith('.md') && (reHandoff.test(name) || inZone(rel, '_SYSTEM/docs/handoffs')) },
  { zone: '_SYSTEM/docs/token', kind: 'token-doc', test: (p, name, ext, rel) => name.endsWith('.md') && (reToken.test(name) || inZone(rel, '_SYSTEM/docs/token')) },
  { zone: '_SYSTEM/docs/cognition', kind: 'cognition-doc', test: (p, name, ext, rel) => name.endsWith('.md') && (reCognition.test(name) || inZone(rel, '_SYSTEM/docs/cognition')) },
  { zone: '_SYSTEM/docs', kind: 'doc', test: (p, name, ext, rel) => name.endsWith('.md') && inZone(rel, '_SYSTEM/docs') },

  // --- _SYSTEM/reports sub-zones (before base reports). Guarded against poaching 02_RESOURCES residents. ---
  { zone: '_SYSTEM/reports/html', kind: 'report-html', test: (p, name, ext, rel) => name.endsWith('.html') && (inZone(rel, '_SYSTEM/reports') || reReport.test(name)) },
  { zone: '_SYSTEM/reports/waves', kind: 'wave-report', test: (p, name, ext, rel) => name.endsWith('.md') && !inZone(rel, '02_RESOURCES') && (reWave.test(name) || inZone(rel, '_SYSTEM/reports/waves')) },
  { zone: '_SYSTEM/reports/papers', kind: 'paper', test: (p, name, ext, rel) => name.endsWith('.md') && !inZone(rel, '02_RESOURCES') && (rePaper.test(name) || inZone(rel, '_SYSTEM/reports/papers')) },
  { zone: '_SYSTEM/reports/audits', kind: 'audit-report', test: (p, name, ext, rel) => name.endsWith('.md') && !inZone(rel, '02_RESOURCES') && (reAudit.test(name) || inZone(rel, '_SYSTEM/reports/audits')) },
  { zone: '_SYSTEM/reports', kind: 'report', test: (p, name, ext, rel) => (name.endsWith('.html') || name.endsWith('.md')) && (inZone(rel, '_SYSTEM/reports') || reReport.test(name)) },

  // --- other _SYSTEM doc zones (by-zone; brand also by-name) ---
  { zone: '_SYSTEM/BRAND', kind: 'brand', test: (p, name, ext, rel) => name.endsWith('.md') && (inZone(rel, '_SYSTEM/BRAND') || reBrand.test(name)) },
  { zone: '_SYSTEM/learning', kind: 'learning', test: (p, name, ext, rel) => name.endsWith('.md') && inZone(rel, '_SYSTEM/learning') },
  { zone: '_SYSTEM/specs', kind: 'spec-doc', test: (p, name, ext, rel) => name.endsWith('.md') && inZone(rel, '_SYSTEM/specs') },
  { zone: '_SYSTEM/session-outputs', kind: 'session-output', test: (p, name, ext, rel) => name.endsWith('.md') && inZone(rel, '_SYSTEM/session-outputs') },
  { zone: '_SYSTEM/memory', kind: 'yuri-memory', test: (p, name, ext, rel) => name.endsWith('.md') && inZone(rel, '_SYSTEM/memory') },

  // --- research by-keyword: catch-all for loose research/spec/synthesis/brief .md anywhere outside the zones above ---
  { zone: '02_RESOURCES/RESEARCH', kind: 'research', test: (p, name) => name.endsWith('.md') && reResearch.test(name) },

  // --- code zones (math before scripts; bin standalone) ---
  { zone: '_SYSTEM/Scripts/math', kind: 'math-module', test: (p, name, ext, rel) => CODE_EXT.test(name) && (inZone(rel, '_SYSTEM/Scripts/math') || reMathPrefix.test(name)) },
  { zone: '_SYSTEM/Scripts', kind: 'script', test: (p, name, ext, rel) => CODE_EXT.test(name) && inZone(rel, '_SYSTEM/Scripts') },
  { zone: '_SYSTEM/bin', kind: 'bin', test: (p, name, ext, rel) => /\.(sh|zsh)$/.test(name) && (inZone(rel, '_SYSTEM/bin') || (rel.startsWith('_SYSTEM/') && rel.split('/').length === 2)) },

  // --- launchd plists, skills, then json registries + runtime state (state before config so state json isn't poached) ---
  { zone: '_SYSTEM/launchd', kind: 'launchd', test: (p, name) => name.endsWith('.plist') },
  { zone: 'skills', kind: 'skill', test: (p, name, ext, rel) => name.endsWith('.skill') && !/^\.(claude|codex|agents)\//.test(rel) },
  { zone: '_SYSTEM/state', kind: 'state/telemetry', test: (p, name, ext, rel) => name.endsWith('.jsonl') || (name.endsWith('.json') && inZone(rel, '_SYSTEM/state')) },
  { zone: '_SYSTEM/config', kind: 'config-registry', test: (p, name, ext, rel) => name.endsWith('.json') && (inZone(rel, '_SYSTEM/config') || (rel.startsWith('_SYSTEM/') && rel.split('/').length === 2 && reConfigJson.test(name))) },
];

export function classifyArtifact(filePath) {
  if (typeof filePath !== 'string' || !filePath) {
    // One malformed path should become an invalid row, not abort the whole filing report.
    return { kind: 'invalid', zone: null, reason: 'non-string or empty path — cannot classify' };
  }
  const rel = normalizePath(filePath);
  const name = path.basename(filePath);
  const ext = path.extname(name).toLowerCase();
  // PINNED canonical anchors are never relocated: classify to a null target with a clear reason so they can
  // never be flagged misplaced or pulled into a zone (the 3 @-includes are the load-bearing case).
  if (isPinned(filePath)) {
    return { kind: 'pinned', zone: null, pinned: true, fileType: fileTypeOf(name), reason: 'canonical anchor — pinned; never auto-relocated' };
  }
  const p = filePath.startsWith('/') ? filePath : '/' + rel; // keep /tmp absolute detectable
  for (const rule of ZONE_RULES) {
    // Zone membership must be segment-anchored; raw substring matching pulled fake sibling paths into real zones.
    if (rule.test(p, name, ext, rel)) return { kind: rule.kind, zone: rule.zone, fileType: fileTypeOf(name), reason: rule.note || `matched ${rule.kind} rule`, note: rule.note };
  }
  return { kind: 'unclassified', zone: null, fileType: fileTypeOf(name), reason: 'no zone rule matched — needs owner placement decision' };
}

// the distinct canonical zones (minus EPHEMERAL), sorted DEEPEST-first so a prefix scan returns the most
// specific match. Derived from ZONE_RULES so currentZoneOf can never drift out of sync with the placement rules.
export const CANONICAL_ZONES = [...new Set(ZONE_RULES.map((r) => r.zone).filter((z) => z !== 'EPHEMERAL'))]
  .sort((a, b) => b.split('/').length - a.split('/').length || b.length - a.length);

// which canonical zone a path CURRENTLY lives in (for the misplaced check). Deepest-match-wins.
function currentZoneOf(filePath) {
  const rel = normalizePath(filePath);
  if (filePath.startsWith('/tmp/')) return 'EPHEMERAL';
  return CANONICAL_ZONES.find((z) => rel === z || rel.startsWith(z + '/')) || (rel.split('/')[0] || 'root');
}

export function assess(filePath) {
  if (typeof filePath !== 'string' || !filePath) {
    return {
      path: String(filePath ?? ''),
      kind: 'invalid',
      currentZone: null,
      recommendedZone: null,
      misplaced: false,
      reason: 'non-string or empty path — cannot classify',
    };
  }
  // PROTECTED VETO (fail closed): a protected/secret path is NEVER recommended for relocation or purge, even if a
  // zone rule would otherwise match (e.g. '.env.bak' matches the EPHEMERAL .bak rule; '.claude/state/*.json' looks
  // "misplaced"). Walking a protected/secret file out of its zone — or purging a secret backup — is the failure
  // this assessor must not commit. isProtectedPath is traversal-hardened, so '../'-escapes are caught too.
  if (isProtectedPath(filePath)) {
    return {
      path: normalizePath(filePath),
      kind: 'protected',
      currentZone: currentZoneOf(filePath),
      recommendedZone: null,
      misplaced: false,
      protected: true,
      reason: 'protected/secret path — never auto-relocated or purged; owner-only',
    };
  }
  // PINNED VETO: canonical anchors stay exactly where they are. recommendedZone = currentZone, never misplaced.
  if (isPinned(filePath)) {
    const cur = currentZoneOf(filePath);
    return {
      path: normalizePath(filePath),
      kind: 'pinned',
      currentZone: cur,
      recommendedZone: cur,
      misplaced: false,
      pinned: true,
      fileType: fileTypeOf(path.basename(filePath)),
      reason: 'canonical anchor — pinned; never auto-relocated or purged',
    };
  }
  const c = classifyArtifact(filePath);
  const current = currentZoneOf(filePath);
  // SETTLED SUPPRESSION: a file already nested in a curated home is not "misplaced" even if a keyword/ext rule
  // would route its TYPE elsewhere. This keeps the sweep on genuinely-loose pools and off provider/project dirs.
  const settled = isSettled(filePath);
  const misplaced = !settled && c.zone !== null && c.zone !== current && !(c.zone === 'EPHEMERAL' && current === 'EPHEMERAL');
  return {
    path: normalizePath(filePath), kind: c.kind, currentZone: current, recommendedZone: c.zone, misplaced, settled,
    fileType: c.fileType, reason: settled && c.zone !== current ? `settled in a curated home (${current}) — classified ${c.kind} but not swept` : c.reason,
  };
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
    protectedHeld: rows.filter((r) => r.protected).map((r) => r.path),
    rows,
    advisory_only: true,
    note: 'READ-ONLY assessment. Relocation/purge is owner-gated — this report is what the owner acts on.',
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
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
