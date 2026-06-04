#!/usr/bin/env node
/**
 * xref-drift-scan.mjs — mechanize the continuity law as a READ-ONLY drift detector.
 *
 * The continuity law ([[circuitry-change-propagation-continuity]]) says any change must
 * propagate to graph+viz+manual+reverify+reindex — but it has been a MEMORY RULE with
 * zero executable enforcement, so the circuitry graph can silently rot against live code.
 *
 * This script SURFACES that rot, fail-LOUD, without fixing it. For each circuitry node in
 * 02_RESOURCES/RESEARCH/yuri-circuitry-graph.json it checks:
 *   (a) FILE EXISTENCE   — every path in node.files resolves on disk (catches phantoms /
 *                          moved files). Honors a PHANTOM_OK allowlist for intentional
 *                          files:[] nodes, and asserts those stay empty (a phantom that
 *                          suddenly grows files is itself drift).
 *   (b) STALE path:line  — if a file ref carries a :line (or :start-end) suffix, the file
 *                          must exist AND have at least that many lines (defensive: current
 *                          graph data carries no line suffixes, but the law is about seams
 *                          and future graph data may pin lines).
 *   (c) GITNEXUS STALE   — compares the gitnexus-indexed commit (cached marker
 *                          .gitnexus/meta.json) against `git rev-parse HEAD`; a stale index
 *                          means low-confidence structural hits. Fail-soft if unavailable.
 *   (d) CLAIM DRIFT      — bounded: if a node's triggeredBy/description quotes a concrete
 *                          trigger/symbol string AND the node has files, grep the first file
 *                          for it; emit MATCH (present) or advisory DRIFT (absent).
 *
 * It is READ-ONLY. It NEVER writes the graph, graph-state.json, any protected path, and it
 * NEVER auto-reindexes — it only reports staleness. Exit code is 0 (advisory) unless
 * --strict is passed, in which case any DRIFT yields a nonzero exit for CI / EOT gating.
 *
 * Usage:
 *   node _SYSTEM/Scripts/xref-drift-scan.mjs
 *   node _SYSTEM/Scripts/xref-drift-scan.mjs --json
 *   node _SYSTEM/Scripts/xref-drift-scan.mjs --strict     # nonzero exit on any DRIFT
 *
 * Modeled on the in-repo idiom of yuri-search.mjs (REPO_ROOT resolve, --json/--top flags,
 * CLI guard) and the {repoRoot}-override testability of claim-integrity-gate.mjs.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_REPO_ROOT = path.resolve(__dirname, '../..');
const DEFAULT_GRAPH_REL = path.join('02_RESOURCES', 'RESEARCH', 'yuri-circuitry-graph.json');
const GITNEXUS_META_REL = path.join('.gitnexus', 'meta.json');

// Intentional phantom nodes — known to carry files:[] on purpose. These are NOT flagged as
// drift for being empty, but ARE flagged if they ever grow a non-empty files[] (that means
// someone wired them without updating the allowlist — itself a continuity-law violation).
const PHANTOM_OK = new Set(['cross-domain-transfer-engine']);

// Parse an optional ":line" or ":start-end" suffix off a file ref. Returns {filePath, line}.
// A bare path returns line=null. A trailing "*" glob is left intact (no line suffix).
export function parseFileRef(rawRef) {
  const ref = String(rawRef || '').trim();
  // Match a trailing :N or :N-M that is NOT part of a path (no slash after the colon).
  const m = ref.match(/^(.*?):(\d+)(?:-(\d+))?$/);
  if (m && !m[1].endsWith('/') && m[1].length > 0) {
    const start = parseInt(m[2], 10);
    const end = m[3] ? parseInt(m[3], 10) : start;
    return { filePath: m[1], line: start, lineEnd: end, hasLine: true };
  }
  return { filePath: ref, line: null, lineEnd: null, hasLine: false };
}

// Resolve a file ref (possibly a glob) to absolute matches. Two anchor classes exist in the
// graph: repo-relative seams, and deliberate home-anchored seams (LaunchAgent plists in
// ~/Library, global Claude hooks in ~/.claude). A leading "~/" is expanded to $HOME and
// allowed — those are real out-of-repo seams the graph legitimately tracks. Everything else
// is anchored to repoRoot and HARDENED: a "../" traversal that escapes repoRoot is refused
// (treated as missing, not resolved outside). homeRoot is overridable for tests.
function resolveRef(repoRoot, filePath, homeRoot) {
  if (!filePath) return [];
  const home = homeRoot || os.homedir();

  // Home-anchored seam: expand ~/ and anchor under $HOME (not repoRoot).
  const isHome = filePath === '~' || filePath.startsWith('~/');
  const baseRoot = isHome ? home : repoRoot;
  const relPath = isHome ? filePath.replace(/^~\/?/, '') : filePath;
  const abs = relPath ? path.resolve(baseRoot, relPath) : baseRoot;
  const rootWithSep = baseRoot.endsWith(path.sep) ? baseRoot : baseRoot + path.sep;

  // Glob (single-segment * only, matching the one *.json ref in the graph). Anything fancier
  // is treated as a literal path (existence check will simply fail — fail-loud, not silent).
  if (filePath.includes('*')) {
    const dir = path.dirname(abs);
    const pattern = path.basename(abs);
    const dirAbs = path.resolve(dir);
    if (dirAbs !== baseRoot && !dirAbs.startsWith(rootWithSep)) return [];
    if (!fs.existsSync(dirAbs) || !fs.statSync(dirAbs).isDirectory()) return [];
    const rx = new RegExp('^' + pattern.split('*').map(escapeRegex).join('.*') + '$');
    return fs.readdirSync(dirAbs)
      .filter((name) => rx.test(name))
      .map((name) => path.join(dirAbs, name));
  }
  // Non-glob: containment guard against path traversal escaping the chosen anchor root.
  if (abs !== baseRoot && !abs.startsWith(rootWithSep)) return [];
  return fs.existsSync(abs) ? [abs] : [];
}

function escapeRegex(s) {
  return s.replace(/[.+?^${}()|[\]\\]/g, '\\$&');
}

function countLines(absPath) {
  try {
    const txt = fs.readFileSync(absPath, 'utf8');
    if (txt.length === 0) return 0;
    // Lines = number of newlines + 1 if the file does not end with a newline; a file ending
    // in \n has exactly (newline count) lines of content addressable by 1..N.
    const nl = (txt.match(/\n/g) || []).length;
    return txt.endsWith('\n') ? nl : nl + 1;
  } catch {
    return -1;
  }
}

// Pull the first quoted string out of a node's triggeredBy/description for bounded claim
// re-derivation. We only trust backtick or double-quote delimited tokens that look like a
// file/symbol/trigger (no spaces, has a dot or slash or is a CONSTANT_CASE token).
function extractClaimToken(node) {
  const hay = `${node.triggeredBy || ''} ${node.description || ''}`;
  const candidates = [...hay.matchAll(/`([^`]+)`|"([^"]+)"/g)].map((m) => m[1] || m[2]);
  for (const c of candidates) {
    const tok = c.trim();
    if (!tok || /\s/.test(tok)) continue;
    // Accept a token that looks like a file/symbol/trigger:
    //   - has a dot or slash (path / member access), OR
    //   - is CONSTANT_CASE (>=3 chars), OR
    //   - is a camelCase / PascalCase identifier (>=4 chars, mixes case), OR
    //   - is a snake_case identifier (>=4 chars).
    if (
      /[./]/.test(tok) ||
      /^[A-Z][A-Z0-9_]{2,}$/.test(tok) ||
      (/^[A-Za-z_][A-Za-z0-9_]{3,}$/.test(tok) && (/[a-z]/.test(tok) && /[A-Z]/.test(tok) || tok.includes('_')))
    ) {
      return tok;
    }
  }
  return null;
}

// Read the gitnexus-indexed commit from the cached marker and compare to HEAD.
// Fail-soft: any missing marker / git failure yields {available:false} with no throw.
export function gitnexusStaleness({ repoRoot }) {
  const metaPath = path.join(repoRoot, GITNEXUS_META_REL);
  let indexedCommit = null;
  try {
    if (fs.existsSync(metaPath)) {
      const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
      indexedCommit = meta.lastCommit || meta.indexedCommit || null;
    }
  } catch {
    indexedCommit = null;
  }
  if (!indexedCommit) return { available: false, reason: 'no .gitnexus/meta.json marker' };

  let head = null;
  try {
    head = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repoRoot, encoding: 'utf8' }).trim();
  } catch {
    return { available: false, reason: 'git rev-parse failed', indexedCommit };
  }
  if (!head) return { available: false, reason: 'empty HEAD', indexedCommit };

  if (head === indexedCommit) return { available: true, stale: false, behind: 0, indexedCommit, head };

  let behind = null;
  try {
    const out = execFileSync('git', ['rev-list', '--count', `${indexedCommit}..HEAD`], {
      cwd: repoRoot, encoding: 'utf8',
    }).trim();
    behind = parseInt(out, 10);
    if (!Number.isFinite(behind)) behind = null;
  } catch {
    // Indexed commit unknown to this repo (e.g. detached fixture) — stale but delta unknown.
    behind = null;
  }
  return { available: true, stale: true, behind, indexedCommit, head };
}

export function scanDrift(opts = {}) {
  const repoRoot = opts.repoRoot || DEFAULT_REPO_ROOT;
  const graphPath = opts.graphPath || path.join(repoRoot, DEFAULT_GRAPH_REL);
  const phantomOk = opts.phantomOk || PHANTOM_OK;
  const checkGitnexus = opts.checkGitnexus !== false;
  const checkClaims = opts.checkClaims !== false;
  const homeRoot = opts.homeRoot || os.homedir();

  const report = {
    ok: true,
    graphPath,
    nodes: 0,
    pass: 0,
    drift: 0,
    lines: [],     // Evidence Contract grammar lines (deterministic, machine-parseable)
    findings: [],  // structured per-node findings
    gitnexus: null,
  };

  if (!fs.existsSync(graphPath)) {
    report.ok = false;
    report.error = `graph not found: ${graphPath}`;
    report.lines.push(`XREF_DRIFT error="graph not found" path=${graphPath}`);
    return report;
  }

  let graph;
  try {
    graph = JSON.parse(fs.readFileSync(graphPath, 'utf8'));
  } catch (err) {
    report.ok = false;
    report.error = `graph parse failed: ${err.message}`;
    report.lines.push(`XREF_DRIFT error="graph parse failed"`);
    return report;
  }

  const nodes = Array.isArray(graph.nodes) ? graph.nodes : [];
  report.nodes = nodes.length;

  for (const node of nodes) {
    const id = node && node.id ? String(node.id) : '<no-id>';
    const files = Array.isArray(node.files) ? node.files : [];
    let nodeDrift = false;
    const finding = { id, missing: [], staleLine: [], phantom: false, claim: null };

    // (a) phantom allowlist handling
    if (phantomOk.has(id)) {
      finding.phantom = true;
      if (files.length > 0) {
        // An intentional phantom that grew files is itself drift.
        nodeDrift = true;
        report.lines.push(`XREF_DRIFT node=${id} reason="phantom grew files" count=${files.length}`);
        finding.phantomGrewFiles = true;
      } else {
        report.lines.push(`FILE_COUNT node=${id} file=<phantom> count=0 phantomOk=true`);
      }
    }

    // (a/b) file existence + stale path:line — skipped for an empty intentional phantom
    if (!(finding.phantom && files.length === 0)) {
      for (const ref of files) {
        const { filePath, line, lineEnd, hasLine } = parseFileRef(ref);
        const matches = resolveRef(repoRoot, filePath, homeRoot);
        const present = matches.length > 0 ? 1 : 0;
        report.lines.push(`FILE_COUNT node=${id} file=${filePath} count=${present}`);
        if (!present) {
          nodeDrift = true;
          finding.missing.push(ref);
          continue;
        }
        if (hasLine) {
          // Verify the seam line still exists (file long enough). Use the first match.
          const lines = countLines(matches[0]);
          const need = lineEnd || line;
          if (lines >= 0 && lines < need) {
            nodeDrift = true;
            finding.staleLine.push({ ref, fileLines: lines, need });
            report.lines.push(`XREF_DRIFT node=${id} file=${filePath} reason="stale path:line" need=${need} fileLines=${lines}`);
          } else {
            report.lines.push(`MATCH node=${id} file=${filePath} term=line line=${need}`);
          }
        }
      }
    }

    // (d) bounded claim re-derivation
    if (checkClaims && files.length > 0 && !finding.phantom) {
      const tok = extractClaimToken(node);
      if (tok) {
        const { filePath } = parseFileRef(files[0]);
        const matches = resolveRef(repoRoot, filePath, homeRoot);
        if (matches.length > 0) {
          let found = false;
          let hitLine = -1;
          try {
            const txt = fs.readFileSync(matches[0], 'utf8').split('\n');
            for (let i = 0; i < txt.length; i += 1) {
              if (txt[i].includes(tok)) { found = true; hitLine = i + 1; break; }
            }
          } catch { /* fail-soft */ }
          finding.claim = { token: tok, file: filePath, found };
          if (found) {
            report.lines.push(`MATCH node=${id} file=${filePath} term=${tok} line=${hitLine}`);
          } else {
            // Advisory only — a quoted token not literally present is a soft signal, not a
            // hard missing-seam. Do NOT escalate to nodeDrift; surface it for the operator.
            report.lines.push(`CLAIM_ADVISORY node=${id} file=${filePath} term=${tok} found=0`);
          }
        }
      }
    }

    if (nodeDrift) {
      report.drift += 1;
      report.findings.push(finding);
    } else {
      report.pass += 1;
    }
  }

  // (c) gitnexus staleness — one WARN line, advisory
  if (checkGitnexus) {
    const gx = gitnexusStaleness({ repoRoot });
    report.gitnexus = gx;
    if (gx.available && gx.stale) {
      const n = gx.behind == null ? '?' : gx.behind;
      report.lines.push(`GITNEXUS_STALE commits=${n} indexed=${(gx.indexedCommit || '').slice(0, 8)} head=${(gx.head || '').slice(0, 8)}`);
    } else if (gx.available && !gx.stale) {
      report.lines.push(`GITNEXUS_FRESH indexed=${(gx.indexedCommit || '').slice(0, 8)}`);
    } else {
      report.lines.push(`GITNEXUS_UNAVAILABLE reason="${gx.reason}"`);
    }
  }

  report.ok = report.drift === 0;
  report.lines.push(`XREF_DRIFT summary nodes=${report.nodes} pass=${report.pass} drift=${report.drift}`);
  return report;
}

function run() {
  const argv = process.argv.slice(2);
  const json = argv.includes('--json');
  const strict = argv.includes('--strict');

  const report = scanDrift({});

  if (json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    for (const line of report.lines) console.log(line);
  }

  // Advisory by default (exit 0 even with drift). --strict makes drift a hard failure.
  if (strict && report.drift > 0) process.exitCode = 2;
  else if (report.error) process.exitCode = strict ? 2 : 0;
  else process.exitCode = 0;
}

if (import.meta.url === `file://${process.argv[1]}`) run();
