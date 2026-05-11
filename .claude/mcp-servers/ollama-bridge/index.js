#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');

const REPO_ROOT = '/Users/marcelspatz/NUDIMMUD';
const OLLAMA_URL = process.env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434';
const DEFAULT_MODEL = process.env.OLLAMA_MODEL || 'qwen2.5:7b';
const MAX_FILE_BYTES = 64 * 1024;

let buffer = Buffer.alloc(0);
let framing = null;

process.stdin.on('data', (chunk) => {
  buffer = Buffer.concat([buffer, chunk]);
  drainFrames().forEach((message) => {
    handleMessage(message).catch((error) => {
      if (message.id !== undefined) {
        sendError(message.id, -32000, error.message);
      }
    });
  });
});

function drainFrames() {
  const messages = [];
  while (true) {
    if (framing === null && buffer.length > 0) {
      if (buffer[0] === 0x7b || buffer[0] === 0x5b) {
        framing = 'newline';
      } else if (/^content-length\s*:/i.test(buffer.toString('utf8', 0, Math.min(buffer.length, 32)))) {
        framing = 'content-length';
      } else {
        break;
      }
    }

    if (framing === 'newline') {
      const newlineIndex = buffer.indexOf('\n');
      if (newlineIndex === -1) break;
      const line = buffer.subarray(0, newlineIndex).toString('utf8').replace(/\r$/, '');
      buffer = buffer.subarray(newlineIndex + 1);
      if (line.trim().length === 0) continue;
      messages.push(JSON.parse(line));
      continue;
    }

    const crlfHeaderEnd = buffer.indexOf('\r\n\r\n');
    const lfHeaderEnd = buffer.indexOf('\n\n');
    const usesCrlf = crlfHeaderEnd !== -1 && (lfHeaderEnd === -1 || crlfHeaderEnd <= lfHeaderEnd);
    const headerEnd = usesCrlf ? crlfHeaderEnd : lfHeaderEnd;
    if (headerEnd === -1) break;
    const header = buffer.subarray(0, headerEnd).toString('utf8');
    const match = header.match(/Content-Length:\s*(\d+)/i);
    if (!match) {
      buffer = Buffer.alloc(0);
      throw new Error(`bad MCP header: ${header}`);
    }
    const length = Number(match[1]);
    const bodyStart = headerEnd + (usesCrlf ? 4 : 2);
    const bodyEnd = bodyStart + length;
    if (buffer.length < bodyEnd) break;
    const body = buffer.subarray(bodyStart, bodyEnd).toString('utf8');
    buffer = buffer.subarray(bodyEnd);
    messages.push(JSON.parse(body));
  }
  return messages;
}

async function handleMessage(message) {
  if (message.method === 'initialize') {
    send({
      jsonrpc: '2.0',
      id: message.id,
      result: {
        protocolVersion: message.params?.protocolVersion || '2024-11-05',
        capabilities: {
          tools: {},
        },
        serverInfo: {
          name: 'ollama-bridge',
          version: '1.0.0',
        },
      },
    });
    return;
  }

  if (message.method === 'notifications/initialized') return;

  if (message.method === 'tools/list') {
    send({
      jsonrpc: '2.0',
      id: message.id,
      result: {
        tools: [
          {
            name: 'ollama_models',
            description: 'List local Ollama models from the configured Ollama runtime.',
            inputSchema: {
              type: 'object',
              properties: {},
            },
          },
          {
            name: 'ollama_run',
            description: 'Run a prompt through a local Ollama model.',
            inputSchema: {
              type: 'object',
              required: ['prompt'],
              properties: {
                prompt: { type: 'string' },
                model: { type: 'string' },
                system: { type: 'string' },
              },
            },
          },
          {
            name: 'ollama_explore_files',
            description: 'Read a small bounded set of workspace files and optionally summarize them with Ollama.',
            inputSchema: {
              type: 'object',
              required: ['paths'],
              properties: {
                paths: {
                  type: 'array',
                  items: { type: 'string' },
                  maxItems: 5,
                },
                prompt: { type: 'string' },
                model: { type: 'string' },
              },
            },
          },
        ],
      },
    });
    return;
  }

  if (message.method === 'tools/call') {
    const { name, arguments: args = {} } = message.params || {};
    const result = await callTool(name, args);
    send({
      jsonrpc: '2.0',
      id: message.id,
      result: {
        content: [{ type: 'text', text: result }],
      },
    });
    return;
  }

  if (message.id !== undefined) {
    sendError(message.id, -32601, `unknown method: ${message.method}`);
  }
}

async function callTool(name, args) {
  if (name === 'ollama_models') {
    const response = await fetchJson('/api/tags');
    return JSON.stringify(response, null, 2);
  }

  if (name === 'ollama_run') {
    if (!args.prompt || typeof args.prompt !== 'string') throw new Error('prompt is required');
    const response = await fetchJson('/api/generate', {
      method: 'POST',
      body: JSON.stringify({
        model: args.model || DEFAULT_MODEL,
        prompt: args.prompt,
        system: args.system,
        stream: false,
      }),
    });
    return response.response || JSON.stringify(response, null, 2);
  }

  if (name === 'ollama_explore_files') {
    if (!Array.isArray(args.paths) || args.paths.length === 0) throw new Error('paths is required');
    const files = args.paths.slice(0, 5).map(readBoundedFile).join('\n\n');
    if (!args.prompt) return files;
    const response = await fetchJson('/api/generate', {
      method: 'POST',
      body: JSON.stringify({
        model: args.model || DEFAULT_MODEL,
        prompt: `${args.prompt}\n\n${files}`,
        stream: false,
      }),
    });
    return response.response || JSON.stringify(response, null, 2);
  }

  throw new Error(`unknown tool: ${name}`);
}

async function fetchJson(route, options = {}) {
  let response;
  try {
    response = await fetch(`${OLLAMA_URL}${route}`, {
      ...options,
      headers: {
        'content-type': 'application/json',
        ...(options.headers || {}),
      },
    });
  } catch (error) {
    throw new Error(`Ollama is not reachable at ${OLLAMA_URL}: ${error.message}`);
  }
  const text = await response.text();
  if (!response.ok) throw new Error(`Ollama ${route} failed ${response.status}: ${text}`);
  return text ? JSON.parse(text) : {};
}

function readBoundedFile(inputPath) {
  const absolute = path.resolve(REPO_ROOT, inputPath);
  if (!absolute.startsWith(REPO_ROOT + path.sep)) {
    throw new Error(`refusing to read outside workspace: ${inputPath}`);
  }
  const stat = fs.statSync(absolute);
  if (!stat.isFile()) throw new Error(`not a file: ${inputPath}`);
  const content = fs.readFileSync(absolute);
  return [
    `--- ${path.relative(REPO_ROOT, absolute)} (${Math.min(content.length, MAX_FILE_BYTES)} bytes shown) ---`,
    content.subarray(0, MAX_FILE_BYTES).toString('utf8'),
  ].join('\n');
}

function send(payload) {
  const body = Buffer.from(JSON.stringify(payload), 'utf8');
  if (framing === 'newline') {
    process.stdout.write(`${body.toString('utf8')}\n`);
    return;
  }
  process.stdout.write(`Content-Length: ${body.length}\r\n\r\n${body.toString('utf8')}`);
}

function sendError(id, code, message) {
  send({
    jsonrpc: '2.0',
    id,
    error: { code, message },
  });
}
