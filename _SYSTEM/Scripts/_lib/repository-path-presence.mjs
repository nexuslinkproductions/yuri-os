import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';

export function canonicalRepositoryPath(inputPath) {
  if (typeof inputPath !== 'string' || !inputPath || inputPath !== inputPath.trim()) return null;
  if (inputPath.includes('\0') || inputPath.includes('\\') || inputPath.startsWith('/') || inputPath.startsWith('file:')) {
    return null;
  }

  const trailingSlash = inputPath.endsWith('/');
  const candidate = trailingSlash ? inputPath.slice(0, -1) : inputPath;
  if (!candidate || candidate.endsWith('/')) return null;
  const normalized = path.posix.normalize(candidate);
  if (normalized !== candidate || normalized === '.' || normalized === '..' || normalized.startsWith('../')) {
    return null;
  }
  return normalized;
}

export function loadGitIndexPathStates(repoRoot) {
  try {
    const output = execFileSync('git', ['-C', repoRoot, 'ls-files', '-t', '-z'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    const states = new Map();
    for (const record of output.split('\0')) {
      if (!record) continue;
      const separator = record.indexOf(' ');
      if (separator < 1) continue;
      states.set(record.slice(separator + 1), record.slice(0, separator));
    }
    return states;
  } catch {
    return new Map();
  }
}

export function createRepositoryPathPresence(repoRoot, indexPathStates = loadGitIndexPathStates(repoRoot)) {
  const sparseFiles = new Set();
  const sparseDirectories = new Set();

  for (const [indexedPath, state] of indexPathStates) {
    if (state !== 'S') continue;
    sparseFiles.add(indexedPath);
    let parent = path.posix.dirname(indexedPath);
    while (parent && parent !== '.') {
      sparseDirectories.add(parent);
      parent = path.posix.dirname(parent);
    }
  }

  return (artifactPath) => {
    const normalized = canonicalRepositoryPath(artifactPath);
    if (!normalized) return false;
    if (existsSync(path.join(repoRoot, normalized))) return true;
    return sparseFiles.has(normalized) || sparseDirectories.has(normalized);
  };
}
