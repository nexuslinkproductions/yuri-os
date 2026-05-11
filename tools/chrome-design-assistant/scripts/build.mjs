#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const extensionRoot = path.resolve(__dirname, '..');
const repoRoot = path.resolve(extensionRoot, '../..');
const outDir = path.join(repoRoot, 'dist/chrome-design-assistant');
const viteBin = path.join(repoRoot, 'node_modules/.bin/vite');

const result = spawnSync(viteBin, ['build', '--config', path.join(extensionRoot, 'vite.config.ts')], {
  cwd: repoRoot,
  stdio: 'inherit',
});

if (result.status !== 0) {
  process.exit(result.status || 1);
}

fs.copyFileSync(path.join(extensionRoot, 'manifest.json'), path.join(outDir, 'manifest.json'));
fs.copyFileSync(path.join(extensionRoot, 'src/contentScript.css'), path.join(outDir, 'contentScript.css'));

process.stdout.write(`chrome-design-assistant: ${outDir}\n`);
