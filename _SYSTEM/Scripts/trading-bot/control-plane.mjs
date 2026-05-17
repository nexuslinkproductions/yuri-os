#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const ROUTES = {
  readiness: ['live-rollout.mjs', '--readiness'],
  status: ['dashboard.mjs'],
  dashboard: ['dashboard.mjs'],
  audit: ['audit-export.mjs'],
  approve: ['approval-gate.mjs'],
  mode: ['mode-selector.mjs'],
  coworker: ['coworker-mode.mjs'],
};

function run(script, args) {
  const result = spawnSync(process.execPath, [resolve(__dirname, script), ...args], { stdio: 'inherit' });
  process.exitCode = result.status || 0;
}

function main() {
  const args = process.argv.slice(2);
  if (args.includes('--dry-run')) {
    console.log(JSON.stringify({ ok: true, command: 'control-plane', dry_run: true, routes: Object.keys(ROUTES) }, null, 2));
    return;
  }
  if (args[0] === 'kill-switch') {
    run('kill-switch-cli.mjs', args.slice(1));
    return;
  }
  const route = ROUTES[args[0] || 'status'];
  if (!route) {
    console.error(`Unknown control route: ${args[0]}`);
    process.exitCode = 1;
    return;
  }
  run(route[0], [...route.slice(1), ...args.slice(1)]);
}

main();
