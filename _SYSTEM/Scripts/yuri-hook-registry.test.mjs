import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { PassThrough, Readable, Writable } from 'node:stream';
import test from 'node:test';

import {
  buildDelegateEnvironment,
  evaluateUniversalPreTool,
  normalizePreToolEvent,
  renderHookDecision,
  runCli,
  runExternalDelegate,
} from './yuri-hook-adapter.mjs';
import {
  ROOT,
  codexPreToolCommands,
  effectiveJsonHookCommands,
  inventoryClaudeLifecycle,
  jsonHookCommands,
  loadRegistry,
  providerHealth,
  refreshHashes,
  renderProvider,
  sparseBootstrapPlan,
  validateRegistry,
} from './yuri-hook-registry.mjs';

function capture() {
  let value = '';
  const stream = new Writable({
    write(chunk, _encoding, callback) {
      value += chunk.toString();
      callback();
    },
  });
  return { stream, read: () => value };
}

function commandGroup(command, timeout = 5, matcher = '') {
  return [{ matcher, hooks: [{ type: 'command', command, timeout }] }];
}

function lifecycleFixtureSources(registry, {
  project = {},
  local = null,
  home = '/fixture-home',
} = {}) {
  const pre = registry.hooks
    .find((hook) => hook.hookId === 'yuri.pre-tool.enforcement')
    .providerAdapters.find((adapter) => adapter.provider === 'claude-code').command;
  const prompt = registry.hooks
    .find((hook) => hook.hookId === 'october.prompt-context.pull')
    .providerAdapters.find((adapter) => adapter.provider === 'claude-code').command;
  const bus = `${home}/.october/bus-hook.mjs`;
  const localSettings = local ?? {
    hooks: {
      SessionStart: commandGroup(`node "${bus}" session-start`, 5, '*'),
      PreToolUse: commandGroup(pre, 10),
      UserPromptSubmit: commandGroup(prompt),
      Stop: commandGroup(`node "${bus}" stop`, 5, '*'),
      SessionEnd: commandGroup(`node "${bus}" session-end`, 5, '*'),
      Notification: commandGroup(`node "${bus}" notify`, 5, '*'),
    },
  };
  return [
    { relative: '.claude/settings.json', source: JSON.stringify(project) },
    { relative: '.claude/settings.local.json', source: JSON.stringify(localSettings) },
  ];
}

function fixtureFileSystem({ missing = new Set() } = {}) {
  return {
    existsSync(file) { return !missing.has(file); },
    statSync() { return { isFile: () => true }; },
    realpathSync(file) { return file; },
  };
}

function stalledDelegateProcess() {
  const child = new EventEmitter();
  child.stdin = new PassThrough();
  child.stdout = new PassThrough();
  child.kill = () => true;
  return child;
}

test('canonical registry validates hashes, roles, and dependency closure', () => {
  const registry = loadRegistry();
  const result = validateRegistry(registry);
  assert.deepEqual(result, { ok: true, hooks: 3, hashedPaths: 25 });
  assert.deepEqual(registry.providerMergeContracts['claude-code'].settingsSources, [
    '.claude/settings.json',
    '.claude/settings.local.json',
  ]);
  const unapproved = structuredClone(registry);
  unapproved.liveActivation.ownerApproved = false;
  assert.throws(() => validateRegistry(unapproved), /explicit owner approval/u);
});

test('registry validation rejects retired execution paths and invokedPath self-registration', () => {
  for (const prefix of ['.claude/hooks', '.omp/agents', '.openclaw/agents']) {
    const registry = loadRegistry();
    const hook = registry.hooks.find((entry) => entry.hookId === 'yuri.pre-tool.enforcement');
    const revived = `${prefix}/revived.mjs`;
    hook.dependencyClosure.push(revived);
    hook.providerAdapters.find((adapter) => adapter.provider === 'claude-code').invokedPaths.push(revived);
    assert.throws(
      () => validateRegistry(registry, { checkHashes: false }),
      /retired execution path forbidden/u,
      prefix,
    );

    const commandOnly = loadRegistry();
    const commandAdapter = commandOnly.hooks
      .find((entry) => entry.hookId === 'yuri.pre-tool.enforcement')
      .providerAdapters.find((adapter) => adapter.provider === 'claude-code');
    commandAdapter.command = `node "$CLAUDE_PROJECT_DIR/${revived}"`;
    assert.throws(
      () => validateRegistry(commandOnly, { checkHashes: false }),
      /retired command entrypoint forbidden/u,
      `command-only ${prefix}`,
    );
  }

  for (const alias of ['./.omp/agents/revived.mjs', '_SYSTEM/../.openclaw/agents/revived.mjs']) {
    const aliased = loadRegistry();
    aliased.hooks
      .find((entry) => entry.hookId === 'yuri.pre-tool.enforcement')
      .providerAdapters.find((adapter) => adapter.provider === 'omp')
      .invokedPaths.push(alias);
    assert.throws(
      () => validateRegistry(aliased, { checkHashes: false }),
      /retired execution path forbidden/u,
      alias,
    );
  }

  const registry = loadRegistry();
  const hook = registry.hooks.find((entry) => entry.hookId === 'yuri.pre-tool.enforcement');
  hook.providerAdapters.find((adapter) => adapter.provider === 'claude-code').invokedPaths.push(
    '_SYSTEM/Scripts/yuri-hook-registry.mjs',
  );
  assert.throws(
    () => validateRegistry(registry, { checkHashes: false }),
    /invoked path is not declared in dependencyClosure/u,
  );
});

test('registry validation and hash refresh reject retired or aliased provider projections', () => {
  for (const projection of [
    '.claude/hooks/revived.js',
    '.omp/agents/revived.js',
    '.openclaw/agents/revived.js',
    './.omp/agents/revived.js',
    '_SYSTEM/../.openclaw/agents/revived.js',
  ]) {
    const registry = loadRegistry();
    const adapter = registry.hooks
      .find((entry) => entry.hookId === 'yuri.pre-tool.enforcement')
      .providerAdapters.find((candidate) => candidate.provider === 'omp');
    adapter.projection = projection;
    adapter.activation = 'external-active';
    assert.throws(
      () => validateRegistry(registry, { checkHashes: false }),
      /retired projection path forbidden/u,
      `validate ${projection}`,
    );
    assert.throws(
      () => refreshHashes(registry),
      /retired projection path forbidden/u,
      `refresh ${projection}`,
    );
  }

  const aliased = loadRegistry();
  aliased.hooks
    .find((entry) => entry.hookId === 'yuri.pre-tool.enforcement')
    .providerAdapters.find((candidate) => candidate.provider === 'omp')
    .projection = './.omp/hooks/pre/url-safety-guard.js';
  assert.throws(
    () => validateRegistry(aliased, { checkHashes: false }),
    /projection path must be canonical/u,
  );
});

test('provider projections are worktree-rooted and contain no canonical clone path', () => {
  const claude = JSON.stringify(renderProvider('claude'));
  const codex = JSON.stringify(renderProvider('codex'));
  const omp = renderProvider('omp');
  assert.match(claude, /CLAUDE_PROJECT_DIR/u);
  assert.match(codex, /git rev-parse --show-toplevel/u);
  assert.match(codex, /\[\[hooks\.PreToolUse\.hooks\]\]/u);
  assert.doesNotMatch(codex, /hooks\s*=\s*\[/u);
  assert.ok(
    readFileSync(path.join(ROOT, '.codex/config.toml'), 'utf8').includes(renderProvider('codex').inlineToml),
    'live Codex PreToolUse projection must equal the canonical rendered TOML',
  );
  assert.doesNotMatch(`${claude}${codex}`, /\/Users\/marcelspatz\/YURI-OS-MUSUBI/u);
  assert.equal(omp.module, '.omp/hooks/pre/url-safety-guard.js');
});

test('rendered Codex projection works from a nested worktree cwd and never exits 1', () => {
  const registry = loadRegistry();
  const command = registry.hooks
    .find((hook) => hook.hookId === 'yuri.pre-tool.enforcement')
    .providerAdapters.find((adapter) => adapter.provider === 'codex').command;
  const event = JSON.stringify({ tool_name: 'Bash', tool_input: { command: 'git reset --hard HEAD' } });
  const result = spawnSync(command, {
    cwd: path.join(ROOT, '_SYSTEM/Scripts/policy'),
    encoding: 'utf8',
    input: event,
    shell: true,
    timeout: 10_000,
  });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(JSON.parse(result.stdout).hookSpecificOutput.permissionDecision, 'deny');
});

test('projection parsers require exactly one canonical command and expose duplicates', () => {
  const expected = 'node "$(git rev-parse --show-toplevel)/hook.mjs"';
  const codex = [
    '[[hooks.PreToolUse]]',
    'matcher = "*"',
    '[[hooks.PreToolUse.hooks]]',
    `command = ${JSON.stringify(expected)}`,
    '[[hooks.PreToolUse]]',
    'matcher = "Bash"',
    'hooks = [{ type = "command", command = "node stale.mjs" }]',
  ].join('\n');
  assert.deepEqual(codexPreToolCommands(codex), [expected, 'node stale.mjs']);

  const hooksJson = JSON.stringify({ hooks: { UserPromptSubmit: [{ hooks: [
    { command: 'node raw.mjs' },
    { command: 'node wrapper.mjs' },
  ] }] } });
  assert.deepEqual(jsonHookCommands(hooksJson, 'UserPromptSubmit'), ['node raw.mjs', 'node wrapper.mjs']);

  const projectSettings = JSON.stringify({ hooks: { UserPromptSubmit: [{ hooks: [
    { command: 'node legacy-user-prompt-submit.js' },
  ] }] } });
  const projectLocalSettings = JSON.stringify({ hooks: { UserPromptSubmit: [{ hooks: [
    { command: 'node bounded-wrapper.mjs' },
  ] }] } });
  assert.deepEqual(
    effectiveJsonHookCommands([projectSettings, projectLocalSettings], 'UserPromptSubmit'),
    ['node legacy-user-prompt-submit.js', 'node bounded-wrapper.mjs'],
    'additive Claude settings scopes must expose a legacy/canonical collision',
  );
});

test('Claude lifecycle inventory accepts zero project lifecycle and classifies every live command without execution', () => {
  const registry = loadRegistry();
  const inventory = inventoryClaudeLifecycle(
    lifecycleFixtureSources(registry),
    registry,
    { home: '/fixture-home', ...fixtureFileSystem() },
  );
  assert.equal(inventory.ok, true);
  assert.equal(inventory.projectCommandCount, 0);
  assert.equal(inventory.entries.length, 6);
  assert.equal(inventory.entries.filter((entry) => entry.classification === 'registered-repo-local').length, 2);
  assert.equal(inventory.entries.filter((entry) => entry.classification === 'external-generated-october').length, 4);
  assert.equal(inventory.sources.find((source) => source.source === '.claude/settings.json').commandCount, 0);
});

test('Claude lifecycle inventory rejects a non-command project hook even when it has no command field', () => {
  const registry = loadRegistry();
  const inventory = inventoryClaudeLifecycle(
    lifecycleFixtureSources(registry, { project: { hooks: { SessionStart: [{ matcher: '', hooks: [
      { type: 'prompt', prompt: 'mutating lifecycle residue' },
    ] }] } } }),
    registry,
    { home: '/fixture-home', ...fixtureFileSystem() },
  );
  assert.equal(inventory.ok, false);
  assert.equal(inventory.projectHookEntryCount, 1);
  assert.ok(inventory.sourceErrors.some((error) => error.includes('unsupported hook type')));
  assert.ok(inventory.contractErrors.some((error) => error.includes('expected zero hook entries')));
});

test('Claude lifecycle inventory rejects a missing repo-local command path and historical .claude/hooks paths', () => {
  const registry = loadRegistry();
  const command = registry.hooks
    .find((hook) => hook.hookId === 'yuri.pre-tool.enforcement')
    .providerAdapters.find((adapter) => adapter.provider === 'claude-code').command;
  const missingPath = path.join(ROOT, '_SYSTEM/Scripts/yuri-hook-adapter.mjs');
  const missing = inventoryClaudeLifecycle(
    lifecycleFixtureSources(registry, { local: { hooks: { PreToolUse: commandGroup(command, 10) } } }),
    registry,
    { home: '/fixture-home', ...fixtureFileSystem({ missing: new Set([missingPath]) }) },
  );
  assert.equal(missing.ok, false);
  assert.ok(missing.entries[0].issues.includes('repo-local-command-path-missing'));

  const historical = inventoryClaudeLifecycle(
    lifecycleFixtureSources(registry, { local: { hooks: {
      SessionStart: commandGroup('node "$CLAUDE_PROJECT_DIR/.claude/hooks/missing.js"'),
    } } }),
    registry,
    { home: '/fixture-home', ...fixtureFileSystem() },
  );
  assert.ok(historical.entries[0].issues.includes('historical-claude-hook-path-forbidden'));
  assert.ok(historical.entries[0].issues.includes('repo-local-command-not-in-registered-dependency-closure'));
});

test('Claude lifecycle inventory rejects every retired execution prefix even when an adapter invokes it', () => {
  for (const prefix of ['.claude/hooks', '.omp/agents', '.openclaw/agents']) {
    const registry = loadRegistry();
    const adapter = registry.hooks
      .find((hook) => hook.hookId === 'yuri.pre-tool.enforcement')
      .providerAdapters.find((candidate) => candidate.provider === 'claude-code');
    const revived = `${prefix}/revived.mjs`;
    adapter.command = `node "$CLAUDE_PROJECT_DIR/${revived}"`;
    adapter.invokedPaths = [revived];
    const inventory = inventoryClaudeLifecycle(
      lifecycleFixtureSources(registry, { local: { hooks: {
        PreToolUse: commandGroup(adapter.command, 10),
      } } }),
      registry,
      { home: '/fixture-home', ...fixtureFileSystem() },
    );
    const entry = inventory.entries.find((candidate) => candidate.event === 'PreToolUse');
    assert.equal(entry.classification, 'repo-local', prefix);
    assert.ok(entry.issues.includes('retired-execution-path-forbidden'), prefix);
    assert.ok(entry.issues.includes('repo-local-command-not-in-registered-dependency-closure'), prefix);
  }
});

test('Claude lifecycle inventory rejects repo path escape and external October impostor fixtures', () => {
  const registry = loadRegistry();
  const escape = inventoryClaudeLifecycle(
    lifecycleFixtureSources(registry, { local: { hooks: {
      SessionStart: commandGroup('node "$CLAUDE_PROJECT_DIR/../escape.mjs"'),
    } } }),
    registry,
    { home: '/fixture-home', ...fixtureFileSystem() },
  );
  assert.equal(escape.entries[0].classification, 'repo-local-path-escape');
  assert.ok(escape.entries[0].issues.includes('repo-local-command-path-escapes-worktree'));

  const impostor = inventoryClaudeLifecycle(
    lifecycleFixtureSources(registry, { local: { hooks: {
      SessionStart: commandGroup('node "/tmp/.october/bus-hook.mjs" session-start'),
    } } }),
    registry,
    { home: '/fixture-home', ...fixtureFileSystem() },
  );
  assert.equal(impostor.entries[0].classification, 'unregistered-external');
  assert.ok(impostor.entries[0].issues.includes('external-command-not-exactly-registered'));
});

test('Claude lifecycle inventory includes statusLine and rejects an unregistered status-line contract', () => {
  const registry = loadRegistry();
  const statusLine = inventoryClaudeLifecycle(
    lifecycleFixtureSources(registry, { local: {
      statusLine: {
        type: 'command',
        command: 'node "$CLAUDE_PROJECT_DIR/_SYSTEM/Scripts/yuri-hook-adapter.mjs" --statusline',
      },
    } }),
    registry,
    { home: '/fixture-home', ...fixtureFileSystem() },
  );
  assert.equal(statusLine.entries.length, 1);
  assert.equal(statusLine.entries[0].surface, 'statusLine');
  assert.ok(statusLine.entries[0].issues.includes('repo-local-command-contract-unregistered'));
});

test('Claude lifecycle inventory exposes duplicate effective commands', () => {
  const registry = loadRegistry();
  const command = registry.hooks
    .find((hook) => hook.hookId === 'yuri.pre-tool.enforcement')
    .providerAdapters.find((adapter) => adapter.provider === 'claude-code').command;
  const duplicate = inventoryClaudeLifecycle(
    lifecycleFixtureSources(registry, { local: { hooks: {
      PreToolUse: [{ matcher: '', hooks: [
        { type: 'command', command, timeout: 10 },
        { type: 'command', command, timeout: 10 },
      ] }],
    } } }),
    registry,
    { home: '/fixture-home', ...fixtureFileSystem() },
  );
  assert.equal(duplicate.ok, false);
  assert.equal(duplicate.duplicates.length, 1);
  assert.equal(duplicate.duplicates[0].event, 'PreToolUse');
});

test('Claude lifecycle inventory rejects wrong hook type, restricted canonical matcher, and unbounded timeout', () => {
  const registry = loadRegistry();
  const sources = lifecycleFixtureSources(registry);
  const local = JSON.parse(sources[1].source);
  local.hooks.PreToolUse[0].matcher = 'Bash';
  local.hooks.PreToolUse[0].hooks[0].type = 'prompt';
  Reflect.deleteProperty(local.hooks.PreToolUse[0].hooks[0], 'timeout');
  local.hooks.UserPromptSubmit[0].matcher = 'never';
  local.hooks.UserPromptSubmit[0].hooks[0].type = 'prompt';
  Reflect.deleteProperty(local.hooks.UserPromptSubmit[0].hooks[0], 'timeout');
  sources[1].source = JSON.stringify(local);

  const inventory = inventoryClaudeLifecycle(
    sources,
    registry,
    { home: '/fixture-home', ...fixtureFileSystem() },
  );
  assert.equal(inventory.ok, false);
  for (const event of ['PreToolUse', 'UserPromptSubmit']) {
    const entry = inventory.entries.find((candidate) => candidate.event === event);
    assert.ok(entry.issues.includes('lifecycle-hook-type-must-be-command'));
    assert.ok(entry.issues.includes('canonical-command-type-mismatch'));
    assert.ok(entry.issues.includes('canonical-command-matcher-not-universal'));
    assert.ok(entry.issues.includes('canonical-command-timeout-unbounded'));
  }
});

test('Claude lifecycle inventory fails closed when the required October event set is absent', () => {
  const registry = loadRegistry();
  const pre = registry.hooks
    .find((hook) => hook.hookId === 'yuri.pre-tool.enforcement')
    .providerAdapters.find((adapter) => adapter.provider === 'claude-code').command;
  const prompt = registry.hooks
    .find((hook) => hook.hookId === 'october.prompt-context.pull')
    .providerAdapters.find((adapter) => adapter.provider === 'claude-code').command;
  const inventory = inventoryClaudeLifecycle(
    lifecycleFixtureSources(registry, { local: { hooks: {
      PreToolUse: commandGroup(pre, 10),
      UserPromptSubmit: commandGroup(prompt),
    } } }),
    registry,
    { home: '/fixture-home', ...fixtureFileSystem() },
  );
  assert.equal(inventory.ok, false);
  assert.equal(inventory.externalCoverage.ok, false);
  assert.equal(inventory.externalCoverage.expectedCount, 4);
  assert.equal(inventory.externalCoverage.missing.length, 4);
});

test('health behaviorally verifies every activated live projection', async () => {
  const health = await providerHealth();
  assert.equal(health.ok, true);
  assert.equal(health.checks.find((check) => check.id === 'omp-shared-safety-core').ok, true);
  for (const id of [
    'omp-universal-pretool-parity',
    'canonical-protected-read-enforcement',
    'codex-root-anchored-pretool',
    'claude-effective-settings-readable',
    'claude-lifecycle-command-liveness',
    'claude-project-mutating-lifecycle-retired',
    'claude-statusline-inventoried',
    'claude-external-october-exact-paths',
    'claude-no-duplicate-lifecycle-commands',
    'claude-no-active-historical-hook-paths',
    'claude-universal-pretool',
    'claude-bounded-october-prompt',
    'claude-legacy-hook-commands-retired',
    'codex-bounded-october-prompt',
  ]) assert.equal(health.checks.find((check) => check.id === id).ok, true, id);
});

test('sparse bootstrap plan is no-write and the current dependency closure is materialized', () => {
  const plan = sparseBootstrapPlan();
  assert.equal(plan.mutates, false);
  assert.deepEqual(plan.missing, []);
  assert.equal(plan.command, null);
  assert.ok(plan.required.includes('_SYSTEM/Scripts/yuri-hook-adapter.mjs'));
});

test('Claude, Codex, and OMP inputs normalize onto one logical PreToolUse decision', () => {
  const claude = normalizePreToolEvent({ tool_name: 'Bash', tool_input: { command: 'echo ok' } }, 'claude');
  const codex = normalizePreToolEvent({ tool_name: 'Bash', tool_input: { command: 'echo ok' } }, 'codex');
  const omp = normalizePreToolEvent({ toolName: 'bash', input: { command: 'echo ok' } }, 'omp');
  assert.deepEqual(claude.toolInput, codex.toolInput);
  assert.deepEqual(codex.toolInput, omp.toolInput);
  for (const [harness, event] of [['claude', claude], ['codex', codex], ['omp', omp]]) {
    assert.equal(evaluateUniversalPreTool(event, { harness }).allowed, true);
  }
});

test('destructive command is a structured deny with harness-native output', () => {
  const event = { tool_name: 'Bash', tool_input: { command: 'git reset --hard HEAD' }, cwd: ROOT };
  const decision = evaluateUniversalPreTool(event, { harness: 'codex' });
  assert.equal(decision.allowed, false);
  assert.match(decision.reason, /git reset --hard/u);
  assert.equal(renderHookDecision('codex', decision).hookSpecificOutput.permissionDecision, 'deny');
  assert.equal(renderHookDecision('claude', decision).hookSpecificOutput.permissionDecision, 'deny');
  assert.equal(renderHookDecision('omp', decision).block, true);
});

test('hook CLI never maps malformed JSON to exit 1', async () => {
  const out = capture();
  const code = await runCli(['--harness', 'codex'], {
    stdin: Readable.from(['{not-json']),
    stdout: out.stream,
  });
  assert.equal(code, 0);
  assert.equal(JSON.parse(out.read()).hookSpecificOutput.permissionDecision, 'deny');

  const nullOut = capture();
  const nullCode = await runCli(['--harness', 'codex'], {
    stdin: Readable.from(['null']),
    stdout: nullOut.stream,
  });
  assert.equal(nullCode, 0);
  const nullDecision = JSON.parse(nullOut.read());
  assert.equal(nullDecision.hookSpecificOutput.permissionDecision, 'deny');
  assert.equal(nullDecision.hookSpecificOutput.permissionDecisionReason, 'invalid hook event: expected object');
});

test('check mode uses exit 0 for allow and exit 2 for deny', async () => {
  const benignOut = capture();
  const benign = await runCli(['--harness', 'codex', '--check'], {
    stdin: Readable.from([JSON.stringify({ tool_name: 'Bash', tool_input: { command: 'echo ok' } })]),
    stdout: benignOut.stream,
  });
  assert.equal(benign, 0);
  assert.equal(benignOut.read(), '');

  const denyOut = capture();
  const denied = await runCli(['--harness', 'codex', '--check'], {
    stdin: Readable.from([JSON.stringify({ tool_name: 'Bash', tool_input: { command: 'git reset --hard HEAD' } })]),
    stdout: denyOut.stream,
  });
  assert.equal(denied, 2);
  assert.equal(JSON.parse(denyOut.read()).hookSpecificOutput.permissionDecision, 'deny');
});

test('October prompt delegate times out internally, emits no output, and remains fail-soft', async () => {
  const start = Date.now();
  const result = await runExternalDelegate({
    script: import.meta.filename,
    mode: 'pre-prompt',
    timeoutMs: 40,
    spawnImpl: stalledDelegateProcess,
  });
  assert.equal(result.ok, false);
  assert.equal(result.timedOut, true);
  assert.equal(result.stdout, '');
  assert.ok(Date.now() - start < 500);

  const out = capture();
  const code = await runCli(['--delegate-october', 'pre-prompt', '--timeout-ms', '40'], {
    stdin: Readable.from(['{}']),
    stdout: out.stream,
    delegateScript: import.meta.filename,
    spawnImpl: stalledDelegateProcess,
  });
  assert.equal(code, 0);
  assert.equal(out.read(), '');
});

test('synchronous delegate spawn defects resolve fail-soft instead of throwing or exiting 1', async () => {
  const result = await runExternalDelegate({
    script: import.meta.filename,
    mode: 'pre-prompt',
    spawnImpl() {
      throw new Error('fixture spawn failure');
    },
  });
  assert.equal(result.ok, false);
  assert.equal(result.timedOut, false);
  assert.match(result.reason, /fixture spawn failure/u);
});

test('October delegate receives only the minimal bus/process environment, never provider secrets', () => {
  const result = buildDelegateEnvironment({
    HOME: '/tmp/home',
    PATH: '/usr/bin',
    OCTOBER_BUS_PORT: '1234',
    OCTOBER_BUS_CANVAS: 'canvas',
    OCTOBER_BUS_NODE: 'node',
    OPENAI_API_KEY: 'must-not-pass',
    DEEPSEEK_API_KEY: 'must-not-pass',
  });
  assert.deepEqual(result, {
    HOME: '/tmp/home',
    OCTOBER_BUS_CANVAS: 'canvas',
    OCTOBER_BUS_NODE: 'node',
    OCTOBER_BUS_PORT: '1234',
    PATH: '/usr/bin',
  });
});
