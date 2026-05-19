import { existsSync, mkdirSync, renameSync, statSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

const REPO_ROOT = '/Users/marcelspatz/YURI-OS-MUSUBI';
const MONITORING_DIR = path.join(REPO_ROOT, '_SYSTEM', 'monitoring');
const OUTPUT_PATH = path.join(MONITORING_DIR, 'health.json');
const OUTPUT_TMP_PATH = `${OUTPUT_PATH}.tmp`;
const LAUNCH_AGENT_DIR = path.join('/Users/marcelspatz', 'Library', 'LaunchAgents');

const LAUNCH_AGENTS = [
  { label: 'com.yuri-os-musubi.eot-refresh', schedule: '2AM,8AM,2PM,8PM' },
  { label: 'com.yuri-os-musubi.gitnexus-weekly' },
  { label: 'com.yuri-os-musubi.independence-check-nightly' },
  { label: 'com.yuri-os-musubi.lane-health' },
  { label: 'com.yuri-os-musubi.launch-readiness-nightly' },
  { label: 'com.yuri-os-musubi.learning-score-weekly' },
  { label: 'com.yuri-os-musubi.neuron-loop' },
  { label: 'com.yuri-os-musubi.ollama-kv' },
  { label: 'com.yuri-os-musubi.palace-auto-rebuild' },
  { label: 'com.yuri-os-musubi.shellservice' },
  { label: 'com.yuri-os-musubi.task-queue-runner' },
  { label: 'com.yuri-os-musubi.wiki-rag' },
  { label: 'com.yuri-os-musubi.yuri-sentinel' },
  { label: 'com.yuri-os-musubi.yuri-session-runtime' },
  { label: 'com.yuri.kagami-heartbeat' },
  { label: 'com.yuri.kagami-memory-consolidator' },
  { label: 'com.yuri.kagami-session-synthesizer' },
  { label: 'com.yuri.kagami-stale-memory-scan' },
  { label: 'com.yuri.lane-memory-prune' },
];

const STATE_FILES = {
  'neuron-loop': '/Users/marcelspatz/YURI-OS-MUSUBI/.claude/state/neuron-loop.log',
  'yuri-sentinel': '/Users/marcelspatz/YURI-OS-MUSUBI/.claude/state/yuri-sentinel-state.json',
  'lane-health': '/Users/marcelspatz/YURI-OS-MUSUBI/.claude/state/lane-health-status.json',
  'launch-gate': '/Users/marcelspatz/YURI-OS-MUSUBI/.claude/state/launch-gate.json',
  'palace-rebuild': '/Users/marcelspatz/YURI-OS-MUSUBI/.claude/state/palace-rebuild.log',
  'lane-calibration': '/Users/marcelspatz/YURI-OS-MUSUBI/.claude/state/lane-calibration.json',
  'pulse-bus': '/Users/marcelspatz/YURI-OS-MUSUBI/.claude/state/pulse-bus.json',
  'task-queue': '/Users/marcelspatz/YURI-OS-MUSUBI/.claude/state/task-queue.log',
  'eot-refresh-err': '/Users/marcelspatz/YURI-OS-MUSUBI/.claude/state/eot-refresh.err.log',
  'session-state': '/Users/marcelspatz/YURI-OS-MUSUBI/.claude/state/session-state.json',
};

const HOOKS = {
  SessionStart: ['token-session-init', 'brain-inject', 'musubi-protocol-ingest', 'startup-offload', 'scout-orchestrator', 'eot-background-start', 'memory-archive'],
  UserPromptSubmit: ['user-prompt-submit'],
  SubagentStart: ['soul-persona-inject', 'yuri-sentinel-start'],
  PreToolUse: ['pre-tool-gate', 'bash-security-guard', 'tirith-url-guard', 'claude-protocol-guard', 'pre-tool-use', 'musubi-protocol-enforce', 'gitnexus-hook', 'agent-spawn-guard'],
  PostToolUse: ['post-tool-use', 'scout-orchestrator', 'token-tool-logger', 'session-checkpoint', 'gitnexus-hook'],
  Stop: ['yuri-sentinel-stop', 'token-session-end', 'memory-session-write'],
};

function run(command, args) {
  try {
    return execFileSync(command, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  } catch (error) {
    return error.stdout?.toString() || '';
  }
}

function parseNumberField(output, field) {
  const match = output.match(new RegExp(`"?${field}"?\\s*=\\s*(-?\\d+)`));
  return match ? Number(match[1]) : null;
}

function statusFor(pid, lastExitStatus) {
  if (pid !== null) return 'running';
  if (lastExitStatus === 0) return 'exited_ok';
  if (lastExitStatus === null) return 'never_run';
  return 'crashed';
}

function nameFromLabel(label) {
  return label
    .replace(/^com\.yuri-os-musubi\./, '')
    .replace(/^com\.yuri\./, '')
    .replace(/^com\./, '');
}

function readStartInterval(label) {
  const plistPath = path.join(LAUNCH_AGENT_DIR, `${label}.plist`);
  if (!existsSync(plistPath)) return null;
  const value = run('plutil', ['-extract', 'StartInterval', 'raw', plistPath]).trim();
  return /^\d+$/.test(value) ? Number(value) : null;
}

function freshnessFor(ageHours) {
  if (ageHours < 2) return 'fresh';
  if (ageHours < 24) return 'aging';
  if (ageHours < 72) return 'stale';
  return 'dead';
}

function readLaunchAgent(entry) {
  const output = run('launchctl', ['list', entry.label]);
  const pid = parseNumberField(output, 'PID');
  const lastExitStatus = parseNumberField(output, 'LastExitStatus');

  return {
    name: nameFromLabel(entry.label),
    label: entry.label,
    pid,
    last_exit_code: lastExitStatus,
    status: statusFor(pid, lastExitStatus),
    interval_seconds: readStartInterval(entry.label),
    schedule: entry.schedule || null,
  };
}

function readStateFile(filePath) {
  if (!existsSync(filePath)) {
    return {
      path: filePath,
      mtime_iso: null,
      age_hours: null,
      freshness: 'missing',
    };
  }

  const stats = statSync(filePath);
  const ageHours = (Date.now() - stats.mtimeMs) / 36e5;

  return {
    path: filePath,
    mtime_iso: stats.mtime.toISOString(),
    age_hours: Number(ageHours.toFixed(2)),
    freshness: freshnessFor(ageHours),
  };
}

function countHookScripts(hooksByPhase) {
  return Object.values(hooksByPhase).reduce((total, scripts) => total + scripts.length, 0);
}

function main() {
  const hooksByPhase = { ...HOOKS };
  const health = {
    generated_at: new Date().toISOString(),
    launchagents: LAUNCH_AGENTS.map(readLaunchAgent),
    state_files: Object.fromEntries(
      Object.entries(STATE_FILES).map(([name, filePath]) => [name, readStateFile(filePath)]),
    ),
    claude_hooks: {
      total_scripts: countHookScripts(hooksByPhase),
      hooks_by_phase: hooksByPhase,
    },
  };

  mkdirSync(MONITORING_DIR, { recursive: true });
  writeFileSync(OUTPUT_TMP_PATH, `${JSON.stringify(health, null, 2)}\n`);
  renameSync(OUTPUT_TMP_PATH, OUTPUT_PATH);
}

main();
