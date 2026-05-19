import { createServer, request as httpRequest } from 'node:http';
import { existsSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

const HTTP_PORT = 4242;
const HTML_PATH = new URL('./automation-command-center.html', import.meta.url);
const REPO_ROOT = '/Users/marcelspatz/YURI-OS-MUSUBI';
const MONITORING_DIR = path.join(REPO_ROOT, '_SYSTEM', 'monitoring');
const OUTPUT_PATH = path.join(MONITORING_DIR, 'health.json');
const OUTPUT_TMP_PATH = `${OUTPUT_PATH}.tmp`;
const LAUNCH_AGENT_DIR = path.join('/Users/marcelspatz', 'Library', 'LaunchAgents');

let cachedHealthJson = '{"error":"not yet generated"}';

const healthServer = createServer((req, res) => {
  const url = req.url?.split('?')[0] ?? '/';
  if (url === '/health.json') {
    res.writeHead(200, {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'no-cache',
    });
    res.end(cachedHealthJson);
  } else if (url === '/' || url === '/automation-command-center.html') {
    try {
      const html = readFileSync(HTML_PATH, 'utf8');
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(html);
    } catch {
      res.writeHead(404);
      res.end('Not found');
    }
  } else {
    res.writeHead(404);
    res.end('Not found');
  }
});

healthServer.on('error', (error) => {
  console.error(`[health-aggregator] HTTP server unavailable: ${error.code || error.message}`);
});

healthServer.listen(HTTP_PORT, '127.0.0.1', () => {
  console.log(`[health-aggregator] HTTP server on http://localhost:${HTTP_PORT}`);
});

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
  { label: 'com.yuri.health-aggregator', schedule: 'every 60s' },
];

const STATE_FILES = {
  'neuron-loop': '/Users/marcelspatz/YURI-OS-MUSUBI/.claude/state/neuron-loop.log',
  'yuri-sentinel': '/Users/marcelspatz/YURI-OS-MUSUBI/.claude/state/yuri-sentinel-state.json',
  'lane-health': '/Users/marcelspatz/YURI-OS-MUSUBI/.claude/state/lane-health-status.json',
  'launch-gate': '/Users/marcelspatz/YURI-OS-MUSUBI/.claude/state/launch-gate.json',
  'palace-rebuild': '/Users/marcelspatz/YURI-OS-MUSUBI/.claude/state/palace-rebuild.log',
  'lane-calibration': '/Users/marcelspatz/YURI-OS-MUSUBI/.claude/state/lane-calibration.json',
  'pulse-bus': '/Users/marcelspatz/YURI-OS-MUSUBI/.claude/state/pulse-bus.jsonl',
  'lane-feedback': '/Users/marcelspatz/YURI-OS-MUSUBI/.claude/state/lane-feedback.jsonl',
  'task-queue': '/Users/marcelspatz/YURI-OS-MUSUBI/.claude/state/task-queue.log',
  'scout-errors': '/Users/marcelspatz/YURI-OS-MUSUBI/.claude/state/scout-errors.log',
  'eot-refresh-out': '/Users/marcelspatz/YURI-OS-MUSUBI/.claude/state/eot-refresh.out.log',
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

const SESSION_BUFFER_PATH = path.join(
  '/Users/marcelspatz',
  '.claude/projects/-Users-marcelspatz-YURI-OS-MUSUBI/memory/session-buffer.json',
);
const WORKER_REGISTRY_PATH = path.join(REPO_ROOT, '_SYSTEM/Scripts/worker-tmux-registry.json');
const SYNTHESIS_PATH = path.join(REPO_ROOT, '.claude/yuri-sentinel/learning/synthesis.json');

function countHookScripts(hooksByPhase) {
  return Object.values(hooksByPhase).reduce((total, scripts) => total + scripts.length, 0);
}

function probeHttp(port, urlPath, timeoutMs = 3000) {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve({ ok: false, status: null, error: 'timeout' }), timeoutMs);
    const req = httpRequest({ hostname: '127.0.0.1', port, path: urlPath, method: 'GET' }, (res) => {
      clearTimeout(timer);
      res.resume();
      resolve({ ok: res.statusCode >= 200 && res.statusCode < 300, status: res.statusCode });
    });
    req.on('error', (e) => { clearTimeout(timer); resolve({ ok: false, status: null, error: e.code }); });
    req.end();
  });
}

async function readServiceStatus() {
  const [backend, openclaw] = await Promise.all([
    probeHttp(3004, '/api/health'),
    probeHttp(18789, '/health'),
  ]);

  const dreamSynthesis = existsSync(SYNTHESIS_PATH)
    ? (() => { const s = statSync(SYNTHESIS_PATH); return { mtime_iso: s.mtime.toISOString(), age_hours: Number(((Date.now() - s.mtimeMs) / 36e5).toFixed(2)) }; })()
    : null;

  const workerBridge = existsSync(WORKER_REGISTRY_PATH)
    ? (() => { const s = statSync(WORKER_REGISTRY_PATH); return { exists: true, mtime_iso: s.mtime.toISOString() }; })()
    : { exists: false };

  const sessionBuffer = existsSync(SESSION_BUFFER_PATH)
    ? (() => { const s = statSync(SESSION_BUFFER_PATH); return { exists: true, mtime_iso: s.mtime.toISOString(), age_hours: Number(((Date.now() - s.mtimeMs) / 36e5).toFixed(2)) }; })()
    : { exists: false };

  return { backend, openclaw, dream_synthesis: dreamSynthesis, worker_bridge: workerBridge, session_buffer: sessionBuffer };
}

async function main() {
  const hooksByPhase = { ...HOOKS };
  const launchagents = LAUNCH_AGENTS.map(readLaunchAgent);
  const result = {
    generated_at: new Date().toISOString(),
    launchagents,
    state_files: Object.fromEntries(
      Object.entries(STATE_FILES).map(([name, filePath]) => [name, readStateFile(filePath)]),
    ),
    claude_hooks: {
      total_scripts: countHookScripts(hooksByPhase),
      hooks_by_phase: hooksByPhase,
    },
  };
  result.services = {
    backend: { status: launchagents.some((l) => l.label.startsWith('com.yuri.kagami') && l.status === 'running') ? 'ok' : 'fail' },
    openclaw: { status: launchagents.find((l) => l.label === 'com.yuri.openclaw')?.status === 'running' ? 'ok' : 'fail' },
    dream_synthesis: { status: existsSync(path.join(REPO_ROOT, '.claude/yuri-sentinel/learning/synthesis.json')) ? 'ok' : 'fail' },
    worker_bridge: { status: existsSync(path.join(REPO_ROOT, '_SYSTEM/Scripts/worker-bridge.mjs')) ? 'ok' : 'fail' },
    session_buffer: { status: existsSync(path.join('/Users/marcelspatz', '.claude/projects/-Users-marcelspatz-YURI-OS-MUSUBI/memory/session-buffer.json')) ? 'ok' : 'fail' },
  };

  mkdirSync(MONITORING_DIR, { recursive: true });
  const healthJson = `${JSON.stringify(result, null, 2)}\n`;
  writeFileSync(OUTPUT_TMP_PATH, healthJson);
  renameSync(OUTPUT_TMP_PATH, OUTPUT_PATH);
  cachedHealthJson = healthJson;
}

main();
setInterval(main, 60000);
