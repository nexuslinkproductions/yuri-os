#!/usr/bin/env node
// rotate-pulse-bus.mjs — trim pulse-bus.jsonl to MAX_LINES, archive excess
import { readFileSync, writeFileSync, appendFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..', '..');

const MAX_LINES  = parseInt(process.env.PULSE_BUS_MAX_LINES || '5000', 10);
const BUS_PATH   = resolve(REPO_ROOT, process.env.PULSE_BUS_PATH || '.claude/state/pulse-bus.jsonl');
const dateTag    = new Date().toISOString().slice(0, 10);
const ARCHIVE    = BUS_PATH.replace('.jsonl', `-archive-${dateTag}.jsonl`);

if (!existsSync(BUS_PATH)) process.exit(0);

const lines = readFileSync(BUS_PATH, 'utf8').split('\n').filter(Boolean);

if (lines.length <= MAX_LINES) {
  console.log(`[rotate-pulse-bus] ${lines.length} lines — below threshold (max ${MAX_LINES})`);
  process.exit(0);
}

const excess = lines.slice(0, lines.length - MAX_LINES);
const keep   = lines.slice(lines.length - MAX_LINES);

appendFileSync(ARCHIVE, excess.join('\n') + '\n');
writeFileSync(BUS_PATH, keep.join('\n') + '\n');

console.log(`[rotate-pulse-bus] Archived ${excess.length} lines → ${ARCHIVE.split('/').pop()}, kept ${keep.length}`);
