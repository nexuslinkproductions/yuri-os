#!/usr/bin/env node
// PATCH 037 — Pulse Cortex outward beacon
//
// Reads .claude/state/pulse-bus.json and emits CRITICAL-tier findings to
// two sinks:
//   1. macOS notification via osascript (`display notification`)
//   2. Obsidian vault daily log append (file write; vault path from
//      env OBSIDIAN_VAULT_PATH, default falls back to NUDIMMUD-local log)
//
// Throttled: max 5 emits per session (state at pulse-beacon-state.json,
// resets when SessionStart sentinel changes). Honors beaconLevel from
// pulse-plan.json: 'none' = no emit, 'notify' = osascript only,
// 'notify+obsidian' = both.
//
// Failure modes degrade silently: osascript unavailable / DnD on → log
// only. Obsidian path missing → fallback to NUDIMMUD vault log.

import { spawn } from 'node:child_process';
import { promises as fsp, existsSync, mkdirSync, writeFileSync, renameSync, appendFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..');
const STATE_DIR = path.join(REPO_ROOT, '.claude', 'state');
const BUS_PATH = path.join(STATE_DIR, 'pulse-bus.json');
const PLAN_PATH = path.join(STATE_DIR, 'pulse-plan.json');
const BEACON_STATE = path.join(STATE_DIR, 'pulse-beacon-state.json');
const FALLBACK_VAULT_LOG = path.join(REPO_ROOT, '.claude', 'state', 'pulse-vault-log');
const ERROR_LOG = path.join(STATE_DIR, 'pulse-errors.log');
const SESSION_STATE = path.join(STATE_DIR, 'session-state.json');

const MAX_BEACONS_PER_SESSION = 5;

function logError(msg) {
  try {
    mkdirSync(STATE_DIR, { recursive: true });
    appendFileSync(ERROR_LOG, `${new Date().toISOString()} [pulse-beacon] ${msg}\n`);
  } catch (_) {}
}

async function readJSON(p) {
  try {
    const raw = await fsp.readFile(p, 'utf8');
    return JSON.parse(raw);
  } catch { return null; }
}

function writeJSON(p, obj) {
  mkdirSync(path.dirname(p), { recursive: true });
  const tmp = p + '.tmp';
  writeFileSync(tmp, JSON.stringify(obj, null, 2));
  renameSync(tmp, p);
}

async function sessionId() {
  const state = await readJSON(SESSION_STATE);
  return state?.session_id || 'unknown';
}

async function loadBeaconState() {
  const state = (await readJSON(BEACON_STATE)) || { session_id: null, count: 0, last_emit_ts: null, emitted_ids: [] };
  const sid = await sessionId();
  if (state.session_id !== sid) {
    // New session — reset throttle
    return { session_id: sid, count: 0, last_emit_ts: null, emitted_ids: [] };
  }
  return state;
}

function osascript(title, message) {
  return new Promise((resolve) => {
    const script = `display notification ${JSON.stringify(message).slice(0, 500)} with title ${JSON.stringify(title).slice(0, 80)} sound name "Glass"`;
    const child = spawn('osascript', ['-e', script], { stdio: 'ignore' });
    let settled = false;
    const timer = setTimeout(() => { if (!settled) { settled = true; try { child.kill(); } catch (_) {} resolve(false); } }, 2500);
    child.on('error', () => { if (!settled) { settled = true; clearTimeout(timer); resolve(false); } });
    child.on('close', (code) => { if (!settled) { settled = true; clearTimeout(timer); resolve(code === 0); } });
  });
}

function obsidianPath() {
  const env = process.env.OBSIDIAN_VAULT_PATH;
  if (env && existsSync(env)) return env;
  return null;
}

async function appendToObsidian(line) {
  const vault = obsidianPath();
  const today = new Date().toISOString().slice(0, 10);
  const target = vault
    ? path.join(vault, 'Notes', 'yuri', 'pulse-log', `${today}.md`)
    : path.join(FALLBACK_VAULT_LOG, `${today}.md`);
  try {
    mkdirSync(path.dirname(target), { recursive: true });
    appendFileSync(target, line + '\n');
    return target;
  } catch (e) {
    logError(`obsidian append failed: ${e.message}`);
    return null;
  }
}

function pickFindingsToEmit(bus, plan, alreadyEmitted) {
  if (!bus?.ring) return [];
  const beaconLevel = plan?.plan?.beaconLevel || plan?.beaconLevel || 'none';
  if (beaconLevel === 'none') return [];
  const turnId = plan?.turn_id;
  const ranks = { INFO: 1, WARN: 2, HIGH: 3, CRITICAL: 4 };
  const minRank = beaconLevel === 'notify+obsidian' ? ranks.WARN : ranks.HIGH;
  return bus.ring.filter(e =>
    !alreadyEmitted.has(e.id) &&
    new Date(e.expires_at).getTime() > Date.now() &&
    (e.turn_id === turnId || !turnId) &&
    (ranks[e.severity] || 0) >= minRank
  );
}

async function emit() {
  const bus = await readJSON(BUS_PATH);
  const plan = await readJSON(PLAN_PATH);
  if (!bus || !plan) {
    logError('emit: missing bus or plan; no-op');
    return { emitted: 0, reason: 'no-state' };
  }

  const state = await loadBeaconState();
  if (state.count >= MAX_BEACONS_PER_SESSION) {
    logError(`emit: throttled at ${state.count}/${MAX_BEACONS_PER_SESSION}`);
    return { emitted: 0, reason: 'throttled', state };
  }

  const beaconLevel = plan?.plan?.beaconLevel || plan?.beaconLevel || 'none';
  const alreadyEmitted = new Set(state.emitted_ids);
  const findings = pickFindingsToEmit(bus, plan, alreadyEmitted);

  if (findings.length === 0) {
    return { emitted: 0, reason: 'no-findings-above-threshold', beaconLevel };
  }

  // Synthesize one beacon per turn — top severity wins
  const top = findings.sort((a, b) => {
    const r = { INFO: 1, WARN: 2, HIGH: 3, CRITICAL: 4 };
    return (r[b.severity] || 0) - (r[a.severity] || 0);
  })[0];

  const title = `Yuri pulse · ${top.severity}`;
  const message = `${top.source}: ${top.finding.slice(0, 180)}`;
  const ts = new Date().toISOString();
  const line = `- ${ts} | ${top.severity} | ${top.source} | ${top.finding.slice(0, 240)} | turn=${plan.turn_id || ''}`;

  let notifyOk = false;
  let obsidianTarget = null;
  if (beaconLevel === 'notify' || beaconLevel === 'notify+obsidian') {
    notifyOk = await osascript(title, message);
  }
  if (beaconLevel === 'notify+obsidian') {
    obsidianTarget = await appendToObsidian(line);
  }

  state.count += 1;
  state.last_emit_ts = ts;
  state.emitted_ids = [...state.emitted_ids, top.id].slice(-50);
  writeJSON(BEACON_STATE, state);

  return {
    emitted: 1,
    finding_id: top.id,
    severity: top.severity,
    source: top.source,
    notifyOk,
    obsidianTarget,
    state,
  };
}

async function statusReport() {
  const state = await loadBeaconState();
  const plan = await readJSON(PLAN_PATH);
  return {
    state,
    plan_beacon_level: plan?.plan?.beaconLevel || plan?.beaconLevel || 'unknown',
    plan_turn_id: plan?.turn_id || null,
    obsidian_path: obsidianPath() || `(fallback: ${FALLBACK_VAULT_LOG})`,
  };
}

async function main() {
  const cmd = process.argv[2] || 'emit';
  let result;
  if (cmd === 'emit') result = await emit();
  else if (cmd === 'status') result = await statusReport();
  else if (cmd === 'reset') {
    writeJSON(BEACON_STATE, { session_id: await sessionId(), count: 0, last_emit_ts: null, emitted_ids: [] });
    result = { reset: true };
  } else {
    console.log('usage: pulse-beacon.mjs [emit|status|reset]');
    process.exit(1);
  }
  console.log(JSON.stringify(result, null, 2));
  process.exit(0);
}

main().catch((e) => {
  logError(`fatal: ${e.message}`);
  process.exit(0);
});
