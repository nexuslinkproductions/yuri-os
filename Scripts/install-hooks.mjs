#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const rootDir = resolve(process.cwd());
const hooksDir = resolve(rootDir, '_SYSTEM', 'git-hooks');

try {
  execFileSync('git', ['rev-parse', '--git-dir'], { stdio: 'ignore' });
} catch {
  process.exit(0);
}

if (!existsSync(hooksDir)) {
  mkdirSync(hooksDir, { recursive: true });
}

execFileSync('git', ['config', 'core.hooksPath', '_SYSTEM/git-hooks'], { stdio: 'ignore' });
