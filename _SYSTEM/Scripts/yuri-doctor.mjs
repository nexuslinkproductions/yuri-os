#!/usr/bin/env node
// @capability: yuri-doctor
// @serves: diagnostics | health check | doctor | staleness sweep | beat watchdog | disk hazard | orphaned state
// @does: one-command read-only diagnostics — orchestrates existing detectors (freshness, gitnexus drift, capability registry, overseer) + new checks (launchd beat windows, err accumulation, trace-size quotas, orphaned state files, graph freshness, MCP server health)
// @use: run before/after sessions or from a beat to catch silent failures; exit 1 = CRITICAL present
// @exports: runDoctor, CHECKS, checkMcpHealth, classifyMcpServer
//
// yuri-doctor.mjs — unified YURI diagnostics CLI.
//
// READ-ONLY. This tool never mutates anything it checks: no writes, no heals,
// no --check side effects beyond what the orchestrated detectors themselves
// do in read mode. Every external call (subprocess, fs read) is bounded by a
// hard timeout and wrapped so a single broken detector becomes a FINDING, not
// a crash (fail-open orchestration, fail-closed verdict).
//
//   node _SYSTEM/Scripts/yuri-doctor.mjs            -> sectioned human report, exit 0/1
//   node _SYSTEM/Scripts/yuri-doctor.mjs --json      -> machine-readable report, exit 0/1
//
// Exit code: 0 = HEALTHY/DEGRADED (no CRITICAL finding), 1 = any CRITICAL finding.

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawnSync, execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { probeStdioServer, redactSecrets } from './mcp-health-probe.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SCRIPTS = HERE;
const SYS = path.resolve(SCRIPTS, '..');
const ROOT = path.resolve(SYS, '..');
const HOME = os.homedir();

const DEFAULT_TIMEOUT_MS = 10_000;
const START = Date.now();

// ── tiny result / finding model ──────────────────────────────────────────────
const SEV = { CRITICAL: 3, HIGH: 2, MED: 1, LOW: 0 };

function finding(section, severity, message, evidence) {
  return { section, severity, message, evidence: evidence || null };
}

// Bounded subprocess runner. NEVER throws — a timeout, missing binary, or
// non-zero exit all resolve to a structured result the caller inspects.
// Read-only by construction: callers only ever pass detectors' own read/--json
// modes (never --heal / --fix / --write).
function runBounded(cmd, args, { timeout = DEFAULT_TIMEOUT_MS, cwd = ROOT } = {}) {
  try {
    const r = spawnSync(cmd, args, {
      cwd,
      encoding: 'utf8',
      timeout,
      maxBuffer: 16 * 1024 * 1024,
    });
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

function safeReadFile(p, max = 2 * 1024 * 1024) {
  try {
    const st = fs.statSync(p);
    if (!st.isFile()) return null;
    if (st.size > max) {
      const fd = fs.openSync(p, 'r');
      const buf = Buffer.alloc(max);
      fs.readSync(fd, buf, 0, max, st.size - max);
      fs.closeSync(fd);
      return buf.toString('utf8');
    }
    return fs.readFileSync(p, 'utf8');
  } catch {
    return null;
  }
}

function lastLines(text, n = 2) {
  if (!text) return [];
  const lines = text.split('\n').filter((l) => l.length > 0);
  return lines.slice(-n);
}

function fmtBytes(n) {
  if (n >= 1024 ** 3) return `${(n / 1024 ** 3).toFixed(2)}GB`;
  if (n >= 1024 ** 2) return `${(n / 1024 ** 2).toFixed(2)}MB`;
  if (n >= 1024) return `${(n / 1024).toFixed(1)}KB`;
  return `${n}B`;
}

function relp(p) {
  try {
    return path.relative(ROOT, p).split(path.sep).join('/');
  } catch {
    return p;
  }
}

// ── [FRESHNESS] — orchestrate yuri-freshness.mjs (runFreshness, read-only) ──
async function checkFreshness() {
  const out = [];
  try {
    const mod = await import(pathToFileURL(path.join(SCRIPTS, 'yuri-freshness.mjs')).href);
    if (typeof mod.runFreshness !== 'function') {
      out.push(finding('FRESHNESS', 'HIGH', 'yuri-freshness.mjs loaded but runFreshness export missing', 'yuri-freshness.mjs'));
      return out;
    }
    // runFreshness(json:true) both returns the report object AND logs to
    // stdout — capture + silence stdout so orchestration stays sectioned.
    const origWrite = process.stdout.write.bind(process.stdout);
    process.stdout.write = () => true;
    let report;
    try {
      report = mod.runFreshness({ heal: false, json: true });
    } finally {
      process.stdout.write = origWrite;
    }
    if (!report) {
      out.push(finding('FRESHNESS', 'HIGH', 'runFreshness returned no report', 'yuri-freshness.mjs'));
      return out;
    }
    if (report.staleCount > 0) {
      out.push(finding('FRESHNESS', 'HIGH', `${report.staleCount} stale surface(s): ${report.stale.join(', ')}`, '_SYSTEM/Scripts/yuri-freshness.mjs'));
    } else {
      out.push(finding('FRESHNESS', 'LOW', `0 stale surfaces (coverage ${(report.coverage * 100).toFixed(1)}%)`, '_SYSTEM/Scripts/yuri-freshness.mjs'));
    }
    if (report.unregisteredCount > 0) {
      out.push(finding('FRESHNESS', 'LOW', `${report.unregisteredCount} unregistered stale-able artifact(s)`, '_SYSTEM/Scripts/yuri-freshness.mjs'));
    }
  } catch (e) {
    out.push(finding('FRESHNESS', 'HIGH', `detector threw: ${String(e?.message || e).slice(0, 160)}`, 'yuri-freshness.mjs (import failed)'));
  }
  return out;
}

// ── [GRAPH] section part 1 — orchestrate xref-drift-scan.mjs gitnexusStaleness ──
async function checkGitnexusDrift() {
  const out = [];
  try {
    const mod = await import(pathToFileURL(path.join(SCRIPTS, 'xref-drift-scan.mjs')).href);
    if (typeof mod.gitnexusStaleness !== 'function') {
      out.push(finding('GRAPH', 'HIGH', 'xref-drift-scan.mjs loaded but gitnexusStaleness export missing', 'xref-drift-scan.mjs'));
      return out;
    }
    const res = mod.gitnexusStaleness({ repoRoot: ROOT });
    if (!res.available) {
      out.push(finding('GRAPH', 'MED', `gitnexus staleness indeterminate: ${res.reason}`, '.gitnexus meta marker'));
    } else if (res.stale) {
      const behind = res.behind == null ? 'unknown' : res.behind;
      out.push(finding('GRAPH', 'MED', `gitnexus index is stale (${behind} commits behind HEAD)`, `indexed=${res.indexedCommit} head=${res.head}`));
    } else {
      out.push(finding('GRAPH', 'LOW', 'gitnexus index is current with HEAD', `head=${res.head}`));
    }
  } catch (e) {
    out.push(finding('GRAPH', 'HIGH', `detector threw: ${String(e?.message || e).slice(0, 160)}`, 'xref-drift-scan.mjs (import failed)'));
  }
  return out;
}

// ── [REGISTRY] — shell out to capability-scan.mjs --check (its own read-only mode) ──
function checkCapabilityRegistry() {
  const out = [];
  const script = path.join(SCRIPTS, 'capability-scan.mjs');
  if (!fs.existsSync(script)) {
    out.push(finding('REGISTRY', 'HIGH', 'capability-scan.mjs not found', script));
    return out;
  }
  const r = runBounded('node', [script, '--check'], { timeout: DEFAULT_TIMEOUT_MS });
  if (!r.ok) {
    out.push(finding('REGISTRY', 'HIGH', `capability-scan --check failed to run: ${r.timedOut ? 'timeout' : r.error}`, relp(script)));
  } else if (r.code !== 0) {
    out.push(finding('REGISTRY', 'HIGH', 'capability registry STALE (capabilities.json differs from @capability scan)', relp(script)));
  } else {
    out.push(finding('REGISTRY', 'LOW', (r.stdout || 'OK').trim().slice(0, 200), relp(script)));
  }
  return out;
}

// ── [OVERSEER] — shell out to health-status.mjs (imports kagami-overseer getHealthSummary) ──
function checkOverseer() {
  const out = [];
  const script = path.join(SCRIPTS, 'health-status.mjs');
  if (!fs.existsSync(script)) {
    out.push(finding('OVERSEER', 'HIGH', 'health-status.mjs not found', script));
    return out;
  }
  const r = runBounded('node', [script], { timeout: DEFAULT_TIMEOUT_MS });
  if (!r.ok) {
    out.push(finding('OVERSEER', 'HIGH', `health-status.mjs failed to run: ${r.timedOut ? 'timeout' : r.error}`, relp(script)));
    return out;
  }
  let summary = null;
  try { summary = JSON.parse(r.stdout); } catch { /* fall through */ }
  if (!summary) {
    out.push(finding('OVERSEER', 'MED', `health-status.mjs produced non-JSON output (exit ${r.code})`, relp(script)));
    return out;
  }
  const quarantined = Array.isArray(summary.quarantinedLanes) ? summary.quarantinedLanes : [];
  if (summary.status === 'fail') {
    out.push(finding('OVERSEER', 'HIGH', `kagami overseer status=fail`, relp(script)));
  } else if (quarantined.length > 0) {
    out.push(finding('OVERSEER', 'HIGH', `${quarantined.length} quarantined lane(s): ${quarantined.slice(0, 10).join(', ')}`, relp(script)));
  } else {
    out.push(finding('OVERSEER', 'LOW', `overseer status=${summary.status || 'unknown'}, 0 quarantined lanes`, relp(script)));
  }
  return out;
}

// ── [RUNTIME] — Yuri Runtime supervisor (yuri-runtimed.mjs) liveness ───────
// Read-only: imports readHeartbeat (pure fs.readFileSync, no side effects)
// from the runtime module itself rather than re-deriving the stale-heartbeat
// math here — the supervisor's own freshness contract is the single source
// of truth (DRY, and it's already hermetically tested in
// yuri-runtime/yuri-runtimed.test.mjs). Fail-open: any throw becomes a single
// bounded finding, never a crash of the doctor run.
const RUNTIME_DIR = path.join(SYS, 'runtime');
const RUNTIME_STATE = path.join(SYS, 'state', 'runtime');
const RUNTIME_HEARTBEAT_PATH = path.join(RUNTIME_STATE, 'heartbeat.json');
const RUNTIME_ERROR_EVENTS = new Set(['CHILD_SPAWN_ERROR', 'CHILD_FAILED']);

function tailJsonlEvents(filePath, maxLines = 200) {
  const text = safeReadFile(filePath, 256 * 1024); // bounded tail read, matches ERRORS/TRACES sizing discipline
  if (!text) return [];
  const lines = text.split('\n').filter(Boolean).slice(-maxLines);
  const events = [];
  for (const line of lines) {
    try { events.push(JSON.parse(line)); } catch { /* skip a malformed line, never throw */ }
  }
  return events;
}

async function checkRuntime() {
  const out = [];
  try {
    if (!fs.existsSync(RUNTIME_DIR)) {
      out.push(finding('RUNTIME', 'LOW', 'runtime not running (yuri-runtimed.mjs not present)', relp(RUNTIME_DIR)));
      return out;
    }

    const mod = await import(pathToFileURL(path.join(RUNTIME_DIR, 'yuri-runtimed.mjs')).href);
    if (typeof mod.readHeartbeat !== 'function') {
      out.push(finding('RUNTIME', 'HIGH', 'yuri-runtimed.mjs loaded but readHeartbeat export missing', relp(RUNTIME_DIR)));
      return out;
    }

    const { present, fresh, ageMs, heartbeat } = mod.readHeartbeat();
    if (!present || !fresh) {
      const reason = !present ? 'no heartbeat found' : `stale heartbeat (age ${(ageMs / 1000).toFixed(0)}s)`;
      out.push(finding('RUNTIME', 'LOW', `runtime not running (${reason})`, relp(RUNTIME_HEARTBEAT_PATH)));
    } else {
      const children = heartbeat?.children || {};
      const names = Object.keys(children);
      const healthy = names.filter((n) => children[n].status === 'healthy').length;
      const failed = names.filter((n) => children[n].status === 'failed').length;
      const other = names.length - healthy - failed;
      const sev = failed > 0 ? 'HIGH' : 'LOW';
      out.push(finding('RUNTIME', sev, `runtime running — ${names.length} child(ren): ${healthy} healthy, ${failed} failed, ${other} other`, names.map((n) => `${n}=${children[n].status}`).join(', ') || '(no children configured)'));
    }

    // Last ERROR-class event in the tail — MED if within 24h, else LOW/none.
    const events = tailJsonlEvents(path.join(RUNTIME_STATE, 'events.jsonl'));
    const errorEvents = events.filter((e) => RUNTIME_ERROR_EVENTS.has(e.event));
    if (errorEvents.length > 0) {
      const last = errorEvents[errorEvents.length - 1];
      const lastTs = new Date(last.t).getTime();
      const ageH = (Date.now() - lastTs) / 3_600_000;
      if (Number.isFinite(ageH) && ageH <= 24) {
        out.push(finding('RUNTIME', 'MED', `last ERROR-class event within 24h: ${last.event} (${ageH.toFixed(1)}h ago)`, JSON.stringify(last.data || {}).slice(0, 160)));
      } else {
        out.push(finding('RUNTIME', 'LOW', `no ERROR-class event within 24h (last: ${last.event})`, relp(path.join(RUNTIME_STATE, 'events.jsonl'))));
      }
    }

    // Log-size quota: any _SYSTEM/state/runtime/*.log over 20MB.
    let logFiles = [];
    try { logFiles = fs.readdirSync(RUNTIME_STATE).filter((f) => f.endsWith('.log')); } catch { /* dir absent — nothing to check */ }
    for (const f of logFiles) {
      const full = path.join(RUNTIME_STATE, f);
      let st;
      try { st = fs.statSync(full); } catch { continue; }
      if (st.size > 20 * 1024 * 1024) {
        out.push(finding('RUNTIME', 'MED', `${relp(full)}: ${fmtBytes(st.size)} — exceeds 20MB quota (rotation may not be keeping up)`, full));
      }
    }
  } catch (e) {
    out.push(finding('RUNTIME', 'HIGH', `section threw: ${String(e?.message || e).slice(0, 160)}`, 'yuri-runtimed.mjs (import or read failed)'));
  }
  return out;
}

// ── [BEATS] — launchd beat-window watchdog + plist integrity ────────────────
// Known recurring beats: {plist, outputs (any-one-fresh-clears), intervalMs}.
// A beat's output is considered fresh if mtime is within 2x its interval.
const BEATS = [
  {
    id: 'com.yuri.freshness-sweep',
    intervalMs: 6 * 60 * 60 * 1000,
    outputs: [path.join(SYS, 'state', '.freshness-sweep.out')],
  },
  {
    id: 'com.yuri.canonical-drain',
    intervalMs: 300 * 1000,
    // maintenance beat writes into memory-canonical/ (dir mtime) and/or the
    // kagami .drain.out log — either counts as a liveness signal.
    outputs: [
      path.join(SYS, 'state', 'memory-canonical'),
      path.join(HOME, 'Library', 'Logs', 'YURI-OS-MUSUBI', 'kagami', '.drain.out'),
    ],
  },
  {
    id: 'com.yuri.energy-learn-deriver',
    intervalMs: 30 * 60 * 1000,
    outputs: [path.join(SYS, 'state', '.energy-learn-deriver.out')],
  },
  {
    id: 'com.yuri-os-musubi.lane-health',
    intervalMs: 30 * 60 * 1000,
    outputs: [path.join(HOME, 'Library', 'Logs', 'YURI-OS-MUSUBI', 'lane-health.out.log')],
  },
  {
    id: 'com.yuri.kagami-heartbeat',
    intervalMs: 60 * 60 * 1000,
    outputs: [path.join(HOME, 'Library', 'Logs', 'YURI-OS-MUSUBI', 'kagami', 'heartbeat.out.log')],
  },
];

function newestMtimeMs(p) {
  try {
    const st = fs.statSync(p);
    if (st.isFile()) return st.mtimeMs;
    if (st.isDirectory()) {
      let newest = st.mtimeMs;
      for (const entry of fs.readdirSync(p)) {
        try {
          const st2 = fs.statSync(path.join(p, entry));
          if (st2.mtimeMs > newest) newest = st2.mtimeMs;
        } catch { /* skip unreadable entry */ }
      }
      return newest;
    }
    return null;
  } catch {
    return null;
  }
}

function checkBeats() {
  const out = [];
  const now = Date.now();

  for (const beat of BEATS) {
    let newest = null;
    let anyExists = false;
    for (const out_ of beat.outputs) {
      if (fs.existsSync(out_)) {
        anyExists = true;
        const m = newestMtimeMs(out_);
        if (m != null && (newest == null || m > newest)) newest = m;
      }
    }
    if (!anyExists || newest == null) {
      out.push(finding('BEATS', 'MED', `${beat.id}: no output found yet (never fired, or output path moved)`, beat.outputs.map(relp).join(' | ')));
      continue;
    }
    const ageMs = now - newest;
    const windowMs = beat.intervalMs * 2;
    if (ageMs > windowMs) {
      const ageH = (ageMs / 3_600_000).toFixed(1);
      const winH = (windowMs / 3_600_000).toFixed(1);
      out.push(finding('BEATS', 'HIGH', `${beat.id}: MISSED window — output age ${ageH}h > 2x interval (${winH}h)`, beat.outputs.map(relp).join(' | ')));
    } else {
      const ageMin = (ageMs / 60_000).toFixed(1);
      out.push(finding('BEATS', 'LOW', `${beat.id}: fresh (last output ${ageMin}min ago)`, beat.outputs.map(relp).join(' | ')));
    }
  }

  // BROKEN-PLIST: every plist under ~/Library/LaunchAgents matching our beat
  // ids must still point at an existing script.
  const agentsDir = path.join(HOME, 'Library', 'LaunchAgents');
  let plists = [];
  try {
    plists = fs.readdirSync(agentsDir).filter((f) => f.endsWith('.plist') && (f.startsWith('com.yuri.') || f.startsWith('com.yuri-os-musubi.')));
  } catch (e) {
    out.push(finding('BEATS', 'MED', `cannot list ${relp(agentsDir)}: ${String(e?.message || e).slice(0, 120)}`, agentsDir));
    plists = [];
  }

  for (const plistName of plists) {
    const plistPath = path.join(agentsDir, plistName);
    const r = runBounded('plutil', ['-convert', 'xml1', '-o', '-', plistPath], { timeout: 5000 });
    if (!r.ok || r.code !== 0) {
      out.push(finding('BEATS', 'CRITICAL', `${plistName}: cannot parse plist (${r.timedOut ? 'timeout' : (r.error || `exit ${r.code}`)})`, plistPath));
      continue;
    }
    // Extract ProgramArguments <string> entries in document order.
    const xml = r.stdout;
    const paMatch = xml.match(/<key>ProgramArguments<\/key>\s*<array>([\s\S]*?)<\/array>/);
    if (!paMatch) {
      out.push(finding('BEATS', 'CRITICAL', `${plistName}: no ProgramArguments array found`, plistPath));
      continue;
    }
    const args = [...paMatch[1].matchAll(/<string>([^<]*)<\/string>/g)].map((m) => m[1]);
    // Find the first argument that looks like a script path (absolute path
    // ending in a known executable extension) and stat it. Some beats invoke
    // via `/bin/bash -l -c "bash <script>"` — pull the script out of the -c body too.
    let scriptCandidates = args.filter((a) => /\.(mjs|js|py|sh)$/.test(a) && a.startsWith('/'));
    if (scriptCandidates.length === 0) {
      const cBody = args.find((a) => /\.(mjs|js|py|sh)\b/.test(a) && a.includes('/'));
      if (cBody) {
        const m = cBody.match(/(\/\S+\.(?:mjs|js|py|sh))/);
        if (m) scriptCandidates = [m[1]];
      }
    }
    if (scriptCandidates.length === 0) {
      out.push(finding('BEATS', 'MED', `${plistName}: no script path detected in ProgramArguments (cannot verify target exists)`, plistPath));
      continue;
    }
    let allExist = true;
    const missing = [];
    for (const sc of scriptCandidates) {
      if (!fs.existsSync(sc)) { allExist = false; missing.push(sc); }
    }
    if (!allExist) {
      out.push(finding('BEATS', 'CRITICAL', `${plistName}: BROKEN-PLIST — target script missing: ${missing.join(', ')}`, plistPath));
    }
  }

  return out;
}

// ── [ERRORS] — scan *.err files for accumulation ─────────────────────────────
function globErrFiles() {
  const dirs = [path.join(SYS, 'state'), path.join(SYS, 'monitoring')];
  const files = [];
  for (const d of dirs) {
    let entries = [];
    try { entries = fs.readdirSync(d, { withFileTypes: true }); } catch { continue; }
    for (const e of entries) {
      if (!e.isFile()) continue;
      if (e.name.endsWith('.err') || (e.name.startsWith('.') && e.name.endsWith('.err'))) {
        files.push(path.join(d, e.name));
      }
    }
  }
  return files;
}

function checkErrors() {
  const out = [];
  const files = globErrFiles();
  const now = Date.now();
  const HOUR = 3_600_000;
  let flaggedAny = false;

  for (const f of files) {
    let st;
    try { st = fs.statSync(f); } catch { continue; }
    if (st.size === 0) continue;

    const ageMs = now - st.mtimeMs;
    const isLarge = st.size > 50 * 1024;
    const isFresh = ageMs < 24 * HOUR;

    if (isLarge || isFresh) {
      flaggedAny = true;
      const content = safeReadFile(f, 8192);
      const tail = lastLines(content, 2).map((l) => l.slice(0, 200));
      const sev = isLarge ? 'HIGH' : 'MED';
      const reason = isLarge ? `accumulating unread errors (${fmtBytes(st.size)})` : `fresh errors (${fmtBytes(st.size)}, mtime ${(ageMs / HOUR).toFixed(1)}h ago)`;
      out.push(finding('ERRORS', sev, `${relp(f)}: ${reason}`, tail.join(' | ') || '(empty tail)'));
    }
  }

  if (!flaggedAny) {
    out.push(finding('ERRORS', 'LOW', `0 flagged .err files across ${files.length} scanned`, `${relp(path.join(SYS, 'state'))}, ${relp(path.join(SYS, 'monitoring'))}`));
  }
  return out;
}

// ── [TRACES] — size checks on known trace files + bounded du sweep ──────────
const KNOWN_TRACES = [
  path.join(SYS, 'state', 'energy-gate-trace.jsonl'),
  path.join(SYS, 'monitoring', 'kagami-discipline.log'),
  path.join(SYS, 'state', 'claim-transition-trace.jsonl'),
];

function duBytes(dir, timeout = DEFAULT_TIMEOUT_MS) {
  // `du -Ak` gives 1024-byte block counts recursively; -d not portable the
  // same way on BSD vs GNU du, so just take the top-level dir total plus walk
  // one extra level via find for large-file detection (bounded, no full crawl
  // beyond these two known directories).
  const r = runBounded('find', [dir, '-type', 'f', '-size', '+500M', '-print'], { timeout });
  if (!r.ok) return { ok: false, error: r.timedOut ? 'timeout' : r.error, files: [] };
  const files = r.stdout.split('\n').map((l) => l.trim()).filter(Boolean);
  return { ok: true, files };
}

function checkTraces() {
  const out = [];

  for (const f of KNOWN_TRACES) {
    let st;
    try { st = fs.statSync(f); } catch {
      out.push(finding('TRACES', 'LOW', `${relp(f)}: not present`, f));
      continue;
    }
    const sizeMB = st.size / (1024 ** 2);
    if (st.size > 5 * 1024 ** 3) {
      out.push(finding('TRACES', 'CRITICAL', `${relp(f)}: ${fmtBytes(st.size)} — disk hazard (>5GB)`, f));
    } else if (st.size > 500 * 1024 ** 2) {
      out.push(finding('TRACES', 'HIGH', `${relp(f)}: ${fmtBytes(st.size)} — exceeds 500MB quota`, f));
    } else {
      out.push(finding('TRACES', 'LOW', `${relp(f)}: ${sizeMB.toFixed(1)}MB`, f));
    }
  }

  // Bounded sweep of _SYSTEM/state and _SYSTEM/monitoring for any file >500MB
  // beyond the known-trace list above (covers unnamed accumulators).
  for (const dir of [path.join(SYS, 'state'), path.join(SYS, 'monitoring')]) {
    const res = duBytes(dir);
    if (!res.ok) {
      out.push(finding('TRACES', 'MED', `bounded size sweep of ${relp(dir)} failed: ${res.error}`, dir));
      continue;
    }
    for (const f of res.files) {
      if (KNOWN_TRACES.includes(f)) continue; // already reported above
      let st;
      try { st = fs.statSync(f); } catch { continue; }
      const tapeInfo = classifyTapeFile(f);
      if (tapeInfo) {
        // Registered pattern: _SYSTEM/state/tape/tape-<SYM>-<YYYYMMDD>.jsonl (raw, uncompressed).
        // The recorder (observatory/tape-recorder.mjs) gzips the PREVIOUS day's file on the
        // first write of a new UTC day — so a raw .jsonl for any date OTHER than today is a
        // dead/unrotated leftover (recorder crashed/stopped before the next day's rollover),
        // not a live-growing file. Flag those distinctly; today's file growing large is expected.
        if (tapeInfo.dateTag !== tapeInfo.todayTag) {
          out.push(finding('TRACES', 'HIGH', `${relp(f)}: ${fmtBytes(st.size)} — unrotated tape (date ${tapeInfo.dateTag} != today ${tapeInfo.todayTag}; recorder likely stopped before day-rollover — gzip or archive)`, f));
        } else {
          out.push(finding('TRACES', 'LOW', `${relp(f)}: ${fmtBytes(st.size)} — live current-day tape (expected growth, rotates on next UTC day)`, f));
        }
        continue;
      }
      const sev = st.size > 5 * 1024 ** 3 ? 'CRITICAL' : 'HIGH';
      out.push(finding('TRACES', sev, `${relp(f)}: ${fmtBytes(st.size)} — unbounded growth outside known trace list`, f));
    }
  }

  return out;
}

// Registered pattern for the tape-recorder's own rotation convention (see
// alpha-factor-library/observatory/tape-recorder.mjs `tapePath`/`rotateTape`):
// _SYSTEM/state/tape/tape-<SYM>-<YYYYMMDD>.jsonl, gzipped to .jsonl.gz on the
// recorder's next write after the UTC date advances. Returns null for anything
// that doesn't match (falls through to the generic unbounded-growth finding).
function classifyTapeFile(f) {
  const m = /(?:^|\/)tape[\\/]tape-[A-Z0-9]+-(\d{8})\.jsonl$/.exec(f);
  if (!m) return null;
  const now = new Date();
  const todayTag = `${now.getUTCFullYear()}${String(now.getUTCMonth() + 1).padStart(2, '0')}${String(now.getUTCDate()).padStart(2, '0')}`;
  return { dateTag: m[1], todayTag };
}

// ── [ORPHANS] — top-level _SYSTEM/state files not referenced by basename ────
function checkOrphans() {
  const out = [];
  const stateDir = path.join(SYS, 'state');
  let entries = [];
  try {
    entries = fs.readdirSync(stateDir, { withFileTypes: true });
  } catch (e) {
    out.push(finding('ORPHANS', 'LOW', `cannot read ${relp(stateDir)}: ${String(e?.message || e).slice(0, 120)}`, stateDir));
    return out;
  }

  const now = Date.now();
  const SEVEN_DAYS = 7 * 24 * 3_600_000;
  const candidates = [];
  for (const e of entries) {
    if (!e.isFile()) continue; // top level only, skip dirs
    const full = path.join(stateDir, e.name);
    let st;
    try { st = fs.statSync(full); } catch { continue; }
    if (now - st.mtimeMs < SEVEN_DAYS) continue; // skip recent files
    candidates.push(e.name);
  }

  if (candidates.length === 0) {
    out.push(finding('ORPHANS', 'LOW', '0 candidate files (all recent or none present)', relp(stateDir)));
    return out;
  }

  // One bounded grep pass (POSIX grep -- always present, unlike rg which is
  // only a Claude Code shell wrapper in this environment, not a real binary)
  // with a joined alternation pattern, emitting only the matched tokens
  // (-o) so we get per-basename hits in a single process, not per-file.
  const scriptsGlob = path.join(SYS, 'Scripts');
  const pattern = candidates.map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
  // This recursive grep over Scripts/**/*.mjs is the heaviest bounded op in
  // the whole doctor run (~9s observed on a 555-file / 15MB tree) — give it
  // more headroom than the 10s default so a slightly slower disk doesn't tip
  // it into a spurious timeout; the 60s overall budget easily absorbs it.
  const grep = runBounded('grep', ['-rhoE', '--include=*.mjs', pattern, scriptsGlob], { timeout: 20_000 });

  let referencedBasenames = new Set();
  if (grep.ok && (grep.code === 0 || grep.code === 1)) {
    // exit 0 = matches found, exit 1 = no matches (both valid, non-error).
    referencedBasenames = new Set(grep.stdout.split('\n').map((l) => l.trim()).filter(Boolean));
  } else if (!grep.ok) {
    out.push(finding('ORPHANS', 'LOW', `grep sweep failed (${grep.timedOut ? 'timeout' : grep.error}) — orphan check skipped`, scriptsGlob));
    return out;
  }

  const orphans = candidates.filter((n) => ![...referencedBasenames].some((m) => m.includes(n)));
  if (orphans.length === 0) {
    out.push(finding('ORPHANS', 'LOW', `0 orphans among ${candidates.length} candidate(s) (all referenced by basename)`, relp(stateDir)));
  } else {
    const capped = orphans.slice(0, 20);
    out.push(finding('ORPHANS', 'LOW', `${orphans.length} unreferenced state file(s) (advisory, capped at 20 shown)`, capped.join(', ')));
  }
  return out;
}

// ── [GRAPH] section part 2 — yuri-graph.json generatedAt vs latest Scripts commit ──
function checkGraphFreshness() {
  const out = [];
  const graphPath = path.join(SYS, 'yuri-graph.json');
  if (!fs.existsSync(graphPath)) {
    out.push(finding('GRAPH', 'LOW', 'yuri-graph.json not present — skipped', graphPath));
    return out;
  }

  let generatedAt = null;
  try {
    const fd = fs.openSync(graphPath, 'r');
    const buf = Buffer.alloc(4096);
    const n = fs.readSync(fd, buf, 0, 4096, 0);
    fs.closeSync(fd);
    const head = buf.slice(0, n).toString('utf8');
    const m = head.match(/"generatedAt"\s*:\s*"([^"]+)"/);
    if (m) generatedAt = m[1];
  } catch (e) {
    out.push(finding('GRAPH', 'MED', `cannot read yuri-graph.json head: ${String(e?.message || e).slice(0, 120)}`, relp(graphPath)));
    return out;
  }

  if (!generatedAt) {
    out.push(finding('GRAPH', 'MED', 'yuri-graph.json has no generatedAt field in first 4KB', relp(graphPath)));
    return out;
  }

  const genDate = new Date(generatedAt);
  if (Number.isNaN(genDate.getTime())) {
    out.push(finding('GRAPH', 'MED', `yuri-graph.json generatedAt unparseable: "${generatedAt}"`, relp(graphPath)));
    return out;
  }

  const r = runBounded('git', ['log', '-1', '--format=%ci', '--', '_SYSTEM/Scripts'], { timeout: 5000 });
  if (!r.ok || r.code !== 0 || !r.stdout.trim()) {
    out.push(finding('GRAPH', 'LOW', `graph generatedAt=${generatedAt}; could not read latest Scripts commit date (${r.timedOut ? 'timeout' : (r.error || 'no output')})`, relp(graphPath)));
    return out;
  }
  const lastCommitDate = new Date(r.stdout.trim());
  if (Number.isNaN(lastCommitDate.getTime())) {
    out.push(finding('GRAPH', 'LOW', `graph generatedAt=${generatedAt}; latest Scripts commit date unparseable`, relp(graphPath)));
    return out;
  }

  const deltaDays = (lastCommitDate.getTime() - genDate.getTime()) / (24 * 3_600_000);
  if (deltaDays > 14) {
    out.push(finding('GRAPH', 'MED', `yuri-graph.json stale vs code — generatedAt=${generatedAt} is ${deltaDays.toFixed(0)}d older than latest _SYSTEM/Scripts commit`, relp(graphPath)));
  } else {
    out.push(finding('GRAPH', 'LOW', `yuri-graph.json generatedAt=${generatedAt} within 14d of latest Scripts commit (delta ${deltaDays.toFixed(1)}d)`, relp(graphPath)));
  }
  return out;
}

// ── [MCP] — MCP server health aggregation ────────────────────────────────────
// Credential-safe: discovers configured MCP servers from .mcp.json,
// .vscode/mcp.json, .codex/config.toml; reuses dedicated checks (gitnexus,
// ollama-bridge); probes repo-owned stdio servers with initialize+tools/list;
// reports network/auth/external servers as UNVERIFIED. Never prints env values,
// auth tokens, or full commands containing secrets. Protected paths and
// token-like patterns are redacted from all error output via redactSecrets.

const MCP_CONFIG_SOURCES = [
  { rel: '.mcp.json', format: 'json' },
  { rel: path.join('.vscode', 'mcp.json'), format: 'json' },
  { rel: path.join('.omp', 'mcp.json'), format: 'json' },
  { rel: path.join('.codex', 'config.toml'), format: 'toml' },
];

const MCP_DEDICATED_CHECKS = {
  gitnexus: { script: path.join('_SYSTEM', 'Scripts', 'gitnexus-mcp-check.mjs'), passPattern: /^GITNEXUS_MCP_CHECK_PASS/ },
  'ollama-bridge': { script: path.join('_SYSTEM', 'Scripts', 'ollama-bridge-mcp-check.mjs'), passPattern: /^OLLAMA_BRIDGE_MCP_CHECK_PASS/ },
};

const MCP_AUTH_CACHE_REL = path.join('.claude', 'mcp-needs-auth-cache.json');

function parseCodexMcpServers(toml) {
  const servers = {};
  const re = /\[mcp_servers\.([\w.-]+)\]\s*\n([\s\S]*?)(?=\n\[|$)/g;
  for (const match of toml.matchAll(re)) {
    const name = match[1];
    const body = match[2];
    const command = body.match(/command\s*=\s*"([^"]*)"/)?.[1];
    if (!command) continue; // subtable (e.g. [mcp_servers.x.env]), not a server definition
    const argsMatch = body.match(/args\s*=\s*\[([^\]]*)\]/);
    const args = argsMatch ? [...argsMatch[1].matchAll(/"([^"]*)"/g)].map((m) => m[1]) : [];
    const enabledMatch = body.match(/enabled\s*=\s*(true|false)/);
    const enabled = enabledMatch ? enabledMatch[1] === 'true' : true;
    const envSubtableRe = new RegExp(`\\[mcp_servers\\.${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\.env\\]`);
    const hasEnv = /\benv\s*=/.test(body) || envSubtableRe.test(toml);
    servers[name] = { command, args, enabled, hasEnv };
  }
  return servers;
}

function discoverMcpServers(root = ROOT) {
  const servers = [];
  const seen = new Set();
  for (const source of MCP_CONFIG_SOURCES) {
    const filePath = path.join(root, source.rel);
    const content = safeReadFile(filePath);
    if (!content) continue;
    if (source.format === 'json') {
      try {
        const config = JSON.parse(content);
        for (const [name, def] of Object.entries(config.mcpServers || {})) {
          if (seen.has(name)) continue;
          seen.add(name);
          servers.push({
            name,
            command: def.command,
            args: def.args || [],
            transport: def.type,
            hasUrl: typeof def.url === 'string' && def.url.length > 0,
            hasEnv: !!(def.env && Object.keys(def.env).length > 0),
            enabled: def.enabled !== false,
            source: source.rel,
          });
        }
      } catch { /* malformed JSON config, skip */ }
    } else if (source.format === 'toml') {
      for (const [name, def] of Object.entries(parseCodexMcpServers(content))) {
        if (seen.has(name)) continue;
        seen.add(name);
        servers.push({ name, ...def, source: source.rel });
      }
    }
  }
  return servers;
}

export function classifyMcpServer(server, root = ROOT) {
  const cmd = server.command || '';
  const cmdBase = path.basename(cmd);
  if (server.hasUrl || server.transport === 'http' || server.transport === 'sse') {
    return { action: 'UNVERIFIED', reason: 'external HTTP transport (network/auth dependent)' };
  }
  if (cmd === 'npx' || cmdBase === 'npx') {
    return { action: 'UNVERIFIED', reason: 'external package via npx (network/auth dependent)' };
  }
  if (server.hasEnv) {
    return { action: 'UNVERIFIED', reason: 'auth/env credentials required (not probed for safety)' };
  }
  const isNode = cmd === 'node' || cmd === process.execPath || cmdBase === 'node' || cmd.endsWith('node');
  if (!isNode) {
    return { action: 'UNVERIFIED', reason: `non-node runtime (${cmdBase || 'unknown'})` };
  }
  const firstArg = server.args?.[0];
  if (!firstArg) {
    return { action: 'UNVERIFIED', reason: 'no script path in args' };
  }
  const scriptPath = path.isAbsolute(firstArg) ? firstArg : path.resolve(root, firstArg);
  if (!fs.existsSync(scriptPath)) {
    return { action: 'UNVERIFIED', reason: 'script not found' };
  }
  if (!/\.(mjs|js)$/.test(scriptPath)) {
    return { action: 'UNVERIFIED', reason: `non-JS script (${path.extname(scriptPath) || 'no ext'})` };
  }
  return { action: 'PROBE', reason: 'repo-owned stdio server' };
}

function loadAuthCache(root = ROOT) {
  const content = safeReadFile(path.join(root, MCP_AUTH_CACHE_REL));
  if (!content) return new Set();
  try {
    return new Set(Object.keys(JSON.parse(content)));
  } catch {
    return new Set();
  }
}

export async function checkMcpHealth({ root, dedicatedChecks } = {}) {
  const out = [];
  const checkRoot = root || ROOT;
  const dedicated = dedicatedChecks || MCP_DEDICATED_CHECKS;
  const authCache = loadAuthCache(checkRoot);

  // 1. Run dedicated checks (always, even if server not in any config)
  for (const [name, check] of Object.entries(dedicated)) {
    const scriptPath = path.join(checkRoot, check.script);
    if (!fs.existsSync(scriptPath)) {
      out.push(finding('MCP', 'MED', `MCP server '${name}': UNVERIFIED — dedicated check script not found`, check.script));
      continue;
    }
    const r = runBounded(process.execPath, [scriptPath], { timeout: 20_000, cwd: checkRoot });
    if (r.timedOut) {
      out.push(finding('MCP', 'HIGH', `MCP server '${name}': FAIL — dedicated check timed out`, null));
    } else if (r.ok && r.code === 0 && check.passPattern.test(r.stdout)) {
      const toolMatch = r.stdout.match(/tools=(\d+)/);
      out.push(finding('MCP', 'LOW', `MCP server '${name}': PASS${toolMatch ? ` (${toolMatch[1]} tools)` : ''}`, 'dedicated check'));
    } else {
      const err = redactSecrets((r.stderr || r.stdout || r.error || '').slice(0, 200));
      out.push(finding('MCP', 'HIGH', `MCP server '${name}': FAIL — dedicated check failed`, err || `exit ${r.code}`));
    }
  }

  // 2. Discover configured servers and check each (skip dedicated-checked ones)
  const discovered = discoverMcpServers(checkRoot);
  for (const server of discovered) {
    if (dedicated[server.name]) continue;

    if (server.enabled === false) {
      out.push(finding('MCP', 'LOW', `MCP server '${server.name}': UNVERIFIED — disabled in config`, `source: ${server.source}`));
      continue;
    }

    if (authCache.has(server.name)) {
      out.push(finding('MCP', 'LOW', `MCP server '${server.name}': UNVERIFIED — auth-dependent (per auth cache)`, `source: ${server.source}`));
      continue;
    }

    const classification = classifyMcpServer(server, checkRoot);
    if (classification.action === 'PROBE') {
      const result = await probeStdioServer({
        command: server.command,
        args: server.args,
        cwd: checkRoot,
        timeoutMs: 8000,
        clientName: 'yuri-doctor-mcp-check',
      });
      if (result.status === 'PASS') {
        out.push(finding('MCP', 'LOW', `MCP server '${server.name}': PASS (${result.tools.length} tools)`, `probe ${result.ms}ms; source: ${server.source}`));
      } else {
        out.push(finding('MCP', 'HIGH', `MCP server '${server.name}': FAIL — ${result.status}`, redactSecrets(result.error || '')));
      }
    } else {
      out.push(finding('MCP', 'LOW', `MCP server '${server.name}': UNVERIFIED — ${classification.reason}`, `source: ${server.source}`));
    }
  }

  return out;
}


// ── section registry ─────────────────────────────────────────────────────────
// Order matches the required report structure:
// [BEATS] [ERRORS] [TRACES] [ORPHANS] [GRAPH] [REGISTRY] [FRESHNESS] [OVERSEER] [RUNTIME] [MCP]
export const CHECKS = [
  { section: 'BEATS', run: async () => checkBeats() },
  { section: 'ERRORS', run: async () => checkErrors() },
  { section: 'TRACES', run: async () => checkTraces() },
  { section: 'ORPHANS', run: async () => checkOrphans() },
  { section: 'GRAPH', run: async () => [...(await checkGitnexusDrift()), ...checkGraphFreshness()] },
  { section: 'REGISTRY', run: async () => checkCapabilityRegistry() },
  { section: 'FRESHNESS', run: async () => checkFreshness() },
  { section: 'OVERSEER', run: async () => checkOverseer() },
  { section: 'RUNTIME', run: async () => checkRuntime() },
  { section: 'MCP', run: async () => checkMcpHealth() },
];

// ── orchestration ─────────────────────────────────────────────────────────────
export async function runDoctor({ json = false } = {}) {
  const bySection = {};
  for (const check of CHECKS) {
    const t0 = Date.now();
    let results;
    try {
      results = await check.run();
    } catch (e) {
      // Absolute last-resort fail-open: a section-level throw becomes one
      // HIGH finding, never a crash of the whole doctor run.
      results = [finding(check.section, 'HIGH', `section threw: ${String(e?.message || e).slice(0, 160)}`, null)];
    }
    bySection[check.section] = { findings: results, ms: Date.now() - t0 };
  }

  const allFindings = [];
  for (const s of Object.keys(bySection)) allFindings.push(...bySection[s].findings);

  const counts = { critical: 0, high: 0, med: 0, low: 0 };
  for (const f of allFindings) {
    if (f.severity === 'CRITICAL') counts.critical++;
    else if (f.severity === 'HIGH') counts.high++;
    else if (f.severity === 'MED') counts.med++;
    else counts.low++;
  }

  const verdict = counts.critical > 0 ? 'CRITICAL' : (counts.high > 0 || counts.med > 0) ? 'DEGRADED' : 'HEALTHY';
  const totalMs = Date.now() - START;

  const report = {
    verdict,
    counts,
    sections: bySection,
    totalMs,
    timestamp: new Date().toISOString(),
  };

  const summaryLine = `DOCTOR verdict=${verdict} critical=${counts.critical} high=${counts.high} med=${counts.med} low=${counts.low}`;

  if (json) {
    console.log(JSON.stringify({ ...report, summary: summaryLine }, null, 2));
  } else {
    const order = ['BEATS', 'ERRORS', 'TRACES', 'ORPHANS', 'GRAPH', 'REGISTRY', 'FRESHNESS', 'OVERSEER', 'RUNTIME', 'MCP'];
    for (const section of order) {
      const entry = bySection[section];
      if (!entry) continue;
      console.log(`\n[${section}] (${entry.ms}ms)`);
      if (entry.findings.length === 0) {
        console.log('  (no findings)');
        continue;
      }
      for (const f of entry.findings) {
        const sevTag = f.severity.padEnd(8);
        console.log(`  ${sevTag} ${f.message}`);
        if (f.evidence) console.log(`           evidence: ${f.evidence}`);
      }
    }
    console.log(`\n${summaryLine}`);
    console.log(`DOCTOR total=${totalMs}ms`);
  }

  return { report, verdict, exitCode: verdict === 'CRITICAL' ? 1 : 0 };
}

// ── CLI entry ─────────────────────────────────────────────────────────────────
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const argv = process.argv.slice(2);
  const jsonMode = argv.includes('--json');
  runDoctor({ json: jsonMode }).then(({ exitCode }) => {
    process.exitCode = exitCode;
  }).catch((e) => {
    // A crash in the orchestrator itself (not a section) is the only path
    // that should surface as a non-diagnostic failure — still bounded, still
    // exits non-zero so a caller notices.
    console.error(`yuri-doctor: fatal orchestration error: ${String(e?.stack || e)}`);
    process.exitCode = 1;
  });
}
