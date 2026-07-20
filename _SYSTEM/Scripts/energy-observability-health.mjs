#!/usr/bin/env node
// Energy observability liveness probe for yuri-health. Canonical registration,
// source wiring, provider activation, and trace accrual are deliberately separate
// truths: a registered/core-wired adapter is healthy before a provider projection
// is owner-activated, and a fresh checkout is healthy with zero trace records.
import fs from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const ENERGY_HOOK_ID = 'yuri.energy.tick';
const RETIRED_PREFIXES = ['.claude/hooks/', '.omp/agents/', '.openclaw/agents/'];

function loadJson(file) {
  try {
    const value = JSON.parse(fs.readFileSync(file, 'utf8'));
    return value && typeof value === 'object' && !Array.isArray(value) ? value : null;
  } catch {
    return null;
  }
}

function defaultSettingsSources(root, registry) {
  return (registry.providerMergeContracts?.['claude-code']?.settingsSources ?? []).map((relative) => {
    const absolute = path.resolve(root, relative);
    if (!fs.existsSync(absolute)) return { relative, source: '' };
    try { return { relative, source: fs.readFileSync(absolute, 'utf8') }; } catch { return { relative, source: '' }; }
  });
}

function postToolCommands(settingsSources) {
  const commands = [];
  const errors = [];
  for (const { relative = 'settings', source = '' } of settingsSources) {
    let parsed;
    try { parsed = JSON.parse(String(source)); } catch { errors.push(`${relative}: invalid JSON`); continue; }
    for (const group of parsed?.hooks?.PostToolUse ?? []) {
      for (const hook of group?.hooks ?? []) {
        if (typeof hook?.command === 'string') commands.push(hook.command);
      }
    }
  }
  return { commands, errors };
}

function traceFileCount(traceDir) {
  try {
    return fs.existsSync(traceDir)
      ? fs.readdirSync(traceDir).filter((name) => !name.startsWith('.') && name.endsWith('.jsonl')).length
      : 0;
  } catch {
    return 0;
  }
}

function isCanonicalRelative(relative, root) {
  if (typeof relative !== 'string' || !relative || path.isAbsolute(relative) || relative.startsWith('~')) return false;
  const absolute = path.resolve(root, relative);
  return absolute === root || absolute.startsWith(`${root}${path.sep}`);
}

function inspectDependencyClosure(closure, root, contentHashes = {}) {
  const missingDependencies = [];
  const unsafeDependencies = [];
  const unreadableDependencies = [];
  const unhashedDependencies = [];
  const hashMismatches = [];

  for (const relative of closure) {
    if (!isCanonicalRelative(relative, root)) continue;
    const absolute = path.resolve(root, relative);
    let stat;
    try {
      stat = fs.lstatSync(absolute);
    } catch {
      missingDependencies.push(relative);
      continue;
    }
    if (!stat.isFile()) {
      unsafeDependencies.push(relative);
      continue;
    }
    const expected = contentHashes?.[relative];
    if (typeof expected !== 'string' || !/^[a-f0-9]{64}$/u.test(expected)) {
      unhashedDependencies.push(relative);
      continue;
    }
    try {
      const actual = crypto.createHash('sha256').update(fs.readFileSync(absolute)).digest('hex');
      if (actual !== expected) hashMismatches.push(relative);
    } catch {
      unreadableDependencies.push(relative);
    }
  }

  return {
    missingDependencies,
    unsafeDependencies,
    unreadableDependencies,
    unhashedDependencies,
    hashMismatches,
  };
}

export function inspectEnergyObservability({
  root = REPO_ROOT,
  registry = loadJson(path.join(root, '_SYSTEM/config/yuri-hook-registry.json')) ?? { hooks: [] },
  settingsSources = null,
  stateDir = path.join(root, '_SYSTEM/state'),
  env = process.env,
  includeRuntimeTraceMetadata = true,
  traceCounter = traceFileCount,
} = {}) {
  const hook = (registry.hooks ?? []).find((entry) => entry.hookId === ENERGY_HOOK_ID);
  const adapter = hook?.providerAdapters?.find((entry) => entry.provider === 'claude-code');
  const closure = Array.isArray(hook?.dependencyClosure) ? hook.dependencyClosure : [];
  const retiredDependencies = closure.filter((relative) => RETIRED_PREFIXES.some((prefix) => relative.startsWith(prefix)));
  const invalidDependencies = closure.filter((relative) => !isCanonicalRelative(relative, root));
  const dependencyStatus = inspectDependencyClosure(closure, root, registry.contentHashes);

  const hookRegistered = Boolean(
    hook
      && hook.owner === 'YURI'
      && hook.logicalEvent === 'PostToolUse'
      && hook.enabled === true
      && hook.required === false
      && hook.optional === true
      && hook.coreEntrypoint === '_SYSTEM/Scripts/energy-tick-adapter.mjs'
      && closure.includes(hook.coreEntrypoint)
      && adapter
      && adapter.projection === '.claude/settings.local.json'
      && Array.isArray(adapter.invokedPaths)
      && adapter.invokedPaths.includes(hook.coreEntrypoint)
  );
  const coreWired = Boolean(
    hookRegistered
      && closure.length > 0
      && retiredDependencies.length === 0
      && invalidDependencies.length === 0
      && dependencyStatus.missingDependencies.length === 0
      && dependencyStatus.unsafeDependencies.length === 0
      && dependencyStatus.unreadableDependencies.length === 0
      && dependencyStatus.unhashedDependencies.length === 0
      && dependencyStatus.hashMismatches.length === 0
  );
  const observedSettings = settingsSources ?? defaultSettingsSources(root, registry);
  const provider = postToolCommands(observedSettings);
  const providerCommandCount = adapter
    ? provider.commands.filter((command) => command === adapter.command).length
    : 0;
  const providerActivated = providerCommandCount === 1;
  const activationRequired = hook?.providerActivationRequired === true;
  const adapterEnabledInProbeEnvironment = env.YURI_ENERGY_OBSERVABILITY === '1';
  const traceMetadataObserved = includeRuntimeTraceMetadata === true;
  const traceFiles = traceMetadataObserved
    ? traceCounter(path.join(stateDir, 'energy-trace'))
    : null;
  const ok = hookRegistered && coreWired && (!activationRequired || providerActivated);

  return {
    ok,
    hookRegistered,
    coreWired,
    providerActivated,
    activationRequired,
    providerCommandCount,
    adapterEnabledInProbeEnvironment,
    traceMetadataObserved,
    traceFiles,
    ...dependencyStatus,
    invalidDependencies,
    retiredDependencies,
    settingsErrors: provider.errors,
    summary: `wired=${hookRegistered && coreWired} hook=${hookRegistered} core=${coreWired} provider=${providerActivated} probeEnvEnabled=${adapterEnabledInProbeEnvironment} traceFiles=${traceMetadataObserved ? traceFiles : 'not-observed'}`,
  };
}

export function parseArgs(argv = []) {
  let includeRuntimeTraceMetadata = true;
  for (const arg of argv) {
    if (arg === '--no-runtime') {
      includeRuntimeTraceMetadata = false;
      continue;
    }
    throw new TypeError(`unknown argument: ${arg}`);
  }
  return { includeRuntimeTraceMetadata };
}

export function run(argv = process.argv.slice(2)) {
  const summary = inspectEnergyObservability(parseArgs(argv));
  process.stdout.write(`${JSON.stringify({ summary }, null, 2)}\n`);
  return summary.ok ? 0 : 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = run();
}
