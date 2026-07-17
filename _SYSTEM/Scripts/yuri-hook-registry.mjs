#!/usr/bin/env node
// @capability: yuri-universal-hook-registry
// @serves: universal hooks | hook registry | Claude hooks | Codex hooks | OMP hooks | PreToolUse | UserPromptSubmit | sparse hook bootstrap
// @does: Validates the canonical logical hook manifest, renders provider projections, proves dependency closure and hashes, and reports sparse-checkout/bootstrap health without activating providers.
// @use: Run --validate for offline invariants, --health for live projection drift, --render <provider> for deterministic projection JSON, --bootstrap-plan for a no-write sparse materialization plan, or --refresh-hashes after reviewed source changes.
// @exports: collectHashedPaths, loadRegistry, refreshHashes, renderProvider, sparseBootstrapPlan, validateRegistry

import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { createHandler as createOmpHandler } from '../../.omp/hooks/pre/url-safety-guard.js';
import { evaluateUniversalPreTool } from './yuri-hook-adapter.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(HERE, '../..');
export const REGISTRY_PATH = path.join(ROOT, '_SYSTEM/config/yuri-hook-registry.json');

function sha256File(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function repoPath(relative) {
  assert(typeof relative === 'string' && relative.length > 0, 'registered path must be a non-empty string');
  assert(!path.isAbsolute(relative), `registered path must be relative: ${relative}`);
  assert(!relative.startsWith('~'), `external path is not a repo dependency: ${relative}`);
  const resolved = path.resolve(ROOT, relative);
  assert(resolved === ROOT || resolved.startsWith(`${ROOT}${path.sep}`), `registered path escapes worktree: ${relative}`);
  return resolved;
}

export function loadRegistry(registryPath = REGISTRY_PATH) {
  return JSON.parse(fs.readFileSync(registryPath, 'utf8'));
}

export function collectHashedPaths(registry) {
  const paths = new Set();
  for (const hook of registry.hooks ?? []) {
    for (const dependency of hook.dependencyClosure ?? []) paths.add(dependency);
    for (const adapter of hook.providerAdapters ?? []) {
      if (adapter.activation?.startsWith('external-')) continue;
      if (adapter.projection && !adapter.projection.endsWith('settings.local.json')) paths.add(adapter.projection);
    }
  }
  paths.add('.codex/hooks/pre-tool-use.mjs');
  return [...paths].sort();
}

export function refreshHashes(registry = loadRegistry()) {
  const hashes = {};
  for (const relative of collectHashedPaths(registry)) {
    const absolute = repoPath(relative);
    assert(fs.existsSync(absolute), `cannot hash absent registered path: ${relative}`);
    hashes[relative] = sha256File(absolute);
  }
  return { ...registry, contentHashes: hashes };
}

function validateProviderAdapter(adapter, hookId) {
  assert(adapter && typeof adapter === 'object', `${hookId}: provider adapter must be an object`);
  assert(['claude-code', 'codex', 'omp'].includes(adapter.provider), `${hookId}: unsupported provider ${adapter.provider}`);
  assert(typeof adapter.projection === 'string' && adapter.projection, `${hookId}/${adapter.provider}: missing projection`);
  assert(typeof adapter.activation === 'string' && adapter.activation, `${hookId}/${adapter.provider}: missing activation`);
  assert(typeof adapter.command === 'string' && adapter.command, `${hookId}/${adapter.provider}: missing command`);
  assert(!/\bnode\s+\.(?:codex|claude|omp)\//u.test(adapter.command), `${hookId}/${adapter.provider}: cwd-relative node command forbidden`);
  if (adapter.provider === 'codex' && adapter.command.startsWith('node ')) {
    assert(adapter.command.includes('git rev-parse --show-toplevel'), `${hookId}/codex: command must resolve the worktree root`);
  }
  if (adapter.provider === 'claude-code' && adapter.command.startsWith('node ')) {
    assert(adapter.command.includes('$CLAUDE_PROJECT_DIR'), `${hookId}/claude-code: command must use CLAUDE_PROJECT_DIR`);
  }
  assert(Array.isArray(adapter.invokedPaths) && adapter.invokedPaths.length > 0, `${hookId}/${adapter.provider}: invokedPaths required`);
}

export function validateRegistry(registry = loadRegistry(), { checkHashes = true } = {}) {
  assert(registry.schemaVersion === 1, 'unsupported hook registry schemaVersion');
  assert(registry.kind === 'yuri-universal-hook-registry', 'unexpected hook registry kind');
  assert(registry.authority?.owner === 'YURI', 'YURI must own the logical hook registry');
  assert(registry.authority?.architecture === 'MURE-matrix-first', 'hook registry must inherit MURE-matrix-first architecture');
  assert(registry.authority?.namedTerminalsAreRoles === false, 'terminal names must not become hook roles');
  assert(registry.authority?.retiredAdapters?.includes('OpenClaw'), 'OpenClaw retirement must remain explicit');
  assert(registry.rootPolicy?.absoluteCanonicalClonePathsForbidden === true, 'canonical-clone absolute paths must be forbidden');

  const serialized = JSON.stringify(registry);
  assert(!/term-[a-z0-9-]+/iu.test(serialized), 'transient October node identity found in durable hook registry');
  assert(!/dangerously-bypass-hook-trust/iu.test(serialized), 'hook trust bypass cannot appear in the registry');
  assert(!(registry.hooks ?? []).some((hook) => (hook.providerAdapters ?? []).some((adapter) => /openclaw/iu.test(adapter.provider))), 'OpenClaw cannot be a provider adapter');

  const activated = (registry.hooks ?? []).flatMap((hook) => hook.providerAdapters ?? [])
    .some((adapter) => /(?:^|-)active(?:-|$)/u.test(adapter.activation));
  if (activated) {
    assert(registry.liveActivation?.ownerApproved === true, 'live provider activation requires explicit owner approval');
    assert(/reload|verified/u.test(registry.liveActivation?.status ?? ''), 'live activation receipt must declare verification/reload state');
  }

  const ids = new Set();
  for (const hook of registry.hooks ?? []) {
    assert(typeof hook.hookId === 'string' && hook.hookId, 'hookId required');
    assert(!ids.has(hook.hookId), `duplicate hookId: ${hook.hookId}`);
    ids.add(hook.hookId);
    assert(['PreToolUse', 'UserPromptSubmit'].includes(hook.logicalEvent), `${hook.hookId}: unsupported logical event`);
    assert(typeof hook.owner === 'string' && hook.owner, `${hook.hookId}: owner required`);
    assert(Number.isInteger(hook.version) && hook.version > 0, `${hook.hookId}: positive version required`);
    assert(typeof hook.coreEntrypoint === 'string' && hook.coreEntrypoint, `${hook.hookId}: coreEntrypoint required`);
    assert(typeof hook.enabled === 'boolean' && typeof hook.required === 'boolean' && typeof hook.optional === 'boolean', `${hook.hookId}: activation booleans required`);
    assert(hook.required !== hook.optional, `${hook.hookId}: required and optional must be complements`);
    assert(Array.isArray(hook.dependencyClosure) && hook.dependencyClosure.includes(hook.coreEntrypoint), `${hook.hookId}: dependency closure must contain coreEntrypoint`);
    assert(typeof hook.failMode === 'string' && hook.failMode, `${hook.hookId}: failMode required`);
    assert(typeof hook.protectedScope === 'string' && hook.protectedScope, `${hook.hookId}: protectedScope required`);
    assert(typeof hook.teardown === 'string' && hook.teardown, `${hook.hookId}: teardown required`);
    assert(Array.isArray(hook.sourceRefs) && hook.sourceRefs.length > 0, `${hook.hookId}: sourceRefs required`);
    assert(Array.isArray(hook.providerAdapters) && hook.providerAdapters.length > 0, `${hook.hookId}: providerAdapters required`);
    for (const dependency of hook.dependencyClosure) {
      const absolute = repoPath(dependency);
      assert(fs.existsSync(absolute), `${hook.hookId}: dependency absent: ${dependency}`);
      assert(fs.statSync(absolute).isFile(), `${hook.hookId}: dependency is not a file: ${dependency}`);
    }
    for (const adapter of hook.providerAdapters) validateProviderAdapter(adapter, hook.hookId);
    if (hook.logicalEvent === 'PreToolUse') {
      assert(hook.exitContract?.normal === 0 && hook.exitContract?.deniedInHookMode === 0, `${hook.hookId}: hook allow/deny must exit 0`);
      assert(hook.exitContract?.deniedInCheckMode === 2, `${hook.hookId}: check-mode deny must exit 2`);
    }
    if (hook.logicalEvent === 'UserPromptSubmit') {
      assert(/1800 ms/u.test(hook.failMode), `${hook.hookId}: bounded internal deadline missing`);
      assert(hook.exitContract?.timeout === 0 && hook.exitContract?.delegateError === 0, `${hook.hookId}: context bridge must fail soft`);
    }
  }
  assert(ids.has('yuri.pre-tool.enforcement'), 'canonical PreToolUse enforcement hook missing');
  assert(ids.has('october.prompt-context.pull'), 'bounded October UserPromptSubmit bridge missing');

  if (checkHashes) {
    const expectedPaths = collectHashedPaths(registry);
    assert(Object.keys(registry.contentHashes ?? {}).sort().join('\n') === expectedPaths.join('\n'), 'contentHashes keys do not match registered closure');
    for (const relative of expectedPaths) {
      const actual = sha256File(repoPath(relative));
      assert(registry.contentHashes[relative] === actual, `content hash drift: ${relative}`);
    }
  }
  return { ok: true, hooks: ids.size, hashedPaths: collectHashedPaths(registry).length };
}

function adapterFor(registry, hookId, provider) {
  const hook = registry.hooks.find((entry) => entry.hookId === hookId);
  return hook?.providerAdapters?.find((adapter) => adapter.provider === provider);
}

export function renderProvider(provider, registry = loadRegistry()) {
  validateRegistry(registry);
  if (provider === 'claude-code' || provider === 'claude') {
    const pre = adapterFor(registry, 'yuri.pre-tool.enforcement', 'claude-code');
    const prompt = adapterFor(registry, 'october.prompt-context.pull', 'claude-code');
    return {
      hooks: {
        PreToolUse: [{ _yuri: true, matcher: '', hooks: [{ type: 'command', command: pre.command, timeout: 10 }] }],
        UserPromptSubmit: [{ _yuri: true, matcher: '', hooks: [{ type: 'command', command: prompt.command, timeout: 5 }] }],
      },
    };
  }
  if (provider === 'codex') {
    const pre = adapterFor(registry, 'yuri.pre-tool.enforcement', 'codex');
    const prompt = adapterFor(registry, 'october.prompt-context.pull', 'codex');
    return {
      inlineToml: [
        '[[hooks.PreToolUse]]',
        'matcher = "*"',
        '',
        '[[hooks.PreToolUse.hooks]]',
        'type = "command"',
        `command = ${JSON.stringify(pre.command)}`,
        'timeout = 10',
        'statusMessage = "Applying YURI policy"',
      ].join('\n'),
      hooksJsonOverlay: {
        UserPromptSubmit: [{ hooks: [{ type: 'command', command: prompt.command, timeout: 10 }] }],
      },
    };
  }
  if (provider === 'omp') {
    const pre = adapterFor(registry, 'yuri.pre-tool.enforcement', 'omp');
    return { logicalEvent: 'PreToolUse', hookApiEvent: 'tool_call', module: pre.projection, dependencyClosure: pre.invokedPaths };
  }
  throw new Error(`unsupported provider: ${provider}`);
}

function trackedPaths() {
  const output = execFileSync('git', ['ls-files'], { cwd: ROOT, encoding: 'utf8' });
  return new Set(output.split('\n').filter(Boolean));
}

export function sparseBootstrapPlan(registry = loadRegistry()) {
  const tracked = trackedPaths();
  const required = collectHashedPaths(registry);
  const untracked = required.filter((relative) => !tracked.has(relative));
  const missing = required.filter((relative) => !fs.existsSync(repoPath(relative)));
  const directories = [...new Set(missing.filter((relative) => tracked.has(relative)).map((relative) => path.posix.dirname(relative)))].sort();
  return {
    mutates: false,
    required,
    untracked,
    missing,
    command: directories.length ? ['git', 'sparse-checkout', 'add', '--skip-checks', ...directories] : null,
  };
}

export function codexPreToolCommands(source) {
  const text = String(source);
  const marker = '[[hooks.PreToolUse]]';
  const commands = [];
  for (const group of text.split(marker).slice(1)) {
    const boundary = group.search(/\n\s*\[\[hooks\.(?!PreToolUse\.hooks\]\])[^\]\n]+\]\]/u);
    const block = boundary === -1 ? group : group.slice(0, boundary);
    const match = block.match(/\bcommand\s*=\s*("(?:\\.|[^"\\])*")/u);
    if (!match) continue;
    try { commands.push(JSON.parse(match[1])); } catch { /* invalid TOML string is not healthy */ }
  }
  return commands;
}

export function jsonHookCommands(source, event) {
  try {
    const parsed = JSON.parse(String(source));
    return (parsed?.hooks?.[event] ?? [])
      .flatMap((group) => group?.hooks ?? [])
      .map((hook) => hook?.command)
      .filter((command) => typeof command === 'string');
  } catch {
    return [];
  }
}

export async function providerHealth(registry = loadRegistry()) {
  validateRegistry(registry);
  const checks = [];
  const codex = fs.readFileSync(path.join(ROOT, '.codex/config.toml'), 'utf8');
  const codexCommand = adapterFor(registry, 'yuri.pre-tool.enforcement', 'codex').command;
  checks.push({ id: 'codex-root-anchored-pretool', ok: codexPreToolCommands(codex).join('\n') === codexCommand });

  const omp = fs.readFileSync(path.join(ROOT, '.omp/hooks/pre/url-safety-guard.js'), 'utf8');
  checks.push({ id: 'omp-shared-safety-core', ok: omp.includes('yuri-safety-core.mjs') && omp.includes('url-policy.mjs') });
  const ompFixtureHandler = createOmpHandler(
    () => null,
    () => ({ allowed: false, decision: 'deny', reason: 'fixture policy deny' }),
  );
  const ompFixtureResults = await Promise.all([
    ompFixtureHandler({ toolName: 'bash', input: { command: 'echo fixture' } }),
    ompFixtureHandler({ toolName: 'Bash', input: { command: 'echo fixture' } }),
    ompFixtureHandler({ toolName: 'Write', input: { file_path: 'fixture.txt', content: 'fixture' } }),
  ]);
  checks.push({
    id: 'omp-universal-pretool-parity',
    ok: ompFixtureResults.every((result) => result?.block === true),
    detail: 'lowercase bash, provider-cased Bash, and non-shell tools must all reach shared policy',
  });

  const protectedRead = evaluateUniversalPreTool(
    { tool_name: 'Read', tool_input: { file_path: '.env' }, cwd: ROOT },
    { harness: 'codex' },
  );
  checks.push({
    id: 'canonical-protected-read-enforcement',
    ok: protectedRead?.allowed === false,
    detail: 'direct Read-tool protected paths must be denied without opening the target',
  });

  const claudeLocalPath = path.join(ROOT, '.claude/settings.local.json');
  const claude = fs.existsSync(claudeLocalPath) ? fs.readFileSync(claudeLocalPath, 'utf8') : '';
  const claudePreTool = jsonHookCommands(claude, 'PreToolUse');
  const claudePrompt = jsonHookCommands(claude, 'UserPromptSubmit');
  checks.push({ id: 'claude-universal-pretool', ok: claudePreTool.join('\n') === adapterFor(registry, 'yuri.pre-tool.enforcement', 'claude-code').command });
  checks.push({ id: 'claude-bounded-october-prompt', ok: claudePrompt.join('\n') === adapterFor(registry, 'october.prompt-context.pull', 'claude-code').command });

  const codexHooksPath = path.join(ROOT, '.codex/hooks.json');
  const codexHooks = fs.existsSync(codexHooksPath) ? fs.readFileSync(codexHooksPath, 'utf8') : '';
  const codexPrompt = jsonHookCommands(codexHooks, 'UserPromptSubmit');
  checks.push({ id: 'codex-bounded-october-prompt', ok: codexPrompt.join('\n') === adapterFor(registry, 'october.prompt-context.pull', 'codex').command });

  return { ok: checks.every((check) => check.ok), checks };
}

function option(argv, flag) {
  const index = argv.indexOf(flag);
  return index === -1 ? null : argv[index + 1] ?? null;
}

export async function run(argv = process.argv.slice(2), stdout = process.stdout) {
  if (argv.includes('--refresh-hashes')) {
    const refreshed = refreshHashes();
    fs.writeFileSync(REGISTRY_PATH, `${JSON.stringify(refreshed, null, 2)}\n`);
    stdout.write(`${JSON.stringify(validateRegistry(refreshed), null, 2)}\n`);
    return 0;
  }
  if (argv.includes('--validate')) {
    stdout.write(`${JSON.stringify(validateRegistry(), null, 2)}\n`);
    return 0;
  }
  if (argv.includes('--health')) {
    const result = await providerHealth();
    stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return result.ok ? 0 : 1;
  }
  if (argv.includes('--bootstrap-plan')) {
    stdout.write(`${JSON.stringify(sparseBootstrapPlan(), null, 2)}\n`);
    return 0;
  }
  const provider = option(argv, '--render');
  if (provider) {
    stdout.write(`${JSON.stringify(renderProvider(provider), null, 2)}\n`);
    return 0;
  }
  stdout.write('usage: yuri-hook-registry.mjs --validate | --health | --bootstrap-plan | --render <claude|codex|omp> | --refresh-hashes\n');
  return 2;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  run().then((code) => { process.exitCode = code; }).catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
}
