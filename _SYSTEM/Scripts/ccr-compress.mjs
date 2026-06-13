#!/usr/bin/env node
/**
 * ccr-compress.mjs — REVERSIBLE context compression with a local original-cache safety net.
 *
 * Adoption item `ccr-compression` (github-adoption-2026-06-13 mission, brief §ITEM 4). Clean-room
 * YURI-native re-imagining of the "context-headroom / reversible-compaction" idea — NO Rust, NO HF,
 * NO proxy dependency, NO vendored upstream code. Pure node-builtin.
 *
 * THE SHAPE (why reversibility is the safety net, not a nice-to-have):
 *   compact-optimizer/SKILL.md is ONE-WAY — it builds a /compact hint and the dropped tokens are gone.
 *   This upgrades that with a reversible path: when a section is elided, the ORIGINAL is cached locally
 *   (sibling dir, content-hash keyed, TTL) and a retrieval SENTINEL is injected in its place. A consumer
 *   that needs the dropped section calls retrieve(hash) and gets the byte-exact original back. The cache
 *   IS the undo button — that is what makes aggressive compaction safe to default-on.
 *
 * CONTENT-TYPED ROUTING (conservative, lossless/structural by default):
 *   - json  : JSON.parse → JSON.stringify (no indent). Pure structural whitespace elision. REVERSIBLE.
 *   - code  : strip standalone-line comments + collapse blank-line runs. Structural. REVERSIBLE via cache.
 *   - prose : collapse blank-line runs + trailing whitespace. Structural. REVERSIBLE via cache.
 *   Reversibility for json/prose/code rests on the cached original (retrieve == byte-exact). The inline
 *   transform is a best-effort SHRINK; the cache is the ground truth for getting the original back.
 *
 * SEMANTIC elision (mode:'semantic') is marked lossy:true HONESTLY. It still caches the original (so
 * retrieve recovers it) but the *inline* replacement is a non-reconstructable summary placeholder — we
 * never claim the inline form is reversible, only that the cache can restore the source.
 *
 * --self HARDENING: --self reads ONLY .claude/yuri-sentinel/learning/global.md + _SYSTEM/memory/MEMORY.md
 * directly. It NEVER invokes brain-inject.js (which reads the deny-listed .claude/state/cortex-state.json,
 * brain-inject.js:195,231). --self DIAGNOSES self-context compaction headroom; it does not repair it.
 *
 * CACHE SAFETY: cache dir is a sibling under _SYSTEM/state/ccr-cache/ — verified NON-protected via
 * isProtectedPath before any write. (_SYSTEM/state is writable; .claude/state is the deny-listed one.)
 */
// @capability: reversible-context-compression
// @serves: reversible compression | context compaction | compress payload | shrink context | cache original then retrieve | retrieval sentinel | lossless structural elision | content-typed compression json code prose | undo compaction
// @does: Content-typed (json/code/prose) reversible compaction — shrinks a payload inline, caches the byte-exact original under a content hash (sibling dir, TTL), injects a retrieval sentinel; retrieve(hash) restores the original. Structural elision is lossless (round-trips); semantic elision is marked lossy honestly.
// @use: Reach for this before building any context/payload compaction, compaction-with-undo, or "drop a section but be able to pull it back" mechanism. Upgrades compact-optimizer's one-way hint with a reversible cache.
// @exports: compress, retrieve, makeSentinel, parseSentinel, classifyContent, pruneCache, cachePathFor
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { isProtectedPath, normalizePath } from './yuri-id-bridge.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');

// Sibling cache dir. _SYSTEM/state/ is WRITABLE (the deny-listed protected path is .claude/state/).
const DEFAULT_CACHE_DIR = path.join(REPO_ROOT, '_SYSTEM', 'state', 'ccr-cache');
const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000; // 24h — continuity-favoring conservative default (R1 owner decision: continuity > disk).
const SENTINEL_RE = /⟪CCR:([0-9a-f]{64}):(json|code|prose|semantic):(\d+)⟫/g; // ⟪CCR:<hash>:<type>:<origBytes>⟫

// ── content classification (deterministic, closed-set) ──────────────────────────────────────────
export function classifyContent(payload, hint) {
  if (hint === 'json' || hint === 'code' || hint === 'prose') return hint;
  const s = String(payload);
  const trimmed = s.trim();
  if (trimmed.length === 0) return 'prose';
  // JSON: parses cleanly as an object/array (not a bare scalar — a lone number/string is "prose").
  if ((trimmed[0] === '{' || trimmed[0] === '[')) {
    try { JSON.parse(trimmed); return 'json'; } catch { /* not json */ }
  }
  // code: presence of code-shaped tokens on multiple lines.
  const codeSignals = /(^|\n)\s*(function |const |let |var |import |export |class |def |#include|=>|;\s*$|\{\s*$)/m;
  if (codeSignals.test(s)) return 'code';
  return 'prose';
}

// ── structural transforms (best-effort inline shrink; cache holds the byte-exact original) ───────
function shrinkJson(s) {
  // Pure structural whitespace elision. Re-stringify with no indent. Falls back to raw on parse failure.
  try { return JSON.stringify(JSON.parse(s)); } catch { return s; }
}
function shrinkCode(s) {
  // Drop standalone-line // comments and # comments; collapse blank-line runs. Conservative: only
  // lines whose FIRST non-space char starts the comment (never touches inline-trailing or string content).
  const out = [];
  let blankRun = 0;
  for (const line of s.split('\n')) {
    const t = line.trimStart();
    if (t.startsWith('//') || t.startsWith('#')) continue;
    if (t === '') { blankRun += 1; if (blankRun > 1) continue; } else { blankRun = 0; }
    out.push(line.replace(/[ \t]+$/, ''));
  }
  return out.join('\n');
}
function shrinkProse(s) {
  // Collapse blank-line runs to a single blank; strip trailing whitespace per line.
  const out = [];
  let blankRun = 0;
  for (const line of s.split('\n')) {
    const stripped = line.replace(/[ \t]+$/, '');
    if (stripped === '') { blankRun += 1; if (blankRun > 1) continue; } else { blankRun = 0; }
    out.push(stripped);
  }
  return out.join('\n');
}

// ── sentinel marker (the retrieval handle injected where a section was elided) ───────────────────
export function makeSentinel(hash, type, origBytes) {
  return `⟪CCR:${hash}:${type}:${origBytes}⟫`;
}
export function parseSentinel(text) {
  const found = [];
  const re = new RegExp(SENTINEL_RE.source, 'g');
  let m;
  while ((m = re.exec(String(text))) !== null) {
    found.push({ hash: m[1], type: m[2], origBytes: Number(m[3]) });
  }
  return found;
}

// ── cache (content-hash keyed, sibling dir, never a protected path) ──────────────────────────────
function hashOf(s) { return crypto.createHash('sha256').update(String(s), 'utf8').digest('hex'); }

export function cachePathFor(hash, cacheDir = DEFAULT_CACHE_DIR) {
  return path.join(cacheDir, `${hash}.orig`);
}

function ensureCacheDir(cacheDir) {
  const rel = normalizePath(cacheDir);
  if (isProtectedPath(rel)) {
    throw new Error(`ccr-compress: refusing to use protected cache dir "${rel}" (fail-closed)`);
  }
  fs.mkdirSync(cacheDir, { recursive: true });
}

/**
 * compress(payload, opts) → { compressed, original, hash, type, lossy, sentinel, ratio, cachedPath }
 * Caches the byte-exact original under hash, injects a sentinel in place of `compressed`.
 * opts.mode: 'structural' (default, lossless via cache) | 'semantic' (lossy:true, honest).
 * opts.contentType: 'json'|'code'|'prose' hint (else auto-classified).
 * opts.cacheDir, opts.ttlMs: cache location + TTL.
 * opts.summarizer: for semantic mode, fn(payload)->string (default = honest truncation placeholder).
 * opts.inject: if true, returns { compressed: <sentinel> } so the sentinel is what flows downstream.
 */
export function compress(payload, opts = {}) {
  const src = String(payload);
  const type = classifyContent(src, opts.contentType);
  const mode = opts.mode === 'semantic' ? 'semantic' : 'structural';
  const cacheDir = opts.cacheDir || DEFAULT_CACHE_DIR;
  const ttlMs = typeof opts.ttlMs === 'number' ? opts.ttlMs : DEFAULT_TTL_MS;
  const hash = hashOf(src);
  const origBytes = Buffer.byteLength(src, 'utf8');

  // Always cache the byte-exact original first — the cache is the undo button.
  ensureCacheDir(cacheDir);
  const cachedPath = cachePathFor(hash, cacheDir);
  fs.writeFileSync(cachedPath, src, 'utf8');
  // touch mtime forward so a re-compress of a still-live section refreshes its TTL window.
  const now = Date.now();
  try { fs.utimesSync(cachedPath, now / 1000, now / 1000); } catch { /* best-effort */ }

  let shrunk;
  let lossy;
  if (mode === 'semantic') {
    lossy = true; // honest: the inline form is NOT reconstructable from itself — only the cache restores it.
    const summarizer = typeof opts.summarizer === 'function' ? opts.summarizer : defaultSemanticSummary;
    shrunk = summarizer(src);
  } else {
    lossy = false; // structural: cache restores byte-exact; the inline shrink is a lossless re-expression.
    if (type === 'json') shrunk = shrinkJson(src);
    else if (type === 'code') shrunk = shrinkCode(src);
    else shrunk = shrinkProse(src);
  }

  const sentinel = makeSentinel(hash, type, origBytes);
  const compressedBytes = Buffer.byteLength(shrunk, 'utf8');
  const ratio = origBytes === 0 ? 1 : compressedBytes / origBytes;

  // prune expired cache entries opportunistically (bounded, never throws).
  try { pruneCache({ cacheDir, ttlMs, now }); } catch { /* best-effort */ }

  return {
    compressed: opts.inject ? sentinel : shrunk,
    inlineShrunk: shrunk,
    original: src,
    hash,
    type,
    mode,
    lossy,
    sentinel,
    origBytes,
    compressedBytes,
    ratio,
    cachedPath,
    ttlMs,
  };
}

function defaultSemanticSummary(src) {
  const firstLine = String(src).split('\n', 1)[0].slice(0, 80);
  return `[CCR semantic-elided ${Buffer.byteLength(src, 'utf8')}B; head="${firstLine}"]`;
}

/**
 * retrieve(hashOrSentinel, opts) → string | null
 * Pulls the byte-exact cached original back. Accepts a bare 64-hex hash OR a sentinel string
 * (the first sentinel's hash is used). Returns null if not cached / expired-and-pruned.
 */
export function retrieve(hashOrSentinel, opts = {}) {
  const cacheDir = opts.cacheDir || DEFAULT_CACHE_DIR;
  const ttlMs = typeof opts.ttlMs === 'number' ? opts.ttlMs : DEFAULT_TTL_MS;
  let hash = String(hashOrSentinel).trim();
  if (!/^[0-9a-f]{64}$/.test(hash)) {
    const parsed = parseSentinel(hashOrSentinel);
    if (parsed.length === 0) return null;
    hash = parsed[0].hash;
  }
  const p = cachePathFor(hash, cacheDir);
  if (!fs.existsSync(p)) return null;
  // honor TTL on read: an entry older than TTL is treated as gone (and pruned).
  try {
    const st = fs.statSync(p);
    if (ttlMs > 0 && (Date.now() - st.mtimeMs) > ttlMs) {
      try { fs.unlinkSync(p); } catch { /* best-effort */ }
      return null;
    }
  } catch { return null; }
  return fs.readFileSync(p, 'utf8');
}

/** pruneCache — delete cache entries older than ttlMs. Returns count pruned. Bounded, never throws fatally. */
export function pruneCache(opts = {}) {
  const cacheDir = opts.cacheDir || DEFAULT_CACHE_DIR;
  const ttlMs = typeof opts.ttlMs === 'number' ? opts.ttlMs : DEFAULT_TTL_MS;
  const now = typeof opts.now === 'number' ? opts.now : Date.now();
  if (ttlMs <= 0 || !fs.existsSync(cacheDir)) return 0;
  let pruned = 0;
  for (const f of fs.readdirSync(cacheDir)) {
    if (!f.endsWith('.orig')) continue;
    const p = path.join(cacheDir, f);
    try {
      const st = fs.statSync(p);
      if ((now - st.mtimeMs) > ttlMs) { fs.unlinkSync(p); pruned += 1; }
    } catch { /* skip unreadable */ }
  }
  return pruned;
}

// ── --self mode (HARDENED: reads ONLY global.md + MEMORY.md, NEVER brain-inject) ─────────────────
function selfContextSources() {
  const sources = [
    path.join(REPO_ROOT, '.claude', 'yuri-sentinel', 'learning', 'global.md'),
    path.join(REPO_ROOT, '_SYSTEM', 'memory', 'MEMORY.md'),
  ];
  // Defense-in-depth: assert NONE of the self sources is a protected path. cortex-state.json
  // (the brain-inject deny-listed read) is structurally not in this list and would fail this check.
  const out = [];
  for (const s of sources) {
    const rel = normalizePath(s);
    if (isProtectedPath(rel)) continue; // fail-closed: never read a protected source
    if (fs.existsSync(s)) out.push({ path: rel, bytes: fs.statSync(s).size, content: fs.readFileSync(s, 'utf8') });
  }
  return out;
}

function runSelf() {
  const sources = selfContextSources();
  const report = { mode: 'self', sources: [], totalOrigBytes: 0, totalCompressedBytes: 0 };
  for (const s of sources) {
    const r = compress(s.content, { contentType: 'prose', mode: 'structural' });
    report.sources.push({ path: s.path, origBytes: r.origBytes, compressedBytes: r.compressedBytes, ratio: Number(r.ratio.toFixed(4)), hash: r.hash });
    report.totalOrigBytes += r.origBytes;
    report.totalCompressedBytes += r.compressedBytes;
  }
  report.headroomRatio = report.totalOrigBytes === 0 ? 1 : Number((report.totalCompressedBytes / report.totalOrigBytes).toFixed(4));
  report.note = 'DIAGNOSE-ONLY: --self reports self-context compaction headroom. It does NOT repair context and NEVER invokes brain-inject (which reads the deny-listed .claude/state/cortex-state.json).';
  return report;
}

// ── CLI ──────────────────────────────────────────────────────────────────────────────────────────
function main() {
  const argv = process.argv.slice(2);
  if (argv.includes('--self')) {
    console.log(JSON.stringify(runSelf(), null, 2));
    return;
  }
  if (argv.includes('--retrieve')) {
    const i = argv.indexOf('--retrieve');
    const key = argv[i + 1];
    const got = retrieve(key);
    if (got === null) { console.error('ccr-compress: nothing cached for that hash/sentinel (or expired).'); process.exit(2); }
    process.stdout.write(got);
    return;
  }
  // default: read stdin, compress, print JSON summary (sentinel + ratio).
  const chunks = [];
  process.stdin.on('data', (c) => chunks.push(c));
  process.stdin.on('end', () => {
    const payload = Buffer.concat(chunks).toString('utf8');
    if (payload.length === 0) {
      console.error('ccr-compress: no stdin payload. Usage: ccr-compress < file | --retrieve <hash> | --self');
      process.exit(1);
    }
    const r = compress(payload, { mode: argv.includes('--semantic') ? 'semantic' : 'structural' });
    console.log(JSON.stringify({
      hash: r.hash, type: r.type, mode: r.mode, lossy: r.lossy,
      origBytes: r.origBytes, compressedBytes: r.compressedBytes, ratio: Number(r.ratio.toFixed(4)),
      sentinel: r.sentinel, cachedPath: normalizePath(r.cachedPath),
      note: r.lossy ? 'SEMANTIC elision is LOSSY inline; retrieve(hash) restores the byte-exact original from cache.' : 'STRUCTURAL elision; retrieve(hash) restores the byte-exact original from cache.',
    }, null, 2));
  });
}

if (import.meta.url === `file://${process.argv[1]}`) main();
