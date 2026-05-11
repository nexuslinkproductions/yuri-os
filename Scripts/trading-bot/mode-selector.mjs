#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUTPUT_DIR = resolve(__dirname, '../../.claude/trading-bot/data');
const MODE_PATH = resolve(OUTPUT_DIR, 'runtime_mode.json');
const ALLOWED_MODES = ['sandbox', 'paper', 'staging', 'live'];

function ensureOutputDir() {
  if (!existsSync(OUTPUT_DIR)) mkdirSync(OUTPUT_DIR, { recursive: true });
}

function readMode() {
  if (!existsSync(MODE_PATH)) return { mode: process.env.TRADING_BOT_MODE || 'sandbox', updated_at: null };
  try {
    return JSON.parse(readFileSync(MODE_PATH, 'utf-8'));
  } catch {
    return { mode: 'sandbox', updated_at: null, warning: 'mode file unreadable' };
  }
}

function writeMode(mode, operator = 'system') {
  if (!ALLOWED_MODES.includes(mode)) {
    throw new Error(`Invalid mode "${mode}". Use one of: ${ALLOWED_MODES.join(', ')}`);
  }
  ensureOutputDir();
  const record = { mode, operator, updated_at: new Date().toISOString() };
  writeFileSync(MODE_PATH, JSON.stringify(record, null, 2) + '\n', 'utf-8');
  return record;
}

function main() {
  const args = process.argv.slice(2);
  if (args.includes('--dry-run')) {
    console.log(JSON.stringify({ ok: true, command: 'mode-selector', dry_run: true, allowed_modes: ALLOWED_MODES, current: readMode(), output: MODE_PATH }, null, 2));
    return;
  }
  if (args[0] === 'set') {
    const record = writeMode(args[1], args[2] || 'operator');
    console.log(JSON.stringify(record, null, 2));
    return;
  }
  console.log(JSON.stringify(readMode(), null, 2));
}

main();
