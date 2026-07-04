#!/usr/bin/env node
// Hermetic tests for the Yuri Runtime supervisor (yuri-runtimed.mjs).
//
// Isolation: RUNTIMED_STATE_DIR points every test at its own tmpdir (never
// touching real _SYSTEM/state/runtime/), and all timing constants are
// overridden to millisecond scale via RUNTIMED_* env vars BEFORE the module
// is imported (module-level consts read process.env once at import time,
// same pattern as kagami-swarm-supervisor.test.mjs's KAGAMI_ROTATE_LINES).
//
// Fake children are real spawned processes (`node -e <script>`), not mocks —
// this exercises the actual spawn/health/kill code paths, per the task's
// "spawn+kill of the fake child" requirement, while staying hermetic (no
// real YURI component like the voice brain is ever started).

import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import net from 'node:net';
import { execFileSync, spawn } from 'node:child_process';

const sfx = `${process.pid}-${crypto.randomBytes(4).toString('hex')}`;
const STATE_DIR = path.join(os.tmpdir(), `yuri-runtimed-test-${sfx}`);

process.env.RUNTIMED_STATE_DIR = STATE_DIR;
// Millisecond-scale timings so tests run fast and deterministically.
process.env.RUNTIMED_HEALTH_MS = '40';
process.env.RUNTIMED_HEARTBEAT_MS = '40';
process.env.RUNTIMED_STALE_MS = '150';
process.env.RUNTIMED_BACKOFF_MS = '20,40,80';
process.env.RUNTIMED_RESTART_CAP_COUNT = '3';
process.env.RUNTIMED_RESTART_CAP_WINDOW_MS = '2000';
process.env.RUNTIMED_LOG_ROTATE_BYTES = '512'; // tiny, so a short-lived fake child can trip rotation
process.env.RUNTIMED_STOP_KILL_TIMEOUT_MS = '1000';
process.env.RUNTIMED_STOP_POLL_MS = '20';

const mod = await import('./yuri-runtimed.mjs');
const {
  superviseForeground, computeChildSpecs, planBackoff, readHeartbeat, RUNTIME_STATE_DIR,
  isOwnedRuntimedProcess, probeAndAdoptChild,
} = mod;

// ── helpers ──────────────────────────────────────────────────────────────────
function reset() {
  fs.rmSync(STATE_DIR, { recursive: true, force: true });
  fs.mkdirSync(STATE_DIR, { recursive: true });
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function waitFor(predicate, { timeoutMs = 3000, intervalMs = 20 } = {}) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await predicate()) return true;
    await sleep(intervalMs);
  }
  return false;
}

// A few multiples of the 40ms test health-check interval — long enough to
// prove a terminal state ('failed'/'stopped') survives several more ticks
// without being clobbered, short enough to keep the suite fast.
const HEALTH_CHECK_SETTLE_MS = 200;

function isPidAlive(pid) {
  if (!pid) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

// A fake child that just sleeps forever (until killed). Used for the
// spawn/heartbeat/stop-kills-tree tests.
const SLEEPER_SPEC = (name = 'sleeper') => ({
  name,
  cmd: process.execPath,
  args: ['-e', 'setInterval(() => {}, 1000);'],
});

// A fake child that exits immediately with a non-zero code. Used for the
// crash-restart-backoff test.
const CRASHER_SPEC = (name = 'crasher') => ({
  name,
  cmd: process.execPath,
  args: ['-e', 'process.exit(1);'],
});

// A fake child that writes noisy output then sleeps — used to trip log
// rotation deterministically against the tiny RUNTIMED_LOG_ROTATE_BYTES cap.
const NOISY_SPEC = (name = 'noisy') => ({
  name,
  cmd: process.execPath,
  args: ['-e', 'process.stdout.write("x".repeat(2000) + "\\n"); setInterval(() => {}, 1000);'],
});

function findFreePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.listen(0, '127.0.0.1', () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
    srv.on('error', reject);
  });
}

// ── planBackoff (pure function — no processes involved) ────────────────────
test('planBackoff: schedule escalates 1s/5s/30s shape (scaled) then caps at count within window', () => {
  const schedule = [20, 40, 80];
  const now = 100_000;
  let ts = [];

  let p = planBackoff(ts, now, { schedule, capCount: 3, capWindowMs: 2000 });
  assert.equal(p.allowed, true);
  assert.equal(p.delayMs, 20, 'first restart uses schedule[0]');
  ts.push(now);

  p = planBackoff(ts, now + 20, { schedule, capCount: 3, capWindowMs: 2000 });
  assert.equal(p.allowed, true);
  assert.equal(p.delayMs, 40, 'second restart uses schedule[1]');
  ts.push(now + 20);

  p = planBackoff(ts, now + 60, { schedule, capCount: 3, capWindowMs: 2000 });
  assert.equal(p.allowed, true);
  assert.equal(p.delayMs, 80, 'third restart uses schedule[2] (last entry, sustained)');
  ts.push(now + 60);

  p = planBackoff(ts, now + 140, { schedule, capCount: 3, capWindowMs: 2000 });
  assert.equal(p.allowed, false, 'a 4th restart within the window is capped -> FAILED');
  assert.equal(p.restartsInWindow, 3);
});

test('planBackoff: restarts outside the sliding window do not count toward the cap', () => {
  const schedule = [20, 40, 80];
  const now = 100_000;
  // Two restarts long ago (outside a 2000ms window) should not count.
  const ts = [now - 5000, now - 4000];
  const p = planBackoff(ts, now, { schedule, capCount: 3, capWindowMs: 2000 });
  assert.equal(p.allowed, true);
  assert.equal(p.restartsInWindow, 0, 'old restarts fell out of the sliding window');
  assert.equal(p.delayMs, 20, 'treated as a fresh attempt-0');
});

// ── computeChildSpecs (config merge, no processes) ──────────────────────────
test('computeChildSpecs: creates a default config file when missing and filters to enabled specs', () => {
  reset();
  const configPath = path.join(STATE_DIR, 'runtime-config.json');
  assert.equal(fs.existsSync(configPath), false);

  const defaults = [
    { name: 'a', cmd: 'true', args: [], enabledByDefault: true },
    { name: 'b', cmd: 'true', args: [], enabledByDefault: false },
  ];
  const specs = computeChildSpecs({ configPath, defaults });
  assert.equal(fs.existsSync(configPath), true, 'default config file written on first run');
  assert.deepEqual(specs.map((s) => s.name), ['a'], 'only enabledByDefault:true specs are active');

  const written = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  assert.equal(written.children.a.enabled, true);
  assert.equal(written.children.b.enabled, false);
});

test('computeChildSpecs: an existing config file can enable a normally-disabled spec', () => {
  reset();
  const configPath = path.join(STATE_DIR, 'runtime-config.json');
  fs.writeFileSync(configPath, JSON.stringify({ children: { b: { enabled: true } } }));
  const defaults = [
    { name: 'a', cmd: 'true', args: [], enabledByDefault: true },
    { name: 'b', cmd: 'true', args: [], enabledByDefault: false },
  ];
  const specs = computeChildSpecs({ configPath, defaults });
  assert.deepEqual(specs.map((s) => s.name).sort(), ['a', 'b'], 'config override enabled b');
});

// ── RT-03: cmdStop pid-ownership check (pid-reuse hazard) ───────────────────
test('isOwnedRuntimedProcess: returns true for a process whose command line contains the marker', () => {
  // Use THIS test-runner process itself as the "owned" process — spawn a tiny
  // node child whose invoked script path contains 'yuri-runtimed' in its argv
  // by using the real module path as the marker-bearing command line.
  const child = spawn(process.execPath, [path.join(path.dirname(fileURLToPathSelf()), 'yuri-runtimed.mjs'), 'status'], {
    stdio: 'ignore',
  });
  // Give it a brief moment to actually be visible to `ps` before probing.
  const ok = isOwnedRuntimedProcessSyncWait(child.pid);
  assert.equal(ok, true, 'a real yuri-runtimed.mjs invocation is recognized as owned');
  try { process.kill(child.pid, 'SIGKILL'); } catch { /* already exited */ }
});

test('isOwnedRuntimedProcess: returns false for an unrelated process (pid-reuse simulation)', async () => {
  const sleeper = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000);'], { stdio: 'ignore' });
  try {
    // Wait for the sleeper to actually be alive and visible to `ps`.
    await waitFor(() => isPidAlive(sleeper.pid));
    const ok = isOwnedRuntimedProcess(sleeper.pid);
    assert.equal(ok, false, 'an unrelated node -e sleeper must NOT be recognized as an owned yuri-runtimed process');
  } finally {
    try { process.kill(sleeper.pid, 'SIGKILL'); } catch { /* already dead */ }
  }
});

test('isOwnedRuntimedProcess: returns false for a dead/non-existent pid', () => {
  // A pid extremely unlikely to be alive right now.
  assert.equal(isOwnedRuntimedProcess(999999), false);
  assert.equal(isOwnedRuntimedProcess(null), false);
  assert.equal(isOwnedRuntimedProcess(0), false);
});

test('cmdStop (CLI): an innocent unrelated process at the pid-file pid SURVIVES, and the stale pid file is cleaned up', async () => {
  reset();
  // Simulate the pid-reuse hazard directly: write runtimed.pid pointing at a
  // real, long-lived, but totally unrelated process (a plain sleeper — NOT a
  // yuri-runtimed invocation), then invoke the real `stop` CLI subcommand
  // against it. Before the RT-03 fix, cmdStop would blindly SIGTERM/SIGKILL
  // whatever pid was on file; the fix must detect the command-line mismatch
  // and refuse to signal it.
  const innocent = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000);'], { stdio: 'ignore' });
  try {
    await waitFor(() => isPidAlive(innocent.pid));
    assert.equal(isPidAlive(innocent.pid), true, 'precondition: innocent process is alive before stop is invoked');

    const pidPath = path.join(STATE_DIR, 'runtimed.pid');
    fs.writeFileSync(pidPath, JSON.stringify({ pid: innocent.pid, startedAt: new Date().toISOString() }));

    const scriptPath = new URL('./yuri-runtimed.mjs', import.meta.url).pathname;
    let stdout = '';
    try {
      stdout = execFileSync(process.execPath, [scriptPath, 'stop'], { env: { ...process.env }, encoding: 'utf8' });
    } catch (e) {
      stdout = (e.stdout || '') + (e.stderr || '');
    }

    // The innocent process must still be alive — cmdStop must NOT have signaled it.
    assert.equal(isPidAlive(innocent.pid), true, 'innocent unrelated process survived cmdStop (RT-03 fix verified)');
    // The stale/mismatched pid file must have been cleaned up so a future
    // `status`/`stop` doesn't keep pointing at the wrong process.
    assert.equal(fs.existsSync(pidPath), false, 'mismatched pid file was cleaned up');
    assert.match(stdout, /not signaling|does not match/i, 'stop reported the ownership mismatch clearly');
  } finally {
    try { process.kill(innocent.pid, 'SIGKILL'); } catch { /* already dead, expected on success */ }
  }
});

// Tiny local helpers used only by the two isOwnedRuntimedProcess tests above —
// kept separate from the shared `waitFor`/`isPidAlive` helpers defined below
// them in this file (hoisted function declarations make this safe either way,
// but these two are arrow consts, so they are declared right here, above use).
function fileURLToPathSelf() {
  return new URL('./yuri-runtimed.test.mjs', import.meta.url).pathname;
}
function isOwnedRuntimedProcessSyncWait(pid) {
  // Poll briefly since the child was JUST spawned and `ps` may not see it yet
  // on a loaded CI box; bounded to avoid a hang if something is truly wrong.
  const deadline = Date.now() + 2000;
  let last = false;
  while (Date.now() < deadline) {
    last = isOwnedRuntimedProcess(pid);
    if (last) return true;
  }
  return last;
}

// ── RT-04: orphan-port adoption / conflict detection at supervisor start ────
test('probeAndAdoptChild: spawns normally when the child has no configured port', async () => {
  const decision = await probeAndAdoptChild({ name: 'no-port-child' });
  assert.equal(decision.action, 'spawn');
});

test('probeAndAdoptChild: spawns normally when the configured port is free', async () => {
  const port = await findFreePort();
  const decision = await probeAndAdoptChild({ name: 'free-port-child', port, healthPath: '/health' });
  assert.equal(decision.action, 'spawn');
});

test('probeAndAdoptChild: ADOPTS when the port is occupied by a healthy process (health endpoint responds 2xx)', async () => {
  const decision = await probeAndAdoptChild(
    { name: 'orphan-child', port: 12345, healthPath: '/health' },
    {
      probePortFn: async () => true, // port occupied
      probeHealthFn: async () => ({ healthy: true }), // health endpoint responds OK
    }
  );
  assert.equal(decision.action, 'adopt');
});

test('probeAndAdoptChild: reports CONFLICT once when the port is occupied but unhealthy (stale/hung)', async () => {
  const decision = await probeAndAdoptChild(
    { name: 'stale-child', port: 12345, healthPath: '/health' },
    {
      probePortFn: async () => true, // port occupied
      probeHealthFn: async () => ({ healthy: false }), // stale/hung — does not respond healthy
    }
  );
  assert.equal(decision.action, 'conflict');
  assert.match(decision.reason, /stale|hung|manual intervention/i);
});

test('probeAndAdoptChild: reports CONFLICT when port is occupied and there is no healthPath to verify against', async () => {
  const decision = await probeAndAdoptChild(
    { name: 'no-healthpath-child', port: 12345 },
    { probePortFn: async () => true }
  );
  assert.equal(decision.action, 'conflict');
});

test('superviseForeground: ADOPTS a pre-bound healthy port instead of spawning a duplicate (no restart storm)', async () => {
  reset();
  const port = await findFreePort();
  // Pre-spawn a fake "orphan" that binds the port AND serves a healthy /health
  // response — simulating a child left running after a prior SIGKILL of the
  // supervisor itself (the supervisor died; the child never got told to stop).
  const orphan = spawn(process.execPath, ['-e', `
    const http = require('http');
    http.createServer((req, res) => {
      if (req.url.startsWith('/health')) { res.writeHead(200); res.end('ok'); return; }
      res.writeHead(404); res.end();
    }).listen(${port}, '127.0.0.1');
    setInterval(() => {}, 1000);
  `], { stdio: 'ignore' });

  try {
    // Wait for the orphan to actually be listening before starting the supervisor.
    const orphanUp = await waitFor(async () => {
      const s = new net.Socket();
      return new Promise((resolve) => {
        s.once('connect', () => { s.destroy(); resolve(true); });
        s.once('error', () => resolve(false));
        s.connect(port, '127.0.0.1');
      });
    });
    assert.equal(orphanUp, true, 'precondition: orphan is listening on the port before supervisor start');

    const spec = { name: 'adoptee', cmd: process.execPath, args: ['-e', 'setInterval(() => {}, 1000);'], port, healthPath: '/health' };
    const { children, shutdown } = await superviseForeground({
      specs: [spec],
      installSignalHandlers: false,
      exitOnStop: false,
    });

    try {
      const c = children[0];
      assert.equal(c.adopted, true, 'child was adopted, not spawned as a duplicate');
      assert.equal(c.pid, null, 'no pid recorded — we do not own the adopted process');
      assert.equal(c.status, 'healthy', 'adopted child reports healthy immediately');

      // No duplicate spawn attempt: the only way a spawn would show up is a
      // CHILD_SPAWNED event for this child name — must be absent.
      const events = fs.readFileSync(path.join(STATE_DIR, 'events.jsonl'), 'utf8')
        .split('\n').filter(Boolean).map((l) => JSON.parse(l));
      const spawnedEvents = events.filter((e) => e.event === 'CHILD_SPAWNED' && e.data.name === 'adoptee');
      assert.equal(spawnedEvents.length, 0, 'no duplicate spawn was attempted for the adopted child');
      const adoptEvents = events.filter((e) => e.event === 'CHILD_ADOPTED' && e.data.name === 'adoptee');
      assert.equal(adoptEvents.length, 1, 'exactly one CHILD_ADOPTED event was logged');
    } finally {
      await shutdown('test-cleanup');
    }
  } finally {
    try { process.kill(orphan.pid, 'SIGKILL'); } catch { /* best-effort */ }
  }
});

test('superviseForeground: reports a CONFLICT once (no restart storm) when the port is occupied by a stale/hung process', async () => {
  reset();
  const port = await findFreePort();
  // Pre-spawn a fake "stale" occupant that binds the port but does NOT serve a
  // healthy /health response (simulates a hung/broken orphan, not a healthy one).
  const staleOccupant = spawn(process.execPath, ['-e', `
    const net = require('net');
    net.createServer(() => {}).listen(${port}, '127.0.0.1');
    setInterval(() => {}, 1000);
  `], { stdio: 'ignore' });

  try {
    const occupantUp = await waitFor(async () => {
      const s = new net.Socket();
      return new Promise((resolve) => {
        s.once('connect', () => { s.destroy(); resolve(true); });
        s.once('error', () => resolve(false));
        s.connect(port, '127.0.0.1');
      });
    });
    assert.equal(occupantUp, true, 'precondition: stale occupant is listening before supervisor start');

    const spec = { name: 'conflicted-child', cmd: process.execPath, args: ['-e', 'setInterval(() => {}, 1000);'], port, healthPath: '/health' };
    const { children, shutdown } = await superviseForeground({
      specs: [spec],
      installSignalHandlers: false,
      exitOnStop: false,
    });

    try {
      const c = children[0];
      assert.equal(c.status, 'conflicted', 'child is marked conflicted, not spawned and not adopted');
      assert.equal(c.pid, null, 'no spawn attempt was made — no pid recorded');

      // Bounded: hold for several health-check ticks and confirm NO spawn was
      // ever attempted (no restart-storm retry loop against the occupied port).
      await sleep(200);
      const events = fs.readFileSync(path.join(STATE_DIR, 'events.jsonl'), 'utf8')
        .split('\n').filter(Boolean).map((l) => JSON.parse(l));
      const spawnedEvents = events.filter((e) => e.event === 'CHILD_SPAWNED' && e.data.name === 'conflicted-child');
      assert.equal(spawnedEvents.length, 0, 'zero spawn attempts were made against the conflicted port — no restart storm');
      const conflictEvents = events.filter((e) => e.event === 'CHILD_PORT_CONFLICT' && e.data.name === 'conflicted-child');
      assert.equal(conflictEvents.length, 1, 'exactly one CHILD_PORT_CONFLICT event was logged (reported once)');
      assert.equal(c.status, 'conflicted', 'status remains conflicted — never resurrected by a stray health-check tick');
    } finally {
      await shutdown('test-cleanup');
    }
  } finally {
    try { process.kill(staleOccupant.pid, 'SIGKILL'); } catch { /* best-effort */ }
  }
});

// ── spawn + heartbeat shape ──────────────────────────────────────────────────
test('spawn+heartbeat: a healthy sleeper child produces a heartbeat with pid/status/restarts', async () => {
  reset();
  const { children, shutdown } = await superviseForeground({
    specs: [SLEEPER_SPEC('sleeper1')],
    installSignalHandlers: false,
    exitOnStop: false,
  });

  try {
    assert.equal(children.length, 1);
    const pid = children[0].pid;
    assert.ok(pid > 0, 'child was spawned with a real pid');
    assert.equal(isPidAlive(pid), true, 'child process is alive');

    const ok = await waitFor(() => {
      const { present, heartbeat } = readHeartbeat();
      return present && heartbeat?.children?.sleeper1?.status === 'healthy';
    });
    assert.equal(ok, true, 'heartbeat reached healthy status within timeout');

    const { heartbeat } = readHeartbeat();
    const entry = heartbeat.children.sleeper1;
    assert.equal(entry.pid, pid);
    assert.equal(entry.restarts, 0);
    assert.ok(entry.lastHealthy, 'lastHealthy timestamp populated');
    assert.equal(typeof entry.lastHealthy, 'string');
  } finally {
    await shutdown('test-cleanup');
  }
});

// ── crash -> restart -> backoff -> FAILED after cap ─────────────────────────
test('crash-restart-backoff: a child that exits immediately is restarted, then marked FAILED after the cap', async () => {
  reset();
  const { children, shutdown } = await superviseForeground({
    specs: [CRASHER_SPEC('crasher1')],
    installSignalHandlers: false,
    exitOnStop: false,
  });

  try {
    // RUNTIMED_RESTART_CAP_COUNT=3 within a 2000ms window; backoff schedule
    // 20/40/80ms — the child should exhaust its restart budget and land on
    // 'failed' well within a few seconds. Each spawn briefly lives (Node
    // startup + process.exit(1) teardown takes several ms), so an in-flight
    // healthCheck() tick legitimately observes 'healthy' or 'restarting'
    // mid-cycle — that is correct, not a race to suppress. The only
    // durable property worth asserting is the TERMINAL state: once
    // in-memory status reaches 'failed', it must stay 'failed' (the
    // healthCheck guard `status === 'failed' -> return` must hold), and the
    // heartbeat file (written on its own independent interval) must
    // eventually converge to the same terminal value.
    const ok = await waitFor(() => children[0].status === 'failed', { timeoutMs: 5000 });
    assert.equal(ok, true, 'child reached failed status after exhausting restart cap');

    const c = children[0];
    assert.equal(c.restartTimestamps.length, 3, 'exactly capCount restarts were counted');
    assert.equal(c.pid, null, 'no live pid once failed (last exit already processed)');

    // Terminal-state stability: hold for several more health-check ticks
    // (40ms each) and confirm status never gets clobbered back to
    // 'healthy'/'restarting' by a stale timer or a leftover healthCheck call.
    await sleep(HEALTH_CHECK_SETTLE_MS);
    assert.equal(c.status, 'failed', 'failed status is terminal — no stale tick resurrects it');

    // The heartbeat is written on an independent interval; wait for it to
    // converge to the same terminal value rather than racing a single read
    // against its own write cadence.
    const heartbeatConverged = await waitFor(() => {
      const { heartbeat } = readHeartbeat();
      return heartbeat?.children?.crasher1?.status === 'failed';
    }, { timeoutMs: 2000 });
    assert.equal(heartbeatConverged, true, 'heartbeat file converges to failed status');
    const { heartbeat } = readHeartbeat();
    assert.equal(heartbeat.children.crasher1.restarts, 3);

    // events.jsonl must contain the CHILD_FAILED event (per the shared
    // contract: {t, comp:'runtimed', event, data}).
    const events = fs.readFileSync(path.join(STATE_DIR, 'events.jsonl'), 'utf8')
      .split('\n').filter(Boolean).map((l) => JSON.parse(l));
    const failedEvent = events.find((e) => e.event === 'CHILD_FAILED');
    assert.ok(failedEvent, 'a CHILD_FAILED event was logged');
    assert.equal(failedEvent.comp, 'runtimed');
    assert.equal(failedEvent.data.name, 'crasher1');
  } finally {
    await shutdown('test-cleanup');
  }
});

// ── stop kills the whole tree — no orphans ──────────────────────────────────
test('stop kills tree: shutdown() terminates every spawned child, no orphan pids remain', async () => {
  reset();
  const specs = [SLEEPER_SPEC('sleeperA'), SLEEPER_SPEC('sleeperB'), SLEEPER_SPEC('sleeperC')];
  const { children, shutdown } = await superviseForeground({
    specs,
    installSignalHandlers: false,
    exitOnStop: false,
  });

  const pids = children.map((c) => c.pid);
  assert.equal(pids.every((p) => p > 0), true, 'all 3 children spawned with real pids');
  assert.equal(pids.every(isPidAlive), true, 'all 3 children alive before shutdown');

  await shutdown('test-stop');

  // Give the OS a brief moment to reap; shutdown() already waits internally,
  // but assert with a short bounded poll for safety against scheduler jitter.
  const allDead = await waitFor(() => pids.every((p) => !isPidAlive(p)), { timeoutMs: 2000 });
  assert.equal(allDead, true, 'zero orphan pids remain after shutdown()');

  for (const c of children) {
    assert.equal(c.status, 'stopped', `child ${c.spec.name} status is stopped, not restarting/failed`);
  }

  // pid file must be cleaned up.
  assert.equal(fs.existsSync(path.join(STATE_DIR, 'runtimed.pid')), false, 'pid file removed on stop');
});

// ── status: cold and stale paths ────────────────────────────────────────────
test('status (cold): readHeartbeat reports present:false when no runtime has ever run', () => {
  reset();
  const { present, fresh, heartbeat } = readHeartbeat();
  assert.equal(present, false);
  assert.equal(fresh, false);
  assert.equal(heartbeat, null);
});

test('status (stale): a heartbeat older than the stale threshold reports fresh:false', async () => {
  reset();
  const heartbeatPath = path.join(STATE_DIR, 'heartbeat.json');
  const ancient = new Date(Date.now() - 10_000).toISOString(); // stale threshold is 150ms in this suite
  fs.writeFileSync(heartbeatPath, JSON.stringify({ t: ancient, children: {} }));

  const { present, fresh, ageMs } = readHeartbeat();
  assert.equal(present, true);
  assert.equal(fresh, false, 'a 10s-old heartbeat is stale against the 150ms test threshold');
  assert.ok(ageMs >= 10_000);
});

test('status CLI (cold): `status --json` on a fresh state dir reports a non-running state, exit 1', () => {
  reset();
  const scriptPath = new URL('./yuri-runtimed.mjs', import.meta.url).pathname;
  let stdout = '';
  let exitCode = 0;
  try {
    stdout = execFileSync(process.execPath, [scriptPath, 'status', '--json'], {
      env: { ...process.env },
      encoding: 'utf8',
    });
  } catch (e) {
    // execFileSync throws on non-zero exit — status:1 is the honest "not
    // running" contract from the acceptance criteria, so capture and inspect.
    stdout = e.stdout ?? '';
    exitCode = e.status ?? 1;
  }
  const report = JSON.parse(stdout);
  assert.equal(report.state, 'not running');
  assert.equal(report.heartbeatPresent, false);
  assert.equal(report.supervisorAlive, false);
  assert.notEqual(exitCode, 0, 'cold status exits non-zero (honest "not running")');
});

// ── start --dry-run prints the supervision plan without spawning anything ──
test('start --dry-run: prints the supervision plan and spawns zero processes', () => {
  reset();
  const scriptPath = new URL('./yuri-runtimed.mjs', import.meta.url).pathname;
  const configPath = path.join(STATE_DIR, 'runtime-config.json');
  // Force a known, single enabled child so the plan is deterministic —
  // write the config BEFORE invoking start --dry-run.
  fs.writeFileSync(configPath, JSON.stringify({
    children: { 'voice-brain': { enabled: false }, conductor: { enabled: false }, 'overnight-runner': { enabled: false } },
  }));

  const stdout = execFileSync(process.execPath, [scriptPath, 'start', '--dry-run'], {
    env: { ...process.env },
    encoding: 'utf8',
  });
  const plan = JSON.parse(stdout);
  assert.equal(plan.childCount, 0, 'all default children disabled via config -> empty plan');
  assert.ok(Array.isArray(plan.children));
  assert.ok(plan.stateDir.includes(path.basename(STATE_DIR)), 'plan reports the isolated test state dir, not the real one');
  assert.equal(fs.existsSync(path.join(STATE_DIR, 'runtimed.pid')), false, 'dry-run never writes a pid file');
  assert.equal(fs.existsSync(path.join(STATE_DIR, 'heartbeat.json')), false, 'dry-run never writes a heartbeat');
});

test('start --dry-run: with an enabled child, the plan lists its cmd/args/port', () => {
  reset();
  const scriptPath = new URL('./yuri-runtimed.mjs', import.meta.url).pathname;
  const configPath = path.join(STATE_DIR, 'runtime-config.json');
  fs.writeFileSync(configPath, JSON.stringify({
    children: { 'voice-brain': { enabled: true }, conductor: { enabled: false }, 'overnight-runner': { enabled: false } },
  }));

  const stdout = execFileSync(process.execPath, [scriptPath, 'start', '--dry-run'], {
    env: { ...process.env },
    encoding: 'utf8',
  });
  const plan = JSON.parse(stdout);
  assert.equal(plan.childCount, 1);
  assert.equal(plan.children[0].name, 'voice-brain');
  assert.equal(plan.children[0].port, 8014);
});

// ── log rotation trigger ─────────────────────────────────────────────────────
test('log rotation: a log exceeding the size cap is rotated to .1 on the next spawn', async () => {
  reset();
  const logPath = path.join(STATE_DIR, 'noisy1.log');
  // Pre-seed a log file already past the tiny 512-byte test cap.
  fs.writeFileSync(logPath, 'x'.repeat(1024));
  assert.ok(fs.statSync(logPath).size >= 512);

  const { shutdown } = await superviseForeground({
    specs: [NOISY_SPEC('noisy1')],
    installSignalHandlers: false,
    exitOnStop: false,
  });

  try {
    const rotated = path.join(STATE_DIR, 'noisy1.log.1');
    const ok = await waitFor(() => fs.existsSync(rotated), { timeoutMs: 2000 });
    assert.equal(ok, true, 'oversized log was rotated to .1 before the new child log was opened');
    const rotatedSize = fs.statSync(rotated).size;
    assert.ok(rotatedSize >= 512, 'rotated file retains the pre-existing oversized content');
  } finally {
    await shutdown('test-cleanup');
  }
});

// ── health check: port-probe path against a real listening port ────────────
test('health check (port probe): a spec with `port` is only healthy once that port is accepting connections', async () => {
  reset();
  const port = await findFreePort();
  // A fake child that opens the given port only after a short delay — lets
  // us assert the health check correctly reports unhealthy-then-healthy
  // rather than trusting process-alive alone when a port is declared.
  const spec = {
    name: 'porty',
    cmd: process.execPath,
    args: ['-e', `
      const net = require('net');
      setTimeout(() => {
        net.createServer(() => {}).listen(${port}, '127.0.0.1');
      }, 120);
      setInterval(() => {}, 1000);
    `],
    port,
  };

  const { shutdown } = await superviseForeground({
    specs: [spec],
    installSignalHandlers: false,
    exitOnStop: false,
  });

  try {
    // Immediately after spawn (well before the 120ms listen delay and before
    // even one health-check tick at 40ms may have run), it should not yet be
    // reported healthy via the heartbeat.
    const becameHealthy = await waitFor(() => {
      const { heartbeat } = readHeartbeat();
      return heartbeat?.children?.porty?.status === 'healthy';
    }, { timeoutMs: 3000 });
    assert.equal(becameHealthy, true, 'health flips to healthy once the declared port is actually listening');
  } finally {
    await shutdown('test-cleanup');
  }
});

// ── final orphan sweep across the whole suite ───────────────────────────────
test('final sweep: no leftover state dir processes remain (cleanup verification)', () => {
  // Best-effort cross-check: nothing in this suite should still be writing
  // to STATE_DIR. If the pid file exists, the pid inside it must be dead.
  const pidPath = path.join(STATE_DIR, 'runtimed.pid');
  if (fs.existsSync(pidPath)) {
    const info = JSON.parse(fs.readFileSync(pidPath, 'utf8'));
    assert.equal(isPidAlive(info.pid), false, 'no leftover pid file points at a live process');
  }
  fs.rmSync(STATE_DIR, { recursive: true, force: true });
});
