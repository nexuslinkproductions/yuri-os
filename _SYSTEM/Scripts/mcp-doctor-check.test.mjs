#!/usr/bin/env node
// @does: Focused tests for the MCP health probe and doctor MCP section.
// Tests: pass, fail, timeout, malformed protocol, redaction, unchecked inventory.
// Run: node _SYSTEM/Scripts/mcp-doctor-check.test.mjs

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import { probeStdioServer, redactSecrets } from './mcp-health-probe.mjs';
import { classifyMcpServer, checkMcpHealth } from './yuri-doctor.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mcp-doctor-test-'));
let passed = 0;

function mockServer(code) {
  const file = path.join(tmpDir, `mock-${Date.now()}-${Math.random().toString(36).slice(2)}.mjs`);
  fs.writeFileSync(file, code);
  return file;
}

function ok(label) {
  passed++;
  console.log(`  ${label}`);
}

// ── 1. PROBE PASS (content-length framing) ───────────────────────────────────
{
  const server = mockServer(`
    let buf = Buffer.alloc(0);
    process.stdin.on('data', (chunk) => {
      buf = Buffer.concat([buf, chunk]);
      while (true) {
        const he = buf.indexOf('\\r\\n\\r\\n');
        if (he === -1) break;
        const hdr = buf.subarray(0, he).toString('utf8');
        const m = hdr.match(/Content-Length:\\s*(\\d+)/i);
        if (!m) break;
        const len = Number(m[1]);
        const bs = he + 4;
        const be = bs + len;
        if (buf.length < be) break;
        const msg = JSON.parse(buf.subarray(bs, be).toString('utf8'));
        buf = buf.subarray(be);
        if (msg.method === 'initialize') {
          send({ jsonrpc:'2.0', id:msg.id, result:{ protocolVersion:'2024-11-05', capabilities:{}, serverInfo:{ name:'mock-cl', version:'1.0.0' } } });
        }
        if (msg.method === 'tools/list') {
          send({ jsonrpc:'2.0', id:msg.id, result:{ tools:[{ name:'tool_a' },{ name:'tool_b' }] } });
        }
      }
    });
    function send(msg) {
      const body = Buffer.from(JSON.stringify(msg));
      process.stdout.write('Content-Length: ' + body.length + '\\r\\n\\r\\n');
      process.stdout.write(body);
    }
  `);
  const r = await probeStdioServer({ command: process.execPath, args: [server], timeoutMs: 5000 });
  assert.equal(r.status, 'PASS', `expected PASS got ${r.status}: ${r.error}`);
  assert.deepEqual(r.tools, ['tool_a', 'tool_b']);
  ok('probe PASS (content-length): tools=[' + r.tools.join(',') + ']');
}

// ── 2. PROBE PASS (newline framing) ──────────────────────────────────────────
{
  const server = mockServer(`
    let buf = '';
    process.stdin.on('data', (chunk) => {
      buf += chunk.toString('utf8');
      const lines = buf.split('\\n');
      buf = lines.pop();
      for (const line of lines) {
        if (!line.trim()) continue;
        const msg = JSON.parse(line);
        if (msg.method === 'initialize') {
          send({ jsonrpc:'2.0', id:msg.id, result:{ protocolVersion:'2024-11-05', capabilities:{}, serverInfo:{ name:'mock-nl', version:'1.0.0' } } });
        }
        if (msg.method === 'tools/list') {
          send({ jsonrpc:'2.0', id:msg.id, result:{ tools:[{ name:'nl_tool' }] } });
        }
      }
    });
    function send(msg) {
      process.stdout.write(JSON.stringify(msg) + '\\n');
    }
  `);
  const r = await probeStdioServer({ command: process.execPath, args: [server], framing: 'newline', timeoutMs: 5000 });
  assert.equal(r.status, 'PASS', `expected PASS got ${r.status}: ${r.error}`);
  assert.deepEqual(r.tools, ['nl_tool']);
  ok('probe PASS (newline): tools=[' + r.tools.join(',') + ']');
}

// ── 3. PROBE FAIL (server exits with error) ──────────────────────────────────
{
  const server = mockServer(`process.stderr.write('fatal: cannot start\\n'); process.exit(1);`);
  const r = await probeStdioServer({ command: process.execPath, args: [server], timeoutMs: 5000 });
  assert.equal(r.status, 'FAIL', `expected FAIL got ${r.status}`);
  assert.ok(r.error, 'FAIL should have error message');
  assert.ok(r.error.includes('exited'), `error should mention exit: ${r.error}`);
  ok('probe FAIL (exit): ' + r.error.slice(0, 60));
}

// ── 4. PROBE TIMEOUT (server hangs) ──────────────────────────────────────────
{
  const server = mockServer(`setInterval(() => {}, 1000);`);
  const r = await probeStdioServer({ command: process.execPath, args: [server], timeoutMs: 1200 });
  assert.equal(r.status, 'TIMEOUT', `expected TIMEOUT got ${r.status}`);
  assert.ok(r.error.includes('timed out'), `error should mention timeout: ${r.error}`);
  ok('probe TIMEOUT: ' + r.error);
}

// ── 5. PROBE MALFORMED (garbage protocol) ────────────────────────────────────
{
  const server = mockServer(`process.stdout.write('Content-Length: 5\\r\\n\\r\\nNOTJSON');`);
  const r = await probeStdioServer({ command: process.execPath, args: [server], timeoutMs: 5000 });
  assert.equal(r.status, 'FAIL', `expected FAIL got ${r.status}`);
  assert.ok(r.error.includes('protocol') || r.error.includes('parse'), `expected protocol/parse error: ${r.error}`);
  ok('probe MALFORMED: ' + r.error.slice(0, 60));
}

// ── 6. REDACTION (credential-safe output) ────────────────────────────────────
{
  // GitHub PAT
  assert.equal(
    redactSecrets('error: ' + 'ghp_' + 'TESTONLYNOTAREALGITHUBPAT12345678900 connection refused'),
    'error: ghp_<REDACTED> connection refused',
  );
  // Bearer token
  assert.equal(
    redactSecrets('Authorization: Bearer test-bearer-token-NOT-REAL'),
    'Authorization: Bearer <REDACTED>',
  );
  // Protected path — .claude/state/
  const redactedPath = redactSecrets('recent: /Users/marcelspatz/.claude/state/runtime/heartbeat.json');
  assert.ok(!redactedPath.includes('.claude/state/runtime'), `protected path leaked: ${redactedPath}`);
  assert.ok(redactedPath.includes('<REDACTED>'), `redaction marker missing: ${redactedPath}`);
  // api_key= value
  assert.equal(
    redactSecrets('config api_key=sk-TESTONLYNOTREALKEY123456 invalid'),
    'config api_key=<REDACTED> invalid',
  );
  // .env reference
  assert.ok(redactSecrets('loaded from .env file').includes('<REDACTED>'));
  ok('redaction: ghp_, Bearer, .claude/state/, api_key=, .env all redacted');
}

// ── 7. UNCHECKED INVENTORY (classification) ──────────────────────────────────
{
  // npx → UNVERIFIED
  assert.equal(
    classifyMcpServer({ command: 'npx', args: ['-y', '@modelcontextprotocol/server-github'] }).action,
    'UNVERIFIED',
  );
  // HTTP/SSE transport → UNVERIFIED
  assert.equal(
    classifyMcpServer({ transport: 'http', hasUrl: true }).action,
    'UNVERIFIED',
  );
  // has env → UNVERIFIED
  assert.equal(
    classifyMcpServer({ command: 'node', args: ['server.js'], hasEnv: true }).action,
    'UNVERIFIED',
  );
  // non-node → UNVERIFIED
  assert.equal(
    classifyMcpServer({ command: '/usr/bin/python3', args: ['server.py'] }).action,
    'UNVERIFIED',
  );
  // missing script → UNVERIFIED
  assert.equal(
    classifyMcpServer({ command: 'node', args: ['nonexistent.mjs'] }).action,
    'UNVERIFIED',
  );
  // non-JS script → UNVERIFIED
  const pyFile = path.join(tmpDir, 'mock.py');
  fs.writeFileSync(pyFile, '');
  assert.equal(
    classifyMcpServer({ command: 'node', args: [pyFile] }).action,
    'UNVERIFIED',
  );
  // repo-owned node .mjs → PROBE
  const mockFile = mockServer('process.exit(0);');
  assert.equal(
    classifyMcpServer({ command: 'node', args: [mockFile] }).action,
    'PROBE',
  );
  ok('classification: npx, HTTP/SSE, env, non-node, missing, non-JS → UNVERIFIED; repo .mjs → PROBE');
}

// ── 8. INTEGRATION (checkMcpHealth with mock config) ─────────────────────────
{
  // Create a passing mock server
  const passingServer = mockServer(`
    let buf = Buffer.alloc(0);
    process.stdin.on('data', (chunk) => {
      buf = Buffer.concat([buf, chunk]);
      while (true) {
        const he = buf.indexOf('\\r\\n\\r\\n');
        if (he === -1) break;
        const hdr = buf.subarray(0, he).toString('utf8');
        const m = hdr.match(/Content-Length:\\s*(\\d+)/i);
        if (!m) break;
        const len = Number(m[1]);
        const bs = he + 4;
        const be = bs + len;
        if (buf.length < be) break;
        const msg = JSON.parse(buf.subarray(bs, be).toString('utf8'));
        buf = buf.subarray(be);
        if (msg.method === 'initialize') send({ jsonrpc:'2.0', id:msg.id, result:{ protocolVersion:'2024-11-05', capabilities:{}, serverInfo:{ name:'mock', version:'1.0.0' } } });
        if (msg.method === 'tools/list') send({ jsonrpc:'2.0', id:msg.id, result:{ tools:[{ name:'tool_x' }] } });
      }
    });
    function send(msg) { const b = Buffer.from(JSON.stringify(msg)); process.stdout.write('Content-Length: ' + b.length + '\\r\\n\\r\\n'); process.stdout.write(b); }
  `);

  // Create a config with diverse server types
  const config = {
    mcpServers: {
      'probeable-server': {
        command: 'node',
        args: [passingServer],
      },
      'npx-server': {
        command: 'npx',
        args: ['-y', '@some/external-package'],
      },
      'auth-server': {
        command: 'node',
        args: ['server.js'],
        env: { API_KEY: 'ghp_' + 'TESTONLYNOTAREALGITHUBPAT12345678900' },
      },
      'python-server': {
        command: '/usr/bin/python3',
        args: ['server.py'],
      },
    },
  };
  fs.writeFileSync(path.join(tmpDir, '.mcp.json'), JSON.stringify(config));
  fs.mkdirSync(path.join(tmpDir, '.omp'), { recursive: true });
  fs.writeFileSync(path.join(tmpDir, '.omp', 'mcp.json'), JSON.stringify({
    mcpServers: {
      'http-server': {
        type: 'http',
        url: 'https://example.invalid/mcp',
      },
    },
  }));

  const findings = await checkMcpHealth({ root: tmpDir, dedicatedChecks: {} });
  const messages = findings.map((f) => f.message);

  // probeable-server should PASS
  const passFinding = messages.find((m) => m.includes('probeable-server') && m.includes('PASS'));
  assert.ok(passFinding, `expected probeable-server PASS, got: ${JSON.stringify(messages)}`);

  // npx-server should be UNVERIFIED
  const npxFinding = messages.find((m) => m.includes('npx-server') && m.includes('UNVERIFIED'));
  assert.ok(npxFinding, `expected npx-server UNVERIFIED, got: ${JSON.stringify(messages)}`);

  // auth-server should be UNVERIFIED
  const authFinding = messages.find((m) => m.includes('auth-server') && m.includes('UNVERIFIED'));
  assert.ok(authFinding, `expected auth-server UNVERIFIED, got: ${JSON.stringify(messages)}`);

  // python-server should be UNVERIFIED
  const pyFinding = messages.find((m) => m.includes('python-server') && m.includes('UNVERIFIED'));
  assert.ok(pyFinding, `expected python-server UNVERIFIED, got: ${JSON.stringify(messages)}`);

  // .omp/mcp.json HTTP server should be discovered without probing the network
  const httpFinding = messages.find((m) => m.includes('http-server') && m.includes('UNVERIFIED'));
  assert.ok(httpFinding, `expected http-server UNVERIFIED, got: ${JSON.stringify(messages)}`);

  // Credential safety: the API_KEY value must NEVER appear in any finding
  const allText = JSON.stringify(findings);
  assert.ok(!allText.includes('ghp_TESTONLYNOTAREALGITHUBPAT12345678900'), `credential leaked in findings: ${allText}`);
  assert.ok(!allText.includes('API_KEY'), `env key name leaked in findings: ${allText}`);

  // FAIL must be distinct from UNVERIFIED
  const failCount = messages.filter((m) => m.includes('FAIL')).length;
  const unverifiedCount = messages.filter((m) => m.includes('UNVERIFIED')).length;
  assert.ok(failCount === 0, `expected 0 FAILs, got ${failCount}`);
  assert.ok(unverifiedCount === 4, `expected 4 UNVERIFIED, got ${unverifiedCount}`);

  ok('integration: PASS=1, UNVERIFIED=4, FAIL=0; .omp HTTP inventory included; no credentials leaked');
}

// ── 9. INTEGRATION FAIL (server crashes during probe) ────────────────────────
{
  const crashingServer = mockServer(`process.stderr.write('boom\\n'); process.exit(1);`);
  const config = {
    mcpServers: {
      'crash-server': { command: 'node', args: [crashingServer] },
    },
  };
  const crashDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mcp-crash-'));
  fs.writeFileSync(path.join(crashDir, '.mcp.json'), JSON.stringify(config));

  const findings = await checkMcpHealth({ root: crashDir, dedicatedChecks: {} });
  const messages = findings.map((f) => f.message);

  const failFinding = messages.find((m) => m.includes('crash-server') && m.includes('FAIL'));
  assert.ok(failFinding, `expected crash-server FAIL, got: ${JSON.stringify(messages)}`);

  // FAIL finding should be HIGH severity (not LOW like UNVERIFIED)
  const failSeverity = findings.find((f) => f.message.includes('crash-server') && f.message.includes('FAIL'))?.severity;
  assert.equal(failSeverity, 'HIGH', `expected HIGH severity for FAIL, got ${failSeverity}`);

  ok('integration FAIL: crash-server FAIL/HIGH — distinct from UNVERIFIED/LOW');
}
// ── 10. DEDICATED CHECK FAIL-CLOSED: wrong success marker → FAIL ───────────
{
  const dedicatedDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mcp-dedicated-'));
  const misleadingCheck = path.join(dedicatedDir, 'misleading-check.mjs');
  fs.writeFileSync(
    misleadingCheck,
    "console.log('LOOKS_HEALTHY tools=99');\n",
  );

  const findings = await checkMcpHealth({
    root: dedicatedDir,
    dedicatedChecks: {
      'misconfigured-server': {
        script: 'misleading-check.mjs',
        passPattern: /^EXPECTED_MCP_CHECK_PASS/,
      },
    },
  });
  const result = findings.find((f) => f.message.includes('misconfigured-server'));

  assert.ok(result, `expected a dedicated-check finding, got: ${JSON.stringify(findings)}`);
  assert.equal(result.severity, 'HIGH', `expected HIGH severity, got ${result.severity}`);
  assert.ok(result.message.includes('FAIL'), `wrong success marker must not PASS: ${result.message}`);
  assert.ok(!result.message.includes(': PASS'), `misconfigured check produced false PASS: ${result.message}`);

  ok('dedicated negative: wrong success marker -> FAIL/HIGH (not PASS)');
}


// ── 10. P1-1 NEGATIVE: tools/list error response → FAIL (not PASS) ───────────
{
  const server = mockServer(`
    let buf = Buffer.alloc(0);
    process.stdin.on('data', (chunk) => {
      buf = Buffer.concat([buf, chunk]);
      while (true) {
        const he = buf.indexOf('\\r\\n\\r\\n');
        if (he === -1) break;
        const hdr = buf.subarray(0, he).toString('utf8');
        const m = hdr.match(/Content-Length:\\s*(\\d+)/i);
        if (!m) break;
        const len = Number(m[1]);
        const bs = he + 4;
        const be = bs + len;
        if (buf.length < be) break;
        const msg = JSON.parse(buf.subarray(bs, be).toString('utf8'));
        buf = buf.subarray(be);
        if (msg.method === 'initialize') send({ jsonrpc:'2.0', id:msg.id, result:{ protocolVersion:'2024-11-05', capabilities:{}, serverInfo:{ name:'mock', version:'1.0.0' } } });
        if (msg.method === 'tools/list') send({ jsonrpc:'2.0', id:msg.id, error:{ code:-32601, message:'Method not found' } });
      }
    });
    function send(msg) { const b = Buffer.from(JSON.stringify(msg)); process.stdout.write('Content-Length: ' + b.length + '\\r\\n\\r\\n'); process.stdout.write(b); }
  `);
  const r = await probeStdioServer({ command: process.execPath, args: [server], timeoutMs: 5000 });
  assert.equal(r.status, 'FAIL', `P1-1: expected FAIL for tools/list error, got ${r.status}: ${r.error}`);
  assert.ok(r.error.includes('tools/list error'), `P1-1: error should mention tools/list: ${r.error}`);
  ok('P1-1 negative: tools/list error → FAIL (not PASS)');
}

// ── 11. P1-1 NEGATIVE: initialize error → FAIL (not PASS) ────────────────────
{
  const server = mockServer(`
    let buf = Buffer.alloc(0);
    process.stdin.on('data', (chunk) => {
      buf = Buffer.concat([buf, chunk]);
      while (true) {
        const he = buf.indexOf('\\r\\n\\r\\n');
        if (he === -1) break;
        const hdr = buf.subarray(0, he).toString('utf8');
        const m = hdr.match(/Content-Length:\\s*(\\d+)/i);
        if (!m) break;
        const len = Number(m[1]);
        const bs = he + 4;
        const be = bs + len;
        if (buf.length < be) break;
        const msg = JSON.parse(buf.subarray(bs, be).toString('utf8'));
        buf = buf.subarray(be);
        if (msg.method === 'initialize') send({ jsonrpc:'2.0', id:msg.id, error:{ code:-32600, message:'Invalid request' } });
      }
    });
    function send(msg) { const b = Buffer.from(JSON.stringify(msg)); process.stdout.write('Content-Length: ' + b.length + '\\r\\n\\r\\n'); process.stdout.write(b); }
  `);
  const r = await probeStdioServer({ command: process.execPath, args: [server], timeoutMs: 5000 });
  assert.equal(r.status, 'FAIL', `P1-1: expected FAIL for initialize error, got ${r.status}: ${r.error}`);
  assert.ok(r.error.includes('initialize error'), `P1-1: error should mention initialize: ${r.error}`);
  ok('P1-1 negative: initialize error → FAIL (not PASS)');
}

// ── 12. P1-1 NEGATIVE: unsolicited id:2 without initialize → FAIL ────────────
{
  const server = mockServer(`
    const msg = { jsonrpc:'2.0', id:2, result:{ tools:[] } };
    const b = Buffer.from(JSON.stringify(msg));
    process.stdout.write('Content-Length: ' + b.length + '\\r\\n\\r\\n');
    process.stdout.write(b);
  `);
  const r = await probeStdioServer({ command: process.execPath, args: [server], timeoutMs: 5000 });
  assert.equal(r.status, 'FAIL', `P1-1: expected FAIL for unsolicited id:2, got ${r.status}: ${r.error}`);
  assert.ok(r.error.includes('before initialize'), `P1-1: error should mention before initialize: ${r.error}`);
  ok('P1-1 negative: unsolicited id:2 → FAIL (not PASS)');
}

// ── 13. P1-1 NEGATIVE: tools/list result without tools array → FAIL ──────────
{
  const server = mockServer(`
    let buf = Buffer.alloc(0);
    process.stdin.on('data', (chunk) => {
      buf = Buffer.concat([buf, chunk]);
      while (true) {
        const he = buf.indexOf('\\r\\n\\r\\n');
        if (he === -1) break;
        const hdr = buf.subarray(0, he).toString('utf8');
        const m = hdr.match(/Content-Length:\\s*(\\d+)/i);
        if (!m) break;
        const len = Number(m[1]);
        const bs = he + 4;
        const be = bs + len;
        if (buf.length < be) break;
        const msg = JSON.parse(buf.subarray(bs, be).toString('utf8'));
        buf = buf.subarray(be);
        if (msg.method === 'initialize') send({ jsonrpc:'2.0', id:msg.id, result:{ protocolVersion:'2024-11-05', capabilities:{}, serverInfo:{ name:'mock', version:'1.0.0' } } });
        if (msg.method === 'tools/list') send({ jsonrpc:'2.0', id:msg.id, result:{ capabilities:{} } });
      }
    });
    function send(msg) { const b = Buffer.from(JSON.stringify(msg)); process.stdout.write('Content-Length: ' + b.length + '\\r\\n\\r\\n'); process.stdout.write(b); }
  `);
  const r = await probeStdioServer({ command: process.execPath, args: [server], timeoutMs: 5000 });
  assert.equal(r.status, 'FAIL', `P1-1: expected FAIL for no tools array, got ${r.status}: ${r.error}`);
  assert.ok(r.error.includes('no tools array') || r.error.includes('tools/list error'), `P1-1: error should mention tools/list: ${r.error}`);
  ok('P1-1 negative: result without tools array → FAIL (not PASS)');
}

// ── 14. P1-2 NEGATIVE: SIGTERM-trapping server → probe resolves, no hang ─────
{
  const trapper = mockServer(`
    process.on('SIGTERM', () => {});
    setInterval(() => {}, 1000);
  `);
  const t0 = Date.now();
  const r = await probeStdioServer({ command: process.execPath, args: [trapper], timeoutMs: 1500 });
  const elapsed = Date.now() - t0;
  assert.equal(r.status, 'TIMEOUT', `P1-2: expected TIMEOUT, got ${r.status}: ${r.error}`);
  // Auto-detect tries CL (600ms) then newline (900ms) = ~1500ms.
  // SIGKILL escalation adds up to 500ms. Total should be well under 3000ms.
  assert.ok(elapsed < 3000, `P1-2: probe took ${elapsed}ms — SIGKILL escalation may not be working`);
  ok('P1-2 negative: SIGTERM-trapping server → TIMEOUT in ' + elapsed + 'ms, SIGKILL + unref worked');
}

// ── 15. P1-2b NEGATIVE: parent + child terminate after SIGTERM-trapper probe ─
{
  // Spawn a SUBPROCESS that probes a SIGTERM-trapping server, then exits
  // naturally (no process.exit). The ref'd hardKill timer keeps the subprocess
  // alive for a bounded ~500ms after the probe resolves, ensuring the
  // SIGTERM-trapping child is force-killed (SIGKILL) before the parent exits.
  // If stdio pipes are not destroyed, the subprocess hangs indefinitely —
  // exactly the defect the reviewer found: "probe resolved TIMEOUT but the
  // parent process never exited, hitting the 300s harness kill."
  const pidFile = path.join(tmpDir, `trap-pid-${Date.now()}.txt`);
  const trapper = mockServer(`
    import { writeFileSync } from 'node:fs';
    process.on('SIGTERM', () => {});
    setInterval(() => {}, 1000);
    writeFileSync(${JSON.stringify(pidFile)}, String(process.pid));
  `);
  const scriptsDir = path.dirname(fileURLToPath(import.meta.url));
  const probeUrl = pathToFileURL(path.join(scriptsDir, 'mcp-health-probe.mjs')).href;
  const runner = mockServer(`
    import { probeStdioServer } from ${JSON.stringify(probeUrl)};
    const r = await probeStdioServer({ command: process.execPath, args: [${JSON.stringify(trapper)}], timeoutMs: 1500 });
    process.stdout.write(r.status);
  `);
  const t0 = Date.now();
  const result = spawnSync(process.execPath, [runner], { timeout: 8000, encoding: 'utf8' });
  const elapsed = Date.now() - t0;
  assert.equal(result.signal, null, `P1-2b: parent killed by signal ${result.signal} — event loop did not drain (stdio pipes held open)`);
  assert.equal(result.stdout.trim(), 'TIMEOUT', `P1-2b: expected TIMEOUT stdout, got: "${result.stdout?.trim()}"`);
  assert.ok(elapsed < 5000, `P1-2b: parent took ${elapsed}ms — cleanup incomplete`);
  // The ref'd hardKill timer delays parent exit by a bounded ~500ms so the
  // SIGTERM-trapping child is SIGKILL'd before the parent exits. Verify the
  // child is actually gone — not merely that the probe returned TIMEOUT.
  if (fs.existsSync(pidFile)) {
    const childPid = parseInt(fs.readFileSync(pidFile, 'utf8').trim(), 10);
    let childAlive = false;
    try { process.kill(childPid, 0); childAlive = true; } catch (e) { if (e.code !== 'ESRCH') throw e; }
    assert.ok(!childAlive, `P1-2b: child PID ${childPid} still alive after parent exit — SIGKILL fallback did not fire`);
  }
  ok('P1-2b negative: parent + SIGTERM-trapping child both terminated cleanly in ' + elapsed + 'ms');
}

// ── 16. P2-1/P2-2 NEGATIVE: TOML hyphen names + env subtable ─────────────────
{
  const passingServer = mockServer(`
    let buf = Buffer.alloc(0);
    process.stdin.on('data', (chunk) => {
      buf = Buffer.concat([buf, chunk]);
      while (true) {
        const he = buf.indexOf('\\r\\n\\r\\n');
        if (he === -1) break;
        const hdr = buf.subarray(0, he).toString('utf8');
        const m = hdr.match(/Content-Length:\\s*(\\d+)/i);
        if (!m) break;
        const len = Number(m[1]);
        const bs = he + 4;
        const be = bs + len;
        if (buf.length < be) break;
        const msg = JSON.parse(buf.subarray(bs, be).toString('utf8'));
        buf = buf.subarray(be);
        if (msg.method === 'initialize') send({ jsonrpc:'2.0', id:msg.id, result:{ protocolVersion:'2024-11-05', capabilities:{}, serverInfo:{ name:'mock', version:'1.0.0' } } });
        if (msg.method === 'tools/list') send({ jsonrpc:'2.0', id:msg.id, result:{ tools:[{ name:'tool_x' }] } });
      }
    });
    function send(msg) { const b = Buffer.from(JSON.stringify(msg)); process.stdout.write('Content-Length: ' + b.length + '\\r\\n\\r\\n'); process.stdout.write(b); }
  `);

  const tomlDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mcp-toml-'));
  fs.mkdirSync(path.join(tomlDir, '.codex'), { recursive: true });
  fs.writeFileSync(path.join(tomlDir, '.codex', 'config.toml'), `
[mcp_servers.dash-name]
command = "node"
args = ["${passingServer}"]
enabled = true

[mcp_servers.server-github]
command = "node"
args = ["${passingServer}"]
enabled = true

[mcp_servers.subtable-env]
command = "node"
args = ["${passingServer}"]
enabled = true

[mcp_servers.subtable-env.env]
API_KEY = "test-only-env-value-NOT-REAL"
`);

  const findings = await checkMcpHealth({ root: tomlDir, dedicatedChecks: {} });
  const messages = findings.map((f) => f.message);

  // P2-1: dash-name should be discovered
  const dashFinding = messages.find((m) => m.includes('dash-name'));
  assert.ok(dashFinding, `P2-1: dash-name should be discovered, got: ${JSON.stringify(messages)}`);

  // P2-1: server-github should be discovered
  const ghFinding = messages.find((m) => m.includes('server-github'));
  assert.ok(ghFinding, `P2-1: server-github should be discovered, got: ${JSON.stringify(messages)}`);

  // P2-2: subtable-env should be UNVERIFIED (env subtable detected)
  const envFinding = messages.find((m) => m.includes('subtable-env') && m.includes('UNVERIFIED'));
  assert.ok(envFinding, `P2-2: subtable-env should be UNVERIFIED (env subtable), got: ${JSON.stringify(messages)}`);

  // P2-2: env value must never appear in output
  const allText = JSON.stringify(findings);
  assert.ok(!allText.includes('test-only-env-value-NOT-REAL'), `P2-2: env value leaked: ${allText}`);

  ok('P2-1/P2-2: dash-name + server-github discovered; subtable-env UNVERIFIED; no env leak');
  fs.rmSync(tomlDir, { recursive: true, force: true });
}

// ── 17. AUTH CACHE: checkMcpHealth honors the passed `root`, not hardcoded ROOT ──
{
  const authCacheDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mcp-authcache-'));
  const passingServer = mockServer(`
    let buf = Buffer.alloc(0);
    process.stdin.on('data', (chunk) => {
      buf = Buffer.concat([buf, chunk]);
      while (true) {
        const he = buf.indexOf('\\r\\n\\r\\n');
        if (he === -1) break;
        const hdr = buf.subarray(0, he).toString('utf8');
        const m = hdr.match(/Content-Length:\\s*(\\d+)/i);
        if (!m) break;
        const len = Number(m[1]);
        const bs = he + 4;
        const be = bs + len;
        if (buf.length < be) break;
        const msg = JSON.parse(buf.subarray(bs, be).toString('utf8'));
        buf = buf.subarray(be);
        if (msg.method === 'initialize') send({ jsonrpc:'2.0', id:msg.id, result:{ protocolVersion:'2024-11-05', capabilities:{}, serverInfo:{ name:'mock', version:'1.0.0' } } });
        if (msg.method === 'tools/list') send({ jsonrpc:'2.0', id:msg.id, result:{ tools:[{ name:'tool_x' }] } });
      }
    });
    function send(msg) { const b = Buffer.from(JSON.stringify(msg)); process.stdout.write('Content-Length: ' + b.length + '\\r\\n\\r\\n'); process.stdout.write(b); }
  `);
  fs.writeFileSync(path.join(authCacheDir, '.mcp.json'), JSON.stringify({
    mcpServers: {
      'cached-auth-server': { command: 'node', args: [passingServer] },
    },
  }));
  fs.mkdirSync(path.join(authCacheDir, '.claude'), { recursive: true });
  fs.writeFileSync(
    path.join(authCacheDir, '.claude', 'mcp-needs-auth-cache.json'),
    JSON.stringify({ 'cached-auth-server': { reason: 'requires OAuth' } }),
  );

  const findings = await checkMcpHealth({ root: authCacheDir, dedicatedChecks: {} });
  const messages = findings.map((f) => f.message);

  const cachedFinding = messages.find((m) => m.includes('cached-auth-server'));
  assert.ok(cachedFinding, `expected cached-auth-server finding, got: ${JSON.stringify(messages)}`);
  assert.ok(
    cachedFinding.includes('UNVERIFIED') && cachedFinding.includes('auth cache'),
    `expected root-relative auth-cache hit (UNVERIFIED — auth cache), got: ${cachedFinding}`,
  );
  assert.ok(!cachedFinding.includes('PASS'), `auth-cache entry must short-circuit probing, not PASS: ${cachedFinding}`);

  ok('custom-root auth cache: cached-auth-server → UNVERIFIED (auth cache), never probed');
  fs.rmSync(authCacheDir, { recursive: true, force: true });
}

// ── 18. FRAMING AUTO: Content-Length TIMEOUT → newline PASS fallback ─────────
{
  // Server only understands newline-delimited JSON. Content-Length framed
  // input never resolves to a parseable line, so it silently sits unconsumed
  // and the server never responds — the Content-Length attempt must TIMEOUT
  // (not crash), then auto-detect falls back to newline framing and PASSes.
  const server = mockServer(`
    let buf = Buffer.alloc(0);
    process.stdin.on('data', (chunk) => {
      buf = Buffer.concat([buf, chunk]);
      while (true) {
        const nl = buf.indexOf('\\n');
        if (nl === -1) break;
        const line = buf.subarray(0, nl).toString('utf8').replace(/\\r$/, '');
        buf = buf.subarray(nl + 1);
        if (!line.trim()) continue;
        let msg;
        try { msg = JSON.parse(line); } catch { continue; }
        if (msg.method === 'initialize') send({ jsonrpc:'2.0', id:msg.id, result:{ protocolVersion:'2024-11-05', capabilities:{}, serverInfo:{ name:'nl-timeout', version:'1.0.0' } } });
        if (msg.method === 'tools/list') send({ jsonrpc:'2.0', id:msg.id, result:{ tools:[{ name:'timeout_fallback_tool' }] } });
      }
    });
    function send(msg) { process.stdout.write(JSON.stringify(msg) + '\\n'); }
  `);
  const r = await probeStdioServer({ command: process.execPath, args: [server], timeoutMs: 3000 });
  assert.equal(r.status, 'PASS', `expected PASS via newline fallback after CL TIMEOUT, got ${r.status}: ${r.error}`);
  assert.deepEqual(r.tools, ['timeout_fallback_tool']);
  ok('auto framing: Content-Length TIMEOUT → newline PASS fallback, tools=[' + r.tools.join(',') + ']');
}

// ── 19. FRAMING AUTO: Content-Length FAIL (no response) → newline PASS ───────
{
  // Server crashes on the first unparseable line it sees. A Content-Length
  // framed handshake produces a garbled first "line" (the header, split on
  // \n) that isn't valid JSON, so the server exits before ever writing a
  // response — a FAIL with zero valid handshake evidence. Auto-detect must
  // still retry with newline framing (which the server parses cleanly) and
  // PASS, proving the retry condition covers FAIL-before-any-response, not
  // just TIMEOUT.
  const server = mockServer(`
    let buf = Buffer.alloc(0);
    process.stdin.on('data', (chunk) => {
      buf = Buffer.concat([buf, chunk]);
      while (true) {
        const nl = buf.indexOf('\\n');
        if (nl === -1) break;
        const line = buf.subarray(0, nl).toString('utf8').replace(/\\r$/, '');
        buf = buf.subarray(nl + 1);
        if (!line.trim()) continue;
        let msg;
        try {
          msg = JSON.parse(line);
        } catch (e) {
          process.stderr.write('unparseable line, bailing\\n');
          process.exit(1);
        }
        if (msg.method === 'initialize') send({ jsonrpc:'2.0', id:msg.id, result:{ protocolVersion:'2024-11-05', capabilities:{}, serverInfo:{ name:'nl-only', version:'1.0.0' } } });
        if (msg.method === 'tools/list') send({ jsonrpc:'2.0', id:msg.id, result:{ tools:[{ name:'crash_fallback_tool' }] } });
      }
    });
    function send(msg) { process.stdout.write(JSON.stringify(msg) + '\\n'); }
  `);
  const r = await probeStdioServer({ command: process.execPath, args: [server], timeoutMs: 5000 });
  assert.equal(r.status, 'PASS', `expected PASS via newline fallback after CL FAIL (no response), got ${r.status}: ${r.error}`);
  assert.deepEqual(r.tools, ['crash_fallback_tool']);
  ok('auto framing: Content-Length FAIL (crash, no response) → newline PASS fallback, tools=[' + r.tools.join(',') + ']');
}

// ── 20. FRAMING AUTO NEGATIVE: FAIL after a real response stays fail-closed ──
{
  // Regression guard for the "explicit protocol errors after a real
  // response" carve-out: an initialize error IS a valid, parsed handshake
  // frame, so auto-detect must NOT retry with newline framing — it must
  // return the original FAIL untouched.
  const server = mockServer(`
    let buf = Buffer.alloc(0);
    process.stdin.on('data', (chunk) => {
      buf = Buffer.concat([buf, chunk]);
      while (true) {
        const he = buf.indexOf('\\r\\n\\r\\n');
        if (he === -1) break;
        const hdr = buf.subarray(0, he).toString('utf8');
        const m = hdr.match(/Content-Length:\\s*(\\d+)/i);
        if (!m) break;
        const len = Number(m[1]);
        const bs = he + 4;
        const be = bs + len;
        if (buf.length < be) break;
        const msg = JSON.parse(buf.subarray(bs, be).toString('utf8'));
        buf = buf.subarray(be);
        if (msg.method === 'initialize') send({ jsonrpc:'2.0', id:msg.id, error:{ code:-32600, message:'Invalid request' } });
      }
    });
    function send(msg) { const b = Buffer.from(JSON.stringify(msg)); process.stdout.write('Content-Length: ' + b.length + '\\r\\n\\r\\n'); process.stdout.write(b); }
  `);
  const r = await probeStdioServer({ command: process.execPath, args: [server], timeoutMs: 5000 });
  assert.equal(r.status, 'FAIL', `expected fail-closed FAIL (no retry) after a real response, got ${r.status}: ${r.error}`);
  assert.ok(r.error.includes('initialize error'), `expected original initialize error preserved (no newline retry masking it): ${r.error}`);
  ok('auto framing negative: initialize error (real response) → fail-closed, no newline retry');
}

// ── 21. FRAMING AUTO NEGATIVE: TIMEOUT after a real response stays fail-closed ──
{
  // Regression guard for the P2 finding: a valid Content-Length initialize
  // response IS real handshake evidence, so a subsequent tools/list hang must
  // TIMEOUT without respawning under newline framing — a framing change can't
  // fix a hang that already proved the framing works. Verifies both bounded
  // latency (single attempt only, not first+second slice) and a single spawn
  // (no newline respawn) via a spawn-count log file.
  const spawnLog = path.join(tmpDir, `spawn-log-${Date.now()}.txt`);
  const server = mockServer(`
    import { appendFileSync } from 'node:fs';
    appendFileSync(${JSON.stringify(spawnLog)}, 'spawned\\n');
    let buf = Buffer.alloc(0);
    process.stdin.on('data', (chunk) => {
      buf = Buffer.concat([buf, chunk]);
      while (true) {
        const he = buf.indexOf('\\r\\n\\r\\n');
        if (he === -1) break;
        const hdr = buf.subarray(0, he).toString('utf8');
        const m = hdr.match(/Content-Length:\\s*(\\d+)/i);
        if (!m) break;
        const len = Number(m[1]);
        const bs = he + 4;
        const be = bs + len;
        if (buf.length < be) break;
        const msg = JSON.parse(buf.subarray(bs, be).toString('utf8'));
        buf = buf.subarray(be);
        if (msg.method === 'initialize') {
          send({ jsonrpc:'2.0', id:msg.id, result:{ protocolVersion:'2024-11-05', capabilities:{}, serverInfo:{ name:'hang-after-init', version:'1.0.0' } } });
        }
        // tools/list intentionally never answered — valid handshake, then a hang.
      }
    });
    function send(msg) { const b = Buffer.from(JSON.stringify(msg)); process.stdout.write('Content-Length: ' + b.length + '\\r\\n\\r\\n'); process.stdout.write(b); }
  `);
  const timeoutMs = 2000;
  const t0 = Date.now();
  const r = await probeStdioServer({ command: process.execPath, args: [server], timeoutMs });
  const elapsed = Date.now() - t0;
  assert.equal(r.status, 'TIMEOUT', `expected fail-closed TIMEOUT (no retry) after a real response, got ${r.status}: ${r.error}`);
  // Bounded to roughly the first Content-Length slice (~40% of timeoutMs), not
  // first+second slice — proves no newline respawn burned the full budget.
  assert.ok(elapsed < timeoutMs * 0.75, `P2 regression: elapsed ${elapsed}ms not bounded to a single attempt (timeoutMs=${timeoutMs})`);
  const spawnCount = fs.existsSync(spawnLog)
    ? fs.readFileSync(spawnLog, 'utf8').trim().split('\n').filter(Boolean).length
    : 0;
  assert.equal(spawnCount, 1, `P2 regression: expected exactly 1 child spawn (no newline respawn), got ${spawnCount}`);
  ok(`auto framing negative: TIMEOUT after valid initialize response → fail-closed, bounded latency ${elapsed}ms, spawns=${spawnCount}`);
}

// ── 22. CHILD DEATH between initialize and tools/list → structured FAIL, no uncaught ──
{
  // The child answers initialize then exits immediately. Its response is buffered in
  // the pipe (delivered after the child is gone), so the probe's subsequent writes —
  // notifications/initialized + tools/list — target a dead stdin. The never-throws
  // contract requires this resolve to a structured FAIL, never an uncaught exception.
  // The probe's defensive child.stdin 'error' listener and send() write guard (added
  // for this defect) guarantee that: any EPIPE/throw on those writes is captured as a
  // structured FAIL rather than crashing the process. NOTE: the EPIPE 'error' event
  // itself is platform/timing-dependent and did NOT reproduce deterministically on
  // macOS/Node 26 (tried child-exit, process.stdin.destroy, fs.closeSync(0)); this test
  // still pins the load-bearing contract — child death mid-handshake → structured FAIL,
  // no uncaught — which holds regardless of whether EPIPE fires here.
  const server = mockServer(`
    let buf = Buffer.alloc(0);
    process.stdin.on('data', (chunk) => {
      buf = Buffer.concat([buf, chunk]);
      while (true) {
        const he = buf.indexOf('\\r\\n\\r\\n');
        if (he === -1) break;
        const hdr = buf.subarray(0, he).toString('utf8');
        const m = hdr.match(/Content-Length:\\s*(\\d+)/i);
        if (!m) break;
        const len = Number(m[1]);
        const bs = he + 4;
        const be = bs + len;
        if (buf.length < be) break;
        const msg = JSON.parse(buf.subarray(bs, be).toString('utf8'));
        buf = buf.subarray(be);
        if (msg.method === 'initialize') {
          send({ jsonrpc:'2.0', id:msg.id, result:{ protocolVersion:'2024-11-05', capabilities:{}, serverInfo:{ name:'crash-after-init', version:'1.0.0' } } });
          // Response is already in the pipe buffer; exit now so the probe's
          // tools/list write lands on a dead stdin (EPIPE) — the init/tools-list gap.
          process.exit(0);
        }
      }
    });
    function send(msg) { const b = Buffer.from(JSON.stringify(msg)); process.stdout.write('Content-Length: ' + b.length + '\\r\\n\\r\\n'); process.stdout.write(b); }
  `);
  const r = await probeStdioServer({ command: process.execPath, args: [server], timeoutMs: 5000 });
  assert.equal(r.status, 'FAIL', `expected structured FAIL (not a crash) on stdin EPIPE, got ${r.status}: ${r.error}`);
  assert.ok(r.error, 'FAIL must carry an error message');
  ok('child death between initialize and tools/list → structured FAIL, no uncaught: ' + r.error.slice(0, 60));
}

// ── 23. HARD-KILL TIMER: not armed when the child already exited ─────────────
{
  // settle() must NOT arm the 500ms SIGKILL timer when the child has already
  // exited (it only held the event loop open for 500ms after the probe was done).
  // Verified in a subprocess that lets the loop drain naturally: a lingering
  // timer surfaces as ~500ms of extra wall time vs. a prompt exit.
  const exitChild = mockServer(`process.exit(0);`);
  const probeUrl = JSON.stringify(pathToFileURL(path.join(repoRoot, '_SYSTEM/Scripts/mcp-health-probe.mjs')).href);
  const helper = mockServer(`
    import { probeStdioServer } from ${probeUrl};
    const r = await probeStdioServer({ command: process.execPath, args: [${JSON.stringify(exitChild)}], timeoutMs: 5000 });
    process.stdout.write('STATUS=' + r.status);
    // Deliberately do NOT call process.exit(): let the loop drain on its own so a
    // lingering 500ms hard-kill timer keeps this process alive (the signal).
  `);
  const t0 = Date.now();
  const res = spawnSync(process.execPath, [helper], { encoding: 'utf8', timeout: 8000 });
  const elapsed = Date.now() - t0;
  assert.equal(res.status, 0, `helper exited non-zero (${res.status}); stderr: ${res.stderr}`);
  assert.match(res.stdout, /STATUS=FAIL/, `expected FAIL for an immediately-exiting child: ${res.stdout}`);
  assert.ok(elapsed < 400, `hard-kill timer lingered: elapsed=${elapsed}ms (a 500ms timer was armed despite the child already having exited)`);
  ok(`hard-kill timer not armed when child already exited (subprocess elapsed ${elapsed}ms < 400ms)`);
}

// ── cleanup ──────────────────────────────────────────────────────────────────
fs.rmSync(tmpDir, { recursive: true, force: true });

console.log(`\nmcp-doctor-check: ${passed} tests passed`);
