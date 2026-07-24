import assert from 'node:assert/strict';
import http from 'node:http';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  CLAUDE_OCTOBER_MCP_SERVER_NAME,
  HARNESS_ADAPTERS,
  NATIVE_OMP_APP_PATH,
  OMP_REQUIRED_NATIVE_TOOLS,
  PI_REQUIRED_NATIVE_TOOLS,
  buildRegistry,
  checkOmpActivationFromDisk,
  checkPiActivationFromDisk,
  classifyTool,
  evaluateOmpActivation,
  evaluatePiActivation,
  fetchOctoberTools,
  inspectOmpAdapterSource,
  inspectOmpLauncherSource,
  inspectPiGeneratedSource,
  parseMcpResponse,
  schemaDigest,
  syncLocalProjections,
  validateClaudeOctoberMcpConfiguration,
  validateRegistry,
} from './october-capability-index.mjs';

const FIXTURE_TOOLS = [
  { name: 'wait_for_nodes', description: 'Wait for workers.', inputSchema: { type: 'object' } },
  { name: 'send_to_node', description: 'Drive a worker.', inputSchema: { type: 'object' } },
  { name: 'claim_task', description: 'Claim a task atomically.', inputSchema: { type: 'object' } },
  { name: 'message_peer', description: 'Message a peer.', inputSchema: { type: 'object' } },
  { name: 'browser_read', description: 'Read a browser.', inputSchema: { type: 'object' } },
];
const META = { version: '1.0.30', bundleSha256: 'a'.repeat(64) };
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const PI_SOURCE_FIXTURE = `
export default async function (pi) {
  const PORT = process.env.OCTOBER_BUS_PORT
  const CANVAS = process.env.OCTOBER_BUS_CANVAS
  const NODE = process.env.OCTOBER_BUS_NODE
  if (!PORT || !CANVAS || !NODE) return
  const pull = () => fetch('/hook/pre-prompt')
  pi.on('session_start', () => fetch('/hook/session'))
  pi.on('session_shutdown', () => {})
  pi.on('before_agent_start', async () => ({ message: { content: await pull() } }))
  try {
    const { Type } = await import('typebox')
    pi.registerTool({ name: 'message_peer', parameters: Type.Object({}) })
    const taskTool = () => {}
    taskTool('add_task')
    taskTool('claim_task')
    taskTool('complete_task')
    taskTool('list_tasks')
  } catch { /* typebox virtual module unavailable (old pi) — runs without the tools */ }
}`;
const PI_ENV = {
  OCTOBER_BUS_PORT: '27124',
  OCTOBER_BUS_CANVAS: 'canvas-fixture',
  OCTOBER_BUS_NODE: 'node-fixture',
};
const OMP_ADAPTER_SOURCE_FIXTURE = `
export const OCTOBER_PI_TOOL_NAMES = ['message_peer', 'add_task', 'claim_task', 'complete_task', 'list_tasks']
const REQUEST_TIMEOUT_MS = 2500
function registerOctoberPiTools(pi) {
  const attachment = {
    port: process.env.OCTOBER_BUS_PORT,
    canvas: process.env.OCTOBER_BUS_CANVAS,
    node: process.env.OCTOBER_BUS_NODE,
  }
  const z = pi.zod?.z
  const controller = new AbortController()
  const base = \`http://127.0.0.1:\${attachment.port}\`
  const register = (definition) => pi.registerTool({ ...definition, loadMode: 'essential' })
  register({ name: 'message_peer', parameters: z.object({}) })
  const taskTool = () => {}
  taskTool('add_task')
  taskTool('claim_task')
  taskTool('complete_task')
  taskTool('list_tasks')
  fetch('/hook/message-peer')
  fetch('/hook/task')
  return { controller, base }
}
export default function octoberPiEssentialTools(pi) {
  return registerOctoberPiTools(pi)
}
`;
const OMP_LAUNCHER_SOURCE_FIXTURE = `#!/bin/zsh
set -eu
omp "$@"
`;
const CLAUDE_MCP_FIXTURE = {
  mcpConfig: {
    mcpServers: {
      october: { type: 'http', url: 'http://127.0.0.1:27124/mcp' },
      voice: { command: 'voice-mcp' },
    },
  },
  claudeSettings: {
    enabledMcpjsonServers: ['october', 'voice'],
    permissions: {
      allow: ['mcp__october__*', 'mcp__voice__*'],
    },
    voice: { mode: 'push-to-talk' },
  },
};
const CLAUDE_MCP_NAME_MISMATCH_FIXTURE = {
  mcpConfig: {
    mcpServers: {
      voice: structuredClone(CLAUDE_MCP_FIXTURE.mcpConfig.mcpServers.voice),
    },
  },
  claudeSettings: {
    ...structuredClone(CLAUDE_MCP_FIXTURE.claudeSettings),
    enabledMcpjsonServers: ['october-bus', 'voice'],
    permissions: {
      allow: ['mcp__october-bus__*', 'mcp__voice__*'],
    },
  },
};

function listen(handler) {
  const server = http.createServer(handler);
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server)));
}

test('classifies representative October side effects', () => {
  assert.equal(classifyTool('browser_read').authorizationClass, 'read-only');
  assert.equal(classifyTool('check_inbox').authorizationClass, 'stateful-read');
  assert.equal(classifyTool('claim_task').authorizationClass, 'board-write');
  assert.equal(classifyTool('send_to_node').authorizationClass, 'communication-write');
  assert.equal(classifyTool('browser_eval').userConfirmation, true);
});

test('parses JSON and SSE MCP tools/list envelopes', () => {
  const payload = { jsonrpc: '2.0', id: 1, result: { tools: FIXTURE_TOOLS } };
  assert.equal(parseMcpResponse(JSON.stringify(payload)).length, FIXTURE_TOOLS.length);
  assert.equal(parseMcpResponse(`event: message\ndata: ${JSON.stringify(payload)}\n\n`).length, FIXTURE_TOOLS.length);
});

test('registry build is sorted, deterministic, external-authority, and valid', () => {
  const a = buildRegistry(FIXTURE_TOOLS, META);
  const b = buildRegistry([...FIXTURE_TOOLS].reverse(), META);
  assert.equal(a.toolSchemaSha256, b.toolSchemaSha256);
  assert.deepEqual(a.tools.map((tool) => tool.name), [...a.tools.map((tool) => tool.name)].sort());
  assert.equal(a.authority.owner, 'October');
  assert.match(a.authority.rule, /does not redefine/);
  assert.equal(validateRegistry(a).ok, true);
  assert.equal(schemaDigest(FIXTURE_TOOLS), a.toolSchemaSha256);
});

test('local projection sync replaces only harness adapters and restores validity', () => {
  const registry = buildRegistry(FIXTURE_TOOLS, META);
  const stale = structuredClone(registry);
  const pi = stale.harnessAdapters.find((adapter) => adapter.harness === 'pi');
  pi.compatibilityAdapter = { path: '.omp/extensions/october-bus-tools.mjs' };
  stale.harnessAdapters = stale.harnessAdapters.filter((adapter) => adapter.harness !== 'omp');
  assert.equal(validateRegistry(stale).ok, false);

  const externalBefore = structuredClone(stale);
  delete externalBefore.harnessAdapters;
  const synchronized = syncLocalProjections(stale);
  const externalAfter = structuredClone(synchronized);
  delete externalAfter.harnessAdapters;

  assert.deepEqual(externalAfter, externalBefore);
  assert.deepEqual(synchronized.harnessAdapters, HARNESS_ADAPTERS);
  assert.equal(validateRegistry(synchronized).ok, true);
  assert.equal(JSON.stringify(synchronized).includes('term-'), false);
  assert.equal(JSON.stringify(synchronized).includes('http://127.0.0.1:27124/mcp'), false);
});

test('Claude October MCP server name is configured, enabled, and permission-aligned without touching voice settings', () => {
  const before = structuredClone(CLAUDE_MCP_FIXTURE);
  const verdict = validateClaudeOctoberMcpConfiguration(CLAUDE_MCP_FIXTURE);

  assert.equal(CLAUDE_OCTOBER_MCP_SERVER_NAME, 'october');
  assert.equal(verdict.ok, true);
  assert.deepEqual(verdict.checks, {
    configuredServerExists: true,
    configuredServerEnabled: true,
    permissionNamespaceMatches: true,
  });
  assert.equal(verdict.expectedPermissionNamespace, 'mcp__october__*');
  assert.ok(verdict.configuredServerNames.includes('voice'));
  assert.ok(verdict.enabledServerNames.includes('voice'));
  assert.ok(verdict.permissionAllow.includes('mcp__voice__*'));
  assert.deepEqual(CLAUDE_MCP_FIXTURE, before);
});

test('Claude October MCP validator rejects the former undefined october-bus name and permission namespace', () => {
  const verdict = validateClaudeOctoberMcpConfiguration(CLAUDE_MCP_NAME_MISMATCH_FIXTURE);

  assert.equal(verdict.ok, false);
  assert.deepEqual(verdict.checks, {
    configuredServerExists: false,
    configuredServerEnabled: false,
    permissionNamespaceMatches: false,
  });
  assert.ok(verdict.errors.includes('.mcp.json is missing MCP server "october"'));
  assert.ok(verdict.errors.includes('Claude settings do not enable MCP server "october"'));
  assert.ok(verdict.errors.includes('Claude settings are missing permission namespace "mcp__october__*"'));
});

test('cross-harness activation keeps real Pi generator-owned and OMP native-host-owned', () => {
  const adapters = new Map(HARNESS_ADAPTERS.map((adapter) => [adapter.harness, adapter]));
  const claude = adapters.get('claude-code');
  const codex = adapters.get('codex');
  const pi = adapters.get('pi');
  const omp = adapters.get('omp');

  assert.equal(claude.activationSource.path, '.mcp.json');
  assert.equal(claude.activationSource.mcpTransport, 'streamable-http');
  assert.equal(codex.activationSource.path, '.codex/config.toml');
  assert.equal(codex.activationSource.mcpTransport, 'stdio-http-bridge');
  assert.equal(codex.activationSource.bridgePath, '_SYSTEM/Scripts/october-mcp-stdio-bridge.mjs');
  assert.equal(codex.activationSource.rootResolution, 'git rev-parse --show-toplevel');
  assert.match(codex.activationSource.endpointTemplate, /\$\{OCTOBER_BUS_PORT\}/);
  assert.equal(pi.activationSource.kind, 'october-generated');
  assert.equal(pi.activationSource.path, '~/.pi/agent/extensions/october-bus.ts');
  assert.equal(pi.activationSource.status, 'generated-source-only');
  assert.equal(pi.activationSource.liveInferredFromPath, false);
  assert.equal(pi.projection, '~/.pi/agent/extensions/october-bus.ts');
  assert.equal(JSON.stringify(pi).includes('.omp/'), false);
  assert.equal(pi.activationHealth.status, 'source-ready-session-reload-required');
  assert.deepEqual(pi.activationHealth.nativeToolRegistration.requiredTools, PI_REQUIRED_NATIVE_TOOLS);
  assert.equal(pi.activationHealth.prePromptContext.event, 'before_agent_start');

  assert.equal(omp.activationSource.kind, 'native-omp-host');
  assert.equal(omp.activationSource.path, NATIVE_OMP_APP_PATH);
  assert.equal(omp.activationSource.managedBy, 'October');
  assert.equal(omp.activationSource.implementationAuthority, 'October');
  assert.equal(omp.activationSource.protocolAuthority, 'October');
  assert.equal(omp.activationSource.recognizedHarnessFamily, 'omp');
  assert.equal(omp.activationSource.resolvedRuntime, 'omp');
  assert.equal(omp.activationSource.liveInferredFromPath, false);
  assert.equal(JSON.stringify(omp).includes('_SYSTEM/Scripts/october-omp/pi'), false);
  assert.equal('outboundAdapter' in omp, false);
  assert.equal(omp.activationHealth.nativeHost.path, NATIVE_OMP_APP_PATH);
  assert.deepEqual(omp.activationHealth.nativeToolRegistration.requiredTools, OMP_REQUIRED_NATIVE_TOOLS);
  assert.equal(omp.activationHealth.inboundDelivery.authority, 'October');
  assert.equal(omp.activationHealth.inboundDelivery.mode, 'native-terminal-delivery');
  assert.equal('pollingAllowed' in omp.activationHealth.inboundDelivery, false);
});

test('OMP project adapter source uses injected Zod and stays outbound-only', () => {
  const source = inspectOmpAdapterSource(OMP_ADAPTER_SOURCE_FIXTURE);
  assert.equal(source.ok, true);
  assert.deepEqual(source.declaredNativeTools, OMP_REQUIRED_NATIVE_TOOLS);
  assert.equal(source.checks.hostInjectedZod, true);
  assert.equal(source.checks.noTypeboxImport, true);
  assert.equal(source.checks.essentialToolLoadMode, true);
  assert.equal(source.checks.outboundPeerEndpoint, true);
  assert.equal(source.checks.outboundTaskEndpoint, true);
  assert.equal(source.checks.defaultExportIsOutboundOnly, true);
});

test('OMP launcher source preserves the persistent Pi-family wrapper parent', () => {
  const source = inspectOmpLauncherSource(OMP_LAUNCHER_SOURCE_FIXTURE);
  assert.equal(source.ok, true);
  assert.equal(source.checks.noExecReplacement, true);
  assert.equal(source.checks.foregroundChild, true);
  assert.equal(source.checks.noCodexFallback, true);

  assert.equal(inspectOmpLauncherSource('#!/bin/zsh\nexec omp "$@"\n').ok, false);
  assert.equal(inspectOmpLauncherSource('#!/bin/zsh\nomp "$@" &\n').ok, false);
  assert.equal(inspectOmpLauncherSource('#!/bin/zsh\ncodex\n').ok, false);
});

test('actual native OMP host is identified without inferring runtime activation', () => {
  const verdict = checkOmpActivationFromDisk({ env: {} });
  assert.equal(verdict.nativeHostPath, NATIVE_OMP_APP_PATH);
  assert.equal(typeof verdict.nativeHostPresent, 'boolean');
  assert.equal(verdict.live, false);
  assert.equal(verdict.status, 'runtime-unverified');
  assert.equal(verdict.checks.nativeHostIdentityObserved, false);
});

test('Pi generated source diagnostics encode all three observed silent generator defects', () => {
  const source = inspectPiGeneratedSource(PI_SOURCE_FIXTURE);
  assert.equal(source.ok, true);
  assert.deepEqual(source.declaredNativeTools, PI_REQUIRED_NATIVE_TOOLS);
  assert.deepEqual(source.observedGeneratorDefects, {
    missingEnvironmentEarlyReturn: true,
    sessionStartDoesNotPullContext: true,
    silentTypeboxToolFailure: true,
  });
});

test('real Pi health never infers live activation from a generated path or source alone', () => {
  const sourceOnly = evaluatePiActivation({
    env: PI_ENV,
    extensionPresent: true,
    extensionSource: PI_SOURCE_FIXTURE,
  });
  assert.equal(sourceOnly.live, false);
  assert.equal(sourceOnly.status, 'runtime-unverified');
  assert.equal(sourceOnly.checks.generatedSourceContract, true);
  assert.equal(sourceOnly.checks.generatedExtensionLoaded, false);
  assert.equal(sourceOnly.checks.intendedNativeToolsRegistered, false);
  assert.equal(sourceOnly.checks.beforeAgentStartContextInjected, false);

  const typeboxFailure = evaluatePiActivation({
    env: PI_ENV,
    extensionPresent: true,
    extensionSource: PI_SOURCE_FIXTURE,
    runtime: {
      harnessIdentityObserved: 'pi',
      startupEnvironmentObserved: true,
      extensionLoaded: true,
      registeredTools: [],
      beforeAgentStartContextInjected: true,
    },
  });
  assert.equal(typeboxFailure.live, false);
  assert.equal(typeboxFailure.status, 'unhealthy');
  assert.deepEqual(typeboxFailure.missingNativeTools, PI_REQUIRED_NATIVE_TOOLS);

  const healthy = evaluatePiActivation({
    env: PI_ENV,
    extensionPresent: true,
    extensionSource: PI_SOURCE_FIXTURE,
    runtime: {
      harnessIdentityObserved: 'pi',
      startupEnvironmentObserved: true,
      extensionLoaded: true,
      registeredTools: PI_REQUIRED_NATIVE_TOOLS,
      beforeAgentStartContextInjected: true,
    },
  });
  assert.equal(healthy.live, true);
  assert.equal(healthy.status, 'live');
  assert.deepEqual(healthy.failures, []);

  const ompEvidenceCannotBypassPi = evaluatePiActivation({
    env: PI_ENV,
    extensionPresent: true,
    extensionSource: PI_SOURCE_FIXTURE,
    runtime: {
      harnessIdentityObserved: 'omp',
      startupEnvironmentObserved: true,
      extensionLoaded: true,
      registeredTools: PI_REQUIRED_NATIVE_TOOLS,
      beforeAgentStartContextInjected: true,
    },
  });
  assert.equal(ompEvidenceCannotBypassPi.live, false);
  assert.ok(ompEvidenceCannotBypassPi.failures.includes('piHarnessIdentityObserved'));

  const externalCheck = checkPiActivationFromDisk({ env: PI_ENV, homeDirectory: null });
  assert.equal(externalCheck.checkerEnvironmentAttached, true);
  assert.equal(externalCheck.startupEnvironmentObserved, false);
  assert.equal(externalCheck.checks.startupEnvironmentAttached, false);
});

test('OMP health is distinct from Pi and requires every live delivery canary', () => {
  const sourceOnly = evaluateOmpActivation({
    env: PI_ENV,
    nativeHostPresent: true,
  });
  assert.equal(sourceOnly.live, false);
  assert.equal(sourceOnly.status, 'runtime-unverified');
  assert.equal(sourceOnly.checks.nativeHostPresent, true);
  assert.equal(sourceOnly.checks.nativeHostIdentityObserved, false);

  const runtime = {
    harnessIdentityObserved: 'omp',
    startupEnvironmentObserved: true,
    nativeHostIdentityObserved: true,
    registeredTools: OMP_REQUIRED_NATIVE_TOOLS,
    nativeDeliveryAuthorityObserved: 'October',
    nativeIdleDeliveryVerified: true,
    nativeBusyDeliveryVerified: true,
    outboundPeerDeliveryVerified: true,
  };
  const healthy = evaluateOmpActivation({
    env: PI_ENV,
    nativeHostPresent: true,
    runtime,
  });
  assert.equal(healthy.live, true);
  assert.deepEqual(healthy.failures, []);

  for (const field of [
    'nativeHostIdentityObserved',
    'nativeIdleDeliveryVerified',
    'nativeBusyDeliveryVerified',
    'outboundPeerDeliveryVerified',
  ]) {
    const unhealthy = evaluateOmpActivation({
      env: PI_ENV,
      nativeHostPresent: true,
      runtime: { ...runtime, [field]: false },
    });
    assert.equal(unhealthy.live, false, `${field} must gate live activation`);
  }

  const piEvidenceCannotBypassOmp = evaluateOmpActivation({
    env: PI_ENV,
    nativeHostPresent: true,
    runtime: { ...runtime, harnessIdentityObserved: 'pi' },
  });
  assert.equal(piEvidenceCannotBypassOmp.live, false);
  assert.ok(piEvidenceCannotBypassOmp.failures.includes('ompHarnessIdentityObserved'));

  const externalCheck = checkOmpActivationFromDisk({ env: PI_ENV });
  assert.equal(externalCheck.checkerEnvironmentAttached, true);
  assert.equal(externalCheck.startupEnvironmentObserved, false);
  assert.equal(externalCheck.checks.startupEnvironmentAttached, false);
});

test('OMP activation never treats deprecated adapter-side polling as native host health', () => {
  const unsafeAdapter = OMP_ADAPTER_SOURCE_FIXTURE.replace(
    'return registerOctoberPiTools(pi)',
    "registerOctoberInboundBridge(pi)\n  fetch('/hook/pre-prompt')\n  return registerOctoberPiTools(pi)",
  );
  assert.equal(inspectOmpAdapterSource(unsafeAdapter).checks.defaultExportIsOutboundOnly, false);

  const verdict = evaluateOmpActivation({
    env: PI_ENV,
    nativeHostPresent: true,
    adapterSource: unsafeAdapter,
    runtime: {
      harnessIdentityObserved: 'omp',
      startupEnvironmentObserved: true,
      nativeHostIdentityObserved: true,
      registeredTools: OMP_REQUIRED_NATIVE_TOOLS,
      nativeDeliveryAuthorityObserved: 'October',
      nativeIdleDeliveryVerified: true,
      nativeBusyDeliveryVerified: true,
      outboundPeerDeliveryVerified: true,
      idleInboundDeliveryVerified: true,
      busyInboundDeliveryVerified: true,
      singleFlightReplayVerified: true,
    },
  });
  assert.equal(verdict.live, true);
  assert.equal(verdict.checks.nativeHostIdentityObserved, true);
});

test('registry validator rejects a false Pi live claim', () => {
  const registry = structuredClone(buildRegistry(FIXTURE_TOOLS, META));
  const pi = registry.harnessAdapters.find((adapter) => adapter.harness === 'pi');
  pi.activationSource.status = 'live';
  pi.activationSource.liveInferredFromPath = true;
  const verdict = validateRegistry(registry);
  assert.equal(verdict.ok, false);
  assert.ok(verdict.errors.includes('Pi generated extension path must not be treated as live activation'));
});

test('registry validator rejects missing, duplicate, conflated, or wrong-authority OMP projections', () => {
  const missing = structuredClone(buildRegistry(FIXTURE_TOOLS, META));
  missing.harnessAdapters = missing.harnessAdapters.filter((adapter) => adapter.harness !== 'omp');
  assert.equal(validateRegistry(missing).ok, false);
  assert.ok(validateRegistry(missing).errors.includes('native OMP host authority metadata is missing'));

  const duplicate = structuredClone(buildRegistry(FIXTURE_TOOLS, META));
  duplicate.harnessAdapters.push(structuredClone(duplicate.harnessAdapters.find((adapter) => adapter.harness === 'omp')));
  assert.ok(validateRegistry(duplicate).errors.includes('harness adapter names must be unique'));

  const conflated = structuredClone(buildRegistry(FIXTURE_TOOLS, META));
  conflated.harnessAdapters.find((adapter) => adapter.harness === 'pi').compatibilityAdapter = {
    path: '.omp/extensions/october-bus-tools.mjs',
  };
  assert.ok(validateRegistry(conflated).errors.includes('Pi adapter metadata must not contain OMP projection paths'));

  const wrongAuthority = structuredClone(buildRegistry(FIXTURE_TOOLS, META));
  wrongAuthority.harnessAdapters.find((adapter) => adapter.harness === 'omp').activationSource.implementationAuthority = 'YURI';
  assert.ok(validateRegistry(wrongAuthority).errors.includes('native OMP host authority metadata is missing'));
});

test('registry validator rejects stale local adapter/lifecycle projections and static activation identity', () => {
  const staleAdapters = structuredClone(buildRegistry(FIXTURE_TOOLS, META));
  staleAdapters.harnessAdapters.find((adapter) => adapter.harness === 'omp').events = ['session_start'];
  assert.ok(validateRegistry(staleAdapters).errors.includes('stored harness adapter projection is stale'));

  const staleLifecycle = structuredClone(buildRegistry(FIXTURE_TOOLS, META));
  staleLifecycle.lifecycleEndpoints[0].projections = ['Pi before_agent_start'];
  assert.ok(validateRegistry(staleLifecycle).errors.includes('stored lifecycle endpoint projection is stale'));

  const staticPort = structuredClone(buildRegistry(FIXTURE_TOOLS, META));
  staticPort.harnessAdapters.find((adapter) => adapter.harness === 'omp').activationSource.endpoint = 'http://127.0.0.1:49813/mcp';
  assert.ok(validateRegistry(staticPort).errors.includes('static October bus port leaked into harness activation metadata'));

  const poller = structuredClone(buildRegistry(FIXTURE_TOOLS, META));
  const omp = poller.harnessAdapters.find((adapter) => adapter.harness === 'omp');
  omp.activationSource.path = '_SYSTEM/Scripts/october-omp/pi';
  omp.activationHealth.nativeHost.implementationAuthority = 'YURI';
  assert.ok(validateRegistry(poller).errors.includes('native OMP host authority metadata is missing'));
  assert.ok(validateRegistry(poller).errors.includes('native OMP host health contract is missing'));
  assert.ok(validateRegistry(poller).errors.includes('native OMP metadata must not name the deprecated Pi wrapper'));
});

test('live discovery sends October attachment headers and reads SSE', async (t) => {
  let seenHeaders;
  const server = await listen((req, res) => {
    seenHeaders = req.headers;
    res.writeHead(200, { 'Content-Type': 'text/event-stream' });
    res.end(`event: message\ndata: ${JSON.stringify({ result: { tools: FIXTURE_TOOLS }, jsonrpc: '2.0', id: 1 })}\n\n`);
  });
  t.after(() => server.close());
  const { port } = server.address();
  const tools = await fetchOctoberTools({ OCTOBER_BUS_PORT: String(port), OCTOBER_BUS_CANVAS: 'canvas-fixture', OCTOBER_BUS_NODE: 'node-fixture' }, { timeoutMs: 500 });
  assert.equal(tools.length, FIXTURE_TOOLS.length);
  assert.equal(seenHeaders['x-october-canvas'], 'canvas-fixture');
  assert.equal(seenHeaders['x-october-node'], 'node-fixture');
  assert.match(seenHeaders.accept, /text\/event-stream/);
});

test('live discovery aborts a stalled October endpoint inside the outer hook budget', async (t) => {
  const server = await listen(() => {});
  t.after(() => {
    server.closeAllConnections?.();
    server.close();
  });
  const { port } = server.address();
  const started = Date.now();
  await assert.rejects(
    fetchOctoberTools({ OCTOBER_BUS_PORT: String(port), OCTOBER_BUS_CANVAS: 'canvas-fixture', OCTOBER_BUS_NODE: 'node-fixture' }, { timeoutMs: 60 }),
  );
  assert.ok(Date.now() - started < 1000, 'stalled request must fail soft before an outer harness timeout');
});

test('validator rejects unclassified new October tools to force explicit drift review', () => {
  const registry = buildRegistry([...FIXTURE_TOOLS, { name: 'future_mutator', description: 'New tool.', inputSchema: {} }], META);
  const verdict = validateRegistry(registry);
  assert.equal(verdict.ok, false);
  assert.ok(verdict.errors.includes('unclassified October tool: future_mutator'));
});
