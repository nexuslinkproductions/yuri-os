// @capability: session-conductor
// @serves: tmux session manager | yuri runtime conductor | claude codex terminal session registry
// @does: create/list/draft/send/peek/watch/kill tmux-backed sessions with a draft-then-confirm dispatch
//        seam. Drafts NEVER auto-send; send fires ONLY when called explicitly (owner-confirm gate).
// @use: node _SYSTEM/runtime/session-conductor.mjs <command> [args]
//       create yuri-sess --cmd 'ai claude-zai'  ·  draft yuri-sess --text '...'  ·  send yuri-sess
// @exports: runTmux, conductor, sendKeysLiteralArgv, STATE_DIR (programmatic API)
// @state: _SYSTEM/state/runtime/{sessions.json, drafts.json, events.jsonl}
//         (override via SESSION_CONDUCTOR_STATE_DIR env var, set BEFORE import — test isolation seam)
// @contract: node stdlib only; append events to events.jsonl; --status --json CLI, exit 0 = healthy

import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, appendFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
// SESSION_CONDUCTOR_STATE_DIR override seam (same pattern as yuri-runtimed.mjs's
// RUNTIMED_STATE_DIR): lets hermetic tests point this module at an isolated tmpdir
// instead of the real _SYSTEM/state/runtime/, which is shared across every other
// runtime module/test that also writes events.jsonl there. Read once at import
// time — callers that need isolation must set the env var BEFORE importing this
// module (e.g. via a dynamic `await import(...)` after the assignment).
export const STATE_DIR = process.env.SESSION_CONDUCTOR_STATE_DIR
  ? join(process.env.SESSION_CONDUCTOR_STATE_DIR)
  : join(__dirname, '..', 'state', 'runtime');
const SESSIONS_FILE = join(STATE_DIR, 'sessions.json');
const DRAFTS_FILE = join(STATE_DIR, 'drafts.json');
const EVENTS_FILE = join(STATE_DIR, 'events.jsonl');

// ─── injectable exec seam ─────────────────────────────────────────────────────
// Tests stub this to avoid touching real tmux. Real callers use the default.
//
// RT-01/02 FIX (2026-07-05): this used to accept a single shell-like STRING and
// re-tokenize it with a regex before handing the pieces to execFileSync. That
// tokenizer could not round-trip arbitrary text (embedded double-quotes,
// single-quotes, `$(...)`, backticks, newlines) — draft text containing a `"`
// would corrupt the reconstructed argv, and worse, feeding a corrupted/partial
// quote sequence into tmux's OWN command-line parsing (tmux re-parses whatever
// you hand its `send-keys` argv the same way a shell would for key-name specs)
// could leave the pane's shell sitting in a `dquote>` continuation state.
//
// Fix: runTmux now takes an argv ARRAY directly — no string building, no
// tokenizing, no re-parsing. execFileSync never invokes a shell regardless, so
// this was always safe for the *executed* command; the corruption was self-
// inflicted by the string round-trip. Every call site below builds an array.
export function runTmux(args) {
  const out = execFileSync(args[0], args.slice(1), {
    encoding: 'utf-8',
    timeout: 10000,
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  return out;
}

// ─── state helpers ────────────────────────────────────────────────────────────
function ensureStateDir() {
  if (!existsSync(STATE_DIR)) mkdirSync(STATE_DIR, { recursive: true });
}

function readJson(file, fallback) {
  if (!existsSync(file)) return fallback;
  try {
    return JSON.parse(readFileSync(file, 'utf-8'));
  } catch {
    return fallback;
  }
}

function writeJson(file, data) {
  ensureStateDir();
  writeFileSync(file, JSON.stringify(data, null, 2) + '\n', 'utf-8');
}

function appendEvent(event, data) {
  ensureStateDir();
  const entry = JSON.stringify({ t: new Date().toISOString(), comp: 'conductor', event, data });
  appendFileSync(EVENTS_FILE, entry + '\n', 'utf-8');
}

function readSessions() {
  return readJson(SESSIONS_FILE, {});
}

function writeSessions(sessions) {
  writeJson(SESSIONS_FILE, sessions);
}

function readDrafts() {
  return readJson(DRAFTS_FILE, {});
}

function writeDrafts(drafts) {
  writeJson(DRAFTS_FILE, drafts);
}

function touchActivity(sessions, name) {
  if (sessions[name]) sessions[name].lastActivity = new Date().toISOString();
}

// ─── CLI arg parser ───────────────────────────────────────────────────────────
function parseArgs(argv) {
  const flags = {};
  const positional = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next !== undefined && !next.startsWith('--')) {
        flags[key] = next;
        i++;
      } else {
        flags[key] = true;
      }
    } else {
      positional.push(a);
    }
  }
  return { flags, positional };
}

// ─── command implementations ──────────────────────────────────────────────────
export const conductor = {
  /**
   * create <name> [--cmd '<shell>']
   * Creates a new tmux session running the given command (default: plain shell).
   * Registers it in sessions.json. Never attaches.
   */
  create(name, opts = {}, _runTmux = runTmux) {
    if (!name) throw new Error('create requires a session name');
    const sessions = readSessions();
    if (sessions[name]) {
      throw new Error(`session '${name}' already exists in registry`);
    }
    const cmd = opts.cmd || '';
    const repoRoot = join(__dirname, '..', '..');
    // Create detached session; -c sets cwd. Don't auto-send a command if none given (plain shell).
    _runTmux(['tmux', 'new-session', '-d', '-s', name, '-c', repoRoot, '-x', '220', '-y', '50']);
    if (cmd) {
      // Use -l (literal) + separate Enter — the proven dispatch pattern from yuri-worker.sh.
      const parts = sendKeysLiteralArgv(name, cmd);
      for (const p of parts) _runTmux(p);
    }
    const now = new Date().toISOString();
    const record = {
      name,
      tmux: name,
      cmd: cmd || null,
      createdAt: now,
      lastActivity: now,
      status: 'running',
    };
    sessions[name] = record;
    writeSessions(sessions);
    appendEvent('session.create', { name, cmd: cmd || null });
    return record;
  },

  /**
   * list
   * Returns all registered sessions.
   */
  list(_runTmux = runTmux) {
    const sessions = readSessions();
    return Object.values(sessions);
  },

  /**
   * draft <name> --text '...'
   * Stores a pending draft. NEVER auto-sends. This is the staging area before owner confirm.
   */
  draft(name, opts = {}, _runTmux = runTmux) {
    if (!name) throw new Error('draft requires a session name');
    if (!opts.text) throw new Error('draft requires --text');
    const sessions = readSessions();
    if (!sessions[name]) {
      throw new Error(`session '${name}' not found in registry`);
    }
    const drafts = readDrafts();
    drafts[name] = {
      text: opts.text,
      createdAt: new Date().toISOString(),
    };
    writeDrafts(drafts);
    touchActivity(sessions, name);
    writeSessions(sessions);
    appendEvent('session.draft', { name });
    return drafts[name];
  },

  /**
   * send <name>
   * Sends the PENDING draft via tmux send-keys. ONLY fires when called explicitly.
   * This is the owner-confirm seam. Returns the text that was sent. Throws if no pending draft.
   */
  send(name, _runTmux = runTmux) {
    if (!name) throw new Error('send requires a session name');
    const sessions = readSessions();
    if (!sessions[name]) {
      throw new Error(`session '${name}' not found in registry`);
    }
    const drafts = readDrafts();
    const draft = drafts[name];
    if (!draft) {
      throw new Error(`no pending draft for session '${name}'`);
    }
    const text = draft.text;
    // Literal send: -l treats text as literal characters (no key-name interpretation), then a
    // separate Enter key press. This is the exact pattern from yuri-worker.sh / yuri-spawn-worker.sh.
    const parts = sendKeysLiteralArgv(sessions[name].tmux, text);
    for (const p of parts) _runTmux(p);
    // Clear the draft (it's been sent).
    delete drafts[name];
    writeDrafts(drafts);
    sessions[name].status = 'running';
    touchActivity(sessions, name);
    writeSessions(sessions);
    appendEvent('session.send', { name });
    return { name, sent: text };
  },

  /**
   * peek <name> [--lines N]
   * Captures the pane tail via tmux capture-pane -p. Returns the text lines.
   */
  peek(name, opts = {}, _runTmux = runTmux) {
    if (!name) throw new Error('peek requires a session name');
    const sessions = readSessions();
    if (!sessions[name]) {
      throw new Error(`session '${name}' not found in registry`);
    }
    const lines = opts.lines ? parseInt(opts.lines, 10) : 50;
    const target = sessions[name].tmux;
    const output = _runTmux(['tmux', 'capture-pane', '-p', '-t', target, '-S', `-${lines}`]);
    touchActivity(sessions, name);
    writeSessions(sessions);
    appendEvent('session.peek', { name });
    return output;
  },

  /**
   * watch <name> --grep '<re>'
   * One-shot check: peeks the pane and returns whether the regex matches.
   */
  watch(name, opts = {}, _runTmux = runTmux) {
    if (!name) throw new Error('watch requires a session name');
    if (!opts.grep) throw new Error('watch requires --grep');
    const sessions = readSessions();
    if (!sessions[name]) {
      throw new Error(`session '${name}' not found in registry`);
    }
    const lines = opts.lines ? parseInt(opts.lines, 10) : 50;
    const target = sessions[name].tmux;
    const output = _runTmux(['tmux', 'capture-pane', '-p', '-t', target, '-S', `-${lines}`]);
    const re = new RegExp(opts.grep);
    const matched = re.test(output);
    touchActivity(sessions, name);
    writeSessions(sessions);
    appendEvent('session.watch', { name, matched });
    return { matched, grep: opts.grep };
  },

  /**
   * kill <name>
   * Kills the tmux session the conductor created and removes it from the registry.
   * Never kills a session not in the registry.
   */
  kill(name, _runTmux = runTmux) {
    if (!name) throw new Error('kill requires a session name');
    const sessions = readSessions();
    if (!sessions[name]) {
      throw new Error(`session '${name}' not found in registry`);
    }
    const target = sessions[name].tmux;
    try {
      _runTmux(['tmux', 'kill-session', '-t', target]);
    } catch {
      // Session may already be gone — non-fatal, still remove from registry.
    }
    delete sessions[name];
    writeSessions(sessions);
    // Also clear any pending draft.
    const drafts = readDrafts();
    if (drafts[name]) {
      delete drafts[name];
      writeDrafts(drafts);
    }
    appendEvent('session.kill', { name });
    return { name, killed: true };
  },

  /**
   * status --json
   * Health check. exit 0 = healthy. Returns summary of registered sessions.
   */
  status(opts = {}, _runTmux = runTmux) {
    const sessions = readSessions();
    const drafts = readDrafts();
    return {
      healthy: true,
      sessionCount: Object.keys(sessions).length,
      pendingDrafts: Object.keys(drafts).length,
      sessions: Object.keys(sessions),
    };
  },
};

// ─── send-keys literal helper (RT-01/02 fix) ──────────────────────────────────
// Builds TWO tmux argv arrays (never a shell string) for literal text delivery:
//   1. ['tmux', 'send-keys', '-t', target, '-l', '--', text]
//      -l = literal (disables tmux's own key-name interpretation of the text);
//      -- = stop tmux's OWN option parsing so text starting with '-' is never
//      mistaken for a flag. `text` travels as ONE argv element, untouched —
//      no quoting, no escaping, no regex re-tokenization. This is what makes
//      embedded double-quotes, single-quotes, `$(...)`, backticks, and
//      newlines all pass through byte-exact: there is no string the text ever
//      gets embedded into, so there is nothing to corrupt or leave a shell
//      (or tmux's own parser) in a `dquote>`-style stuck state.
//   2. ['tmux', 'send-keys', '-t', target, 'Enter']
//      Enter is sent as a SEPARATE call so it is never concatenated with the
//      literal text (which could otherwise let a trailing char merge with it).
export function sendKeysLiteralArgv(target, text) {
  return [
    ['tmux', 'send-keys', '-t', target, '-l', '--', text],
    ['tmux', 'send-keys', '-t', target, 'Enter'],
  ];
}

// ─── CLI entry ────────────────────────────────────────────────────────────────
function main(argv) {
  const { flags, positional } = parseArgs(argv);
  const command = positional[0];
  const name = positional[1];
  const asJson = flags.json === true;

  try {
    let result;
    switch (command) {
      case 'create':
        result = conductor.create(name, { cmd: flags.cmd || undefined });
        break;
      case 'list':
        result = conductor.list();
        break;
      case 'draft':
        result = conductor.draft(name, { text: flags.text });
        break;
      case 'send':
        result = conductor.send(name);
        break;
      case 'peek':
        result = conductor.peek(name, { lines: flags.lines });
        break;
      case 'watch':
        result = conductor.watch(name, { grep: flags.grep, lines: flags.lines });
        break;
      case 'kill':
        result = conductor.kill(name);
        break;
      case 'status':
        result = conductor.status({ json: asJson });
        break;
      default:
        process.stderr.write(
          `usage: session-conductor.mjs <create|list|draft|send|peek|watch|kill|status> [name] [opts]\n`
        );
        process.exit(1);
    }
    if (command === 'status' && asJson) {
      process.stdout.write(JSON.stringify(result) + '\n');
    } else if (command === 'list') {
      for (const s of result) {
        process.stdout.write(
          `${s.name}\t${s.status}\t${s.cmd || '(shell)'}\t${s.lastActivity}\n`
        );
      }
    } else if (typeof result === 'string') {
      process.stdout.write(result);
    } else if (result !== undefined) {
      process.stdout.write(JSON.stringify(result, null, 2) + '\n');
    }
    process.exit(0);
  } catch (err) {
    if (asJson) {
      process.stdout.write(JSON.stringify({ error: err.message, healthy: false }) + '\n');
    } else {
      process.stderr.write(`error: ${err.message}\n`);
    }
    process.exit(1);
  }
}

// Run CLI only when invoked directly (not when imported by tests)
const isMain = process.argv[1] && process.argv[1].endsWith('session-conductor.mjs');
if (isMain) {
  main(process.argv.slice(2));
}
