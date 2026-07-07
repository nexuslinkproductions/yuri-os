#!/usr/bin/env bun
// @capability: voice-orchestrator
// @serves: yuri voice loop | omp sdk embedding | stt/tts bridge coordination | streaming sentence tts
// @does: Coordinates the 3-process Yuri voice assistant. Embeds the OMP SDK (createAgentSession)
//   as the brain when available, falling back to a spawned `omp --mode json` subprocess. Spawns the
//   Python STT + TTS bridges and runs a half-duplex loop: listen -> prompt -> stream text_delta into
//   sentence-sized chunks -> speak -> repeat. Bridges and the OMP session are restarted on crash.
// @use: `bun run _SYSTEM/Scripts/voice/orchestrator.mjs` (or `node ...` for the subprocess fallback).
//   Reads JSON commands on its own stdin: {"cmd":"switch_model","model":"..."} | {"cmd":"quit"}.
//   All state changes are logged as JSONL on stderr; stdout is left free for the caller.
// @ipc: newline-delimited JSON over each bridge's stdin/stdout.
//   STT: send {"cmd":"listen"} -> recv {"text":"..."} | {"text":"","status":"timeout"}
//   TTS: send {"cmd":"speak","text":"..."} -> recv {"status":"done"}  (also {"cmd":"quit"} to exit)

import { spawn } from 'node:child_process';
import { homedir, platform } from 'node:os';
import { dirname, join, resolve as pathResolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { realpathSync, existsSync } from 'node:fs';
import { Worker } from 'node:worker_threads';

// ─── configuration ──────────────────────────────────────────────────────────
// File lives at <root>/_SYSTEM/Scripts/voice/orchestrator.mjs → three levels up to repo root.
const REPO_ROOT = process.env.YURI_ROOT ||
  pathResolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const VOICE_DIR = process.env.YURI_VOICE_DIR || pathResolve(REPO_ROOT, '_SYSTEM', 'Scripts', 'voice');
const PYTHON = process.env.YURI_PYTHON ||
  pathResolve(REPO_ROOT, '_SYSTEM', 'state', 'voice', '.venv-pipecat', 'bin', 'python');
const STT_SCRIPT = process.env.YURI_STT_SCRIPT || 'stt-bridge.py';
const TTS_SCRIPT = process.env.YURI_TTS_SCRIPT || 'tts-bridge.py';
const OMP_BIN = process.env.YURI_OMP_BIN || 'omp';

const DEFAULT_MODEL = process.env.YURI_MODEL || 'glm-5.2';
// 'off' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh'. GLM-5.2 is a reasoning model and the SDK
// defaults new sessions to extended thinking, turning every voice turn into an 11-25s wait even for
// "what's two plus two". 'off' brings a turn down to ~1-1.5s; override with YURI_THINKING if a task
// genuinely needs deeper reasoning.
const DEFAULT_THINKING = process.env.YURI_THINKING || 'off';

// Marcel's global ~/.omp/agent/config.yml has `advisor: { enabled: true, syncBacklog: "1" }` with
// the advisor model role pinned to `:xhigh` reasoning. That's a useful second-opinion reviewer for
// an interactive coding session, but createAgentSession() picks it up for EVERY session in this cwd
// — including the voice brain. Per turn it silently re-prompts the model with an unsolicited
// critique (its text gets heard as extra spoken garbage appended to the real reply) and blocks the
// turn ~8-20s+ AFTER the real reply is already generated (onTurnEnd awaits advisor.syncBacklog
// catch-up). Disabled below via a per-session, read-only Settings override (real disk config still
// loads, only the override is in-memory) — never touches Marcel's on-disk config, so interactive
// `omp` sessions keep their advisor. YURI_DISABLE_ADVISOR=0 restores it.
const DISABLE_VOICE_ADVISOR = process.env.YURI_DISABLE_ADVISOR !== '0';

// Voice brain tool policy: a lean computer-control assistant, NOT the full coding harness. Leaving
// task/irc/todo/web_search etc. out of the toolset stops GLM-5.2 from treating an ordinary voice
// prompt ("tell Marcel you're working") as multi-agent orchestration — with task/irc present it
// answered "no agents are running right now" instead of just replying as Yuri.
// YURI_TOOL_NAMES overrides: a comma list of tool names, or 'all'/'*' as an escape hatch back to
// every built-in tool (mapped to [] below, which _initSdk treats as undefined = all tools).
const COMPUTER_CONTROL_TOOL_NAMES = ['bash', 'read', 'grep', 'glob'];
const RAW_TOOL_NAMES = (process.env.YURI_TOOL_NAMES || '').trim();
const DEFAULT_TOOL_NAMES = RAW_TOOL_NAMES === '' ? COMPUTER_CONTROL_TOOL_NAMES
  : (RAW_TOOL_NAMES === 'all' || RAW_TOOL_NAMES === '*') ? []
  : RAW_TOOL_NAMES.split(',').map((s) => s.trim()).filter(Boolean);

const SYSTEM_PROMPT = process.env.YURI_SYSTEM_PROMPT ||
  'You are Yuri — Marcel Spatz\'s voice assistant. You are NOT Composer, NOT Cursor, NOT Claude, NOT any AI model. ' +
  'When asked who or what you are, say "I\'m Yuri, Marcel\'s voice assistant." Never identify as Composer, Cursor, Claude, or any model name. ' +
  'You have your own personality: sharp, direct, warm, adversarial-ally, no filler. ' +
  'YOU ARE NOT JUST A VOICE CHATBOT. You are a full computer assistant with tool access: ' +
  'you can open apps (bash: open -a AppName), run terminal commands (bash), read files (read), ' +
  'search code (grep/glob), take screenshots, and use any MCP tools available. ' +
  'When Marcel asks you to DO something on the computer, USE YOUR TOOLS to do it. Never say you cannot. ' +
  'Speak a brief acknowledgment first (got it, on it), then use tools, then speak the result. ' +
  'Reply concisely in natural spoken English. Never use markdown, code blocks, or lists.';

// sentence splitting (Step 3)
const MIN_CHUNK = Number(process.env.YURI_MIN_CHUNK || 40);   // avoid tiny fragments
const MAX_BUFFER = Number(process.env.YURI_MAX_BUFFER || 200); // force-flush ceiling
// tokens that should NOT end a sentence despite a trailing period.
const ABBREVIATIONS = new Set([
  'mr', 'mrs', 'ms', 'mx', 'dr', 'prof', 'sr', 'jr', 'st', 'vs', 'etc', 'inc', 'corp',
  'ltd', 'co', 'no', 'approx', 'dept', 'univ', 'acct', 'fig', 'vol', 'pp', 'cf', 'al',
]);

// restart backoff
const RESTART_MIN_MS = 500;
const RESTART_MAX_MS = 8000;

// ─── logging (stderr JSONL only — stdout belongs to the caller) ──────────────
function log(level, event, extra = {}) {
  const line = JSON.stringify({ ts: Date.now(), level, event, ...extra });
  process.stderr.write(line + '\n');
}
const now = () => Date.now();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ─── native-spin watchdog ───────────────────────────────────────────────────
// When the OMP SDK's GLM streaming connection stalls, the SDK enters a native
// busy-poll that blocks the JS event loop. setTimeout-based timeouts (the 60s
// Promise.race in respond()) and SIGTERM handlers CANNOT fire. The process spins
// at 100% CPU forever. This worker-thread watchdog has its OWN event loop
// (separate libuv thread), so its setInterval keeps ticking even when the main
// thread is stuck. If the heartbeat goes stale beyond WATCHDOG_TIMEOUT_SECS,
// the worker force-kills the process so the launcher can restart cleanly.
const WATCHDOG_TIMEOUT_SECS = Number(process.env.YURI_WATCHDOG_TIMEOUT_SECS || 30);

class SpinWatchdog {
  constructor(timeoutSecs = WATCHDOG_TIMEOUT_SECS) {
    this.timeoutMs = timeoutSecs * 1000;
    this.worker = null;
    this.sab = null;
    this.beatView = null;       // Float64Array over the SAB — holds the full Date.now()
    this.beatInterval = null;   // main-thread heartbeat (fires only when the loop is responsive)
  }

  start() {
    // Heartbeat design: a MAIN-THREAD setInterval writes Date.now() every second. It fires ONLY
    // when the event loop is responsive, so it is the true "not spinning" signal — independent of
    // application idle. Awaiting STT for 60s keeps the loop free, so the interval keeps firing and
    // the watchdog stays quiet; a native SDK busy-poll blocks the loop, the interval stops firing,
    // the heartbeat goes stale, and the worker SIGKILLs the whole process.
    // Float64Array (not Int32) because Date.now() ~1.78e12 overflows Int32.
    let mode;
    try {
      this.sab = new SharedArrayBuffer(8);           // one Float64 slot
      this.beatView = new Float64Array(this.sab);
      this.beatView[0] = Date.now();
      mode = 'sab';
    } catch {
      mode = 'postMessage';
    }

    const workerCode = `
      const { parentPort, workerData } = require('node:worker_threads');
      const timeoutMs = workerData.timeoutMs;
      const mode = workerData.mode;
      const view = workerData.sab ? new Float64Array(workerData.sab) : null;
      const checkMs = Math.max(1000, Math.min(5000, Math.floor(timeoutMs / 3)));
      let lastSeen = view ? view[0] : Date.now();
      let lastFresh = Date.now();
      function kill(reason) {
        process.stderr.write('[watchdog] ' + reason + ' — SIGKILL self\\n');
        // Worker threads share the process pid; SIGKILL to self kills the whole process (all threads).
        try { process.kill(process.pid, 'SIGKILL'); } catch (e) {}
        process.exit(1); // fallback if kill is unavailable
      }
      if (mode === 'sab') {
        setInterval(() => {
          const hb = view[0];
          if (hb !== lastSeen) { lastSeen = hb; lastFresh = Date.now(); return; }
          if (Date.now() - lastFresh > timeoutMs) kill('event loop blocked >' + timeoutMs + 'ms');
        }, checkMs);
      } else {
        parentPort.on('message', () => { lastFresh = Date.now(); });
        setInterval(() => {
          if (Date.now() - lastFresh > timeoutMs) kill('heartbeat stale >' + timeoutMs + 'ms');
        }, checkMs);
      }
    `;

    this.worker = new Worker(workerCode, {
      eval: true,
      workerData: { timeoutMs: this.timeoutMs, mode, sab: this.sab },
    });
    this.worker.unref?.();  // never keep the process alive just for the watchdog
    this.worker.on('error', (e) => log('warn', 'watchdog_worker_error', { err: String(e) }));

    this.beatInterval = setInterval(() => {
      if (this.beatView) this.beatView[0] = Date.now();
      else if (this.worker) { try { this.worker.postMessage(1); } catch {} }
    }, 1000);
    this.beatInterval.unref?.();
    log('info', 'watchdog_started', { timeoutMs: this.timeoutMs, mode });
  }

  stop() {
    if (this.beatInterval) { clearInterval(this.beatInterval); this.beatInterval = null; }
    if (this.worker) { try { this.worker.terminate(); } catch {} this.worker = null; }
  }
}

// ─── OMP SDK resolution ─────────────────────────────────────────────────────
// The SDK ships as TypeScript source (main: ./src/index.ts) and lives in the Bun
// global install; it is importable via an absolute file URL under Bun only. Under
// Node the import fails and we transparently fall back to the `omp` subprocess.
async function resolveSdkModule() {
  // 1. bare specifier (works if installed locally or on NODE_PATH)
  try {
    const mod = await import('@oh-my-pi/pi-coding-agent');
    log('debug', 'sdk_resolved', { via: 'bare' });
    return mod;
  } catch { /* fall through */ }

  const candidates = [];
  // 2. Bun global install (canonical location)
  candidates.push(join(homedir(), '.bun', 'install', 'global', 'node_modules', '@oh-my-pi', 'pi-coding-agent', 'src', 'index.ts'));
  // 3. derive from the omp binary itself (omp -> .../pi-coding-agent/dist/cli.js)
  try {
    const ompPath = which(OMP_BIN);
    if (ompPath) {
      const real = realpathSync(ompPath);             // .../pi-coding-agent/dist/cli.js
      candidates.push(join(dirname(real), '..', 'src', 'index.ts'));
    }
  } catch { /* ignore */ }

  for (const p of candidates) {
    if (!p || !existsSync(p)) continue;
    try {
      const mod = await import(pathToFileURL(p).href);
      log('debug', 'sdk_resolved', { via: 'absolute', path: p });
      return mod;
    } catch (e) {
      log('debug', 'sdk_candidate_failed', { path: p, err: String(e).split('\n')[0] });
    }
  }
  return null;
}

// minimal `which` — resolves a binary name to a path using PATH (no shell-out).
function which(name) {
  if (name.includes('/') && existsSync(name)) return name;
  const PATH = process.env.PATH || '';
  const exts = platform() === 'win32' ? (process.env.PATHEXT || '.exe').split(';') : [''];
  for (const dir of PATH.split(':')) {
    if (!dir) continue;
    for (const ext of exts) {
      const full = join(dir, name + ext);
      if (existsSync(full)) return full;
    }
  }
  return null;
}

// ─── sentence splitter (Step 3) ─────────────────────────────────────────────
export class SentenceSplitter {
  constructor(min = MIN_CHUNK, max = MAX_BUFFER) {
    this.min = min;
    this.max = max;
    this.buf = '';
  }

  // Feed a text delta; returns an array of complete sentences ready to speak.
  push(chunk) {
    if (!chunk) return [];
    this.buf += chunk;
    const out = [];
    // scan for sentence boundaries: [.!?] optionally followed by whitespace/quote, or a newline
    let i = 0;
    while (i < this.buf.length) {
      const ch = this.buf[i];
      const isNL = ch === '\n' || ch === '\r';
      const isEnd = ch === '.' || ch === '!' || ch === '?';
      if (!(isNL || isEnd)) { i++; continue; }

      // newline always splits (don't consume trailing space)
      if (isNL) {
        const sentence = this.buf.slice(0, i);
        this.buf = this.buf.slice(i + 1);
        i = 0;
        const t = sentence.trim();
        if (t) out.push(t);
        continue;
      }

      // [.!?]: guard against abbreviations and decimals BEFORE committing.
      const prevWord = /[A-Za-z]+$/.test(this.buf.slice(0, i)) ? this.buf.slice(0, i).match(/[A-Za-z]+$/)[0].toLowerCase() : '';
      const prevIsDigit = /\d$/.test(this.buf.slice(0, i));
      const nextIsDigit = /\d/.test(this.buf.slice(i + 1, i + 2));
      const isAbbrev = ABBREVIATIONS.has(prevWord);
      const isDecimal = prevIsDigit && nextIsDigit;
      if (isAbbrev || isDecimal) { i++; continue; }

      // boundary confirmed — peek ahead to swallow one following space/quote/paren
      let j = i + 1;
      if (this.buf[j] === ' ') j++;
      else if (this.buf[j] === '"' || this.buf[j] === "'" || this.buf[j] === ')') { j++; if (this.buf[j] === ' ') j++; }

      const sentence = this.buf.slice(0, i + 1);
      this.buf = this.buf.slice(j);
      i = 0;
      const t = sentence.trim();
      if (!t) continue;

      // hold short fragments until they accumulate past `min`, unless we've hit the ceiling.
      if (t.length < this.min && this.buf.length + t.length < this.max) {
        this.buf = t + ' ' + this.buf;   // re-buffer; a later boundary will catch the whole run
        continue;
      }
      out.push(t);
    }

    // force-flush if the buffer has grown beyond the ceiling
    if (this.buf.length >= this.max) {
      const t = this.buf.trim();
      this.buf = '';
      if (t) out.push(t);
    }
    return out;
  }

  // Emit whatever remains (called at turn end). Single chunk.
  flush() {
    const t = this.buf.trim();
    this.buf = '';
    return t ? [t] : [];
  }

  reset() { this.buf = ''; }
}

// ─── JSON line bridge to a Python subprocess ────────────────────────────────
export class JsonBridge {
  constructor({ name, cmd, args, cwd, env, ready }) {
    this.name = name;
    this.cmd = cmd;
    this.args = args;
    this.cwd = cwd;
    this.env = env;
    this.ready = ready; // optional (msg) => boolean — first stdout msg that means "ready"
    this.proc = null;
    this.alive = false;
    this.deadReason = null;
    this._buf = '';
    this._waiters = []; // FIFO of {resolve, reject, predicate?}
    this._exited = false;
    this._stderrBuf = '';
    this._readySeen = false;
  }

  async start() {
    this._exited = false;
    this._buf = '';
    this._waiters = [];
    this._readySeen = false;
    log('info', 'bridge_spawning', { bridge: this.name, cmd: this.cmd, args: this.args });
    this.proc = spawn(this.cmd, this.args, {
      cwd: this.cwd,
      env: { ...process.env, ...(this.env || {}) },
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    this.alive = true;
    this.deadReason = null;

    this.proc.stdout.setEncoding('utf8');
    this.proc.stdout.on('data', (d) => this._onStdout(d));
    this.proc.stderr.setEncoding('utf8');
    this.proc.stderr.on('data', (d) => {
      this._stderrBuf += d;
      let nl;
      while ((nl = this._stderrBuf.indexOf('\n')) >= 0) {
        const line = this._stderrBuf.slice(0, nl).replace(/\r$/, '');
        this._stderrBuf = this._stderrBuf.slice(nl + 1);
        if (line.trim()) log('debug', 'bridge_stderr', { bridge: this.name, line });
      }
    });
    this.proc.on('error', (err) => this._die('spawn_error', String(err)));
    this.proc.on('exit', (code, sig) => {
      const reason = `exit code=${code} signal=${sig}`;
      this._die(code === 0 && !this._waiters.length ? 'clean_exit' : 'unexpected_exit', reason);
    });
    return this;
  }

  _onStdout(data) {
    this._buf += data;
    let nl;
    while ((nl = this._buf.indexOf('\n')) >= 0) {
      const raw = this._buf.slice(0, nl).replace(/\r$/, '');
      this._buf = this._buf.slice(nl + 1);
      if (!raw.trim()) continue;
      let msg;
      try { msg = JSON.parse(raw); }
      catch { log('warn', 'bridge_bad_json', { bridge: this.name, raw: raw.slice(0, 200) }); continue; }

      // mark ready state for awaitReady() (still flows to a matching waiter below)
      if (this.ready && this.ready(msg)) this._readySeen = true;
      // dispatch to the first waiter whose predicate matches (or has no predicate).
      // A non-matching message is unsolicited — it must NOT be force-fed to a predicate waiter.
      const idx = this._waiters.findIndex((w) => !w.predicate || w.predicate(msg));
      if (idx >= 0) {
        const [w] = this._waiters.splice(idx, 1);
        clearTimeout(w.timer);
        w.resolve(msg);
      } else {
        log('debug', 'bridge_unsolicited', { bridge: this.name, msg });
      }
    }
  }

  // Send a JSON command. Returns true on success.
  send(obj) {
    if (!this.alive || !this.proc || !this.proc.stdin.writable) {
      log('warn', 'bridge_send_dead', { bridge: this.name, obj });
      return false;
    }
    try {
      this.proc.stdin.write(JSON.stringify(obj) + '\n');
      return true;
    } catch (e) {
      log('warn', 'bridge_send_failed', { bridge: this.name, err: String(e) });
      return false;
    }
  }

  // Wait for the next message (optionally matching a predicate). Rejects if the bridge dies.
  next(predicate, timeoutMs) {
    return new Promise((res, rej) => {
      const w = { resolve: res, reject: rej, predicate };
      if (timeoutMs) {
        w.timer = setTimeout(() => {
          const i = this._waiters.indexOf(w);
          if (i >= 0) this._waiters.splice(i, 1);
          rej(new Error(`${this.name} next() timed out after ${timeoutMs}ms`));
        }, timeoutMs);
      }
      this._waiters.push(w);
    });
  }
  // Wait for the bridge's ready handshake (e.g. TTS {"status":"ready"} after model warmup).
  // Resolves immediately if ready already arrived. No-op when no `ready` predicate was configured.
  async awaitReady(timeoutMs = 30000) {
    if (!this.ready) return;
    if (this._readySeen) return;
    await this.next(this.ready, timeoutMs);
  }

  _die(kind, reason) {
    if (!this.alive && this._exited) return;
    this.alive = false;
    this._exited = true;
    this.deadReason = `${kind}: ${reason}`;
    log(kind === 'clean_exit' ? 'info' : 'error', 'bridge_died', { bridge: this.name, kind, reason });
    const err = new Error(`${this.name} died: ${this.deadReason}`);
    for (const w of this._waiters.splice(0)) {
      if (w.timer) clearTimeout(w.timer);
      w.reject(err);
    }
    try { this.proc && this.proc.kill(); } catch { /* ignore */ }
  }

  async stop() {
    this.alive = false;
    if (this.proc) {
      try { this.proc.stdin && this.proc.stdin.end(); } catch { /* ignore */ }
      try {
        await new Promise((res) => {
          const t = setTimeout(() => { try { this.proc.kill('SIGKILL'); } catch {} res(); }, 1500);
          this.proc.once('exit', () => { clearTimeout(t); res(); });
        });
      } catch { /* ignore */ }
    }
    this.proc = null;
  }
}

// ─── OMP brain (SDK mode + subprocess mode share the event handler) ──────────
export class OmpBrain {
  constructor({ model, toolNames, systemPrompt, thinkingLevel }) {
    this.modelPattern = model;
    this.toolNames = toolNames;
    this.systemPrompt = systemPrompt;
    this.thinkingLevel = thinkingLevel || DEFAULT_THINKING;  // 'off'|'minimal'|'low'|'medium'|'high'|'xhigh'
    this.mode = null;            // 'sdk' | 'subprocess'
    this.sdk = null;             // resolved SDK module
    this.session = null;         // AgentSession (sdk mode)
    this.sessionId = null;       // for --continue continuity (subprocess mode)
    this._turnListeners = null;  // current turn's {onDelta, resolve, reject}
  }

  // ── shared text_delta / lifecycle handler ──────────────────────────────────
  // `onDelta(string)` receives spoken text deltas. Resolves the turn on agent_end.
  _handleEvent(event) {
    if (!event || typeof event !== 'object') return;
    const t = this._turnListeners;
    if (!t) return;
    if (event.type === 'message_update') {
      const ame = event.assistantMessageEvent;
      if (ame && ame.type === 'text_delta' && typeof ame.delta === 'string') {
        try { t.onDelta(ame.delta); } catch (e) { log('warn', 'ondelta_threw', { err: String(e) }); }
      }
      // thinking_delta / toolcall_delta are intentionally suppressed/buffered (not spoken)
      if (ame && ame.type === 'error') {
        t.reject(new Error('OMP assistant stream error: ' + (ame.error?.errorMessage || 'unknown')));
      }
    } else if (event.type === 'agent_end') {
      t.resolve();
    }
  }

  async init() {
    this.sdk = await resolveSdkModule();
    if (this.sdk && typeof this.sdk.createAgentSession === 'function') {
      await this._initSdk();
    } else {
      await this._initSubprocessProbe();
    }
    log('info', 'brain_ready', { mode: this.mode, model: this.modelPattern });
  }

  async _initSdk() {
    const { createAgentSession, SessionManager, Settings } = this.sdk;
    const sessionManager = typeof SessionManager?.inMemory === 'function'
      ? await SessionManager.inMemory() : undefined;
    // Read-only settings load (see DISABLE_VOICE_ADVISOR above): Settings.loadReadOnly() reads
    // Marcel's REAL global + project config.yml (modelRoles, compaction, disabledProviders, etc.
    // all preserved) and layers the advisor override on top, in-memory. Its persist flag is
    // hardcoded false internally — structurally guaranteed to never write config.yml, unlike
    // Settings.init() (the normal singleton, which DOES persist runtime mutations back to disk).
    let settings;
    if (DISABLE_VOICE_ADVISOR && typeof Settings?.loadReadOnly === 'function') {
      try {
        settings = await Settings.loadReadOnly({ cwd: REPO_ROOT, overrides: { 'advisor.enabled': false } });
      } catch (e) {
        log('warn', 'brain_settings_override_failed', { err: String(e).split('\n')[0] });
      }
    }
    log('info', 'brain_sdk_creating', { model: this.modelPattern, tools: this.toolNames, thinking: this.thinkingLevel, advisorDisabled: !!settings });
    const result = await createAgentSession({
      cwd: REPO_ROOT,
      modelPattern: this.modelPattern,
      thinkingLevel: this.thinkingLevel,  // 'off' by default — extended thinking otherwise adds 11-25s/turn
      systemPrompt: this.systemPrompt,
      toolNames: (this.toolNames && this.toolNames.length > 0) ? this.toolNames : undefined,  // undefined = all tools (fix: [] is truthy)
      sessionManager,
      autoApprove: true,            // headless: no approval prompts
      settings,
      hasUI: false,
      enableMcp: false,             // clean voice brain — no MCP surface
      enableLsp: false,
      disableExtensionDiscovery: true,
      skills: [],
      rules: [],
      skipPythonPreflight: true,
      agentId: 'YuriVoice',
      agentDisplayName: 'yuri-voice',
    });
    this.session = result.session;
    this.mode = 'sdk';
    this.session.subscribe((event) => this._handleEvent(event));
  }

  async _initSubprocessProbe() {
    // Confirm `omp` exists; the actual per-turn subprocess is spawned in prompt().
    const p = which(OMP_BIN);
    if (!p) throw new Error(`OMP SDK unavailable and '${OMP_BIN}' binary not found on PATH`);
    this.mode = 'subprocess';
    log('warn', 'brain_sdk_unavailable', { omp: p, fallback: 'subprocess_per_turn' });
  }

  // Run one turn. `onDelta` receives text deltas as they stream. Resolves on turn end.
  async prompt(text, onDelta) {
    if (this.mode === 'sdk') return this._promptSdk(text, onDelta);
    return this._promptSubprocess(text, onDelta);
  }

  async _promptSdk(text, onDelta) {
    let resolveTurn, rejectTurn;
    const done = new Promise((res, rej) => { resolveTurn = res; rejectTurn = rej; });
    this._turnListeners = { onDelta, resolve: resolveTurn, reject: rejectTurn };
    try {
      const forwarded = await this.session.prompt(text);
      if (!forwarded) { resolveTurn(); return; } // handled locally (command), no turn expected
      await done;
    } finally {
      this._turnListeners = null;
    }
  }

  async _promptSubprocess(text, onDelta) {
    const omp = which(OMP_BIN);
    if (!omp) throw new Error(`'${OMP_BIN}' binary not found`);
    const args = ['--allow-home', '--mode', 'json', '-p', '--model', this.modelPattern];
    if (this.sessionId) args.push('--resume', this.sessionId);
    else { args.push('--system-prompt', this.systemPrompt); }
    args.push(text);

    log('debug', 'brain_subprocess_prompt', { model: this.modelPattern, resume: !!this.sessionId });
    await new Promise((resolveRun, rejectRun) => {
      const child = spawn(omp, args, { cwd: REPO_ROOT, env: { ...process.env }, stdio: ['ignore', 'pipe', 'pipe'] });
      let buf = '';
      let stderrTail = '';
      child.stdout.setEncoding('utf8');
      child.stdout.on('data', (d) => {
        buf += d;
        let nl;
        while ((nl = buf.indexOf('\n')) >= 0) {
          const raw = buf.slice(0, nl).replace(/\r$/, '');
          buf = buf.slice(nl + 1);
          if (!raw.trim()) continue;
          let evt;
          try { evt = JSON.parse(raw); } catch { continue; }
          if (evt.type === 'session' && evt.id) this.sessionId = evt.id; // capture for --resume
          this._handleEvent(evt);
        }
      });
      child.stderr.setEncoding('utf8');
      child.stderr.on('data', (d) => { stderrTail = (stderrTail + d).slice(-2000); });
      child.on('error', rejectRun);
      child.on('exit', (code) => {
        if (code === 0) resolveRun();
        else rejectRun(new Error(`omp subprocess exit ${code}: ${stderrTail.slice(-400)}`));
      });
    });
  }

  // Switch the model at runtime (Step 5). Tries an in-place SDK switch, falls back to recreating.
  async switchModel(pattern) {
    const previous = this.modelPattern;
    this.modelPattern = pattern;
    log('info', 'brain_switch_model', { from: previous, to: pattern });

    // SDK fast path: resolve + setModel on the live session (keeps conversation history).
    if (this.mode === 'sdk') {
      try {
        const reg = this.session?.modelRegistry;
        const found = reg && typeof reg.find === 'function' ? reg.find(pattern) : undefined;
        if (found && typeof this.session.setModel === 'function') {
          const res = await this.session.setModel(found);
          log('info', 'brain_model_switched_inplace', { to: pattern, switched: res?.switched });
          return;
        }
      } catch (e) {
        log('warn', 'brain_setmodel_failed', { err: String(e).split('\n')[0], fallback: 'recreate' });
      }
      // recreate path (history not preserved across a model switch in v1)
      try { await this.session?.dispose?.(); } catch { /* ignore */ }
      this.session = null;
      await this._initSdk();
      log('info', 'brain_recreated', { model: pattern });
      return;
    }

    // subprocess mode: just record the pattern; the next per-turn invocation uses it.
    log('info', 'brain_switch_subprocess', { to: pattern, note: 'applies next turn' });
  }

  async dispose() {
    try { await this.session?.dispose?.(); } catch { /* ignore */ }
    this.session = null;
    this.sdk = null;
  }
}

// ─── orchestrator ───────────────────────────────────────────────────────────
export class VoiceOrchestrator {
  constructor() {
    this.brain = new OmpBrain({
      model: DEFAULT_MODEL,
      toolNames: DEFAULT_TOOL_NAMES,
      systemPrompt: SYSTEM_PROMPT,
      thinkingLevel: DEFAULT_THINKING,
    });
    this.stt = null;
    this.tts = null;
    this.running = false;
    this._speakLock = Promise.resolve();
    this.watchdog = new SpinWatchdog();
  }

  _newStt() {
    return new JsonBridge({
      name: 'stt',
      cmd: PYTHON,
      args: [STT_SCRIPT],
      cwd: VOICE_DIR,
      env: { YURI_VOICE_DIR: VOICE_DIR },
    });
  }
  _newTts() {
    return new JsonBridge({
      name: 'tts',
      cmd: PYTHON,
      args: [TTS_SCRIPT],
      cwd: VOICE_DIR,
      env: { YURI_VOICE_DIR: VOICE_DIR },
      // TTS warms the Kokoro model + PyAudio at startup before it can play; it signals
      // {"status":"ready"} once warm. We await this before entering the voice loop.
      ready: (m) => m && m.status === 'ready',
    });
  }

  // Restart a dead bridge with bounded exponential backoff.
  async _ensureBridge(side) {
    let b = side === 'stt' ? this.stt : this.tts;
    let attempt = 0;
    while (this.running) {
      if (b && b.alive) return b;
      b = side === 'stt' ? this._newStt() : this._newTts();
      try {
        await b.start();
        return b;
      } catch (e) {
        attempt++;
        const delay = Math.min(RESTART_MAX_MS, RESTART_MIN_MS * 2 ** Math.min(attempt, 6));
        log('error', 'bridge_start_failed', { bridge: side, attempt, err: String(e), retryMs: delay });
        await sleep(delay);
      }
    }
    if (side === 'stt') this.stt = b; else this.tts = b;
    return b;
  }

  // One STT turn. Restarts the bridge on death. Returns "" on timeout/failure.
  async listen() {
    while (this.running) {
      this.stt = await this._ensureBridge('stt');
      try {
        if (!this.stt.send({ cmd: 'listen' })) throw new Error('stt send failed');
        const msg = await this.stt.next((m) => typeof m.text === 'string', Number(process.env.YURI_LISTEN_TIMEOUT_MS || 60000));
        if (msg.status === 'timeout') { log('debug', 'stt_timeout'); return ''; }
        return msg.text || '';
      } catch (e) {
        log('error', 'stt_turn_failed', { err: String(e) });
        await this.stt.stop().catch(() => {});
        this.stt = null; // _ensureBridge will respawn
        await sleep(RESTART_MIN_MS);
      }
    }
    return '';
  }

  // Speak one sentence; serialized so sentences are never interleaved.
  speak(text) {
    const run = () => this._speakOne(text);
    this._speakLock = this._speakLock.then(run, run);
    return this._speakLock;
  }

  async _speakOne(text) {
    while (this.running) {
      this.tts = await this._ensureBridge('tts');
      // a freshly (re)spawned TTS bridge must finish warming before we send speak.
      await this.tts.awaitReady(Number(process.env.YURI_TTS_READY_TIMEOUT_MS || 30000));
      try {
        if (!this.tts.send({ cmd: 'speak', text })) throw new Error('tts send failed');
        const msg = await this.tts.next((m) => m.status === 'done', Number(process.env.YURI_SPEAK_TIMEOUT_MS || 120000));
        if (msg.status !== 'done') log('warn', 'tts_unexpected_status', { msg });
        return;
      } catch (e) {
        log('error', 'tts_turn_failed', { err: String(e) });
        await this.tts.stop().catch(() => {});
        this.tts = null;
        await sleep(RESTART_MIN_MS);
      }
    }
  }

  // One full brain turn: prompt -> stream text_delta -> speak sentences as they land.
  async respond(text) {
    const splitter = new SentenceSplitter();
    let spoken = 0;
    const onDelta = (delta) => {
      for (const sentence of splitter.push(delta)) {
        if (sentence) { spoken++; this.speak(sentence); }   // fire-and-forget; serialized via _speakLock
      }
    };
    try {
      // Timeout wrapper: if the brain hangs (tool call blocking, session stuck), abort after 60s
      const TURN_TIMEOUT = Number(process.env.YURI_TURN_TIMEOUT_MS || 60000);
      await Promise.race([
        this.brain.prompt(text, onDelta),
        new Promise((_, reject) => setTimeout(() => reject(new Error('brain_turn_timeout')), TURN_TIMEOUT)),
      ]);
    } catch (e) {
      log('error', 'brain_turn_failed', { err: String(e), recreating: true });
      // recreate the session (Step 4) and drop the partial sentence buffer
      splitter.reset();
      try { await this.brain.dispose(); } catch { /* ignore */ }
      try {
        this.brain.session = null;
        await this.brain.init();
      } catch (ee) { log('error', 'brain_recreate_failed', { err: String(ee) }); }
      return;
    }
    // flush any trailing partial sentence
    for (const sentence of splitter.flush()) {
      if (sentence) { spoken++; this.speak(sentence); }
    }
    // FULL-DUPLEX: don't wait for TTS to finish — XM5 sealed headphones prevent echo.
    // The mic (HyperX USB) can't hear the XM5 output. Start listening immediately.
    // this._speakLock still serializes TTS sentences internally, but we don't block on it.
    log('debug', 'brain_turn_done', { sentences: spoken });
  }

  // Own stdin command channel: switch_model | quit | status.
  _installStdinCommands() {
    let buf = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (d) => {
      buf += d;
      let nl;
      while ((nl = buf.indexOf('\n')) >= 0) {
        const raw = buf.slice(0, nl).replace(/\r$/, '').trim();
        buf = buf.slice(nl + 1);
        if (!raw) continue;
        let cmd;
        try { cmd = JSON.parse(raw); } catch { log('warn', 'stdin_bad_json', { raw }); continue; }
        this._handleCommand(cmd).catch((e) => log('error', 'stdin_cmd_failed', { err: String(e) }));
      }
    });
    process.stdin.on('end', () => { log('info', 'stdin_eof'); this.shutdown('stdin_eof'); });
  }

  async _handleCommand(cmd) {
    switch (cmd.cmd) {
      case 'switch_model':
        if (!cmd.model) { log('warn', 'switch_model_no_model'); return; }
        await this.brain.switchModel(cmd.model);
        log('info', 'model_switched', { model: cmd.model });
        break;
      case 'status':
        log('info', 'status', { model: this.brain.modelPattern, mode: this.brain.mode, stt: !!this.stt?.alive, tts: !!this.tts?.alive });
        break;
      case 'quit':
      case 'exit':
        this.shutdown('stdin_quit');
        break;
      default:
        log('warn', 'stdin_unknown_cmd', { cmd: cmd.cmd });
    }
  }

  async start() {
    this.running = true;
    log('info', 'orchestrator_start', {
      root: REPO_ROOT, voiceDir: VOICE_DIR, python: PYTHON,
      stt: STT_SCRIPT, tts: TTS_SCRIPT, model: DEFAULT_MODEL, tools: DEFAULT_TOOL_NAMES,
      pid: process.pid,
    });

    // native-spin watchdog — force-exits if the main event loop blocks (SDK native busy-poll)
    this.watchdog.start();

    // bridges come up eagerly so failures surface immediately; TTS must finish warming its
    // Kokoro model + opening PyAudio before we accept any speak command (it signals ready).
    try {
      this.tts = await this._ensureBridge('tts');
      await this.tts.awaitReady(Number(process.env.YURI_TTS_READY_TIMEOUT_MS || 30000));
      log('info', 'tts_ready', { bridge: 'tts' });
    } catch (e) { log('warn', 'tts_ready_wait_failed', { err: String(e) }); }
    try { this.stt = await this._ensureBridge('stt'); } catch { /* logged */ }

    // brain
    try {
      await this.brain.init();
    } catch (e) {
      log('error', 'brain_init_failed', { err: String(e) });
      // a failed brain is fatal — but the bridges are already up; let the loop try to recover.
    }

    this._installStdinCommands();
    this._installSignalHandlers();

    // Barge-in: watch /tmp/yuri-interrupt
    const fs2 = await import('node:fs');
    this._interruptInterval = setInterval(() => {
      try {
        fs2.accessSync('/tmp/yuri-interrupt');
        fs2.unlinkSync('/tmp/yuri-interrupt');
        log('info', 'barge_in');
        this._speakLock = Promise.resolve();
        if (this.tts && this.tts.alive) this.tts.send({ cmd: 'stop' }).catch(() => {});
        if (this.brain && this.brain._abort) this.brain._abort();
      } catch {}
    }, 200);

    // Greeting: speak a welcome message when everything is ready
    const YURI_GREETING = process.env.YURI_GREETING || "Yuri online. What do you need?";
    try {
      this.tts = await this._ensureBridge('tts');
      await this.tts.awaitReady(30000);
      this.speak(YURI_GREETING);
      await this._speakLock;
      log('info', 'greeting_spoken', { text: YURI_GREETING });
    } catch (e) {
      log('warn', 'greeting_failed', { err: String(e) });
    }

    // main loop
    while (this.running) {
      try {
        const text = await this.listen();
        if (!this.running) break;
        if (!text || !text.trim()) { continue; }
        log('info', 'stt_transcript', { text });
        await this.respond(text);
      } catch (e) {
        // listen/respond handle their own restarts; this is a last-resort guard.
        log('error', 'loop_iteration_failed', { err: String(e) });
        await sleep(RESTART_MIN_MS);
      }
    }
    if (this._interruptInterval) clearInterval(this._interruptInterval);
    await this._cleanup();
  }

  _installSignalHandlers() {
    const handler = (sig) => () => { log('info', 'signal', { sig }); this.shutdown(sig); };
    process.on('SIGINT', handler('SIGINT'));
    process.on('SIGTERM', handler('SIGTERM'));
    process.on('SIGHUP', handler('SIGHUP'));
  }

  shutdown(reason) {
    if (!this.running) return;
    this.running = false;
    this.watchdog.stop();
    log('info', 'orchestrator_shutdown', { reason });
  }

  async _cleanup() {
    this.watchdog.stop();
    log('info', 'cleanup_begin');
    // tell TTS to quit, then stop both bridges
    try { this.tts && this.tts.alive && this.tts.send({ cmd: 'quit' }); } catch { /* ignore */ }
    await this.tts?.stop().catch(() => {});
    await this.stt?.stop().catch(() => {});
    try { await this.brain?.dispose(); } catch { /* ignore */ }
    log('info', 'cleanup_done');
  }
}

// ─── entrypoint ─────────────────────────────────────────────────────────────
async function main() {
  const orchestrator = new VoiceOrchestrator();
  await orchestrator.start();
  process.exit(0);
}

// Run only when invoked directly (not when imported for testing).
const invokedDirectly = (() => {
  try { return process.argv[1] && process.argv[1].endsWith('orchestrator.mjs'); } catch { return false; }
})();
if (invokedDirectly) {
  main().catch((e) => {
    log('fatal', 'orchestrator_crash', { err: String(e && e.stack ? e.stack : e) });
    process.exit(1);
  });
}
