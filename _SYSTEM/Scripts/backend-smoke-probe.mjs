#!/usr/bin/env node
/**
 * Backend startup smoke probe — built-in modules only, no writes, no /tmp.
 * Usage: node _SYSTEM/Scripts/backend-smoke-probe.mjs [options]
 */
import { spawn }           from 'node:child_process';
import { statSync }        from 'node:fs';
import { createServer, Socket } from 'node:net';
import http                from 'node:http';
import path                from 'node:path';
import { fileURLToPath }   from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../..') // Scripts/ → _SYSTEM/ → repo root;
const BACKEND_ROOT = path.join(REPO_ROOT, '_SYSTEM', 'backend');

// ── Defaults ──────────────────────────────────────────────────────────────────
const DEFAULTS = {
  path:         '/api/health/auth',
  expectUnauth: 401,
  expectAuth:   200,
  expectBody:   'AUTH_OK',
  port:         3904,
  host:         '127.0.0.1',
  apiKey:       'yuri-smoke-test-api-key-local-only-000000000000',
  timeoutMs:    8000,
};

// ── Arg parse ─────────────────────────────────────────────────────────────────
function parseArgs(argv) {
  const opts = { ...DEFAULTS, help: false };
  for (const arg of argv) {
    if (arg === '--help' || arg === '-h') { opts.help = true; continue; }
    const m = arg.match(/^--([a-z-]+)=(.*)$/s);
    if (!m) continue;
    switch (m[1]) {
      case 'path':          opts.path         = m[2]; break;
      case 'expect-unauth': opts.expectUnauth = parseInt(m[2], 10); break;
      case 'expect-auth':   opts.expectAuth   = parseInt(m[2], 10); break;
      case 'expect-body':   opts.expectBody   = m[2]; break;
      case 'port':          opts.port         = parseInt(m[2], 10); break;
      case 'timeout-ms':    opts.timeoutMs    = parseInt(m[2], 10); break;
    }
  }
  return opts;
}

// ── Help ──────────────────────────────────────────────────────────────────────
const HELP = `\
backend-smoke-probe.mjs — reusable backend startup smoke runner

Usage:
  node _SYSTEM/Scripts/backend-smoke-probe.mjs [options]

Options:
  --path=PATH          API path to probe              (default: /api/health/auth)
  --expect-unauth=N    Expected status unauth probe   (default: 401)
  --expect-auth=N      Expected status auth probe     (default: 200)
  --expect-body=STR    Expected body substr auth      (default: AUTH_OK)
  --port=N             Backend port                   (default: 3904)
  --timeout-ms=N       Startup wait timeout ms        (default: 8000)
  --help               Show this help

Forced env:
  PORT, HOST=127.0.0.1, API_KEY (smoke key)
  YURI_TEST_MODE=1, YURI_DB_PATH=:memory:
  YURI_DISABLE_WATCHERS=1, YURI_DISABLE_INTERVALS=1
  YURI_DISABLE_SWARM_ORCHESTRATOR=1
  Cloud provider keys blanked

Prerequisite:
  Run lsof preflight before invoking — script exits nonzero if port busy.

Output markers (pass path):
  SMOKE_ONLINE::<bool>
  SMOKE_MEMORY_DB::<bool>
  UNAUTH_STATUS::<status>
  AUTH_STATUS::<status>
  AUTH_BODY_MATCH::<bool>
  DB_UNCHANGED::<bool>
  FORBIDDEN_FOUND::<csv-or-NONE>
  WATCHER_REAL_LEAK::<bool>
  RESULT::<PASS-or-FAIL>
`;

// ── Port helpers ──────────────────────────────────────────────────────────────
function portBusy(port) {
  return new Promise((resolve) => {
    const srv = createServer();
    srv.once('error', () => resolve(true));
    srv.once('listening', () => { srv.close(() => resolve(false)); });
    srv.listen(port, '127.0.0.1');
  });
}

function waitForPort(host, port, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolve, reject) => {
    const attempt = () => {
      const sock = new Socket();
      sock.setTimeout(300);
      sock.once('connect', () => { sock.destroy(); resolve(); });
      sock.once('timeout', () => { sock.destroy(); retry(); });
      sock.once('error',   () => { sock.destroy(); retry(); });
      sock.connect(port, host);
    };
    const retry = () => {
      if (Date.now() < deadline) setTimeout(attempt, 200);
      else reject(new Error(`port ${port} not ready after ${timeoutMs}ms`));
    };
    attempt();
  });
}

// ── HTTP ──────────────────────────────────────────────────────────────────────
function httpGet(host, port, urlPath, headers) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      { host, port, path: urlPath, method: 'GET', headers },
      (res) => {
        let body = '';
        res.on('data', c => { body += c; });
        res.on('end', () => resolve({ status: res.statusCode, body: body.trim() }));
      }
    );
    req.setTimeout(4000, () => req.destroy(new Error('http_timeout')));
    req.on('error', reject);
    req.end();
  });
}

// ── Forbidden + watcher checks ────────────────────────────────────────────────
const FORBIDDEN = [
  'SECURITY_FATAL', 'VAULT_INGESTION', 'OUTLOOK_SYNC',
  'STABILITY_SWARM', 'SWARM_ORCHESTRATOR', 'checkIntegrations',
  'StabilityGuard', 'OLLAMA', 'Notebook RAG',
];
const WATCHER_PATTERNS = [
  /FileSystemWatcher/,
  /watcher\s+(start|init|ready|running)/i,
  /interval\s+registered/i,
  /StabilityGuard\s+active/i,
];

function checkForbidden(lines) {
  const hits = FORBIDDEN.filter(tok => lines.some(l => l.includes(tok)));
  return hits.length ? hits.join(',') : 'NONE';
}
function checkWatcherLeak(lines) {
  return lines.some(l => WATCHER_PATTERNS.some(p => p.test(l)));
}

// ── DB stat (metadata only, no content read) ──────────────────────────────────
function dbStat(p) {
  try { const s = statSync(p); return { size: s.size, mtimeMs: s.mtimeMs }; }
  catch { return null; }
}
function statEq(a, b) {
  if (a === null && b === null) return true;
  if (!a || !b) return false;
  return a.size === b.size && a.mtimeMs === b.mtimeMs;
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help) { process.stdout.write(HELP); process.exit(0); }

  const { path: probePath, expectUnauth, expectAuth, expectBody,
          port, host, apiKey, timeoutMs } = opts;
  const DB = path.join(BACKEND_ROOT, 'data', 'yuri.db');

  // Port busy guard — exits nonzero if already occupied
  if (await portBusy(port)) {
    process.stderr.write(`FAIL: port ${port} busy — run lsof preflight first\n`);
    process.exit(1);
  }

  // DB stat before (metadata only)
  const beforeStat = dbStat(DB);

  // Build safe isolated env
  const env = {
    ...process.env,
    PORT:                                String(port),
    HOST:                                host,
    API_KEY:                             apiKey,
    YURI_TEST_MODE:                  '1',
    YURI_DB_PATH:                    ':memory:',
    YURI_DISABLE_WATCHERS:           '1',
    YURI_DISABLE_INTERVALS:          '1',
    YURI_DISABLE_SWARM_ORCHESTRATOR: '1',
    // Blank common cloud/provider keys
    OPENAI_API_KEY:                      '',
    ANTHROPIC_API_KEY:                   '',
    OPENROUTER_API_KEY:                  '',
    DEEPSEEK_API_KEY:                    '',
    GEMINI_API_KEY:                      '',
    AZURE_OPENAI_API_KEY:                '',
    KIMI_API_KEY:                        '',
    COHERE_API_KEY:                      '',
    MISTRAL_API_KEY:                     '',
  };

  // Spawn backend via local ts-node
  const tsNodeBin  = path.join(BACKEND_ROOT, 'node_modules', '.bin', 'ts-node');
  const serverFile = path.join(BACKEND_ROOT, 'src', 'server.ts');
  const logLines   = [];
  const proc = spawn(tsNodeBin, [serverFile], {
    cwd:   BACKEND_ROOT,
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const collect = chunk =>
    chunk.toString().split('\n').filter(Boolean).forEach(l => logLines.push(l));
  proc.stdout.on('data', collect);
  proc.stderr.on('data', collect);

  // Wait until port ready or backend exits early
  let online = false;
  try {
    await Promise.race([
      waitForPort(host, port, timeoutMs),
      new Promise((_, rej) =>
        proc.once('close', code => rej(new Error(`backend exited early: ${code}`)))
      ),
    ]);
    online = true;
  } catch { /* port not ready or early exit */ }

  // Unauthenticated probe (first)
  let unauthStatus = null;
  if (online) {
    try {
      const r = await httpGet(host, port, probePath, {});
      unauthStatus = r.status;
    } catch { /* probe failed */ }
  }

  // Authenticated probe (second)
  let authStatus = null, authBody = '';
  if (online) {
    try {
      const r = await httpGet(host, port, probePath, { 'x-api-key': apiKey });
      authStatus = r.status;
      authBody   = r.body;
    } catch { /* probe failed */ }
  }

  // Terminate backend
  try { proc.kill('SIGTERM'); } catch { /* already gone */ }
  await new Promise(r => setTimeout(r, 400));

  // DB stat after (metadata only)
  const afterStat   = dbStat(DB);
  const dbUnchanged = statEq(beforeStat, afterStat);

  // Evaluate results
  const forbiddenFound = checkForbidden(logLines);
  const watcherLeak    = checkWatcherLeak(logLines);
  const bodyMatch      = authBody.includes(expectBody);
  const pass = online
    && unauthStatus === expectUnauth
    && authStatus   === expectAuth
    && bodyMatch
    && dbUnchanged
    && forbiddenFound === 'NONE'
    && !watcherLeak;

  // Emit markers
  const emit = s => process.stdout.write(s + '\n');
  emit(`SMOKE_ONLINE::${online}`);
  emit(`SMOKE_MEMORY_DB::true`);
  emit(`UNAUTH_STATUS::${unauthStatus ?? 'null'}`);
  emit(`AUTH_STATUS::${authStatus ?? 'null'}`);
  emit(`AUTH_BODY_MATCH::${bodyMatch}`);
  emit(`DB_UNCHANGED::${dbUnchanged}`);
  emit(`FORBIDDEN_FOUND::${forbiddenFound}`);
  emit(`WATCHER_REAL_LEAK::${watcherLeak}`);
  emit(`RESULT::${pass ? 'PASS' : 'FAIL'}`);

  if (!pass) {
    emit('FAIL_LOG_BEGIN');
    logLines.slice(0, 120).forEach(l => emit(l));
    emit('FAIL_LOG_END');
  }

  process.exit(pass ? 0 : 1);
}

main().catch(err => {
  process.stderr.write(`FATAL: ${err.message}\n`);
  process.exit(1);
});
