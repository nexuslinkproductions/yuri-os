#!/usr/bin/env node
// directive-guard.mjs — YURI PreToolUse hook (directive-integrity layer 2, SURFACE).
// OBSERVE-ONLY: surfaces standing directives at decision time + logs would-warns.
// NEVER blocks / denies. Fail-open on every code path.
//
// Built WITH the Mimo lane as a co-equal peer (2026-06-13). The Claude lane adapted
// Mimo's draft: dedicated directive dir resolved from THIS file (not CWD), and the real
// directive set (Mimo's sample directive contradicted a hard rule and was discarded).
// Design: _SYSTEM/reports/directive-integrity-mechanism-2026-06-13.md (L2).
//
// Reads directive contracts from .claude/directives/*.md (frontmatter: handle, tier:observe,
// conditions[], description, optional constraints[]). On a PreToolUse event whose action
// signature matches a directive's conditions, it injects the directive statement as
// additionalContext; if a constraint is violated it appends a ⚠ would-warn (observe only).

import { readdir, readFile, stat, appendFile } from 'node:fs/promises';
import { join, resolve, dirname } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';

const __self = fileURLToPath(import.meta.url);
const __dirname = dirname(__self);

// ── Config ─────────────────────────────────────────────────────
// Directives live in a DEDICATED dir (not the auto-memory store, so the memory reindexer
// never trips on them). Resolved from THIS file's location — a hook's CWD is not the repo root.
const DEFAULT_DIRECTIVE_DIR = resolve(__dirname, '..', 'directives');
const DEFAULT_AUDIT_LOG     = join(homedir(), '.yuri-audit.log');
const AUDIT_MAX_BYTES       = 50 * 1024 * 1024; // 50 MB cap

// ── Action Signature ───────────────────────────────────────────
export function buildActionSignature(event) {
  const tool = (event?.tool_name || '').toLowerCase();
  const inp  = event?.tool_input || {};
  switch (tool) {
    case 'bash':  return `bash:${inp.command  || ''}`;
    case 'write': return `write:${inp.file_path || ''}`;
    case 'edit':  return `edit:${inp.file_path  || ''}`;
    default:      return `${tool}:`;
  }
}

// ── Pattern Matching (glob * + plain substring) ────────────────
function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function matchPattern(pattern, text) {
  if (pattern.includes('*')) {
    try {
      const re = new RegExp('^' + escapeRegex(pattern).replace(/\\\*/g, '.*') + '$');
      return re.test(text);
    } catch { return false; }
  }
  return text.includes(pattern);
}

// ── Simple YAML Frontmatter Parser ─────────────────────────────
function unquote(s) {
  if (!s) return s;
  const t = s.trim();
  if ((t[0] === '"' && t.at(-1) === '"') || (t[0] === "'" && t.at(-1) === "'"))
    return t.slice(1, -1);
  return t;
}

function parseScalar(raw) {
  if (raw === undefined || raw === null) return '';
  const u = unquote(String(raw));
  if (u === '') return '';
  if (/^-?\d+$/.test(u)) return Number(u);
  if (u === 'true')  return true;
  if (u === 'false') return false;
  return u;
}

export function parseFrontmatter(text) {
  const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!m) return null;
  const lines = m[1].split(/\r?\n/);

  const result = {};
  let curKey = null, curArr = null, curObj = null;

  const flush = () => {
    if (curObj !== null && curArr !== null) curArr.push(curObj);
    if (curArr !== null && curKey !== null && !(curKey in result)) result[curKey] = curArr;
    curObj = null;
  };

  for (const line of lines) {
    // Top-level "key: value"
    const top = line.match(/^([A-Za-z_][\w-]*):\s*(.*)/);
    if (top && !line.startsWith('  ')) {
      flush();
      curKey = top[1];
      const v = top[2].trim();
      if (v === '') { curArr = []; curObj = null; }
      else          { result[curKey] = parseScalar(v); curArr = null; curObj = null; }
      continue;
    }
    // Array-of-objects item: "  - kind: …"
    const aObj = line.match(/^  - ([A-Za-z_][\w-]*):\s*(.*)/);
    if (aObj && curArr !== null) {
      if (curObj !== null) curArr.push(curObj);
      curObj = { [aObj[1]]: parseScalar(aObj[2]) };
      continue;
    }
    // Object-property continuation: "    key: …"
    const cont = line.match(/^    ([A-Za-z_][\w-]*):\s*(.*)/);
    if (cont && curObj !== null) {
      curObj[cont[1]] = parseScalar(cont[2]);
      continue;
    }
    // Array-of-strings item: "  - value"
    const aStr = line.match(/^  - (.+)/);
    if (aStr && curArr !== null && curObj === null) {
      curArr.push(unquote(aStr[1]));
      continue;
    }
  }
  flush();
  return result;
}

// ── Constraint Evaluator (closed-set, zero eval) ──────────────
function evaluateConstraint(c, event) {
  const tool = (event?.tool_name || '').toLowerCase();
  const cmd  = event?.tool_input?.command   || '';
  const fp   = event?.tool_input?.file_path || '';

  switch (c.kind) {
    case 'command_includes':
      return tool === 'bash' && cmd.includes(c.needle || '');

    case 'command_matches':
      if (tool !== 'bash') return false;
      try { return new RegExp(c.pattern || '').test(cmd); }
      catch { return false; }

    case 'bash_flag_below': {
      if (tool !== 'bash') return false;
      const flag = c.flag || '';
      const min  = typeof c.min === 'number' ? c.min : 0;
      const re   = new RegExp(escapeRegex(flag) + '(?:=|\\s)\\s*(\\d+)');
      const hit  = cmd.match(re);
      return hit ? parseInt(hit[1], 10) < min : false;
    }

    case 'file_path_matches':
      try { return new RegExp(c.pattern || '').test(fp); }
      catch { return false; }

    default:
      return false; // unknown kind → skip
  }
}

// ── Directive Loader (per-process cache) ───────────────────────
const _cache = new Map();

async function loadDirectives(dir) {
  let entries;
  try { entries = await readdir(dir); } catch { return []; }

  const out = [];
  for (const e of entries) {
    if (!e.endsWith('.md')) continue;
    try {
      const txt = await readFile(join(dir, e), 'utf-8');
      const fm  = parseFrontmatter(txt);
      if (fm?.handle && fm?.tier === 'observe' && Array.isArray(fm.conditions))
        out.push(fm);
    } catch { /* skip unreadable */ }
  }
  return out;
}

async function getDirectives(dir) {
  if (_cache.has(dir)) return _cache.get(dir);
  const d = await loadDirectives(dir);
  _cache.set(dir, d);
  return d;
}

export function clearDirectiveCache() { _cache.clear(); }

// ── Audit (best-effort, bounded) ───────────────────────────────
async function audit(entry, logPath) {
  try {
    try {
      const s = await stat(logPath);
      if (s.size >= AUDIT_MAX_BYTES) return; // cap reached
    } catch { /* file doesn't exist yet — fine */ }

    const line = JSON.stringify({
      ts: new Date().toISOString(),
      guard: 'directive-guard',
      ...entry,
    }) + '\n';
    await appendFile(logPath, line);
  } catch { /* best-effort swallow */ }
}

// ── Core Processing (exported for testability) ─────────────────
export async function processEvent(event, opts = {}) {
  const memDir  = opts.memoryDir || DEFAULT_DIRECTIVE_DIR;
  const logPath = opts.auditLog  || DEFAULT_AUDIT_LOG;

  const actionSig  = buildActionSignature(event);
  const directives = await getDirectives(memDir);

  const matched  = [];
  const warnings = [];

  for (const dir of directives) {
    const hit = (dir.conditions || []).some(p => matchPattern(p, actionSig));
    if (!hit) continue;
    matched.push(dir);

    for (const c of (dir.constraints || [])) {
      if (evaluateConstraint(c, event)) {
        warnings.push({ handle: dir.handle, kind: c.kind, message: c.message });
        await audit({
          action: 'would_warn',
          directive: dir.handle,
          kind: c.kind,
          tool: event?.tool_name,
          message: c.message,
        }, logPath);
      }
    }
  }

  if (matched.length === 0) return null; // nothing to surface

  // Build context lines — dedup by handle
  const lines = [];
  const seen  = new Set();
  for (const d of matched) {
    if (seen.has(d.handle)) continue;
    seen.add(d.handle);
    lines.push(`[DIRECTIVE: ${d.handle}] ${d.description || ''}`);
  }
  for (const w of warnings) {
    lines.push(`  ⚠ would-warn: ${w.message}`);
  }

  await audit({
    action: 'surfaced',
    directives: [...seen],
    tool: event?.tool_name,
  }, logPath);

  return {
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      additionalContext: lines.join('\n'),
    },
  };
}

// ── Main entry — only when executed directly ───────────────────
async function main() {
  try {
    let input = '';
    for await (const chunk of process.stdin) input += chunk;

    let event;
    try { event = JSON.parse(input); }
    catch { process.exit(0); } // malformed → fail-open, exit 0

    if (!event || typeof event !== 'object') { process.exit(0); }

    const result = await processEvent(event);
    if (result) process.stdout.write(JSON.stringify(result));
  } catch {
    /* fail-open: swallow everything */
  }
  // NEVER emit permissionDecision: deny
  process.exit(0);
}

// Guard: only run main() when this file is the entry point
if (process.argv[1] && resolve(process.argv[1]) === __self) {
  main();
}
