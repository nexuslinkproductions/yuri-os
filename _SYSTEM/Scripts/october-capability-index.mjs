#!/usr/bin/env node
// @capability: october-external-capability-index
// @serves: October | October MCP | October bus | message_peer | claim_task | send_to_node | wait_for_nodes | UserPromptSubmit | external tool registry | capability discovery
// @does: Projects October's authoritative live MCP tool schemas and installed harness-adapter evidence into a versioned YURI search/xref registry without copying transient canvas state.
// @use: Run --refresh with an attached October canvas plus an explicit app version and bundle SHA; run --validate offline; run --check-live after an October upgrade to detect tool-schema drift.
// @exports: buildRegistry, classifyTool, fetchOctoberTools, parseMcpResponse, schemaDigest, validateRegistry

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../..');
export const REGISTRY_PATH = path.join(ROOT, '_SYSTEM/config/october-capability-registry.json');

const REQUIRED_ENV = ['OCTOBER_BUS_PORT', 'OCTOBER_BUS_CANVAS', 'OCTOBER_BUS_NODE'];
const REQUIRED_TOOLS = ['message_peer', 'claim_task', 'send_to_node', 'wait_for_nodes'];

const READ_ONLY = new Set([
  'list_peers', 'get_peer_context', 'find', 'list_tasks', 'list_canvas',
  'get_node_status', 'wait_for_nodes', 'browser_read', 'browser_screenshot',
  'browser_wait_for', 'browser_find', 'browser_snapshot', 'browser_get_network',
  'browser_get_console', 'browser_get_downloads',
]);
const STATEFUL_READ = new Set(['check_inbox']);
const COMMUNICATION_WRITE = new Set(['message_peer', 'send_to_node']);
const BOARD_WRITE = new Set(['add_task', 'claim_task', 'complete_task']);
const CANVAS_WRITE = new Set([
  'add_screen', 'add_terminal', 'import_sessions', 'add_chat', 'rename_node',
  'remove_node', 'add_note', 'add_remotion', 'move_node', 'connect_nodes',
  'disconnect_nodes', 'arrange_nodes',
]);
const PLAN_WRITE = new Set(['create_plan', 'update_plan_item']);
const RUNTIME_WRITE = new Set(['install_video_tools', 'start_dev_server', 'stop_dev_server']);
const USER_INTERACTION = new Set(['ask_user', 'speak']);
const BROWSER_WRITE = new Set([
  'browser_navigate', 'browser_click', 'browser_type', 'browser_press_key',
  'browser_scroll', 'browser_upload', 'browser_eval',
]);

const TOOL_ALIASES = {
  message_peer: ['communicate with another agent', 'reply to peer', 'October bus message'],
  claim_task: ['atomically claim board work', 'task ownership', 'shared task board'],
  send_to_node: ['drive terminal agent', 'queue prompt to node', 'dispatch work'],
  wait_for_nodes: ['wait until agent idle', 'sequence dependent work', 'worker completion'],
  find: ['October AI search', 'semantic canvas workspace search'],
};

export const LIFECYCLE_ENDPOINTS = [
  {
    id: 'october.context.pull',
    endpoint: '/hook/pre-prompt',
    method: 'GET',
    purpose: 'Pull unread peer context and messages before a model turn.',
    projections: [
      'Claude UserPromptSubmit', 'Codex UserPromptSubmit', 'Gemini BeforeAgent',
      'OpenCode chat.message', 'Pi/Campfire before_agent_start',
      'Cline beforeModel', 'Hermes pre_llm_call', 'Cursor sessionStart/stop followup',
    ],
  },
  {
    id: 'october.turn.complete',
    endpoint: '/hook/stop',
    method: 'POST',
    purpose: 'Report a completed turn excerpt for October status and summary handling.',
    projections: ['Claude/Codex Stop', 'Gemini AfterAgent', 'OpenCode session.idle', 'Pi/Campfire agent_end', 'Cline afterRun', 'Hermes post_llm_call', 'Cursor stop'],
  },
  {
    id: 'october.session.status',
    endpoint: '/hook/session',
    method: 'POST',
    purpose: 'Report attached harness session live/offline state and resumable session identity where supported.',
  },
  {
    id: 'october.attention.notify',
    endpoint: '/hook/notify',
    method: 'POST',
    purpose: 'Raise the terminal needs-user-attention signal for approval or notification events.',
  },
  {
    id: 'october.peer.message.bridge',
    endpoint: '/hook/message-peer',
    method: 'POST',
    purpose: 'Native non-MCP bridge used by harness extensions that cannot host an MCP client.',
  },
  {
    id: 'october.task.board.bridge',
    endpoint: '/hook/task',
    method: 'POST',
    purpose: 'Native add/claim/complete/list task bridge for Pi-family and Cline extensions.',
  },
];

export const HARNESS_ADAPTERS = [
  {
    harness: 'claude-code',
    transport: 'project MCP plus generated command hooks',
    projection: '.mcp.json + .claude/settings.local.json',
    events: ['SessionStart', 'UserPromptSubmit', 'Stop', 'SessionEnd', 'Notification'],
    outerTimeoutMs: 5000,
  },
  {
    harness: 'codex',
    transport: 'project MCP plus generated hooks',
    projection: '.codex/config.toml + .codex/hooks.json',
    events: ['SessionStart', 'UserPromptSubmit', 'Stop', 'PermissionRequest'],
    outerTimeoutMs: 10000,
  },
  {
    harness: 'opencode',
    transport: 'remote MCP plus generated plugin',
    projection: 'opencode.json + .opencode/plugins/october-bus.js',
    events: ['chat.message', 'permission.ask', 'session.idle'],
  },
  {
    harness: 'cursor',
    transport: 'MCP plus generated global hooks',
    projection: '.cursor/mcp.json + .cursor/cli.json + ~/.cursor/hooks.json',
    events: ['sessionStart', 'stop', 'sessionEnd'],
    outerTimeoutMs: 10000,
  },
  {
    harness: 'gemini',
    transport: 'MCP plus generated project hooks',
    projection: '.gemini/settings.json',
    events: ['SessionStart', 'BeforeAgent', 'AfterAgent', 'Notification'],
    outerTimeoutMs: 5000,
  },
  {
    harness: 'grok',
    transport: 'MCP plus generated global hooks',
    projection: '.grok/config.toml + ~/.grok/hooks/october.json',
    events: ['SessionStart', 'Stop', 'SessionEnd', 'Notification'],
    outerTimeoutMs: 10000,
  },
  {
    harness: 'pi',
    transport: 'generated native extension and native message/task tools',
    projection: '~/.pi/agent/extensions/october-bus.ts',
    events: ['session_start', 'session_shutdown', 'before_agent_start', 'agent_end'],
  },
  {
    harness: 'campfire',
    transport: 'generated Pi-family native extension and native message/task tools',
    projection: '~/.campfire/agent/extensions/october-bus.ts',
    events: ['session_start', 'session_shutdown', 'before_agent_start', 'agent_end'],
  },
  {
    harness: 'cline',
    transport: 'generated native plugin and native message/task tools',
    projection: '~/.cline/plugins/october-bus.ts',
    events: ['beforeModel', 'afterRun'],
  },
  {
    harness: 'hermes',
    transport: 'generated Python plugin',
    projection: '~/.hermes/plugins/october-bus',
    events: ['on_session_start', 'pre_llm_call', 'post_llm_call', 'pre_approval_request'],
    internalTimeoutMs: 3000,
  },
];

export const VERSIONED_FINDINGS = [
  {
    id: 'october.user-prompt-submit.fetch-deadline',
    affectedVersion: '1.0.30',
    status: 'reproduced',
    event: 'Claude UserPromptSubmit',
    owner: 'October generator',
    symptom: 'The generated pre-prompt command can be killed by the 5-second outer hook timeout and shown as a hook failure.',
    cause: 'pullInjection fetches /hook/pre-prompt without an internal AbortSignal deadline; a stalled October event loop outlives the outer hook budget.',
    evidence: 'A controlled stalled-loopback fixture remained blocked at 5200ms and required SIGTERM; healthy live, missing-env, and closed-port fixtures exited 0.',
    requiredFix: 'Use a fail-soft internal request deadline materially shorter than every outer harness timeout, emit nothing on timeout, and add a stalled-server regression fixture. Do not hand-edit ~/.october/bus-hook.mjs because October regenerates it.',
  },
];

function groupFor(name) {
  if (name.startsWith('browser_')) return 'browser';
  if (['list_peers', 'get_peer_context', 'message_peer', 'check_inbox'].includes(name)) return 'peer-bus';
  if (['add_task', 'claim_task', 'complete_task', 'list_tasks'].includes(name)) return 'task-board';
  if (['create_plan', 'update_plan_item'].includes(name)) return 'plan';
  if (['get_node_status', 'wait_for_nodes', 'send_to_node'].includes(name)) return 'worker-orchestration';
  if (['list_canvas', 'add_screen', 'add_terminal', 'import_sessions', 'add_chat', 'rename_node', 'remove_node', 'add_note', 'add_remotion', 'move_node', 'connect_nodes', 'disconnect_nodes', 'arrange_nodes'].includes(name)) return 'canvas';
  if (['start_dev_server', 'stop_dev_server', 'install_video_tools'].includes(name)) return 'local-runtime';
  if (['ask_user', 'speak'].includes(name)) return 'user-interaction';
  if (name === 'find') return 'semantic-search';
  return 'unclassified';
}

export function classifyTool(name) {
  const group = groupFor(name);
  if (READ_ONLY.has(name)) return { group, authorizationClass: 'read-only', stateEffect: 'none', userConfirmation: false };
  if (STATEFUL_READ.has(name)) return { group, authorizationClass: 'stateful-read', stateEffect: 'consumes queued inbox entries', userConfirmation: false };
  if (COMMUNICATION_WRITE.has(name)) return { group, authorizationClass: 'communication-write', stateEffect: 'delivers a message or queued prompt', userConfirmation: false };
  if (BOARD_WRITE.has(name)) return { group, authorizationClass: 'board-write', stateEffect: 'mutates shared task-board state', userConfirmation: false };
  if (CANVAS_WRITE.has(name)) return { group, authorizationClass: 'canvas-write', stateEffect: 'mutates canvas or launches/removes a session', userConfirmation: false };
  if (PLAN_WRITE.has(name)) return { group, authorizationClass: 'plan-write', stateEffect: 'mutates visible plan state', userConfirmation: false };
  if (RUNTIME_WRITE.has(name)) return { group, authorizationClass: 'local-runtime-write', stateEffect: 'installs tooling or starts/stops a local process', userConfirmation: name === 'install_video_tools' };
  if (USER_INTERACTION.has(name)) return { group, authorizationClass: 'user-interaction', stateEffect: 'asks or speaks to the user', userConfirmation: false };
  if (BROWSER_WRITE.has(name)) return { group, authorizationClass: 'browser-control', stateEffect: 'changes connected browser state or submits page input', userConfirmation: ['browser_upload', 'browser_eval'].includes(name) };
  return { group, authorizationClass: 'unclassified', stateEffect: 'unknown', userConfirmation: true };
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]));
}

function stableJson(value) {
  return JSON.stringify(canonicalize(value));
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function rawToolProjection(tool) {
  return {
    name: String(tool?.name ?? ''),
    description: String(tool?.description ?? '').trim(),
    inputSchema: canonicalize(tool?.inputSchema ?? {}),
    execution: canonicalize(tool?.execution ?? {}),
  };
}

export function schemaDigest(tools) {
  const projected = tools.map(rawToolProjection).sort((a, b) => a.name.localeCompare(b.name));
  return sha256(stableJson(projected));
}

function normalizeTool(tool) {
  const raw = rawToolProjection(tool);
  const classification = classifyTool(raw.name);
  return {
    ...raw,
    ...classification,
    authority: 'October',
    invocation: `October MCP tools/call name=${raw.name}`,
    aliases: TOOL_ALIASES[raw.name] ?? [],
  };
}

export function buildRegistry(tools, { version, bundleSha256 }) {
  if (!Array.isArray(tools) || !tools.length) throw new Error('October tools/list returned no tools');
  if (!version) throw new Error('source version is required');
  if (!/^[a-f0-9]{64}$/i.test(String(bundleSha256 ?? ''))) throw new Error('64-character bundle SHA-256 is required');
  const normalized = tools.map(normalizeTool).sort((a, b) => a.name.localeCompare(b.name));
  return {
    schemaVersion: 1,
    kind: 'external-capability-projection',
    authority: {
      owner: 'October',
      canonicalSource: 'Live attached October MCP tools/list plus installed October adapter generator',
      projectionOwner: 'YURI xref/context layer',
      rule: 'October defines these capabilities. YURI indexes and validates a versioned projection; it does not redefine the implementations or persist transient canvas/node identities.',
      version: String(version),
      bundleSha256: String(bundleSha256).toLowerCase(),
    },
    transport: {
      endpointTemplate: 'http://127.0.0.1:${OCTOBER_BUS_PORT}/mcp',
      requiredEnvironment: REQUIRED_ENV,
      headers: {
        'X-October-Canvas': '${OCTOBER_BUS_CANVAS}',
        'X-October-Node': '${OCTOBER_BUS_NODE}',
      },
      discovery: 'JSON-RPC tools/list',
    },
    toolCount: normalized.length,
    toolSchemaSha256: schemaDigest(tools),
    tools: normalized,
    lifecycleEndpoints: LIFECYCLE_ENDPOINTS,
    harnessAdapters: HARNESS_ADAPTERS,
    versionedFindings: VERSIONED_FINDINGS,
  };
}

export function parseMcpResponse(text) {
  const raw = String(text ?? '').trim();
  if (!raw) throw new Error('empty October MCP response');
  const payloads = raw.startsWith('{')
    ? [JSON.parse(raw)]
    : raw.split(/\r?\n/)
      .filter((line) => line.startsWith('data:'))
      .map((line) => JSON.parse(line.slice(5).trim()));
  const message = payloads.find((entry) => entry?.result?.tools || entry?.error) ?? payloads.at(-1);
  if (message?.error) throw new Error(`October MCP error: ${JSON.stringify(message.error)}`);
  if (!Array.isArray(message?.result?.tools)) throw new Error('October MCP response did not contain result.tools');
  return message.result.tools;
}

export async function fetchOctoberTools(env = process.env, { timeoutMs = 2000, fetchImpl = globalThis.fetch } = {}) {
  for (const key of REQUIRED_ENV) if (!env[key]) throw new Error(`missing ${key}; run inside an October-attached session`);
  if (typeof fetchImpl !== 'function') throw new Error('fetch is unavailable');
  const response = await fetchImpl(`http://127.0.0.1:${env.OCTOBER_BUS_PORT}/mcp`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
      'X-October-Canvas': env.OCTOBER_BUS_CANVAS,
      'X-October-Node': env.OCTOBER_BUS_NODE,
    },
    body: JSON.stringify({ jsonrpc: '2.0', id: 'yuri-october-capability-index', method: 'tools/list', params: {} }),
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!response.ok) throw new Error(`October MCP tools/list failed HTTP ${response.status}`);
  return parseMcpResponse(await response.text());
}

export function validateRegistry(registry) {
  const errors = [];
  if (registry?.schemaVersion !== 1) errors.push('schemaVersion must be 1');
  if (registry?.kind !== 'external-capability-projection') errors.push('kind must be external-capability-projection');
  if (registry?.authority?.owner !== 'October') errors.push('October must remain the capability authority');
  if (!/^[a-f0-9]{64}$/i.test(String(registry?.authority?.bundleSha256 ?? ''))) errors.push('bundle SHA-256 missing or invalid');
  if (!Array.isArray(registry?.tools) || registry.tools.length === 0) errors.push('tools must be a non-empty array');
  const names = (registry?.tools ?? []).map((tool) => tool.name);
  if (new Set(names).size !== names.length) errors.push('tool names must be unique');
  if (names.join('\n') !== [...names].sort().join('\n')) errors.push('tools must be sorted by name');
  if (registry?.toolCount !== names.length) errors.push('toolCount does not match tools length');
  for (const required of REQUIRED_TOOLS) if (!names.includes(required)) errors.push(`required October tool missing: ${required}`);
  for (const tool of registry?.tools ?? []) if (tool.authorizationClass === 'unclassified') errors.push(`unclassified October tool: ${tool.name}`);
  const raw = (registry?.tools ?? []).map(({ name, description, inputSchema, execution }) => ({ name, description, inputSchema, execution }));
  if (registry?.toolSchemaSha256 !== schemaDigest(raw)) errors.push('toolSchemaSha256 does not match tool schemas');
  const lifecycleText = JSON.stringify(registry?.lifecycleEndpoints ?? []);
  const adapterText = JSON.stringify(registry?.harnessAdapters ?? []);
  if (!lifecycleText.includes('pre-prompt') || !adapterText.includes('UserPromptSubmit')) errors.push('UserPromptSubmit/pre-prompt projection is missing');
  const serialized = JSON.stringify(registry);
  if (/term-[a-z0-9-]+/i.test(serialized)) errors.push('transient October node id leaked into durable registry');
  return { ok: errors.length === 0, errors };
}

function option(name) {
  const i = process.argv.indexOf(name);
  return i === -1 ? null : process.argv[i + 1] ?? null;
}

function readRegistry() {
  return JSON.parse(fs.readFileSync(REGISTRY_PATH, 'utf8'));
}

async function main() {
  if (process.argv.includes('--refresh')) {
    const version = option('--source-version');
    const bundleSha256 = option('--bundle-sha256');
    const tools = await fetchOctoberTools();
    const registry = buildRegistry(tools, { version, bundleSha256 });
    const verdict = validateRegistry(registry);
    if (!verdict.ok) throw new Error(`generated registry invalid: ${verdict.errors.join('; ')}`);
    fs.mkdirSync(path.dirname(REGISTRY_PATH), { recursive: true });
    fs.writeFileSync(REGISTRY_PATH, `${JSON.stringify(registry, null, 2)}\n`);
    console.log(JSON.stringify({ ok: true, action: 'refreshed', version, tools: registry.toolCount, digest: registry.toolSchemaSha256, path: path.relative(ROOT, REGISTRY_PATH) }));
    return;
  }

  const registry = readRegistry();
  const verdict = validateRegistry(registry);
  if (!verdict.ok) {
    console.error(JSON.stringify(verdict));
    process.exitCode = 1;
    return;
  }

  if (process.argv.includes('--check-live')) {
    const tools = await fetchOctoberTools();
    const liveDigest = schemaDigest(tools);
    const ok = liveDigest === registry.toolSchemaSha256;
    console.log(JSON.stringify({ ok, snapshotVersion: registry.authority.version, snapshotTools: registry.toolCount, liveTools: tools.length, snapshotDigest: registry.toolSchemaSha256, liveDigest }));
    if (!ok) process.exitCode = 1;
    return;
  }

  if (process.argv.includes('--print')) console.log(JSON.stringify(registry, null, 2));
  else console.log(JSON.stringify({ ok: true, action: 'validated', version: registry.authority.version, tools: registry.toolCount, digest: registry.toolSchemaSha256 }));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(`october-capability-index: ${error.message}`);
    process.exitCode = 1;
  });
}
