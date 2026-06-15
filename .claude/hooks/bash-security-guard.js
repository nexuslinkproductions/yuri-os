#!/usr/bin/env node
'use strict';

const path = require('path');
const OPERATOR_MODULE = path.resolve(__dirname, '..', '..', '_SYSTEM', 'Scripts', 'yuri-operator.cjs');
const CRED_FILE_PATH  = path.resolve(__dirname, '..', '..', '_SYSTEM', 'SELF', 'dev-credential.json');

const LIVE_BLOCK_SENTINEL = 'echo __bash_security_guard_live_block_test__';

function isSentinelCommand(cmd) {
  return cmd.trim() === LIVE_BLOCK_SENTINEL;
}

const BLOCKED_CLAUDE_FILES = new Set([
  '.claude/history.jsonl',
  '.claude/memory-bus.json',
  '.claude/settings.local.json',
  '.claude/state/session-state.json',
  '.claude/state/scout-bus.json',
  '.claude/state/scout-errors.log',
  '.claude/state/token-session.json',
]);

// wave-3 G.1 (D-G1): settings.json is the hook REGISTRY — a bash write can delete
// every guard registration, so writes are blocked for all roles (mutations go through
// the Edit tool, where operator-write-guard role-gates via ROLE_TRUST_SURFACES).
// WRITE-only: reads of the registry stay free — settings.json is config, not a secret,
// and the blanket BLOCKED_CLAUDE_FILES set also drives the sensitive-READ block.
const BLOCKED_CLAUDE_WRITE_FILES = new Set([
  ...BLOCKED_CLAUDE_FILES,
  '.claude/settings.json',
]);

const READ_CMDS = new Set(['cat', 'head', 'tail', 'less', 'more', 'bat', 'nl', 'view']);

function toks(cmd) {
  return cmd.trim().split(/\s+/);
}

function unquote(s) {
  if (s.length >= 2 &&
      ((s[0] === '"' && s[s.length - 1] === '"') ||
       (s[0] === "'" && s[s.length - 1] === "'"))) {
    return s.slice(1, -1);
  }
  return s;
}

// Strip a leading ./ (or ././…) so a './.claude/...'-style token cannot dodge the literal/prefix
// protected checks below. This is the C3 ./-prefix bypass class (verified live at the bash gate by the
// protected-path consolidation lane, 2026-06-06): `'./.claude/state'.startsWith('.claude/')` is false.
function normTok(s) { return String(s).replace(/^(?:\.\/)+/, ''); }

function isEnvTarget(tok) {
  const s = unquote(tok);
  return s === '.env' || s === './.env';
}

// REPO_ROOT-anchored .env mirror exemption (owner-scoped).
// Allows `cp` / `mv` of a .env file from one location inside the repo to another,
// e.g. backend/.env → _SYSTEM/backend/.env after a folder restructure.
// Both source and destination MUST:
//   - end in `.env` (exact basename)
//   - resolve under <YURI_ROOT>/
// Read/write/mutate/remove of .env remain blocked outside this exemption.
const REPO_ROOT_PREFIX = (process.env.YURI_ROOT || path.resolve(__dirname, '..', '..')) + '/';
function isPathInsideRepo(p) {
  const s = unquote(p);
  return s.startsWith(REPO_ROOT_PREFIX) && !s.includes('/..');
}
function endsWithDotEnv(p) {
  const s = unquote(p);
  return s === '.env' || s.endsWith('/.env');
}
function isAllowedEnvMirror(cmd) {
  const parts = toks(cmd);
  if (parts.length !== 3) return false;
  const op = parts[0];
  if (op !== 'cp' && op !== 'mv') return false;
  const src = parts[1];
  const dst = parts[2];
  if (!endsWithDotEnv(src) || !endsWithDotEnv(dst)) return false;
  if (!isPathInsideRepo(src) || !isPathInsideRepo(dst)) return false;
  return true;
}

function isBlockedEnvRead(cmd) {
  const parts = toks(cmd);
  const first = parts[0];
  if (READ_CMDS.has(first)) {
    for (let i = 1; i < parts.length; i++) {
      if (isEnvTarget(parts[i])) return true;
    }
    return false;
  }
  if (first === 'grep') {
    for (let i = 1; i < parts.length; i++) {
      if (!parts[i].startsWith('-') && isEnvTarget(parts[i])) return true;
    }
    return false;
  }
  return false;
}

function isBlockedSensitiveClaudeRead(cmd) {
  const parts = toks(cmd);
  const first = parts[0];
  if (READ_CMDS.has(first)) {
    for (let i = 1; i < parts.length; i++) {
      if (BLOCKED_CLAUDE_FILES.has(unquote(parts[i]))) return true;
    }
    return false;
  }
  if (first === 'grep') {
    for (let i = 1; i < parts.length; i++) {
      if (!parts[i].startsWith('-') && BLOCKED_CLAUDE_FILES.has(unquote(parts[i]))) return true;
    }
    return false;
  }
  return false;
}

function isBlockedEnvWrite(cmd) {
  return /(>)\s*(\.\/)?\.env(\s|$)/.test(cmd) && !/(>)\s*(\.\/)?\.env\./.test(cmd);
}

function isBlockedEnvMutate(cmd) {
  const parts = toks(cmd);
  const first = parts[0];
  if (first === 'tee') {
    for (let i = 1; i < parts.length; i++) {
      if (!parts[i].startsWith('-') && isEnvTarget(parts[i])) return true;
    }
  }
  if (first === 'sed') {
    const last = unquote(parts[parts.length - 1]);
    if (last === '.env' || last === './.env') return true;
  }
  return false;
}

function isBlockedEnvRemove(cmd) {
  const parts = toks(cmd);
  for (let i = 0; i < parts.length; i++) {
    if (parts[i] === 'rm') {
      for (let j = i + 1; j < parts.length; j++) {
        if (isEnvTarget(parts[j])) return true;
      }
    }
  }
  return false;
}

function isBlockedClaudeFileWrite(cmd) {
  const parts = toks(cmd);
  if (parts[0] === 'tee') {
    for (let i = 1; i < parts.length; i++) {
      if (!parts[i].startsWith('-') && BLOCKED_CLAUDE_WRITE_FILES.has(unquote(parts[i]))) return true;
    }
  }
  for (const f of BLOCKED_CLAUDE_WRITE_FILES) {
    const escaped = f.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    if (new RegExp(`>\\s*${escaped}(\\s|$)`).test(cmd)) return true;
  }
  return false;
}

// A `.claude/...` rm target that is clearly a SCRATCH artifact, not live config:
//   - a recognized scratch suffix (.orig/.bak/.old/.tmp/.rej/.swp/trailing ~), OR
//   - a path that does NOT exist on disk AND does not realpath onto a protected role
//     file/dir (a superstring/typo of a real name, e.g. operator-guardian.js when the
//     real artifact is operator-guard / operator-write-guard.js).
// Removing one's own scratch copy is normal cleanup; destroying live .claude config is not.
// Dir-root removals (.claude, .claude/, ~/.claude) and real existing files stay blocked.
const SCRATCH_SUFFIX_RE = /(?:\.orig|\.bak|\.old|\.tmp|\.rej|\.swp|~)$/;
function isClaudeScratchArtifact(t) {
  if (t === '.claude' || t === '.claude/' || t === '~/.claude' || t === '$HOME/.claude') return false;
  if (t.endsWith('/')) return false; // a directory removal, not a single scratch file
  // A glob / brace can expand onto LIVE files at shell time (e.g. tirith-url-guard.*),
  // so the literal token's non-existence proves nothing -> never exempt a wildcard.
  if (/[*?\[\]{}]/.test(t)) return false;
  if (SCRATCH_SUFFIX_RE.test(t)) return true;
  // Non-existent + not a protected role file -> a typo/superstring artifact, safe to clean.
  const abs = path.isAbsolute(t) ? path.resolve(t) : path.resolve(REPO_ROOT_ABS, t);
  let exists = true;
  try { exists = require('fs').existsSync(abs); } catch { exists = true; }
  if (!exists && !absHitsProtected(abs)) return true;
  return false;
}

function isBlockedClaudeRemove(cmd) {
  const parts = toks(cmd);
  for (let i = 0; i < parts.length; i++) {
    if (parts[i] === 'rm') {
      for (let j = i + 1; j < parts.length; j++) {
        const t = normTok(unquote(parts[j]));
        if (t === '.claude' || t === '.claude/' || t.startsWith('.claude/') ||
            t === '~/.claude' || t === '$HOME/.claude') {
          if (isClaudeScratchArtifact(t)) continue; // scratch cleanup, not destruction
          return true;
        }
      }
    }
  }
  return false;
}

function isBlockedBroadGitAdd(cmd) {
  const parts = toks(cmd);
  for (let i = 0; i < parts.length - 1; i++) {
    if (parts[i] === 'git' && parts[i + 1] === 'add') {
      for (let j = i + 2; j < parts.length; j++) {
        const t = normTok(unquote(parts[j]));
        if (t === '.claude' || t === '.claude/') return true;
      }
    }
  }
  return false;
}

function isBlockedGitRm(cmd) {
  const parts = toks(cmd);
  for (let i = 0; i < parts.length - 1; i++) {
    if (parts[i] === 'git' && parts[i + 1] === 'rm') {
      for (let j = i + 2; j < parts.length; j++) {
        const t = normTok(unquote(parts[j]));
        if (t === '.claude' || t === '.claude/' || t.startsWith('.claude/')) return true;
      }
    }
  }
  return false;
}

function isBlockedInner(cmd) {
  return isBlockedEnvRead(cmd) || isBlockedSensitiveClaudeRead(cmd) ||
    isBlockedEnvWrite(cmd) || isBlockedEnvMutate(cmd) || isBlockedEnvRemove(cmd) ||
    isBlockedClaudeFileWrite(cmd) || isBlockedClaudeRemove(cmd) ||
    isBlockedBroadGitAdd(cmd) || isBlockedGitRm(cmd);
}

function isDownloadExecuteChain(cmd) {
  return /\b(curl|wget)\b[^|]*\|\s*(sudo\s+|env\s+)?(bash|sh|zsh|ksh|dash|python3?|node)\b/.test(cmd);
}

// A pipeline ending in a BARE shell interpreter (`| sh` / `| bash` / `| zsh` /
// `| ksh` / `| dash`, optionally via `sudo`/`env`, with trailing flags like `-s --`)
// where an UPSTREAM stage is an OPAQUE decoder or fetcher. Same risk class as the
// already-blocked curl|wget|sh: the bytes the shell runs are not auditable from the
// command line, so decode-then-exec is treated as a blocked chain regardless of the
// obfuscation layer (base64 -d / xxd -r / openssl enc -d / printf-of-hex / curl / wget).
//
// Deliberately NOT triggered by a transparent local source: `cat script.sh | bash`
// and `printf "echo ok" | bash` stay allowed — `cat` and plain-text `printf` are not
// opaque. Only the obfuscation/fetch decoders below arm the block.
function isDecodeExecuteChain(cmd) {
  // Terminal stage must be a bare shell interpreter (NOT python/node here — that is
  // the curl|wget download-exec surface; this is specifically the decode-pipe-to-shell
  // class). Allow optional sudo/env prefix and trailing interpreter flags.
  // NOTE: decode-pipe to a NON-shell interpreter (python/perl/node/ruby) is handled by
  // the coworker role gate (isDecodeExecToInterpreter), not globally — so a benign
  // non-role `echo data | base64 -d | python3` is NOT over-blocked, while the same
  // chain feeding a role-file mutation DENIES (H2). Keeping shells global preserves the
  // existing HI-12 contract + matrix/smoke expectations.
  const endsInShell = /\|\s*(?:sudo\s+|env\s+(?:[A-Za-z_][A-Za-z0-9_]*=\S*\s+)*)*(?:bash|sh|zsh|ksh|dash)\b[^|]*$/.test(cmd);
  if (!endsInShell) return false;
  // An upstream stage is an opaque decoder/fetcher.
  const hasOpaqueSource =
    /\bbase64\b[^|]*(?:\s-d\b|\s-D\b|\s--decode\b)/.test(cmd) ||      // base64 decode (GNU -d, BSD -D, --decode)
    /\bbase32\b[^|]*(?:\s-d\b|\s--decode\b)/.test(cmd) ||             // base32 decode
    /\bxxd\b[^|]*\s-r\b/.test(cmd) ||                                 // xxd reverse (hex -> bytes)
    /\bopenssl\b[^|]*\benc\b[^|]*\s-d\b/.test(cmd) ||                 // openssl enc -d (decrypt/decode)
    /\bopenssl\b[^|]*\bbase64\b[^|]*\s-d\b/.test(cmd) ||              // openssl base64 -d
    /\bprintf\b[^|]*(?:\\x[0-9a-fA-F]|\\[0-7]{1,3}|%b)/.test(cmd) ||  // printf of hex/octal/%b escapes (obfuscated)
    /\b(?:gzip|gunzip|zcat|bzip2|bunzip2|xz|unxz|zstd)\b[^|]*\s-d?c?\b/.test(cmd) || // decompress-to-stdout
    /\b(?:gunzip|zcat|bunzip2|unxz)\b/.test(cmd) ||                   // bare decompressors (stdout by default in a pipe)
    /\b(?:tr|rev|uudecode)\b/.test(cmd) ||                            // byte-transform / uudecode obfuscators
    /\b(?:curl|wget)\b/.test(cmd);                                    // fetch-then-decode-then-exec
  return hasOpaqueSource;
}

// Matches bash/sh/zsh/ksh/dash with -c or combined flags like -lc, -ic
function extractShellWrapper(cmd) {
  if (!/^(?:bash|sh|zsh|ksh|dash)\b/.test(cmd)) return null;
  const m = cmd.match(/-[a-zA-Z]*c\s+["']([^"']+)["']/);
  return m ? m[1] : null;
}

function isBlockedShellWrapper(cmd) {
  const inner = extractShellWrapper(cmd);
  if (!inner) return false;
  return isBlockedInner(inner) || isDownloadExecuteChain(inner) ||
    isDecodeExecuteChain(inner) || !!isBlockedForCoworker(inner);
}

// ── Two-role operator gate (dev / coworker) ──────────────────────────────────
// Role resolves via _SYSTEM/Scripts/yuri-operator.cjs (owner passphrase = dev key).
// FAIL CLOSED: if the role module is broken but a dev-credential exists, the system
// WAS installed -> treat as coworker (tamper). If no module and no credential, the
// role system is simply not installed -> unrestricted (dev).
let _roleCache = null;
function activeRole() {
  if (_roleCache) return _roleCache;
  try {
    _roleCache = require(OPERATOR_MODULE).resolveRole();
  } catch {
    try { _roleCache = require('fs').existsSync(CRED_FILE_PATH) ? 'coworker' : 'dev'; }
    catch { _roleCache = 'dev'; }
  }
  return _roleCache;
}

// Role/credential/guard TRUST surface for the coworker gate. Single-sourced from
// lane-kernel's canonical ROLE_TRUST_SURFACES (Node 25 require(esm) interop) so this
// guard and operator-write-guard.js can never drift. The canonical surface is the UNION
// (full enforcement-hook set), so collapsing onto it EXPANDS this guard's coverage from
// the historical 4 paths to the full trust surface — strictly more protective for coworker.
// Fail-closed: if the canonical import fails, fall back to the FULL union (mirror of
// lane-kernel ROLE_TRUST_SURFACES files+dirs) so the degraded path protects the SAME
// surface as the live path — never the narrower historical 4-path set, which would
// fail-open the enforcement hooks added by the collapse. Matched by substring
// (cmd.includes), so files and the dir prefix flatten into one list.
const PROTECTED_ROLE_PATHS_FALLBACK = [
  '_SYSTEM/Scripts/yuri-operator.cjs',
  '_SYSTEM/SELF/dev-credential.json',
  '.claude/hooks/bash-security-guard.js',
  '.claude/hooks/operator-write-guard.js',
  '.claude/hooks/claude-protocol-guard.js',
  '.claude/hooks/claude-protocol-guard.mjs',
  '.claude/hooks/agent-spawn-guard.js',
  '.claude/hooks/pre-tool-gate.js',
  '.claude/hooks/musubi-protocol-enforce.js',
  '.claude/hooks/tirith-url-guard.js',
  '.claude/hooks/operator-guard',
];
let PROTECTED_ROLE_FILE_RELS;
let PROTECTED_ROLE_DIR_RELS;
try {
  const kernel = require(path.resolve(__dirname, '..', '..', '_SYSTEM', 'Scripts', 'lane-kernel.mjs'));
  if (!kernel.ROLE_TRUST_SURFACES || !Array.isArray(kernel.ROLE_TRUST_SURFACES.files) ||
      kernel.ROLE_TRUST_SURFACES.files.length === 0) {
    throw new Error('lane-kernel ROLE_TRUST_SURFACES missing/empty');
  }
  PROTECTED_ROLE_FILE_RELS = kernel.ROLE_TRUST_SURFACES.files.slice();
  PROTECTED_ROLE_DIR_RELS = (kernel.ROLE_TRUST_SURFACES.dirs || []).slice();
} catch (_err) {
  // Fail CLOSED: split the historical fallback into files + dir(s).
  PROTECTED_ROLE_FILE_RELS = PROTECTED_ROLE_PATHS_FALLBACK.filter((p) => p !== '.claude/hooks/operator-guard');
  PROTECTED_ROLE_DIR_RELS = ['.claude/hooks/operator-guard'];
}
// Kept for the legacy contiguous-substring fast path (defense-in-depth, not the
// only gate anymore). Union of files + dirs, exactly as before the hardening.
const PROTECTED_ROLE_PATHS = [...PROTECTED_ROLE_FILE_RELS, ...PROTECTED_ROLE_DIR_RELS];

const REPO_ROOT_ABS = path.resolve(__dirname, '..', '..');
// Absolute, realpath-resolved canonical surface. realpathSync collapses symlinks so
// a coworker cannot launder a write through a symlinked path; fall back to the lexical
// absolute when the entry does not exist on disk yet. Mirror of operator-write-guard.js.
function realpathOrSelf(absPath) {
  try { return require('fs').realpathSync(absPath); } catch { return absPath; }
}
const PROTECTED_ROLE_FILES_ABS = PROTECTED_ROLE_FILE_RELS.map(
  (p) => realpathOrSelf(path.resolve(REPO_ROOT_ABS, p)).toLowerCase());
const PROTECTED_ROLE_DIRS_ABS = PROTECTED_ROLE_DIR_RELS.map(
  (p) => realpathOrSelf(path.resolve(REPO_ROOT_ABS, p)).toLowerCase());
// Basenames of the protected FILES only (dirs are matched by prefix, not basename, so
// a benign token like `operator-guard` does not arm the basename defense-in-depth).
const PROTECTED_ROLE_BASENAMES = new Set(PROTECTED_ROLE_FILE_RELS.map((p) => path.basename(p)));

// realpath the target, or — for a path that does not exist yet — its nearest existing
// ancestor, then re-join the unresolved tail. Lexical path.resolve does NOT collapse
// symlinks, so this is required to compare by true on-disk identity. Fail-closed: never
// throw; fall back to the lexical absolute. Mirror of operator-write-guard.js canonicalize.
function canonicalizeAbs(absPath) {
  const fs = require('fs');
  try { return fs.realpathSync(absPath); } catch { /* may not exist yet */ }
  let dir = path.dirname(absPath);
  const tail = [path.basename(absPath)];
  while (dir && dir !== path.dirname(dir)) {
    try { return path.join(fs.realpathSync(dir), ...tail.slice().reverse()); } catch { /* climb */ }
    tail.push(path.basename(dir));
    dir = path.dirname(dir);
  }
  return absPath;
}

// True if an absolute path resolves onto a protected role FILE or inside a protected
// role DIR. Case-insensitive (macOS/APFS). Compares the realpath-canonicalized form.
function absHitsProtected(absPath) {
  if (!absPath) return false;
  const cand = canonicalizeAbs(absPath).toLowerCase();
  if (PROTECTED_ROLE_FILES_ABS.includes(cand)) return true;
  for (const d of PROTECTED_ROLE_DIRS_ABS) {
    if (cand === d || cand.startsWith(d + path.sep)) return true;
  }
  return false;
}

// Strip a leading `VAR=` assignment, surrounding quotes, and a `>`/`>>` redirect glyph
// so a raw token resolves to a comparable path. Returns '' for non-path tokens.
function tokenToPathCandidate(tok) {
  let t = unquote(tok);
  // var assignment: F=.claude/hooks/x.js  -> .claude/hooks/x.js
  const eq = t.indexOf('=');
  if (eq > 0 && /^[A-Za-z_][A-Za-z0-9_]*$/.test(t.slice(0, eq))) t = t.slice(eq + 1);
  t = unquote(t);
  // strip a leading redirect glyph fused to the path (>file / >>file)
  t = t.replace(/^>>?/, '');
  // strip a trailing ; or , that toks() may leave attached
  t = t.replace(/[;,]+$/, '');
  return t;
}

// True if a token contains a shell BRACE construct: a comma alternation `{a,b}` OR a
// numeric/alpha sequence `{a..b}`. A single brace pair with no comma and no `..` (e.g.
// `{tirith-url-guard}`) is still a brace the shell strips to its literal content, so it
// is treated as a brace too — `hasBrace` is the trigger, `expandBraces` does the work.
function hasBrace(s) { return s.indexOf('{') !== -1 && s.indexOf('}') !== -1; }

// Enumerate a shell brace expansion to its concrete strings (cartesian over comma
// alternatives, expanded `{a..b}` sequences). Returns null when the construct is too
// large/complex to safely enumerate (caller fail-closes). Bounded so a hostile
// `{a..99999}` over a role path cannot DoS — an un-enumerable brace over a role-prefixed
// token is treated as a hit upstream, so the bound never weakens protection.
const BRACE_MAX_EXPANSIONS = 256;
function expandBraceSeq(lo, hi) {
  // {a..b}: numeric (1..5, 05..10) or single-char alpha (a..e). Returns array or null.
  const num = /^-?\d+$/;
  if (num.test(lo) && num.test(hi)) {
    const a = parseInt(lo, 10), b = parseInt(hi, 10);
    const width = (lo.replace('-', '').length > 1 && lo.startsWith('0')) ? lo.replace('-', '').length : 0;
    const out = [];
    const step = a <= b ? 1 : -1;
    for (let i = a; step > 0 ? i <= b : i >= b; i += step) {
      if (out.length >= BRACE_MAX_EXPANSIONS) return null;
      out.push(width ? String(Math.abs(i)).padStart(width, '0') : String(i));
    }
    return out;
  }
  if (/^[A-Za-z]$/.test(lo) && /^[A-Za-z]$/.test(hi)) {
    const a = lo.charCodeAt(0), b = hi.charCodeAt(0);
    const out = [];
    const step = a <= b ? 1 : -1;
    for (let i = a; step > 0 ? i <= b : i >= b; i += step) {
      if (out.length >= BRACE_MAX_EXPANSIONS) return null;
      out.push(String.fromCharCode(i));
    }
    return out;
  }
  return null; // mixed/multi-char sequence endpoints -> un-enumerable
}
function expandBraces(token) {
  // Expand the LEFTMOST brace, recurse on the remainder. Returns array of strings, or
  // null if any brace is un-enumerable (so the caller fail-closes for role paths).
  const open = token.indexOf('{');
  if (open === -1) return [token];
  // Find the matching close for this open (no nesting support — bail to fail-closed).
  const close = token.indexOf('}', open);
  if (close === -1) return [token];
  const inner = token.slice(open + 1, close);
  if (inner.indexOf('{') !== -1) return null; // nested brace -> un-enumerable, fail closed
  const pre = token.slice(0, open);
  const post = token.slice(close + 1);
  let alts;
  const seq = inner.match(/^([^.]+)\.\.([^.]+)$/);
  if (seq) {
    alts = expandBraceSeq(seq[1], seq[2]);
    if (alts === null) return null; // un-enumerable sequence -> fail closed
  } else {
    alts = inner.split(','); // comma alternation (single element if no comma -> [inner])
  }
  const out = [];
  for (const alt of alts) {
    const tails = expandBraces(pre + alt + post);
    if (tails === null) return null;
    for (const t of tails) {
      if (out.length >= BRACE_MAX_EXPANSIONS) return null;
      out.push(t);
    }
  }
  return out;
}

// A shell GLOB token (`.claude/hooks/tirith-url-guard.*`) never realpaths onto a
// concrete protected file, so the exact-path walk misses it — yet the shell expands it
// onto the live guard at run time. Convert the glob to an anchored regex and test it
// against every protected role file / dir absolute path: if the pattern would expand
// onto the surface, the mutation hits it. Also enumerates BRACE expansions ({a,b} /
// {a..b}) — an un-enumerable brace over a role-prefixed path fail-closes to true.
// Fail-closed; never throws.
function globHitsProtected(absGlob) {
  // ── Brace handling first: enumerate, then test each concrete expansion ──────────
  if (hasBrace(absGlob)) {
    const expansions = expandBraces(absGlob);
    if (expansions === null) {
      // Un-enumerable brace. Fail-closed ONLY when it sits over a role-prefixed path
      // (any protected role dir/file prefix shares the leading path), so a benign
      // non-role `src/{...}` un-enumerable brace does not over-block.
      return braceOverRolePrefix(absGlob);
    }
    for (const e of expansions) {
      if (globHitsProtected(e)) return true; // recurse: an expansion may still hold a glob
    }
    return false;
  }
  if (!/[*?\[]/.test(absGlob)) return absHitsProtected(absGlob);
  let re;
  try {
    const esc = absGlob.toLowerCase()
      .replace(/[.+^${}()|\\]/g, '\\$&')   // escape regex metas (NOT the glob ones)
      .replace(/\*/g, '[^/]*')              // * -> any run within a path segment
      .replace(/\?/g, '[^/]')               // ? -> one char within a segment
      .replace(/\[[^\]]*\]/g, '[^/]');      // [..] class -> one char (coarse, safe)
    re = new RegExp('^' + esc + '$');
  } catch { return true; } // unparseable glob over a protected-looking path -> fail closed
  for (const f of PROTECTED_ROLE_FILES_ABS) if (re.test(f)) return true;
  for (const d of PROTECTED_ROLE_DIRS_ABS) {
    if (re.test(d) || re.test(d + path.sep)) return true;
  }
  return false;
}

// True if an (un-enumerable) brace token's fixed PREFIX (everything before the first
// `{`) lies on the path to a protected role file/dir — i.e. the brace could expand onto
// the surface but we cannot prove it won't. Case-insensitive. Used only to fail-closed
// an un-enumerable brace WITHOUT over-blocking a clearly-non-role brace.
function braceOverRolePrefix(absGlob) {
  const open = absGlob.toLowerCase().indexOf('{');
  const prefix = (open === -1 ? absGlob.toLowerCase() : absGlob.toLowerCase().slice(0, open));
  if (!prefix) return true; // brace at position 0 over an unknown path -> fail closed
  for (const f of PROTECTED_ROLE_FILES_ABS) {
    if (f.startsWith(prefix) || prefix.startsWith(f)) return true;
  }
  for (const d of PROTECTED_ROLE_DIRS_ABS) {
    if (d.startsWith(prefix) || prefix.startsWith(d + path.sep) || prefix.startsWith(d)) return true;
  }
  return false;
}

// Resolve a single command token to an absolute path and test it against the surface.
// Skips obvious flags and empty tokens. Handles both repo-relative and absolute inputs.
function tokenHitsProtected(tok) {
  const cand = tokenToPathCandidate(tok);
  if (!cand || cand.startsWith('-')) return false;
  // Only treat tokens that look like a path or a known protected basename.
  const looksPathy = cand.includes('/') || cand.includes('.') || PROTECTED_ROLE_BASENAMES.has(cand);
  if (!looksPathy) return false;
  const abs = path.isAbsolute(cand) ? path.resolve(cand) : path.resolve(REPO_ROOT_ABS, cand);
  if (globHitsProtected(abs)) return true;
  return absHitsProtected(abs);
}

// Mutating verbs anywhere in the token stream (not just parts[0]). cd-split, xargs,
// var-indirection and find -delete all hide the verb away from position 0.
//   - chmod 000 <guard> neuters a guard without touching its bytes -> mutation.
//   - rsync /dev/null <guard> truncates/clobbers the target -> mutation.
const MUTATING_VERBS = new Set(['rm', 'mv', 'cp', 'dd', 'truncate', 'tee', 'ln', 'shred', 'install', 'chmod', 'rsync']);
function hasMutatingVerbAnywhere(parts) {
  for (let i = 0; i < parts.length; i++) {
    const t = unquote(parts[i]);
    if (MUTATING_VERBS.has(t)) return true;
    if (t === 'sed' && parts.slice(i + 1).some((x) => x === '-i' || /^-i/.test(x))) return true;
    if (t === 'find' && parts.slice(i + 1).some((x) => x === '-delete' || x === '-fprint' || x === '-fprintf')) return true;
  }
  // output redirection (> or >>) anywhere
  if (/(^|\s)>>?/.test(parts.join(' '))) return true;
  return false;
}

// SURFACE-WIDE destructive git ops — they revert/clobber the WHOLE tracked
// enforcement-hook surface irrespective of any named path, so they DENY in coworker
// role unconditionally (not a toothless advisory):
//   - git reset --hard <any ref>  : nukes the worktree to <ref>, reverting every hook
//   - git restore --source=<ref>  : pulls an arbitrary old blob over the worktree
// (plain `git checkout <file>` / `git restore <file>` are NOT surface-wide; they are
//  caught path-scoped by the contiguous-substring / token walk below, which preserves
//  the legit `git restore src/app.js` allow.)
function isDestructiveGitRoleOp(parts) {
  for (let i = 0; i < parts.length - 1; i++) {
    if (parts[i] !== 'git') continue;
    const sub = parts[i + 1];
    const rest = parts.slice(i + 2);
    if (sub === 'reset' && rest.some((x) => x === '--hard')) return true;
    if (sub === 'restore' && rest.some((x) => x === '--source' || /^--source=/.test(x))) return true;
  }
  return false;
}

// Path-scoped git ops: `git checkout <path>` / `git restore <path>` only matter when
// the path is a protected role file. Kept separate from the surface-wide check so a
// legit `git restore src/app.js` (no role path) is allowed.
function isPathScopedGitRoleOp(parts) {
  for (let i = 0; i < parts.length - 1; i++) {
    if (parts[i] !== 'git') continue;
    const sub = parts[i + 1];
    if (sub !== 'checkout' && sub !== 'restore') continue;
    for (const tok of parts.slice(i + 2)) {
      if (tokenHitsProtected(tok)) return true;
      const cand = tokenToPathCandidate(tok);
      if (cand && !cand.includes('/') && PROTECTED_ROLE_BASENAMES.has(cand)) return true;
    }
  }
  return false;
}

function isGitPush(cmd) {
  const parts = toks(cmd);
  for (let i = 0; i < parts.length - 1; i++) {
    if (parts[i] === 'git' && parts[i + 1] === 'push') return true;
  }
  return false;
}

function isGitRemoteMutation(cmd) {
  const parts = toks(cmd);
  for (let i = 0; i < parts.length - 2; i++) {
    if (parts[i] === 'git' && parts[i + 1] === 'remote' &&
        ['add', 'set-url', 'remove', 'rename', 'rm'].includes(parts[i + 2])) return true;
  }
  return false;
}

function isOwnerOnlyOp(cmd) {
  // Setting/rotating the dev passphrase is owner-only.
  return /yuri-operator(\.cjs)?\b[\s\S]*\binit-dev\b/.test(cmd);
}

// ── ROBUST FAIL-CLOSED ROLE GATE (Round 3) ───────────────────────────────────
// Structural posture: compute roleSignal (does the command TOUCH the role surface)
// independently of verb detection, then DENY (coworker) when roleSignal AND
// (mutatingVerb OR an obfuscation/exec construct). This closes verb-laundering
// (cmd-subst / var-indirection / inline interpreter) that previously bailed the gate
// BEFORE the protected-path walk. A coworker may still READ a role file (no verb, no
// construct -> ALLOW); ANY mutation or exec/obfuscation construct over the surface
// DENIES. roleSignal gates the over-approximation so NON-role obfuscation stays ALLOW.

// A protected role BASENAME appears literally anywhere in the raw command string. This
// is the last-resort signal for forms where the path rode inside a cmd-substitution,
// an interpreter -e/-c argument, or a token the realpath walk could not resolve. Word-
// boundary-anchored on the basename so a SUPERSTRING (tirith-url-guard.js.bak) does not
// arm it — only the exact protected basename (optionally followed by a non-word char).
const _ROLE_BASENAME_RES = Array.from(PROTECTED_ROLE_BASENAMES).map((b) => {
  const esc = b.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // LEADING boundary: start-of-string OR a char that cannot be part of a longer
  // basename — but a path separator `/` (or `.`/`-`/quote) MUST be allowed before it,
  // since `.claude/hooks/tirith-url-guard.js` has a `/` right before the basename.
  // So forbid only an alnum/underscore immediately before (that would mean a longer
  // identifier). TRAILING boundary: forbid a continuation char so a SUPERSTRING
  // (tirith-url-guard.js.bak / ...jsX) does NOT arm it — only the exact basename.
  return new RegExp('(?:^|[^A-Za-z0-9_])' + esc + '(?![A-Za-z0-9_.-])');
});
function commandStringHitsRoleBasename(cmd) {
  for (const re of _ROLE_BASENAME_RES) if (re.test(cmd)) return true;
  return false;
}

// A decode-exec chain hides its real payload inside an opaque blob (base64/hex), so the
// literal-basename scan above misses it. Pull candidate encoded tokens out of the
// command, attempt base64 / hex decode, and re-scan the DECODED text for a protected
// role basename. This is what separates H2 (`echo <b64:rm rolefile> | base64 -d | python3`,
// decodes to a role-file mutation -> DENY) from a benign `echo data | base64 -d | python3`
// (`data` is not valid role-bearing payload -> stays ALLOW). Fail-closed but bounded;
// only consults decoders that actually appear in the chain. Never throws.
function decodedPayloadHitsRoleBasename(cmd) {
  // Only bother if a decoder is present in the pipeline at all.
  const hasB64 = /\bbase64\b[^|]*(?:\s-d\b|\s-D\b|\s--decode\b)/.test(cmd);
  const hasHex = /\bxxd\b[^|]*\s-r\b/.test(cmd);
  if (!hasB64 && !hasHex) return false;
  // Candidate encoded tokens: long-ish [A-Za-z0-9+/=] runs (base64) or hex runs.
  const candidates = [];
  const b64Re = /[A-Za-z0-9+/]{8,}={0,2}/g;
  const hexRe = /\b[0-9a-fA-F]{8,}\b/g;
  let m;
  if (hasB64) { while ((m = b64Re.exec(cmd)) !== null) candidates.push(['base64', m[0]]); }
  if (hasHex) { while ((m = hexRe.exec(cmd)) !== null) candidates.push(['hex', m[0]]); }
  for (const [kind, blob] of candidates) {
    let decoded = '';
    try {
      decoded = kind === 'base64'
        ? Buffer.from(blob, 'base64').toString('utf8')
        : Buffer.from(blob, 'hex').toString('utf8');
    } catch { continue; }
    if (!decoded) continue;
    if (commandStringHitsRoleBasename(decoded)) return true;
  }
  return false;
}

// Normalize whitespace-laundering + eval-wrapping BEFORE tokenizing for the role scan:
//   - `${IFS}` / `$IFS` -> space (a coworker can fuse `chmod${IFS}000${IFS}<rolefile>`
//     into one token to dodge the per-token verb/path walk).
//   - `eval` is a transparent wrapper: `eval "rm <rolefile>"` runs its quoted string as
//     a command, so strip a leading `eval` and unquote the rest so the inner verb+path
//     surface again. (Bounded, lexical — enough to re-expose the laundered tokens.)
// Used ONLY to compute the role scan; never mutates the command actually run/echoed.
function normalizeForRoleScan(cmd) {
  let s = cmd.replace(/\$\{IFS\}/g, ' ').replace(/\$IFS\b/g, ' ');
  // unwrap a leading `eval` (optionally `eval -- "..."`), re-exposing its inner command
  const ev = s.match(/^\s*eval\s+(?:--\s+)?(.*)$/);
  if (ev) {
    let inner = ev[1].trim();
    // strip ONE layer of surrounding quotes if the whole remainder is quoted
    if (inner.length >= 2 && ((inner[0] === '"' && inner[inner.length - 1] === '"') ||
        (inner[0] === "'" && inner[inner.length - 1] === "'"))) {
      inner = inner.slice(1, -1);
    }
    s = inner;
  }
  return s;
}

// A construct where a role basename can hide OUTSIDE a resolvable path token. Used to
// scope the raw-string basename scan so it does NOT override the realpath verdict on a
// plain `dir/basename` token (e.g. `rm src/pre-tool-gate.js` -> must stay ALLOW), while
// still arming on: cmd-subst / backtick, an inline interpreter (`-e/-c`), OR a pipe whose
// terminal stage is a script interpreter (printf-hex / decode pipe into python|perl|node|
// ruby — A7), where the upstream literal carries the role basename.
function hasHidingConstruct(cmd, parts) {
  if (/\$\([^)]*\)/.test(cmd) || /`[^`]*`/.test(cmd)) return true;
  // HOLE A (round 4): a here-string `<<<` or process-substitution `<(...)` feeds a literal
  // payload to a shell/interpreter WITHOUT a pipe or a resolvable path token — the role
  // basename rides inside the here-doc body. Treat it as a hiding construct so the
  // construct-scoped literal scan can arm (`sh <<< "rm <rolefile>"` -> DENY). A non-role
  // body (`sh <<< "echo hi"`) still ALLOWS — roleSignal needs the basename to match.
  if (/<<<|<\(/.test(cmd)) return true;
  const INTERP = new Set(['perl', 'python', 'python3', 'node', 'nodejs', 'ruby']);
  const hasEvalFlag = parts.some((p) => p === '-e' || p === '-c' || /^-[a-zA-Z]*[ec]$/.test(p));
  for (let i = 0; i < parts.length; i++) {
    if (INTERP.has(unquote(parts[i])) && hasEvalFlag) return true;
  }
  // pipe terminating in a script interpreter (printf/decode -> python|perl|node|ruby)
  if (/\|\s*(?:sudo\s+|env\s+(?:[A-Za-z_][A-Za-z0-9_]*=\S*\s+)*)*(?:python3?|perl|node|nodejs|ruby)\b[^|]*$/.test(cmd)) return true;
  return false;
}

// roleSignal: ANY token realpath/glob/brace-resolves onto the surface, OR a bare
// protected basename token, OR (only inside a hiding construct) a role basename literal
// in the string, OR a decoded b64/hex payload that carries a role basename. Path-boundary
// aware + construct-scoped, so a same-basename DIFFERENT-dir file the realpath walk
// cleared, and a scratch `*.bak`/superstring, do NOT arm it.
function roleSignal(cmd, parts) {
  for (const tok of parts) {
    if (tokenHitsProtected(tok)) return true;
    const cand = tokenToPathCandidate(tok);
    if (cand && !cand.includes('/') && PROTECTED_ROLE_BASENAMES.has(cand)) return true;
  }
  // Raw-string basename scan ONLY when a hiding construct is present (cmd-subst /
  // backtick / interpreter -e/-c). Otherwise a plain `dir/basename` token's realpath
  // verdict above is authoritative — never overridden by a bare literal match.
  // ROUND-4 OVER-BLOCK FIX: a literal role basename inside a hiding construct is NOT, by
  // itself, a role-surface op — it can be a passive arg to a non-mutating head
  // (echo / printf / git commit -m / grep / a comment / an interpreter print). Tie the
  // literal-basename signal to a mutating-verb-or-exec-mutation check, mirroring how the
  // realpath token path defers to hasMutatingVerbAnywhere. So `echo $(date) "<rolefile>"`,
  // `git commit -m "$(basename <rolefile>)"`, and `node -e "console.log(<rolefile>)"` no
  // longer arm roleSignal (the read/print stays ALLOW), while a mutation still does.
  if (hasHidingConstruct(cmd, parts) && commandStringHitsRoleBasename(cmd) &&
      literalBasenameHasMutationContext(cmd, parts)) return true;
  if (decodedPayloadHitsRoleBasename(cmd)) return true; // H2: role path hidden in a b64/hex blob
  return false;
}

// Decide whether a construct-scoped literal role basename sits in a MUTATING context, vs.
// a passive arg to a non-mutating head. Armed when ANY of:
//   - a real mutating verb token appears anywhere (rm/mv/cp/chmod/... or sed -i / find
//     -delete / a `>`/`>>` redirect) — hasMutatingVerbAnywhere,
//   - an inline interpreter `-e/-c` script carries a mutation against the role surface,
//   - a cmd-subst / backtick body itself contains a mutating verb (`$(rm <rolefile>)`,
//     `` `mv <rolefile> x` ``) — the verb hid inside the substitution.
// NOT armed for: `echo $(date) "<rolefile>"`, `git commit -m "fix $(basename <rolefile>)"`,
// `grep X <rolefile>` inside a construct, `node -e "console.log(<rolefile>)"` — all passive.
function literalBasenameHasMutationContext(cmd, parts) {
  if (hasMutatingVerbAnywhere(parts)) return true;
  if (isInlineInterpreterRoleOp(cmd, parts)) return true;
  // A decode-exec chain feeding a script interpreter (printf-hex / base64 -d | python|perl|
  // node|ruby) hides the mutating verb inside the encoded blob (`printf "\x72\x6d <rolefile>"
  // | python3` -> "rm <rolefile>"). The chain IS the exec-of-an-obfuscated-payload, so over a
  // role basename it counts as mutation context (A7). A non-role payload never reaches here —
  // roleSignal's literal-basename arm already requires the protected basename to be present.
  if (isDecodeExecToInterpreter(cmd)) return true;
  // a here-string / proc-sub body carrying a mutating verb (`sh <<< "rm <rolefile>"`)
  if (/<<<|<\(/.test(cmd) && hereOrProcSubBodyHasMutation(cmd)) return true;
  // a mutating verb INSIDE a $(...) / backtick substitution body, a here-string `<<<`
  // body, or a process-substitution `<(...)` body (the verb hid inside the construct,
  // away from the per-token walk — `sh <<< "rm <rolefile>"`, `$(rm <rolefile>)`).
  const subBodies = [];
  let m;
  const dollarRe = /\$\(([^)]*)\)/g;
  while ((m = dollarRe.exec(cmd)) !== null) subBodies.push(m[1]);
  const tickRe = /`([^`]*)`/g;
  while ((m = tickRe.exec(cmd)) !== null) subBodies.push(m[1]);
  const procSubRe = /<\(([^)]*)\)/g;
  while ((m = procSubRe.exec(cmd)) !== null) subBodies.push(m[1]);
  // here-string body: everything after `<<<` up to a pipe/semicolon/logical-op, unquoted.
  const hsRe = /<<<\s*(.+?)(?:\s*(?:[|;&]|$))/g;
  while ((m = hsRe.exec(cmd)) !== null) subBodies.push(unquote(m[1].trim()));
  for (const body of subBodies) {
    if (hasMutatingVerbAnywhere(toks(body))) return true;
  }
  return false;
}

// A MUTATING op against a role file expressed INSIDE an interpreter `-e/-c` script, OR
// inside a passive head's literal arg. Distinguishes `node -e "...unlinkSync(rolefile)"`
// (mutation -> DENY) from `node -e "console.log(rolefile)"` / `readFileSync(rolefile)`
// (read/print -> ALLOW). Conservative: matches the destructive fs/os/shell verbs a
// coworker would use to tamper with a role file. Over-block fix (round 4): the bare
// presence of a role basename in an interpreter/cmd-string is NO LONGER a mutation — only
// a destructive verb is. New verbs here only EXPAND the deny set; absence ALLOWS the read.
//  - fs:    unlink/unlinkSync, rm/rmSync, writeFile*, appendFile*, truncate*, chmod*,
//           rename*, copyFile*, createWriteStream, open(..,'w'/'a'/'r+'/'w+'/'a+')
//  - os/py: os.remove/unlink/rename/replace/truncate/chmod, shutil.move/copy/rmtree,
//           open(.., 'w'/'a'/'r+' ...)
//  - perl/ruby: unlink, File.delete/File.unlink/File.rename/File.write/FileUtils.*
//  - shell-out: system/exec/spawn/popen/qx/backtick carrying rm|mv|cp|dd|truncate|
//               chmod|tee|>|>>|shred|ln (a verb the per-token walk would have caught)
const _INTERP_MUTATION_RE = new RegExp(
  // node/js fs mutations
  '\\b(?:unlink(?:Sync)?|rmSync|rm)\\s*\\(' +
  '|\\bwriteFile(?:Sync)?\\s*\\(' +
  '|\\bappendFile(?:Sync)?\\s*\\(' +
  '|\\btruncate(?:Sync)?\\s*\\(' +
  '|\\bchmod(?:Sync)?\\s*\\(' +
  '|\\brename(?:Sync)?\\s*\\(' +
  '|\\bcopyFile(?:Sync)?\\s*\\(' +
  '|\\bcreateWriteStream\\s*\\(' +
  // python / generic os + shutil + perl/ruby File ops
  '|\\bos\\.(?:remove|unlink|rename|replace|truncate|chmod|rmdir)\\b' +
  '|\\bshutil\\.(?:move|copy2?|copyfile|rmtree)\\b' +
  '|\\bFile\\.(?:delete|unlink|rename|write|open)\\b' +
  '|\\bFileUtils\\.(?:rm|rm_rf|rm_r|mv|cp|cp_r)\\b' +
  '|\\bunlink\\b' +
  // open(..) in a WRITE/append/update mode (python/perl/ruby/node)
  "|\\bopen\\s*\\([^)]*,\\s*['\"][rwa]?\\+?[bt]?['\"]" +
  "|\\bopen\\s*\\([^)]*,\\s*['\"][wa][b+t]*['\"]" +
  // shell-out wrappers carrying a destructive verb
  '|\\b(?:system|exec|execSync|spawn|spawnSync|popen|fork|qx)\\b[\\s\\S]*?' +
    '\\b(?:rm|mv|cp|dd|truncate|chmod|shred|tee|ln)\\b' +
  '|`[^`]*\\b(?:rm|mv|cp|dd|truncate|chmod|shred|tee|ln)\\b[^`]*`',
  '');
function interpScriptHasMutation(cmd) {
  if (_INTERP_MUTATION_RE.test(cmd)) return true;
  // a raw redirect to a role file inside the script (echo X > rolefile)
  if (/>>?\s*['"]?[^'"\s|;&]*[A-Za-z0-9_-]/.test(cmd) && /[A-Za-z0-9_-]\s*>>?/.test(cmd)) {
    // only count a redirect when it co-occurs with a protected basename (caller is role-scoped)
    if (/>\s*['"]?\S*(?:operator|guard|gate|protocol|enforce|credential|cjs|tirith)/i.test(cmd)) return true;
  }
  return false;
}

// An inline interpreter (`perl -e` / `python[3] -c` / `node -e` / `ruby -e`) whose
// SCRIPT argument carries a protected role basename AND a MUTATING op against it:
// `perl -e "system('rm <rolefile>')"` / `node -e "...unlinkSync(<rolefile>)"`.
// The role surface is touched INSIDE an opaque interpreter string the token walk cannot
// reach, so a literal-basename hit GATED ON A MUTATION is the signal. Round-4 fix: a
// pure READ/PRINT of a role basename (`node -e "console.log(rolefile)"` /
// `readFileSync(rolefile)` / `python3 -c "print(rolefile)"`) is parity with `cat` -> ALLOW.
// Role-scoped (roleSignal already gates the caller), so a benign non-role script is untouched.
function isInlineInterpreterRoleOp(cmd, parts) {
  const head = parts[0];
  const INTERP = new Set(['perl', 'python', 'python3', 'node', 'nodejs', 'ruby']);
  // detect `<interp> ... -e/-c ...` anywhere (head or after env/sudo)
  let interpAt = -1;
  for (let i = 0; i < parts.length; i++) {
    if (INTERP.has(unquote(parts[i]))) { interpAt = i; break; }
  }
  if (interpAt === -1 && !INTERP.has(head)) return false;
  const hasEvalFlag = parts.some((p) => p === '-e' || p === '-c' || /^-[a-zA-Z]*[ec]$/.test(p));
  if (!hasEvalFlag) return false;
  // GATE: a role basename must be present AND a mutating op must act on the role surface.
  if (!commandStringHitsRoleBasename(cmd)) return false;
  return interpScriptHasMutation(cmd);
}

// Decode-exec pipe terminating in a NON-shell interpreter (python/perl/node/ruby) — the
// shell-terminated form is already globally blocked by isDecodeExecuteChain. Reuses that
// same opaque-source detector but for the script-interpreter tail, kept role-scoped so a
// benign `echo data | base64 -d | python3` on non-role bytes is NOT over-blocked.
function isDecodeExecToInterpreter(cmd) {
  const endsInInterp = /\|\s*(?:sudo\s+|env\s+(?:[A-Za-z_][A-Za-z0-9_]*=\S*\s+)*)*(?:python3?|perl|node|nodejs|ruby)\b[^|]*$/.test(cmd);
  if (!endsInInterp) return false;
  return /\bbase64\b[^|]*(?:\s-d\b|\s-D\b|\s--decode\b)/.test(cmd) ||
    /\bbase32\b[^|]*(?:\s-d\b|\s--decode\b)/.test(cmd) ||
    /\bxxd\b[^|]*\s-r\b/.test(cmd) ||
    /\bopenssl\b[^|]*\benc\b[^|]*\s-d\b/.test(cmd) ||
    /\bopenssl\b[^|]*\bbase64\b[^|]*\s-d\b/.test(cmd) ||
    /\bprintf\b[^|]*(?:\\x[0-9a-fA-F]|\\[0-7]{1,3}|%b)/.test(cmd) ||
    /\b(?:gzip|gunzip|zcat|bzip2|bunzip2|xz|unxz|zstd)\b[^|]*\s-d?c?\b/.test(cmd) ||
    /\b(?:gunzip|zcat|bunzip2|unxz)\b/.test(cmd) ||
    /\b(?:tr|rev|uudecode)\b/.test(cmd) ||
    /\b(?:curl|wget)\b/.test(cmd);
}

// True if a here-string `<<<` body or a process-substitution `<(...)` body contains a
// mutating verb (rm/mv/cp/chmod/... or sed -i / find -delete / a redirect). The body is
// where a coworker hides the verb away from the per-token walk. Read-only bodies return
// false (so `sh <<< "cat <rolefile>"` is NOT an exec construct -> read parity).
function hereOrProcSubBodyHasMutation(cmd) {
  const bodies = [];
  let m;
  const hsRe = /<<<\s*(.+?)(?:\s*(?:[|;&]|$))/g;
  while ((m = hsRe.exec(cmd)) !== null) bodies.push(unquote(m[1].trim()));
  const procSubRe = /<\(([^)]*)\)/g;
  while ((m = procSubRe.exec(cmd)) !== null) bodies.push(m[1]);
  for (const body of bodies) {
    if (hasMutatingVerbAnywhere(toks(body))) return true;
  }
  return false;
}

// An obfuscation / exec construct that can launder a verb or a path past lexical token
// analysis: command-substitution `$(...)` / backticks, variable-indirection used as the
// command head (`$VAR <args>` or a `VAR=verb; $VAR ...` sequence), brace expansion, a
// here-string/proc-sub mutating body, a decode-exec pipe to a script interpreter, or an
// inline interpreter `-e/-c` carrying a role-basename mutation. Each is a way to TOUCH+ACT
// on the role surface without a bare verb token. Role-scoped by the caller (roleSignal),
// so none of these block a non-role path.
function hasObfuscationOrExecConstruct(cmd, parts) {
  // command substitution $(...) or backticks `...`
  if (/\$\([^)]*\)/.test(cmd) || /`[^`]*`/.test(cmd)) return true;
  // variable-indirection used as a command: a `$VAR` token at a command head position
  // (parts[0], or right after a `;`/`&&`/`||`/`|`). `$x rolefile` or `VAR=rm; $x file`.
  // HOLE B (round 4): a NEWLINE between the assignment and the use makes the prior token a
  // bare assignment (`cmd=rm`) rather than a `;`-terminated one, so the head was missed
  // (`cmd=rm\n$cmd <rolefile>` ALLOWed while the `;` form denied). Treat a `$VAR` / brace
  // `${VAR}` token as a command head when parts[i-1] is a bare assignment token
  // (VAR=value), closing the newline-laundering parity gap. A legit `FOO=bar\nnode app.js`
  // (no role path) still ALLOWs — roleSignal gates the whole construct on the surface.
  const ASSIGN_RE = /^[A-Za-z_][A-Za-z0-9_]*=/;
  for (let i = 0; i < parts.length; i++) {
    const t = parts[i];
    if (/^\$[A-Za-z_][A-Za-z0-9_]*$/.test(t) || /^\$\{[A-Za-z_][A-Za-z0-9_]*\}$/.test(t)) {
      if (i === 0) return true;
      const prev = parts[i - 1];
      if (prev === ';' || prev === '&&' || prev === '||' || prev === '|' ||
          prev.endsWith(';') || prev.endsWith('&&') || prev.endsWith('||') ||
          ASSIGN_RE.test(prev)) return true;
    }
  }
  // brace expansion anywhere
  for (const tok of parts) if (hasBrace(unquote(tok))) return true;
  // HOLE A (round 4): a here-string `<<<` / process-substitution `<(...)` whose BODY
  // carries a mutating verb is an exec-construct over the role surface
  // (`sh <<< "rm <rolefile>"`). Gated on a mutating body so a READ-via-here-string
  // (`sh <<< "cat <rolefile>"`) stays ALLOW — parity with a bare `cat <rolefile>`.
  if (/<<<|<\(/.test(cmd) && hereOrProcSubBodyHasMutation(cmd)) return true;
  // decode-exec pipe to a script interpreter (role-scoped sibling of isDecodeExecuteChain)
  if (isDecodeExecToInterpreter(cmd)) return true;
  // inline interpreter -e/-c carrying a role basename
  if (isInlineInterpreterRoleOp(cmd, parts)) return true;
  return false;
}

// ── IRREDUCIBLE RESIDUAL (round 4 — DO NOT chase this tail) ───────────────────────────
// isRolePathMutation is a STATIC command-string matcher. By construction it cannot catch:
//   (1) fully `printf '\xNN..'`-escaped payloads piped to a NON-shell interpreter where the
//       role path itself is hex/byte-escaped (not cleartext). decodedPayloadHitsRoleBasename
//       only decodes contiguous base64/hex BLOBS; a byte-interleaved or split-escape payload
//       reassembled at runtime is invisible to a lexical scan.
//   (2) `source /tmp/payload.sh` (or `. ./p.sh`, `bash p.sh`) where the actual mutation lives
//       in a SEPARATE file this matcher never opens or reads (Nemotron-found). The string
//       `source /tmp/payload.sh` carries no role basename and no verb.
//   (3) arbitrary RUNTIME-COMPUTED paths — a role path assembled from env/$(...)/string
//       math/`readlink` at execution time, never appearing literally in the command string.
// These are NOT bugs to fix here; chasing them is an unbounded obfuscation tail.
//
// WHY THAT IS ACCEPTABLE: this matcher is a FAIL-OPEN LAYER-2 CONSCIENCE for the coworker
// role — it raises the bar against casual / scripted tampering with the guard/role surface.
// It is NOT a sandbox and is NOT the hard boundary. The HARD boundary is, in order:
//   - the deterministic protected-path PreToolUse hooks (operator-write-guard.js + this
//     file's own .env / .claude / decode-exec dens, which fail CLOSED),
//   - the settings.json deny-list,
//   - filesystem permissions,
//   - and the owner-role trust-root (the scrypt dev passphrase — a coworker clone holds only
//     the hash, so it cannot become dev and cannot legitimately mutate the surface at all).
// A determined coworker who can already run arbitrary code (source-an-external-file, runtime
// path math) is outside this layer's threat model; the layers above are what stop them.
function isRolePathMutation(cmd) {
  const parts = toks(cmd);

  // (d) Surface-wide destructive git ops — reset --hard (any ref), restore --source.
  // A DENY, not an advisory. Independent of any named path (they revert the WHOLE
  // tracked surface). Path-scoped checkout/restore of a protected file also denies.
  if (isDestructiveGitRoleOp(parts)) return true;
  if (isPathScopedGitRoleOp(parts)) return true;

  // Normalized view: `${IFS}`/`$IFS` whitespace-laundering re-split, and a leading `eval`
  // wrapper unwrapped, so a verb/path fused or quoted past the raw tokenizer re-surfaces.
  const ncmd = normalizeForRoleScan(cmd);
  const nparts = ncmd === cmd ? parts : toks(ncmd);

  // ── Robust gate: roleSignal AND (mutatingVerb OR obfuscation/exec construct) ─────
  // Compute roleSignal FIRST and independently of verb detection, so a verb laundered
  // through $(...) / $VAR / an interpreter string / IFS-split / eval can no longer
  // short-circuit the gate before the protected-path test (the H1/R bypass class).
  // Evaluate against BOTH the raw and the normalized view; either arming -> proceed.
  const signal = roleSignal(cmd, parts) || (ncmd !== cmd && roleSignal(ncmd, nparts));
  if (!signal) return false; // role surface untouched -> never block here (non-role stays ALLOW)

  // The surface IS touched. DENY if it is touched by a mutation OR by any obfuscation /
  // exec construct (cmd-subst, var-indirection, brace, decode-exec, inline interpreter).
  // A pure READ of a role file (cat/head/grep/node-run, no verb, no construct) -> ALLOW.
  if (hasMutatingVerbAnywhere(parts) || hasMutatingVerbAnywhere(nparts)) return true;
  if (hasObfuscationOrExecConstruct(cmd, parts) ||
      (ncmd !== cmd && hasObfuscationOrExecConstruct(ncmd, nparts))) return true;

  return false;
}

// Returns a deny reason string if the active role is `coworker` and the command
// is in the restricted set; otherwise null. (Scope: repo + owner-surface.)
function isBlockedForCoworker(cmd) {
  if (activeRole() !== 'coworker') return null;
  if (isGitPush(cmd))
    return 'Read-only operator (coworker): pushing to the repo is blocked. Commit locally or push to your own remote.';
  if (isGitRemoteMutation(cmd))
    return 'Read-only operator (coworker): changing git remotes is blocked.';
  if (isOwnerOnlyOp(cmd))
    return 'Owner-only: only the dev role (owner passphrase) can set the dev passphrase.';
  if (isRolePathMutation(cmd))
    return 'Read-only operator (coworker): modifying the YURI guard/role system is blocked.';
  return null;
}

// Ungoverned nano-swarm spawn bypass (Move-1b D3). A lane must spawn ONLY through the governed spawn_nano
// tool (depth/fan-out/budget/cost caps). Running nano-external / nano-tick as a RAW process from a lane's
// bash skips all governance, so deny it. --dry (routing proof) is allowed. Matches the `bash -c "..."`
// wrapped form too — the node...nano-external substring survives the wrapper. The soft mechanism guard
// (governedFireDecision in nano-external.mjs) is the cooperative layer; this is the lane-proof hard stop.
function isBlockedUngovernedNanoSpawn(cmd) {
  const c = String(cmd || '');
  if (!/\bnode\b[^|;&]*\bnano-(?:external|tick)\.mjs\b/.test(c)) return false;
  if (/\s--dry(?:\s|$)/.test(c)) return false; // routing proof, no fire
  return true;
}
function inspectCommand(cmd) {
  if (isSentinelCommand(cmd))
    return { type: 'block', reason: 'SECURITY_GUARD live block sentinel.' };
  // Two-role gate: coworker is denied repo-mutation + owner-surface ops.
  const coworkerBlock = isBlockedForCoworker(cmd);
  if (coworkerBlock)
    return { type: 'block', reason: coworkerBlock };
  if (isBlockedUngovernedNanoSpawn(cmd))
    return { type: 'block', reason: 'Ungoverned nano spawn — route through the governed spawn_nano tool (depth/fan-out/budget/cost caps), not raw nano-external/nano-tick.' };
  // Owner-scoped exemption: intra-repo .env mirror (cp/mv between repo paths).
  // Documented + tested in this file; harness allowlist also explicitly enumerates
  // the canonical backend/.env <-> _SYSTEM/backend/.env mirror commands.
  if (isAllowedEnvMirror(cmd))
    return { type: 'advisory', message: 'Intra-repo .env mirror allowed (owner-scoped exemption).' };
  if (isBlockedEnvRead(cmd))
    return { type: 'block', reason: 'Reading .env is blocked.' };
  if (isBlockedSensitiveClaudeRead(cmd))
    return { type: 'block', reason: 'Reading sensitive .claude file is blocked.' };
  if (isBlockedEnvWrite(cmd))
    return { type: 'block', reason: 'Writing to .env is blocked.' };
  if (isBlockedEnvMutate(cmd))
    return { type: 'block', reason: 'Mutating .env is blocked.' };
  if (isBlockedEnvRemove(cmd))
    return { type: 'block', reason: 'Removing .env is blocked.' };
  if (isBlockedClaudeFileWrite(cmd))
    return { type: 'block', reason: 'Writing to sensitive .claude file is blocked.' };
  if (isBlockedClaudeRemove(cmd))
    return { type: 'block', reason: 'Destructive operation targeting .claude is blocked.' };
  if (isBlockedBroadGitAdd(cmd))
    return { type: 'block', reason: 'Broad git add targeting .claude is blocked.' };
  if (isBlockedGitRm(cmd))
    return { type: 'block', reason: 'git rm targeting .claude is blocked.' };
  if (isBlockedShellWrapper(cmd))
    return { type: 'block', reason: 'Shell wrapper contains a blocked command.' };
  if (isDownloadExecuteChain(cmd))
    return { type: 'block', reason: 'Download-and-execute chain is blocked (HI-12).' };
  if (isDecodeExecuteChain(cmd))
    return { type: 'block', reason: 'Decode-and-execute pipe chain is blocked (HI-12 class).' };

  const parts = toks(cmd);
  const first = parts[0];

  if (first === 'env' || first === 'printenv')
    return { type: 'advisory', message: 'Command exposes environment variables.' };

  const inner = extractShellWrapper(cmd);
  if (inner !== null)
    return { type: 'advisory', message: 'Inline shell execution; verify intent.' };

  if ((first === 'python3' || first === 'python') && parts.includes('-c'))
    return { type: 'advisory', message: 'Inline python -c execution detected.' };
  if (first === 'node' && parts.includes('-e'))
    return { type: 'advisory', message: 'Inline node -e execution detected.' };

  if (first === 'curl' || first === 'wget')
    return { type: 'advisory', message: 'Network fetch command detected.' };

  if ((first === 'npm' && (parts[1] === 'install' || parts[1] === 'update')) ||
      (first === 'yarn' && parts[1] === 'add') ||
      (first === 'pnpm' && parts[1] === 'add') ||
      (first === 'pip' && parts[1] === 'install'))
    return { type: 'advisory', message: 'Package install command detected.' };

  for (let i = 0; i < parts.length - 1; i++) {
    if (parts[i] === 'git') {
      if (parts[i + 1] === 'add') {
        for (let j = i + 2; j < parts.length; j++) {
          if (parts[j] === '.' || parts[j] === '-A')
            return { type: 'advisory', message: 'git add . or git add -A stages all changes; verify scope.' };
        }
      }
      if (parts[i + 1] === 'clean')
        return { type: 'advisory', message: 'git clean is destructive; verify intent.' };
    }
  }
  if (/\bgit\s+reset\s+--hard\b/.test(cmd))
    return { type: 'advisory', message: 'git reset --hard is destructive; verify intent.' };

  return null;
}

let raw = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', chunk => { raw += chunk; });
process.stdin.on('end', () => {
  let input;
  try {
    input = JSON.parse(raw);
  } catch {
    process.exit(0);
  }

  if (!input || input.tool_name !== 'Bash') process.exit(0);

  const cmd = (input.tool_input && input.tool_input.command) || '';
  if (!cmd) process.exit(0);


function appendAuditLog(entry) {
  try {
    const os = require('os');
    require('fs').appendFileSync(os.homedir() + '/.yuri-audit.log', JSON.stringify(entry) + '\n');
  } catch (_) {}
}
  function emitDeny(reason) {
    try {
      const sid = process.env.CLAUDE_SESSION_ID || '';
      if (sid && require('fs').existsSync('/tmp/yuri-session-packet-' + sid + '.json')) {
        const plan = JSON.parse(require('fs').readFileSync('/tmp/yuri-session-packet-' + sid + '.json','utf8')).pulse_plan || {};
        appendAuditLog({ ts: new Date().toISOString(), session_id: sid, entry_point: 'claude',
          tool: 'Bash', violation: String(reason).slice(0,80), blocked: true, tier: plan.complexityTier || 'unknown' });
      }
    } catch (_) {}
    process.stdout.write(JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'deny',
        permissionDecisionReason: reason,
      },
    }) + '\n');
  }

  function emitAdvisory(message) {
    process.stdout.write(JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        additionalContext: message,
      },
    }) + '\n');
  }

  const result = inspectCommand(cmd);
  if (result === null) {
    process.exit(0);
  } else if (result.type === 'block') {
    emitDeny(result.reason);
    process.exit(0);
  } else if (result.type === 'advisory') {
    emitAdvisory(result.message);
    process.exit(0);
  }
});
