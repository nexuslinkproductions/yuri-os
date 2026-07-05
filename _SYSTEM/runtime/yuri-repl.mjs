#!/usr/bin/env node
// @capability: yuri-repl
// @serves: talk to yuri | yuri terminal demo | text chat with yuri | test yuri interactively | yuri cli
// @does: node-stdlib-only terminal REPL client for the EXISTING GLM voice brain (yuri-z-brain.py,
//        OpenAI-compatible /v1/chat/completions on :8014). Health-checks the brain, optionally spawns
//        it (--start-brain), prints the morning brief (if built), greets, then runs a chat loop with
//        local slash commands. Persona/system-prompt injection happens SERVER-SIDE in the brain
//        (yuri-voice-brain.md + MEMORY.md + canonical truth) — this client sends ONLY user/assistant
//        message turns, never persona text, so behavior stays single-sourced at the brain.
// @use: `node _SYSTEM/runtime/yuri-repl.mjs` for a text-only demo of the Yuri brain (voice loop is
//        separate — see run-yuri.sh/yuri.sh). `--start-brain` boots the brain if it's down.
// @exports: chatOnce, parseSlash, trimHistory, buildDraftArgv, buildSendArgv, buildPeekArgv,
//           main (CLI entry via --selftest/--help/default loop)
'use strict';

import http from 'node:http';
import readline from 'node:readline';
import { spawn } from 'node:child_process';
import { existsSync, appendFileSync, mkdirSync, openSync, closeSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..', '..');
const RUNTIME_STATE_DIR = path.join(REPO_ROOT, '_SYSTEM', 'state', 'runtime');
const EVENTS_LOG = path.join(RUNTIME_STATE_DIR, 'events.jsonl');
const BRAIN_LOG = path.join(RUNTIME_STATE_DIR, 'brain.log');
const BRAIN_SCRIPT = path.join(REPO_ROOT, '_SYSTEM', 'Scripts', 'voice', 'yuri-z-brain.py');
const MORNING_BRIEF = path.join(REPO_ROOT, '_SYSTEM', 'runtime', 'morning-brief.mjs');
const SESSION_CONDUCTOR = path.join(REPO_ROOT, '_SYSTEM', 'runtime', 'session-conductor.mjs');
const USAGE_METERS = path.join(REPO_ROOT, '_SYSTEM', 'runtime', 'usage-meters.mjs');

const DEFAULT_BRAIN_URL = process.env.YURI_BRAIN_URL || 'http://127.0.0.1:8014';
const HISTORY_CAP_TURNS = 24; // ~24 user+assistant turns kept; trimmed from the front
const SUBPROCESS_TIMEOUT_MS = 15000;
const START_BRAIN_TIMEOUT_MS = 30000;
// The brain's own agent loop can chain up to MAX_TOOL_ITERS=50 tool calls, each bash call allowed up
// to BASH_TIMEOUT=600s, inside one /v1/chat/completions turn (see yuri-z-brain.py). A short client
// timeout here would misfire "brain error: timed out" on a legitimately long-running agentic reply
// (e.g. "run the test suite") even though the brain is working correctly. Default generously high;
// override with YURI_CHAT_TIMEOUT_MS if a tighter interactive bound is ever wanted.
const CHAT_TIMEOUT_MS = Number(process.env.YURI_CHAT_TIMEOUT_MS) || 10 * 60 * 1000; // 10 minutes
const IS_TTY = Boolean(process.stdout.isTTY);

// ---- tiny plain-ANSI helpers (degrade to no-op when not a TTY) ----
const ansi = {
  dim: (s) => (IS_TTY ? `\x1b[2m${s}\x1b[0m` : s),
  bold: (s) => (IS_TTY ? `\x1b[1m${s}\x1b[0m` : s),
  cyan: (s) => (IS_TTY ? `\x1b[36m${s}\x1b[0m` : s),
  yellow: (s) => (IS_TTY ? `\x1b[33m${s}\x1b[0m` : s),
  red: (s) => (IS_TTY ? `\x1b[31m${s}\x1b[0m` : s),
  green: (s) => (IS_TTY ? `\x1b[32m${s}\x1b[0m` : s),
};

// ---- event log (append-only, fail-open) ----
function appendEvent(event, data = {}) {
  try {
    mkdirSync(RUNTIME_STATE_DIR, { recursive: true });
    const line = JSON.stringify({ t: new Date().toISOString(), comp: 'repl', event, data }) + '\n';
    appendFileSync(EVENTS_LOG, line);
  } catch {
    // fail-open: the REPL must never crash because the event log couldn't be written
  }
}

// ---- history trim (exported for testing) ----
// Keeps at most HISTORY_CAP_TURNS entries (a "turn" = one message, user or assistant), trimming
// from the FRONT (oldest first) so the most recent context survives.
function trimHistory(history, capTurns = HISTORY_CAP_TURNS) {
  if (!Array.isArray(history)) return [];
  if (history.length <= capTurns) return history;
  return history.slice(history.length - capTurns);
}

// ---- minimal HTTP JSON POST/GET over node:http (no deps) ----
function httpRequestJson(urlStr, { method = 'GET', body, timeoutMs = 20000 } = {}) {
  return new Promise((resolve, reject) => {
    let url;
    try {
      url = new URL(urlStr);
    } catch (e) {
      reject(new Error(`invalid URL: ${urlStr}`));
      return;
    }
    const payload = body !== undefined ? Buffer.from(JSON.stringify(body)) : null;
    const req = http.request(
      {
        hostname: url.hostname,
        port: url.port || 80,
        path: url.pathname + url.search,
        method,
        headers: payload
          ? { 'Content-Type': 'application/json', 'Content-Length': payload.length }
          : {},
        timeout: timeoutMs,
      },
      (res) => {
        let raw = '';
        res.on('data', (chunk) => {
          raw += chunk;
        });
        res.on('end', () => {
          let parsed;
          try {
            parsed = raw ? JSON.parse(raw) : {};
          } catch {
            parsed = { _raw: raw };
          }
          resolve({ status: res.statusCode, body: parsed });
        });
      }
    );
    req.on('timeout', () => {
      req.destroy(new Error('request timed out'));
    });
    req.on('error', (err) => reject(err));
    if (payload) req.write(payload);
    req.end();
  });
}

async function pingBrain(brainUrl, timeoutMs = 5000) {
  try {
    const { status, body } = await httpRequestJson(`${brainUrl}/health`, { method: 'GET', timeoutMs });
    if (status === 200 && body && body.ok) return { up: true, model: body.model, haskey: body.haskey };
    return { up: false };
  } catch {
    return { up: false };
  }
}

// ---- chatOnce: the core round-trip (exported for testing) ----
// history: array of {role:'user'|'assistant', content:string}. text: the new user message.
// Returns { reply, history: <updated, trimmed> } or throws on transport failure.
async function chatOnce(history, text, opts = {}) {
  const brainUrl = opts.brainUrl || DEFAULT_BRAIN_URL;
  const timeoutMs = opts.timeoutMs || CHAT_TIMEOUT_MS;
  const messages = [...(history || []), { role: 'user', content: text }];
  const { status, body } = await httpRequestJson(`${brainUrl}/v1/chat/completions`, {
    method: 'POST',
    body: { model: 'yuri', messages, stream: false },
    timeoutMs,
  });
  if (status !== 200) {
    throw new Error(`brain returned HTTP ${status}`);
  }
  const choice = body && Array.isArray(body.choices) ? body.choices[0] : null;
  const reply = choice && choice.message ? choice.message.content : '';
  if (typeof reply !== 'string') {
    throw new Error('brain response missing choices[0].message.content');
  }
  const updated = trimHistory([...messages, { role: 'assistant', content: reply }]);
  return { reply, history: updated };
}

// ---- slash command parsing (exported for testing) ----
// Returns {cmd, args} where cmd is the command name without the leading slash (lowercased),
// or null if the input is not a slash command (should be sent to the brain as chat text).
function parseSlash(input) {
  const trimmed = (input || '').trim();
  if (!trimmed.startsWith('/')) return null;
  const parts = trimmed.slice(1).split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { cmd: '', args: [] };
  const [cmd, ...args] = parts;
  return { cmd: cmd.toLowerCase(), args };
}

const SLASH_TABLE = {
  help: 'show this help',
  brief: 'run the morning brief (if built)',
  sessions: 'list managed sessions (if session-conductor is built)',
  draft: '<name> <text...> — draft a message into a named session (if session-conductor is built)',
  send: '<name> — send the drafted message for a named session (if session-conductor is built)',
  peek: '<name> — peek a named session (if session-conductor is built)',
  usage: 'show provider usage meters (if usage-meters is built)',
  brain: 'ping the brain and show model/latency',
  quit: 'exit the REPL',
};

function renderHelp() {
  const lines = ['Slash commands:'];
  for (const [cmd, desc] of Object.entries(SLASH_TABLE)) {
    lines.push(`  /${cmd}${' '.repeat(Math.max(1, 10 - cmd.length))}${desc}`);
  }
  lines.push('Anything else is sent to Yuri as a chat message. Ctrl-C also exits.');
  return lines.join('\n');
}

// ---- subprocess helper: run a node script with args, fail-open on timeout/missing/nonzero ----
function runSubprocess(scriptPath, args = [], { timeoutMs = SUBPROCESS_TIMEOUT_MS } = {}) {
  return new Promise((resolve) => {
    if (!existsSync(scriptPath)) {
      resolve({ ok: false, reason: 'not built yet', output: '' });
      return;
    }
    let settled = false;
    const child = spawn(process.execPath, [scriptPath, ...args], {
      cwd: REPO_ROOT,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let out = '';
    let err = '';
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill('SIGKILL');
      resolve({ ok: false, reason: `timed out after ${timeoutMs}ms`, output: out });
    }, timeoutMs);
    child.stdout.on('data', (d) => {
      out += d.toString();
    });
    child.stderr.on('data', (d) => {
      err += d.toString();
    });
    child.on('error', (e) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ ok: false, reason: e.message, output: out });
    });
    child.on('close', (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (code === 0) resolve({ ok: true, output: out });
      else resolve({ ok: false, reason: `exit ${code}: ${err.trim().slice(0, 200)}`, output: out });
    });
  });
}

// ---- brain-down guidance ----
function brainDownMessage(brainUrl) {
  return (
    `Brain not answering at ${brainUrl}.\n` +
    `Start it with:\n  python3 _SYSTEM/Scripts/voice/yuri-z-brain.py\n` +
    `or re-run this REPL with --start-brain to boot it automatically.`
  );
}

// ---- spawn the brain as a detached child, log to brain.log, poll for readiness ----
async function startBrain(brainUrl, { pollTimeoutMs = START_BRAIN_TIMEOUT_MS } = {}) {
  mkdirSync(RUNTIME_STATE_DIR, { recursive: true });
  const logFd = openSync(BRAIN_LOG, 'a');
  let child;
  try {
    child = spawn('python3', [BRAIN_SCRIPT], {
      cwd: REPO_ROOT,
      detached: true,
      stdio: ['ignore', logFd, logFd],
    });
  } finally {
    // FD-LEAK FIX: spawn() with a raw fd in `stdio` dup()s it into the child; the PARENT's copy
    // (logFd) is never needed again once the child holds its own duplicate, but was never closed
    // here — every --start-brain call (each REPL restart while the brain is down) leaked one fd.
    // Close unconditionally (even if spawn() throws) so repeated restarts never approach EMFILE.
    closeSync(logFd);
  }
  child.unref();
  appendEvent('brain-spawn-attempt', { pid: child.pid, script: BRAIN_SCRIPT });
  const start = Date.now();
  while (Date.now() - start < pollTimeoutMs) {
    const status = await pingBrain(brainUrl, 3000);
    if (status.up) {
      appendEvent('brain-ready', { pid: child.pid, elapsedMs: Date.now() - start });
      return { ok: true, model: status.model };
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  appendEvent('brain-start-timeout', { pid: child.pid, waitedMs: pollTimeoutMs });
  return { ok: false };
}

// ---- greeting time-of-day ----
function timeOfDayGreeting(date = new Date()) {
  const hour = date.getHours();
  if (hour < 5) return 'evening'; // late night reads as evening, not morning
  if (hour < 12) return 'morning';
  if (hour < 18) return 'afternoon';
  return 'evening';
}

function greetingLine(date = new Date()) {
  const tod = timeOfDayGreeting(date);
  return `Good ${tod} Marcel, shall we continue from where we left off or do you have something new for us to do?`;
}

// ---- arg parsing ----
function parseArgs(argv) {
  const opts = {
    selftest: false,
    help: false,
    startBrain: false,
    brainUrl: DEFAULT_BRAIN_URL,
    noBrief: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--selftest') opts.selftest = true;
    else if (a === '--help' || a === '-h') opts.help = true;
    else if (a === '--start-brain') opts.startBrain = true;
    else if (a === '--brain-url') opts.brainUrl = argv[++i] || DEFAULT_BRAIN_URL;
    else if (a === '--no-brief') opts.noBrief = true;
  }
  return opts;
}

const HELP_TEXT = `yuri-repl — terminal chat demo for the Yuri brain (:8014)

Usage:
  node _SYSTEM/runtime/yuri-repl.mjs [flags]

Flags:
  --start-brain        boot the brain (yuri-z-brain.py) if it isn't up, wait up to 30s for readiness
  --brain-url <url>     override the brain base URL (default: http://127.0.0.1:8014, env YURI_BRAIN_URL)
  --no-brief            skip the morning brief step
  --selftest            run offline self-checks (no server needed), exit 0/1
  --help                show this help

${renderHelp()}
`;

// ---- selftest: verify arg parsing, command table, history trim, event append — no server needed ----
function selftest() {
  const failures = [];

  // arg parsing
  const a1 = parseArgs(['--start-brain', '--brain-url', 'http://x:1', '--no-brief']);
  if (!a1.startBrain) failures.push('parseArgs: --start-brain not set');
  if (a1.brainUrl !== 'http://x:1') failures.push('parseArgs: --brain-url not captured');
  if (!a1.noBrief) failures.push('parseArgs: --no-brief not set');
  const a2 = parseArgs(['--selftest']);
  if (!a2.selftest) failures.push('parseArgs: --selftest not set');

  // command table: every SLASH_TABLE key must parse cleanly via parseSlash
  for (const cmd of Object.keys(SLASH_TABLE)) {
    const parsed = parseSlash(`/${cmd} foo bar`);
    if (!parsed || parsed.cmd !== cmd) failures.push(`parseSlash: /${cmd} did not round-trip`);
  }
  const nonSlash = parseSlash('hello there');
  if (nonSlash !== null) failures.push('parseSlash: non-slash input should return null');
  const bareSlash = parseSlash('/');
  if (!bareSlash || bareSlash.cmd !== '') failures.push('parseSlash: bare "/" should yield empty cmd');

  // history trim logic
  const long = Array.from({ length: 40 }, (_, i) => ({ role: i % 2 ? 'assistant' : 'user', content: `m${i}` }));
  const trimmed = trimHistory(long, 24);
  if (trimmed.length !== 24) failures.push(`trimHistory: expected 24, got ${trimmed.length}`);
  if (trimmed[trimmed.length - 1].content !== 'm39') failures.push('trimHistory: did not keep the most recent entry');
  const short = trimHistory([{ role: 'user', content: 'a' }], 24);
  if (short.length !== 1) failures.push('trimHistory: short history should pass through unchanged');

  // event append (fail-open, but should actually write under normal conditions)
  try {
    appendEvent('selftest', { ok: true });
    if (!existsSync(EVENTS_LOG)) failures.push('appendEvent: events.jsonl was not created');
  } catch (e) {
    failures.push(`appendEvent threw: ${e.message}`);
  }

  // greeting time-of-day mapping sanity
  const morning = timeOfDayGreeting(new Date('2026-07-04T08:00:00'));
  const afternoon = timeOfDayGreeting(new Date('2026-07-04T14:00:00'));
  const evening = timeOfDayGreeting(new Date('2026-07-04T20:00:00'));
  if (morning !== 'morning') failures.push(`timeOfDayGreeting: 08:00 expected morning, got ${morning}`);
  if (afternoon !== 'afternoon') failures.push(`timeOfDayGreeting: 14:00 expected afternoon, got ${afternoon}`);
  if (evening !== 'evening') failures.push(`timeOfDayGreeting: 20:00 expected evening, got ${evening}`);

  if (failures.length) {
    console.error(ansi.red('SELFTEST FAILED:'));
    for (const f of failures) console.error(`  - ${f}`);
    return 1;
  }
  console.log(ansi.green('SELFTEST OK') + ' — arg parsing, slash table, history trim, event append, greeting all verified.');
  return 0;
}

// ---- session-conductor subcommand argv builders (exported for testing) ----
// Pure functions — no subprocess spawn — so RT-05 regression tests can assert
// the exact argv shape byte-for-byte against session-conductor.mjs's actual
// CLI parsing (`draft` -> conductor.draft(name, {text: flags.text}), `send` ->
// conductor.send(name), `peek` -> conductor.peek(name, {lines: flags.lines})),
// without needing a live brain/session or a real subprocess spawn.
function buildDraftArgv(name, rest) {
  return ['draft', name, '--text', rest.join(' ')];
}
function buildSendArgv(name) {
  return ['send', name];
}
function buildPeekArgv(name) {
  return ['peek', name];
}

// ---- slash command dispatch (never sent to the brain) ----
async function dispatchSlash(cmd, args, ctx) {
  switch (cmd) {
    case 'help':
      return renderHelp();
    case 'brain': {
      const startedAt = Date.now();
      const status = await pingBrain(ctx.brainUrl, 5000);
      const latency = Date.now() - startedAt;
      if (status.up) return `brain OK -> model=${status.model || 'unknown'} latency=${latency}ms`;
      return `brain DOWN at ${ctx.brainUrl} (checked in ${latency}ms)`;
    }
    case 'brief': {
      if (!existsSync(MORNING_BRIEF)) return 'morning-brief not built yet';
      const res = await runSubprocess(MORNING_BRIEF, ['--text']);
      return res.ok ? res.output.trim() || '(brief produced no output)' : `brief failed: ${res.reason}`;
    }
    case 'sessions': {
      if (!existsSync(SESSION_CONDUCTOR)) return 'conductor not built yet';
      const res = await runSubprocess(SESSION_CONDUCTOR, ['list']);
      return res.ok ? res.output.trim() || '(no sessions)' : `sessions failed: ${res.reason}`;
    }
    case 'draft': {
      if (!existsSync(SESSION_CONDUCTOR)) return 'conductor not built yet';
      if (args.length < 2) return 'usage: /draft <name> <text...>';
      const [name, ...rest] = args;
      // RT-05 FIX: session-conductor.mjs's CLI parses `draft` as
      // `conductor.draft(name, { text: flags.text })` — the draft text MUST
      // arrive as the value of a `--text` flag, not as a second bare
      // positional. The old call (`['draft', name, rest.join(' ')]`) passed
      // the joined text as an unflagged positional argument, which
      // session-conductor's parseArgs() never maps to `flags.text` — so
      // `opts.text` was always undefined and conductor.draft() threw
      // "draft requires --text" on every single invocation (silently
      // non-functional). Fixed by passing `--text` explicitly.
      const res = await runSubprocess(SESSION_CONDUCTOR, buildDraftArgv(name, rest));
      return res.ok ? res.output.trim() || `drafted for ${name}` : `draft failed: ${res.reason}`;
    }
    case 'send': {
      if (!existsSync(SESSION_CONDUCTOR)) return 'conductor not built yet';
      if (args.length < 1) return 'usage: /send <name>';
      const res = await runSubprocess(SESSION_CONDUCTOR, buildSendArgv(args[0]));
      return res.ok ? res.output.trim() || `sent for ${args[0]}` : `send failed: ${res.reason}`;
    }
    case 'peek': {
      if (!existsSync(SESSION_CONDUCTOR)) return 'conductor not built yet';
      if (args.length < 1) return 'usage: /peek <name>';
      const res = await runSubprocess(SESSION_CONDUCTOR, buildPeekArgv(args[0]));
      return res.ok ? res.output.trim() || `(nothing to peek for ${args[0]})` : `peek failed: ${res.reason}`;
    }
    case 'usage': {
      if (!existsSync(USAGE_METERS)) return 'usage-meters not built yet';
      const res = await runSubprocess(USAGE_METERS, ['status']);
      return res.ok ? res.output.trim() || '(no usage data)' : `usage failed: ${res.reason}`;
    }
    case 'quit':
      return '__QUIT__';
    case '':
      return 'empty command — try /help';
    default:
      return `unknown command: /${cmd} — try /help`;
  }
}

// ---- main chat loop ----
// Returns a Promise that resolves only once ALL queued input has finished processing AND the
// readline interface has closed. Callers MUST await this — if the caller's promise resolved as soon
// as the listeners were registered (the original bug), an immediately-following process.exit() in
// main() would race ahead of any queued 'line' events (observed under piped/non-interactive stdin,
// where there's no human typing delay to accidentally mask the race).
//
// Lines are processed SERIALLY via an explicit queue (rather than relying on readline to wait for
// each 'line' listener's promise): when stdin is piped, node:readline fires ALL buffered 'line'
// events back-to-back synchronously without awaiting the (async) listener. Three distinct drops were
// reproduced and fixed here:
//   1. A fast '/quit' queued right after a chat message could call rl.close() while the earlier
//      message's network round-trip was still in flight, silently dropping its reply. Fixed by the
//      `queue` chain below: line N+1 does not start until line N's full async handling has finished.
//   2. On piped stdin, node:readline fires its OWN 'close' event as soon as the input stream hits
//      EOF — independent of whether the queued async work has drained. Fix #1 alone still let the
//      process exit mid-flight because 'close' resolved this promise immediately, without waiting on
//      `queue`. Fixed by awaiting `queue` inside the 'close' handler before resolving.
//   3. Once '/quit' set closing=true and the LAST queued item called rl.close(), any EARLIER item
//      still mid-flight in the queue that then called `rl.prompt()` (unconditionally, after its own
//      await) threw "readline was closed" — an uncaught synchronous throw inside that item's async
//      continuation, which silently rejected its link in the chain (queue.finally() fires on reject
//      just like resolve, so the chain appeared "drained" after only the FIRST item). Reproduced in
//      isolation: 4 piped lines ending in /quit only ever completed item #1. Fixed by guarding every
//      rl.prompt() call with safePrompt() below, which no-ops once the interface is closing/closed
//      instead of throwing.
function runChatLoop(brainUrl) {
  return new Promise((resolve) => {
    let history = [];
    let queue = Promise.resolve();
    let closing = false;
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      prompt: ansi.bold('you ▸ '),
      terminal: IS_TTY,
    });

    // Guards fix #3: rl.prompt() throws "readline was closed" once the interface has been closed
    // (e.g. by a queued /quit that ran ahead of this item finishing its own await). The reply/result
    // for this item has already been printed by the time we'd call this — the prompt re-render is
    // purely cosmetic, so swallowing the throw here is safe and keeps the rest of the chain alive.
    const safePrompt = () => {
      if (closing) return;
      try {
        rl.prompt();
      } catch {
        // readline already closed underneath us — nothing left to prompt for.
      }
    };

    const processLine = async (line) => {
      const text = line.trim();
      if (!text) {
        safePrompt();
        return;
      }
      const slash = parseSlash(text);
      if (slash) {
        // UNHANDLED-REJECTION FIX: dispatchSlash (unlike the chatOnce branch below) had no try/catch —
        // a slash handler throwing synchronously or via a rejected await (e.g. a subprocess helper
        // throwing outside runSubprocess's own resolve-only contract) propagated straight out of
        // processLine(), which the `queue = queue.then(...)` chain never .catch()'d — an unhandled
        // rejection that also silently skipped safePrompt(), leaving the REPL looking stuck.
        try {
          const result = await dispatchSlash(slash.cmd, slash.args, { brainUrl });
          if (result === '__QUIT__') {
            closing = true;
            appendEvent('session-end', { reason: 'quit-command' });
            return;
          }
          console.log(ansi.dim(result));
        } catch (e) {
          console.log(ansi.red(`(command error: ${e.message})`));
        }
        safePrompt();
        return;
      }
      try {
        const { reply, history: updated } = await chatOnce(history, text, { brainUrl });
        history = updated;
        console.log(ansi.cyan('Yuri ▸ ') + reply);
      } catch (e) {
        console.log(ansi.red(`(brain error: ${e.message})`));
      }
      safePrompt();
    };

    rl.prompt();
    rl.on('line', (line) => {
      if (closing) return; // a queued line arriving after /quit's queue entry is a no-op
      // Chain onto the queue so this line's handling starts only after the previous one finished —
      // this is what prevents drop #1: no handler starts until the prior one has fully awaited.
      // Defense-in-depth .catch(): processLine() itself now guards every branch that can throw, but
      // this keeps the queue chain alive (rather than "poisoning" all subsequent links with a
      // permanently-rejected promise) even if a future code path introduces an unguarded throw.
      queue = queue
        .then(() => processLine(line))
        .catch((e) => {
          console.log(ansi.red(`(unexpected REPL error: ${e && e.message ? e.message : e})`));
          safePrompt();
        })
        .then(() => {
          if (closing) rl.close();
        });
    });

    rl.on('SIGINT', () => {
      closing = true;
      appendEvent('session-end', { reason: 'sigint' });
      console.log('\nbye.');
      // Wait for any in-flight line to finish before closing, same drop-prevention as /quit.
      queue = queue.then(() => rl.close());
    });

    rl.on('close', () => {
      // Fix for drop #2: readline's own 'close' (fires on stdin EOF under piped input, or after
      // rl.close() above) must not resolve this promise until the queued async work has actually
      // settled — otherwise a caller doing `await runChatLoop(...); process.exit(...)` can kill the
      // process mid-way through a still-in-flight chatOnce/dispatchSlash call.
      queue.finally(() => {
        appendEvent('session-end', { reason: 'stdin-closed' });
        resolve();
      });
    });
  });
}

// ---- entry point ----
async function main() {
  const opts = parseArgs(process.argv.slice(2));

  if (opts.help) {
    console.log(HELP_TEXT);
    return 0;
  }

  if (opts.selftest) {
    return selftest();
  }

  console.log(ansi.bold('=== Yuri REPL ===') + ansi.dim(`  (brain: ${opts.brainUrl})`));
  appendEvent('session-start', { brainUrl: opts.brainUrl });

  let status = await pingBrain(opts.brainUrl, 5000);
  if (!status.up && opts.startBrain) {
    console.log(ansi.yellow('brain is down — starting it (this can take a few seconds)...'));
    const started = await startBrain(opts.brainUrl);
    status = started.ok ? { up: true, model: started.model } : { up: false };
  }

  if (!status.up) {
    console.log(ansi.red(brainDownMessage(opts.brainUrl)));
    appendEvent('brain-down', { brainUrl: opts.brainUrl });
    return 1;
  }
  console.log(ansi.green(`brain OK`) + ansi.dim(` -> model=${status.model || 'unknown'}`));

  if (!opts.noBrief && existsSync(MORNING_BRIEF)) {
    const res = await runSubprocess(MORNING_BRIEF, ['--text'], { timeoutMs: 10000 });
    if (res.ok && res.output.trim()) {
      console.log(ansi.dim('--- morning brief ---'));
      console.log(res.output.trim());
      console.log(ansi.dim('---------------------'));
    }
  }

  console.log(ansi.cyan('Yuri ▸ ') + greetingLine());
  appendEvent('greeting-shown', {});

  await runChatLoop(opts.brainUrl);
  return 0;
}

// Only run when executed directly (not when imported for tests).
const isDirectRun = process.argv[1] && path.resolve(process.argv[1]) === __filename;
if (isDirectRun) {
  main()
    .then((code) => process.exit(code || 0))
    .catch((e) => {
      console.error(ansi.red(`fatal: ${e.message}`));
      process.exit(1);
    });
}

export {
  chatOnce,
  parseSlash,
  trimHistory,
  parseArgs,
  timeOfDayGreeting,
  greetingLine,
  pingBrain,
  brainDownMessage,
  dispatchSlash,
  buildDraftArgv,
  buildSendArgv,
  buildPeekArgv,
  SLASH_TABLE,
  DEFAULT_BRAIN_URL,
};
