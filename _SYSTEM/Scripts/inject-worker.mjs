#!/usr/bin/env node
// @capability: overseer-inject-worker
// @serves: instruct the worker session | overseer dispatch | send prompt to worker tab | drive worker by cli | hand the worker a task
// @does: resolves the worker Claude sessionId (explicit > worker.id file > newest active non-overseer transcript) and POSTs a prompt to the yuri-overseer extension on 127.0.0.1:7771, which reveals the worker tab + pastes (+submits).
// @use: from the overseer session, `node _SYSTEM/Scripts/inject-worker.mjs "<prompt>"` to hand the worker an instruction. --no-submit pastes without sending; --session <id> targets explicitly; --sessions lists the window's tabs; --verify reads the worker transcript tail to confirm the prompt landed.
// @exports: chooseWorker, recentSessions, projectDirFor, slugifyRepo
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '..', '..');
const STATE = path.join(REPO, '_SYSTEM', 'state', 'lane-sessions');
const PROJECTS = path.join(os.homedir(), '.claude', 'projects');
const PORT = Number(process.env.YURI_OVERSEER_PORT) || 7771;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ── pure / testable helpers ───────────────────────────────────────────────
export function slugifyRepo(repo) {
  // Claude Code stores transcripts under ~/.claude/projects/<slug>/ where slug is the
  // repo path with every "/" (and "." in some versions) turned into "-".
  return repo.replace(/[/.]/g, '-');
}

export function projectDirFor(repo, projectsRoot) {
  return path.join(projectsRoot, slugifyRepo(repo));
}

export function recentSessions(dir, { now = Date.now(), maxAgeMs = 30 * 60 * 1000, fsImpl = fs } = {}) {
  let entries = [];
  try {
    entries = fsImpl.readdirSync(dir)
      .filter((f) => f.endsWith('.jsonl') && UUID_RE.test(f.replace(/\.jsonl$/, '')))
      .map((f) => ({ id: f.replace(/\.jsonl$/, ''), mtime: fsImpl.statSync(path.join(dir, f)).mtimeMs }))
      .filter((s) => now - s.mtime <= maxAgeMs)
      .sort((a, b) => b.mtime - a.mtime);
  } catch (_) {}
  return entries;
}

// Resolution order: explicit flag > worker.id file > newest active transcript that is not the overseer.
export function chooseWorker({ explicit, workerIdFile, overseerId, sessions }) {
  if (explicit && explicit.trim()) return explicit.trim();
  if (workerIdFile && workerIdFile.trim()) return workerIdFile.trim();
  const cand = (sessions || []).find((s) => s.id && s.id !== overseerId);
  return cand ? cand.id : '';
}

// ── runtime glue ──────────────────────────────────────────────────────────
function readStateFile(name) {
  try { return fs.readFileSync(path.join(STATE, name), 'utf8').trim(); } catch (_) { return ''; }
}

function resolveWorkerRuntime(explicit) {
  const overseerId = readStateFile('overseer.id') || process.env.CLAUDE_SESSION_ID || '';
  const sessions = recentSessions(projectDirFor(REPO, PROJECTS));
  return chooseWorker({ explicit, workerIdFile: readStateFile('worker.id'), overseerId, sessions });
}

function request(method, pathname, body) {
  const token = readStateFile('overseer-token');
  const data = body ? Buffer.from(JSON.stringify(body)) : null;
  return new Promise((resolve, reject) => {
    const req = http.request({
      host: '127.0.0.1', port: PORT, path: pathname, method,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
        ...(data ? { 'Content-Length': data.length } : {}),
      },
    }, (res) => {
      let b = '';
      res.on('data', (c) => (b += c));
      res.on('end', () => { let j; try { j = JSON.parse(b); } catch (_) { j = b; } resolve({ status: res.statusCode, body: j }); });
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

// Optional spoken confirmation of the dispatch (overseer-narrates-only). Stays SILENT while
// voice is paused (tts.paused) or VOICE_OVERSEER_CONFIRM=0 — so it's quiet during voice-control focus.
function speak(text) {
  try {
    if (process.env.VOICE_OVERSEER_CONFIRM === '0') return;
    if (fs.existsSync(path.join(REPO, '_SYSTEM', 'state', 'voice', 'tts.paused'))) return;
    const sh = path.join(REPO, '_SYSTEM', 'Scripts', 'voice-speak.sh');
    if (!fs.existsSync(sh)) return;
    const c = spawn('bash', [sh], { stdio: ['pipe', 'ignore', 'ignore'], detached: true });
    c.stdin.write(text); c.stdin.end(); c.unref();
  } catch (_) {}
}

// Closed-loop check: the injected prompt should appear as a user message in the worker's
// transcript (--replay-user-messages is on). Returns true if a recent line contains it.
function verifyLanded(workerId, prompt) {
  try {
    const tpath = path.join(projectDirFor(REPO, PROJECTS), `${workerId}.jsonl`);
    const raw = fs.readFileSync(tpath, 'utf8').trim().split('\n');
    const needle = prompt.slice(0, 60);
    for (let i = raw.length - 1; i >= 0 && i >= raw.length - 12; i--) {
      if (raw[i] && raw[i].includes(needle)) return true;
    }
  } catch (_) {}
  return false;
}

function parseArgs(argv) {
  const o = { submit: true, sessions: false, verify: false, session: '', prompt: '' };
  const rest = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--no-submit') o.submit = false;
    else if (a === '--sessions') o.sessions = true;
    else if (a === '--verify') o.verify = true;
    else if (a === '--session') o.session = argv[++i] || '';
    else rest.push(a);
  }
  o.prompt = rest.join(' ').trim();
  return o;
}

async function main() {
  const o = parseArgs(process.argv.slice(2));

  // health first — a clear message beats an ECONNREFUSED stack if the extension isn't loaded.
  try { await request('GET', '/health'); }
  catch (_) {
    console.error(`✗ overseer bridge not reachable on 127.0.0.1:${PORT}. Is the yuri-overseer extension installed + VS Code reloaded?`);
    process.exit(2);
  }

  if (o.sessions) {
    const r = await request('GET', '/sessions');
    console.log(JSON.stringify(r.body, null, 2));
    process.exit(r.status === 200 ? 0 : 1);
  }

  if (!o.prompt) {
    console.error('usage: inject-worker.mjs [--session <id>] [--no-submit] [--verify] "<prompt>"   |   inject-worker.mjs --sessions');
    process.exit(64);
  }

  const workerId = resolveWorkerRuntime(o.session);
  if (!workerId) {
    console.error('✗ could not resolve a worker session. Pass --session <uuid>, or write _SYSTEM/state/lane-sessions/worker.id. (--sessions lists the window tabs.)');
    process.exit(3);
  }

  const r = await request('POST', '/inject', { sessionId: workerId, prompt: o.prompt, submit: o.submit });
  const b = r.body || {};
  if (r.status === 200 && b.ok) {
    const verb = o.submit ? (b.submitted ? 'sent' : 'pasted (Return not confirmed)') : 'pasted (held, not sent)';
    console.log(`✓ ${verb} → worker ${workerId} [tab "${b.activeLabel}"] seq=${b.seq} hash=${b.promptHash}`);
    if (o.verify) {
      await new Promise((res) => setTimeout(res, 700));
      console.log(verifyLanded(workerId, o.prompt) ? '✓ verify: prompt found in worker transcript' : '⚠ verify: prompt not yet visible in worker transcript (may still be rendering)');
    }
    speak(`Sent to the worker: ${o.prompt.slice(0, 80)}`);
    process.exit(0);
  }
  console.error(`✗ inject failed (HTTP ${r.status}): ${JSON.stringify(b)}`);
  process.exit(1);
}

// run only when invoked directly (so tests can import the pure helpers)
const invokedDirectly = (() => {
  try { return process.argv[1] && fs.realpathSync(process.argv[1]) === fileURLToPath(import.meta.url); }
  catch (_) { return false; }
})();
if (invokedDirectly) main().catch((e) => { console.error('✗', e && e.message ? e.message : e); process.exit(1); });
