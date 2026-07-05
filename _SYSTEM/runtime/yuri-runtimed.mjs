#!/usr/bin/env node
// @capability: yuri-runtimed
// @serves: runtime supervisor | process manager | child health check | crash restart backoff | heartbeat | orchestration continuity | always-on nervous system
// @does: supervises YURI's long-lived child processes (voice brain, future watchers) declared in a config table — spawns, health-checks, restarts with exponential backoff (capped), writes a heartbeat + event log, and guarantees no orphaned subprocesses on stop/SIGTERM/SIGINT.
// @use: `node _SYSTEM/runtime/yuri-runtimed.mjs start` to launch detached; `stop` to tear down the whole tree; `status --json` to check liveness (cold = "not running", stale heartbeat >60s = degraded); DISARMED-first — no launchd plist is installed by this script (see header template below), start/stop are manual.
// @exports: superviseForeground, computeChildSpecs, planBackoff, readHeartbeat, RUNTIME_STATE_DIR,
//           isOwnedRuntimedProcess, probeAndAdoptChild
//
// ─────────────────────────────────────────────────────────────────────────────
// yuri-runtimed.mjs — the Yuri Runtime supervisor.
//
// One supervisor process that owns a declarative table of child processes
// (today: the voice brain at :8014; future: conductor sessions, overnight
// runner watchers — see 02_RESOURCES/RESEARCH/yuri-runtime-design-2026-07-04.md
// §1-2). Each child is spawned, health-checked on an interval (port probe if
// it declares one, else process-alive), restarted with exponential backoff on
// crash, and capped at 5 restarts / 10 minutes before being marked FAILED.
//
// DISARMED BY DESIGN: this file does NOT install, load, or bootstrap any
// launchd job. `start` spawns a plain detached child of itself (this same
// script, re-invoked with --foreground) — no macOS service manager involved.
// The launchd shape below is a TEMPLATE ONLY, for a future owner-gated arm
// step (per the Self-Governance Charter: BUILD-behind-DISARMED is
// self-governable, ARMING a launchd plist is always owner-gated). Do not
// wire this template into an actual `launchctl bootstrap` call without
// explicit owner approval.
//
// ── LAUNCHD TEMPLATE (comment-only — never auto-installed) ──────────────────
//
//   Label:            com.yuri.runtime
//   RunAtLoad:         true
//   KeepAlive:         false     (supervisor manages its OWN children's
//                                 restarts internally; KeepAlive=false means
//                                 launchd does not fight the supervisor's own
//                                 backoff/FAILED-cap logic by force-restarting
//                                 the whole process on top of it)
//   ThrottleInterval:  60
//   ProgramArguments:  [ <node>, <repo>/_SYSTEM/runtime/yuri-runtimed.mjs, "start", "--foreground" ]
//   WorkingDirectory:  <repo root>
//   StandardOutPath:   ~/Library/Logs/YURI-OS-MUSUBI/yuri-runtime.out.log
//   StandardErrorPath: ~/Library/Logs/YURI-OS-MUSUBI/yuri-runtime.err.log
//
//   <?xml version="1.0" encoding="UTF-8"?>
//   <!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
//   <plist version="1.0"><dict>
//     <key>Label</key><string>com.yuri.runtime</string>
//     <key>RunAtLoad</key><true/>
//     <key>KeepAlive</key><false/>
//     <key>ThrottleInterval</key><integer>60</integer>
//     <key>ProgramArguments</key><array>
//       <string>/usr/local/bin/node</string>
//       <string>/path/to/repo/_SYSTEM/runtime/yuri-runtimed.mjs</string>
//       <string>start</string><string>--foreground</string>
//     </array>
//     <key>WorkingDirectory</key><string>/path/to/repo</string>
//     <key>StandardOutPath</key><string>~/Library/Logs/YURI-OS-MUSUBI/yuri-runtime.out.log</string>
//     <key>StandardErrorPath</key><string>~/Library/Logs/YURI-OS-MUSUBI/yuri-runtime.err.log</string>
//   </dict></plist>
//
//   INSTALL IS OWNER-GATED — never auto-install. See `_SYSTEM/Scripts/yuri-session-launchd.mjs`
//   for the proven install/uninstall/status/restart CLI pattern this would follow when armed.
//
// ─────────────────────────────────────────────────────────────────────────────

import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import process from 'node:process';
import { spawn, spawnSync, execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import http from 'node:http';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '..', '..'); // runtime/ -> _SYSTEM/ -> repo root
const SYS = path.resolve(HERE, '..');

// Env-overridable so the hermetic test suite can point the entire supervisor
// at an isolated tmp dir (never touching real _SYSTEM/state/runtime/), same
// isolation pattern as kagami-swarm-supervisor.test.mjs.
export const RUNTIME_STATE_DIR = process.env.RUNTIMED_STATE_DIR
  ? path.resolve(process.env.RUNTIMED_STATE_DIR)
  : path.join(SYS, 'state', 'runtime');
const CONFIG_PATH = path.join(RUNTIME_STATE_DIR, 'runtime-config.json');
const HEARTBEAT_PATH = path.join(RUNTIME_STATE_DIR, 'heartbeat.json');
const EVENTS_PATH = path.join(RUNTIME_STATE_DIR, 'events.jsonl');
const PID_PATH = path.join(RUNTIME_STATE_DIR, 'runtimed.pid');

// ── tunables (env-overridable so tests run in milliseconds, not real time) ──
const HEALTH_INTERVAL_MS = Number(process.env.RUNTIMED_HEALTH_MS ?? 15_000);
const HEARTBEAT_INTERVAL_MS = Number(process.env.RUNTIMED_HEARTBEAT_MS ?? 15_000);
const STALE_HEARTBEAT_MS = Number(process.env.RUNTIMED_STALE_MS ?? 60_000);
const BACKOFF_SCHEDULE_MS = (process.env.RUNTIMED_BACKOFF_MS
  ? process.env.RUNTIMED_BACKOFF_MS.split(',').map((n) => Number(n.trim()))
  : [1_000, 5_000, 30_000]);
const RESTART_CAP_COUNT = Number(process.env.RUNTIMED_RESTART_CAP_COUNT ?? 5);
const RESTART_CAP_WINDOW_MS = Number(process.env.RUNTIMED_RESTART_CAP_WINDOW_MS ?? 10 * 60_000);
const LOG_ROTATE_BYTES = Number(process.env.RUNTIMED_LOG_ROTATE_BYTES ?? 5 * 1024 * 1024);
const STOP_KILL_TIMEOUT_MS = Number(process.env.RUNTIMED_STOP_KILL_TIMEOUT_MS ?? 8_000);
const STOP_POLL_MS = Number(process.env.RUNTIMED_STOP_POLL_MS ?? 200);

// ── default declarative child-spec table ────────────────────────────────────
// Each entry: { name, cmd, args, port?, healthPath?, enabledByDefault }.
// `runtime-config.json` (created on first run if missing) can toggle
// `enabled` per component without touching this file — the design doc's
// "components can be enabled per config" requirement.
const DEFAULT_CHILD_SPECS = [
  {
    name: 'voice-brain',
    cmd: 'python3',
    args: [path.join(SYS, 'Scripts', 'voice', 'yuri-z-brain.py')],
    port: 8014,
    healthPath: '/health',
    enabledByDefault: true,
  },
  {
    name: 'conductor',
    cmd: 'node',
    args: [path.join(SYS, 'Scripts', 'task-queue.mjs'), 'drain'],
    enabledByDefault: false,
  },
  {
    name: 'overnight-runner',
    cmd: 'node',
    args: [path.join(SYS, 'Scripts', 'task-queue.mjs'), 'run-next'],
    enabledByDefault: false,
  },
  {
    // The voice loop (Pipecat: mic -> Whisper STT -> GLM brain :8014 -> Kokoro TTS -> speaker).
    // No port/healthPath — it's an audio loop, not an HTTP server; health = process-alive,
    // supervisor restarts with backoff on crash. Enable via runtime-config.json (owner-gated:
    // always-on mic + first run triggers the macOS mic-permission prompt).
    name: 'voice-loop',
    cmd: 'python3',
    args: [path.join(SYS, 'Scripts', 'voice', 'bot.py')],
    env: { YURI_WAKE_ENABLE: '1' }, // hands-free "hey Yuri" wake gate (bot.py default is hot-mic)
    enabledByDefault: false,
  },
  {
    // A2 computer-use — the ScreenContextProvider. localhost :8015 HTTP (POST /context = read,
    // POST /act = execute). AX-primary + OmniParser-v2 fallback. DISARMED: enable via
    // runtime-config.json + grant Accessibility TCC to the node binary on first run.
    name: 'screen-context',
    cmd: 'node',
    args: [path.join(HERE, 'screen-context.mjs'), 'serve'],
    port: 8015,
    healthPath: '/health',
    env: { YURI_SCREEN_CONTEXT_ARMED: '1' }, // listen when spawned (the DISARMED gate is enabledByDefault:false)
    enabledByDefault: false,
  },
];

// ── fs helpers (atomic write: tmp + rename, matches task-queue.mjs) ─────────
function ensureStateDir() {
  fs.mkdirSync(RUNTIME_STATE_DIR, { recursive: true });
}

function atomicWriteJson(filePath, obj) {
  ensureStateDir();
  const tmp = `${filePath}.tmp.${process.pid}`;
  fs.writeFileSync(tmp, JSON.stringify(obj, null, 2));
  fs.renameSync(tmp, filePath);
}

function readJsonSafe(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

function appendEvent(event, data = {}) {
  ensureStateDir();
  const line = JSON.stringify({ t: new Date().toISOString(), comp: 'runtimed', event, data }) + '\n';
  try {
    fs.appendFileSync(EVENTS_PATH, line);
  } catch { /* best-effort — never let logging crash supervision */ }
}

// ── log rotation: size-capped at LOG_ROTATE_BYTES, keep one `.1` ───────────
function rotateLogIfNeeded(logPath) {
  let st;
  try {
    st = fs.statSync(logPath);
  } catch {
    return; // doesn't exist yet — nothing to rotate
  }
  if (st.size < LOG_ROTATE_BYTES) return;
  const rotated = `${logPath}.1`;
  try {
    if (fs.existsSync(rotated)) fs.rmSync(rotated);
    fs.renameSync(logPath, rotated);
  } catch { /* best-effort — a failed rotation should not crash the child */ }
}

function openLogStream(name) {
  ensureStateDir();
  const logPath = path.join(RUNTIME_STATE_DIR, `${name}.log`);
  rotateLogIfNeeded(logPath);
  return fs.createWriteStream(logPath, { flags: 'a' });
}

// ── config: merge runtime-config.json over DEFAULT_CHILD_SPECS ─────────────
export function computeChildSpecs({ configPath = CONFIG_PATH, defaults = DEFAULT_CHILD_SPECS } = {}) {
  let config = readJsonSafe(configPath);
  if (!config) {
    config = {
      children: Object.fromEntries(defaults.map((s) => [s.name, { enabled: s.enabledByDefault }])),
    };
    try {
      ensureStateDir();
      if (!fs.existsSync(configPath)) atomicWriteJson(configPath, config);
    } catch { /* best-effort — fall through using in-memory defaults */ }
  }
  const overrides = config.children || {};
  return defaults
    .map((spec) => {
      const override = overrides[spec.name] || {};
      const enabled = override.enabled ?? spec.enabledByDefault;
      return { ...spec, ...override, name: spec.name, enabled };
    })
    .filter((spec) => spec.enabled);
}

// ── port probe (health check) ───────────────────────────────────────────────
function probePort(port, timeoutMs = 2_000) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    let settled = false;
    const finish = (ok) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(ok);
    };
    socket.setTimeout(timeoutMs);
    socket.once('connect', () => finish(true));
    socket.once('timeout', () => finish(false));
    socket.once('error', () => finish(false));
    socket.connect(port, '127.0.0.1');
  });
}

// RT-04 FIX: HTTP health-endpoint probe used to decide ADOPT vs CONFLICT when a
// child's configured port is already occupied at supervisor start (typically an
// orphan left behind by a prior SIGKILL of this same supervisor — the child
// itself was never told to stop, so it kept running and holding the port).
// Resolves `{ healthy: boolean }` — never rejects, since a probe failure just
// means "not healthy" for adoption purposes, not a crash.
function probeHttpHealth(port, healthPath, timeoutMs = 2_000) {
  return new Promise((resolve) => {
    const req = http.request(
      { hostname: '127.0.0.1', port, path: healthPath, method: 'GET', timeout: timeoutMs },
      (res) => {
        // Any 2xx response is treated as healthy — we don't need to parse the
        // body shape here, just confirm a live, responsive process is behind it.
        res.resume(); // drain so the socket can close cleanly
        resolve({ healthy: res.statusCode >= 200 && res.statusCode < 300 });
      }
    );
    req.on('timeout', () => {
      req.destroy();
      resolve({ healthy: false });
    });
    req.on('error', () => resolve({ healthy: false }));
    req.end();
  });
}

// RT-04 FIX: orphan-port adoption/conflict check, run ONCE per port-declaring
// child spec at supervisor start (before spawnNow()). Bounded, no retry loop —
// exactly the two outcomes described in the fix: ADOPT a healthy orphan (skip
// spawning a duplicate) or report a CONFLICT once (never enter a tight
// restart-storm retrying the spawn against an already-bound port). A spec with
// no `port` configured is always "clear to spawn" (nothing to check).
export async function probeAndAdoptChild(spec, { probePortFn = probePort, probeHealthFn = probeHttpHealth } = {}) {
  if (!spec.port) return { action: 'spawn' };
  const occupied = await probePortFn(spec.port);
  if (!occupied) return { action: 'spawn' };
  if (!spec.healthPath) {
    // Port is occupied and we have no health endpoint to check it with — we
    // cannot safely distinguish "healthy orphan" from "stale/hung process",
    // so this is a conflict: report once, do not spawn a duplicate, do not
    // loop retrying the spawn.
    return { action: 'conflict', reason: `port ${spec.port} already occupied and no healthPath configured to verify orphan health` };
  }
  const { healthy } = await probeHealthFn(spec.port, spec.healthPath);
  if (healthy) {
    return { action: 'adopt', reason: `port ${spec.port} occupied by a healthy process (${spec.healthPath} responded 2xx) — adopting` };
  }
  return { action: 'conflict', reason: `port ${spec.port} occupied but ${spec.healthPath} did not respond healthy — stale/hung process, manual intervention may be needed` };
}

function isProcessAlive(pid) {
  if (!pid) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

// RT-03 FIX: pid-reuse ownership check. A bare `runtimed.pid` file only records
// a numeric pid — if the supervisor died and the OS later recycled that pid for
// an unrelated process (normal OS behavior once a pid is freed), naively
// signaling it would kill the WRONG process. Before signaling on `stop`, verify
// the live process's own command line actually looks like this supervisor's
// own invocation (`node .../yuri-runtimed.mjs ...`) — argv array, no shell.
// Returns true only when the pid is alive AND its command line matches.
export function isOwnedRuntimedProcess(pid, { marker = 'yuri-runtimed' } = {}) {
  if (!pid) return false;
  if (!isProcessAlive(pid)) return false;
  try {
    const out = execFileSync('ps', ['-p', String(pid), '-o', 'command='], {
      encoding: 'utf8',
      timeout: 5000,
    });
    return out.includes(marker);
  } catch {
    // `ps` failing (pid vanished between the alive-check and the ps call,
    // permission issue, etc.) means we cannot prove ownership — treat as
    // NOT owned so cmdStop never signals blind.
    return false;
  }
}

// ── backoff planning ────────────────────────────────────────────────────────
// Given a sliding-window array of restart timestamps (ms) and "now", compute
// whether another restart is allowed and how long to wait before it.
// Exported standalone (no side effects) so the test suite can verify the
// exact cap/backoff math without spinning up real processes.
export function planBackoff(restartTimestamps, now, {
  schedule = BACKOFF_SCHEDULE_MS,
  capCount = RESTART_CAP_COUNT,
  capWindowMs = RESTART_CAP_WINDOW_MS,
} = {}) {
  const withinWindow = restartTimestamps.filter((ts) => now - ts < capWindowMs);
  if (withinWindow.length >= capCount) {
    return { allowed: false, delayMs: null, restartsInWindow: withinWindow.length };
  }
  const attemptIdx = withinWindow.length; // 0-indexed count of restarts already used in this window
  const delayMs = schedule[Math.min(attemptIdx, schedule.length - 1)];
  return { allowed: true, delayMs, restartsInWindow: withinWindow.length };
}

// ── per-child supervised state ──────────────────────────────────────────────
class SupervisedChild {
  constructor(spec) {
    this.spec = spec;
    this.child = null;
    this.pid = null;
    this.status = 'starting'; // starting|healthy|unhealthy|restarting|failed|stopped|adopted|conflicted
    this.restartTimestamps = [];
    this.lastHealthy = null;
    this.stopRequested = false;
    this.restartTimer = null;
    this.logStream = null;
    this.adopted = false; // RT-04: true when this child is a pre-existing healthy orphan we registered instead of spawning a duplicate
  }

  // RT-04 FIX: mark this child as an already-running orphan we are adopting —
  // no `spawnNow()` call, no pid we own (so we never signal it on stop/kill;
  // it was never ours to begin with). Health checks continue polling the port
  // as usual, which is exactly what keeps the heartbeat honest for an adopted
  // child without any extra bookkeeping path.
  markAdopted(reason) {
    this.adopted = true;
    this.status = 'healthy';
    this.lastHealthy = new Date().toISOString();
    appendEvent('CHILD_ADOPTED', { name: this.spec.name, port: this.spec.port, reason });
  }

  // RT-04 FIX: mark this child as a start-time port conflict — reported ONCE,
  // no spawn attempted, no restart-loop scheduled. Sits in a terminal-like
  // 'conflicted' status until an operator intervenes and restarts the
  // supervisor (matches the existing 'failed' terminal-state pattern already
  // used for exhausted crash-restart budgets).
  markConflicted(reason) {
    this.status = 'conflicted';
    appendEvent('CHILD_PORT_CONFLICT', { name: this.spec.name, port: this.spec.port, reason });
  }

  spawnNow() {
    if (this.stopRequested) return;
    rotateLogIfNeeded(path.join(RUNTIME_STATE_DIR, `${this.spec.name}.log`));
    this.logStream = openLogStream(this.spec.name);
    const child = spawn(this.spec.cmd, this.spec.args || [], {
      cwd: REPO_ROOT,
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: false,
      env: { ...process.env, ...(this.spec.env || {}) },
    });
    this.child = child;
    this.pid = child.pid;
    this.status = 'starting';
    appendEvent('CHILD_SPAWNED', { name: this.spec.name, pid: child.pid, cmd: this.spec.cmd, args: this.spec.args });

    child.stdout?.on('data', (buf) => this.logStream?.write(buf));
    child.stderr?.on('data', (buf) => this.logStream?.write(buf));

    child.on('exit', (code, signal) => {
      appendEvent('CHILD_EXITED', { name: this.spec.name, pid: this.pid, code, signal });
      this.logStream?.end();
      this.child = null;
      this.pid = null;
      if (this.stopRequested) {
        this.status = 'stopped';
        return;
      }
      this.status = 'restarting';
      this.scheduleRestart();
    });

    child.on('error', (err) => {
      appendEvent('CHILD_SPAWN_ERROR', { name: this.spec.name, error: String(err?.message || err) });
    });
  }

  scheduleRestart() {
    const now = Date.now();
    const plan = planBackoff(this.restartTimestamps, now);
    if (!plan.allowed) {
      this.status = 'failed';
      appendEvent('CHILD_FAILED', {
        name: this.spec.name,
        restartsInWindow: plan.restartsInWindow,
        windowMs: RESTART_CAP_WINDOW_MS,
      });
      return;
    }
    this.restartTimestamps.push(now);
    appendEvent('CHILD_RESTART_SCHEDULED', { name: this.spec.name, delayMs: plan.delayMs, attempt: plan.restartsInWindow + 1 });
    this.restartTimer = setTimeout(() => {
      this.restartTimer = null;
      if (!this.stopRequested) this.spawnNow();
    }, plan.delayMs);
    if (typeof this.restartTimer.unref === 'function') this.restartTimer.unref();
  }

  async healthCheck() {
    if (this.status === 'failed' || this.status === 'stopped' || this.status === 'conflicted') return;
    // RT-04: an adopted child has no pid we own (we never spawned it), but it
    // DOES have a port — keep polling that port so an adopted child going
    // unhealthy is still detected like any other child, instead of the
    // heartbeat silently freezing at 'healthy' forever.
    if (!this.pid && !this.adopted) return; // between restart attempts — nothing to probe yet
    let healthy;
    if (this.spec.port) {
      healthy = await probePort(this.spec.port);
    } else {
      healthy = isProcessAlive(this.pid);
    }
    if (healthy) {
      this.status = 'healthy';
      this.lastHealthy = new Date().toISOString();
    } else if (this.status !== 'restarting') {
      this.status = 'unhealthy';
    }
  }

  requestStop() {
    this.stopRequested = true;
    if (this.restartTimer) {
      clearTimeout(this.restartTimer);
      this.restartTimer = null;
    }
  }

  toHeartbeatEntry() {
    return {
      pid: this.pid,
      status: this.status,
      restarts: this.restartTimestamps.length,
      lastHealthy: this.lastHealthy,
      adopted: this.adopted,
    };
  }
}

// ── heartbeat ────────────────────────────────────────────────────────────────
function writeHeartbeat(children) {
  const entry = {};
  for (const c of children) entry[c.spec.name] = c.toHeartbeatEntry();
  atomicWriteJson(HEARTBEAT_PATH, { t: new Date().toISOString(), children: entry });
}

export function readHeartbeat({ heartbeatPath = HEARTBEAT_PATH, staleMs = STALE_HEARTBEAT_MS } = {}) {
  const hb = readJsonSafe(heartbeatPath);
  if (!hb || !hb.t) return { present: false, fresh: false, ageMs: null, heartbeat: null };
  const ageMs = Date.now() - new Date(hb.t).getTime();
  return { present: true, fresh: ageMs <= staleMs, ageMs, heartbeat: hb };
}

// ── kill-the-tree helper (used by both in-process SIGTERM handling and the
// separate `stop` CLI invocation which only has PIDs to go on) ─────────────
function killPidTree(pid, signal = 'SIGTERM') {
  if (!pid) return;
  try {
    process.kill(pid, signal);
  } catch { /* already dead */ }
}

// ── foreground supervision loop ─────────────────────────────────────────────
// `specs` is an optional override (bypasses computeChildSpecs()/config-file
// resolution entirely) so the hermetic test suite can inject a fake child
// spec table without touching runtime-config.json or the real default specs.
// `installSignalHandlers`/`exitOnStop` default true for real CLI usage; the
// test suite sets both false so `shutdown()` can be called directly and
// verified without killing the test-runner process itself.
export async function superviseForeground({
  dryRun = false,
  specs: specsOverride = null,
  installSignalHandlers = true,
  exitOnStop = true,
} = {}) {
  const specs = specsOverride ?? computeChildSpecs();

  if (dryRun) {
    const plan = {
      childCount: specs.length,
      children: specs.map((s) => ({ name: s.name, cmd: s.cmd, args: s.args, port: s.port ?? null, healthPath: s.healthPath ?? null })),
      healthIntervalMs: HEALTH_INTERVAL_MS,
      heartbeatIntervalMs: HEARTBEAT_INTERVAL_MS,
      backoffScheduleMs: BACKOFF_SCHEDULE_MS,
      restartCap: { count: RESTART_CAP_COUNT, windowMs: RESTART_CAP_WINDOW_MS },
      stateDir: RUNTIME_STATE_DIR,
    };
    console.log(JSON.stringify(plan, null, 2));
    return plan;
  }

  ensureStateDir();
  const children = specs.map((spec) => new SupervisedChild(spec));
  // RT-04 FIX: before spawning, probe each port-declaring child for an
  // already-listening orphan (typically left behind by a prior SIGKILL of this
  // same supervisor, which never gets a chance to tell its children to stop).
  // ADOPT a healthy orphan (skip spawnNow() — no duplicate process, no port
  // clash) or report a CONFLICT once (skip spawnNow() — no tight restart-storm
  // retrying a spawn against a port that's never going to free up on its own).
  // Children with no configured port, or whose port is free, spawn normally.
  for (const c of children) {
    const decision = await probeAndAdoptChild(c.spec);
    if (decision.action === 'adopt') {
      c.markAdopted(decision.reason);
      appendEvent('CHILD_ADOPT_DECISION', { name: c.spec.name, action: 'adopt', reason: decision.reason });
    } else if (decision.action === 'conflict') {
      c.markConflicted(decision.reason);
      appendEvent('CHILD_ADOPT_DECISION', { name: c.spec.name, action: 'conflict', reason: decision.reason });
    } else {
      c.spawnNow();
    }
  }

  appendEvent('SUPERVISOR_STARTED', { childCount: children.length, pid: process.pid });
  atomicWriteJson(PID_PATH, { pid: process.pid, startedAt: new Date().toISOString() });

  let shuttingDown = false;
  // NOTE: these two timers are deliberately NOT unref()'d — they are the
  // supervisor's actual keep-alive mechanism. A real `start --foreground`
  // process must run forever until explicitly stopped (SIGTERM/SIGINT or
  // the `stop` CLI); with zero enabled children there are no child stdio
  // handles to incidentally keep the event loop alive, so an unref()'d timer
  // here would let the whole process exit immediately after setup — a real
  // bug caught by an end-to-end (non-hermetic) start/stop smoke test, not by
  // the fake-child unit tests, since those always spawn at least one child
  // whose own process handle masked the problem. Every test path explicitly
  // clearInterval()s both timers via shutdown(), so refed timers are safe
  // for node:test too — no risk of hanging the test runner.
  const healthTimer = setInterval(() => {
    for (const c of children) c.healthCheck();
  }, HEALTH_INTERVAL_MS);

  const heartbeatTimer = setInterval(() => writeHeartbeat(children), HEARTBEAT_INTERVAL_MS);
  writeHeartbeat(children); // immediate first write so status is never cold-for-15s

  async function shutdown(signal) {
    if (shuttingDown) return;
    shuttingDown = true;
    clearInterval(healthTimer);
    clearInterval(heartbeatTimer);
    appendEvent('SUPERVISOR_STOPPING', { signal });
    for (const c of children) {
      c.requestStop();
      killPidTree(c.pid, 'SIGTERM');
    }
    // Bounded wait for graceful exit before declaring done; individual
    // child 'exit' handlers already flip status/logStream regardless.
    const deadline = Date.now() + STOP_KILL_TIMEOUT_MS;
    while (Date.now() < deadline && children.some((c) => c.pid && isProcessAlive(c.pid))) {
      await new Promise((r) => setTimeout(r, STOP_POLL_MS));
    }
    for (const c of children) {
      if (c.pid && isProcessAlive(c.pid)) killPidTree(c.pid, 'SIGKILL');
    }
    writeHeartbeat(children);
    appendEvent('SUPERVISOR_STOPPED', { signal });
    try { if (fs.existsSync(PID_PATH)) fs.rmSync(PID_PATH); } catch { /* best-effort */ }
    if (exitOnStop) process.exit(0);
  }

  if (installSignalHandlers) {
    process.on('SIGTERM', () => { shutdown('SIGTERM'); });
    process.on('SIGINT', () => { shutdown('SIGINT'); });
  }

  return { children, shutdown, healthTimer, heartbeatTimer };
}

// ── CLI: start ───────────────────────────────────────────────────────────────
function cmdStart(argv) {
  const dryRun = argv.includes('--dry-run');
  const foreground = argv.includes('--foreground');

  if (dryRun) {
    superviseForeground({ dryRun: true });
    return;
  }

  if (foreground) {
    superviseForeground({ dryRun: false });
    return; // keeps running — signal handlers own the exit path
  }

  // Plain `start`: spawn a detached child of THIS SAME SCRIPT with
  // --foreground, write its pid, and return immediately. This is the
  // "manually started" detach path per the DISARMED-first constraint — no
  // launchd involved. See header template for the future owner-gated arm.
  ensureStateDir();
  const existing = readJsonSafe(PID_PATH);
  if (existing?.pid && isProcessAlive(existing.pid)) {
    console.log(`already running: pid=${existing.pid} (started ${existing.startedAt})`);
    return;
  }
  const child = spawn(process.execPath, [path.join(HERE, 'yuri-runtimed.mjs'), 'start', '--foreground'], {
    cwd: REPO_ROOT,
    detached: true,
    stdio: 'ignore',
    env: process.env,
  });
  child.unref();
  atomicWriteJson(PID_PATH, { pid: child.pid, startedAt: new Date().toISOString() });
  console.log(`started detached: pid=${child.pid}`);
}

// ── CLI: stop ────────────────────────────────────────────────────────────────
async function cmdStop() {
  const existing = readJsonSafe(PID_PATH);
  if (!existing?.pid) {
    console.log('not running (no pid file)');
    return;
  }
  if (!isProcessAlive(existing.pid)) {
    console.log(`not running (stale pid ${existing.pid}) — cleaning up`);
    // A dead pid means the last-written heartbeat no longer reflects live
    // truth either (the process that would keep refreshing it is gone) —
    // clear both so a subsequent `status` reports a clean cold state
    // instead of a confusing "heartbeat fresh but pid dead" hybrid.
    try { fs.rmSync(PID_PATH); } catch { /* best-effort */ }
    try { if (fs.existsSync(HEARTBEAT_PATH)) fs.rmSync(HEARTBEAT_PATH); } catch { /* best-effort */ }
    return;
  }
  // RT-03 FIX: the pid is alive, but pids get recycled by the OS once freed —
  // a stale pid file pointing at an unrelated process that happens to now hold
  // that number would otherwise get SIGTERM'd/SIGKILL'd for no reason. Verify
  // the live process's own command line actually looks like this supervisor
  // before sending any signal.
  if (!isOwnedRuntimedProcess(existing.pid)) {
    console.log(
      `pid ${existing.pid} is alive but its command line does not match yuri-runtimed — ` +
      `NOT signaling (likely pid reuse by an unrelated process). Cleaning up the stale pid file.`
    );
    try { fs.rmSync(PID_PATH); } catch { /* best-effort */ }
    try { if (fs.existsSync(HEARTBEAT_PATH)) fs.rmSync(HEARTBEAT_PATH); } catch { /* best-effort */ }
    return;
  }
  console.log(`stopping supervisor pid=${existing.pid} ...`);
  killPidTree(existing.pid, 'SIGTERM');
  const deadline = Date.now() + STOP_KILL_TIMEOUT_MS;
  while (Date.now() < deadline && isProcessAlive(existing.pid)) {
    await new Promise((r) => setTimeout(r, STOP_POLL_MS));
  }
  if (isProcessAlive(existing.pid)) {
    console.log(`pid ${existing.pid} did not exit gracefully — SIGKILL`);
    killPidTree(existing.pid, 'SIGKILL');
  }
  try { if (fs.existsSync(PID_PATH)) fs.rmSync(PID_PATH); } catch { /* best-effort */ }
  console.log('stopped.');
}

// ── CLI: status ──────────────────────────────────────────────────────────────
function cmdStatus(argv) {
  const jsonMode = argv.includes('--json');
  const { present, fresh, ageMs, heartbeat } = readHeartbeat();
  const pidInfo = readJsonSafe(PID_PATH);
  const supervisorAlive = !!(pidInfo?.pid && isProcessAlive(pidInfo.pid));

  let state;
  if (!present) state = 'not running';
  else if (!fresh) state = 'not running (stale heartbeat)';
  else state = supervisorAlive ? 'running' : 'not running (heartbeat fresh but pid dead)';

  const report = {
    state,
    supervisorPid: pidInfo?.pid ?? null,
    supervisorAlive,
    heartbeatPresent: present,
    heartbeatFresh: fresh,
    heartbeatAgeMs: ageMs,
    children: heartbeat?.children ?? {},
  };

  if (jsonMode) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log(`state: ${report.state}`);
    console.log(`supervisor pid: ${report.supervisorPid ?? '(none)'} alive=${report.supervisorAlive}`);
    console.log(`heartbeat: present=${report.heartbeatPresent} fresh=${report.heartbeatFresh} ageMs=${report.heartbeatAgeMs ?? '(n/a)'}`);
    const names = Object.keys(report.children);
    if (names.length === 0) {
      console.log('children: (none)');
    } else {
      console.log('children:');
      for (const name of names) {
        const c = report.children[name];
        console.log(`  ${name}: pid=${c.pid ?? '(none)'} status=${c.status} restarts=${c.restarts} lastHealthy=${c.lastHealthy ?? '(never)'}`);
      }
    }
  }
  process.exitCode = report.state === 'running' ? 0 : 1;
}

// ── CLI entry ────────────────────────────────────────────────────────────────
function help() {
  console.log([
    'Usage:',
    '  node _SYSTEM/runtime/yuri-runtimed.mjs start [--dry-run] [--foreground]',
    '  node _SYSTEM/runtime/yuri-runtimed.mjs stop',
    '  node _SYSTEM/runtime/yuri-runtimed.mjs status [--json]',
    '',
    'DISARMED-first: no launchd plist is installed by this script. See the',
    'header comment block for the future owner-gated launchd template.',
  ].join('\n'));
}

async function main() {
  const argv = process.argv.slice(2);
  const mode = argv[0] ?? 'help';
  switch (mode) {
    case 'start':
      cmdStart(argv.slice(1));
      break;
    case 'stop':
      await cmdStop();
      break;
    case 'status':
      cmdStatus(argv.slice(1));
      break;
    default:
      help();
      process.exitCode = mode === 'help' ? 0 : 1;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  main().catch((e) => {
    console.error(`yuri-runtimed: fatal error: ${String(e?.stack || e)}`);
    process.exitCode = 1;
  });
}
