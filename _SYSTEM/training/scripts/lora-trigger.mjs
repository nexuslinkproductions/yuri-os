#!/usr/bin/env node
// lora-trigger.mjs — fire LoRA fine-tune when enough new corrections exist
// Called by: kagami-start.sh on boot, or manually, or via LaunchAgent cron
// State: _SYSTEM/training/state/last-finetune.json

import { execSync, spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname  = dirname(fileURLToPath(import.meta.url));
const TRAINING   = resolve(__dirname, '..');
const STATE_PATH = resolve(TRAINING, 'state/last-finetune.json');
const DB_PATH    = process.env.KAGAMI_DB_PATH
  ?? resolve(TRAINING, '../../OS_KERNEL/kagami.db');

const MIN_NEW    = parseInt(process.env.LORA_MIN_NEW_EXAMPLES   ?? '50',  10);
const MIN_TOTAL  = parseInt(process.env.LORA_MIN_TOTAL_EXAMPLES ?? '100', 10);
const DRY_RUN    = process.env.LORA_DRY_RUN === '1';

const log = (...a) => console.log('[lora-trigger]', ...a);

// ─── Read state ──────────────────────────────────────────────────────────────
let state = { lastFinetuneAt: null, lastCount: 0 };
if (existsSync(STATE_PATH)) {
  try { state = JSON.parse(readFileSync(STATE_PATH, 'utf8')); } catch {}
}

// ─── Count rated reflections in kagami.db ────────────────────────────────────
let totalRated = 0;
if (existsSync(DB_PATH)) {
  try {
    const { createRequire } = await import('node:module');
    const require   = createRequire(import.meta.url);
    const Database  = require(resolve(TRAINING, '../../.codex-worktrees/kagami-rebuild/_SYSTEM/kagami/node_modules/better-sqlite3'));
    const db        = new Database(DB_PATH, { readonly: true });
    totalRated      = db.prepare(`SELECT COUNT(*) as n FROM ratings WHERE rating = 'positive'`).get().n;
    db.close();
  } catch (e) {
    log('⚠ cannot read kagami.db:', e.message, '— using corrections.jsonl count');
    const corrPath = resolve(TRAINING, 'data/corrections.jsonl');
    if (existsSync(corrPath)) {
      totalRated = readFileSync(corrPath, 'utf8').split('\n').filter(Boolean).length;
    }
  }
}

const newSinceLast = totalRated - (state.lastCount ?? 0);
log(`total rated: ${totalRated} | since last fine-tune: ${newSinceLast} | threshold: ${MIN_NEW} new / ${MIN_TOTAL} total`);

if (totalRated < MIN_TOTAL) {
  log(`skip — need ${MIN_TOTAL} total examples (have ${totalRated})`);
  process.exit(0);
}

if (newSinceLast < MIN_NEW) {
  log(`skip — need ${MIN_NEW} new examples since last run (have ${newSinceLast})`);
  process.exit(0);
}

log(`✓ threshold met — ${DRY_RUN ? 'DRY RUN' : 'firing fine-tune'}`);

if (DRY_RUN) { log('dry run complete'); process.exit(0); }

// ─── Collect corrections then run fine-tune ──────────────────────────────────
log('collecting corrections...');
const collect = spawnSync('node', [resolve(__dirname, 'collect-corrections.mjs')], { stdio: 'inherit' });
if (collect.status !== 0) { log('✗ collect-corrections failed'); process.exit(1); }

log('launching LoRA fine-tune (background)...');
const finetune = spawnSync('bash', [resolve(__dirname, 'run-lora-finetune.sh')], {
  stdio: 'inherit',
  env: { ...process.env },
});

if (finetune.status !== 0) {
  log('✗ fine-tune failed — state NOT updated');
  process.exit(1);
}

// ─── Update state ─────────────────────────────────────────────────────────────
mkdirSync(dirname(STATE_PATH), { recursive: true });
writeFileSync(STATE_PATH, JSON.stringify({
  lastFinetuneAt: new Date().toISOString(),
  lastCount: totalRated,
  newExamples: newSinceLast,
}, null, 2));

log(`✓ fine-tune complete — state saved (${totalRated} total examples)`);
