#!/usr/bin/env node
// @capability: screen-context-provider
// @serves: macOS computer-use context | AX accessibility tree reader | ActiveWindow | OmniParser fallback host
// @does: the A2 ScreenContextProvider — reads the macOS accessibility tree via JXA (osascript -l JavaScript)
//        into a structured ActiveWindow JSON; falls back to OmniParser-v2 (screenshot->[{bbox,caption}]) when AX
//        returns empty (Electron/canvas). Exposes localhost HTTP :8015 — POST /context (read), POST /act (execute),
//        GET /health. Runs as a yuri-runtimed child (DISARMED by default).
// @use: `node screen-context.mjs serve` (needs YURI_SCREEN_CONTEXT_ARMED=1 to actually listen; else prints a plan).
// @exports: readActiveWindow, executeAction, buildJxaScript, FALLBACK_NONE, startServer

import http from 'node:http';
import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const DEFAULT_PORT = Number(process.env.YURI_SCREEN_CONTEXT_PORT) || 8015;
export const FALLBACK_NONE = 'none';
export const FALLBACK_OMNIPARSER = 'omniparser';

// ── the JXA that walks the frontmost app's AX tree ───────────────────────────
// Zero deps (ships with macOS). Returns ActiveWindow JSON. Needs Accessibility TCC
// (System Settings → Privacy & Security → Accessibility) for the calling process.
export function buildJxaScript({ maxDepth = 8 } = {}) {
  return `
var se = Application("System Events");
var front = se.processes.whose({frontmost: true})[0];
function walk(el, depth) {
  if (!el || depth > ${maxDepth}) return null;
  var o = { role: '', title: '', value: null, focused: false, enabled: true, pos: null, size: null, children: [] };
  try { o.role = el.role(); } catch (e) {}
  try { o.title = el.title(); } catch (e) {}
  try { o.value = el.value(); } catch (e) {}
  try { o.focused = el.focused(); } catch (e) {}
  try { o.enabled = el.enabled(); } catch (e) {}
  try { o.pos = el.position(); } catch (e) {}
  try { o.size = el.size(); } catch (e) {}
  try {
    var kids = el.uiElements();
    for (var i = 0; i < kids.length; i++) {
      var c = walk(kids[i], depth + 1);
      if (c) o.children.push(c);
    }
  } catch (e) {}
  return o;
}
var win = null; try { win = front.windows[0]; } catch (e) {}
JSON.stringify({ app: front.name(), pid: front.unixId(), bundleId: '', window: win ? walk(win, 0) : null });
`;
}

// Run osascript -l JavaScript with the JXA, return parsed JSON (or null on failure).
// `runner` is injectable for hermetic tests (defaults to real execFile).
export function readActiveWindow({ runner = defaultOsascriptRunner } = {}) {
  return new Promise((resolve) => {
    runner(buildJxaScript(), (err, stdout) => {
      if (err || !stdout) return resolve(null);
      try { resolve(JSON.parse(stdout.trim())); } catch { resolve(null); }
    });
  });
}

function defaultOsascriptRunner(script, cb) {
  execFile('osascript', ['-l', 'JavaScript', '-e', script], { timeout: 5000, maxBuffer: 8 * 1024 * 1024 }, cb);
}

// Decide if AX returned empty (frontmost app has no window / empty tree) → need vision fallback.
export function needsVisionFallback(activeWindow) {
  if (!activeWindow || !activeWindow.window) return true;
  const count = (function n(e) { return e ? 1 + (e.children || []).reduce((s, c) => s + n(c), 0) : 0; })(activeWindow.window);
  return count === 0;
}

// OmniParser-v2 fallback — STUB for A2.1. The real subprocess (microsoft/OmniParser-v2.0,
// YOLO icon_detect + Florence-2 icon_caption, spawn→infer→exit) lands in A2.3.
async function omniparserFallback() {
  return { fallback: FALLBACK_OMNIPARSER, status: 'not-yet-wired', note: 'A2.3 will spawn the OmniParser-v2 python sidecar' };
}

// Full context: AX primary, OmniParser fallback when empty.
export async function getActiveContext({ runner } = {}) {
  const ax = await readActiveWindow({ runner });
  if (!needsVisionFallback(ax)) return { mode: 'ax', activeWindow: ax, fallback: FALLBACK_NONE };
  const fb = await omniparserFallback();
  return { mode: FALLBACK_OMNIPARSER, activeWindow: ax, fallback: fb };
}

// ── executor (A2.1 minimal: open_app, click_menu, type_field) ────────────────
// Full executor (press_button/scroll/keystroke/verify) is A2.2.
export function buildActionOsascript(action) {
  switch (action.type) {
    case 'open_app':
      return `tell application "${escApple(action.app)}" to activate`;
    case 'click_menu':
      return `tell application "System Events"
  tell process "${escApple(action.app)}"
    tell menu bar 1
      ${((action.menu_path || []).map((m, i) =>
        i === 0
          ? `tell menu bar item "${escApple(m)}" to tell menu 1`
          : `tell menu item "${escApple(m)}"${i < (action.menu_path || []).length - 1 ? ' to tell menu 1' : ' to click'}`
      ).join('\n      '))}
    end tell
  end tell
end tell`;
    case 'type_field':
      return `tell application "System Events"
  tell process "${escApple(action.app)}"
    set focused of (first text field whose description is "${escApple(action.field_name)}") to true
    keystroke "${escApple(action.text || '')}"
  end tell
end tell`;
    default:
      throw new Error(`screen-context: unknown action type "${action.type}"`);
  }
}

function escApple(s) { return String(s == null ? '' : s).replaceAll('"', '\\"'); }

export function executeAction(action, { runner = defaultOsascriptRunner } = {}) {
  return new Promise((resolve) => {
    let script;
    try { script = buildActionOsascript(action); }
    catch (e) { return resolve({ ok: false, error: e.message }); }
    runner(script, (err, stdout, stderr) => {
      if (err) return resolve({ ok: false, error: String(stderr || err.message) });
      resolve({ ok: true });
    });
  });
}

// ── HTTP :8015 ───────────────────────────────────────────────────────────────
export function startServer({ port = DEFAULT_PORT, runner } = {}) {
  const server = http.createServer(async (req, res) => {
    res.setHeader('content-type', 'application/json');
    if (req.method === 'GET' && req.url === '/health') {
      res.end(JSON.stringify({ ok: true, service: 'screen-context', port }));
      return;
    }
    if (req.method === 'POST' && req.url === '/context') {
      const ctx = await getActiveContext({ runner });
      res.end(JSON.stringify(ctx));
      return;
    }
    if (req.method === 'POST' && req.url === '/act') {
      const body = await readBody(req);
      let action;
      try { action = JSON.parse(body); } catch { res.statusCode = 400; res.end(JSON.stringify({ ok: false, error: 'bad json' })); return; }
      const result = await executeAction(action, { runner });
      res.end(JSON.stringify(result));
      return;
    }
    res.statusCode = 404;
    res.end(JSON.stringify({ ok: false, error: 'not found' }));
  });
  return new Promise((resolve) => server.listen(port, '127.0.0.1', () => resolve(server)));
}

function readBody(req) {
  return new Promise((resolve) => { let b = ''; req.on('data', (c) => (b += c)); req.on('end', () => resolve(b)); });
}

// ── CLI ──────────────────────────────────────────────────────────────────────
const cmd = process.argv[2];
if (cmd === 'serve') {
  const armed = process.env.YURI_SCREEN_CONTEXT_ARMED === '1' || process.argv.includes('--arm');
  if (!armed) {
    console.log('screen-context: DISARMED. Set YURI_SCREEN_CONTEXT_ARMED=1 (or --arm) to listen on :' + DEFAULT_PORT);
    console.log('endpoints: GET /health · POST /context · POST /act');
    process.exit(0);
  }
  startServer().then((s) => {
    const addr = s.address();
    console.log(`[screen-context] listening 127.0.0.1:${addr.port} (AX-primary + OmniParser-fallback)`);
  });
} else if (cmd) {
  console.log(`screen-context — the A2 ScreenContextProvider (localhost :${DEFAULT_PORT})
  node screen-context.mjs serve [--arm]   # serve (DISARMED unless --arm / YURI_SCREEN_CONTEXT_ARMED=1)
  GET /health · POST /context · POST /act`);
} else if (process.argv[1] && import.meta.url === fileURLToPath(process.argv[1]).href) {
  console.log('Use: node screen-context.mjs serve [--arm]');
}
