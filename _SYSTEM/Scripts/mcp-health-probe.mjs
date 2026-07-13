#!/usr/bin/env node
// @capability: mcp-health-probe
// @does: Minimal reusable MCP stdio probe — initialize + tools/list handshake.
//        Never logs env values, auth tokens, or full commands containing secrets.
//        Returns a structured result for the caller to classify.
// @exports: probeStdioServer, redactSecrets
//
// Extracted from the duplicated smokeMcpTools() in gitnexus-mcp-check.mjs and
// ollama-bridge-mcp-check.mjs. Supports Content-Length, newline, and auto-detect
// framing. Read-only: spawns a child, performs the JSON-RPC 2.0 handshake, kills
// the child, and returns. Never throws — all failure modes resolve to a
// structured result with a status field.

import { spawn } from 'node:child_process';

const DEFAULT_TIMEOUT_MS = 8000;
const PROTOCOL_VERSION = '2024-11-05';

// ── credential-safe redaction ────────────────────────────────────────────────
// Applied to every string that leaves the probe (error messages, stderr tails).
// Never applied to env values because the probe never reads them — env is passed
// to the child opaquely and never inspected or logged.

const REDACT_PATTERNS = [
  // Protected paths (mirrors CLAUDE.md protected-paths list)
  [/\.claude\/state\/[^\s"']*/g, '.claude/state/<REDACTED>'],
  [/\.claude\/history\/[^\s"']*/g, '.claude/history/<REDACTED>'],
  [/\.claude\/file-history\/[^\s"']*/g, '.claude/file-history/<REDACTED>'],
  [/\.claude\/projects\/[^\s"'\)]+/g, '.claude/projects/<REDACTED>'],
  [/\.claude\/\.credentials\b[^\s"']*/g, '.claude/.credentials<REDACTED>'],
  [/\.env\b/g, '<REDACTED>'],
  [/backend\/data\/[^\s"']*/g, 'backend/data/<REDACTED>'],
  [/\.amp\/[^\s"']*/g, '.amp/<REDACTED>'],
  // Token-like patterns
  [/ghp_[a-zA-Z0-9]{36,}/g, 'ghp_<REDACTED>'],
  [/gho_[a-zA-Z0-9]{36,}/g, 'gho_<REDACTED>'],
  [/Bearer\s+[^\s"']+/g, 'Bearer <REDACTED>'],
  [/((?:api[_-]?key|token|secret|password|credential)\s*[=:]\s*)\S+/gi, '$1<REDACTED>'],
];

export function redactSecrets(text) {
  let s = String(text ?? '');
  for (const [pattern, replacement] of REDACT_PATTERNS) {
    s = s.replace(pattern, replacement);
  }
  return s;
}

// ── auto-detect wrapper ──────────────────────────────────────────────────────
// Tries Content-Length first (the MCP standard). If that attempt never produces
// any valid, parseable JSON-RPC frame — a TIMEOUT with no response at all, a
// FAIL from a crash/spawn error before any frame arrived, or a protocol parse
// error on the very first frame — the server likely expects newline-delimited
// JSON, so it respawns and retries with newline framing. Once at least one
// valid frame has been parsed (even an error response, or one out of sequence),
// the framing is proven correct: any subsequent TIMEOUT (e.g. initialize
// succeeded but tools/list never arrived) or FAIL (initialize error, tools/list
// error, out-of-order response, later protocol corruption) is fail-closed — no
// retry, since a different framing would not change a real protocol fault and
// would only burn the remaining timeout budget on a hang that already proved
// the framing works.

export function probeStdioServer({
  command,
  args = [],
  cwd,
  env,
  framing = 'auto',
  timeoutMs = DEFAULT_TIMEOUT_MS,
  clientName = 'yuri-mcp-probe',
}) {
  if (framing !== 'auto') {
    return _probeWithFraming({ command, args, cwd, env, framing, timeoutMs, clientName }).then(_stripInternal);
  }

  const firstSlice = Math.ceil(timeoutMs * 0.4);
  const secondSlice = timeoutMs - firstSlice;

  return _probeWithFraming({ command, args, cwd, env, framing: 'content-length', timeoutMs: firstSlice, clientName })
    .then((result) => {
      const noHandshakeEvidence = !result.receivedResponse
        && (result.status === 'TIMEOUT' || result.status === 'FAIL');
      if (!noHandshakeEvidence) return _stripInternal(result);
      // No valid handshake frame was ever parsed — try newline framing with the
      // remaining budget instead of trusting a framing-dependent failure.
      return _probeWithFraming({ command, args, cwd, env, framing: 'newline', timeoutMs: secondSlice, clientName })
        .then(_stripInternal);
    });
}

function _stripInternal(result) {
  const { receivedResponse, ...rest } = result;
  return rest;
}

// ── single-framing probe ─────────────────────────────────────────────────────

function _probeWithFraming({
  command,
  args = [],
  cwd,
  env,
  framing = 'content-length',
  timeoutMs = DEFAULT_TIMEOUT_MS,
  clientName = 'yuri-mcp-probe',
}) {
  return new Promise((resolve) => {
    const t0 = Date.now();
    let stdout = Buffer.alloc(0);
    let stderr = '';
    let settled = false;
    let initialized = false;
    let receivedResponse = false;
    let hardKillTimer;
    let childExited = false;

    function settle(result) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try {
        child.stdin?.end();
        if (!childExited) {
          child.kill('SIGTERM');
          hardKillTimer = setTimeout(() => { try { child.kill('SIGKILL'); } catch { /* gone */ } }, 500);
        }
        child.stdout?.destroy();
        child.stderr?.destroy();
        child.unref();
      } catch { /* already dead */ }
      resolve({ ...result, ms: Date.now() - t0, receivedResponse });
    }

    const child = spawn(command, args, {
      cwd,
      env: env || process.env,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    const timer = setTimeout(() => {
      settle({ ok: false, status: 'TIMEOUT', tools: [], error: `probe timed out after ${timeoutMs}ms` });
    }, timeoutMs);

    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString('utf8');
    });

    child.stdout.on('data', (chunk) => {
      stdout = Buffer.concat([stdout, chunk]);
      let messages;
      try {
        messages = drainFrames();
      } catch (e) {
        settle({ ok: false, status: 'FAIL', tools: [], error: `protocol parse error: ${redactSecrets(String(e?.message || e).slice(0, 200))}` });
        return;
      }
      for (const message of messages) {
        if (message.id === 1) {
          if (message.error) {
            settle({ ok: false, status: 'FAIL', tools: [], error: `initialize error: ${redactSecrets(String(message.error?.message || 'unknown').slice(0, 200))}` });
            return;
          }
          initialized = true;
          send({ jsonrpc: '2.0', method: 'notifications/initialized', params: {} });
          send({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} });
        }
        if (message.id === 2) {
          if (!initialized) {
            settle({ ok: false, status: 'FAIL', tools: [], error: 'tools/list response before initialize completed' });
            return;
          }
          if (message.error || !Array.isArray(message.result?.tools)) {
            settle({ ok: false, status: 'FAIL', tools: [], error: `tools/list error: ${redactSecrets(String(message.error?.message || 'no tools array').slice(0, 200))}` });
            return;
          }
          const tools = message.result.tools.map((t) => t.name).sort();
          settle({ ok: true, status: 'PASS', tools, error: null });
        }
      }
    });

    child.on('error', (error) => {
      settle({ ok: false, status: 'FAIL', tools: [], error: `spawn error: ${redactSecrets(String(error?.message || error).slice(0, 200))}` });
    });
    // EPIPE / write-error on stdin (e.g. the child crashed between initialize
    // and tools/list, or closed its stdin) must resolve to a structured FAIL —
    // never an uncaught 'error' event, which would violate the never-throws
    // contract. Covers the initialize and tools/list write timing.
    child.stdin.on('error', (err) => {
      settle({ ok: false, status: 'FAIL', tools: [], error: `stdin write error: ${redactSecrets(String(err?.code || err?.message || err).slice(0, 200))}` });
    });

    child.on('exit', (code) => {
      childExited = true;
      const trimmed = redactSecrets(stderr.trim().slice(0, 300));
      clearTimeout(hardKillTimer);
      settle({ ok: false, status: 'FAIL', tools: [], error: `server exited code=${code}${trimmed ? ` stderr=${trimmed}` : ''}` });
    });

    // Kick off the handshake
    send({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: PROTOCOL_VERSION,
        capabilities: {},
        clientInfo: { name: clientName, version: '1.0.0' },
      },
    });

    function send(message) {
      const body = Buffer.from(JSON.stringify(message), 'utf8');
      try {
        if (framing === 'newline') {
          child.stdin.write(`${body.toString('utf8')}\n`);
          return;
        }
        child.stdin.write(`Content-Length: ${body.length}\r\n\r\n${body.toString('utf8')}`);
      } catch (e) {
        settle({ ok: false, status: 'FAIL', tools: [], error: `stdin write error: ${redactSecrets(String(e?.code || e?.message || e).slice(0, 200))}` });
      }
    }

    function drainFrames() {
      const messages = [];
      while (true) {
        if (framing === 'newline') {
          const nl = stdout.indexOf('\n');
          if (nl === -1) break;
          const line = stdout.subarray(0, nl).toString('utf8').replace(/\r$/, '');
          stdout = stdout.subarray(nl + 1);
          if (!line.trim()) continue;
          messages.push(JSON.parse(line));
          receivedResponse = true;
          continue;
        }
        const headerEnd = stdout.indexOf('\r\n\r\n');
        if (headerEnd === -1) break;
        const header = stdout.subarray(0, headerEnd).toString('utf8');
        const match = header.match(/Content-Length:\s*(\d+)/i);
        if (!match) throw new Error(`bad MCP header: ${header.slice(0, 120)}`);
        const length = Number(match[1]);
        const bodyStart = headerEnd + 4;
        const bodyEnd = bodyStart + length;
        if (stdout.length < bodyEnd) break;
        const body = stdout.subarray(bodyStart, bodyEnd).toString('utf8');
        stdout = stdout.subarray(bodyEnd);
        messages.push(JSON.parse(body));
        receivedResponse = true;
      }
      return messages;
    }
  });
}
