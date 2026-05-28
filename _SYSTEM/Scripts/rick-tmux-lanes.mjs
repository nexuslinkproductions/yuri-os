#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import process from 'node:process';
import {
  RICK_TMUX_DEFAULTS,
  resolveRickRosterAlias,
  rickTmuxLaneConfig,
} from './lane-persona-map.mjs';

const DEFAULT_SESSION = process.env.YURI_RICKS_TMUX_SESSION || RICK_TMUX_DEFAULTS.session;
const BUFFER_NAME = process.env.YURI_RICKS_TMUX_BUFFER || RICK_TMUX_DEFAULTS.bufferName;
const MAX_PROMPT_CHARS = 120_000;
const LANES = rickTmuxLaneConfig(process.env);

const options = parseArgs(process.argv.slice(2));

try {
  if (options.command === 'status') printJson(status());
  else if (options.command === 'capture') printJson(capture(options.lane, options.lines));
  else if (options.command === 'feed') printJson(feed(options.lane, options.prompt, { execute: options.execute }));
  else usage(1);
} catch (error) {
  printJson({ ok: false, error: error.message || String(error) });
  process.exit(1);
}

export function status() {
  const session = options.session || DEFAULT_SESSION;
  const out = {
    ok: false,
    session,
    hasTmux: hasTmux(),
    hasSession: false,
    lanes: {},
  };
  if (!out.hasTmux) return out;
  out.hasSession = hasSession(session);
  if (!out.hasSession) return out;

  for (const lane of Object.keys(LANES)) {
    out.lanes[lane] = paneInfo(lane, session);
  }
  out.ok = Object.values(out.lanes).every((entry) => entry.ok);
  return out;
}

export function capture(laneName, lines = 120) {
  const lane = resolveLane(laneName);
  const session = options.session || DEFAULT_SESSION;
  assertReady(session);
  const target = paneTarget(lane, session);
  const normalizedLines = Math.max(20, Math.min(Number(lines) || 120, 1000));
  const text = execFileSync(
    'tmux',
    ['capture-pane', '-t', target, '-p', '-S', `-${normalizedLines}`],
    { encoding: 'utf8', maxBuffer: 4 * 1024 * 1024 },
  );
  return { ok: true, lane, target, lines: normalizedLines, text };
}

export function feed(laneName, prompt, { execute = false } = {}) {
  const lane = resolveLane(laneName);
  const session = options.session || DEFAULT_SESSION;
  if (!prompt) throw new Error('missing --prompt text');
  const payload = String(prompt).slice(0, MAX_PROMPT_CHARS);
  const target = paneTarget(lane, session);

  if (!execute) {
    return {
      ok: true,
      dryRun: true,
      lane,
      target,
      promptChars: payload.length,
      note: 'Add --execute to paste into the live Rick pane.',
    };
  }

  assertReady(session);
  execFileSync('tmux', ['set-buffer', '-b', BUFFER_NAME, payload], { maxBuffer: 16 * 1024 * 1024 });
  execFileSync('tmux', ['paste-buffer', '-t', target, '-d', '-b', BUFFER_NAME]);
  execFileSync('tmux', ['send-keys', '-t', target, 'Enter']);
  return { ok: true, dryRun: false, lane, target, promptChars: payload.length };
}

function paneInfo(lane, session) {
  const target = paneTarget(lane, session);
  try {
    const raw = execFileSync(
      'tmux',
      ['display-message', '-p', '-t', target, '#{pane_current_command}\n#{pane_current_path}\n#{pane_title}'],
      { encoding: 'utf8', maxBuffer: 128 * 1024 },
    ).trimEnd();
    const [currentCommand = '', currentPath = '', title = ''] = raw.split('\n');
    return { ok: true, lane, target, currentCommand, currentPath, title };
  } catch (error) {
    return { ok: false, lane, target, error: error.message || String(error) };
  }
}

function assertReady(session) {
  if (!hasTmux()) throw new Error('tmux not installed');
  if (!hasSession(session)) throw new Error(`tmux session not running: ${session}`);
}

function hasTmux() {
  try {
    execFileSync('tmux', ['-V'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

function hasSession(session) {
  try {
    execFileSync('tmux', ['has-session', '-t', session], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

function paneTarget(lane, session = DEFAULT_SESSION) {
  const config = LANES[lane];
  return `${session}:${config.window}.${config.pane}`;
}

function resolveLane(input) {
  const value = String(input || '').toLowerCase();
  if (LANES[value]) return value;
  const rosterEntry = resolveRickRosterAlias(value);
  if (rosterEntry?.tmux?.lane && LANES[rosterEntry.tmux.lane]) return rosterEntry.tmux.lane;
  throw new Error(`unknown Rick lane: ${input || '(missing)'}`);
}

function parseArgs(args) {
  const out = {
    command: args[0] || '',
    lane: '',
    prompt: '',
    lines: 120,
    execute: false,
    session: '',
  };
  let i = 1;
  if (out.command === 'capture' || out.command === 'feed') out.lane = args[i++] || '';
  for (; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === '--prompt' && args[i + 1]) out.prompt = args[++i];
    else if (arg === '--lines' && args[i + 1]) out.lines = Number(args[++i]);
    else if (arg === '--session' && args[i + 1]) out.session = args[++i];
    else if (arg === '--execute') out.execute = true;
    else if (arg === '--dry-run') out.execute = false;
    else if (arg === '--help' || arg === '-h') usage(0);
    else throw new Error(`unknown argument: ${arg}`);
  }
  return out;
}

function usage(code) {
  const text = `Usage:
  node _SYSTEM/Scripts/rick-tmux-lanes.mjs status
  node _SYSTEM/Scripts/rick-tmux-lanes.mjs capture <quantum|prime> [--lines 120]
  node _SYSTEM/Scripts/rick-tmux-lanes.mjs feed <quantum|prime> --prompt "<packet>" [--execute]

Defaults:
  session: ${DEFAULT_SESSION}
  panes: quantum=${LANES.quantum.window}.${LANES.quantum.pane}, prime=${LANES.prime.window}.${LANES.prime.pane}
`;
  (code === 0 ? process.stdout : process.stderr).write(text);
  process.exit(code);
}

function printJson(value) {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}
