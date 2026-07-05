// Hermetic tests for screen-context.mjs (the A2 ScreenContextProvider). osascript is injected.
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { readActiveWindow, getActiveContext, needsVisionFallback, buildActionOsascript, buildJxaScript, executeAction, startServer, FALLBACK_OMNIPARSER } from './screen-context.mjs';

const FIXTURE_AX = JSON.stringify({
  app: 'Safari', pid: 123, bundleId: 'com.apple.Safari',
  window: { role: 'AXWindow', title: 'Test', children: [{ role: 'AXButton', title: 'Go', children: [] }] },
});

function runnerReturning(text) {
  return (script, cb) => cb(null, text);
}
function failingRunner() {
  return (script, cb) => cb(new Error('osascript failed'), '');
}

test('readActiveWindow: parses the JXA JSON output', async () => {
  const aw = await readActiveWindow({ runner: runnerReturning(FIXTURE_AX) });
  assert.equal(aw.app, 'Safari');
  assert.equal(aw.window.children[0].role, 'AXButton');
});

test('readActiveWindow: null on osascript failure / bad json', async () => {
  assert.equal(await readActiveWindow({ runner: failingRunner() }), null);
  assert.equal(await readActiveWindow({ runner: runnerReturning('not json') }), null);
});

test('buildJxaScript: references System Events + frontmost process', () => {
  const s = buildJxaScript();
  assert.match(s, /Application\("System Events"\)/);
  assert.match(s, /frontmost: true/);
});

test('needsVisionFallback: empty window / null → true; populated → false', () => {
  assert.equal(needsVisionFallback(null), true);
  assert.equal(needsVisionFallback({ window: null }), true);
  assert.equal(needsVisionFallback({ window: { children: [] } }), true);
  assert.equal(needsVisionFallback(JSON.parse(FIXTURE_AX)), false);
});

test('getActiveContext: populated AX → mode ax, no fallback', async () => {
  const ctx = await getActiveContext({ runner: runnerReturning(FIXTURE_AX) });
  assert.equal(ctx.mode, 'ax');
  assert.equal(ctx.fallback, 'none');
});

test('getActiveContext: empty AX → OmniParser fallback (stub)', async () => {
  const ctx = await getActiveContext({ runner: runnerReturning(JSON.stringify({ app: 'X', window: { children: [] } })) });
  assert.equal(ctx.mode, FALLBACK_OMNIPARSER);
  assert.equal(ctx.fallback.fallback, FALLBACK_OMNIPARSER);
});

test('buildActionOsascript: open_app / click_menu / type_field + unknown throws', () => {
  assert.match(buildActionOsascript({ type: 'open_app', app: 'Safari' }), /tell application "Safari" to activate/);
  assert.match(buildActionOsascript({ type: 'click_menu', app: 'Safari', menu_path: ['File', 'Save'] }), /click menu item "Save"/);
  assert.match(buildActionOsascript({ type: 'type_field', app: 'Safari', field_name: 'Search', text: 'hi' }), /keystroke "hi"/);
  assert.throws(() => buildActionOsascript({ type: 'bogus' }), /unknown action type/);
});

test('buildActionOsascript: escapes embedded double-quotes (injection guard)', () => {
  const s = buildActionOsascript({ type: 'open_app', app: 'Safari" to quit' });
  assert.doesNotMatch(s, /"Safari" to quit"/); // the injected quote is escaped, not raw
});

test('executeAction: open_app with mocked runner → ok', async () => {
  const r = await executeAction({ type: 'open_app', app: 'Safari' }, { runner: runnerReturning('') });
  assert.equal(r.ok, true);
  const bad = await executeAction({ type: 'bogus' }, { runner: runnerReturning('') });
  assert.equal(bad.ok, false);
});

test('startServer: /health + /context (mocked AX) + 404', async () => {
  const server = await startServer({ port: 0, runner: runnerReturning(FIXTURE_AX) });
  const port = server.address().port;
  const health = await get(`http://127.0.0.1:${port}/health`);
  assert.equal(health.ok, true);
  assert.equal(health.service, 'screen-context');
  const ctx = await post(`http://127.0.0.1:${port}/context`, '');
  assert.equal(ctx.mode, 'ax');
  const notfound = await get(`http://127.0.0.1:${port}/nope`, true);
  assert.equal(notfound, 404);
  server.close();
});

// tiny http helpers
function get(url, wantStatus = false) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      if (wantStatus) { res.resume(); resolve(res.statusCode); return; }
      let b = ''; res.on('data', (c) => (b += c)); res.on('end', () => resolve(JSON.parse(b)));
    }).on('error', reject);
  });
}
function post(url, body) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const req = http.request({ hostname: u.hostname, port: u.port, path: u.pathname, method: 'POST' }, (res) => {
      let b = ''; res.on('data', (c) => (b += c)); res.on('end', () => resolve(JSON.parse(b)));
    });
    req.on('error', reject); req.end(body);
  });
}
