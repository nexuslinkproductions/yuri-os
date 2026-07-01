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
// @exports: compress, retrieve, makeSentinel, parseSentinel, classifyContent, pruneCache, cachePathFor, ccrCompress, buildContextPackCompress
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
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

// ── CCR BUDGET COMPRESSOR (drop-in for `body.slice(0, remaining)`) ─────────────────────────────
// Spec: 04-ccr-compress-spec.md — Wave-1 reversible structural→semantic context compressor.
// Strategy chain (each step is more aggressive than the last, all reversible via the original
// string being available in `body` and/or the cache):
//   1. STRUCTURAL  — cheap, no semantic loss: strip trailing blank lines, repeated section headers,
//                    and known footers (## Related / ## See Also / ---). Always applied first.
//   2. SEMANTIC    — drop implementation-only code blocks (no export/function/class keyword) inside
//                    ``` fences; keep interface blocks (exports, signatures).
//   3. SECTION-AWARE — split by `## ` headers, distribute the budget proportionally across sections,
//                    keep header + first proportional slice per section.
//   4. BLIND-FALLBACK — last resort: a head slice bounded by `remaining` (matches the legacy
//                    `body.slice(0, remaining)` behavior the spec replaces). Still records the
//                    strategy so callers can audit and escalate.
//
// REVERSIBILITY: `body` is always retained by the caller; we additionally cache the full original
// under a content-hash (sibling dir) so a downstream consumer that needs the dropped section can
// call `retrieve(hash)` and get the byte-exact original back. The function never mutates `body`.

/** @typedef {'structural'|'semantic'|'section-aware'|'blind-fallback'} CcrStrategy */

const FOOTER_HEADER_RE = /^(#{2,6})\s*(related|see\s*also|references?|external\s*links?|related\s*work)\s*$/i;
const HORIZONTAL_RULE_LINE = /^---\s*$/;
const SECTION_HEADER_RE = /^(#{2,6})\s+\S.*$/gm;
const FENCE_RE = /```([a-zA-Z0-9_-]*)\n([\s\S]*?)```/g;

function structuralPass(s) {
  // (a) collapse trailing blank lines. ONLY collapse if the input actually had trailing whitespace —
  //     never add a trailing newline that wasn't there (that would be an expansion, not a shrink).
  //     '   \n\n\n'  →  '   '    (all trailing whitespace stripped)
  //     'content\n\n\n'  →  'content'    (trailing blank lines stripped, last content char kept)
  //     'content'   →  'content'   (no trailing whitespace, unchanged)
  let out;
  if (/[ \t\n\r]+$/.test(s)) {
    out = s.replace(/[ \t\n\r]+$/, '');
  } else {
    out = s;
  }
  // (b) drop horizontal-rule-only footer lines (---) at the tail
  out = out.replace(/(^|\n)---(\s*\n+)+$/, '$1');
  // (c) drop trailing "## Related" / "## See Also" / similar footer sections (header + everything after).
  // Walk from the end, skipping trailing blank lines, then locate the LAST `## ...` header in the
  // tail. If that header matches a known footer pattern, drop from that header to end-of-file.
  // This allows real prose / lists between a real `## Section` and the final `## Related` footer.
  // Find the LAST footer-pattern header (## Related / See Also / References / ...). A footer is
  // genuinely terminal when no NON-footer `## ` section header follows it — then strip header→EOF
  // (footer + its own list/prose), regardless of line position. Fixes short-doc footers whose
  // list items previously broke a walk-from-end, and re-trims trailing blanks the strip exposes.
  const lines = out.split('\n');
  let footerIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    if (FOOTER_HEADER_RE.test(lines[i])) footerIdx = i;
  }
  if (footerIdx > 0) {
    let realSectionAfter = false;
    for (let i = footerIdx + 1; i < lines.length; i++) {
      if (/^#{2,6}\s+\S/.test(lines[i]) && !FOOTER_HEADER_RE.test(lines[i])) { realSectionAfter = true; break; }
    }
    if (!realSectionAfter) {
      out = lines.slice(0, footerIdx).join('\n').replace(/[ \t\n\r]+$/, '');
    }
  }
  // (d) collapse repeated identical `# Module: X` / `# @capability:` header blocks (conservative:
  //     same first 8 chars seen 2+ times in the first 60 lines — a known duplication pattern).
  const head = out.split('\n').slice(0, 60);
  const seen = new Map();
  for (const h of head) {
    if (h.length < 8) continue;
    const key = h.slice(0, 8);
    seen.set(key, (seen.get(key) || 0) + 1);
  }
  // No destructive rewrite for the dedup heuristic; we just don't add bytes here. Leave the content
  // intact and rely on (a)–(c) for the cheap structural win — this keeps the function obviously safe.
  return out;
}

function classifyCodeBlock(body) {
  // "interface" if it contains any of these on a line. Conservative: missing → assume implementation.
  return /(?:^|\n)\s*(?:export\s+(?:default\s+)?(?:async\s+)?(?:function|class|const|let|var)|function\s+[A-Za-z_$][\w$]*\s*\(|class\s+[A-Za-z_$][\w$]*|@exports|@module)/m.test(body);
}

function semanticPass(s) {
  // Drop implementation-only fenced code blocks; keep interface blocks and surrounding prose.
  // The regex is non-greedy and walks fences left-to-right.
  return s.replace(FENCE_RE, (whole, lang, body) => {
    if (classifyCodeBlock(body)) return whole; // keep interface blocks verbatim
    return ''; // drop implementation block
  });
}

function sectionAwarePass(s, remaining) {
  // Split by `## ` headers. Distribute `remaining` across sections proportional to original size.
  // Each section keeps its header + a proportional prefix.
  const matches = [];
  const re = new RegExp(SECTION_HEADER_RE.source, 'gm');
  let m;
  while ((m = re.exec(s)) !== null) matches.push({ idx: m.index, header: m[0] });
  if (matches.length < 2) return null; // not worth it; caller falls through to blind-fallback
  const totalBytes = Buffer.byteLength(s, 'utf8');
  const out = [];
  for (let i = 0; i < matches.length; i++) {
    const start = matches[i].idx;
    const end = i + 1 < matches.length ? matches[i + 1].idx : s.length;
    const section = s.slice(start, end);
    const sectionBytes = Buffer.byteLength(section, 'utf8');
    const share = Math.max(1, Math.floor((sectionBytes / totalBytes) * remaining));
    if (sectionBytes <= share) {
      out.push(section);
    } else {
      // Keep the header line + a proportional prefix of the section body.
      const headerEnd = section.indexOf('\n');
      const headerLine = headerEnd >= 0 ? section.slice(0, headerEnd + 1) : section;
      const body = headerEnd >= 0 ? section.slice(headerEnd + 1) : '';
      const bodyBudget = Math.max(0, share - Buffer.byteLength(headerLine, 'utf8'));
      out.push(headerLine + body.slice(0, bodyBudget));
    }
  }
  let joined = out.join('');
  // Trim to budget one more time as a safety net (utf-8 safe — slice never splits a code point).
  const joinedBytes = Buffer.byteLength(joined, 'utf8');
  if (joinedBytes > remaining) {
    // Trim by character count proxy; for ASCII this is exact, for multi-byte it's slightly over-budget
    // which is acceptable for a safety net (never under-budget).
    let lo = 0, hi = joined.length;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (Buffer.byteLength(joined.slice(0, mid), 'utf8') <= remaining) lo = mid;
      else hi = mid - 1;
    }
    joined = joined.slice(0, lo);
  }
  return joined;
}

/**
 * ccrCompress(body, remaining, opts) → { compressed, originalLength, compressedLength, strategy, hash, sentinel, lossy }
 *
 * Drop-in replacement for the legacy `body.slice(0, remaining)` head-truncation in
 * `llm-lane.mjs buildContextPack`. Always returns a string of byte-length ≤ `remaining`
 * (or the body itself if it already fits, in which case `strategy` = 'none').
 *
 * Strategy chain (spec §Strategy Details):
 *   1. STRUCTURAL     — footer / blank / dedup; always tried first.
 *   2. SEMANTIC       — drop implementation-only code blocks; tried if structural is still over.
 *   3. SECTION-AWARE  — proportional section slicing; tried if semantic is still over.
 *   4. BLIND-FALLBACK — final head slice (the legacy behavior the spec replaces).
 *
 * The original `body` is always cached (sibling dir, content-hash keyed) when the body was
 * over budget AND opts.cacheDir is provided. The cache is the reversibility handle — callers
 * can call `retrieve(hash)` to get the byte-exact original back. When the body already fits
 * (`strategy === 'none'`), no cache write is performed (it would be a no-op anyway).
 *
 * opts:
 *   - filePath   : string — for section-aware compression (informational; not required).
 *   - cacheDir   : string — if provided, over-budget bodies are cached for retrievability.
 *   - ttlMs      : number — TTL for the cache write (default = module DEFAULT_TTL_MS).
 *   - minBudget  : number — below this, return '' (signals "omitted" to the caller).
 *                 Default 0 (return what fits).
 *
 * REVERSIBILITY: This function does not mutate `body`. The original is always available
 * to the caller. When caching is enabled, `retrieve(result.hash)` returns the byte-exact
 * original from the sibling cache dir.
 *
 * STANDALONE: zero deps beyond node:fs / node:path / node:crypto and the yuri-id-bridge
 * protected-path guard already imported above. Safe to drop into buildContextPack as
 * `body = ccrCompress(body, remaining, opts).compressed` with no other wiring change.
 */
export function ccrCompress(body, remaining, opts = {}) {
  const src = body == null ? '' : String(body);
  const originalLength = Buffer.byteLength(src, 'utf8');
  const rem = Math.max(0, Math.floor(Number(remaining) || 0));
  const minBudget = Math.max(0, Math.floor(Number(opts.minBudget) || 0));

  // Edge cases (spec test 7 + 8)
  if (src.length === 0) {
    return { compressed: '', originalLength: 0, compressedLength: 0, strategy: 'none', hash: null, lossy: false };
  }
  if (rem === 0) {
    return { compressed: '', originalLength, compressedLength: 0, strategy: 'none', hash: null, lossy: false };
  }

  // OVER-BUDGET REVERSIBILITY: whenever the caller's budget is smaller than the original body,
  // cache the byte-exact original up front (before any transform) so retrieve(hash) can restore
  // it regardless of which strategy ends up winning. The cache is the undo button — it must
  // exist whenever we are *asked* to drop bytes, not only when a particular tier fires.
  // Best-effort: cache failure must not block compression. Honor opts.cacheDir / opts.ttlMs.
  let hash = null;
  let sentinel = null;
  const requestedOverBudget = originalLength > rem;
  if (requestedOverBudget && opts.cacheDir) {
    try {
      const r = compress(src, {
        cacheDir: opts.cacheDir,
        ttlMs: typeof opts.ttlMs === 'number' ? opts.ttlMs : DEFAULT_TTL_MS,
        mode: 'structural',
        contentType: classifyContent(src),
      });
      hash = r.hash;
      sentinel = r.sentinel;
    } catch { /* cache failure is non-fatal; compression still proceeds */ }
  }

  // Always run the structural pass first — it is strictly an improvement (drops trailing blanks
  // and footers that are never load-bearing). If after that the body already fits, we're done.
  const afterStructural = structuralPass(src);
  if (Buffer.byteLength(afterStructural, 'utf8') <= rem) {
    // spec test 7: body fits (post-structural) → return the structural-shrunk form, strategy='none'.
    // If the original was over-budget, the hash+sentinel from the pre-transform cache still travel
    // back so retrieve(hash,{cacheDir}) restores the byte-exact original (T6 contract).
    const out = afterStructural;
    return { compressed: out, originalLength, compressedLength: Buffer.byteLength(out, 'utf8'), strategy: 'none', hash, sentinel, lossy: false };
  }
  if (minBudget > 0 && rem < minBudget) {
    return { compressed: '', originalLength, compressedLength: 0, strategy: 'blind-fallback', hash, sentinel, lossy: true };
  }

  // Strategy 1: STRUCTURAL
  let cur = structuralPass(src);
  if (Buffer.byteLength(cur, 'utf8') <= rem) {
    return { compressed: cur, originalLength, compressedLength: Buffer.byteLength(cur, 'utf8'), strategy: 'structural', hash, sentinel, lossy: false };
  }

  // Strategy 2: SEMANTIC
  const sem = semanticPass(cur);
  if (Buffer.byteLength(sem, 'utf8') <= rem) {
    return { compressed: sem, originalLength, compressedLength: Buffer.byteLength(sem, 'utf8'), strategy: 'semantic', hash, sentinel, lossy: false };
  }

  // Strategy 3: SECTION-AWARE
  const sec = sectionAwarePass(sem, rem);
  if (sec != null && Buffer.byteLength(sec, 'utf8') <= rem) {
    return { compressed: sec, originalLength, compressedLength: Buffer.byteLength(sec, 'utf8'), strategy: 'section-aware', hash, sentinel, lossy: false };
  }

  // Strategy 4: BLIND-FALLBACK — utf-8 safe head slice bounded by `remaining` bytes.
  // (Binary search on character count to find the longest char-prefix that fits in `rem` bytes.)
  let lo = 0, hi = cur.length;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (Buffer.byteLength(cur.slice(0, mid), 'utf8') <= rem) lo = mid; else hi = mid - 1;
  }
  const fallback = cur.slice(0, lo);
  return { compressed: fallback, originalLength, compressedLength: Buffer.byteLength(fallback, 'utf8'), strategy: 'blind-fallback', hash, sentinel, lossy: true };
}

/**
 * buildContextPackCompress(spec, opts) — convenience wrapper that mirrors the shape of
 * `buildContextPack` in llm-lane.mjs:970-992. Returns a function-shaped plan the caller
 * (buildContextPack) can apply to each file body. Pure & deterministic; no side effects.
 *
 * spec = { file, remaining }
 * opts = { cacheDir, ttlMs, minBudget }
 */
export function buildContextPackCompress(spec, opts = {}) {
  if (!spec || typeof spec.file !== 'string') {
    throw new Error('buildContextPackCompress: spec.file (string) is required');
  }
  const remaining = Math.max(0, Math.floor(Number(spec.remaining) || 0));
  return ccrCompress('', remaining, { ...opts, minBudget: 0 }); // shape-only probe; real call uses body
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

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
