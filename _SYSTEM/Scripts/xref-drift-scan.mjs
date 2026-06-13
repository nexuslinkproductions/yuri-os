#!/usr/bin/env node
// @capability: xref-drift-staleness
// @serves: staleness | drift detection | per-file content hash | index behind HEAD | stale seam | reconcile indexed commit | gitnexus stale
// @does: READ-ONLY continuity-law drift detector + per-file content-hash staleness reconciliation (committed-drift default, working-tree opt-in) between the gitnexus-indexed commit and HEAD.
// @use: Reach for this before building any staleness/drift/index-freshness detector over the circuitry graph or query corpus; computeFileStaleSet gives the per-file stale set a consumer can banner.
// @exports: scanDrift, computeFileStaleSet, gitnexusStaleness, parseFileRef
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
 *   node _SYSTEM/Scripts/xref-drift-scan.mjs --strict        # nonzero exit on any DRIFT
 *   node _SYSTEM/Scripts/xref-drift-scan.mjs --file-stale     # per-file content-hash staleness (committed-drift)
 *   node _SYSTEM/Scripts/xref-drift-scan.mjs --file-stale --working-tree  # + uncommitted union (opt-in)
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
    // wave-2 R.15: bounded — a hung git (lock, network mount) must not block
    // the whole xref query. Timeout → indeterminate → fail-closed (stale).
    head = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repoRoot, encoding: 'utf8', timeout: 5000 }).trim();
  } catch (err) {
    const reason = err && err.code === 'ETIMEDOUT' ? 'git-timeout' : 'git rev-parse failed';
    return { available: false, reason, indexedCommit };
  }
  if (!head) return { available: false, reason: 'empty HEAD', indexedCommit };

  if (head === indexedCommit) return { available: true, stale: false, behind: 0, indexedCommit, head };

  let behind = null;
  try {
    const out = execFileSync('git', ['rev-list', '--count', `${indexedCommit}..HEAD`], {
      cwd: repoRoot, encoding: 'utf8', timeout: 5000,
    }).trim();
    behind = parseInt(out, 10);
    if (!Number.isFinite(behind)) behind = null;
  } catch (err) {
    // wave-2 R.15: timeout → indeterminate, surface it (fail-closed downstream).
    if (err && err.code === 'ETIMEDOUT') return { available: false, reason: 'git-timeout', indexedCommit };
    // Indexed commit unknown to this repo (e.g. detached fixture) — stale but delta unknown.
    behind = null;
  }
  return { available: true, stale: true, behind, indexedCommit, head };
}

// Normalize a repo-relative path for the stale set: forward slashes, no leading "./".
// Git already emits repo-relative forward-slash paths, but a caller may pass an absolute path.
function normalizeRel(repoRoot, p) {
  if (!p) return p;
  let rel = String(p);
  if (path.isAbsolute(rel) && rel.startsWith(repoRoot)) rel = path.relative(repoRoot, rel);
  return rel.split(path.sep).join('/').replace(/^\.\//, '');
}

// Run a bounded git command in repoRoot. Returns { ok, out } — NEVER throws. A timeout / non-git
// dir / unknown commit yields { ok:false } so the caller fails-closed (treats the result as
// indeterminate) rather than silently producing an empty "nothing is stale" answer.
function gitCmd(repoRoot, args) {
  try {
    const out = execFileSync('git', args, { cwd: repoRoot, encoding: 'utf8', timeout: 5000 });
    return { ok: true, out };
  } catch (err) {
    return { ok: false, reason: err && err.code === 'ETIMEDOUT' ? 'git-timeout' : 'git-failed' };
  }
}

/**
 * computeFileStaleSet — per-file CONTENT reconciliation between the gitnexus-indexed commit and the
 * working state. Returns the set of repo-relative paths that have CHANGED since the index was built,
 * so a consumer (xref-query) can warn that a SPECIFIC FILE (not just the whole index) is behind.
 *
 * SCOPE (the load-bearing default, per the staleness-extension build contract):
 *   - DEFAULT (`includeWorkingTree:false`)  -> COMMITTED-DRIFT ONLY: `git diff --name-only
 *       <indexedCommit>..HEAD`. This is the only sound default in this repo: the LIVE working tree
 *       carries ~220 dirty files (INCLUDING xref-drift-scan.mjs itself), so unioning the working
 *       tree in would mark almost everything stale and SELF-DEFEAT any decisive test (the file under
 *       test is always "dirty against itself"). Committed drift is precise + reproducible: "the
 *       file's COMMITTED content changed after the index was cut."
 *   - OPT-IN (`includeWorkingTree:true`)     -> additionally unions uncommitted change: staged
 *       (`git diff --name-only --cached`), unstaged (`git diff --name-only`), and untracked
 *       (`git ls-files --others --exclude-standard`). Use only against a CONTROLLED tree.
 *
 * CONTENT-HASH layer: a name appearing in the committed diff is the primary signal. For a file the
 * diff did NOT list but whose blob the caller wants verified (the `verifyPaths` set, e.g. a node's
 * files), we compare the indexed-commit blob hash (`git rev-parse <indexedCommit>:<path>`) to the
 * current on-disk hash (`git hash-object <path>`). A mismatch is content drift even if the name-diff
 * missed it. This makes the reconciliation per-file CONTENT, not just a name list. The hash leg is
 * bounded to `verifyPaths` (O(node-files)), never a whole-tree hash sweep.
 *
 * FAIL-CLOSED: if the indexed commit is missing/unknown to the repo, or the committed-diff git call
 * fails, returns { available:false } with an empty set + a reason — the consumer must NOT read "no
 * stale files" as proven-fresh (an absent signal is not a fresh signal).
 *
 * @param {object} opts
 * @param {string} opts.repoRoot
 * @param {string} [opts.indexedCommit]      defaults to the .gitnexus marker commit
 * @param {boolean} [opts.includeWorkingTree=false]  OPT-IN working-tree union (default OFF)
 * @param {string[]} [opts.verifyPaths]      repo-relative files to additionally content-hash verify
 * @returns {{available:boolean, includeWorkingTree:boolean, indexedCommit:(string|null), staleFiles:string[], reason?:string}}
 */
export function computeFileStaleSet(opts = {}) {
  const repoRoot = opts.repoRoot || DEFAULT_REPO_ROOT;
  const includeWorkingTree = opts.includeWorkingTree === true;
  const verifyPaths = Array.isArray(opts.verifyPaths) ? opts.verifyPaths : [];

  // Resolve the indexed commit: explicit override, else the gitnexus marker.
  let indexedCommit = opts.indexedCommit || null;
  if (!indexedCommit) {
    const metaPath = path.join(repoRoot, GITNEXUS_META_REL);
    try {
      if (fs.existsSync(metaPath)) {
        const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
        indexedCommit = meta.lastCommit || meta.indexedCommit || null;
      }
    } catch { indexedCommit = null; }
  }
  if (!indexedCommit) {
    return { available: false, includeWorkingTree, indexedCommit: null, staleFiles: [], reason: 'no indexed commit (marker absent)' };
  }

  // Verify the indexed commit is known to THIS repo before diffing against it (a marker pinned to a
  // commit foreign to the repo — e.g. a detached fixture — must fail-closed, not silently empty).
  const known = gitCmd(repoRoot, ['cat-file', '-e', `${indexedCommit}^{commit}`]);
  if (!known.ok) {
    return { available: false, includeWorkingTree, indexedCommit, staleFiles: [], reason: 'indexed commit unknown to repo' };
  }

  const stale = new Set();

  // (1) committed drift: indexedCommit..HEAD (ALWAYS — the default signal).
  const committed = gitCmd(repoRoot, ['diff', '--name-only', `${indexedCommit}..HEAD`]);
  if (!committed.ok) {
    return { available: false, includeWorkingTree, indexedCommit, staleFiles: [], reason: committed.reason };
  }
  for (const line of committed.out.split('\n')) {
    const f = line.trim();
    if (f) stale.add(normalizeRel(repoRoot, f));
  }

  // (2) OPT-IN working-tree union (default OFF).
  if (includeWorkingTree) {
    for (const args of [
      ['diff', '--name-only', '--cached'],                 // staged
      ['diff', '--name-only'],                             // unstaged
      ['ls-files', '--others', '--exclude-standard'],      // untracked
    ]) {
      const r = gitCmd(repoRoot, args);
      if (!r.ok) continue; // a single sub-list failing is soft; committed drift already captured
      for (const line of r.out.split('\n')) {
        const f = line.trim();
        if (f) stale.add(normalizeRel(repoRoot, f));
      }
    }
  }

  // (3) per-file CONTENT-HASH verification for the requested files — catches blob drift the
  //     name-diff missed. Bounded to verifyPaths (O(node-files)), never a tree sweep.
  for (const raw of verifyPaths) {
    const rel = normalizeRel(repoRoot, raw);
    if (!rel || stale.has(rel)) continue; // already flagged by the name-diff
    const abs = path.join(repoRoot, rel);
    if (!fs.existsSync(abs)) continue; // a missing file is the existence check's job, not content drift
    const indexedBlob = gitCmd(repoRoot, ['rev-parse', `${indexedCommit}:${rel}`]);
    if (!indexedBlob.ok) {
      // The path did not exist at the indexed commit -> it is NEW since indexing -> content drift.
      stale.add(rel);
      continue;
    }
    const currentBlob = gitCmd(repoRoot, ['hash-object', abs]);
    if (!currentBlob.ok) continue; // cannot hash -> indeterminate, don't false-flag
    if (indexedBlob.out.trim() !== currentBlob.out.trim()) stale.add(rel);
  }

  return {
    available: true,
    includeWorkingTree,
    indexedCommit,
    staleFiles: [...stale].sort(),
  };
}

export function scanDrift(opts = {}) {
  const repoRoot = opts.repoRoot || DEFAULT_REPO_ROOT;
  const graphPath = opts.graphPath || path.join(repoRoot, DEFAULT_GRAPH_REL);
  const phantomOk = opts.phantomOk || PHANTOM_OK;
  const checkGitnexus = opts.checkGitnexus !== false;
  const checkClaims = opts.checkClaims !== false;
  // Per-file CONTENT-HASH staleness reconciliation. OFF by default (opt-in) so the existing
  // checkGitnexus:false scan path makes ZERO git calls and the legacy tests stay deterministic.
  // includeWorkingTree is the OPT-IN working-tree union (default OFF — the dirty-tree self-defeat).
  const checkFileStale = opts.checkFileStale === true;
  const includeWorkingTree = opts.includeWorkingTree === true;
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
    fileStale: null, // per-file content-hash reconciliation result (null unless checkFileStale)
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

  // Collect every real (non-glob, non-home, non-line-suffixed) repo-relative file path for the
  // optional per-file content-hash verify leg. Globs / ~/ seams / line suffixes are out of scope
  // for blob hashing (the existence + path:line legs already cover those).
  const verifyPaths = new Set();

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
        // Eligible for the content-hash verify leg: a plain repo-relative path (not a glob, not a
        // ~/ home seam). Line-suffixed refs verify on filePath (the suffix is a seam, not a blob).
        if (checkFileStale && filePath && !filePath.includes('*') && !filePath.startsWith('~')) {
          verifyPaths.add(filePath);
        }
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

  // (e) per-file content-hash staleness reconciliation — opt-in, advisory. NEVER escalates to
  // nodeDrift (drift = the graph cites a wrong/missing seam; staleness = the index is behind a still-
  // correct seam — different axes). A stale file is surfaced so the consumer can read it directly.
  if (checkFileStale) {
    const fs2 = computeFileStaleSet({ repoRoot, includeWorkingTree, verifyPaths: [...verifyPaths] });
    report.fileStale = fs2;
    if (!fs2.available) {
      report.lines.push(`FILE_STALE_UNAVAILABLE reason="${fs2.reason}"`);
    } else {
      report.lines.push(
        `FILE_STALE_SUMMARY count=${fs2.staleFiles.length} indexed=${(fs2.indexedCommit || '').slice(0, 8)} workingTree=${fs2.includeWorkingTree}`,
      );
      for (const f of fs2.staleFiles) report.lines.push(`FILE_STALE file=${f}`);
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
  // --file-stale enables the per-file content-hash reconciliation leg (committed-drift by default).
  // --working-tree additionally unions uncommitted change — OPT-IN, default OFF (dirty-tree guard).
  const checkFileStale = argv.includes('--file-stale');
  const includeWorkingTree = argv.includes('--working-tree');

  const report = scanDrift({ checkFileStale, includeWorkingTree });

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
