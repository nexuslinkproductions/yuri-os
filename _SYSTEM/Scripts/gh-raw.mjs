#!/usr/bin/env node
// @capability: gh-raw
// @serves: fetch a github file by exact path | list a repo file tree | github raw fetch | zread 1015 fallback | loop-proof repo scrape
// @does: deterministic GitHub file (raw.githubusercontent.com) + tree (api.github.com git/trees recursive) fetcher with a short-TTL tree cache; no MCP, no path-guessing, no 1015 loop — a missing path is a clean 404 that exits non-zero
// @use: reach for this INSTEAD of mcp__zread__read_file when you can name the path or after zread hits code 1015; the loop-proof fallback mandated by .claude/rules/zread-repo-scrape.md
// @exports: fetchRaw, fetchTree, resolveBranch, main

// gh-raw.mjs — loop-proof GitHub file/tree fetcher.
// Usage:
//   node gh-raw.mjs <owner>/<repo> <path>        # fetch one file (default branch: main, then master)
//   node gh-raw.mjs <owner>/<repo> <path> --branch dev
//   node gh-raw.mjs <owner>/<repo> --tree         # list all paths (recursive)
//   node gh-raw.mjs <owner>/<repo> --tree --match crates/model
//   node gh-raw.mjs <owner>/<repo> <path> --out <file>
//   node gh-raw.mjs <owner>/<repo> <path> --head 40   # first N lines only
// Principles: no retries on 404, no path inference, never loops. A miss is a hard error.

import { writeFileSync, mkdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { homedir, tmpdir } from 'node:os';

const CACHE_DIR = join(process.env.YURI_STATE_DIR || join(homedir(), 'YURI-OS-MUSUBI', '_SYSTEM', 'state', 'gh-raw-cache'));
const TREE_TTL_MS = 60 * 60 * 1000; // 1 hour — structure is stable enough for a scrape session
const UA = 'yuri-gh-raw/1.0 (loop-proof repo fetcher)';

function parse(argv) {
  const a = argv.slice(2);
  const out = { repo: null, path: null, branch: null, tree: false, match: null, outFile: null, head: 0 };
  for (let i = 0; i < a.length; i++) {
    const t = a[i];
    if (t === '--tree') out.tree = true;
    else if (t === '--branch') out.branch = a[++i];
    else if (t === '--match') out.match = a[++i];
    else if (t === '--out') out.outFile = a[++i];
    else if (t === '--head') out.head = parseInt(a[++i], 10) || 0;
    else if (!out.repo && t.includes('/')) out.repo = t;
    else if (!out.path && !t.startsWith('--')) out.path = t;
  }
  return out;
}

function cachePath(repo, branch, kind) {
  return join(CACHE_DIR, `${repo.replace('/', '__')}__${branch}__${kind}.json`);
}

function readCache(repo, branch, kind) {
  try {
    const p = cachePath(repo, branch, kind);
    const st = statSync(p);
    if (Date.now() - st.mtimeMs > TREE_TTL_MS) return null;
    return JSON.parse(readFileSync(p, 'utf8'));
  } catch { return null; }
}

function writeCache(repo, branch, kind, data) {
  try {
    mkdirSync(CACHE_DIR, { recursive: true });
    writeFileSync(cachePath(repo, branch, kind), JSON.stringify(data));
  } catch { /* cache is best-effort */ }
}

// Resolve the default branch by trying main, then master. Cached per repo.
export async function resolveBranch(repo) {
  for (const b of ['main', 'master']) {
    try {
      const r = await fetch(`https://api.github.com/repos/${repo}`, { headers: { 'User-Agent': UA, Accept: 'application/vnd.github+json' } });
      if (r.ok) {
        const j = await r.json();
        return j.default_branch || b;
      }
      if (r.status === 404) throw new Error(`404 repo not found: ${repo}`);
    } catch (e) { throw e; }
  }
  return 'main';
}

// List all file paths in a repo (recursive). Cached 1h.
export async function fetchTree(repo, branch, { match } = {}) {
  const b = branch || await resolveBranch(repo);
  const cached = readCache(repo, b, 'tree');
  let paths;
  if (cached) {
    paths = cached;
  } else {
    const url = `https://api.github.com/repos/${repo}/git/trees/${b}?recursive=1`;
    const r = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/vnd.github+json' } });
    if (r.status === 404) throw new Error(`404 tree not found: ${repo}@${b} (bad branch? repo private?)`);
    if (r.status === 403) throw new Error(`403 rate-limited by api.github.com (60/hr unauthenticated) — wait or narrow the request`);
    if (!r.ok) throw new Error(`${r.status} fetching tree: ${url}`);
    const j = await r.json();
    if (j.truncated) process.stderr.write(`warn: tree truncated (>7MB) — some paths omitted for ${repo}@${b}\n`);
    paths = (j.tree || []).filter(t => t.type === 'blob').map(t => t.path);
    writeCache(repo, b, 'tree', paths);
  }
  return match ? paths.filter(p => p.includes(match)) : paths;
}

// Fetch a single file by exact path. 404 is a hard error — never retries, never loops.
export async function fetchRaw(repo, path, branch, { head = 0 } = {}) {
  const b = branch || await resolveBranch(repo);
  const url = `https://raw.githubusercontent.com/${repo}/${b}/${path}`;
  const r = await fetch(url, { headers: { 'User-Agent': UA } });
  if (r.status === 404) throw new Error(`404 not found: ${repo}@${b}:${path}\n  -> confirm the path first: node _SYSTEM/Scripts/gh-raw.mjs ${repo} --tree --branch ${b}`);
  if (!r.ok) throw new Error(`${r.status} fetching: ${url}`);
  let text = await r.text();
  if (head > 0) text = text.split('\n').slice(0, head).join('\n');
  return text;
}

export async function main() {
  const o = parse(process.argv);
  if (!o.repo) {
    process.stderr.write(`usage: node gh-raw.mjs <owner>/<repo> <path> [--branch b] [--out f] [--head N]\n       node gh-raw.mjs <owner>/<repo> --tree [--branch b] [--match substr]\n`);
    process.exit(2);
  }
  try {
    if (o.tree) {
      const paths = await fetchTree(o.repo, o.branch, { match: o.match });
      if (!paths.length) { process.stderr.write(`no paths${o.match ? ` matching '${o.match}'` : ''} in ${o.repo}@${o.branch || '(default)'}\n`); process.exit(1); }
      process.stdout.write(paths.join('\n') + '\n');
      return;
    }
    if (!o.path) { process.stderr.write(`error: no <path> given (and not --tree)\n`); process.exit(2); }
    const text = await fetchRaw(o.repo, o.path, o.branch, { head: o.head });
    if (o.outFile) { mkdirSync(dirname(o.outFile), { recursive: true }); writeFileSync(o.outFile, text); process.stdout.write(`wrote ${o.outFile} (${text.length} bytes)\n`); }
    else process.stdout.write(text);
  } catch (e) {
    process.stderr.write(`gh-raw: ${e.message}\n`);
    process.exit(1);
  }
}

main();
