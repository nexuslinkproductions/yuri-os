#!/usr/bin/env node
// @capability: yuri-universal-hook-registry
// @serves: universal hooks | hook registry | Claude hooks | Codex hooks | OMP hooks | PreToolUse | UserPromptSubmit | sparse hook bootstrap
// @does: Validates the canonical logical hook manifest, renders provider projections, proves dependency closure and hashes, and reports sparse-checkout/bootstrap health without activating providers.
// @use: Run --validate for offline invariants, --health for live projection drift, --render <provider> for deterministic projection JSON, --bootstrap-plan for a no-write sparse materialization plan, or --refresh-hashes after reviewed source changes.
// @exports: collectHashedPaths, effectiveJsonHookCommands, inventoryClaudeLifecycle, loadRegistry, refreshHashes, renderProvider, sparseBootstrapPlan, validateRegistry

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
const RETIRED_EXECUTION_PATH_PREFIXES = ['.claude/hooks/', '.omp/agents/', '.openclaw/agents/'];

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

function normalizedRepoRelativePath(relative) {
  return path.relative(ROOT, repoPath(relative)).split(path.sep).join('/');
}

function isRetiredExecutionPath(relative) {
  const normalized = normalizedRepoRelativePath(relative);
  return RETIRED_EXECUTION_PATH_PREFIXES.some((prefix) => (
    normalized === prefix.slice(0, -1) || normalized.startsWith(prefix)
  ));
}

export function loadRegistry(registryPath = REGISTRY_PATH) {
  return JSON.parse(fs.readFileSync(registryPath, 'utf8'));
}

export function collectHashedPaths(registry) {
  const paths = new Set();
  for (const hook of registry.hooks ?? []) {
    for (const dependency of hook.dependencyClosure ?? []) paths.add(dependency);
    for (const adapter of hook.providerAdapters ?? []) {
      if (adapter.projection) {
        assert(
          !isRetiredExecutionPath(adapter.projection),
          `${hook.hookId}/${adapter.provider}: retired projection path forbidden: ${adapter.projection}`,
        );
        const normalizedProjection = normalizedRepoRelativePath(adapter.projection);
        assert(
          adapter.projection === normalizedProjection,
          `${hook.hookId}/${adapter.provider}: projection path must be canonical: ${adapter.projection}`,
        );
      }
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
  assert(
    !isRetiredExecutionPath(adapter.projection),
    `${hookId}/${adapter.provider}: retired projection path forbidden: ${adapter.projection}`,
  );
  const normalizedProjection = normalizedRepoRelativePath(adapter.projection);
  assert(
    adapter.projection === normalizedProjection,
    `${hookId}/${adapter.provider}: projection path must be canonical: ${adapter.projection}`,
  );
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
  assert(
    JSON.stringify(registry.authority?.retiredAgentSurfaces) === JSON.stringify(['.openclaw/agents', '.omp/agents']),
    'OpenClaw and .omp agent authority surfaces must remain retired',
  );
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
    assert(['PreToolUse', 'UserPromptSubmit', 'PostToolUse'].includes(hook.logicalEvent), `${hook.hookId}: unsupported logical event`);
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
    const canonicalDependencyClosure = new Set();
    for (const dependency of hook.dependencyClosure) {
      assert(!isRetiredExecutionPath(dependency), `${hook.hookId}: retired execution path forbidden: ${dependency}`);
      const normalizedDependency = normalizedRepoRelativePath(dependency);
      assert(dependency === normalizedDependency, `${hook.hookId}: dependency path must be canonical: ${dependency}`);
      canonicalDependencyClosure.add(normalizedDependency);
      const absolute = repoPath(dependency);
      assert(fs.existsSync(absolute), `${hook.hookId}: dependency absent: ${dependency}`);
      assert(fs.statSync(absolute).isFile(), `${hook.hookId}: dependency is not a file: ${dependency}`);
    }
    for (const adapter of hook.providerAdapters) {
      validateProviderAdapter(adapter, hook.hookId);
      for (const invokedPath of adapter.invokedPaths) {
        if (typeof invokedPath !== 'string' || path.isAbsolute(invokedPath) || invokedPath.startsWith('~')) continue;
        assert(!isRetiredExecutionPath(invokedPath), `${hook.hookId}/${adapter.provider}: retired execution path forbidden: ${invokedPath}`);
        const normalizedInvokedPath = normalizedRepoRelativePath(invokedPath);
        assert(invokedPath === normalizedInvokedPath, `${hook.hookId}/${adapter.provider}: invoked path must be canonical: ${invokedPath}`);
        if (adapter.provider === 'claude-code') {
          assert(
            canonicalDependencyClosure.has(normalizedInvokedPath),
            `${hook.hookId}/${adapter.provider}: invoked path is not declared in dependencyClosure: ${invokedPath}`,
          );
        }
      }
      if (adapter.provider === 'claude-code') {
        const entrypoint = parseCommandEntrypoint(adapter.command);
        assert(entrypoint, `${hook.hookId}/claude-code: command entrypoint is not parseable`);
        const resolvedEntrypoint = resolveRepoCommandPath(entrypoint.pathToken, ROOT);
        assert(resolvedEntrypoint.kind === 'repo', `${hook.hookId}/claude-code: command entrypoint must resolve inside the worktree`);
        assert(
          !isRetiredExecutionPath(resolvedEntrypoint.relative),
          `${hook.hookId}/claude-code: retired command entrypoint forbidden: ${resolvedEntrypoint.relative}`,
        );
        assert(
          canonicalDependencyClosure.has(resolvedEntrypoint.relative),
          `${hook.hookId}/claude-code: command entrypoint is not declared in dependencyClosure: ${resolvedEntrypoint.relative}`,
        );
      }
    }
    if (hook.logicalEvent === 'PreToolUse') {
      assert(hook.exitContract?.normal === 0 && hook.exitContract?.deniedInHookMode === 0, `${hook.hookId}: hook allow/deny must exit 0`);
      assert(hook.exitContract?.deniedInCheckMode === 2, `${hook.hookId}: check-mode deny must exit 2`);
    }
    if (hook.logicalEvent === 'UserPromptSubmit') {
      assert(/1800 ms/u.test(hook.failMode), `${hook.hookId}: bounded internal deadline missing`);
      assert(hook.exitContract?.timeout === 0 && hook.exitContract?.delegateError === 0, `${hook.hookId}: context bridge must fail soft`);
    }
    if (hook.logicalEvent === 'PostToolUse') {
      assert(hook.providerActivationRequired === false, `${hook.hookId}: optional PostToolUse provider activation must remain explicit`);
      assert(
        hook.exitContract?.normal === 0
          && hook.exitContract?.disabled === 0
          && hook.exitContract?.runtimeError === 0,
        `${hook.hookId}: PostToolUse telemetry must fail soft`,
      );
    }
  }
  assert(ids.has('yuri.pre-tool.enforcement'), 'canonical PreToolUse enforcement hook missing');
  assert(ids.has('october.prompt-context.pull'), 'bounded October UserPromptSubmit bridge missing');
  assert(ids.has('yuri.energy.tick'), 'canonical PostToolUse energy hook missing');

  const claudeMerge = registry.providerMergeContracts?.['claude-code'];
  assert(claudeMerge && typeof claudeMerge === 'object', 'Claude effective-settings merge contract missing');
  assert(
    JSON.stringify(claudeMerge.settingsSources) === JSON.stringify(['.claude/settings.json', '.claude/settings.local.json']),
    'Claude effective-settings sources must be the repository project and project-local settings',
  );
  for (const relative of claudeMerge.settingsSources) repoPath(relative);
  assert(claudeMerge.exactCommandCount === 1, 'Claude effective hook events must require exactly one command');
  const lifecycle = claudeMerge.lifecycleLiveness;
  assert(lifecycle?.inventoryAllHookEvents === true, 'Claude lifecycle health must inventory every hook event');
  assert(lifecycle?.includeStatusLine === true, 'Claude lifecycle health must include statusLine');
  assert(lifecycle?.executeCommands === false, 'Claude lifecycle inventory must never execute commands');
  assert(
    lifecycle.projectSettingsLifecycle?.source === '.claude/settings.json'
      && lifecycle.projectSettingsLifecycle?.status === 'mutating-lifecycle-chain-retired-during-recovery'
      && lifecycle.projectSettingsLifecycle?.requiredCommandCount === 0
      && lifecycle.projectSettingsLifecycle?.requiredHookEntryCount === 0
      && lifecycle.projectSettingsLifecycle?.statusLineAllowed === false,
    'project mutating lifecycle chain must remain retired during recovery',
  );
  assert(
    lifecycle.repoLocalCommands?.mustResolveInsideWorktree === true
      && lifecycle.repoLocalCommands?.mustExist === true
      && lifecycle.repoLocalCommands?.mustBelongToRegisteredDependencyClosure === true,
    'active repo-local Claude commands require worktree containment, liveness, and dependency registration',
  );
  assert(
    JSON.stringify(lifecycle.repoLocalCommands?.forbiddenPathPrefixes) === JSON.stringify(RETIRED_EXECUTION_PATH_PREFIXES),
    'retired Claude/OpenClaw/.omp execution prefixes must remain forbidden',
  );
  assert(
    JSON.stringify(lifecycle.canonicalEventContracts) === JSON.stringify({
      PreToolUse: { hookType: 'command', matcher: '', maxTimeoutSeconds: 10 },
      UserPromptSubmit: { hookType: 'command', matcher: '', maxTimeoutSeconds: 5 },
      PostToolUse: { hookType: 'command', matcher: '', maxTimeoutSeconds: 10 },
    }),
    'Claude canonical event type/matcher/timeout contracts drifted',
  );
  assert(
    lifecycle.futureSessionDoctor?.status === 'not-active-until-separately-registered-and-reviewed'
      && lifecycle.futureSessionDoctor?.readOnly === true
      && lifecycle.futureSessionDoctor?.bounded === true
      && lifecycle.futureSessionDoctor?.failSoft === true,
    'future SessionStart doctor must remain inactive, read-only, bounded, and fail-soft',
  );
  assert(
    Array.isArray(lifecycle.externalGeneratedCommands) && lifecycle.externalGeneratedCommands.length === 1,
    'Claude lifecycle must declare exactly one external generated command contract',
  );
  const octoberExternal = lifecycle.externalGeneratedCommands[0];
  assert(octoberExternal.contractId === 'october.claude.generated-lifecycle', 'unexpected external lifecycle contract');
  assert(octoberExternal.owner === 'October' && octoberExternal.classification === 'external-generated-october', 'external lifecycle owner/classification drift');
  assert(octoberExternal.source === '.claude/settings.local.json', 'external October lifecycle source must be project-local settings');
  assert(octoberExternal.executable === 'node' && octoberExternal.scriptPath === '~/.october/bus-hook.mjs', 'external October command path must remain exact');
  assert(
    octoberExternal.required === true
      && octoberExternal.mustExist === true
      && octoberExternal.hookType === 'command'
      && octoberExternal.matcher === '*'
      && octoberExternal.maxTimeoutSeconds === 5,
    'external October lifecycle liveness/type/matcher/timeout contract drift',
  );
  assert(
    JSON.stringify(octoberExternal.eventModes) === JSON.stringify({
      SessionStart: 'session-start',
      Stop: 'stop',
      SessionEnd: 'session-end',
      Notification: 'notify',
    }),
    'external October lifecycle event modes drifted',
  );
  assert(
    JSON.stringify(claudeMerge.eventOwners) === JSON.stringify({
      PreToolUse: 'yuri.pre-tool.enforcement',
      UserPromptSubmit: 'october.prompt-context.pull',
      PostToolUse: 'yuri.energy.tick',
    }),
    'Claude effective hook event ownership must remain canonical',
  );
  for (const [logicalEvent, hookId] of Object.entries(claudeMerge.eventOwners)) {
    const hook = (registry.hooks ?? []).find((entry) => entry.hookId === hookId);
    assert(hook?.logicalEvent === logicalEvent, `Claude ${logicalEvent} merge owner is invalid: ${hookId}`);
    assert(
      hook.providerAdapters?.some((adapter) => adapter.provider === 'claude-code'),
      `Claude ${logicalEvent} merge owner has no claude-code adapter: ${hookId}`,
    );
  }
  assert(
    claudeMerge.forbiddenLegacyCommands?.includes('node "$CLAUDE_PROJECT_DIR/.claude/hooks/user-prompt-submit.js"'),
    'legacy Claude UserPromptSubmit command must remain explicitly forbidden',
  );

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
    const energy = adapterFor(registry, 'yuri.energy.tick', 'claude-code');
    return {
      hooks: {
        PreToolUse: [{ _yuri: true, matcher: '', hooks: [{ type: 'command', command: pre.command, timeout: 10 }] }],
        UserPromptSubmit: [{ _yuri: true, matcher: '', hooks: [{ type: 'command', command: prompt.command, timeout: 5 }] }],
        PostToolUse: [{ _yuri: true, matcher: '', hooks: [{ type: 'command', command: energy.command, timeout: 10 }] }],
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

export function effectiveJsonHookCommands(sources, event) {
  assert(Array.isArray(sources), 'effective JSON hook sources must be an array');
  return sources.flatMap((source) => jsonHookCommands(source, event));
}

function isInside(root, candidate) {
  return candidate === root || candidate.startsWith(`${root}${path.sep}`);
}

function claudeRepoDependencyClosure(registry) {
  const closure = new Set();
  for (const hook of registry.hooks ?? []) {
    for (const relative of hook.dependencyClosure ?? []) {
      if (typeof relative === 'string' && !path.isAbsolute(relative) && !relative.startsWith('~')) closure.add(relative);
    }
  }
  return closure;
}

function parseCommandEntrypoint(command) {
  const source = String(command);
  if (/[\r\n;&|<>`]/u.test(source)) return null;
  const match = source.match(/^\s*(node|bun|bash|sh|python(?:3(?:\.\d+)?)?)\s+(?:"([^"]+)"|'([^']+)'|([^\s]+))(?:\s+[^\r\n;&|<>`]*)?\s*$/u);
  if (!match) return null;
  return { executable: match[1], pathToken: match[2] ?? match[3] ?? match[4] };
}

function resolveRepoCommandPath(pathToken, root) {
  let relative = null;
  if (pathToken.startsWith('$CLAUDE_PROJECT_DIR/')) relative = pathToken.slice('$CLAUDE_PROJECT_DIR/'.length);
  else if (pathToken.startsWith('${CLAUDE_PROJECT_DIR}/')) relative = pathToken.slice('${CLAUDE_PROJECT_DIR}/'.length);
  else if (path.isAbsolute(pathToken)) {
    const absolute = path.resolve(pathToken);
    if (!isInside(root, absolute)) return { kind: 'external', absolute };
    relative = path.relative(root, absolute);
  } else if (/^(?:\.\.?\/|_SYSTEM\/|\.claude\/|\.codex\/|\.omp\/)/u.test(pathToken)) {
    relative = pathToken;
  } else {
    return { kind: 'unresolved' };
  }

  if (/[$]/u.test(relative)) return { kind: 'unresolved' };
  const absolute = path.resolve(root, relative);
  if (!isInside(root, absolute)) return { kind: 'escape', absolute };
  return {
    kind: 'repo',
    absolute,
    relative: path.relative(root, absolute).split(path.sep).join('/'),
  };
}

function externalCommandContracts(registry, home) {
  const contracts = registry.providerMergeContracts['claude-code'].lifecycleLiveness.externalGeneratedCommands;
  return contracts.map((contract) => {
    const script = contract.scriptPath.startsWith('~/')
      ? path.join(home, contract.scriptPath.slice(2))
      : path.resolve(contract.scriptPath);
    return {
      ...contract,
      script,
      commands: Object.fromEntries(
        Object.entries(contract.eventModes).map(([event, mode]) => [event, `${contract.executable} "${script}" ${mode}`]),
      ),
    };
  });
}

function commandRecordsFromSettings(relative, source) {
  const errors = [];
  let parsed;
  try {
    parsed = JSON.parse(String(source));
  } catch {
    return { relative, valid: false, records: [], errors: [`${relative}: invalid JSON`] };
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { relative, valid: false, records: [], errors: [`${relative}: settings root must be an object`] };
  }

  const records = [];
  let hookEntryCount = 0;
  const hooks = parsed.hooks ?? {};
  if (hooks === null || typeof hooks !== 'object' || Array.isArray(hooks)) {
    errors.push(`${relative}: hooks must be an object`);
  } else {
    for (const [event, groups] of Object.entries(hooks)) {
      if (!Array.isArray(groups)) {
        errors.push(`${relative}: ${event} hook groups must be an array`);
        continue;
      }
      groups.forEach((group, groupIndex) => {
        if (!Array.isArray(group?.hooks)) {
          errors.push(`${relative}: ${event}[${groupIndex}].hooks must be an array`);
          return;
        }
        group.hooks.forEach((hook, commandIndex) => {
          hookEntryCount += 1;
          if (hook?.type !== 'command') {
            errors.push(`${relative}: ${event}[${groupIndex}].hooks[${commandIndex}] unsupported hook type`);
          }
          if (typeof hook?.command !== 'string') {
            if (hook?.type === 'command') errors.push(`${relative}: ${event}[${groupIndex}].hooks[${commandIndex}] command missing`);
            return;
          }
          records.push({
            source: relative,
            surface: 'hook',
            event,
            hookType: hook.type ?? null,
            matcher: typeof group.matcher === 'string' ? group.matcher : '',
            groupIndex,
            commandIndex,
            command: hook.command,
            timeout: hook.timeout ?? null,
          });
        });
      });
    }
  }

  if (parsed.statusLine !== undefined) {
    if (typeof parsed.statusLine?.command === 'string') {
      records.push({
        source: relative,
        surface: 'statusLine',
        event: 'statusLine',
        hookType: parsed.statusLine.type ?? null,
        matcher: '',
        groupIndex: 0,
        commandIndex: 0,
        command: parsed.statusLine.command,
        timeout: parsed.statusLine.timeout ?? null,
      });
    } else {
      errors.push(`${relative}: statusLine command missing`);
    }
  }
  return {
    relative,
    valid: errors.length === 0,
    records,
    errors,
    hookEntryCount,
    statusLineDeclared: parsed.statusLine !== undefined,
  };
}

export function inventoryClaudeLifecycle(
  sources,
  registry = loadRegistry(),
  {
    root = ROOT,
    home = os.homedir(),
    existsSync = fs.existsSync,
    statSync = fs.statSync,
    realpathSync = fs.realpathSync,
  } = {},
) {
  assert(Array.isArray(sources), 'Claude lifecycle settings sources must be an array');
  const lifecycle = registry.providerMergeContracts['claude-code'].lifecycleLiveness;
  const closure = claudeRepoDependencyClosure(registry);
  const adapterCommands = new Map();
  for (const hook of registry.hooks ?? []) {
    for (const adapter of hook.providerAdapters ?? []) {
      if (adapter.provider === 'claude-code') adapterCommands.set(adapter.command, hook.logicalEvent);
    }
  }
  const externalContracts = externalCommandContracts(registry, home);
  const parsedSources = sources.map(({ relative, source }) => commandRecordsFromSettings(relative, source));
  const sourceErrors = parsedSources.flatMap((entry) => entry.errors);
  const rootReal = realpathSync(root);

  const entries = parsedSources.flatMap((entry) => entry.records).map((record) => {
    const issues = [];
    let classification = 'unclassified';
    let scriptPath = null;
    let repoRelativePath = null;

    if (record.hookType !== 'command') issues.push('lifecycle-hook-type-must-be-command');
    if (record.surface === 'statusLine' && (!Number.isFinite(record.timeout) || record.timeout <= 0)) {
      issues.push('statusline-command-timeout-unbounded');
    }

    const external = externalContracts.find((contract) => contract.commands[record.event] === record.command);
    if (external) {
      classification = external.classification;
      scriptPath = external.script;
      if (record.surface !== 'hook') issues.push('external-generated-command-not-allowed-for-statusLine');
      if (record.source !== external.source) issues.push('external-generated-command-source-mismatch');
      if (record.hookType !== external.hookType) issues.push('external-generated-command-type-mismatch');
      if (record.matcher !== external.matcher) issues.push('external-generated-command-matcher-mismatch');
      if (!Number.isFinite(record.timeout) || record.timeout <= 0 || record.timeout > external.maxTimeoutSeconds) {
        issues.push('external-generated-command-timeout-unbounded');
      }
      if (external.mustExist && !existsSync(scriptPath)) issues.push('external-generated-command-path-missing');
      else if (external.mustExist) {
        try {
          if (!statSync(scriptPath).isFile()) issues.push('external-generated-command-path-not-file');
        } catch {
          issues.push('external-generated-command-path-inspection-failed');
        }
      }
    } else {
      const parsedCommand = parseCommandEntrypoint(record.command);
      if (!parsedCommand) {
        issues.push('command-shape-unresolved');
      } else {
        const resolved = resolveRepoCommandPath(parsedCommand.pathToken, root);
        if (resolved.kind === 'escape') {
          classification = 'repo-local-path-escape';
          scriptPath = resolved.absolute;
          issues.push('repo-local-command-path-escapes-worktree');
        } else if (resolved.kind === 'repo') {
          classification = 'repo-local';
          scriptPath = resolved.absolute;
          repoRelativePath = resolved.relative;
          if (lifecycle.repoLocalCommands.forbiddenPathPrefixes.some((prefix) => (
            repoRelativePath === prefix.slice(0, -1) || repoRelativePath.startsWith(prefix)
          ))) {
            issues.push('retired-execution-path-forbidden');
            if (repoRelativePath.startsWith('.claude/hooks/')) issues.push('historical-claude-hook-path-forbidden');
          }
          if (!closure.has(repoRelativePath)) issues.push('repo-local-command-not-in-registered-dependency-closure');
          if (!existsSync(scriptPath)) issues.push('repo-local-command-path-missing');
          else {
            try {
              if (!statSync(scriptPath).isFile()) issues.push('repo-local-command-path-not-file');
              const real = realpathSync(scriptPath);
              if (!isInside(rootReal, real)) issues.push('repo-local-command-realpath-escapes-worktree');
            } catch {
              issues.push('repo-local-command-path-inspection-failed');
            }
          }
          if (adapterCommands.get(record.command) !== record.event) issues.push('repo-local-command-contract-unregistered');
          const canonicalEvent = lifecycle.canonicalEventContracts[record.event];
          if (adapterCommands.get(record.command) === record.event) {
            if (record.hookType !== canonicalEvent?.hookType) issues.push('canonical-command-type-mismatch');
            if (record.matcher !== canonicalEvent?.matcher) issues.push('canonical-command-matcher-not-universal');
            if (!Number.isFinite(record.timeout) || record.timeout <= 0 || record.timeout > canonicalEvent?.maxTimeoutSeconds) {
              issues.push('canonical-command-timeout-unbounded');
            }
          }
          if (issues.length === 0) classification = 'registered-repo-local';
        } else if (resolved.kind === 'external') {
          classification = 'unregistered-external';
          scriptPath = resolved.absolute;
          issues.push('external-command-not-exactly-registered');
        } else {
          issues.push('command-entrypoint-unresolved');
        }
      }
    }
    return { ...record, classification, scriptPath, repoRelativePath, ok: issues.length === 0, issues };
  });

  const duplicateGroups = new Map();
  for (const entry of entries) {
    const key = `${entry.event}\u0000${entry.command}`;
    if (!duplicateGroups.has(key)) duplicateGroups.set(key, []);
    duplicateGroups.get(key).push({ source: entry.source, surface: entry.surface });
  }
  const duplicates = [...duplicateGroups.entries()]
    .filter(([, occurrences]) => occurrences.length > 1)
    .map(([key, occurrences]) => {
      const [event, command] = key.split('\u0000');
      return { event, command, occurrences };
    });

  const projectSource = lifecycle.projectSettingsLifecycle.source;
  const projectCommandCount = entries.filter((entry) => entry.source === projectSource).length;
  const projectSettings = parsedSources.find((entry) => entry.relative === projectSource);
  const projectHookEntryCount = projectSettings?.hookEntryCount ?? 0;
  const projectStatusLineDeclared = projectSettings?.statusLineDeclared === true;
  const contractErrors = [];
  if (projectCommandCount !== lifecycle.projectSettingsLifecycle.requiredCommandCount) {
    contractErrors.push(`${projectSource}: expected zero lifecycle/statusLine commands during recovery, found ${projectCommandCount}`);
  }
  if (projectHookEntryCount !== lifecycle.projectSettingsLifecycle.requiredHookEntryCount) {
    contractErrors.push(`${projectSource}: expected zero hook entries during recovery, found ${projectHookEntryCount}`);
  }
  if (!lifecycle.projectSettingsLifecycle.statusLineAllowed && projectStatusLineDeclared) {
    contractErrors.push(`${projectSource}: statusLine remains retired during recovery`);
  }
  if (duplicates.length > 0) contractErrors.push(`duplicate lifecycle commands: ${duplicates.length}`);

  const expectedExternal = externalContracts
    .filter((contract) => contract.required)
    .flatMap((contract) => Object.entries(contract.commands).map(([event, command]) => ({
      contractId: contract.contractId,
      source: contract.source,
      event,
      command,
      hookType: contract.hookType,
      matcher: contract.matcher,
    })));
  const missingExternal = expectedExternal.filter((expected) => !entries.some((entry) => (
    entry.source === expected.source
      && entry.surface === 'hook'
      && entry.event === expected.event
      && entry.command === expected.command
      && entry.hookType === expected.hookType
      && entry.matcher === expected.matcher
  )));
  if (missingExternal.length > 0) contractErrors.push(`missing required external lifecycle commands: ${missingExternal.length}`);

  return {
    ok: sourceErrors.length === 0 && contractErrors.length === 0 && entries.every((entry) => entry.ok),
    sources: parsedSources.map((entry) => ({
      source: entry.relative,
      valid: entry.valid,
      commandCount: entry.records.length,
      hookEntryCount: entry.hookEntryCount ?? 0,
      statusLineDeclared: entry.statusLineDeclared,
      statusLineCommandCount: entry.records.filter((record) => record.surface === 'statusLine').length,
    })),
    entries,
    duplicates,
    sourceErrors,
    contractErrors,
    projectCommandCount,
    projectHookEntryCount,
    projectStatusLineDeclared,
    externalCoverage: {
      ok: missingExternal.length === 0,
      expectedCount: expectedExternal.length,
      missing: missingExternal,
    },
  };
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
    ok: protectedRead?.allowed === true,
    detail: 'direct Read-tool protected paths are inspectable while mutation paths remain denied',
  });

  const claudeMerge = registry.providerMergeContracts['claude-code'];
  const claudeSources = claudeMerge.settingsSources.map((relative) => {
    const absolute = repoPath(relative);
    if (!fs.existsSync(absolute)) return { relative, source: '', valid: false };
    const source = fs.readFileSync(absolute, 'utf8');
    try {
      const parsed = JSON.parse(source);
      return { relative, source, valid: parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed) };
    } catch {
      return { relative, source, valid: false };
    }
  });
  checks.push({
    id: 'claude-effective-settings-readable',
    ok: claudeSources.every((entry) => entry.valid),
    detail: `validated repository settings sources: ${claudeMerge.settingsSources.join(', ')}`,
  });
  const claudeLifecycle = inventoryClaudeLifecycle(claudeSources, registry);
  checks.push({
    id: 'claude-lifecycle-command-liveness',
    ok: claudeLifecycle.sourceErrors.length === 0 && claudeLifecycle.entries.every((entry) => entry.ok),
    detail: `inventoried ${claudeLifecycle.entries.length} lifecycle/statusLine commands without executing them`,
  });
  checks.push({
    id: 'claude-project-mutating-lifecycle-retired',
    ok: claudeLifecycle.projectCommandCount === claudeMerge.lifecycleLiveness.projectSettingsLifecycle.requiredCommandCount
      && claudeLifecycle.projectHookEntryCount === claudeMerge.lifecycleLiveness.projectSettingsLifecycle.requiredHookEntryCount
      && claudeLifecycle.projectStatusLineDeclared === false,
    detail: 'project settings must contain zero lifecycle/statusLine commands during recovery',
  });
  checks.push({
    id: 'claude-statusline-inventoried',
    ok: !claudeLifecycle.sourceErrors.some((error) => error.includes('statusLine'))
      && claudeLifecycle.sources.every((source) => source.statusLineDeclared === (source.statusLineCommandCount === 1)),
    detail: `${claudeLifecycle.entries.filter((entry) => entry.surface === 'statusLine').length} active statusLine command(s) inventoried`,
  });
  checks.push({
    id: 'claude-external-october-exact-paths',
    ok: claudeLifecycle.externalCoverage.ok
      && claudeLifecycle.entries
        .filter((entry) => entry.classification === 'external-generated-october')
        .every((entry) => entry.ok),
    detail: 'generated October lifecycle commands must match the exact home-relative script/event contract',
  });
  checks.push({
    id: 'claude-no-duplicate-lifecycle-commands',
    ok: claudeLifecycle.duplicates.length === 0,
  });
  checks.push({
    id: 'claude-no-active-historical-hook-paths',
    ok: claudeLifecycle.entries.every((entry) => !entry.repoRelativePath?.startsWith('.claude/hooks/')),
  });
  const sourceTexts = claudeSources.map((entry) => entry.source);
  const claudePreTool = effectiveJsonHookCommands(sourceTexts, 'PreToolUse');
  const claudePrompt = effectiveJsonHookCommands(sourceTexts, 'UserPromptSubmit');
  const claudePreToolCommand = adapterFor(registry, claudeMerge.eventOwners.PreToolUse, 'claude-code').command;
  const claudePromptCommand = adapterFor(registry, claudeMerge.eventOwners.UserPromptSubmit, 'claude-code').command;
  checks.push({
    id: 'claude-universal-pretool',
    ok: claudePreTool.length === claudeMerge.exactCommandCount && claudePreTool[0] === claudePreToolCommand,
    detail: 'effective repository settings merge must contain exactly one universal PreToolUse command',
  });
  checks.push({
    id: 'claude-bounded-october-prompt',
    ok: claudePrompt.length === claudeMerge.exactCommandCount && claudePrompt[0] === claudePromptCommand,
    detail: 'effective repository settings merge must contain exactly one bounded UserPromptSubmit wrapper',
  });
  checks.push({
    id: 'claude-legacy-hook-commands-retired',
    ok: [...claudePreTool, ...claudePrompt]
      .every((command) => !claudeMerge.forbiddenLegacyCommands.includes(command)),
  });

  const codexHooksPath = path.join(ROOT, '.codex/hooks.json');
  const codexHooks = fs.existsSync(codexHooksPath) ? fs.readFileSync(codexHooksPath, 'utf8') : '';
  const codexPrompt = jsonHookCommands(codexHooks, 'UserPromptSubmit');
  checks.push({ id: 'codex-bounded-october-prompt', ok: codexPrompt.join('\n') === adapterFor(registry, 'october.prompt-context.pull', 'codex').command });

  return { ok: checks.every((check) => check.ok), checks, inventories: { claudeLifecycle } };
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
