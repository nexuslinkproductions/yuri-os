#!/usr/bin/env node

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const LABEL = 'com.yuri.ollama-kv';
const HOME = os.homedir();
const LAUNCH_AGENTS_DIR = path.join(HOME, 'Library/LaunchAgents');
const LOG_DIR = path.join(HOME, 'Library/Logs/YURI');
const PLIST_PATH = path.join(LAUNCH_AGENTS_DIR, `${LABEL}.plist`);
const OUT_LOG = path.join(LOG_DIR, 'ollama-kv-launchd.out.log');
const ERR_LOG = path.join(LOG_DIR, 'ollama-kv-launchd.err.log');
const APPLY_SCRIPT = path.join(REPO_ROOT, '_SYSTEM/Scripts/ollama-kv-config.mjs');
const APPLY_ARGS = ['apply', '--restart'];

const mode = process.argv[2] || 'help';

function plistEscape(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

function buildLaunchPath() {
  const current = process.env.PATH ? process.env.PATH.split(path.delimiter) : [];
  const preferred = resolveBinaryDir('node');
  const merged = [preferred, ...current].filter(Boolean);
  return Array.from(new Set(merged)).join(path.delimiter);
}

function resolveBinaryDir(name) {
  const candidates = [];
  if (process.env.PATH) {
    for (const dir of process.env.PATH.split(path.delimiter)) {
      candidates.push(path.join(dir, name));
    }
  }
  candidates.push(
    `/opt/homebrew/bin/${name}`,
    `/usr/local/bin/${name}`,
    `/usr/bin/${name}`,
    `/bin/${name}`
  );
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return path.dirname(candidate);
  }
  return '/usr/bin';
}

function renderPlist() {
  return `<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">\n<plist version="1.0">\n  <dict>\n    <key>Label</key>\n    <string>${plistEscape(LABEL)}</string>\n    <key>RunAtLoad</key>\n    <true/>\n    <key>ThrottleInterval</key>\n    <integer>1</integer>\n    <key>ProgramArguments</key>\n    <array>\n      <string>${plistEscape(process.execPath)}</string>\n      <string>${plistEscape(path.join(REPO_ROOT, '_SYSTEM/Scripts/ollama-kv-launchd.mjs'))}</string>\n      <string>run</string>\n    </array>\n    <key>WorkingDirectory</key>\n    <string>${plistEscape(REPO_ROOT)}</string>\n    <key>StandardOutPath</key>\n    <string>${plistEscape(OUT_LOG)}</string>\n    <key>StandardErrorPath</key>\n    <string>${plistEscape(ERR_LOG)}</string>\n    <key>EnvironmentVariables</key>\n    <dict>\n      <key>PATH</key>\n      <string>${plistEscape(buildLaunchPath())}</string>\n    </dict>\n  </dict>\n</plist>\n`;
}

function ensureDirs() {
  fs.mkdirSync(LAUNCH_AGENTS_DIR, { recursive: true });
  fs.mkdirSync(LOG_DIR, { recursive: true });
}

function launchctl(args, allowFailure = false) {
  const result = spawnSync('launchctl', args, { stdio: 'inherit' });
  if (!allowFailure && result.status !== 0) {
    throw new Error(`launchctl ${args.join(' ')} failed with code ${result.status ?? 1}`);
  }
}

function install() {
  if (process.platform !== 'darwin') {
    throw new Error('launchd install is only supported on macOS');
  }
  ensureDirs();
  fs.writeFileSync(PLIST_PATH, renderPlist(), 'utf8');
  const uid = typeof process.getuid === 'function' ? process.getuid() : os.userInfo().uid;
  launchctl(['enable', `gui/${uid}/${LABEL}`], true);
  try {
    launchctl(['bootstrap', `gui/${uid}`, PLIST_PATH]);
  } catch (error) {
    launchctl(['remove', LABEL], true);
    launchctl(['bootstrap', `gui/${uid}`, PLIST_PATH]);
  }
  console.log(`installed ${LABEL} -> ${PLIST_PATH}`);
}

function uninstall() {
  if (process.platform !== 'darwin') {
    throw new Error('launchd uninstall is only supported on macOS');
  }
  const uid = typeof process.getuid === 'function' ? process.getuid() : os.userInfo().uid;
  launchctl(['disable', `gui/${uid}/${LABEL}`], true);
  launchctl(['remove', LABEL], true);
  if (fs.existsSync(PLIST_PATH)) fs.rmSync(PLIST_PATH);
  console.log(`removed ${LABEL}`);
}

function status() {
  if (process.platform !== 'darwin') {
    throw new Error('launchd status is only supported on macOS');
  }
  const uid = typeof process.getuid === 'function' ? process.getuid() : os.userInfo().uid;
  const result = spawnSync('launchctl', ['print', `gui/${uid}/${LABEL}`], { stdio: 'inherit' });
  process.exit(result.status ?? 0);
}

function restart() {
  if (process.platform !== 'darwin') {
    throw new Error('launchd restart is only supported on macOS');
  }
  const uid = typeof process.getuid === 'function' ? process.getuid() : os.userInfo().uid;
  launchctl(['kickstart', '-k', `gui/${uid}/${LABEL}`]);
  console.log(`restarted ${LABEL}`);
}

function run() {
  const child = spawn(process.execPath, [APPLY_SCRIPT, ...APPLY_ARGS], {
    cwd: REPO_ROOT,
    stdio: 'inherit',
    env: {
      ...process.env,
      PATH: buildLaunchPath()
    }
  });

  child.on('exit', code => {
    process.exit(code ?? 1);
  });
}

function help() {
  console.log([
    'Usage:',
    '  node _SYSTEM/Scripts/ollama-kv-launchd.mjs install',
    '  node _SYSTEM/Scripts/ollama-kv-launchd.mjs uninstall',
    '  node _SYSTEM/Scripts/ollama-kv-launchd.mjs status',
    '  node _SYSTEM/Scripts/ollama-kv-launchd.mjs restart',
    '  node _SYSTEM/Scripts/ollama-kv-launchd.mjs run'
  ].join('\n'));
}

try {
  switch (mode) {
    case 'install':
      install();
      break;
    case 'uninstall':
      uninstall();
      break;
    case 'status':
      status();
      break;
    case 'restart':
      restart();
      break;
    case 'run':
      run();
      break;
    default:
      help();
      process.exit(mode === 'help' ? 0 : 1);
  }
} catch (error) {
  const message = error instanceof Error ? error.stack || error.message : String(error);
  console.error(message);
  process.exit(1);
}
