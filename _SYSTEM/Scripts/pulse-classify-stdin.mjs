#!/usr/bin/env node

import { execFileSync } from 'node:child_process';

const prompt = process.argv.slice(2).filter((arg) => !arg.startsWith('-')).join(' ');

try {
  const out = execFileSync('node', ['_SYSTEM/Scripts/offload-contract.mjs', 'route-plan', prompt], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  });
  const plan = JSON.parse(out);
  process.stdout.write(plan.complexityTier || 'standard');
} catch {
  process.stdout.write('standard');
}
