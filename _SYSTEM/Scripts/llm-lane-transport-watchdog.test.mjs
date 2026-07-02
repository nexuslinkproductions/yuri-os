// Hermetic tests for the D-1 GLM/Anthropic transport timeout watchdog (llm-lane.mjs).
// Covers: idle-stall abort, absolute-cap abort, slow-drip survival, retry-wrapper retry count,
// salvage/forensics on kill, and _transportFail shape.
//
// Strategy: spin up a local HTTPS server (self-signed cert via openssl) that can:
//   (a) accept a connection and NEVER respond (stall -> idle watchdog fires),
//   (b) drip one byte every 5s (slow-drip -> idle watchdog must NOT fire within the budget),
//   (c) respond with a complete valid SSE stream (happy path -> success).
// The transport uses https.request; we point it at our local HTTPS endpoint with
// NODE_TLS_REJECT_UNAUTHORIZED=0 (process env, test-only) so the self-signed cert is accepted.
//
// D-1 fix, 2026-07-02. No live API calls. No external dependencies.
import test from 'node:test';
import assert from 'node:assert/strict';
import https from 'node:https';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { _postMessagesAnthropicHttpsOnce, postMessagesAnthropicHttps, _transportFail } from './llm-lane.mjs';

// Disable TLS cert verification for hermetic self-signed cert testing.
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

// ── Self-signed cert generation (openssl, available on macOS/Linux) ────────────────────────────
function makeSelfSignedCert() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'llm-lane-tls-'));
  const keyPath = path.join(dir, 'key.pem');
  const certPath = path.join(dir, 'cert.pem');
  try {
    execFileSync('openssl', [
      'req', '-x509', '-newkey', 'rsa:2048', '-keyout', keyPath, '-out', certPath,
      '-days', '1', '-nodes', '-subj', '/CN=localhost',
    ], { stdio: ['pipe', 'pipe', 'pipe'] });
  } catch (e) {
    // Fallback: if openssl is unavailable, skip cert-based tests gracefully.
    return null;
  }
  return { key: fs.readFileSync(keyPath, 'utf8'), cert: fs.readFileSync(certPath, 'utf8'), dir };
}

const TLS = makeSelfSignedCert();

// ── Test harness: create an HTTPS server with a configurable response strategy ─────────────────
/**
 * @param {'stall'|'drip'|'happy'|'partial-then-stall'} mode
 * @param {object} opts - { dripIntervalMs, dripBytes, happyText }
 * @returns {Promise<{server: https.Server, port: number, close: () => Promise<void>}>}
 */
function makeServer(mode, opts = {}) {
  return new Promise((resolve, reject) => {
    if (!TLS) { reject(new Error('no TLS cert (openssl unavailable)')); return; }
    const server = https.createServer({ key: TLS.key, cert: TLS.cert }, (req, res) => {
      // Drain the request body.
      req.on('data', () => {});
      req.on('end', () => {
        if (mode === 'stall') {
          // Accept the connection and NEVER respond. The idle watchdog must fire.
          // Do nothing — keep the socket open.
          return;
        }
        if (mode === 'drip') {
          // Send SSE headers, then drip bytes at the configured interval.
          res.writeHead(200, { 'Content-Type': 'text/event-stream' });
          // Send content_block_start first so the transport's SSE parser registers the block index.
          res.write('data: {"type":"content_block_start","index":0,"content_block":{"type":"text","text":""}}\n\n');
          const interval = opts.dripIntervalMs || 5000;
          const bytes = opts.dripBytes || 'data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"x"}}\n\n';
          const timer = setInterval(() => {
            try { res.write(bytes); } catch { clearInterval(timer); }
          }, interval);
          res.on('close', () => clearInterval(timer));
          return;
        }
        if (mode === 'partial-then-stall') {
          // Send some data, then stall forever — tests salvage of partial text.
          res.writeHead(200, { 'Content-Type': 'text/event-stream' });
          const partial = 'data: {"type":"content_block_start","index":0,"content_block":{"type":"text","text":""}}\n\n'
            + 'data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"SALVAGE_ME_PARTIAL"}}\n\n';
          res.write(partial);
          // Then stall — never send end. The idle watchdog fires and salvage captures SALVAGE_ME_PARTIAL.
          return;
        }
        if (mode === 'happy') {
          // Complete valid SSE stream.
          res.writeHead(200, { 'Content-Type': 'text/event-stream' });
          const events = [
            'data: {"type":"content_block_start","index":0,"content_block":{"type":"text","text":""}}\n\n',
            'data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"Hello world"}}\n\n',
            'data: {"type":"message_delta","delta":{"stop_reason":"end_turn"}}\n\n',
            'data: [DONE]\n\n',
          ];
          for (const e of events) res.write(e);
          res.end();
          return;
        }
      });
    });
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      resolve({
        server,
        port,
        close: () => new Promise((r) => server.close(() => r())),
      });
    });
  });
}

// ── Tests ───────────────────────────────────────────────────────────────────────────────────────

test('_transportFail returns a retryable shape (no .message, has .reason + .exitCode)', () => {
  const r = _transportFail('test-lane', 'idle_stall:120000ms', 1, 'partial text here');
  assert.equal(r.exitCode, 1);
  assert.equal(r.reason, 'idle_stall:120000ms');
  assert.equal(r.partialText, 'partial text here');
  assert.equal(r.salvaged, true);
  assert.equal(r.message, undefined, 'transport fail must NOT have .message (so retry wrapper treats it as retryable)');
});

test('_transportFail without partial text marks salvaged=false', () => {
  const r = _transportFail('test-lane', 'transport:ECONNRESET', 1);
  assert.equal(r.salvaged, false);
  assert.equal(r.partialText, '');
});

test('idle watchdog: stall server aborts within idle budget', { timeout: 30000 }, async () => {
  if (!TLS) { assert.skip('openssl unavailable — skipping HTTPS stall test'); return; }
  const srv = await makeServer('stall');
  try {
    const endpoint = `https://127.0.0.1:${srv.port}`;
    const idleMs = 3000; // 3s idle budget
    const capMs = 30000; // 30s absolute cap (shouldn't fire — idle fires first)
    const t0 = Date.now();
    const result = await _postMessagesAnthropicHttpsOnce(
      endpoint, 'test-key', 'test-model', [{ role: 'user', content: 'hi' }], 'sys', 1024, [], 'test-lane', 'bearer', capMs, idleMs,
    );
    const elapsed = Date.now() - t0;
    // Must abort within a reasonable window of the idle budget (not hang for 30+ min).
    assert.ok(elapsed < idleMs + 5000, `idle watchdog took too long: ${elapsed}ms (budget ${idleMs}ms)`);
    assert.ok(elapsed >= idleMs * 0.8, `idle watchdog fired too early: ${elapsed}ms (budget ${idleMs}ms)`);
    // Must be a transport failure (no .message).
    assert.equal(result.message, undefined, 'stall must resolve as transport failure, not success');
    assert.equal(result.exitCode, 1);
    assert.ok(result.reason.includes('idle_stall'), `reason should mention idle_stall: ${result.reason}`);
    assert.equal(result.watchdog, 'idle');
  } finally {
    await srv.close();
  }
});

test('cap watchdog: absolute cap fires even if idle keeps getting reset', { timeout: 30000 }, async () => {
  if (!TLS) { assert.skip('openssl unavailable — skipping HTTPS cap test'); return; }
  // Drip server with a SHORT drip interval (resets idle) but a TIGHT cap — cap must fire.
  const srv = await makeServer('drip', { dripIntervalMs: 500, dripBytes: 'data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"x"}}\n\n' });
  try {
    const endpoint = `https://127.0.0.1:${srv.port}`;
    const idleMs = 10000; // 10s idle (won't fire — drip resets it every 500ms)
    const capMs = 4000; // 4s absolute cap (fires first)
    const t0 = Date.now();
    const result = await _postMessagesAnthropicHttpsOnce(
      endpoint, 'test-key', 'test-model', [{ role: 'user', content: 'hi' }], 'sys', 1024, [], 'test-lane', 'bearer', capMs, idleMs,
    );
    const elapsed = Date.now() - t0;
    assert.ok(elapsed < capMs + 5000, `cap watchdog took too long: ${elapsed}ms (cap ${capMs}ms)`);
    assert.ok(elapsed >= capMs * 0.8, `cap watchdog fired too early: ${elapsed}ms (cap ${capMs}ms)`);
    assert.equal(result.message, undefined);
    assert.equal(result.exitCode, 1);
    assert.ok(result.reason.includes('cap_stall'), `reason should mention cap_stall: ${result.reason}`);
    assert.equal(result.watchdog, 'cap');
    // Salvage: the drip sent text deltas, so partial text should be non-empty.
    assert.ok(result.salvaged, 'cap kill on a drip stream should salvage partial text');
    assert.ok(result.partialText.includes('x'), `salvaged text should contain drip bytes: "${result.partialText.slice(0, 50)}"`);
  } finally {
    await srv.close();
  }
});

test('slow-drip server (byte every 5s) does NOT trip idle watchdog within budget', { timeout: 30000 }, async () => {
  if (!TLS) { assert.skip('openssl unavailable — skipping HTTPS drip test'); return; }
  // Drip every 2s, idle budget 5s. Idle resets on every chunk, so it should NOT fire.
  // The cap (8s) will eventually fire, proving the drip was alive (idle never killed it).
  const srv = await makeServer('drip', { dripIntervalMs: 2000, dripBytes: 'data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"y"}}\n\n' });
  try {
    const endpoint = `https://127.0.0.1:${srv.port}`;
    const idleMs = 5000; // 5s idle
    const capMs = 8000; // 8s cap — fires AFTER 3 drips (2s, 4s, 6s), proving idle never fired
    const result = await _postMessagesAnthropicHttpsOnce(
      endpoint, 'test-key', 'test-model', [{ role: 'user', content: 'hi' }], 'sys', 1024, [], 'test-lane', 'bearer', capMs, idleMs,
    );
    // The cap fired (not idle) — proving the drip kept the idle timer alive.
    assert.equal(result.watchdog, 'cap', 'slow-drip must be killed by cap, NOT idle — idle was reset by drip');
    assert.ok(result.salvaged, 'drip stream should have salvageable text');
    assert.ok(result.partialText.includes('y'), `salvaged drip text: "${result.partialText.slice(0, 50)}"`);
  } finally {
    await srv.close();
  }
});

test('salvage: partial-then-stall captures text emitted before the stall', { timeout: 30000 }, async () => {
  if (!TLS) { assert.skip('openssl unavailable — skipping HTTPS salvage test'); return; }
  const srv = await makeServer('partial-then-stall');
  try {
    const endpoint = `https://127.0.0.1:${srv.port}`;
    const idleMs = 3000;
    const capMs = 30000;
    const result = await _postMessagesAnthropicHttpsOnce(
      endpoint, 'test-key', 'test-model', [{ role: 'user', content: 'hi' }], 'sys', 1024, [], 'test-lane', 'bearer', capMs, idleMs,
    );
    assert.equal(result.message, undefined);
    assert.equal(result.watchdog, 'idle');
    assert.ok(result.salvaged, 'partial-then-stall must salvage the text sent before the stall');
    assert.ok(result.partialText.includes('SALVAGE_ME_PARTIAL'), `salvaged text must contain the pre-stall marker: "${result.partialText}"`);
  } finally {
    await srv.close();
  }
});

test('happy path: complete SSE stream resolves as success (.message present)', { timeout: 15000 }, async () => {
  if (!TLS) { assert.skip('openssl unavailable — skipping HTTPS happy-path test'); return; }
  const srv = await makeServer('happy');
  try {
    const endpoint = `https://127.0.0.1:${srv.port}`;
    const result = await _postMessagesAnthropicHttpsOnce(
      endpoint, 'test-key', 'test-model', [{ role: 'user', content: 'hi' }], 'sys', 1024, [], 'test-lane', 'bearer', 30000, 30000,
    );
    assert.ok(result.message, 'happy path must resolve with .message (success)');
    assert.equal(result.message.content, 'Hello world');
    // The transport passes through the SSE stop_reason; end_turn is the Anthropic convention.
    assert.equal(result.finish_reason, 'end_turn');
  } finally {
    await srv.close();
  }
});

test('retry wrapper fires 3 attempts on consecutive stalls, then returns transport fail', { timeout: 45000 }, async () => {
  if (!TLS) { assert.skip('openssl unavailable — skipping retry-wrapper test'); return; }
  const srv = await makeServer('stall');
  try {
    const endpoint = `https://127.0.0.1:${srv.port}`;
    // Tight idle budget so each attempt is fast; the wrapper retries 3x.
    const idleMs = 1500;
    const capMs = 30000;
    const t0 = Date.now();
    const result = await postMessagesAnthropicHttps(
      endpoint, 'test-key', 'test-model', [{ role: 'user', content: 'hi' }], 'sys', 1024, [], 'test-lane', 'bearer', capMs, idleMs,
    );
    const elapsed = Date.now() - t0;
    // 3 attempts × (1.5s idle + backoff) ≈ at least 3 × 1.5s = 4.5s minimum.
    assert.ok(elapsed >= 4000, `retry wrapper should have fired 3 attempts (took ${elapsed}ms — too fast for 3)`);
    // Final result is a transport failure (no .message).
    assert.equal(result.message, undefined);
    assert.equal(result.exitCode, 1);
  } finally {
    await srv.close();
  }
});
