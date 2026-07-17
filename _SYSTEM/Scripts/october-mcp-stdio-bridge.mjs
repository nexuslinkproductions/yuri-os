#!/usr/bin/env node
// @capability: october-mcp-stdio-bridge
// @serves: Codex | October MCP | stdio transport | Streamable HTTP | cross-harness activation
// @does: Bridges newline-delimited MCP JSON-RPC on stdio to the attached October loopback MCP endpoint without persisting canvas, node, or session identities.
// @use: Launch as a project MCP stdio server with OCTOBER_BUS_PORT, OCTOBER_BUS_CANVAS, and OCTOBER_BUS_NODE forwarded from the attached harness environment.
// @exports: bridgeMessage, parseMcpHttpPayload, requestOctober, resolveOctoberEnvironment, runBridge

import http from 'node:http';
import readline from 'node:readline';
import { pathToFileURL } from 'node:url';

export const DEFAULT_CONNECT_TIMEOUT_MS = 2_000;
export const DEFAULT_REQUEST_TIMEOUT_MS = 120_000;
export const MAX_RESPONSE_BYTES = 16 * 1024 * 1024;

const REQUIRED_ENVIRONMENT = ['OCTOBER_BUS_PORT', 'OCTOBER_BUS_CANVAS', 'OCTOBER_BUS_NODE'];

class BridgeError extends Error {
  constructor(code, details = {}) {
    super(code);
    this.name = 'BridgeError';
    this.code = code;
    Object.assign(this, details);
  }
}

function requiredText(env, key) {
  const value = String(env?.[key] ?? '').trim();
  if (!value) throw new BridgeError('configuration', { key });
  if (/[\r\n\0]/.test(value)) throw new BridgeError('configuration', { key });
  return value;
}

export function resolveOctoberEnvironment(env = process.env) {
  const rawPort = requiredText(env, 'OCTOBER_BUS_PORT');
  if (!/^\d+$/.test(rawPort)) throw new BridgeError('configuration', { key: 'OCTOBER_BUS_PORT' });
  const port = Number(rawPort);
  if (!Number.isSafeInteger(port) || port < 1 || port > 65_535) {
    throw new BridgeError('configuration', { key: 'OCTOBER_BUS_PORT' });
  }

  return {
    host: '127.0.0.1',
    port,
    path: '/mcp',
    canvas: requiredText(env, 'OCTOBER_BUS_CANVAS'),
    node: requiredText(env, 'OCTOBER_BUS_NODE'),
  };
}

function parseSse(raw) {
  const messages = [];
  let data = [];

  const flush = () => {
    if (!data.length) return;
    const payload = data.join('\n').trim();
    data = [];
    if (!payload || payload === '[DONE]') return;
    messages.push(JSON.parse(payload));
  };

  for (const line of raw.split(/\r?\n/)) {
    if (!line) {
      flush();
      continue;
    }
    if (line.startsWith(':')) continue;
    const separator = line.indexOf(':');
    const field = separator === -1 ? line : line.slice(0, separator);
    let value = separator === -1 ? '' : line.slice(separator + 1);
    if (value.startsWith(' ')) value = value.slice(1);
    if (field === 'data') data.push(value);
  }
  flush();
  return messages;
}

export function parseMcpHttpPayload(body, contentType = '') {
  const raw = String(body ?? '').trim();
  if (!raw) return [];
  const isSse = String(contentType).toLowerCase().includes('text/event-stream')
    || /(?:^|\n)(?:event|data):/.test(raw);
  return isSse ? parseSse(raw) : [JSON.parse(raw)];
}

function firstHeader(value) {
  const candidate = Array.isArray(value) ? value[0] : value;
  const text = String(candidate ?? '').trim();
  return text && text.length <= 1_024 ? text : null;
}

export function requestOctober(message, config, session, {
  connectTimeoutMs = DEFAULT_CONNECT_TIMEOUT_MS,
  requestTimeoutMs = DEFAULT_REQUEST_TIMEOUT_MS,
  maxResponseBytes = MAX_RESPONSE_BYTES,
  requestImpl = http.request,
} = {}) {
  const body = Buffer.from(JSON.stringify(message));
  const headers = {
    'Content-Type': 'application/json',
    Accept: 'application/json, text/event-stream',
    'Content-Length': String(body.length),
    'X-October-Canvas': config.canvas,
    'X-October-Node': config.node,
  };
  if (session.id) headers['Mcp-Session-Id'] = session.id;

  return new Promise((resolve, reject) => {
    let settled = false;
    let connectTimer;
    let requestTimer;

    const finish = (callback, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(connectTimer);
      clearTimeout(requestTimer);
      callback(value);
    };

    const request = requestImpl({
      host: config.host,
      port: config.port,
      path: config.path,
      method: 'POST',
      headers,
    }, (response) => {
      clearTimeout(connectTimer);
      const chunks = [];
      let size = 0;

      response.on('data', (chunk) => {
        if (settled) return;
        const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        size += bytes.length;
        if (size > maxResponseBytes) {
          response.destroy(new BridgeError('response-too-large'));
          return;
        }
        chunks.push(bytes);
      });
      response.on('aborted', () => finish(reject, new BridgeError('response-aborted')));
      response.on('error', (error) => {
        finish(reject, error instanceof BridgeError ? error : new BridgeError('response-failed'));
      });
      response.on('end', () => {
        const nextSessionId = firstHeader(response.headers?.['mcp-session-id']);
        if (nextSessionId) session.id = nextSessionId;
        finish(resolve, {
          statusCode: Number(response.statusCode ?? 0),
          contentType: String(response.headers?.['content-type'] ?? ''),
          body: Buffer.concat(chunks).toString('utf8'),
        });
      });
    });

    request.on('socket', (socket) => {
      if (!socket.connecting) {
        clearTimeout(connectTimer);
        return;
      }
      socket.once('connect', () => clearTimeout(connectTimer));
    });
    request.on('error', (error) => {
      finish(reject, error instanceof BridgeError ? error : new BridgeError('connection-failed'));
    });

    connectTimer = setTimeout(() => request.destroy(new BridgeError('connect-timeout')), connectTimeoutMs);
    requestTimer = setTimeout(() => request.destroy(new BridgeError('request-timeout')), requestTimeoutMs);
    connectTimer.unref?.();
    requestTimer.unref?.();
    request.end(body);
  });
}

function messageExpectsResponse(message) {
  if (Array.isArray(message)) {
    return message.some((entry) => entry && typeof entry === 'object' && Object.hasOwn(entry, 'id'));
  }
  return Boolean(message && typeof message === 'object' && Object.hasOwn(message, 'id'));
}

function responseId(message) {
  if (!Array.isArray(message) && message && typeof message === 'object' && Object.hasOwn(message, 'id')) {
    return message.id;
  }
  return null;
}

export async function bridgeMessage(message, config, session = { id: null }, options = {}) {
  const expectsResponse = messageExpectsResponse(message);
  const response = await requestOctober(message, config, session, options);

  if (response.statusCode === 202 || response.statusCode === 204) return [];
  if (response.statusCode < 200 || response.statusCode >= 300) {
    throw new BridgeError('http-status', { statusCode: response.statusCode });
  }
  if (!expectsResponse) return [];

  const messages = parseMcpHttpPayload(response.body, response.contentType);
  if (!messages.length) throw new BridgeError('empty-response');
  return messages;
}

function writeLine(stream, value) {
  stream.write(`${JSON.stringify(value)}\n`);
}

function safeFailureLabel(error) {
  if (error?.code === 'configuration') return `configuration error (${error.key ?? 'required environment'})`;
  if (error?.code === 'connect-timeout') return 'connect timeout';
  if (error?.code === 'request-timeout') return 'request timeout';
  if (error?.code === 'http-status') return `HTTP ${error.statusCode || 'error'}`;
  if (error?.code === 'response-too-large') return 'response limit exceeded';
  if (error instanceof SyntaxError) return 'invalid JSON response';
  return 'transport failure';
}

function writeSafeError(stream, error) {
  stream.write(`october-mcp-stdio-bridge: ${safeFailureLabel(error)}\n`);
}

export async function runBridge({
  env = process.env,
  input = process.stdin,
  output = process.stdout,
  errorOutput = process.stderr,
  requestOptions = {},
} = {}) {
  let config;
  try {
    config = resolveOctoberEnvironment(env);
  } catch (error) {
    writeSafeError(errorOutput, error);
    return 1;
  }

  const session = { id: null };
  const lines = readline.createInterface({ input, crlfDelay: Infinity, terminal: false });
  for await (const line of lines) {
    if (!line.trim()) continue;
    let message;
    try {
      message = JSON.parse(line);
    } catch {
      writeLine(output, { jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } });
      continue;
    }

    try {
      const responses = await bridgeMessage(message, config, session, requestOptions);
      for (const response of responses) writeLine(output, response);
    } catch (error) {
      writeSafeError(errorOutput, error);
      if (messageExpectsResponse(message)) {
        writeLine(output, {
          jsonrpc: '2.0',
          id: responseId(message),
          error: { code: -32603, message: 'October MCP bridge request failed' },
        });
      }
    }
  }
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runBridge().then((exitCode) => {
    process.exitCode = exitCode;
  }).catch(() => {
    process.stderr.write('october-mcp-stdio-bridge: fatal transport failure\n');
    process.exitCode = 1;
  });
}

export { REQUIRED_ENVIRONMENT };
