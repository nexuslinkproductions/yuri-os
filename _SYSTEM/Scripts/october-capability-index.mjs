#!/usr/bin/env node
// @capability: october-external-capability-index
// @serves: October | October MCP | October bus | Claude MCP server-name health | message_peer | claim_task | send_to_node | wait_for_nodes | UserPromptSubmit | native OMP activation health | external tool registry | capability discovery
// @does: Projects October's authoritative live MCP tool schemas and harness-adapter contracts into a versioned YURI search/xref registry without copying transient canvas state or treating generated-path presence as runtime activation.
// @use: Run --refresh with an attached October canvas plus an explicit app version and bundle SHA; run --sync-local-projections to reconcile YURI-owned harness metadata without refreshing October-owned tools; run --validate offline; run --check-live after an October upgrade; run --check-claude-mcp for the project server-name invariant; run --check-pi or --check-omp for fail-closed generated-source/runtime-evidence health reports.
// @exports: buildRegistry, checkClaudeOctoberMcpConfigurationFromDisk, checkOmpActivationFromDisk, checkPiActivationFromDisk, classifyTool, evaluateOmpActivation, evaluatePiActivation, fetchOctoberTools, inspectOmpAdapterSource, inspectOmpLauncherSource, inspectPiGeneratedSource, parseMcpResponse, schemaDigest, syncLocalProjections, validateClaudeOctoberMcpConfiguration, validateRegistry

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../..');
export const REGISTRY_PATH = path.join(ROOT, '_SYSTEM/config/october-capability-registry.json');
export const NATIVE_OMP_APP_PATH = '/Applications/October.app/Contents/Resources/app.asar';

const REQUIRED_ENV = ['OCTOBER_BUS_PORT', 'OCTOBER_BUS_CANVAS', 'OCTOBER_BUS_NODE'];
const REQUIRED_TOOLS = ['message_peer', 'claim_task', 'send_to_node', 'wait_for_nodes'];

export const CLAUDE_OCTOBER_MCP_SERVER_NAME = 'october';

export function validateClaudeOctoberMcpConfiguration({
  mcpConfig = {},
  claudeSettings = {},
} = {}) {
  const expectedServerName = CLAUDE_OCTOBER_MCP_SERVER_NAME;
  const expectedPermissionNamespace = `mcp__${expectedServerName}__*`;
  const mcpServers = mcpConfig?.mcpServers;
  const configuredServerNames = mcpServers && typeof mcpServers === 'object' && !Array.isArray(mcpServers)
    ? Object.keys(mcpServers)
    : [];
  const enabledServerNames = Array.isArray(claudeSettings?.enabledMcpjsonServers)
    ? claudeSettings.enabledMcpjsonServers.map(String)
    : [];
  const permissionAllow = Array.isArray(claudeSettings?.permissions?.allow)
    ? claudeSettings.permissions.allow.map(String)
    : [];
  const checks = {
    configuredServerExists: Object.prototype.hasOwnProperty.call(mcpServers ?? {}, expectedServerName),
    configuredServerEnabled: enabledServerNames.includes(expectedServerName),
    permissionNamespaceMatches: permissionAllow.includes(expectedPermissionNamespace),
  };
  const errors = [];
  if (!checks.configuredServerExists) errors.push(`.mcp.json is missing MCP server "${expectedServerName}"`);
  if (!checks.configuredServerEnabled) errors.push(`Claude settings do not enable MCP server "${expectedServerName}"`);
  if (!checks.permissionNamespaceMatches) errors.push(`Claude settings are missing permission namespace "${expectedPermissionNamespace}"`);
  return {
    ok: errors.length === 0,
    expectedServerName,
    expectedPermissionNamespace,
    configuredServerNames,
    enabledServerNames,
    permissionAllow,
    checks,
    errors,
  };
}

export function checkClaudeOctoberMcpConfigurationFromDisk({ rootDirectory = ROOT } = {}) {
  const files = {
    mcpConfig: '.mcp.json',
    claudeSettings: '.claude/settings.local.json',
  };
  const readErrors = [];
  let mcpConfig = {};
  let claudeSettings = {};
  try {
    mcpConfig = JSON.parse(fs.readFileSync(path.join(rootDirectory, files.mcpConfig), 'utf8'));
  } catch (error) {
    readErrors.push(`could not read ${files.mcpConfig}: ${error.message}`);
  }
  try {
    claudeSettings = JSON.parse(fs.readFileSync(path.join(rootDirectory, files.claudeSettings), 'utf8'));
  } catch (error) {
    readErrors.push(`could not read ${files.claudeSettings}: ${error.message}`);
  }
  const verdict = validateClaudeOctoberMcpConfiguration({ mcpConfig, claudeSettings });
  return {
    ...verdict,
    ok: readErrors.length === 0 && verdict.ok,
    files,
    errors: [...readErrors, ...verdict.errors],
  };
}

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

export const PI_REQUIRED_NATIVE_TOOLS = Object.freeze([
  'message_peer', 'add_task', 'claim_task', 'complete_task', 'list_tasks',
]);

export const OMP_REQUIRED_NATIVE_TOOLS = Object.freeze([
  'message_peer', 'add_task', 'claim_task', 'complete_task', 'list_tasks',
]);

export const PI_ACTIVATION_CONTRACT = Object.freeze({
  status: 'source-ready-session-reload-required',
  liveRule: 'Path presence is not activation. Live requires every startup and runtime health check below.',
  requiredEnvironment: [...REQUIRED_ENV],
  generatedExtension: {
    path: '~/.pi/agent/extensions/october-bus.ts',
    mustExist: true,
    mustLoad: true,
  },
  nativeToolRegistration: {
    requiredTools: [...PI_REQUIRED_NATIVE_TOOLS],
    completeSetRequired: true,
  },
  prePromptContext: {
    event: 'before_agent_start',
    endpoint: '/hook/pre-prompt',
    injectionRequired: true,
    sessionStartIsInsufficient: true,
  },
  generatorDefects: [
    'Missing OCTOBER_BUS_PORT, OCTOBER_BUS_CANVAS, or OCTOBER_BUS_NODE returns before all hooks and tools without a diagnostic.',
    'session_start reports live status only; unread October context is not pulled until before_agent_start, so no first user turn means no context injection.',
    'message_peer and all four task tools share one silent typebox import try/catch; import failure registers zero native tools without a diagnostic.',
  ],
  activationAction: 'Restart the October-launched real Pi session with all attachment environment variables, load the October-generated lifecycle extension, verify all five native tools, and prove before_agent_start injected /hook/pre-prompt context.',
});

export const OMP_ACTIVATION_CONTRACT = Object.freeze({
  status: 'native-host-runtime-evidence-required',
  liveRule: 'Native OMP bundle presence is not activation. Live requires the October native host identity, attached startup environment, native tool registration, and October-native idle/busy delivery canaries.',
  requiredEnvironment: [...REQUIRED_ENV],
  nativeHost: {
    path: NATIVE_OMP_APP_PATH,
    mustExist: true,
    managedBy: 'October',
    implementationAuthority: 'October',
    protocolAuthority: 'October',
    recognizedHarnessFamily: 'omp',
    resolvedRuntime: 'omp',
  },
  nativeToolRegistration: {
    requiredTools: [...OMP_REQUIRED_NATIVE_TOOLS],
    dependency: 'native October OMP MCP host',
    completeSetRequired: true,
  },
  inboundDelivery: {
    authority: 'October',
    mode: 'native-terminal-delivery',
    idleCanaryRequired: true,
    busyCanaryRequired: true,
  },
  activationAction: 'Launch the native October OMP host with all attachment environment variables, verify the native peer/task tools, and prove October-native idle and busy delivery plus outbound peer delivery. Do not substitute the deprecated Pi wrapper.',
});

function quotedCall(text, functionName, toolName) {
  const escaped = toolName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`${functionName}\\s*\\(\\s*['"]${escaped}['"]`).test(text);
}

export function inspectPiGeneratedSource(source) {
  const text = String(source ?? '');
  const sessionStartAt = text.search(/pi\.on\(\s*['"]session_start['"]/);
  const sessionShutdownAt = text.search(/pi\.on\(\s*['"]session_shutdown['"]/);
  const sessionStartBlock = sessionStartAt === -1
    ? ''
    : text.slice(sessionStartAt, sessionShutdownAt > sessionStartAt ? sessionShutdownAt : undefined);
  const declaredNativeTools = PI_REQUIRED_NATIVE_TOOLS.filter((name) => (
    name === 'message_peer'
      ? /name\s*:\s*['"]message_peer['"]/.test(text)
      : quotedCall(text, 'taskTool', name)
  ));
  const checks = {
    defaultExtensionExport: /export\s+default\s+async\s+function/.test(text),
    requiredEnvironmentReferences: REQUIRED_ENV.every((key) => text.includes(`process.env.${key}`)),
    beforeAgentStartHook: /pi\.on\(\s*['"]before_agent_start['"]/.test(text),
    prePromptEndpoint: text.includes('/hook/pre-prompt'),
    intendedNativeToolsDeclared: PI_REQUIRED_NATIVE_TOOLS.every((name) => declaredNativeTools.includes(name)),
  };
  return {
    ok: Object.values(checks).every(Boolean),
    checks,
    declaredNativeTools,
    missingDeclaredNativeTools: PI_REQUIRED_NATIVE_TOOLS.filter((name) => !declaredNativeTools.includes(name)),
    observedGeneratorDefects: {
      missingEnvironmentEarlyReturn: /if\s*\(\s*!PORT\s*\|\|\s*!CANVAS\s*\|\|\s*!NODE\s*\)\s*return/.test(text),
      sessionStartDoesNotPullContext: sessionStartBlock.includes('/hook/session')
        && !sessionStartBlock.includes('/hook/pre-prompt'),
      silentTypeboxToolFailure: /await\s+import\(\s*['"]typebox['"]\s*\)/.test(text)
        && /catch\s*\{\s*\/\*\s*typebox[^}]*\*\/\s*\}/i.test(text),
    },
  };
}

export function inspectOmpAdapterSource(source) {
  const text = String(source ?? '');
  const defaultExportAt = text.search(/export\s+default\s+function\s+octoberPiEssentialTools/);
  const defaultExportSource = defaultExportAt === -1 ? '' : text.slice(defaultExportAt);
  const declaredNativeTools = OMP_REQUIRED_NATIVE_TOOLS.filter((name) => (
    name === 'message_peer'
      ? /name\s*:\s*['"]message_peer['"]/.test(text)
      : quotedCall(text, 'taskTool', name)
  ));
  const checks = {
    defaultExtensionExport: /export\s+default\s+function\s+octoberPiEssentialTools/.test(text),
    requiredEnvironmentReferences: REQUIRED_ENV.every((key) => text.includes(key)),
    hostInjectedZod: /pi\.zod\?\.z/.test(text),
    noTypeboxImport: !/import\s*\(\s*['"]typebox['"]\s*\)/.test(text),
    essentialToolLoadMode: /loadMode\s*:\s*['"]essential['"]/.test(text),
    intendedNativeToolsDeclared: PI_REQUIRED_NATIVE_TOOLS.every((name) => declaredNativeTools.includes(name)),
    boundedLoopbackTransport: text.includes('AbortController')
      && /REQUEST_TIMEOUT_MS\s*=\s*2500/.test(text)
      && text.includes('http://127.0.0.1:${attachment.port}')
      && !/127\.0\.0\.1:\d+/.test(text),
    outboundPeerEndpoint: text.includes('/hook/message-peer'),
    outboundTaskEndpoint: text.includes('/hook/task'),
    defaultExportIsOutboundOnly: defaultExportSource !== ''
      && !/registerOctoberInboundBridge\s*\(/.test(defaultExportSource)
      && !defaultExportSource.includes('/hook/pre-prompt'),
  };
  return {
    ok: Object.values(checks).every(Boolean),
    checks,
    declaredNativeTools,
    missingDeclaredNativeTools: OMP_REQUIRED_NATIVE_TOOLS.filter((name) => !declaredNativeTools.includes(name)),
  };
}

// Backward-compatible export for callers predating the Pi/OMP identity split.
export const inspectPiCompatibilitySource = inspectOmpAdapterSource;

export function inspectOmpLauncherSource(source) {
  const text = String(source ?? '');
  const invokesLiteralOmp = /(?:^|\n)\s*(?:command\s+)?(?:[^\s]+\/)?omp(?:\s|$)/m.test(text);
  const invokesConfiguredOmp = /omp_bin\s*=\s*["'][^"']*\/omp["']/.test(text)
    && /["']\$\{omp_bin\}["']\s+["']\$\{forwarded\[@\]\}["']/.test(text);
  const forwardsParsedArguments = /while\s+\(\(\s*\$#\s*>\s*0\s*\)\)/.test(text)
    && /passthrough\+\=\(["']\$1["']\)/.test(text)
    && invokesConfiguredOmp;
  const execLines = text.match(/(?:^|\n)\s*exec\s+/gm) ?? [];
  const guardedNonHostExec = /if\s+\[\[[^\n]*session_role[^\n]*!=\s*["']host["'][^\n]*\]\];\s*then[\s\S]{0,800}?\n\s*exec\s+["']\$\{omp_bin\}["']/.test(text);
  const checks = {
    shellLauncher: /^#![^\n]*(?:sh|bash|zsh)\b/.test(text),
    launchesOmp: invokesLiteralOmp || invokesConfiguredOmp,
    forwardsArguments: text.includes('"$@"') || forwardsParsedArguments,
    noExecReplacement: execLines.length === 0 || (execLines.length === 1 && guardedNonHostExec),
    foregroundChild: !/(?:^|\n)[^\n]*\bomp\b[^\n]*&\s*(?:#.*)?$/m.test(text),
    noCodexFallback: !/(?:^|\s)codex(?:\s|$)/m.test(text),
  };
  return { ok: Object.values(checks).every(Boolean), checks };
}

export function evaluatePiActivation({
  env = {},
  extensionPresent = false,
  extensionSource = '',
  runtime = {},
} = {}) {
  const source = inspectPiGeneratedSource(extensionSource);
  const registeredTools = Array.isArray(runtime.registeredTools)
    ? [...new Set(runtime.registeredTools.map(String))]
    : [];
  const runtimeEvidenceProvided = runtime.extensionLoaded !== undefined
    || runtime.registeredTools !== undefined
    || runtime.beforeAgentStartContextInjected !== undefined
    || runtime.harnessIdentityObserved !== undefined
    || runtime.startupEnvironmentObserved !== undefined;
  const missingEnvironment = REQUIRED_ENV.filter((key) => !String(env?.[key] ?? '').trim());
  const missingNativeTools = PI_REQUIRED_NATIVE_TOOLS.filter((name) => !registeredTools.includes(name));
  const checks = {
    piHarnessIdentityObserved: runtime.harnessIdentityObserved === 'pi',
    startupEnvironmentObserved: runtime.startupEnvironmentObserved === true,
    startupEnvironmentAttached: missingEnvironment.length === 0,
    generatedExtensionPresent: extensionPresent === true,
    generatedSourceContract: extensionPresent === true && source.ok,
    generatedExtensionLoaded: runtime.extensionLoaded === true,
    intendedNativeToolsRegistered: missingNativeTools.length === 0,
    beforeAgentStartContextInjected: runtime.beforeAgentStartContextInjected === true,
  };
  const failures = Object.entries(checks).filter(([, ok]) => !ok).map(([name]) => name);
  const live = failures.length === 0;
  return {
    ok: live,
    live,
    status: live ? 'live' : (runtimeEvidenceProvided ? 'unhealthy' : 'runtime-unverified'),
    runtimeEvidenceProvided,
    resolvedHarness: 'pi',
    checks,
    missingEnvironment,
    missingNativeTools,
    source,
    failures,
    generatorDefects: PI_ACTIVATION_CONTRACT.generatorDefects,
    activationAction: PI_ACTIVATION_CONTRACT.activationAction,
  };
}

export function evaluateOmpActivation({
  env = {},
  nativeHostPresent = false,
  runtime = {},
} = {}) {
  const registeredTools = Array.isArray(runtime.registeredTools)
    ? [...new Set(runtime.registeredTools.map(String))]
    : [];
  const runtimeEvidenceProvided = runtime.registeredTools !== undefined
    || runtime.harnessIdentityObserved !== undefined
    || runtime.startupEnvironmentObserved !== undefined
    || runtime.nativeHostIdentityObserved !== undefined
    || runtime.nativeIdleDeliveryVerified !== undefined
    || runtime.nativeBusyDeliveryVerified !== undefined
    || runtime.outboundPeerDeliveryVerified !== undefined
    || runtime.nativeDeliveryAuthorityObserved !== undefined;
  const missingEnvironment = REQUIRED_ENV.filter((key) => !String(env?.[key] ?? '').trim());
  const missingNativeTools = OMP_REQUIRED_NATIVE_TOOLS.filter((name) => !registeredTools.includes(name));
  const checks = {
    ompHarnessIdentityObserved: runtime.harnessIdentityObserved === 'omp',
    startupEnvironmentObserved: runtime.startupEnvironmentObserved === true,
    startupEnvironmentAttached: missingEnvironment.length === 0,
    nativeHostPresent: nativeHostPresent === true,
    nativeHostIdentityObserved: runtime.nativeHostIdentityObserved === true,
    intendedNativeToolsRegistered: missingNativeTools.length === 0,
    nativeDeliveryAuthorityObserved: runtime.nativeDeliveryAuthorityObserved === 'October',
    nativeIdleDeliveryVerified: runtime.nativeIdleDeliveryVerified === true,
    nativeBusyDeliveryVerified: runtime.nativeBusyDeliveryVerified === true,
    outboundPeerDeliveryVerified: runtime.outboundPeerDeliveryVerified === true,
  };
  const failures = Object.entries(checks).filter(([, ok]) => !ok).map(([name]) => name);
  const live = failures.length === 0;
  return {
    ok: live,
    live,
    status: live ? 'live' : (runtimeEvidenceProvided ? 'unhealthy' : 'runtime-unverified'),
    runtimeEvidenceProvided,
    resolvedHarness: 'omp',
    checks,
    missingEnvironment,
    missingNativeTools,
    failures,
    activationAction: OMP_ACTIVATION_CONTRACT.activationAction,
  };
}

export function checkPiActivationFromDisk({
  env = process.env,
  homeDirectory = env.HOME,
  runtime = {},
} = {}) {
  const extensionPath = homeDirectory
    ? path.join(homeDirectory, '.pi/agent/extensions/october-bus.ts')
    : null;
  let extensionSource = '';
  let extensionPresent = false;
  if (extensionPath) {
    try {
      extensionSource = fs.readFileSync(extensionPath, 'utf8');
      extensionPresent = true;
    } catch {
      extensionPresent = false;
    }
  }
  const checkerMissingEnvironment = REQUIRED_ENV.filter((key) => !String(env?.[key] ?? '').trim());
  const startupEnvironmentObserved = runtime.startupEnvironmentObserved === true;
  return {
    ...evaluatePiActivation({
      env: startupEnvironmentObserved ? env : {},
      extensionPresent,
      extensionSource,
      runtime,
    }),
    extensionPath: PI_ACTIVATION_CONTRACT.generatedExtension.path,
    startupEnvironmentObserved,
    checkerEnvironmentAttached: checkerMissingEnvironment.length === 0,
    checkerEnvironmentScope: 'checker-process-only; does not prove Pi startup environment',
  };
}

export function checkOmpActivationFromDisk({
  env = process.env,
  runtime = {},
} = {}) {
  let nativeHostPresent = false;
  try {
    nativeHostPresent = fs.statSync(OMP_ACTIVATION_CONTRACT.nativeHost.path).isFile();
  } catch {
    nativeHostPresent = false;
  }
  const checkerMissingEnvironment = REQUIRED_ENV.filter((key) => !String(env?.[key] ?? '').trim());
  const startupEnvironmentObserved = runtime.startupEnvironmentObserved === true;
  return {
    ...evaluateOmpActivation({
      env: startupEnvironmentObserved ? env : {},
      nativeHostPresent,
      runtime,
    }),
    nativeHostPath: OMP_ACTIVATION_CONTRACT.nativeHost.path,
    nativeHostPresent,
    startupEnvironmentObserved,
    checkerEnvironmentAttached: checkerMissingEnvironment.length === 0,
    checkerEnvironmentScope: 'checker-process-only; does not prove OMP startup environment',
  };
}

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
    transport: 'project Streamable HTTP MCP plus generated command hooks',
    projection: '.mcp.json + .claude/settings.local.json',
    events: ['SessionStart', 'UserPromptSubmit', 'Stop', 'SessionEnd', 'Notification'],
    outerTimeoutMs: 5000,
    activationSource: {
      kind: 'project-config',
      path: '.mcp.json',
      mcpTransport: 'streamable-http',
      endpointTemplate: 'http://127.0.0.1:${OCTOBER_BUS_PORT}/mcp',
      requiredEnvironment: REQUIRED_ENV,
    },
  },
  {
    harness: 'codex',
    transport: 'project stdio-to-HTTP MCP bridge plus generated hooks',
    projection: '.codex/config.toml + .codex/hooks.json',
    events: ['SessionStart', 'UserPromptSubmit', 'Stop', 'PermissionRequest'],
    outerTimeoutMs: 10000,
    activationSource: {
      kind: 'project-config',
      path: '.codex/config.toml',
      mcpTransport: 'stdio-http-bridge',
      bridgePath: '_SYSTEM/Scripts/october-mcp-stdio-bridge.mjs',
      rootResolution: 'git rev-parse --show-toplevel',
      endpointTemplate: 'http://127.0.0.1:${OCTOBER_BUS_PORT}/mcp',
      requiredEnvironment: REQUIRED_ENV,
    },
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
    transport: 'October-generated lifecycle extension and native peer/task tools',
    projection: '~/.pi/agent/extensions/october-bus.ts',
    events: ['session_start', 'session_shutdown', 'before_agent_start', 'agent_end'],
    activationSource: {
      kind: 'october-generated',
      path: '~/.pi/agent/extensions/october-bus.ts',
      managedBy: 'October adapter generator',
      status: 'generated-source-only',
      liveInferredFromPath: false,
    },
    activationHealth: PI_ACTIVATION_CONTRACT,
  },
  {
    harness: 'omp',
    transport: 'October-native OMP host with native MCP peer/task tools and terminal delivery',
    projection: '.omp/config.yml + .omp/mcp.json + native October app bundle',
    events: ['October-native idle delivery', 'October-native busy delivery'],
    activationSource: {
      kind: 'native-omp-host',
      path: NATIVE_OMP_APP_PATH,
      managedBy: 'October',
      implementationAuthority: 'October',
      protocolAuthority: 'October',
      recognizedHarnessFamily: 'omp',
      resolvedRuntime: 'omp',
      status: 'native-host-runtime-evidence-required',
      liveInferredFromPath: false,
      requiredEnvironment: REQUIRED_ENV,
    },
    activationHealth: OMP_ACTIVATION_CONTRACT,
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
  const adapterList = registry?.harnessAdapters ?? [];
  const adapterNames = adapterList.map((adapter) => adapter.harness);
  if (new Set(adapterNames).size !== adapterNames.length) errors.push('harness adapter names must be unique');
  const adapters = new Map(adapterList.map((adapter) => [adapter.harness, adapter]));
  const claude = adapters.get('claude-code');
  const codex = adapters.get('codex');
  const pi = adapters.get('pi');
  const omp = adapters.get('omp');
  if (claude?.activationSource?.mcpTransport !== 'streamable-http' || claude.activationSource.path !== '.mcp.json') {
    errors.push('Claude Code October MCP project activation metadata is missing');
  }
  if (codex?.activationSource?.mcpTransport !== 'stdio-http-bridge'
    || codex.activationSource.bridgePath !== '_SYSTEM/Scripts/october-mcp-stdio-bridge.mjs'
    || codex.activationSource.rootResolution !== 'git rev-parse --show-toplevel') {
    errors.push('Codex October MCP stdio bridge activation metadata is missing');
  }
  if (pi?.activationSource?.kind !== 'october-generated'
    || pi.activationSource.path !== '~/.pi/agent/extensions/october-bus.ts') {
    errors.push('Pi October activation must remain generator-owned metadata');
  }
  if (pi?.activationSource?.status !== 'generated-source-only' || pi.activationSource.liveInferredFromPath !== false) {
    errors.push('Pi generated extension path must not be treated as live activation');
  }
  const piHealth = pi?.activationHealth;
  const piTools = piHealth?.nativeToolRegistration?.requiredTools ?? [];
  if (REQUIRED_ENV.some((key) => !piHealth?.requiredEnvironment?.includes(key))) errors.push('Pi activation health is missing required October startup environment');
  if (PI_REQUIRED_NATIVE_TOOLS.some((name) => !piTools.includes(name))) errors.push('Pi activation health is missing intended native tools');
  if (piHealth?.status !== 'source-ready-session-reload-required'
    || piHealth?.generatedExtension?.path !== '~/.pi/agent/extensions/october-bus.ts') {
    errors.push('Pi source-ready generated-extension health contract is missing');
  }
  if (piHealth?.prePromptContext?.event !== 'before_agent_start'
    || piHealth.prePromptContext.endpoint !== '/hook/pre-prompt'
    || piHealth.prePromptContext.injectionRequired !== true) {
    errors.push('Pi activation health is missing before_agent_start pre-prompt injection');
  }
  if (!Array.isArray(piHealth?.generatorDefects) || piHealth.generatorDefects.length < 3) errors.push('Pi generator defects are not recorded');
  if (JSON.stringify(pi ?? {}).includes('.omp/')) errors.push('Pi adapter metadata must not contain OMP projection paths');

  if (omp?.activationSource?.kind !== 'native-omp-host'
    || omp.activationSource.path !== NATIVE_OMP_APP_PATH
    || omp.activationSource.implementationAuthority !== 'October'
    || omp.activationSource.protocolAuthority !== 'October'
    || omp.activationSource.recognizedHarnessFamily !== 'omp'
    || omp.activationSource.resolvedRuntime !== 'omp'
  ) {
    errors.push('native OMP host authority metadata is missing');
  }
  if (omp?.activationSource?.status !== 'native-host-runtime-evidence-required'
    || omp.activationSource.liveInferredFromPath !== false) {
    errors.push('native OMP host path must not be treated as live activation');
  }
  const ompHealth = omp?.activationHealth;
  const ompTools = ompHealth?.nativeToolRegistration?.requiredTools ?? [];
  const ompInbound = ompHealth?.inboundDelivery;
  if (REQUIRED_ENV.some((key) => !ompHealth?.requiredEnvironment?.includes(key))) errors.push('OMP activation health is missing required October startup environment');
  if (OMP_REQUIRED_NATIVE_TOOLS.some((name) => !ompTools.includes(name))) errors.push('OMP activation health is missing intended native tools');
  if (ompHealth?.status !== 'native-host-runtime-evidence-required'
    || ompHealth?.nativeHost?.path !== NATIVE_OMP_APP_PATH
    || ompHealth.nativeHost.implementationAuthority !== 'October'
    || ompHealth.nativeHost.protocolAuthority !== 'October'
    || ompHealth.nativeHost.recognizedHarnessFamily !== 'omp'
    || ompHealth.nativeHost.resolvedRuntime !== 'omp'
    || ompHealth.nativeToolRegistration?.dependency !== 'native October OMP MCP host') {
    errors.push('native OMP host health contract is missing');
  }
  if (ompInbound?.authority !== 'October'
    || ompInbound.mode !== 'native-terminal-delivery'
    || ompInbound.idleCanaryRequired !== true
    || ompInbound.busyCanaryRequired !== true) {
    errors.push('native OMP October delivery contract is missing');
  }
  if (JSON.stringify(omp ?? {}).includes('_SYSTEM/Scripts/october-omp/pi')) errors.push('native OMP metadata must not name the deprecated Pi wrapper');
  const ompText = JSON.stringify(omp ?? {});
  if (ompText.includes('persistent-pi-family') || ompText.includes('pi.zod')) errors.push('native OMP metadata must not encode Pi-family host assumptions');

  if (stableJson(registry?.lifecycleEndpoints ?? []) !== stableJson(LIFECYCLE_ENDPOINTS)) {
    errors.push('stored lifecycle endpoint projection is stale');
  }
  if (stableJson(registry?.harnessAdapters ?? []) !== stableJson(HARNESS_ADAPTERS)) {
    errors.push('stored harness adapter projection is stale');
  }
  if (/127\.0\.0\.1:\d+\/mcp/.test(adapterText)) errors.push('static October bus port leaked into harness activation metadata');
  const serialized = JSON.stringify(registry);
  if (/term-[a-z0-9-]+/i.test(serialized)) errors.push('transient October node id leaked into durable registry');
  return { ok: errors.length === 0, errors };
}

export function syncLocalProjections(registry) {
  if (!registry || typeof registry !== 'object' || Array.isArray(registry)) {
    throw new Error('registry object is required');
  }

  const beforeExternal = structuredClone(registry);
  delete beforeExternal.harnessAdapters;

  const candidate = structuredClone(registry);
  candidate.harnessAdapters = structuredClone(HARNESS_ADAPTERS);

  const afterExternal = structuredClone(candidate);
  delete afterExternal.harnessAdapters;
  if (stableJson(beforeExternal) !== stableJson(afterExternal)) {
    throw new Error('local projection sync changed October-owned registry fields');
  }

  const verdict = validateRegistry(candidate);
  if (!verdict.ok) {
    throw new Error(`locally synchronized registry invalid: ${verdict.errors.join('; ')}`);
  }
  return candidate;
}

function option(name) {
  const i = process.argv.indexOf(name);
  return i === -1 ? null : process.argv[i + 1] ?? null;
}

function readRegistry() {
  return JSON.parse(fs.readFileSync(REGISTRY_PATH, 'utf8'));
}

function writeRegistryAtomically(registry) {
  const temporaryPath = path.join(
    path.dirname(REGISTRY_PATH),
    `.${path.basename(REGISTRY_PATH)}.${process.pid}.tmp`,
  );
  fs.writeFileSync(temporaryPath, `${JSON.stringify(registry, null, 2)}\n`, { flag: 'wx', mode: 0o644 });
  fs.renameSync(temporaryPath, REGISTRY_PATH);
}

async function main() {
  if (process.argv.includes('--check-claude-mcp')) {
    const verdict = checkClaudeOctoberMcpConfigurationFromDisk();
    console.log(JSON.stringify(verdict));
    if (!verdict.ok) process.exitCode = 1;
    return;
  }

  if (process.argv.includes('--check-pi')) {
    const verdict = checkPiActivationFromDisk();
    console.log(JSON.stringify(verdict));
    if (!verdict.ok) process.exitCode = 1;
    return;
  }

  if (process.argv.includes('--check-omp')) {
    const verdict = checkOmpActivationFromDisk();
    console.log(JSON.stringify(verdict));
    if (!verdict.ok) process.exitCode = 1;
    return;
  }

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

  if (process.argv.includes('--sync-local-projections')) {
    const registry = readRegistry();
    const previousProjectionDigest = sha256(stableJson(registry.harnessAdapters ?? []));
    const candidate = syncLocalProjections(registry);
    const projectionDigest = sha256(stableJson(candidate.harnessAdapters));
    writeRegistryAtomically(candidate);
    console.log(JSON.stringify({
      ok: true,
      action: 'synced-local-projections',
      changed: previousProjectionDigest !== projectionDigest,
      projection: 'harnessAdapters',
      previousProjectionDigest,
      projectionDigest,
      path: path.relative(ROOT, REGISTRY_PATH),
    }));
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
