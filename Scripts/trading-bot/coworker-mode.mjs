#!/usr/bin/env node
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const STATE_DIR = resolve(__dirname, '../../.claude/trading-bot/data');
const COWORKER_PATH = resolve(STATE_DIR, 'coworker_mode.json');

function main() {
  const args = process.argv.slice(2);
  if (args.includes('--dry-run')) {
    console.log(JSON.stringify({ ok: true, command: 'coworker-mode', dry_run: true, output: COWORKER_PATH }, null, 2));
    return;
  }
  if (!existsSync(STATE_DIR)) mkdirSync(STATE_DIR, { recursive: true });
  const enabled = args[0] !== 'off';
  const record = {
    enabled,
    role: enabled ? 'second-operator-review' : 'disabled',
    duties: enabled ? ['review framing', 'check approval gate', 'watch kill switch', 'request audit export'] : [],
    updated_at: new Date().toISOString(),
  };
  writeFileSync(COWORKER_PATH, JSON.stringify(record, null, 2) + '\n', 'utf-8');
  console.log(JSON.stringify(record, null, 2));
}

main();
