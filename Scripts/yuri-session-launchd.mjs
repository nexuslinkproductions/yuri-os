#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const LABEL = 'com.nudimmud.yuri-session-runtime';
const HOME = os.homedir();
const LAUNCH_AGENTS_DIR = path.join(HOME, 'Library/LaunchAgents');
const LOG_DIR = path.join(HOME, 'Library/Logs/NUDIMMUD');
const PLIST_PATH = path.join(LAUNCH_AGENTS_DIR, `${LABEL}.plist`);
const OUT_LOG = path.join(LOG_DIR, 'yuri-session-runtime.out.log');
const ERR_LOG = path.join(LOG_DIR, 'yuri-session-runtime.err.log');
const mode = process.argv[2] ?? 'help';

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
  const preferred = resolveBinaryDir('npm');
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
    `/bin/${name}`,
  );
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return path.dirname(candidate);
  }
  return '/usr/bin';
}

function resolveNpmBinary() {
  const candidates = [];
  if (process.env.PATH) {
    for (const dir of process.env.PATH.split(path.delimiter)) {
      candidates.push(path.join(dir, 'npm'));
    }
  }
  candidates.push('/opt/homebrew/bin/npm', '/usr/local/bin/npm', '/usr/bin/npm', '/bin/npm');
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  throw new Error('Unable to resolve npm binary path');
}

function renderPlist() {
  const env = {
    PATH: buildLaunchPath(),
    NUDIMMUD_SESSION_RUNTIME_ENABLED: '1',
    NUDIMMUD_SESSION_RUNTIME_COMMAND: 'npm --prefix backend run dev',
  };
  const envXml = Object.entries(env)
    .map(([key, value]) => `\n    <key>${plistEscape(key)}</key>\n    <string>${plistEscape(value)}</string>`)
    .join('');

  return `<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">\n<plist version="1.0">\n  <dict>\n    <key>Label</key>\n    <string>${plistEscape(LABEL)}</string>\n    <key>RunAtLoad</key>\n    <true/>\n    <key>KeepAlive</key>\n    <true/>\n    <key>ThrottleInterval</key>\n    <integer>5</integer>\n    <key>Umask</key>\n    <integer>63</integer>\n    <key>ProgramArguments</key>\n    <array>\n      <string>${plistEscape(process.execPath)}</string>\n      <string>${plistEscape(path.join(REPO_ROOT, 'Scripts/yuri-session-launchd.mjs'))}</string>\n      <string>run</string>\n    </array>\n    <key>WorkingDirectory</key>\n    <string>${plistEscape(REPO_ROOT)}</string>\n    <key>StandardOutPath</key>\n    <string>${plistEscape(OUT_LOG)}</string>\n    <key>StandardErrorPath</key>\n    <string>${plistEscape(ERR_LOG)}</string>\n    <key>EnvironmentVariables</key>\n    <dict>${envXml}\n    </dict>\n  </dict>\n</plist>\n`;
}

function launchctl(args, allowFailure = false) {
  const result = spawnSync('launchctl', args, { stdio: 'inherit' });
  if (!allowFailure && result.status !== 0) {
    throw new Error(`launchctl ${args.join(' ')} failed with code ${result.status ?? 1}`);
  }
}

function ensureDirs() {
  fs.mkdirSync(LAUNCH_AGENTS_DIR, { recursive: true });
  fs.mkdirSync(LOG_DIR, { recursive: true });
}

function writePlist() {
  ensureDirs();
  fs.writeFileSync(PLIST_PATH, renderPlist(), 'utf8');
}

function install() {
  if (process.platform !== 'darwin') {
    throw new Error('launchd install is only supported on macOS');
  }
  writePlist();
  const uid = typeof process.getuid === 'function' ? process.getuid() : os.userInfo().uid;
  launchctl(['enable', `gui/${uid}/${LABEL}`], true);
  try {
    launchctl(['bootstrap', `gui/${uid}`, PLIST_PATH]);
  } catch {
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
  const npmBinary = resolveNpmBinary();
  const env = {
    ...process.env,
    PATH: buildLaunchPath(),
    NUDIMMUD_SESSION_RUNTIME_ENABLED: '1',
    NUDIMMUD_SESSION_RUNTIME_COMMAND: 'npm --prefix backend run dev',
  };

  console.log(`[yuri-session-launchd] launching ${npmBinary} --prefix backend run dev`);
  const child = spawn(npmBinary, ['--prefix', 'backend', 'run', 'dev'], {
    cwd: REPO_ROOT,
    stdio: 'inherit',
    env,
  });

  child.on('exit', (code, signal) => {
    if (signal) {
      console.error(`[yuri-session-launchd] backend stopped by signal ${signal}`);
      process.exit(1);
      return;
    }
    process.exit(code ?? 0);
  });
}

function help() {
  console.log([
    'Usage:',
    '  node Scripts/yuri-session-launchd.mjs install',
    '  node Scripts/yuri-session-launchd.mjs uninstall',
    '  node Scripts/yuri-session-launchd.mjs status',
    '  node Scripts/yuri-session-launchd.mjs restart',
    '  node Scripts/yuri-session-launchd.mjs print-plist',
    '  node Scripts/yuri-session-launchd.mjs run',
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
    case 'print-plist':
      process.stdout.write(renderPlist());
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
