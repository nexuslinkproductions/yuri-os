#!/usr/bin/env node
/**
 * Cursor beforeSubmitPrompt — auto-enqueue warm worker terminals.
 * Non-blocking: detached route, <50ms in hook process.
 */
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../..');
const BRIDGE = path.join(REPO_ROOT, '_SYSTEM', 'Scripts', 'worker-bridge.mjs');

const MUTATE = /\b(implement|fix|patch|refactor|debug|build|wire|audit|review|shintai|full shintai)\b/i;

async function readStdin() {
  const rl = createInterface({ input: process.stdin });
  const lines = [];
  for await (const line of rl) lines.push(line);
  return lines.join('\n');
}

function spawnRoute(prompt) {
  const child = spawn(
    process.execPath,
    [BRIDGE, 'route', '--prompt', prompt],
    {
      cwd: REPO_ROOT,
      detached: true,
      stdio: 'ignore',
      env: { ...process.env, YURI_AUTO_FEED: '1' },
    },
  );
  child.unref();
}

async function main() {
  if (process.env.YURI_AUTO_FEED === '0') {
    process.stdout.write('{}');
    return;
  }

  let input = {};
  try {
    const raw = await readStdin();
    if (raw.trim()) input = JSON.parse(raw);
  } catch {
    process.stdout.write('{}');
    return;
  }

  const prompt =
    input.prompt ||
    input.user_message ||
    input.text ||
    '';

  if (!prompt || prompt.length < 8) {
    process.stdout.write('{}');
    return;
  }

  // Skip trivial chit-chat; route-plan also filters inside bridge
  if (prompt.length < 40 && !MUTATE.test(prompt) && !prompt.includes('?')) {
    process.stdout.write('{}');
    return;
  }

  spawnRoute(prompt.slice(0, 6000));
  process.stdout.write('{}');
}

main().catch(() => {
  process.stdout.write('{}');
});
