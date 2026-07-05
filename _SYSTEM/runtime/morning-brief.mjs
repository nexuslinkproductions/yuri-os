#!/usr/bin/env node
// @capability: morning-brief
// @serves: morning brief | wake-up report | what happened while I was gone | absence report | overnight summary
// @does: READ-ONLY compositor that joins existing sources (git log, overnight results, yuri-doctor, dream queue,
//   memory, usage meters, sessions) into one sectioned brief answering "what happened while I was gone?".
//   Every source is fail-open (a broken source = one 'unavailable' line, never a crash). Every subprocess
//   has a hard timeout. All sources are INJECTABLE via buildBrief(sources) for hermetic testing.
// @use: node _SYSTEM/runtime/morning-brief.mjs [--text|--json|--spoken] [--status --json]
// @exports: buildBrief, renderText, renderJson, renderSpoken, defaultSources, loadBriefState, saveBriefState
//
// morning-brief.mjs — the wake-up compositor.
//
// READ-ONLY. This tool composes existing read-only sources into one artifact. It writes ONLY to
// _SYSTEM/state/runtime/ (brief-state.json for lastBriefTime persistence, events.jsonl for the event log).
// State mutation is limited to remembering when the last brief was generated.

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));

// SEAM CONTRACT (usage-meters → morning-brief):
//   morning-brief imports `briefLines` from usage-meters.mjs and calls it with the
//   snapshot object (read from _SYSTEM/state/runtime/usage-meters.json). usage-meters
//   OWNS the rendering of per-pool one-liners; morning-brief NEVER iterates the
//   snapshot shape itself. If the import fails (module unavailable), usage() falls
//   back to { unavailable }. See briefLines() in usage-meters.mjs for the contract.
let briefLinesFn = null;
try {
  const meters = await import(pathToFileURL(path.join(HERE, 'usage-meters.mjs')).href);
  if (typeof meters.briefLines === 'function') briefLinesFn = meters.briefLines;
} catch { /* meters module not loadable — usage() falls back to unavailable */ }

const SYS = path.resolve(HERE, '..');
const ROOT = path.resolve(SYS, '..');
const STATE_DIR = path.join(SYS, 'state', 'runtime');
const BRIEF_STATE_FILE = path.join(STATE_DIR, 'brief-state.json');
const EVENTS_FILE = path.join(STATE_DIR, 'events.jsonl');

const SUBPROCESS_TIMEOUT_MS = 8_000;
const DOCTOR_TIMEOUT_MS = 25_000;

// Sentinel paths (relative to ROOT) — .claude/yuri-sentinel and .claude/memory are ALLOWED reads.
const DREAM_QUEUE = path.join(ROOT, '.claude', 'yuri-sentinel', 'learning', 'dream-queue.jsonl');
const LEARNED_RULES = path.join(ROOT, '.claude', 'yuri-sentinel', 'learning', 'global.md');
const MEMORY_DIR = path.join(ROOT, '.claude', 'memory');
const DOCTOR_SCRIPT = path.join(SYS, 'Scripts', 'yuri-doctor.mjs');
const OVERNIGHT_FILE = path.join(STATE_DIR, 'overnight-results.jsonl');
const USAGE_FILE = path.join(STATE_DIR, 'usage-meters.json');
const SESSIONS_FILE = path.join(STATE_DIR, 'sessions.json');

// ── helpers ──────────────────────────────────────────────────────────────────

/** Bounded subprocess runner. NEVER throws — timeout/non-zero/missing all resolve to a result object. */
function runBounded(cmd, args, { timeout = SUBPROCESS_TIMEOUT_MS, cwd = ROOT } = {}) {
  try {
    const r = spawnSync(cmd, args, { cwd, encoding: 'utf8', timeout, maxBuffer: 4 * 1024 * 1024 });
    if (r.error) {
      return { ok: false, timedOut: false, error: String(r.error.message || r.error), stdout: '', stderr: '' };
    }
    if (r.signal === 'SIGTERM' || r.signal === 'SIGKILL') {
      return { ok: false, timedOut: true, error: `timed out after ${timeout}ms`, stdout: r.stdout || '', stderr: r.stderr || '' };
    }
    return { ok: true, code: r.status, timedOut: false, stdout: r.stdout || '', stderr: r.stderr || '' };
  } catch (e) {
    return { ok: false, timedOut: false, error: String(e?.message || e), stdout: '', stderr: '' };
  }
}

function safeReadFile(p, maxBytes = 2 * 1024 * 1024) {
  try {
    const st = fs.statSync(p);
    if (!st.isFile()) return null;
    if (st.size > maxBytes) {
      const fd = fs.openSync(p, 'r');
      const buf = Buffer.alloc(maxBytes);
      fs.readSync(fd, buf, 0, maxBytes, st.size - maxBytes);
      fs.closeSync(fd);
      return buf.toString('utf8');
    }
    return fs.readFileSync(p, 'utf8');
  } catch {
    return null;
  }
}

function safeReadJson(p) {
  const text = safeReadFile(p);
  if (text == null) return null;
  try { return JSON.parse(text); } catch { return null; }
}

function countLines(p) {
  try {
    const text = safeReadFile(p, 16 * 1024 * 1024);
    if (text == null) return 0;
    return text.split('\n').filter((l) => l.trim().length > 0).length;
  } catch {
    return 0;
  }
}

function mtimeAgeStr(p) {
  try {
    const st = fs.statSync(p);
    const ageMs = Date.now() - st.mtimeMs;
    const h = Math.floor(ageMs / 3_600_000);
    const d = Math.floor(h / 24);
    if (d > 0) return `${d}d ${h % 24}h ago`;
    if (h > 0) return `${h}h ${Math.floor((ageMs % 3_600_000) / 60_000)}m ago`;
    const m = Math.floor(ageMs / 60_000);
    return `${m}m ago`;
  } catch {
    return 'unknown';
  }
}

function formatTimestamp(ts) {
  if (!ts) return null;
  try {
    return new Date(ts).toISOString();
  } catch {
    return String(ts);
  }
}

function appendEvent(event, data) {
  try {
    if (!fs.existsSync(STATE_DIR)) fs.mkdirSync(STATE_DIR, { recursive: true });
    const line = JSON.stringify({ t: new Date().toISOString(), comp: 'brief', event, data }) + '\n';
    fs.appendFileSync(EVENTS_FILE, line);
  } catch {
    // fail-open — event logging is best-effort
  }
}

// ── state persistence ────────────────────────────────────────────────────────

function loadBriefState() {
  const st = safeReadJson(BRIEF_STATE_FILE);
  if (st && typeof st === 'object') return st;
  return { lastBriefTime: null };
}

function saveBriefState(state) {
  try {
    if (!fs.existsSync(STATE_DIR)) fs.mkdirSync(STATE_DIR, { recursive: true });
    fs.writeFileSync(BRIEF_STATE_FILE, JSON.stringify(state, null, 2) + '\n');
  } catch {
    // fail-open
  }
}

// ── default source implementations ───────────────────────────────────────────
// Each returns a plain object. If the source is unavailable, returns { unavailable: true, reason }.
// All are injectable: buildBrief(sources) accepts override fns for any key.

const defaultSources = {
  // [GIT] commits since last brief, branch, status counts
  git(lastBriefTime) {
    const sinceArg = lastBriefTime ? `--since=${new Date(lastBriefTime).toISOString()}` : '--since=24 hours ago';
    const logRes = runBounded('git', ['log', '--oneline', sinceArg, '--all'], { timeout: SUBPROCESS_TIMEOUT_MS });
    const branchRes = runBounded('git', ['branch', '--show-current'], { timeout: SUBPROCESS_TIMEOUT_MS });
    const statusRes = runBounded('git', ['status', '--short'], { timeout: SUBPROCESS_TIMEOUT_MS });

    if (!logRes.ok && logRes.timedOut) {
      return { unavailable: true, reason: 'git log timed out' };
    }

    const commits = (logRes.stdout || '')
      .split('\n')
      .filter((l) => l.trim().length > 0);
    const branch = (branchRes.stdout || '').trim() || 'unknown';
    const statusLines = (statusRes.stdout || '')
      .split('\n')
      .filter((l) => l.trim().length > 0);

    return {
      commits: commits.slice(0, 15),
      totalCommitCount: commits.length,
      branch,
      statusCount: statusLines.length,
    };
  },

  // [OVERNIGHT] results from overnight-results.jsonl
  overnight() {
    const text = safeReadFile(OVERNIGHT_FILE, 8 * 1024 * 1024);
    if (text == null) return { unavailable: true, reason: 'no overnight results file' };
    const lines = text.split('\n').filter((l) => l.trim().length > 0);
    if (lines.length === 0) return { unavailable: true, reason: 'overnight results empty' };

    const results = [];
    for (const line of lines.slice(-50)) {
      try { results.push(JSON.parse(line)); } catch { /* skip malformed */ }
    }

    const ok = results.filter((r) => r.status === 'ok' || r.status === 'done' || r.ok === true).length;
    const fail = results.filter((r) => r.status === 'fail' || r.status === 'failed' || r.status === 'error' || r.ok === false).length;

    const lines_out = results.slice(-10).map((r) => {
      const label = r.task || r.label || r.name || r.id || 'task';
      const status = r.status || (r.ok ? 'ok' : 'fail');
      return `  ${status.padEnd(6)} ${label}`;
    });

    return { ok, fail, total: results.length, lines: lines_out };
  },

  // [DOCTOR] spawn yuri-doctor --json with 25s timeout
  doctor() {
    const res = runBounded('node', [DOCTOR_SCRIPT, '--json'], { timeout: DOCTOR_TIMEOUT_MS });
    if (!res.ok) {
      if (res.timedOut) return { unavailable: true, reason: `doctor timed out (${DOCTOR_TIMEOUT_MS / 1000}s)` };
      return { unavailable: true, reason: res.error || 'doctor failed' };
    }
    let doc;
    try { doc = JSON.parse(res.stdout); } catch {
      return { unavailable: true, reason: 'doctor output not valid JSON' };
    }
    const verdict = doc.verdict || 'unknown';
    const counts = doc.counts || {};
    return {
      verdict,
      critical: counts.critical || 0,
      high: counts.high || 0,
      med: counts.med || 0,
      low: counts.low || 0,
    };
  },

  // [DREAMS] dream-queue depth + learned-rules age
  dreams() {
    const depth = countLines(DREAM_QUEUE);
    const rulesAge = (() => {
      try { return mtimeAgeStr(LEARNED_RULES); } catch { return 'unknown'; }
    })();
    return { dreamQueueDepth: depth, learnedRulesAge: rulesAge };
  },

  // [MEMORY] newest 3 entries by mtime
  memory() {
    try {
      const files = fs.readdirSync(MEMORY_DIR)
        .filter((f) => f.endsWith('.md'))
        .map((f) => {
          const fp = path.join(MEMORY_DIR, f);
          try { return { name: f, mtime: fs.statSync(fp).mtimeMs }; } catch { return null; }
        })
        .filter(Boolean)
        .sort((a, b) => b.mtime - a.mtime);
      return { entries: files.slice(0, 3).map((f) => f.name) };
    } catch {
      return { unavailable: true, reason: 'memory dir not readable' };
    }
  },

  // [USAGE] per-pool one-liners via the briefLines contract from usage-meters.mjs
  // SEAM: delegates to usage-meters.briefLines(snapshot). Never parses snapshot shape directly.
  usage() {
    const data = safeReadJson(USAGE_FILE);
    if (data == null) return { unavailable: true, reason: 'no usage meters file' };
    if (briefLinesFn) {
      return briefLinesFn(data);
    }
    // Fallback: meters module not importable — mark unavailable
    return { unavailable: true, reason: 'usage-meters module not loaded' };
  },

  // [SESSIONS] from sessions.json
  sessions() {
    const data = safeReadJson(SESSIONS_FILE);
    if (data == null) return { unavailable: true, reason: 'no sessions file' };
    if (Array.isArray(data)) {
      return { count: data.length, active: data.filter((s) => s.status === 'running' || s.status === 'active').length };
    }
    if (typeof data === 'object') {
      const sessions = data.sessions || [];
      return { count: sessions.length, active: sessions.filter((s) => s.status === 'running' || s.status === 'active').length };
    }
    return { unavailable: true, reason: 'sessions file malformed' };
  },
};

// ── compositor ───────────────────────────────────────────────────────────────

/**
 * Build the brief object by calling each source. Each source is wrapped so
 * a throw becomes { unavailable: true, reason } — never a crash.
 * @param {object} sources - override fns keyed by section name. Missing keys use defaults.
 * @param {object} opts - { lastBriefTime }
 * @returns {object} brief object with sections: git, overnight, doctor, dreams, memory, usage, sessions
 */
function buildBrief(sources = {}, opts = {}) {
  const src = { ...defaultSources, ...sources };
  const lastBriefTime = opts.lastBriefTime || null;

  const sections = {};

  // Each source is called inside a try/catch so a throw = unavailable, not a crash.
  const callSafe = (key, fn, ...args) => {
    try {
      const result = fn(...args);
      return result;
    } catch (e) {
      return { unavailable: true, reason: String(e?.message || e) };
    }
  };

  sections.git = callSafe('git', src.git, lastBriefTime);
  sections.overnight = callSafe('overnight', src.overnight);
  sections.doctor = callSafe('doctor', src.doctor);
  sections.dreams = callSafe('dreams', src.dreams);
  sections.memory = callSafe('memory', src.memory);
  sections.usage = callSafe('usage', src.usage);
  sections.sessions = callSafe('sessions', src.sessions);

  return {
    generatedAt: new Date().toISOString(),
    lastBriefTime: formatTimestamp(lastBriefTime),
    sections,
  };
}

// ── renderers ────────────────────────────────────────────────────────────────

function renderText(brief) {
  const out = [];
  const now = new Date().toLocaleString('en-US', { dateStyle: 'full', timeStyle: 'short' });
  out.push(`☀  YURI MORNING BRIEF — ${now}`);
  out.push('');

  // GIT
  const g = brief.sections.git;
  if (g?.unavailable) {
    out.push('[GIT] unavailable — ' + (g.reason || 'unknown'));
  } else if (g) {
    out.push(`[GIT] ${g.totalCommitCount} commit(s) since last brief (branch: ${g.branch}, ${g.statusCount} uncommitted file(s))`);
    for (const c of g.commits) {
      out.push('  ' + c);
    }
  }
  out.push('');

  // OVERNIGHT
  const o = brief.sections.overnight;
  if (o?.unavailable) {
    out.push('[OVERNIGHT] unavailable — ' + (o.reason || 'no overnight tasks'));
  } else if (o) {
    out.push(`[OVERNIGHT] ${o.ok} ok / ${o.fail} failed (${o.total} total)`);
    for (const l of o.lines) out.push(l);
  }
  out.push('');

  // DOCTOR
  const d = brief.sections.doctor;
  if (d?.unavailable) {
    out.push('[DOCTOR] unavailable — ' + (d.reason || 'skipped'));
  } else if (d) {
    out.push(`[DOCTOR] verdict: ${d.verdict} (${d.critical} critical, ${d.high} high, ${d.med} med, ${d.low} low)`);
  }
  out.push('');

  // DREAMS
  const dr = brief.sections.dreams;
  if (dr?.unavailable) {
    out.push('[DREAMS] unavailable — ' + (dr.reason || 'unknown'));
  } else if (dr) {
    out.push(`[DREAMS] queue depth: ${dr.dreamQueueDepth}, learned rules updated: ${dr.learnedRulesAge}`);
  }
  out.push('');

  // MEMORY
  const m = brief.sections.memory;
  if (m?.unavailable) {
    out.push('[MEMORY] unavailable — ' + (m.reason || 'unknown'));
  } else if (m) {
    out.push('[MEMORY] newest entries:');
    for (const e of m.entries) out.push('  ' + e);
  }
  out.push('');

  // USAGE
  const u = brief.sections.usage;
  if (u?.unavailable) {
    out.push('[USAGE] unavailable — ' + (u.reason || 'no meters'));
  } else if (u) {
    out.push('[USAGE]');
    for (const l of u.lines) out.push(l);
  }
  out.push('');

  // SESSIONS
  const s = brief.sections.sessions;
  if (s?.unavailable) {
    out.push('[SESSIONS] unavailable — ' + (s.reason || 'no sessions'));
  } else if (s) {
    out.push(`[SESSIONS] ${s.count} total, ${s.active} active`);
  }

  return out.join('\n');
}

function renderJson(brief) {
  return JSON.stringify(brief, null, 2);
}

function renderSpoken(brief) {
  // ≤5 sentences, natural English, no markdown — for TTS.
  const sentences = [];

  const g = brief.sections.git;
  if (!g?.unavailable && g) {
    if (g.totalCommitCount > 0) {
      sentences.push(`There ${g.totalCommitCount === 1 ? 'was 1 commit' : `were ${g.totalCommitCount} commits`} while you were away on branch ${g.branch}.`);
    } else {
      sentences.push(`No new commits since your last visit. You're on branch ${g.branch}.`);
    }
  }

  const o = brief.sections.overnight;
  if (!o?.unavailable && o && o.total > 0) {
    if (o.fail > 0) {
      sentences.push(`Overnight tasks: ${o.ok} succeeded, ${o.fail} failed.`);
    } else {
      sentences.push(`All ${o.ok} overnight tasks completed successfully.`);
    }
  }

  const d = brief.sections.doctor;
  if (!d?.unavailable && d) {
    if (d.critical > 0) {
      sentences.push(`System health is ${d.verdict.toLowerCase()} with ${d.critical} critical issue${d.critical === 1 ? '' : 's'} to look at.`);
    } else {
      sentences.push(`System health looks ${d.verdict.toLowerCase()}.`);
    }
  }

  const dr = brief.sections.dreams;
  if (!dr?.unavailable && dr) {
    sentences.push(`There ${dr.dreamQueueDepth === 1 ? 'is 1 dream' : `are ${dr.dreamQueueDepth} dreams`} in the queue, and learned rules were last updated ${dr.learnedRulesAge}.`);
  }

  const m = brief.sections.memory;
  if (!m?.unavailable && m && m.entries.length > 0) {
    sentences.push(`Your newest memory entry is ${m.entries[0].replace(/\.md$/, '')}.`);
  }

  // Fallback: if ALL sources failed/unavailable, still emit a valid sentence
  // (spoken mode must always produce ≥1 sentence — never empty for TTS).
  if (sentences.length === 0) {
    sentences.push("Good morning. All monitoring sources are currently unavailable, but the system is running.");
  }

  // Cap at 5 sentences
  return sentences.slice(0, 5).join(' ');
}

// ── CLI ──────────────────────────────────────────────────────────────────────

function parseArgs(argv) {
  const args = argv.slice(2);
  const flags = {
    text: false, json: false, spoken: false,
    status: false,
  };
  for (const a of args) {
    if (a === '--text') flags.text = true;
    else if (a === '--json') flags.json = true;
    else if (a === '--spoken') flags.spoken = true;
    else if (a === '--status') flags.status = true;
  }
  // Default mode is --text
  if (!flags.json && !flags.spoken && !flags.status) flags.text = true;
  return flags;
}

function cli() {
  const flags = parseArgs(process.argv);
  const state = loadBriefState();
  const lastBriefTime = state.lastBriefTime;

  if (flags.status) {
    // Health check — exit 0 healthy
    const payload = JSON.stringify({
      status: 'ok',
      component: 'brief',
      lastBriefTime: formatTimestamp(lastBriefTime),
      ts: new Date().toISOString(),
    });
    process.stdout.write(payload + '\n');
    process.exit(0);
  }

  const brief = buildBrief({}, { lastBriefTime });

  if (flags.json) {
    process.stdout.write(renderJson(brief) + '\n');
  } else if (flags.spoken) {
    process.stdout.write(renderSpoken(brief) + '\n');
  } else {
    process.stdout.write(renderText(brief) + '\n');
  }

  // Persist lastBriefTime + log event
  const nowIso = new Date().toISOString();
  saveBriefState({ lastBriefTime: nowIso });
  appendEvent('brief-generated', { mode: flags.json ? 'json' : flags.spoken ? 'spoken' : 'text' });

  process.exit(0);
}

// Run CLI only when invoked directly (not when imported)
const isMain = (() => {
  try {
    return process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
  } catch {
    return false;
  }
})();

if (isMain) {
  cli();
}

export {
  buildBrief,
  renderText,
  renderJson,
  renderSpoken,
  defaultSources,
  loadBriefState,
  saveBriefState,
  appendEvent,
  // exported for testing
  BRIEF_STATE_FILE,
  STATE_DIR,
};
