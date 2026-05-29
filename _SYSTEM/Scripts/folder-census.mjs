#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { existsSync, lstatSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { isProtectedPath } from './lane-kernel.mjs';

const REPO = process.cwd();
const REGISTRY_PATH = path.join(REPO, '_SYSTEM/config/folder-registry.json');
const args = new Set(process.argv.slice(2));

function loadRegistry() {
  if (!existsSync(REGISTRY_PATH)) return { entries: [], byPath: new Map() };
  const raw = JSON.parse(readFileSync(REGISTRY_PATH, 'utf8'));
  const entries = raw.folders || [];
  return {
    entries,
    byPath: new Map(entries.map((entry) => [entry.path, entry])),
  };
}

function gitLsFiles() {
  try {
    const out = execFileSync('git', ['ls-files', '-z'], {
      cwd: REPO,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    return out.split('\0').filter(Boolean);
  } catch {
    return [];
  }
}

function gitIgnored(relPath) {
  try {
    execFileSync('git', ['check-ignore', '-q', relPath], {
      cwd: REPO,
      stdio: 'ignore',
    });
    return true;
  } catch {
    return false;
  }
}

function topLevelEntries() {
  return readdirSync(REPO, { withFileTypes: true })
    .filter((entry) => entry.name !== '.git')
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b));
}

function classifyPath(relPath, registry) {
  if (registry.has(relPath)) return registry.get(relPath);
  if (isProtectedPath(relPath)) {
    return {
      class: 'protected_surface',
      readByDefault: false,
      protected: true,
      status: 'sealed',
      notes: 'Protected by default path rule.',
    };
  }
  return {
    class: 'unclassified',
    readByDefault: false,
    protected: false,
    status: 'needs_registry_entry',
    notes: 'No folder-registry entry yet.',
  };
}

function trackedCountFor(relPath, trackedFiles) {
  const prefix = relPath.endsWith('/') ? relPath : `${relPath}/`;
  return trackedFiles.filter((file) => file === relPath || file.startsWith(prefix)).length;
}

function entryKind(relPath) {
  try {
    const stat = lstatSync(path.join(REPO, relPath));
    if (stat.isSymbolicLink()) return 'symlink';
    if (stat.isDirectory()) return 'directory';
    if (stat.isFile()) return 'file';
    return 'other';
  } catch {
    return 'missing';
  }
}

const registry = loadRegistry();
const trackedFiles = gitLsFiles();
const entries = topLevelEntries().map((relPath) => {
  const info = classifyPath(relPath, registry.byPath);
  return {
    path: relPath,
    kind: entryKind(relPath),
    class: info.class,
    status: info.status,
    readByDefault: Boolean(info.readByDefault),
    protected: Boolean(info.protected),
    trackedFiles: trackedCountFor(relPath, trackedFiles),
    gitIgnored: gitIgnored(relPath),
    notes: info.notes || '',
  };
});

const summary = entries.reduce(
  (acc, entry) => {
    acc.total += 1;
    acc.byClass[entry.class] = (acc.byClass[entry.class] || 0) + 1;
    if (entry.class === 'unclassified') acc.unclassified += 1;
    if (entry.protected) acc.protected += 1;
    return acc;
  },
  { total: 0, unclassified: 0, protected: 0, byClass: {} },
);

// Tombstone statuses are EXPECTED to be absent on disk (already removed / planned / retired);
// they must not fail the --validate gate. Mirrors artifact-registry.mjs's existence exemption,
// so --validate can actually pass on genuine drift instead of being permanently red.
const TOMBSTONE_STATUSES = new Set(['removed_from_root', 'planned', 'retired']);
const missingRegistryEntries = registry.entries
  .filter((entry) => !TOMBSTONE_STATUSES.has(entry.status) && !existsSync(path.join(REPO, entry.path)))
  .map((entry) => ({
    path: entry.path,
    class: entry.class,
    status: entry.status,
    notes: entry.notes || '',
  }));

const result = {
  summary: {
    ...summary,
    registryEntries: registry.entries.length,
    missingRegistryEntries: missingRegistryEntries.length,
  },
  entries,
  missingRegistryEntries,
};

console.log(JSON.stringify(result, null, 2));

if (args.has('--validate') && (summary.unclassified > 0 || missingRegistryEntries.length > 0)) {
  process.exitCode = 1;
}
