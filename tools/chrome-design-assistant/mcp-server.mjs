#!/usr/bin/env node

const bridgeOrigin = (process.env.DESIGN_ASSISTANT_BRIDGE_ORIGIN || 'http://127.0.0.1:3004').replace(/\/$/, '');
let buffer = Buffer.alloc(0);

process.stdin.on('data', (chunk) => {
  buffer = Buffer.concat([buffer, chunk]);
  readFrames();
});

function readFrames() {
  while (buffer.length) {
    const headerEnd = buffer.indexOf('\r\n\r\n');
    if (headerEnd === -1) return;
    const header = buffer.slice(0, headerEnd).toString('utf8');
    const match = header.match(/Content-Length:\s*(\d+)/i);
    if (!match) {
      buffer = Buffer.alloc(0);
      return;
    }
    const length = Number(match[1]);
    const frameStart = headerEnd + 4;
    const frameEnd = frameStart + length;
    if (buffer.length < frameEnd) return;
    const payload = buffer.slice(frameStart, frameEnd).toString('utf8');
    buffer = buffer.slice(frameEnd);
    void handle(JSON.parse(payload));
  }
}

async function handle(message) {
  if (message.method === 'notifications/initialized') return;
  try {
    const result = await dispatch(message.method, message.params || {});
    respond(message.id, result);
  } catch (error) {
    respondError(message.id, error?.message || String(error));
  }
}

async function dispatch(method, params) {
  if (method === 'initialize') {
    return {
      protocolVersion: '2024-11-05',
      capabilities: { resources: {}, tools: {} },
      serverInfo: { name: 'chrome-design-assistant', version: '0.1.0' }
    };
  }
  if (method === 'resources/list') {
    return getJson('/api/design-assistant/mcp/resources');
  }
  if (method === 'resources/read') {
    const uri = params.uri;
    const { resource } = await getJson(`/api/design-assistant/mcp/resources/read?uri=${encodeURIComponent(uri)}`);
    return {
      contents: [{
        uri,
        mimeType: 'application/json',
        text: JSON.stringify(resource, null, 2)
      }]
    };
  }
  if (method === 'tools/list') {
    return { tools: toolDefinitions() };
  }
  if (method === 'tools/call') {
    return callTool(params.name, params.arguments || {});
  }
  throw new Error(`Unsupported MCP method: ${method}`);
}

async function callTool(name, args) {
  let result;
  switch (name) {
    case 'design_assistant.capture_page':
      result = await postJson('/api/design-assistant/captures', args);
      break;
    case 'design_assistant.select_element':
      result = await postJson('/api/design-assistant/selections', { ...args, kind: 'element' });
      break;
    case 'design_assistant.select_region':
      result = await postJson('/api/design-assistant/selections', { ...args, kind: 'region' });
      break;
    case 'design_assistant.create_design_request':
      result = await postJson('/api/design-assistant/requests', args);
      break;
    case 'design_assistant.claim_next_request':
      result = await postJson('/api/design-assistant/requests/claim-next', args);
      break;
    case 'design_assistant.get_request':
      result = await getJson(`/api/design-assistant/requests/${encodeURIComponent(args.requestId || args.id || '')}`);
      break;
    case 'design_assistant.post_codex_response':
    case 'design_assistant.post_response':
      result = await postJson('/api/design-assistant/responses', args);
      break;
    case 'design_assistant.mark_applied':
      result = await postJson(`/api/design-assistant/requests/${encodeURIComponent(args.requestId || args.id || '')}/applied`, args);
      break;
    case 'design_assistant.search_history':
      result = await getJson(`/api/design-assistant/history/search?q=${encodeURIComponent(args.query || '')}&limit=${encodeURIComponent(args.limit || 20)}`);
      break;
    default:
      throw new Error(`Unsupported tool: ${name}`);
  }
  return {
    content: [{
      type: 'text',
      text: JSON.stringify(result, null, 2)
    }]
  };
}

function toolDefinitions() {
  const objectSchema = { type: 'object', additionalProperties: true };
  return [
    {
      name: 'design_assistant.capture_page',
      description: 'Persist a browser page capture with screenshotDataUrl, tab, URL, title, viewport, and metadata.',
      inputSchema: objectSchema
    },
    {
      name: 'design_assistant.select_element',
      description: 'Persist an element selection with selector, role, text, bounds, computed styles, structure, and optional crop.',
      inputSchema: objectSchema
    },
    {
      name: 'design_assistant.select_region',
      description: 'Persist a region selection with bounds and optional crop.',
      inputSchema: objectSchema
    },
    {
      name: 'design_assistant.create_design_request',
      description: 'Create a pending Codex design request from capture and selection evidence.',
      inputSchema: objectSchema
    },
    {
      name: 'design_assistant.claim_next_request',
      description: 'Claim the oldest pending browser design request.',
      inputSchema: objectSchema
    },
    {
      name: 'design_assistant.get_request',
      description: 'Read one design request packet by requestId.',
      inputSchema: objectSchema
    },
    {
      name: 'design_assistant.post_response',
      description: 'Post Codex progress or result back to the browser side panel.',
      inputSchema: objectSchema
    },
    {
      name: 'design_assistant.post_codex_response',
      description: 'Alias for design_assistant.post_response.',
      inputSchema: objectSchema
    },
    {
      name: 'design_assistant.mark_applied',
      description: 'Mark a design request applied after Codex implementation and verification.',
      inputSchema: objectSchema
    },
    {
      name: 'design_assistant.search_history',
      description: 'Search design request and response history.',
      inputSchema: objectSchema
    }
  ];
}

async function getJson(path) {
  const response = await fetch(`${bridgeOrigin}${path}`);
  return parseResponse(response);
}

async function postJson(path, body) {
  const response = await fetch(`${bridgeOrigin}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body || {})
  });
  return parseResponse(response);
}

async function parseResponse(response) {
  if (response.status === 204) return {};
  const text = await response.text();
  const json = text ? JSON.parse(text) : {};
  if (!response.ok) {
    throw new Error(json.error || `Bridge request failed: ${response.status}`);
  }
  return json;
}

function respond(id, result) {
  write({ jsonrpc: '2.0', id, result });
}

function respondError(id, message) {
  write({ jsonrpc: '2.0', id, error: { code: -32000, message } });
}

function write(message) {
  const body = JSON.stringify(message);
  process.stdout.write(`Content-Length: ${Buffer.byteLength(body, 'utf8')}\r\n\r\n${body}`);
}
