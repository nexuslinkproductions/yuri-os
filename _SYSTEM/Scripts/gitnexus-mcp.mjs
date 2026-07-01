#!/usr/bin/env node

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const LOCAL_CLI = path.join(REPO_ROOT, '_SYSTEM/tools/gitnexus/gitnexus/dist/cli/index.js');
const FALLBACK_PACKAGE = 'gitnexus@1.6.2';

// @capability: gitnexus-registry-hygiene
// @serves: parallel session contention | gitnexus duplicate repo | worktree registered as repo | registry dedup before serve | mcp startup slow many repos
// @does: prune ~/.gitnexus/registry.json of worktree-path registrations before the MCP server / detect_changes spawns, so concurrent lanes can't pollute the shared global registry
// @use: runs automatically inside the gitnexus-mcp wrapper; no direct call needed
// @exports: pruneRegistry
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

pruneRegistry();

const passthroughArgs = process.argv.slice(2);
const gitnexusArgs = passthroughArgs.length > 0 ? passthroughArgs : ['mcp'];

let command;
let args;

if (fs.existsSync(LOCAL_CLI)) {
  command = process.execPath;
  args = [LOCAL_CLI, ...gitnexusArgs];
} else {
  // On Windows, `npx` resolves to the npx.cmd shim, not a real PE binary — same class of
  // platform assumption as the main-module guard fix (issue #3). Node's own docs: spawning a
  // .cmd on Windows requires shell:true (or an explicit `cmd.exe /c` prefix); without it,
  // spawn() first threw ENOENT (bare 'npx'), then EINVAL even once resolved to 'npx.cmd'.
  command = process.platform === 'win32' ? 'npx.cmd' : 'npx';
  args = ['--yes', FALLBACK_PACKAGE, ...gitnexusArgs];
}

const child = spawn(command, args, {
  cwd: REPO_ROOT,
  env: process.env,
  stdio: 'inherit',
  shell: command.endsWith('.cmd'),
});

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 1);
});

child.on('error', (error) => {
  console.error(`gitnexus wrapper failed: ${error.message}`);
  process.exit(1);
});
