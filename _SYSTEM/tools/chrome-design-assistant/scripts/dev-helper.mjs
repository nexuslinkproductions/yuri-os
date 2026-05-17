#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const extensionRoot = path.resolve(__dirname, '..');
const repoRoot = path.resolve(extensionRoot, '../..');
const outDir = path.join(repoRoot, 'dist/chrome-design-assistant');
const bridgeOrigin = process.env.DESIGN_ASSISTANT_BRIDGE_ORIGIN || 'http://127.0.0.1:3004';
const keepAlive = !process.argv.includes('--check-only');
const backendEnv = {
  ...process.env,
  YURI_TEST_MODE: process.env.YURI_TEST_MODE || '1',
  YURI_DISABLE_WATCHERS: process.env.YURI_DISABLE_WATCHERS || '1',
  YURI_DISABLE_INTERVALS: process.env.YURI_DISABLE_INTERVALS || '1',
  YURI_DISABLE_SWARM_ORCHESTRATOR: process.env.YURI_DISABLE_SWARM_ORCHESTRATOR || '1',
};

const build = spawnSync(process.execPath, [path.join(extensionRoot, 'scripts/build.mjs')], {
  cwd: repoRoot,
  stdio: 'inherit',
});
if (build.status !== 0) process.exit(build.status || 1);

let backend = null;
if (!(await bridgeReady())) {
  backend = spawn('npm', ['--prefix', 'backend', 'run', 'dev'], {
    cwd: repoRoot,
    stdio: keepAlive ? 'inherit' : 'ignore',
    env: backendEnv,
    detached: !keepAlive,
  });
  if (!keepAlive) backend.unref();
  await waitForBridge();
}

await verifyExtensionOutput();

process.stdout.write([
  '',
  'Chrome Design Assistant ready',
  `Bridge: ${bridgeOrigin}/api/design-assistant/health`,
  `Load unpacked: ${outDir}`,
  'Chrome: chrome://extensions',
  ''
].join('\n'));

if (keepAlive && backend) {
  process.stdout.write('Backend started by helper; press Ctrl+C to stop.\n');
} else {
  process.exit(0);
}

async function bridgeReady() {
  try {
    const response = await fetch(`${bridgeOrigin}/api/design-assistant/health`);
    return response.ok;
  } catch {
    return false;
  }
}

async function waitForBridge() {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    if (await bridgeReady()) return;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Bridge did not become ready at ${bridgeOrigin}`);
}

async function verifyExtensionOutput() {
  const required = ['manifest.json', 'serviceWorker.js', 'contentScript.js', 'contentScript.css', 'sidepanel.html'];
  for (const file of required) {
    const target = path.join(outDir, file);
    if (!fs.existsSync(target)) throw new Error(`Missing extension output: ${target}`);
  }
}
