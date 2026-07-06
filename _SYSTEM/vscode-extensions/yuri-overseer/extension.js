'use strict';
/**
 * YURI Overseer — VS Code companion extension (Phase 2 of the voice-overseer plan).
 *
 * ONLY job: give the overseer Claude session (which can only call Bash) a safe,
 * deterministic channel into the WORKER Claude tab in the same VS Code window.
 *
 *   POST /inject {sessionId, prompt, submit?}  → reveal that session's tab, CONFIRM a
 *        Claude webview is the active tab (never blind-paste), focus its input, paste the
 *        prompt via osascript scoped to process "Code", optionally press Return.
 *   GET  /sessions   → list this window's editor tabs (debug: which tab is which).
 *   GET  /health     → liveness.
 *
 * Security: 127.0.0.1-only bind + per-process bearer token (0600 file) + Origin/Host
 * allow-list — the proven yuri-control-server.mjs pattern (see auth.cjs).
 *
 * The extension stays DUMB: it does not resolve which session is the worker. The CLI
 * (_SYSTEM/Scripts/inject-worker.mjs) owns resolution and passes an explicit sessionId.
 */
const vscode = require('vscode');
const http = require('node:http');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { execFile } = require('node:child_process');
const { localOriginOk, authed } = require('./auth.cjs');

const HOST = '127.0.0.1';
const PORT = Number(process.env.YURI_OVERSEER_PORT) || 7771;

let server = null;
let TOKEN = null;
let stateDir = null;
let tokenPath = null;
let ledgerPath = null;
let out = null;
let seq = 0;
let injectChain = Promise.resolve(); // mutex: serialize concurrent injects

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function log(msg) { try { out && out.appendLine(`[${new Date().toISOString()}] ${msg}`); } catch (_) {} }

function repoRoot() {
  const ws = vscode.workspace.workspaceFolders;
  if (ws && ws[0]) return ws[0].uri.fsPath;
  return process.env.YURI_REPO_ROOT || process.cwd();
}

// osascript helper: resolves true on exit 0. Controlling app = Code.app, so macOS
// Automation/Accessibility permission for "Code" controlling "System Events" is required
// (one-time grant on first run).
function osascript(script) {
  return new Promise((resolve) => {
    execFile('/usr/bin/osascript', ['-e', script], { timeout: 6000 }, (err) => resolve(!err));
  });
}

function activeTab() {
  try {
    const g = vscode.window.tabGroups.activeTabGroup;
    return (g && g.activeTab) || null;
  } catch (_) { return null; }
}
function isWebviewTab(tab) {
  try { return Boolean(tab) && tab.input instanceof vscode.TabInputWebview; } catch (_) { return false; }
}

async function doInject(sessionId, prompt, submit) {
  const mySeq = ++seq;
  // 1. reveal the target session's tab (throws if the sessionId has no open panel).
  try {
    await vscode.commands.executeCommand('claude-vscode.editor.open', sessionId);
  } catch (e) {
    log(`inject seq=${mySeq} reveal FAILED for ${sessionId}: ${e && e.message}`);
    return { ok: false, seq: mySeq, reason: 'reveal-failed', error: String((e && e.message) || e) };
  }
  await sleep(300);

  // 2. CONFIRM a Claude webview is now the active tab — never blind-paste into a code editor.
  const at = activeTab();
  if (!isWebviewTab(at)) {
    log(`inject seq=${mySeq} ABORT: active tab is not a Claude webview (label="${at ? at.label : 'none'}")`);
    return {
      ok: false, seq: mySeq, activeTabConfirmed: false, reason: 'no-webview-active',
      activeLabel: at ? at.label : null,
      error: 'active tab is not a Claude webview after reveal (aborted to avoid wrong-panel paste)',
    };
  }

  // 3. focus the Claude input (best-effort — focuses the now-active panel's input box).
  try { await vscode.commands.executeCommand('claude-vscode.focus'); } catch (e) { log(`focus best-effort failed: ${e && e.message}`); }
  await sleep(140);

  // 4. clipboard: save prior, write prompt.
  let prior = '';
  try { prior = await vscode.env.clipboard.readText(); } catch (_) {}
  await vscode.env.clipboard.writeText(prompt);
  await sleep(70);

  // 5. select-all existing input (Cmd-A) so the paste REPLACES any leftover text instead of
  //    appending, then paste (Cmd-V), then optionally submit (Return). Scoped to process "Code".
  await osascript('tell application "System Events" to tell process "Code" to keystroke "a" using command down');
  await sleep(40);
  const pasteOk = await osascript('tell application "System Events" to tell process "Code" to keystroke "v" using command down');
  let submitted = false;
  if (submit && pasteOk) {
    await sleep(Math.min(90 + prompt.length * 2, 800));
    submitted = await osascript('tell application "System Events" to tell process "Code" to key code 36');
  }

  // 6. restore clipboard.
  await sleep(140);
  try { await vscode.env.clipboard.writeText(prior); } catch (_) {}

  // 7. ledger (closed-loop: promptHash lets the CLI verify the worker transcript got it).
  const promptHash = crypto.createHash('sha256').update(prompt).digest('hex').slice(0, 16);
  const rec = { ts: new Date().toISOString(), seq: mySeq, sessionId, promptHash, len: prompt.length, submit, pasteOk, submitted, activeLabel: at.label };
  try { fs.appendFileSync(ledgerPath, JSON.stringify(rec) + '\n'); } catch (e) { log(`ledger append failed: ${e && e.message}`); }
  log(`inject seq=${mySeq} session=${sessionId} pasteOk=${pasteOk} submitted=${submitted} label="${at.label}" hash=${promptHash}`);

  return { ok: pasteOk, seq: mySeq, activeTabConfirmed: true, submitted, promptHash, activeLabel: at.label };
}

function readBody(req) {
  return new Promise((resolve) => {
    let b = '';
    req.on('data', (c) => { b += c; if (b.length > 1e6) req.destroy(); });
    req.on('end', () => resolve(b));
    req.on('error', () => resolve(''));
  });
}

async function handler(req, res) {
  const send = (code, obj) => {
    try { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(obj)); } catch (_) {}
  };
  try {
    if (!localOriginOk(req, HOST, PORT)) return send(403, { ok: false, error: 'bad origin/host' });
    const url = new URL(req.url, `http://${HOST}:${PORT}`);

    if (req.method === 'GET' && url.pathname === '/health') {
      return send(200, { ok: true, port: PORT, repo: repoRoot() });
    }

    if (req.method === 'GET' && url.pathname === '/sessions') {
      if (!authed(req, TOKEN)) return send(401, { ok: false, error: 'unauthorized' });
      const tabs = [];
      try {
        for (const g of vscode.window.tabGroups.all) {
          for (const t of g.tabs) {
            const web = isWebviewTab(t);
            tabs.push({ label: t.label, active: Boolean(t.isActive), column: g.viewColumn, webview: web, viewType: web ? t.input.viewType : null });
          }
        }
      } catch (e) { return send(500, { ok: false, error: String((e && e.message) || e) }); }
      return send(200, { ok: true, tabs });
    }

    if (req.method === 'POST' && url.pathname === '/inject') {
      if (!authed(req, TOKEN)) return send(401, { ok: false, error: 'unauthorized' });
      let body;
      try { body = JSON.parse((await readBody(req)) || '{}'); } catch (_) { return send(400, { ok: false, error: 'bad json' }); }
      const sessionId = String((body && body.sessionId) || '').trim();
      const prompt = body && typeof body.prompt === 'string' ? body.prompt : '';
      const submit = !(body && body.submit === false); // default true
      if (!sessionId) return send(400, { ok: false, error: 'sessionId required' });
      if (!prompt.trim()) return send(400, { ok: false, error: 'prompt required' });
      const result = await (injectChain = injectChain
        .then(() => doInject(sessionId, prompt, submit))
        .catch((e) => ({ ok: false, error: String((e && e.message) || e) })));
      return send(result.ok ? 200 : 409, result);
    }

    return send(404, { ok: false, error: 'not found' });
  } catch (e) {
    return send(500, { ok: false, error: String((e && e.message) || e) });
  }
}

function activate(context) {
  out = vscode.window.createOutputChannel('YURI Overseer');
  const repo = repoRoot();
  stateDir = path.join(repo, '_SYSTEM', 'state', 'lane-sessions');
  tokenPath = path.join(stateDir, 'overseer-token');
  ledgerPath = path.join(stateDir, 'dispatch-ledger.jsonl');
  try { fs.mkdirSync(stateDir, { recursive: true }); } catch (_) {}

  TOKEN = process.env.YURI_OVERSEER_TOKEN || crypto.randomBytes(24).toString('hex');
  try {
    fs.writeFileSync(tokenPath, TOKEN, { mode: 0o600 });
    fs.chmodSync(tokenPath, 0o600);
  } catch (e) { log(`token write failed: ${e && e.message}`); }

  server = http.createServer(handler);
  server.on('error', (e) => log(`server error: ${e && e.message}`));
  server.listen(PORT, HOST, () => log(`YURI Overseer listening on http://${HOST}:${PORT} (repo: ${repo})`));

  const sb = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  sb.text = '$(broadcast) overseer';
  sb.tooltip = `YURI Overseer bridge :${PORT}`;
  sb.show();

  context.subscriptions.push(
    { dispose() { try { server && server.close(); } catch (_) {} } },
    sb,
    out,
  );
}

function deactivate() { try { server && server.close(); } catch (_) {} }

module.exports = { activate, deactivate };
