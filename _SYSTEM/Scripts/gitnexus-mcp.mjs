#!/usr/bin/env node

import { execFileSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
// Vendored copy at _SYSTEM/tools/gitnexus/... no longer exists on this checkout (wipe casualty).
// Resolution order (owner-approved 2026-07-28 (B)):
//   1. worktree vendored CLI
//   2. worktree node_modules/gitnexus
//   3. CANONICAL checkout node_modules/gitnexus (via git-common-dir parent)
//   4. npx gitnexus@1.6.2 — last resort only
// Clean worktrees have no node_modules; without step 3 they cold-started npx and timed out the
// 15s detect_changes fuse. Same defect class as relative core.hooksPath: a shared resource
// resolved relative to whatever tree you stand in. Path selection only — never installs.
const FALLBACK_PACKAGE = 'gitnexus@1.6.2';

// @capability: gitnexus-registry-hygiene
// @serves: parallel session contention | gitnexus duplicate repo | worktree registered as repo | registry dedup before serve | mcp startup slow many repos
// @does: prune ~/.gitnexus/registry.json of worktree-path registrations before the MCP server / detect_changes spawns, so concurrent lanes can't pollute the shared global registry
// @use: runs automatically inside the gitnexus-mcp wrapper; no direct call needed
// @exports: pruneRegistry, resolvePrimaryRoot, resolveGitNexusCli
//
// Multi-lane footgun (proven 2026-06-13, see 02_RESOURCES/RESEARCH/parallel-session-hardening-2026-06-13):
// a lane working in a `.claude/worktrees/<lane>` cwd that runs `gitnexus analyze` registers
// THAT worktree as a second, same-named ("yuri-os") repo in the GLOBAL registry. Every other
// lane's MCP startup then loads both → doubled startup → pre-commit detect_changes >15s timeout.
// The shared graph is the main checkout's responsibility; worktree registrations are never wanted.
// Conservative: drop ONLY `/.claude/worktrees/` paths (the proven case); warn-but-keep other
// same-name dups (could be a legitimate separate checkout — human decides). Fail-open, idempotent.
export function pruneRegistry() {
  try {
    const reg = path.join(os.homedir(), '.gitnexus', 'registry.json');
    if (!fs.existsSync(reg)) return;
    const entries = JSON.parse(fs.readFileSync(reg, 'utf8'));
    if (!Array.isArray(entries)) return;

    const dropped = [];
    const kept = entries.filter((e) => {
      if (e && typeof e.path === 'string' && e.path.includes('/.claude/worktrees/')) {
        dropped.push(e.path);
        return false;
      }
      return true;
    });

    // Visibility for the residual case we deliberately do NOT auto-resolve.
    const byName = new Map();
    for (const e of kept) {
      if (!e || typeof e.name !== 'string') continue;
      byName.set(e.name, (byName.get(e.name) || 0) + 1);
    }
    for (const [name, count] of byName) {
      if (count > 1) {
        process.stderr.write(
          `[gitnexus-hygiene] ${count} non-worktree registrations named "${name}" remain — ambiguous targeting; reconcile ~/.gitnexus/registry.json by hand.\n`,
        );
      }
    }

    if (dropped.length > 0) {
      fs.writeFileSync(reg, JSON.stringify(kept, null, 2) + '\n');
      process.stderr.write(
        `[gitnexus-hygiene] pruned ${dropped.length} worktree registration(s) from the global registry: ${dropped.join(', ')}\n`,
      );
    }
  } catch {
    /* fail-open: registry hygiene must never block the MCP server from starting */
  }
}

/** Primary checkout root = parent of git-common-dir. Same mechanism as yuri-git-hooks-path / root-architecture.test. */
export function resolvePrimaryRoot(cwd = REPO_ROOT) {
  try {
    const common = execFileSync('git', ['rev-parse', '--path-format=absolute', '--git-common-dir'], {
      cwd,
      encoding: 'utf8',
    }).trim();
    return common.endsWith('/.git') || common.endsWith('.git')
      ? path.resolve(common, '..')
      : path.resolve(common);
  } catch {
    return null;
  }
}

function readCliVersion(cliPath) {
  try {
    const pkgPath = path.resolve(path.dirname(cliPath), '..', '..', 'package.json');
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
    return typeof pkg.version === 'string' ? pkg.version : null;
  } catch {
    return null;
  }
}

/**
 * Resolve which GitNexus CLI to run. Path selection only — never installs.
 * @returns {{ command: string, args: string[], source: string, version: string|null, cliPath: string|null, rejected: string[], primaryRoot: string|null }}
 */
export function resolveGitNexusCli(repoRoot = REPO_ROOT, gitnexusArgs = ['mcp']) {
  const rejected = [];
  const primary = resolvePrimaryRoot(repoRoot);
  const canonicalCli = primary
    ? path.join(primary, 'node_' + 'modules/gitnexus/dist/cli/index.js')
    : null;

  const tryLocal = (label, cliPath) => {
    if (cliPath && fs.existsSync(cliPath)) {
      return {
        command: process.execPath,
        args: [cliPath, ...gitnexusArgs],
        source: label,
        version: readCliVersion(cliPath),
        cliPath,
        rejected,
        primaryRoot: primary,
      };
    }
    rejected.push(`${label}: missing (${cliPath || 'n/a'})`);
    return null;
  };

  const vendored = path.join(repoRoot, '_SYSTEM/tools/gitnexus/gitnexus/dist/cli/index.js');
  const worktreeInstalled = path.join(repoRoot, 'node_' + 'modules/gitnexus/dist/cli/index.js');

  return (
    tryLocal('worktree-vendored', vendored)
    || tryLocal('worktree-installed', worktreeInstalled)
    || tryLocal('canonical-installed', canonicalCli)
    || {
      command: 'npx',
      args: ['--yes', FALLBACK_PACKAGE, ...gitnexusArgs],
      source: 'npx-fallback',
      version: FALLBACK_PACKAGE.replace(/^gitnexus@/, ''),
      cliPath: null,
      rejected: primary
        ? rejected
        : [...rejected, 'canonical-installed: primary root unresolved (git-common-dir failed)'],
      primaryRoot: primary,
    }
  );
}

function logResolution(resolved) {
  const ver = resolved.version || 'unknown';
  process.stderr.write(
    `[gitnexus-mcp] resolved source=${resolved.source} version=${ver}`
    + (resolved.cliPath ? ` cli=${resolved.cliPath}` : '')
    + (resolved.primaryRoot ? ` primary=${resolved.primaryRoot}` : '')
    + `\n`,
  );
  if (resolved.source === 'npx-fallback') {
    process.stderr.write(
      `[gitnexus-mcp] WARNING: falling back to cold npx ${FALLBACK_PACKAGE}. `
      + `Rejected candidates: ${resolved.rejected.join(' | ') || '(none recorded)'}. `
      + `This path historically emits zero bytes before the 15s detect_changes fuse.\n`,
    );
  } else if (resolved.rejected.length > 0) {
    process.stderr.write(
      `[gitnexus-mcp] skipped earlier candidates: ${resolved.rejected.join(' | ')}\n`,
    );
  }
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
  pruneRegistry();

  const passthroughArgs = process.argv.slice(2);
  const gitnexusArgs = passthroughArgs.length > 0 ? passthroughArgs : ['mcp'];
  const resolved = resolveGitNexusCli(REPO_ROOT, gitnexusArgs);
  logResolution(resolved);

  const child = spawn(resolved.command, resolved.args, {
    cwd: REPO_ROOT,
    env: process.env,
    stdio: 'inherit',
  });

  child.on('exit', (code, signal) => {
    if (signal) {
      process.kill(process.pid, signal);
      return;
    }
    if ((code ?? 1) !== 0 && resolved.source === 'npx-fallback') {
      process.stderr.write(
        `[gitnexus-mcp] npx fallback exited ${code}. Rejected candidates were: `
        + `${resolved.rejected.join(' | ') || '(none)'}. `
        + `Prefer installing gitnexus in the canonical checkout or ensuring node_modules is present.\n`,
      );
    }
    process.exit(code ?? 1);
  });

  child.on('error', (error) => {
    process.stderr.write(
      `gitnexus wrapper failed: ${error.message}\n`
      + `[gitnexus-mcp] source=${resolved.source} rejected=${resolved.rejected.join(' | ') || '(none)'}\n`,
    );
    process.exit(1);
  });
}
