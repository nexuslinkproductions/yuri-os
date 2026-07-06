#!/usr/bin/env node
/**
 * nexus-guard-autowire.mjs — PHASE 2 writer for Regenerative Nexus Guard.
 *
 * Detector stays read-only. This writer consumes the detector report and scaffolds only the safe,
 * deterministic wiring proposals. Canonical manual/graph surfaces are proposal-only; command shims
 * may be written only with --apply-shims and are never overwritten.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { isProtectedRel, loadContract, run as runDetector } from './regenerative-nexus-guard.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');
const DEFAULT_REPORT_REL = '02_RESOURCES/RESEARCH/nexus-guard-report.json';
const DEFAULT_PROPOSAL_REL = '02_RESOURCES/RESEARCH/nexus-guard-autowire-proposals.md';

function toRel(p) {
  return p.split(path.sep).join('/');
}

function normalizeRel(rel) {
  return toRel(path.normalize(rel)).replace(/^(\.\/)+/, '');
}

function assertWritableRel(rel) {
  const n = normalizeRel(rel);
  if (path.isAbsolute(rel) || n === '..' || n.startsWith('../') || isProtectedRel(n)) {
    throw new Error(`refusing protected/out-of-repo write: ${rel}`);
  }
  return n;
}

function absForRel(rel) {
  const n = assertWritableRel(rel);
  const abs = path.join(REPO_ROOT, n);
  const realRoot = fs.realpathSync(REPO_ROOT);
  const parent = path.dirname(abs);
  let realParent;
  try { realParent = fs.realpathSync(parent); } catch { realParent = parent; }
  if (realParent !== realRoot && !realParent.startsWith(realRoot + path.sep)) {
    throw new Error(`write escapes repo: ${rel}`);
  }
  return abs;
}

function readRepoText(rel) {
  const n = normalizeRel(rel);
  if (path.isAbsolute(rel) || n === '..' || n.startsWith('../') || isProtectedRel(n)) return '';
  const abs = path.join(REPO_ROOT, n);
  try { return fs.readFileSync(abs, 'utf8'); } catch { return ''; }
}

function humanizeSlug(slug) {
  return String(slug || '')
    .replace(/\.mjs$/, '')
    .replace(/[-_]+/g, ' ')
    .replace(/\b\w/g, (m) => m.toUpperCase());
}

function graphIdForRel(rel) {
  const base = path.basename(rel, path.extname(rel));
  return base.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'module';
}

export function extractHeaderDoc(src) {
  const m = String(src || '').match(/\/\*\*([\s\S]*?)\*\//);
  if (!m) return '';
  return m[1]
    .split('\n')
    .map((line) => line.replace(/^\s*\*\s?/, '').trim())
    .filter(Boolean)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function extractExportNames(src) {
  const names = new Set();
  const text = String(src || '');
  for (const line of text.split('\n')) {
    let m = line.match(/^\s*export\s+(?:async\s+)?(?:function\*?|const|let|var|class)\s+([A-Za-z_$][\w$]*)/);
    if (m) names.add(m[1]);
    m = line.match(/^\s*export\s*\{([^}]*)\}/);
    if (m) {
      for (const part of m[1].split(',')) {
        const name = part.trim().split(/\s+as\s+/)[0].trim();
        if (/^[A-Za-z_$][\w$]*$/.test(name)) names.add(name);
      }
    }
  }
  return [...names].sort();
}

export function buildCommandShimContent({ alias, skill }) {
  const safeAlias = String(alias || '').trim().toLowerCase();
  const safeSkill = String(skill || '').trim();
  if (!/^[a-z0-9][a-z0-9-]*$/.test(safeAlias)) throw new Error(`invalid alias: ${alias}`);
  if (!/^[A-Za-z0-9][A-Za-z0-9_.-]*$/.test(safeSkill)) throw new Error(`invalid skill: ${skill}`);
  return [
    '---',
    `skill: ${safeSkill}`,
    '---',
    '',
    `Invoke the \`${safeSkill}\` skill. Usage: \`/${safeAlias}\`.`,
    '',
  ].join('\n');
}

export function buildManualEntry({ rel, src = '' }) {
  const base = path.basename(rel);
  const slug = path.basename(rel, '.mjs');
  const exports = extractExportNames(src);
  const doc = extractHeaderDoc(src);
  const title = humanizeSlug(slug);
  return {
    rel,
    text: [
      `### ${title} — registry stub`,
      `- **Does:** TODO owner-classify the method and replace this stub. Source header: ${doc || 'No module header doc-comment found.'}`,
      '- **Math:** TODO document deterministic mechanism, assumptions, thresholds, and fail-closed behavior.',
      `- **Code:** \`${rel}\`${exports.length ? ` (exports: ${exports.join(', ')})` : ' (exports: none detected)'}.`,
      '- **Proof:** TODO link unit/proof harness and cold-run evidence before promotion.',
      '- **Sources:** TODO link science-source-ledger IDs or mark internal engineering primitive.',
      '- **Residual:** Owner-gated registry stub emitted by nexus-guard-autowire; not canonical until manually reviewed.',
      '',
    ].join('\n'),
    meta: { base, title, exports, hasHeaderDoc: Boolean(doc) },
  };
}

export function buildGraphNodeStub({ rel, src = '', sourceClasses = [] }) {
  const id = graphIdForRel(rel);
  const base = path.basename(rel);
  const title = humanizeSlug(base);
  const exports = extractExportNames(src);
  const doc = extractHeaderDoc(src);
  return {
    id,
    label: `${title} (registry stub)`,
    layer: 'Energy & Math',
    files: [rel],
    triggeredBy: 'proposal-only — owner must classify import/CLI/hook trigger before graph merge',
    description: [
      `${base} was flagged by nexus-guard class ${sourceClasses.sort().join('+') || 'G'} as built-but-unwired.`,
      doc ? `Header: ${doc}` : 'No module header doc-comment found.',
      exports.length ? `Detected exports: ${exports.join(', ')}.` : 'No exports detected.',
      'Add-only graph stub; review trigger, edges, and description before canonical merge.',
    ].join(' '),
  };
}

export function buildProposals(report) {
  const shims = [];
  const seenShimTargets = new Set();
  for (const wire of report.safeAutoWire || []) {
    if (wire.kind !== 'missing-command-shim') continue;
    const target = assertWritableRel(wire.target);
    if (seenShimTargets.has(target)) continue;
    seenShimTargets.add(target);
    shims.push({
      kind: wire.kind,
      target,
      alias: wire.alias,
      skill: wire.skill,
      exists: fs.existsSync(path.join(REPO_ROOT, target)),
      content: buildCommandShimContent(wire),
    });
  }

  const math = [];
  const graphByRel = new Map();
  for (const finding of report.findings || []) {
    const rel = String(finding.artifact || '').split(':')[0];
    if (!rel.endsWith('.mjs')) continue;
    if (finding.cls === 'D') {
      const src = readRepoText(rel);
      math.push({ artifact: rel, entry: buildManualEntry({ rel, src }) });
      if (!graphByRel.has(rel)) graphByRel.set(rel, { rel, classes: new Set() });
      graphByRel.get(rel).classes.add('D');
    }
    if (finding.cls === 'G') {
      if (!graphByRel.has(rel)) graphByRel.set(rel, { rel, classes: new Set() });
      graphByRel.get(rel).classes.add('G');
    }
  }

  const graph = [...graphByRel.values()].sort((a, b) => a.rel.localeCompare(b.rel)).map(({ rel, classes }) => {
    const src = readRepoText(rel);
    return { artifact: rel, node: buildGraphNodeStub({ rel, src, sourceClasses: [...classes] }) };
  });

  math.sort((a, b) => a.artifact.localeCompare(b.artifact));
  shims.sort((a, b) => a.target.localeCompare(b.target));

  return { shims, math, graph };
}

export function renderProposalMarkdown({ report, proposals, generatedAt = null }) {
  const stamp = generatedAt || 'NO_CLOCK_CORE';
  const lines = [
    '---',
    'name: nexus-guard-autowire-proposals',
    'description: Dry-run proposals emitted by nexus-guard-autowire.mjs; canonical manual/graph writes remain owner-gated.',
    '---',
    '',
    '# Nexus Guard Autowire Proposals',
    '',
    `Generated: ${stamp}`,
    `Detector phase: ${report.phase || 'unknown'}`,
    `Detector findings: ${report.summary?.total ?? 'unknown'}`,
    '',
    '## Summary',
    '',
    `- Command shims: ${proposals.shims.length}`,
    `- Math registry stubs: ${proposals.math.length}`,
    `- Graph node stubs: ${proposals.graph.length}`,
    '',
    '## Command Shim Proposals',
    '',
  ];

  if (!proposals.shims.length) lines.push('_None._', '');
  for (const shim of proposals.shims) {
    lines.push(`### /${shim.alias} -> ${shim.skill}`, '');
    lines.push(`- Target: \`${shim.target}\``);
    lines.push(`- Existing file: ${shim.exists ? 'yes (will not overwrite)' : 'no'}`);
    lines.push('');
    lines.push('```md');
    lines.push(shim.content.trimEnd());
    lines.push('```', '');
  }

  lines.push('## Math Manual Registry Stubs', '');
  if (!proposals.math.length) lines.push('_None._', '');
  for (const item of proposals.math) {
    lines.push(`<!-- artifact: ${item.artifact} -->`);
    lines.push(item.entry.text.trimEnd(), '');
  }

  lines.push('## Circuitry Graph Node Stubs', '');
  if (!proposals.graph.length) lines.push('_None._', '');
  for (const item of proposals.graph) {
    lines.push(`### ${item.node.id}`, '');
    lines.push('```json');
    lines.push(JSON.stringify(item.node, null, 2));
    lines.push('```', '');
  }

  lines.push('## Owner Gate', '');
  lines.push('- This dry run did not write canonical manual or graph surfaces.');
  lines.push('- Command shims are written only with `--apply-shims` and only when the target file is absent.');
  lines.push('');
  return lines.join('\n');
}

export function applyCommandShims(shims) {
  const written = [];
  const skipped = [];
  for (const shim of shims) {
    const abs = absForRel(shim.target);
    if (fs.existsSync(abs)) {
      skipped.push({ target: shim.target, reason: 'exists' });
      continue;
    }
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, shim.content, { flag: 'wx' });
    written.push({ target: shim.target });
  }
  return { written, skipped };
}

export function loadDetectorReport({ reportRel = DEFAULT_REPORT_REL, fresh = false } = {}) {
  if (!fresh) {
    const src = readRepoText(reportRel);
    if (src) {
      try { return JSON.parse(src); } catch { /* fall through to fresh detector run */ }
    }
  }
  return runDetector({ now: null });
}

export function runAutowire({ applyShims = false, proposalRel = DEFAULT_PROPOSAL_REL, reportRel = DEFAULT_REPORT_REL, fresh = false, generatedAt = null, report = null } = {}) {
  const contract = loadContract();
  const detectorReport = report || loadDetectorReport({ reportRel, fresh });
  const proposals = buildProposals(detectorReport);
  const markdown = renderProposalMarkdown({ report: detectorReport, proposals, generatedAt });
  const proposalAbs = absForRel(proposalRel);
  fs.mkdirSync(path.dirname(proposalAbs), { recursive: true });
  fs.writeFileSync(proposalAbs, markdown);
  const shimApply = applyShims ? applyCommandShims(proposals.shims) : { written: [], skipped: proposals.shims.map((s) => ({ target: s.target, reason: 'dry-run' })) };
  return {
    proposalRel: normalizeRel(proposalRel),
    contractVersion: contract.version,
    counts: { shims: proposals.shims.length, math: proposals.math.length, graph: proposals.graph.length },
    applyShims,
    shimApply,
  };
}

function parseArgs(argv) {
  const out = { applyShims: false, proposalRel: DEFAULT_PROPOSAL_REL, reportRel: DEFAULT_REPORT_REL, fresh: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--apply-shims') out.applyShims = true;
    else if (a === '--out') out.proposalRel = argv[++i];
    else if (a === '--report') out.reportRel = argv[++i];
    else if (a === '--fresh') out.fresh = true;
    else if (a === '--help' || a === '-h') out.help = true;
    else throw new Error(`unknown argument: ${a}`);
  }
  return out;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const args = parseArgs(process.argv.slice(2));
    if (args.help) {
      console.log('usage: node _SYSTEM/Scripts/nexus-guard-autowire.mjs [--apply-shims] [--out <proposal.md>] [--report <report.json>] [--fresh]');
      process.exit(0);
    }
    const result = runAutowire({ ...args, generatedAt: new Date().toISOString() });
    console.log(JSON.stringify({ ok: true, ...result }, null, 2));
  } catch (e) {
    console.error(`nexus-guard-autowire: ${e.message}`);
    process.exit(1);
  }
}
